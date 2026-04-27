# Smoke Test — post-deploy security-posture verification (MEH-259)

Six assertions against a running backend. Runs after every production
deploy. Exits 0 if all pass, 1 if any fail, 2 if misconfigured.

- Script: `scripts/smoke_test.py` (Python, logic)
- Wrapper: `scripts/smoke_test_prod.sh` (bash, invocation)
- Runtime budget: ~60 seconds total, ≤5s per check

## Why this exists

MEH-256 (rate limiter keyed on proxy IP) and MEH-260 (staging deploy
drift) both hid in plain sight for weeks. Local tests passed; the UI
looked fine; Railway's dashboard showed "Active". The user-facing
symptoms were subtle enough that nobody noticed.

This script gives up-to-date **external** evidence of whether the
security primitives documented in `docs/SECURITY.md` actually work
on the deployed code.

## How to run

```bash
# Production (default)
scripts/smoke_test_prod.sh

# Staging
scripts/smoke_test_prod.sh https://foodmamkor-staging.up.railway.app

# Any arbitrary backend
scripts/smoke_test_prod.sh https://some-other-host.example.com

# Or call the Python script directly — same result
python scripts/smoke_test.py https://mehamakor.online
```

Output ends in a summary block. Example failure:
```
❌ FAIL: check_rate_limit_enforcement
     Reason: expected 429 on the 6th login but all 6 returned 200
     Likely cause: rate limiter not firing — @limiter.limit removed from /auth/login, or key function broken
     How to fix: (1) verify @limiter.limit("5/minute") on backend/app/routers/auth.py::login; (2) check TRUSTED_PROXY=1 on Railway
```

## The seven checks

| # | Name | Passing behavior | Regression from |
|---|---|---|---|
| 1 | `check_rate_limit_enforcement` | 6 bad logins from same XFF IP → 6th returns 429 | — (invariant) |
| 2 | `check_idor_pending_producer` | `GET /producers/<pending-uuid>` anonymously → 404 | MEH-254 |
| 3 | `check_auth_required` | `GET /auth/me` without token → 401 | — (invariant) |
| 4 | `check_security_headers` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` set | — (invariant) |
| 5 | `check_cors_strict` | Preflight with `Origin: https://evil.example.com` → no `Access-Control-Allow-Origin: evil.example.com` echo | — (invariant) |
| 6 | `check_password_validation` | `POST /auth/register` with `password: "ab"` → 422 | MEH-248 |

Each failure prints a `cause:` (what likely went wrong) and a `fix:`
(where to look in the codebase or ops config). The fix hints are the
fastest path from red smoke-test to green.

## Environment variables

| Variable | Required? | Default | What it does |
|---|---|---|---|
| `PENDING_PRODUCER_UUID` | No | *(unset)* | UUID of a producer in `pending` or `rejected` status. Check 3 SKIPS when unset (reports as PASS with `SKIPPED` reason). |

The script is otherwise self-contained.

## What to do when a check fails

### Check 1 fails (rate-limit enforcement)
The limiter is not firing at all. The @limiter.limit decorator may have
been removed from `/auth/login`, OR the limiter key function returns a
value that differs on every call (so the counter never reaches 5).

Look at:
- `backend/app/routers/auth.py::login` — still has `@limiter.limit("5/minute")`?
- `backend/app/rate_limit.py::get_real_client_ip` — same return value for same XFF?

### Check 2 fails (IDOR)
Someone removed the status filter from `GET /producers/{id}` or the
deploy is running pre-MEH-254 code.

Look at `backend/app/routers/producers.py::get_producer` — should have
the post-lookup admin+owner check.

### Check 3 fails (auth required)
Someone removed the `get_current_user` dependency from `/auth/me`, or
Starlette middleware order changed so the dep doesn't run.

### Check 4 fails (security headers)
The headers middleware in `backend/app/main.py::add_security_headers`
was removed, mis-ordered, or an upstream middleware is now stripping
response headers.

### Check 5 fails (CORS strict)
`CORS_ORIGINS` env var on Railway got set to `*` OR includes a domain
that shouldn't be there. Most dangerous when combined with
`allow_credentials=True`.

### Check 6 fails (password validation)
`UserRegister.password` lost its `Field(min_length=8)` constraint, OR
the deploy is running pre-MEH-248 code.

## Adding a new check

One function + one line.

```python
# scripts/smoke_test.py

def check_my_new_thing(base_url: str) -> Check:
    name = "check_my_new_thing"
    url = f"{base_url.rstrip('/')}/some-endpoint"
    try:
        r = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        return Check(name=name, passed=False, reason=f"request failed: {e}", ...)
    if r.status_code == 200:
        return Check(name=name, passed=True)
    return Check(
        name=name,
        passed=False,
        reason=f"got {r.status_code}, expected 200",
        cause="...",
        fix="...",
    )


CHECKS: list[Callable[[str], Check]] = [
    check_rate_limit_enforcement,
    ...
    check_my_new_thing,     # ← one line
]
```

Keep each check:
- **Read-only** (no actual registrations, no real logins, no state change)
- **Fast** (≤5s; set timeouts)
- **Idempotent** (same inputs → same result; counter-aware checks like
  rate-limit isolation use per-check distinct XFF IPs to avoid
  poisoning each other)
- **Self-contained** (no dependencies on other checks having run)

## Out of scope

This script does NOT cover:
- UX behavior (no Playwright / Selenium)
- Performance / latency SLOs
- Full pytest suite — the smoke test is a fast external sanity
  check, not a replacement for `pytest tests/test_api.py`
- Destructive operations (account creation, deletion) — intentional,
  safer to keep read-only

## CI integration (deferred to follow-up)

Not wired into `.github/workflows/deploy.yml` yet. The plan:
1. Run manually against production for a week, build confidence
2. Once consistently green, add as a required step in the post-merge
   deploy workflow — gated on `continue-on-error: false` so drift
   blocks the pipeline from claiming success
3. Pair with MEH-244 (production-drift probe) for full coverage

## CC sandbox limitation

**Where to run smoke tests:** Smoke tests must execute from the user's local machine (or CI runner with internet egress) — NOT from Claude Code's sandbox. CC's egress proxy blocks `*.up.railway.app` domains. The smoke command is:

```bash
scripts/smoke_test_prod.sh https://foodmamkor-staging.up.railway.app
```

Expected: 6/6 (after MEH-357). If CC reports running smoke against Railway URL, do not trust the result without verifying from local.

## Related

- MEH-259 (this feature)
- MEH-254 → check 2 regression target (IDOR)
- MEH-248 → check 6 regression target (password validation)
- MEH-244 → production deploy drift this script will surface
- MEH-360 → CC sandbox egress limitation (smoke must run from local machine)
- `scripts/check_api_contract.py` — sibling verification tool that
  diffs frontend API calls against backend routes (MEH-245). Different
  scope — that one catches endpoint drift, this one catches security
  primitive drift.
