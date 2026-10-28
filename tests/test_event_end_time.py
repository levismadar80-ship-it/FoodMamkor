"""MEH-2469 — an optional end time on events («09:30–15:00»).

Behaviour at the HTTP boundary:
  - POST /events stores and returns end_time when it is after event_time.
  - An end time without a start time, or not after it, is a 422 with the
    approved Hebrew message — on create, and on update against the values the
    row will hold (a PUT may carry only one of the pair).
  - Events without an end time are unchanged (end_time null).
  - GET /events/{id} and the list carry end_time.

Red-before-green: on code without `Event.end_time` the field is silently
dropped (EventCreate ignores unknown keys), so every assertion on the stored or
returned end_time fails, and the 422 cases return 201/200.
"""

from datetime import date

from app.models.models import Event
from conftest import auth_header, make_producer, make_user

MSG = "שעת הסיום צריכה להיות אחרי שעת ההתחלה"


def _owner(db, email: str):
    # REUSES: tests/test_events.py:30 — approved producer who may publish.
    producer = make_producer(db, status="approved")
    user = make_user(db, role="producer", email=email, email_verified=True)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


def _payload(**overrides) -> dict:
    payload = {
        "title": "שוק גלם בנמל",
        "event_date": date(2099, 1, 1).isoformat(),
        "category": "שוק",
        "city": "תל אביב",
    }
    payload.update(overrides)
    return payload


def _messages(resp) -> str:
    return str(resp.json()["detail"])


class TestCreate:
    def test_end_after_start_is_stored_and_returned(self, client, db):
        user = _owner(db, "meh2469-a@example.com")
        resp = client.post(
            "/events",
            json=_payload(event_time="09:30", end_time="15:00"),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["end_time"] == "15:00:00"
        row = db.query(Event).filter(Event.id == resp.json()["id"]).one()
        assert str(row.end_time) == "15:00:00"
        # and it reaches the public read
        detail = client.get(f"/events/{resp.json()['id']}").json()
        assert detail["end_time"] == "15:00:00"

    def test_without_end_time_nothing_changes(self, client, db):
        user = _owner(db, "meh2469-b@example.com")
        resp = client.post(
            "/events", json=_payload(event_time="09:30"), headers=auth_header(user)
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["end_time"] is None

    def test_end_before_start_rejected(self, client, db):
        user = _owner(db, "meh2469-c@example.com")
        resp = client.post(
            "/events",
            json=_payload(event_time="15:00", end_time="09:30"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422
        assert MSG in _messages(resp)

    def test_end_equal_to_start_rejected(self, client, db):
        user = _owner(db, "meh2469-d@example.com")
        resp = client.post(
            "/events",
            json=_payload(event_time="10:00", end_time="10:00"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422
        assert MSG in _messages(resp)

    def test_end_without_start_rejected(self, client, db):
        user = _owner(db, "meh2469-e@example.com")
        resp = client.post(
            "/events", json=_payload(end_time="15:00"), headers=auth_header(user)
        )
        assert resp.status_code == 422
        assert MSG in _messages(resp)


class TestUpdate:
    def _created(self, client, user, **extra):
        resp = client.post("/events", json=_payload(**extra), headers=auth_header(user))
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    def test_adding_only_an_end_time_is_checked_against_the_stored_start(
        self, client, db
    ):
        user = _owner(db, "meh2469-f@example.com")
        event_id = self._created(client, user, event_time="09:30")
        bad = client.put(
            f"/events/{event_id}", json={"end_time": "08:00"}, headers=auth_header(user)
        )
        assert bad.status_code == 422
        assert bad.json()["detail"] == MSG
        good = client.put(
            f"/events/{event_id}", json={"end_time": "15:00"}, headers=auth_header(user)
        )
        assert good.status_code == 200, good.text
        assert good.json()["end_time"] == "15:00:00"

    def test_clearing_the_start_while_an_end_remains_is_rejected(self, client, db):
        user = _owner(db, "meh2469-g@example.com")
        event_id = self._created(client, user, event_time="09:30", end_time="15:00")
        resp = client.put(
            f"/events/{event_id}", json={"event_time": None}, headers=auth_header(user)
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == MSG
        row = db.query(Event).filter(Event.id == event_id).one()
        db.refresh(row)
        assert str(row.event_time) == "09:30:00"  # nothing half-applied

    def test_clearing_both_together_is_allowed(self, client, db):
        user = _owner(db, "meh2469-h@example.com")
        event_id = self._created(client, user, event_time="09:30", end_time="15:00")
        resp = client.put(
            f"/events/{event_id}",
            json={"event_time": None, "end_time": None},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["end_time"] is None
