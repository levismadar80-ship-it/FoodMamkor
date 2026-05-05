import time as _time

import structlog
from asgi_correlation_id import CorrelationIdMiddleware
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.rate_limit import limiter
from app.services.analytics import record_request

log = structlog.get_logger("mehamakor.middleware")


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


def install_middlewares(app: FastAPI) -> None:
    """Register middleware in the order required by the existing chain.

    Order matters: CorrelationIdMiddleware must be added AFTER SlowAPIMiddleware
    so request IDs appear on rate-limit (429) responses. The two `app.middleware("http")`
    decorator-style middlewares register as the outermost layers, matching the
    pre-refactor behavior of `@app.middleware("http")` declarations after
    `app.add_middleware(...)` calls in main.py.
    """
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(CorrelationIdMiddleware, header_name="X-Request-ID")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    app.middleware("http")(add_security_headers)
    app.middleware("http")(record_request_metrics)
