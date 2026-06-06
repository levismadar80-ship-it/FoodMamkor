# Security Checklist — מהמקור (MEH-258)

> **Pre-launch external-scan gate (MEH-564):** the eight TRAPs below are the per-PR gate; the pre-launch external scan (OWASP ZAP baseline + SecurityHeaders.com + Snyk Code) is the launch-day gate. Runbook: [`docs/research/pre-launch-security-scan-runbook.md`](research/pre-launch-security-scan-runbook.md). Run ~30 min before public launch; HIGH/CRITICAL findings block launch, MEDIUM file as Linear, LOW go to backlog.
>
> **When to use this doc:**
> Does your PR touch any of these? → check the relevant traps below.
>
> | Touched file/area | Traps to check |
> |---|---|
> | `backend/app/rate_limit.py` or any rate-limited endpoint | TRAP 1 |
> | Any GET endpoint with a UUID param | TRAP 2 |
> | Any new field on a Pydantic schema | TRAP 3 |
> | Any `if settings.X:` or `if env_var:` branch | TRAP 4 |
> | Any new auth/guard test (401/403/409) | TRAP 5 |
> | Any `db.delete(user)` or parent-row delete | TRAP 6 |
> | Any merge to `main` | TRAP 7 |
> | Any change to `pyproject.toml`/`uv.lock`/`package-lock.json` | TRAP 8 |
>
> **Forbidden:** abstract advice, generic OWASP links, traps we haven't
> actually hit. Every trap here has a MEH number — it happened.

---

## TRAP 1 — Rate limiter behind proxy (MEH-256)

**The broken pattern:**
```python
# ❌ BROKEN behind Railway/Cloudflare/Nginx
limiter = Limiter(key_func=get_remote_address)
```

