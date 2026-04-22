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

MEH-256 — temporary investigation, NOT the final fix.

This branch adds a stdout debug line per request that dumps XFF,
X-Real-IP, X-Envoy-External-Address, and request.client.host.
Railway's log stream will capture three test curls so we can decide
(empirically) whether leftmost/rightmost/proprietary-header is the
correct parsing rule for Railway's proxy chain.

Return-value behavior matches the user's original MEH-256 spec —
leftmost XFF when TRUSTED_PROXY set, else get_remote_address.
This is explicitly NOT the final fix; we're observing, not deciding.

The debug print + this block must be reverted before any real
rate-limit fix merges. See PR #286 for the production-eligible fix.
"""
import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def get_real_client_ip(request: Request) -> str:
    # TEMP — MEH-256 investigation. Remove after gathering data.
    xff_raw = request.headers.get("x-forwarded-for", "")
    x_real_ip = request.headers.get("x-real-ip", "")
    x_envoy = request.headers.get("x-envoy-external-address", "")
    remote = request.client.host if request.client else "unknown"
    print(
        f"[MEH-256-XFF-DEBUG] path={request.url.path} "
        f"xff='{xff_raw}' x_real_ip='{x_real_ip}' "
        f"x_envoy='{x_envoy}' remote_addr='{remote}'",
        flush=True,
    )

    # Behavior unchanged from user's original MEH-256 spec:
    # leftmost XFF entry when TRUSTED_PROXY set, else get_remote_address.
    trusted = os.getenv("TRUSTED_PROXY", "0").strip().lower() in ("1", "true", "yes")
    if trusted:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            client_ip = xff.split(",")[0].strip()
            if client_ip:
                return client_ip
    return get_remote_address(request)


limiter = Limiter(key_func=get_real_client_ip)
