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

import json
import os

import structlog
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = structlog.get_logger("mehamakor.rate_limit")

_TRUTHY = frozenset({"1", "true", "yes", "on"})

# SEN-004 (MEH-775): slowapi SKIPS a limit when key_func returns a falsy
# value, so an empty per-email key left auth routes unprotected. Key-less
# requests bucket here together instead — never an empty key.
NO_EMAIL_BUCKET = "__no_email__"


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


def _no_email_fallback(request: Request, reason: str) -> str:
    """SEN-004 (MEH-775): return the shared key-less bucket, never "".

    A falsy key makes slowapi skip the limit, so a missing/undecodable email
    would otherwise disable per-email rate limiting on the auth route. All
    key-less requests share NO_EMAIL_BUCKET (the per-IP limit on the same
    route is the second layer). Logged so the fallback is observable without
    re-creating the slowapi "Empty value" error noise.
    """
    path = getattr(getattr(request, "url", None), "path", "<unknown>")
    logger.info(
        "rate_limit.email_key_fallback", reason=reason, route=path,
    )
    return NO_EMAIL_BUCKET


def email_from_body(request: Request) -> str:
    """MEH-306: per-email rate-limit key for /auth/forgot-password,
    /auth/register, /auth/register/producer.

    FastAPI parses the JSON body to validate against the Pydantic model
    BEFORE slowapi's @limiter.limit wrapper invokes key_func, so by the
    time we're called, request._body is already cached. Reading it is
    non-blocking; await is unnecessary (slowapi key_func is sync).

    Returns the lower-cased email so case-only differences cannot bypass
    the per-email bucket. On any missing/empty/undecodable email, falls back
    to NO_EMAIL_BUCKET (SEN-004) — a non-empty shared bucket — so slowapi
    still enforces the limit instead of skipping it.
    """
    body = getattr(request, "_body", None)
    if not body:
        return _no_email_fallback(request, "no_body")
    try:
        decoded = json.loads(body)
        if not isinstance(decoded, dict):
            return _no_email_fallback(request, "non_dict_body")
        email = decoded.get("email", "")
        if isinstance(email, str) and email.strip():
            return email.strip().lower()
        return _no_email_fallback(request, "missing_email")
    except (json.JSONDecodeError, AttributeError, UnicodeDecodeError):
        return _no_email_fallback(request, "decode_error")


limiter = Limiter(key_func=get_real_client_ip)
