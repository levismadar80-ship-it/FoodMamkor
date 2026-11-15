"""MEH-3310 — a business edit never strands its on-site registrants silently.

Before: the owner could set fewer places than people already signed up, and
could switch «איך נרשמים?» away from the site form, and nobody was told.
Now the first is refused (409) and the second keeps every sign-up and mails
each registrant once.
"""

from datetime import timedelta

import pytest

import app.services.booking_cancellations as bc
from app.models.models import Registration
from tests.test_meh3227_delist_cascade import (
    SENDERS,
    _business,
    _event,
    _experience,
    _kinds,
    _signup,
    _statuses,
)
from conftest import auth_header


@pytest.fixture
def sent(monkeypatch):
    calls: list[tuple] = []
    for name in (*SENDERS, "send_registrant_method_changed"):
        monkeypatch.setattr(
            bc,
            name,
            lambda to, payload, _n=name, **kw: calls.append((_n, to, payload, kw)),
        )
    return calls


@pytest.fixture
def approve_all(monkeypatch):
    import app.routers.experiences as ex_router

    verdict = {"status": "APPROVED", "reason": None, "suggestion": None}
    monkeypatch.setattr(ex_router, "validate_experience", lambda _: verdict)


EXTERNAL = {
    "registration_method": "external_url",
    "registration_url": "https://example.com/r",
}


class TestPlacesBelowSignups:
    def test_event_cut_below_signups_is_refused(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer, max_participants=10)
        _signup(db, ev, "a@example.com")
        _signup(db, ev, "b@example.com")
        r = client.put(
            f"/events/{ev.id}", json={"max_participants": 1}, headers=auth_header(owner)
        )
        assert r.status_code == 409, r.text
        detail = r.json()["detail"]
        assert detail["code"] == "max_below_registrations"
        assert detail["params"] == {"registered": 2}
        assert "כבר נרשמו 2 דרך האתר" in detail["message"]
        db.refresh(ev)
        assert ev.max_participants == 10
        assert sent == []

    def test_event_cut_to_exactly_the_signups_is_allowed(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer, max_participants=10)
        _signup(db, ev, "a@example.com")
        _signup(db, ev, "b@example.com")
        r = client.put(
            f"/events/{ev.id}", json={"max_participants": 2}, headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text

    def test_a_cancelled_signup_does_not_count(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer, max_participants=10)
        gone = _signup(db, ev, "gone@example.com")
        gone.status = "cancelled"
        db.commit()
        r = client.put(
            f"/events/{ev.id}", json={"max_participants": 0}, headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text

    def test_experience_cut_below_signups_is_refused(
        self, client, db, sent, approve_all
    ):
        _, owner = _business(db)
        ex = _experience(db, owner, max_participants=8)
        _signup(db, ex, "a@example.com")
        _signup(db, ex, "b@example.com")
        r = client.put(
            f"/experiences/{ex.id}",
            json={"max_participants": 1},
            headers=auth_header(owner),
        )
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["code"] == "max_below_registrations"
        db.refresh(ex)
        assert ex.max_participants == 8

    def test_cancelling_and_cutting_together_is_allowed(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer, max_participants=10)
        _signup(db, ev, "a@example.com")
        r = client.put(
            f"/events/{ev.id}",
            json={"max_participants": 0, "is_active": False},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert _kinds(sent) == [("send_registrant_cancelled", "a@example.com")]


class TestLeavingTheSiteForm:
    def test_event_switch_keeps_signups_and_tells_each_once(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        a = _signup(db, ev, "a@example.com")
        b = _signup(db, ev, "b@example.com")
        r = client.put(f"/events/{ev.id}", json=EXTERNAL, headers=auth_header(owner))
        assert r.status_code == 200, r.text
        assert _statuses(db, Registration, [a.id, b.id]) == [
            ("registered",),
            ("registered",),
        ]
        assert _kinds(sent) == [
            ("send_registrant_method_changed", "a@example.com"),
            ("send_registrant_method_changed", "b@example.com"),
        ]
        assert sent[0][2].cancel_url.endswith("/registration/tok-a@example.com")

    def test_experience_switch_tells_registrants(self, client, db, sent, approve_all):
        _, owner = _business(db)
        ex = _experience(db, owner)
        _signup(db, ex, "a@example.com")
        r = client.put(
            f"/experiences/{ex.id}", json=EXTERNAL, headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text
        assert _kinds(sent) == [("send_registrant_method_changed", "a@example.com")]

    def test_resaving_the_same_method_sends_nothing(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        _signup(db, ev, "a@example.com")
        r = client.put(
            f"/events/{ev.id}",
            json={"registration_method": "site_form"},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert sent == []

    def test_move_and_switch_together_send_one_email(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        _signup(db, ev, "a@example.com")
        new_date = ev.event_date + timedelta(days=3)
        r = client.put(
            f"/events/{ev.id}",
            json={**EXTERNAL, "event_date": new_date.isoformat()},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert _kinds(sent) == [("send_registrant_moved", "a@example.com")]

    def test_switch_and_cancel_together_only_cancels(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        _signup(db, ev, "a@example.com")
        r = client.put(
            f"/events/{ev.id}",
            json={**EXTERNAL, "is_active": False},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert _kinds(sent) == [("send_registrant_cancelled", "a@example.com")]


def test_the_method_changed_copy(monkeypatch):
    from app.services import registration_emails as re_mod
    from app.services.registration_emails import RegistrantEmail

    out = []
    monkeypatch.setattr(re_mod, "send_email", lambda *a, **k: out.append(a))
    re_mod.send_registrant_method_changed(
        "a@example.com",
        RegistrantEmail(
            title="יום פתוח",
            date_text="01.12.2026",
            time_text="",
            place="חדרה",
            host_name="מאפיית הגליל",
            cancel_url="https://mehamakor.co.il/registration/t",
        ),
    )
    to, subject, body = out[0][:3]
    assert subject == 'עדכון על ההרשמה ל"יום פתוח"'
    assert 'ההרשמות ל"יום פתוח" אצל מאפיית הגליל כבר לא נעשות דרך מהמקור.' in body
    assert "ההרשמה שלכם נשארת בתוקף" in body
    assert "https://mehamakor.co.il/registration/t" in body
