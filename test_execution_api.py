import sqlite3
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

import server
from execution.adapter import ExecutionAdapter
from execution.repositories import migrate_execution
from runtime.adapter import RuntimeAdapter


TEST_TMP_ROOT = Path(__file__).parent / ".pytest_tmp"


def temp_dir():
    TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=TEST_TMP_ROOT)


def runtime_settings(db_path):
    return {
        "base_url": "http://example.test/v1",
        "api_key": "",
        "model": "demo-model",
        "timeout_seconds": 0.01,
        "confidence_threshold": 0.72,
        "db_path": db_path,
    }


def client_with_settings(monkeypatch, db_path):
    monkeypatch.setattr(server, "get_settings", lambda: runtime_settings(db_path))
    return TestClient(server.app)


def table_names(db_path):
    conn = sqlite3.connect(db_path)
    try:
        return {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
    finally:
        conn.close()


def execution_count(db_path):
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute("SELECT COUNT(*) FROM execution_runs").fetchone()[0]
    finally:
        conn.close()


def test_execution_migration_is_idempotent_and_independent():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"

        migrate_execution(db_path)
        migrate_execution(db_path)

        assert {
            "execution_runs",
            "execution_steps",
            "execution_events",
            "execution_schema_migrations",
        }.issubset(table_names(db_path))


def test_execution_adapter_advances_steps_to_completion():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        adapter = ExecutionAdapter(db_path)

        created = adapter.create_execution(
            session_id=None,
            plan_id="plan-a",
            plan_version=1,
            steps=[{"title": "book mock venue"}, {"title": "send mock reminder"}],
            idempotency_key="create-exec",
            actor="test",
            trace_id="trace-create",
        )
        execution_id = created.execution.executionId
        assert created.execution.status == "active"
        assert [step.status for step in created.execution.steps] == ["active", "pending"]

        first = adapter.advance_execution(
            execution_id=execution_id,
            expected_version=1,
            plan_version=1,
            idempotency_key="advance-1",
            outcome="succeeded",
            actor="test",
            trace_id="trace-advance-1",
        )
        assert first.execution.status == "active"
        assert [step.status for step in first.execution.steps] == ["succeeded", "active"]

        second = adapter.advance_execution(
            execution_id=execution_id,
            expected_version=2,
            plan_version=1,
            idempotency_key="advance-2",
            outcome="succeeded",
            actor="test",
            trace_id="trace-advance-2",
        )
        assert second.execution.status == "completed"
        assert second.execution.currentStepId is None
        assert [event.type for event in adapter.core.repository.list_events(execution_id)] == [
            "execution_created",
            "step_advanced",
            "execution_completed",
        ]


def test_execution_adapter_idempotency_version_and_plan_gates():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        adapter = ExecutionAdapter(db_path)
        created = adapter.create_execution(
            session_id=None,
            plan_id="plan-b",
            plan_version=3,
            steps=[{"title": "mock step"}],
            idempotency_key="create-gates",
        )
        execution_id = created.execution.executionId

        first = adapter.advance_execution(
            execution_id=execution_id,
            expected_version=1,
            plan_version=3,
            idempotency_key="advance-same",
            outcome="failed",
        )
        duplicate = adapter.advance_execution(
            execution_id=execution_id,
            expected_version=1,
            plan_version=3,
            idempotency_key="advance-same",
            outcome="failed",
        )
        assert duplicate.duplicate is True
        assert duplicate.event.eventId == first.event.eventId

        retry_execution = adapter.create_execution(
            session_id=None,
            plan_id="plan-c",
            plan_version=4,
            steps=[{"title": "retryable", "maxAttempts": 2}],
            idempotency_key="create-retryable",
        )
        retry_id = retry_execution.execution.executionId
        with_conflict = adapter.advance_execution(
            execution_id=retry_id,
            expected_version=1,
            plan_version=4,
            idempotency_key="retry-1",
            outcome="failed",
            failure_type="backend_timeout",
        )
        assert with_conflict.execution.status == "active"
        assert with_conflict.execution.steps[0].attemptCount == 1
        assert with_conflict.event.type == "step_retry_scheduled"

        try:
            adapter.advance_execution(
                execution_id=retry_id,
                expected_version=1,
                plan_version=4,
                idempotency_key="stale",
                outcome="succeeded",
            )
            raise AssertionError("expected version conflict")
        except Exception as exc:
            assert getattr(exc, "code", None) == "execution_version_conflict"

        try:
            adapter.advance_execution(
                execution_id=retry_id,
                expected_version=2,
                plan_version=99,
                idempotency_key="wrong-plan",
                outcome="succeeded",
            )
            raise AssertionError("expected plan version conflict")
        except Exception as exc:
            assert getattr(exc, "code", None) == "execution_plan_version_conflict"


def test_execution_blocked_run_rejects_further_advance_until_explicit_flow():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        adapter = ExecutionAdapter(db_path)
        created = adapter.create_execution(
            session_id=None,
            plan_id="plan-blocked",
            plan_version=1,
            steps=[{"title": "blocked step"}],
            idempotency_key="create-blocked",
        )
        execution_id = created.execution.executionId

        blocked = adapter.advance_execution(
            execution_id=execution_id,
            expected_version=1,
            plan_version=1,
            idempotency_key="block-1",
            outcome="blocked",
        )
        assert blocked.execution.status == "blocked"

        try:
            adapter.advance_execution(
                execution_id=execution_id,
                expected_version=2,
                plan_version=1,
                idempotency_key="advance-blocked",
                outcome="succeeded",
            )
            raise AssertionError("expected blocked execution to reject advance")
        except Exception as exc:
            assert getattr(exc, "code", None) == "execution_invalid_transition"


def test_execution_routes_create_advance_and_cancel(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        client = client_with_settings(monkeypatch, db_path)

        created = client.post(
            "/api/executions",
            json={
                "planId": "plan-route",
                "planVersion": 1,
                "idempotencyKey": "route-create",
                "steps": [{"title": "mock execution"}],
            },
        )
        assert created.status_code == 200
        execution_id = created.json()["execution"]["executionId"]

        stale = client.post(
            f"/api/executions/{execution_id}/advance",
            json={
                "expectedVersion": 9,
                "planVersion": 1,
                "idempotencyKey": "route-stale",
                "outcome": "succeeded",
            },
        )
        assert stale.status_code == 409
        assert stale.json()["error"] == "execution_version_conflict"

        cancelled = client.post(
            f"/api/executions/{execution_id}/cancel",
            json={"expectedVersion": 1, "idempotencyKey": "route-cancel", "reason": "user cancelled"},
        )
        assert cancelled.status_code == 200
        assert cancelled.json()["execution"]["status"] == "cancelled"

        fetched = client.get(f"/api/executions/{execution_id}")
        assert fetched.status_code == 200
        assert fetched.json()["execution"]["status"] == "cancelled"


def test_execution_create_with_runtime_session_writes_requested_summary():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        runtime = RuntimeAdapter(db_path)
        session = runtime.create_session(input_text="plan", overrides={}, idempotency_key="runtime-create").session
        execution = ExecutionAdapter(db_path).create_execution(
            session_id=session.sessionId,
            plan_id="plan-summary",
            plan_version=1,
            steps=[{"title": "mock step"}],
            idempotency_key="exec-summary-create",
            actor="test",
            trace_id="trace-summary-create",
        )

        assert execution.runtimeSummaryEventStatus == "written"
        assert execution.runtimeSummaryEvent["type"] == "execution_requested_summary"
        updated_session = runtime.get_session(session.sessionId)
        assert updated_session.runtimeState == "intent_loading"
        assert updated_session.activeExecutionId == execution.execution.executionId
        assert [event.type for event in runtime.list_events(session_id=session.sessionId)] == [
            "session_created",
            "execution_requested_summary",
        ]


def test_execution_terminal_and_blocked_states_write_runtime_summaries_once():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        runtime = RuntimeAdapter(db_path)
        adapter = ExecutionAdapter(db_path)

        completed_session = runtime.create_session(input_text="complete", overrides={}, idempotency_key="rt-complete").session
        completed = adapter.create_execution(
            session_id=completed_session.sessionId,
            plan_id="plan-complete",
            plan_version=1,
            steps=[{"title": "single step"}],
            idempotency_key="exec-complete",
        )
        completed_done = adapter.advance_execution(
            execution_id=completed.execution.executionId,
            expected_version=1,
            plan_version=1,
            idempotency_key="advance-complete",
            outcome="succeeded",
        )
        duplicate_complete = adapter.advance_execution(
            execution_id=completed.execution.executionId,
            expected_version=1,
            plan_version=1,
            idempotency_key="advance-complete",
            outcome="succeeded",
        )
        assert completed_done.runtimeSummaryEvent["type"] == "execution_completed_summary"
        assert duplicate_complete.duplicate is True
        assert duplicate_complete.runtimeSummaryEvent["type"] == "execution_completed_summary"
        assert [event.type for event in runtime.list_events(session_id=completed_session.sessionId)] == [
            "session_created",
            "execution_requested_summary",
            "execution_completed_summary",
        ]

        try:
            adapter.advance_execution(
                execution_id=completed.execution.executionId,
                expected_version=2,
                plan_version=1,
                idempotency_key="advance-after-terminal",
                outcome="succeeded",
            )
            raise AssertionError("expected terminal execution to reject advance")
        except Exception as exc:
            assert getattr(exc, "code", None) == "execution_already_terminal"

        try:
            adapter.cancel_execution(
                execution_id=completed.execution.executionId,
                expected_version=2,
                idempotency_key="cancel-after-terminal",
            )
            raise AssertionError("expected terminal execution to reject cancel")
        except Exception as exc:
            assert getattr(exc, "code", None) == "execution_already_terminal"

        blocked_session = runtime.create_session(input_text="block", overrides={}, idempotency_key="rt-block").session
        blocked = adapter.create_execution(
            session_id=blocked_session.sessionId,
            plan_id="plan-block",
            plan_version=1,
            steps=[{"title": "blocked step"}],
            idempotency_key="exec-block",
        )
        blocked_result = adapter.advance_execution(
            execution_id=blocked.execution.executionId,
            expected_version=1,
            plan_version=1,
            idempotency_key="advance-block",
            outcome="blocked",
        )
        assert blocked_result.runtimeSummaryEvent["type"] == "execution_blocked_summary"

        failed_session = runtime.create_session(input_text="fail", overrides={}, idempotency_key="rt-fail").session
        failed = adapter.create_execution(
            session_id=failed_session.sessionId,
            plan_id="plan-fail",
            plan_version=1,
            steps=[{"title": "failed step", "maxAttempts": 1}],
            idempotency_key="exec-fail",
        )
        failed_result = adapter.advance_execution(
            execution_id=failed.execution.executionId,
            expected_version=1,
            plan_version=1,
            idempotency_key="advance-fail",
            outcome="failed",
            failure_type="mock_failure",
        )
        assert failed_result.runtimeSummaryEvent["type"] == "execution_failed_summary"
        assert failed_result.runtimeSummaryEvent["payload"]["errorCode"] == "mock_failure"

        cancelled_session = runtime.create_session(input_text="cancel", overrides={}, idempotency_key="rt-cancel").session
        cancelled = adapter.create_execution(
            session_id=cancelled_session.sessionId,
            plan_id="plan-cancel",
            plan_version=1,
            steps=[{"title": "cancelled step"}],
            idempotency_key="exec-cancel",
        )
        cancelled_result = adapter.cancel_execution(
            execution_id=cancelled.execution.executionId,
            expected_version=1,
            idempotency_key="cancel-exec",
            reason="user cancelled",
        )
        assert cancelled_result.runtimeSummaryEvent["type"] == "execution_cancelled_summary"
        assert cancelled_result.runtimeSummaryEvent["payload"]["reason"] == "user cancelled"


def test_execution_with_missing_runtime_session_rolls_back_execution_create(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        client = client_with_settings(monkeypatch, db_path)

        response = client.post(
            "/api/executions",
            json={
                "sessionId": "missing-session",
                "planId": "plan-missing-session",
                "planVersion": 1,
                "idempotencyKey": "exec-missing-session",
                "steps": [{"title": "must rollback"}],
            },
        )

        assert response.status_code == 404
        assert response.json()["error"] == "session_not_found"
        assert execution_count(db_path) == 0


def test_execution_with_closed_runtime_session_rolls_back_execution_create():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        runtime = RuntimeAdapter(db_path)
        session = runtime.create_session(input_text="plan", overrides={}, idempotency_key="runtime-closed").session
        runtime.close_session(
            session_id=session.sessionId,
            expected_version=1,
            idempotency_key="runtime-close",
        )

        try:
            ExecutionAdapter(db_path).create_execution(
                session_id=session.sessionId,
                plan_id="plan-closed-session",
                plan_version=1,
                steps=[{"title": "must rollback"}],
                idempotency_key="exec-closed-session",
            )
            raise AssertionError("expected closed Runtime session to reject summary write")
        except Exception as exc:
            assert getattr(exc, "code", None) == "session_closed"

        assert execution_count(db_path) == 0
        assert [event.type for event in runtime.list_events(session_id=session.sessionId)] == [
            "session_created",
            "session_closed",
        ]


def test_duplicate_execution_create_does_not_duplicate_runtime_summary_event():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        runtime = RuntimeAdapter(db_path)
        session = runtime.create_session(input_text="plan", overrides={}, idempotency_key="runtime-dup-summary").session
        adapter = ExecutionAdapter(db_path)

        first = adapter.create_execution(
            session_id=session.sessionId,
            plan_id="plan-dup-summary",
            plan_version=1,
            steps=[{"title": "mock step"}],
            idempotency_key="exec-dup-summary",
        )
        duplicate = adapter.create_execution(
            session_id=session.sessionId,
            plan_id="plan-dup-summary",
            plan_version=1,
            steps=[{"title": "mock step"}],
            idempotency_key="exec-dup-summary",
        )

        assert duplicate.duplicate is True
        assert duplicate.runtimeSummaryEvent["eventId"] == first.runtimeSummaryEvent["eventId"]
        assert [event.type for event in runtime.list_events(session_id=session.sessionId)] == [
            "session_created",
            "execution_requested_summary",
        ]


def test_runtime_summary_payload_rejects_ui_fields():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        runtime = RuntimeAdapter(db_path)
        session = runtime.create_session(input_text="plan", overrides={}, idempotency_key="runtime-ui-field").session

        try:
            runtime.append_execution_summary(
                session_id=session.sessionId,
                event_type="execution_requested_summary",
                idempotency_key="summary-ui-field",
                payload={
                    "executionId": "execution-ui-field",
                    "planId": "plan-ui-field",
                    "planVersion": 1,
                    "executionStatus": "active",
                    "summary": "must reject UI payload",
                    "uiCard": {"title": "not allowed"},
                },
            )
            raise AssertionError("expected Runtime payload allowlist rejection")
        except Exception as exc:
            assert getattr(exc, "code", None) == "invalid_transition"

        assert [event.type for event in runtime.list_events(session_id=session.sessionId)] == ["session_created"]


def test_runtime_summary_payload_rejects_large_payload_without_partial_write():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        runtime = RuntimeAdapter(db_path)
        session = runtime.create_session(input_text="plan", overrides={}, idempotency_key="runtime-large-payload").session

        try:
            runtime.append_execution_summary(
                session_id=session.sessionId,
                event_type="execution_requested_summary",
                idempotency_key="summary-large-payload",
                payload={
                    "executionId": "execution-large-payload",
                    "planId": "plan-large-payload",
                    "planVersion": 1,
                    "executionStatus": "active",
                    "summary": "x" * 5000,
                },
            )
            raise AssertionError("expected Runtime payload size rejection")
        except Exception as exc:
            assert getattr(exc, "code", None) == "invalid_transition"
            assert exc.details["reason"] == "payload_too_large"

        assert [event.type for event in runtime.list_events(session_id=session.sessionId)] == ["session_created"]
