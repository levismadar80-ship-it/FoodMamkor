"""MEH-2384 — `utc_now()` is the naive-UTC replacement for `datetime.utcnow()`.

Pins the two properties every caller relies on: the value is tz-NAIVE (so it
compares against a naive `Column(DateTime)` value without raising), and it is
the UTC wall-clock, not the server's local one — within a second of the aware
`datetime.now(timezone.utc)` taken alongside it.
"""

from datetime import datetime, timedelta, timezone

from app.utils.clock import utc_now


def test_utc_now_is_naive():
    assert utc_now().tzinfo is None


def test_utc_now_is_utc_wall_clock_within_a_second():
    before = datetime.now(timezone.utc).replace(tzinfo=None)
    value = utc_now()
    after = datetime.now(timezone.utc).replace(tzinfo=None)
    assert before <= value <= after
    assert after - before < timedelta(seconds=1)


def test_utc_now_compares_with_a_naive_value_without_raising():
    # The exact shape group_buys.py / schemas.py depend on: naive vs naive.
    deadline = utc_now() + timedelta(days=1)
    assert deadline > utc_now()
