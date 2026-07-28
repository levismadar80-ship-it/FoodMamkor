# Audit P1/8 — Security: backend

> **Read-only pass.** This document reports exposures; it changes nothing. Every fix that
> follows from it is **RED-tier** and goes through Sapir as its own ticket, chunk-by-chunk —
> never auto-merged. No exploit payloads or proof-of-concept appear here: each finding carries
> a vector description and `file:line` only.
>
> Framework mapping: **OWASP Top 10:2025** + **ASVS** + **CWE**.

---

## 1 · Snapshot

| | |
|---|---|
| **Baseline SHA** | `114e4c847617495a71058e180007797dfc83533f` (`114e4c84`) |
| **Commit date** | `2026-07-28T15:38:11+03:00` |
| **Audit date** | 2026-07-28 |
| **Pass** | P1/8 — security backend (epic MEH-1721) |
| **Scope** | `backend/app/**` — 35 router files, 191 routes, 25,003 LOC |

```bash
git fetch origin
git checkout 114e4c847617495a71058e180007797dfc83533f
```

**How the baseline was read.** `staging` had already advanced past the pin when this pass ran,
so all audit reads were taken from a worktree detached at `114e4c84`, not from the branch tip.
Independently verified that this makes no difference to the subject under audit:
`git diff 114e4c84 origin/staging -- backend/` is **empty** — the backend is byte-identical at
both SHAs, and the drift is entirely frontend. `git rev-parse --is-shallow-repository` → `false`.

---

## 2 · Findings summary

> ### ⚠️ CORRECTION — 2026-07-28, after publication (MEH-1743)
>
> **F-1, F-2 and F-3 were originally rated 🟠 High / 🟡 Low and described as "live on `main`".
> That was wrong. All three are unreachable, and their corrected severity is ⚪ latent.**
>
> The `home_products` router is **not mounted**: the module is absent from the import tuple
> (`backend/app/router_registry.py:30-36`) *and* `app.include_router(home_products.router)` is
> commented out (`:61`), disabled under **MEH-1406 per the brand LOCK** (licensed businesses
> only). `TestHomeProductsKillSwitch` (`tests/test_api.py:4265-4296`) asserts every
> `/home-products*` endpoint returns **404**. No request reaches those handlers.
>
> **Root cause of the error — code identity was mistaken for reachability.** The original pass
> verified `git diff 114e4c84 origin/main -- backend/app/routers/home_products.py` was empty and
> concluded "live in production". The file *is* identical on `main`; it is simply never routed to.
> The authorization matrix was built from `@router.<verb>` decorators inside `routers/` and never
> consulted `router_registry.py`, so an unmounted module is indistinguishable from a mounted one.
> **This is a structural blind spot of the method, not a typo** — see §4.1a, and P2–P8 must
> include a mount check.
>
> The underlying code defects are real and the analysis of them stands; they are **dead code**
> while the router stays unmounted, and would become live if it is ever re-mounted.

| Severity | Count |
|---|---:|
| 🔴 Critical | **0** |
| 🟠 High | **0** ~~2~~ |
| 🟡 Low | **1** ~~2~~ |
| ⚪ Info / latent | **5** ~~2~~ |
| **Total** | **6** |

**STOP condition not triggered.** The epic's rule is *"🔴 Critical exposed on production (`main`)
→ halt the sweep and report before continuing."* No finding reached Critical, so the sweep ran to
completion. After the correction above, **no finding is live in production at all**.

| ID | Sev (corrected) | Title | OWASP / CWE | Reachable? | Fix |
|---|---|---|---|---|---|
| **F-1** | ⚪ latent ~~🟠 High~~ | Rating aggregate and its auto-hide trigger are manipulable by a single user | A04:2025 Insecure Design / CWE-840 | **No — router unmounted** | M |
| **F-2** | ⚪ latent ~~🟠 High~~ | Click endpoint discloses the phone of hidden/deactivated listings, bypassing the MEH-386 BOLA gate | A01:2025 Broken Access Control / CWE-639 | **No — router unmounted** | S |
| **F-3** | ⚪ latent ~~🟡 Low~~ | Public unauthenticated write with no rate limit (`POST /home-products/rate/{token}`) | A04:2025 / CWE-770 | **No — router unmounted** | S |
| **F-4** | 🟡 Low | PII prefill lookup has no rate limit | A01:2025 / CWE-770 | **Yes** — `prefill_router` mounted at `router_registry.py:82` | S |
| **F-5** | ⚪ Info | Comment in `verify_google_token` contradicts the code's (safe) behaviour | — | Yes | S |
| **F-6** | ⚪ Info | Git-history secret scan **not measured** — `gitleaks` unavailable | — | n/a | — |

