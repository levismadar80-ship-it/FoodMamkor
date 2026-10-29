"""MEH-2541 — `GET /admin/producers` must not issue a query per row.

`ProducerListOut.active_offer` reads the `offers` collection. The admin list
did not preload it, so every producer in the response cost one extra SELECT
on producer_offers (Sentry MEHAMAKOR-BACKEND-22/-23/-24 on staging). The
public list paths already `selectinload(Producer.offers)`.

The check is shape-free: the SELECT count for one producer must equal the
count for four. Any per-row lazy load, offers or a future one, breaks it.
"""

from contextlib import contextmanager

from sqlalchemy import event

from app.database import engine
from app.models import ProducerOffer
from app.utils.clock import israel_today
from conftest import auth_header, make_producer, make_user

LIST = "/admin/producers"


@contextmanager
def _count_selects():
    seen = []

    def _capture(conn, cursor, statement, params, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            seen.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", _capture)


def _producer_with_offer(db, name):
    p = make_producer(db, name=name)
    db.add(
        ProducerOffer(
            producer_id=p.id,
            offer_type="first_order",
            expires_at=israel_today(),
            is_active=True,
        )
    )
    db.commit()
    return p


def _list_selects(client, admin):
    # Warm-up request: the first authenticated request after a commit re-reads
    # the admin's users row once more. That extra SELECT is per-request, not
    # per-producer, and would otherwise skew whichever side follows a commit.
    client.get(LIST, params={"status": "approved"}, headers=auth_header(admin))
    with _count_selects() as seen:
        r = client.get(LIST, params={"status": "approved"}, headers=auth_header(admin))
    assert r.status_code == 200, r.text
    return r.json(), seen


def test_select_count_does_not_grow_with_producers(client, db):
    admin = make_user(db, role="admin")
    _producer_with_offer(db, "חוות אחת")
    rows_one, one = _list_selects(client, admin)
    assert len(rows_one) == 1

    for name in ("חוות שתיים", "חוות שלוש", "חוות ארבע"):
        _producer_with_offer(db, name)
    rows_four, four = _list_selects(client, admin)
    assert len(rows_four) == 4

    assert len(four) == len(one), (
        f"{len(one)} SELECTs for 1 producer, {len(four)} for 4 — a per-row query"
    )


def test_active_offer_still_serialized_on_admin_rows(client, db):
    admin = make_user(db, role="admin")
    _producer_with_offer(db, "חוות ההצעה")
    rows, _ = _list_selects(client, admin)
    assert rows[0]["active_offer"]["offer_type"] == "first_order"
