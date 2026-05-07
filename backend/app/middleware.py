import time as _time

import structlog
from asgi_correlation_id import CorrelationIdMiddleware, correlation_id
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.config import settings
from app.rate_limit import limiter
from app.services.analytics import record_request

# MEH-483: Sentry SDK is not yet wired in backend (frontend-only today,
# tracked in MEH-376/379). Shim no-ops cleanly until the follow-up
# ticket adds `sentry_sdk.init(...)`.
try:  # pragma: no cover — exercised once sentry_sdk lands
    import sentry_sdk as _sentry_sdk  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    _sentry_sdk = None

log = structlog.get_logger("mehamakor.middleware")


def _redact_email(addr: str | None) -> str:
    """MEH-493: PII-safe email redaction for Sentry user context.

    `'alice@gmail.com'` → `'a***@gmail.com'`. Empty / None / no-`@`
    inputs return `'<no-email>'` so Sentry never sees a half-redacted
    address.
    """
    if not addr or "@" not in addr:
        return "<no-email>"
    local, _, domain = addr.partition("@")
    if not local:
        return "<no-email>"
    return f"{local[0]}***@{domain}"


async def add_security_headers(request: Request, call_next) -> Response:
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(self)"
    )
    return response


async def record_request_metrics(request: Request, call_next) -> Response:
    start = _time.monotonic()
    try:
        response: Response = await call_next(request)
        return response
    finally:
        duration_ms = (_time.monotonic() - start) * 1000.0
        try:
            record_request(duration_ms)
        except Exception:
            log.debug("[metrics] record_request failed (non-fatal)", exc_info=True)


class SentryRequestScopeMiddleware(BaseHTTPMiddleware):
    """MEH-483 + MEH-493: bind request_id + route + method tags, plus
    request_info structured context, plus best-effort user.id, to the
    current Sentry scope on every request.

    Plan B middleware ordering (locked): registered AFTER
    ``CorrelationIdMiddleware`` in ``add_middleware`` order. Starlette
    wraps middleware in reverse, so the later ``add_middleware`` call
    becomes INNER on request-in. Request flow:

        CORS  →  CorrelationId (sets contextvar)
              →  SentryRequestScope (reads contextvar, tags Sentry scope)
              →  SlowAPI  →  handler

    By tagging on request-in (before ``call_next``), any handler
    exception that bubbles into Sentry already carries the bindings.
    No-ops cleanly when ``sentry_sdk`` isn't installed (current state —
    SDK init tracked in MEH-500). The MEH-493 additions
    (``set_context("request_info", ...)`` + ``set_user({"id": sub})``)
    follow the same fail-open posture: any extraction failure is
    swallowed, the request continues unaffected.

    PII guard (MEH-493):
      - NEVER attached: passwords, JWT tokens, OAuth secrets, request
        body, session keys, full email.
      - Allowed: route, method, full URL, client IP, request_id,
        user.id (opaque UUID from JWT ``sub`` claim).
      - Email: redacted via ``_redact_email`` before attach. Currently
        unused because the access-token claims set
        (``backend/app/auth.py:38-57``) does not include email — the
        helper ships ready for MEH-500's ``before_send`` hook to
        enrich from the User row if desired.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        if _sentry_sdk is not None:
            rid = correlation_id.get()
            try:
                with _sentry_sdk.configure_scope() as scope:
                    if rid:
                        scope.set_tag("request_id", rid)
                    scope.set_tag("route", request.url.path)
                    scope.set_tag("method", request.method)
                    # MEH-493 — request_info structured context.
                    scope.set_context(
                        "request_info",
                        {
                            "url": str(request.url),
                            "method": request.method,
                            "client": request.client.host
                            if request.client is not None
                            else "unknown",
                        },
                    )
                    # MEH-493 — best-effort user.id from JWT sub claim.
                    # No DB lookup (perf + middleware-decoupling).
                    # Lazy import keeps the auth module out of the
                    # cold-import path for unauthenticated routes.
                    user_id = _try_extract_user_id(request)
                    if user_id is not None:
                        scope.set_user({"id": user_id})
            except Exception:  # pragma: no cover — defensive only
                log.debug("[sentry] scope tag bind failed", exc_info=True)
        return await call_next(request)


def _try_extract_user_id(request: Request) -> str | None:
    """MEH-493: best-effort JWT ``sub`` extraction for Sentry user context.

    Returns the ``sub`` claim (user UUID as string) or ``None`` on any
    failure — missing header, malformed token, expired, wrong scope,
    decode error. Never raises. No DB lookup by design.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header[7:].strip()
    if not token:
        return None
    try:
        from joserfc import jwt as _jose_jwt  # lazy import

        from app.auth import _jwt_key
        from app.config import settings as _settings

        token_obj = _jose_jwt.decode(
            token, _jwt_key(), algorithms=[_settings.algorithm]
        )
        sub = token_obj.claims.get("sub")
        return str(sub) if sub else None
    except Exception:  # JoseError, ImportError, anything — fail-open
        return None


def install_middlewares(app: FastAPI) -> None:
    """Register middleware in the order required by the existing chain.

    Locked ordering (Plan B per MEH-483 review):

    ``add_middleware`` calls (Starlette wraps in reverse — later call =
    inner on request-in)::

        SlowAPIMiddleware            # innermost
        SentryRequestScopeMiddleware # NEW — must run AFTER CorrelationId
        CorrelationIdMiddleware      # sets `request_id` contextvar
        CORSMiddleware               # outermost add_middleware

    Decorator middlewares (registered after, become outer of all
    ``add_middleware`` layers)::

        add_security_headers
        record_request_metrics

    Request-in flow::

        record_metrics → security_headers → CORS → CorrelationId
                       → SentryRequestScope → SlowAPI → handler

    Why this order:
    - CorrelationId must wrap SlowAPI so 429 responses carry
      ``X-Request-ID`` (pre-existing invariant — MEH-XXX).
    - SentryRequestScope must be INNER to CorrelationId so the
      ``request_id`` contextvar is populated when its ``dispatch``
      runs. Reading the contextvar from a decorator-style
      (outermost) middleware before ``call_next`` returns empty —
      that mistake was caught in code review and locked here.
    """
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    # SentryRequestScope must be added AFTER SlowAPI but BEFORE
    # CorrelationId so it ends up INNER to CorrelationId on request-in.
    app.add_middleware(SentryRequestScopeMiddleware)
    app.add_middleware(CorrelationIdMiddleware, header_name="X-Request-ID")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Requested-With",
            "X-Request-ID",
        ],
        expose_headers=["X-Request-ID"],
    )

    app.middleware("http")(add_security_headers)
    app.middleware("http")(record_request_metrics)
