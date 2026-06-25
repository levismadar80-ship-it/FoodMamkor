"""Schemathesis property-based API fuzz suite — MEH-214.

Drives Hypothesis-generated requests through the FastAPI app's own
`openapi.json` (in-process ASGI — no network, no live server) and asserts
each response against the schema's default checks (no 5xx, status-code /
content-type / response-schema conformance). Two passes:

  * `test_fuzz_unauthenticated` — no credentials; **destructive admin
    DELETE endpoints are excluded** so a fuzzed call can never wipe
    real-looking rows. (The test DB is per-session-bootstrapped +
    truncated per test by conftest, so this is belt-and-suspenders.)
  * `test_fuzz_authenticated` — an admin JWT on every request. Admin
    DELETEs *are* fuzzed here, but only ever against random path-param
    ids (→ 404), against the isolated test DB.

Marked `@pytest.mark.fuzz` so it can be excluded locally
(`pytest -m "not fuzz"`); `max_examples` is env-tunable
(`FUZZ_MAX_EXAMPLES`, default 15) to keep the per-PR runtime bounded.

This suite is **a finder, not a fixer** (MEH-214): a failure here is a
FUZZ-NNN finding for morning triage, not a green-gate to silence — do NOT
weaken a check to make it pass.

Schemathesis is an opt-in dev dependency (see the PR body's Sapir-terminal
step). Until it lands in `uv.lock`, `importorskip` skips this whole module
so the default `pytest tests/` job stays green.
"""

import os

import pytest

schemathesis = pytest.importorskip("schemathesis")

# MEH-780: opt-in even once schemathesis lands in the env (MEH-214). The
# default `pytest tests/` job must NOT run this finder suite — it would red
# the required pytest gate for every PR (first run: 297 failures, mostly
# spec-completeness + the FUZZ-001..004 ledger in docs/audits/). Run it on
# demand / nightly with RUN_FUZZ=1. The importorskip above still skips when
# the dep is absent.
pytestmark = pytest.mark.skipif(
    not os.environ.get("RUN_FUZZ"),
    reason="opt-in property-based fuzz; run with RUN_FUZZ=1",
)

from hypothesis import HealthCheck, settings  # noqa: E402

import app.routers.auth as auth_router  # noqa: E402
from app.config import settings as app_settings  # noqa: E402
from app.main import app  # noqa: E402
from tests.conftest import auth_header, make_user  # noqa: E402

# Keep per-PR runtime controllable; override via FUZZ_MAX_EXAMPLES in CI.
FUZZ_MAX_EXAMPLES = int(os.environ.get("FUZZ_MAX_EXAMPLES", "15"))

# Build the schema once from the live app object (in-process ASGI).
schema = schemathesis.openapi.from_asgi("/openapi.json", app)

# Unauthenticated pass drops destructive admin DELETEs (AND-combined filter:
# method == DELETE AND path starts with /admin).
unauth_schema = schema.exclude(method="DELETE", path_regex="^/admin")

_fuzz_settings = settings(
    max_examples=FUZZ_MAX_EXAMPLES,
    deadline=None,
    # Function-scoped DB/admin fixtures are intentionally reused across
    # generated examples (table setup, not per-example state); and the ASGI
    # round-trip can be slow under coverage instrumentation.
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)


@pytest.fixture
def admin_headers(db):
    """A committed admin user's `Bearer` header — the app's request session
    sees it because conftest binds every session to the same test DB."""
    user = make_user(db, role="admin", email="fuzz-admin@example.com")
    return auth_header(user)


@pytest.fixture
def oauth_configured(monkeypatch):
    """MEH-786: make the fuzz env exercise the real 401 path, not the MEH-253
    unconfigured-503 branch (see tests/test_oauth_verify_4xx.py for the why)."""
    # client_ids set -> skip the "provider not configured" 503 guard;
    # verifiers stubbed to None -> handler's own 401, no live Google/Apple call.
    monkeypatch.setattr(app_settings, "google_client_id", "fuzz-google-client-id")
    monkeypatch.setattr(app_settings, "apple_client_id", "fuzz-apple-client-id")
    monkeypatch.setattr(auth_router, "_verify_google_token", lambda _id_token: None)
    monkeypatch.setattr(auth_router, "_verify_apple_token", lambda _id_token: None)


@pytest.mark.fuzz
@unauth_schema.parametrize()
@_fuzz_settings
def test_fuzz_unauthenticated(case, db, oauth_configured):
    case.call_and_validate()


@pytest.mark.fuzz
@schema.parametrize()
@_fuzz_settings
def test_fuzz_authenticated(case, db, admin_headers, oauth_configured):
    case.call_and_validate(headers=admin_headers)
