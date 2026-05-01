# מהמקור — סקירת אבטחה מקיפה
> קרא CLAUDE.md קודם. בצע לפי סדר עדיפות. עדכן CLAUDE.md בסוף.

---

## סיכום — הפרצות הקריטיות לאתר שלך

אתר כמו מהמקור חשוף ל-7 סוגי תקיפות עיקריות:
SQL Injection, XSS, Broken Auth, Rate Limiting, File Upload,
IDOR (גישה לנתוני משתמשים אחרים), ו-Data Exposure.
כולן נפוצות ב-Yad2, Facebook Marketplace ואתרים דומים.

---

## ✅ 1. JWT Secret — SHIPPED (SECURITY FIX #1)

**Status:** fixed in production. This section stays as a regression-test
reference; the issue below no longer exists in the codebase.

```python
# backend/app/config.py — current behavior
SECRET_KEY = os.environ["JWT_SECRET_KEY"]    # required in production
ACCESS_TOKEN_EXPIRE_MINUTES = 15              # MEH-326: 15min (was 1440/24h)
REFRESH_TOKEN_EXPIRE_DAYS = 14               # MEH-326: 14d HttpOnly refresh cookie
```

- **Dev:** if `JWT_SECRET_KEY` is unset, `_load_settings()` generates an
  ephemeral per-process random secret and logs a loud warning. Tokens
  are invalidated on every restart — fine for dev, never for prod.
