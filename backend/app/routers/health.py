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


@router.api_route("/health", methods=["GET", "HEAD"])
def health_alias(request: Request) -> dict:
    """Backwards-compat alias. Pre-MEH-483 shape preserved verbatim.

    Migrate Railway healthcheck path to ``/health/readiness`` manually
    post-merge; this alias can be removed in a follow-up once the path
    flip has soaked.
    """
    db_state = getattr(request.app.state, "db_init_status", "not_scheduled")
    return {"status": "ok", "db_init": db_state}
