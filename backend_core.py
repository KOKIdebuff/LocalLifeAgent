import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


GROUP_TYPES = {"familyKids", "familyElders", "couple", "friends", "coworkers", "solo", "unknown"}
TIME_PRESETS = {"今天下午", "今天晚上", "周末下午", "unknown"}
PREFERENCES = {
    "near",
    "relaxed",
    "healthy",
    "noQueue",
    "photo",
    "indoor",
    "outdoor",
    "meal",
    "budget",
}

DEFAULT_DB_PATH = Path("memory") / "agent_memory.sqlite"
DEFAULT_AUDIT_PATH = Path("memory") / "audit.jsonl"

KEY_TERMS = [
    "孩子",
    "亲子",
    "老婆",
    "老公",
    "女朋友",
    "男朋友",
    "对象",
    "约会",
    "爸妈",
    "父母",
    "老人",
    "朋友",
    "同事",
    "自己",
    "附近",
    "别太远",
    "轻松",
    "减肥",
    "健康",
    "少排队",
    "室内",
    "户外",
    "预算",
    "吃饭",
]


def get_settings():
    return {
        "base_url": os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        "api_key": os.environ.get("OPENAI_API_KEY", ""),
        "model": os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
        "timeout_seconds": _to_float(os.environ.get("LLM_TIMEOUT_SECONDS"), 8.0),
        "confidence_threshold": _to_float(os.environ.get("LLM_CONFIDENCE_THRESHOLD"), 0.72),
        "db_path": Path(os.environ.get("AGENT_MEMORY_DB", str(DEFAULT_DB_PATH))),
    }


