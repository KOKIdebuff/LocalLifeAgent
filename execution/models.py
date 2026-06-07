from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


EXECUTION_SCHEMA_VERSION = "execution-p1-schema-1"
EXECUTION_EVENT_VERSION = "execution-events-1"

TERMINAL_EXECUTION_STATUSES = {"completed", "failed", "cancelled"}
TERMINAL_STEP_STATUSES = {"succeeded", "failed", "skipped", "blocked"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


@dataclass(frozen=True)
class ExecutionStep:
    stepId: str
    executionId: str
    order: int
    title: str
    status: str
    attemptCount: int
    maxAttempts: int
    createdAt: str
    updatedAt: str

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ExecutionRun:
    executionId: str
    sessionId: str | None
    planId: str
    planVersion: int
    status: str
    currentStepId: str | None
    version: int
    schemaVersion: str
    createdAt: str
    updatedAt: str
    completedAt: str | None
    cancelledAt: str | None
    steps: list[ExecutionStep]

    def public_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["steps"] = [step.public_dict() for step in self.steps]
        return data


@dataclass(frozen=True)
class ExecutionEvent:
    eventId: str
    executionId: str
    sequence: int
    type: str
    idempotencyKey: str
    eventVersion: str
    actor: str
    traceId: str
    payload: dict[str, Any]
    createdAt: str

    def public_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("idempotencyKey", None)
        return data


@dataclass(frozen=True)
class ExecutionWriteResult:
    ok: bool
    execution: ExecutionRun
    event: ExecutionEvent | None = None
    duplicate: bool = False
    runtimeSummaryEvent: dict[str, Any] | None = None
    runtimeSummaryEventStatus: str = "skipped"

    def public_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "ok": self.ok,
            "execution": self.execution.public_dict(),
            "duplicate": self.duplicate,
            "runtimeSummaryEventStatus": self.runtimeSummaryEventStatus,
        }
        if self.event:
            data["event"] = self.event.public_dict()
        if self.runtimeSummaryEvent:
            data["runtimeSummaryEvent"] = self.runtimeSummaryEvent
        return data
