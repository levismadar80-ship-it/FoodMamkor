"""MEH-3592 — a group buy's caps beyond people, the business's stop switch,
quantity edits, the last-24-hours leave rule, the waitlist, and the email to
the business on a late join.

Before: max_participants was the only cap (one participant could take 100
units), nothing could stop joins short of «fulfilled», a quantity could not
change, a last-minute leave could cancel a funded group for everyone, a full
group turned visitors away with nothing, and the business never heard of a
join after the goal.
"""

from datetime import timedelta

import pytest

import app.services.group_buy_capacity as capacity
from app.models.models import GroupBuyCommit, GroupBuyWaitlist
from app.utils.clock import utc_now
from conftest import auth_header, make_user
from test_group_buys_api import _make_group_buy, _producer_user


@pytest.fixture
def mail(monkeypatch):
    calls = []
    monkeypatch.setattr(
        capacity, "send_waitlist_place", lambda email, *a, **kw: calls.append(("place", email))
    )
    monkeypatch.setattr(
        capacity,
        "send_late_joiner_to_producer",
        lambda owner, title, people, units, *a, **kw: calls.append(("late", owner, people, units)),
    )
    return calls


def _group(db, **kw):
    producer, owner = _producer_user(db, email="owner3592@example.com")
    max_units = kw.pop("max_units", None)
    gb = _make_group_buy(db, producer, **kw)
    gb.max_units = max_units
    db.commit()
    return gb, owner


def _member(db, gb, email, quantity=1):
    user = make_user(db, email=email)
    db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=user.id, quantity=quantity))
    db.commit()
    return user


def _join(client, gb, user, quantity=1):
    return client.post(
        f"/group-buys/{gb.id}/commit", json={"quantity": quantity}, headers=auth_header(user)
    )


# --- units cap -------------------------------------------------------------


def test_units_cap_refuses_a_join_past_it_and_names_what_is_left(client, db, mail):
    gb, _ = _group(db, max_units=10)
    _member(db, gb, "a@example.com", quantity=8)
    r = _join(client, gb, make_user(db, email="b@example.com"), quantity=3)
    assert r.status_code == 400
    assert "2" in r.json()["detail"]
    assert _join(client, gb, make_user(db, email="c@example.com"), quantity=2).status_code == 201


def test_units_left_is_in_the_detail_and_null_without_a_cap(client, db):
    gb, _ = _group(db, max_units=10)
    _member(db, gb, "a@example.com", quantity=4)
    assert client.get(f"/group-buys/{gb.id}").json()["units_left"] == 6
    gb.max_units = None
    db.commit()
    assert client.get(f"/group-buys/{gb.id}").json()["units_left"] is None


# --- the business's stop switch and caps -----------------------------------


def test_owner_can_stop_joins_and_a_join_is_then_refused(client, db, mail):
    gb, owner = _group(db)
    r = client.patch(f"/group-buys/{gb.id}/settings", json={"joins_open": False}, headers=auth_header(owner))
    assert r.status_code == 200 and r.json()["joins_closed"] is True
    r = _join(client, gb, make_user(db, email="a@example.com"))
    assert r.status_code == 400 and r.json()["detail"] == capacity.JOINS_CLOSED
    client.patch(f"/group-buys/{gb.id}/settings", json={"joins_open": True}, headers=auth_header(owner))
    assert _join(client, gb, make_user(db, email="b@example.com")).status_code == 201


def test_owner_cannot_cap_below_what_already_joined(client, db, mail):
    gb, owner = _group(db, min_participants=2)
    _member(db, gb, "a@example.com", quantity=5)
    _member(db, gb, "b@example.com", quantity=5)
    h = auth_header(owner)
    assert client.patch(f"/group-buys/{gb.id}/settings", json={"max_participants": 2}, headers=h).status_code == 200
    assert client.patch(f"/group-buys/{gb.id}/settings", json={"max_units": 9}, headers=h).status_code == 400
    assert client.patch(f"/group-buys/{gb.id}/settings", json={"max_units": 10}, headers=h).status_code == 200
    db.refresh(gb)
    assert gb.max_participants == 2 and gb.max_units == 10
    # An explicit null clears a cap; a missing field leaves it.
    client.patch(f"/group-buys/{gb.id}/settings", json={"max_units": None}, headers=h)
    db.refresh(gb)
    assert gb.max_units is None and gb.max_participants == 2


def test_a_stranger_cannot_change_settings(client, db):
    gb, _ = _group(db)
    other = make_user(db, email="x@example.com")
    r = client.patch(f"/group-buys/{gb.id}/settings", json={"joins_open": False}, headers=auth_header(other))
    assert r.status_code == 403
    db.refresh(gb)
    assert gb.joins_closed_at is None


# --- quantity edits --------------------------------------------------------


def test_a_participant_changes_her_quantity_within_the_cap(client, db, mail):
    gb, _ = _group(db, max_units=10)
    a = _member(db, gb, "a@example.com", quantity=2)
    _member(db, gb, "b@example.com", quantity=6)
    h = auth_header(a)
    assert client.patch(f"/group-buys/{gb.id}/commit", json={"quantity": 4}, headers=h).status_code == 200
    assert client.patch(f"/group-buys/{gb.id}/commit", json={"quantity": 5}, headers=h).status_code == 400
    row = db.query(GroupBuyCommit).filter_by(group_buy_id=gb.id, user_id=a.id).one()
    db.refresh(row)
    assert row.quantity == 4


