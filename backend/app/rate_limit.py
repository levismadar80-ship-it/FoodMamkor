"""Shared rate limiter instance used across all routers.

SECURITY FIX #2 (docs/SECURITY.md): brute-force protection via slowapi.
Limits are applied per-real-client-IP. The limiter is registered on
the FastAPI app in main.py (`app.state.limiter = limiter` + the
exception handler). Each router that wants to protect an endpoint
imports `limiter` from here and adds
`@limiter.limit("N/timeframe")` under the `@router.post(...)`.

Decorated endpoints MUST accept `request: Request` as the first
parameter — slowapi reads it via introspection.

---

MEH-256 — real client IP behind Railway's proxy (resolved).

`slowapi.util.get_remote_address` reads `request.client.host`, which
on Railway is the edge-proxy IP (`100.64.0.X` CGN range). Keying on
that collapses the entire internet into one rate-limit bucket.

Empirical investigation (PR #293 debug probe, captured 2026-04-22)
showed Railway's edge reliably sets `X-Real-IP` from its OWN view of
the TCP peer — unspoofable because Railway overwrites whatever the
client sends in that slot. `X-Forwarded-For` has the real client at
index `-2` (rightmost is Railway's internal proxy, which varies per
pod: `167.82.233.*`, `140.248.75.*`, `100.64.0.*`).

Key-resolution priority when `TRUSTED_PROXY` is enabled:
  1. `X-Real-IP` header — primary, unspoofable (Railway edge)
  2. `X-Forwarded-For[-2]` — defensive fallback when ≥2 entries
     (skip single-entry XFF: that's just what the client sent)
  3. `get_remote_address(request)` — last resort

When `TRUSTED_PROXY` is not set, headers are client-controlled and
must be ignored — falls straight through to `get_remote_address`.

`TRUSTED_PROXY` must be set to `1` / `true` / `yes` / `on` (case
insensitive). Configure on Railway staging + production; leave unset
for local dev and any directly-exposed deploy.
"""
import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

_TRUTHY = frozenset({"1", "true", "yes", "on"})


def _trusted_proxy_enabled() -> bool:
    return os.getenv("TRUSTED_PROXY", "0").strip().lower() in _TRUTHY


def get_real_client_ip(request: Request) -> str:
    """Return the real caller IP for rate-limit bucketing.

    See module docstring for the resolution priority. In short: when
    behind a trusted proxy, prefer `X-Real-IP` (Railway sets this
    unspoofably); fall back to the second-to-last X-Forwarded-For
    entry; fall through to `request.client.host` otherwise.
    """
    if _trusted_proxy_enabled():
        # Primary: X-Real-IP, set by Railway's edge from its own
        # TCP-peer view of the caller. Overwritten on ingress, so the
        # client cannot spoof this value.
        real_ip = request.headers.get("x-real-ip", "").strip()
        if real_ip:
            return real_ip

        # Defensive fallback: X-Forwarded-For[-2]. Rightmost entry
        # is always Railway's internal proxy; the real client is the
        # entry immediately before it. Only trust when there are at
        # least 2 entries — a 1-entry XFF is just whatever the client
        # sent in the request, i.e. spoofable.
        xff = request.headers.get("x-forwarded-for", "")
        entries = [e.strip() for e in xff.split(",") if e.strip()]
        if len(entries) >= 2:
            return entries[-2]

    return get_remote_address(request)


limiter = Limiter(key_func=get_real_client_ip)