- **Prod (`ENV=production`):** if `JWT_SECRET_KEY` is unset, the app
  **refuses to start** with a `RuntimeError` ("SECURITY: JWT_SECRET_KEY
  must be set in production"). This is the key fail-fast guarantee.
- **Generation:** `python -c "import secrets; print(secrets.token_hex(32))"`
- **Token lifetime (MEH-326):** 15-minute access token + 14-day HttpOnly
  refresh cookie with rotation. Backend: `POST /auth/refresh` rotates both
  tokens on each use. Frontend: `withCredentials: true` + axios interceptor
  silently refreshes on 401. Backward compat: pre-MEH-326 tokens (no `scope`
  claim) still validate via fail-open in `get_current_user`.

> Historical note: earlier snapshots used a hardcoded dev default
> (`"mehamakor123"`-style). That has been replaced — see the
> `_DEV_SECRET_SENTINEL` + `_load_settings()` flow in `config.py`.

> **MEH-326 CSRF note:** The refresh cookie uses `SameSite=Lax`. Combined
> with the same-origin Next.js proxy (`/api/*` → Railway) and POST-only
> `/auth/refresh`, cross-site requests cannot trigger token rotation —
> no separate CSRF token needed. `SameSite=Strict` was rejected: it
> breaks legitimate top-level navigation flows.

### ✅ 2. Rate Limiting — SHIPPED (SECURITY FIX #2, corrected in MEH-256)

**Status:** slowapi decorators in place on all sensitive endpoints
with the limits below. MEH-256 closed the proxy-IP bypass: the limiter
now keys on the real client IP via `X-Real-IP` (set by Railway's edge,
unspoofable by client), with an XFF fallback and a `get_remote_address`
last resort. Empirical investigation (PR #293 probe, 2026-04-22)
confirmed `X-Real-IP` is always populated by Railway and cannot be
overwritten by client-sent headers.

**⚠️ NEVER use `get_remote_address` directly behind a proxy.** Use
`get_real_client_ip` from `backend/app/rate_limit.py`. Behind Railway
/ Cloudflare / nginx, `request.client.host` resolves to the proxy's
own IP (`100.64.0.X` on Railway's CGN range) — keying on it collapses
every user into one rate-limit bucket.

```python
# backend/app/rate_limit.py (canonical shape)
import os
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

_TRUTHY = frozenset({"1", "true", "yes", "on"})

def _trusted_proxy_enabled() -> bool:
    return os.getenv("TRUSTED_PROXY", "0").strip().lower() in _TRUTHY

def get_real_client_ip(request: Request) -> str:
    if _trusted_proxy_enabled():
        # 1. X-Real-IP — Railway edge sets this from its own TCP-peer
        #    view; unspoofable because Railway overwrites on ingress.
        real_ip = request.headers.get("x-real-ip", "").strip()
        if real_ip:
            return real_ip
        # 2. XFF[-2] — defensive fallback when ≥2 entries. Rightmost
        #    is always Railway's internal proxy; real client is [-2].
        #    Single-entry XFF is skipped — it's just what the client
        #    sent, so spoofable.
        xff = request.headers.get("x-forwarded-for", "")
        entries = [e.strip() for e in xff.split(",") if e.strip()]
        if len(entries) >= 2:
            return entries[-2]
    # 3. Last resort / local-dev: TCP peer. When TRUSTED_PROXY is
    #    unset, client-controlled headers are ignored — otherwise a
    #    directly-exposed deploy would let anyone spoof X-Real-IP.
    return get_remote_address(request)

limiter = Limiter(key_func=get_real_client_ip)

# Per-endpoint:
@router.post("/auth/login")
@limiter.limit("5/minute")        # per real client IP
def login(request: Request, ...):

@router.post("/auth/register")
@limiter.limit("3/hour")

@router.post("/home-products")
@limiter.limit("10/hour")

@router.post("/producers/{id}/reviews")
@limiter.limit("20/day")
```

**Deploy requirement:** `TRUSTED_PROXY=1` on Railway staging +
production backends. Without it, the key function falls through to
`get_remote_address` and the bug returns. See `docs/DEPLOYMENT.md` §D.

### 3. SQL Injection — השתמש תמיד ב-SQLAlchemy ORM

```python
# ❌ מסוכן — אל תעשי אף פעם:
query = f"SELECT * FROM producers WHERE city = '{city}'"

# ✅ בטוח — תמיד ככה:
stmt = select(Producer).where(Producer.city == city)
producers = session.scalars(stmt).all()

# ✅ חיפוש טקסט חופשי — בטוח:
stmt = select(Producer).where(
    Producer.name.ilike(f"%{search_term}%")
)
```

### 4. חשיפת מידע רגיש ב-API

```python
# ❌ מחזיר יותר מדי:
return user  # מחזיר password_hash, google_id, apple_id

# ✅ תמיד השתמשי ב-Response Schema:
class UserPublic(BaseModel):
    id: uuid.UUID
    name: str
    city: str
    # זהו! לא email, לא password_hash, לא role

class UserPrivate(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    city: str
    role: str
    # רק ל-/users/me — לא לציבור!

# בendpoint:
@router.get("/producers/{id}")
async def get_producer(id: str):
    producer = get_producer_by_id(id)
    return ProducerPublic.from_orm(producer)  # לא return producer
```

---

## 🟠 חשוב — תקן השבוע

### ✅ 5. IDOR — SHIPPED across all delete/update endpoints

**Status:** every delete/update endpoint in `home_products.py`,
`producer_me.py`, `favorites.py`, `reports.py`, `reviews.py`,
`events.py`, and `experiences.py` now checks ownership against
`current_user.id`, with an admin-override (`current_user.role == "admin"`)
fallback where appropriate. The pattern below is the canonical shape.

```python
# ✅ Canonical ownership check — used everywhere
@router.delete("/home-products/{id}")
def delete_listing(
    id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = db.query(HomeProduct).filter(HomeProduct.id == id).first()
    if listing is None:
        raise HTTPException(404)
    if listing.user_id != user.id and user.role != "admin":
        raise HTTPException(403, "אין הרשאה")
    db.delete(listing)
    db.commit()
```

Additional notes:

- **`POST /producers` historical gap:** this endpoint was public
  until April 2026 — anyone could create a pending producer row with
  no user association. Fixed in `feature/fix-producers-post-auth`
  (PR #33): now requires `get_current_user`. The public producer
  signup flow at `POST /auth/register/producer` was always correct.
- **`ProducerFollower` notification preferences:** each follower row
  stores `notify_new_products` + `notify_back_in_stock` booleans
  (`backend/app/models/models.py::ProducerFollower`). Reads and writes
  go through `/producers/{id}/follow` and friends; each route checks
  that the caller owns the follower row before returning/updating
  the flags. Admin override is intentionally **not** granted for
  these — notification preferences are personal data.
- **MEH-254 — `GET /producers/{uuid}` status filter:** pending/rejected
  producers may only be fetched by their owner (`viewer.producer_id ==
  producer.id`) or an admin. Anonymous or non-owner callers get the
  same 404 as a non-existent UUID, so the endpoint can't be used to
  enumerate queue state or leak pre-approval data (GDPR /
  חוק הגנת הפרטיות). The slug endpoint already filters to approved-only;
  keep both in sync when schema changes land.

### 6. העלאת קבצים — תמונות מסוכנות

```python
# backend/app/utils/file_upload.py

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

async def validate_and_upload_image(file: UploadFile) -> str:
    # 1. בדוק סוג קובץ (לא רק הסיומת!)
    content = await file.read(512)
    await file.seek(0)
    
    import magic
    mime_type = magic.from_buffer(content, mime=True)
    if mime_type not in ALLOWED_TYPES:
        raise HTTPException(400, "רק תמונות JPG/PNG/WebP מותרות")
    
    # 2. בדוק גודל
    file_size = 0
    async for chunk in file:
        file_size += len(chunk)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(400, "תמונה גדולה מדי (מקסימום 5MB)")
    
    # 3. העלה ל-Cloudinary (שם ייצור אוטומטי — לא שם הקובץ המקורי!)
    result = cloudinary.uploader.upload(
        file.file,
        folder="mehamakor",
        public_id=f"{uuid.uuid4()}",  # לא השם המקורי!
        resource_type="image",
        transformation=[{"width": 1200, "crop": "limit"}]
    )
    return result["secure_url"]
```

### 7. CORS — אל תאפשרי לכולם

```python
# backend/app/main.py

# ❌ מסוכן:
app.add_middleware(CORSMiddleware, allow_origins=["*"])

# ✅ רק הדומיינים שלך:
ALLOWED_ORIGINS = [
    "https://mehamakor.co.il",
    "https://www.mehamakor.co.il",
    "http://localhost:3000",  # רק ב-development!
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

### 8. HTTP Security Headers

```python
# backend/app/middleware/security.py
# pip install secure

import secure

secure_headers = secure.Secure()

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    secure_headers.framework.fastapi(response)
    
    # headers נוספים:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
    
    return response
```

```js
// frontend: next.config.js
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "img-src 'self' https://res.cloudinary.com https://images.unsplash.com data:",
      "script-src 'self' 'unsafe-inline' https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
    ].join('; ')
  },
]

module.exports = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}
```

---

### ✅ 8a. Analytics privacy (feature/producer-analytics, April 2026)

Two new invariants shipped with the analytics feature. Both are guarded
by tests (`tests/test_analytics.py`) and documented here so future
sessions know not to drift.

- **No raw IPs in the DB.** `producer_page_views.viewer_ip_hash` is a
  SHA-256 hex of `(request.client.host + SECRET_KEY[:32])`. Rotating
  the JWT secret (e.g. on credential leak) also rotates the analytics
  salt, limiting rainbow-table attacks across the old dataset. The
  hashing helper lives at `backend/app/services/analytics.py::hash_ip`
  and is the ONLY write path for the column — the Pydantic schema has
  no `viewer_ip` field that could accidentally bypass it.

- **Per-process in-memory sliding window for server_health (v1
  limitation).** `GET /admin/dashboard` exposes `response_time_avg_ms`
  and `requests_per_minute` over the last hour, computed from a bounded
  deque in `backend/app/services/analytics.py::_samples`. Three caveats
  to remember:
  - **Resets on every deploy.** Railway redeploys flush the deque. The
    dashboard panel shows "מחכה לתנועה..." for a minute post-deploy.
  - **Per-process.** If uvicorn ever runs with >1 worker, each worker
    keeps its own deque; the dashboard reflects whichever worker handled
    the `GET /admin/dashboard` request. The current Railway config runs
    a single worker, so this is a no-op in production — but flag it
    before scaling horizontally.
  - **Not durable.** There's no disk spill, no Prometheus push, no
    Grafana story. A v2 task in `docs/ROADMAP.md` could replace this
    with a real observability stack if the operator dashboard needs to
    survive restarts.

Both invariants are compatible with the April 2026 `/privacy` page
(`חוק הגנת הפרטיות תיקון 13, 2025`), which lists IP as "data collected"
— minimized + time-limited, not stored raw.

### ✅ 8b. Token Sidejacking Protection (MEH-327, April 2026)

**Threat:** attacker steals the JWT access token from `localStorage`
(e.g. via XSS) and replays it from a different origin or device. The
token alone was sufficient for full account access.

**Defence:** OWASP JWT Cheat Sheet "Token Sidejacking" pattern — bind
each access token to a browser-only HttpOnly cookie via SHA-256 hash.

**Mechanism:**
1. On every token-issuing event (login, register, OAuth, refresh,
   logout-all-devices), the backend generates a 50-byte random
   fingerprint (`secrets.token_hex(50)`), embeds its SHA-256 hash as
   the `userFingerprint` JWT claim, and sets the raw value as the
   HttpOnly `__Secure-Fgp` cookie.
2. `get_current_user` reads the cookie, hashes it, and compares to the
   claim. Mismatch or absent cookie → `401`. This gate runs **before**
   `_maybe_bump_last_active` so rejected tokens never write to the DB.

**`__Secure-Fgp` cookie spec:**

| Attribute | Value | Reason |
|---|---|---|
| `HttpOnly` | `True` | Not readable by JS — the whole point |
| `Secure` | `True` | Required by `__Secure-` prefix (RFC 6265bis) |
| `SameSite` | `Lax` | See deviation note below |
| `Path` | `/` | Required by `__Secure-` prefix |
| `max-age` | 14 days | Matches refresh cookie TTL — fingerprint must outlive the 15-min access token to avoid a timing edge-case where a live token arrives with an already-expired fp cookie |

**SameSite=Lax deviation from OWASP (which recommends Strict):**
`GET` cross-site navigations from email links (`/verify-email`,
`/reset-password`) arrive from the user's email client — a cross-site
top-level navigation. `SameSite=Strict` drops the cookie on those
navigations, breaking email verification and password-reset UX.
`Lax` still blocks cross-site `POST`/`AJAX` (the primary CSRF vector).
This deviation is intentional and documented here to prevent future
"simplification" to Strict without understanding the breakage.

**Backward compat (fail-open):** if `userFingerprint` is absent (pre-
MEH-327 tokens; max 15-min TTL window), `get_current_user` logs info
and passes. Mirrors the MEH-206 (`tv`) and MEH-326 (`scope`) patterns.

**Logout:** `POST /auth/logout` deletes `__Secure-Fgp` with `path=/`
matching `_set_fingerprint_cookie` exactly (wrong path = silent no-op).
`POST /auth/logout-all-devices` overwrites the cookie in the same
response as the new access token.

**Code locations:**
- `backend/app/auth.py` — `generate_fingerprint`, `hash_fingerprint`,
  `create_access_token(fingerprint_hash=)`, `get_current_user` gate
- `backend/app/routers/auth.py` — `_set_fingerprint_cookie`, 8 call
  sites, logout deletion
- `tests/test_api.py` — `TestFingerprintCookie` (6 regression tests)

### ✅ 8c. Dependency audits + Dependabot (MEH-330, April 2026)

Supply-chain CVE gate — pip-audit (backend) + npm audit (frontend) run
per-PR and weekly via cron. Dependabot opens weekly PRs to `staging` for
`pip`, `npm`, and `github-actions`.

**CI workflow:** `.github/workflows/dependency-audit.yml`
- Triggers: `pull_request` (paths-filtered to dep manifests), `schedule`
  (Mon 03:00 UTC = Mon 06:00 Asia/Jerusalem), `workflow_dispatch`.
- Two parallel jobs, each with `permissions: contents: read`
  (least-privilege `GITHUB_TOKEN`).
- Backend job: `uv run --with pip-audit pip-audit --strict` — audits the
  uv-managed venv directly (matches what ships).
- Frontend job: `npm audit --audit-level=high` — **NO `--omit=dev`**
  (dev-tool CVEs execute on machines that build the production
  artifact; supply-chain risk).
- **Sprint 1 mode: warn-only** (`continue-on-error: true`). Umbrella
  ticket MEH-336 tracks the baseline cleanup; flips to required after
  baseline cleared.

**Dependabot:** `.github/dependabot.yml`
- 3 ecosystems × weekly Mon 06:00 Asia/Jerusalem.
- All PRs target `staging` (never `main` per CLAUDE.md branch strategy).
- `open-pull-requests-limit: 5` per ecosystem.
- Labels: `dependencies` + `meh-330` (+ `ci` for actions).

**Baseline at MEH-330 ship (2026-04-26):**
- Frontend: 13 high / 6 moderate (`next`, `lodash`, `picomatch`,
  `rollup`, `serialize-javascript`, `glob`, etc.).
- Backend: 8 vulns across 5 packages (`pip`, `pyjwt`, `python-multipart`,
  `requests`, `starlette`).

**High-priority sub-tickets (auth-critical, opened pre-merge):**
- **MEH-337** — `pyjwt 2.9.0 → 2.12.0` (CVE-2026-32597, touches
  `backend/app/auth.py`).
- **MEH-338** — `starlette 0.41.3 → 0.49.1` (CVE-2025-62727, framework;
  coordinate FastAPI 0.115.6 compatibility).

## 🟡 בינוני — תקן החודש

### 9. XSS — ניקוי input מהמשתמש

**SHIPPED — MEH-329 (April 2026).** Defense-in-depth per ASVS V13.
React's automatic encoding remains the primary defense; this strips
HTML tags at the input layer so stored content is safe even if a
future component renders it via `dangerouslySetInnerHTML`.

- **Helper:** `backend/app/services/sanitization.py` →
  `sanitize_text(value, max_length)`. Strips all HTML tags via
  `bleach.clean(value, tags=[], strip=True)` and caps length.
- **Applied to** 30 fields across 11 schemas covering producers,
  home-products, experiences, events, reviews, ratings, and the
  contact form. See `CHANGELOG.md` MEH-329 entry for the full list,
  or `grep -rn "sanitize_text" backend/` for current coverage.
- **NOT applied to** email, phone, instagram, website, image URLs,
  slug, city, or user/producer name fields — see `<forbidden>` in
  the MEH-329 task spec for rationale.
- **Existing rows are NOT backfilled.** Sanitization runs on write
  only. There is no exploit vector today (React encodes everything);
  this is monitored if `dangerouslySetInnerHTML` is ever added to a
  user-supplied field. Two existing dSIH usages render `ld+json`
  schema only — see the eslint-disable comments in
  `frontend/app/[slug]/page.js` and `frontend/app/producer/[id]/page.js`.

```python
# Pattern used across the codebase (Pydantic v2):
from pydantic import field_validator
from app.services.sanitization import sanitize_text

