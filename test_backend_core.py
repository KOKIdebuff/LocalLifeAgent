import json
import tempfile
import sqlite3
from pathlib import Path

import pytest

import backend_core
from backend_core import (
    build_chat_payload,
    classify_sensitivity,
    decide_memory_candidate,
    extract_json_object,
    get_memory_candidate,
    init_db,
    load_relevant_lessons,
    save_feedback,
    validate_intent,
)
from server import intent_error_response


TEST_TMP_ROOT = Path(__file__).parent / ".pytest_tmp"


def temp_dir():
    TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=TEST_TMP_ROOT)


def test_validate_intent_normalizes_fields():
    intent = validate_intent(
        {
            "groupType": "familyKids",
            "timePreset": "周末下午",
            "partySize": "3",
            "preferences": ["near", "relaxed", "bad"],
            "budgetPerPerson": 120,
            "childAge": 5,
            "missingFields": [],
            "confidence": 1.4,
            "reasoningSummary": "亲子家庭，近距离轻松活动。",
        }
    )
    assert intent["groupType"] == "familyKids"
    assert intent["timePreset"] == "周末下午"
    assert intent["partySize"] == 3
    assert intent["preferences"] == ["near", "relaxed"]
    assert intent["confidence"] == 1.0


def test_validate_intent_marks_missing_required_fields():
    intent = validate_intent({"groupType": "unknown", "timePreset": "unknown", "confidence": 0.4})
    assert intent["missingFields"] == ["groupType", "timePreset"]


def test_extract_json_object_accepts_wrapped_text():
    payload = extract_json_object('结果如下：{"groupType":"friends","confidence":0.8}')
    assert payload["groupType"] == "friends"


def test_feedback_creates_lesson_and_retrieves_relevant_memory():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        init_db(db_path)
        result = save_feedback(
            {
                "input": "周末想带孩子轻松玩一下",
                "userCorrection": "不是亲子，是和女朋友约会",
                "failureType": "wrong_group",
            },
            db_path,
        )
        assert result["ok"] is True
        assert result["candidate"]["status"] == "pending"
        decision = decide_memory_candidate(result["candidate"]["id"], "adopt", db_path=db_path)
        assert decision["ok"] is True
        lessons = load_relevant_lessons("周末和女朋友约会，轻松一点", db_path)
        assert lessons
        assert "用户反馈" in lessons[0]["lesson"] or "用户偏好" in lessons[0]["lesson"]


def test_high_sensitive_feedback_does_not_create_candidate():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        result = save_feedback(
            {
                "input": "记住我的手机号 13800000000",
                "userCorrection": "我的手机号是 13800000000",
                "failureType": "sensitive",
            },
            db_path,
        )
        assert result["ok"] is True
        assert result["candidate"] is None


@pytest.mark.parametrize(
    ("corrected_value", "expected_level"),
    [
        ("我的手机号是 13800000000", "L2"),
        ("我的银行卡是 6222020000000000", "L2"),
        ("我的支付密码是 123456", "L3"),
    ],
)
def test_sensitive_candidate_correction_is_rejected_and_keeps_candidate_pending(corrected_value, expected_level):
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

        result = decide_memory_candidate(feedback["candidate"]["id"], "correct", corrected_value, db_path)

        assert result["ok"] is False
        assert result["error"] == "sensitive_correction_blocked"
        assert result["sensitivityLevel"] == expected_level
        assert result["candidateId"] == feedback["candidate"]["id"]
        assert result["candidateStatus"] == "pending"
        assert "candidate" not in result
        assert get_memory_candidate(feedback["candidate"]["id"], db_path)["status"] == "pending"
        conn = sqlite3.connect(db_path)
        try:
            assert conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0] == 0
        finally:
            conn.close()


def test_safe_candidate_correction_rebuilds_candidate_and_memory_consistently():
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

        result = decide_memory_candidate(feedback["candidate"]["id"], "correct", "以后优先地铁，少换乘", db_path)
        candidate = get_memory_candidate(feedback["candidate"]["id"], db_path)

        assert result["ok"] is True
        assert result["status"] == "adopted"
        assert candidate["status"] == "adopted"
        assert candidate["key"] == "transport"
        assert candidate["key"] == result["memory"]["key"]
        assert candidate["value"] == result["memory"]["value"]
        assert candidate["sensitivityLevel"] == result["memory"]["sensitivityLevel"]


