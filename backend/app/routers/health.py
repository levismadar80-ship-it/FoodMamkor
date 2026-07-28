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

import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.database import engine

router = APIRouter()


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
