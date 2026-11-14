"""
Module:   test_meh3225_no_show_tombstones
Purpose:  MEH-3225 (D5 part 2). Deleting an account with two no-shows does
          not lift the block: a new account with the same email is still
          blocked, until the window passes or an admin releases it. Only an
          HMAC of the email and the pickup time are kept, and the retention
          purge drops them after 30 days.
Touches:  Postgres test DB via TestClient.
Related:  backend/app/services/rescue_no_show.py · services/user_deletion.py
          · services/retention_purge.py
History:  MEH-3225 (creation)
"""

from datetime import timedelta

from app.models import RescueNoShowTombstone, User
from app.models.models import RescueOrder
from app.services.rescue_no_show import active_no_show_counts, email_hash
from app.services.retention_purge import run_purge
from app.utils.clock import utc_now
from tests.conftest import auth_header, make_user
from tests.test_rescue import _seed_offer, rescue_on, shop  # noqa: F401

EMAIL = "gone@example.com"


def _no_show(db, shop, buyer, code, *, hours_ago=1):
    now = utc_now()
    offer = _seed_offer(
        db,
        shop["location"],
        qty_total=1,
        qty_left=0,
        pickup_start=now - timedelta(hours=hours_ago + 2),
        pickup_end=now - timedelta(hours=hours_ago),
        cancel_until=now - timedelta(hours=hours_ago + 3),
    )
    db.add(
        RescueOrder(
            offer_id=offer.id, user_id=buyer.id, qty=1, pickup_code=code, status="no_show"
        )
    )
    db.commit()


def _reserve(client, db, shop, user):
    offer = _seed_offer(db, shop["location"], qty_total=4)
    db.commit()
    return client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": 1},
        headers=auth_header(user),
    )


def _delete_with_two_no_shows(client, db, shop, **kw):
    old = make_user(db, email=EMAIL)
    _no_show(db, shop, old, "0001", **kw)
    _no_show(db, shop, old, "0002", **kw)
    r = client.delete("/auth/me", headers=auth_header(old))
    assert r.status_code == 200, r.text
    db.expire_all()


def test_a_new_account_with_the_same_email_is_still_blocked(client, db, shop, rescue_on):
    _delete_with_two_no_shows(client, db, shop)
    again = make_user(db, email=EMAIL)
    r = _reserve(client, db, shop, again)
    assert r.status_code == 422, r.text


def test_case_and_spaces_do_not_lift_it(client, db, shop, rescue_on):
    _delete_with_two_no_shows(client, db, shop)
    again = make_user(db, email="Gone@Example.com")
    assert active_no_show_counts(db, [again.id]) == {again.id: 2}


def test_another_email_is_not_blocked(client, db, shop, rescue_on):
    _delete_with_two_no_shows(client, db, shop)
    other = make_user(db, email="other@example.com")
    assert _reserve(client, db, shop, other).status_code == 201


def test_only_the_hash_and_the_time_are_kept(client, db, shop, rescue_on):
    _delete_with_two_no_shows(client, db, shop)
    rows = db.query(RescueNoShowTombstone).all()
    assert len(rows) == 2
    assert {r.email_hash for r in rows} == {email_hash(EMAIL)}
    assert EMAIL not in rows[0].email_hash
    assert set(RescueNoShowTombstone.__table__.columns.keys()) == {
        "id",
        "email_hash",
        "pickup_end",
        "created_at",
    }


def test_no_shows_outside_the_window_leave_nothing(client, db, shop, rescue_on):
    _delete_with_two_no_shows(client, db, shop, hours_ago=31 * 24)
    assert db.query(RescueNoShowTombstone).count() == 0


def test_an_admin_release_lifts_it_for_the_new_account(client, db, shop, rescue_on):
    _delete_with_two_no_shows(client, db, shop)
    again = make_user(db, email=EMAIL)
    admin = make_user(db, email="admin@example.com", role="admin")
    r = client.post(
        f"/admin/rescue/users/{again.id}/clear-block", headers=auth_header(admin)
    )
    assert r.status_code == 200, r.text
    db.expire_all()
    assert _reserve(client, db, shop, db.get(User, again.id)).status_code == 201


def test_the_purge_drops_them_after_the_window(client, db, shop, rescue_on):
    _delete_with_two_no_shows(client, db, shop)
    kept = run_purge(db, now=utc_now() + timedelta(days=29))
    assert kept.tombstones_deleted == 0
    gone = run_purge(db, now=utc_now() + timedelta(days=31))
    assert gone.tombstones_deleted == 2
    again = make_user(db, email=EMAIL)
    assert active_no_show_counts(db, [again.id]) == {}