Every fix is **RED risk-tier** (`auth`/`security` → never auto-merge), per the epic §5 and
`.claude/rules/workflow.md` → Risk-tiered review frequency.

**Remediation status.** F-1/F-2/F-3 are blocked at **MEH-1743**: ADR-017 §3.1 requires an
exploit-proving test that fails before the fix, which cannot be written against a 404, and
mounting the router to enable one is hard stop §4.1 (LOCK). F-4 is being fixed. Running log:
[remediation-log.md](./remediation-log.md).

---

## 3 · `/security-review` — what it returned, and why

The ticket requires running the built-in command and integrating its output. It was run. **It
returned zero findings, and that result carries no information about this codebase.**

`/security-review` reviews **a branch diff** — its prompt is built from `git diff origin/HEAD...`,
`FILES MODIFIED`, and `COMMITS`. The audit branch is cut from `staging` and contains only this
report, so all three inputs were empty and the command had nothing to analyse. Recorded verbatim:

```
GIT STATUS:      On branch feature/meh-1724-audit-p1-security-backend
                 nothing to commit, working tree clean
FILES MODIFIED:  (Bash completed with no output)
COMMITS:         (Bash completed with no output)
DIFF CONTENT:    (Bash completed with no output)
```

A null result from a diff-scoped tool pointed at an empty diff is **not** evidence the backend is
clean. It is the correct output for the question it was asked. One incidental prerequisite: the
command aborts unless `refs/remotes/origin/HEAD` exists (`fatal: ambiguous argument
'origin/HEAD...'`); `git remote set-head origin staging` fixes it — a local ref, no repository
content touched.

**Everything in §4–§10 is the manual pass**, which is where the per-route authorization matrix
lives. That matrix is the part a diff-scoped tool structurally cannot produce.

---

## 4 · Authorization matrix

Extracted by AST parse of every `@<router>.<verb>(...)` decorator in `backend/app/routers/`
(script in Appendix A2 — it resolves each decorator against **its own** `APIRouter` object, so
files declaring more than one router report correct paths).

### 4.1 Totals — reconciled

| Metric | Value |
|---|---:|
| Router files | 35 |
| **Routes total** | **191** |
| Routes with a **required** auth dependency | 130 |
| — of which the dependency itself enforces a **role** | 94 |
| Routes with **optional** auth only | 10 |
| Routes with **no** auth dependency | 51 |
| Routes carrying a `@limiter.limit` | 68 |

> **⚠️ These 191 are routes *declared*, not routes *reachable*. 14 of them are in unmounted
> modules — see §4.1a. Reachable total is 177.**

**Reconciliation (the P0 truncation lesson applied).** The three auth buckets sum to
`130 + 10 + 51 = 191` — the extractor's own total, no row unaccounted for. The route count was
cross-checked against an independent grep, which initially disagreed (188 vs 191); the 3-route
delta resolved exactly and is not an error in either:

```
186  @router.{get,post,put,patch,delete}   ← what P0 counted
+ 2  @router.head                          ← P0's grep omitted HEAD
+ 3  @prefill_router / @admin_router       ← secondary router objects
= 191
```

The dependency histogram is likewise cross-checked against a raw `grep -o 'Depends(...)'`:
`require_admin` 64 · `get_current_user` 33 · `require_producer` 27 · `require_verified_producer` 3 ·
`require_verified_email` 3 · `get_current_user_optional` 8 · `get_current_user_lenient` 2 — both
methods agree.

### 4.1a Mounted vs declared — the blind spot this pass had (added by the MEH-1743 correction)

A `@router.get(...)` decorator proves a handler *exists*. It does not prove the handler is
*reachable*: FastAPI only serves it if `app.include_router(...)` is called for that router in
`backend/app/router_registry.py`. The original pass never checked that file, so an unmounted
module looked exactly like a mounted one — which is how F-1/F-2/F-3 were rated as live.

Corrected inventory:

| Metric | Value |
|---|---:|
| Router modules on disk | 34 |
| Modules actually mounted | 32 |
| **Unmounted modules** | **2** — `home_products`, `producer_follows` |
| Routes declared | 191 |
| Routes in unmounted modules | 14 (`home_products` 10 · `producer_follows` 4) |
| **Routes reachable** | **177** |

| Module | Why unmounted |
|---|---|
| `home_products` | **Deliberate.** `router_registry.py:55-61` — commented out under MEH-1406, *"disabled per brand LOCK (licensed businesses only)"*. A reversible unmount requiring **both** the import and the include to be restored; neither is. Pinned by `TestHomeProductsKillSwitch`. |
| `producer_follows` | **Not referenced at all** — absent from both the import tuple and the include block, with no explanatory comment. Whether that is deliberate or drift is **not determined by this pass**; it carries no P1 finding because nothing in it is reachable. Worth a look in P5 (dead code). |

