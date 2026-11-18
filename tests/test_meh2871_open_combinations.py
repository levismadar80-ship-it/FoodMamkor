"""The four state combinations left open in docs/STATE_MACHINES.md, closed on
Sapir's decision of 18/11 (Refs MEH-2871).

1. An admin blocks the only owner of a live business → the business is taken
   off the site the way an admin pause does (delist_business), so its buyers
   are not left holding bookings nobody can serve. A co-owner who can still
   sign in keeps it up. Unblocking does not put it back.
2. An admin changes the role of a user who has a business linked → 409. The
   business used to stay live with no working owner.
3. A host sets fewer places than the sign-ups already taken → 422.
4. A recurring workshop whose first date has passed is cancelled, or its
   business leaves the live state → its sign-ups are cancelled and mailed
   (they used to stay "registered", silently), and the email names no date.
"""

# ruff: noqa: F811 — fixtures from test_meh3227_delist_cascade are injected by name.

from datetime import timedelta

from app.models import Producer, Registration, User
from app.services import registration_emails
from app.utils.clock import israel_today

from tests.conftest import auth_header, make_user
from tests.test_meh3227_delist_cascade import (  # noqa: F401
    _admin,
    _business,
    _event,
    _experience,
    _signup,
    sent,
)


def _status(db, model, row_id):
    db.expire_all()
    return db.get(model, row_id).status


# ---------- 1. blocking the owner ----------


