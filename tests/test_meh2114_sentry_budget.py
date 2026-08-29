"""MEH-2114: unit tests for the SDK-side Sentry event budget.

Pure unit tests on the hook functions in ``backend/app/sentry.py`` — no DB,
no FastAPI client, no live Sentry, and deliberately **no ``sentry_sdk``
import**. The SDK is pinned (``backend/pyproject.toml:30``) but is not
installed in the CC sandbox, so a test that imported it would SKIP here — and
per MEH-2114's verification step a skip is not green. Every test in this file
runs everywhere.

Time is injected (``now=``) rather than slept, so the 6-hour window is
exercised deterministically in microseconds.
"""

import pytest

from app.sentry import (
    BURST_LIMIT,
    BURST_WINDOW_SECONDS,
    MAX_TRACKED_FINGERPRINTS,
    NOISY_SAMPLE_RATE,
    _burst_allow,
    _burst_state,
    _drop_reason,
    _event_fingerprint,
    _is_noisy,
    _reset_budget_state,
    before_send,
    error_sampler,
)


@pytest.fixture(autouse=True)
def _clean_budget_state():
    """Each test starts from an empty counter."""
    _reset_budget_state()
    yield
    _reset_budget_state()


def _exc_event(
    exc_type="RecursionError",
    module="app.routers.producers",
    function="by_slug",
    lineno=142,
    transaction="/producers/by-slug/{slug}",
):
    """An exception event as sentry-sdk hands it to before_send."""
    return {
        "transaction": transaction,
        "exception": {
            "values": [
                {
                    "type": exc_type,
                    "value": "maximum recursion depth exceeded",
                    "stacktrace": {
                        "frames": [
                            {
                                "module": module,
                                "function": function,
                                "lineno": lineno,
                            }
                        ]
                    },
                }
            ]
        },
    }


def _log_event(logger_name="app.services.email", message="[EMAIL] NOT SENT (%s) to %s"):
    """A LoggingIntegration event — a log record, no exception payload."""
    return {
        "transaction": "/auth/register",
        "logger": logger_name,
        "logentry": {"message": message, "params": ["send-failed", "***@example.com"]},
    }


# ---------------------------------------------------------------------------
# REQUIRED NEGATIVE TEST (a) — a FIRST occurrence is never suppressed.
# Without this, the change is indistinguishable from disabling Sentry.
# ---------------------------------------------------------------------------


def test_first_occurrence_of_new_fingerprint_is_never_dropped():
    """The single most important assertion in this file."""
    for i in range(50):
        event = _exc_event(exc_type=f"BrandNewError{i}", lineno=1000 + i)
        assert before_send(event) is event, f"first occurrence #{i} was suppressed"


def test_first_occurrence_is_never_sampled_out():
    """error_sampler must return 1.0 for a fingerprint it has never seen."""
    for i in range(50):
        event = _exc_event(exc_type=f"BrandNewError{i}", lineno=2000 + i)
        assert error_sampler(event) == 1.0


def test_first_occurrence_survives_even_while_another_fingerprint_is_saturated():
    """A noisy neighbour must not consume a new fingerprint's budget."""
    noisy = _exc_event(exc_type="RecursionError")
    for _ in range(BURST_LIMIT + 200):
        before_send(noisy)
    assert before_send(noisy) is None  # the loud one is capped...

    fresh = _exc_event(exc_type="ValueError", module="app.routers.orders", lineno=7)
    assert before_send(fresh) is fresh  # ...the new one is not
    assert error_sampler(fresh) == 1.0


def test_first_occurrence_after_window_rollover_is_not_suppressed():
    """A fingerprint whose window expired is treated as new again."""
    event = _exc_event()
    t0 = 1_000.0
    for _ in range(BURST_LIMIT + 10):
        _burst_allow(_event_fingerprint(event), now=t0)
    assert _burst_allow(_event_fingerprint(event), now=t0) is False

    later = t0 + BURST_WINDOW_SECONDS + 1
    assert _burst_allow(_event_fingerprint(event), now=later) is True


