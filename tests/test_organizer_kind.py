"""MEH-2459 — `producers.kind` ('producer' | 'organizer').

An organizer (a market / event organizer who sells nothing) is a `producers`
row with `kind='organizer'`. It must be INVISIBLE on every surface that lists
businesses and VISIBLE only through its events. These tests assert the
behaviour at the HTTP boundary (ADR-032 §3.6), never that a particular
predicate was wired.

Red-before-green (testing.md): on staging code without the `kind` column the
whole module fails at the fixture (`Producer(kind=...)` is an unknown kwarg);
with the column but without the shared predicate, every `absent_from_*` test
fails because the organizer leaks into the business surfaces. Both runs are
in the PR body.
"""

from datetime import timedelta
from unittest.mock import patch

import app.routers.producers as producers_module
from app.models.models import (
    Event,
    Favorite,
    KashrutBadgeRequest,
    Producer,
    ProducerLocation,
    ProducerReview,
)
from app.routers import google_rating
from app.utils.clock import israel_today, utc_now
from conftest import auth_header, make_producer, make_user
from sqlalchemy import text

ORGANIZER_NAME = "שוק גלם — בדיקה"
ORGANIZER_SLUG = "meh2459-organizer"
BUSINESS_NAME = "חוות הניסוי — בדיקה"
BUSINESS_SLUG = "meh2459-business"


def _organizer(db, *, status: str = "approved") -> Producer:
    """An approved organizer row. Mirrors make_producer but flips `kind`.

    Carries coords so the geo (/map) query could match it, and a slug so
    the public slug route could resolve it — the point is that neither
    surface shows it anyway.
    """
    producer = Producer(
        name=ORGANIZER_NAME,
        description="מארגן שווקים לבדיקה",
        city="תל אביב",
        lat=32.0853,
        lng=34.7818,
        status=status,
        images=[],
        kind="organizer",
        slug=ORGANIZER_SLUG,
        has_physical_location=True,
    )
    db.add(producer)
    db.flush()
    _pin(db, producer)
    db.commit()
    db.refresh(producer)
    return producer


def _pin(db, producer: Producer) -> None:
    """The primary `branch` row every write path creates with the coordinates.

    MEH-1938 chunk 5a: geo distance reads ONLY `producer_locations` — a row
    without one has no distance and drops out of the /map query on its own,
    which would make the organizer's absence follow from the fixture rather
    than from the predicate. Both fixtures get a pin so the control business
    is found and the organizer is excluded for the right reason.
    REUSES: tests/test_producer_location_types.py:163 — _pin.
    """
    db.add(
        ProducerLocation(
            producer_id=producer.id,
            kind="branch",
            is_primary=True,
            city=producer.city,
            lat=producer.lat,
            lng=producer.lng,
            location_precision="exact",
        )
    )


def _business(db) -> Producer:
    producer = make_producer(db, name=BUSINESS_NAME, status="approved")
    producer.slug = BUSINESS_SLUG
    _pin(db, producer)
    db.commit()
    db.refresh(producer)
    return producer


