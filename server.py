import os

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

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


app = FastAPI(title="Local Life Agent V4 API")
settings = get_settings()
init_db(settings["db_path"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IntentRequest(BaseModel):
    input: str = Field(min_length=1, max_length=1000)
    overrides: dict = Field(default_factory=dict)


class FeedbackRequest(BaseModel):
    input: str = Field(default="", max_length=1000)
    llmIntent: dict | None = None
    userCorrection: str | None = Field(default=None, max_length=1000)
    failureType: str | None = Field(default="general", max_length=80)


class CandidateDecisionRequest(BaseModel):
    action: str = Field(pattern="^(adopt|ignore|correct)$")
    correctedValue: str | None = Field(default=None, max_length=1000)


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
    }


@app.post("/api/intent")
async def extract_intent(request: IntentRequest):
    current = get_settings()
    if not current["api_key"]:
        return {
            "ok": False,
            "source": "missing_api_key",
            "error": "OPENAI_API_KEY is not configured.",
            "lessonsUsed": load_relevant_lessons(request.input, current["db_path"]),
        }

    lessons = load_relevant_lessons(request.input, current["db_path"])
    payload = build_chat_payload(request.input, request.overrides, lessons, current["model"])
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
        return {
            "ok": False,
            "source": "llm_error",
            "error": str(exc),
            "lessonsUsed": lessons,
        }

    return {
        "ok": True,
        "source": "llm",
        "intent": intent,
        "lessonsUsed": lessons,
    }


@app.post("/api/feedback")
def feedback(request: FeedbackRequest):
    current = get_settings()
    return save_feedback(request.model_dump(), current["db_path"])


@app.post("/api/memory-candidates/{candidate_id}/decision")
def memory_candidate_decision(candidate_id: int, request: CandidateDecisionRequest):
    current = get_settings()
    return decide_memory_candidate(candidate_id, request.action, request.correctedValue, current["db_path"])


if os.environ.get("SERVE_STATIC", "1") != "0":
    app.mount("/", StaticFiles(directory=".", html=True), name="static")
