"""MEH-2513: a business that is not approved does not reach consumers through
the favorites, review-POST and follower-alert side doors.

Same shape as MEH-2465 (organizer), widened from ``kind == "producer"`` to the
one rule ``is_business()`` (status approved AND kind producer,
producer_listing.py). Each test carries an approved-business control on the
same path, so a 404 / empty answer is the gate and not a broken route.
"""

import pytest

from app.models import Favorite, FavoriteAlert, ProducerReview
from app.routers.alerts import fire_alerts
from app.schemas.schemas import AlertContent
from conftest import auth_header, make_producer, make_user

# Every non-public status a business row can hold today.
_HIDDEN_STATUSES = ["inactive", "rejected", "pending", "draft"]
_SUB = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "x", "auth": "y"}}


@pytest.mark.parametrize("status", _HIDDEN_STATUSES)
def test_favorite_add_refused_for_unapproved(client, db, status):
    business = make_producer(db, name="עסק מאושר")
    hidden = make_producer(db, name="עסק מוסתר", status=status)
    user = make_user(db)
    ok = client.post(f"/users/me/favorites/{business.id}", headers=auth_header(user))
    assert ok.status_code == 201  # control
    resp = client.post(f"/users/me/favorites/{hidden.id}", headers=auth_header(user))
    assert resp.status_code == 404
    assert db.query(Favorite).filter(Favorite.producer_id == hidden.id).count() == 0


def test_favorites_list_hides_business_suspended_after_save(client, db):
    business = make_producer(db, name="עסק מאושר")
    later_suspended = make_producer(db, name="עסק שהושעה")
    user = make_user(db)
    for p in (business, later_suspended):
        db.add(Favorite(user_id=user.id, producer_id=p.id))
    db.commit()
    names = lambda: {  # noqa: E731
        f["producer"]["name"]
        for f in client.get("/users/me/favorites", headers=auth_header(user)).json()
    }
    assert names() == {"עסק מאושר", "עסק שהושעה"}  # control: both while approved

    later_suspended.status = "inactive"
    db.commit()
    assert names() == {"עסק מאושר"}
    # the saved row is kept, so a reinstated business comes back on its own
    assert (
        db.query(Favorite).filter(Favorite.producer_id == later_suspended.id).count()
        == 1
    )

    later_suspended.status = "approved"
    db.commit()
    assert names() == {"עסק מאושר", "עסק שהושעה"}


@pytest.mark.parametrize("status", _HIDDEN_STATUSES)
def test_review_post_refused_for_unapproved(client, db, status):
    business = make_producer(db, name="עסק מאושר")
    hidden = make_producer(db, name="עסק מוסתר", status=status)
    user = make_user(db)
    payload = {"stars": 5, "body": "הכול היה טרי ונעים, ממליצה"}
    # control: the approved business gets past the lookup to a later gate
    # (the first-review contact-click check), so it is not a 404.
    ctrl = client.post(
        f"/producers/{business.id}/reviews", json=payload, headers=auth_header(user)
    )
    assert ctrl.status_code != 404
    resp = client.post(
        f"/producers/{hidden.id}/reviews", json=payload, headers=auth_header(user)
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "בית עסק לא נמצא"
    assert (
        db.query(ProducerReview).filter(ProducerReview.producer_id == hidden.id).count()
        == 0
    )


@pytest.mark.parametrize("status", _HIDDEN_STATUSES)
def test_fire_alerts_silent_for_unapproved(db, monkeypatch, status):
    calls = []
    monkeypatch.setattr(
        "app.services.push.send_push_notification",
        lambda sub, **kw: calls.append(kw["url"]),
    )
    monkeypatch.setattr("app.routers.alerts.send_template", lambda to, tmpl: True)
    business = make_producer(db, name="עסק מאושר")
    hidden = make_producer(db, name="עסק מוסתר", status=status)
    user = make_user(db)
    for p in (business, hidden):
        db.add(
            FavoriteAlert(
                user_id=user.id,
                producer_id=p.id,
                notify_new_product=True,
                push_subscription=_SUB,
            )
        )
    db.commit()

    fire_alerts(
        db, business.id, "new_product", AlertContent(title="t", body="b", url="/ok")
    )
    assert calls == ["/ok"]  # control
    fire_alerts(
        db, hidden.id, "new_product", AlertContent(title="t", body="b", url="/no")
    )
    assert calls == ["/ok"]


def test_review_reads_unchanged_for_unapproved(client, db):
    """The public review list is deliberately NOT gated (DATA.md, MEH-2513):
    the owner's page preview of her own suspended business reads it."""
    hidden = make_producer(db, name="עסק מוסתר", status="inactive")
    user = make_user(db)
    db.add(
        ProducerReview(
            producer_id=hidden.id, user_id=user.id, stars=5, body="נכתבה לפני ההשעיה"
        )
    )
    db.commit()
    assert client.get(f"/producers/{hidden.id}/reviews").json()["total"] == 1
