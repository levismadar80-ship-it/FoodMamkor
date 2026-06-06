# 2026-06 Audit Fix-Wave — Autonomous LOW-RISK lane + DEFER package

> Companion to [`2026-06-full-audit.md`](./2026-06-full-audit.md) (AUD-001…056).
> Overnight autonomous wave. **AUTOFIX** = LOW-RISK, mechanically build-verified,
> shipped as draft PRs off `staging` (no merges — Sapir reviews in the morning).
> **DEFER** = prepared, NOT applied (schema/auth/WhatsApp/workflows/security/copy/deps).
> Lane policy per ADR-016 + the wave brief: uncertain → DEFER; "DEFER is success".

## Environment notes for this wave
- Audit findings were taken against `staging@ed04af8`; this wave ran against
  **current `staging@b5d5a0f`**. Several frontend findings were **already fixed**
  on staging (audit was stale) — each AUTOFIX site was re-verified before editing.
- **`backend/.env*` (incl. `.env.example`) is unreadable/unwritable** by Claude —
  blocked by `.claude/hooks/check-env-read.sh` (correct security boundary). So all
  `.env.example` fixes (AUD-049/050/051) are DEFER-by-block, with exact diffs below
  for Sapir to apply in her own terminal.
- `.github/workflows/**` edits are denied by settings — AUD-052 twin YAML is written
  here verbatim for Sapir to paste (MEH-759/762 precedent).
- pytest not runnable (no Postgres, MEH-672); frontend verified via `npm run build`.

---

## AUTOFIX — shipped this wave (draft PRs, off `staging`)

| PR | AUD | Pattern | Files | Verify |
|---|---|---|---|---|
| **#974** | AUD-026 | bidi LTR-isolation of numerics | `ExperienceCard.jsx`, `HomeProductCard.jsx`, `ReviewsSection.jsx` | `npm run build` ✅ |

**PR #974 detail (AUD-026):** wrapped price/avg-rating/date numerics in `dir="ltr"`
(isolated only the numeric branch; Hebrew free-labels untouched). Re-verified vs
current staging: `MapProducerCard.jsx` was **already fixed** (excluded);
`admin/group-buys/page.js` (admin-only) + `GroupBuyDetailClient.jsx` (carries an
unrelated physical-RTL class → would trip the RTL hook) **deferred** (see DEFER-FE).

_No other finding qualified for same-night AUTOFIX: AUD-050 is env-file-blocked;
AUD-025/033 need per-site re-verification against the moved staging (see DEFER)._

---

## Triage table — all 56 findings → lane

`FIXED` = shipped this wave · `DEFER` = prepared below · `N/A` = not actionable
(rejected-FP / positive-control / accepted-low-impact needing no change).

