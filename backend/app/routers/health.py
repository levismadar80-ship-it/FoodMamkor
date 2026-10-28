"""Health endpoints — MEH-483.

Three surfaces, single owner (workflow.md "two parallel mechanisms" rule):

- ``GET /health/liveness``   — process check, no DB call. 200 always when
  the worker is up. Cheap; safe for k8s/Railway liveness probes.
- ``GET /health/readiness``  — DB SELECT 1 + lifespan ``db_init_status`` +
  alembic head probe. 200 when ready to serve traffic, 503 otherwise.
- ``GET /health`` (alias)    — backwards-compat. Preserves the pre-MEH-483
  shape ``{"status":"ok","db_init":<state>}`` so the Railway healthcheck
  (currently pointed at ``/health`` per ``railway.json:8``) and existing
  tests (``tests/test_lifespan_init.py:29`` polls this field) keep
  working until the path is flipped to ``/health/readiness`` manually
  post-merge.
"""

import logging
import os
import time

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.rate_limit import limiter

router = APIRouter()
log = logging.getLogger(__name__)

# MEH-2482 — the same Places API (New) endpoint the browser's AddressSearch
# calls (frontend/lib/places.js). The probe must make the call the product
# makes, with the key the product has, or a green here says nothing.
_PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
_PLACES_PROBE_INPUT = "תל אביב"
_PLACES_PROBE_TIMEOUT_SECONDS = 5.0


def _places_probe() -> tuple[int, dict]:
    """(http status to return, body) for GET /health/places.

    Three outcomes, never an exception:
      disabled — no server key configured; the feature is dormant and that is
                 not a failure (200).
      ok       — Google answered 2xx (200).
      error    — Google answered non-2xx, or did not answer (503). The body
                 carries Google's status word (PERMISSION_DENIED,
                 RESOURCE_EXHAUSTED, …) so the alert names the cause, and
                 nothing else: never the key, never the raw body.

    Why a server-side key probe for a browser-side feature: the browser key
    and the server key live in the same Google Cloud project, and the failure
    that took AddressSearch down on 28/10/2026 (trial ended → billing off)
    is project-wide. A probe on either key catches it. The server key is the
    one a cron can exercise without a browser.
    """
    api_key = settings.google_places_api_key
    if not api_key:
        return 200, {"status": "disabled"}
    try:
        resp = httpx.post(
            _PLACES_AUTOCOMPLETE_URL,
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": api_key},
            json={
                "input": _PLACES_PROBE_INPUT,
                "includedRegionCodes": ["il"],
                "languageCode": "he",
            },
            timeout=_PLACES_PROBE_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 — a health probe reports, never raises
        return 503, {"status": "error", "http": None, "code": type(exc).__name__}
    if 200 <= resp.status_code < 300:
        return 200, {"status": "ok"}
    code = "unknown"
    try:
        code = str(resp.json().get("error", {}).get("status") or "unknown")
    except Exception:  # noqa: BLE001 — a non-JSON error body is still an error
        pass
    return 503, {"status": "error", "http": resp.status_code, "code": code}


# MEH-2482 review finding: the endpoint is public and rate-limited per IP, so
# during an outage a hammered probe could turn one incident into thousands of
# Sentry events. One report per process per window is all the alert needs.
_REPORT_WINDOW_SECONDS = 600
# None = never reported. Not 0.0: time.monotonic() is seconds since boot, and on a
# fresh CI runner that is < 600, so `now - 0.0 < window` read as "already sent".
_last_places_report_at: float | None = None


def _report_places_error(body: dict) -> None:
    """One Sentry issue per Google status word, so the alert rule fires on the
    first failure and the next occurrences group under it. Throttled to one
    event per `_REPORT_WINDOW_SECONDS` per process. Never raises."""
    global _last_places_report_at  # noqa: PLW0603 — a process-local throttle, nothing else
    now = time.monotonic()
    if (
        _last_places_report_at is not None
        and now - _last_places_report_at < _REPORT_WINDOW_SECONDS
    ):
        return
    _last_places_report_at = now
    try:
        import sentry_sdk  # noqa: PLC0415 — optional at import time, like moderation_fail_open

        scope_factory = getattr(sentry_sdk, "new_scope", None) or getattr(
            sentry_sdk, "push_scope", None
        )
        if scope_factory is None:  # pragma: no cover
            return
        with scope_factory() as scope:
            scope.set_tag("places_probe_code", str(body.get("code")))
            scope.set_tag("places_probe_http", str(body.get("http")))
            scope.fingerprint = ["places-health", str(body.get("code"))]
            sentry_sdk.capture_message(
                f"Google Places key is not answering: {body.get('code')}",
                level="error",
            )
    except Exception:  # pragma: no cover — reporting must never raise
        log.debug("[health/places] report to Sentry failed")


@router.get("/health/places")
@limiter.limit("10/minute")
def places_health(request: Request):
    """MEH-2482 — is the Google Places key answering right now?

    Unauthenticated so a cron (docs/ci/places-health-probe.patch.md) or an
    uptime monitor can hit it; rate-limited so it cannot be used to spend the
    key's quota. 503 is the alerting signal.
    """
    status, body = _places_probe()
    if status != 200:
        log.warning("[health/places] %s", body)
        _report_places_error(body)
    return JSONResponse(status_code=status, content=body)


def _read_alembic_head() -> str | None:
    """Return current alembic revision, or ``None`` if the table is absent.

    Tests bootstrap via ``Base.metadata.create_all`` (conftest.py:42), so
    ``alembic_version`` won't exist there. That is informational, not a
    readiness failure — return ``None`` and let the caller decide.
    """
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
            return row[0] if row else None
    except Exception:
        return None


def _db_select_1_ok() -> tuple[bool, str | None]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:
        return False, type(exc).__name__


@router.get("/health/liveness")
@router.head("/health/liveness")
def liveness() -> dict:
    return {"status": "alive"}


@router.get("/health/readiness")
@router.head("/health/readiness")
def readiness(request: Request):
    db_state = getattr(request.app.state, "db_init_status", "not_scheduled")

    ok, db_err = _db_select_1_ok()
    if not ok:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": f"db_unreachable:{db_err}"},
        )

    if db_state == "failed":
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": "db_init_failed"},
        )
    if db_state == "initializing":
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "reason": "db_init_pending"},
        )

    rev = _read_alembic_head()
    return {
        "status": "ready",
        "migrations": rev or "unknown",
        "db_init": db_state,
    }


