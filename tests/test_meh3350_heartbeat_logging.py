"""
Module:   test_meh3350_heartbeat_logging
Purpose:  Pin the two facts MEH-3350 established. (1) A check-in that fails to
          reach Sentry is LOGGED and still does not break the job — the defect
          was that it was swallowed in total silence. (2) The slug inventory in
          job_heartbeat is complete and partitioned, so a new @heartbeat cannot
          be added without someone deciding whether a monitor exists for it.
Does NOT: assert anything about Sentry's side. Whether a check-in is accepted
          depends on the account's plan and quota (MEH-3332), which no test here
          can see; that is what docs/audits/2026-11-sentry-crons.md records.
History:  MEH-3350 (creation, 17/11/2026).
"""

from __future__ import annotations

import ast
import pathlib

import pytest

from app.services import job_heartbeat

REPO = pathlib.Path(__file__).resolve().parents[1]
STARTUP = REPO / "backend" / "app" / "startup.py"


def _heartbeat_slugs_in_startup() -> set[str]:
    """Every slug passed to @heartbeat in startup.py, read from the AST.

    The AST and not a grep: a grep over `@heartbeat(` would also match the
    word inside a comment or a docstring, and this file's whole job is to be
    the thing that does not lie about coverage.
    """
    tree = ast.parse(STARTUP.read_text(encoding="utf-8"))
    slugs: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        for dec in node.decorator_list:
            if not isinstance(dec, ast.Call):
                continue
            name = dec.func.id if isinstance(dec.func, ast.Name) else getattr(dec.func, "attr", "")
            if name != "heartbeat" or not dec.args:
                continue
            first = dec.args[0]
            if isinstance(first, ast.Constant) and isinstance(first.value, str):
                slugs.add(first.value)
    return slugs


def test_the_probe_can_see_slugs_at_all() -> None:
    """The control. Every assertion below is about a SET; an empty set would
    satisfy «no slug is missing» and «no slug is extra» at the same time, so a
    broken parser would read as a clean bill of health. This runs first.
    """
    found = _heartbeat_slugs_in_startup()
    assert len(found) >= 5, (
        f"the AST walk found only {len(found)} @heartbeat slug(s) in {STARTUP}. "
        "Every result in this file is void, not passing — the decorator was "
        "probably renamed or moved."
    )
    assert "auto-reply-watchdog" in found, (
        "the one slug that definitely has a live monitor was not found, so the "
        "walk is looking in the wrong place"
    )


def test_every_heartbeat_slug_is_classified() -> None:
    """A new @heartbeat must land in MONITORED_SLUGS or UNMONITORED_SLUGS.

    This is the assertion that makes the gap visible. Without it, adding
    @heartbeat to a job reads as "now monitored" while six of seven slugs have
    no monitor in Sentry at all, so their silence raises nothing.
    """
    found = _heartbeat_slugs_in_startup()
    known = job_heartbeat.MONITORED_SLUGS | job_heartbeat.UNMONITORED_SLUGS
    unclassified = found - known
    assert not unclassified, (
        f"@heartbeat slug(s) with no entry in job_heartbeat: {sorted(unclassified)}. "
        "Add each to MONITORED_SLUGS (a monitor for it EXISTS in Sentry) or to "
        "UNMONITORED_SLUGS (it does not, so its silence alerts nobody). The "
        "Sentry plan allows a limited number — see MEH-3332."
    )
    stale = known - found
    assert not stale, (
        f"slug(s) listed in job_heartbeat but no longer decorating any job: {sorted(stale)}. "
        "Remove them, so the lists cannot drift into fiction."
    )


def test_the_two_lists_do_not_overlap() -> None:
    assert not (job_heartbeat.MONITORED_SLUGS & job_heartbeat.UNMONITORED_SLUGS)


def test_a_failed_checkin_is_logged_and_does_not_break_the_job(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """The regression. Before MEH-3350 this passed with ZERO log output."""
    monkeypatch.setenv("ENV", "production")

    def explode(**_: object) -> None:
        raise RuntimeError("429 rate limited by Sentry")

    monkeypatch.setattr(job_heartbeat, "_capture_checkin", explode)

    ran: list[str] = []

    @job_heartbeat.heartbeat(
        "auto-reply-watchdog", job_heartbeat.interval_monitor_config(5)
    )
    def job() -> None:
        ran.append("yes")

    with caplog.at_level("WARNING"):
        job()

    # The job still ran. That half was always true and must stay true.
    assert ran == ["yes"]
    # The half that was missing: there is now something to read.
    text = caplog.text
    assert "heartbeat_checkin_failed" in text, (
        "a check-in that could not be sent left no trace in the logs — this is "
        "exactly the MEH-3350 defect"
    )
    assert "auto-reply-watchdog" in text
    assert "429 rate limited by Sentry" in text, (
        "the log line must carry the underlying error, or it says only that "
        "something failed"
    )


def test_a_successful_checkin_logs_nothing(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Discrimination: the warning must not fire on the happy path, or it is
    noise and will be filtered out by whoever reads the logs.
    """
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setattr(job_heartbeat, "_capture_checkin", lambda **_: "id-1")

    @job_heartbeat.heartbeat(
        "auto-reply-watchdog", job_heartbeat.interval_monitor_config(5)
    )
    def job() -> None:
        return None

    with caplog.at_level("WARNING"):
        job()
    assert "heartbeat_checkin_failed" not in caplog.text
