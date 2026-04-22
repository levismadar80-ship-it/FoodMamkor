# Security Follow-up Audit — MEH-255

> Verifies the "not verified" / "needs live repro" items from
> [AUDIT-EDGE-CASES.md](./AUDIT-EDGE-CASES.md) (MEH-242) plus the
> five explicit MEH-255 topics. Static code review against staging
> HEAD as of 2026-04-22. **Audit only — no code fixes in this PR.**

## Summary
- Topics investigated: 5
- Findings: 4 (1 HIGH, 2 MEDIUM, 1 LOW)
- Verified-safe (no issue found): 3 of 5 topics

## Findings Table
| # | Topic | Severity | Scope |
|---|---|---|---|
| 1 | Login rate-limit shares Railway's proxy IP across all users | **HIGH** | Backend (rate_limit.py) |
| 2 | No JWT refresh flow; 24h expiry drops user silently | MEDIUM | Backend + Frontend |
| 3 | `allow_credentials=True` + JWT-in-localStorage is a latent CSRF trap if auth ever moves to cookies | MEDIUM | Backend (main.py) |
| 4 | `/auth/email-exists` is a deliberate user-enumeration oracle rate-limited to 30/min | LOW | Backend (auth.py) |

---

## 1. Producer-A edits Producer-B (IDOR) — **VERIFIED SAFE**
**Topic:** does `backend/app/routers/producer_me.py` let a producer submit a `producer_id` in the body/URL and edit a different producer?

**Code:** every mutation queries by `Producer.id == user.producer_id`
(`producer_me.py:57, 82, 161, 194, 215, 286`). The URL path does not
carry a producer_id; the body is a `ProducerUpdate` without an id field.
`require_producer` resolves `user` from the JWT, so the producer_id
cannot be swapped.

**Verdict:** ✓ no IDOR.

---

## 2. CSRF protection on POST/PUT/DELETE — **VERIFIED SAFE (with caveat)**
**Topic:** auth uses JWT in `Authorization: Bearer` header (from
`localStorage`). Cross-origin browsers do not auto-send `Authorization`
headers, so CSRF is structurally impossible with the current auth
model.

