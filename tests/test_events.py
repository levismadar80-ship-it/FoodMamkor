"""MEH-2013 — the event form's starred fields, enforced at the write boundary.

`sweep_tail.event_new.field_city_label` reads "עיר *" and `field_category_label`
reads "קטגוריה *". Before this ticket:

  - `city` was enforced in NEITHER layer. `EventCreate.city` was
    `str | None = None` and `validateEventForm` never looked at it, so an event
    could be published with no city at all — the same class as the experience
    form, found by sweeping for the sibling instead of fixing one symptom.
  - `category` WAS required server-side (`min_length=1`), but the form
    pre-filled it with "אחר" and is `noValidate`, so the native `required` on
    the <select> is dead. The gate was real and unreachable: every submission
    satisfied it with a catch-all nobody chose.

The client now blocks both, which is where a user meets them. These tests are
the other half — MEH-1153's precedent is that a direct POST must be blocked
too, and a client-side rule is not a write boundary.

Note on the file: MEH-2013's <file_locations> said UPDATE tests/test_events.py,
but no such file existed — event coverage lives in per-ticket modules
(test_meh1657_event_category_axis.py, test_events_mine.py, …). Created at the
path the ticket names.
"""
from datetime import date

from app.models.models import Event
from conftest import auth_header, make_producer, make_user


def _approved_producer_user(db, email: str):
    """An approved producer who may publish events.

    REUSES: tests/test_meh1657_event_category_axis.py:40 — same gate
    (MEH-1161 requires an approved business behind the event).
    """
    producer = make_producer(db, status="approved")
    user = make_user(db, role="producer", email=email, email_verified=True)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


def _payload(**overrides) -> dict:
    payload = {
        "title": "יום פתוח במאפייה",
        "event_date": date(2099, 1, 1).isoformat(),
        "category": "שוק",  # events.VALID_CATEGORIES
        "city": "תל אביב",
    }
    payload.update(overrides)
    return payload


class TestEventCityRequired:
    def test_missing_city_rejected(self, client, db):
        user = _approved_producer_user(db, email="meh2013-nocity@example.com")
        payload = _payload()
        del payload["city"]

        resp = client.post("/events", json=payload, headers=auth_header(user))

        assert resp.status_code == 422, resp.text
        assert db.query(Event).count() == 0

    def test_blank_city_rejected(self, client, db):
        """min_length=1 alone accepts "   " — city-less by the only meaning
        that matters, since the city filter would still never match it."""
        user = _approved_producer_user(db, email="meh2013-blankcity@example.com")

        resp = client.post(
            "/events", json=_payload(city="   "), headers=auth_header(user)
        )

        assert resp.status_code == 422, resp.text

    def test_city_is_stored_stripped(self, client, db):
        user = _approved_producer_user(db, email="meh2013-trim@example.com")

        resp = client.post(
            "/events", json=_payload(city="  תל אביב  "), headers=auth_header(user)
        )

        assert resp.status_code == 201, resp.text
        assert db.query(Event).one().city == "תל אביב"


class TestEventCategoryRequired:
    def test_missing_category_rejected(self, client, db):
        """Already true before MEH-2013 — pinned here because the form no
        longer pre-fills "אחר", so this is now a path a real submission can
        take rather than one only a direct POST could reach."""
        user = _approved_producer_user(db, email="meh2013-nocat@example.com")
        payload = _payload()
        del payload["category"]

        resp = client.post("/events", json=payload, headers=auth_header(user))

        assert resp.status_code == 422, resp.text
        assert db.query(Event).count() == 0

    def test_empty_category_rejected(self, client, db):
        """The exact value the form now starts with. If this ever returned 201
        the placeholder option would become a silent write of "".
        """
        user = _approved_producer_user(db, email="meh2013-emptycat@example.com")

        resp = client.post(
            "/events", json=_payload(category=""), headers=auth_header(user)
        )

        assert resp.status_code == 422, resp.text

    def test_ahar_is_still_a_valid_choice(self, client, db):
        """Removing the DEFAULT must not remove the OPTION. "אחר" stays in
        events.VALID_CATEGORIES (routers/events.py:43) — this PR changes who
        picks it, not whether it can be picked."""
        user = _approved_producer_user(db, email="meh2013-ahar@example.com")

        resp = client.post(
            "/events", json=_payload(category="אחר"), headers=auth_header(user)
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["category"] == "אחר"


class TestEventUpdateStaysPermissive:
    def test_editing_a_row_that_predates_the_city_rule_still_works(
        self, client, db
    ):
        """EventUpdate.city stays Optional on purpose. Requiring it would 422
        every edit of an event written before this rule, locking an owner out
        of her own event over a field she never had the chance to fill."""
        user = _approved_producer_user(db, email="meh2013-legacy@example.com")
        created = client.post(
            "/events", json=_payload(), headers=auth_header(user)
        ).json()
        # Simulate the legacy shape the old schema allowed.
        row = db.query(Event).filter(Event.id == created["id"]).one()
        row.city = None
        db.commit()

        resp = client.put(
            f"/events/{created['id']}",
            json={"title": "כותרת מעודכנת לאירוע"},
            headers=auth_header(user),
        )

        assert resp.status_code == 200, resp.text
        db.refresh(row)
        assert row.city is None  # untouched, not backfilled