**Every later pass must apply this check.** The rule: a finding's severity is capped by its
reachability, and reachability is decided in `router_registry.py`, not in the router file.

### 4.2 The auth dependency vocabulary

Verified against `backend/app/auth.py:233-403`. An earlier draft of the extractor knew only
`get_current_user`/`require_admin` and consequently reported 94 routes as unauthenticated,
including every `/producers/me/*` route — visibly wrong, and corrected before any conclusion was
drawn from it.

| Dependency | `auth.py` | Guarantee |
|---|---:|---|
| `get_current_user` | 233 | Valid JWT · user exists · not blocked · scope/version/fingerprint checked |
| `require_admin` | 355 | above + `role == "admin"` |
| `require_producer` | 363 | above + `role == "producer"` |
| `require_verified_email` | 385 | above + `email_verified` |
| `require_verified_producer` | 394 | `require_producer` + `email_verified` |
| `get_current_user_optional` | 282 | No credential → `None`; **invalid credential → 401 propagates** |
| `get_current_user_lenient` | 322 | No/invalid credential → `None`; blocked user still 403 |

### 4.3 Admin surface — clean

**All 64 `/admin*` routes are gated by `require_admin`. Zero exceptions.**

```
routes matching /admin*                    : 64
of those NOT gated by require_admin        : 0
```

This is the single strongest result in the pass. `require_admin` composes on top of
`get_current_user`, so each of the 64 inherits the full token-validation chain.

### 4.4 IDOR sweep — both candidates cleared

Query: authenticated **and** takes a resource id **and** no ownership comparison in the body
**and** not admin-gated. Two candidates; **both verified against source and both are false
positives of the heuristic**, not vulnerabilities.

| Candidate | Verdict |
|---|---|
| `PUT /producers/me/locations/{location_id}` — `producer_me.py:1338` | **Not a vulnerability.** Ownership is enforced through the helper `_get_owned_location` (`producer_me.py:1242-1253`), which the regex could not see: it looks the row up by id alone, returns **404** when absent and **403** when it belongs to another producer. Carries the `MEH-1421 IDOR` marker and cites the repo's own rule. Textbook-correct. |
| `POST /home-products/{product_id}/whatsapp-click` — `home_products.py:333` | Not owner-scoped **by design** (any consumer may click any listing). It does, however, carry a separate real defect — see **F-2**. |

The `/producers/me/*` family is ownership-safe **structurally**: every route resolves its target
through `user.producer_id` taken from the token rather than from the request
(`producer_me.py:1301`, `:1321`, `:1347`, `:1383`), so a caller has no parameter with which to
reach another producer's rows.

### 4.5 The 51 unauthenticated routes

Reviewed individually. **50 are legitimately public** — health probes, catalog reads, search,
the auth endpoints themselves (which cannot require auth), and two webhook paths whose
authentication is cryptographic rather than session-based (§6). The 51st is the prefill lookup
in **F-4**. Full list in Appendix A4. Of these, 19 are mutating (`POST`/`PUT`/`PATCH`/`DELETE`);
17 of the 19 carry a rate limit, and the 2 that do not are **F-3** and the HMAC-verified webhook.

---

## 5 · JWT

Reviewed `backend/app/auth.py` + `backend/app/config.py`. **No finding.** Recorded because the
absence of a finding here is itself a result.

| Property | Value | Evidence |
|---|---|---|
| Algorithm | `HS256` | `config.py:28` |
| Access-token TTL | **15 minutes** | `config.py:35`, applied `auth.py:44` |
| Refresh-token TTL | 14 days | `config.py:36`, applied `auth.py:68` |
| Secret source | env (`JWT_SECRET_KEY`/`SECRET_KEY`) | `config.py:127` |
| Missing secret in **production** | **Hard `RuntimeError` at boot** | `config.py:161-166` |
| Missing secret in dev | Ephemeral `secrets.token_hex(32)` + warning | `config.py:171-177` |
| Scope separation | `scope="access"` vs refresh | `auth.py:45-50` |
| Revocation | `token_version` counter | `auth.py:274` |
| Password-change invalidation | enforced | `auth.py:273` |
| Fingerprint binding | enforced | `auth.py:275` |
| Blocked-account check | 403 inside `get_current_user` | `auth.py:270-271` |

A 15-minute access TTL with a version counter, password-change invalidation, and fingerprint
binding is materially stronger than the "HS256, 24h TTL" that `.claude/rules/security.md`
records as the invariant. **The rule text understates what the code does** — worth correcting in
the rule file, but that is a docs change and out of scope for this pass.

### OAuth

Both providers verify the ID token **server-side** against the provider's keys:

