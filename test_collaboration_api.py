import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

import server
from collaboration.adapter import CollaborationAdapter
from collaboration.repositories import migrate_collaboration


TEST_TMP_ROOT = Path(__file__).parent / ".pytest_tmp"


def temp_dir():
    TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=TEST_TMP_ROOT)


def runtime_settings(db_path):
    return {
        "base_url": "http://example.test/v1",
        "api_key": "",
        "model": "demo-model",
        "timeout_seconds": 0.01,
        "confidence_threshold": 0.72,
        "db_path": db_path,
    }


def client_with_settings(monkeypatch, db_path):
    monkeypatch.setattr(server, "get_settings", lambda: runtime_settings(db_path))
    return TestClient(server.app)


def table_names(db_path):
    conn = sqlite3.connect(db_path)
    try:
        return {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
    finally:
        conn.close()


def sample_snapshot():
    return {
        "selectedPlan": {
            "name": "亲子轻松：探索公园 + 健康晚餐",
            "score": 84,
            "durationText": "4.8 小时",
            "budgetText": "约 264 元 / 3 人",
            "cards": [
                {"type": "activity", "title": "河畔亲子探索公园"},
                {"type": "restaurant", "title": "绿野轻食餐厅"},
            ],
        },
        "candidateSummaries": [
            {"name": "短途稳妥：公园放电 + 茶餐厅", "score": 76, "rank": 1}
        ],
    }


def create_share(client, *, expires_at=None):
    body = {
        "sessionId": "session-a",
        "lineageId": "lineage-a",
        "planVersion": 2,
        "planName": "亲子轻松：探索公园 + 健康晚餐",
        "snapshot": sample_snapshot(),
        "idempotencyKey": "create-share-a",
    }
    if expires_at:
        body["expiresAt"] = expires_at
    return client.post("/api/plans/plan-a/share", json=body)


def test_collaboration_migration_is_idempotent_and_independent():
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"

        migrate_collaboration(db_path)
        migrate_collaboration(db_path)

        assert {
            "shares",
            "share_reviewers",
            "share_feedback",
            "share_owner_reviews",
            "collaboration_events",
            "collaboration_schema_migrations",
        }.issubset(table_names(db_path))


def test_create_share_hashes_token_and_owner_can_read(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        client = client_with_settings(monkeypatch, db_path)

        created = create_share(client)

        assert created.status_code == 200
        data = created.json()
        assert data["ok"] is True
        assert data["share"]["planId"] == "plan-a"
        assert data["share"]["planVersion"] == 2
        assert data["shareUrl"].startswith("/share/")
        assert "token=" in data["shareUrl"]

        conn = sqlite3.connect(db_path)
        try:
            row = conn.execute("SELECT token_hash FROM shares WHERE share_id = ?", (data["share"]["shareId"],)).fetchone()
            assert row[0] != data["token"]
        finally:
            conn.close()

        owner = client.get(f"/api/shares/{data['share']['shareId']}/owner")
        assert owner.status_code == 200
        assert owner.json()["share"]["planName"] == "亲子轻松：探索公园 + 健康晚餐"


def test_public_share_requires_valid_token_and_marks_viewed(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        client = client_with_settings(monkeypatch, db_path)
        created = create_share(client).json()
        share_id = created["share"]["shareId"]
        token = created["token"]

        bad = client.get(f"/api/shares/{share_id}?token=wrong")
        assert bad.status_code == 403
        assert bad.json()["error"] == "share_token_invalid"

        viewed = client.get(f"/api/shares/{share_id}?token={token}&displayName=老婆&role=partner")
        assert viewed.status_code == 200
        body = viewed.json()
        assert body["reviewers"][0]["displayName"] == "老婆"
        assert body["reviewers"][0]["status"] == "viewed"


def test_feedback_create_update_owner_review_and_events(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        client = client_with_settings(monkeypatch, db_path)
        created = create_share(client).json()
        share_id = created["share"]["shareId"]
        token = created["token"]

        first = client.post(
            f"/api/shares/{share_id}/feedback?token={token}",
            json={
                "displayName": "老婆",
                "role": "partner",
                "targetType": "restaurant",
                "targetId": "restaurant-1",
                "reaction": "concern",
                "comment": "想吃得更清淡一点",
            },
        )
        assert first.status_code == 200
        assert first.json()["needsOwnerReview"] is True
        feedback_id = first.json()["feedback"][0]["feedbackId"]

        updated = client.post(
            f"/api/shares/{share_id}/feedback?token={token}",
            json={
                "displayName": "老婆",
                "role": "partner",
                "targetType": "restaurant",
                "targetId": "restaurant-1",
                "reaction": "restaurant_ok",
                "comment": "这个餐厅可以",
            },
        )
        assert updated.status_code == 200
        assert updated.json()["feedback"][0]["feedbackId"] == feedback_id
        assert updated.json()["feedback"][0]["reaction"] == "restaurant_ok"

        review = client.post(f"/api/shares/{share_id}/owner-review", json={"decision": "continue_current_version"})
        assert review.status_code == 200
        assert review.json()["needsOwnerReview"] is False
        assert review.json()["ownerReviews"][0]["decision"] == "continue_current_version"

        events = CollaborationAdapter(db_path).core.repository.list_events(share_id)
        assert [event.eventType for event in events] == [
            "share_created",
            "share_viewed",
            "feedback_created",
            "feedback_updated",
            "owner_reviewed",
        ]


def test_expired_share_is_readonly_for_feedback(monkeypatch):
    with temp_dir() as tmp:
        db_path = Path(tmp) / "agent_memory.sqlite"
        client = client_with_settings(monkeypatch, db_path)
        expires_at = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        created = create_share(client, expires_at=expires_at).json()
        share_id = created["share"]["shareId"]
        token = created["token"]

        view = client.get(f"/api/shares/{share_id}?token={token}")
        assert view.status_code == 200
        assert view.json()["readOnly"] is True

        feedback = client.post(
            f"/api/shares/{share_id}/feedback?token={token}",
            json={
                "displayName": "朋友A",
                "role": "friend",
                "targetType": "whole_plan",
                "reaction": "like",
            },
        )
        assert feedback.status_code == 410
        assert feedback.json()["error"] == "share_readonly"
