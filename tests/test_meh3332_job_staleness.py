"""MEH-3332: the free monitor for the background jobs the Sentry $0 plan
cannot watch. A @heartbeat job records its last success; the checker emails
the admin, once per Israel day, about a registered job that is overdue."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.config import settings
from app.models import AdminSetting
from app.services import email as email_mod
from app.services import job_heartbeat, job_staleness
from app.services.job_heartbeat import cron_monitor_config, interval_monitor_config

DAILY = cron_monitor_config("0 6 * * *")
WEEKLY = cron_monitor_config("0 8 * * sun", "Asia/Jerusalem")
FIVE_MIN = interval_monitor_config(5)
NOW = datetime(2026, 11, 18, 12, 0, tzinfo=UTC)
BOOT = NOW - timedelta(days=3)


@pytest.fixture
def sent(monkeypatch):
    mails: list[tuple[str, str]] = []
    monkeypatch.setattr(settings, "admin_email", "admin@example.com")
    monkeypatch.setattr(
        email_mod,
        "send_email",
        lambda to, subject, body, **_: mails.append((to, subject)),
    )
    return mails


def _ok(db, slug: str, when: datetime) -> None:
    db.add(AdminSetting(key=f"job_ok:{slug}", value=when.isoformat()))
    db.commit()


@pytest.mark.parametrize(
    ("config", "expected"),
    [
        (DAILY, timedelta(hours=26)),
        (WEEKLY, timedelta(days=7, hours=2)),
        (FIVE_MIN, timedelta(minutes=30)),
        (interval_monitor_config(10), timedelta(hours=1)),
    ],
)
def test_max_age_by_schedule(config, expected):
    assert job_staleness.max_age(config) == expected


def test_daily_job_27h_since_success_is_overdue(db):
    _ok(db, "daily-a", NOW - timedelta(hours=27))
    jobs = [("daily-a", DAILY)]
    assert job_staleness.overdue_slugs(db, jobs, booted_at=BOOT, now=NOW) == ["daily-a"]


def test_daily_job_25h_since_success_is_on_time(db):
    _ok(db, "daily-a", NOW - timedelta(hours=25))
    jobs = [("daily-a", DAILY)]
    assert job_staleness.overdue_slugs(db, jobs, booted_at=BOOT, now=NOW) == []


def test_job_that_never_ran_is_measured_from_boot(db):
    jobs = [("never", DAILY)]
    recent_boot = NOW - timedelta(hours=2)
    assert job_staleness.overdue_slugs(db, jobs, booted_at=recent_boot, now=NOW) == []
    assert job_staleness.overdue_slugs(db, jobs, booted_at=BOOT, now=NOW) == ["never"]


def test_old_success_before_a_recent_boot_does_not_alert(db):
    # A week-long outage: the job could not run, the clock restarts at boot.
    _ok(db, "daily-a", NOW - timedelta(days=7))
    jobs = [("daily-a", DAILY)]
    recent_boot = NOW - timedelta(hours=1)
    assert job_staleness.overdue_slugs(db, jobs, booted_at=recent_boot, now=NOW) == []


def test_weekly_job_six_days_is_on_time(db):
    _ok(db, "weekly", NOW - timedelta(days=6))
    assert (
        job_staleness.overdue_slugs(
            db, [("weekly", WEEKLY)], booted_at=BOOT - timedelta(days=9), now=NOW
        )
        == []
    )


def test_overdue_job_emails_admin_once_per_day(db, sent):
    _ok(db, "daily-a", NOW - timedelta(hours=30))
    jobs = [("daily-a", DAILY), ("tick", FIVE_MIN)]
    _ok(db, "tick", NOW - timedelta(minutes=10))
    assert job_staleness.check_jobs(jobs, booted_at=BOOT, now=NOW) == ["daily-a"]
    assert job_staleness.check_jobs(jobs, booted_at=BOOT, now=NOW) == ["daily-a"]
    assert len(sent) == 1
    assert sent[0][0] == "admin@example.com"
    assert "daily-a" in sent[0][1]


def test_record_ok_writes_the_timestamp(db):
    job_staleness.record_ok("daily-a", now=NOW)
    db.expire_all()
    assert db.get(AdminSetting, "job_ok:daily-a").value == NOW.isoformat()


def test_heartbeat_records_success_in_production(db, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(job_heartbeat, "_capture_checkin", lambda **_: None)

    @job_heartbeat.heartbeat("daily-a", DAILY)
    def job() -> None:
        return None

    job()
    db.expire_all()
    assert db.get(AdminSetting, "job_ok:daily-a") is not None
    assert job.heartbeat_slug == "daily-a"


def test_heartbeat_does_not_record_a_failed_run(db, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(job_heartbeat, "_capture_checkin", lambda **_: None)

    @job_heartbeat.heartbeat("daily-a", DAILY)
    def job() -> None:
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        job()
    db.expire_all()
    assert db.get(AdminSetting, "job_ok:daily-a") is None


def test_every_registered_heartbeat_job_is_visible_to_the_checker():
    # The checker reads slug + config off scheduler jobs; a job registered
    # without them would never be checked.
    from apscheduler.schedulers.background import BackgroundScheduler

    from app.startup import register_scheduler_jobs

    scheduler = BackgroundScheduler(timezone="UTC")
    register_scheduler_jobs(scheduler)
    slugs = {
        j.func.heartbeat_slug
        for j in scheduler.get_jobs()
        if hasattr(j.func, "heartbeat_slug")
    }
    assert {"onboarding-followups-daily", "analytics-rollup-daily"} <= slugs