- **Apple** — `oauth_verifiers.py:158-209`: JWKS `kid` match, `audience=settings.apple_client_id`,
  `issuer="https://appleid.apple.com"`, plus a single JWKS refetch on `kid` miss for key rotation.
- **Google** — `oauth_verifiers.py:211-228`: `google_id_token.verify_oauth2_token(...,
  settings.google_client_id)`, which validates signature, `aud`, `iss`, and `exp`.

**On the `state` parameter, which the acceptance criteria asks about: it does not apply here, and
its absence is not a gap.** `state` defends the *authorization-code redirect* flow against CSRF on
the callback. This backend implements neither a redirect nor a callback — there is no
`redirect_uri`, no `code` exchange, and no `/callback` route anywhere in `auth.py`. The client
obtains an ID token from the provider and POSTs it to `/auth/google` or `/auth/apple`, and the
token's own signature plus the `aud` binding is what authenticates it. Adding a `state` parameter
to this shape would be cargo-cult.

---

## 6 · Webhook authentication — no finding

`POST /webhook/whatsapp` (`whatsapp_webhook.py:172`) has no auth dependency and no rate limit,
which is why it surfaces in both §4.5 and §8. Reading it, that is correct: it is authenticated
cryptographically, and the implementation gets the details right that this class usually gets
wrong.

- Raw body read **before** any parsing, so a Pydantic model cannot consume the stream ahead of
  signature verification (`:196`, and the docstring states the ordering as load-bearing)
- `X-Hub-Signature-256` verified as HMAC-SHA256 over the raw bytes
- **Constant-time** comparison (`hmac.compare_digest`)
- **Fail-closed** on unset `WHATSAPP_APP_SECRET` — rejects *before* computing, so the expected
  digest cannot be derived from a deterministic empty-key HMAC (`:207-213`)
- `Content-Length` pre-check before body read (`:113-125`)

`GET /webhook/whatsapp` (`:130`) does the Meta subscription challenge, also constant-time and
also fail-closed on an unset verify token (`:145-165`).

---

## 7 · Input validation — no finding

The MEH-1623 pattern (a public-facing field with no validator) was searched for and **not found
recurring**.

| Metric | Value |
|---|---:|
| Classes in `schemas/schemas.py` | 125 |
| `@field_validator` | 117 |
| `@model_validator` | 9 |

Public-input schemas route free text through `sanitize_text()` plus letter-class validators
(`schemas.py:294`, `:312`, `:326`, `:337`) — the control the Bug Protocol prescribes for
punctuation-only input (MEH-555). Coverage is dense enough that MEH-1623 reads as a closed
one-off rather than a pattern.

---

## 8 · Rate limiting

68 of 191 routes carry `@limiter.limit`. 23 unauthenticated routes have none; 21 of those are
`GET`/`HEAD` reads (health probes, catalog, listings) where the omission is defensible. The two
that write are:

- `POST /webhook/whatsapp` — HMAC-gated, §6. Not a gap.
- `POST /home-products/rate/{token}` — **F-3**.

All authentication endpoints are limited: `/auth/login`, `/auth/register`, `/auth/refresh`,
`/auth/forgot-password`, `/auth/reset-password`, `/auth/google`, `/auth/apple`,
`/auth/check-password`. No credential-stuffing surface is unlimited.

---

## 9 · SQL injection — no finding

Every query is parameterized. Three raw-SQL sites exist, all safe:

| Site | Form |
|---|---|
| `routers/search.py:197` | Static `text()`, no interpolation |
| `routers/admin.py:838` | Bound params — `:name_he, :lat, :lng` |
| `routers/health.py:37,46` | Static literals |

Searches for f-strings or concatenation inside `text(...)`, and for formatted strings inside
`.filter(...)`, both returned **zero** matches. The Haversine distance query — the one place the
repo mandates raw SQL, since Railway has no PostGIS — is built from SQLAlchemy `func.*`
expressions and is parameterized (`services/producer_queries.py:33-64`).

---

## 10 · Secrets

**In the working tree: no finding.** A scan for assigned credential-shaped literals returned zero
hits outside `os.environ` / `getenv` / `Settings` fields. No `.env` file is tracked — only the
three `.env.example` templates. Literal defaults in `config.py` are non-secret (a localhost DB
URL, `HS256`, CORS origins, a model name).

**In git history: `not measured` — `gitleaks` is not installed in this environment and no
equivalent history scanner is available.** This is **F-6**, and it is a real gap: a secret
committed and later removed would not be visible to a working-tree scan. It needs a scanner run
before launch, which is also the epic's open DoD item on whether `gitleaks` becomes a standing CI
gate.

---

## 11 · Findings

### F-1 · ⚪ latent (~~🟠 High~~) — Rating aggregate and auto-hide trigger are manipulable by a single user

