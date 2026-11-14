"""MEH-3108 — «מה מחכה לך» on the dashboard home: GET /producers/me/dashboard
carries `attention` with what is waiting for the owner.

- reviews with no reply (hidden ones don't count — they are not on the page)
- sign-ups from the last 7 days, per event / workshop, cancelled ones out
- group buys in «funded» (reached the goal, not yet closed or delivered)
Every count is pinned at 0 first, so a payload that always says 0 fails.
"""

import secrets
from datetime import timedelta

from app.models import ProducerReview
from app.models.models import GroupBuy, Registration
from app.utils.clock import utc_now
from conftest import auth_header, make_producer, make_user
from test_meh2763_registrations import _event, _experience, _owner


def _attention(client, owner):
    r = client.get("/producers/me/dashboard", headers=auth_header(owner))
    assert r.status_code == 200, r.text
    return r.json()["attention"]


def _review(db, producer_id, *, reply=None, hidden=False):
    consumer = make_user(db, role="consumer")
    db.add(ProducerReview(producer_id=producer_id, user_id=consumer.id, stars=5, reply=reply, is_hidden=hidden))
    db.commit()


def _reg(db, *, event=None, experience=None, days_ago=0, status="registered"):
    db.add(
        Registration(
            event_id=event.id if event else None,
            experience_id=experience.id if experience else None,
            name="דנה כהן", phone="052-7654321", email=f"{secrets.token_hex(4)}@example.com",
            cancel_token=secrets.token_hex(16), status=status,
            created_at=utc_now() - timedelta(days=days_ago),
        )
    )
    db.commit()


def _group_buy(db, producer_id, status):
    db.add(
        GroupBuy(
            producer_id=producer_id, title=f"רכש {status}", product_name="קמח מלא", unit="שק",
            price_per_unit_regular=120, price_per_unit_group=90, min_participants=5,
            deadline=utc_now() + timedelta(days=7), city="חדרה", status=status,
            fulfillment_note="איסוף מהמאפייה",
        )
    )
    db.commit()


def test_nothing_waiting_is_all_zero(client, db):
    owner = _owner(db, email="att-0@example.com")
    assert _attention(client, owner) == {"unreplied_reviews": 0, "new_signups": [], "funded_group_buys": 0}


def test_unreplied_reviews_count_only_visible_ones_with_no_reply(client, db):
    owner = _owner(db, email="att-r@example.com")
    _review(db, owner.producer_id)
    _review(db, owner.producer_id)
    _review(db, owner.producer_id, reply="תודה רבה")
    _review(db, owner.producer_id, hidden=True)
    # another business's review is not hers
    _review(db, make_producer(db).id)
    assert _attention(client, owner)["unreplied_reviews"] == 2


def test_new_signups_last_week_per_item_most_first(client, db):
    owner = _owner(db, email="att-s@example.com")
    ev = _event(db, owner, title="יום פתוח")
    ex = _experience(db, owner, title="סדנת שאור")
    _reg(db, event=ev)
    for _ in range(3):
        _reg(db, experience=ex, days_ago=1)
    _reg(db, experience=ex, status="cancelled")  # cancelled: out
    _reg(db, event=ev, days_ago=8)  # older than a week: out
    assert _attention(client, owner)["new_signups"] == [
        {"kind": "experience", "title": "סדנת שאור", "count": 3},
        {"kind": "event", "title": "יום פתוח", "count": 1},
    ]


def test_another_business_signups_are_not_hers(client, db):
    owner = _owner(db, email="att-o1@example.com")
    other = _owner(db, email="att-o2@example.com")
    _reg(db, event=_event(db, other))
    _reg(db, experience=_experience(db, other))
    assert _attention(client, owner)["new_signups"] == []


def test_funded_group_buys_only(client, db):
    owner = _owner(db, email="att-g@example.com")
    for status in ("funded", "funded", "open", "fulfilled", "cancelled"):
        _group_buy(db, owner.producer_id, status)
    assert _attention(client, owner)["funded_group_buys"] == 2


def test_an_organizer_review_is_not_waiting(client, db):
    # ADR-036: an organizer has no public reviews, so the reviews page would be
    # empty — the card must not send her there.
    owner = _owner(db, email="att-org@example.com")
    owner.producer.kind = "organizer"
    db.commit()
    _review(db, owner.producer_id)
    assert _attention(client, owner)["unreplied_reviews"] == 0


def test_equal_signup_counts_order_by_title(client, db):
    owner = _owner(db, email="att-tie@example.com")
    _reg(db, event=_event(db, owner, title="ב יום פתוח"))
    _reg(db, event=_event(db, owner, title="א שוק איכרים"))
    titles = [i["title"] for i in _attention(client, owner)["new_signups"]]
    assert titles == ["א שוק איכרים", "ב יום פתוח"]


def test_a_failed_count_returns_an_empty_card_not_a_500(client, db, monkeypatch):
    from app.services import owner_attention as oa

    def boom(*_a, **_k):
        raise RuntimeError("db hiccup")

    monkeypatch.setattr(oa, "_funded_group_buys", boom)
    owner = _owner(db, email="att-fail@example.com")
    _review(db, owner.producer_id)
    assert _attention(client, owner) == {"unreplied_reviews": 0, "new_signups": [], "funded_group_buys": 0}
