from functools import lru_cache
from typing import Any, TypedDict

import httpx

from backend_core import (
    build_chat_payload,
    extract_json_object,
    load_relevant_lessons,
    validate_intent,
)

try:
    from langgraph.graph import END, START, StateGraph

    LANGGRAPH_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - depends on optional runtime dependency.
    END = "__end__"
    START = "__start__"
    StateGraph = None
    LANGGRAPH_IMPORT_ERROR = str(exc)


class IntentGraphState(TypedDict, total=False):
    user_input: str
    overrides: dict[str, Any]
    settings: dict[str, Any]
    lessons: list[dict[str, Any]]
    payload: dict[str, Any]
    raw_content: str
    raw_intent: dict[str, Any]
    intent: dict[str, Any]


def is_langgraph_available():
    return StateGraph is not None


def graph_runtime_status():
    return {
        "available": is_langgraph_available(),
        "importError": LANGGRAPH_IMPORT_ERROR,
    }


async def run_intent_graph(user_input, overrides, settings):
    if not is_langgraph_available():
        raise RuntimeError("LangGraph is not available.")

    graph = _get_intent_graph()
    state = await graph.ainvoke(
        {
            "user_input": user_input,
            "overrides": overrides or {},
            "settings": settings,
        }
    )
    return {
        "ok": True,
        "source": "llm",
        "runtimePath": "langgraph",
        "intent": state["intent"],
        "lessonsUsed": state["lessons"],
    }


@lru_cache(maxsize=1)
def _get_intent_graph():
    graph = StateGraph(IntentGraphState)
    graph.add_node("load_lessons", _load_lessons)
    graph.add_node("build_payload", _build_payload)
    graph.add_node("call_llm", _call_llm)
    graph.add_node("validate_intent", _validate_intent)

    graph.add_edge(START, "load_lessons")
    graph.add_edge("load_lessons", "build_payload")
    graph.add_edge("build_payload", "call_llm")
    graph.add_edge("call_llm", "validate_intent")
    graph.add_edge("validate_intent", END)
    return graph.compile()


async def _load_lessons(state):
    settings = state["settings"]
    return {
        "lessons": load_relevant_lessons(state["user_input"], settings["db_path"]),
    }


async def _build_payload(state):
    settings = state["settings"]
    return {
        "payload": build_chat_payload(
            state["user_input"],
            state.get("overrides") or {},
            state.get("lessons") or [],
            settings["model"],
        )
    }


async def _call_llm(state):
    settings = state["settings"]
    headers = {
        "Authorization": "Bearer " + settings["api_key"],
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=settings["timeout_seconds"]) as client:
        response = await client.post(settings["base_url"] + "/chat/completions", json=state["payload"], headers=headers)
        response.raise_for_status()
    data = response.json()
    return {"raw_content": data["choices"][0]["message"]["content"]}


async def _validate_intent(state):
    raw_intent = extract_json_object(state["raw_content"])
    return {
        "raw_intent": raw_intent,
        "intent": validate_intent(raw_intent),
    }