class HomeProductCreate(BaseModel):
    description: str | None = None

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v):
        return sanitize_text(v, max_length=1000)
```

### 10. Environment Variables — אל תדליפי secrets

```bash
# .gitignore — ודאי שיש:
.env
.env.local
.env.production
*.pem
*.key

# .env.example — תעלי לגיט (בלי ערכים אמיתיים):
JWT_SECRET_KEY=change_me_to_random_64_chars
DATABASE_URL=postgresql://user:password@localhost/mehamakor
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_secret
APPLE_CLIENT_ID=com.mehamakor.app
```

### 11. Admin endpoint — הגנה כפולה

```python
# כרגע יש בדיקת role — טוב!
# הוסף גם IP whitelist לאדמין:

ADMIN_IPS = os.environ.get("ADMIN_IPS", "").split(",")

async def admin_only(
    current_user=Depends(get_current_user),
    request: Request = None
):
    if current_user.role != "admin":
        raise HTTPException(403)
    
    # אופציונלי — הגבל לIP שלך:
    # client_ip = request.client.host
    # if ADMIN_IPS and client_ip not in ADMIN_IPS:
    #     raise HTTPException(403)
    
    return current_user
```

### 12. Password Hashing — bcrypt בלבד

```python
# pip install passlib[bcrypt]
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# שמירה:
hashed = pwd_context.hash(plain_password)

