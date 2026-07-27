"""
MEH-1613 — a swallowed email failure becomes observable, without any caller
contract changing.

`send_email` has three swallow points (empty recipient, no API key, Resend
raised). Before this ticket they were silent, DEBUG, and WARNING respectively,
so an expired RESEND_API_KEY meant every email vanished with no alert at all.

What these tests lock, per swallow point:
  1. the return value and the no-raise guarantee are UNCHANGED (fail-open),
  2. Sentry is notified via capture_background_exception,
  3. an ERROR log is emitted,
  4. no full email address ever reaches a log line.

Plus two structural guarantees that are easy to regress:
  - the reporting path itself can never raise into the caller,
  - the missing-key Sentry report is latched to once per process while the
    ERROR log still fires every time.

`capture_background_exception` is monkeypatched at the `email` module surface
(the name it was imported into), the same technique
tests/test_onboarding_followup.py uses for `send_email`.
"""

from __future__ import annotations

import logging

import pytest

from app.services import email as email_mod

RECIPIENT = "someone@example.com"
LOCAL_PART = "someone"
SUBJECT = "Verify your email"


@pytest.fixture(autouse=True)
def _reset_latch():
    """`_missing_key_reported` is module state and would leak between tests.

    Uses setattr rather than direct assignment so the fixture also sets up
    against a build predating the latch (see the note in `captures`).
    """
    setattr(email_mod, "_missing_key_reported", False)
    yield
    setattr(email_mod, "_missing_key_reported", False)


@pytest.fixture
def captures(monkeypatch):
    """Spy on capture_background_exception. Returns the list of (exc, task)."""
    seen: list[tuple[BaseException, str]] = []

    def fake_capture(exc, *, task):
        seen.append((exc, task))

    # raising=False on purpose: against a build where the module does not yet
    # import capture_background_exception, this fixture must still set up so the
    # tests RUN and fail on their assertions. With raising=True they would error
    # at setup instead, which proves only that a symbol is missing — not that
    # the tests detect the silent-failure behaviour they exist to catch.
    monkeypatch.setattr(
        email_mod, "capture_background_exception", fake_capture, raising=False
    )
    return seen


def _no_key(monkeypatch):
    monkeypatch.setattr(email_mod.settings, "resend_api_key", "", raising=False)


def _with_key(monkeypatch):
    monkeypatch.setattr(
        email_mod.settings, "resend_api_key", "re_test_key", raising=False
    )


def _explode_on_send(monkeypatch, exc=RuntimeError("resend 500")):
    """Force swallow point 3 by making the lazy `import resend` fail."""
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *a, **kw):
        if name == "resend":
            raise exc
        return real_import(name, *a, **kw)

    monkeypatch.setattr(builtins, "__import__", fake_import)


# --- the contract is unchanged (the whole point of the ticket) --------------


@pytest.mark.parametrize(
    "setup",
    ["empty_recipient", "no_api_key", "send_failed"],
    ids=["empty-recipient", "no-api-key", "send-failed"],
)
def test_returns_none_and_never_raises_on_every_swallow_point(
    monkeypatch, captures, setup
):
    """Fail-open is the load-bearing property: every path still returns None
    and still does not raise. If this breaks, ~20 call sites break with it."""
    to = RECIPIENT
    if setup == "empty_recipient":
        to = ""
        _with_key(monkeypatch)
    elif setup == "no_api_key":
        _no_key(monkeypatch)
    else:
        _with_key(monkeypatch)
        _explode_on_send(monkeypatch)

    assert email_mod.send_email(to, SUBJECT, "body") is None


def test_signature_is_unchanged(monkeypatch, captures):
    """Guards the ticket's hard constraint — no caller may need editing."""
    import inspect

    sig = inspect.signature(email_mod.send_email)
    assert list(sig.parameters) == ["to", "subject", "body", "html"]
    assert sig.return_annotation in (None, "None")


# --- Sentry is notified -----------------------------------------------------


def test_send_failure_reports_to_sentry_once(monkeypatch, captures):
    _with_key(monkeypatch)
    _explode_on_send(monkeypatch)

    email_mod.send_email(RECIPIENT, SUBJECT, "body")

    assert len(captures) == 1, "the Resend failure must produce exactly one capture"
    exc, task = captures[0]
    assert task == "email_send"
    assert isinstance(exc, BaseException)


def test_empty_recipient_reports_to_sentry(monkeypatch, captures):
    _with_key(monkeypatch)

    email_mod.send_email("", SUBJECT, "body")

    assert len(captures) == 1
    assert captures[0][1] == "email_send"


def test_missing_key_reports_to_sentry(monkeypatch, captures):
    _no_key(monkeypatch)

    email_mod.send_email(RECIPIENT, SUBJECT, "body")

    assert len(captures) == 1
    assert captures[0][1] == "email_send"


