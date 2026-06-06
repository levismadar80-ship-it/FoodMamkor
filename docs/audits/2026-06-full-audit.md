# 2026-06 Full Codebase Audit

> Refs MEH-214. Read-only audit — **no source-code edits in any of the 6 sessions**.
> Findings live in this file only. Branch: `feature/audit-2026-06-full` (off `staging`,
> one branch for all 6 sessions). Raw tool output: [`raw/`](./raw/).

## PROGRESS (resumability checklist)

Overnight autonomous run. Commit + push after every phase. On re-run, skip checked phases.

- [x] **Phase 0** — Tools + skeleton (prev session): AUD-001..008, raw/ committed.
- [x] **Phase A** — Backend / Security (7 areas). → Audit-A (AUD-009..024; no IDOR/secrets, AUD-004 closed-FP)
- [x] **Phase B** — Frontend / RTL / i18n / a11y (6 areas). → Audit-B (AUD-025..038; AUD-007 closed-FP)
- [x] **Phase C** — Logic / Data / State (6 areas). → Audit-C (AUD-039..048; both C1 REDs rejected on verify)
- [x] **Phase D** — Infra / Config / CI / Deps (5 areas). → Audit-D (AUD-049..056; mypy carry-over closed)
- [x] **Phase Final** — Cross-domain dedup, re-verify REDs, exec summary, HANDOFF, PR ready.

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

**56 findings, AUD-001…056. Zero RED. 33 YELLOW · 23 GREEN.** No exploitable
auth/IDOR/secret/data-loss issue found — consistent with a codebase hardened across
50+ prior security tickets. Every RED proposed by the area subagents (WhatsApp
delivery, availability dual-write ×2, ISR staleness, hydration, en.json) was
**downgraded or rejected on source verification** — the expected calibration
(~20% FP, ~50% low-impact). The top risks are bounded YELLOWs; the single most
important is a documentation trap (`.env.example`) not a code flaw.

### תקציר מנהלים (עברית) — 5 הסיכונים האמיתיים המובילים

1. **טוקן-גישה של 7 ימים דרך `.env.example` (AUD-050).** הקובץ קובע
   `ACCESS_TOKEN_EXPIRE_MINUTES=10080` — `BaseSettings` ממפה זאת ודורס את ברירת-המחדל
   (15 דק׳), מבטל את עיצוב ה-short-token+refresh של MEH-326 ומרחיב את חלון הטוקן-הגנוב.
   הבעיה בקובץ-הדוגמה, לא בקוד. תיקון: להחזיר ל-15 / למחוק את השורה.
2. **WhatsApp: HTTP 200 ≠ נמסר (AUD-009/010).** `_post()` מחזיר `True` על 200 בלי לקרוא
   את גוף-התשובה של Graph; הודעות שנכשלו (מספר שגוי / מחוץ לחלון 24ש׳) נרשמות כהצלחה,
   ללא retry. כשל-שקט של מסירת-הודעות למשתמשים.
3. **מרוצי-תהליכים ללא unique-constraint (AUD-042/043).** Report/GroupBuy/Referral
   עושים check-then-act בלי אילוץ-ייחודיות → כפילויות / חריגת-קיבולת / זיכוי-כפול;
   אישור-מנהל מקביל שולח הודעת-קבלה פעמיים. תיקון: אילוצי-ייחודיות + guard סטטוס.
4. **ולידציית-שרת חסרה במצב-זמינות (AUD-039/040).** עדכון-מצב מקבל `state` כ-str חופשי
   וללא אכיפת זיווג `on_vacation`+`vacation_until`/תאריך-עתיד; ה-auto-clear בקריאה מבטל
   חופשה בפועל. בנוסף ההשוואה ב-UTC ולא בשעון-ישראל.
