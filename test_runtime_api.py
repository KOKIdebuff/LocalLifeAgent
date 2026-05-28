import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

import server
import backend_core
from backend_core import init_db, save_feedback


TEST_TMP_ROOT = Path(__file__).parent / ".pytest_tmp"


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
