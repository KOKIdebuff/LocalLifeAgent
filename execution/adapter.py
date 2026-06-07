from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from .core import ExecutionCore


def _actor(actor: str | None) -> str:
    return actor or "system"


def _trace(trace_id: str | None) -> str:
    return trace_id or f"execution_trace_{uuid4().hex}"


class ExecutionAdapter:
    def __init__(self, db_path: Path | str):
        self.core = ExecutionCore(db_path)

    def create_execution(self, *, session_id: str | None, plan_id: str, plan_version: int, steps: list[dict[str, Any]], idempotency_key: str, actor: str | None = None, trace_id: str | None = None):
        return self.core.create_execution(
            session_id=session_id,
            plan_id=plan_id,
            plan_version=plan_version,
            steps=steps,
            idempotency_key=idempotency_key,
            actor=_actor(actor),
            trace_id=_trace(trace_id),
        )

    def get_execution(self, execution_id: str):
        return self.core.get_execution(execution_id)

    def advance_execution(self, *, execution_id: str, expected_version: int, plan_version: int, idempotency_key: str, outcome: str, actor: str | None = None, trace_id: str | None = None, failure_type: str | None = None):
        return self.core.advance_execution(
            execution_id=execution_id,
            expected_version=expected_version,
            plan_version=plan_version,
            idempotency_key=idempotency_key,
            outcome=outcome,
            actor=_actor(actor),
            trace_id=_trace(trace_id),
            failure_type=failure_type,
        )

    def cancel_execution(self, *, execution_id: str, expected_version: int, idempotency_key: str, actor: str | None = None, trace_id: str | None = None, reason: str | None = None):
        return self.core.cancel_execution(
            execution_id=execution_id,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor=_actor(actor),
            trace_id=_trace(trace_id),
            reason=reason,
        )
