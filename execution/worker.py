from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from .core import ExecutionCore
from .models import TERMINAL_EXECUTION_STATUSES
from .repositories import ExecutionRepository


def _safe_error(exc: Exception) -> str:
    return f"{type(exc).__name__}: {str(exc)[:300]}"


@dataclass
class ExecutionOutboxDrainResult:
    ok: bool
    claimed: int = 0
    completed: int = 0
    skipped: int = 0
    failed: int = 0
    items: list[dict[str, Any]] = field(default_factory=list)

    def public_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "claimed": self.claimed,
            "completed": self.completed,
            "skipped": self.skipped,
            "failed": self.failed,
            "items": self.items,
        }


class ExecutionWorker:
    def __init__(self, db_path: Path | str):
        self.repository = ExecutionRepository(db_path)
        self.core = ExecutionCore(db_path)

    def drain_outbox(self, *, limit: int = 10, actor: str = "execution_worker", trace_id: str | None = None) -> ExecutionOutboxDrainResult:
        worker_trace = trace_id or f"execution_worker_trace_{uuid4().hex}"
        claimed = self.repository.claim_pending_outbox(limit=limit, worker_id=actor)
        result = ExecutionOutboxDrainResult(ok=True, claimed=len(claimed))
        for item in claimed:
            outcome = self._process_item(item, actor=actor, trace_id=worker_trace)
            result.items.append(outcome)
            if outcome["status"] == "completed":
                result.completed += 1
            elif outcome["status"] == "skipped":
                result.skipped += 1
            else:
                result.failed += 1
                result.ok = False
        return result

    def _process_item(self, item, *, actor: str, trace_id: str) -> dict[str, Any]:
        try:
            execution = self.core.get_execution(item.executionId)
            if execution.status in TERMINAL_EXECUTION_STATUSES:
                updated = self.repository.mark_outbox_skipped(item.outboxId, "execution_terminal")
                return self._item_result(item, "skipped", updated.lastError if updated else "execution_terminal")
            if execution.status != "active":
                updated = self.repository.mark_outbox_skipped(item.outboxId, "execution_not_active")
                return self._item_result(item, "skipped", updated.lastError if updated else "execution_not_active")
            if execution.currentStepId != item.stepId:
                updated = self.repository.mark_outbox_skipped(item.outboxId, "current_step_changed")
                return self._item_result(item, "skipped", updated.lastError if updated else "current_step_changed")
            self.core.advance_execution(
                execution_id=execution.executionId,
                expected_version=execution.version,
                plan_version=execution.planVersion,
                idempotency_key=f"outbox:{item.outboxId}",
                outcome="succeeded",
                actor=actor,
                trace_id=trace_id,
            )
            self.repository.mark_outbox_completed(item.outboxId)
            return self._item_result(item, "completed", None)
        except Exception as exc:
            error = _safe_error(exc)
            updated = self.repository.mark_outbox_failed(item.outboxId, error)
            return self._item_result(item, updated.status if updated else "failed", error)

    def _item_result(self, item, status: str, error: str | None) -> dict[str, Any]:
        data = {
            "outboxId": item.outboxId,
            "executionId": item.executionId,
            "stepId": item.stepId,
            "status": status,
        }
        if error:
            data["error"] = error
        return data
