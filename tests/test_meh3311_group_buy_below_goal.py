"""MEH-3311 — a funded group buy that drops below its goal tells those who
stayed, once; when it is back at the goal everyone hears it, once.

Before: a leave reverted funded → open silently, and the one-way latch
(funded_notified_at, MEH-1651) meant a re-crossing sent nothing either.
The latch stays one-way; two more one-way stamps bound each participant to
three emails in all, however often the group flaps.
"""

import pytest

import app.services.group_buy_goal_flap as flap
from app.models.models import GroupBuyCommit
from app.utils.clock import utc_now
from conftest import auth_header, make_user
from test_group_buys_api import _make_group_buy, _producer_user


@pytest.fixture
def mail(monkeypatch):
    """(kind, recipients) per queued batch."""
    calls = []
    monkeypatch.setattr(
        flap,
        "send_below_goal_emails",
        lambda emails, *a, **kw: calls.append(("below", sorted(emails))),
    )
    monkeypatch.setattr(
        flap,
        "send_funded_notifications",
        lambda owner, emails, *a, **kw: calls.append(("funded", sorted(emails), owner)),
    )
    return calls


def _member(db, gb, email):
    user = make_user(db, email=email)
    db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=user.id, quantity=1))
    db.commit()
    return user


def _funded_group(db, members=("a@example.com", "b@example.com")):
    producer, _ = _producer_user(db)
    gb = _make_group_buy(db, producer, status="funded", min_participants=len(members))
    gb.funded_notified_at = utc_now()
    db.commit()
    users = [_member(db, gb, e) for e in members]
    return gb, users


def _leave(client, gb, user):
    return client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(user))


def _join(client, db, gb, email):
    user = make_user(db, email=email)
    r = client.post(
        f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(user)
    )
    assert r.status_code == 201, r.text
    return user


def test_dropping_below_goal_tells_those_who_stayed(client, db, mail):
    gb, (a, _b) = _funded_group(db)
    assert _leave(client, gb, a).status_code == 200
    db.refresh(gb)
    assert gb.status == "open"
    assert mail == [("below", ["b@example.com"])]
    assert gb.below_goal_notified_at is not None


def test_a_leave_that_stays_at_goal_sends_nothing(client, db, mail):
    gb, (a, _b, _c) = _funded_group(
        db, ("a@example.com", "b@example.com", "c@example.com")
    )
    gb.min_participants = 2
    db.commit()
    assert _leave(client, gb, a).status_code == 200
    db.refresh(gb)
    assert gb.status == "funded"
    assert mail == []


def test_back_at_goal_mails_everyone_once_without_the_business(client, db, mail):
    gb, (a, _b) = _funded_group(db)
    _leave(client, gb, a)
    _join(client, db, gb, "new@example.com")
    db.refresh(gb)
    assert gb.status == "funded"
    assert mail == [
        ("below", ["b@example.com"]),
        ("funded", ["b@example.com", "new@example.com"], None),
    ]


def test_a_second_flap_sends_nothing_more(client, db, mail):
    gb, (a, _b) = _funded_group(db)
    _leave(client, gb, a)
    newcomer = _join(client, db, gb, "new@example.com")
    _leave(client, gb, newcomer)
    _join(client, db, gb, "again@example.com")
    assert [kind for kind, *_ in mail] == ["below", "funded"]


def test_a_group_never_announced_as_funded_sends_nothing(client, db, mail):
    gb, (a, _b) = _funded_group(db)
    gb.funded_notified_at = None  # e.g. funded by the owner, not by joins
    db.commit()
    _leave(client, gb, a)
    assert mail == []


def test_below_goal_copy(monkeypatch):
    out = []
    monkeypatch.setattr(
        flap, "send_email", lambda to, s, b, **kw: out.append((to, s, b))
    )
    flap.send_below_goal_emails(["b@example.com"], "קמח מלא", "טחנת הגליל", "gb-1")
    to, subject, body = out[0]
    assert to == "b@example.com"
    assert subject == 'מהמקור — הקבוצה "קמח מלא" ירדה מתחת ליעד'
    assert 'מישהו עזב את הקבוצה "קמח מלא" של טחנת הגליל' in body
    assert "ההצטרפות שלכם נשארת בתוקף" in body
    assert body.rstrip().endswith("/group-buys/gb-1\n\nבברכה,\nצוות מהמקור".rstrip())
    assert "@" not in body  # MEH-1651: no contact details in a body
