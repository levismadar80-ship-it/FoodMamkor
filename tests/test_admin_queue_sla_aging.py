"""MEH-2110 — admin review queue: oldest-first ordering + business-day aging.

Two independent things are proven here, because they fail independently:

1. `app.utils.clock.business_days_waiting` — the Israeli work week (Sun–Thu)
   arithmetic. Pure, clock-injected, no DB. Every case below has an answer
   worked out by hand from a real calendar week, so a wrong week-index
   mapping fails loudly instead of shifting every badge by a day.
2. The queue itself — that the default view and `?status=pending` come back
   oldest-first, and that the other filters did NOT change.

DISCRIMINATION (MEH-1619): against the pre-change router every ordering test
here fails, because the old code was a single unconditional
`order_by(Producer.created_at.desc())` — the exact reverse. The
`test_other_filters_keep_newest_first` case is the control that stops this
suite from passing a build that simply flipped every sort to ASC.

NO holiday calendar — deliberately out of MEH-2110's scope. A חג inside the
window counts as a working day, so the badge over-reports rather than
under-reports; that is the safe direction for an SLA.
"""
from datetime import datetime, timedelta, timezone

from app.utils.clock import (
    ISRAEL_TZ,
    business_days_between,
    business_days_waiting,
)
from conftest import auth_header, israel_days_ago, make_producer, make_user

# A real, verified calendar week. 2026-08-16 is a Sunday; the assertions in
# test_week_anchor_is_real pin that rather than trusting the comment.
SUN = datetime(2026, 8, 16, 9, 0, tzinfo=timezone.utc)
THU = datetime(2026, 8, 20, 9, 0, tzinfo=timezone.utc)
FRI = datetime(2026, 8, 21, 9, 0, tzinfo=timezone.utc)
SAT = datetime(2026, 8, 22, 9, 0, tzinfo=timezone.utc)
NEXT_SUN = datetime(2026, 8, 23, 9, 0, tzinfo=timezone.utc)


def test_week_anchor_is_real():
    """The control for every other case in this file.

    If these dates are not the weekdays the rest of the module assumes, the
    hand-computed expectations below are meaningless — so assert the anchor
    before relying on it.
    """
    assert SUN.strftime("%a") == "Sun"
    assert THU.strftime("%a") == "Thu"
    assert FRI.strftime("%a") == "Fri"
    assert SAT.strftime("%a") == "Sat"


def test_same_day_is_zero():
    assert business_days_waiting(SUN, now=SUN) == 0


def test_weekend_contributes_nothing():
    # Submitted Thursday: Friday and Saturday must not advance the counter.
    assert business_days_waiting(THU, now=FRI) == 0
    assert business_days_waiting(THU, now=SAT) == 0


def test_thursday_to_sunday_counts_one():
    """The ticket's headline edge case, and the one a naive
    `(end - start).days` gets wrong — it would say 3."""
    assert business_days_waiting(THU, now=NEXT_SUN) == 1
    assert (NEXT_SUN - THU).days == 3  # what the naive version would report


def test_full_work_week():
    assert business_days_waiting(SUN, now=THU) == 4
    assert business_days_waiting(SUN, now=NEXT_SUN) == 5


def test_null_submission_is_zero_not_a_crash():
    """The fallback should have prevented a None, but a 500 on the whole admin
    queue is a far worse failure than a zero on one badge."""
    assert business_days_waiting(None) == 0


def test_naive_datetime_is_accepted_as_utc():
    """SQLite hands tz-naive values back even for DateTime(timezone=True).
    A raise here would take out the queue on the test stack only, which is
    exactly the kind of bug that reaches production unnoticed."""
    assert business_days_waiting(datetime(2026, 8, 20, 9, 0), now=NEXT_SUN) == 1


def test_future_timestamp_clamps_to_zero():
    assert business_days_waiting(NEXT_SUN, now=SUN) == 0


