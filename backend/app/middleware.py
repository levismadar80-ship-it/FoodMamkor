import time as _time

import structlog
from asgi_correlation_id import CorrelationIdMiddleware, correlation_id
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

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


# DO NOT treat a card asking to "add security headers" or "ship CSP in
# Report-Only" as green-field work without reading this function (and its
# frontend twin, next.config.js's securityHeaders) first. This baseline has
# lived here since 2026-04-08 (37b39940e), and the frontend's CSP already
# ENFORCES. MEH-1959 re-litigated that exact false premise 3x (2026-08-11,
# -14, -15) — see the MEH-1959 Linear comments for full file:line evidence.
# Weakening HSTS (dropping preload / shortening max-age) below would be a
# security regression, not a baseline addition — don't do it without an
# explicit, informed decision from Sapir.
async def add_security_headers(request: Request, call_next) -> Response:
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(self)"
    )
    # MEH-783: HSTS for parity with the frontend origin (next.config.js
    # securityHeaders). Browsers honor it only over HTTPS, which is how the
    # API is served in production (Railway); harmless over plain HTTP in dev.
    # CSP intentionally NOT set here — it stays a frontend-only concern.
    response.headers["Strict-Transport-Security"] = (
        "max-age=63072000; includeSubDomains; preload"
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


class SentryRequestScopeMiddleware:
    """MEH-483 + MEH-493: bind request_id + route + method tags, plus
    request_info structured context, plus best-effort user.id, to the
    current Sentry scope on every request.

    Pure ASGI middleware (MEH-1906 — converted off ``BaseHTTPMiddleware``:
    that base class is what Starlette's own docs flag as problem-prone,
    and it's implicated in a boot-dependent RecursionError on
    ``/producers/by-slug/*`` on staging — see MEH-1906. The
    ``BaseHTTPMiddleware`` machinery is eliminated by this conversion (the
    anyio task group, the ``call_next`` hop, the streaming re-emit); the
    RecursionError's root cause was NOT proven, so this is not claimed as
    a fix. Patterned after
    Starlette's own shipped middlewares, e.g.
    ``starlette/middleware/cors.py:78-96`` (chain-of-ASGI-apps,
    non-``http`` scopes delegated untouched).

    Plan B middleware ordering (locked, unchanged by this conversion):
    registered AFTER ``CorrelationIdMiddleware`` in ``add_middleware``
    order. Starlette wraps middleware in reverse, so the later
    ``add_middleware`` call becomes INNER on request-in. Request flow:

        CORS  →  CorrelationId (sets contextvar)
              →  SentryRequestScope (reads contextvar, tags Sentry scope)
              →  SlowAPI  →  handler

    By tagging on request-in (before delegating to ``self.app``), any
    handler exception that bubbles into Sentry already carries the
    bindings. No-ops cleanly when ``sentry_sdk`` isn't installed (current
    state — SDK init tracked in MEH-500). The MEH-493 additions
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

    **What this conversion does NOT remove — measured, not assumed
    (MEH-1906 follow-up).** Sentry's span wrapper still applies to this
    class. ``patch_middlewares`` (sentry_sdk/integrations/starlette.py:411)
    patches ``Middleware.__init__`` so that EVERY class passed to
    ``add_middleware`` gets ``_enable_span_for_middleware``, regardless of
    base class. Measured against the merged conversion with the FastAPI
    integration initialised, ``SentryRequestScopeMiddleware.__call__``
    ``.__name__`` is still ``_create_span_call``. So Sentry remains in the
    frame; what changed is the frame's SHAPE, which is precisely the value
    here — the next occurrence yields a differently-shaped trace instead of
    one identical to itself.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if _sentry_sdk is not None:
            request = Request(scope, receive=receive)
            rid = correlation_id.get()
            try:
                with _sentry_sdk.configure_scope() as sentry_scope:
                    if rid:
                        sentry_scope.set_tag("request_id", rid)
                    sentry_scope.set_tag("route", request.url.path)
                    sentry_scope.set_tag("method", request.method)
                    # MEH-493 — request_info structured context.
                    sentry_scope.set_context(
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
                        sentry_scope.set_user({"id": user_id})
            except Exception:  # pragma: no cover — defensive only
                log.debug("[sentry] scope tag bind failed", exc_info=True)

        await self.app(scope, receive, send)


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

        GZipMiddleware               # innermost — MEH-1833, see note below
        SlowAPIMiddleware
        SentryRequestScopeMiddleware # NEW — must run AFTER CorrelationId
        CorrelationIdMiddleware      # sets `request_id` contextvar
        CORSMiddleware               # outermost add_middleware

    Decorator middlewares (registered after, become outer of all
    ``add_middleware`` layers)::

        add_security_headers
        record_request_metrics

    Request-in flow::

        record_metrics → security_headers → CORS → CorrelationId
                       → SentryRequestScope → SlowAPI → GZip → handler

    Why this order:
    - CorrelationId must wrap SlowAPI so 429 responses carry
      ``X-Request-ID`` (pre-existing invariant — MEH-XXX).
    - SentryRequestScope must be INNER to CorrelationId so the
      ``request_id`` contextvar is populated when its ``__call__``
      runs. Reading the contextvar from a decorator-style
      (outermost) middleware before ``call_next`` returns empty —
      that mistake was caught in code review and locked here.
    """
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # MEH-1833: GZip added FIRST, i.e. INNERMOST — it wraps the router directly.
    # The position is load-bearing and was corrected after a failing control
    # test. Starlette's GZipResponder skips compression only when it sees the
    # WHOLE body in one `http.response.body` message —
    # `len(body) < minimum_size and not more_body`. It never consults
    # Content-Length. At the time this comment was written,
    # `SentryRequestScopeMiddleware` was a BaseHTTPMiddleware, which re-emits
    # the response as a STREAM (`more_body=True`), so with GZip anywhere
    # outside it that condition was never true and every response was
    # compressed regardless of size — measured: a few-byte `/producers/count`
    # payload came back `content-encoding: gzip`. Innermost, GZip receives the
    # handler's single complete chunk and the 1 KB floor actually applies.
    # MEH-1906 converted SentryRequestScopeMiddleware to pure ASGI (plain
    # pass-through, no re-emission), which removes THAT middleware as the
    # example — but NOT the hazard, and the position below is still
    # load-bearing rather than merely harmless. `app.middleware("http")` at
    # the bottom of this function wraps `add_security_headers` and
    # `record_request_metrics` in BaseHTTPMiddleware, and both sit OUTERMOST,
    # so a streaming re-emitter still exists outside GZip. Measured on the
    # merged conversion: 2 such instances. DO NOT move GZip outward on the
    # basis that the Sentry middleware no longer streams.
    # Pinned by tests/test_public_cache_and_gzip.py
    # ::test_a_streaming_re_emitter_still_sits_outside_gzip.
    # Still outside the route handler, so the Cache-Control the two catalog
    # GETs set is written before GZip rewrites body + Content-Length.
    # Trade-off accepted: SlowAPI's 429 short-circuits outside this layer and
    # is therefore never compressed — those bodies are a few dozen bytes.
    app.add_middleware(GZipMiddleware, minimum_size=1024)

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