# בדיקה:
is_valid = pwd_context.verify(plain_password, hashed_password)

# ❌ אל תשתמשי ב: MD5, SHA1, SHA256 (מהירים מדי = ניתן לפצח)
# ✅ רק: bcrypt, argon2, scrypt
```

### 13. Logging — אל תרשמי מידע רגיש

```python
import logging

# ❌ מסוכן:
logger.info(f"User login: {email} password: {password}")
logger.error(f"DB error: {str(e)}")  # עלול לחשוף נתונים

# ✅ בטוח:
logger.info(f"User login attempt: {email[:3]}***")
logger.error("Authentication failed", extra={"user_id": user_id})
logger.warning(f"Rate limit exceeded for IP: {ip}")
```

---

## 🟢 כדאי — תוסיפי בהדרגה

### 14. 2FA / אימות דו-שלבי לאדמין

```python
# pip install pyotp qrcode

import pyotp

# יצירת secret לאדמין (פעם אחת):
secret = pyotp.random_base32()

# אימות:
totp = pyotp.TOTP(secret)
is_valid = totp.verify(user_entered_code)  # קוד מ-Google Authenticator
```

### 15. Account Lockout — לאחר ניסיונות כושלים

```python
# ב-Redis או DB:
async def check_login_attempts(email: str) -> bool:
    key = f"login_attempts:{email}"
    attempts = await redis.get(key) or 0
    
    if int(attempts) >= 5:
        raise HTTPException(429, "חשבון נעול ל-15 דקות")
    
    return True

