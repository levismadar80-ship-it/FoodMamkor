"""
Module:   test_meh2303_retention_purge
Purpose:  MEH-2079 chunk C (MEH-2303) — the daily retention purge: raw views
          and clicks past 90 days that the roll-up already owns, alert_log
          rows past 30 days, and the owner's totals unchanged across a purge.
Touches:  The test DB via `db` and the owner dashboard endpoint via `client`.
Does NOT: re-test the roll-up itself (tests/test_meh2283_analytics_rollup.py).
Related:  backend/app/services/retention_purge.py;
          backend/app/startup.py::_run_retention_purge_job.
History:  MEH-2303 (creation, 22/10).

WHAT DISCRIMINATES WHAT
-----------------------
`test_an_unrolled_day_is_kept_even_past_retention` is the construction for the
watermark guard: D[91] is past retention but above the watermark, so a purge
that only checked age would delete it. The 89/90/91 cases pin the window edge,
and the alert-log 29/31 cases pin the 30-day window.
"""

from __future__ import annotations

import inspect
from datetime import date, datetime, timedelta, timezone

from conftest import auth_header, make_producer, make_user

from app.models.models import (
    AlertLog,
    ProducerAnalyticsDaily,
    ProducerPageView,
    ProducerWhatsAppClick,
)
from app.services import retention_purge
from app.services.analytics import israel_day_of
from app.services.analytics_rollup import rollup_watermark, run_rollup
from app.services.retention_purge import run_purge
from app.utils.clock import ISRAEL_TZ

ANCHOR = date(2026, 9, 6)
D = {n: ANCHOR - timedelta(days=n) for n in range(130)}  # D[1] = yesterday
NOW = datetime(2026, 9, 6, 10, 0)  # naive UTC, for the alert-log window


def _utc(day: date, hour: int = 12) -> datetime:
    local = datetime.combine(day, datetime.min.time(), tzinfo=ISRAEL_TZ).replace(
        hour=hour
    )
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def _view(db, pid, ip, day, *, referrer=None):
    db.add(
        ProducerPageView(
            producer_id=pid, viewer_ip_hash=ip, referrer=referrer, created_at=_utc(day)
        )
    )


def _click(db, pid, day):
    db.add(ProducerWhatsAppClick(producer_id=pid, clicked_at=_utc(day)))


def _view_days(db):
    return sorted(
        d for (d,) in db.query(israel_day_of(ProducerPageView.created_at)).all()
    )


def _click_days(db):
    return sorted(
        d for (d,) in db.query(israel_day_of(ProducerWhatsAppClick.clicked_at)).all()
    )


def test_deletes_rolled_days_past_retention_and_keeps_the_window_edge(db):
    p = make_producer(db)
    for n in (91, 90, 89, 1):
        _view(db, p.id, f"{n:064d}", D[n])
    for n in (91, 89):
        _click(db, p.id, D[n])
    db.commit()
    run_rollup(db, today=ANCHOR)
    assert rollup_watermark(db) == D[1]  # CONTROL: every seeded day is owned

    result = run_purge(db, today=ANCHOR, now=NOW)

    assert result.raw_boundary_day == D[90]
    assert (result.views_deleted, result.clicks_deleted) == (1, 1)
    assert _view_days(db) == [D[90], D[89], D[1]]
    assert _click_days(db) == [D[89]]


def test_an_unrolled_day_is_kept_even_past_retention(db):
    p = make_producer(db)
    for n in (95, 91):
        _view(db, p.id, f"{n:064d}", D[n])
        _click(db, p.id, D[n])
    # The aggregate owns everything up to D[93] only — D[91] was never rolled.
    db.add(ProducerAnalyticsDaily(producer_id=p.id, day=D[93]))
    db.commit()

    result = run_purge(db, today=ANCHOR, now=NOW)

    assert result.raw_boundary_day == D[92]
    assert (result.views_deleted, result.clicks_deleted) == (1, 1)
    assert _view_days(db) == [D[91]]
    assert _click_days(db) == [D[91]]


def test_nothing_raw_is_deleted_before_any_roll_up(db):
    p = make_producer(db)
    _view(db, p.id, "a" * 64, D[120])
    _click(db, p.id, D[120])
    db.commit()

    result = run_purge(db, today=ANCHOR, now=NOW)

    assert result.raw_boundary_day is None
    assert (result.views_deleted, result.clicks_deleted) == (0, 0)
    assert db.query(ProducerPageView).count() == 1
    assert db.query(ProducerWhatsAppClick).count() == 1


def test_alert_log_keeps_30_days(db):
    p = make_producer(db)
    user = make_user(db, email="alerts@example.com")
    for days_ago in (29, 31):
        db.add(
            AlertLog(
                user_id=user.id,
                producer_id=p.id,
                channel="push",
                alert_type="new_product",
                sent_at=NOW - timedelta(days=days_ago),
            )
        )
    db.commit()

    result = run_purge(db, today=ANCHOR, now=NOW)

    assert result.alerts_deleted == 1
    (kept,) = db.query(AlertLog.sent_at).all()
    assert kept[0] == NOW - timedelta(days=29)


def test_a_second_run_deletes_nothing_more(db):
    p = make_producer(db)
    for n in (100, 1):
        _view(db, p.id, f"{n:064d}", D[n])
    db.commit()
    run_rollup(db, today=ANCHOR)

    first = run_purge(db, today=ANCHOR, now=NOW)
    second = run_purge(db, today=ANCHOR, now=NOW)

    assert first.views_deleted == 1
    assert (second.views_deleted, second.clicks_deleted, second.alerts_deleted) == (
        0,
        0,
        0,
    )


def test_the_owners_totals_do_not_move_across_a_purge(client, db):
    p = make_producer(db)
    user = make_user(db, email="purge-owner@example.com", role="producer")
    user.producer_id = p.id
    db.commit()
    _view(db, p.id, "a" * 64, D[100])
    _view(db, p.id, "b" * 64, D[100], referrer="search")
    _view(db, p.id, "a" * 64, D[95])
    _view(db, p.id, "c" * 64, D[5])
    _click(db, p.id, D[100])
    _click(db, p.id, D[3])
    db.commit()
    run_rollup(db, today=ANCHOR)

    def totals():
        body = client.get("/producers/me/analytics", headers=auth_header(user)).json()
        return (
            body["profile_views"]["total"],
            body["search_appearances"]["total"],
            body["whatsapp_clicks"]["total"],
        )

    before = totals()
    assert before == (4, 1, 2)  # CONTROL: the seed is what the numbers read

    result = run_purge(db, today=ANCHOR, now=NOW)

    assert (result.views_deleted, result.clicks_deleted) == (3, 1)
    assert totals() == before, "the owner's numbers must not move"


def test_scheduler_registration_and_crash_isolation(monkeypatch, db):
    from app import startup

    src = inspect.getsource(startup)
    assert "meh_2303_retention_purge_daily" in src
    assert "_run_retention_purge_job,\n        CronTrigger(hour=2, minute=30)" in src

    captured: list[str] = []

    def boom(_db):
        raise RuntimeError("synthetic purge failure")

    class _NonClosing:
        def __init__(self, real):
            self._real = real

        def __getattr__(self, name):
            if name == "close":
                return lambda: None
            return getattr(self._real, name)

    monkeypatch.setattr(retention_purge, "run_purge", boom)
    monkeypatch.setattr(
        startup, "capture_background_exception", lambda exc, task: captured.append(task)
    )
    monkeypatch.setattr("app.database.SessionLocal", lambda: _NonClosing(db))
    startup._run_retention_purge_job()  # must not raise
    assert captured == ["retention_purge"]
