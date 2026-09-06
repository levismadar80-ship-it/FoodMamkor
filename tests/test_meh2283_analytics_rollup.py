"""
Module:   test_meh2283_analytics_rollup
Purpose:  MEH-2079 chunk B2 (MEH-2283) — the daily roll-up into
          `producer_analytics_daily` and the `total` seam that reads through
          it. Sapir's two rulings (06/09) each carry the test she named, plus
          the constructions that make them discriminate.
Touches:  The test DB via `db` (raw analytics rows, aggregate rows) and the
          owner dashboard endpoint via `client`. No HTTP beyond that.
Does NOT: test the purge (chunk C — does not exist) or the `days=N` arms'
          seam (ruled raw-only for now; the ≥30-day retention condition is
          recorded on the card, not asserted here).
Related:  backend/app/services/analytics_rollup.py;
          backend/app/routers/producer_me.py::_count_in_window;
          backend/app/startup.py::_run_analytics_rollup_job;
          backend/scripts/rollup_analytics.py;
          tests/test_meh160_view_dedupe.py (the dedupe these numbers inherit).
History:  MEH-2283 (creation, 06/09).

WHAT DISCRIMINATES WHAT
-----------------------
(a) Sapir's "run twice → row count unchanged" and "delete a raw day → re-run
    → aggregate unchanged" are both asserted. The second does NOT separate
    skip-on-conflict from upsert-overwrite: with the raw rows gone, an upsert
    has nothing to write either. `test_a_rolled_day_is_immutable_even_when_raw_
    rows_are_added` is the construction that does — under an upsert the row
    would rise to the new count.
(b) The equality (raw-only == Σ aggregate + raw-above-watermark) is asserted
    before roll-up, after it, and after the rolled raw rows are gone. The
    cross-UTC-midnight visitor in the seed is what makes the Israel-day grain
    load-bearing: `test_utc_partition_would_break_the_equality` pins the
    number a UTC partition would have produced instead.
"""

from __future__ import annotations

import inspect
from datetime import date, datetime, timedelta, timezone

import pytest
from conftest import auth_header, make_producer, make_user
from sqlalchemy import distinct, func, tuple_

from app.models.models import (
    ProducerAnalyticsDaily,
    ProducerPageView,
    ProducerWhatsAppClick,
)
from app.services import analytics_rollup
from app.services.analytics import israel_day_of
from app.services.analytics_rollup import (
    RAW_RETENTION_DAYS,
    pending_days,
    roll_up_day,
    rollup_watermark,
    run_rollup,
)
from app.utils.clock import ISRAEL_TZ, israel_today

# A fixed Israel "today" for the job tests — the job takes it as a parameter,
# so nothing here depends on the wall clock except the CLI test, which cannot
# inject it and seeds relative to the real day instead.
ANCHOR = date(2026, 9, 6)
D = {n: ANCHOR - timedelta(days=n) for n in range(0, 50)}  # D[1] = yesterday


def _utc(day: date, hour: int, minute: int = 0) -> datetime:
    """Naive-UTC timestamp for `hour:minute` Israel local time on `day` —
    the same conversion the SQL side does in reverse (`israel_day_of`)."""
    local = datetime.combine(day, datetime.min.time(), tzinfo=ISRAEL_TZ).replace(
        hour=hour, minute=minute
    )
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def _view(db, pid, ip, day, *, hour=12, referrer=None):
    db.add(
        ProducerPageView(
            producer_id=pid,
            viewer_ip_hash=ip,
            referrer=referrer,
            created_at=_utc(day, hour),
        )
    )


def _click(db, pid, day, *, hour=12):
    db.add(ProducerWhatsAppClick(producer_id=pid, clicked_at=_utc(day, hour)))


def _rows(db):
    """Every aggregate row as a comparable dict — the snapshot the
    immutability tests diff against."""
    return {
        (r.producer_id, r.day): (
            r.views_unique,
            r.views_search_unique,
            r.whatsapp_clicks,
        )
        for r in db.query(ProducerAnalyticsDaily).all()
    }


