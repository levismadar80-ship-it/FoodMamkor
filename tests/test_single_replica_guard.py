"""MEH-1319 — single-replica invariant boot guard.

Unit tests for the pure helper `_check_single_replica`. The helper reads the
worker-count env vars (WEB_CONCURRENCY / UVICORN_WORKERS) and returns a loud
message when a value parses to >1, None otherwise. Fail-open on unset/garbage.
"""

from app.startup import _WORKER_COUNT_ENV_VARS, _check_single_replica


def test_unset_returns_none():
    # Both vars absent — the platform default is a single worker.
    assert _check_single_replica({"WEB_CONCURRENCY": None, "UVICORN_WORKERS": None}) is None


def test_empty_dict_returns_none():
    assert _check_single_replica({}) is None


def test_one_worker_returns_none():
    assert _check_single_replica({"WEB_CONCURRENCY": "1"}) is None
    assert _check_single_replica({"UVICORN_WORKERS": "1"}) is None


def test_two_workers_web_concurrency_flags():
    msg = _check_single_replica({"WEB_CONCURRENCY": "2"})
    assert msg is not None
    assert "WEB_CONCURRENCY=2" in msg
    assert "duplicate APScheduler jobs" in msg


def test_two_workers_uvicorn_workers_flags():
    msg = _check_single_replica({"UVICORN_WORKERS": "4"})
    assert msg is not None
    assert "UVICORN_WORKERS=4" in msg
    # effective rate-limit multiplier is named
    assert "×4" in msg


def test_garbage_value_fails_open():
    # Unparseable → treated as "not >1", never blocks boot.
    assert _check_single_replica({"WEB_CONCURRENCY": "abc"}) is None
    assert _check_single_replica({"UVICORN_WORKERS": ""}) is None
    assert _check_single_replica({"WEB_CONCURRENCY": "2.5"}) is None


def test_whitespace_padded_value_parsed():
    assert _check_single_replica({"WEB_CONCURRENCY": " 3 "}) is not None


def test_zero_and_negative_return_none():
    # A count that is not strictly >1 is fine (0/1/negative all single-or-invalid).
    assert _check_single_replica({"WEB_CONCURRENCY": "0"}) is None
    assert _check_single_replica({"UVICORN_WORKERS": "-1"}) is None


def test_recognized_env_var_names():
    # Guards against a silent rename of the constant the lifespan iterates over.
    assert _WORKER_COUNT_ENV_VARS == ("WEB_CONCURRENCY", "UVICORN_WORKERS")


def test_first_offending_var_wins_when_both_set():
    # Iteration order follows the dict; both >1 still yields a single message.
    msg = _check_single_replica({"WEB_CONCURRENCY": "2", "UVICORN_WORKERS": "3"})
    assert msg is not None
    assert "WEB_CONCURRENCY=2" in msg
