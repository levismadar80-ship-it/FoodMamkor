"""MEH-3289 — a group buy that reached its minimum keeps taking participants.

Before: reaching min_participants flipped the group to `funded` and every
further join got 400 (group_buys.py commit route), so `max_participants` in
the owner's form did nothing. Decided 14/11 by the stronger-model review
standing in for Sapir: a funded group takes joins until it is full or its
deadline passes, and stays funded.

A late joiner gets the existing «הגיעה ליעד» email, alone: the one-way latch
(funded_notified_at, MEH-1651) means the group-wide send never fires again.
"""

from datetime import timedelta

import pytest

import app.routers.group_buys as gb_router
from app.models.models import GroupBuyCommit
from app.utils.clock import utc_now
from conftest import auth_header, make_user
from test_group_buys_api import _make_group_buy, _producer_user


@pytest.fixture
def funded_sends(monkeypatch):
    """Every funded-email batch queued, as (participants, late_joiner)."""
    calls = []
    monkeypatch.setattr(
        gb_router,
        "send_funded_notifications",
        lambda _owner, participants, *a, **kw: calls.append(
            (list(participants), kw.get("late_joiner", False))
        ),
    )
    return calls


def _join(client, db, gb, email):
    user = make_user(db, email=email)
    return client.post(
        f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(user)
    )


def _funded(db, *, max_participants=None):
    producer, _ = _producer_user(db)
    gb = _make_group_buy(
        db,
        producer,
        status="funded",
        min_participants=1,
        max_participants=max_participants,
    )
    gb.funded_notified_at = utc_now()  # the group-wide send already went out
    db.commit()
    return gb


def test_funded_group_with_room_takes_a_join_and_stays_funded(client, db, funded_sends):
    gb = _funded(db, max_participants=3)
    r = _join(client, db, gb, "late@example.com")
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "funded"
    db.refresh(gb)
    assert gb.status == "funded"
    assert db.query(GroupBuyCommit).filter_by(group_buy_id=gb.id).count() == 1


def test_late_joiner_alone_gets_the_funded_email(client, db, funded_sends):
    gb = _funded(db)
    r = _join(client, db, gb, "late@example.com")
    assert r.status_code == 201, r.text
    assert funded_sends == [(["late@example.com"], True)]


def test_full_funded_group_refuses(client, db, funded_sends):
    gb = _funded(db, max_participants=1)
    assert _join(client, db, gb, "a@example.com").status_code == 201
    r = _join(client, db, gb, "b@example.com")
    assert r.status_code == 400
    assert r.json()["detail"] == "קבוצת הרכישה מלאה"


def test_funded_group_past_deadline_refuses(client, db, funded_sends):
    gb = _funded(db)
    gb.deadline = utc_now() - timedelta(hours=1)
    db.commit()
    assert _join(client, db, gb, "a@example.com").status_code == 400


def test_open_group_crossing_minimum_still_sends_the_group_email(
    client, db, funded_sends
):
    producer, _ = _producer_user(db)
    gb = _make_group_buy(db, producer, status="open", min_participants=1)
    r = _join(client, db, gb, "first@example.com")
    assert r.json()["status"] == "funded"
    assert funded_sends == [(["first@example.com"], False)]  # MEH-1651 group send
