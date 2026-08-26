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
import itertools
from datetime import datetime, timedelta

import pytest

from app.models.models import (
    ContactClick,
    Event,
    Experience,
    Favorite,
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

_view_seq = itertools.count()


def _distinct_hash():
    """MEH-160: a fresh 64-char hash per seeded view.

    The default used to be a single shared `"a" * 64`, which meant every
    view in this file came from *one* visitor. That was invisible while
    `producer_page_views` was counted raw, and became wrong the moment the
    dashboard started deduping per visitor per day: `test_search_appearances`
    seeded two same-day search views and asserted 2, and got 1.

    Every assertion in this file was written as "N views = N visitors", so
    the honest fix is to make the default say that. A test that means to
    exercise the dedupe passes `ip_hash=` explicitly.
    """
    return f"{next(_view_seq):064d}"


def _seed_view(db, producer_id, *, days_ago=0, city=None, referrer=None, ip_hash=None):
    ip_hash = _distinct_hash() if ip_hash is None else ip_hash
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


def _seed_contact_click(db, producer_id, *, method="phone", days_ago=0):
    """MEH-2157: a non-WhatsApp contact click (phone/instagram/website/email).

    Seeded directly, like the WhatsApp helper above, so the window arithmetic
    can be asserted without going through the rate-limited HTTP tracker.
    """
    ts = datetime.utcnow() - timedelta(days=days_ago)
    row = ContactClick(producer_id=producer_id, method=method, clicked_at=ts)
    db.add(row)
    db.commit()
    return row


# ============================================================
# View tracking on POST /producers/{id}/view
#
# MEH-2159 moved recording off GET /producers/{id} and onto an explicit
# browser beacon. Every test below kept its SUBJECT — referrer allowlist,
# city resolution, bot filtering, IP hashing — and changed only the
# transport that produces the row. None of them was asserting "a GET
# writes a row"; that was the delivery mechanism, and it is the one thing
# this ticket deliberately changes. `test_get_producer_no_longer_records_a_view`
# in TestViewBeaconEndpoint is what now pins the old behaviour's absence.
# ============================================================

class TestProducerViewTracking:
    def test_view_beacon_records_anonymous_view(self, client, db):
        p = make_producer(db)
        before = db.query(ProducerPageView).count()
        r = client.post(f"/producers/{p.id}/view", json={})
        assert r.status_code == 204
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

    def test_view_beacon_records_city_from_logged_in_user(self, client, db):
        p = make_producer(db)
        viewer = make_user(db, email="viewer@test.com")
        viewer.city = "חיפה"
        db.commit()
        r = client.post(
            f"/producers/{p.id}/view", json={}, headers=auth_header(viewer)
        )
        assert r.status_code == 204
        row = db.query(ProducerPageView).order_by(ProducerPageView.created_at.desc()).first()
        assert row.city == "חיפה"

    def test_view_beacon_records_referrer_from_body(self, client, db):
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/view", json={"referrer": "search"})
        assert r.status_code == 204
        row = db.query(ProducerPageView).order_by(ProducerPageView.created_at.desc()).first()
        assert row.referrer == "search"

    # MEH-1558: the referrer is caller-supplied, so the allowlist in
    # services/analytics.py is the only thing bounding the column. These two
    # tests pin both halves of that contract — every sanctioned value
    # round-trips verbatim, and anything else becomes NULL rather than being
    # stored.
    #
    # MEH-2159 corrects the note that used to sit here. It said
    # `producers-index` / `similar` / `nearby` were "the three the frontend
    # had been sending all along while the backend silently discarded them".
    # The frontend put them on the PAGE url (ProducerCard.jsx:205) and neither
    # fetch ever forwarded the query string to the API, so they reached
    # `track_producer_view` exactly never — the MEH-1558 widening was inert.
    # The beacon is what makes them arrive for the first time.
    @pytest.mark.parametrize(
        "referrer",
        [
            "search",
            "map",
            "category",
            "home",
            "favorites",
            "follow",
            "producers-index",
            "similar",
            "nearby",
        ],
    )
    def test_allowlisted_referrer_is_stored_verbatim(self, client, db, referrer):
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/view", json={"referrer": referrer})
        assert r.status_code == 204
        row = db.query(ProducerPageView).order_by(ProducerPageView.created_at.desc()).first()
        assert row.referrer == referrer

    @pytest.mark.parametrize(
        "referrer",
        ["garbage", "SEARCH", "similar-businesses", "", "home; DROP TABLE"],
    )
    def test_unknown_referrer_is_stored_as_null(self, client, db, referrer):
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/view", json={"referrer": referrer})
        assert r.status_code == 204
        row = db.query(ProducerPageView).order_by(ProducerPageView.created_at.desc()).first()
        assert row.producer_id == p.id
        assert row.referrer is None

    def test_view_beacon_skips_bots_by_user_agent(self, client, db):
        p = make_producer(db)
        before = db.query(ProducerPageView).count()
        # Googlebot should not be tracked. (Bots do not run JS and so do not
        # fire the beacon at all — this pins that the filter still applies if
        # one ever posts directly.)
        r = client.post(
            f"/producers/{p.id}/view",
            json={},
            headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
        )
        assert r.status_code == 204
        after = db.query(ProducerPageView).count()
        assert after == before, "Googlebot view should NOT be tracked"

    def test_view_beacon_404_does_not_record_view(self, client, db):
        before = db.query(ProducerPageView).count()
        r = client.post(
            "/producers/00000000-0000-0000-0000-000000000000/view", json={}
        )
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
# MEH-2156 — owner/admin views are not audience
# ============================================================


def _owner_of(db, producer):
    """A `producer`-role user wired to `producer` — i.e. its owner."""
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


class TestInternalViewerNotTracked:
    """MEH-2156: three analytics writers counted the business owner herself.

    The symptom that opened the ticket: a `pending` profile showing
    "1 profile view" — which the MEH-254 gate (`producers.py:404-408`)
    makes *necessarily* the owner, since nobody else can reach that row.

    Every skip test below is paired with a control that must still record.
    A suite that only asserts "0 rows" would pass identically against a
    build where tracking is broken outright.
    """

    # ---------- GET /producers/{id} ----------

    def test_owner_get_own_profile_records_no_view(self, client, db):
        p = make_producer(db)
        owner = _owner_of(db, p)
        before = db.query(ProducerPageView).count()
        r = client.post(
            f"/producers/{p.id}/view", json={}, headers=auth_header(owner)
        )
        assert r.status_code == 204
        assert db.query(ProducerPageView).count() == before

    def test_anonymous_view_still_records(self, client, db):
        """Regression control — the skip must not have broken tracking.

        MEH-2159 moved the row off the GET and onto the beacon; the control
        it provides is unchanged, only its transport.
        """
        p = make_producer(db)
        before = db.query(ProducerPageView).count()
        r = client.post(f"/producers/{p.id}/view", json={})
        assert r.status_code == 204
        assert db.query(ProducerPageView).count() == before + 1

    def test_admin_get_foreign_profile_records_no_view(self, client, db):
        p = make_producer(db)
        admin = make_user(db, role="admin")
        before = db.query(ProducerPageView).count()
        r = client.post(
            f"/producers/{p.id}/view", json={}, headers=auth_header(admin)
        )
        assert r.status_code == 204
        assert db.query(ProducerPageView).count() == before

    def test_other_producers_owner_is_still_audience(self, client, db):
        """The discriminating case: the predicate compares producer_id.

        A `producer`-role user looking at SOMEONE ELSE's business is an
        ordinary visitor. If this were implemented as `role == "producer"`
        it would pass every other test in this class and silently erase a
        whole segment of real traffic.
        """
        mine = make_producer(db, name="שלי")
        theirs = make_producer(db, name="שלהם")
        other_owner = _owner_of(db, mine)
        before = db.query(ProducerPageView).count()
        r = client.post(
            f"/producers/{theirs.id}/view",
            json={},
            headers=auth_header(other_owner),
        )
        assert r.status_code == 204
        assert db.query(ProducerPageView).count() == before + 1

    def test_pending_profile_owner_view_is_not_counted(self, client, db):
        """The literal symptom from the ticket: `pending` + owner = 0, not 1."""
        p = make_producer(db, status="pending")
        owner = _owner_of(db, p)
        r = client.post(
            f"/producers/{p.id}/view", json={}, headers=auth_header(owner)
        )
        assert r.status_code == 204
        assert db.query(ProducerPageView).count() == 0

    # ---------- POST /producers/{id}/whatsapp-click ----------

    def test_owner_whatsapp_click_same_response_zero_rows(self, client, db):
        p = make_producer(db)
        owner = _owner_of(db, p)
        r = client.post(f"/producers/{p.id}/whatsapp-click", headers=auth_header(owner))
        # Response contract is byte-identical to the tracked path — no
        # information leaks through the status code or the body.
        assert r.status_code == 200
        assert r.json() == {"detail": "logged"}
        assert db.query(ProducerWhatsAppClick).count() == 0

    def test_anonymous_whatsapp_click_still_records(self, client, db):
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/whatsapp-click")
        assert r.status_code == 200
        assert r.json() == {"detail": "logged"}
        assert db.query(ProducerWhatsAppClick).count() == 1

    def test_admin_whatsapp_click_records_nothing(self, client, db):
        p = make_producer(db)
        admin = make_user(db, role="admin")
        r = client.post(f"/producers/{p.id}/whatsapp-click", headers=auth_header(admin))
        assert r.status_code == 200
        assert db.query(ProducerWhatsAppClick).count() == 0

    def test_owner_whatsapp_click_unknown_producer_still_404(self, client, db):
        """The 404 is raised BEFORE the skip — it must survive for owners."""
        p = make_producer(db)
        owner = _owner_of(db, p)
        r = client.post(
            "/producers/00000000-0000-0000-0000-000000000000/whatsapp-click",
            headers=auth_header(owner),
        )
        assert r.status_code == 404

    # ---------- POST /producers/{id}/contact-click ----------

    def test_owner_contact_click_204_zero_rows(self, client, db):
        p = make_producer(db)
        owner = _owner_of(db, p)
        r = client.post(
            f"/producers/{p.id}/contact-click",
            json={"method": "phone"},
            headers=auth_header(owner),
        )
        assert r.status_code == 204
        assert r.content == b""
        assert db.query(ContactClick).count() == 0

    def test_anonymous_contact_click_still_records(self, client, db):
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/contact-click", json={"method": "phone"})
        assert r.status_code == 204
        assert db.query(ContactClick).count() == 1

    def test_owner_contact_click_invalid_method_still_422(self, client, db):
        """422 is raised BEFORE the skip — validation is unchanged for owners."""
        p = make_producer(db)
        owner = _owner_of(db, p)
        r = client.post(
            f"/producers/{p.id}/contact-click",
            json={"method": "carrier-pigeon"},
            headers=auth_header(owner),
        )
        assert r.status_code == 422
        assert db.query(ContactClick).count() == 0


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
        """MEH-1364 (decision A): counts come from `favorites`, not
        producer_followers. Fixture spans the 7-day window boundary (20d/8d
        outside, 6d/2d inside) and plants one legacy producer_followers row
        to prove it no longer feeds the metric."""
        p = make_producer(db)
        user = make_user(db, email="owner6@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        ages_days = [20, 8, 6, 2]
        for i, age in enumerate(ages_days):
            fan = make_user(db, email=f"fav-{age}d-{i}@test.com")
            db.add(Favorite(
                producer_id=p.id,
                user_id=fan.id,
                created_at=datetime.utcnow() - timedelta(days=age),
            ))
        # Legacy row — the frozen table must NOT be counted post-repoint.
        legacy = make_user(db, email="legacy-follower@test.com")
        db.add(ProducerFollower(
            producer_id=p.id,
            user_id=legacy.id,
            created_at=datetime.utcnow() - timedelta(days=1),
        ))
        db.commit()

        body = client.get(
            "/producers/me/analytics", headers=auth_header(user)
        ).json()
        assert body["follower_count"] == 4
        assert body["new_followers_this_week"] == 2

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

    def test_analytics_profile_strength_full_profile_reaches_100(self, client, db):
        # MEH-794: the home-product signal was removed with /neighbor (MEH-793)
        # and its 25% redistributed across the 5 remaining signals. A fully
        # complete profile must still score exactly 100.
        p = make_producer(db, delivery_cities=["תל אביב"])  # delivery → +15
        p.description = "ד" * 60  # >= 50 chars → +25
        p.images = ["https://example.com/a.jpg"]  # non-empty → +20
        p.phone_verified = True  # → +20
        p.reviews_count = 3  # total_reviews > 0 → +20
        user = make_user(db, email="strength100@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        body = client.get(
            "/producers/me/analytics", headers=auth_header(user)
        ).json()
        assert body["profile_strength"] == 100

    def test_analytics_profile_strength_empty_profile_is_zero(self, client, db):
        # No images / long description / delivery area / reviews / verified phone.
        p = make_producer(db)
        p.description = ""
        p.images = []
        p.phone_verified = False
        p.reviews_count = 0
        user = make_user(db, email="strength0@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        body = client.get(
            "/producers/me/analytics", headers=auth_header(user)
        ).json()
        assert body["profile_strength"] == 0


# ============================================================
# MEH-2157 — conversion_rate counts every contact channel
# ============================================================

class TestConversionRateCountsEveryChannel:
    """The numerator is whatsapp_clicks + contact_clicks, both over 30d.

    Discrimination (MEH-1619) — MEASURED against the old numerator, not
    predicted. Control run: `4 failed, 2 passed`.

      RED on the old code (real evidence for the change), each naming the
      value it returned there:
        · phone_only ............ 0.0  vs 40.0
        · mixed ................ 20.0  vs 60.0
        · window ................ 0.0  vs 25.0
        · per_channel_kpis ..... 100.0 vs 400.0

      GREEN on BOTH implementations (regression pins — they are not evidence
      that the change works, and are here so a future edit cannot quietly
      move the untouched halves):
        · whatsapp_only ........ 75.0
        · zero_views ............ 0.0

    This docstring first said only two tests discriminated; the control run
    said four. The measurement is what stands.
    """

    @staticmethod
    def _owner(db, email):
        p = make_producer(db)
        user = make_user(db, email=email, role="producer")
        user.producer_id = p.id
        db.commit()
        return p, user

    def _analytics(self, client, user):
        r = client.get("/producers/me/analytics", headers=auth_header(user))
        assert r.status_code == 200
        return r.json()

    def test_whatsapp_only_producer_rate_is_unchanged(self, client, db):
        """REGRESSION PIN — passes before and after. 3 clicks / 4 viewers."""
        p, user = self._owner(db, "conv-wa@example.com")
        for _ in range(4):
            _seed_view(db, p.id, days_ago=1)
        for _ in range(3):
            _seed_whatsapp_click(db, p.id, days_ago=2)

        body = self._analytics(client, user)
        assert body["profile_views"]["last_30d"] == 4
        assert body["whatsapp_clicks"]["last_30d"] == 3
        assert body["contact_clicks"]["last_30d"] == 0
        # Manual calc, both implementations: 3 / 4 × 100.
        assert body["conversion_rate"] == 75.0

    def test_phone_only_producer_is_no_longer_stuck_at_zero(self, client, db):
        """RED against the old numerator, which returned 0.0 here forever.

        This is the whole point of the ticket: a business that never receives
        a WhatsApp tap had no path to a non-zero rate.
        """
        p, user = self._owner(db, "conv-phone@example.com")
        for _ in range(5):
            _seed_view(db, p.id, days_ago=1)
        for _ in range(2):
            _seed_contact_click(db, p.id, method="phone", days_ago=3)

        body = self._analytics(client, user)
        assert body["profile_views"]["last_30d"] == 5
        assert body["whatsapp_clicks"]["last_30d"] == 0
        assert body["contact_clicks"]["last_30d"] == 2
        # 2 / 5 × 100. Old code: 0 / 5 × 100 = 0.0.
        assert body["conversion_rate"] == 40.0

    def test_mixed_producer_rate_sums_both_tables(self, client, db):
        """RED against the old numerator, which saw only the 2 WhatsApp rows."""
        p, user = self._owner(db, "conv-mixed@example.com")
        for _ in range(10):
            _seed_view(db, p.id, days_ago=1)
        for _ in range(2):
            _seed_whatsapp_click(db, p.id, days_ago=2)
        for method in ("phone", "email", "website", "instagram"):
            _seed_contact_click(db, p.id, method=method, days_ago=4)

        body = self._analytics(client, user)
        assert body["whatsapp_clicks"]["last_30d"] == 2
        assert body["contact_clicks"]["last_30d"] == 4
        # (2 + 4) / 10 × 100. Old code: 2 / 10 × 100 = 20.0.
        assert body["conversion_rate"] == 60.0

    def test_contact_clicks_use_the_same_30d_window_as_whatsapp(self, client, db):
        """RED against the old numerator (0.0), which never read this table.

        The boundary itself is structural — both arms run through the same
        `windowed()` helper — so what this pins is that the new arm did not
        widen it: a 40-day-old row of EITHER kind stays out of the numerator
        while still counting in `total`.
        """
        p, user = self._owner(db, "conv-window@example.com")
        for _ in range(4):
            _seed_view(db, p.id, days_ago=1)
        _seed_contact_click(db, p.id, method="phone", days_ago=2)
        _seed_contact_click(db, p.id, method="phone", days_ago=40)
        _seed_whatsapp_click(db, p.id, days_ago=40)

        body = self._analytics(client, user)
        assert body["contact_clicks"]["last_30d"] == 1
        assert body["contact_clicks"]["total"] == 2
        assert body["whatsapp_clicks"]["last_30d"] == 0
        assert body["whatsapp_clicks"]["total"] == 1
        # Only the in-window contact click counts: 1 / 4 × 100.
        assert body["conversion_rate"] == 25.0

    def test_zero_views_guard_is_unchanged(self, client, db):
        """REGRESSION PIN — a widened numerator must not reach the division."""
        p, user = self._owner(db, "conv-zero@example.com")
        _seed_whatsapp_click(db, p.id, days_ago=1)
        _seed_contact_click(db, p.id, method="email", days_ago=1)

        body = self._analytics(client, user)
        assert body["profile_views"]["last_30d"] == 0
        assert body["whatsapp_clicks"]["last_30d"] == 1
        assert body["contact_clicks"]["last_30d"] == 1
        assert body["conversion_rate"] == 0.0

    def test_per_channel_kpis_stay_separate_from_the_aggregate(self, client, db):
        """The GBP breakdown property: summing into the headline must not
        collapse the two per-channel counters the dashboard renders.

        RED against the old numerator (100.0). Also the deliberate >100 case
        — 4 actions from 1 unique viewer — which the MEH-160 contract note
        says is a real reading, not a bug, and which widening the numerator
        makes more likely.
        """
        p, user = self._owner(db, "conv-breakdown@example.com")
        _seed_view(db, p.id, days_ago=1)
        _seed_whatsapp_click(db, p.id, days_ago=1)
        for _ in range(3):
            _seed_contact_click(db, p.id, method="website", days_ago=1)

        body = self._analytics(client, user)
        assert body["whatsapp_clicks"]["last_7d"] == 1
        assert body["contact_clicks"]["last_7d"] == 3
        assert body["conversion_rate"] == 400.0


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
        db.add(Report(producer_id=p.id, reporter_id=admin.id, reason="test"))
        owner = make_user(db, email="po@test.com")
        db.add(HomeProduct(
            user_id=owner.id, title="flagged", description="x",
            phone="0500000000", city="TLV", price=30,
            is_active=True, moderation_status="FLAGGED",
        ))
        db.add(Experience(
            host_user_id=owner.id, title="workshop", description="x",
            city="TLV", status="pending",
            event_date=(datetime.utcnow() + timedelta(days=5)).date(),
            duration_minutes=60, price_per_person=50, max_participants=10,
        ))
        db.commit()

        body = client.get("/admin/dashboard", headers=auth_header(admin)).json()
        assert body["stats"]["pending_moderation_count"] >= 4

    def test_admin_dashboard_requires_admin(self, client, db):
        consumer = make_user(db, email="c-only@test.com", role="consumer")
        r = client.get("/admin/dashboard", headers=auth_header(consumer))
        assert r.status_code in (401, 403)


class TestViewerIpHashUsesRealClientIp:
    """MEH-2158: viewer_ip_hash was derived from `request.client.host`.

    On Railway that is the edge proxy (`100.64.0.X`, CGN range) — the same
    value for every visitor. `unique_views_count` counts
    `DISTINCT (israel_day, viewer_ip_hash)`, so a constant hash collapses a
    whole day of traffic to **one** view. The dashboard was not inflating
    the number, it was erasing it.

    `get_real_client_ip` (MEH-256, `rate_limit.py:67`) already resolves this
    correctly for the rate limiter; these tests pin that the analytics
    writers now go through it too.

    The discriminating property is DISTINCTNESS, not any particular hash
    value: with the bug, two visitors behind the proxy produce one hash.
    Every test therefore drives the endpoint twice and compares.
    """

    @staticmethod
    def _hashes(db):
        return [
            v.viewer_ip_hash for v in db.query(ProducerPageView).all()
        ]

    def test_two_real_ips_produce_two_hashes(self, client, db, monkeypatch):
        monkeypatch.setenv("TRUSTED_PROXY", "1")
        p = make_producer(db)
        client.post(
            f"/producers/{p.id}/view", json={}, headers={"X-Real-IP": "203.0.113.9"}
        )
        client.post(
            f"/producers/{p.id}/view", json={}, headers={"X-Real-IP": "198.51.100.4"}
        )
        hashes = self._hashes(db)
        assert len(hashes) == 2, hashes
        assert hashes[0] != hashes[1], (
            "two different visitors collapsed to one hash — "
            "the proxy IP is still being hashed"
        )
        assert all(h is not None for h in hashes)

    def test_same_real_ip_produces_same_hash(self, client, db, monkeypatch):
        """The other half: dedupe must still recognise a repeat visitor."""
        monkeypatch.setenv("TRUSTED_PROXY", "1")
        p1 = make_producer(db)
        p2 = make_producer(db)
        client.post(
            f"/producers/{p1.id}/view", json={}, headers={"X-Real-IP": "203.0.113.9"}
        )
        client.post(
            f"/producers/{p2.id}/view", json={}, headers={"X-Real-IP": "203.0.113.9"}
        )
        hashes = self._hashes(db)
        assert len(hashes) == 2, hashes
        assert hashes[0] == hashes[1]

    def test_xff_second_to_last_entry_is_used(self, client, db, monkeypatch):
        """No X-Real-IP → XFF[-2], per the MEH-256 resolution order.

        Rightmost is Railway's own proxy; the entry before it is the caller.
        Two callers arriving with different XFF[-2] must stay distinct.
        """
        monkeypatch.setenv("TRUSTED_PROXY", "1")
        p = make_producer(db)
        client.post(
            f"/producers/{p.id}/view",
            json={},
            headers={"X-Forwarded-For": "203.0.113.9, 100.64.0.1"},
        )
        client.post(
            f"/producers/{p.id}/view",
            json={},
            headers={"X-Forwarded-For": "198.51.100.4, 100.64.0.1"},
        )
        hashes = self._hashes(db)
        assert len(hashes) == 2, hashes
        assert hashes[0] != hashes[1]

    def test_trusted_proxy_unset_falls_back_without_crashing(
        self, client, db, monkeypatch
    ):
        """Local/dev: TRUSTED_PROXY absent → get_remote_address, as today.

        The headers are present and must be IGNORED — trusting them without
        the flag would let any caller spoof another visitor's identity.
        """
        monkeypatch.delenv("TRUSTED_PROXY", raising=False)
        p = make_producer(db)
        r = client.post(
            f"/producers/{p.id}/view", json={}, headers={"X-Real-IP": "203.0.113.9"}
        )
        assert r.status_code == 204
        hashes = self._hashes(db)
        assert len(hashes) == 1
        assert hashes[0] is not None

    def test_untrusted_xreal_ip_cannot_forge_distinct_identities(
        self, client, db, monkeypatch
    ):
        """The spoofing control for the fallback path.

        With TRUSTED_PROXY off, two callers sending DIFFERENT X-Real-IP
        values are the same TestClient peer and must hash the same. If this
        ever goes red, the resolver is trusting a client-supplied header
        outside the trusted-proxy gate.
        """
        monkeypatch.delenv("TRUSTED_PROXY", raising=False)
        p1 = make_producer(db)
        p2 = make_producer(db)
        client.post(
            f"/producers/{p1.id}/view", json={}, headers={"X-Real-IP": "203.0.113.9"}
        )
        client.post(
            f"/producers/{p2.id}/view", json={}, headers={"X-Real-IP": "198.51.100.4"}
        )
        hashes = self._hashes(db)
        assert len(hashes) == 2, hashes
        assert hashes[0] == hashes[1]

    def test_contact_click_ip_hash_also_uses_real_client_ip(
        self, client, db, monkeypatch
    ):
        """The second call site — `record_contact_click`, not a page view."""
        monkeypatch.setenv("TRUSTED_PROXY", "1")
        p1 = make_producer(db)
        p2 = make_producer(db)
        client.post(
            f"/producers/{p1.id}/contact-click",
            json={"method": "phone"},
            headers={"X-Real-IP": "203.0.113.9"},
        )
        client.post(
            f"/producers/{p2.id}/contact-click",
            json={"method": "phone"},
            headers={"X-Real-IP": "198.51.100.4"},
        )
        rows = db.query(ContactClick).all()
        assert len(rows) == 2, rows
        assert rows[0].ip_hash != rows[1].ip_hash
        assert all(r.ip_hash is not None for r in rows)


class TestViewBeaconEndpoint:
    """MEH-2159: view counting moved off GET and onto an explicit beacon.

    As a side effect of a read, the row depended on WHICH endpoint was called
    rather than on "someone opened the page". That produced three bugs at
    once, and each has a test below:

      * `/{slug}` recorded NOTHING  — it calls get_producer_by_slug, which
        never tracked, and the client fetch short-circuits on initialProducer.
      * `/producer/{uuid}` recorded TWICE — SSR plus client.
      * the SSR row carried no Authorization header, so is_internal_viewer
        saw viewer=None and the owner's own visit counted despite MEH-2156.

    The controls matter more than usual here: an endpoint that records
    nothing would pass every "0 rows" assertion in this class.
    """

    def test_anonymous_view_beacon_records_one_row(self, client, db):
        p = make_producer(db)
        before = db.query(ProducerPageView).count()
        r = client.post(f"/producers/{p.id}/view", json={})
        assert r.status_code == 204
        assert r.content == b"", "204 must carry no body"
        assert db.query(ProducerPageView).count() == before + 1

    def test_get_producer_no_longer_records_a_view(self, client, db):
        """THE proof that the side-effect is gone. Was 1 row, must now be 0."""
        p = make_producer(db)
        before = db.query(ProducerPageView).count()
        r = client.get(f"/producers/{p.id}")
        assert r.status_code == 200
        assert db.query(ProducerPageView).count() == before

    def test_get_by_slug_still_records_nothing(self, client, db):
        """Unchanged by design — by-slug never tracked and still must not."""
        p = make_producer(db)
        p.slug = "beacon-slug-test"
        p.status = "approved"
        db.commit()
        before = db.query(ProducerPageView).count()
        r = client.get(f"/producers/by-slug/{p.slug}")
        assert r.status_code == 200
        assert db.query(ProducerPageView).count() == before

    def test_owner_view_beacon_records_nothing(self, client, db):
        """Inherits MEH-2156 — and now it actually applies, because the
        beacon carries the token the SSR call never did."""
        p = make_producer(db)
        owner = _owner_of(db, p)
        before = db.query(ProducerPageView).count()
        r = client.post(
            f"/producers/{p.id}/view", json={}, headers=auth_header(owner)
        )
        assert r.status_code == 204
        assert db.query(ProducerPageView).count() == before

    def test_view_beacon_unknown_producer_404(self, client, db):
        """A bogus id 404s from get_producer_or_404 — not from a missing route.

        Asserting the status alone does NOT discriminate: before this endpoint
        existed the router had no /view path at all, so FastAPI answered 404
        for a completely different reason and this test passed against code
        that had none of the behaviour. Measured, not assumed — on the pre-fix
        app `[r.path for r in app.routes if "view" in r.path]` is `[]`.

        The detail string is the discriminator: the project 404 is Hebrew
        (producer_queries.py:281), FastAPI's route-miss is "Not Found".
        """
        import uuid as _uuid

        r = client.post(f"/producers/{_uuid.uuid4()}/view", json={})
        assert r.status_code == 404
        assert r.json()["detail"] == "בית עסק לא נמצא", (
            "404 came from a missing route, not from the existence check"
        )

    def test_allowlisted_referrer_is_persisted(self, client, db):
        """The `?from=` value reaches the DB for the first time.

        Before this endpoint no caller forwarded the page-url query string,
        so `referrer` was NULL on every row ever written.
        """
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/view", json={"referrer": "search"})
        assert r.status_code == 204
        row = db.query(ProducerPageView).one()
        assert row.referrer == "search"

    @pytest.mark.parametrize("value", ["producers-index", "similar", "nearby"])
    def test_meh1558_values_now_actually_arrive(self, client, db, value):
        """The three values MEH-1558 added to the allowlist.

        They were unreachable until this endpoint existed: ProducerCard puts
        them on the PAGE url and neither fetch forwarded it.
        """
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/view", json={"referrer": value})
        assert r.status_code == 204
        assert db.query(ProducerPageView).one().referrer == value

    def test_unknown_referrer_is_stored_as_null_not_422(self, client, db):
        """A junk referrer is normalized away, never a client error.

        A 422 would turn a fire-and-forget beacon into a failure for a value
        the writer discards anyway.
        """
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/view", json={"referrer": "../../etc"})
        assert r.status_code == 204
        assert db.query(ProducerPageView).one().referrer is None

    def test_missing_body_is_accepted_as_a_plain_view(self, client, db):
        p = make_producer(db)
        r = client.post(f"/producers/{p.id}/view", json={"referrer": None})
        assert r.status_code == 204
        assert db.query(ProducerPageView).one().referrer is None

    def test_bot_user_agent_is_still_skipped(self, client, db):
        """The bot filter lives in record_analytics_event and must survive
        the move — the beacon path runs the same writer."""
        p = make_producer(db)
        before = db.query(ProducerPageView).count()
        r = client.post(
            f"/producers/{p.id}/view",
            json={},
            headers={"User-Agent": "Googlebot/2.1"},
        )
        assert r.status_code == 204
        assert db.query(ProducerPageView).count() == before

    def test_view_beacon_hashes_the_real_client_ip(self, client, db, monkeypatch):
        """Inherits MEH-2158 on the new call site too."""
        monkeypatch.setenv("TRUSTED_PROXY", "1")
        p1 = make_producer(db)
        p2 = make_producer(db)
        client.post(
            f"/producers/{p1.id}/view", json={}, headers={"X-Real-IP": "203.0.113.9"}
        )
        client.post(
            f"/producers/{p2.id}/view", json={}, headers={"X-Real-IP": "198.51.100.4"}
        )
        hashes = [v.viewer_ip_hash for v in db.query(ProducerPageView).all()]
        assert len(hashes) == 2, hashes
        assert hashes[0] != hashes[1]

    # ---- MEH-254 gate parity (found by adversarial review, not by the card) ----
    #
    # The first shape of this endpoint answered 204 for a `pending` producer
    # while GET answered 404, which turns the pair into an enumeration oracle
    # for the moderation queue — a stranger could tell a real-but-unapproved
    # UUID (204) from a nonexistent one (404), the exact disclosure MEH-254
    # exists to prevent. It also let a stranger write rows onto a pending
    # business's counter. Measured before the fix:
    #     pending -> GET=404  POST/view=204  rows_written=1
    #
    # These assert the OUTCOME (indistinguishability), not that a particular
    # line of code is present.

    @pytest.mark.parametrize("status", ["pending", "rejected"])
    def test_non_approved_producer_is_404_to_a_stranger(self, client, db, status):
        p = make_producer(db, status=status)
        before = db.query(ProducerPageView).count()
        r = client.post(f"/producers/{p.id}/view", json={})
        assert r.status_code == 404
        assert db.query(ProducerPageView).count() == before, (
            "a stranger wrote a view onto a non-approved producer"
        )

    @pytest.mark.parametrize("status", ["pending", "rejected"])
    def test_non_approved_is_indistinguishable_from_nonexistent(
        self, client, db, status
    ):
        """The oracle test proper: same status AND same body, both ways."""
        import uuid as _uuid

        p = make_producer(db, status=status)
        real = client.post(f"/producers/{p.id}/view", json={})
        fake = client.post(f"/producers/{_uuid.uuid4()}/view", json={})
        assert real.status_code == fake.status_code == 404
        assert real.json() == fake.json(), (
            f"response body distinguishes a {status} producer from a "
            f"nonexistent one: {real.json()} vs {fake.json()}"
        )

    def test_owner_can_still_reach_her_own_pending_profile(self, client, db):
        """The gate must not lock the owner out — she gets 204 (and, per
        MEH-2156, no row, because she is not her own audience)."""
        p = make_producer(db, status="pending")
        owner = _owner_of(db, p)
        r = client.post(
            f"/producers/{p.id}/view", json={}, headers=auth_header(owner)
        )
        assert r.status_code == 204
        assert db.query(ProducerPageView).count() == 0

    def test_admin_can_still_reach_a_pending_profile(self, client, db):
        p = make_producer(db, status="pending")
        admin = make_user(db, email="gate-admin@example.com", role="admin")
        r = client.post(
            f"/producers/{p.id}/view", json={}, headers=auth_header(admin)
        )
        assert r.status_code == 204

    def test_get_producer_rejects_the_removed_from_param(self, client, db):
        """`?from=` is dead on the GET — it moved into the beacon body.

        FastAPI ignores undeclared query params, so this asserts the
        OUTCOME that matters: passing it records nothing and changes nothing.
        """
        p = make_producer(db)
        before = db.query(ProducerPageView).count()
        r = client.get(f"/producers/{p.id}?from=search")
        assert r.status_code == 200
        assert db.query(ProducerPageView).count() == before