# ---------------------------------------------------------------------------
# REQUIRED NEGATIVE TEST (b) — an exception INSIDE before_send must not kill
# reporting. Trap 1: without debug=True the SDK silently discards the raise
# and ALL reporting dies with no signal.
# ---------------------------------------------------------------------------


def test_before_send_fails_open_when_internals_raise(monkeypatch):
    """An internal explosion returns the event UNCHANGED, never None."""

    def _boom(*_args, **_kwargs):
        raise RuntimeError("simulated internal failure inside before_send")

    monkeypatch.setattr("app.sentry._event_fingerprint", _boom)
    event = _exc_event()
    assert before_send(event) is event


def test_before_send_fails_open_when_drop_check_raises(monkeypatch):
    """The other internal call site is covered too, not just one of them."""

    def _boom(*_args, **_kwargs):
        raise RuntimeError("simulated internal failure in _drop_reason")

    monkeypatch.setattr("app.sentry._drop_reason", _boom)
    event = _exc_event()
    assert before_send(event) is event


def test_before_send_fails_open_on_malformed_event():
    """Real-world defence: a shape the parser did not anticipate."""
    for malformed in (
        {"exception": "not-a-dict"},
        {"exception": {"values": "not-a-list"}},
        {"fingerprint": object()},
    ):
        assert before_send(malformed) is malformed


def test_error_sampler_fails_open_at_full_rate(monkeypatch):
    """The sampler's failure mode is 'report it', not 'lose it'."""

    def _boom(*_args, **_kwargs):
        raise RuntimeError("simulated internal failure inside error_sampler")

    monkeypatch.setattr("app.sentry._event_fingerprint", _boom)
    assert error_sampler(_exc_event()) == 1.0


# ---------------------------------------------------------------------------
# Burst cap: first N pass, the rest are dropped.
# ---------------------------------------------------------------------------


def test_exactly_burst_limit_events_pass_then_the_rest_drop():
    event = _exc_event()
    passed = sum(1 for _ in range(500) if before_send(event) is not None)
    assert passed == BURST_LIMIT, f"expected exactly {BURST_LIMIT}, got {passed}"


def test_budget_is_per_fingerprint_not_global():
    """Two distinct fingerprints each get their own full allowance."""
    a = _exc_event(exc_type="RecursionError", lineno=10)
    b = _exc_event(exc_type="RecursionError", lineno=20)
    passed_a = sum(1 for _ in range(100) if before_send(a) is not None)
    passed_b = sum(1 for _ in range(100) if before_send(b) is not None)
    assert passed_a == BURST_LIMIT
    assert passed_b == BURST_LIMIT


def test_window_rollover_grants_a_fresh_allowance():
    fp = _event_fingerprint(_exc_event())
    t0 = 5_000.0
    first = sum(1 for _ in range(100) if _burst_allow(fp, now=t0))
    second = sum(
        1 for _ in range(100) if _burst_allow(fp, now=t0 + BURST_WINDOW_SECONDS + 1)
    )
    assert first == BURST_LIMIT
    assert second == BURST_LIMIT


def test_measured_recursion_loop_is_capped_to_the_documented_ceiling():
    """The MEH-1906 loop: 3,267 events in one group became BURST_LIMIT."""
    event = _exc_event()
    passed = sum(1 for _ in range(3267) if before_send(event) is not None)
    assert passed == BURST_LIMIT


# ---------------------------------------------------------------------------
# error_sampler: rare at 1.0, known-noisy far lower.
# ---------------------------------------------------------------------------


def test_sampler_downgrades_a_fingerprint_only_after_it_blows_the_cap():
    event = _exc_event()
    assert error_sampler(event) == 1.0
    for _ in range(BURST_LIMIT):
        before_send(event)
    assert error_sampler(event) == 1.0, "still within budget — must stay at 1.0"
    before_send(event)  # this one blows the cap
    assert error_sampler(event) == NOISY_SAMPLE_RATE


