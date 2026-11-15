"""MEH-3287 — a group buy whose deadline passed below its minimum is closed.

Before: nothing ran at the deadline (no job in startup.py). An open group that
missed its minimum stayed `open` forever and its participants were never told
it is not going ahead. The list and the join route already refused it
(group_buys.py MEH-2540), so the gap was the status and the email.

The service takes `now` so every case is pinned, not read off the runner clock.
"""

from datetime import timedelta

import pytest

import app.services.group_buy_expiry as expiry
import app.services.group_buy_notifications as notifications
from app.models.models import GroupBuy, GroupBuyCommit
from app.utils.clock import utc_now
from conftest import make_producer, make_user

NOW = utc_now()


@pytest.fixture
def mails(monkeypatch):
    """Every expiry email sent, as (to, subject, body, test_cause)."""
    sent = []
    monkeypatch.setattr(
        notifications,
        "_send_email",
        lambda to, subject, body, test_cause=False: sent.append(
            (to, subject, body, test_cause)
        ),
    )
    return sent


def _group(db, producer, *, status="open", deadline_delta=timedelta(hours=-1)):
    gb = GroupBuy(
        producer_id=producer.id,
        title="רכש קמח מלא",
        product_name="קמח מלא",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=5,
        deadline=NOW + deadline_delta,
        status=status,
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return gb


def _join(db, gb, email):
    user = make_user(db, email=email)
    db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=user.id, quantity=1))
    db.commit()
    return user


def test_open_group_past_deadline_is_cancelled_and_each_participant_mailed(db, mails):
    producer = make_producer(db, name="מאפיית הגליל")
    gb = _group(db, producer)
    _join(db, gb, "a@example.com")
    _join(db, gb, "b@example.com")

    assert expiry.expire_unfunded_group_buys(db, now=NOW) == 1

    db.refresh(gb)
    assert gb.status == "cancelled"
    assert sorted(m[0] for m in mails) == ["a@example.com", "b@example.com"]
    to, subject, body, test_cause = mails[0]
    assert subject == 'מהמקור — הקבוצה "רכש קמח מלא" לא הגיעה ליעד'
    assert (
        body == "שלום,\n\n"
        'הקבוצה שהצטרפת אליה, "רכש קמח מלא" של מאפיית הגליל, לא הגיעה '
        "למספר המשתתפים הנדרש עד המועד האחרון, ולכן היא לא יוצאת לפועל."
        "\n\nבברכה,\nצוות מהמקור"
    )
    assert test_cause is False


def test_second_run_sends_nothing(db, mails):
    gb = _group(db, make_producer(db))
    _join(db, gb, "a@example.com")
    expiry.expire_unfunded_group_buys(db, now=NOW)
    mails.clear()
    assert expiry.expire_unfunded_group_buys(db, now=NOW) == 0
    assert mails == []


@pytest.mark.parametrize(
    ("status", "delta"),
    [
        ("funded", timedelta(hours=-1)),  # reached its goal: not ours
        ("open", timedelta(hours=1)),  # deadline still ahead
        ("fulfilled", timedelta(hours=-1)),
        ("cancelled", timedelta(hours=-1)),
    ],
    ids=["funded-past", "open-future", "fulfilled-past", "cancelled-past"],
)
def test_other_groups_are_left_alone(db, mails, status, delta):
    gb = _group(db, make_producer(db), status=status, deadline_delta=delta)
    _join(db, gb, "a@example.com")
    assert expiry.expire_unfunded_group_buys(db, now=NOW) == 0
    db.refresh(gb)
    assert gb.status == status
    assert mails == []


def test_test_business_mail_carries_test_cause(db, mails):
    # MEH-2952: the send layer drops it; the service must still flag it.
    producer = make_producer(db)
    producer.is_test = True
    db.commit()
    gb = _group(db, producer)
    _join(db, gb, "a@example.com")
    expiry.expire_unfunded_group_buys(db, now=NOW)
    assert [m[3] for m in mails] == [True]


def test_group_with_no_participants_is_closed_silently(db, mails):
    gb = _group(db, make_producer(db))
    assert expiry.expire_unfunded_group_buys(db, now=NOW) == 1
    db.refresh(gb)
    assert gb.status == "cancelled"
    assert mails == []