def test_israel_timezone_not_utc():
    """23:30 UTC Thursday is already Friday in Israel (UTC+3 in August).

    Measuring in UTC would call it Thursday and count one extra business day
    for the whole weekend. This is the assertion that fails if the conversion
    is ever dropped.
    """
    thursday_late_utc = datetime(2026, 8, 20, 23, 30, tzinfo=timezone.utc)
    # Israel-local that instant is Friday, so nothing has elapsed by Saturday.
    assert business_days_waiting(thursday_late_utc, now=SAT) == 0


def test_between_is_half_open():
    assert business_days_between(SUN.date(), SUN.date()) == 0
    assert business_days_between(SUN.date(), NEXT_SUN.date()) == 5


# --- the queue itself -------------------------------------------------------


def _submit(db, producer, when):
    producer.submitted_for_review_at = when
    db.commit()
    return producer


def test_default_queue_is_oldest_first(client, db):
    """RED against the pre-change router, which sorted created_at DESC."""
    admin = make_user(db, role="admin")
    old = _submit(db, make_producer(db, name="ותיקה", status="pending"), SUN)
    new = _submit(db, make_producer(db, name="חדשה", status="pending"), NEXT_SUN)

    rows = client.get("/admin/producers", headers=auth_header(admin)).json()
    names = [r["name"] for r in rows]
    assert names.index("ותיקה") < names.index("חדשה"), (
        f"the longest-waiting business must be first; got {names}"
    )
    assert old.id and new.id  # rows really were distinct


def test_pending_filter_is_oldest_first(client, db):
    admin = make_user(db, role="admin")
    _submit(db, make_producer(db, name="ותיקה", status="pending"), SUN)
    _submit(db, make_producer(db, name="חדשה", status="pending"), NEXT_SUN)

    rows = client.get(
        "/admin/producers", params={"status": "pending"}, headers=auth_header(admin)
    ).json()
    names = [r["name"] for r in rows]
    assert names.index("ותיקה") < names.index("חדשה")


def test_other_filters_keep_newest_first(client, db):
    """The control that stops a blanket ASC flip from passing this suite."""
    admin = make_user(db, role="admin")
    first = make_producer(db, name="ראשונה", status="approved")
    first.created_at = SUN
    second = make_producer(db, name="שנייה", status="approved")
    second.created_at = NEXT_SUN
    db.commit()

    rows = client.get(
        "/admin/producers", params={"status": "approved"}, headers=auth_header(admin)
    ).json()
    names = [r["name"] for r in rows]
    assert names.index("שנייה") < names.index("ראשונה"), (
        f"explicit filters keep newest-first; got {names}"
    )


def test_null_stamp_sorts_by_created_at_not_last(client, db):
    """A pre-MEH-2100 row has no stamp. A bare column sort would bunch every
    such row at one end; COALESCE keeps it in real-age order."""
    admin = make_user(db, role="admin")
    unstamped = make_producer(db, name="ללא חותמת", status="pending")
    unstamped.created_at = SUN
    unstamped.submitted_for_review_at = None
    _submit(db, make_producer(db, name="עם חותמת", status="pending"), NEXT_SUN)
    db.commit()

    rows = client.get("/admin/producers", headers=auth_header(admin)).json()
    names = [r["name"] for r in rows]
    assert names.index("ללא חותמת") < names.index("עם חותמת")


def test_response_carries_aging_fields(client, db):
    admin = make_user(db, role="admin")
    _submit(
        db,
        make_producer(db, name="ממתינה", status="pending"),
        datetime.now(timezone.utc) - timedelta(days=14),
    )
    row = next(
        r
        for r in client.get("/admin/producers", headers=auth_header(admin)).json()
        if r["name"] == "ממתינה"
    )
    assert "business_days_waiting" in row
    assert "submitted_for_review_at" in row
    # 14 calendar days spans two weekends, so it can never be 14.
    assert 0 < row["business_days_waiting"] < 14


