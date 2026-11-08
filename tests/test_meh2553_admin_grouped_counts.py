"""MEH-2553 — admin counters are one query each, not one per bucket.

/admin/dashboard and /admin/analytics counted producers (and users) with one
query per month for six months; /admin/outreach/metrics/summary counted leads
with one query per status. Sentry flagged both as N+1 (MEHAMAKOR-BACKEND-25,
-1N, -1P). The counts must stay the same, so each test checks both the number
of SELECTs that touch the table and the values.
"""

from contextlib import contextmanager
from datetime import timedelta

from sqlalchemy import event

from app.database import engine
from app.models import OutreachLead
from app.utils.clock import utc_now
from conftest import auth_header, make_producer, make_user


@contextmanager
def _selects():
    seen = []

    def _capture(conn, cursor, statement, params, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            seen.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", _capture)


def _in_month(months_back):
    """An instant well inside the month `months_back` before the current one.

    Buckets start at 00:00 on day 1 (they used to start at the request's time
    of day, which put "now" in the month before on day 1 — see the frozen-clock
    test at the bottom). Mid-month keeps the older months clear of any edge.
    """
    if months_back == 0:
        return utc_now()
    ref = utc_now().replace(day=1)
    for _ in range(months_back):
        ref = (ref - timedelta(days=1)).replace(day=1)
    return ref.replace(day=15)


def _monthly_queries(seen, table):
    """Count queries bounded by created_at on `table` — the monthly series."""
    return [
        s
        for s in seen
        if "count(" in s.lower()
        and f"from {table}" in s.lower()
        and f"{table}.created_at <" in s.lower()  # month buckets have an upper bound
    ]


def _seed_producers(db):
    """2 this month, 1 two months ago, 1 organizer this month (excluded)."""
    now_m, two_back = _in_month(0), _in_month(2)
    for name, created, kind in (
        ("חוות אחת", now_m, "producer"),
        ("חוות שתיים", now_m, "producer"),
        ("חוות ישנה", two_back, "producer"),
        ("מארגנת", now_m, "organizer"),
    ):
        p = make_producer(db, name=name)
        p.created_at = created
        p.kind = kind
    db.commit()
    return now_m.strftime("%Y-%m"), two_back.strftime("%Y-%m")


def test_dashboard_monthly_producers_one_query_same_numbers(client, db):
    admin = make_user(db, role="admin")
    this_month, two_back = _seed_producers(db)
    client.get("/admin/dashboard", headers=auth_header(admin))  # warm-up
    with _selects() as seen:
        r = client.get("/admin/dashboard", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    months = {m["month"]: m["producers"] for m in r.json()["monthly_producers"]}
    assert len(months) == 6
    assert months[this_month] == 2
    assert months[two_back] == 1
    assert sum(months.values()) == 3
    assert len(_monthly_queries(seen, "producers")) == 1, _monthly_queries(
        seen, "producers"
    )


def test_analytics_monthly_series_one_query_per_table(client, db):
    admin = make_user(db, role="admin")
    this_month, two_back = _seed_producers(db)
    client.get("/admin/analytics", headers=auth_header(admin))  # warm-up
    with _selects() as seen:
        r = client.get("/admin/analytics", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    monthly = {m["month"]: m for m in r.json()["monthly"]}
    assert len(monthly) == 6
    assert monthly[this_month]["producers"] == 2
    assert monthly[two_back]["producers"] == 1
    assert monthly[this_month]["users"] >= 1  # the admin, created now
    # The monthly series used to be 6 count queries on each table.
    assert len(_monthly_queries(seen, "producers")) == 1, _monthly_queries(
        seen, "producers"
    )
    assert len(_monthly_queries(seen, "users")) == 1, _monthly_queries(seen, "users")


def test_outreach_summary_one_query_same_numbers(client, db):
    admin = make_user(db, role="admin")
    for i, status in enumerate(
        ["new", "new", "contacted", "registered", "declined", "replied", "replied"]
    ):
        db.add(
            OutreachLead(
                name=f"עסק {i}", phone=f"05000000{i:02d}", city="חיפה", status=status
            )
        )
    db.commit()
    client.get("/admin/outreach/metrics/summary", headers=auth_header(admin))  # warm-up
    with _selects() as seen:
        r = client.get("/admin/outreach/metrics/summary", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    assert r.json() == {
        "total": 7,
        "new": 2,
        "contacted": 1,
        "replied": 2,
        "registered": 1,
        "declined": 1,
        # MEH-2633 added this key. The seven leads above are all ORM-created
        # with no source, so they take the model default "manual" — none is a
        # community suggestion. Kept as an EXACT dict comparison on purpose:
        # relaxing it to a subset check is what would let the next added key
        # through unexamined.
        "community": 0,
    }
    leads = [s for s in seen if "outreach_leads" in s.lower()]
    assert len(leads) == 1, leads


def test_month_bucket_starts_at_midnight_not_at_the_current_hour(
    client, db, monkeypatch
):
    """A producer created on day 1 before the current hour is THIS month's.

    `_last_six_months` used `now.replace(day=1)`, which kept the time of day, so
    the bucket began on day 1 at the request's hour: on 15/11 at 12:00 a
    producer created 01/11 08:00 counted in October, and on day 1 itself
    everything created that day before the request fell into the month before
    (the two tests above went red on 01/11/2026). Clock frozen, so this runs
    the same on any date.
    """
    from datetime import datetime, timezone

    from app.routers import admin_extra

    frozen = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(admin_extra, "utc_now", lambda: frozen)
    admin = make_user(db, role="admin")
    p = make_producer(db, name="חוות הבוקר")
    p.created_at = datetime(2026, 11, 1, 8, 0, tzinfo=timezone.utc)
    p.kind = "producer"
    db.commit()

    r = client.get("/admin/dashboard", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    months = {m["month"]: m["producers"] for m in r.json()["monthly_producers"]}
    assert months["2026-11"] == 1
    assert months["2026-10"] == 0

    r = client.get("/admin/analytics", headers=auth_header(admin))
    assert r.status_code == 200, r.text
    monthly = {m["month"]: m for m in r.json()["monthly"]}
    assert monthly["2026-11"]["producers"] == 1
    assert monthly["2026-10"]["producers"] == 0


def test_six_month_window_is_six_consecutive_months_across_february():
    """Fixed 30-day steps from 15/03/2027 gave 2026-12 twice and no 2027-02."""
    from datetime import datetime, timezone

    from app.routers.admin_extra import _last_six_months

    for now in (
        datetime(2027, 3, 15, tzinfo=timezone.utc),
        datetime(2027, 4, 15, tzinfo=timezone.utc),
        datetime(2028, 3, 1, tzinfo=timezone.utc),
        datetime(2026, 1, 31, 23, 59, tzinfo=timezone.utc),
    ):
        buckets = _last_six_months(now)
        months = [start.strftime("%Y-%m") for start, _ in buckets]
        assert len(set(months)) == 6, (now, months)
        for (_, end), (start, _) in zip(buckets, buckets[1:]):
            assert end == start, (now, months)
        assert buckets[-1][0] <= now < buckets[-1][1]
