from __future__ import annotations

import hashlib
import hmac
import copy
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .errors import PlanBranchSourceMismatch, ShareReadOnly, ShareTokenInvalid
from .models import PlanBranch, ShareState, default_expires_at
from .repositories import CollaborationRepository


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def is_expired(expires_at: str) -> bool:
    try:
        expiry = datetime.fromisoformat(expires_at)
    except ValueError:
        return True
    if expiry.tzinfo is None:
      expiry = expiry.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expiry


class CollaborationCore:
    def __init__(self, db_path: Path | str):
        self.repository = CollaborationRepository(db_path)

    def create_share(
        self,
        *,
        plan_id: str,
        plan_name: str | None,
        session_id: str | None,
        lineage_id: str | None,
        plan_version: int,
        snapshot: dict[str, Any],
        idempotency_key: str,
        expires_at: str | None = None,
    ) -> dict[str, Any]:
        token = secrets.token_urlsafe(24)
        state, duplicate = self.repository.create_share(
            plan_id=plan_id,
            plan_name=plan_name,
            session_id=session_id,
            lineage_id=lineage_id,
            plan_version=plan_version,
            snapshot=snapshot,
            token_hash=hash_token(token),
            expires_at=expires_at or default_expires_at(),
            idempotency_key=idempotency_key,
        )
        data = state.public_dict()
        data.update({
            "ok": True,
            "duplicate": duplicate,
            "token": token,
        })
        return data

    def get_public_share(self, *, share_id: str, token: str, display_name: str | None = None, role: str | None = None) -> ShareState:
        self._assert_token(share_id, token)
        state = self.repository.get_state(share_id, read_only=False)
        read_only = is_expired(state.share.expiresAt)
        viewed = self.repository.mark_viewed(
            share_id=share_id,
            display_name=display_name or "家人朋友",
            role=role or "family",
        )
        return ShareState(viewed.share, viewed.reviewers, viewed.feedback, viewed.ownerReviews, read_only)

    def submit_feedback(
        self,
        *,
        share_id: str,
        token: str,
        display_name: str,
        role: str,
        target_type: str,
        target_id: str | None,
        reaction: str,
        comment: str | None,
    ) -> ShareState:
        self._assert_token(share_id, token)
        current = self.repository.get_state(share_id)
        if is_expired(current.share.expiresAt):
            raise ShareReadOnly(shareId=share_id)
        return self.repository.submit_feedback(
            share_id=share_id,
            display_name=display_name,
            role=role,
            target_type=target_type,
            target_id=target_id,
            reaction=reaction,
            comment=comment,
        )

    def get_owner_share(self, share_id: str) -> ShareState:
        state = self.repository.get_state(share_id)
        return ShareState(state.share, state.reviewers, state.feedback, state.ownerReviews, is_expired(state.share.expiresAt))

    def owner_review(self, *, share_id: str, decision: str) -> ShareState:
        return self.repository.create_owner_review(share_id=share_id, decision=decision)

    def list_plan_branches(self, *, plan_id: str) -> dict[str, Any]:
        branches = self.repository.list_plan_branches(plan_id)
        return self._branches_payload(branches)

    def get_plan_branch(self, *, plan_id: str, branch_id: str) -> dict[str, Any]:
        branch = self.repository.get_plan_branch(plan_id=plan_id, branch_id=branch_id)
        branches = self.repository.list_plan_branches(plan_id)
        data = self._branches_payload(branches)
        data["branch"] = branch.public_dict()
        return data

    def create_derived_branch(
        self,
        *,
        plan_id: str,
        source_share_id: str,
        base_version: int,
        feedback_ids: list[str] | None,
        idempotency_key: str,
        actor: str | None = None,
    ) -> dict[str, Any]:
        state = self.repository.get_state(source_share_id)
        if state.share.planId != plan_id:
            raise PlanBranchSourceMismatch(planId=plan_id, sourcePlanId=state.share.planId)
        feedback_id_set = set(feedback_ids or [])
        selected_feedback = [
            item for item in state.feedback
            if not feedback_id_set or item.feedbackId in feedback_id_set
        ]
        chosen_feedback_ids = [item.feedbackId for item in selected_feedback]
        diff_summary = self._feedback_diff_summary(selected_feedback)
        derived_snapshot = self._build_derived_snapshot(
            state.share.snapshot,
            base_version=base_version,
            diff_summary=diff_summary,
        )
        branch, duplicate = self.repository.create_derived_branch(
            plan_id=plan_id,
            source_share_id=source_share_id,
            base_version=base_version,
            snapshot=derived_snapshot,
            lineage_id=state.share.lineageId,
            feedback_ids=chosen_feedback_ids,
            diff_summary=diff_summary,
            idempotency_key=idempotency_key,
            actor=actor or "owner",
        )
        data = self._branches_payload(self.repository.list_plan_branches(plan_id))
        data["branch"] = branch.public_dict()
        data["duplicate"] = duplicate
        return data

    def adopt_plan_branch(self, *, plan_id: str, branch_id: str, expected_version: int, actor: str | None = None) -> dict[str, Any]:
        branch = self.repository.adopt_plan_branch(
            plan_id=plan_id,
            branch_id=branch_id,
            expected_version=expected_version,
            actor=actor or "owner",
        )
        data = self._branches_payload(self.repository.list_plan_branches(plan_id))
        data["branch"] = branch.public_dict()
        return data

    def reject_plan_branch(self, *, plan_id: str, branch_id: str, actor: str | None = None, reason: str | None = None) -> dict[str, Any]:
        branch = self.repository.reject_plan_branch(
            plan_id=plan_id,
            branch_id=branch_id,
            actor=actor or "owner",
            reason=reason,
        )
        data = self._branches_payload(self.repository.list_plan_branches(plan_id))
        data["branch"] = branch.public_dict()
        return data

    def rollback_previous_main(self, *, plan_id: str, actor: str | None = None) -> dict[str, Any]:
        branch = self.repository.rollback_previous_main(plan_id=plan_id, actor=actor or "owner")
        data = self._branches_payload(self.repository.list_plan_branches(plan_id))
        data["branch"] = branch.public_dict()
        return data

    def _assert_token(self, share_id: str, token: str) -> None:
        if not token:
            raise ShareTokenInvalid(shareId=share_id)
        expected = self.repository.get_token_hash_for_share(share_id)
        if not hmac.compare_digest(expected, hash_token(token)):
            raise ShareTokenInvalid(shareId=share_id)

    def _branches_payload(self, branches: list[PlanBranch]) -> dict[str, Any]:
        main = next((item for item in branches if item.branchType == "main" and item.status == "adopted"), None)
        derived = [
            item for item in branches
            if item.branchType == "derived" or item.status in {"proposed", "rejected"}
        ]
        return {
            "ok": True,
            "mainBranch": main.public_dict() if main else None,
            "derivedBranches": [item.public_dict() for item in derived],
            "branches": [item.public_dict() for item in branches],
        }

    def _build_derived_snapshot(self, snapshot: dict[str, Any], *, base_version: int, diff_summary: list[dict[str, Any]]) -> dict[str, Any]:
        next_snapshot = copy.deepcopy(snapshot or {})
        selected = dict(next_snapshot.get("selectedPlan") or {})
        base_name = selected.get("name") or next_snapshot.get("planName") or "调整后的方案"
        selected["name"] = f"{base_name}（待采纳调整）"
        selected["version"] = base_version + 1
        selected["branchNote"] = "已根据协同反馈生成待采纳调整，采纳前不会覆盖当前方案。"
        selected["diffSummary"] = diff_summary
        if diff_summary:
            selected["riskText"] = "；".join(item["summary"] for item in diff_summary[:3])
        next_snapshot["selectedPlan"] = selected
        next_snapshot["branchGeneratedFrom"] = "share_feedback"
        return next_snapshot

    def _feedback_diff_summary(self, feedback: list[Any]) -> list[dict[str, Any]]:
        if not feedback:
            return [{
                "targetType": "whole_plan",
                "targetId": None,
                "reaction": "comment",
                "summary": "没有新的具体反馈，保留当前方案作为待确认调整。",
            }]
        return [self._feedback_diff_item(item) for item in feedback]

    def _feedback_diff_item(self, item: Any) -> dict[str, Any]:
        target_labels = {
            "whole_plan": "整份方案",
            "activity": "活动",
            "restaurant": "餐厅",
            "transport": "交通",
            "timeline": "时间安排",
            "budget": "预算",
        }
        reaction_labels = {
            "like": "保留认可点",
            "concern": "降低担心点",
            "restaurant_ok": "保留餐厅选择",
            "comment": "吸收留言",
            "dislike": "替换不合适内容",
        }
        target = target_labels.get(item.targetType, "方案")
        action = reaction_labels.get(item.reaction, "吸收反馈")
        comment = (item.comment or "").strip()
        summary = f"{target}：{action}"
        if comment:
            summary += f" - {comment[:120]}"
        return {
            "feedbackId": item.feedbackId,
            "targetType": item.targetType,
            "targetId": item.targetId,
            "reaction": item.reaction,
            "summary": summary,
        }
