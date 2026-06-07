from __future__ import annotations

import json
from pathlib import Path

from .errors import InvalidTransition


class RuntimeStateMachine:
    def __init__(self, source_path: Path | None = None):
        self.source_path = source_path or Path(__file__).resolve().parent.parent / "runtime-state-machine.json"
        self.data = json.loads(self.source_path.read_text(encoding="utf-8"))
        self.machine_version = self.data["machineVersion"]
        self.schema_version = self.data["schemaVersion"]
        self.runtime_event_types = set(self.data["runtimeEventTypes"])
        self.transition_event_types = set(self.data["runtimeTransitionEventTypes"])
        self.transitions = {
            (item["from"], item["event"]): item["to"]
            for item in self.data["runtimeTransitions"]
        }
        self.lifecycle_transitions = {
            (item["from"], item["event"]): item["to"]
            for item in self.data["lifecycleTransitions"]
        }
        self.terminal_runtime_states = set(self.data["p0Rules"]["terminalRuntimeStates"])

    def apply_runtime_event(self, from_state: str, event_type: str) -> dict:
        if event_type not in self.transition_event_types:
            raise InvalidTransition(
                eventType=event_type,
                fromState=from_state,
                reason="event_type_is_not_a_runtime_transition",
            )
        to_state = self.transitions.get((from_state, event_type))
        if not to_state:
            raise InvalidTransition(eventType=event_type, fromState=from_state)
        return {"fromState": from_state, "eventType": event_type, "toState": to_state}

    def apply_lifecycle_event(self, from_status: str, event_type: str) -> dict:
        to_status = self.lifecycle_transitions.get((from_status, event_type))
        if not to_status:
            raise InvalidTransition(eventType=event_type, fromLifecycleStatus=from_status)
        return {"fromStatus": from_status, "eventType": event_type, "toStatus": to_status}

    def assert_known_event(self, event_type: str) -> None:
        if event_type not in self.runtime_event_types:
            raise InvalidTransition(eventType=event_type, reason="unknown_event_type")