async def record_failed_attempt(email: str):
    key = f"login_attempts:{email}"
    await redis.incr(key)
    await redis.expire(key, 900)  # 15 דקות

async def clear_attempts(email: str):
    await redis.delete(f"login_attempts:{email}")
```

### 16. Audit Log — מי עשה מה

```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text,        -- 'approve_producer', 'delete_listing', 'login'
  target_type text,   -- 'producer', 'user', 'listing'
  target_id uuid,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
```

---

## 17. Skills supply chain (MEH-397)

Mehamakor loads 83 third-party skills via Claude Code's skill ingestion
mechanism. Each load is an opportunity for a malicious skill to read
source files, env vars, OAuth flows, or persist prompt-injection
instructions across sessions. Empirical baseline:

- Snyk ToxicSkills (Feb 2026) — 13.4% of 3,984 ClawHub skills with
  critical security issues; 76 confirmed malicious payloads
- Aguara — 31K+ skills, 485 critical findings
- Liu et al. — 26.1% with vulnerable patterns

Authorship of the 83 skills (after MEH-397):

| Source | Count | Verification |
|---|---|---|
| `pbakaus/impeccable` | 21 | named author |
| `coreyhaines31/marketingskills` | 38 | named author |
| `skills-il/localization` | 14 | **anonymous** — manual review required |
| `skills-il/security-compliance` | 9 | **anonymous** — manual review required |
| `local` (`ui-ux-pro-max`) | 1 | bypassed lock; Python scripts manually audited in MEH-397 |

### 5-layer defense

1. **Tool deny + WebFetch allowlist** (`.claude/settings.json` +
   PreToolUse hooks at `.claude/hooks/check-env-read.sh` and
   `.claude/hooks/check-webfetch-allowlist.sh`). Read on `.env` files
   blocked; WebFetch limited to 7 parent domains (github, anthropic,
   npmjs, pypi, mehamakor, vercel, railway). Hooks fail-closed if
   `jq` missing.
2. **Allowlist registry** (`.claude/skills-allowlist.json`) — 83
   entries; every skill on disk must be listed with a non-blocked
   verdict. Verdict `approved_local_unlocked` is a 30-day transitional
   slot for skills that bypassed the lock (currently
   `ui-ux-pro-max`).
3. **Audit script** (`.claude/scripts/audit-skills.sh`) — scans every
   `SKILL.md` for 4 pattern classes (network / exec / secret-name /
   prompt-injection). Combination of ≥2 classes in a single file =
   critical, exit 1. Self-test fixture at
   `.claude/scripts/test/fixtures/bad-skill/SKILL.md` proves the
   detector works. **Pass 4 (MEH-420)** also recomputes every locked
   skill's content hash via `compute-skill-hash.sh` and fails on
   `[HASH-DRIFT]` (content vs lock mismatch) or `[HASH-COMPUTE]`
   (symlink injection inside skill dir).
4. **CI gate + lock enforcement** (`.github/workflows/skills-audit.yml`)
   — runs on every PR touching skills, the lock, the audit / hash /
   backfill scripts, or the workflow. Three-stage: self-test must
   exit 1 (proves detection); real audit must exit 0 (proves clean
   content + matching hashes); `backfill-skill-hashes.sh --dry-run`
   must exit 0 (catches PRs that change skill content without
   rerunning the backfill). Any failure blocks merge.
5. **Documentation** — full policy in
   [.claude/rules/skills.md](../.claude/rules/skills.md), 4-step
   add-skill protocol, 30-day SLA on transitional verdicts.

#### Hash enforcement (MEH-420)

Before MEH-420, layer 4's lock was decorative — `computedHash` values
in `skills-lock.json` did not match actual `SKILL.md` SHA256s for any
of the 74 locked skills, and no script or workflow read the field. The
"5-layer defense" was functionally 4. MEH-402 adversarial review
surfaced the gap; MEH-420 closed it.

**Hash algorithm** — `.claude/scripts/compute-skill-hash.sh`:

- All regular files in the skill dir contribute (SKILL.md, SKILL_HE.md,
  reference/, references/, scripts/, data/, top-level JSON, anything else)
- Excludes only known noise: `.git/`, `__pycache__/`, `.DS_Store`, `*.pyc`
- Sorted byte-order via `LC_ALL=C sort -z` for cross-platform determinism
- Per-file digest = `sha256(<relpath>\0 + content + \0)`; final = `sha256` of concatenated digests
- Symlinks inside a skill dir fail-loud — they bypass `find -type f` so
  silent acceptance would create a tampering blind spot

**Backfill** — `.claude/scripts/backfill-skill-hashes.sh`:

- Default mode rewrites `skills-lock.json` atomically (tmp + jq validate + mv)
- `--dry-run` (= `--verify`) prints `OLD -> NEW` per drifted skill;
  exit 1 if any drift, exit 0 if clean
- A skill listed in the lock but missing from disk is fatal in either
  mode (named in the error message; never silently skipped)

**Threat model coverage:** the hash detects content edits, file additions,
file renames within a skill, and symlink injection. It does not cover
file modes (rwx) or directory mtimes — those aren't part of the prompt
injection / supply-chain threat model.

### Adding a new skill

See `.claude/rules/skills.md` Layer 5 (4-step protocol). Default
verdict `review_needed`. `skills-il/*` sources require an "Anonymous
author" note in the allowlist.

### Symlink mechanism

Skill content lives **once** at `.agents/skills/<name>/SKILL.md`. The
harness reads from `.claude/skills/<name>` (a symlink mode `120000`
to `../../.agents/skills/<name>`). Editing either path mutates the
same on-disk content. `ui-ux-pro-max` is the one exception — a real
directory under `.claude/skills/`, allowlisted as
`approved_local_unlocked` until lock-up.

---

## בדיקת אבטחה — הרץ ל-Claude Code

```
Run a security audit on the entire מהמקור codebase:

Use adversarial review:
1. FINDER: Find ALL security vulnerabilities in backend/ and frontend/
   Focus on: SQL injection, XSS, IDOR, exposed secrets, missing auth checks,
   unvalidated uploads, CORS issues, rate limiting gaps
2. ADVERSARY: Try to disprove each finding
3. REFEREE: List only confirmed real vulnerabilities

Then fix them all in order of severity (Critical → High → Medium).
Create SECURITY_REPORT.md with findings and fixes applied.
```

---

## עדכן CLAUDE.md:
```
עדכן CLAUDE.md:
## אבטחה — כללים קריטיים
- JWT_SECRET_KEY חובה מ-.env (לא hardcoded!)
- Rate limiting: slowapi — 5/min על login, 3/hour על register
- SQL: תמיד SQLAlchemy ORM — לא string formatting
- API responses: תמיד Response Schema — לא return model ישיר
- IDOR: בדוק user_id == current_user.id לפני כל עדכון/מחיקה
- File upload: בדוק MIME type + גודל + UUID שם קובץ
- CORS: רק mehamakor.co.il (לא *)
- Passwords: bcrypt בלבד
- Input: sanitize עם bleach על כל textarea
- Secrets: .env בלבד, .gitignore מעודכן
```

---

## תהליך האבטחה לפני עלייה לאוויר — 3 שלבים (Silviu Method)

### Step 1 — Security Review

שלחי ל-Claude Code:
```
Run a full security review of the entire מהמקור codebase.

Check every file in backend/ and frontend/ for:
- Hardcoded secrets or API keys
- SQL injection vulnerabilities (f-strings in queries)
- Missing authentication checks on endpoints
- IDOR vulnerabilities (no ownership check before delete/edit)
- XSS — unsanitized user input rendered in HTML
- Insecure file uploads (no MIME type check)
- CORS misconfiguration (allow_origins=["*"])
- Rate limiting missing on auth endpoints
- Sensitive data exposed in API responses
- Weak JWT configuration

Output a file called SECURITY_REPORT.md with:
- 🔴 Critical vulnerabilities (fix before deploy)
- 🟠 High (fix this week)
- 🟡 Medium (fix this month)
- ✅ Already secure
```

### Step 2 — Fix Issues

```
Read SECURITY_REPORT.md.
Fix ALL critical and high vulnerabilities now.
Fix medium vulnerabilities where possible.
Mark each fix with a comment: # SECURITY FIX: [description]
```

### Step 3 — Re-run Review

```
Re-run the security review from Step 1.
Compare to SECURITY_REPORT.md.
Confirm every 🔴 and 🟠 issue is now marked ✅.
If anything is still open — fix it before we continue.
Update SECURITY_REPORT.md with final status.
```

**כלל: אל תעלי לדומיין לפני שכל ה-🔴 הפכו ל-✅**