| AUD | Sev | Lane | Disposition |
|---|---|---|---|
| 001 bare except×4 | GREEN | DEFER | backend error-handling; optional narrow-except (DEFER-BE) |
| 002 pyjwt CVEs | YELLOW | DEFER | dep bump (DEFER-DEP) |
| 003 python-multipart DoS | YELLOW | DEFER | dep bump (DEFER-DEP) |
| 004 starlette host-header | — | N/A | rejected-FP (AUD-019) |
| 005 SHA1 HIBP | GREEN | N/A | rejected-FP; optional `usedforsecurity=False` (DEFER-BE) |
| 006 postcss via next | GREEN | N/A | breaking downgrade; clears on next Next.js bump |
| 007 eslint object-injection | — | N/A | rejected-FP (AUD-037) |
| 008 transitive deps | GREEN | DEFER | dep bump batch (DEFER-DEP) |
| 009 WhatsApp 200≠delivered | YELLOW | DEFER | service behavior (DEFER-WA) |
| 010 WhatsApp 24h window | YELLOW | DEFER | service behavior (DEFER-WA) |
| 011 MEH-555 free-text validation | YELLOW | DEFER | backend schema validators (DEFER-BE) |
| 012 admin_notes sanitize | YELLOW | DEFER | backend schema (DEFER-BE) |
| 013 unbounded list | GREEN | DEFER | backend schema (DEFER-BE) |
| 014 fingerprint compare | YELLOW | DEFER | auth code (DEFER-AUTH) |
| 015 reset-password rate limit | YELLOW | DEFER | auth/rate-limit (DEFER-AUTH) |
| 016 Apple JWKS monotonic | GREEN | DEFER | oauth code (DEFER-AUTH) |
| 017 contact-form PII log | GREEN | DEFER | logging + new mask helper (DEFER-BE) |
| 018 Sentry PII | GREEN | DEFER | sentry config (DEFER-BE) |
| 019 AUD-004 resolution | — | N/A | rejected-FP record |
| 020 backend HSTS/CSP | GREEN | DEFER | security headers (DEFER-SEC) |
| 021 IDOR sweep | GREEN | N/A | positive control |
| 022 CORS | GREEN | N/A | code GREEN; operational note |
| 023 alembic chain | GREEN | N/A | positive control |
| 024 create_all on boot | GREEN | DEFER | startup gate (DEFER-BE) |
| **025 RTL text-right** | YELLOW | DEFER | AUTOFIX-eligible; re-verify vs staging (DEFER-FE) |
| **026 bidi isolation** | YELLOW | **FIXED #974** | partial (public cards); admin/groupbuy deferred |
| 027 en.json Hebrew values | YELLOW | DEFER | copy-approval gate rule 22 (DEFER-COPY) |
| 028 ChatWidget hardcoded | YELLOW | DEFER | i18n migration + copy (DEFER-COPY) |
| 029 forbidden term יצרן | YELLOW | DEFER | copy-approval gate (DEFER-COPY) |
| 030 date-in-render hydration | GREEN | DEFER | hydration logic (DEFER-FE) |
| 031 Math.random id | YELLOW | DEFER | useId swap (DEFER-FE, autofix-eligible) |
| 032 useSearchParams Suspense | YELLOW | DEFER | component tree (DEFER-FE) |
| **033 a11y form labels** | YELLOW | DEFER | AUTOFIX-eligible; re-verify vs staging (DEFER-FE) |
| 034 contrast fg-muted | YELLOW | DEFER | design-token decision (DEFER-DESIGN) |
| 035 modal focus trap | YELLOW | DEFER | modal logic (DEFER-FE) |
| 036 color drift | YELLOW | DEFER | broad token migration (DEFER-DESIGN) |
| 037 AUD-007 resolution | — | N/A | rejected-FP record |
| 038 FE positive controls | GREEN | N/A | positive control |
| 039 availability validation | YELLOW | DEFER | validation logic (DEFER-LOGIC) |
| 040 vacation tz | YELLOW | DEFER | timezone logic (DEFER-LOGIC) |
| 041 C1 REDs rejected | GREEN | N/A | rejected-FP record |
| 042 check-then-act races | YELLOW | DEFER | **Alembic** unique constraints (DEFER-SCHEMA) |
| 043 admin-approve double-notify | YELLOW | DEFER | status guard (DEFER-LOGIC) |
| 044 GroupBuy deadline tz | YELLOW | DEFER | logic (DEFER-LOGIC) |
| 045 ISR revalidation | YELLOW | DEFER | revalidate infra (DEFER-FE) |
| 046 registration UX | YELLOW | DEFER | central register flow (DEFER-FE) |
| 047 tier-2 gray | YELLOW | DEFER | design-token choice (DEFER-DESIGN) |
| 048 C positive controls | GREEN | N/A | positive control |
| 049 undocumented env vars | YELLOW | DEFER | env-file blocked (DEFER-ENV) |
| 050 7-day token in example | YELLOW | DEFER | env-file blocked (DEFER-ENV) |
| 051 env hygiene | GREEN | DEFER | env-file blocked + config (DEFER-ENV) |
| 052 MEH-736 twins absent | YELLOW | DEFER | workflows-denied; YAML below (DEFER-CI) |
| 053 header conflict | YELLOW | DEFER | deploy config / security (DEFER-SEC) |
| 054 CSP unsafe-eval | GREEN | DEFER | CSP decision (DEFER-SEC) |
| 055 mypy 639 | GREEN | N/A | no runtime crashes; annotation debt |
| 056 D positive controls | GREEN | N/A | positive control |

**Lane totals:** FIXED 1 (AUD-026, partial) · DEFER 33 · N/A 22.

