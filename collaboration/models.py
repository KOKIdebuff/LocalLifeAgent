from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4


COLLABORATION_SCHEMA_VERSION = "collaboration-p0-schema-1"
COLLABORATION_EVENT_VERSION = "collaboration-events-1"
CONCERN_REACTIONS = {"concern", "dislike"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_expires_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


@dataclass(frozen=True)
class ShareRecord:
    shareId: str
    planId: str
    planName: str | None
    sessionId: str | None
    lineageId: str | None
    planVersion: int
    snapshot: dict[str, Any]
    status: str
    expiresAt: str
    createdAt: str
    updatedAt: str
    schemaVersion: str

    def public_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["snapshot"] = self.snapshot
        return data


@dataclass(frozen=True)
class ShareReviewer:
    reviewerId: str
    shareId: str
    displayName: str
    role: str
    status: str
    viewedAt: str | None
    lastFeedbackAt: str | None
    createdAt: str
    updatedAt: str

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ShareFeedback:
    feedbackId: str
    shareId: str
    reviewerId: str
    targetType: str
    targetId: str | None
    reaction: str
    comment: str | None
    isLatest: bool
    createdAt: str
    updatedAt: str

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class OwnerReview:
    reviewId: str
    shareId: str
    decision: str
    feedbackIds: list[str]
    createdAt: str

    def public_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["feedbackIds"] = list(self.feedbackIds)
        return data


@dataclass(frozen=True)
class CollaborationEvent:
    eventId: str
    shareId: str
    eventType: str
    eventVersion: str
    actorType: str
    payload: dict[str, Any]
    createdAt: str

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ShareState:
    share: ShareRecord
    reviewers: list[ShareReviewer]
    feedback: list[ShareFeedback]
    ownerReviews: list[OwnerReview]
    readOnly: bool

    def has_unreviewed_concern(self) -> bool:
        reviewed = {feedback_id for review in self.ownerReviews for feedback_id in review.feedbackIds}
        return any(item.reaction in CONCERN_REACTIONS and item.feedbackId not in reviewed for item in self.feedback)

    def public_dict(self) -> dict[str, Any]:
        return {
            "share": self.share.public_dict(),
            "reviewers": [item.public_dict() for item in self.reviewers],
            "feedback": [item.public_dict() for item in self.feedback],
            "ownerReviews": [item.public_dict() for item in self.ownerReviews],
            "readOnly": self.readOnly,
            "needsOwnerReview": self.has_unreviewed_concern(),
        }
