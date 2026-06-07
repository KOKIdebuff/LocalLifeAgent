from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


MACHINE_VERSION = "v4-p0-2"
SCHEMA_VERSION = "v4-runtime-schema-2"
EVENT_VERSION = "v4-runtime-events-2"
INITIAL_RUNTIME_STATE = "intent_loading"
INITIAL_LIFECYCLE_STATUS = "active"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


@dataclass(frozen=True)
class RuntimeSession:
    sessionId: str
    lifecycleStatus: str
    runtimeState: str
    version: int
    lastEventId: str | None
    latestRecoveryPointId: str | None
    activeExecutionId: str | None
    machineVersion: str
    schemaVersion: str
    createdAt: str
    updatedAt: str
    pausedAt: str | None
    closedAt: str | None
    inputText: str
    overrides: dict[str, Any]

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RuntimeEvent:
    eventId: str
    sessionId: str
    sequence: int
    eventVersion: str
    machineVersion: str
    commandId: str | None
    correlationId: str | None
    causationId: str | None
    type: str
    actor: str
    traceId: str
    createdAt: str
    payload: dict[str, Any]
    runtimeTransition: dict[str, Any] | None = None
    fromLifecycleStatus: str | None = None
    toLifecycleStatus: str | None = None
    reason: str | None = None
    idempotencyKey: str | None = None

    def public_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("idempotencyKey", None)
        return {key: value for key, value in data.items() if value is not None}


@dataclass(frozen=True)
class RuntimeRecoveryPoint:
    recoveryPointId: str
    sessionId: str
    sessionVersion: int
    runtimeState: str
    snapshot: dict[str, Any]
    createdAt: str

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RuntimeWriteResult:
    ok: bool
    session: RuntimeSession
    event: RuntimeEvent | None = None
    duplicate: bool = False
    recoveryPoint: RuntimeRecoveryPoint | None = None

    def public_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "ok": self.ok,
            "session": self.session.public_dict(),
            "duplicate": self.duplicate,
        }
        if self.event:
            data["event"] = self.event.public_dict()
        if self.recoveryPoint:
            data["recoveryPoint"] = self.recoveryPoint.public_dict()
        return data
