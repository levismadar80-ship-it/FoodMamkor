"""MEH-3295 — property-based tests (Hypothesis) for money and business-day math.

An example test checks the inputs someone thought of. A property test states a
rule that must hold for EVERY input and lets Hypothesis hunt for the one that
breaks it (it shrinks a failure to the smallest counter-example). Industry use:
Hypothesis/QuickCheck on pricing, rounding and date code, where the bug lives
at an edge nobody wrote an example for (a 1-agora booking, a span across a
weekend, a DST night).

Each rule below is checked against an independent oracle (plain arithmetic or a
day-by-day count), never against the function's own formula.
"""

from datetime import date, datetime, timedelta, timezone

from hypothesis import given, settings
from hypothesis import strategies as st

from app import pricing
from app.utils.clock import ISRAEL_TZ, business_days_between, business_days_waiting

PRICE_LISTS = list(pricing.PRICE_LISTS.values())
# Up to 1,000,000 ₪ in agorot — far beyond any real booking.
AGOROT = st.integers(min_value=-10_000, max_value=100_000_000)
QTY = st.integers(min_value=-50, max_value=10_000)
DAYS = st.dates(min_value=date(2020, 1, 1), max_value=date(2035, 12, 31))

FAST = settings(max_examples=300, deadline=None)


@FAST
@given(base=AGOROT, pl=st.sampled_from(PRICE_LISTS))
def test_booking_fee_is_the_percent_rounded_half_up(base, pl):
    for fee, pct in (
        (pricing.booking_fee_agorot(base, pl), pl.paid_booking_percent),
        (
            pricing.subscriber_booking_fee_agorot(base, pl),
            pl.subscriber_booking_percent,
        ),
    ):
        if base <= 0:
            assert fee == 0
            continue
        exact = base * pct  # the fee times 100, no rounding
        # Rounded half up to a whole agora: within half an agora of exact, and
        # an exact half goes up.
        assert abs(fee * 100 - exact) <= 50
        if exact % 100 == 50:
            assert fee * 100 == exact + 50
        assert 0 <= fee <= base


@FAST
@given(a=AGOROT, b=AGOROT, pl=st.sampled_from(PRICE_LISTS))
def test_a_bigger_booking_never_costs_less(a, b, pl):
    lo, hi = sorted((a, b))
    assert pricing.booking_fee_agorot(lo, pl) <= pricing.booking_fee_agorot(hi, pl)
    assert pricing.subscriber_booking_fee_agorot(
        lo, pl
    ) <= pricing.subscriber_booking_fee_agorot(hi, pl)


@FAST
@given(base=AGOROT, qty=QTY, pl=st.sampled_from(PRICE_LISTS))
def test_a_subscriber_never_pays_more_than_a_non_subscriber(base, qty, pl):
    # ADR-042: the subscription LOWERS the commission. A price list that broke
    # this would charge subscribers for subscribing.
    assert pricing.subscriber_booking_fee_agorot(
        base, pl
    ) <= pricing.booking_fee_agorot(base, pl)
    assert pricing.subscriber_bag_fee_agorot(qty, pl) <= pricing.rescue_bag_fee_agorot(
        qty, pl
    )


@FAST
@given(a=QTY, b=QTY, pl=st.sampled_from(PRICE_LISTS))
def test_bag_fees_are_per_bag_and_never_negative(a, b, pl):
    fee = pricing.rescue_bag_fee_agorot
    assert fee(a, pl) == max(a, 0) * pl.rescue_bag_fee_agorot
    assert fee(a, pl) >= 0
    if a >= 0 and b >= 0:
        assert fee(a + b, pl) == fee(a, pl) + fee(b, pl)


def _count_sun_to_thu(start: date, end: date) -> int:
    """Oracle: walk (start, end] a day at a time. Python: Mon=0 … Sun=6."""
    n, d = 0, start + timedelta(days=1)
    while d <= end:
        if d.weekday() in (6, 0, 1, 2, 3):
            n += 1
        d += timedelta(days=1)
    return n


@FAST
@given(start=DAYS, span=st.integers(min_value=-30, max_value=400))
def test_business_days_match_a_day_by_day_count(start, span):
    end = start + timedelta(days=span)
    assert business_days_between(start, end) == _count_sun_to_thu(start, end)


@FAST
@given(a=DAYS, b=DAYS, c=DAYS)
def test_business_days_add_up_across_a_split(a, b, c):
    a, b, c = sorted((a, b, c))
    assert business_days_between(a, c) == business_days_between(
        a, b
    ) + business_days_between(b, c)


@FAST
@given(start=DAYS, weeks=st.integers(min_value=0, max_value=200))
def test_every_whole_week_is_five_business_days(start, weeks):
    assert business_days_between(start, start + timedelta(weeks=weeks)) == 5 * weeks


UTC_TIMES = st.datetimes(
    min_value=datetime(2021, 1, 1),
    max_value=datetime(2034, 12, 31),
    timezones=st.just(timezone.utc),
)


@FAST
@given(since=UTC_TIMES, now=UTC_TIMES)
def test_waiting_counts_israel_dates_not_utc_dates(since, now):
    got = business_days_waiting(since, now=now)
    assert got >= 0
    assert got == _count_sun_to_thu(
        since.astimezone(ISRAEL_TZ).date(), now.astimezone(ISRAEL_TZ).date()
    )


@FAST
@given(since=UTC_TIMES, now=UTC_TIMES)
def test_a_naive_timestamp_is_read_as_utc(since, now):
    assert business_days_waiting(
        since.replace(tzinfo=None), now=now
    ) == business_days_waiting(since, now=now)


def test_the_current_billing_month_is_the_israel_month(monkeypatch):
    # Mutation run 18/11: Month.current had no test at all (5 "no tests"
    # mutants). The clock is frozen at the consumer module, per testing.md.
    from app.services import billing_summary

    monkeypatch.setattr(billing_summary, "israel_today", lambda: date(2026, 12, 1))
    m = billing_summary.Month.current()
    assert (m.year, m.month) == (2026, 12)
