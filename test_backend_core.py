import tempfile
from pathlib import Path

from backend_core import (
    build_chat_payload,
    decide_memory_candidate,
    extract_json_object,
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