---

## DEFER packages (prepared, NOT applied — Sapir's morning triage input)

### DEFER-ENV — `.env.example` (BLOCKED: env-read hook). Apply in your terminal.
- **AUD-050 (P1):** edit `backend/.env.example` — change
  `ACCESS_TOKEN_EXPIRE_MINUTES=10080` → `ACCESS_TOKEN_EXPIRE_MINUTES=15` (or delete
  the line; code default is 15, MEH-326). `Settings(BaseSettings)` maps this var, so
  the example value really would ship a 7-day access token. Add comment: `# 15 min;
  paired with 14-day refresh (REFRESH_TOKEN_EXPIRE_DAYS) — do not lengthen.`
- **AUD-049 (P2):** add to `backend/.env.example` (already read in code, undocumented):
  `TRUSTED_PROXY` (rate_limit.py:53, security-relevant), `LOG_LEVEL`/`LOG_FORMAT`
  (logging_config.py:40,46), `BACKEND_SENTRY_DSN` (sentry.py:31), `APP_VERSION`/
  `RAILWAY_GIT_COMMIT_SHA` (sentry.py:41-42). Frontend: `SENTRY_ORG`/`SENTRY_PROJECT`
  (build-time). Env-drift CI job validates `.env.example` — re-run after editing.
- **AUD-051 (P3):** remove unwired/unused `ALGORITHM` + `WHATSAPP_BUSINESS_ID` from
  example; add a `Field(alias="JWT_SECRET_KEY")` on `secret_key` (config.py:25) to
  retire the manual `_load_settings` dual-name map.
- Suggested issue: `MEH-?? align .env.example with code (token TTL trap + undocumented vars)` — **P1**.

### DEFER-SCHEMA — Alembic (always Sapir-explicit). AUD-042.
Draft revision (do NOT apply as-is — verify table/column names + set
`down_revision = "a7f3e9c14d28"` = current head):
```python
"""MEH-?? add unique constraints to prevent duplicate reports / referrals"""
from alembic import op
revision = "<new>"
down_revision = "a7f3e9c14d28"

def upgrade():
    # AUD-042: Report check-then-act → DB-enforced uniqueness
    op.create_unique_constraint("uq_report_reporter_producer", "reports",
                                ["reporter_id", "producer_id"])
    # AUD-042: Referral double-credit
    op.create_unique_constraint("uq_referral_one_per_referee", "referral_clicks",
                                ["referee_id"])

def downgrade():
    op.drop_constraint("uq_report_reporter_producer", "reports", type_="unique")
    op.drop_constraint("uq_referral_one_per_referee", "referral_clicks", type_="unique")
```
**Pre-apply:** dedupe existing rows first (a `create_unique_constraint` fails on
existing dupes), and the routers (`reports.py:29-49`, `referrals.py:33-48`) must
catch `IntegrityError` → friendly 409. GroupBuy capacity (AUD-042) is a **row-lock**
fix (`SELECT … FOR UPDATE` in `group_buys.py:97-124`), not a constraint. Also bump
`EXPECTED_REV`/`EXPECTED_TABLES` in `pr-checks.yml`. Risk: RED-tier (schema + data
dedupe). Suggested: `MEH-?? unique constraints: Report + ReferralClick + groupbuy lock` — **P1**.

### DEFER-WA — WhatsApp service. AUD-009/010.
`backend/app/services/whatsapp.py:46-52` `_post()` — after `raise_for_status()`,
parse `r.json()` and return `False` on an `error` key or empty `messages[]`. Gate
`send_text()` on the 24h window (track `last_inbound_at`) or rename best-effort +
branch callers to a template. Risk: service-behavior, needs delivery-path testing.
Suggested: `MEH-?? WhatsApp: 200≠delivered + 24h window enforcement` — **P1**.

### DEFER-LOGIC — availability + admin-approve + deadline. AUD-039/040/043/044.
- AUD-039: add a `model_validator` on `AvailabilityStateUpdate` (schemas.py:1558) —
  enforce `state ∈ AVAILABILITY_STATES`, require `vacation_until` when `on_vacation`,
  `vacation_until >= today`.
