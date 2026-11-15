"""MEH-3314 — a full event or workshop takes a waitlist through the same
form; a cancel emails the first one waiting.

Before: a full item answered 409 «אין יותר מקומות» and nothing else, so a
freed spot went to whoever happened to look again.
"""

import pytest

import app.routers.registrations as r
import app.services.registration_waitlist as wl
from app.models.models import Registration
from test_meh2763_registrations import _event, _experience, _owner, _signup


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
            r,
            name,
            lambda to, m, test_cause=False, _n=name: calls.append((_n, to)),
        )
    monkeypatch.setattr(
        r,
        "send_waitlist_offer",
        lambda to, m, url, test_cause=False: calls.append(("offer", to, url)),
    )
    return calls


def _join(client, ev, email, waitlist=True, path="events"):
    body = {**_signup(email=email), "waitlist": waitlist}
    return client.post(f"/{path}/{ev.id}/registrations", json=body)


def _full_event(client, db, mail):
    owner = _owner(db, email="owner@example.com")
    ev = _event(db, owner, max_participants=1)
    assert _join(client, ev, "first@example.com", waitlist=False).status_code == 201
    mail.clear()
    return ev


def _rows(db, status):
    return sorted(
        x.email for x in db.query(Registration).filter(Registration.status == status)
    )


def test_a_full_event_puts_the_signup_on_the_waitlist(client, db, mail):
    ev = _full_event(client, db, mail)
    res = _join(client, ev, "w1@example.com")
    assert res.status_code == 201 and res.json() == {"status": "waitlisted"}
    assert _rows(db, "waitlisted") == ["w1@example.com"]
    # her own confirmation only — no «הרשמה חדשה» to the business
    assert mail == [("send_waitlist_confirmation", "w1@example.com")]


def test_a_full_event_without_the_waitlist_choice_is_still_409(client, db, mail):
    ev = _full_event(client, db, mail)
    res = _join(client, ev, "w1@example.com", waitlist=False)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "registration_full"
    assert _rows(db, "waitlisted") == []


def test_waitlist_with_a_free_spot_is_a_plain_signup(client, db, mail):
    owner = _owner(db)
    ev = _event(db, owner, max_participants=2)
    res = _join(client, ev, "a@example.com")
    assert res.json() == {"status": "registered"}
    assert _rows(db, "registered") == ["a@example.com"]


def test_joining_twice_or_when_registered_writes_nothing(client, db, mail):
    ev = _full_event(client, db, mail)
    _join(client, ev, "w1@example.com")
    again = _join(client, ev, "w1@example.com")
    listed = _join(client, ev, "first@example.com")
    # the same answer for all three: capacity alone decides it
    assert again.json() == listed.json() == {"status": "waitlisted"}
    assert db.query(Registration).count() == 2


def test_a_cancel_offers_the_spot_to_the_first_waiting_once(client, db, mail):
    ev = _full_event(client, db, mail)
    _join(client, ev, "w1@example.com")
    _join(client, ev, "w2@example.com")
    mail.clear()
    first = db.query(Registration).filter_by(email="first@example.com").one()
    assert client.post(f"/registrations/{first.cancel_token}/cancel").status_code == 200
    offers = [m for m in mail if m[0] == "offer"]
    assert offers == [("offer", "w1@example.com", offers[0][2])]
    assert offers[0][2].endswith(f"/events/{ev.id}")
    # cancelling the same link again offers nobody else
    mail.clear()
    client.post(f"/registrations/{first.cancel_token}/cancel")
    assert [m for m in mail if m[0] == "offer"] == []


def test_the_offered_visitor_signing_up_keeps_her_row(client, db, mail):
    ev = _full_event(client, db, mail)
    _join(client, ev, "w1@example.com")
    waiting = db.query(Registration).filter_by(email="w1@example.com").one()
    first = db.query(Registration).filter_by(email="first@example.com").one()
    client.post(f"/registrations/{first.cancel_token}/cancel")
    res = _join(client, ev, "w1@example.com", waitlist=False)
    assert res.json() == {"status": "registered"}
    db.expire_all()
    assert db.get(Registration, waiting.id).status == "registered"
    assert db.query(Registration).filter_by(email="w1@example.com").count() == 1


def test_leaving_the_waitlist_tells_nobody_and_offers_nothing(client, db, mail):
    ev = _full_event(client, db, mail)
    _join(client, ev, "w1@example.com")
    _join(client, ev, "w2@example.com")
    mail.clear()
    w1 = db.query(Registration).filter_by(email="w1@example.com").one()
    res = client.post(f"/registrations/{w1.cancel_token}/cancel")
    assert res.json()["status"] == "cancelled"
    assert mail == []


def test_a_full_workshop_takes_a_waitlist_too(client, db, mail):
    host = _owner(db)
    ex = _experience(db, host, max_participants=3, participants_count=3)
    res = _join(client, ex, "w@example.com", path="experiences")
    assert res.json() == {"status": "waitlisted"}
    assert mail == [("send_waitlist_confirmation", "w@example.com")]


def test_the_waitlist_has_a_cap(client, db, mail, monkeypatch):
    monkeypatch.setattr(wl, "WAITLIST_MAX", 1)
    ev = _full_event(client, db, mail)
    _join(client, ev, "w1@example.com")
    res = _join(client, ev, "w2@example.com")
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "waitlist_full"


def test_the_business_cancelling_the_event_tells_the_waitlist(db):
    from app.services.booking_cancellations import cancel_item_signups
    from fastapi import BackgroundTasks

    owner = _owner(db)
    ev = _event(db, owner, max_participants=1)
    db.add_all(
        [
            Registration(
                event_id=ev.id,
                name="דנה",
                phone="0521111111",
                email="a@example.com",
                cancel_token="t1",
                status="registered",
            ),
            Registration(
                event_id=ev.id,
                name="רוני",
                phone="0522222222",
                email="w@example.com",
                cancel_token="t2",
                status="waitlisted",
            ),
        ]
    )
    db.commit()
    bt = BackgroundTasks()
    assert cancel_item_signups(db, ev, bt, False) == 2
    assert sorted(t.args[0] for t in bt.tasks) == ["a@example.com", "w@example.com"]


def test_waitlist_emails_copy(monkeypatch):
    from app.services import registration_emails as m

    out = []
    monkeypatch.setattr(m, "send_email", lambda to, s, b, **k: out.append((s, b)))
    m.send_waitlist_confirmation(
        "a@example.com",
        m.VisitorEmail(
            title="יום פתוח",
            date_text="17.11.2026",
            time_text="",
            place="חדרה",
            host_name="מאפיית הגליל",
            item_url="https://x/events/1",
            cancel_url="https://x/registration/t",
        ),
    )
    m.send_waitlist_offer(
        "a@example.com",
        m.RegistrantEmail(
            title="יום פתוח",
            date_text="17.11.2026",
            time_text="10:00",
            place="חדרה",
            host_name="מאפיית הגליל",
            cancel_url="https://x/registration/t",
        ),
        "https://x/events/1",
    )
    (s1, b1), (s2, b2) = out
    assert s1 == 'נכנסתם לרשימת ההמתנה ל-"יום פתוח"'
    assert "יציאה מרשימת ההמתנה: https://x/registration/t" in b1
    assert s2 == 'התפנה מקום ב-"יום פתוח"'
    assert 'התפנה מקום ב-"יום פתוח" אצל מאפיית הגליל.' in b2
    assert "להרשמה: https://x/events/1" in b2