def _env_first(*names: str) -> str:
    """First non-empty env var among ``names``, else ``"unknown"``.

    MEH-1596: never raises and never introduces a new env var — it reads only
    what Railway already injects. A missing value is reported as ``"unknown"``
    because a health endpoint that 500s is worse than one that says it does
    not know.
    """
    for name in names:
        value = os.getenv(name)
        if value:
            return value.strip()
    return "unknown"


def _version_block(request: Request) -> dict:
    """The four MEH-1596 boot facts. Exactly four keys — see the test.

    ``booted_at`` and ``alembic_head`` are read from ``app.state``, written
    once during lifespan (app/startup.py). ``getattr`` defaults cover the case
    where the lifespan never ran — a bare ``TestClient(app)`` does not fire
    startup events — so this stays 200 rather than raising AttributeError.

    Public surface: /health is unauthenticated, so this carries a commit SHA,
    a branch name, a revision id and a timestamp, and nothing else. No env
    dump, no DATABASE_URL, no file paths.
    """
    return {
        "git_sha": _env_first("GIT_SHA", "RAILWAY_GIT_COMMIT_SHA"),
        "git_branch": _env_first("GIT_BRANCH", "RAILWAY_GIT_BRANCH"),
        "alembic_head": getattr(request.app.state, "alembic_head", "unknown"),
        "booted_at": getattr(request.app.state, "booted_at", "unknown"),
    }


# MEH-1750: two decorators, not one `api_route(methods=["GET", "HEAD"])`.
# FastAPI emits ONE OpenAPI operation per method, but derives the operationId
# from the ROUTE — and its default `generate_unique_id` suffixes with
# `list(route.methods)[0]`. A single route carrying both methods therefore
# produced the SAME operationId twice, which makes /openapi.json invalid for
# every consumer (Swagger UI, any client generator), not just for us. Found via
# MEH-1748's codegen spike: `orval --client zod` derives export names from
# operationId and emitted a duplicate symbol, so the generated module did not
# compile. Explicit `operation_id=` rather than relying on the default, so the
# two ids are stated in the file instead of falling out of set iteration order.
# The sibling routes at :52-53 and :58-59 already used this stacked shape; this
# route was the only `api_route` in the file.
# DO NOT merge these back into one decorator — the duplicate returns silently
# (FastAPI only warns; the document still serves).
@router.get("/health", operation_id="health_alias_get")
@router.head("/health", operation_id="health_alias_head")
def health_alias(request: Request) -> dict:
    """Backwards-compat alias. Pre-MEH-483 shape preserved verbatim.

    Migrate Railway healthcheck path to ``/health/readiness`` manually
    post-merge; this alias can be removed in a follow-up once the path
    flip has soaked.

    MEH-1596: additive only. ``status`` and ``db_init`` keep their exact names,
    positions and value types — the Railway healthcheck and
    ``tests/test_lifespan_init.py:29`` both depend on ``db_init``. The new
    ``version`` object is appended, never interleaved, and adds no DB query:
    both DB-derived values were resolved once at startup.
    """
    db_state = getattr(request.app.state, "db_init_status", "not_scheduled")
    return {"status": "ok", "db_init": db_state, "version": _version_block(request)}
