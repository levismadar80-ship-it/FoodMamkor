"""MEH-2460 — registering as an organizer (kind='organizer', ADR-036).

Behaviour at the HTTP / service boundary:
  - POST /auth/register/producer with kind='organizer' needs no category, no
    location mode and no license; the row lands as an organizer with the one
    location shape the DB CHECK accepts and no delivery claim.
  - The business path is unchanged (still 422s without a category).
  - GET /auth/me carries producer_kind so the dashboard layout can branch.
  - The submission gate asks an organizer for photo + description + ≥1
    upcoming event + verified WhatsApp — and never for products / categories /
    location; GET /producers/me reports the upcoming-event count it reads.

Red-before-green: on code without `ProducerRegister.kind` the organizer payload
422s (no category, no location mode) and every case below fails; the PR body
carries both runs.
"""

from datetime import timedelta

from app.models.models import Event, Producer, ProducerLocation, User
from app.services.submission_gate import (
    MISSING_IMAGE,
    MISSING_PHONE_VERIFIED,
    ORGANIZER_MISSING_DESCRIPTION,
    ORGANIZER_MISSING_EVENT,
    submission_missing_items,
)
from app.utils.clock import israel_today
from conftest import auth_header, make_user, valid_producer_register_payload

ORG_EMAIL = "meh2460-organizer@example.com"


def _organizer_payload() -> dict:
    payload = valid_producer_register_payload()
    payload["email"] = ORG_EMAIL
    payload["phone"] = "0521234567"
    payload["kind"] = "organizer"
    # Everything a business would have to send, deliberately absent or
    # contradictory: no category, and BOTH location axes off (a business 422s).
    payload.pop("category_ids")
    payload["has_physical_location"] = False
    payload["offers_delivery"] = False
    payload["producer_license_number"] = "12345"
    return payload


def _registered_organizer(db) -> Producer:
    user = db.query(User).filter(User.email == ORG_EMAIL).one()
    return db.query(Producer).filter(Producer.id == user.producer_id).one()


class TestOrganizerRegistration:
    def test_organizer_registers_without_category_location_or_license(self, client, db):
        resp = client.post("/auth/register/producer", json=_organizer_payload())
        assert resp.status_code == 200, resp.text
        producer = _registered_organizer(db)
        assert producer.kind == "organizer"
        assert producer.categories == []
        # The server-side shape that satisfies CHECK producer_location_mode
        # and claims no delivery (schemas.py _validate_location_mode).
        assert producer.has_physical_location is True
        assert producer.offers_delivery is False
        assert producer.delivery_nationwide is False
        # Nothing to license: a sent number is dropped, not stored.
        assert producer.producer_license_number is None

    def test_categories_sent_by_an_organizer_are_dropped(self, client, db):
        payload = _organizer_payload()
        payload["category_ids"] = valid_producer_register_payload()["category_ids"]
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 200, resp.text
        assert _registered_organizer(db).categories == []

    def test_business_path_still_requires_a_category(self, client, db):
        payload = valid_producer_register_payload()
        payload["email"] = "meh2460-business@example.com"
        payload["phone"] = "0521234567"
        payload.pop("category_ids")
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 422

    def test_business_path_still_requires_a_location_mode(self, client, db):
        payload = valid_producer_register_payload()
        payload["email"] = "meh2460-business2@example.com"
        payload["phone"] = "0521234567"
        payload["has_physical_location"] = False
        payload["offers_delivery"] = False
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 422

    def test_unknown_kind_rejected(self, client, db):
        """Review #3711 F7: a BUSINESS-valid payload with an unknown kind, so
        the 422 can only come from the kind field (the organizer payload would
        422 on staging for its missing category alone)."""
        payload = valid_producer_register_payload()
        payload["email"] = "meh2460-vendor@example.com"
        payload["phone"] = "0521234567"
        payload["kind"] = "vendor"
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 422
        locs = [e["loc"] for e in resp.json()["detail"]]
        assert ["body", "kind"] in locs, locs

    def test_organizer_gets_no_address_and_no_map_point(self, client, db):
        """Review #3711 F5: no street address, no coordinates, and so no
        producer_locations row (the map pin source)."""
        payload = _organizer_payload()
        payload.update(address="הרצל 1", lat=32.08, lng=34.78)
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 200, resp.text
        producer = _registered_organizer(db)
        assert producer.address is None
        assert producer.lat is None and producer.lng is None
        assert (
            db.query(ProducerLocation)
            .filter(ProducerLocation.producer_id == producer.id)
            .count()
            == 0
        )

    def test_upgrade_path_registers_an_organizer(self, client, db):
        """Review #3711 F6: the MEH-143 upgrade path (every Google/Apple signup
        goes through it) builds its own Producer — kind must reach it."""
        consumer = make_user(
            db,
            role="consumer",
            email="meh2460-upgrade@example.com",
            email_verified=True,
        )
        payload = _organizer_payload()
        for key in ("email", "name", "password"):
            payload.pop(key, None)
        resp = client.post(
            "/auth/register/producer", json=payload, headers=auth_header(consumer)
        )
        assert resp.status_code == 200, resp.text
        db.expire_all()
        user = db.query(User).filter(User.id == consumer.id).one()
        producer = db.query(Producer).filter(Producer.id == user.producer_id).one()
        assert producer.kind == "organizer"
        assert producer.categories == []

    def test_auth_me_carries_producer_kind(self, client, db):
        client.post("/auth/register/producer", json=_organizer_payload())
        user = db.query(User).filter(User.email == ORG_EMAIL).one()
        resp = client.get("/auth/me", headers=auth_header(user))
        assert resp.status_code == 200
        assert resp.json()["producer_kind"] == "organizer"


