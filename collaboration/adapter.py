from __future__ import annotations

from pathlib import Path
from typing import Any

from .core import CollaborationCore


class CollaborationAdapter:
    def __init__(self, db_path: Path | str):
        self.core = CollaborationCore(db_path)

    def create_share(self, *, plan_id: str, plan_name: str | None, session_id: str | None, lineage_id: str | None, plan_version: int, snapshot: dict[str, Any], idempotency_key: str, expires_at: str | None = None):
        return self.core.create_share(
            plan_id=plan_id,
            plan_name=plan_name,
            session_id=session_id,
            lineage_id=lineage_id,
            plan_version=plan_version,
            snapshot=snapshot,
            idempotency_key=idempotency_key,
            expires_at=expires_at,
        )

    def get_public_share(self, *, share_id: str, token: str, display_name: str | None = None, role: str | None = None):
        return self.core.get_public_share(share_id=share_id, token=token, display_name=display_name, role=role)

    def submit_feedback(self, *, share_id: str, token: str, display_name: str, role: str, target_type: str, target_id: str | None, reaction: str, comment: str | None):
        return self.core.submit_feedback(
            share_id=share_id,
            token=token,
            display_name=display_name,
            role=role,
            target_type=target_type,
            target_id=target_id,
            reaction=reaction,
            comment=comment,
        )

    def get_owner_share(self, share_id: str):
        return self.core.get_owner_share(share_id)

    def owner_review(self, *, share_id: str, decision: str):
        return self.core.owner_review(share_id=share_id, decision=decision)

    def list_plan_branches(self, *, plan_id: str):
        return self.core.list_plan_branches(plan_id=plan_id)

    def get_plan_branch(self, *, plan_id: str, branch_id: str):
        return self.core.get_plan_branch(plan_id=plan_id, branch_id=branch_id)

    def create_derived_branch(self, *, plan_id: str, source_share_id: str, base_version: int, feedback_ids: list[str] | None, idempotency_key: str, actor: str | None = None):
        return self.core.create_derived_branch(
            plan_id=plan_id,
            source_share_id=source_share_id,
            base_version=base_version,
            feedback_ids=feedback_ids,
            idempotency_key=idempotency_key,
            actor=actor,
        )

    def adopt_plan_branch(self, *, plan_id: str, branch_id: str, expected_version: int, actor: str | None = None):
        return self.core.adopt_plan_branch(plan_id=plan_id, branch_id=branch_id, expected_version=expected_version, actor=actor)

    def reject_plan_branch(self, *, plan_id: str, branch_id: str, actor: str | None = None, reason: str | None = None):
        return self.core.reject_plan_branch(plan_id=plan_id, branch_id=branch_id, actor=actor, reason=reason)

    def rollback_previous_main(self, *, plan_id: str, actor: str | None = None):
        return self.core.rollback_previous_main(plan_id=plan_id, actor=actor)