def _owner(db, email):
    p = make_producer(db)
    user = make_user(db, email=email, role="producer")
    user.producer_id = p.id
    db.commit()
    return p, user


def _totals(client, user):
    body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
    return (
        body["profile_views"]["total"],
        body["search_appearances"]["total"],
        body["whatsapp_clicks"]["total"],
    )


# ── (a) the job ───────────────────────────────────────────────────────────
def test_run_twice_leaves_the_row_count_unchanged(db):
    """Sapir's test (a), first half. The second run sees nothing pending;
    an explicit backfill over the same days reports them all as skipped."""
    p1 = make_producer(db, name="א")
    p2 = make_producer(db, name="ב")
    for day in (D[3], D[2], D[1]):
        _view(db, p1.id, "a" * 64, day)
        _view(db, p1.id, "a" * 64, day)  # refresh — dedupes to 1
        _click(db, p2.id, day)
    db.commit()

    first = run_rollup(db, today=ANCHOR)
    assert (first.days_rolled, first.days_skipped, first.rows_inserted) == (3, 0, 6)
    assert first.first_day == D[3] and first.last_day == D[1]
    snapshot = _rows(db)
    assert len(snapshot) == 6
    assert snapshot[(p1.id, D[2])] == (1, 0, 0)
    assert snapshot[(p2.id, D[2])] == (0, 0, 1)

    second = run_rollup(db, today=ANCHOR)
    assert (second.days_rolled, second.days_skipped, second.rows_inserted) == (0, 0, 0)
    assert _rows(db) == snapshot

    backfill = run_rollup(db, from_day=D[3], to_day=D[1], today=ANCHOR)
    assert (backfill.days_rolled, backfill.days_skipped) == (0, 3)
    assert _rows(db) == snapshot


def test_a_rolled_day_is_immutable_even_when_raw_rows_are_added(db):
    """THE discriminating case for skip-on-conflict vs upsert-overwrite.

    After the roll-up, five NEW visitors hit D[2] and the raw rows for D[3]
    are deleted. An upsert would raise D[2] to 6 and leave D[3] alone; a
    correct skip leaves BOTH exactly as first written. (The deletion half is
    Sapir's stated test; the addition half is what makes it evidence.)
    """
    p = make_producer(db, name="קבוע")
    for day in (D[3], D[2]):
        _view(db, p.id, "a" * 64, day)
    db.commit()
    run_rollup(db, today=ANCHOR)
    snapshot = _rows(db)
    assert snapshot[(p.id, D[2])] == (1, 0, 0)

    for i in range(5):
        _view(db, p.id, f"{i}" * 64, D[2])
    db.query(ProducerPageView).filter(
        israel_day_of(ProducerPageView.created_at) == D[3]
    ).delete(synchronize_session=False)
    db.commit()

    again = run_rollup(db, from_day=D[3], to_day=D[2], today=ANCHOR)
    assert (again.days_rolled, again.days_skipped) == (0, 2)
    assert _rows(db) == snapshot, "a rolled-up day must never be re-rolled"
    # And the row-level guard holds on its own too: a direct call on a rolled
    # day returns None without touching anything.
    assert roll_up_day(db, D[2]) is None
    assert _rows(db) == snapshot


def test_today_is_never_rolled(db):
    p = make_producer(db, name="היום")
    _view(db, p.id, "a" * 64, D[1])
    _view(db, p.id, "a" * 64, D[0])  # today — a partial day
    db.commit()

    assert pending_days(db, today=ANCHOR) == [D[1]]
    result = run_rollup(db, today=ANCHOR)
    assert result.days_rolled == 1
    assert set(day for _, day in _rows(db)) == {D[1]}
    assert rollup_watermark(db) == D[1]

    with pytest.raises(ValueError, match="never today"):
        run_rollup(db, from_day=D[1], to_day=D[0], today=ANCHOR)