def test_draft_ages_from_created_at(client, db):
    """A draft has no submission to measure from, so it measures from
    creation — and it must not read as `0` forever."""
    admin = make_user(db, role="admin")
    draft = make_producer(db, name="טיוטה", status="draft")
    draft.created_at = datetime.now(timezone.utc) - timedelta(days=14)
    draft.submitted_for_review_at = None
    db.commit()

    rows = client.get(
        "/admin/producers", params={"status": "draft"}, headers=auth_header(admin)
    ).json()
    row = next(r for r in rows if r["name"] == "טיוטה")
    assert row["business_days_waiting"] > 0
    assert row["submitted_for_review_at"] is None


def test_pending_route_also_carries_aging(client, db):
    """`/admin/producers/pending` returns the same schema, so it must fill the
    field rather than serialise a structural 0.

    RED against the first version of this change, which attached aging in
    `list_producers` only — the field was declared on ProducerAdminOut and
    silently zero on this route, which misreports rather than omits.
    """
    admin = make_user(db, role="admin")
    _submit(
        db,
        make_producer(db, name="ממתינה מזמן", status="pending"),
        datetime.now(timezone.utc) - timedelta(days=21),
    )
    rows = client.get("/admin/producers/pending", headers=auth_header(admin)).json()
    row = next(r for r in rows if r["name"] == "ממתינה מזמן")
    assert row["business_days_waiting"] > 0, (
        "the pending queue serialised a structural 0 — the field is declared "
        "on the schema, so it has to be computed here too"
    )


# --- MEH-2380 — seeding "N days ago" across a DST switch -----------------------
#
# Two real instants, one on each side of the year. Both are 7 × 24 h windows
# whose ends sit on DIFFERENT Israel weekdays because the UTC offset changed in
# between; a test that seeds with `now(utc) - timedelta(days=7)` and expects 5
# is wrong for one hour a day in that week. These pin the trap AND the helper
# that avoids it, against the real `business_days_waiting`.

# Mon 26/10/2026 23:16 IST (+2) — Israel left DST on 25/10. 7 × 24 h earlier is
# Tue 20/10 00:16 IDT (+3). The failing CI run was at exactly this instant.
AUTUMN_NOW = datetime(2026, 10, 26, 21, 16, tzinfo=timezone.utc)
# Tue 30/03/2027 00:30 IDT (+3) — Israel enters DST on 26/03/2027. 7 × 24 h
# earlier is Mon 22/03 23:30 IST (+2).
SPRING_NOW = datetime(2027, 3, 29, 21, 30, tzinfo=timezone.utc)


def test_dst_anchors_are_real():
    """Control for the two cases below: the offsets really differ across each window."""
    for now in (AUTUMN_NOW, SPRING_NOW):
        then = now - timedelta(days=7)
        assert (
            now.astimezone(ISRAEL_TZ).utcoffset()
            != then.astimezone(ISRAEL_TZ).utcoffset()
        )


def test_naive_utc_seed_is_off_by_one_across_a_dst_switch():
    """The trap, stated as a fact about the calendar — not a bug in the helper.

    A characterisation, not a guard: it reads 4 / 6 because `business_days_waiting`
    counts Israel calendar days on purpose (its docstring). It changes only if
    that clock semantics changes — then update it, don't "fix" the helper.
    """
    assert business_days_waiting(AUTUMN_NOW - timedelta(days=7), now=AUTUMN_NOW) == 4
    assert business_days_waiting(SPRING_NOW - timedelta(days=7), now=SPRING_NOW) == 6


def test_israel_days_ago_seed_counts_five_on_both_sides_of_a_dst_switch():
    """Seeding from the Israel clock keeps both ends on one weekday: 5 either way.

    RED if `israel_days_ago` is reduced to `now - timedelta(days=N)` in UTC —
    the autumn case answers 4 and the spring case 6 (the test above).
    """
    assert (
        business_days_waiting(israel_days_ago(7, now=AUTUMN_NOW), now=AUTUMN_NOW) == 5
    )
    assert (
        business_days_waiting(israel_days_ago(7, now=SPRING_NOW), now=SPRING_NOW) == 5
    )
    # And it hands back UTC, the form the timestamp columns store.
    assert israel_days_ago(7, now=AUTUMN_NOW).tzinfo == timezone.utc
