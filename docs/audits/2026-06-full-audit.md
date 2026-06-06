# 2026-06 Full Codebase Audit

> Refs MEH-214. Read-only audit — **no source-code edits in any of the 6 sessions**.
> Findings live in this file only. Branch: `feature/audit-2026-06-full` (off `staging`,
> one branch for all 6 sessions). Raw tool output: [`raw/`](./raw/).

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

_(Session 2 — empty skeleton)_

Carry-over from Audit-0: AUD-001 (silent-except cluster, confirm vs MEH-325),
AUD-004 (confirm whether `middleware.py` gates on `request.url.path`),
mypy real-signal classes (`union-attr` ×33, `arg-type` ×110, `assignment` ×127 —
`raw/mypy.txt`).

### תקציר (עברית)
_(ריק)_

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