> **CORRECTED (MEH-1743): not reachable.** `home_products` is unmounted per the brand LOCK
> (`router_registry.py:61`), so every route below returns 404 and this cannot be exploited. The
> mechanism analysis stands and is accurate — it describes **dead code**. Severity drops from
> 🟠 High to ⚪ latent. Blocked from remediation: an exploit-proving test (ADR-017 §3.1) cannot
> be written against a 404, and mounting the router to enable one is hard stop §4.1 (LOCK).

- **Files:** `backend/app/routers/home_products.py:333` (token minting) · `:117` (rating
  submission) · `:150-158` (auto-hide) · `backend/app/models/models.py:1149` (the constraint)
- **OWASP:** A04:2025 Insecure Design · **CWE-840** Business Logic Errors
- **Reachable: no** — router unmounted. ~~On production (`main`): yes.~~
- **Fix size:** M · **Risk tier: RED**

**Vector.** Three collaborating design choices, each defensible alone:

1. `POST /home-products/{product_id}/whatsapp-click` mints a **fresh** `rating_token`
   (`secrets.token_urlsafe(32)`) on **every** call, inserting a new click row. The only bound is a
   `10/minute` rate limit.
2. Each token authorises exactly one rating. The uniqueness constraint is
   `UniqueConstraint("click_id", name="uq_one_rating_per_click")` — **one rating per click**, and
   there is no unique constraint on `(user_id, home_product_id)` on either table.
3. `submit_rating` counts **all** ratings at `stars <= 2` for the product and, at `>= 3`, sets
   `hp.is_hidden = True`.

Because (1) lets one account mint unlimited tokens and (2) scopes uniqueness to the click rather
than to the rater, the count in (3) is a count of *clicks by anyone*, not of *distinct raters*. A
single authenticated account can therefore drive a listing's public rating to an arbitrary value
and cross the auto-hide threshold on its own, removing another user's listing from the catalog.
The rate limit bounds the speed, not the outcome.

This is **not** the excluded "rate limiting / resource exhaustion" class. Nothing is exhausted:
the integrity of a public aggregate and the availability of another user's content are decided by
an authorization boundary that was never drawn. The token itself is well-built — 256 bits,
single-use, `rated` checked on both the `GET` and the `POST` (`:92`, `:127`). The flaw is that
tokens are unlimited in number.

**Direction (for the fix ticket, not applied here):** the uniqueness that matters is per rater per
product, not per click.

---

### F-2 · ⚪ latent (~~🟠 High~~) — Click endpoint discloses the phone of hidden/deactivated listings

> **CORRECTED (MEH-1743): not reachable.** Same root cause as F-1 — `home_products` is unmounted
> per the brand LOCK. `POST /home-products/{product_id}/whatsapp-click` returns 404, so no phone
> number is disclosed to anyone. The gap between the two sibling routes is real in the source and
> would matter on a re-mount; today it is dead code. Blocked for the same reason as F-1.

- **File:** `backend/app/routers/home_products.py:333-350`, disclosure at `:350`
- **OWASP:** A01:2025 Broken Access Control · **CWE-639** Authorization Bypass Through
  User-Controlled Key
- **Reachable: no** — router unmounted. ~~On production (`main`): yes.~~
- **Fix size:** S · **Risk tier: RED**

**Vector.** The sibling read route `GET /home-products/{product_id}` (`:181-197`) carries an
explicit BOLA gate, tagged `MEH-386`: a listing that is `is_active == False` or
`is_hidden == True` returns 404 to everyone except its owner and admins.

`POST /home-products/{product_id}/whatsapp-click` queries the same row by the same
user-controlled id, 404s **only when the row is absent**, and returns
`{"whatsapp_url": "https://wa.me/{hp.phone}"}`. The `is_active` / `is_hidden` conditions are not
consulted, and the owner/admin exemption is not applied.

So the MEH-386 gate holds on one route and is absent on another route that discloses **more**
sensitive data than the gated one — the seller's phone number. Any authenticated user holding the
id of a listing that has since been hidden by moderation (or deactivated by its owner) can still
retrieve that number. Ids of listings that were once public are known to anyone who browsed the
catalog before removal, so this does not depend on guessing a UUID.

Note the interaction with **F-1**: the auto-hide there is one of the ways a listing becomes
hidden, and this finding says hiding does not stop the phone disclosure.

---

### F-3 · ⚪ latent (~~🟡 Low~~) — Public unauthenticated write with no rate limit

> **CORRECTED (MEH-1743): not reachable.** Also in the unmounted `home_products` router — 404.
> This means the statement below that it is "the only unauthenticated, unrate-limited,
> state-mutating route in the backend" is **wrong as written**: among *reachable* routes there is
> no such route at all. Blocked for the same reason as F-1/F-2.

