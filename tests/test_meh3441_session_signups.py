"""MEH-3441 (stage 2 of MEH-3264): a recurring workshop booked per date.

Before: places, the waitlist and the duplicate check counted the whole
workshop, so once this week was full nobody could book next week, and a
visitor who came last week could not sign up again. Now an owner lists dates
and each one has its own places, waitlist and sign-ups.
"""

from datetime import timedelta

import pytest

import app.routers.registrations as r
import app.services.booking_cancellations as bc
from app.models.models import Experience, Registration
from app.utils.clock import israel_today

from tests.conftest import auth_header
from test_meh2763_registrations import _experience, _owner, _signup

D1 = israel_today() + timedelta(days=7)
D2 = israel_today() + timedelta(days=14)


@pytest.fixture
def mail(monkeypatch):
    calls = []
    for name in (
        "send_visitor_confirmation",
        "send_owner_new_registration",
        "send_owner_cancellation",
        "send_waitlist_confirmation",
    ):
        monkeypatch.setattr(
            r, name, lambda to, m, test_cause=False, _n=name: calls.append((_n, to, m))
        )
    monkeypatch.setattr(
        r,
        "send_waitlist_offer",
        lambda to, m, url, test_cause=False: calls.append(("offer", to, m)),
    )
    for name in ("send_registrant_cancelled",):
        monkeypatch.setattr(
            bc, name, lambda to, m, _n=name, **kw: calls.append((_n, to, m))
        )
    return calls


def _s(day, at="10:00", count=0):
    return {"date": day.isoformat(), "time": at, "participants_count": count}


def _workshop(db, **kw):
    host = _owner(db, email="host@example.com")
    ex = _experience(
        db,
        host,
        is_recurring=True,
        max_participants=kw.pop("max_participants", 1),
        sessions=kw.pop("sessions", [_s(D1), _s(D2)]),
        **kw,
    )
    return host, ex


def _join(client, ex, email, day=None, **kw):
    at = kw.get("at", "10:00")
    body = {**_signup(email=email), "waitlist": kw.get("waitlist", False)}
    if day is not None:
        body |= {"session_date": day.isoformat(), "session_time": at}
    return client.post(f"/experiences/{ex.id}/registrations", json=body)


def _put(client, host, ex, sessions):
    return client.put(
        f"/experiences/{ex.id}", json={"sessions": sessions}, headers=auth_header(host)
    )


def _active(db, email):
    return (
        db.query(Registration.session_date, Registration.status)
        .filter(Registration.email == email)
        .order_by(Registration.session_date)
        .all()
    )


# ---------- the owner saves dates ----------


class TestOwnerSavesDates:
    def test_dates_are_stored_sorted_and_do_not_resend_to_moderation(self, client, db):
        host, ex = _workshop(db, sessions=None, max_participants=5)
        res = _put(client, host, ex, [_s(D2, "18:00", 2), _s(D1)])
        assert res.status_code == 200, res.text
        db.expire_all()
        got = db.get(Experience, ex.id)
        assert got.sessions == [_s(D1), _s(D2, "18:00", 2)]
        assert got.status == "approved"

    def test_a_date_twice_is_refused(self, client, db):
        host, ex = _workshop(db)
        res = _put(client, host, ex, [_s(D1), _s(D1)])
        assert res.status_code == 422
        assert "המועד הזה כבר ברשימה." in res.text

    def test_a_new_past_date_is_refused(self, client, db):
        host, ex = _workshop(db)
        res = _put(client, host, ex, [_s(israel_today() - timedelta(days=1))])
        assert res.status_code == 422
        assert "בחרו תאריך עתידי." in res.text

    def test_thirteen_upcoming_dates_are_refused(self, client, db):
        host, ex = _workshop(db)
        days = [_s(israel_today() + timedelta(days=i)) for i in range(2, 15)]
        res = _put(client, host, ex, days)
        assert res.status_code == 422
        assert "אפשר להוסיף עד 12 מועדים קדימה." in res.text
        assert _put(client, host, ex, days[:12]).status_code == 200

    def test_a_past_date_already_stored_is_dropped_not_refused(self, client, db):
        past = israel_today() - timedelta(days=3)
        host, ex = _workshop(db, sessions=[_s(past), _s(D1)])
        assert _put(client, host, ex, [_s(past), _s(D1), _s(D2)]).status_code == 200
        db.expire_all()
        assert db.get(Experience, ex.id).sessions == [_s(D1), _s(D2)]

    def test_removing_a_date_cancels_its_sign_ups_and_mails_them(
        self, client, db, mail
    ):
        host, ex = _workshop(db, max_participants=5)
        assert _join(client, ex, "a@example.com", D1).status_code == 201
        assert _join(client, ex, "b@example.com", D2).status_code == 201
        mail.clear()
        assert _put(client, host, ex, [_s(D2)]).status_code == 200
        db.expire_all()
        assert _active(db, "a@example.com") == [(D1, "cancelled")]
        assert _active(db, "b@example.com") == [(D2, "registered")]
        assert [(k, to) for k, to, _ in mail] == [
            ("send_registrant_cancelled", "a@example.com")
        ]


# ---------- sign-up per date ----------


