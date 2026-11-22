"""MEH-3705: technical alerts go to Sentry, where the daily Claude check reads
them, instead of to the admin's inbox. Without an active Sentry client the old
email still goes out, so an alert never goes dark."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.config import settings
from app.models import AdminSetting
from app.services import email as email_mod
from app.services import job_staleness, ops_alert
from app.services.job_heartbeat import cron_monitor_config

DAILY = cron_monitor_config("0 6 * * *")
NOW = datetime(2026, 11, 18, 12, 0, tzinfo=UTC)
BOOT = NOW - timedelta(days=3)


class _FakeScope:
    def __init__(self) -> None:
        self.tags: dict[str, str] = {}
        self.extras: dict[str, Any] = {}
        self.fingerprint: list[str] | None = None

    def set_tag(self, k: str, v: str) -> None:
        self.tags[k] = v

    def set_extra(self, k: str, v: Any) -> None:
        self.extras[k] = v

    def __enter__(self) -> _FakeScope:
        return self

    def __exit__(self, *a: object) -> None:
        return None


class _FakeSentry:
    """Stands in for sentry_sdk: records what report_ops_alert sends."""

    def __init__(self, active: bool) -> None:
        self.active = active
        self.events: list[tuple[str, str, _FakeScope]] = []
        self._scope = _FakeScope()

    def get_client(self) -> Any:
        active = self.active

        class _C:
            def is_active(self) -> bool:
                return active

        return _C()

    def new_scope(self) -> _FakeScope:
        self._scope = _FakeScope()
        return self._scope

    def capture_message(self, message: str, level: str) -> str:
        self.events.append((message, level, self._scope))
        return "evt"


@pytest.fixture
def fake_sentry(monkeypatch):
    fake = _FakeSentry(active=True)
    monkeypatch.setattr(ops_alert, "sentry_sdk", fake)
    return fake


def test_event_carries_tag_fingerprint_and_extra(fake_sentry):
    assert ops_alert.report_ops_alert(
        "job-stale", "daily-a", "job daily-a overdue", {"last_ok": "x"}
    )
    (message, level, scope) = fake_sentry.events[0]
    assert message == "job daily-a overdue"
    assert level == "warning"
    assert scope.tags[ops_alert.OPS_ALERT_TAG] == "job-stale"
    assert scope.fingerprint == ["ops-alert", "job-stale", "daily-a"]
    assert scope.extras["last_ok"] == "x"


def test_inactive_client_sends_nothing_and_says_so(fake_sentry):
    fake_sentry.active = False
    assert ops_alert.report_ops_alert("job-stale", "k", "m") is False
    assert fake_sentry.events == []


def test_never_raises(monkeypatch):
    class _Broken:
        def get_client(self) -> Any:
            raise RuntimeError("sdk broken")

    monkeypatch.setattr(ops_alert, "sentry_sdk", _Broken())
    assert ops_alert.report_ops_alert("job-stale", "k", "m") is False


def test_explicit_fingerprint_gives_each_key_its_own_budget_bucket():
    # The before_send burst cap keys on _event_fingerprint. Two slugs must not
    # share one bucket (the MEH-3515 failure shape).
    from app.sentry import _event_fingerprint

    a = {"fingerprint": ["ops-alert", "job-stale", "a"], "message": "m"}
    b = {"fingerprint": ["ops-alert", "job-stale", "b"], "message": "m"}
    assert _event_fingerprint(a) != _event_fingerprint(b)


def _ok(db, slug: str, when: datetime) -> None:
    db.add(AdminSetting(key=f"job_ok:{slug}", value=when.isoformat()))
    db.commit()


@pytest.fixture
def mails(monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(settings, "admin_email", "admin@example.com")
    monkeypatch.setattr(
        email_mod, "send_email", lambda to, subject, body, **_: sent.append(subject)
    )
    return sent


def test_overdue_job_goes_to_sentry_not_email(db, fake_sentry, mails):
    _ok(db, "daily-a", NOW - timedelta(hours=30))
    jobs = [("daily-a", DAILY)]
    job_staleness.check_jobs(jobs, booted_at=BOOT, now=NOW)
    job_staleness.check_jobs(jobs, booted_at=BOOT, now=NOW)  # same Israel day
    assert mails == []
    assert len(fake_sentry.events) == 1
    assert fake_sentry.events[0][2].fingerprint == ["ops-alert", "job-stale", "daily-a"]


def test_overdue_job_emails_when_sentry_is_off(db, fake_sentry, mails):
    fake_sentry.active = False
    _ok(db, "daily-a", NOW - timedelta(hours=30))
    job_staleness.check_jobs([("daily-a", DAILY)], booted_at=BOOT, now=NOW)
    assert len(mails) == 1 and "daily-a" in mails[0]
    assert fake_sentry.events == []


# --- page freshness digest (0 / 1 / many stale pages) -----------------------


@pytest.fixture
def digest(monkeypatch, fake_sentry):
    from app.services import page_freshness_digest as dg

    calls: list[str] = []
    monkeypatch.setattr(
        dg, "send_email", lambda to, subject, body, **_: calls.append(subject)
    )
    monkeypatch.setattr(dg.settings, "admin_email", "admin@example.com")
    monkeypatch.setattr(dg, "freshness_enabled", lambda: True)
    # report_ops_alert is imported by name into the digest module; it reads
    # ops_alert.sentry_sdk at call time, so the fake above applies.
    return dg, calls


SUNDAY = datetime(2026, 11, 22, 9, 0, tzinfo=UTC)  # Sunday in Israel


def _pages(dg, n: int):
    return [
        dg.StalePage(name=f"עסק {i}", city=None, days=70 + i, has_owner_email=True)
        for i in range(n)
    ]


@pytest.mark.parametrize("count", [1, 3])
def test_stale_digest_goes_to_sentry_not_email(
    db, monkeypatch, digest, fake_sentry, count
):
    dg, calls = digest
    monkeypatch.setattr(dg, "find_stale", lambda _db, _now: _pages(dg, count))
    assert dg.send_stale_digest(db, now=SUNDAY) == count
    assert calls == []
    assert len(fake_sentry.events) == 1
    scope = fake_sentry.events[0][2]
    assert scope.tags[ops_alert.OPS_ALERT_TAG] == "pages-stale"
    assert len(scope.extras["pages"]) == count


def test_no_stale_pages_sends_nothing_anywhere(db, monkeypatch, digest, fake_sentry):
    dg, calls = digest
    monkeypatch.setattr(dg, "find_stale", lambda _db, _now: [])
    assert dg.send_stale_digest(db, now=SUNDAY) == 0
    assert calls == [] and fake_sentry.events == []


def test_stale_digest_emails_when_sentry_is_off(db, monkeypatch, digest, fake_sentry):
    dg, calls = digest
    fake_sentry.active = False
    monkeypatch.setattr(dg, "find_stale", lambda _db, _now: _pages(dg, 2))
    assert dg.send_stale_digest(db, now=SUNDAY) == 2
    assert len(calls) == 1 and fake_sentry.events == []
