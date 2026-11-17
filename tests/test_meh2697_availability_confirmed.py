"""MEH-2697 phase 1, server half — when did the business last say its
availability is still true?

`producers.availability_confirmed_at` is written in exactly two places, both
by the owner: setting the availability state, and the «עדיין נכון» confirm
route. It is public (the tag «אושר ע״י בית העסק · לפני N ימים» reads it), and
NULL means "never confirmed" — nothing is shown, never "confirmed long ago".
"""

from datetime import datetime, timedelta, timezone

from app.models import Producer
from app.utils.clock import israel_today

from tests.conftest import auth_header, make_producer, make_user

CONFIRM = "/producers/me/availability-confirm"


def _owner(db, status="approved"):
    producer = make_producer(db, status=status)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user, producer


def _stored(db, producer_id):
    db.expire_all()
    return (
        db.query(Producer)
        .filter(Producer.id == producer_id)
        .one()
        .availability_confirmed_at
    )


def _recent(value) -> bool:
    return abs(datetime.now(timezone.utc) - value) < timedelta(minutes=1)


def test_a_business_starts_unconfirmed(client, db):
    _, producer = _owner(db)
    assert _stored(db, producer.id) is None
    body = client.get(f"/producers/{producer.id}").json()
    assert "availability_confirmed_at" in body
    assert body["availability_confirmed_at"] is None


def test_confirm_stamps_now_and_the_public_page_carries_it(client, db):
    owner, producer = _owner(db)
    resp = client.post(CONFIRM, headers=auth_header(owner))
    assert resp.status_code == 200
    stored = _stored(db, producer.id)
    assert stored is not None and stored.tzinfo is not None and _recent(stored)
    assert resp.json()["availability_confirmed_at"] is not None
    public = client.get(f"/producers/{producer.id}").json()
    assert public["availability_confirmed_at"] is not None


def test_confirm_does_not_touch_the_state_itself(client, db):
    """Seeded away from the defaults (on vacation, with a return date), so a
    confirm that reset the state to its default would fail here."""
    owner, producer = _owner(db)
    until = israel_today() + timedelta(days=9)
    producer.availability_state = "on_vacation"
    producer.vacation_until = until
    db.commit()
    assert client.post(CONFIRM, headers=auth_header(owner)).status_code == 200
    db.expire_all()
    row = db.query(Producer).filter(Producer.id == producer.id).one()
    assert (row.availability_state, row.vacation_until) == ("on_vacation", until)
    assert row.availability_confirmed_at is not None


def test_confirming_again_moves_the_stamp_forward(client, db):
    owner, producer = _owner(db)
    producer.availability_confirmed_at = datetime.now(timezone.utc) - timedelta(days=40)
    db.commit()
    client.post(CONFIRM, headers=auth_header(owner))
    assert _recent(_stored(db, producer.id))


def test_setting_the_state_is_a_confirmation_too(client, db):
    owner, producer = _owner(db)
    resp = client.post(
        "/producers/me/availability-state",
        json={"state": "accepting_orders"},
        headers=auth_header(owner),
    )
    assert resp.status_code == 200, resp.text
    stored = _stored(db, producer.id)
    assert stored is not None and _recent(stored)


def test_only_the_owner_can_confirm(client, db):
    _, producer = _owner(db)
    consumer = make_user(db, role="consumer")
    admin = make_user(db, role="admin")
    assert client.post(CONFIRM).status_code == 401
    assert client.post(CONFIRM, headers=auth_header(consumer)).status_code == 403
    # An admin has no business of her own to confirm: this is the owner's word.
    assert client.post(CONFIRM, headers=auth_header(admin)).status_code in (403, 404)
    assert _stored(db, producer.id) is None


def test_another_owner_confirms_only_her_own_business(client, db):
    owner_a, producer_a = _owner(db)
    _, producer_b = _owner(db)
    client.post(CONFIRM, headers=auth_header(owner_a))
    assert _stored(db, producer_a.id) is not None
    assert _stored(db, producer_b.id) is None


def test_an_admin_edit_is_not_the_owners_confirmation(client, db):
    """The tag says «אושר ע״י בית העסק». An admin changing the state through
    the admin form must not stamp it."""
    _, producer = _owner(db)
    admin = make_user(db, role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"availability_state": "accepting_orders"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert _stored(db, producer.id) is None