class TestSignupPerDate:
    def test_a_workshop_with_dates_needs_one(self, client, db):
        _host, ex = _workshop(db)
        res = _join(client, ex, "a@example.com")
        assert res.status_code == 422
        assert "בחרו מועד." in res.text

    def test_a_date_not_on_the_list_is_closed(self, client, db):
        _host, ex = _workshop(db)
        res = _join(client, ex, "a@example.com", D1, at="11:00")
        assert res.status_code == 409

    def test_a_full_date_beside_a_free_one(self, client, db, mail):
        _host, ex = _workshop(db)
        assert _join(client, ex, "a@example.com", D1).status_code == 201
        assert _join(client, ex, "b@example.com", D1).status_code == 409
        assert _join(client, ex, "b@example.com", D2).status_code == 201

    def test_the_owner_tally_of_one_date_fills_only_that_date(self, client, db, mail):
        _host, ex = _workshop(db, sessions=[_s(D1, count=1), _s(D2)])
        assert _join(client, ex, "a@example.com", D1).status_code == 409
        assert _join(client, ex, "a@example.com", D2).status_code == 201

    def test_one_address_on_two_dates(self, client, db, mail):
        _host, ex = _workshop(db, max_participants=5)
        assert _join(client, ex, "a@example.com", D1).status_code == 201
        assert _join(client, ex, "a@example.com", D2).status_code == 201
        assert _join(client, ex, "a@example.com", D1).status_code == 201  # silent
        assert _active(db, "a@example.com") == [(D1, "registered"), (D2, "registered")]

    def test_a_workshop_without_dates_works_as_before(self, client, db, mail):
        _host, ex = _workshop(db, sessions=None)
        assert _join(client, ex, "a@example.com").status_code == 201
        assert _active(db, "a@example.com") == [(None, "registered")]

    def test_the_emails_name_the_date(self, client, db, mail):
        _host, ex = _workshop(db)
        assert _join(client, ex, "a@example.com", D2, at="10:00").status_code == 201
        visitor = next(m for k, to, m in mail if k == "send_visitor_confirmation")
        owner = next(m for k, to, m in mail if k == "send_owner_new_registration")
        assert (visitor.date_text, visitor.time_text) == (
            D2.strftime("%d.%m.%Y"),
            "10:00",
        )
        assert owner.session_text == f"{D2.strftime('%d.%m.%Y')}, 10:00"


# ---------- the waitlist per date ----------


class TestWaitlistPerDate:
    def test_a_cancel_offers_the_place_to_the_same_date_only(self, client, db, mail):
        _host, ex = _workshop(db)
        assert _join(client, ex, "a@example.com", D1).status_code == 201
        assert _join(client, ex, "b@example.com", D2).status_code == 201
        assert _join(client, ex, "w2@example.com", D2, waitlist=True).json() == {
            "status": "waitlisted"
        }
        assert _join(client, ex, "w1@example.com", D1, waitlist=True).json() == {
            "status": "waitlisted"
        }
        mail.clear()
        a = db.query(Registration).filter_by(email="a@example.com").one()
        res = client.post(f"/registrations/{a.cancel_token}/cancel")
        assert res.status_code == 200
        assert res.json()["event_date"] == D1.isoformat()
        assert [to for k, to, _ in mail if k == "offer"] == ["w1@example.com"]


# ---------- what is read back ----------


class TestReads:
    def test_the_public_page_lists_upcoming_dates_with_places(self, client, db, mail):
        past = israel_today() - timedelta(days=2)
        _host, ex = _workshop(
            db, max_participants=3, sessions=[_s(past), _s(D1, count=1), _s(D2)]
        )
        assert _join(client, ex, "a@example.com", D1).status_code == 201
        body = client.get(f"/experiences/{ex.id}").json()
        assert body["sessions"] == [
            {
                "date": D1.isoformat(),
                "time": "10:00",
                "participants_count": 1,
                "spots_left": 1,
            },
            {
                "date": D2.isoformat(),
                "time": "10:00",
                "participants_count": 0,
                "spots_left": 3,
            },
        ]
        assert body["spots_left"] is None  # per date, not one pool

    def test_the_owner_list_gives_each_sign_up_its_date(self, client, db, mail):
        host, ex = _workshop(db, max_participants=5)
        assert _join(client, ex, "a@example.com", D2).status_code == 201
        rows = client.get(
            f"/experiences/{ex.id}/registrations", headers=auth_header(host)
        ).json()
        assert [(x["session_date"], x["session_time"]) for x in rows] == [
            (D2.isoformat(), "10:00:00")
        ]


def test_the_evening_before_a_date_its_sign_ups_are_reminded(
    client, db, mail, monkeypatch
):
    import app.services.registration_reminders as rr

    tomorrow = israel_today() + timedelta(days=1)
    _host, ex = _workshop(db, max_participants=5, sessions=[_s(tomorrow), _s(D2)])
    assert _join(client, ex, "soon@example.com", tomorrow).status_code == 201
    assert _join(client, ex, "later@example.com", D2).status_code == 201
    got = []
    monkeypatch.setattr(
        rr,
        "send_registration_reminder",
        lambda to, m, test_cause=False: got.append((to, m)),
    )
    assert rr.send_registration_reminders(db) == 1
    assert [to for to, _ in got] == ["soon@example.com"]
    assert got[0][1].date_text == tomorrow.strftime("%d.%m.%Y")
