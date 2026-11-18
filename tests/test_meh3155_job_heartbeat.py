"""
MEH-3155: every APScheduler job sends a Sentry Crons heartbeat.

Asserted against the REAL `app.startup._run_*_job` functions (the ones
`add_job` registers), with each job's service and the check-in sink
monkeypatched. Before MEH-3155 none of the five sent any check-in, so every
`test_job_sends_checkins` case fails on the old code (0 check-ins).
"""

from __future__ import annotations

import pytest

from app import startup
from app.services import job_heartbeat


class _NoopSession:
    def close(self) -> None:
        pass

    def rollback(self) -> None:
        pass


@pytest.fixture
def checkins(monkeypatch):
    sent: list[dict] = []

    def spy(**kwargs):
        sent.append(kwargs)
        return "cid-1"

    monkeypatch.setattr(job_heartbeat, "_capture_checkin", spy)
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    import app.database

    monkeypatch.setattr(app.database, "SessionLocal", lambda: _NoopSession())
    return sent


def _stub_services(monkeypatch):
    from app.services import (
        admin_pending_reminder,
        analytics_rollup,
        auto_reply_watchdog,
        billing_start_signal,
        group_buy_expiry,
        onboarding_followup,
        pending_nudge,
        rescue_digest,
        retention_purge,
        weekly_owner_summary,
    )

    monkeypatch.setattr(onboarding_followup, "send_due_followups", lambda db: {})
    monkeypatch.setattr(
        admin_pending_reminder, "send_admin_pending_reminder", lambda db: 0
    )
    monkeypatch.setattr(
        billing_start_signal, "send_billing_start_signal", lambda db: False
    )
    monkeypatch.setattr(pending_nudge, "send_pending_nudges", lambda db: {})
    monkeypatch.setattr(auto_reply_watchdog, "run_watchdog", lambda db: {})
    monkeypatch.setattr(analytics_rollup, "run_rollup", lambda db: {})
    monkeypatch.setattr(retention_purge, "run_purge", lambda db: {})
    monkeypatch.setattr(group_buy_expiry, "expire_unfunded_group_buys", lambda db: 0)
    monkeypatch.setattr(rescue_digest, "send_rescue_digests", lambda db: {})
    monkeypatch.setattr(
        weekly_owner_summary, "send_weekly_summaries", lambda db, now=None: {}
    )


JOBS = [
    (
        "_run_followup_job",
        "onboarding-followups-daily",
        "crontab",
        job_heartbeat.FOLLOWUP_CRON,
    ),
    (
        "_run_admin_pending_reminder_job",
        "admin-pending-reminder-daily",
        "crontab",
        job_heartbeat.ADMIN_PENDING_REMINDER_CRON,
    ),
    (
        "_run_billing_start_signal_job",
        "billing-start-signal-monthly",
        "crontab",
        job_heartbeat.BILLING_START_SIGNAL_CRON,
    ),
    (
        "_run_watchdog_job",
        "auto-reply-watchdog",
        "interval",
        job_heartbeat.WATCHDOG_INTERVAL_MINUTES,
    ),
    (
        "_run_analytics_rollup_job",
        "analytics-rollup-daily",
        "crontab",
        job_heartbeat.ANALYTICS_ROLLUP_CRON,
    ),
    (
        "_run_retention_purge_job",
        "retention-purge-daily",
        "crontab",
        job_heartbeat.RETENTION_PURGE_CRON,
    ),
    (
        "_run_group_buy_expiry_job",
        "group-buy-expiry-daily",
        "crontab",
        job_heartbeat.GROUP_BUY_EXPIRY_CRON,
    ),
    (
        "_run_rescue_digest_job",
        "rescue-codes-digest",
        "interval",
        job_heartbeat.RESCUE_DIGEST_INTERVAL_MINUTES,
    ),
    (
        "_run_weekly_owner_summary_job",
        "weekly-owner-summary",
        "crontab",
        job_heartbeat.WEEKLY_OWNER_SUMMARY_CRON,
    ),
]


@pytest.mark.parametrize("job", JOBS, ids=[j[0] for j in JOBS])
def test_job_sends_checkins(monkeypatch, checkins, job):
    func_name, slug, kind, value = job
    _stub_services(monkeypatch)
    getattr(startup, func_name)()

    # Daily jobs open with in_progress (hung-run detection); 5-minute jobs
    # send only the closing check-in.
    if kind == "crontab":
        assert [c["status"] for c in checkins] == ["in_progress", "ok"]
        assert checkins[1]["check_in_id"] == "cid-1"
    else:
        assert [c["status"] for c in checkins] == ["ok"]
    assert {c["monitor_slug"] for c in checkins} == {slug}
    schedule = checkins[-1]["monitor_config"]["schedule"]
    assert schedule["type"] == kind
    assert schedule["value"] == value


