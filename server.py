import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, model_validator

from execution import ExecutionAdapter
from execution.errors import ExecutionError
from backend_core import (
    build_chat_payload,
    decide_memory_candidate,
    extract_json_object,
    get_settings,
    init_db,
    load_relevant_lessons,
    save_feedback,
    sqlite_available,
    validate_intent,
)
from graph_runtime import graph_runtime_status, run_intent_graph
from runtime import CompatibilityAdapter, RuntimeAdapter, get_runtime_capabilities
from runtime.errors import RuntimeErrorBase


app = FastAPI(title="Local Life Agent V4 API")
INDEX_FILE = Path(__file__).resolve().parent / "index.html"
settings = get_settings()
try:
    init_db(settings["db_path"])
except sqlite3.Error:
    pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def serve_spa_routes(request, call_next):
    response = await call_next(request)
    if (
        response.status_code == 404
        and request.method == "GET"
        and not request.url.path.startswith("/api/")
        and (
            request.url.path.startswith("/plans/")
            or request.url.path == "/saved-plans"
            or request.url.path.startswith("/saved-plans/")
            or request.url.path == "/executions"
            or request.url.path.startswith("/executions/")
        )
    ):
        return FileResponse(INDEX_FILE)
    return response


class IntentRequest(BaseModel):
    input: str = Field(min_length=1, max_length=1000)
    overrides: dict = Field(default_factory=dict)


class FeedbackRequest(BaseModel):
    input: str = Field(default="", max_length=1000)
    llmIntent: dict | None = None
    userCorrection: str | None = Field(default=None, max_length=1000)
    failureType: str | None = Field(default="general", max_length=80)


class CandidateDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str = Field(pattern="^(adopt|ignore|correct)$")
    correctedValue: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_correction_value(self):
        if self.action == "correct" and not (self.correctedValue and self.correctedValue.strip()):
            raise ValueError("correctedValue is required when action is correct")
        return self


class RuntimeFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    llmIntent: dict | None = None
    userCorrection: str | None = Field(default=None, max_length=1000)
    failureType: str | None = Field(default="general", max_length=80)


class RuntimeMemoryDecisionRequest(CandidateDecisionRequest):
    candidateId: int = Field(gt=0)


class RuntimeRequest(BaseModel):
    sessionId: str | None = None
    input: str = Field(min_length=1, max_length=1000)
    overrides: dict = Field(default_factory=dict)
    event: dict | None = None
    feedback: RuntimeFeedbackRequest | None = None
    memoryDecision: RuntimeMemoryDecisionRequest | None = None


class RuntimeSessionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input: str = Field(min_length=1, max_length=1000)
    overrides: dict = Field(default_factory=dict)
    idempotencyKey: str = Field(min_length=1, max_length=160)


class RuntimeSubmitEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eventType: str = Field(min_length=1, max_length=120)
    expectedVersion: int = Field(ge=1)
    idempotencyKey: str = Field(min_length=1, max_length=160)
    actor: str | None = Field(default=None, max_length=120)
    traceId: str | None = Field(default=None, max_length=160)
    reason: str | None = Field(default=None, max_length=500)
    payload: dict = Field(default_factory=dict)


class RuntimeLifecycleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expectedVersion: int = Field(ge=1)
    idempotencyKey: str = Field(min_length=1, max_length=160)
    actor: str | None = Field(default=None, max_length=120)
    traceId: str | None = Field(default=None, max_length=160)
    reason: str | None = Field(default=None, max_length=500)


class ExecutionStepInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    maxAttempts: int = Field(default=1, ge=1, le=5)


class ExecutionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sessionId: str | None = Field(default=None, max_length=160)
    planId: str = Field(min_length=1, max_length=160)
    planVersion: int = Field(ge=1)
    steps: list[ExecutionStepInput] = Field(min_length=1, max_length=100)
    idempotencyKey: str = Field(min_length=1, max_length=160)
    actor: str | None = Field(default=None, max_length=120)
    traceId: str | None = Field(default=None, max_length=160)


class ExecutionAdvanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expectedVersion: int = Field(ge=1)
    planVersion: int = Field(ge=1)
    idempotencyKey: str = Field(min_length=1, max_length=160)
    outcome: str = Field(pattern="^(succeeded|failed|blocked)$")
    actor: str | None = Field(default=None, max_length=120)
    traceId: str | None = Field(default=None, max_length=160)
    failureType: str | None = Field(default=None, max_length=120)


class ExecutionCancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expectedVersion: int = Field(ge=1)
    idempotencyKey: str = Field(min_length=1, max_length=160)
    actor: str | None = Field(default=None, max_length=120)
    traceId: str | None = Field(default=None, max_length=160)
    reason: str | None = Field(default=None, max_length=500)


RUNTIME_TRANSITIONS = {
    "intent_loading": ["clarifying", "planning_local", "failed_recoverable"],
    "clarifying": ["planning_local"],
    "planning_local": ["researching_tools"],
    "researching_tools": ["merging_plans"],
    "merging_plans": ["verifying_plan"],
    "verifying_plan": ["ready_for_confirmation", "replanning"],
    "replanning": ["verifying_plan"],
    "ready_for_confirmation": ["executing_mock_actions", "feedback_capture"],
    "executing_mock_actions": ["feedback_capture"],
    "feedback_capture": ["feedback_capture", "memory_candidate_review", "done"],
    "memory_candidate_review": ["memory_candidate_review", "memory_committed", "done"],
    "memory_committed": ["done"],
    "failed_recoverable": ["planning_local"],
    "done": [],
}


def intent_error_response(source, error, lessons, runtime_path=None):
    return {
        "ok": False,
        "source": source,
        "runtimePath": runtime_path,
        "intent": None,
        "error": error,
        "lessonsUsed": lessons,
    }


def runtime_now():
    return datetime.now(timezone.utc).isoformat()


def runtime_event(event_type, from_state, to_state, reason=None):
    event = {
        "type": event_type,
        "fromState": from_state,
        "toState": to_state,
        "createdAt": runtime_now(),
    }
    if reason:
        event["reason"] = reason
    return event


def runtime_session(request, current_state, events, allowed_next_states=None):
    allowed = allowed_next_states if allowed_next_states is not None else RUNTIME_TRANSITIONS[current_state]
    return {
        "sessionId": request.sessionId or str(uuid4()),
        "inputText": request.input,
        "overrides": request.overrides,
        "currentState": current_state,
        "allowedNextStates": allowed,
        "selectedPlanId": None,
        "executedActions": [],
        "events": events,
        "memoryPriorityRule": "current_request_overrides_memory",
    }


def runtime_response(request, ok, status, current_state, events, allowed_next_states=None, **extra):
    allowed = allowed_next_states if allowed_next_states is not None else RUNTIME_TRANSITIONS[current_state]
    response = {
        "ok": ok,
        "status": status,
        "session": runtime_session(request, current_state, events, allowed),
        "currentState": current_state,
        "allowedNextStates": allowed,
    }
    response.update(extra)
    return response


def intent_needs_clarification(intent):
    return bool(intent and intent.get("missingFields"))


def storage_error_payload():
    return {"ok": False, "error": "storage_unavailable", "recoverable": True}


def storage_intent_error():
    return intent_error_response("sqlite_unavailable", "storage_unavailable", [])


def runtime_adapter():
    current = get_settings()
    return RuntimeAdapter(current["db_path"])


def execution_adapter():
    current = get_settings()
    return ExecutionAdapter(current["db_path"])


def runtime_error_response(exc):
    if isinstance(exc, RuntimeErrorBase):
        return JSONResponse(status_code=exc.http_status, content=exc.to_payload())
    if isinstance(exc, sqlite3.Error):
        return JSONResponse(status_code=503, content=storage_error_payload())
    raise exc


def execution_error_response(exc):
    if isinstance(exc, RuntimeErrorBase):
        return JSONResponse(status_code=exc.http_status, content=exc.to_payload())
    if isinstance(exc, ExecutionError):
        return JSONResponse(status_code=exc.http_status, content=exc.to_payload())
    if isinstance(exc, sqlite3.Error):
        return JSONResponse(status_code=503, content=storage_error_payload())
    raise exc


def product_runtime_legacy_flag_enabled():
    return os.environ.get("V4_PRODUCT_RUNTIME_LEGACY_CORE", "0") == "1"


def runtime_shadow_compare_enabled():
    return os.environ.get("V4_PRODUCT_RUNTIME_SHADOW_COMPARE", "0") == "1"


