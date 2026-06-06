# 2026-06 Full Codebase Audit

> Refs MEH-214. Read-only audit — **no source-code edits in any of the 6 sessions**.
> Findings live in this file only. Branch: `feature/audit-2026-06-full` (off `staging`,
> one branch for all 6 sessions). Raw tool output: [`raw/`](./raw/).

## PROGRESS (resumability checklist)

Overnight autonomous run. Commit + push after every phase. On re-run, skip checked phases.

- [x] **Phase 0** — Tools + skeleton (prev session): AUD-001..008, raw/ committed.
- [x] **Phase A** — Backend / Security (7 areas). → Audit-A (AUD-009..024; no IDOR/secrets, AUD-004 closed-FP)
- [ ] **Phase B** — Frontend / RTL / i18n / a11y (6 areas). → Audit-B
- [ ] **Phase C** — Logic / Data / State (6 areas). → Audit-C
- [ ] **Phase D** — Infra / Config / CI / Deps (5 areas). → Audit-D
- [ ] **Phase Final** — Cross-domain dedup, re-verify REDs, exec summary, HANDOFF, PR ready.

_(Checkboxes flipped to [x] as each phase commits. BLOCKED items, if any, listed per section.)_

## Audit plan (6 sessions)

| Session | Section | Scope |
|---|---|---|
| 1 (this) | Audit-0 Tools | Deterministic tooling — run all, save raw output, triage hits |
| 2 | Audit-A | Backend / Security (`backend/app/**`, auth, upload, permissions) |
| 3 | Audit-B | Frontend / RTL / i18n (`frontend/**`) |
| 4 | Audit-C | Logic / Data (models, schemas, business logic, data integrity) |
| 5 | Audit-D | Infra / Config (Docker, CI, Railway/Vercel, env, settings) |
| 6 | Final Triage | Dedup, severity reconciliation, exec summary, hand-off |

---

## Finding format (all sessions follow this verbatim)

```
### [AUD-XXX] short title
Domain | Severity RED/YELLOW/GREEN | Confidence high/med/low
Evidence: file:line + snippet ≤5 lines
Issue: 1-3 sentences. Realistic scenario: 1-2 sentences.
Fix direction: 1 line. NO fix applied.
Verify: confirmed / rejected-FP / rejected-low-impact
```

- **Severity** — RED = exploitable/data-loss/prod-down · YELLOW = real but
  bounded/conditional · GREEN = hygiene/defensible/accepted-baseline.
- **Confidence** — auditor's certainty the finding is real, before deeper review.
- **Verify** — filled at triage. `confirmed` = real, actionable · `rejected-FP` =
  not a real issue · `rejected-low-impact` = real but not worth acting on.
- **NO fix applied** — every finding is observation only. Fix direction is a
  pointer for a future, separately-scoped ticket. Scope of this audit is
  strictly `docs/audits/`; nothing else is touched.
- **Numbering** — `AUD-XXX` is global and monotonic across all 6 sessions.
  Session 1 (Audit-0) uses AUD-001…AUD-008; later sessions continue from AUD-009.

---

## Exec Summary

_(empty — populated in Session 6 after all sections complete)_

### תקציר מנהלים (עברית)

_(ריק — ימולא בסשן 6 לאחר סיום כל הסקשנים. כל סקשן יקבל תקציר 3–5 שורות בעברית.)_

---

## Audit-0 — Tools

Deterministic tooling, run 2026-06-06. Raw output committed under [`raw/`](./raw/).

### Environment notes

- **Backend deps** installed in sandbox via `uv sync --frozen` (+ `mypy` into the
  venv so the `pydantic.mypy` plugin in `backend/pyproject.toml` resolves).
- **Frontend deps** installed via `npm ci` (lockfile present).
- **`bandit` + `pip-audit`** not preinstalled — installed user-level for this run.
- The `.venv/` and `node_modules/` are gitignored; nothing outside `docs/audits/`
  is committed.

