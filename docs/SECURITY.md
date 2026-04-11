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
ACCESS_TOKEN_EXPIRE_MINUTES = 1440            # 24h — shortened from 7 days
```

- **Dev:** if `JWT_SECRET_KEY` is unset, `_load_settings()` generates an
  ephemeral per-process random secret and logs a loud warning. Tokens
  are invalidated on every restart — fine for dev, never for prod.
- **Prod (`ENV=production`):** if `JWT_SECRET_KEY` is unset, the app
  **refuses to start** with a `RuntimeError` ("SECURITY: JWT_SECRET_KEY
  must be set in production"). This is the key fail-fast guarantee.
- **Generation:** `python -c "import secrets; print(secrets.token_hex(32))"`
- **Token lifetime:** 24 hours (was 7 days; shortened in this fix). No
  refresh-token infra yet — users re-login daily. A 15-minute ideal
  would require implementing refresh tokens first; tracked as a v2
  item in ROADMAP.md, not a security blocker.

> Historical note: earlier snapshots used a hardcoded dev default
> (`"mehamakor123"`-style). That has been replaced — see the
> `_DEV_SECRET_SENTINEL` + `_load_settings()` flow in `config.py`.

### 2. Rate Limiting — חסום brute force

```python
# pip install slowapi

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# על כל endpoint רגיש:
@router.post("/auth/login")
@limiter.limit("5/minute")        # 5 ניסיונות בדקה
async def login(request: Request, ...):

@router.post("/auth/register")
@limiter.limit("3/hour")          # 3 הרשמות בשעה

@router.post("/home-listings")
@limiter.limit("10/hour")         # 10 פרסומים בשעה

@router.post("/ratings")
@limiter.limit("20/day")          # 20 דירוגים ביום
```

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

## 🟡 בינוני — תקן החודש

### 9. XSS — ניקוי input מהמשתמש

```python
# pip install bleach

import bleach

def sanitize_text(text: str, max_length: int = 1000) -> str:
    # הסר HTML tags לגמרי
    cleaned = bleach.clean(text, tags=[], strip=True)
    # חתוך לאורך מקסימלי
    return cleaned[:max_length].strip()

# בכל Pydantic model — הוסף validator:
from pydantic import validator

class HomeListing(BaseModel):
    title: str
    description: str
    
    @validator('title')
    def clean_title(cls, v):
        return sanitize_text(v, max_length=100)
    
    @validator('description')
    def clean_description(cls, v):
        return sanitize_text(v, max_length=500)
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
