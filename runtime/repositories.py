from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .errors import SessionNotFound
from .models import (
    EVENT_VERSION,
    INITIAL_LIFECYCLE_STATUS,
    INITIAL_RUNTIME_STATE,
    MACHINE_VERSION,
    SCHEMA_VERSION,
    RuntimeEvent,
    RuntimeRecoveryPoint,
    RuntimeSession,
    new_id,
    utc_now,
)


RUNTIME_SCHEMA_VERSION = "runtime-sqlite-v1"


def connect(db_path: Path | str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def migrate_runtime(db_path: Path | str) -> None:
    conn = connect(db_path)
    try:
        _migrate(conn)
        conn.commit()
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runtime_schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runtime_sessions (
          session_id TEXT PRIMARY KEY,
          create_idempotency_key TEXT NOT NULL UNIQUE,
          input_text TEXT NOT NULL,
          overrides_json TEXT NOT NULL,
          lifecycle_status TEXT NOT NULL,
          runtime_state TEXT NOT NULL,
          version INTEGER NOT NULL,
          last_event_id TEXT,
          latest_recovery_point_id TEXT,
          active_execution_id TEXT,
          machine_version TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          paused_at TEXT,
          closed_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runtime_events (
          event_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          event_version TEXT NOT NULL,
          machine_version TEXT NOT NULL,
          command_id TEXT,
          correlation_id TEXT,
          causation_id TEXT,
          idempotency_key TEXT NOT NULL,
          type TEXT NOT NULL,
          runtime_transition_json TEXT,
          from_lifecycle_status TEXT,
          to_lifecycle_status TEXT,
          actor TEXT NOT NULL,
          trace_id TEXT NOT NULL,
          reason TEXT,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES runtime_sessions(session_id),
          UNIQUE(session_id, sequence),
          UNIQUE(session_id, idempotency_key)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runtime_recovery_points (
          recovery_point_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL UNIQUE,
          session_version INTEGER NOT NULL,
          runtime_state TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES runtime_sessions(session_id)
        )
        """
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO runtime_schema_migrations (version, applied_at)
        VALUES (?, ?)
        """,
        (RUNTIME_SCHEMA_VERSION, utc_now()),
    )


@contextmanager
def runtime_transaction(db_path: Path | str) -> Iterator[sqlite3.Connection]:
    conn = connect(db_path)
    try:
        _migrate(conn)
        conn.commit()
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _json(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True)


def _session_from_row(row: sqlite3.Row) -> RuntimeSession:
    return RuntimeSession(
        sessionId=row["session_id"],
        lifecycleStatus=row["lifecycle_status"],
        runtimeState=row["runtime_state"],
        version=row["version"],
        lastEventId=row["last_event_id"],
        latestRecoveryPointId=row["latest_recovery_point_id"],
        activeExecutionId=row["active_execution_id"],
        machineVersion=row["machine_version"],
        schemaVersion=row["schema_version"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        pausedAt=row["paused_at"],
        closedAt=row["closed_at"],
        inputText=row["input_text"],
        overrides=json.loads(row["overrides_json"] or "{}"),
    )


def _event_from_row(row: sqlite3.Row) -> RuntimeEvent:
    transition = json.loads(row["runtime_transition_json"]) if row["runtime_transition_json"] else None
    return RuntimeEvent(
        eventId=row["event_id"],
        sessionId=row["session_id"],
        sequence=row["sequence"],
        eventVersion=row["event_version"],
        machineVersion=row["machine_version"],
        commandId=row["command_id"],
        correlationId=row["correlation_id"],
        causationId=row["causation_id"],
        idempotencyKey=row["idempotency_key"],
        type=row["type"],
        runtimeTransition=transition,
        fromLifecycleStatus=row["from_lifecycle_status"],
        toLifecycleStatus=row["to_lifecycle_status"],
        actor=row["actor"],
        traceId=row["trace_id"],
        reason=row["reason"],
        payload=json.loads(row["payload_json"] or "{}"),
        createdAt=row["created_at"],
    )


def _recovery_point_from_row(row: sqlite3.Row) -> RuntimeRecoveryPoint:
    return RuntimeRecoveryPoint(
        recoveryPointId=row["recovery_point_id"],
        sessionId=row["session_id"],
        sessionVersion=row["session_version"],
        runtimeState=row["runtime_state"],
        snapshot=json.loads(row["snapshot_json"] or "{}"),
        createdAt=row["created_at"],
    )


class RuntimeRepository:
    def __init__(self, db_path: Path | str):
        self.db_path = db_path

    def migrate(self) -> None:
        migrate_runtime(self.db_path)

    def create_session(self, *, input_text: str, overrides: dict[str, Any], idempotency_key: str) -> tuple[RuntimeSession, bool]:
        with runtime_transaction(self.db_path) as conn:
            existing = conn.execute(
                "SELECT * FROM runtime_sessions WHERE create_idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if existing:
                return _session_from_row(existing), True
            now = utc_now()
            session_id = new_id("session")
            event_id = new_id("event")
            conn.execute(
                """
                INSERT INTO runtime_sessions
                  (session_id, create_idempotency_key, input_text, overrides_json,
                   lifecycle_status, runtime_state, version, last_event_id,
                   latest_recovery_point_id, active_execution_id, machine_version,
                   schema_version, created_at, updated_at, paused_at, closed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    idempotency_key,
                    input_text,
                    _json(overrides),
                    INITIAL_LIFECYCLE_STATUS,
                    INITIAL_RUNTIME_STATE,
                    1,
                    event_id,
                    None,
                    None,
                    MACHINE_VERSION,
                    SCHEMA_VERSION,
                    now,
                    now,
                    None,
                    None,
                ),
            )
            conn.execute(
                """
                INSERT INTO runtime_events
                  (event_id, session_id, sequence, event_version, machine_version,
                   command_id, correlation_id, causation_id, idempotency_key, type,
                   runtime_transition_json, from_lifecycle_status, to_lifecycle_status,
                   actor, trace_id, reason, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    session_id,
                    1,
                    EVENT_VERSION,
                    MACHINE_VERSION,
                    new_id("command"),
                    None,
                    None,
                    idempotency_key,
                    "session_created",
                    None,
                    None,
                    None,
                    "system",
                    "session_create",
                    "session created",
                    _json({"inputText": input_text}),
                    now,
                ),
            )
            session = self.get_session_with_conn(conn, session_id)
            return session, False

    def get_session(self, session_id: str) -> RuntimeSession:
        conn = connect(self.db_path)
        try:
            _migrate(conn)
            return self.get_session_with_conn(conn, session_id)
        finally:
            conn.close()

    def get_session_with_conn(self, conn: sqlite3.Connection, session_id: str) -> RuntimeSession:
        row = conn.execute("SELECT * FROM runtime_sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not row:
            raise SessionNotFound(sessionId=session_id)
        return _session_from_row(row)

    def get_event_by_idempotency(self, conn: sqlite3.Connection, session_id: str, idempotency_key: str) -> RuntimeEvent | None:
        row = conn.execute(
            "SELECT * FROM runtime_events WHERE session_id = ? AND idempotency_key = ?",
            (session_id, idempotency_key),
        ).fetchone()
        return _event_from_row(row) if row else None

    def append_event(
        self,
        conn: sqlite3.Connection,
        *,
        session: RuntimeSession,
        event_type: str,
        idempotency_key: str,
        actor: str,
        trace_id: str,
        payload: dict[str, Any],
        runtime_transition: dict[str, Any] | None = None,
        from_lifecycle_status: str | None = None,
        to_lifecycle_status: str | None = None,
        reason: str | None = None,
        new_runtime_state: str | None = None,
        new_lifecycle_status: str | None = None,
    ) -> RuntimeEvent:
        next_sequence = (
            conn.execute(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM runtime_events WHERE session_id = ?",
                (session.sessionId,),
            ).fetchone()[0]
        )
        now = utc_now()
        event = RuntimeEvent(
            eventId=new_id("event"),
            sessionId=session.sessionId,
            sequence=next_sequence,
            eventVersion=EVENT_VERSION,
            machineVersion=MACHINE_VERSION,
            commandId=new_id("command"),
            correlationId=trace_id,
            causationId=session.lastEventId,
            idempotencyKey=idempotency_key,
            type=event_type,
            runtimeTransition=runtime_transition,
            fromLifecycleStatus=from_lifecycle_status,
            toLifecycleStatus=to_lifecycle_status,
            actor=actor,
            traceId=trace_id,
            reason=reason,
            payload=payload,
            createdAt=now,
        )
        conn.execute(
            """
            INSERT INTO runtime_events
              (event_id, session_id, sequence, event_version, machine_version,
               command_id, correlation_id, causation_id, idempotency_key, type,
               runtime_transition_json, from_lifecycle_status, to_lifecycle_status,
               actor, trace_id, reason, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.eventId,
                event.sessionId,
                event.sequence,
                event.eventVersion,
                event.machineVersion,
                event.commandId,
                event.correlationId,
                event.causationId,
                idempotency_key,
                event.type,
                _json(runtime_transition) if runtime_transition else None,
                from_lifecycle_status,
                to_lifecycle_status,
                actor,
                trace_id,
                reason,
                _json(payload),
                now,
            ),
        )
        conn.execute(
            """
            UPDATE runtime_sessions
            SET runtime_state = ?, lifecycle_status = ?, version = version + 1,
                last_event_id = ?, updated_at = ?,
                paused_at = CASE WHEN ? = 'paused' THEN ? ELSE paused_at END,
                closed_at = CASE WHEN ? = 'closed' THEN ? ELSE closed_at END
            WHERE session_id = ?
            """,
            (
                new_runtime_state or session.runtimeState,
                new_lifecycle_status or session.lifecycleStatus,
                event.eventId,
                now,
                new_lifecycle_status,
                now,
                new_lifecycle_status,
                now,
                session.sessionId,
            ),
        )
        return event

    def list_events(self, session_id: str, after_sequence: int = 0, limit: int = 100) -> list[RuntimeEvent]:
        conn = connect(self.db_path)
        try:
            _migrate(conn)
            self.get_session_with_conn(conn, session_id)
            rows = conn.execute(
                """
                SELECT * FROM runtime_events
                WHERE session_id = ? AND sequence > ?
                ORDER BY sequence ASC
                LIMIT ?
                """,
                (session_id, after_sequence, min(limit, 500)),
            ).fetchall()
            return [_event_from_row(row) for row in rows]
        finally:
            conn.close()

    def create_recovery_point(
        self,
        conn: sqlite3.Connection,
        *,
        session: RuntimeSession,
        snapshot: dict[str, Any],
    ) -> RuntimeRecoveryPoint:
        now = utc_now()
        point = RuntimeRecoveryPoint(
            recoveryPointId=new_id("recovery"),
            sessionId=session.sessionId,
            sessionVersion=session.version,
            runtimeState=session.runtimeState,
            snapshot=snapshot,
            createdAt=now,
        )
        conn.execute(
            """
            INSERT INTO runtime_recovery_points
              (recovery_point_id, session_id, session_version, runtime_state, snapshot_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
              recovery_point_id = excluded.recovery_point_id,
              session_version = excluded.session_version,
              runtime_state = excluded.runtime_state,
              snapshot_json = excluded.snapshot_json,
              created_at = excluded.created_at
            """,
            (
                point.recoveryPointId,
                point.sessionId,
                point.sessionVersion,
                point.runtimeState,
                _json(snapshot),
                point.createdAt,
            ),
        )
        conn.execute(
            "UPDATE runtime_sessions SET latest_recovery_point_id = ?, updated_at = ? WHERE session_id = ?",
            (point.recoveryPointId, now, session.sessionId),
        )
        return point

    def get_latest_recovery_point(self, session_id: str) -> RuntimeRecoveryPoint | None:
        conn = connect(self.db_path)
        try:
            _migrate(conn)
            row = conn.execute(
                "SELECT * FROM runtime_recovery_points WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            return _recovery_point_from_row(row) if row else None
        finally:
            conn.close()
