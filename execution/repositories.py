from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .errors import ExecutionNotFound
from .models import (
    EXECUTION_EVENT_VERSION,
    EXECUTION_SCHEMA_VERSION,
    ExecutionEvent,
    ExecutionRun,
    ExecutionStep,
    new_id,
    utc_now,
)


MIGRATION_VERSION = "execution-sqlite-v1"


def connect(db_path: Path | str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def migrate_execution(db_path: Path | str) -> None:
    conn = connect(db_path)
    try:
        _migrate(conn)
        conn.commit()
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS execution_schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS execution_runs (
          execution_id TEXT PRIMARY KEY,
          create_idempotency_key TEXT NOT NULL UNIQUE,
          session_id TEXT,
          plan_id TEXT NOT NULL,
          plan_version INTEGER NOT NULL,
          status TEXT NOT NULL,
          current_step_id TEXT,
          version INTEGER NOT NULL,
          schema_version TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          cancelled_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS execution_steps (
          step_id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          step_order INTEGER NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          attempt_count INTEGER NOT NULL,
          max_attempts INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(execution_id) REFERENCES execution_runs(execution_id),
          UNIQUE(execution_id, step_order)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS execution_events (
          event_id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          type TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          event_version TEXT NOT NULL,
          actor TEXT NOT NULL,
          trace_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(execution_id) REFERENCES execution_runs(execution_id),
          UNIQUE(execution_id, sequence),
          UNIQUE(execution_id, idempotency_key)
        )
        """
    )
    conn.execute(
        "INSERT OR IGNORE INTO execution_schema_migrations (version, applied_at) VALUES (?, ?)",
        (MIGRATION_VERSION, utc_now()),
    )


@contextmanager
def execution_transaction(db_path: Path | str) -> Iterator[sqlite3.Connection]:
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


def _step_from_row(row: sqlite3.Row) -> ExecutionStep:
    return ExecutionStep(
        stepId=row["step_id"],
        executionId=row["execution_id"],
        order=row["step_order"],
        title=row["title"],
        status=row["status"],
        attemptCount=row["attempt_count"],
        maxAttempts=row["max_attempts"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def _event_from_row(row: sqlite3.Row) -> ExecutionEvent:
    return ExecutionEvent(
        eventId=row["event_id"],
        executionId=row["execution_id"],
        sequence=row["sequence"],
        type=row["type"],
        idempotencyKey=row["idempotency_key"],
        eventVersion=row["event_version"],
        actor=row["actor"],
        traceId=row["trace_id"],
        payload=json.loads(row["payload_json"] or "{}"),
        createdAt=row["created_at"],
    )


class ExecutionRepository:
    def __init__(self, db_path: Path | str):
        self.db_path = db_path

    def migrate(self) -> None:
        migrate_execution(self.db_path)

    def get_execution_with_conn(self, conn: sqlite3.Connection, execution_id: str) -> ExecutionRun:
        row = conn.execute("SELECT * FROM execution_runs WHERE execution_id = ?", (execution_id,)).fetchone()
        if not row:
            raise ExecutionNotFound(executionId=execution_id)
        steps = [
            _step_from_row(step)
            for step in conn.execute(
                "SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY step_order ASC",
                (execution_id,),
            ).fetchall()
        ]
        return ExecutionRun(
            executionId=row["execution_id"],
            sessionId=row["session_id"],
            planId=row["plan_id"],
            planVersion=row["plan_version"],
            status=row["status"],
            currentStepId=row["current_step_id"],
            version=row["version"],
            schemaVersion=row["schema_version"],
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
            completedAt=row["completed_at"],
            cancelledAt=row["cancelled_at"],
            steps=steps,
        )

    def get_execution(self, execution_id: str) -> ExecutionRun:
        conn = connect(self.db_path)
        try:
            _migrate(conn)
            return self.get_execution_with_conn(conn, execution_id)
        finally:
            conn.close()

    def create_execution(
        self,
        *,
        session_id: str | None,
        plan_id: str,
        plan_version: int,
        steps: list[dict[str, Any]],
        idempotency_key: str,
        actor: str,
        trace_id: str,
    ) -> tuple[ExecutionRun, ExecutionEvent | None, bool]:
        with execution_transaction(self.db_path) as conn:
            return self.create_execution_with_conn(
                conn,
                session_id=session_id,
                plan_id=plan_id,
                plan_version=plan_version,
                steps=steps,
                idempotency_key=idempotency_key,
                actor=actor,
                trace_id=trace_id,
            )

    def create_execution_with_conn(
        self,
        conn: sqlite3.Connection,
        *,
        session_id: str | None,
        plan_id: str,
        plan_version: int,
        steps: list[dict[str, Any]],
        idempotency_key: str,
        actor: str,
        trace_id: str,
    ) -> tuple[ExecutionRun, ExecutionEvent | None, bool]:
        existing = conn.execute(
            "SELECT execution_id FROM execution_runs WHERE create_idempotency_key = ?",
            (idempotency_key,),
        ).fetchone()
        if existing:
            execution = self.get_execution_with_conn(conn, existing["execution_id"])
            event = self.get_event_by_idempotency(conn, execution.executionId, idempotency_key)
            return execution, event, True
        now = utc_now()
        execution_id = new_id("execution")
        normalized_steps = steps or [{"title": "default execution step", "maxAttempts": 1}]
        first_step_id = new_id("step")
        conn.execute(
            """
            INSERT INTO execution_runs
              (execution_id, create_idempotency_key, session_id, plan_id,
               plan_version, status, current_step_id, version, schema_version,
               created_at, updated_at, completed_at, cancelled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                execution_id,
                idempotency_key,
                session_id,
                plan_id,
                plan_version,
                "active",
                first_step_id,
                1,
                EXECUTION_SCHEMA_VERSION,
                now,
                now,
                None,
                None,
            ),
        )
        for index, item in enumerate(normalized_steps):
            step_id = first_step_id if index == 0 else new_id("step")
            conn.execute(
                """
                INSERT INTO execution_steps
                  (step_id, execution_id, step_order, title, status,
                   attempt_count, max_attempts, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    step_id,
                    execution_id,
                    index + 1,
                    str(item.get("title") or f"step {index + 1}")[:200],
                    "active" if index == 0 else "pending",
                    0,
                    max(1, min(int(item.get("maxAttempts") or 1), 5)),
                    now,
                    now,
                ),
            )
        event = self.append_event(
            conn,
            execution_id=execution_id,
            event_type="execution_created",
            idempotency_key=idempotency_key,
            actor=actor,
            trace_id=trace_id,
            payload={"planId": plan_id, "planVersion": plan_version},
        )
        return self.get_execution_with_conn(conn, execution_id), event, False

    def append_event(
        self,
        conn: sqlite3.Connection,
        *,
        execution_id: str,
        event_type: str,
        idempotency_key: str,
        actor: str,
        trace_id: str,
        payload: dict[str, Any],
    ) -> ExecutionEvent:
        sequence = conn.execute(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM execution_events WHERE execution_id = ?",
            (execution_id,),
        ).fetchone()[0]
        now = utc_now()
        event = ExecutionEvent(
            eventId=new_id("execution_event"),
            executionId=execution_id,
            sequence=sequence,
            type=event_type,
            idempotencyKey=idempotency_key,
            eventVersion=EXECUTION_EVENT_VERSION,
            actor=actor,
            traceId=trace_id,
            payload=payload,
            createdAt=now,
        )
        conn.execute(
            """
            INSERT INTO execution_events
              (event_id, execution_id, sequence, type, idempotency_key,
               event_version, actor, trace_id, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.eventId,
                event.executionId,
                event.sequence,
                event.type,
                event.idempotencyKey,
                event.eventVersion,
                event.actor,
                event.traceId,
                _json(payload),
                event.createdAt,
            ),
        )
        return event

    def get_event_by_idempotency(self, conn: sqlite3.Connection, execution_id: str, idempotency_key: str) -> ExecutionEvent | None:
        row = conn.execute(
            "SELECT * FROM execution_events WHERE execution_id = ? AND idempotency_key = ?",
            (execution_id, idempotency_key),
        ).fetchone()
        return _event_from_row(row) if row else None

    def list_events(self, execution_id: str) -> list[ExecutionEvent]:
        conn = connect(self.db_path)
        try:
            _migrate(conn)
            rows = conn.execute(
                "SELECT * FROM execution_events WHERE execution_id = ? ORDER BY sequence ASC",
                (execution_id,),
            ).fetchall()
            return [_event_from_row(row) for row in rows]
        finally:
            conn.close()