def test_the_range_is_watermark_plus_one_to_yesterday(db):
    """Including a day nobody visited: it is rolled (zero rows), the
    watermark stays at the last day WITH a row, and the next run simply
    re-includes the empty day — reading nothing, writing nothing."""
    p = make_producer(db, name="טווח")
    _view(db, p.id, "a" * 64, D[5])
    _view(db, p.id, "a" * 64, D[3])  # D[4] has no activity at all
    db.commit()

    assert pending_days(db, today=ANCHOR) == [D[5], D[4], D[3], D[2], D[1]]
    result = run_rollup(db, today=ANCHOR)
    assert (result.days_rolled, result.rows_inserted) == (5, 2)
    assert rollup_watermark(db) == D[3]
    # Two days later the range starts right after the watermark, and the
    # empty days are harmlessly re-included.
    assert pending_days(db, today=ANCHOR + timedelta(days=2)) == [
        D[2],
        D[1],
        D[0],
        ANCHOR + timedelta(days=1),
    ]
    # Nothing rolled up at all and nothing raw → nothing to do, no crash.
    db.query(ProducerAnalyticsDaily).delete()
    db.query(ProducerPageView).delete()
    db.commit()
    assert pending_days(db, today=ANCHOR) == []
    empty = run_rollup(db, today=ANCHOR)
    assert (empty.days_rolled, empty.first_day) == (0, None)


def test_backfill_refuses_a_hole_and_a_range_past_retention(db):
    p = make_producer(db, name="גבולות")
    _view(db, p.id, "a" * 64, D[3])
    _view(db, p.id, "a" * 64, D[1])  # so the watermark lands on yesterday
    db.commit()
    run_rollup(db, today=ANCHOR)
    assert rollup_watermark(db) == D[1]

    later = ANCHOR + timedelta(days=10)
    # Starting above watermark + 1 leaves days the reader would never see.
    with pytest.raises(ValueError, match="hole"):
        run_rollup(
            db,
            from_day=ANCHOR + timedelta(days=3),
            to_day=later - timedelta(days=1),
            today=later,
        )
    # Exactly watermark + 1 is fine (the automatic range's own start).
    ok = run_rollup(db, from_day=D[0], to_day=D[0], today=later)
    assert ok.days_rolled == 1
    with pytest.raises(ValueError, match="retention"):
        run_rollup(
            db,
            from_day=ANCHOR - timedelta(days=RAW_RETENTION_DAYS + 1),
            to_day=D[1],
            today=ANCHOR,
        )
    with pytest.raises(ValueError, match="after"):
        run_rollup(db, from_day=D[1], to_day=D[2], today=ANCHOR)
    with pytest.raises(ValueError, match="both"):
        run_rollup(db, from_day=D[2], today=ANCHOR)


def test_each_column_carries_its_own_definition(db):
    """views_unique dedupes per visitor (MEH-160, NULL hashes counted
    one-by-one), views_search_unique counts only `referrer == "search"`, and
    whatsapp_clicks is a plain count — a business with clicks and no views
    still gets its row."""
    views_only = make_producer(db, name="צפיות")
    clicks_only = make_producer(db, name="קליקים")
    for _ in range(3):
        _view(db, views_only.id, "a" * 64, D[1], referrer="search")
    _view(db, views_only.id, "b" * 64, D[1], referrer="map")
    _view(db, views_only.id, None, D[1])
    _view(db, views_only.id, None, D[1])
    for _ in range(4):
        _click(db, clicks_only.id, D[1])
    db.commit()

    run_rollup(db, today=ANCHOR)
    rows = _rows(db)
    assert rows[(views_only.id, D[1])] == (4, 1, 0)  # a + b + 2 NULLs · a via search
    assert rows[(clicks_only.id, D[1])] == (0, 0, 4)


