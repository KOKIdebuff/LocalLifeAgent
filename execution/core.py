from __future__ import annotations

from pathlib import Path
from typing import Any

from .errors import (
    ExecutionAlreadyTerminal,
    ExecutionInvalidTransition,
    ExecutionPlanVersionConflict,
    ExecutionVersionConflict,
)
from .models import ExecutionWriteResult, TERMINAL_EXECUTION_STATUSES, utc_now
from .repositories import ExecutionRepository, execution_transaction
from runtime.core import RuntimeCore


ALLOWED_ADVANCE_OUTCOMES = {"succeeded", "failed", "blocked"}
EXECUTION_RUNTIME_SUMMARY_BY_EVENT = {
    "execution_created": "execution_requested_summary",
    "execution_completed": "execution_completed_summary",
    "execution_blocked": "execution_blocked_summary",
    "execution_cancelled": "execution_cancelled_summary",
    "execution_failed": "execution_failed_summary",
}


class ExecutionCore:
    def __init__(self, db_path: Path | str):
        self.repository = ExecutionRepository(db_path)
        self.runtime_core = RuntimeCore(db_path)

    def create_execution(self, *, session_id: str | None, plan_id: str, plan_version: int, steps: list[dict[str, Any]], idempotency_key: str, actor: str, trace_id: str) -> ExecutionWriteResult:
        with execution_transaction(self.repository.db_path) as conn:
            execution, event, duplicate = self.repository.create_execution_with_conn(
                conn,
                session_id=session_id,
                plan_id=plan_id,
                plan_version=plan_version,
                steps=steps,
                idempotency_key=idempotency_key,
                actor=actor,
                trace_id=trace_id,
            )
            return self._with_runtime_summary(
                conn,
                execution=execution,
                event=event,
                duplicate=duplicate,
                actor=actor,
                trace_id=trace_id,
                summary="execution requested",
            )

    def get_execution(self, execution_id: str):
        return self.repository.get_execution(execution_id)

    def advance_execution(self, *, execution_id: str, expected_version: int, plan_version: int, idempotency_key: str, outcome: str, actor: str, trace_id: str, failure_type: str | None = None) -> ExecutionWriteResult:
        if outcome not in ALLOWED_ADVANCE_OUTCOMES:
            raise ExecutionInvalidTransition(outcome=outcome)
        with execution_transaction(self.repository.db_path) as conn:
            execution = self.repository.get_execution_with_conn(conn, execution_id)
            duplicate = self.repository.get_event_by_idempotency(conn, execution_id, idempotency_key)
            if duplicate:
                return self._with_runtime_summary(
                    conn,
                    execution=execution,
                    event=duplicate,
                    duplicate=True,
                    actor=actor,
                    trace_id=trace_id,
                    summary="duplicate execution advance",
                )
            self._assert_writable(execution, expected_version, plan_version)
            current = next((step for step in execution.steps if step.stepId == execution.currentStepId), None)
            if not current:
                raise ExecutionInvalidTransition(reason="current_step_missing")
            event_type = "step_advanced"
            now_status = execution.status
            next_step_id = execution.currentStepId
            if outcome == "succeeded":
                conn.execute(
                    "UPDATE execution_steps SET status = ?, updated_at = datetime('now') WHERE step_id = ?",
                    ("succeeded", current.stepId),
                )
                next_pending = next((step for step in execution.steps if step.order > current.order and step.status == "pending"), None)
                if next_pending:
                    conn.execute(
                        "UPDATE execution_steps SET status = ?, updated_at = datetime('now') WHERE step_id = ?",
                        ("active", next_pending.stepId),
                    )
                    next_step_id = next_pending.stepId
                    now_status = "active"
                else:
                    next_step_id = None
                    now_status = "completed"
                    event_type = "execution_completed"
            elif outcome == "failed":
                attempt_count = current.attemptCount + 1
                if attempt_count < current.maxAttempts:
                    conn.execute(
                        "UPDATE execution_steps SET attempt_count = ?, updated_at = datetime('now') WHERE step_id = ?",
                        (attempt_count, current.stepId),
                    )
                    event_type = "step_retry_scheduled"
                else:
                    conn.execute(
                        "UPDATE execution_steps SET status = ?, attempt_count = ?, updated_at = datetime('now') WHERE step_id = ?",
                        ("failed", attempt_count, current.stepId),
                    )
                    now_status = "failed"
                    event_type = "execution_failed"
            else:
                conn.execute(
                    "UPDATE execution_steps SET status = ?, updated_at = datetime('now') WHERE step_id = ?",
                    ("blocked", current.stepId),
                )
                now_status = "blocked"
                event_type = "execution_blocked"
            now = utc_now()
            completed_at = now if now_status in {"completed", "failed"} else execution.completedAt
            conn.execute(
                """
                UPDATE execution_runs
                SET status = ?, current_step_id = ?, version = version + 1,
                    updated_at = ?, completed_at = ?
                WHERE execution_id = ?
                """,
                (now_status, next_step_id, now, completed_at, execution_id),
            )
            event = self.repository.append_event(
                conn,
                execution_id=execution_id,
                event_type=event_type,
                idempotency_key=idempotency_key,
                actor=actor,
                trace_id=trace_id,
                payload={"outcome": outcome, "failureType": failure_type, "stepId": current.stepId},
            )
            updated = self.repository.get_execution_with_conn(conn, execution_id)
            self.repository.enqueue_current_step_outbox_with_conn(conn, execution=updated, reason=event_type)
            return self._with_runtime_summary(
                conn,
                execution=updated,
                event=event,
                duplicate=False,
                actor=actor,
                trace_id=trace_id,
                summary=f"execution {updated.status}",
            )

    def cancel_execution(self, *, execution_id: str, expected_version: int, idempotency_key: str, actor: str, trace_id: str, reason: str | None = None) -> ExecutionWriteResult:
        with execution_transaction(self.repository.db_path) as conn:
            execution = self.repository.get_execution_with_conn(conn, execution_id)
            duplicate = self.repository.get_event_by_idempotency(conn, execution_id, idempotency_key)
            if duplicate:
                return self._with_runtime_summary(
                    conn,
                    execution=execution,
                    event=duplicate,
                    duplicate=True,
                    actor=actor,
                    trace_id=trace_id,
                    summary="duplicate execution cancel",
                )
            if execution.status in TERMINAL_EXECUTION_STATUSES:
                raise ExecutionAlreadyTerminal(executionId=execution_id, status=execution.status)
            if execution.version != expected_version:
                raise ExecutionVersionConflict(executionId=execution_id, expectedVersion=expected_version, actualVersion=execution.version)
            conn.execute(
                """
                UPDATE execution_runs
                SET status = ?, version = version + 1, updated_at = datetime('now'), cancelled_at = datetime('now')
                WHERE execution_id = ?
                """,
                ("cancelled", execution_id),
            )
            event = self.repository.append_event(
                conn,
                execution_id=execution_id,
                event_type="execution_cancelled",
                idempotency_key=idempotency_key,
                actor=actor,
                trace_id=trace_id,
                payload={"reason": reason},
            )
            updated = self.repository.get_execution_with_conn(conn, execution_id)
            return self._with_runtime_summary(
                conn,
                execution=updated,
                event=event,
                duplicate=False,
                actor=actor,
                trace_id=trace_id,
                summary="execution cancelled",
            )

    def _with_runtime_summary(
        self,
        conn,
        *,
        execution,
        event,
        duplicate: bool,
        actor: str,
        trace_id: str,
        summary: str,
    ) -> ExecutionWriteResult:
        if not execution.sessionId or not event:
            return ExecutionWriteResult(
                ok=True,
                execution=execution,
                event=event,
                duplicate=duplicate,
                runtimeSummaryEventStatus="skipped",
            )
        runtime_event_type = EXECUTION_RUNTIME_SUMMARY_BY_EVENT.get(event.type)
        if not runtime_event_type:
            return ExecutionWriteResult(
                ok=True,
                execution=execution,
                event=event,
                duplicate=duplicate,
                runtimeSummaryEventStatus="skipped",
            )
        runtime_result = self.runtime_core.append_execution_summary(
            conn=conn,
            session_id=execution.sessionId,
            event_type=runtime_event_type,
            idempotency_key=f"execution:{execution.executionId}:{event.eventId}",
            actor=actor,
            trace_id=trace_id,
            payload={
                "executionId": execution.executionId,
                "planId": execution.planId,
                "planVersion": execution.planVersion,
                "executionStatus": execution.status,
                "summary": summary,
                "reason": event.payload.get("reason"),
                "errorCode": event.payload.get("failureType"),
            },
        )
        return ExecutionWriteResult(
            ok=True,
            execution=execution,
            event=event,
            duplicate=duplicate,
            runtimeSummaryEvent=runtime_result.event.public_dict() if runtime_result.event else None,
            runtimeSummaryEventStatus="written",
        )

    def _assert_writable(self, execution, expected_version: int, plan_version: int) -> None:
        if execution.status in TERMINAL_EXECUTION_STATUSES:
            raise ExecutionAlreadyTerminal(executionId=execution.executionId, status=execution.status)
        if execution.status != "active":
            raise ExecutionInvalidTransition(executionId=execution.executionId, status=execution.status)
        if execution.version != expected_version:
            raise ExecutionVersionConflict(
                executionId=execution.executionId,
                expectedVersion=expected_version,
                actualVersion=execution.version,
            )
        if execution.planVersion != plan_version:
            raise ExecutionPlanVersionConflict(
                executionId=execution.executionId,
                expectedPlanVersion=plan_version,
                actualPlanVersion=execution.planVersion,
            )
