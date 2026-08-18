"""
MEH-2122 Chunk A — a failed WhatsApp send is findable in the logs.

WHAT WAS WRONG. `_log_result` logged every send failure at WARNING. The
producer-facing consequence is in `producer_me.py:1301`, which discards the
`_send_whatsapp_otp` boolean and returns `{"detail": "קוד נשלח"}` on every
outcome — so a producer whose OTP never left the building sees success,
cannot verify her phone, and can never pass the submission gate
(`submission_gate.py` requires `phone_verified`). Nothing anywhere reports it.

WHY THE LEVEL IS THE FIX AND NOT A COSMETIC. Two consumers read it:

  * Railway logs — the immediate value. ERROR is filterable; WARNING sits in
    the same band as routine chatter, so "did her code go out?" is not a
    question anyone can answer after the fact.
  * Sentry — the sibling. `sentry.py:110` records that sentry-sdk's default
    LoggingIntegration is active, and its `event_level` default is ERROR. A
    WARNING is therefore a breadcrumb and never becomes an issue. The same
    failure class in the EMAIL service is loud in production — 670 events for
    the Resend ValidationError alone — precisely because `email.py` logs it at
    ERROR (`sentry.py:118` says so outright). Same repo, same shape of
    outbound-send failure, opposite visibility, one log level apart.

    That Sentry half is deferred, not immediate: the org's quota was exhausted
    in early August (MEH-2114) and resets ~2026-09-02. The Railway half is
    live the moment this merges.

SCOPE. Chunk A is the level on the failure branch, nothing else. The response
shape stays `{"detail": "קוד נשלח"}` (that is Chunk B, and it drags retry UX
with it). `_persist_outbound`'s own best-effort WARNING is a different concern
and is deliberately untouched.

DISCRIMINATION (workflow rule, MEH-1619/MEH-1930). Every assertion below was
run against the unmodified `logger.warning` build first:
  * failure-is-ERROR (both cases) -> FAILED on WARNING. These are the guard.
  * success-stays-INFO            -> passed before and after. Kept anyway: it
    is falsifiable by the plausible wrong fix (raising the whole function to
    ERROR, which would drown the signal in successes), so it is a real check
    and not decoration.
  * masking                       -> passed before and after. Kept because it
    guards the exact line being edited: a reformatted log call is where a raw
    phone number gets reintroduced.
"""

from __future__ import annotations

import logging

import pytest

from app.services import whatsapp as wa

LOGGER_NAME = "app.services.whatsapp"
PHONE = "+972501234567"
KIND = "template[producer_otp_v1]"


def _records(caplog):
    return [r for r in caplog.records if r.name == LOGGER_NAME]


# --- the guard: a failed send is an ERROR -----------------------------------


def test_failed_send_logs_at_error(caplog):
    """Hand-built failure result — the simplest statement of the contract."""
    result = wa.WhatsAppSendResult(
        outcome=wa.OUTCOME_FAILED,
        ok=False,
        error_code=131047,
        error_message="Re-engagement message",
        http_status=400,
    )
    with caplog.at_level(logging.DEBUG, logger=LOGGER_NAME):
        wa._log_result(KIND, PHONE, result)

    recs = _records(caplog)
    assert len(recs) == 1, f"expected exactly one log record, got {len(recs)}"
    assert recs[0].levelno == logging.ERROR, (
        "a failed WhatsApp send must log at ERROR — at WARNING it is invisible "
        "to Sentry's LoggingIntegration (event_level=ERROR) and unfilterable "
        "in Railway logs"
    )


def test_graph_200_carrying_an_error_logs_at_error(caplog):
    """The silent one, routed through the REAL classifier.

    Meta returns HTTP 200 with an `error` object for a send it will not
    deliver. `_classify` already gets this right (`ok=False`) — the defect was
    only that the resulting log was inaudible. Building the result via
    `_classify` rather than by hand means this case cannot drift away from the
    shape the service actually produces.
    """
    body = {
        "error": {
            "code": 131047,
            "message": "Re-engagement message",
            "type": "OAuthException",
        }
    }
    result = wa._classify(200, body)
    assert result.ok is False, "precondition: a 200 carrying an error is a failure"

    with caplog.at_level(logging.DEBUG, logger=LOGGER_NAME):
        wa._log_result(KIND, PHONE, result)

    recs = _records(caplog)
    assert len(recs) == 1
    assert recs[0].levelno == logging.ERROR


# --- the other direction: success must NOT become noise ---------------------


def test_accepted_send_stays_info(caplog):
    """Falsifiable by the over-shooting fix (raise the whole function to
    ERROR), which would bury real failures under every successful send."""
    result = wa._classify(200, {"messages": [{"id": "wamid.TEST"}]})
    assert result.ok is True

    with caplog.at_level(logging.DEBUG, logger=LOGGER_NAME):
        wa._log_result(KIND, PHONE, result)

    recs = _records(caplog)
    assert len(recs) == 1
    assert recs[0].levelno == logging.INFO


# --- the line being edited must not leak PII --------------------------------


@pytest.mark.parametrize("ok", [True, False], ids=["accepted", "failed"])
def test_log_never_contains_the_full_phone_number(caplog, ok):
    result = (
        wa._classify(200, {"messages": [{"id": "wamid.TEST"}]})
        if ok
        else wa._classify(200, {"error": {"code": 131047, "message": "nope"}})
    )
    with caplog.at_level(logging.DEBUG, logger=LOGGER_NAME):
        wa._log_result(KIND, PHONE, result)

    rendered = "\n".join(r.getMessage() for r in _records(caplog))
    assert PHONE not in rendered
    assert "0501234567" not in rendered
    assert "***4567" in rendered