- **File:** `backend/app/routers/home_products.py:117` (`submit_rating`)
- **OWASP:** A04:2025 · **CWE-770** Allocation Without Limits
- **Reachable: no** — router unmounted.
- **Fix size:** S · **Risk tier: RED**

The only unauthenticated, unrate-limited, state-mutating route in the backend that is not
cryptographically gated. Its sibling `POST /home-products/validate` carries `30/hour` (`:102`) and
`POST /home-products` carries `10/hour` (`:199`), so the omission looks like an oversight rather
than a decision. Impact is bounded by the single-use token — a caller cannot submit twice with one
token — which is why this is Low and not High; the unbounded path is **F-1**, and fixing F-1
mostly closes this. Listed separately because the missing limit is independently true.

---

### F-4 · 🟡 Low — PII prefill lookup has no rate limit

- **File:** `backend/app/routers/admin_outreach.py:203-227`
  (`GET /register/producer/prefill/{token}`)
- **OWASP:** A01:2025 · **CWE-770**
- **Fix size:** S · **Risk tier: RED**

Public by design — the token *is* the credential — and the construction is sound: token is
`secrets.token_urlsafe(32)` (~256 bits, `:156`), has a TTL (`:157`), rejects anything under 16
chars, and returns an identical 404 for absent/expired/invalid so it leaks no oracle. On a
successful hit it returns lead PII: name, phone, Instagram, website, city, category.

At 256 bits the token is not brute-forceable, so this is Low and close to Info. It is recorded
because the endpoint is unauthenticated, unlimited, and returns personal data — the combination
deserves a limit as defence-in-depth even when the entropy argument holds.

**Path correction worth noting:** a first pass reported this route as `/admin/outreach/{token}`,
which would have read as an unauthenticated admin endpoint — considerably more alarming and
wrong. It is declared on a second router object in the same file (`prefill_router`, prefix
`/register/producer/prefill`, `:201`), deliberately separated so it does not inherit the file's
`require_admin`. The extractor was fixed to bind decorators to their own router before this
finding was written.

---

### F-5 · ⚪ Info — Comment in `verify_google_token` contradicts the code

- **File:** `backend/app/services/oauth_verifiers.py:213-216`
- **Fix size:** S

The comment reads `# Fallback for development: decode without verification`. The code beneath it
returns `None` when `google_client_id` is unset — it fails **closed** and never decodes anything
unverified. The behaviour is correct; the comment describes a dangerous thing the code does not
do. Flagged only because a future edit could "restore" the documented behaviour.

---

### F-6 · ⚪ Info — Git-history secret scan not measured

`gitleaks` is not installed and no equivalent is available in this environment, so the
**working-tree-only** scan in §10 cannot speak to secrets committed and later removed. Not
estimated, not inferred. Closing this requires a scanner run against full history — which the
epic already tracks as an open decision (§6 DoD: whether `gitleaks` becomes a standing CI gate).

---

## 12 · Not measured

| Item | Reason |
|---|---|
| Git-history secret scan | `gitleaks` unavailable in this environment (**F-6**) |
| Runtime/dynamic authz verification | Backend deps not importable and no PostgreSQL available (established in P0 §6.2); this pass is **static** — every claim is source-derived, none is from an executed request |
| Dependency CVEs | Out of scope by ticket — P2 (MEH-1725); MEH-1585 already tracks 31 vulns |
| Frontend auth surface | Out of scope — P2. MEH-1641 (JWT in `localStorage`) already owns the root issue |

---

## 13 · Appendix — commands and raw output

### A0 · Baseline + provenance

```
$ git rev-parse --is-shallow-repository
false
$ git diff --stat 114e4c84 origin/staging -- backend/
(empty — backend byte-identical at baseline and staging HEAD)
$ git worktree add --detach .claude/worktrees/p1-baseline 114e4c84
$ git -C .claude/worktrees/p1-baseline rev-parse HEAD
114e4c847617495a71058e180007797dfc83533f
```

### A1 · `/security-review` prerequisite

```
$ /security-review           → fatal: ambiguous argument 'origin/HEAD...'
$ git remote set-head origin staging
$ git symbolic-ref refs/remotes/origin/HEAD
refs/remotes/origin/staging
$ git log --no-decorate --oneline origin/HEAD...     → (empty, exit 0)
```

### A2 · Route extraction + reconciliation

Extractor: `authz_matrix.py` — AST walk over `backend/app/routers/*.py`; binds each
`@<obj>.<verb>` decorator to the prefix of the `APIRouter` assigned to `<obj>`; collects
`Depends(...)` targets from decorator `dependencies=[...]`, parameter defaults, and `Annotated[...]`.