**Caveat (MEDIUM finding #3):** `main.py:349` sets
`allow_credentials=True` and `Authorization` is in `allow_headers`.
If auth is ever moved to an `HttpOnly` cookie — e.g. for SameSite=Lax
CSRF protection, or for a first-party session cookie in a mobile
WebView — the current CORS config would immediately become exploitable
without adding a CSRF token. This is a latent trap, not a live bug.

**Recommended:** document in `docs/SECURITY.md` that auth-in-cookie
requires a CSRF token. Not urgent.

---

## 3. JWT expiration flow (24h TTL) — **MEDIUM finding #2**
**Topic:** what happens at minute 24:01?

**Code:** `backend/app/auth.py:37` — `expire = utcnow() +
timedelta(minutes=settings.access_token_expire_minutes)`. `config.py`
sets the default to 1440 (24h). `get_current_user` raises 401 on an
expired token. **No refresh-token issuance anywhere.**

**Impact:**
- Users are logged out exactly 24h after login; no grace window.
- Mid-flow expiry (e.g. filling a long producer form) loses state if
  the frontend does not intercept 401.
- MEH-250 (admin UX) already calls out "no global 401 interceptor in
  `lib/api.js`" — consumer flows likely have the same gap.

**Recommended scope:** a short-TTL access token (15m) + refresh token
(14d) in `HttpOnly` cookie, OR keep the 24h token but add a global
frontend 401 interceptor that redirects to `/login` with a friendly
"הסשן שלך פג" toast. The latter is cheaper and unblocks MEH-250.

---

## 4. Login rate-limit on Railway — **HIGH finding #1**
**Topic:** `@limiter.limit("5/minute")` on `/auth/login`. Per-IP? How
is "IP" resolved behind Railway's proxy?

**Code:** `backend/app/rate_limit.py:16` —
`limiter = Limiter(key_func=get_remote_address)`.
`slowapi.util.get_remote_address` reads `request.client.host`.
`request.client.host` is the **immediate TCP peer**, which on Railway
is the Railway edge proxy — **not** the original client IP. Railway
forwards the real IP in the `X-Forwarded-For` header, but slowapi does
not consult it by default, and uvicorn is not started with
`--proxy-headers` in the `Dockerfile` (verify).

**Impact:** all `/auth/login` attempts from the entire internet share
one counter (Railway's proxy IP). An attacker who burns those 5/minute
on their own laptop silently denies login to every user on the site
until the window resets. Worse for an attacker: they also get
effectively unlimited attempts against any single target by spoofing
from a distributed pool, because all attempts count against the same
proxy-IP key.

**Severity:** HIGH. This is the brute-force protection that SECURITY.md
advertises as shipped, so the stated invariant is being violated.

**Recommended fix (separate issue):**
1. Start uvicorn with `--proxy-headers --forwarded-allow-ips="*"` (or
   the narrower set of Railway egress IPs).
2. Use `X-Forwarded-For`-aware key function:
   ```python
   def real_ip(request: Request) -> str:
       xff = request.headers.get("x-forwarded-for")
       if xff:
           return xff.split(",")[0].strip()
       return get_remote_address(request)
   limiter = Limiter(key_func=real_ip)
   ```
3. Verify by hitting `/auth/login` from two different IPs and watching
   separate counters.

---

## 5. Upload magic-byte validation — **VERIFIED SAFE**
**Topic:** `backend/app/routers/upload.py` — real magic-byte sniff or
MIME-only?

**Code:** `upload.py:36-38` — real byte checks:
- JPEG: `header.startswith(b"\xff\xd8\xff")`
- PNG: `header.startswith(b"\x89PNG\r\n\x1a\n")`

The comment at `upload.py:70-71` explicitly states "sniff the real
format from magic bytes, don't trust the client-reported content_type".

**Verdict:** ✓ invariant from `.claude/rules/security.md` is satisfied.

---

## 6. `/auth/email-exists` user enumeration — **LOW finding #4**
**Topic:** discovered while auditing `/register`. `auth.py:185-191`
exposes a rate-limited endpoint that tells callers whether an email is
registered.

**Context:** documented in-code as an intentional UX affordance for
MEH-143 ("warn before submit that the email belongs to an existing
consumer"). It defeats the OWASP advice for `/auth/register` (generic
409) and effectively re-introduces the enumeration oracle the
forgot-password flow was built to avoid.

**Verdict:** LOW — not a new vulnerability given register already
returns 400 "האימייל כבר קיים". Worth deciding whether to keep this as
a UX convenience or remove it. 30/min limit caps the bulk-scrape risk
but doesn't prevent a patient attacker from harvesting the user base.

---

## Recommended grouped issues (5 — awaiting ספיר approval)
- **MEH-AAA:** Login rate-limit IP resolution fix (finding #1) — **HIGH**, ship before launch
- **MEH-BBB:** Global 401 interceptor + session-expired toast (finding #2, overlaps MEH-250) — MEDIUM
- **MEH-CCC:** Document the cookie-auth CSRF trap in SECURITY.md (finding #3) — MEDIUM
- **MEH-DDD:** Decide fate of `/auth/email-exists` (finding #4) — LOW
- **MEH-EEE:** (Optional) Short-TTL access + refresh token infra for v2

## Out of scope
- Social-login provider phishing (Google/Apple OAuth flows) — covered by MEH-253
- Upload DoS via oversize files — separate concern, not a data-integrity issue

## Method & limitations
Static code review. No penetration testing, no live repro against
Railway. Finding #1 (rate-limit IP) should be confirmed by running
two distinct egress IPs against staging and observing whether the
counter is shared.