- AUD-040: compare vacation in `Asia/Jerusalem` not UTC `date.today()` (schemas.py:572).
- AUD-043: guard `if producer.status != 'pending': raise 409` before approve+notify (admin.py:269-301).
- AUD-044: tz-aware `GroupBuy.deadline` comparison (group_buys.py:95).
- Suggested: `MEH-?? availability validation + tz; admin-approve idempotency` — **P2**.

### DEFER-AUTH — AUD-014/015/016. Auth lane = explicit approval + CVE check (rule 5a).
- AUD-014: `auth.py:193` → `not hmac.compare_digest(hash_fingerprint(cookie_fp), fp_claim)`.
- AUD-015: add per-email dual-key limit to `/reset-password` (auth.py:~1090) + collapse
  404/410 to one response. **First confirm `reset_token` entropy** at the generation site.
- AUD-016: `oauth_verifiers.py` JWKS TTL → `time.monotonic()`. Suggested: **P2**.

### DEFER-BE — backend hygiene. AUD-011/012/013/017/018/024/001/005.
MEH-555 letter-validators on the named free-text fields (schemas.py lines in AUD-011/012);
`max_length` on the 3 lists (AUD-013); `mask_email()` helper + apply at marketing.py:182
(AUD-017); explicit `send_default_pii=False`+`before_send` (sentry.py, AUD-018); gate
`create_all` behind a dev flag (startup.py:74, AUD-024); narrow the bare-excepts (AUD-001);
`usedforsecurity=False` on the HIBP SHA1 (AUD-005, cosmetic). Suggested: `MEH-?? backend input-validation + PII-log hygiene` — **P2**.

### DEFER-FE — frontend (AUTOFIX-eligible, re-verify vs staging first).
- **AUD-025 (RTL `text-right`→`text-end`, ~30 sites):** mechanical, RTL-visually
  identical. Blocked from same-night autofix because the audit line numbers are stale
  (staging moved) and the `check-rtl.sh` hook blocks edits to files with any other
  un-annotated physical class — needs per-file re-grep. Representative sites (re-verify):
  `SmartSearch.jsx`, `HeroSearch.jsx`, `CategoryRequestModal.jsx`, `AboutClient.jsx`,
  `producer/dashboard/group-buys/page.js`. Keep documented `rtl-ok` exceptions.
- **AUD-033 (a11y form labels):** add `aria-label` (reuse existing placeholder string —
  no new copy) to inputs in `CategoryRequestModal.jsx`, `CategorySelector.jsx`. Re-verify
  still placeholder-only on staging.
- **AUD-031:** `CitiesAutocomplete.jsx` `useRef(Math.random())` → React `useId()`.
- **AUD-026 remainder:** `admin/group-buys/page.js` prices + `GroupBuyDetailClient.jsx`
  deadline/prices (the latter needs its 1 physical-class handled or file path-exempted).
- **AUD-032/035/045/046/030:** Suspense wrap, modal focus-trap, ISR `revalidatePath`,
  registration gate, date-in-render — all touch component logic → standard review.
- Suggested: `MEH-?? FE mechanical sweep (RTL + aria + useId)` **P3** · `MEH-?? FE logic (Suspense/focus-trap/ISR)` **P3**.

### DEFER-COPY — needs Smadar copy approval (workflow rule 22). AUD-027/028/029.
Proposed (NOT applied): `en.json` translations — `nav.add_business_short` "הוסיפו עסק"→
"Add a Business", `home.hero.cta_primary` "גלו עסקים"→"Discover Businesses",
`home.hero.how_it_works`→"How It Works", `home.categories.eyebrow`→"Categories",
`producer.card.favorites.aria`→"Save". ChatWidget strings → move to catalog. "יצרן"
badge (badges.js:43-44) → reword e.g. "רישיון ייצור". Suggested: `MEH-?? i18n copy fixes (approve verbatim first)` — **P3**.

### DEFER-DESIGN — token decisions. AUD-034/036/047.
`fg-muted` contrast on cream (darken token or `text-text` for small text); tier-2 badge
gray→`primary/10` or `green-50` (ADR-019, TrustBadge.jsx:9); scattered hardcoded hex →
theme. Designer call. Suggested: `MEH-?? design-token contrast + tier-2 + drift` — **P3**.