**Why it breaks:** `request.client.host` returns the proxy's own IP
(`100.64.0.X` on Railway's CGN range) — all users collapse into one
bucket. Rate limiting stops working for everyone simultaneously.

**The fix:**
```python
# ✅ CORRECT
from app.rate_limit import get_real_client_ip
limiter = Limiter(key_func=get_real_client_ip)
```
File: `backend/app/rate_limit.py:83`

**Also required:** `TRUSTED_PROXY=1` in Railway env vars (staging +
prod). Without it `get_real_client_ip` falls through to
`get_remote_address` and the bug returns silently.

**Question to ask yourself:**
"If I send 10 requests from 10 different IPs through Railway, will
slowapi see 10 different IPs or 1?"

**How to verify:**
```bash
for i in 1 2 3 4 5 6; do
  curl -sI -X POST https://staging.mehamakor.online/api/auth/login \
    -H "Content-Type: application/json" \
    --data '{"email":"x@x.com","password":"wrongpass"}'
done
# All 6 should return 401. If 2nd+ return 429 from the first loop
# iteration, the limiter is keyed on proxy IP — bug is present.
```

---

## TRAP 2 — IDOR on GET by UUID (MEH-254)

**The broken pattern:**
```python
# ❌ BROKEN — any UUID visitor can access draft/pending records
@router.get("/producers/{producer_id}")
def get_producer(producer_id: UUID, db: Session = Depends(get_db)):
    return db.query(Producer).filter(Producer.id == producer_id).first()
```

**Why it breaks:** pending/rejected producers are exposed to anyone
with the UUID. Privacy leak and GDPR risk — status filter is missing.

**The fix:**
```python
# ✅ CORRECT — filter by status + owner/admin overrides
producer = db.query(Producer).filter(Producer.id == producer_id).first()
if not producer:
    raise HTTPException(404)

is_public = producer.status == "approved"
is_owner = viewer and viewer.producer_id == producer.id
is_admin = getattr(viewer, "role", None) == "admin"

if not (is_public or is_owner or is_admin):
    raise HTTPException(404)  # 404 not 403 — don't confirm existence
```
File: `backend/app/routers/producers.py:403`

**Question to ask yourself:**
"If an anonymous user has this UUID, should they see it? If not —
does my filter block it?"

**How to verify:**
```bash
# Create a producer in 'pending' status, capture its UUID.
# Hit GET /api/producers/{uuid} with no auth token.
# Expect 404. If you get 200 → IDOR present.
```

---

## TRAP 3 — Validation only in frontend (MEH-248)

**The broken pattern:**
```python
# ❌ BROKEN — password accepts any length
class UserRegister(BaseModel):
    email: EmailStr
    password: str  # no min_length!
```

**Why it breaks:** attacker bypasses the frontend and registers with
a 1-character password directly via `curl`. Frontend validation is
cosmetic — the schema is the contract.

**The fix:**
```python
# ✅ CORRECT — validation in the schema, not the component
from pydantic import Field

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
```

**Question to ask yourself:**
"What happens if someone bypasses the frontend and calls my endpoint
directly with `curl`? Does my Pydantic schema catch the bad input?"

**How to verify:**
```bash
curl -X POST https://staging.mehamakor.online/api/auth/register \
  -H "Content-Type: application/json" \
  --data '{"email":"test@test.com","password":"x"}'
# Expect 422 with a validation error. If you get 201 → TRAP 3 present.
```

---

## TRAP 4 — Silent failures (MEH-163, MEH-240)

**The broken pattern:**
```python
# ❌ BROKEN — silent skip when env var is missing
if settings.admin_email:
    send_email(settings.admin_email, subject, body)
# No else — if ADMIN_EMAIL is deleted from Railway env,
# notifications stop with zero indication.
```

**Why it breaks:** env var deleted from Railway → feature silently
stops → discovered weeks later when a moderation queue fills up
with no admin notification. Zero logs, zero errors, zero alerts.

**The fix:**
```python
# ✅ CORRECT — log every skip
if settings.admin_email:
    send_email(settings.admin_email, subject, body)
else:
    logger.warning(
        "admin_notify_skipped",
        reason="admin_email_not_configured",
        context={"producer_id": str(producer.id)},
    )
```

**Question to ask yourself:**
"For every `if settings.X:` branch in my PR — what happens in
the `else`? Is it observable? Would I know within 24h if it
silently stopped working?"

**How to verify:**
Temporarily unset the env var in `.env.local` and trigger the
flow manually. Check logs — you must see the skip logged.

---

## TRAP 5 — Test doesn't exercise the assumption (MEH-241)

**The broken pattern:**
```python
# ❌ BROKEN — claims to test 401 guard, actually tests schema
def test_post_review_requires_auth():
    response = client.post("/reviews", json={"stars": 5})
    assert response.status_code == 401
    # Actually returns 422 — schema rejects {"stars":5} missing "body".
    # The 401 guard is never reached.
```

**Why it breaks:** FastAPI validates the request body before running
`Depends(get_current_user)` when the body param precedes the auth dep
in the function signature. A 422 proves nothing about the guard.
Schema evolves → test silently becomes meaningless.

**The fix:**
```python
# ✅ CORRECT — schema-valid payload so the guard is actually reached
def test_post_review_requires_auth():
    response = client.post("/reviews", json=valid_review_payload())
    assert response.status_code == 401
```
Use `valid_*_payload()` fixtures from `tests/conftest.py`. Schema
changes must update fixtures — not silently invalidate the test.

**Question to ask yourself:**
"If I change the schema tomorrow and add a required field, will my
guard test still reach the auth check? Or will it return 422 first?"

**How to verify:**
Add a required field to the schema temporarily. Re-run the guard
test. If the status code changes from 401 to 422 → TRAP 5 present.

---

## TRAP 6 — Cascade forgotten (MEH-249)

**The broken pattern:**
```python
# ❌ BROKEN — delete user, Producer row stays forever
@router.delete("/auth/me")
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(user)
    db.commit()
    # Producer row still in DB → ghost listing in directory
```

**Why it breaks:** user's Producer row survives — public browse shows
listings for deleted accounts. `/auth/me` 404s but the producer page
still returns data.

**The fix:**
```python
# ✅ CORRECT — explicit cleanup before deleting parent
if producer := db.query(Producer).filter(
    Producer.user_id == user.id
).first():
    db.delete(producer)
    db.flush()
db.delete(user)
db.commit()
```
Or add `ondelete="CASCADE"` to the FK at the model level — but verify
Railway's Postgres version supports it before relying on it.

**Question to ask yourself:**
"What rows in other tables have a FK pointing at the row I'm deleting?
Do I have `ondelete=CASCADE`, `SET NULL`, or explicit cleanup code?"

**How to verify:**
```bash
# After deleting a producer account via the API:
psql $DATABASE_URL -c "SELECT id FROM producers WHERE user_id = '<deleted-user-id>'"
# Expect 0 rows. Any result → TRAP 6 present.
```

---

## TRAP 7 — Staging ≠ Production (MEH-244, MEH-260)

**The broken pattern:**
Merged to `staging`, verified on `staging.mehamakor.online`, assumed
`mehamakor.online` reflects the same code.

**Why it breaks:** Railway auto-deploy can fail silently — wrong
branch configured, BuildKit rejection, or deploy succeeded but
container crashed before health check. We ran staging-only for
*weeks* without knowing production was stale (MEH-260).

**The fix (process):**
```bash
# After every merge to main, run:
python scripts/check_api_contract.py \
  --cross-env \
  --staging https://foodmamkor-staging.up.railway.app/ \
  --prod https://mehamakor.online/
# Any endpoint that returns 200 on staging but 404 on prod → deploy drift.
```

**Question to ask yourself:**
"Is the code I see on GitHub actually running in production right now?
When did Railway last deploy to prod — and did it succeed?"

**How to verify:**
```bash
curl -sI https://mehamakor.online/api/health | grep -E "200|date"
# Check the `date` header — if it's more than 30 min old after a push,
# the deploy didn't fire. Check Railway dashboard → Deployments.
```

---

## TRAP 8 — Dependency CVE backlog (MEH-330 baseline → MEH-336 gate, April–May 2026)

**The broken pattern:**
A dep audit job is added to CI; on first run it surfaces a backlog of
existing CVEs. Reflex reaction is one of:
- silently `--omit=dev` to drop the count,
- bump `--audit-level` from `high` to `critical`,
- flip the gate to `continue-on-error: true` *without* a tracking ticket
  and forget about it.

All three weaken the bar without paying down the debt.

**Why it breaks:**
The first audit gives you the only honest baseline you'll ever have. If
you mask it, you never know when you regressed *from* it (e.g. a new dep
brings in another vulnerable transitive). The MEH-330 baseline at ship
date (2026-04-26) was:

- **Frontend (`npm audit --audit-level=high`):** 13 high / 6 moderate.
  Top offenders: `next` (5 advisories), `lodash`, `serialize-javascript`
  (via `next-pwa`), `rollup` (via `@sentry/nextjs`).
- **Backend (`uv run --with pip-audit pip-audit`):** 8 vulns across
  `pip` / `pyjwt` / `python-multipart` (×2) / `requests` (×2) /
  `starlette` (×2).

**Status (MEH-336 close, 2026-05-01):** baseline cleared. Backend = 0
vulns; frontend = 0 high / 0 critical at the configured threshold (4
moderate from `postcss < 8.5.10` via `next` remain below the gate).
`.github/workflows/dependency-audit.yml` is now blocking
(`continue-on-error: false`) — new high/critical CVEs in either ecosystem
will fail the PR.

**Fix pattern (for future audit gates):**
1. Land the audit gate as `continue-on-error: true` with a TODO comment
   referencing an umbrella tracking ticket (here: **MEH-336**).
2. Open per-package follow-up tickets — auth/framework first
   (**MEH-337** pyjwt CVE-2026-32597, **MEH-338** starlette
   CVE-2025-62727).
3. Document the baseline counts in `docs/SECURITY.md §8c` so future
   sessions know which findings are pre-existing vs newly introduced.
4. Flip `continue-on-error: false` only after the umbrella ticket closes
   (MEH-336 closed 2026-05-01).

**File:line of the canonical fix:**
- `.github/workflows/dependency-audit.yml` — required gate +
  `permissions: contents: read` per job.
- `.github/dependabot.yml` — weekly automated bump PRs.
- `docs/SECURITY.md §8c` — baseline + status + sub-ticket index.

**Question to ask yourself:**
Did my PR change `pyproject.toml`, `uv.lock`, `package.json`, or
`package-lock.json`? If yes, did the dependency-audit workflow run, and
did it pass? With the gate now blocking, a single new high or critical
CVE will fail the PR — bump the dep, or open a follow-up ticket and
discuss the threshold before pushing through.

**How to verify:**
```bash
# Backend
cd backend && uv run --with pip-audit pip-audit
# Frontend
cd frontend && npm audit --audit-level=high
```

Both must exit 0. A new high/critical finding either gets fixed in the
same PR (preferred) or a follow-up ticket is opened and the threshold
discussed before merge.

---

## Required env vars (staging vs prod)

Vars that are frequently missing and cause silent bugs:

| Var | Missing → | Staging set? | Prod set? |
|---|---|---|---|
| `JWT_SECRET_KEY` | App refuses to start (prod) or ephemeral secret (dev) | ✅ | ✅ |
| `TRUSTED_PROXY` | Rate limit bypass (TRAP 1) | must be `1` | must be `1` |
| `RESEND_API_KEY` | Email silent-fail | ✅ | ✅ |
| `ANTHROPIC_API_KEY` | AI fail-open (moderation=APPROVED) | optional | optional |
| `ADMIN_EMAIL` | Moderation notifications silent-fail (TRAP 4) | verify | verify |
| `CORS_ORIGINS` | Frontend blocked by CORS | ✅ | ✅ |

---

## PR checklist (copy into PR description when touching auth/security)

```
- [ ] TRAP 1 (rate limit): `get_real_client_ip` preserved, `TRUSTED_PROXY=1` set
- [ ] TRAP 2 (IDOR): GET-by-UUID endpoints filter by status + owner/admin
- [ ] TRAP 3 (validation): schema-level, not frontend-only
- [ ] TRAP 4 (silent failures): every `if settings.X:` has a logged else
- [ ] TRAP 5 (tests): guard tests send schema-valid payloads
- [ ] TRAP 6 (cascade): parent-row deletes clean up FKs
- [ ] TRAP 7 (deploy): verified prod post-merge via cross-env probe
- [ ] TRAP 8 (deps): if manifest changed, dependency-audit CI passed (gate is blocking; new high/critical CVEs require a fix in this PR or a follow-up ticket before merge)
```

---

## Adding a new trap

When a new production incident happens, add here:

1. `## TRAP N — Name (MEH-XXX)`
2. Broken pattern code block — the exact code that shipped
3. Why it breaks — one concrete sentence, no abstract theory
4. Fix code block — the exact replacement
5. File:line of the canonical fix in this codebase
6. Question to ask yourself — one line
7. How to verify — a runnable command or step

---

## 2026-06 audit — watch items (DRAFT, Refs MEH-258 — review before promoting)

> **Status / honesty note.** This section is a **draft for review**, not yet
> promoted to a TRAP. The 8 TRAPs above are confirmed production incidents;
> the items below are findings from the in-progress `docs/audits/2026-06-full-audit.md`
> (only **Phase 0 / AUD-001..008** complete at the time of writing — Phases A–D
> are empty skeletons, so the digest's "AUD-001..056" is aspirational). Each
> line is one trap + how-to-check + file/AUD ref. Promote a line to a numbered
> TRAP only once its audit phase confirms it and a fix ships.

### Per-category quick index (where each known trap lives)

| Category | Known traps | Check |
|---|---|---|
| Auth / JWT | TRAP 3 (validation), AUD-002 (pyjwt) | schema-level validation; pyjwt only in Apple verifier, RS256 pinned |
| Rate limiting / proxy | TRAP 1 (proxy IP) | `get_real_client_ip` + `TRUSTED_PROXY=1` |
| Middleware / proxy desync | AUD-004 (starlette Host-header) | middleware reads `scope` path, not `request.url.path` |
| IDOR / ownership | TRAP 2 (GET-by-UUID) | status + owner/admin filter, 404 not 403 |
| Schema / data integrity | TRAP 6 (cascade), MEH-265 (drift) | FK cleanup; one schema authority (Alembic) |
| Secrets / silent-fail | TRAP 4 (silent skip), MEH-265 | every `if settings.X:` logs its else |
| Tests | TRAP 5 (422-masks-403) | guard tests send schema-valid payloads |
| Dependencies | TRAP 8 (CVE gate), AUD-002/003/004 | `pip-audit` / `npm audit` exit 0 |
| Frontend | AUD-007 (object-injection) | line-level review of `obj[key]` writes |

### New watch items (from the 2026-06 audit)

- **[AUD-002] `pyjwt==2.12.0` — 5 advisories (alg allow-list bypass, HMAC
  key-confusion, PyJWKClient SSRF/DoS).** YELLOW. Current usage mitigates the
  headline CVEs (only in the Apple Sign-In verifier; `algorithms=["RS256"]`
  pinned, JWKS from Apple's fixed endpoint, no `PyJWKClient`/`jku`; app's own
  tokens use `joserfc`). **Check:** `algorithms=` stays pinned on any refactor;
  bump `pyjwt → 2.13.0` at next dep refresh (auth file → workflow rule 5a CVE
  check). **File:** `backend/app/services/oauth_verifiers.py:164,198`.

- **[AUD-003] `python-multipart==0.0.26` — multipart header DoS
  (CVE-2026-42561).** YELLOW, confirmed. No limit on part-header count/size;
  reachable unauthenticated at the parse layer via `routers/upload.py`.
  **Check:** bump `python-multipart → 0.0.27`; interim mitigation = body-size
  limit at the proxy. **File:** `backend/pyproject.toml` (direct dep).

- **[AUD-004] `starlette==0.49.3` — Host-header `request.url` path desync
  (PYSEC-2026-161).** YELLOW, **pending Audit-A confirmation**. Any security
  decision made from `request.url.path` (rebuilt from the unvalidated `Host`
  header) can diverge from the routed path. **Check:** confirm `middleware.py`
  gates on the ASGI `scope` path, not `request.url.path`; bump starlette (via
  fastapi) to a patched line. **File:** `backend/app/middleware.py` (review).

- **[AUD-007] eslint security clusters — `security/detect-object-injection`
  ×122, `react-hooks/set-state-in-effect` ×40.** YELLOW, **pending Audit-B**.
  High-FP rule, but 122 hits can hide one genuine user-controlled `obj[key]`
  write (prototype pollution). **Check:** line-level review of bracket-write
  sinks where the key is user-controlled. **File:** `frontend/` (see
  `raw/eslint.txt`).

- **[MEH-265] Two parallel schema mechanisms (post-mortem).** The drift
  between `Base.metadata.create_all` and `_migrate_columns()` broke production
  login — both "worked" independently so neither surfaced an error. **Check:**
  `grep -r "create_all\|metadata.create\|_migrate" backend/ --include="*.py"` —
  there must be exactly **one** schema authority (Alembic). `_migrate_columns`
  was removed in MEH-267; if a second owner reappears, delete it (don't
  disable). **File:** `backend/app/main.py`, `.claude/rules/db.md`.