# ── (b) the reader ────────────────────────────────────────────────────────
def _seed_history(db, pid):
    """Rows across the seam. Per-column expected totals, by hand:
    views:  D[40]: a,b → 2 · D[3]: a×3, NULL×2 → 3 · D[2]: a at 01:30 and
            a at 23:30 Israel (one Israel day, TWO UTC days) + b → 2 ·
            D[0] (today): c → 1                                → 8
    search: D[3]: a×3 via search → 1 · D[2]: b via search → 1  → 2
    clicks: D[40]: 1 · D[2]: 2 · D[0]: 1                       → 4
    """
    _view(db, pid, "a" * 64, D[40])
    _view(db, pid, "b" * 64, D[40])
    _click(db, pid, D[40])
    for _ in range(3):
        _view(db, pid, "a" * 64, D[3], referrer="search")
    _view(db, pid, None, D[3])
    _view(db, pid, None, D[3])
    db.add(
        ProducerPageView(
            producer_id=pid, viewer_ip_hash="a" * 64, created_at=_utc(D[2], 1, 30)
        )
    )
    db.add(
        ProducerPageView(
            producer_id=pid, viewer_ip_hash="a" * 64, created_at=_utc(D[2], 23, 30)
        )
    )
    _view(db, pid, "b" * 64, D[2], referrer="search")
    _click(db, pid, D[2])
    _click(db, pid, D[2])
    _view(db, pid, "c" * 64, D[0])
    _click(db, pid, D[0])
    db.commit()


EXPECTED = (8, 2, 4)


def test_total_is_equal_before_after_and_after_the_rolled_rows_are_gone(client, db):
    """Sapir's test (b), all three states — same producer, both paths."""
    p, user = _owner(db, "seam@test.com")
    _seed_history(db, p.id)

    assert rollup_watermark(db) is None
    assert _totals(client, user) == EXPECTED, "raw-only, before any roll-up"

    result = run_rollup(db, today=ANCHOR)
    assert result.rows_inserted == 3  # D[40], D[3], D[2] — today untouched
    # D[1] had no activity, so it produced no row and the watermark is the
    # last day that DID — the raw side then reads D[1] and D[0], both raw.
    assert rollup_watermark(db) == D[2]
    # CONTROL: the aggregate really carries the rolled days, so the equality
    # below cannot be "raw counted everything and the aggregate added 0".
    agg = db.query(
        func.sum(ProducerAnalyticsDaily.views_unique),
        func.sum(ProducerAnalyticsDaily.views_search_unique),
        func.sum(ProducerAnalyticsDaily.whatsapp_clicks),
    ).one()
    assert tuple(int(x) for x in agg) == (7, 2, 3)
    assert _totals(client, user) == EXPECTED, "aggregate + raw above the watermark"

    # Chunk C, simulated: every raw row the aggregate owns disappears.
    cutoff = _utc(D[0], 0)
    db.query(ProducerPageView).filter(ProducerPageView.created_at < cutoff).delete(
        synchronize_session=False
    )
    db.query(ProducerWhatsAppClick).filter(
        ProducerWhatsAppClick.clicked_at < cutoff
    ).delete(synchronize_session=False)
    db.commit()
    assert db.query(ProducerPageView).count() == 1
    assert _totals(client, user) == EXPECTED, "the owner's numbers must not move"


def test_the_raw_side_never_reads_a_day_the_aggregate_has(client, db):
    """The seam's other direction: raw rows on a rolled day are invisible to
    `total`, even when they arrive AFTER the roll-up. Otherwise a late row
    (or a partially purged day) would be counted twice or once-and-a-half."""
    p, user = _owner(db, "owned@test.com")
    _view(db, p.id, "a" * 64, D[2])
    db.commit()
    run_rollup(db, today=ANCHOR)
    assert _totals(client, user)[0] == 1

    _view(db, p.id, "z" * 64, D[2])  # lands on an owned day
    _view(db, p.id, "z" * 64, D[0])  # lands above the watermark
    db.commit()
    assert _totals(client, user)[0] == 2, "D[2] is the aggregate's; only D[0] is raw"


def test_the_day_windows_stay_raw_only(client, db):
    """Ruled raw-only for now. Pinned so the ≥30-day retention condition
    recorded on the card is a real precondition, not a forgotten one: if
    chunk C purges inside 30 days, THIS number is the one that shrinks."""
    p, user = _owner(db, "raw7d@test.com")
    _view(db, p.id, "a" * 64, israel_today() - timedelta(days=2))
    db.commit()
    run_rollup(db)  # real today: rolls the day above
    body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
    assert body["profile_views"]["last_7d"] == 1
    db.query(ProducerPageView).delete()
    db.commit()
    body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
    assert body["profile_views"]["total"] == 1, "total survives via the aggregate"
    assert body["profile_views"]["last_7d"] == 0, "the 7d arm does not (raw-only)"


