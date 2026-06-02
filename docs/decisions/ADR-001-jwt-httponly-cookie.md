# ADR-001: JWT in HttpOnly cookie, not localStorage

**Status:** Superseded by ADR-017
**Date:** 2026-04-26
**Deciders:** Smadar Levi
**Source:** MEH-326 (PR #349, merged SHA `7b7f880` — HANDOFF.md:1809)

## Context
Pre-MEH-326 JWTs were single 24h tokens stored client-side and sent via
`Authorization: Bearer`. localStorage is reachable from any XSS payload,
and a 24h token gives an attacker a full day of authenticated access
once stolen. Pre-launch security sweep flagged this as High priority
(HANDOFF.md:1953).

## Decision
Split into a 15-minute access token (still `Authorization: Bearer`) plus
a 14-day **refresh token in an HttpOnly + Secure + SameSite=Lax cookie**.
Refresh rotates both on `POST /auth/refresh`; logout clears the cookie.
Backend gates on `scope=="access"` claim; missing-scope tokens fail-open
for the 24h pre-deploy window (HANDOFF.md:1860-1873).

## Consequences
**Positive:** XSS can't read the refresh cookie; access-token blast radius is 15 min; logout is server-side revocable.
**Negative:** Adds CSRF surface (mitigated by SameSite=Lax + relative `config.url` on axios — HANDOFF.md:1910); TestClient drops `Secure` cookies over `http://testserver` so tests must pass cookies explicitly (HANDOFF.md:1762).
**Mitigations:** SameSite=Lax (not Strict — Strict broke top-level nav, HANDOFF.md:1909); refresh-aware axios interceptor with SKIP_REFRESH + in-flight Promise dedup (HANDOFF.md:1877).

## Alternatives considered
- Keep 24h Bearer in localStorage — rejected: XSS exposure + no logout revocation.
- Bearer-only short-TTL with no refresh — rejected: forces re-login every 15 min; user-hostile.
- SameSite=Strict — rejected: broke OAuth top-level navigation.