### Tool run matrix

| Tool | Command | Exit | Raw file | Result |
|---|---|---|---|---|
| ruff | `ruff check backend/` (all rules) | 0 | `raw/ruff.txt` | **Clean** — all checks passed |
| bandit | `bandit -r backend/app` | 1 | `raw/bandit.txt` | 1 High, 0 Med, 5 Low |
| mypy | `mypy app --follow-imports=silent` (from `backend/`, full) | 1 | `raw/mypy.txt` | 639 errors / 56 files |
| eslint | `npx eslint .` (from `frontend/`) | 0 | `raw/eslint.txt` | 0 errors, 3020 warnings |
| npm audit | `npm audit` | 1 | `raw/npm-audit.{txt,json}` | 5 moderate |
| pip-audit | `pip-audit --desc` (venv) | 1 | `raw/pip-audit.txt` | 15 vulns / 8 pkgs |
| pytest | — | — | — | **SKIPPED** — no Postgres in sandbox (MEH-672) |

> **pytest skipped.** `tests/test_api.py` and the suite require a live Postgres;
> the CC sandbox has none (MEH-672). Test-suite audit deferred to a session run
> from an environment with a DB, or to CI. Not run here — not claimed as passing.

### Accepted baseline / noise (not findings)

- **ruff** — zero issues. No findings.
- **mypy no-untyped-def (265 of 639).** The project has not adopted full type
  annotations; `no-untyped-def` is the dominant class and is a strictness
  baseline, not a defect. The note "warn-only baseline ~15 errors in `auth.py`"
  refers to the project's normal narrower run; this full-tree run surfaces the
  whole untyped surface. Real-signal mypy classes (`union-attr` ×33, `arg-type`
  ×110, `assignment` ×127) are deferred to Audit-A/C for line-level triage —
  too many to triage blind here, and most need code context to separate real
  None-derefs from SQLAlchemy/Pydantic typing gaps.
- **eslint — 3020 warnings, 0 errors.** Config treats all as warnings; the build
  does not fail on them. Dominant classes are style: `no-magic-numbers` (511),
  `unicorn/prefer-global-this` (183), `unicorn/*` formatting (~250 combined).
  Baseline, not findings. The two security-relevant clusters are pulled out as
  AUD-007.