def test_missing_key_sentry_report_is_latched_but_log_is_not(
    monkeypatch, captures, caplog
):
    """Static config, not a per-send event: Sentry hears it once per process,
    the ERROR log fires every time so nothing goes invisible."""
    _no_key(monkeypatch)

    with caplog.at_level(logging.ERROR, logger=email_mod.logger.name):
        for _ in range(4):
            email_mod.send_email(RECIPIENT, SUBJECT, "body")

    assert len(captures) == 1, "Sentry must be notified once, not four times"
    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert len(errors) == 4, "every suppressed send must still log at ERROR"


# --- an ERROR log is emitted ------------------------------------------------


@pytest.mark.parametrize(
    "setup,stage",
    [
        ("empty_recipient", "empty-recipient"),
        ("no_api_key", "no-api-key"),
        ("send_failed", "send-failed"),
    ],
)
def test_error_log_emitted_with_stage(monkeypatch, captures, caplog, setup, stage):
    to = RECIPIENT
    if setup == "empty_recipient":
        to = ""
        _with_key(monkeypatch)
    elif setup == "no_api_key":
        _no_key(monkeypatch)
    else:
        _with_key(monkeypatch)
        _explode_on_send(monkeypatch)

    with caplog.at_level(logging.ERROR, logger=email_mod.logger.name):
        email_mod.send_email(to, SUBJECT, "body")

    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert errors, f"{stage} must log at ERROR, not DEBUG/WARNING"
    assert any(stage in r.getMessage() for r in errors), (
        f"the log must name the stage {stage!r} so the three swallow points "
        f"are distinguishable; got {[r.getMessage() for r in errors]}"
    )


# --- privacy: no full address, no local part --------------------------------


@pytest.mark.parametrize(
    "setup", ["no_api_key", "send_failed"], ids=["no-api-key", "send-failed"]
)
def test_no_full_address_or_local_part_in_logs(monkeypatch, captures, caplog, setup):
    """The pre-MEH-1613 lines logged the address in FULL (:28 and :55). The
    success line printed the local part with the domain masked — the wrong
    half. Neither may come back."""
    if setup == "no_api_key":
        _no_key(monkeypatch)
    else:
        _with_key(monkeypatch)
        _explode_on_send(monkeypatch)

    with caplog.at_level(logging.DEBUG, logger=email_mod.logger.name):
        email_mod.send_email(RECIPIENT, SUBJECT, "body")

    blob = " ".join(r.getMessage() for r in caplog.records)
    assert RECIPIENT not in blob, "full address leaked into a log line"
    assert LOCAL_PART not in blob, "local part leaked into a log line"
    assert "***@example.com" in blob, "the domain-only mask should be present"


def test_success_log_is_also_domain_masked(monkeypatch, captures, caplog):
    """Not a swallow point, but it rendered the local part — same privacy bar."""
    _with_key(monkeypatch)
    sent = {}

    class FakeEmails:
        @staticmethod
        def send(params):
            sent.update(params)

    import sys
    import types

    fake = types.ModuleType("resend")
    fake.Emails = FakeEmails
    fake.api_key = None
    monkeypatch.setitem(sys.modules, "resend", fake)

    with caplog.at_level(logging.INFO, logger=email_mod.logger.name):
        email_mod.send_email(RECIPIENT, SUBJECT, "body")

    assert sent, "the send should have gone through on the happy path"
    blob = " ".join(r.getMessage() for r in caplog.records)
    assert LOCAL_PART not in blob
    assert "***@example.com" in blob


# --- the reporting path itself must never break the caller ------------------


def test_caller_is_unaffected_when_sentry_capture_itself_raises(monkeypatch, caplog):
    """A reporting call that raised would turn a silent failure into a loud
    outage — strictly worse than the bug this ticket fixes."""

    def exploding_capture(exc, *, task):
        raise RuntimeError("sentry transport is down")

    monkeypatch.setattr(email_mod, "capture_background_exception", exploding_capture)
    _with_key(monkeypatch)
    _explode_on_send(monkeypatch)

    assert email_mod.send_email(RECIPIENT, SUBJECT, "body") is None


def test_reporting_never_raises_when_logging_itself_raises(monkeypatch):
    """Covers the half of _report's guard that the Sentry helper's own
    try/except does not: the logging call and the string formatting."""

    def exploding_error(*a, **kw):
        raise RuntimeError("log handler exploded")

    monkeypatch.setattr(email_mod.logger, "error", exploding_error)
    _with_key(monkeypatch)
    _explode_on_send(monkeypatch)

    assert email_mod.send_email(RECIPIENT, SUBJECT, "body") is None


# --- the Sentry payload class is never raised -------------------------------


def test_email_not_sent_is_never_raised(monkeypatch, captures):
    """_EmailNotSent exists only as a typed Sentry payload for the two
    non-exception swallow points. If it ever escapes, fail-open is broken."""
    _no_key(monkeypatch)

    try:
        result = email_mod.send_email(RECIPIENT, SUBJECT, "body")
    except email_mod._EmailNotSent:  # pragma: no cover — the regression
        pytest.fail("_EmailNotSent escaped send_email; fail-open is broken")

    assert result is None
    assert isinstance(captures[0][0], email_mod._EmailNotSent)
