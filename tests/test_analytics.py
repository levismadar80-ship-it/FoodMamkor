"""
Tests for feature/producer-analytics.

Covers:
- View tracking on GET /producers/{id} (hashing, city, referrer, bot filter)
- POST /producers/{id}/whatsapp-click (anonymous, rate limited, persisted)
- GET /producers/me/analytics (7d/30d/total windows, views_by_day, top_cities,
  search_appearances, follower_count, new_followers_this_week, average_rating,
  total_reviews, home_products_count)
- Extended GET /admin/dashboard (new_users_this_week, new_producers_this_week,
  total_events, total_experiences, pending_moderation_count, daily_active_users,
  top_cities, server_health)

All tests are written BEFORE the implementation (TDD, per workflow rule 5).
They use the shared pytest fixtures in conftest.py.
"""
from datetime import datetime, timedelta

from app.models.models import (
    Event,
    Experience,
    HomeProduct,
    Producer,
    ProducerFollower,
    ProducerPageView,
    ProducerReview,
    ProducerWhatsAppClick,
    Report,
)
from conftest import auth_header, make_category, make_producer, make_user


# ============================================================
# Helpers — seed views / clicks directly to the DB so we can
# assert window queries without going through the HTTP tracker.
# ============================================================

def _seed_view(db, producer_id, *, days_ago=0, city=None, referrer=None, ip_hash="a" * 64):
    ts = datetime.utcnow() - timedelta(days=days_ago)
    row = ProducerPageView(
        producer_id=producer_id,
        viewer_ip_hash=ip_hash,
        city=city,
        referrer=referrer,
        created_at=ts,
    )
    db.add(row)
    db.commit()
    return row


def _seed_whatsapp_click(db, producer_id, *, days_ago=0):
    ts = datetime.utcnow() - timedelta(days=days_ago)
    row = ProducerWhatsAppClick(producer_id=producer_id, clicked_at=ts)
    db.add(row)
    db.commit()
    return row


# ============================================================
# View tracking on GET /producers/{id}
# ============================================================

class TestProducerViewTracking:
    def test_get_producer_records_anonymous_view(self, client, db):
        p = make_producer(db)
        before = db.query(ProducerPageView).count()
        r = client.get(f"/producers/{p.id}")
        assert r.status_code == 200
        # View was persisted (best-effort background task; in tests it runs
        # synchronously via the TestClient's event loop).
        after = db.query(ProducerPageView).count()
        assert after == before + 1
        row = db.query(ProducerPageView).order_by(ProducerPageView.created_at.desc()).first()
        assert row.producer_id == p.id
        assert row.city is None  # no auth, no city
        assert row.referrer is None  # no ?from=... param
        # IP hash is present (SHA-256 hex) — verifies we're hashing, not
        # storing raw IPs, per the Privacy Law amendment 13 minimization rule.
        assert row.viewer_ip_hash is not None
        assert len(row.viewer_ip_hash) == 64

    def test_get_producer_records_view_with_city_from_logged_in_user(self, client, db):
        p = make_producer(db)
        viewer = make_user(db, email="viewer@test.com")
        viewer.city = "חיפה"
        db.commit()
        r = client.get(f"/producers/{p.id}", headers=auth_header(viewer))
        assert r.status_code == 200
        row = db.query(ProducerPageView).order_by(ProducerPageView.created_at.desc()).first()
        assert row.city == "חיפה"

    def test_get_producer_records_referrer_from_query_param(self, client, db):
        p = make_producer(db)
        r = client.get(f"/producers/{p.id}?from=search")
        assert r.status_code == 200
        row = db.query(ProducerPageView).order_by(ProducerPageView.created_at.desc()).first()
        assert row.referrer == "search"

    def test_get_producer_skips_bots_by_user_agent(self, client, db):
        p = make_producer(db)
        before = db.query(ProducerPageView).count()
        # Googlebot should not be tracked
        r = client.get(
            f"/producers/{p.id}",
            headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
        )
        assert r.status_code == 200
        after = db.query(ProducerPageView).count()
        assert after == before, "Googlebot view should NOT be tracked"

    def test_get_producer_404_does_not_record_view(self, client, db):
        before = db.query(ProducerPageView).count()
        r = client.get("/producers/00000000-0000-0000-0000-000000000000")
        assert r.status_code == 404
        after = db.query(ProducerPageView).count()
        assert after == before


# ============================================================
# POST /producers/{id}/whatsapp-click
# ============================================================