async def resolve_intent_response(input_text, overrides, current):
    if not current["api_key"]:
        try:
            lessons = load_relevant_lessons(input_text, current["db_path"])
        except sqlite3.Error:
            return storage_intent_error()
        return intent_error_response("missing_api_key", "OPENAI_API_KEY is not configured.", lessons)

    try:
        return await run_intent_graph(input_text, overrides, current)
    except sqlite3.Error:
        return storage_intent_error()
    except RuntimeError:
        pass
    except Exception as exc:
        try:
            lessons = load_relevant_lessons(input_text, current["db_path"])
        except sqlite3.Error:
            return storage_intent_error()
        return intent_error_response("langgraph_llm_error", str(exc), lessons, "langgraph")

    try:
        lessons = load_relevant_lessons(input_text, current["db_path"])
    except sqlite3.Error:
        return storage_intent_error()
    payload = build_chat_payload(input_text, overrides, lessons, current["model"])
    headers = {
        "Authorization": "Bearer " + current["api_key"],
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=current["timeout_seconds"]) as client:
            response = await client.post(current["base_url"] + "/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        raw_intent = extract_json_object(content)
        intent = validate_intent(raw_intent)
    except Exception as exc:
        return intent_error_response("llm_error", str(exc), lessons, "direct_llm")

    return {
        "ok": True,
        "source": "llm",
        "runtimePath": "direct_llm",
        "intent": intent,
        "lessonsUsed": lessons,
    }


@app.get("/api/health")
def health():
    current = get_settings()
    return {
        "ok": True,
        "modelConfigured": bool(current["api_key"] and current["model"]),
        "model": current["model"],
        "baseUrl": current["base_url"],
        "sqliteAvailable": sqlite_available(current["db_path"]),
        "dbPath": str(current["db_path"]),
        "langGraph": graph_runtime_status(),
    }


@app.post("/api/intent")
async def extract_intent(request: IntentRequest):
    current = get_settings()
    return await resolve_intent_response(request.input, request.overrides, current)


async def legacy_runtime_thin_response(request: RuntimeRequest):
    current = get_settings()

    if request.memoryDecision:
        decision = request.memoryDecision
        try:
            result = decide_memory_candidate(
                decision.candidateId,
                decision.action,
                decision.correctedValue,
                current["db_path"],
            )
        except sqlite3.Error:
            events = [
                runtime_event(
                    "operation_recoverable_failure",
                    "memory_candidate_review",
                    "memory_candidate_review",
                    "storage_unavailable",
                )
            ]
            return runtime_response(
                request,
                False,
                "operation_recoverable_failure",
                "memory_candidate_review",
                events,
                ["memory_candidate_review"],
                error="storage_unavailable",
                operation="memory_decision",
            )
        if result.get("status") == "adopted":
            events = [runtime_event("memory_committed", "memory_candidate_review", "memory_committed")]
            return runtime_response(
                request,
                True,
                "memory_committed",
                "memory_committed",
                events,
                memoryId=result.get("memoryId"),
                memoryDecisionResult=result,
            )
        if result.get("status") == "ignored":
            events = [runtime_event("memory_ignored", "memory_candidate_review", "done")]
            return runtime_response(
                request,
                True,
                "memory_ignored",
                "done",
                events,
                memoryId=None,
                memoryDecisionResult=result,
            )
        error = result.get("error") or "memory_decision_failed"
        events = [runtime_event("memory_decision_rejected", "memory_candidate_review", "memory_candidate_review", error)]
        resolution = "retry_correction" if error == "sensitive_correction_blocked" else "refresh_candidate"
        return runtime_response(
            request,
            False,
            "memory_decision_rejected",
            "memory_candidate_review",
            events,
            ["memory_candidate_review", "done"],
            error=error,
            resolution=resolution,
            memoryDecisionResult=result,
        )

    if request.feedback:
        payload = request.feedback.model_dump()
        payload["input"] = request.input
        try:
            result = save_feedback(payload, current["db_path"])
        except sqlite3.Error:
            events = [
                runtime_event(
                    "operation_recoverable_failure",
                    "feedback_capture",
                    "feedback_capture",
                    "storage_unavailable",
                )
            ]
            return runtime_response(
                request,
                False,
                "operation_recoverable_failure",
                "feedback_capture",
                events,
                ["feedback_capture"],
                error="storage_unavailable",
                operation="feedback",
            )
        next_states = ["memory_candidate_review"] if result.get("candidate") else ["done"]
        events = [runtime_event("feedback_captured", "ready_for_confirmation", "feedback_capture")]
        if result.get("candidate"):
            events.append(runtime_event("memory_candidate_created", "feedback_capture", "memory_candidate_review"))
        return runtime_response(
            request,
            True,
            "feedback_captured",
            "feedback_capture",
            events,
            next_states,
            feedbackId=result.get("feedbackId"),
            feedbackResult=result,
        )

    intent_result = await resolve_intent_response(request.input, request.overrides, current)
    if not intent_result.get("ok"):
        events = [runtime_event("recoverable_failure", "intent_loading", "failed_recoverable", intent_result.get("error"))]
        return runtime_response(
            request,
            False,
            "recoverable_failure",
            "failed_recoverable",
            events,
            error=intent_result.get("error"),
            intentResult=intent_result,
        )

    if intent_needs_clarification(intent_result.get("intent")):
        missing = intent_result["intent"].get("missingFields", [])
        key = missing[0] if missing else "groupType"
        events = [runtime_event("clarification_required", "intent_loading", "clarifying")]
        return runtime_response(
            request,
            True,
            "clarification_required",
            "clarifying",
            events,
            clarification={
                "key": key,
                "question": "Please provide missing planning information before local planning continues.",
            },
            intentResult=intent_result,
        )

    events = [runtime_event("intent_loaded", "intent_loading", "planning_local")]
    return runtime_response(
        request,
        True,
        "planning_ready",
        "planning_local",
        events,
        intentResult=intent_result,
    )


@app.post("/api/runtime")
async def runtime(request: RuntimeRequest):
    thin_response = await legacy_runtime_thin_response(request)
    if product_runtime_legacy_flag_enabled():
        thin_response = CompatibilityAdapter().project_legacy_response(thin_response=thin_response)
    if runtime_shadow_compare_enabled():
        CompatibilityAdapter().shadow_compare(
            legacy_response=thin_response,
            projected_response=CompatibilityAdapter().project_legacy_response(thin_response=thin_response),
        )
    return thin_response


@app.get("/api/runtime/capabilities")
def runtime_capabilities():
    current = get_settings()
    return get_runtime_capabilities(current["db_path"])


@app.post("/api/runtime/sessions")
def create_runtime_session(request: RuntimeSessionCreateRequest):
    try:
        result = runtime_adapter().create_session(
            input_text=request.input,
            overrides=request.overrides,
            idempotency_key=request.idempotencyKey,
        )
        return result.public_dict()
    except (RuntimeErrorBase, sqlite3.Error) as exc:
        return runtime_error_response(exc)


@app.get("/api/runtime/sessions/{session_id}")
def get_runtime_session(session_id: str):
    try:
        return {"ok": True, "session": runtime_adapter().get_session(session_id).public_dict()}
    except (RuntimeErrorBase, sqlite3.Error) as exc:
        return runtime_error_response(exc)


@app.post("/api/runtime/sessions/{session_id}/events")
def submit_runtime_event(session_id: str, request: RuntimeSubmitEventRequest):
    try:
        result = runtime_adapter().submit_event(
            session_id=session_id,
            event_type=request.eventType,
            expected_version=request.expectedVersion,
            idempotency_key=request.idempotencyKey,
            actor=request.actor,
            trace_id=request.traceId,
            payload=request.payload,
            reason=request.reason,
        )
        return result.public_dict()
    except (RuntimeErrorBase, sqlite3.Error) as exc:
        return runtime_error_response(exc)


@app.post("/api/runtime/sessions/{session_id}/pause")
def pause_runtime_session(session_id: str, request: RuntimeLifecycleRequest):
    try:
        result = runtime_adapter().pause_session(
            session_id=session_id,
            expected_version=request.expectedVersion,
            idempotency_key=request.idempotencyKey,
            actor=request.actor,
            trace_id=request.traceId,
            reason=request.reason,
        )
        return result.public_dict()
    except (RuntimeErrorBase, sqlite3.Error) as exc:
        return runtime_error_response(exc)


@app.post("/api/runtime/sessions/{session_id}/resume")
def resume_runtime_session(session_id: str, request: RuntimeLifecycleRequest):
    try:
        result = runtime_adapter().resume_session(
            session_id=session_id,
            expected_version=request.expectedVersion,
            idempotency_key=request.idempotencyKey,
            actor=request.actor,
            trace_id=request.traceId,
            reason=request.reason,
        )
        return result.public_dict()
    except (RuntimeErrorBase, sqlite3.Error) as exc:
        return runtime_error_response(exc)


@app.post("/api/runtime/sessions/{session_id}/close")
def close_runtime_session(session_id: str, request: RuntimeLifecycleRequest):
    try:
        result = runtime_adapter().close_session(
            session_id=session_id,
            expected_version=request.expectedVersion,
            idempotency_key=request.idempotencyKey,
            actor=request.actor,
            trace_id=request.traceId,
            reason=request.reason,
        )
        return result.public_dict()
    except (RuntimeErrorBase, sqlite3.Error) as exc:
        return runtime_error_response(exc)


@app.get("/api/runtime/sessions/{session_id}/events")
def list_runtime_events(session_id: str, afterSequence: int = 0, limit: int = 100):
    try:
        events = runtime_adapter().list_events(session_id=session_id, after_sequence=afterSequence, limit=limit)
        return {
            "ok": True,
            "sessionId": session_id,
            "events": [event.public_dict() for event in events],
        }
    except (RuntimeErrorBase, sqlite3.Error) as exc:
        return runtime_error_response(exc)


@app.post("/api/executions")
def create_execution(request: ExecutionCreateRequest):
    try:
        result = execution_adapter().create_execution(
            session_id=request.sessionId,
            plan_id=request.planId,
            plan_version=request.planVersion,
            steps=[step.model_dump() for step in request.steps],
            idempotency_key=request.idempotencyKey,
            actor=request.actor,
            trace_id=request.traceId,
        )
        return result.public_dict()
    except (ExecutionError, RuntimeErrorBase, sqlite3.Error) as exc:
        return execution_error_response(exc)


@app.get("/api/executions/{execution_id}")
def get_execution(execution_id: str):
    try:
        return {"ok": True, "execution": execution_adapter().get_execution(execution_id).public_dict()}
    except (ExecutionError, RuntimeErrorBase, sqlite3.Error) as exc:
        return execution_error_response(exc)


@app.post("/api/executions/{execution_id}/advance")
def advance_execution(execution_id: str, request: ExecutionAdvanceRequest):
    try:
        result = execution_adapter().advance_execution(
            execution_id=execution_id,
            expected_version=request.expectedVersion,
            plan_version=request.planVersion,
            idempotency_key=request.idempotencyKey,
            outcome=request.outcome,
            actor=request.actor,
            trace_id=request.traceId,
            failure_type=request.failureType,
        )
        return result.public_dict()
    except (ExecutionError, RuntimeErrorBase, sqlite3.Error) as exc:
        return execution_error_response(exc)


@app.post("/api/executions/{execution_id}/cancel")
def cancel_execution(execution_id: str, request: ExecutionCancelRequest):
    try:
        result = execution_adapter().cancel_execution(
            execution_id=execution_id,
            expected_version=request.expectedVersion,
            idempotency_key=request.idempotencyKey,
            actor=request.actor,
            trace_id=request.traceId,
            reason=request.reason,
        )
        return result.public_dict()
    except (ExecutionError, RuntimeErrorBase, sqlite3.Error) as exc:
        return execution_error_response(exc)


@app.post("/api/feedback")
def feedback(request: FeedbackRequest):
    current = get_settings()
    try:
        return save_feedback(request.model_dump(), current["db_path"])
    except sqlite3.Error:
        return JSONResponse(status_code=503, content=storage_error_payload())


@app.post("/api/memory-candidates/{candidate_id}/decision")
def memory_candidate_decision(candidate_id: int, request: CandidateDecisionRequest):
    current = get_settings()
    try:
        return decide_memory_candidate(candidate_id, request.action, request.correctedValue, current["db_path"])
    except sqlite3.Error:
        return JSONResponse(status_code=503, content=storage_error_payload())


if os.environ.get("SERVE_STATIC", "1") != "0":
    app.mount("/", StaticFiles(directory=".", html=True), name="static")