def test_blank_candidate_correction_is_rejected_without_state_change():
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

        result = decide_memory_candidate(feedback["candidate"]["id"], "correct", "  ", db_path)

        assert result["ok"] is False
        assert result["error"] == "correction_required"
        assert result["candidateStatus"] == "pending"
        assert "candidate" not in result
        assert get_memory_candidate(feedback["candidate"]["id"], db_path)["status"] == "pending"


def test_adopt_rechecks_legacy_sensitive_candidate_before_long_term_write():
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
                ("我的支付密码是 123456", json.dumps(["我的支付密码是 123456"], ensure_ascii=False), "L0", candidate_id),
            )
            conn.commit()
        finally:
            conn.close()

        result = decide_memory_candidate(candidate_id, "adopt", db_path=db_path)

        assert result["ok"] is False
        assert result["error"] == "sensitive_candidate_blocked"
        assert result["sensitivityLevel"] == "L3"
        assert "candidate" not in result
        assert get_memory_candidate(candidate_id, db_path)["status"] == "pending"


@pytest.mark.parametrize(
    "corrected_value",
    [
        "reach me at 13800000000",
        "以后订位使用美团授权码 AUTH-ZX9Q",
        "use access_token abc123 for booking",
    ],
)
def test_long_term_memory_gate_blocks_unlabeled_contact_and_authorization_data(corrected_value):
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

        result = decide_memory_candidate(feedback["candidate"]["id"], "correct", corrected_value, db_path)
        result_text = json.dumps(result, ensure_ascii=False)

        assert result["ok"] is False
        assert result["error"] == "sensitive_correction_blocked"
        assert result["candidateStatus"] == "pending"
        assert "candidate" not in result
        assert corrected_value not in result_text
        conn = sqlite3.connect(db_path)
        try:
            assert conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0] == 0
        finally:
            conn.close()


def test_adopt_rechecks_all_legacy_candidate_fields_before_long_term_write():
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
                "UPDATE memory_candidates SET key = ?, scope = ?, value = ?, evidence_json = ?, sensitivity_level = ? WHERE id = ?",
                (
                    "支付密码=123456",
                    "global",
                    "用户偏好：轻松安排",
                    json.dumps(["用户偏好：轻松安排"], ensure_ascii=False),
                    "L0",
                    candidate_id,
                ),
            )
            conn.commit()
        finally:
            conn.close()

        result = decide_memory_candidate(candidate_id, "adopt", db_path=db_path)

        assert result["ok"] is False
        assert result["error"] == "sensitive_candidate_blocked"
        assert result["candidateStatus"] == "pending"
        assert "candidate" not in result
        conn = sqlite3.connect(db_path)
        try:
            assert conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0] == 0
        finally:
            conn.close()


def test_audit_failure_does_not_override_committed_feedback_or_decision(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"

        def fail_audit(_event):
            raise OSError("audit unavailable")

        monkeypatch.setattr(backend_core, "_append_audit", fail_audit)

        feedback = save_feedback(
            {
                "input": "周末想轻松玩",
                "userCorrection": "不要安排太赶，优先轻松一点",
                "failureType": "user_correction",
            },
            db_path,
        )
        decision = decide_memory_candidate(feedback["candidate"]["id"], "adopt", db_path=db_path)

        assert feedback["ok"] is True
        assert decision["ok"] is True
        conn = sqlite3.connect(db_path)
        try:
            assert conn.execute("SELECT COUNT(*) FROM feedback_events").fetchone()[0] == 1
            assert conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0] == 1
        finally:
            conn.close()


def test_payment_password_has_highest_sensitivity_level():
    assert classify_sensitivity("我的支付密码是 123456") == "L3"
    assert classify_sensitivity("reach me at 13800000000") == "L2"
    assert classify_sensitivity("以后订位使用美团授权码 AUTH-ZX9Q") == "L2"


def test_build_chat_payload_includes_lessons():
    payload = build_chat_payload(
        "周末想出去",
        lessons=[{"lesson": "不要把轻松自动推断为亲子。", "avoidance": "缺少人群时追问。"}],
        model="demo-model",
    )
    assert payload["model"] == "demo-model"
    assert "不要把轻松自动推断为亲子" in payload["messages"][0]["content"]


def test_intent_error_response_uses_shared_shape():
    response = intent_error_response("llm_error", "boom", [], "direct_llm")

    assert response == {
        "ok": False,
        "source": "llm_error",
        "runtimePath": "direct_llm",
        "intent": None,
        "error": "boom",
        "lessonsUsed": [],
    }
