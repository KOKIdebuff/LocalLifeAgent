from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from .core import RuntimeCore


def _trace(trace_id: str | None) -> str:
    return trace_id or f"trace_{uuid4().hex}"


def _actor(actor: str | None) -> str:
    return actor or "system"


class RuntimeAdapter:
    """Stable UI-agnostic Runtime access surface."""

    def __init__(self, db_path: Path | str):
        self.core = RuntimeCore(db_path)

    def create_session(self, *, input_text: str, overrides: dict[str, Any], idempotency_key: str):
        return self.core.create_session(
            input_text=input_text,
            overrides=overrides,
            idempotency_key=idempotency_key,
        )

    def get_session(self, session_id: str):
        return self.core.get_session(session_id)

    def submit_event(
        self,
        *,
        session_id: str,
        event_type: str,
        expected_version: int,
        idempotency_key: str,
        actor: str | None = None,
        trace_id: str | None = None,
        payload: dict[str, Any] | None = None,
        reason: str | None = None,
    ):
        return self.core.submit_event(
            session_id=session_id,
            event_type=event_type,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor=_actor(actor),
            trace_id=_trace(trace_id),
            payload=payload or {},
            reason=reason,
        )

    def pause_session(self, *, session_id: str, expected_version: int, idempotency_key: str, actor: str | None = None, trace_id: str | None = None, reason: str | None = None):
        return self.core.pause_session(
            session_id=session_id,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor=_actor(actor),
            trace_id=_trace(trace_id),
            reason=reason or "session paused by adapter",
        )

    def resume_session(self, *, session_id: str, expected_version: int, idempotency_key: str, actor: str | None = None, trace_id: str | None = None, reason: str | None = None):
        return self.core.resume_session(
            session_id=session_id,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor=_actor(actor),
            trace_id=_trace(trace_id),
            reason=reason or "session resumed by adapter",
        )

    def close_session(self, *, session_id: str, expected_version: int, idempotency_key: str, actor: str | None = None, trace_id: str | None = None, reason: str | None = None):
        return self.core.close_session(
            session_id=session_id,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor=_actor(actor),
            trace_id=_trace(trace_id),
            reason=reason or "session closed by adapter",
        )

    def list_events(self, *, session_id: str, after_sequence: int = 0, limit: int = 100):
        return self.core.list_events(session_id=session_id, after_sequence=after_sequence, limit=limit)

    def append_execution_summary(
        self,
        *,
        session_id: str,
        event_type: str,
        idempotency_key: str,
        actor: str | None = None,
        trace_id: str | None = None,
        payload: dict[str, Any],
    ):
        return self.core.append_execution_summary(
            session_id=session_id,
            event_type=event_type,
            idempotency_key=idempotency_key,
            actor=_actor(actor),
            trace_id=_trace(trace_id),
            payload=payload,
        )

    def create_recovery_point(
        self,
        *,
        session_id: str,
        expected_version: int,
        idempotency_key: str,
        snapshot: dict[str, Any],
        actor: str | None = None,
        trace_id: str | None = None,
    ):
        return self.core.create_recovery_point(
            session_id=session_id,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor=_actor(actor),
            trace_id=_trace(trace_id),
            snapshot=snapshot,
        )

    def rollback_to_recovery_point(self, **kwargs):
        return self.core.rollback_to_recovery_point(**kwargs)
