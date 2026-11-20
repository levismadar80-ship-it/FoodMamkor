"""MEH-3515: Sentry cron check-ins must never be counted by the error budget.

sentry-sdk 2.75.0 (backend/pyproject.toml:30) hands EVERY non-transaction
event to ``before_send`` — check-ins included (``client.py`` ``_prepare_event``
skips the hook only for ``type == "transaction"``). A check-in carries no
exception, no logentry, no logger and no transaction, so
``_event_fingerprint`` gave every check-in of every slug the SAME key, and the
MEH-2114 burst cap (3 per 6 h) dropped all but the first three. In production
the 2-minute ``product-orders-tick`` spent those three within minutes of each
deploy, so ``auto-reply-watchdog`` reported ``ok`` once after a restart and
``missed`` for the next six hours (MEHAMAKOR-BACKEND-27).

Like test_meh2114_sentry_budget.py, no ``sentry_sdk`` import: the SDK is not
installed in the CC sandbox and a skip is not green. The event shape below is
what ``sentry_sdk.crons.capture_checkin`` builds (``crons/api.py``
``_create_check_in_event``) after the client adds its defaults.
"""

import pytest

from app.sentry import BURST_LIMIT, _burst_state, _reset_budget_state, before_send


@pytest.fixture(autouse=True)
def _clean_budget_state():
    _reset_budget_state()
    yield
    _reset_budget_state()


def _checkin_event(slug="auto-reply-watchdog", status="ok"):
    return {
        "type": "check_in",
        "monitor_slug": slug,
        "check_in_id": "0" * 32,
        "status": status,
        "duration": 0.02,
        "environment": "production",
        "release": "721a9891907cead809e814e6a7b0a3f55666af2a",
        "monitor_config": {
            "schedule": {"type": "interval", "value": 5, "unit": "minute"},
            "checkin_margin": 5,
            "max_runtime": 30,
        },
        "platform": "python",
        "event_id": "1" * 32,
    }


def test_every_watchdog_checkin_passes_far_beyond_the_burst_limit():
    # 72 = six hours of a 5-minute monitor: the whole window the cap used to
    # black out. The old code let exactly BURST_LIMIT through.
    passed = sum(before_send(_checkin_event()) is not None for _ in range(72))
    assert passed == 72


def test_a_chatty_slug_cannot_starve_the_watchdog():
    # The production sequence after a deploy: product-orders-tick (2 min)
    # fires before the watchdog (5 min) and used to spend the shared budget.
    for _ in range(BURST_LIMIT * 10):
        before_send(_checkin_event(slug="product-orders-tick"))
    assert before_send(_checkin_event()) is not None


def test_checkins_do_not_consume_the_error_budget():
    for _ in range(BURST_LIMIT * 5):
        before_send(_checkin_event())
    assert _burst_state == {}


def test_the_checkin_is_returned_unchanged():
    event = _checkin_event(status="error")
    expected = dict(event)
    assert before_send(event) == expected


def test_a_message_less_error_event_is_still_capped():
    # The bypass is keyed on type == "check_in", not on "has no fingerprint
    # signals": an empty non-check-in event keeps the MEH-2114 budget.
    passed = sum(before_send({"level": "error"}) is not None for _ in range(10))
    assert passed == BURST_LIMIT