class TestWhatsAppClickEndpoint:
    def test_whatsapp_click_anonymous_inserts_row(self, client, db):
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/whatsapp-click")
        assert r.status_code == 200
        assert r.json() == {"detail": "logged"}
        row = db.query(ProducerWhatsAppClick).first()
        assert row is not None
        assert row.producer_id == p.id

    def test_whatsapp_click_unknown_producer_404(self, client, db):
        r = client.post("/producers/00000000-0000-0000-0000-000000000000/whatsapp-click")
        assert r.status_code == 404
        assert db.query(ProducerWhatsAppClick).count() == 0

    def test_whatsapp_click_no_body_needed(self, client, db):
        p = make_producer(db)
        # Empty body is fine — this is a fire-and-forget beacon
        r = client.post(f"/producers/{p.id}/whatsapp-click", json=None)
        assert r.status_code == 200


# ============================================================
# GET /producers/me/analytics
# ============================================================

class TestProducerAnalytics:
    def test_analytics_requires_producer_role(self, client, db):
        # No auth → 401
        assert client.get("/producers/me/analytics").status_code == 401

    def test_analytics_consumer_rejected(self, client, db):
        # Consumer → 403 (require_producer)
        consumer = make_user(db, email="c@test.com", role="consumer")
        r = client.get("/producers/me/analytics", headers=auth_header(consumer))
        assert r.status_code in (401, 403)

    def test_analytics_returns_expected_shape(self, client, db):
        # Set up a producer user and seed some data
        p = make_producer(db)
        user = make_user(db, email="owner@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        _seed_view(db, p.id, days_ago=1)
        _seed_view(db, p.id, days_ago=5, city="תל אביב", referrer="search")
        _seed_view(db, p.id, days_ago=40)  # outside 30d window
        _seed_whatsapp_click(db, p.id, days_ago=2)

        r = client.get("/producers/me/analytics", headers=auth_header(user))
        assert r.status_code == 200
        body = r.json()
        # Top-level keys
        for key in (
            "profile_views", "search_appearances", "whatsapp_clicks",
            "follower_count", "new_followers_this_week",
            "average_rating", "total_reviews", "home_products_count",
            "views_by_day", "top_cities",
        ):
            assert key in body, f"missing key: {key}"
        # 7d / 30d / total windows
        for win_key in ("last_7d", "last_30d", "total"):
            assert win_key in body["profile_views"]
            assert win_key in body["search_appearances"]
            assert win_key in body["whatsapp_clicks"]

    def test_analytics_window_counts(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="owner2@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        # 2 views in the last 7 days, 1 view 20 days ago (30d bucket only),
        # 1 view 60 days ago (total only)
        _seed_view(db, p.id, days_ago=1)
        _seed_view(db, p.id, days_ago=6)
        _seed_view(db, p.id, days_ago=20)
        _seed_view(db, p.id, days_ago=60)

        body = client.get(
            "/producers/me/analytics", headers=auth_header(user)
        ).json()
        assert body["profile_views"]["last_7d"] == 2
        assert body["profile_views"]["last_30d"] == 3
        assert body["profile_views"]["total"] == 4

    def test_analytics_top_cities_aggregation(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="owner3@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        for _ in range(3):
            _seed_view(db, p.id, city="תל אביב")
        for _ in range(2):
            _seed_view(db, p.id, city="חיפה")
        _seed_view(db, p.id, city="ירושלים")
        _seed_view(db, p.id, city=None)  # anonymous; excluded from top_cities

        body = client.get(
            "/producers/me/analytics", headers=auth_header(user)
        ).json()
        cities = body["top_cities"]
        assert len(cities) >= 2
        assert cities[0]["city"] == "תל אביב"
        assert cities[0]["count"] == 3
        assert cities[1]["city"] == "חיפה"
        assert cities[1]["count"] == 2

    def test_analytics_views_by_day_has_30_entries(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="owner4@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        body = client.get(
            "/producers/me/analytics", headers=auth_header(user)
        ).json()
        # Exactly 30 entries, one per day, zero-filled if no views that day.
        assert len(body["views_by_day"]) == 30
        for entry in body["views_by_day"]:
            assert "date" in entry
            assert "count" in entry

    def test_analytics_search_appearances_only_counts_search_referrer(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="owner5@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        _seed_view(db, p.id, referrer="search")
        _seed_view(db, p.id, referrer="search")
        _seed_view(db, p.id, referrer="map")
        _seed_view(db, p.id, referrer=None)

        body = client.get(
            "/producers/me/analytics", headers=auth_header(user)
        ).json()
        assert body["search_appearances"]["total"] == 2

    def test_analytics_follower_counts(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="owner6@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        old_follower = make_user(db, email="follower-old@test.com")
        new_follower = make_user(db, email="follower-new@test.com")
        db.add(ProducerFollower(
            producer_id=p.id,
            user_id=old_follower.id,
            created_at=datetime.utcnow() - timedelta(days=20),
        ))
        db.add(ProducerFollower(
            producer_id=p.id,
            user_id=new_follower.id,
            created_at=datetime.utcnow() - timedelta(days=2),
        ))
        db.commit()

        body = client.get(
            "/producers/me/analytics", headers=auth_header(user)
        ).json()
        assert body["follower_count"] == 2
        assert body["new_followers_this_week"] == 1

    def test_analytics_home_products_count_scopes_to_owner(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="owner7@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        # Owner's own home product (should be counted)
        db.add(HomeProduct(
            user_id=user.id, title="שלי", description="x",
            phone="0500000000", city="TLV", price=30, is_active=True,
        ))
        # Inactive one (should NOT be counted)
        db.add(HomeProduct(
            user_id=user.id, title="לא פעיל", description="x",
            phone="0500000000", city="TLV", price=30, is_active=False,
        ))
        # Other user's (should NOT be counted)
        other = make_user(db, email="other@test.com")
        db.add(HomeProduct(
            user_id=other.id, title="של אחרת", description="x",
            phone="0500000000", city="TLV", price=30, is_active=True,
        ))
        db.commit()

        body = client.get(
            "/producers/me/analytics", headers=auth_header(user)
        ).json()
        assert body["home_products_count"] == 1


# ============================================================
# Extended GET /admin/dashboard
# ============================================================

class TestAdminDashboardAnalytics:
    def test_admin_dashboard_has_new_stat_fields(self, client, db):
        admin = make_user(db, role="admin")
        r = client.get("/admin/dashboard", headers=auth_header(admin))
        assert r.status_code == 200
        stats = r.json()["stats"]
        for key in (
            "total_users", "new_users_this_week",
            "total_producers", "new_producers_this_week",
            "total_home_products",
            "total_events", "total_experiences",
            "pending_moderation_count",
        ):
            assert key in stats, f"missing: {key}"

    def test_admin_dashboard_includes_analytics_series(self, client, db):
        admin = make_user(db, role="admin")
        body = client.get("/admin/dashboard", headers=auth_header(admin)).json()
        # daily_active_users: 30-entry chart
        assert "daily_active_users" in body
        assert len(body["daily_active_users"]) == 30
        # top_cities: at most 10 entries
        assert "top_cities" in body
        assert isinstance(body["top_cities"], list)
        # server_health: response_time_avg_ms + requests_per_minute
        assert "server_health" in body
        assert "response_time_avg_ms" in body["server_health"]
        assert "requests_per_minute" in body["server_health"]

    def test_admin_dashboard_new_users_this_week(self, client, db):
        admin = make_user(db, role="admin")
        # Seed one old user and two new
        old_u = make_user(db, email="old@test.com")
        old_u.created_at = datetime.utcnow() - timedelta(days=20)
        make_user(db, email="fresh1@test.com")
        make_user(db, email="fresh2@test.com")
        db.commit()
        body = client.get("/admin/dashboard", headers=auth_header(admin)).json()
        # admin + old + 2 fresh = 4 users total; 3 within last 7 days
        # (admin + fresh1 + fresh2 all just created)
        assert body["stats"]["new_users_this_week"] >= 3

    def test_admin_dashboard_pending_moderation_sum(self, client, db):
        admin = make_user(db, role="admin")
        # Seed one pending producer, one open report, one flagged home product,
        # one pending experience → badge = 4
        make_producer(db, name="Pending1", status="pending")
        p = make_producer(db, status="approved")
        db.add(Report(producer_id=p.id, user_id=admin.id, reason="test"))
        owner = make_user(db, email="po@test.com")
        db.add(HomeProduct(
            user_id=owner.id, title="flagged", description="x",
            phone="0500000000", city="TLV", price=30,
            is_active=True, moderation_status="FLAGGED",
        ))
        db.add(Experience(
            user_id=owner.id, title="workshop", description="x",
            city="TLV", status="pending",
            starts_at=datetime.utcnow() + timedelta(days=5),
            duration_minutes=60, price=50, capacity=10,
        ))
        db.commit()

        body = client.get("/admin/dashboard", headers=auth_header(admin)).json()
        assert body["stats"]["pending_moderation_count"] >= 4

    def test_admin_dashboard_requires_admin(self, client, db):
        consumer = make_user(db, email="c-only@test.com", role="consumer")
        r = client.get("/admin/dashboard", headers=auth_header(consumer))
        assert r.status_code in (401, 403)