```
$ python3 authz_matrix.py backend/app/routers | jq '{total,files}'
routes=191  files=35

$ grep -rhoE '@[a-z_]+\.(get|post|put|patch|delete|head|options)\(' backend/app/routers/ | sort | uniq -c
     80 @router.post(       73 @router.get(        14 @router.put(
     14 @router.delete(      5 @router.patch(       2 @router.head(
      1 @prefill_router.get( 1 @admin_router.patch( 1 @admin_router.get(
   → 191 total, matching the AST count exactly

$ # bucket reconciliation
required=130 optional-only=10 none=51 sum=191

$ grep -rhoE 'Depends\([a-zA-Z_.]+\)' backend/app/routers/ | sort | uniq -c | sort -rn
    177 Depends(get_db)          64 Depends(require_admin)
     33 Depends(get_current_user) 27 Depends(require_producer)
      8 Depends(get_current_user_optional)
      3 Depends(require_verified_producer)
      3 Depends(require_verified_email)
      2 Depends(get_current_user_lenient)
```

### A3 · Admin gating

```
$ jq '[.rows[]|select(.full|startswith("/admin"))]|length'                                    → 64
$ jq '[.rows[]|select(.full|startswith("/admin"))
      |select((.auth_required|index("require_admin"))|not)]|length'                           → 0
```

### A4 · The 51 unauthenticated routes

```
GET  /                                          system.py:8
GET  /categories                                producers.py:432
GET  /cities                                    cities.py:47
GET  /events/upcoming                           events.py:107
GET  /experiences                               experiences.py:115
GET  /group-buys                                group_buys.py:61
GET  /health/liveness            HEAD /health/liveness          health.py:52,53
GET  /health/readiness           HEAD /health/readiness         health.py:58,59
GET  /holiday-mode                              holiday_mode.py:10
GET  /home-products                             home_products.py:166
GET  /home-products/rate/{token}                home_products.py:82
GET  /home-products/{product_id}/ratings        home_products.py:354
GET  /producers                                 producers.py:60
GET  /producers/by-slug/{slug}                  producers.py:233
GET  /producers/cities                          producers.py:184
GET  /producers/count                           producers.py:173
GET  /producers/random                          producers.py:209
GET  /producers/{producer_id}/google-rating     google_rating.py:102
GET  /producers/{producer_id}/kashrut-cert/{badge_code}   producers.py:482
GET  /producers/{producer_id}/reviews           reviews.py:149
GET  /producers/{slug}/recipes                  producer_recipes.py:348
GET  /producers/{slug}/recipes/{recipe_id}      producer_recipes.py:375
GET  /push-vapid-key                            system.py:17
GET  /register/producer/prefill/{token}         admin_outreach.py:203     ← F-4
GET  /reviews                                   reviews.py:180
GET  /search                                    search.py:82
GET  /search/trending                           search.py:186
GET  /stats                                     marketing.py:87
GET  /auth/verify-email                         auth.py:1259
GET  /webhook/whatsapp                          whatsapp_webhook.py:130   ← §6
POST /auth/apple  /auth/check-password  /auth/forgot-password  /auth/google
     /auth/login  /auth/logout  /auth/refresh  /auth/register
     /auth/register/producer/oauth  /auth/reset-password        auth.py (all rate-limited)
POST /chat                                      chat.py:184
POST /contact                                   marketing.py:219
POST /experiences/validate                      experiences.py:97
POST /home-products/rate/{token}                home_products.py:117      ← F-3
POST /home-products/validate                    home_products.py:102
POST /newsletter                                marketing.py:105
POST /newsletter/unsubscribe                    marketing.py:188
POST /reports/producer-info                     report_info.py:45
POST /webhook/whatsapp                          whatsapp_webhook.py:172   ← §6
```

### A5 · IDOR query + verification

```
$ jq '[.rows[]|select(.has_auth)|select((.id_params|length)>0)
      |select(.owner_check|not)
      |select((.auth_required|index("require_admin"))|not)]|length'                           → 2

POST /home-products/{product_id}/whatsapp-click   home_products.py:333   → real defect, F-2
PUT  /producers/me/locations/{location_id}        producer_me.py:1338    → false positive
```

```
$ grep -n -A12 "def _get_owned_location" backend/app/routers/producer_me.py
1242:def _get_owned_location(db, producer_id, location_id) -> ProducerLocation:
1245-    # MEH-1421 IDOR: look up by id ALONE, then check ownership so a cross-owner
1246-    # id is a 403 (not a 404). A genuinely missing id is a 404.
1248-    loc = db.query(ProducerLocation).filter(ProducerLocation.id == location_id).first()
1249-    if loc is None:  raise HTTPException(404, "מיקום לא נמצא")
1251-    if loc.producer_id != producer_id:  raise HTTPException(403, "אין הרשאה למיקום זה")
1253-    return loc
```