def test_failed_checkin_never_breaks_the_job(monkeypatch):
    ran: list[bool] = []

    def boom(**_kwargs):
        raise RuntimeError("sentry down")

    monkeypatch.setattr(job_heartbeat, "_capture_checkin", boom)

    @job_heartbeat.heartbeat("x", job_heartbeat.interval_monitor_config(5))
    def job() -> None:
        ran.append(True)

    job()
    assert ran == [True]


def test_job_exception_reports_error_and_propagates(monkeypatch, checkins):
    @job_heartbeat.heartbeat("x", job_heartbeat.cron_monitor_config("0 10 * * *"))
    def job() -> None:
        raise ValueError("job bug")

    with pytest.raises(ValueError):
        job()
    assert [c["status"] for c in checkins] == ["in_progress", "error"]


def test_no_checkins_outside_production(monkeypatch, checkins):
    monkeypatch.setenv("ENV", "staging")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "staging")
    _stub_services(monkeypatch)
    startup._run_analytics_rollup_job()
    assert checkins == []


def test_real_sdk_builds_a_check_in_event(monkeypatch):
    """The real capture_checkin accepts our kwargs and emits a check_in event
    carrying the monitor config (guards an SDK rename that the spies miss)."""
    import sentry_sdk

    events: list[dict] = []
    monkeypatch.setattr(sentry_sdk, "capture_event", lambda e, **_: events.append(e))
    cfg = job_heartbeat.cron_monitor_config(job_heartbeat.FOLLOWUP_CRON)
    job_heartbeat._capture_checkin(
        monitor_slug="s", status="ok", duration=1.0, monitor_config=cfg
    )
    assert events[0]["type"] == "check_in"
    assert events[0]["monitor_slug"] == "s"
    assert events[0]["monitor_config"] == cfg


def _registered(monkeypatch, *, flags_on: bool):
    from apscheduler.schedulers.background import BackgroundScheduler

    from app.services import rescue_digest

    monkeypatch.setattr(startup.settings, "watchdog_enabled", flags_on)
    monkeypatch.setattr(startup.settings, "rescue_bags_enabled", flags_on)
    monkeypatch.setattr(rescue_digest, "digest_enabled", lambda: flags_on)
    from app.services import weekly_owner_summary

    monkeypatch.setattr(weekly_owner_summary, "summary_enabled", lambda: flags_on)
    # The boot catch-up is a one-off DateTrigger, not the schedule the monitor
    # announces; keep it out so this test sees only the recurring jobs.
    monkeypatch.setattr(weekly_owner_summary, "catchup_due", lambda now: False)
    sched = BackgroundScheduler(timezone="UTC")
    startup.register_scheduler_jobs(sched)  # never started
    return {j.func.__name__: j.trigger for j in sched.get_jobs()}


def test_registered_triggers_match_monitor_configs(monkeypatch, checkins):
    """Each REGISTERED trigger fires on the schedule its monitor announces."""
    from apscheduler.triggers.cron import CronTrigger

    triggers = _registered(monkeypatch, flags_on=True)
    _stub_services(monkeypatch)
    assert set(triggers) == {j[0] for j in JOBS}
    for func_name, _slug, kind, _value in JOBS:
        checkins.clear()
        getattr(startup, func_name)()
        schedule = checkins[-1]["monitor_config"]["schedule"]
        trig = triggers[func_name]
        if kind == "crontab":
            expected = CronTrigger.from_crontab(
                schedule["value"], timezone=checkins[-1]["monitor_config"]["timezone"]
            )
            assert str(trig) == str(expected), func_name
        else:
            assert trig.interval.total_seconds() == schedule["value"] * 60, func_name


def test_flagged_jobs_absent_when_flags_off(monkeypatch):
    """No registration, so no check-in, so no monitor and no false alert."""
    triggers = _registered(monkeypatch, flags_on=False)
    assert "_run_watchdog_job" not in triggers
    assert "_run_rescue_digest_job" not in triggers
    assert "_run_weekly_owner_summary_job" not in triggers
    flagged = {
        "_run_watchdog_job",
        "_run_rescue_digest_job",
        "_run_weekly_owner_summary_job",
    }
    assert set(triggers) == {j[0] for j in JOBS} - flagged
