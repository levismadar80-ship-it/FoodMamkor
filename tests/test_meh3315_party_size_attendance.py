"""MEH-3315 — one sign-up for a party of up to 10, and «הגיעו / לא הגיעו»
for the business.

Before: every sign-up took exactly one place, so a family of four filled
four form submits, and the owner had no way to note who came.
"""

import pytest

import app.routers.registrations as r
from app.models.models import Registration
from conftest import auth_header, make_user
from test_meh2763_registrations import _event, _experience, _owner, _signup


@pytest.fixture(autouse=True)
def _no_mail(monkeypatch):
    for name in (
        "send_visitor_confirmation",
        "send_owner_new_registration",
        "send_owner_cancellation",
        "send_waitlist_confirmation",
    ):
        monkeypatch.setattr(r, name, lambda *a, **k: None)
    monkeypatch.setattr(r, "send_waitlist_offer", lambda *a, **k: None)


def _post(client, item, email, party, path="events", **extra):
    body = {**_signup(email=email), "party_size": party, **extra}
    return client.post(f"/{path}/{item.id}/registrations", json=body)


def test_ten_places_eight_taken_three_refused_two_allowed(client, db):
    ev = _event(db, _owner(db), max_participants=10)
    assert _post(client, ev, "a@example.com", 4).status_code == 201
    assert _post(client, ev, "b@example.com", 4).status_code == 201
    three = _post(client, ev, "c@example.com", 3)
    assert three.status_code == 409
    assert three.json()["detail"] == {
        "code": "registration_not_enough",
        "message": "נשארו רק 2 מקומות",
    }
    assert _post(client, ev, "d@example.com", 2).status_code == 201
    full = _post(client, ev, "e@example.com", 1)
    assert full.json()["detail"]["code"] == "registration_full"


def test_places_left_on_the_page_count_people(client, db):
    ev = _event(db, _owner(db), max_participants=10)
    _post(client, ev, "a@example.com", 3)
    assert client.get(f"/events/{ev.id}").json()["spots_left"] == 7


def test_a_workshop_sums_the_party_with_the_host_tally(client, db):
    ex = _experience(db, _owner(db), max_participants=6, participants_count=2)
    assert _post(client, ex, "a@example.com", 5, path="experiences").status_code == 409
    assert _post(client, ex, "a@example.com", 4, path="experiences").status_code == 201


@pytest.mark.parametrize("party", [0, 11])
def test_party_size_is_one_to_ten(client, db, party):
    ev = _event(db, _owner(db), max_participants=40)
    assert _post(client, ev, "a@example.com", party).status_code == 422


def test_a_party_too_big_for_the_places_left_can_join_the_waitlist(client, db):
    ev = _event(db, _owner(db), max_participants=4)
    _post(client, ev, "a@example.com", 3)
    res = _post(client, ev, "b@example.com", 2, waitlist=True)
    assert res.json() == {"status": "waitlisted"}


def _row(db, email):
    return db.query(Registration).filter_by(email=email).one()


def test_the_owner_marks_attendance_and_the_list_shows_it(client, db):
    owner = _owner(db)
    ev = _event(db, owner, max_participants=10)
    _post(client, ev, "a@example.com", 2)
    reg = _row(db, "a@example.com")
    res = client.patch(
        f"/registrations/{reg.id}/attendance",
        json={"attendance": "no_show"},
        headers=auth_header(owner),
    )
    assert res.status_code == 200
    assert res.json()["attendance"] == "no_show"
    rows = client.get(f"/events/{ev.id}/registrations", headers=auth_header(owner)).json()
    assert [(x["party_size"], x["attendance"]) for x in rows] == [(2, "no_show")]
    cleared = client.patch(
        f"/registrations/{reg.id}/attendance",
        json={"attendance": None},
        headers=auth_header(owner),
    )
    assert cleared.json()["attendance"] is None


def test_the_workshop_host_marks_attendance(client, db):
    host = _owner(db)
    ex = _experience(db, host, max_participants=10)
    _post(client, ex, "a@example.com", 1, path="experiences")
    reg = _row(db, "a@example.com")
    res = client.patch(
        f"/registrations/{reg.id}/attendance",
        json={"attendance": "attended"},
        headers=auth_header(host),
    )
    assert res.status_code == 200


def test_attendance_is_owner_or_admin_only_else_403(client, db):
    owner = _owner(db)
    ev = _event(db, owner, max_participants=10)
    _post(client, ev, "a@example.com", 1)
    reg = _row(db, "a@example.com")
    stranger = _owner(db, email="other-owner@example.com")
    consumer = make_user(db, email="consumer@example.com")
    for user in (stranger, consumer):
        res = client.patch(
            f"/registrations/{reg.id}/attendance",
            json={"attendance": "attended"},
            headers=auth_header(user),
        )
        assert res.status_code == 403
    admin = make_user(db, role="admin", email="admin3315@example.com")
    res = client.patch(
        f"/registrations/{reg.id}/attendance",
        json={"attendance": "attended"},
        headers=auth_header(admin),
    )
    assert res.status_code == 200
    db.expire_all()
    assert _row(db, "a@example.com").attendance == "attended"


def test_a_no_show_blocks_nothing(client, db):
    owner = _owner(db)
    ev = _event(db, owner, max_participants=10)
    _post(client, ev, "a@example.com", 1)
    reg = _row(db, "a@example.com")
    client.patch(
        f"/registrations/{reg.id}/attendance",
        json={"attendance": "no_show"},
        headers=auth_header(owner),
    )
    other = _event(db, owner, max_participants=10, title="אירוע שני")
    assert _post(client, other, "a@example.com", 1).status_code == 201
