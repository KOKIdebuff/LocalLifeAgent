import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import server
import backend_core
from backend_core import init_db, save_feedback
from runtime.adapter import RuntimeAdapter
from runtime.repositories import migrate_runtime


TEST_TMP_ROOT = Path(__file__).parent / ".pytest_tmp"
LEGACY_FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "runtime_legacy"


def temp_dir():
    TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=TEST_TMP_ROOT)


def runtime_settings(db_path, api_key=""):
    return {
        "base_url": "http://example.test/v1",
        "api_key": api_key,
        "model": "demo-model",
        "timeout_seconds": 0.01,
        "confidence_threshold": 0.72,
        "db_path": db_path,
    }


def client_with_settings(monkeypatch, db_path, api_key=""):
    monkeypatch.setattr(server, "get_settings", lambda: runtime_settings(db_path, api_key))
    return TestClient(server.app)


def complete_intent():
    return {
        "groupType": "friends",
        "timePreset": "unknown",
        "partySize": 3,
        "preferences": ["relaxed"],
        "budgetPerPerson": 120,
        "childAge": None,
        "missingFields": [],
        "confidence": 0.9,
        "reasoningSummary": "demo",
    }


def missing_intent():
    intent = complete_intent()
    intent["groupType"] = "unknown"
    intent["missingFields"] = ["groupType"]
    return intent


def normalize_legacy_runtime_response(value, key=None):
    if isinstance(value, dict):
        return {
            item_key: normalize_legacy_runtime_response(item_value, item_key)
            for item_key, item_value in value.items()
        }
    if isinstance(value, list):
        return [normalize_legacy_runtime_response(item) for item in value]
    if key == "sessionId":
        return "<session-id>"
    if key and key.endswith("At") and isinstance(value, str):
        return "<timestamp>"
    return value


def assert_fixture_subset(actual, expected, path="$"):
    if isinstance(expected, dict):
        assert isinstance(actual, dict), path
        for key, value in expected.items():
            assert key in actual, f"{path}.{key}"
            assert_fixture_subset(actual[key], value, f"{path}.{key}")
        return
    if isinstance(expected, list):
        assert isinstance(actual, list), path
        assert len(actual) == len(expected), path
        for index, value in enumerate(expected):
            assert_fixture_subset(actual[index], value, f"{path}[{index}]")
        return
    assert actual == expected, path


async def fake_complete_intent(input_text, overrides, current):
    return {
        "ok": True,
        "source": "llm",
        "runtimePath": "direct_llm",
        "intent": complete_intent(),
        "lessonsUsed": [],
    }


async def fake_missing_intent(input_text, overrides, current):
    return {
        "ok": True,
        "source": "llm",
        "runtimePath": "direct_llm",
        "intent": missing_intent(),
        "lessonsUsed": [],
    }