def test_sampler_never_increments_the_counter():
    """Order-independence: only before_send consumes budget."""
    event = _exc_event()
    for _ in range(500):
        error_sampler(event)
    passed = sum(1 for _ in range(500) if before_send(event) is not None)
    assert passed == BURST_LIMIT


def test_noisy_flag_expires_with_the_window():
    fp = _event_fingerprint(_exc_event())
    t0 = 9_000.0
    for _ in range(BURST_LIMIT + 1):
        _burst_allow(fp, now=t0)
    assert _is_noisy(fp, now=t0) is True
    assert _is_noisy(fp, now=t0 + 2 * BURST_WINDOW_SECONDS + 1) is False


# ---------------------------------------------------------------------------
# The /auth/register double-report: ONE report, the one with the stack trace.
# ---------------------------------------------------------------------------


def test_email_log_twin_is_dropped():
    """MEHAMAKOR-BACKEND-M — the stack-trace-less copy."""
    twin = _log_event()
    assert _drop_reason(twin) == "duplicate-log-twin"
    assert before_send(twin) is None
    assert error_sampler(twin) == 0.0


def test_email_exception_with_stack_trace_is_kept():
    """MEHAMAKOR-BACKEND-N — the report we keep. THIS is the discriminator.

    A filter that dropped both would look identical to a passing dedupe test
    while silently deleting the only diagnosable report.
    """
    kept = _exc_event(
        exc_type="ValidationError",
        module="app.services.email",
        function="send_email",
        lineno=161,
        transaction="/auth/register",
    )
    assert _drop_reason(kept) is None
    assert before_send(kept) is kept
    assert error_sampler(kept) == 1.0


def test_the_pair_collapses_to_exactly_one_report():
    """End-to-end: one underlying failure, one Sentry event."""
    exception_twin = _exc_event(
        exc_type="ValidationError",
        module="app.services.email",
        function="send_email",
        lineno=161,
        transaction="/auth/register",
    )
    log_twin = _log_event()
    reported = [
        e for e in (exception_twin, log_twin) if before_send(e) is not None
    ]
    assert len(reported) == 1
    assert reported[0] is exception_twin


def test_unrelated_error_from_the_email_logger_is_kept():
    """The drop is bound to the message it was written for, not to the module.

    Matching on logger name alone would silently swallow any FUTURE
    non-exception ERROR added to app.services.email — including one with no
    paired capture_exception, which would then reach Sentry never. Raised by
    the adversarial reviewer on PR #2994.
    """
    future = _log_event(message="[EMAIL] quota exceeded for provider %s")
    assert _drop_reason(future) is None
    assert before_send(future) is future
    assert error_sampler(future) == 1.0


def test_throttled_no_api_key_log_is_still_dropped():
    """email.py:146 — the throttled branch of the _missing_key_reported latch.

    Dropping it is correct and is the latch's own stated intent: Sentry was
    already notified once per process by email.py:126. Before this filter,
    LoggingIntegration captured this branch too, so the latch was emitting an
    event per send — the opposite of what its comment claims.
    """
    throttled = _log_event(
        message="[EMAIL] NOT SENT (no-api-key) to %s — subject=%r "
        "(Sentry already notified once this process)"
    )
    assert _drop_reason(throttled) == "duplicate-log-twin"
    assert before_send(throttled) is None


def test_log_events_from_other_loggers_are_untouched():
    """The drop is keyed on ONE logger, not on log events in general."""
    other = _log_event(logger_name="app.routers.auth", message="something else")
    assert _drop_reason(other) is None
    assert before_send(other) is other


def test_email_logger_event_that_carries_an_exception_is_kept():
    """Guard against over-matching: only the trace-less twin is redundant."""
    event = _exc_event(module="app.services.email", lineno=170)
    event["logger"] = "app.services.email"
    assert _drop_reason(event) is None
    assert before_send(event) is event