5. **תאומי docs-only של MEH-736 חסרים (AUD-052).** ה-YAML מעולם לא נוסף, לכן PRים של
   תיעוד (כולל **PR #969 הזה**) נחסמים על בדיקות-חובה במצב "Expected" ודורשים admin-merge.

מעבר לחמשת אלה — אשכול איכות-frontend (RTL `text-right`, בידוד-בידי במספרים, נגישות
IS-5568: תוויות/ניגודיות/מלכודת-פוקוס, AUD-025/026/033/034/035) ראוי ל-batch נפרד.
ביקורות-חיוביות חזקות תועדו (AUD-021/023/038/048/056): אפס IDOR, מחיקת-יצרן ללא יתומים,
שרשרת-Alembic נקייה, מודל-דרגות לא-שלילי, CSP מחמיר בצד-לקוח.

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

## Audit-B — Frontend / RTL / i18n / a11y

Phase B — 6 parallel read-only subagents (RTL, bidi, i18n, hydration, a11y,
token-drift/eslint). Carry-over **AUD-007 resolved** (see AUD-037). Numbering
continues from AUD-025.

### [AUD-025] RTL physical `text-right` instead of logical `text-end` (~30 sites)
RTL | Severity YELLOW | Confidence high
Evidence: 88 physical-class hits total; ~30 genuine violations (rest are documented
`rtl-ok` exceptions). Representative: `components/SmartSearch.jsx:194`,
`components/HeroSearch.jsx:258,337`, `components/CategoryRequestModal.jsx:62,76,89`,
`app/[locale]/about/AboutClient.jsx:95,168,211`, `app/[locale]/producer/dashboard/group-buys/page.js:70,81,92`.
Issue: `text-right` on inputs/headings/modals that inherit `dir="rtl"` should be the
logical `text-end` per `.claude/rules/rtl.md` (breaks if direction flips; the LTR
numeric-input exception does not apply to these). Realistic scenario: an EN/LTR
render mis-aligns these elements. Fix direction: mechanical `text-right → text-end`
on the non-exception sites. Verify: confirmed

### [AUD-026] Bidi: numeric/price/date rendered in RTL without LTR isolation (×8)
Bidi | Severity YELLOW | Confidence high
Evidence: `components/ExperienceCard.jsx:105` (price), `components/HomeProductCard.jsx:131`
(₪+unit), `components/ReviewsSection.jsx:186` (avg rating), `:306` (he-IL date),
`app/[locale]/group-buys/[id]/GroupBuyDetailClient.jsx:279` (deadline in `t()`),
`app/[locale]/admin/group-buys/page.js:124-125` (prices), `components/MapProducerCard.jsx:29,105`
(⭐ rating+count). Correct isolation exists at `components/ProducerCard.jsx:292` /
`OpeningHours.jsx:135` (reference).
Issue: numbers/dates from `toFixed`/`toLocaleString` inline in Hebrew without
`dir="ltr"`/`<bdi>` reorder (e.g. "⭐ 4.5 (12)" → "(12) 5.4 ⭐"). The repo's known
incident class. Realistic scenario: prices/ratings/dates display scrambled on
mobile cards. Fix direction: wrap each numeric span in `dir="ltr"` or `<bdi>`. Verify: confirmed

### [AUD-027] `en.json` contains untranslated Hebrew values (×6-8)
i18n | Severity YELLOW | Confidence high
Evidence: subagent diff of `messages/en.json` vs `he.json` — e.g. `nav.add_business_short`
= "הוסיפו עסק", `home.hero.cta_primary` = "גלו עסקים", `home.hero.how_it_works`
= "איך זה עובד", `home.categories.eyebrow` = "קטגוריות", `producer.card.favorites.aria`
= "שמירה". `robots.txt` does **not** disallow `/en/` (verified) — EN pages are crawlable.
Issue: English users (and crawlers) see Hebrew strings in nav/hero/categories. Key
parity is otherwise clean (0 missing keys). Realistic scenario: EN locale is reachable
and renders mixed-language UI. Fix direction: translate the offending `en.json` values.
Verify: confirmed

### [AUD-028] Hardcoded Hebrew strings in `ChatWidget.jsx` (outside catalog)
i18n | Severity YELLOW | Confidence high
Evidence: `components/ChatWidget.jsx:27` (OPENING_MESSAGE), `:42-49` (8 SUGGESTED_PROMPTS),
`:71-76` (HARDCODED_ANSWERS), aria-labels `:209,235,289`. A `TODO` at `:24` already notes it.
Issue: ~20 user-facing Hebrew strings bypass next-intl, so they're untranslatable and
inconsistent with the catalog approach. Realistic scenario: EN locale shows Hebrew
chat copy; copy edits require code changes. Fix direction: move to `messages/*.json`
under a `chatbot` key + `useTranslations`. Verify: confirmed

### [AUD-029] Forbidden brand term "יצרן" in trust-badge copy
i18n / Brand | Severity YELLOW | Confidence high
Evidence: `frontend/lib/badges.js:43-44` — `label: "רישיון יצרן"`, `tooltip: "בית העסק
מחזיק ברישיון יצרן ממשרד הבריאות."`
Issue: brand voice (BRAND.md / MEH-720 lineage) forbids "יצרן" in user-facing copy
(prefers "עסק"/"בית עסק"). Surfaces in a public trust badge. Realistic scenario:
off-brand term shown on producer cards/detail. Fix direction: reword to e.g.
"רישיון ייצור" / "אישור משרד הבריאות". Verify: confirmed (copy-approval gate applies — needs Smadar sign-off per workflow rule 22)

### [AUD-030] Date computed in render body → hydration mismatch risk (×3)
Hydration | Severity GREEN | Confidence med
Evidence: `components/Footer.jsx:221` `© {new Date().getFullYear()}`;
`components/admin/ProducerForm.jsx:680` and `app/[locale]/producer/dashboard/page.js:293`
`min={new Date().toISOString().slice(0,10)}`.
Issue: server-build vs client-load time can differ → React hydration warning. The
Footer year only diverges across a year boundary (negligible); the date-input `min`
diverges across a day boundary but those are client-rendered dashboard/admin views,
so SSR mismatch is bounded. Realistic scenario: a console hydration warning at a
date boundary; no functional break. Fix direction: compute via `useEffect`/`useId`-stable
value or pass as prop. Verify: rejected-low-impact (subagent's RED downgraded — narrow window + client-render context)

### [AUD-031] `Math.random()` DOM id in `CitiesAutocomplete` → hydration + a11y mismatch
Hydration / a11y | Severity YELLOW | Confidence high
Evidence: `components/CitiesAutocomplete.jsx:26` — `useRef(\`cities-listbox-${Math.random()...}\`).current`.
Issue: random id differs server vs client → `id`/`aria-controls` mismatch (hydration
warning + broken listbox association for AT). Realistic scenario: screen-reader
`aria-controls` points at a non-existent id after hydration. Fix direction: React
`useId()`. Verify: confirmed

### [AUD-032] `useSearchParams()` without a `<Suspense>` boundary (×2)
Hydration / Build | Severity YELLOW | Confidence med
Evidence: `app/[locale]/admin/producers/use-admin-producers.js:17`,
`components/ProducersClient.jsx:51` call `useSearchParams()` with no Suspense wrapper;
`app/[locale]/search/page.js` does it correctly (reference).
Issue: Next.js app-router requires a Suspense boundary around `useSearchParams` or the
page is forced fully dynamic / can error at prerender. Realistic scenario: build
warning or loss of static optimization on these routes. Fix direction: wrap callers in
`<Suspense>` per the search-page pattern. Verify: confirmed

### [AUD-033] a11y: form inputs without associated labels (×3)
a11y | Severity YELLOW | Confidence high
Evidence: `components/CategoryRequestModal.jsx:69-77` (name), `:83-91` (textarea),
`components/CategorySelector.jsx:31-38` (search) — placeholder only, no `<label>`/`aria-label`.
Issue: placeholders are not labels for screen readers (IS-5568 / WCAG 2.1 AA).
Realistic scenario: AT users can't identify these fields. Fix direction: add
`<label htmlFor>` or `aria-label`. Verify: confirmed

### [AUD-034] a11y: low contrast — `fg-muted` on cream background
a11y | Severity YELLOW | Confidence med
Evidence: tokens `fg-muted=#5c584f` on `background=#f5f0e8` ≈ 4.1:1 (below 4.5:1 AA for
small text); applied at `components/ProducerCard.jsx:276,301`, `components/CategoryTag.jsx:3`.
Issue: small muted text on cream fails WCAG AA / IS-5568. Realistic scenario:
low-vision users can't read category/location eyebrow text. Fix direction: darken the
muted token for small text or use `text-text`. Verify: confirmed (ratio approximate — final ratio check at fix time)

### [AUD-035] a11y: modal focus trap missing (×2)
a11y | Severity YELLOW | Confidence high
Evidence: `components/CategoryRequestModal.jsx:54-114` and `components/LocationModal.jsx:76-150`
have `role="dialog"`+`aria-modal`+Esc but no Tab focus trap; `LoginPromptModal.jsx:49-63`
and `Lightbox.jsx:42-63` implement it correctly (reference).
Issue: keyboard users can Tab out of the dialog into background content. Realistic
scenario: focus escapes the modal, AT users lost behind the overlay. Fix direction:
add the existing Tab-trap pattern from `LoginPromptModal`. Verify: confirmed

### [AUD-036] Hardcoded color drift beyond the documented exceptions (~50 hex / 65 files)
TokenDrift | Severity YELLOW | Confidence high
Evidence: beyond expected `#C8821E`/`#2E4A2E` (DESIGN.md) — `components/AvailabilityBadge.jsx:32-39`
(`#22c55e`/`#f97316`/`#A32D2D`), `Skeleton.jsx` (`#e8e0d0`), `lib/holidays.js:18-78`,
`lib/map-categories.js:29-42`, WhatsApp brand `#25D366` in `globals.css`.
Issue: design colors (status/placeholder) bypass tokens; semantic colors (holiday/category/
brand) are arguably non-token but still scattered. Realistic scenario: theme changes
miss these literals → visual drift. Fix direction: migrate design colors to Tailwind
theme; keep semantic maps in `lib/` but centralized. Verify: rejected-low-impact (hygiene; no functional/security impact)

### [AUD-037] AUD-007 resolution — eslint security/logic clusters triaged
eslint / Security | Severity GREEN | Confidence high
Evidence: `raw/eslint.txt` (3020 warnings). Top rules: `id-length` 1130,
`no-magic-numbers` 511, `complexity` 199, `unicorn/prefer-global-this` 183,
`max-lines` 174, `security/detect-object-injection` 122, `set-state-in-effect` 40.
Spot-check of 5 `detect-object-injection` hits (`AdminReviews.test.jsx:45`,
`BottomNav.test.jsx:22`, `ProducerCard.test.jsx:24,27`) → **100% false positive** —
all are test-mock objects indexed by hardcoded/app-controlled keys, no user-controlled
sink. `set-state-in-effect` ×40 (e.g. `LocationSelector.jsx:89`) = sub-optimal React
(extra render), not exploitable.
Issue: resolves the AUD-007 carry-over — no genuine object-injection sink among the
122; the remaining clusters are pure style. Realistic scenario: none security-relevant.
Fix direction: scope `detect-object-injection` off `__tests__/**`; `eslint --fix` the
style bulk; optionally refactor the ~5 set-state-in-effect components. Verify: rejected-FP (object-injection cluster) / rejected-low-impact (set-state-in-effect)

### [AUD-038] Frontend positive controls (no finding)
i18n / a11y | Severity GREEN | Confidence high
Evidence: he/en key parity = 0 gaps; ICU plurals use correct Hebrew categories
(`one`/`two`/`other`/`=0`, no misapplied `few`/`many`) across ~15 sampled keys;
`<Image>`/`<img>` alt coverage clean (decorative use `aria-hidden`, fallbacks use
`role="img"`+`aria-label`); modal body-scroll-lock present on `LoginPromptModal`/`Lightbox`
(missing only on the 2 modals in AUD-035, minor).
Issue: none — recorded so Final Triage doesn't re-open these. Verify: confirmed (no finding)

### תקציר (עברית)
פאזה B (6 סוכנים מקבילים): ~30 הפרות RTL (`text-right`→`text-end`, AUD-025) ופערי
בידי במספרים/תאריכים/מחירים ללא בידוד LTR (AUD-026) — שניהם מחלקות-תקלה מוכרות.
i18n: ערכים בעברית בתוך `en.json` (AUD-027), מחרוזות עברית קשיחות ב-ChatWidget
(AUD-028), והמונח האסור "יצרן" בתג-אמון (AUD-029, דורש אישור-קופי). נגישות (IS-5568):
תוויות-טופס חסרות (AUD-033), ניגודיות נמוכה של `fg-muted` על קרם (AUD-034), ומלכודת-
פוקוס חסרה ב-2 מודאלים (AUD-035). **AUD-007 נסגר** — 122 ה-detect-object-injection
כולם FP בקבצי-טסט (AUD-037). פריון: parity נקי, ICU תקין, alt תקין (AUD-038).

---

## Audit-C — Logic / Data / State

Phase C — 6 parallel read-only subagents (availability-state, registration,
trust-tier, race-conditions, data-integrity, ISR/cache). Orchestrator re-verified;
**both C1 REDs rejected** on verify (see AUD-041). mypy `union-attr` carry-over
resolved as SDK-type FP (AUD-048). Numbering continues from AUD-039.

State machine (confirmed): 4 states — `accepting_orders` (default, `server_default`),
`available_today`, `full_this_week`, `on_vacation` (excluded from default `/producers`
listing, requires `vacation_until`); legacy `is_available_today`/`availability_status`
dual-written during the MEH-291 overlap.

### [AUD-039] Availability-state update: no server-side validation of state/vacation pairing
AvailabilityState / Input-validation | Severity YELLOW | Confidence high
Evidence: `backend/app/schemas/schemas.py:1558-1565`
```python
class AvailabilityStateUpdate(BaseModel):
    state: str = Field(...)                 # plain str — no Literal/enum constraint
    vacation_until: date | None = Field(None, description="Required when state='on_vacation'")
```
No `@field_validator`/`@model_validator` enforces (a) `state ∈ AVAILABILITY_STATES`,
(b) `vacation_until` present when `state=='on_vacation'`, or (c) `vacation_until >=
today`. The output-side auto-clear (`:568-581`) only masks a passed date on read.
Issue: a client (or third-party app bypassing the FE `min=`) can persist
`(on_vacation, null)` or a past `vacation_until`, or an arbitrary `state` string; the
read-validator silently flips it to `accepting_orders` so the producer's vacation
never "sticks". Realistic scenario: producer sets vacation via a non-web client with no
date → API shows them accepting orders → they receive orders they can't fulfil. Fix
direction: add a `model_validator` enforcing the enum + pairing + future-date.
Verify: confirmed (groups C1-1/C1-7/C1-9; not RED — read-validator prevents bad output, so UX/contract not data-loss)

### [AUD-040] Vacation auto-clear uses UTC `date.today()`, not Israel tz; no server-side clear job
AvailabilityState / Timezone | Severity YELLOW | Confidence high
Evidence: `backend/app/schemas/schemas.py:572-573` — `self.vacation_until < date.today()`
(container is UTC; Israel is UTC+2/+3); no scheduled job clears expired `vacation_until`
(only this read-time recompute exists).
Issue: the auto-clear fires on the UTC date boundary, up to ~3h early relative to
Jerusalem; and a producer who never re-reads keeps a stale stored `vacation_until`.
Realistic scenario: producer returns 2026-06-07 but API flips to accepting at
2026-06-08 00:00 UTC (still evening 06-07 in Israel). Fix direction: compare in
`Asia/Jerusalem`; optionally a daily clear job (mirror `onboarding_followup.py`).
Verify: confirmed (groups C1-2/C1-3; bounded 1-day-boundary edge)

### [AUD-041] Availability — two RED claims rejected on verify + minor edges
AvailabilityState | Severity GREEN | Confidence high
Evidence: **C1-8 (dual-write drift, claimed RED) → rejected-FP**: `producer_me.py:362-375`
writes new + legacy columns in a single `db.commit()` — a transaction is atomic, the
"partial commit" path the subagent posited has no code path. **C1-10 (migration backfill,
claimed RED) → rejected-FP**: `alembic/versions/20260504_1911_2a74fa41ceb1` DOES backfill
(`UPDATE producers SET availability_state = CASE WHEN availability_status='vacation' THEN
'on_vacation' …`, lines 68-76) covering all states. Minor real edges kept low: implicit
`on_vacation` listing exclusion is undocumented in the API contract (`producer_listing.py:177-179`),
and the FE admin date `min=` blocks editing rows whose `vacation_until` is already past
(`ProducerForm.jsx:680`).
Issue: aggressive-agent REDs did not survive source verification; the surviving edges are
low-impact. Realistic scenario: n/a. Fix direction: document the implicit filter; relax the
FE `min=` for existing past values. Verify: rejected-FP (the 2 REDs) / rejected-low-impact (the edges)

### [AUD-042] Check-then-act without a unique constraint / row lock (×3)
RaceCondition | Severity YELLOW | Confidence high
Evidence: `backend/app/routers/reports.py:29-49` (no `uq(reporter_id, producer_id)`,
existence-check then insert); `backend/app/routers/group_buys.py:97-124`
(`len(gb.commits) >= max_participants` check then manual `+1`, non-atomic); 
`backend/app/routers/referrals.py:33-48` (no `uq(referee_id)`, check then insert).
Issue: two near-simultaneous requests both pass the check and both insert → duplicate
reports, group-buy capacity overshoot, or double-credited referral. (Sibling endpoints
`producer_follows`/home-product rating ARE guarded by unique constraints — those are fine.)
Realistic scenario: double-click or two tabs creates a duplicate row / over-fills a
group buy by one. Fix direction: add the unique constraints + `ON CONFLICT`/get-or-create;
use `SELECT … FOR UPDATE` for the group-buy capacity check. Verify: confirmed (groups C4-1/C4-2/C4-9)

### [AUD-043] Concurrent admin approval fires duplicate notifications (no status guard)
RaceCondition | Severity YELLOW | Confidence med
Evidence: `backend/app/routers/admin.py:269-301` — `producer.status = "approved"` set with
no `if status != 'pending'` pre-check; `notify_producer_approved()` called unconditionally
after commit.
Issue: two admins approving the same pending producer both read `pending`, both approve,
both send the welcome email/WhatsApp. Realistic scenario: duplicate welcome message to a
new producer (trust ding), or any once-only side-effect double-firing. Fix direction:
guard `if producer.status != 'pending': raise 409` before the transition. Verify: confirmed (C4-4)

### [AUD-044] `GroupBuy.deadline` naive datetime compared to `datetime.utcnow()`
DataIntegrity / Timezone | Severity YELLOW | Confidence med
Evidence: `backend/app/routers/group_buys.py:95` — `if gb.deadline < datetime.utcnow():`
(both naive). Works only while `deadline` is consistently stored naive-UTC.
Issue: latent — a future migration making the column tz-aware (or a tz-aware write
elsewhere) would silently shift deadlines by the offset. Realistic scenario: deadline
enforcement off by the UTC↔Israel offset after a schema change. Fix direction: store/compare
tz-aware consistently (`datetime.now(timezone.utc)`). Verify: confirmed (C5-1; latent, low today)

### [AUD-045] ISR-cached routes have no on-demand revalidation on mutation
ISR/Cache | Severity YELLOW | Confidence high
Evidence: `revalidate: 60` on `app/[locale]/producer/[id]/page.js:8`, `producers/page.jsx:27`,
`[slug]/page.js:22`; `revalidate: 3600` on `map/page.js:44`. Grep for
`revalidatePath`/`revalidateTag` across `frontend/` = **zero hits**; backend admin
mutations (`admin.py`) carry no revalidation trigger.
Issue: after an admin approve/edit/hide, cached pages serve stale content until the
time-based revalidate (self-heals in 60s for detail/list; **up to 1h for the map** —
the sharpest, an SEO-crawler staleness window). The repo's known "ISR survives mutation"
class, bounded here by the short intervals. Realistic scenario: a hidden producer still
appears on `/producers` for ≤60s, or a newly-approved producer is missing from the SSR
map for ≤1h. Fix direction: add `revalidatePath` via an on-demand `/api/revalidate` route
hit by backend mutations; cut the map interval. Verify: confirmed (groups C6-1/2/3/5/7; subagent REDs downgraded — 60s self-heal, not data-loss)

### [AUD-046] Registration: license gate client-only + step-init from stale token
Registration | Severity YELLOW | Confidence high
Evidence: `frontend/.../RegisterProducerClient.jsx:699-729` — step-2 submit gate omits
`licenseRequired && !producer_license_number` (backend `license_validation.py:52-70` DOES
422, so it's a UX backtrack, not a bypass); `:68-75` initializes `step=2` from
`localStorage.token` before the auth context resolves, so an expired/forged token lands
the user on step 2 (backend still rejects → no security gap, but confusing 409/500 surfacing).
Issue: both are UX/state bugs, not auth bypasses — backend re-enforces. Realistic scenario:
bakery producer submits without the required license, gets a server error after the success
transition; or an expired token drops the user mid-flow with a generic error. Fix direction:
mirror the license requirement in the FE gate; defer step init until `authLoading` resolves.
Verify: confirmed (groups C2-1/C2-2; backend-enforced, so bounded). Note: declaration IS server-stamped (`declared_at`/`DECLARATION_VERSION` set server-side, guard before write) — see AUD-048.

### [AUD-047] Trust-tier-2 badge uses gray, violating ADR-019 (not negative framing)
TrustTier / Design | Severity YELLOW | Confidence high
Evidence: `frontend/components/TrustBadge.jsx:9` — `2: "bg-gray-100 text-gray-600 border-gray-200"`
while tier-3 uses `primary`, tier-4 `amber`, tier-5 dark-green; `docs/decisions/ADR-019`
rejects the Tailwind `gray-*` scale as off-brand "SaaS-dashboard signal".
Issue: tier-2 (מוצהר/declared) is **not** negatively worded (label is the positive
"✓ מספר מאומת"), and is hidden on cards (shown only ≥ tier-3) — but the gray treatment
breaches the ADR-019 token lock. Realistic scenario: off-brand neutral-gray badge on the
producer detail page. Fix direction: switch tier-2 to the `primary/10` or `green-50` muted
token. Verify: confirmed (C3-1; brand-token violation, not the "negative-labeling" prohibition — that one passed)

### [AUD-048] Phase C positive controls (no finding)
Logic / Data | Severity GREEN | Confidence high
Evidence: **Trust-tier model clean** — tier-2 labeled positively in he+en, zero
"לא מאומת"/"unverified" framing anywhere, tier derived once in
`backend/app/services/trust_tier.py` (FE only displays), all tier i18n keys present
(C3-2/3/4/5). **Producer-delete cascade comprehensive** — FK CASCADE + explicit
PhoneOtpToken bulk-cleanup (`admin.py:330`, `auth.py:1286`) + post-commit Cloudinary
destroy, no orphans (C5-2). **Timezone correct** — `vacation_until` is a `Date`,
business hours use `Asia/Jerusalem` ZoneInfo (C5-4). **mypy `union-attr` carry-over =
FP** — the hits are Anthropic SDK content-block union types (`producer_risk.py:224,226`),
not nullable DB columns, which are guarded (C5-3). **Declaration server-stamped** —
`declared_at`/`DECLARATION_VERSION` set server-side with a guard before write (C2-3/4/5).
Issue: none — recorded so Final Triage doesn't re-open. Verify: confirmed (no finding)

### תקציר (עברית)
פאזה C (6 סוכנים): מכונת-המצבים של זמינות תקינה במבנה, אך **חסרה ולידציית-שרת**
על עדכון-מצב — `state` הוא str חופשי, וזיווג `on_vacation`+`vacation_until`/תאריך-עתיד
לא נאכף; ה-auto-clear בקריאה מסתיר זאת אך מבטל את החופשה בפועל (AUD-039), וההשוואה
ב-UTC ולא בשעון-ישראל (AUD-040). מרוצי-תהליכים: check-then-act ללא unique-constraint
ב-Report/GroupBuy/Referral (AUD-042) ואישור-מנהל כפול ששולח התראה פעמיים (AUD-043).
ISR ללא revalidation על מוטציה — נרפא ב-60ש׳, אך המפה עד שעה (AUD-045). **שני ה-REDs
של C1 נדחו** באימות (commit אטומי; ה-backfill קיים — AUD-041). ביקורות חיוביות חזקות:
מודל-הדרגות נקי ולא-שלילי, מחיקת-יצרן ללא יתומים, אזורי-זמן תקינים, ו-mypy union-attr=FP
(AUD-048).

---

## Audit-D — Infra / Config / CI / Deps

Phase D — 5 parallel read-only subagents (env-vars, CI, next/vercel config, deps+mypy,
dead-code+restore). Deps deduped to Audit-0 (AUD-002/003/006/008). mypy carry-over
fully resolved (AUD-055). Numbering continues from AUD-049.

### [AUD-049] Undocumented env vars read in code (incl. security-relevant `TRUSTED_PROXY`)
EnvVars | Severity YELLOW | Confidence high
Evidence: read in code, absent from `.env.example`/`docs/DEPLOYMENT.md`:
`TRUSTED_PROXY` (`rate_limit.py:53`, gates real-client-IP for rate limiting — MEH-256),
`LOG_LEVEL`/`LOG_FORMAT` (`logging_config.py:40,46`), `BACKEND_SENTRY_DSN` (`sentry.py:31`),
`APP_VERSION`/`RAILWAY_GIT_COMMIT_SHA` (`sentry.py:41-42`), FE `VERCEL_ENV`/`SENTRY_ORG`/`SENTRY_PROJECT`.
Issue: operators can't discover the rate-limit proxy flag or logging/observability knobs
from docs; `TRUSTED_PROXY` misconfig silently weakens per-IP rate limiting. Realistic
scenario: a fresh deploy omits `TRUSTED_PROXY`, rate limits key on the Railway proxy IP
instead of the client. Fix direction: add these to `.env.example` + DEPLOYMENT.md (per
workflow regression-rule 8, env-var additions are listed explicitly). Verify: confirmed

### [AUD-050] `.env.example` sets `ACCESS_TOKEN_EXPIRE_MINUTES=10080` — overrides 15-min to 7 days
EnvVars / Auth | Severity YELLOW | Confidence high
Evidence: `Settings(BaseSettings)` (`config.py:18`) auto-maps env by field name, and
`access_token_expire_minutes: int = 15` (`config.py:35`, MEH-326 short-TTL design) is a
real field; `backend/.env.example` lists `ACCESS_TOKEN_EXPIRE_MINUTES=10080` (7 days).
Issue: copying the example into Railway/`.env` lengthens the access token from 15 min to
**7 days**, defeating the short-access+refresh rotation (the FE 401→/refresh interceptor
never fires) and widening the stolen-token window. Verified: BaseSettings *does* map this
var (unlike the subagent's `ALGORITHM` claim — that's also mapped). Realistic scenario:
an operator follows `.env.example` verbatim and ships 7-day access tokens unknowingly.
Fix direction: set the example to `15` (or delete the line) + a comment pinning the pairing.
Verify: confirmed (security-adjacent; the example is the trap, not the code)

### [AUD-051] Env-config hygiene: stale/unused vars + dual secret-name fragility
EnvVars | Severity GREEN | Confidence high
Evidence: `WHATSAPP_BUSINESS_ID` (`config.py:62`) defined + documented but never read;
`ALGORITHM` in `.env.example` is overridable but shouldn't be tuned (HS256 is required);
`SECRET_KEY`/`JWT_SECRET_KEY` both accepted via a manual `_load_settings()` map
(`config.py:117`) with no pydantic alias — if both set, `SECRET_KEY` silently wins.
Issue: cosmetic/operational — misleading knobs and a fragile dual-name precedence.
Realistic scenario: env set under the non-winning name → unexpected secret. Fix direction:
remove unused/unwired example entries; add a proper `Field(alias=...)` for the secret.
Verify: rejected-low-impact

### [AUD-052] MEH-736 docs-only twin jobs absent → docs-only PRs block on required checks
CI | Severity YELLOW | Confidence high
Evidence: `.github/workflows/pr-checks.yml` — the 5 path-gated jobs (Frontend build:62,
Backend tests:108, Backend lint:265, mypy:340, etc.) carry `if: needs.changes.outputs.X
== 'true' || workflows == 'true'` with **no complementary `exit 0` twin**; only `Env drift`
(:309) is unconditional. `.claude/rules/testing.md:76` documents the twins as required,
but the YAML half was never appended (commit `6daf670` = "pre-twin half").
Issue: under Rulesets a skipped required check reports "Expected" and **blocks merge**, so
docs-only PRs (including **this audit PR #969**) need an admin merge — the exact MEH-736
gap that forced admin merges on #910/#913. Realistic scenario: #969 can't auto-merge once
ready. Fix direction: add the no-op docs-only twins (identical `name:`, complement `if:`,
`exit 0`) to `pr-checks.yml` + `deploy.yml`. Verify: confirmed (operational; affects this PR's merge path)

### [AUD-053] Conflicting security headers across `next.config.js` and `vercel.json`
Config / Security headers | Severity YELLOW | Confidence high
Evidence: `frontend/next.config.js:60` sets `X-Frame-Options: DENY`;
`frontend/vercel.json:10` sets `X-Frame-Options: SAMEORIGIN`. `vercel.json:5-14` also
re-declares a partial header set (X-Content-Type-Options, Referrer-Policy) but **no CSP**,
while `next.config.js:80-97` owns the full CSP+HSTS.
Issue: two header authorities for the same responses — the duplicate/conflicting
`X-Frame-Options` resolves implementation-dependently, weakening the clickjacking guarantee;
the split risks a future edit dropping CSP on one path. (This is the AUD-020 counterpart:
the FE *does* carry CSP+HSTS, confirming the backend omission is low-impact.) Realistic
scenario: ambiguous frame policy in prod. Fix direction: single source — drop headers from
`vercel.json`, keep `next.config.js`. Verify: confirmed

### [AUD-054] CSP `script-src` allows `'unsafe-inline'` + `'unsafe-eval'`
Config / Security headers | Severity GREEN | Confidence high
Evidence: `frontend/next.config.js:84` — `script-src 'self' 'unsafe-inline' 'unsafe-eval'
https://accounts.google.com …`. Comment justifies `unsafe-inline` (Next.js runtime +
Tailwind) but not `unsafe-eval`.
Issue: both directives materially weaken CSP's XSS protection, though they're a common
Next.js/Sentry-replay requirement and the rest of the policy is strict (Cloudinary img-only,
OAuth allowlist, Vercel-Live preview-gated). Realistic scenario: CSP would not stop an
inline-script XSS if one were introduced. Fix direction: move toward nonce/hash-based CSP
to drop `unsafe-inline`; document the `unsafe-eval` need. Verify: rejected-low-impact (framework-driven, documented partial)

### [AUD-055] mypy 639 errors — grouped; ~80% ORM/stub noise, ~20% annotation gaps, 0 runtime crashes
mypy | Severity GREEN | Confidence high
Evidence: `raw/mypy.txt` grouped by code — `no-untyped-def` 265 (real but stylistic
annotation gaps, e.g. Pydantic validators in `schemas.py`), `assignment` 127 (~90%
SQLAlchemy `Column[T]`-vs-`T` ORM pattern), `arg-type` 110 (~70% ORM `Column` boundary,
~30% untyped SDK stubs), `union-attr` 33 (**100% Anthropic SDK content-block FP**, e.g.
`producer_risk.py:224` guarded by `isinstance` at :226), plus `type-arg`/`no-untyped-call`/
stdlib-shadow noise.
Issue: resolves the Audit-0 mypy carry-over — none of the real-signal classes are
None-deref/runtime crashes; they're ORM typing patterns, missing third-party stubs, or
annotation debt (tracked separately). Realistic scenario: none. Fix direction: incremental
`no-untyped-def` cleanup in `schemas.py`; no blocking action. Verify: confirmed (no finding; closes the mypy carry-over)

### [AUD-056] Phase D positive controls (no finding)
Infra / CI / Config | Severity GREEN | Confidence high
Evidence: **CI** — migration drift gate `EXPECTED_REV="a7f3e9c14d28"` + `EXPECTED_TABLES=35`
(`pr-checks.yml:153-177`) matches the live HEAD (confirms AUD-023); `continue-on-error` used
only on non-gates (mypy/Knip/tsc warn-only, Smokeshow upload), api-contract gates hard-fail,
skills-audit path-gated. **next/vercel** — CSP locks Cloudinary to `img-src`, Vercel-Live
hosts appended only when `VERCEL_ENV=='preview'`, `images.remotePatterns` allowlisted
(cloudinary/unsplash), rewrites read `BACKEND_URL` (no user-controlled target), Sentry
report-uri fails open. **Backup** — `restore_from_backup.py` delegates to `pg_restore`
(full schema from dump); its `ROW_COUNT_TABLES` is a best-effort post-restore *subset*, not
a stale 34-table assumption. **Dead code** — none found (conservative; `/neighbor` correctly
excluded as intentionally deferred). **Deps** — no new vulns beyond AUD-002/003/006/008.
Issue: none — recorded so Final Triage doesn't re-open. Verify: confirmed (no finding)

### תקציר (עברית)
פאזה D (5 סוכנים): הממצא החד ביותר — `.env.example` קובע
`ACCESS_TOKEN_EXPIRE_MINUTES=10080` שדורס את ברירת-המחדל (15 דק׳) ל-7 ימים ומבטל
את עיצוב ה-short-token של MEH-326 (AUD-050, אומת ש-BaseSettings ממפה את המשתנה).
משתני-סביבה לא-מתועדים כולל `TRUSTED_PROXY` הרגיש (AUD-049). **תאומי docs-only של
MEH-736 חסרים** ב-YAML — PRים של תיעוד (כולל #969 הזה) ייחסמו על "Expected" (AUD-052).
כותרות-אבטחה מתנגשות בין next.config ל-vercel.json (AUD-053). CSP מאפשר unsafe-inline+
unsafe-eval (AUD-054, GREEN). **mypy 639 נסגר** — ~80% רעש ORM/stubs, אפס קריסות-ריצה
(AUD-055). ביקורות חיוביות: שער-מיגרציות תואם HEAD, CSP מחמיר, restore_from_backup בטוח,
אין dead-code (AUD-056).

---

## Final Triage

### Counts by section (raw / confirmed / rejected-FP / rejected-low-impact)

`confirmed` includes verified positive-controls ("confirmed (no finding)"). Some
findings carry a compound verdict (e.g. confirmed bump + low-impact exploit); counted
by primary verdict.

| Section | Raw | RED | YELLOW | GREEN | confirmed | rejected-FP | rejected-low |
|---|---|---|---|---|---|---|---|
| Audit-0 (tools) | 8 | 0 | 4 | 4 | 2 | 1 | 5 |
| Audit-A (backend/sec) | 16 | 0 | 8 | 8 | 11 | 1 | 4 |
| Audit-B (frontend) | 14 | 0 | 10 | 4 | 11 | 1 | 2 |
| Audit-C (logic/data) | 10 | 0 | 7 | 3 | 8 | 1 | 1 |
| Audit-D (infra/CI) | 8 | 0 | 4 | 4 | 5 | 0 | 3 |
| **Total** | **56** | **0** | **33** | **23** | **~37** | **~4** | **~15** |

Calibration check: of ~33 actionable (YELLOW) findings, the verify pass rejected the
**5 subagent-proposed REDs** (AUD-019/037/041 ×2 + the WhatsApp/ISR downgrades) and
demoted ~15 to low-impact — a ~36% reject/demote rate, in line with the expected
~20% FP + ~50% low-impact benchmark (reject rate is non-trivial → verify pass was not
too soft).

### Cross-domain dedup notes

- **Carry-overs closed:** AUD-004 (starlette host-header) → AUD-019 **rejected-FP**;
  AUD-007 (eslint object-injection) → AUD-037 **rejected-FP**; mypy `union-attr`/639
  → AUD-048/AUD-055 (SDK-type + ORM noise, no crash). All three Audit-0 "pending" items
  are resolved.
- **Severity reconciled (subagent REDs → final):** WhatsApp 200 (RED→**YELLOW** AUD-009),
  availability dual-write + backfill (RED→**rejected-FP** AUD-041), ISR staleness
  (RED→**YELLOW** AUD-045, 60s self-heal), Footer/date hydration (RED→**GREEN** AUD-030),
  en.json (RED→**YELLOW** AUD-027).
- **Related-but-distinct (kept separate):** `group_buys.py` appears in AUD-042 (capacity
  race) and AUD-044 (naive deadline) — different defects, not merged.
- **Cross-confirmations:** AUD-023 (alembic HEAD/35 tables) ↔ AUD-056 (CI gate
  `EXPECTED_REV/TABLES` matches); AUD-020 (backend no CSP/HSTS, low-impact) ↔ AUD-053/054
  (frontend CSP+HSTS present and strict → confirms backend omission is low-impact).

### Suggested Linear batch (one line each — NOT created; titles only)

**P1 (security-adjacent / data-integrity):**
- `MEH-?? fix .env.example ACCESS_TOKEN_EXPIRE_MINUTES 10080→15 (7-day token trap)` — AUD-050
- `MEH-?? WhatsApp: parse Graph response body, 200 ≠ delivered + enforce 24h window` — AUD-009/010
- `MEH-?? add unique constraints + guards: Report / GroupBuy capacity / Referral / admin-approve` — AUD-042/043
- `MEH-?? availability: server-side validate state enum + vacation_until pairing/future + Israel tz` — AUD-039/040

**P2 (correctness / CI / contract):**
- `MEH-?? add MEH-736 docs-only twin jobs to pr-checks.yml + deploy.yml` — AUD-052
- `MEH-?? single header source: drop headers from vercel.json (X-Frame-Options conflict)` — AUD-053
- `MEH-?? GroupBuy.deadline tz-aware comparison` — AUD-044
- `MEH-?? ISR on-demand revalidation (revalidatePath) on admin mutations; cut map 3600s` — AUD-045
- `MEH-?? document undocumented env vars (TRUSTED_PROXY, LOG_*, BACKEND_SENTRY_DSN)` — AUD-049
- `MEH-?? MEH-555 free-text letter-validation on remaining producer/product/experience fields` — AUD-011/012

**P3 (frontend quality — group as one epic):**
- `MEH-?? RTL text-right→text-end sweep (~30 sites)` — AUD-025
- `MEH-?? bidi LTR-isolation on prices/ratings/dates (×8)` — AUD-026
- `MEH-?? a11y: form labels + fg-muted contrast + 2 modal focus traps (IS-5568)` — AUD-033/034/035
- `MEH-?? i18n: translate en.json Hebrew values + ChatWidget catalog + reword "יצרן" (copy-approval)` — AUD-027/028/029
- `MEH-?? hydration: useId for CitiesAutocomplete + Suspense around useSearchParams` — AUD-031/032

**P4 (dep hygiene — batch bump):**
- `MEH-?? bump python-multipart 0.0.27 / pyjwt 2.13 / transitive (aiohttp/idna/urllib3) + postcss-via-next` — AUD-002/003/008/006

### BLOCKED

_None._ All 6 phases completed; no scope-explosion or blocked-path STOP conditions hit.
pytest remains deferred (no Postgres in sandbox, MEH-672) — documented in Audit-0, not
re-attempted here.

### Fix-wave status (2026-06-06, autonomous LOW-RISK lane)

A follow-on autonomous fix-wave triaged all 56 findings into AUTOFIX vs DEFER —
full ledger in [`2026-06-fix-wave.md`](./2026-06-fix-wave.md). Result: **1 AUTOFIX
PR shipped** (#974, AUD-026 bidi LTR-isolation, build-verified, draft, off `staging`),
**33 DEFER** (schema/auth/WhatsApp/workflows/security/copy/deps — prepared with
file:line + draft Alembic + verbatim MEH-736 twin YAML), **22 N/A** (FP / positive
controls). `.env.example` fixes (AUD-049/050/051) blocked by the env-read hook →
exact diffs handed to Sapir. No source edits on this audit branch (docs-only).

### תקציר (עברית)
הביקורת הושלמה: 56 ממצאים, **אפס RED**, 33 YELLOW, 23 GREEN. כל ה-REDs שהוצעו ע״י
תת-הסוכנים נדחו/הורדו באימות-מקור (שיעור-דחייה ~36%, תקין). שלושת ה-carry-overs
מ-Audit-0 נסגרו (AUD-004/007/mypy). הסיכון המוביל הוא מלכודת-תיעוד (`.env.example`),
לא פגם-קוד. רשימת-תיקונים מדורגת P1–P4 הוכנה ל-Linear (לא נוצרו issues). אין פריטי
BLOCKED; pytest נותר דחוי (אין Postgres ב-sandbox).