@pytest.mark.parametrize(
    ("fixture_name", "scenario"),
    [
        ("recoverable_failure", "recoverable_failure"),
        ("planning_ready", "planning_ready"),
        ("clarification_required", "clarification_required"),
        ("feedback_captured", "feedback_captured"),
        ("memory_committed", "memory_committed"),
        ("memory_ignored", "memory_ignored"),
        ("memory_decision_rejected", "memory_decision_rejected"),
        ("operation_recoverable_failure", "operation_recoverable_failure"),
    ],
)
def test_legacy_runtime_golden_fixtures(monkeypatch, fixture_name, scenario):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        if scenario == "operation_recoverable_failure":
            db_path = Path(tmp) / "database_is_a_directory"
            db_path.mkdir()
        else:
            init_db(db_path)

        if scenario == "planning_ready":
            monkeypatch.setattr(server, "resolve_intent_response", fake_complete_intent)
        if scenario == "clarification_required":
            monkeypatch.setattr(server, "resolve_intent_response", fake_missing_intent)

        client = client_with_settings(monkeypatch, db_path, api_key="test-key")
        if scenario == "recoverable_failure":
            client = client_with_settings(monkeypatch, db_path)
            response = client.post("/api/runtime", json={"input": "plan weekend"})
        elif scenario in {"planning_ready", "clarification_required"}:
            response = client.post("/api/runtime", json={"input": "plan weekend"})
        elif scenario == "feedback_captured":
            response = client.post(
                "/api/runtime",
                json={"input": "plan weekend", "feedback": {"userCorrection": "prefer relaxed pace"}},
            )
        elif scenario in {"memory_committed", "memory_ignored", "memory_decision_rejected"}:
            feedback = save_feedback(
                {"input": "plan weekend", "userCorrection": "prefer relaxed pace", "failureType": "user_correction"},
                db_path,
            )
            payload = {"candidateId": feedback["candidate"]["id"], "action": "adopt"}
            if scenario == "memory_ignored":
                payload["action"] = "ignore"
            if scenario == "memory_decision_rejected":
                payload = {
                    "candidateId": feedback["candidate"]["id"],
                    "action": "correct",
                    "correctedValue": "my access_token is SECRET-TOKEN-123",
                }
            response = client.post("/api/runtime", json={"input": "plan weekend", "memoryDecision": payload})
        else:
            response = client.post(
                "/api/runtime",
                json={"input": "plan weekend", "feedback": {"userCorrection": "prefer relaxed pace"}},
            )

        assert response.status_code == 200
        expected = json.loads((LEGACY_FIXTURE_ROOT / f"{fixture_name}.json").read_text(encoding="utf-8"))
        assert_fixture_subset(normalize_legacy_runtime_response(response.json()), expected)


