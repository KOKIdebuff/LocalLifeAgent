from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .errors import ShareReadOnly, ShareTokenInvalid
from .models import ShareState, default_expires_at
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

    def _assert_token(self, share_id: str, token: str) -> None:
        if not token:
            raise ShareTokenInvalid(shareId=share_id)
        expected = self.repository.get_token_hash_for_share(share_id)
        if not hmac.compare_digest(expected, hash_token(token)):
            raise ShareTokenInvalid(shareId=share_id)
