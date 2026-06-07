from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .errors import (
    InvalidTransition,
    RecoveryPointNotFound,
    RollbackNotSupported,
    SessionClosed,
    SessionPaused,
    VersionConflict,
)
from .models import RuntimeWriteResult
from .repositories import RuntimeRepository, runtime_transaction
from .state_machine import RuntimeStateMachine


ALLOWED_PAYLOAD_KEYS = {
    "answer",
    "candidateId",
    "error",
    "executionId",
    "inputText",
    "intent",
    "memoryId",
    "metadata",
    "operation",
    "recoverable",
    "source",
    "summary",
}


class RuntimeCore:
    def __init__(self, db_path: Path | str):
        self.repository = RuntimeRepository(db_path)
        self.machine = RuntimeStateMachine()

    def create_session(
        self,
        *,
        input_text: str,
        overrides: dict[str, Any],
        idempotency_key: str,
    ) -> RuntimeWriteResult:
        session, duplicate = self.repository.create_session(
            input_text=input_text,
            overrides=overrides,
            idempotency_key=idempotency_key,
        )
        return RuntimeWriteResult(ok=True, session=session, duplicate=duplicate)

    def get_session(self, session_id: str):
        return self.repository.get_session(session_id)

    def submit_event(
        self,
        *,
        session_id: str,
        event_type: str,
        expected_version: int,
        idempotency_key: str,
        actor: str,
        trace_id: str,
        payload: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> RuntimeWriteResult:
        payload = self._sanitize_payload(payload or {})
        with runtime_transaction(self.repository.db_path) as conn:
            session = self.repository.get_session_with_conn(conn, session_id)
            duplicate = self.repository.get_event_by_idempotency(conn, session_id, idempotency_key)
            if duplicate:
                return RuntimeWriteResult(ok=True, session=session, event=duplicate, duplicate=True)
            self._assert_business_write_allowed(session)
            self._assert_expected_version(session, expected_version)
            transition = self.machine.apply_runtime_event(session.runtimeState, event_type)
            event = self.repository.append_event(
                conn,
                session=session,
                event_type=event_type,
                idempotency_key=idempotency_key,
                actor=actor,
                trace_id=trace_id,
                payload=payload,
                runtime_transition=transition,
                reason=reason,
                new_runtime_state=transition["toState"],
            )
            updated = self.repository.get_session_with_conn(conn, session_id)
            return RuntimeWriteResult(ok=True, session=updated, event=event)

    def pause_session(self, *, session_id: str, expected_version: int, idempotency_key: str, actor: str, trace_id: str, reason: str) -> RuntimeWriteResult:
        return self._apply_lifecycle(
            session_id=session_id,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor=actor,
            trace_id=trace_id,
            reason=reason,
            event_type="session_paused",
        )

    def resume_session(self, *, session_id: str, expected_version: int, idempotency_key: str, actor: str, trace_id: str, reason: str) -> RuntimeWriteResult:
        return self._apply_lifecycle(
            session_id=session_id,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor=actor,
            trace_id=trace_id,
            reason=reason,
            event_type="session_resumed",
        )

    def close_session(self, *, session_id: str, expected_version: int, idempotency_key: str, actor: str, trace_id: str, reason: str) -> RuntimeWriteResult:
        return self._apply_lifecycle(
            session_id=session_id,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor=actor,
            trace_id=trace_id,
            reason=reason,
            event_type="session_closed",
        )

    def list_events(self, *, session_id: str, after_sequence: int = 0, limit: int = 100):
        return self.repository.list_events(session_id, after_sequence, limit)

    def create_recovery_point(
        self,
        *,
        session_id: str,
        expected_version: int,
        idempotency_key: str,
        actor: str,
        trace_id: str,
        snapshot: dict[str, Any],
    ) -> RuntimeWriteResult:
        snapshot = self._sanitize_payload(snapshot)
        with runtime_transaction(self.repository.db_path) as conn:
            session = self.repository.get_session_with_conn(conn, session_id)
            duplicate = self.repository.get_event_by_idempotency(conn, session_id, idempotency_key)
            if duplicate:
                updated = self.repository.get_session_with_conn(conn, session_id)
                point = self.repository.get_latest_recovery_point(session_id)
                return RuntimeWriteResult(ok=True, session=updated, event=duplicate, duplicate=True, recoveryPoint=point)
            self._assert_expected_version(session, expected_version)
            point = self.repository.create_recovery_point(conn, session=session, snapshot=snapshot)
            event = self.repository.append_event(
                conn,
                session=session,
                event_type="recovery_point_created",
                idempotency_key=idempotency_key,
                actor=actor,
                trace_id=trace_id,
                payload={"summary": "latest recovery point created"},
                reason="latest_only_recovery_point",
            )
            updated = self.repository.get_session_with_conn(conn, session_id)
            return RuntimeWriteResult(ok=True, session=updated, event=event, recoveryPoint=point)

    def rollback_to_recovery_point(self, *args, **kwargs) -> RuntimeWriteResult:
        raise RollbackNotSupported(reason="P0 exposes latest-only recovery point storage; full restore flow is not enabled.")

    def _apply_lifecycle(
        self,
        *,
        session_id: str,
        expected_version: int,
        idempotency_key: str,
        actor: str,
        trace_id: str,
        reason: str,
        event_type: str,
    ) -> RuntimeWriteResult:
        with runtime_transaction(self.repository.db_path) as conn:
            session = self.repository.get_session_with_conn(conn, session_id)
            duplicate = self.repository.get_event_by_idempotency(conn, session_id, idempotency_key)
            if duplicate:
                return RuntimeWriteResult(ok=True, session=session, event=duplicate, duplicate=True)
            if session.lifecycleStatus == "closed":
                raise SessionClosed(sessionId=session_id)
            self._assert_expected_version(session, expected_version)
            lifecycle = self.machine.apply_lifecycle_event(session.lifecycleStatus, event_type)
            event = self.repository.append_event(
                conn,
                session=session,
                event_type=event_type,
                idempotency_key=idempotency_key,
                actor=actor,
                trace_id=trace_id,
                payload={},
                from_lifecycle_status=lifecycle["fromStatus"],
                to_lifecycle_status=lifecycle["toStatus"],
                reason=reason,
                new_lifecycle_status=lifecycle["toStatus"],
            )
            updated = self.repository.get_session_with_conn(conn, session_id)
            return RuntimeWriteResult(ok=True, session=updated, event=event)

    def _assert_business_write_allowed(self, session) -> None:
        if session.lifecycleStatus == "paused":
            raise SessionPaused(sessionId=session.sessionId)
        if session.lifecycleStatus == "closed":
            raise SessionClosed(sessionId=session.sessionId)

    def _assert_expected_version(self, session, expected_version: int) -> None:
        if session.version != expected_version:
            raise VersionConflict(
                sessionId=session.sessionId,
                expectedVersion=expected_version,
                actualVersion=session.version,
            )

    def _sanitize_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise InvalidTransition(reason="payload_must_be_object")
        unknown = sorted(set(payload) - ALLOWED_PAYLOAD_KEYS)
        if unknown:
            raise InvalidTransition(reason="payload_field_not_allowed", fields=unknown)
        return payload
