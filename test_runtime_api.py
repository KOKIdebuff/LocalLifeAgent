import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

import server
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