### A6 · F-1 evidence

```
$ sed -n '333,350p' backend/app/routers/home_products.py
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp: raise HTTPException(404, "Home product not found")
    click = HomeProductWhatsAppClick(
        user_id=user.id, home_product_id=product_id,
        rating_token=secrets.token_urlsafe(32),      # ← fresh token per call
    )

$ sed -n '150,158p' backend/app/routers/home_products.py
    if negative_count >= 3:
        hp = db.query(HomeProduct).filter(HomeProduct.id == click.home_product_id).first()
        if hp: hp.is_hidden = True ; db.commit()

$ grep -n "UniqueConstraint" backend/app/models/models.py | grep -i rating
1149:    __table_args__ = (UniqueConstraint("click_id", name="uq_one_rating_per_click"),)
   → uniqueness is per CLICK, not per (user_id, home_product_id)
```

### A7 · F-2 evidence — the gate that exists vs the one that doesn't

```
$ sed -n '190,196p' backend/app/routers/home_products.py     # GET — gated
    # MEH-386 (BOLA): hidden/deactivated listings must not be visible to public.
    is_owner = viewer is not None and viewer.id == hp.user_id
    is_admin = viewer is not None and getattr(viewer, "role", None) == "admin"
    if (not hp.is_active or hp.is_hidden) and not (is_owner or is_admin):
        raise HTTPException(status_code=404, detail="Home product not found")

$ sed -n '340,350p' backend/app/routers/home_products.py     # POST click — NOT gated
    hp = db.query(HomeProduct).filter(HomeProduct.id == product_id).first()
    if not hp: raise HTTPException(404, "Home product not found")
    ...
    return {"detail": "Click logged", "whatsapp_url": f"https://wa.me/{hp.phone}"}

$ git diff --stat 114e4c84 origin/main -- backend/app/routers/home_products.py
(empty — the file is identical on production)
```

### A8 · JWT / OAuth

```
$ grep -n "algorithm\|access_token_expire\|refresh_token_expire" backend/app/config.py
28:    algorithm: str = "HS256"
35:    access_token_expire_minutes: int = 15
36:    refresh_token_expire_days: int = 14

$ sed -n '161,166p' backend/app/config.py
    if s.secret_key == _DEV_SECRET_SENTINEL:
        if s.env.lower() == "production":
            raise RuntimeError("SECURITY: JWT_SECRET_KEY (or SECRET_KEY) must be set in production...")

$ grep -n "redirect_uri\|authorization_code\|/callback" backend/app/routers/auth.py
(no matches — ID-token POST flow, not a redirect/code flow; `state` not applicable)

$ sed -n '202,203p' backend/app/services/oauth_verifiers.py
            audience=settings.apple_client_id,
            issuer="https://appleid.apple.com",
```

### A9 · SQL

```
$ grep -rn "db.execute(\|conn.execute(" backend/app/ --include=*.py
routers/search.py:197      routers/admin.py:838      routers/health.py:37,46

$ grep -rnE 'text\(\s*f"|text\([^)]*\+' backend/app/ --include=*.py       → (no matches)
$ grep -rnE '\.filter\(\s*f"' backend/app/ --include=*.py                 → (no matches)

$ sed -n '838,842p' backend/app/routers/admin.py
            text("INSERT INTO cities (name_he, lat, lng) VALUES (:name_he, :lat, :lng)"
                 " ON CONFLICT (name_he) DO NOTHING"),
            {"name_he": name, "lat": lat, "lng": lng},
```

### A10 · Secrets

```
$ grep -rnE '(api_key|secret|password|token|bearer)\s*=\s*["'"'"'][A-Za-z0-9_\-]{16,}["'"'"']' \
    backend/app/ --include=*.py | grep -viE "os\.environ|getenv|settings\.|Field\("
(no matches)

$ command -v gitleaks         → gitleaks: NOT AVAILABLE      ← F-6
$ git ls-files | grep "\.env" → .env.example  backend/.env.example  frontend/.env.example
```

### A11 · Validation + rate limiting

```
$ grep -c "@field_validator" backend/app/schemas/schemas.py   → 117
$ grep -c "@model_validator" backend/app/schemas/schemas.py   →   9
$ grep -c "^class "          backend/app/schemas/schemas.py   → 125

$ jq '[.rows[]|select(.rate_limited)]|length'                          → 68
$ jq '[.rows[]|select(.rate_limited|not)]|length'                      → 123   (68+123 = 191)
$ jq '[.rows[]|select(.rate_limited|not)|select(no auth)]|length'      → 23
```

---

*P1/8 — MEH-1724, epic MEH-1721. Read-only. Fixes are RED-tier and belong to separate tickets.*
