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

from app.models.models import Event, Producer, ProducerLocation
from app.utils.clock import israel_today, utc_now
from conftest import auth_header, make_producer, make_user

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

    def test_absent_from_count_cities_stats(self, client, db):
        _organizer(db)
        _business(db)
        assert client.get("/producers/count").json()["count"] == 1
        cities = client.get("/producers/cities").json()
        assert sum(c["count"] for c in cities) == 1
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
        """A business minted without `kind` carries the column default — read
        back from the DB row, not from the Pydantic default."""
        business = _business(db)
        db.expire(business)
        assert business.kind == "producer"
        resp = client.get("/producers")
        assert resp.json()[0]["kind"] == "producer"

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
            },
            headers=auth_header(owner),
        )
        assert resp.status_code == 403

    def test_admin_queue_still_lists_organizer_with_kind(self, client, db):
        organizer = _organizer(db)
        admin = make_user(db, role="admin", email="meh2459-admin2@example.com")
        resp = client.get("/admin/producers", headers=auth_header(admin))
        assert resp.status_code == 200
        rows = {row["id"]: row for row in resp.json()}
        assert str(organizer.id) in rows
        assert rows[str(organizer.id)]["kind"] == "organizer"