def init_db(db_path=DEFAULT_DB_PATH):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS feedback_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              input_text TEXT NOT NULL,
              llm_intent_json TEXT,
              user_correction TEXT,
              failure_type TEXT,
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS memory_candidates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              feedback_id INTEGER,
              type TEXT NOT NULL,
              key TEXT NOT NULL,
              value TEXT NOT NULL,
              confidence REAL NOT NULL,
              evidence_json TEXT NOT NULL,
              scope TEXT NOT NULL,
              sensitivity_level TEXT NOT NULL,
              source TEXT NOT NULL,
              status TEXT NOT NULL,
              reason TEXT,
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS memories (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              candidate_id INTEGER,
              type TEXT NOT NULL,
              key TEXT NOT NULL,
              value TEXT NOT NULL,
              confidence REAL NOT NULL,
              evidence_json TEXT NOT NULL,
              scope TEXT NOT NULL,
              sensitivity_level TEXT NOT NULL,
              source TEXT NOT NULL,
              status TEXT NOT NULL,
              search_text TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              last_seen TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS memory_usage_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              input_text TEXT NOT NULL,
              memory_ids_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def validate_intent(raw):
    data = raw if isinstance(raw, dict) else {}
    intent = data.get("intent") if isinstance(data.get("intent"), dict) else data

    group_type = intent.get("groupType")
    if group_type not in GROUP_TYPES:
        group_type = "unknown"

    time_preset = intent.get("timePreset")
    if time_preset not in TIME_PRESETS:
        time_preset = "unknown"

    preferences = []
    for item in intent.get("preferences") or []:
        if item in PREFERENCES and item not in preferences:
            preferences.append(item)

    missing_fields = []
    for item in intent.get("missingFields") or []:
        if item in {"groupType", "timePreset"} and item not in missing_fields:
            missing_fields.append(item)
    if group_type == "unknown" and "groupType" not in missing_fields:
        missing_fields.append("groupType")
    if time_preset == "unknown" and "timePreset" not in missing_fields:
        missing_fields.append("timePreset")

    return {
        "groupType": group_type,
        "timePreset": time_preset,
        "partySize": _nullable_int(intent.get("partySize"), 1, 12),
        "preferences": preferences,
        "budgetPerPerson": _nullable_int(intent.get("budgetPerPerson"), 20, 1000),
        "childAge": _nullable_int(intent.get("childAge"), 0, 16),
        "missingFields": missing_fields,
        "confidence": _clamp(_to_float(intent.get("confidence"), 0.0), 0.0, 1.0),
        "reasoningSummary": _trim_text(intent.get("reasoningSummary"), 180),
    }


def build_chat_payload(user_input, overrides=None, lessons=None, model="gpt-4.1-mini"):
    lessons = lessons or []
    overrides = overrides or {}
    lesson_text = "\n".join(
        "- " + item.get("lesson", "") + " 避免策略：" + item.get("avoidance", "")
        for item in lessons[:5]
    ) or "无"
    system_prompt = (
        "你是本地生活 Agent 的意图识别器。只返回 JSON，不要 Markdown。\n"
        "任务：把用户中文自然语言转成结构化 intent。不要编造未知信息。\n"
        "groupType 只能是 familyKids, familyElders, couple, friends, coworkers, solo, unknown。\n"
        "timePreset 只能是 今天下午, 今天晚上, 周末下午, unknown。\n"
        "preferences 只能包含 near, relaxed, healthy, noQueue, photo, indoor, outdoor, meal, budget。\n"
        "缺少同行关系或时间时，把字段设为 unknown，并放入 missingFields。\n"
        "输出字段：groupType, timePreset, partySize, preferences, budgetPerPerson, childAge, "
        "missingFields, confidence, reasoningSummary。\n"
        "历史经验：\n" + lesson_text
    )
    user_prompt = {
        "input": user_input,
        "overrides": overrides,
        "requiredOutput": {
            "groupType": "familyKids | familyElders | couple | friends | coworkers | solo | unknown",
            "timePreset": "今天下午 | 今天晚上 | 周末下午 | unknown",
            "partySize": "number or null",
            "preferences": ["near", "relaxed"],
            "budgetPerPerson": "number or null",
            "childAge": "number or null",
            "missingFields": ["groupType", "timePreset"],
            "confidence": "0..1",
            "reasoningSummary": "short Chinese summary",
        },
    }
    return {
        "model": model,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
    }


def extract_json_object(text):
    if not text:
        raise ValueError("empty model response")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def load_relevant_lessons(user_input, db_path=DEFAULT_DB_PATH, limit=5):
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT id, type, key, value, confidence, evidence_json, scope, sensitivity_level, source, search_text, created_at, last_seen
            FROM memories
            WHERE status = 'active'
            ORDER BY updated_at DESC, id DESC
            LIMIT 30
            """
        ).fetchall()
    finally:
        conn.close()

    scored = []
    for row in rows:
        text = row["search_text"]
        score = _match_score(user_input, text)
        if score > 0:
            scored.append((score, row))
    scored.sort(key=lambda item: (-item[0], -item[1]["id"]))
    lessons = [_row_to_memory(row) for _, row in scored[:limit]]
    if lessons:
        _record_memory_usage(user_input, [item["id"] for item in lessons], db_path)
    return lessons


def save_feedback(payload, db_path=DEFAULT_DB_PATH):
    init_db(db_path)
    input_text = _trim_text(payload.get("input"), 500) or ""
    user_correction = _trim_text(payload.get("userCorrection"), 500)
    failure_type = _trim_text(payload.get("failureType"), 80) or "general"
    llm_intent = payload.get("llmIntent")
    llm_intent_json = json.dumps(llm_intent, ensure_ascii=False) if llm_intent is not None else None
    created_at = _now()

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute(
            """
            INSERT INTO feedback_events
              (input_text, llm_intent_json, user_correction, failure_type, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (input_text, llm_intent_json, user_correction, failure_type, created_at),
        )
        feedback_id = cur.lastrowid
        candidate = build_memory_candidate(input_text, user_correction, failure_type)
        candidate_id = None
        if candidate and candidate["sensitivityLevel"] in {"L0", "L1"}:
            candidate_cur = conn.execute(
                """
                INSERT INTO memory_candidates
                  (feedback_id, type, key, value, confidence, evidence_json, scope, sensitivity_level, source, status, reason, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    feedback_id,
                    candidate["type"],
                    candidate["key"],
                    candidate["value"],
                    candidate["confidence"],
                    json.dumps(candidate["evidence"], ensure_ascii=False),
                    candidate["scope"],
                    candidate["sensitivityLevel"],
                    candidate["source"],
                    "pending",
                    candidate["reason"],
                    created_at,
                ),
            )
            candidate_id = candidate_cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    _append_audit(
        {
            "event": "feedback_received",
            "feedbackId": feedback_id,
            "candidateId": candidate_id,
            "blockedReason": None if candidate_id else "sensitive_or_not_actionable",
            "createdAt": created_at,
        }
    )

    return {
        "ok": True,
        "feedbackId": feedback_id,
        "candidate": get_memory_candidate(candidate_id, db_path) if candidate_id else None,
        "message": "已生成待确认记忆候选。" if candidate_id else "反馈已记录，但因敏感或不可复用，未生成长期记忆候选。",
    }


def build_memory_candidate(input_text, user_correction, failure_type):
    text = user_correction or input_text or ""
    if not text.strip():
        return None
    sensitivity = classify_sensitivity(text)
    memory_type = classify_memory_type(text, failure_type)
    if sensitivity in {"L2", "L3"}:
        return {
            "type": memory_type,
            "key": "blocked_sensitive_memory",
            "value": "该反馈包含高敏感信息，默认不进入长期记忆。",
            "confidence": 0.0,
            "evidence": [text[:160]],
            "scope": "blocked",
            "sensitivityLevel": sensitivity,
            "source": "explicit_feedback",
            "reason": "高敏感信息默认不长期保存。",
        }
    value = abstract_memory_value(text, memory_type, sensitivity)
    return {
        "type": memory_type,
        "key": infer_memory_key(text, memory_type),
        "value": value,
        "confidence": 0.86 if user_correction else 0.62,
        "evidence": [text[:220]],
        "scope": infer_scope(text, memory_type),
        "sensitivityLevel": sensitivity,
        "source": "explicit_feedback" if user_correction else "inferred_from_feedback",
        "reason": "用户明确反馈，适合进入候选记忆。" if user_correction else "从反馈日志提取，需用户确认。",
    }


def classify_sensitivity(text):
    if re.search(r"\b\d{17}[\dXx]\b|护照|身份证|手机号|电话|订单号|酒店订单|支付|银行卡", text):
        return "L2"
    if re.search(r"具体住址|住址|生日|孩子叫|护照号|航班票据", text):
        return "L2"
    if re.search(r"疾病|残障|宗教|政治|精确位置|实时位置|支付密码|医保", text):
        return "L3"
    if re.search(r"预算|孩子|安静|上海|出发|减肥|低卡|家人", text):
        return "L1"
    return "L0"


def classify_memory_type(text, failure_type):
    if re.search(r"不要|不喜欢|别再|避免|太赶|太累|排队|换乘|满座", text):
        return "negative_preference"
    if failure_type and "skill" in failure_type:
        return "planning_skill"
    if re.search(r"策略|应该|下次规划|安排时", text):
        return "planning_skill"
    if re.search(r"这次|本次|最终方案|上次", text):
        return "episode_memory"
    return "user_preference"


def infer_memory_key(text, memory_type):
    if re.search(r"太赶|太满|慢|轻松|节奏", text):
        return "pace"
    if re.search(r"排队|等位", text):
        return "queue_tolerance"
    if re.search(r"预算|贵|便宜|性价比", text):
        return "budget"
    if re.search(r"孩子|亲子", text):
        return "family_kids"
    if re.search(r"换乘|交通|地铁|打车", text):
        return "transport"
    if memory_type == "planning_skill":
        return "planning_strategy"
    return "general_preference"


def infer_scope(text, memory_type):
    if memory_type == "planning_skill":
        return "system"
    if re.search(r"孩子|亲子", text):
        return "family_context"
    if re.search(r"城市|商圈|本地|周末|附近", text):
        return "local_life"
    return "global"


def abstract_memory_value(text, memory_type, sensitivity):
    base = text.strip()
    base = re.sub(r"\b\d{11}\b", "[手机号已省略]", base)
    base = re.sub(r"\b\d{17}[\dXx]\b", "[身份证号已省略]", base)
    if sensitivity == "L1":
        base = base.replace("孩子 5 岁", "带孩子场景").replace("孩子5岁", "带孩子场景")
    if memory_type == "negative_preference":
        return "用户反馈应避免类似安排：" + base
    if memory_type == "planning_skill":
        return "规划策略经验：" + base
    if memory_type == "episode_memory":
        return "单次服务包复盘：" + base
    return "用户偏好：" + base


def get_memory_candidate(candidate_id, db_path=DEFAULT_DB_PATH):
    if not candidate_id:
        return None
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            """
            SELECT id, feedback_id, type, key, value, confidence, evidence_json, scope,
                   sensitivity_level, source, status, reason, created_at
            FROM memory_candidates
            WHERE id = ?
            """,
            (candidate_id,),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_candidate(row) if row else None


def decide_memory_candidate(candidate_id, action, corrected_value=None, db_path=DEFAULT_DB_PATH):
    init_db(db_path)
    candidate = get_memory_candidate(candidate_id, db_path)
    if not candidate:
        return {"ok": False, "error": "candidate_not_found"}
    if candidate["status"] != "pending":
        return {"ok": False, "error": "candidate_already_decided", "candidate": candidate}
    if action not in {"adopt", "ignore", "correct"}:
        return {"ok": False, "error": "invalid_action"}

    now = _now()
    new_status = "adopted" if action in {"adopt", "correct"} else "ignored"
    value = corrected_value.strip() if corrected_value and action == "correct" else candidate["value"]
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("UPDATE memory_candidates SET status = ? WHERE id = ?", (new_status, candidate_id))
        memory_id = None
        if new_status == "adopted":
            search_text = " ".join([candidate["type"], candidate["key"], value, candidate["scope"]])
            cur = conn.execute(
                """
                INSERT INTO memories
                  (candidate_id, type, key, value, confidence, evidence_json, scope, sensitivity_level, source,
                   status, search_text, created_at, updated_at, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    candidate_id,
                    candidate["type"],
                    candidate["key"],
                    value,
                    candidate["confidence"],
                    json.dumps(candidate["evidence"], ensure_ascii=False),
                    candidate["scope"],
                    candidate["sensitivityLevel"],
                    candidate["source"],
                    "active",
                    search_text,
                    now,
                    now,
                    now,
                ),
            )
            memory_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    _append_audit({"event": "candidate_decided", "candidateId": candidate_id, "action": action, "memoryId": memory_id, "createdAt": now})
    return {
        "ok": True,
        "candidateId": candidate_id,
        "status": new_status,
        "memoryId": memory_id,
        "memory": get_memory(memory_id, db_path) if memory_id else None,
    }


def get_memory(memory_id, db_path=DEFAULT_DB_PATH):
    if not memory_id:
        return None
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            """
            SELECT id, type, key, value, confidence, evidence_json, scope, sensitivity_level, source, created_at, last_seen
            FROM memories
            WHERE id = ?
            """,
            (memory_id,),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_memory(row) if row else None


def sqlite_available(db_path=DEFAULT_DB_PATH):
    try:
        init_db(db_path)
        return True
    except sqlite3.Error:
        return False


def _row_to_memory(row):
    evidence = json.loads(row["evidence_json"]) if "evidence_json" in row.keys() and row["evidence_json"] else []
    return {
        "id": row["id"],
        "type": row["type"],
        "key": row["key"],
        "value": row["value"],
        "lesson": row["value"],
        "avoidance": "当前需求优先；若不确定，先追问用户确认。",
        "confidence": row["confidence"],
        "evidence": evidence,
        "scope": row["scope"],
        "sensitivityLevel": row["sensitivity_level"],
        "source": row["source"],
        "createdAt": row["created_at"],
        "lastSeen": row["last_seen"] if "last_seen" in row.keys() else row["created_at"],
    }


def _row_to_candidate(row):
    return {
        "id": row["id"],
        "feedbackId": row["feedback_id"],
        "type": row["type"],
        "key": row["key"],
        "value": row["value"],
        "confidence": row["confidence"],
        "evidence": json.loads(row["evidence_json"] or "[]"),
        "scope": row["scope"],
        "sensitivityLevel": row["sensitivity_level"],
        "source": row["source"],
        "status": row["status"],
        "reason": row["reason"],
        "createdAt": row["created_at"],
    }


def _record_memory_usage(user_input, memory_ids, db_path):
    init_db(db_path)
    now = _now()
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO memory_usage_events (input_text, memory_ids_json, created_at)
            VALUES (?, ?, ?)
            """,
            (user_input, json.dumps(memory_ids), now),
        )
        conn.commit()
    finally:
        conn.close()
    _append_audit({"event": "memory_retrieved", "memoryIds": memory_ids, "createdAt": now})


def _append_audit(event, audit_path=DEFAULT_AUDIT_PATH):
    path = Path(audit_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")


def _match_score(user_input, lesson_text):
    score = 0
    for term in KEY_TERMS:
        if term in user_input and term in lesson_text:
            score += 2
    input_words = set(re.findall(r"[A-Za-z0-9_]+", user_input.lower()))
    lesson_words = set(re.findall(r"[A-Za-z0-9_]+", lesson_text.lower()))
    score += len(input_words & lesson_words)
    return score


def _nullable_int(value, min_value, max_value):
    if value is None or value == "":
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    if number < min_value or number > max_value:
        return None
    return number


def _to_float(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value, min_value, max_value):
    return max(min_value, min(max_value, value))


def _trim_text(value, max_length):
    if value is None:
        return None
    text = str(value).strip()
    return text[:max_length]


def _now():
    return datetime.now(timezone.utc).isoformat()