- **bandit B105 `config.py:15`** — `'__ephemeral_dev_secret__'` is the documented
  dev-only fail-open JWT fallback (CLAUDE.md locked decision: "JWT secret from
  env … ephemeral in dev only"). Intentional. Not a finding.

---

### [AUD-001] Bare `except Exception: pass` swallows secondary failures (×4)
Logic / Error-handling | Severity GREEN | Confidence high
Evidence: bandit B110 — 4 sites:
```
app/auth.py:135            try: db.rollback() except Exception: pass   (after logged primary error)
app/services/analytics.py:142   try: db.rollback() except Exception: pass
app/services/analytics.py:220   try: db.rollback() except Exception: pass
app/logging_config.py:34   try: ... event_dict["request_id"]=rid except Exception: pass
```
Issue: Three sites swallow a `db.rollback()` failure after the primary exception
was already logged; one swallows correlation-id enrichment. All are *secondary*
cleanup, so the pattern is largely defensible — but a bare `except: pass` on
`rollback()` can mask a corrupted connection/session state that then surfaces
later as an unrelated error. Realistic scenario: a rollback fails mid-request;
the swallow hides it, and the next query on the same session errors with a
confusing message far from the root cause.
Fix direction: narrow the except (catch the specific DB error) and log at debug, or
let the connection be discarded by the session lifecycle rather than rollback-in-except.
Verify: rejected-low-impact (secondary cleanup; tracked vs MEH-325 silent-except family for Audit-A confirmation)

### [AUD-002] `pyjwt==2.12.0` — 5 advisories incl. alg allow-list bypass
Security / Dependencies | Severity YELLOW | Confidence med
Evidence: `raw/pip-audit.txt` — PYSEC-2026-176 (alg allow-list bypass on PyJWK key),
PYSEC-2026-179 (HMAC key-confusion), PYSEC-2026-175/177 (PyJWKClient SSRF/DoS),
PYSEC-2026-178 (detached-JWS DoS). Usage: `app/services/oauth_verifiers.py:164,198`
```python
public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(key)
payload = pyjwt.decode(id_token, public_key, algorithms=["RS256"],
                       audience=settings.apple_client_id, issuer="https://appleid.apple.com")
```
Issue: pyjwt is used only in the Apple Sign-In verifier. The usage **mitigates the
headline CVEs**: `algorithms=["RS256"]` is pinned (blocks the HMAC-confusion and
alg-bypass paths, which require a PyJWK key object — here a raw RSA key is passed),
and the JWKS is fetched from Apple's fixed endpoint with no `PyJWKClient`/`jku`
(blocks the SSRF/DoS paths). The app's own tokens use `joserfc`, not pyjwt.
Realistic scenario: low — exploitation needs a usage pattern this code doesn't have;
risk is residual hygiene + future refactor that drops the RS256 pin.
Fix direction: bump `pyjwt` 2.12.0 → 2.13.0 at next dep refresh (auth file → workflow rule 5a CVE check applies).
Verify: confirmed (bump warranted) / exploitability rejected-low-impact for current usage

### [AUD-003] `python-multipart==0.0.26` — multipart header DoS (CVE-2026-42561)
Security / Dependencies | Severity YELLOW | Confidence high
Evidence: `raw/pip-audit.txt` — CVE-2026-42561, fix 0.0.27. Direct runtime dep
(`backend/pyproject.toml`), used by FastAPI for every `multipart/form-data` request.
Issue: No limit on part-header count/size; an attacker can send many repeated or
one oversized part header to force CPU work before rejection. The app accepts
multipart uploads (`routers/upload.py`), so this path is reachable unauthenticated
at the parse layer. Realistic scenario: a script POSTs crafted multipart bodies to
the upload endpoint, spiking worker CPU and degrading the API.
Fix direction: bump `python-multipart` 0.0.26 → 0.0.27 (mitigation meanwhile: body-size limit at proxy).
Verify: confirmed

### [AUD-004] `starlette==0.49.3` — Host-header `request.url` path desync (PYSEC-2026-161)
Security / Dependencies | Severity YELLOW | Confidence med
Evidence: `raw/pip-audit.txt` — PYSEC-2026-161, fix 1.0.1. Starlette ships transitively
under `fastapi`. Routing uses raw path; `request.url.path` is rebuilt from the
unvalidated `Host` header, so the two can diverge.
Issue: Any middleware/endpoint that makes a security decision from `request.url.path`
(rather than `scope` path) can be bypassed via a crafted `Host` header. Reachability
depends on whether `middleware.py` gates on `request.url` — **flagged for Audit-A to
confirm**. Realistic scenario: path-prefix auth gate in middleware reads `request.url.path`;
attacker sends `Host: x/admin?` to make the gate see a different path than routing.
Fix direction: bump starlette (via fastapi) to a patched line; meanwhile ensure middleware reads `scope` path, not `request.url`.
Verify: pending Audit-A (middleware.py review)

### [AUD-005] bandit B324 — SHA1 in HIBP password check
Security | Severity GREEN | Confidence high
Evidence: `app/services/password_policy.py:58`
```python
sha1_hex = hashlib.sha1(candidate.encode("utf-8")).hexdigest().upper()
prefix, suffix = sha1_hex[:5], sha1_hex[5:]
```
Issue: SHA1 here is **required** by the HaveIBeenPwned Pwned-Passwords range API
(k-anonymity uses SHA1 by protocol design); it is not used to store or protect a
secret. bandit flags it High purely on the algorithm name.
Realistic scenario: none — changing the hash would break the HIBP lookup.
Fix direction: pass `hashlib.sha1(..., usedforsecurity=False)` to document intent and silence the scanner.
Verify: rejected-FP

### [AUD-006] npm: `postcss <8.5.10` XSS, transitive via `next` (5 moderate)
Dependencies / Frontend | Severity GREEN | Confidence high
Evidence: `raw/npm-audit.txt` — `postcss` XSS (GHSA-qx2v-qp2m-jg93) pulled in under
`next`; the 5 advisories fan out via `@sentry/nextjs`, `@vercel/speed-insights`,
`next-intl`, all "depends on vulnerable versions of next". Fix path = `next@9.3.3`
(major downgrade, breaking).
Issue: postcss XSS is a build/stringify-time issue on untrusted CSS — not a runtime
request path in this app. The only offered fix downgrades Next.js, which is a breaking
change and worse than the bug.
Realistic scenario: negligible — requires processing attacker-controlled CSS through
postcss stringify, which the build does not do.
Fix direction: do NOT `npm audit fix --force`; clear naturally on the next planned Next.js minor/patch upgrade.
Verify: rejected-low-impact

### [AUD-007] eslint security clusters worth manual triage (Audit-B)
Frontend / Security | Severity YELLOW | Confidence low
Evidence: `raw/eslint.txt` — `security/detect-object-injection` ×122,
`react-hooks/set-state-in-effect` ×40, `react-hooks/immutability` ×18.
Issue: `detect-object-injection` is high-FP (most are safe bracket access), but 122
hits is too many to dismiss blind — a real prototype-pollution/object-injection sink
could hide in the noise. `set-state-in-effect` ×40 can indicate render loops / wasted
renders. Both need line-level review with component context.
Realistic scenario: one genuine user-controlled `obj[key]` write among the 122 →
prototype pollution; or a setState-in-effect loop causing a visible perf jank.
Fix direction: Audit-B triages these two rule clusters specifically; no blanket action.
Verify: pending Audit-B

### [AUD-008] Transitive/tooling dependency advisories (batch)
Dependencies | Severity GREEN | Confidence high
Evidence: `raw/pip-audit.txt` — `aiohttp 3.13.5` (2 CVEs), `idna 3.13`,
`mako 1.3.11` (alembic tooling), `urllib3 2.6.3` (2), `pip 26.1` (tooling). Mostly
DoS-class / resource-consumption or Windows-only (mako path traversal) advisories.
Issue: These are transitive (via `requests`/`anthropic`/`aiohttp`) or
build/migration tooling (`mako` under alembic, `pip` itself), not core request-path
runtime logic. Individually low real-world impact for this deployment (Linux server,
no untrusted-template loading).
Realistic scenario: low — would require the specific vulnerable code paths, none of
which are on the app's hot path.
Fix direction: batch-bump on the next routine dependency refresh; no urgent action.
Verify: rejected-low-impact

---

## Audit-A — Backend / Security

Phase A — 7 parallel read-only subagents (auth, authz/IDOR, input-validation,
secrets, CORS/rate/errors, WhatsApp, alembic). Orchestrator merged + re-verified.
Carry-over resolved: **AUD-004 → rejected-FP** (see AUD-019). Bandit AUD-001/005
cross-checked. Numbering continues from AUD-009.

### [AUD-009] WhatsApp Graph 200 treated as delivered — response body never parsed
WhatsApp / Reliability | Severity YELLOW | Confidence high
Evidence: `backend/app/services/whatsapp.py:46-52`
```python
r = httpx.post(url, json=payload, headers=headers, timeout=_TIMEOUT_SECONDS)
r.raise_for_status()        # only raises on 4xx/5xx
return True                 # 200 → "sent", body never inspected
```
Issue: Graph API returns HTTP 200 with an `error` object or empty `messages: []`
when a number is invalid/unreachable; `_post()` only checks the status code, so a
queued-but-undelivered message is reported as success (no retry, watchdog records
`sent`). Realistic scenario: admin/alert sends to a bad/stale number, Graph 200s with
an error body, user never receives it, logs say success — silent delivery loss.
Fix direction: after `raise_for_status()`, parse `r.json()` and return False on an
`error` key or empty `messages` array.
Verify: confirmed (not RED — reliability/observability, not exploit/data-loss; subagent's RED downgraded per severity rubric)

### [AUD-010] `send_text()` 24h customer-service window not enforced client-side
WhatsApp / Reliability | Severity YELLOW | Confidence high
Evidence: `backend/app/services/whatsapp.py:55-70` docstring claims "only works
inside the 24h window"; callers `routers/alerts.py:~208` and `routers/admin.py:~742`
invoke `send_text()` with no last-inbound elapsed check.
Issue: Meta rejects free-form text outside the 24h window, but the client never
checks it; combined with AUD-009 the call returns True and the failure is invisible.
Realistic scenario: reminder to a user last seen 25h ago → Meta drops it, code logs
success. Fix direction: track `last_inbound_at` and gate `send_text` on window-open,
or rename to make "best-effort" explicit and have callers branch to a template.
Verify: confirmed (compounds AUD-009; depends on AUD-009 for the silent-success half)

### [AUD-011] MEH-555 free-text letter-validation gaps across producer/product/experience schemas
Input-validation | Severity YELLOW | Confidence high
Evidence: `backend/app/schemas/schemas.py` — `producer_name:66`, admin `name/contact_name/top_product_name/whatsapp_group:290,291,305,300`, `ProducerUpdate.contact_name/top_product_name/whatsapp_group:380,394,389`, `HomeProduct category/storage_type/kosher:727,730,732`, `Experience category/recurring_schedule:898,911`.
Issue: ~13 free-text `str`/`str|None` fields feeding admin queues or public display
accept punctuation-only values (`"???"`, `"!!!"`) — the exact MEH-555 pattern
(`[א-תa-zA-Z]` ≥3 letters after `strip()`) that workflow.md already lists as the
unfixed sibling set (`ProducerCreate.name`, `HomeProductCreate.title`,
`ExperienceCreate.title`). Realistic scenario: producer/admin saves junk-string
fields that render as garbage in admin lists and public detail pages.
Fix direction: add a shared `@field_validator` applying the MEH-555 letter check to
each field (one ticket, mirrors the existing validated fields).
Verify: confirmed (matches documented MEH-555 backlog — known, not novel)

### [AUD-012] `admin_notes` stored with no sanitization, length cap, or validation
Input-validation | Severity YELLOW | Confidence med
Evidence: `backend/app/schemas/schemas.py:316` (ProducerAdminCreate), `:407` (ProducerUpdate) — `admin_notes: str | None` with zero validators, unlike `description`/`short_description` which call `sanitize_text`.
Issue: Raw admin input persisted and returned in admin GET responses with no HTML
sanitization or length bound. Realistic scenario: stored `<script>`/oversized blob;
server-side stored XSS only if an admin surface renders it unescaped (React escapes
by default → bounded), but the unbounded length is a real gap. Fix direction: run
`sanitize_text(v, max_length=2000)` in a validator, consistent with sibling fields.
Verify: confirmed (XSS bounded by frontend escaping; length/sanitization gap real)

### [AUD-013] Unbounded `list[str]` fields accept arbitrarily large arrays
Input-validation / DoS | Severity GREEN | Confidence high
Evidence: `backend/app/schemas/schemas.py:322,327,424` — `delivery_area_cities`,
`delivery_cities`, `custom_questions` have no `max_items`; `routers/admin.py:~92`
iterates `delivery_cities` into per-row DB inserts.
Issue: API accepts thousands of entries per list → amplified DB-insert work on a
single request. Realistic scenario: authenticated admin/producer POSTs a 10k-element
list, slow request. Fix direction: `Field(..., max_length=50)` (Pydantic v2 list cap)
per field. Verify: rejected-low-impact (auth-gated, no public reach; bounded amplification)

### [AUD-014] Fingerprint-claim comparison not constant-time
Auth | Severity YELLOW | Confidence med
Evidence: `backend/app/auth.py:193` — `if hash_fingerprint(cookie_fp) != fp_claim:`
(plain `!=`), whereas the WhatsApp HMAC path correctly uses `hmac.compare_digest`
(`routers/whatsapp_webhook.py:~192`).
Issue: Byte-wise `!=` on the SHA-256 fingerprint is a timing oracle. Realistic
scenario: low — attacker must already hold a valid 15-min access token and the
fingerprint is a 50-byte random value per login, so the side-channel is largely
academic. Fix direction: `not hmac.compare_digest(hash_fingerprint(cookie_fp), fp_claim)`.
Verify: confirmed (real divergence from the codebase's own constant-time standard; low practical risk)

### [AUD-015] `/reset-password` not rate-limited per-email; 404-vs-410 token oracle
Auth | Severity YELLOW | Confidence low
Evidence: `backend/app/routers/auth.py:~1090-1101` — `/reset-password` carries only
the per-IP limit (10/15m); unlike `/forgot-password` (`:1065-1066`) it has no
`key_func=email_from_body` second key. Token lookup `User.reset_token == data.token`
returns 404 (not found) vs 410 (expired), a distinguishable response.
Issue: No per-email throttle on the consume step, and the 404/410 split is a weak
oracle once a token is held. Realistic scenario: brute-forcing the token is infeasible
**if** `reset_token` is high-entropy (entropy not verified here — flagged), so impact
hinges on token generation. Fix direction: add the per-email dual-key limit to
`/reset-password` and collapse 404/410 to one generic response.
Verify: confirmed-conditional (downgrade to rejected-low-impact if reset_token is a 32B+ urlsafe token — Audit-C to confirm entropy at generation site)

### [AUD-016] Apple JWKS cache TTL uses wall-clock `time.time()` not `monotonic()`
Auth | Severity GREEN | Confidence med
Evidence: `backend/app/services/oauth_verifiers.py:~151,171-176` — cache freshness
compares `time.time()` against `_APPLE_JWKS_TTL_SECONDS` (3600).
Issue: A backward NTP/clock adjustment could keep a stale keyset "fresh". Realistic
scenario: negligible — Apple rotates keys on a weeks/months cadence and a kid-miss
forces a refetch anyway. Fix direction: use `time.monotonic()` for the TTL delta.
Verify: rejected-low-impact

### [AUD-017] Contact-form logs full name + email unmasked
Secrets / PII-in-logs | Severity GREEN | Confidence high
Evidence: `backend/app/routers/marketing.py:182` — `logger.info("New contact message: name=%s email=%s", msg.name, msg.email)`; contrast `services/email.py:53` which masks (`local***`).
Issue: Inconsistent redaction — public contact submissions land in Railway/Sentry
logs as cleartext PII. Realistic scenario: log access yields a harvestable name/email
list over time. Fix direction: add a `mask_email()` to `utils/pii.py` and apply it here.
Verify: confirmed (real privacy gap, low severity — internal log surface only)

### [AUD-018] Sentry PII scrubbing not set explicitly (`send_default_pii` / `before_send`)
Secrets / Observability | Severity GREEN | Confidence med
Evidence: `backend/app/sentry.py:51-57` — `sentry_sdk.init(...)` omits
`send_default_pii=` and `before_send=`.
Issue: Subagent flagged as YELLOW; orchestrator verify: the Sentry SDK **defaults
`send_default_pii=False`**, so request bodies/headers/cookies are not captured by
default, and `middleware.py:29-42` already redacts the email before `scope.set_user`.
Realistic scenario: low — only matters if a future edit flips `send_default_pii=True`.
Fix direction: set `send_default_pii=False` explicitly + a `before_send` redactor as
defense-in-depth. Verify: rejected-low-impact (SDK default already PII-off)

### [AUD-019] AUD-004 resolution — starlette Host-header `request.url` desync NOT reachable
Security / Dependencies | Severity GREEN | Confidence high
Evidence: `backend/app/middleware.py:112` — the **only** `request.url.path` use in
the backend is `scope.set_tag("route", request.url.path)` (Sentry telemetry). No
auth/routing/access decision reads `request.url`; FastAPI routing uses ASGI
`scope["path"]`; auth is JWT-from-header via `Depends`.
Issue: Resolves the Audit-0 carry-over: the PYSEC-2026-161 path-desync class has no
security-decision sink in this codebase. Realistic scenario: none — worst case is a
mislabeled Sentry tag. Fix direction: still bump starlette on the next dep refresh
(hygiene), but no reachable exploit. Verify: rejected-FP (closes AUD-004 reachability question)

### [AUD-020] Backend responses omit HSTS + CSP headers
Security headers | Severity GREEN | Confidence high
Evidence: `backend/app/middleware.py:44-52` sets X-Content-Type-Options,
X-Frame-Options, Referrer-Policy, Permissions-Policy — but no `Strict-Transport-Security`
and no `Content-Security-Policy`. `docs/SECURITY.md:302-315` documents both.
Issue: Backend is a JSON API behind Railway TLS (edge enforces HSTS) and the frontend
Next.js config carries CSP; the API itself returns no HTML in normal flow. Realistic
scenario: low — defense-in-depth/parity gap, not an exploit. Fix direction: add both
headers in `add_security_headers` for backend/frontend parity. Verify: rejected-low-impact

### [AUD-021] IDOR / authorization sweep — no gaps found (positive control)
Authorization/IDOR | Severity GREEN | Confidence high
Evidence: full per-endpoint map of all mutating routes across `producers.py`,
`producer_me.py`, `producer_recipes.py`, all `admin_*.py`, `users_me.py`, `reviews.py`
(`:320-323` owner-or-admin), `home_products.py` (`:281,326` owner-or-admin),
`experiences.py` (`:305` host-or-admin), `events.py` (`:166,180` producer-scoped),
`category_requests.py` (`:35-38` JWT-bound producer_id, MEH-386), `group_buys.py`,
`favorites.py`.
Issue: Every mutation enforces `owner_id == current_user.id` OR `role == "admin"`, or
is scoped to `user.producer_id`; admin routers gate on `require_admin`. No unscoped
object fetch found. Realistic scenario: none. Fix direction: none — recorded as a
verified positive control so Final Triage doesn't re-open it. Verify: confirmed (no finding)

### [AUD-022] CORS allows credentials with env-driven origin list (operational risk)
CORS | Severity GREEN | Confidence high
Evidence: `backend/app/middleware.py:206-218` — `allow_credentials=True` with
`allow_origins=settings.cors_origins_list()` (`config.py:43,121`); dev default is
localhost only, no wildcard in code.
Issue: Code is correct (no `*`); risk is purely operational — a prod env setting
`CORS_ORIGINS=*` would pair credentials with any origin. Realistic scenario:
misconfig, not a code bug. Fix direction: add a deploy-checklist assertion that prod
`CORS_ORIGINS` is an exact allowlist. Verify: confirmed (code GREEN; operational note)

### [AUD-023] Alembic chain integrity + model/table sync — clean (positive control)
Alembic/Schema | Severity GREEN | Confidence high
Evidence: 17 versions trace a single linear chain `ef8fb1858f5b` (baseline, 34 tables)
→ … → `a7f3e9c14d28` (HEAD), each with exactly one `down_revision`, no forks/orphans.
Net table delta: −2 (MEH-587 drop recipes/recipe_ingredients) +2 (MEH-588 producer_recipes)
+1 (MEH-509 inbound_messages) = **35**, matching CI `EXPECTED_REV=a7f3e9c14d28`
`EXPECTED_TABLES=35` (`.github/workflows/pr-checks.yml`) and 35 ORM entities in
`models/models.py`. Drops verified empty/post-overlap; non-null adds carry
`server_default`; FK ondelete actions intentional (MEH-311 SET NULL, MEH-313 CASCADE).
Issue: none — chain, table count, and ORM are in sync; expand-contract (ADR-007)
correctly applied. Realistic scenario: none. Fix direction: none. Verify: confirmed (no finding)

### [AUD-024] `create_all()` on boot is a second schema path (dev/CI only)
Alembic/Schema | Severity GREEN | Confidence high
Evidence: `backend/app/startup.py:74-76`
```python
Base.metadata.create_all(bind=engine)  # MEH-352: dev/CI safety net;
# checkfirst=True → no-op when tables exist (prod uses Alembic)
```
Issue: A documented residual of the MEH-265/267 "two parallel schema mechanisms"
smell — `_migrate_columns` was removed but `create_all` on boot remains. `checkfirst`
no-ops in prod (tables already exist via Alembic), so prod is single-authority; the
real (low) risk is dev/CI: tests run against a `create_all`-built schema and could
pass even if a migration is missing. The `EXPECTED_REV`/`EXPECTED_TABLES` CI gate
mitigates this. Realistic scenario: a model column added without a migration passes
local tests, caught only by the drift gate. Fix direction: gate `create_all` behind
an explicit dev-only flag, or run CI against `alembic upgrade head` not `create_all`.
Verify: rejected-low-impact (mitigated by CI drift gate; documented MEH-352 decision)

### תקציר (עברית)
פאזה A (7 סוכנים מקבילים, קריאה-בלבד): **לא נמצאו פרצות IDOR/הרשאות** — כל
מוטציה נבדקת מול בעלות-או-אדמין (AUD-021). הממצא הפעיל המרכזי: WhatsApp מתייחס
ל-HTTP 200 כ"נשלח" בלי לקרוא את גוף-התשובה של Graph, כך שהודעות שלא נמסרו
נרשמות כהצלחה (AUD-009/010, YELLOW). פערי ולידציה של טקסט-חופשי לפי MEH-555
על מספר סכמות (AUD-011/012, YELLOW — כבר בבק-לוג). השוואת fingerprint לא
קבועת-זמן (AUD-014). **AUD-004 נדחה** — אין שימוש ב-`request.url` להחלטת אבטחה
(AUD-019). סודות קשיחים: אין. CORS/rate-limit/headers תקינים ברובם (GREEN).
שרשרת Alembic נקייה ולינארית (17 גרסאות, 35 טבלאות, אפס דריפט מול המודלים —
AUD-023); `create_all` בבוט נשאר כרשת-ביטחון ל-dev/CI בלבד (AUD-024).

---

## Audit-B — Frontend / RTL / i18n

_(Session 3 — empty skeleton)_

Carry-over from Audit-0: AUD-007 (eslint `security/detect-object-injection` ×122,
`react-hooks/set-state-in-effect` ×40 — line-level triage), AUD-006 (Next.js
upgrade tracking).

### תקציר (עברית)
_(ריק)_

---

## Audit-C — Logic / Data

_(Session 4 — empty skeleton)_

Carry-over from Audit-0: mypy `union-attr`/`assignment` classes where they touch
models/schemas (`raw/mypy.txt`).

### תקציר (עברית)
_(ריק)_

---

## Audit-D — Infra / Config

_(Session 5 — empty skeleton)_

### תקציר (עברית)
_(ריק)_

---

## Final Triage

_(Session 6 — empty skeleton. Dedup AUD-XXX across sections, reconcile severity,
write Exec Summary + per-section Hebrew summaries, produce remediation ticket list.)_

### תקציר (עברית)
_(ריק)_
