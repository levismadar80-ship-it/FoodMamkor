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

MEH-256 — real-client-IP resolution behind a reverse proxy.

`slowapi.util.get_remote_address` reads `request.client.host`, which
on Railway resolves to the edge-proxy IP. All users share one bucket
and the 5/min login limit becomes a site-wide DoS + brute-force
bypass (audited in `docs/AUDIT-SECURITY-FOLLOWUP.md` finding #1).

Fix: env-gated XFF trust. When `TRUSTED_PROXY=1` (Railway staging +
production), honor the first value of `X-Forwarded-For` as the real
client. When unset (local dev, any non-proxied deploy), fall back to
`get_remote_address` so an attacker cannot spoof the header by
setting it locally.

Never enable `TRUSTED_PROXY` on a deploy that is directly exposed
to the public internet — only when a trusted proxy (Railway edge,
Cloudflare, nginx) is known to overwrite or strip the header on
ingress.
"""
import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def get_real_client_ip(request: Request) -> str:
    """Return the real client IP when behind a trusted proxy, else the
    TCP peer's IP. Gated by the `TRUSTED_PROXY=1` env var so spoofing
    `X-Forwarded-For` in an untrusted environment cannot bypass limits.
    """
    if os.getenv("TRUSTED_PROXY", "0") == "1":
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            # Standard XFF format: "client, proxy1, proxy2". First entry
            # is the original client; later entries are the proxy chain.
            client_ip = xff.split(",")[0].strip()
            if client_ip:
                return client_ip
    return get_remote_address(request)


limiter = Limiter(key_func=get_real_client_ip)