def _draft_organizer(db) -> tuple[Producer, User]:
    producer = Producer(
        name="מארגן טיוטה",
        city="חיפה",
        status="draft",
        kind="organizer",
        images=[],
        has_physical_location=True,
    )
    db.add(producer)
    db.flush()
    user = make_user(db, role="producer", email="meh2460-draft@example.com")
    user.producer_id = producer.id
    db.commit()
    db.refresh(producer)
    return producer, user


def _event(db, producer, *, days: int, active: bool = True) -> None:
    db.add(
        Event(
            producer_id=producer.id,
            title="שוק בדיקה",
            event_date=israel_today() + timedelta(days=days),
            category="שוק",
            city="חיפה",
            is_active=active,
        )
    )
    db.commit()


class TestOrganizerSubmissionGate:
    def test_empty_organizer_misses_exactly_its_four_items(self, db):
        producer, _ = _draft_organizer(db)
        assert submission_missing_items(producer) == [
            MISSING_IMAGE,
            ORGANIZER_MISSING_DESCRIPTION,
            ORGANIZER_MISSING_EVENT,
            MISSING_PHONE_VERIFIED,
        ]

    def test_complete_organizer_is_ready_without_products_or_categories(self, db):
        producer, _ = _draft_organizer(db)
        producer.images = ["https://res.cloudinary.com/x/image/upload/a.jpg"]
        producer.description = "שוק יצרנים נודד"
        producer.phone_verified = True
        db.commit()
        _event(db, producer, days=5)
        assert submission_missing_items(producer) == []

    def test_past_or_inactive_event_does_not_count(self, db):
        producer, _ = _draft_organizer(db)
        _event(db, producer, days=-1)
        _event(db, producer, days=5, active=False)
        assert ORGANIZER_MISSING_EVENT in submission_missing_items(producer)

    def test_placeholder_description_is_missing(self, db):
        """Review #3711 F4: «אכתוב אחר כך» writes the default description — it
        is not a description (and it calls her «בית עסק»)."""
        producer, _ = _draft_organizer(db)
        for placeholder in (
            "בית עסק מקומי. עוד פרטים בקרוב.",
            "Local business. More details coming soon.",
        ):
            producer.description = placeholder
            db.commit()
            assert ORGANIZER_MISSING_DESCRIPTION in submission_missing_items(producer)

    def test_event_dated_today_counts(self, db):
        producer, _ = _draft_organizer(db)
        _event(db, producer, days=0)
        assert ORGANIZER_MISSING_EVENT not in submission_missing_items(producer)

    def test_whitespace_description_is_missing(self, db):
        producer, _ = _draft_organizer(db)
        producer.description = "   "
        db.commit()
        assert ORGANIZER_MISSING_DESCRIPTION in submission_missing_items(producer)

    def test_producers_me_reports_upcoming_events_count(self, client, db):
        producer, user = _draft_organizer(db)
        _event(db, producer, days=2)
        _event(db, producer, days=9)
        _event(db, producer, days=-3)
        resp = client.get("/producers/me", headers=auth_header(user))
        assert resp.status_code == 200
        body = resp.json()
        assert body["kind"] == "organizer"
        assert body["upcoming_events_count"] == 2


class TestOrganizerSubmitForReview:
    """Review #3711 F6: the real endpoint, not only the gate function."""

    def test_incomplete_organizer_gets_its_codes_then_submits(self, client, db):
        producer, user = _draft_organizer(db)
        user.email_verified = True
        db.commit()
        resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))
        assert resp.status_code == 422
        assert resp.json()["detail"]["params"]["missing"] == [
            MISSING_IMAGE,
            ORGANIZER_MISSING_DESCRIPTION,
            ORGANIZER_MISSING_EVENT,
            MISSING_PHONE_VERIFIED,
        ]

        producer.images = ["https://res.cloudinary.com/x/image/upload/a.jpg"]
        producer.description = "שוק יצרנים נודד"
        producer.phone_verified = True
        db.commit()
        _event(db, producer, days=3)
        resp = client.post("/producers/me/submit-for-review", headers=auth_header(user))
        assert resp.status_code == 200, resp.text
        db.refresh(producer)
        assert producer.status == "pending"