def test_utc_partition_would_break_the_equality(db):
    """Why the job partitions on the Israel day (see the module header). One
    visitor at 01:30 and 23:30 Israel on the same day is ONE (israel_day,
    hash) key and TWO (utc_day, hash) keys. A job that rolled UTC days would
    write 2 into the aggregate for what the raw path counts as 1."""
    p = make_producer(db, name="חצות")
    db.add(
        ProducerPageView(
            producer_id=p.id, viewer_ip_hash="a" * 64, created_at=_utc(D[2], 1, 30)
        )
    )
    db.add(
        ProducerPageView(
            producer_id=p.id, viewer_ip_hash="a" * 64, created_at=_utc(D[2], 23, 30)
        )
    )
    db.commit()
    israel_keys = db.query(
        func.count(
            distinct(
                tuple_(
                    israel_day_of(ProducerPageView.created_at),
                    ProducerPageView.viewer_ip_hash,
                )
            )
        )
    ).scalar()
    utc_keys = db.query(
        func.count(
            distinct(
                tuple_(
                    func.date(ProducerPageView.created_at),
                    ProducerPageView.viewer_ip_hash,
                )
            )
        )
    ).scalar()
    assert (israel_keys, utc_keys) == (1, 2)
    run_rollup(db, today=ANCHOR)
    assert _rows(db)[(p.id, D[2])][0] == 1


# ── wiring ────────────────────────────────────────────────────────────────
def test_scheduler_registration_and_crash_isolation(monkeypatch, db):
    """Source pins for the wiring strings (same caveat as MEH-1828's test:
    weak alone, which is why the service is tested for real above), plus the
    MEH-1824 shape — the wrapper swallows a crash and reports under its own
    Sentry tag."""
    from app import startup
    from apscheduler.triggers.cron import CronTrigger

    assert callable(startup._run_analytics_rollup_job)
    src = inspect.getsource(startup)
    assert "meh_2283_analytics_rollup_daily" in src
    assert "_run_analytics_rollup_job,\n        CronTrigger(hour=1, minute=30)" in src
    fields = {f.name: str(f) for f in CronTrigger(hour=1, minute=30).fields}
    assert (fields["hour"], fields["minute"]) == ("1", "30")

    captured: list[str] = []

    def boom(_db):
        raise RuntimeError("synthetic roll-up failure")

    class _NonClosing:
        def __init__(self, real):
            self._real = real

        def __getattr__(self, name):
            if name == "close":
                return lambda: None
            return getattr(self._real, name)

    monkeypatch.setattr(analytics_rollup, "run_rollup", boom)
    monkeypatch.setattr(
        startup, "capture_background_exception", lambda exc, task: captured.append(task)
    )
    monkeypatch.setattr("app.database.SessionLocal", lambda: _NonClosing(db))
    startup._run_analytics_rollup_job()  # must not raise
    assert captured == ["analytics_rollup"]


def test_the_cli_backfills_and_reports_json(db, capsys):
    """`scripts/rollup_analytics.py --from --to` against the test DB. It
    cannot inject `today`, so the seed sits on the real Israel yesterday."""
    import importlib.util
    import json
    from pathlib import Path

    spec = importlib.util.spec_from_file_location(
        "rollup_analytics",
        Path(__file__).resolve().parents[1]
        / "backend"
        / "scripts"
        / "rollup_analytics.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    yesterday = israel_today() - timedelta(days=1)
    p = make_producer(db, name="CLI")
    _view(db, p.id, "a" * 64, yesterday)
    db.commit()

    assert (
        mod.main(["--from", yesterday.isoformat(), "--to", yesterday.isoformat()]) == 0
    )
    out = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert (out["days_rolled"], out["days_skipped"], out["rows_inserted"]) == (1, 0, 1)
    # A refused range exits 2 and explains itself on stderr.
    assert (
        mod.main(["--from", yesterday.isoformat(), "--to", israel_today().isoformat()])
        == 2
    )
    assert "never today" in capsys.readouterr().err