def _event(db, producer: Producer, *, days_ahead: int = 3) -> Event:
    event = Event(
        producer_id=producer.id,
        title=f"שוק של {producer.name}",
        event_date=israel_today() + timedelta(days=days_ahead),
        category="שוק",
        city="תל אביב",
        is_active=True,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def _names(payload) -> set[str]:
    return {item["name"] for item in payload}


class TestOrganizerAbsentFromBusinessSurfaces:
    def test_absent_from_producers_listing(self, client, db):
        _organizer(db)
        _business(db)
        resp = client.get("/producers")
        assert resp.status_code == 200
        names = _names(resp.json())
        assert BUSINESS_NAME in names  # control: the surface is live
        assert ORGANIZER_NAME not in names
        assert resp.headers["X-Total-Count"] == "1"

    def test_absent_from_producers_q_search(self, client, db):
        _organizer(db)
        _business(db)
        resp = client.get("/producers", params={"q": "בדיקה"})
        assert resp.status_code == 200
        names = _names(resp.json())
        assert BUSINESS_NAME in names
        assert ORGANIZER_NAME not in names

    def test_absent_from_legacy_search(self, client, db):
        _organizer(db)
        _business(db)
        resp = client.get("/search", params={"q": "בדיקה"})
        assert resp.status_code == 200
        names = {p["name"] for p in resp.json()["producers"]}
        assert BUSINESS_NAME in names
        assert ORGANIZER_NAME not in names

    def test_absent_from_map_geo_query(self, client, db):
        _organizer(db)
        _business(db)
        resp = client.get(
            "/producers", params={"lat": 32.0853, "lng": 34.7818, "radius_km": 50}
        )
        assert resp.status_code == 200
        names = _names(resp.json())
        assert BUSINESS_NAME in names
        assert ORGANIZER_NAME not in names

    def test_absent_from_count(self, client, db):
        _organizer(db)
        _business(db)
        assert client.get("/producers/count").json()["count"] == 1

    def test_absent_from_cities(self, client, db):
        _organizer(db)
        _business(db)
        cities = client.get("/producers/cities").json()
        assert sum(c["count"] for c in cities) == 1

    def test_absent_from_stats(self, client, db):
        _organizer(db)
        _business(db)
        assert client.get("/stats").json()["producers_count"] == 1

    def test_random_is_404_when_only_an_organizer_exists(self, client, db):
        """/producers/random picks among businesses; with one business and
        one organizer the old code still picked the business half the time,
        so the discriminating construction is: organizer alone → 404."""
        _organizer(db)
        assert client.get("/producers/random").status_code == 404

    def test_random_picks_the_business_not_the_organizer(self, client, db):
        _organizer(db)
        business = _business(db)
        resp = client.get("/producers/random")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(business.id)

    def test_absent_from_sitemap_source_slug_route(self, client, db):
        """sitemap.js builds producer URLs from GET /producers (above) and the
        page itself resolves through /producers/by-slug — both must miss."""
        _organizer(db)
        _business(db)
        # control: the route is live for a business
        assert client.get(f"/producers/by-slug/{BUSINESS_SLUG}").status_code == 200
        resp = client.get(f"/producers/by-slug/{ORGANIZER_SLUG}")
        assert resp.status_code == 404

    def test_by_id_public_404_owner_sees(self, client, db):
        organizer = _organizer(db)
        assert client.get(f"/producers/{organizer.id}").status_code == 404
        owner = make_user(db, role="producer", email="meh2459-owner@example.com")
        owner.producer_id = organizer.id
        db.commit()
        resp = client.get(f"/producers/{organizer.id}", headers=auth_header(owner))
        assert resp.status_code == 200
        assert resp.json()["kind"] == "organizer"

    def test_producer_kind_default_is_producer(self, client, db):
        """A business minted through the ORM without `kind` reads back as
        'producer' from the DB row (ORM default), not only from the Pydantic
        default. The server_default for raw SQL is pinned by the next test."""
        business = _business(db)
        db.expire(business)
        assert business.kind == "producer"
        resp = client.get("/producers")
        assert resp.json()[0]["kind"] == "producer"

    def test_server_default_applies_to_raw_sql_inserts(self, client, db):
        """psql / seeds / imports omit `kind` — the column's server_default
        (migration f1a2b3c4d5e6) must still mint a business."""
        row = db.execute(
            text(
                # Every NOT NULL column without a server_default is listed;
                # `kind` is deliberately omitted.
                "INSERT INTO producers (id, name, status, has_physical_location, "
                "offers_delivery, delivery_nationwide, delivery_cities) "
                "VALUES (gen_random_uuid(), 'raw-sql row', 'draft', true, "
                "false, false, '{}'::text[]) "
                "RETURNING kind"
            )
        ).scalar_one()
        db.rollback()
        assert row == "producer"

    def test_page_view_gate_agrees_with_get_by_id(self, client, db):
        """producers.py: the POST /view must share the GET's gate — a
        stranger gets 404 from both, never 204 from one and 404 from the other
        (MEH-254 enumeration oracle, MEH-2156 counter integrity)."""
        organizer = _organizer(db)
        resp = client.post(
            f"/producers/{organizer.id}/view", json={}
        )  # schema-valid body (regression rule 6)
        assert resp.status_code == 404


class TestOrganizerPresentThroughEvents:
    def test_events_feed_includes_organizer_event_with_owner_fields(self, client, db):
        organizer = _organizer(db)
        business = _business(db)
        _event(db, organizer)
        _event(db, business)
        resp = client.get("/events")
        assert resp.status_code == 200
        by_owner = {ev["producer_id"]: ev for ev in resp.json()}
        assert str(organizer.id) in by_owner
        assert by_owner[str(organizer.id)]["owner_kind"] == "organizer"
        assert by_owner[str(organizer.id)]["owner_slug"] == ORGANIZER_SLUG
        assert by_owner[str(business.id)]["owner_kind"] == "producer"
        assert by_owner[str(business.id)]["owner_slug"] == BUSINESS_SLUG

    def test_events_carry_owner_first_image_or_null(self, client, db):
        """MEH-2546: rows fall back to the owner's first photo — present
        when the owner has photos, null (never an error) when it has none."""
        organizer = _organizer(db)
        business = _business(db)
        organizer.images = [
            "https://res.cloudinary.com/x/o1.jpg",
            "https://res.cloudinary.com/x/o2.jpg",
        ]
        business.images = []
        db.commit()
        _event(db, organizer)
        _event(db, business)
        by_owner = {ev["producer_id"]: ev for ev in client.get("/events").json()}
        assert (
            by_owner[str(organizer.id)]["owner_image_url"]
            == "https://res.cloudinary.com/x/o1.jpg"
        )
        assert by_owner[str(business.id)]["owner_image_url"] is None

    def test_owner_image_skips_blank_entries(self, client, db):
        """A blank or whitespace first entry never becomes a broken url()."""
        organizer = _organizer(db)
        business = _business(db)
        organizer.images = ["", "  ", " https://res.cloudinary.com/x/o2.jpg "]
        business.images = ["", " "]
        db.commit()
        _event(db, organizer)
        _event(db, business)
        by_owner = {ev["producer_id"]: ev for ev in client.get("/events").json()}
        assert (
            by_owner[str(organizer.id)]["owner_image_url"]
            == "https://res.cloudinary.com/x/o2.jpg"
        )
        assert by_owner[str(business.id)]["owner_image_url"] is None

    def test_upcoming_includes_organizer_event(self, client, db):
        organizer = _organizer(db)
        _event(db, organizer)
        resp = client.get("/events/upcoming")
        assert resp.status_code == 200
        assert {ev["producer_id"] for ev in resp.json()} == {str(organizer.id)}

    def test_pending_organizer_event_stays_hidden(self, client, db):
        """Pin, not a check of this change: the MEH-1161 status gate already
        hides it. Kept so the kind branch never widens the status gate."""
        organizer = _organizer(db, status="pending")
        _event(db, organizer)
        assert client.get("/events").json() == []


class TestOrganizerNeverVerified:
    def test_grant_verified_rejected_for_organizer(self, client, db):
        organizer = _organizer(db)
        admin = make_user(db, role="admin", email="meh2459-admin@example.com")
        resp = client.post(
            f"/admin/producers/{organizer.id}/grant-verified",
            json={"doc_type": "license"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 409
        db.refresh(organizer)
        assert organizer.verified_at is None

    def test_organizer_cannot_open_group_buy(self, client, db):
        """A group buy is selling; an organizer sells nothing (ADR-036)."""
        organizer = _organizer(db)
        owner = make_user(
            db, role="producer", email="meh2459-gb@example.com", email_verified=True
        )
        owner.producer_id = organizer.id
        db.commit()
        resp = client.post(
            "/group-buys",
            json={
                "title": "רכש לבדיקה",
                "product_name": "מוצר לבדיקה",
                "unit": "יחידה",
                "price_per_unit_regular": 80,
                "price_per_unit_group": 60,
                "min_participants": 3,
                "deadline": (utc_now() + timedelta(days=10)).isoformat(),
                "city": "תל אביב",
                # MEH-2453: required — without it the 422 would mask the gate.
                "fulfillment_note": "איסוף מתל אביב",
            },
            headers=auth_header(owner),
        )
        assert resp.status_code == 403
        # pin the 403 to the kind gate, not to auth or the status gate
        assert resp.json()["detail"] == "מארגן שווקים ואירועים לא יכול לפתוח קבוצת רכש"

    def test_admin_queue_still_lists_organizer_with_kind(self, client, db):
        organizer = _organizer(db)
        admin = make_user(db, role="admin", email="meh2459-admin2@example.com")
        resp = client.get("/admin/producers", headers=auth_header(admin))
        assert resp.status_code == 200
        rows = {row["id"]: row for row in resp.json()}
        assert str(organizer.id) in rows
        assert rows[str(organizer.id)]["kind"] == "organizer"


class TestOrganizerRefusedByExistenceOnlyGates:
    """MEH-2465 — endpoints that used to ask only «does the row exist?».

    Each write refuses an organizer; each read never serves one. Favorites,
    review reads, report-info and the admin counts carry a business control on
    the same path. The review-POST, Google-rating and kashrut cases pin the
    refusal to the kind gate instead (exact 409 detail; a 404 from a route
    whose old code answered 200; a fetch that must never start).
    """

    def test_favorite_add_refused_for_organizer(self, client, db):
        organizer = _organizer(db)
        business = _business(db)
        user = make_user(db, email="meh2465-fav@example.com")
        assert (
            client.post(
                f"/users/me/favorites/{business.id}", headers=auth_header(user)
            ).status_code
            == 201
        )
        resp = client.post(
            f"/users/me/favorites/{organizer.id}", headers=auth_header(user)
        )
        assert resp.status_code == 404
        assert (
            db.query(Favorite).filter(Favorite.producer_id == organizer.id).count() == 0
        )

    def test_favorites_list_never_serializes_organizer(self, client, db):
        organizer = _organizer(db)
        business = _business(db)
        user = make_user(db, email="meh2465-favlist@example.com")
        # a row written before the gate existed
        db.add(Favorite(user_id=user.id, producer_id=organizer.id))
        db.add(Favorite(user_id=user.id, producer_id=business.id))
        db.commit()
        resp = client.get("/users/me/favorites", headers=auth_header(user))
        assert resp.status_code == 200
        names = {f["producer"]["name"] for f in resp.json()}
        assert names == {BUSINESS_NAME}

    def test_review_post_refused_for_organizer(self, client, db):
        organizer = _organizer(db)
        user = make_user(db, email="meh2465-review@example.com")
        resp = client.post(
            f"/producers/{organizer.id}/reviews",
            json={"stars": 5, "body": "שוק מצוין, הכול היה טרי ונעים"},
            headers=auth_header(user),
        )
        assert resp.status_code == 409
        assert resp.json()["detail"] == "אי אפשר לכתוב ביקורת על מארגן"
        assert (
            db.query(ProducerReview)
            .filter(ProducerReview.producer_id == organizer.id)
            .count()
            == 0
        )

    def test_public_review_reads_exclude_organizer(self, client, db):
        organizer = _organizer(db)
        business = _business(db)
        user = make_user(db, email="meh2465-reads@example.com")
        for producer in (organizer, business):
            db.add(
                ProducerReview(
                    producer_id=producer.id,
                    user_id=user.id,
                    stars=5,
                    body="ביקורת שנכתבה לפני השער",
                )
            )
        db.commit()
        # control: the business's review is served on both routes
        assert client.get(f"/producers/{business.id}/reviews").json()["total"] == 1
        assert (
            len(client.get("/reviews", params={"producer_id": str(business.id)}).json())
            == 1
        )
        nested = client.get(f"/producers/{organizer.id}/reviews").json()
        assert nested["total"] == 0 and nested["reviews"] == []
        assert (
            client.get("/reviews", params={"producer_id": str(organizer.id)}).json()
            == []
        )

    def test_google_rating_404_for_organizer(self, client, db, monkeypatch):
        organizer = _organizer(db)
        organizer.google_place_id = "ChIJ-meh2465"
        db.commit()
        monkeypatch.setattr(
            google_rating,
            "_fetch_place_details",
            lambda place_id: {
                "rating": 4.9,
                "user_rating_count": 300,
                "google_maps_uri": "https://maps.google.com/?cid=1",
            },
        )
        assert client.get(f"/producers/{organizer.id}/google-rating").status_code == 404

    def test_report_info_404_for_organizer(self, client, db):
        organizer = _organizer(db)
        business = _business(db)
        with patch("app.routers.report_info.send_email") as mock_send:
            ok = client.post(
                "/reports/producer-info",
                json={"producer_slug": BUSINESS_SLUG, "message": "הטלפון שגוי"},
            )
            assert ok.status_code == 204  # control
            mock_send.reset_mock()
            for identifier in (ORGANIZER_SLUG, str(organizer.id)):
                resp = client.post(
                    "/reports/producer-info",
                    json={"producer_slug": identifier, "message": "הטלפון שגוי"},
                )
                assert resp.status_code == 404
            mock_send.assert_not_called()
        assert business  # keeps the control row referenced

    def test_kashrut_cert_404_for_organizer(self, client, db, monkeypatch):
        organizer = _organizer(db)
        organizer.kashrut_badges = ["badatz"]
        organizer.kashrut_expires_at = utc_now() + timedelta(days=90)
        db.add(
            KashrutBadgeRequest(
                producer_id=organizer.id,
                badge_code="badatz",
                cert_url="https://res.cloudinary.com/demo/image/upload/v1/k.jpg",
                status="approved",
            )
        )
        db.commit()
        calls = []

        def fake_stream(method, url, **kwargs):
            calls.append(url)
            raise AssertionError(
                "the organizer's cert must be refused before any fetch"
            )

        monkeypatch.setattr(producers_module.httpx, "stream", fake_stream)
        resp = client.get(f"/producers/{organizer.id}/kashrut-cert/badatz")
        assert resp.status_code == 404
        assert calls == []

    def test_admin_business_counts_exclude_organizer(self, client, db):
        _organizer(db)
        _business(db)
        admin = make_user(db, role="admin", email="meh2465-admin@example.com")
        dash = client.get("/admin/dashboard", headers=auth_header(admin))
        assert dash.status_code == 200
        stats = dash.json()["stats"]
        assert stats["total_producers"] == 1
        assert stats["new_producers_this_week"] == 1
        assert sum(m["producers"] for m in dash.json()["monthly_producers"]) == 1
        # review #3723: the older /admin/stats carries the same key.
        stats_old = client.get("/admin/stats", headers=auth_header(admin))
        assert stats_old.status_code == 200
        assert stats_old.json()["total_producers"] == 1
        analytics = client.get("/admin/analytics", headers=auth_header(admin))
        assert analytics.status_code == 200
        assert sum(m["producers"] for m in analytics.json()["monthly"]) == 1