def test_runtime_returns_recoverable_failure_without_api_key(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        client = client_with_settings(monkeypatch, db_path)

        response = client.post("/api/runtime", json={"input": "安排一下周末"})

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is False
        assert data["status"] == "recoverable_failure"
        assert data["currentState"] == "failed_recoverable"
        assert data["allowedNextStates"] == ["planning_local"]
        assert data["intentResult"]["source"] == "missing_api_key"


def test_runtime_returns_planning_ready_for_complete_intent(monkeypatch):
    async def fake_intent(input_text, overrides, current):
        return {
            "ok": True,
            "source": "llm",
            "runtimePath": "direct_llm",
            "intent": complete_intent(),
            "lessonsUsed": [],
        }

    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        monkeypatch.setattr(server, "resolve_intent_response", fake_intent)
        client = client_with_settings(monkeypatch, db_path, api_key="test-key")

        response = client.post("/api/runtime", json={"input": "和朋友周末轻松玩"})

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["status"] == "planning_ready"
        assert data["currentState"] == "planning_local"
        assert data["intentResult"]["intent"]["missingFields"] == []
        assert data["session"]["memoryPriorityRule"] == "current_request_overrides_memory"


def test_runtime_returns_clarification_for_missing_intent(monkeypatch):
    async def fake_intent(input_text, overrides, current):
        return {
            "ok": True,
            "source": "llm",
            "runtimePath": "direct_llm",
            "intent": missing_intent(),
            "lessonsUsed": [],
        }

    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        monkeypatch.setattr(server, "resolve_intent_response", fake_intent)
        client = client_with_settings(monkeypatch, db_path, api_key="test-key")

        response = client.post("/api/runtime", json={"input": "安排一下"})

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["status"] == "clarification_required"
        assert data["currentState"] == "clarifying"
        assert data["allowedNextStates"] == ["planning_local"]
        assert data["clarification"]["key"] == "groupType"


def test_runtime_feedback_captures_candidate(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        client = client_with_settings(monkeypatch, db_path)

        response = client.post(
            "/api/runtime",
            json={
                "input": "周末想轻松玩",
                "feedback": {
                    "userCorrection": "不要安排太赶，优先轻松一点",
                    "failureType": "user_correction",
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["status"] == "feedback_captured"
        assert data["currentState"] == "feedback_capture"
        assert data["feedbackResult"]["candidate"]["status"] == "pending"
        assert data["allowedNextStates"] == ["memory_candidate_review"]


def test_runtime_memory_adopt_commits_memory(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        feedback = save_feedback(
            {
                "input": "周末想轻松玩",
                "userCorrection": "不要安排太赶，优先轻松一点",
                "failureType": "user_correction",
            },
            db_path,
        )
        client = client_with_settings(monkeypatch, db_path)

        response = client.post(
            "/api/runtime",
            json={
                "input": "周末想轻松玩",
                "memoryDecision": {
                    "candidateId": feedback["candidate"]["id"],
                    "action": "adopt",
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["status"] == "memory_committed"
        assert data["currentState"] == "memory_committed"
        assert data["allowedNextStates"] == ["done"]
        assert data["memoryDecisionResult"]["memory"] is not None


def test_runtime_memory_ignore_finishes_without_memory(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        feedback = save_feedback(
            {
                "input": "周末想轻松玩",
                "userCorrection": "不要安排太赶，优先轻松一点",
                "failureType": "user_correction",
            },
            db_path,
        )
        client = client_with_settings(monkeypatch, db_path)

        response = client.post(
            "/api/runtime",
            json={
                "input": "周末想轻松玩",
                "memoryDecision": {
                    "candidateId": feedback["candidate"]["id"],
                    "action": "ignore",
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["status"] == "memory_ignored"
        assert data["currentState"] == "done"
        assert data["allowedNextStates"] == []
        assert data["memoryDecisionResult"]["memory"] is None


def test_runtime_rejects_sensitive_correction_without_finishing_candidate(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        feedback = save_feedback(
            {
                "input": "周末想轻松玩",
                "userCorrection": "不要安排太赶，优先轻松一点",
                "failureType": "user_correction",
            },
            db_path,
        )
        client = client_with_settings(monkeypatch, db_path)

        response = client.post(
            "/api/runtime",
            json={
                "input": "周末想轻松玩",
                "memoryDecision": {
                    "candidateId": feedback["candidate"]["id"],
                    "action": "correct",
                    "correctedValue": "我的支付密码是 123456",
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is False
        assert data["status"] == "memory_decision_rejected"
        assert data["currentState"] == "memory_candidate_review"
        assert data["allowedNextStates"] == ["memory_candidate_review", "done"]
        assert data["error"] == "sensitive_correction_blocked"
        assert data["resolution"] == "retry_correction"
        assert data["memoryDecisionResult"]["candidateStatus"] == "pending"
        assert "candidate" not in data["memoryDecisionResult"]
        assert "支付密码" not in json.dumps(data, ensure_ascii=False)
        assert data["session"]["events"][0]["type"] == "memory_decision_rejected"


def test_direct_decision_rejects_sensitive_correction_and_keeps_candidate(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        feedback = save_feedback(
            {
                "input": "周末想轻松玩",
                "userCorrection": "不要安排太赶，优先轻松一点",
                "failureType": "user_correction",
            },
            db_path,
        )
        client = client_with_settings(monkeypatch, db_path)

        response = client.post(
            f"/api/memory-candidates/{feedback['candidate']['id']}/decision",
            json={"action": "correct", "correctedValue": "我的银行卡是 6222020000000000"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is False
        assert data["error"] == "sensitive_correction_blocked"
        assert data["candidateStatus"] == "pending"
        assert "candidate" not in data
        assert "银行卡" not in json.dumps(data, ensure_ascii=False)


def test_sensitive_rejection_does_not_echo_legacy_candidate_text(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        feedback = save_feedback(
            {
                "input": "周末想轻松玩",
                "userCorrection": "不要安排太赶，优先轻松一点",
                "failureType": "user_correction",
            },
            db_path,
        )
        candidate_id = feedback["candidate"]["id"]
        conn = sqlite3.connect(db_path)
        try:
            conn.execute(
                "UPDATE memory_candidates SET value = ?, evidence_json = ?, sensitivity_level = ? WHERE id = ?",
                (
                    "我的支付密码是 123456",
                    json.dumps(["我的支付密码是 123456"], ensure_ascii=False),
                    "L0",
                    candidate_id,
                ),
            )
            conn.commit()
        finally:
            conn.close()
        client = client_with_settings(monkeypatch, db_path)

        direct = client.post(
            f"/api/memory-candidates/{candidate_id}/decision",
            json={"action": "correct", "correctedValue": "我的银行卡是 6222020000000000"},
        )
        runtime = client.post(
            "/api/runtime",
            json={
                "input": "周末想轻松玩",
                "memoryDecision": {
                    "candidateId": candidate_id,
                    "action": "correct",
                    "correctedValue": "我的银行卡是 6222020000000000",
                },
            },
        )

        assert direct.status_code == 200
        assert runtime.status_code == 200
        assert direct.json()["error"] == "sensitive_correction_blocked"
        assert runtime.json()["error"] == "sensitive_correction_blocked"
        assert "candidate" not in direct.json()
        assert "candidate" not in runtime.json()["memoryDecisionResult"]
        assert "支付密码" not in json.dumps(direct.json(), ensure_ascii=False)
        assert "支付密码" not in json.dumps(runtime.json(), ensure_ascii=False)


def test_runtime_invalid_or_blank_memory_decision_is_validation_error(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        client = client_with_settings(monkeypatch, db_path)

        invalid_action = client.post(
            "/api/runtime",
            json={"input": "周末想轻松玩", "memoryDecision": {"candidateId": 1, "action": "invalid"}},
        )
        blank_correction = client.post(
            "/api/runtime",
            json={
                "input": "周末想轻松玩",
                "memoryDecision": {"candidateId": 1, "action": "correct", "correctedValue": "   "},
            },
        )

        assert invalid_action.status_code == 422
        assert blank_correction.status_code == 422


def test_runtime_rejects_missing_candidate_without_success_event(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        client = client_with_settings(monkeypatch, db_path)

        response = client.post(
            "/api/runtime",
            json={"input": "周末想轻松玩", "memoryDecision": {"candidateId": 999, "action": "adopt"}},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "memory_decision_rejected"
        assert data["currentState"] == "memory_candidate_review"
        assert data["resolution"] == "refresh_candidate"
        assert data["session"]["events"][0]["type"] == "memory_decision_rejected"


def test_runtime_rejects_already_decided_candidate_without_success_event(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        feedback = save_feedback(
            {
                "input": "周末想轻松玩",
                "userCorrection": "不要安排太赶，优先轻松一点",
                "failureType": "user_correction",
            },
            db_path,
        )
        candidate_id = feedback["candidate"]["id"]
        client = client_with_settings(monkeypatch, db_path)
        client.post("/api/memory-candidates/{}/decision".format(candidate_id), json={"action": "ignore"})

        response = client.post(
            "/api/runtime",
            json={"input": "周末想轻松玩", "memoryDecision": {"candidateId": candidate_id, "action": "adopt"}},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is False
        assert data["status"] == "memory_decision_rejected"
        assert data["error"] == "candidate_already_decided"
        assert data["session"]["events"][0]["type"] == "memory_decision_rejected"


def test_runtime_feedback_payload_cannot_override_session_input(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        client = client_with_settings(monkeypatch, db_path)

        response = client.post(
            "/api/runtime",
            json={"input": "外层输入", "feedback": {"input": "冲突输入", "userCorrection": "偏好轻松"}},
        )

        assert response.status_code == 422


def test_intent_and_health_report_unavailable_sqlite_without_500(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "database_is_a_directory"
        db_path.mkdir()
        client = client_with_settings(monkeypatch, db_path)

        intent = client.post("/api/intent", json={"input": "周末想轻松玩"})
        health = client.get("/api/health")

        assert intent.status_code == 200
        assert intent.json()["source"] == "sqlite_unavailable"
        assert intent.json()["error"] == "storage_unavailable"
        assert intent.json()["lessonsUsed"] == []
        assert health.status_code == 200
        assert health.json()["sqliteAvailable"] is False


def test_server_import_succeeds_when_configured_sqlite_path_is_unopenable():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "database_is_a_directory"
        db_path.mkdir()
        env = dict(os.environ)
        env["AGENT_MEMORY_DB"] = str(db_path)

        result = subprocess.run(
            [sys.executable, "-c", "import server; print('started')"],
            cwd=Path(__file__).parent,
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )

        assert result.returncode == 0, result.stderr
        assert "started" in result.stdout


def test_direct_feedback_and_decision_return_503_when_sqlite_is_unavailable(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "database_is_a_directory"
        db_path.mkdir()
        client = client_with_settings(monkeypatch, db_path)

        feedback = client.post(
            "/api/feedback",
            json={"input": "周末想轻松玩", "userCorrection": "偏好轻松", "failureType": "user_correction"},
        )
        decision = client.post("/api/memory-candidates/1/decision", json={"action": "adopt"})

        assert feedback.status_code == 503
        assert decision.status_code == 503
        assert feedback.json() == {"ok": False, "error": "storage_unavailable", "recoverable": True}
        assert decision.json() == feedback.json()


def test_audit_failure_does_not_turn_committed_api_operations_into_500(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        client = client_with_settings(monkeypatch, db_path)

        def fail_audit(_event):
            raise OSError("audit unavailable")

        monkeypatch.setattr(backend_core, "_append_audit", fail_audit)

        feedback = client.post(
            "/api/feedback",
            json={"input": "周末想轻松玩", "userCorrection": "偏好轻松", "failureType": "user_correction"},
        )
        candidate_id = feedback.json()["candidate"]["id"]
        decision = client.post(f"/api/memory-candidates/{candidate_id}/decision", json={"action": "adopt"})
        runtime_feedback = client.post(
            "/api/runtime",
            json={"input": "周末想轻松玩", "feedback": {"userCorrection": "偏好轻松"}},
        )

        assert feedback.status_code == 200
        assert decision.status_code == 200
        assert runtime_feedback.status_code == 200
        assert feedback.json()["ok"] is True
        assert decision.json()["ok"] is True
        assert runtime_feedback.json()["status"] == "feedback_captured"
        conn = sqlite3.connect(db_path)
        try:
            assert conn.execute("SELECT COUNT(*) FROM feedback_events").fetchone()[0] == 2
            assert conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0] == 1
        finally:
            conn.close()


def test_runtime_preserves_operation_context_when_sqlite_is_unavailable(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "database_is_a_directory"
        db_path.mkdir()
        client = client_with_settings(monkeypatch, db_path)

        intent = client.post("/api/runtime", json={"input": "周末想轻松玩"})
        feedback = client.post(
            "/api/runtime",
            json={"input": "周末想轻松玩", "feedback": {"userCorrection": "偏好轻松"}},
        )
        decision = client.post(
            "/api/runtime",
            json={"input": "周末想轻松玩", "memoryDecision": {"candidateId": 1, "action": "adopt"}},
        )

        assert intent.json()["status"] == "recoverable_failure"
        assert intent.json()["currentState"] == "failed_recoverable"
        assert feedback.json()["status"] == "operation_recoverable_failure"
        assert feedback.json()["operation"] == "feedback"
        assert feedback.json()["currentState"] == "feedback_capture"
        assert feedback.json()["allowedNextStates"] == ["feedback_capture"]
        assert decision.json()["status"] == "operation_recoverable_failure"
        assert decision.json()["operation"] == "memory_decision"
        assert decision.json()["currentState"] == "memory_candidate_review"
        assert decision.json()["allowedNextStates"] == ["memory_candidate_review"]


def runtime_tables(db_path):
    conn = sqlite3.connect(db_path)
    try:
        return {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
    finally:
        conn.close()


def test_runtime_migration_creates_independent_tables_and_is_idempotent():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)

        migrate_runtime(db_path)
        migrate_runtime(db_path)

        tables = runtime_tables(db_path)
        assert {
            "runtime_sessions",
            "runtime_events",
            "runtime_recovery_points",
            "runtime_schema_migrations",
        }.issubset(tables)
        assert {"feedback_events", "memory_candidates", "memories"}.issubset(tables)


def test_runtime_adapter_persists_session_event_stream_and_recovery_point():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        adapter = RuntimeAdapter(db_path)

        created = adapter.create_session(
            input_text="plan weekend",
            overrides={"pace": "relaxed"},
            idempotency_key="create-1",
        )
        session_id = created.session.sessionId
        assert created.session.runtimeState == "intent_loading"
        assert created.session.version == 1
        assert created.session.lastEventId is not None

        submitted = adapter.submit_event(
            session_id=session_id,
            event_type="intent_loaded",
            expected_version=1,
            idempotency_key="event-1",
            actor="test",
            trace_id="trace-1",
            payload={"summary": "intent parsed"},
        )
        assert submitted.session.runtimeState == "planning_local"
        assert submitted.session.version == 2
        assert submitted.event.sequence == 2
        assert submitted.event.runtimeTransition == {
            "fromState": "intent_loading",
            "eventType": "intent_loaded",
            "toState": "planning_local",
        }

        point = adapter.create_recovery_point(
            session_id=session_id,
            expected_version=2,
            idempotency_key="recovery-1",
            snapshot={"summary": "stable plan"},
            actor="test",
            trace_id="trace-2",
        )
        assert point.recoveryPoint.sessionId == session_id
        assert point.session.latestRecoveryPointId == point.recoveryPoint.recoveryPointId

        second_point = adapter.create_recovery_point(
            session_id=session_id,
            expected_version=3,
            idempotency_key="recovery-2",
            snapshot={"summary": "new stable plan"},
            actor="test",
            trace_id="trace-3",
        )
        assert second_point.recoveryPoint.recoveryPointId != point.recoveryPoint.recoveryPointId
        assert second_point.session.latestRecoveryPointId == second_point.recoveryPoint.recoveryPointId
        assert RuntimeAdapter(db_path).get_session(session_id).version == 4

        events = adapter.list_events(session_id=session_id)
        assert [event.type for event in events] == [
            "session_created",
            "intent_loaded",
            "recovery_point_created",
            "recovery_point_created",
        ]
        assert [event.sequence for event in events] == [1, 2, 3, 4]

        with pytest.raises(Exception) as rollback_error:
            adapter.rollback_to_recovery_point(
                session_id=session_id,
                recovery_point_id=second_point.recoveryPoint.recoveryPointId,
                expected_version=4,
                idempotency_key="rollback-1",
            )
        assert getattr(rollback_error.value, "code", None) == "rollback_not_supported"


def test_runtime_adapter_duplicate_idempotency_returns_existing_event_without_rewrite():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        adapter = RuntimeAdapter(db_path)
        created = adapter.create_session(input_text="plan", overrides={}, idempotency_key="create-dup")

        first = adapter.submit_event(
            session_id=created.session.sessionId,
            event_type="intent_loaded",
            expected_version=1,
            idempotency_key="same-event",
            actor="test",
            trace_id="trace-1",
        )
        duplicate = adapter.submit_event(
            session_id=created.session.sessionId,
            event_type="intent_loaded",
            expected_version=1,
            idempotency_key="same-event",
            actor="test",
            trace_id="trace-1",
        )

        assert duplicate.duplicate is True
        assert duplicate.event.eventId == first.event.eventId
        assert len(adapter.list_events(session_id=created.session.sessionId)) == 2


def test_runtime_adapter_rejects_version_conflict_invalid_transition_and_paused_write():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        adapter = RuntimeAdapter(db_path)
        created = adapter.create_session(input_text="plan", overrides={}, idempotency_key="create-conflict")
        session_id = created.session.sessionId

        stale = adapter.submit_event(
            session_id=session_id,
            event_type="intent_loaded",
            expected_version=1,
            idempotency_key="event-ok",
            actor="test",
            trace_id="trace-1",
        )
        assert stale.session.version == 2

        with pytest.raises(Exception) as version_error:
            adapter.submit_event(
                session_id=session_id,
                event_type="planning_completed",
                expected_version=1,
                idempotency_key="event-stale",
                actor="test",
                trace_id="trace-2",
            )
        assert getattr(version_error.value, "code", None) == "version_conflict"

        with pytest.raises(Exception) as transition_error:
            adapter.submit_event(
                session_id=session_id,
                event_type="memory_committed",
                expected_version=2,
                idempotency_key="event-invalid",
                actor="test",
                trace_id="trace-3",
            )
        assert getattr(transition_error.value, "code", None) == "invalid_transition"

        paused = adapter.pause_session(
            session_id=session_id,
            expected_version=2,
            idempotency_key="pause-1",
            actor="test",
            trace_id="trace-4",
        )
        assert paused.session.lifecycleStatus == "paused"
        with pytest.raises(Exception) as paused_error:
            adapter.submit_event(
                session_id=session_id,
                event_type="planning_completed",
                expected_version=3,
                idempotency_key="event-paused",
                actor="test",
                trace_id="trace-5",
            )
        assert getattr(paused_error.value, "code", None) == "session_paused"


def test_runtime_adapter_rejects_disallowed_payload_without_partial_write():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        adapter = RuntimeAdapter(db_path)
        created = adapter.create_session(input_text="plan", overrides={}, idempotency_key="create-payload")
        session_id = created.session.sessionId

        with pytest.raises(Exception) as payload_error:
            adapter.submit_event(
                session_id=session_id,
                event_type="intent_loaded",
                expected_version=1,
                idempotency_key="bad-payload",
                actor="test",
                trace_id="trace-bad-payload",
                payload={"uiCard": {"title": "must not enter Runtime"}},
            )

        assert getattr(payload_error.value, "code", None) == "invalid_transition"
        assert adapter.get_session(session_id).version == 1
        assert [event.type for event in adapter.list_events(session_id=session_id)] == ["session_created"]


def test_runtime_session_routes_and_capabilities(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        client = client_with_settings(monkeypatch, db_path)

        created = client.post(
            "/api/runtime/sessions",
            json={"input": "plan weekend", "overrides": {}, "idempotencyKey": "route-create"},
        )
        assert created.status_code == 200
        created_data = created.json()
        session_id = created_data["session"]["sessionId"]
        assert created_data["session"]["runtimeState"] == "intent_loading"

        submitted = client.post(
            f"/api/runtime/sessions/{session_id}/events",
            json={
                "eventType": "intent_loaded",
                "expectedVersion": 1,
                "idempotencyKey": "route-event",
                "actor": "test",
                "traceId": "route-trace",
                "payload": {"summary": "intent parsed"},
            },
        )
        assert submitted.status_code == 200
        assert submitted.json()["session"]["runtimeState"] == "planning_local"

        conflict = client.post(
            f"/api/runtime/sessions/{session_id}/events",
            json={
                "eventType": "planning_completed",
                "expectedVersion": 1,
                "idempotencyKey": "route-stale",
                "actor": "test",
            },
        )
        assert conflict.status_code == 409
        assert conflict.json()["error"] == "version_conflict"

        listed = client.get(f"/api/runtime/sessions/{session_id}/events")
        assert listed.status_code == 200
        assert [event["type"] for event in listed.json()["events"]] == ["session_created", "intent_loaded"]

        capabilities = client.get("/api/runtime/capabilities")
        assert capabilities.status_code == 200
        by_name = {item["name"]: item["availability"] for item in capabilities.json()["effectiveCapabilities"]}
        assert by_name["runtime_adapter"] == "available"
        assert by_name["capability_query"] == "available"
        assert by_name["rollback_primitive"] == "degraded"
        assert by_name["task_replay"] == "unavailable"


def test_runtime_session_routes_do_not_change_legacy_runtime(monkeypatch):
    async def fake_intent(input_text, overrides, current):
        return {
            "ok": True,
            "source": "llm",
            "runtimePath": "direct_llm",
            "intent": complete_intent(),
            "lessonsUsed": [],
        }

    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        monkeypatch.setattr(server, "resolve_intent_response", fake_intent)
        client = client_with_settings(monkeypatch, db_path, api_key="test-key")

        client.post("/api/runtime/sessions", json={"input": "new", "idempotencyKey": "new-route"})
        legacy = client.post("/api/runtime", json={"input": "legacy"})

        assert legacy.status_code == 200
        data = legacy.json()
        assert data["status"] == "planning_ready"
        assert data["session"]["currentState"] == "planning_local"
        assert "runtimeState" not in data["session"]