def test_quantity_edit_after_deadline_is_refused(client, db):
    gb, _ = _group(db)
    a = _member(db, gb, "a@example.com")
    gb.deadline = utc_now() - timedelta(hours=1)
    db.commit()
    r = client.patch(f"/group-buys/{gb.id}/commit", json={"quantity": 3}, headers=auth_header(a))
    assert r.status_code == 400


# --- the last 24 hours -----------------------------------------------------


def test_last_day_leave_that_drops_below_goal_is_refused(client, db, mail):
    gb, _ = _group(db, status="funded", min_participants=2, deadline=utc_now() + timedelta(hours=10))
    a = _member(db, gb, "a@example.com")
    _member(db, gb, "b@example.com")
    r = client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(a))
    assert r.status_code == 400 and r.json()["detail"] == capacity.LAST_CALL_REFUSED
    assert db.query(GroupBuyCommit).filter_by(group_buy_id=gb.id).count() == 2


def test_last_day_leave_that_stays_at_goal_is_allowed(client, db, mail):
    gb, _ = _group(db, status="funded", min_participants=2, deadline=utc_now() + timedelta(hours=10))
    a = _member(db, gb, "a@example.com")
    _member(db, gb, "b@example.com")
    _member(db, gb, "c@example.com")
    assert client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(a)).status_code == 200


def test_leave_below_goal_two_days_out_is_allowed(client, db, mail):
    gb, _ = _group(db, status="funded", min_participants=2, deadline=utc_now() + timedelta(days=2))
    a = _member(db, gb, "a@example.com")
    _member(db, gb, "b@example.com")
    assert client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(a)).status_code == 200


# --- waitlist --------------------------------------------------------------


def test_waitlist_only_when_full_and_a_leave_offers_the_first_in_line(client, db, mail):
    gb, _ = _group(db, max_participants=2, min_participants=2, status="funded")
    a = _member(db, gb, "a@example.com")
    _member(db, gb, "b@example.com")
    w1, w2 = make_user(db, email="w1@example.com"), make_user(db, email="w2@example.com")
    assert client.post(f"/group-buys/{gb.id}/waitlist", json={"quantity": 1}, headers=auth_header(w1)).status_code == 201
    assert client.post(f"/group-buys/{gb.id}/waitlist", json={"quantity": 1}, headers=auth_header(w2)).status_code == 201
    assert client.get(f"/group-buys/{gb.id}", headers=auth_header(w1)).json()["user_waitlisted"] is True
    assert client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(a)).status_code == 200
    assert ("place", "w1@example.com") in mail
    assert ("place", "w2@example.com") not in mail
    # She joins: off the waitlist.
    assert _join(client, gb, w1).status_code == 201
    assert db.query(GroupBuyWaitlist).filter_by(group_buy_id=gb.id, user_id=w1.id).count() == 0


def test_waitlist_refused_while_there_is_room(client, db):
    gb, _ = _group(db, max_participants=5)
    r = client.post(f"/group-buys/{gb.id}/waitlist", json={"quantity": 1}, headers=auth_header(make_user(db, email="w@example.com")))
    assert r.status_code == 409


def test_waitlist_is_capped(client, db, monkeypatch):
    gb, _ = _group(db, max_participants=2)
    _member(db, gb, "a@example.com")
    _member(db, gb, "b@example.com")
    monkeypatch.setattr(capacity, "WAITLIST_MAX", 1)
    assert client.post(f"/group-buys/{gb.id}/waitlist", json={}, headers=auth_header(make_user(db, email="w1@example.com"))).status_code == 201
    assert client.post(f"/group-buys/{gb.id}/waitlist", json={}, headers=auth_header(make_user(db, email="w2@example.com"))).status_code == 409


def test_raising_the_cap_offers_a_waitlisted_visitor(client, db, mail):
    gb, owner = _group(db, max_participants=2)
    _member(db, gb, "a@example.com")
    _member(db, gb, "b@example.com")
    w = make_user(db, email="w@example.com")
    client.post(f"/group-buys/{gb.id}/waitlist", json={}, headers=auth_header(w))
    client.patch(f"/group-buys/{gb.id}/settings", json={"max_participants": 3}, headers=auth_header(owner))
    assert ("place", "w@example.com") in mail


def test_leave_waitlist(client, db):
    gb, _ = _group(db, max_participants=2)
    _member(db, gb, "a@example.com")
    _member(db, gb, "b@example.com")
    w = make_user(db, email="w@example.com")
    client.post(f"/group-buys/{gb.id}/waitlist", json={}, headers=auth_header(w))
    assert client.delete(f"/group-buys/{gb.id}/waitlist", headers=auth_header(w)).status_code == 200
    assert client.delete(f"/group-buys/{gb.id}/waitlist", headers=auth_header(w)).status_code == 404


# --- the business hears of a late join -------------------------------------


def test_a_join_after_the_goal_tells_the_business_count_and_units(client, db, mail):
    gb, _ = _group(db, status="funded", min_participants=2)
    gb.funded_notified_at = utc_now()
    db.commit()
    _member(db, gb, "a@example.com", quantity=2)
    _member(db, gb, "b@example.com", quantity=1)
    assert _join(client, gb, make_user(db, email="c@example.com"), quantity=3).status_code == 201
    assert ("late", "owner3592@example.com", 3, 6) in mail


def test_a_join_before_the_goal_does_not_mail_the_business_as_late(client, db, mail):
    gb, _ = _group(db, min_participants=3)
    assert _join(client, gb, make_user(db, email="a@example.com")).status_code == 201
    assert not [c for c in mail if c[0] == "late"]
