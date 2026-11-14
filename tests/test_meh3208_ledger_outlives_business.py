"""MEH-3208 — the billing ledger outlives the business it counted for.

Deleting a business used to delete its `billable_events` rows (ON DELETE
CASCADE). They are the record of what a business was, or would be, billed and
have to be kept (seven years from the end of the tax year), so both delete
paths must leave them in place.
"""

from datetime import datetime, timezone
from uuid import uuid4

from app.models.billing import BillableEvent
from app.models.models import Producer
from app.services import billing_summary
from app.services.billing_summary import Month
from conftest import auth_header, make_producer, make_user

NOV = Month(2026, 11)
MID_NOV = datetime(2026, 11, 14, 10, 0, tzinfo=timezone.utc)


def _counted(db, producer, base=120000, fee=6000):
    # Only `producer_id` is set, as a forgetful writer would: the kept copy
    # must fill itself.
    row = BillableEvent(
        producer_id=producer.id,
        kind="event_registration",
        source_id=uuid4(),
        occurred_at=MID_NOV,
        quantity=1,
        base_amount_agorot=base,
        fee_agorot=fee,
        price_list_version=1,
        status="counted",
    )
    db.add(row)
    db.commit()
    return row.id


def _kept(db, row_id):
    db.expire_all()
    return db.query(BillableEvent).filter(BillableEvent.id == row_id).first()


def test_the_kept_copy_fills_itself_from_the_business_id(db):
    producer = make_producer(db, name="משק")
    row = _kept(db, _counted(db, producer))
    assert row.producer_ref == producer.id


def test_an_owner_deleting_her_account_keeps_the_ledger_rows(client, db):
    producer = make_producer(db, name="נסגר", status="approved")
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()
    producer_id = producer.id
    row_id = _counted(db, producer)

    r = client.delete("/auth/me", headers=auth_header(owner))
    assert r.status_code == 200, r.text
    assert db.query(Producer).filter(Producer.id == producer_id).first() is None

    row = _kept(db, row_id)
    assert row is not None, "the ledger row was deleted with the business"
    assert row.producer_id is None
    assert row.producer_ref == producer_id
    assert (row.base_amount_agorot, row.fee_agorot, row.status) == (
        120000,
        6000,
        "counted",
    )


def test_an_admin_deleting_a_business_keeps_the_ledger_rows(client, db):
    admin = make_user(db, role="admin", email="admin-3208@example.com")
    producer = make_producer(db, name="נמחק", status="approved")
    producer_id = producer.id
    row_id = _counted(db, producer)

    r = client.delete(f"/admin/producers/{producer_id}", headers=auth_header(admin))
    assert r.status_code in (200, 204), r.text
    assert db.query(Producer).filter(Producer.id == producer_id).first() is None

    row = _kept(db, row_id)
    assert row is not None, "the ledger row was deleted with the business"
    assert (row.producer_id, row.producer_ref) == (None, producer_id)


def test_a_deleted_business_is_not_a_row_on_the_admin_screen(client, db):
    """Kept for the books, not shown as a business that could be charged."""
    gone = make_producer(db, name="איננו")
    stays = make_producer(db, name="נשאר")
    _counted(db, gone)
    _counted(db, stays)
    db.delete(gone)
    db.commit()

    overview = billing_summary.overview(db, NOV)
    assert [r["name"] for r in overview["rows"]] == ["נשאר"]
    assert overview["businesses_over_threshold"] == 1
