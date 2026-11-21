"""MEH-3533 — the nightly backup reports every run to Sentry Crons.

Before: a failed backup was logged and nothing else; it surfaced only at the
weekly restore drill. Now each run sends in_progress, then ok or error, so a
failure (or a run that never happens) alerts the same night.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "backup_production_db.py"


@pytest.fixture()
def backup():
    spec = importlib.util.spec_from_file_location("backup_production_db", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DSN = "https://abc123@o42.ingest.us.sentry.io/4511354165264384"


def test_checkin_url_follows_sentry_http_format(backup):
    assert backup.checkin_url(DSN, "ok") == (
        "https://o42.ingest.us.sentry.io/api/4511354165264384/cron/"
        "production-db-backup/abc123/?status=ok"
    )


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "not a url",
        "https://o42.ingest.sentry.io/123",
        "https://k@host/notanumber",
        "file://k@host/123",
    ],
)
def test_malformed_dsn_gives_no_url(backup, bad):
    assert backup.checkin_url(bad, "ok") is None


class _Resp:
    status = 202

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _record(monkeypatch, backup, fail=False):
    sent: list[str] = []

    def fake_urlopen(url, timeout):
        if fail:
            raise OSError("network down")
        if isinstance(url, str):
            sent.append(url.rsplit("status=", 1)[1])
        else:  # urllib.request.Request — the failure event
            assert url.full_url.endswith("/api/4511354165264384/envelope/")
            assert "sentry_key=abc123" in url.headers["X-sentry-auth"]
            lines = url.data.decode().split("\n")
            assert '"type": "event"' in lines[1]
            assert "backup FAILED (exit" in lines[2]
            sent.append("event")
        return _Resp()

    monkeypatch.setattr(backup.urllib.request, "urlopen", fake_urlopen)
    return sent


def test_successful_backup_sends_in_progress_then_ok(monkeypatch, backup):
    monkeypatch.setenv("SENTRY_DSN", DSN)
    sent = _record(monkeypatch, backup)
    monkeypatch.setattr(backup, "run_backup", lambda: backup.EXIT_OK)
    assert backup.main() == backup.EXIT_OK
    assert sent == ["in_progress", "ok"]


@pytest.mark.parametrize(
    "code_name", ["EXIT_PG_DUMP_FAILED", "EXIT_UPLOAD_FAILED", "EXIT_CONFIG_ERROR"]
)
def test_failed_backup_sends_error_and_keeps_its_exit_code(
    monkeypatch, backup, code_name
):
    monkeypatch.setenv("SENTRY_DSN", DSN)
    sent = _record(monkeypatch, backup)
    code = getattr(backup, code_name)
    monkeypatch.setattr(backup, "run_backup", lambda: code)
    assert backup.main() == code
    assert sent == ["in_progress", "error", "event"]


def test_checkin_network_failure_does_not_fail_the_backup(monkeypatch, backup):
    monkeypatch.setenv("SENTRY_DSN", DSN)
    _record(monkeypatch, backup, fail=True)
    monkeypatch.setattr(backup, "run_backup", lambda: backup.EXIT_OK)
    assert backup.main() == backup.EXIT_OK


def test_no_dsn_sends_nothing_and_backup_still_runs(monkeypatch, backup):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    sent = _record(monkeypatch, backup)
    ran: list[bool] = []
    monkeypatch.setattr(
        backup, "run_backup", lambda: ran.append(True) or backup.EXIT_OK
    )
    assert backup.main() == backup.EXIT_OK
    assert ran == [True]
    assert sent == []


def test_unexpected_raise_still_reports_error_and_exits_nonzero(monkeypatch, backup):
    monkeypatch.setenv("SENTRY_DSN", DSN)
    sent = _record(monkeypatch, backup)

    def boom():
        raise RuntimeError("tempdir vanished")

    monkeypatch.setattr(backup, "run_backup", boom)
    assert backup.main() == backup.EXIT_UNEXPECTED
    assert sent == ["in_progress", "error", "event"]
