"""Shared rate limiter instance used across all routers.

SECURITY FIX #2 (docs/SECURITY.md): brute-force protection via slowapi.
Limits are applied per-IP. The limiter is registered on the FastAPI
app in main.py (see `app.state.limiter = limiter` + the exception
handler). Each router that wants to protect an endpoint imports
`limiter` from here and adds a `@limiter.limit("N/timeframe")`
decorator under the `@router.post(...)` decorator.

Decorated endpoints MUST accept `request: Request` as the first
parameter — slowapi reads it via introspection.

---

MEH-256 — structured observability for the Railway XFF investigation.

Previous attempt (PR #287) used a raw `print`, which shipped
debug-print-on-every-request into the hot path and had to be reverted
within an hour (PR #288). This replaces that with a structured
`log.warning` shim that:
  - goes through the existing structlog config (honors level env vars)
  - emits one structured event per request with xff / x_real_ip /
    x_envoy / remote_addr so we can filter in Railway's log UI
  - DOES NOT change the rate-limit key value — still returns
    `get_remote_address(request)` exactly as before

Purpose: gather three curls' worth of header data so we can decide
empirically whether Railway's edge appends or replaces XFF, and whether
it exposes X-Real-IP or X-Envoy-External-Address. The real MEH-256 fix
(proper per-client keying) is a separate PR.

When the data is captured, either:
  (a) lower the log level of this event to DEBUG so it goes silent in
      production but can be re-enabled for debugging, OR
  (b) remove the shim entirely if the real fix lands first.
"""
import structlog
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

log = structlog.get_logger(__name__)


def _logged_remote_address(request: Request) -> str:
    """Return get_remote_address(request) unchanged, with a structured
    log on the side for the MEH-256 XFF investigation.

    Behavior is identical to `get_remote_address` — every rate-limit
    decorator still buckets by whatever that function returns. This
    shim only observes.
    """
    xff = request.headers.get("x-forwarded-for", "")
    x_real_ip = request.headers.get("x-real-ip", "")
    x_envoy = request.headers.get("x-envoy-external-address", "")
    remote = request.client.host if request.client else None
    key = get_remote_address(request)

    log.warning(
        "meh256_xff_probe",
        path=request.url.path,
        method=request.method,
        xff=xff,
        x_real_ip=x_real_ip,
        x_envoy=x_envoy,
        remote_addr=remote,
        limiter_key=key,
    )
    return key


limiter = Limiter(key_func=_logged_remote_address)
