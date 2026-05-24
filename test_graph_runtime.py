import asyncio
import tempfile
from pathlib import Path

import graph_runtime


def temp_dir():
    base = Path("C:/tmp")
    base.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=base)


def test_graph_runtime_status_is_explicit():
    status = graph_runtime.graph_runtime_status()
    assert "available" in status
    assert "importError" in status


def test_graph_nodes_build_and_validate_intent_payload():
    with temp_dir() as tmp:
        state = {
            "user_input": "下午和朋友出去玩",
            "overrides": {},
            "settings": {
                "db_path": Path(tmp) / "agent_memory.sqlite",
                "model": "demo-model",
            },
        }
        state.update(asyncio.run(graph_runtime._load_lessons(state)))
        state.update(asyncio.run(graph_runtime._build_payload(state)))
        state.update(
            asyncio.run(
                graph_runtime._validate_intent(
                    {
                        **state,
                        "raw_content": '{"groupType":"friends","timePreset":"unknown","confidence":0.8}',
                    }
                )
            )
        )

    assert state["payload"]["model"] == "demo-model"
    assert state["intent"]["groupType"] == "friends"
    assert state["intent"]["missingFields"] == ["timePreset"]


def test_run_intent_graph_success_response_uses_shared_llm_source(monkeypatch):
    async def fake_ainvoke(payload):
        return {"intent": {"groupType": "friends"}, "lessons": []}

    class FakeGraph:
        ainvoke = staticmethod(fake_ainvoke)

    monkeypatch.setattr(graph_runtime, "is_langgraph_available", lambda: True)
    monkeypatch.setattr(graph_runtime, "_get_intent_graph", lambda: FakeGraph())

    result = asyncio.run(graph_runtime.run_intent_graph("和朋友出去玩", {}, {}))

    assert result["ok"] is True
    assert result["source"] == "llm"
    assert result["runtimePath"] == "langgraph"
    assert result["intent"] == {"groupType": "friends"}
