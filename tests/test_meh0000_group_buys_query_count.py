"""MEH-0000 — `GET /group-buys` must not issue a query per row.

`_enrich` (routers/group_buys.py:49) reads `len(gb.commits)` and
`gb.producer.{name,images}` for every row, and both relationships are
`lazy="select"`. The public list had no `.options(...)`, so each group buy cost
an extra SELECT on `group_buy_commits`. The `.join(Producer)` in
`_public_group_buys` does not populate `gb.producer` — it filters; only
`contains_eager` or `selectinload` populates.

The owner route (`:185`) has carried exactly `selectinload(commits)` +
`selectinload(producer)` since it was written. The public list never did.

The check is shape-free, copied from
tests/test_meh2541_admin_producers_query_count.py: the SELECT count for ONE
group buy must equal the count for FOUR. Any per-row lazy load — commits,
producer, or a future one — breaks it.
"""

from contextlib import contextmanager

from sqlalchemy import event

from app.database import engine
from conftest import make_producer

LIST = "/group-buys"


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


def _open_group_buy(db, producer, title):
    """One OPEN group buy with a commit, so both lazy relationships are live.

    A group buy with no commits would still pass a broken implementation:
    SQLAlchemy emits the SELECT for an empty collection too, but a reviewer
    reading the test could not tell the difference. The commit makes the row
    carry real data.
    """
    from datetime import timedelta

    from app.models import GroupBuy, GroupBuyCommit
    from app.utils.clock import israel_today

    gb = GroupBuy(
        producer_id=producer.id,
        title=title,
        description="תיאור",
        status="open",
        deadline=israel_today() + timedelta(days=7),
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    db.add(GroupBuyCommit(group_buy_id=gb.id, quantity=1))
    db.commit()
    return gb


def test_the_probe_sees_queries_at_all(client, db):
    """The control, and it runs first.

    The assertion below compares two counts. If the event listener were never
    attached, or the endpoint 404'd, both counts would be 0 or equal-by-
    accident and the test would pass while measuring nothing — the shape
    `.claude/rules/testing.md` calls a probe whose null output is also its
    reassuring output.
    """
    producer = make_producer(db, name="עסק מדידה")
    _open_group_buy(db, producer, "רכישה אחת")
    with _count_selects() as seen:
        response = client.get(LIST, params={"producer_id": str(producer.id)})
    assert response.status_code == 200, response.text
    assert len(response.json()) == 1, response.json()
    assert len(seen) > 0, "the before_cursor_execute listener captured nothing"


def test_group_buys_list_does_not_query_per_row(client, db):
    producer = make_producer(db, name="עסק קבוצות")

    _open_group_buy(db, producer, "רכישה 1")
    with _count_selects() as one:
        first = client.get(LIST, params={"producer_id": str(producer.id)})
    assert first.status_code == 200, first.text
    assert len(first.json()) == 1

    for n in range(2, 5):
        _open_group_buy(db, producer, f"רכישה {n}")
    with _count_selects() as four:
        second = client.get(LIST, params={"producer_id": str(producer.id)})
    assert second.status_code == 200, second.text
    assert len(second.json()) == 4

    assert len(four) == len(one), (
        f"{len(one)} SELECT(s) for 1 group buy, {len(four)} for 4 — "
        f"{len(four) - len(one)} extra, i.e. one per row. Add "
        "selectinload(GroupBuy.commits) and selectinload(GroupBuy.producer) "
        "to the list query, as the owner route at group_buys.py:185 already does."
    )


def test_the_rows_still_carry_what_enrich_reads(client, db):
    """Eager loading must not change the payload.

    Without this, swapping the options for something that loads nothing would
    satisfy the count assertion above and quietly empty the cards.
    """
    producer = make_producer(db, name="עסק תוכן")
    _open_group_buy(db, producer, "רכישה עם תוכן")
    response = client.get(LIST, params={"producer_id": str(producer.id)})
    assert response.status_code == 200, response.text
    row = response.json()[0]
    assert row["producer_name"] == "עסק תוכן"
    assert row["title"] == "רכישה עם תוכן"
    # _enrich names it commits_count (group_buys.py:75), and the one commit
    # seeded above must be counted — an eager load that returned an empty
    # collection would otherwise read as success.
    assert row["commits_count"] == 1