# ---------------------------------------------------------------------------
# seed_data IntegrityError — script noise, not a user flow.
# ---------------------------------------------------------------------------


def test_seed_data_integrity_error_is_dropped():
    event = _exc_event(
        exc_type="IntegrityError",
        module="seed_data",
        function="seed",
        lineno=442,
        transaction=None,
    )
    assert _drop_reason(event) == "seed-data-integrity"
    assert before_send(event) is None
    assert error_sampler(event) == 0.0


def test_seed_data_matched_by_filename_when_module_is_absent():
    event = {
        "exception": {
            "values": [
                {
                    "type": "IntegrityError",
                    "stacktrace": {
                        "frames": [
                            {
                                "filename": "/app/backend/seed_data.py",
                                "function": "seed",
                            }
                        ]
                    },
                }
            ]
        }
    }
    assert before_send(event) is None


def test_migration_failure_under_the_same_task_tag_is_kept():
    """The filter is NOT keyed on the db_init tag — a failing Alembic
    migration reports under that same tag and is real signal."""
    event = _exc_event(
        exc_type="OperationalError",
        module="alembic.runtime.migration",
        function="run_migrations",
        lineno=88,
    )
    event["tags"] = {"background_task": "db_init"}
    assert _drop_reason(event) is None
    assert before_send(event) is event


def test_non_seed_integrity_error_from_a_user_flow_is_kept():
    """A real IntegrityError on a request path must survive."""
    event = _exc_event(
        exc_type="IntegrityError",
        module="app.routers.orders",
        function="create_order",
        lineno=55,
        transaction="/orders",
    )
    assert _drop_reason(event) is None
    assert before_send(event) is event


# ---------------------------------------------------------------------------
# Fingerprinting + memory bound (trap 3).
# ---------------------------------------------------------------------------


def test_log_fingerprint_uses_the_format_string_not_the_params():
    """Otherwise every recipient would mint a new fingerprint and the cap
    would never bind — the exact failure this module prevents."""
    a = _log_event()
    b = _log_event()
    b["logentry"]["params"] = ["send-failed", "***@other-domain.com"]
    assert _event_fingerprint(a) == _event_fingerprint(b)


def test_distinct_recursion_groups_get_distinct_fingerprints():
    """The 5 measured RecursionError groups must not collapse into one."""
    fps = {_event_fingerprint(_exc_event(lineno=n)) for n in (10, 20, 30, 40, 50)}
    assert len(fps) == 5


def test_counter_dict_stays_bounded_under_unique_fingerprint_flood():
    """Trap 3: an unbounded counter is a memory leak."""
    for i in range(MAX_TRACKED_FINGERPRINTS * 3):
        before_send(_exc_event(exc_type=f"Unique{i}", lineno=i))
    assert len(_burst_state) <= MAX_TRACKED_FINGERPRINTS


def test_expired_buckets_are_evicted():
    t0 = 100.0
    for i in range(50):
        _burst_allow(f"fingerprint-{i}", now=t0)
    assert len(_burst_state) == 50
    _burst_allow("trigger-eviction", now=t0 + 2 * BURST_WINDOW_SECONDS + 1)
    assert len(_burst_state) == 1


# ---------------------------------------------------------------------------
# The budget arithmetic asserted as code, so a constant change moves it.
# ---------------------------------------------------------------------------


def test_documented_per_fingerprint_monthly_ceiling():
    """BURST_LIMIT per window => the ceiling quoted in the PR body."""
    windows_per_day = 24 * 60 * 60 / BURST_WINDOW_SECONDS
    per_fingerprint_per_month = BURST_LIMIT * windows_per_day * 30
    assert per_fingerprint_per_month == 360

    active_fingerprints_today = 6  # 5 RecursionError groups + 1 register email
    assert active_fingerprints_today * per_fingerprint_per_month == 2160
    assert active_fingerprints_today * per_fingerprint_per_month < 5000

    # Headroom: how many permanently-saturating fingerprints the quota funds.
    assert int(5000 // per_fingerprint_per_month) == 13
