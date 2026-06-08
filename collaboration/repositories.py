from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .errors import ShareNotFound
from .models import (
    COLLABORATION_EVENT_VERSION,
    COLLABORATION_SCHEMA_VERSION,
    CollaborationEvent,
    OwnerReview,
    ShareFeedback,
    ShareRecord,
    ShareReviewer,
    ShareState,
    new_id,
    utc_now,
)


MIGRATION_VERSION = "collaboration-sqlite-v1"


def connect(db_path: Path | str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def migrate_collaboration(db_path: Path | str) -> None:
    conn = connect(db_path)
    try:
        _migrate(conn)
        conn.commit()
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS collaboration_schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS shares (
          share_id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL,
          create_idempotency_key TEXT NOT NULL UNIQUE,
          session_id TEXT,
          plan_id TEXT NOT NULL,
          plan_name TEXT,
          lineage_id TEXT,
          plan_version INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          status TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS share_reviewers (
          reviewer_id TEXT PRIMARY KEY,
          share_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL,
          viewed_at TEXT,
          last_feedback_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(share_id) REFERENCES shares(share_id),
          UNIQUE(share_id, display_name)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS share_feedback (
          feedback_id TEXT PRIMARY KEY,
          share_id TEXT NOT NULL,
          reviewer_id TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT,
          reaction TEXT NOT NULL,
          comment TEXT,
          is_latest INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(share_id) REFERENCES shares(share_id),
          FOREIGN KEY(reviewer_id) REFERENCES share_reviewers(reviewer_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS share_owner_reviews (
          review_id TEXT PRIMARY KEY,
          share_id TEXT NOT NULL,
          feedback_ids_json TEXT NOT NULL,
          decision TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(share_id) REFERENCES shares(share_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS collaboration_events (
          event_id TEXT PRIMARY KEY,
          share_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_version TEXT NOT NULL,
          actor_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(share_id) REFERENCES shares(share_id)
        )
        """
    )
    conn.execute(
        "INSERT OR IGNORE INTO collaboration_schema_migrations (version, applied_at) VALUES (?, ?)",
        (MIGRATION_VERSION, utc_now()),
    )


@contextmanager
def collaboration_transaction(db_path: Path | str) -> Iterator[sqlite3.Connection]:
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


def _json(data: dict[str, Any] | list[Any]) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True)


def _share_from_row(row: sqlite3.Row) -> ShareRecord:
    return ShareRecord(
        shareId=row["share_id"],
        planId=row["plan_id"],
        planName=row["plan_name"],
        sessionId=row["session_id"],
        lineageId=row["lineage_id"],
        planVersion=row["plan_version"],
        snapshot=json.loads(row["snapshot_json"] or "{}"),
        status=row["status"],
        expiresAt=row["expires_at"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        schemaVersion=row["schema_version"],
    )


def _reviewer_from_row(row: sqlite3.Row) -> ShareReviewer:
    return ShareReviewer(
        reviewerId=row["reviewer_id"],
        shareId=row["share_id"],
        displayName=row["display_name"],
        role=row["role"],
        status=row["status"],
        viewedAt=row["viewed_at"],
        lastFeedbackAt=row["last_feedback_at"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def _feedback_from_row(row: sqlite3.Row) -> ShareFeedback:
    return ShareFeedback(
        feedbackId=row["feedback_id"],
        shareId=row["share_id"],
        reviewerId=row["reviewer_id"],
        targetType=row["target_type"],
        targetId=row["target_id"],
        reaction=row["reaction"],
        comment=row["comment"],
        isLatest=bool(row["is_latest"]),
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def _owner_review_from_row(row: sqlite3.Row) -> OwnerReview:
    return OwnerReview(
        reviewId=row["review_id"],
        shareId=row["share_id"],
        decision=row["decision"],
        feedbackIds=json.loads(row["feedback_ids_json"] or "[]"),
        createdAt=row["created_at"],
    )


def _event_from_row(row: sqlite3.Row) -> CollaborationEvent:
    return CollaborationEvent(
        eventId=row["event_id"],
        shareId=row["share_id"],
        eventType=row["event_type"],
        eventVersion=row["event_version"],
        actorType=row["actor_type"],
        payload=json.loads(row["payload_json"] or "{}"),
        createdAt=row["created_at"],
    )


class CollaborationRepository:
    def __init__(self, db_path: Path | str):
        self.db_path = db_path

    def migrate(self) -> None:
        migrate_collaboration(self.db_path)

    def get_token_hash(self, conn: sqlite3.Connection, share_id: str) -> str:
        row = conn.execute("SELECT token_hash FROM shares WHERE share_id = ?", (share_id,)).fetchone()
        if not row:
            raise ShareNotFound(shareId=share_id)
        return row["token_hash"]

    def get_token_hash_for_share(self, share_id: str) -> str:
        conn = connect(self.db_path)
        try:
            _migrate(conn)
            return self.get_token_hash(conn, share_id)
        finally:
            conn.close()

    def get_state_with_conn(self, conn: sqlite3.Connection, share_id: str, read_only: bool = False) -> ShareState:
        row = conn.execute("SELECT * FROM shares WHERE share_id = ?", (share_id,)).fetchone()
        if not row:
            raise ShareNotFound(shareId=share_id)
        reviewers = [
            _reviewer_from_row(item)
            for item in conn.execute(
                "SELECT * FROM share_reviewers WHERE share_id = ? ORDER BY created_at ASC",
                (share_id,),
            ).fetchall()
        ]
        feedback = [
            _feedback_from_row(item)
            for item in conn.execute(
                "SELECT * FROM share_feedback WHERE share_id = ? AND is_latest = 1 ORDER BY updated_at DESC",
                (share_id,),
            ).fetchall()
        ]
        reviews = [
            _owner_review_from_row(item)
            for item in conn.execute(
                "SELECT * FROM share_owner_reviews WHERE share_id = ? ORDER BY created_at DESC",
                (share_id,),
            ).fetchall()
        ]
        return ShareState(_share_from_row(row), reviewers, feedback, reviews, read_only)

    def get_state(self, share_id: str, read_only: bool = False) -> ShareState:
        conn = connect(self.db_path)
        try:
            _migrate(conn)
            return self.get_state_with_conn(conn, share_id, read_only)
        finally:
            conn.close()

    def create_share(
        self,
        *,
        plan_id: str,
        plan_name: str | None,
        session_id: str | None,
        lineage_id: str | None,
        plan_version: int,
        snapshot: dict[str, Any],
        token_hash: str,
        expires_at: str,
        idempotency_key: str,
    ) -> tuple[ShareState, bool]:
        with collaboration_transaction(self.db_path) as conn:
            existing = conn.execute(
                "SELECT share_id FROM shares WHERE create_idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if existing:
                return self.get_state_with_conn(conn, existing["share_id"]), True
            now = utc_now()
            share_id = new_id("share")
            conn.execute(
                """
                INSERT INTO shares
                  (share_id, token_hash, create_idempotency_key, session_id, plan_id,
                   plan_name, lineage_id, plan_version, snapshot_json, status,
                   expires_at, schema_version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    share_id,
                    token_hash,
                    idempotency_key,
                    session_id,
                    plan_id,
                    plan_name,
                    lineage_id,
                    plan_version,
                    _json(snapshot),
                    "active",
                    expires_at,
                    COLLABORATION_SCHEMA_VERSION,
                    now,
                    now,
                ),
            )
            self.append_event(
                conn,
                share_id=share_id,
                event_type="share_created",
                actor_type="owner",
                payload={"planId": plan_id, "planVersion": plan_version},
            )
            return self.get_state_with_conn(conn, share_id), False

    def mark_viewed(self, *, share_id: str, display_name: str, role: str) -> ShareState:
        with collaboration_transaction(self.db_path) as conn:
            reviewer = self.upsert_reviewer_with_conn(conn, share_id=share_id, display_name=display_name, role=role, viewed=True)
            self.append_event(
                conn,
                share_id=share_id,
                event_type="share_viewed",
                actor_type="collaborator",
                payload={"reviewerId": reviewer.reviewerId},
            )
            return self.get_state_with_conn(conn, share_id)

    def submit_feedback(
        self,
        *,
        share_id: str,
        display_name: str,
        role: str,
        target_type: str,
        target_id: str | None,
        reaction: str,
        comment: str | None,
    ) -> ShareState:
        with collaboration_transaction(self.db_path) as conn:
            normalized_name = (display_name or "家人朋友").strip()[:80] or "家人朋友"
            before_view = conn.execute(
                "SELECT reviewer_id, viewed_at FROM share_reviewers WHERE share_id = ? AND display_name = ?",
                (share_id, normalized_name),
            ).fetchone()
            reviewer = self.upsert_reviewer_with_conn(conn, share_id=share_id, display_name=display_name, role=role, viewed=True)
            if not before_view or not before_view["viewed_at"]:
                self.append_event(
                    conn,
                    share_id=share_id,
                    event_type="share_viewed",
                    actor_type="collaborator",
                    payload={"reviewerId": reviewer.reviewerId},
                )
            now = utc_now()
            existing = conn.execute(
                """
                SELECT feedback_id FROM share_feedback
                WHERE share_id = ? AND reviewer_id = ? AND target_type = ? AND COALESCE(target_id, '') = COALESCE(?, '') AND is_latest = 1
                """,
                (share_id, reviewer.reviewerId, target_type, target_id),
            ).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE share_feedback
                    SET reaction = ?, comment = ?, updated_at = ?
                    WHERE feedback_id = ?
                    """,
                    (reaction, comment, now, existing["feedback_id"]),
                )
                feedback_id = existing["feedback_id"]
                event_type = "feedback_updated"
            else:
                feedback_id = new_id("feedback")
                conn.execute(
                    """
                    INSERT INTO share_feedback
                      (feedback_id, share_id, reviewer_id, target_type, target_id,
                       reaction, comment, is_latest, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (feedback_id, share_id, reviewer.reviewerId, target_type, target_id, reaction, comment, 1, now, now),
                )
                event_type = "feedback_created"
            conn.execute(
                """
                UPDATE share_reviewers
                SET status = ?, last_feedback_at = ?, updated_at = ?
                WHERE reviewer_id = ?
                """,
                ("feedback_submitted", now, now, reviewer.reviewerId),
            )
            conn.execute("UPDATE shares SET updated_at = ? WHERE share_id = ?", (now, share_id))
            self.append_event(
                conn,
                share_id=share_id,
                event_type=event_type,
                actor_type="collaborator",
                payload={"reviewerId": reviewer.reviewerId, "feedbackId": feedback_id, "reaction": reaction, "targetType": target_type},
            )
            return self.get_state_with_conn(conn, share_id)

    def create_owner_review(self, *, share_id: str, decision: str) -> ShareState:
        with collaboration_transaction(self.db_path) as conn:
            state = self.get_state_with_conn(conn, share_id)
            feedback_ids = [item.feedbackId for item in state.feedback]
            review_id = new_id("review")
            now = utc_now()
            conn.execute(
                """
                INSERT INTO share_owner_reviews
                  (review_id, share_id, feedback_ids_json, decision, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (review_id, share_id, _json(feedback_ids), decision, now),
            )
            conn.execute("UPDATE shares SET updated_at = ? WHERE share_id = ?", (now, share_id))
            self.append_event(
                conn,
                share_id=share_id,
                event_type="owner_reviewed",
                actor_type="owner",
                payload={"decision": decision, "feedbackCount": len(feedback_ids)},
            )
            return self.get_state_with_conn(conn, share_id)

    def upsert_reviewer_with_conn(self, conn: sqlite3.Connection, *, share_id: str, display_name: str, role: str, viewed: bool) -> ShareReviewer:
        self.get_state_with_conn(conn, share_id)
        normalized_name = (display_name or "家人朋友").strip()[:80] or "家人朋友"
        normalized_role = (role or "family").strip()[:40] or "family"
        existing = conn.execute(
            "SELECT * FROM share_reviewers WHERE share_id = ? AND display_name = ?",
            (share_id, normalized_name),
        ).fetchone()
        now = utc_now()
        if existing:
            viewed_at = existing["viewed_at"] or (now if viewed else None)
            status = existing["status"]
            if viewed and status == "invited":
                status = "viewed"
            conn.execute(
                """
                UPDATE share_reviewers
                SET role = ?, status = ?, viewed_at = ?, updated_at = ?
                WHERE reviewer_id = ?
                """,
                (normalized_role, status, viewed_at, now, existing["reviewer_id"]),
            )
            return _reviewer_from_row(conn.execute("SELECT * FROM share_reviewers WHERE reviewer_id = ?", (existing["reviewer_id"],)).fetchone())
        reviewer_id = new_id("reviewer")
        conn.execute(
            """
            INSERT INTO share_reviewers
              (reviewer_id, share_id, display_name, role, status,
               viewed_at, last_feedback_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (reviewer_id, share_id, normalized_name, normalized_role, "viewed" if viewed else "invited", now if viewed else None, None, now, now),
        )
        return _reviewer_from_row(conn.execute("SELECT * FROM share_reviewers WHERE reviewer_id = ?", (reviewer_id,)).fetchone())

    def append_event(self, conn: sqlite3.Connection, *, share_id: str, event_type: str, actor_type: str, payload: dict[str, Any]) -> CollaborationEvent:
        event = CollaborationEvent(
            eventId=new_id("collaboration_event"),
            shareId=share_id,
            eventType=event_type,
            eventVersion=COLLABORATION_EVENT_VERSION,
            actorType=actor_type,
            payload=payload,
            createdAt=utc_now(),
        )
        conn.execute(
            """
            INSERT INTO collaboration_events
              (event_id, share_id, event_type, event_version, actor_type,
               payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (event.eventId, event.shareId, event.eventType, event.eventVersion, event.actorType, _json(payload), event.createdAt),
        )
        return event

    def list_events(self, share_id: str) -> list[CollaborationEvent]:
        conn = connect(self.db_path)
        try:
            _migrate(conn)
            return [
                _event_from_row(row)
                for row in conn.execute(
                    "SELECT * FROM collaboration_events WHERE share_id = ? ORDER BY created_at ASC",
                    (share_id,),
                ).fetchall()
            ]
        finally:
            conn.close()