class TestBlockingTheOwner:
    def test_blocking_the_only_owner_takes_the_business_off(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        reg = _signup(db, ev, "guest@example.com")

        r = client.post(
            f"/admin/users/{owner.id}/block", headers=auth_header(_admin(db))
        )
        assert r.status_code == 200, r.text
        assert r.json()["is_blocked"] is True
        assert r.json()["business_hidden"] is True

        assert _status(db, Producer, producer.id) == "inactive"
        assert _status(db, Registration, reg.id) == "cancelled"
        kinds = sorted(name for name, *_ in sent)
        assert "send_owner_delisted" in kinds
        assert "send_registrant_delisted" in kinds

    def test_a_co_owner_who_can_sign_in_keeps_it_up(self, client, db, sent):
        producer, owner = _business(db)
        co = make_user(db, role="producer", email="co-owner@example.com")
        co.producer_id = producer.id
        db.commit()

        r = client.post(
            f"/admin/users/{owner.id}/block", headers=auth_header(_admin(db))
        )
        assert r.status_code == 200, r.text
        assert r.json()["business_hidden"] is False
        assert _status(db, Producer, producer.id) == "approved"
        assert sent == []

    def test_a_blocked_co_owner_does_not_keep_it_up(self, client, db, sent):
        producer, owner = _business(db)
        co = make_user(db, role="producer", email="co-owner@example.com")
        co.producer_id = producer.id
        co.is_blocked = True
        db.commit()

        r = client.post(
            f"/admin/users/{owner.id}/block", headers=auth_header(_admin(db))
        )
        assert r.status_code == 200, r.text
        assert r.json()["business_hidden"] is True
        assert _status(db, Producer, producer.id) == "inactive"

    def test_unblocking_does_not_put_it_back(self, client, db, sent):
        producer, owner = _business(db)
        admin = _admin(db)
        client.post(f"/admin/users/{owner.id}/block", headers=auth_header(admin))
        assert _status(db, Producer, producer.id) == "inactive"

        r = client.post(f"/admin/users/{owner.id}/block", headers=auth_header(admin))
        assert r.status_code == 200, r.text
        assert r.json()["is_blocked"] is False
        assert _status(db, Producer, producer.id) == "inactive"

    def test_blocking_a_consumer_touches_no_business(self, client, db, sent):
        producer, _owner = _business(db)
        shopper = make_user(db, email="shopper@example.com")
        r = client.post(
            f"/admin/users/{shopper.id}/block", headers=auth_header(_admin(db))
        )
        assert r.status_code == 200, r.text
        assert r.json()["business_hidden"] is False
        assert _status(db, Producer, producer.id) == "approved"


# ---------- 2. changing an owner's role ----------


class TestOwnerRoleChange:
    def test_demoting_an_owner_is_refused(self, client, db):
        producer, owner = _business(db)
        r = client.put(
            f"/admin/users/{owner.id}/role",
            json={"role": "consumer"},
            headers=auth_header(_admin(db)),
        )
        assert r.status_code == 409, r.text
        assert "מקושר בית עסק" in r.json()["detail"]
        db.expire_all()
        assert db.get(User, owner.id).role == "producer"
        assert db.get(User, owner.id).producer_id == producer.id

    def test_a_user_with_no_business_still_changes_role(self, client, db):
        someone = make_user(db, email="plain@example.com")
        r = client.put(
            f"/admin/users/{someone.id}/role",
            json={"role": "admin"},
            headers=auth_header(_admin(db)),
        )
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "admin"


# ---------- 3. fewer places than sign-ups ----------


class TestFewerPlacesThanSignUps:
    def test_event_below_the_sign_ups_is_refused(self, client, db):
        producer, owner = _business(db)
        ev = _event(db, producer, max_participants=5)
        _signup(db, ev, "a@example.com")
        _signup(db, ev, "b@example.com")

        r = client.put(
            f"/events/{ev.id}", json={"max_participants": 1}, headers=auth_header(owner)
        )
        assert r.status_code == 422, r.text
        assert r.json()["detail"] == "כבר נרשמו 2, ולכן אי אפשר להגדיר פחות מקומות מזה."

    def test_event_down_to_exactly_the_sign_ups_is_allowed(self, client, db):
        producer, owner = _business(db)
        ev = _event(db, producer, max_participants=5)
        _signup(db, ev, "a@example.com")
        _signup(db, ev, "b@example.com")

        r = client.put(
            f"/events/{ev.id}", json={"max_participants": 2}, headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text
        assert r.json()["max_participants"] == 2

    def test_an_unchanged_max_already_below_the_sign_ups_still_saves(self, client, db):
        """The forms re-send max_participants on every save. A row cut below
        its sign-ups before this rule must stay editable (reviewer finding)."""
        producer, owner = _business(db)
        ev = _event(db, producer, max_participants=1)
        _signup(db, ev, "a@example.com")
        _signup(db, ev, "b@example.com")

        r = client.put(
            f"/events/{ev.id}",
            json={"title": "יום פתוח מחודש", "max_participants": 1},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "יום פתוח מחודש"

    def test_workshop_below_the_sign_ups_is_refused(self, client, db):
        _producer, owner = _business(db)
        ex = _experience(db, owner, max_participants=6)
        for n in range(3):
            _signup(db, ex, f"w{n}@example.com")

        r = client.put(
            f"/experiences/{ex.id}",
            json={"max_participants": 2},
            headers=auth_header(owner),
        )
        assert r.status_code == 422, r.text
        assert "כבר נרשמו 3" in r.json()["detail"]


# ---------- 4. a recurring workshop past its first date ----------


class TestRecurringWorkshopPastItsFirstDate:
    def _recurring(self, db, owner):
        return _experience(
            db,
            owner,
            days=-10,
            is_recurring=True,
            recurring_schedule="בכל יום שישי בבוקר",
        )

    def test_host_cancel_cancels_and_mails_the_sign_ups(self, client, db, sent):
        _producer, owner = _business(db)
        ex = self._recurring(db, owner)
        reg = _signup(db, ex, "regular@example.com")

        r = client.put(
            f"/experiences/{ex.id}",
            json={"is_active": False},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert _status(db, Registration, reg.id) == "cancelled"
        mails = [(name, to, payload) for name, to, payload, _ in sent]
        assert [(n, t) for n, t, _ in mails] == [
            ("send_registrant_cancelled", "regular@example.com")
        ]
        # The stored date is the long-past first occasion — not printed.
        assert mails[0][2].date_text == ""
        assert mails[0][2].time_text == ""

    def test_pausing_the_business_cancels_them_too(self, client, db, sent):
        producer, owner = _business(db)
        ex = self._recurring(db, owner)
        reg = _signup(db, ex, "regular@example.com")

        r = client.post(
            f"/admin/producers/{producer.id}/toggle-status",
            headers=auth_header(_admin(db)),
        )
        assert r.status_code == 200, r.text
        assert _status(db, Registration, reg.id) == "cancelled"

    def test_a_time_change_sends_no_dateless_moved_email(self, client, db, sent):
        """Past its first date a recurring workshop has no date to announce,
        so the "moved" email is not sent (reviewer finding)."""
        _producer, owner = _business(db)
        ex = self._recurring(db, owner)
        reg = _signup(db, ex, "regular@example.com")

        r = client.put(
            f"/experiences/{ex.id}",
            json={"event_time": "18:30"},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert _status(db, Registration, reg.id) == "registered"
        assert [name for name, *_ in sent] == []

    def test_a_past_one_off_workshop_is_still_left_alone(self, client, db, sent):
        _producer, owner = _business(db)
        ex = _experience(db, owner, days=-10)
        reg = _signup(db, ex, "past@example.com")

        client.put(
            f"/experiences/{ex.id}",
            json={"is_active": False},
            headers=auth_header(owner),
        )
        assert _status(db, Registration, reg.id) == "registered"
        assert sent == []


class TestEmailWithoutADate:
    def _lines(self, monkeypatch, sender, date_text):
        got = {}
        monkeypatch.setattr(
            registration_emails,
            "_send_lines",
            lambda to, subject, lines, **kw: got.update(lines=lines),
        )
        sender(
            "x@example.com",
            registration_emails.RegistrantEmail(
                title="סדנת לחם",
                date_text=date_text,
                time_text="",
                place="",
                host_name="מאפיית הגליל",
                cancel_url="",
            ),
        )
        return got["lines"][0]

    def test_cancelled_names_the_date_when_there_is_one(self, monkeypatch):
        line = self._lines(
            monkeypatch, registration_emails.send_registrant_cancelled, "יום שישי 20/11"
        )
        assert 'ביטל את "סדנת לחם" שתוכנן ל-יום שישי 20/11, ולכן' in line

    def test_cancelled_drops_the_clause_without_one(self, monkeypatch):
        line = self._lines(
            monkeypatch, registration_emails.send_registrant_cancelled, ""
        )
        assert 'ביטל את "סדנת לחם", ולכן ההרשמה שלכם בוטלה.' in line
        assert "שתוכנן" not in line

    def test_delisted_drops_the_clause_without_one(self, monkeypatch):
        line = self._lines(
            monkeypatch, registration_emails.send_registrant_delisted, ""
        )
        assert 'ההרשמה שלכם ל-"סדנת לחם" בוטלה.' in line
        assert " ב-" not in line.split("ההרשמה שלכם")[1]


def test_recurring_seed_is_really_in_the_past(db):
    """Control: the recurring cases above run on a first date before today."""
    _producer, owner = _business(db)
    ex = _experience(db, owner, days=-10, is_recurring=True)
    assert ex.event_date < israel_today() - timedelta(days=1)