### DEFER-SEC — security headers / CSP. AUD-020/053/054.
Single header source: drop headers from `frontend/vercel.json` (X-Frame-Options DENY vs
SAMEORIGIN conflict), keep `next.config.js`; add backend HSTS/CSP for parity; move toward
nonce-based CSP to drop `unsafe-inline`/`unsafe-eval`. Suggested: `MEH-?? consolidate security headers` — **P2**.

### DEFER-DEP — dependency bumps (no-new-deps rule; batch). AUD-002/003/008.
`python-multipart 0.0.26→0.0.27` (real DoS, **P1-ish**), `pyjwt 2.12→2.13` (auth file →
CVE check), transitive `aiohttp/idna/urllib3` batch. `postcss` (AUD-006) clears on next
Next.js bump — do NOT `audit fix --force`. Suggested: `MEH-?? dep refresh` — **P2**.

---

## AUD-052 — MEH-736 docs-only twin jobs (verbatim, paste into workflows yourself)

The 5 path-gated required checks skip on docs-only PRs and report "Expected" under
Rulesets → blocks merge (this is why **PR #969 can't auto-merge**). Add a no-op twin
per required job: identical `name:`, **exact-complement** `if:`, `exit 0`. Pattern
(in `pr-checks.yml`, mirror for `deploy.yml`'s `Frontend lint` + `API contract audit`):

```yaml
  # --- MEH-736 docs-only twin: satisfies the required check when the real
  #     job is path-skipped. name: MUST match the real job's name exactly. ---
  frontend-build-docs-twin:
    name: Frontend build (Next.js)
    needs: changes
    if: ${{ needs.changes.outputs.frontend != 'true' && needs.changes.outputs.workflows != 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "docs-only PR — Frontend build not required"; exit 0'

  backend-tests-docs-twin:
    name: Backend tests (pytest)
    needs: changes
    if: ${{ needs.changes.outputs.backend != 'true' && needs.changes.outputs.workflows != 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "docs-only PR — Backend tests not required"; exit 0'

  backend-lint-docs-twin:
    name: Backend lint (ruff)
    needs: changes
    if: ${{ needs.changes.outputs.backend != 'true' && needs.changes.outputs.workflows != 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "docs-only PR — Backend lint not required"; exit 0'
```
And in `deploy.yml` (twin for each of its 2 required jobs — match their real `if:`
complement and `needs:` exactly):
```yaml
  frontend-lint-docs-twin:
    name: Frontend lint (RTL + Next.js rules)
    needs: changes
    if: ${{ needs.changes.outputs.frontend != 'true' && needs.changes.outputs.workflows != 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "docs-only PR — Frontend lint not required"; exit 0'

  api-contract-docs-twin:
    name: API contract audit (static)
    needs: changes
    if: ${{ needs.changes.outputs.backend != 'true' && needs.changes.outputs.workflows != 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "docs-only PR — API contract audit not required"; exit 0'
```
**Caveats Sapir must verify before paste:** (1) the real jobs' exact `if:` expressions
and `needs.changes.outputs.*` names (I read `frontend`/`backend`/`workflows`; confirm in
each file); (2) the twin `if:` must be the *exact* complement of the real `if:` (no gap/
overlap) or a real check could be skipped on a code PR; (3) `Env drift (.env.example)`
already runs unconditionally — no twin needed. Suggested: `MEH-?? add MEH-736 docs-only twins` — **P2**.

---

## BLOCKED (logged, skipped, continued)
- **AUD-050/049/051** — `backend/.env.example` read+write denied by `check-env-read.sh`
  (env-file boundary). Exact diffs provided in DEFER-ENV for terminal application.
- **AUD-052** — `.github/workflows/**` write denied by settings. Verbatim YAML above.
- No scope-explosion / repeated-failure STOP conditions hit.

## Progress (resumable)
- [x] Triage all 56 → lanes
- [x] AUTOFIX PR #974 (AUD-026 bidi) — build-verified, pushed, draft
- [x] DEFER packages prepared (all lanes)
- [x] AUD-052 twin YAML
- [x] HANDOFF.md updated · audit doc status appended
