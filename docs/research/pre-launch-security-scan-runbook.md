# Pre-launch security scan runbook

> Runbook deliverable for MEH-564. Audience: Smadar, ~30 min before public launch. Three external scans against `https://mehamakor.online` (production), copy-paste commands, fillable results tables. CC sandbox cannot run Docker or reach `securityheaders.com` — every step here is for Smadar's own terminal / browser.

This is a runbook, not a report. The findings columns stay empty in `staging` and get filled inline on the launch-day branch.

---

## TL;DR — three scans, one pass

| # | Scan | What it catches | Owner | Timing pre-launch |
|---|---|---|---|---|
| 1 | OWASP ZAP baseline (Docker) | Missing security headers, info disclosure, mixed content, cookie flags, well-known passive findings | Smadar (laptop, Docker required) | T-30 min |
| 2 | SecurityHeaders.com (browser) | Header grade A–F, HSTS / CSP / Referrer-Policy / Permissions-Policy presence | Smadar (browser, screenshot) | T-25 min |
| 3 | Snyk Code (free tier, web UI) | Static-analysis findings on the GitHub repo (auth, injection, dangerous APIs) | Smadar (only if Snyk account exists; otherwise skip) | T-20 min |

**Total time budget:** ~25 min execution + ~10 min triage. Total elapsed ≤ 45 min. Block-launch only on HIGH/CRITICAL.

---

## 1. OWASP ZAP baseline scan

**Command (run from Smadar's laptop, not CC sandbox):**

```bash
docker run --rm -v "$(pwd):/zap/wrk/:rw" \
  -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t https://mehamakor.online \
  -r zap-baseline-report.html \
  -I
```

Move output: `mv zap-baseline-report.html docs/research/zap-baseline-report.html`. If file > 1 MB, add to `.gitignore` and store the link/summary only.

**Why baseline NOT active scan.** `zap-baseline.py` is read-only — it crawls and runs passive rules. `zap-full-scan.py` adds active attacks (SQLi probes, XSS payloads, brute-force) which POST against real endpoints. Mehamakor's POST surface (`/auth/register`, `/producers`, `/reviews`, `/chat`) would receive real writes against the production DB — destructive against actual data, and would trip the rate limiter mid-scan invalidating the result. **Baseline only.** The `-I` flag prevents non-zero exit on warnings (so docker doesn't bail before the report is written).

**Production target (NOT staging).** The headers + cookie config we care about ship from `next.config.js` + Railway Cloudflare; both are environment-identical between staging and production today, but the launch-blocking grade is what users see — so we scan the host they will hit.

**Results template — fill inline pre-launch:**

| Severity | URL | Description | Fix | Confidence |
|---|---|---|---|---|
| HIGH | | | | CONFIRMED via curl / FLAGGED unable to reproduce |
| MEDIUM | | | | |
| LOW | | | | |
| INFO | | | | |

Confidence rules: **CONFIRMED** = `curl -sI` reproduces the missing/wrong header. **FLAGGED** = ZAP reports it, curl doesn't, or it requires a logged-in session ZAP didn't have. Treat FLAGGED as triage-by-eye, not auto-block.

**Known false-positive patterns (pre-mark these in the report):**

1. **CSP Report-Only present** — ZAP flags as "CSP not enforced". Intentional: we ship CSP in report-only mode behind a feature flag during stabilization (see `docs/SECURITY.md` §CSP). Not a finding.
2. **`/admin` returns 401 without auth** — ZAP sometimes flags as "potentially sensitive endpoint exposed". Intentional: 401 on unauth is the correct response — confirms the guard fires.
3. **Cookie missing `Secure` on probe domain** — only relevant if ZAP probed an `http://` redirect target before the 301 to `https://`. Verify with `curl -sI http://mehamakor.online` shows `301`/`308` to `https://`.
4. **`X-Powered-By` absent or `Next.js`** — Next sets this by default; we strip it via `poweredByHeader: false`. Verify in `frontend/next.config.js`. ZAP may flag the absence as info — ignore.

---

## 2. SecurityHeaders.com

**Manual:** open <https://securityheaders.com/?q=https%3A%2F%2Fmehamakor.online> in a browser. Take a screenshot of the grade page; save as `docs/research/security-headers-grade.png`.

**Target grade: A- minimum.** Below A-: open a SEV-2 ticket, but does not block launch unless an actual missing header (HSTS, X-Frame-Options) is the cause.

**Headers to confirm present:**

- `Strict-Transport-Security` — HSTS, ≥ 6 months `max-age`, `includeSubDomains` recommended.
- `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`).
- `Content-Security-Policy` — even in report-only mode counts; A- is achievable without enforcement.
- `Referrer-Policy: strict-origin-when-cross-origin` (Next.js default is fine).
- `Permissions-Policy` — at minimum disable `camera`, `microphone`, `geolocation` we don't use.

**Where headers live:** `frontend/next.config.js` — `headers()` block (per `docs/SECURITY.md`). Do NOT modify in this PR; if a header is missing, file the fix as a separate ticket per workflow rule 3 (one PR = one change).

**Alternative if SecurityHeaders.com is down:** [Mozilla Observatory](https://observatory.mozilla.org/analyze/mehamakor.online) — same headers checked, slightly different scoring scheme.

---

## 3. Snyk Code (free tier)

URL: <https://app.snyk.io/login>. Free tier requires a sign-in (GitHub OAuth recommended); sign-in is what blocks this from being scriptable.

**If Smadar has a Snyk account at scan time:** import `levismadar80-ship-it/FoodMamkor`, run **Snyk Code** (static analysis), export findings as JSON or screenshot the dashboard.

**If Smadar does NOT have a Snyk account at scan time:** mark "skipped — auth required, no time pre-launch". This does NOT block launch — `pip-audit` (MEH-330) and `npm-audit` (MEH-336 gate, `continue-on-error: false`) already cover the dependency CVE class on every PR. Snyk Code adds first-party static analysis on top, but the dependency layer is the larger attack surface and is already gated.

**Free-tier limits to be aware of:** Snyk free tier permits unlimited public-repo scans but rate-limits the API. The web UI is not rate-limited for one-off scans. Do not script Snyk in CI on free tier.

**Results template — fill inline pre-launch:**

| Severity | File:Line | Rule | Fix | Confidence |
|---|---|---|---|---|
| HIGH | | | | CONFIRMED / FLAGGED |
| MEDIUM | | | | |

---

## Triage protocol

Run for every finding in any of the three scans.

**HIGH or CRITICAL → block launch.** Open Linear ticket immediately. Do NOT launch until that ticket has a PR open against staging.

- Title format: `[SEV-1] <scan>: <one-line summary>` (e.g. `[SEV-1] ZAP: Missing HSTS on production`).
- Body skeleton:
  ```
  Source: <ZAP / SecurityHeaders / Snyk>, run on YYYY-MM-DD.
  Finding: <verbatim from scan output>
  Reproduce: curl -sI https://mehamakor.online | grep -i <header> → returns <X>
  Fix proposal: <one sentence>
  Block-launch: yes — public hostname affected
  ```

**MEDIUM → open Linear ticket, do not block launch.** Same template, mark `Block-launch: no`. Triage in the first post-launch retro.

**LOW / INFO → file as Backlog entries in `docs/ROADMAP.md` or a single umbrella ticket "Post-launch security polish".** Do not open one ticket per finding.

**FLAGGED (unable to reproduce) → ignore unless trivial to verify.** Note in the results table for traceability, no ticket needed.

---

## Confidence calibration

- **ZAP baseline catches header + cookie + info-disclosure findings reliably** — HIGH confidence. ZAP baseline is the industry-standard pre-launch passive scan; the false-positive set above is well-documented.
- **ZAP baseline does NOT catch business-logic flaws** (IDOR, broken auth, race conditions) — HIGH confidence on this gap. These are what the existing pytest auth suite + adversarial-review variants (MEH-428) are for. ZAP is a complement, not a replacement.
- **SecurityHeaders.com grade is reproducible and stable** — HIGH confidence. Same input → same grade unless the upstream rubric changes (rare; last major rubric change was 2023 adding `Permissions-Policy`).
- **Snyk Code free tier coverage is broad but noisy** — MEDIUM confidence. Free-tier rule pack is smaller than enterprise; HIGH findings tend to be real but MEDIUM/LOW have a ~30% false-positive rate from third-party reports. Triage manually.
- **30-min budget is realistic** — MEDIUM confidence. Assumes Docker is already installed and ZAP image is cached. First-time `docker pull ghcr.io/zaproxy/zaproxy:stable` adds ~2 min over slow connections; pre-pull the image the day before launch to keep the budget.

---

## Out of scope

This runbook does NOT cover:

- **Active fuzzing** — `zap-full-scan.py`, ffuf, Burp active scan. POSTs against production DB are destructive; defer to a dedicated staging fuzz run after launch.
- **Authenticated scans** — ZAP authenticated mode (logged-in session) catches more findings but requires scripting the login flow. Out of scope for the 30-min window.
- **OAuth `state` param verification** — separate concern; covered by the Google OAuth tests in `tests/test_oauth.py` plus manual review.
- **Mobile binary scanning (MobSF)** — no mobile binary; web-only product.
- **Penetration testing** — vendor engagement, separate budget, post-launch.
- **Container / image scanning (Trivy, Grype)** — Railway builds the image; we don't ship our own base. Defer until we self-host Docker.
- **Secrets in repo (gitleaks, trufflehog)** — covered by GitHub secret scanning + the Layer 1 `.env` deny in `.claude/rules/skills.md`.

When the scope here grows, add a section here first — don't expand inline mid-scan.

---

## Sources

- [OWASP ZAP Docker baseline scan](https://www.zaproxy.org/docs/docker/baseline-scan/) — official zaproxy.org docs (canonical; verify URL returns 200 before merging).
- [securityheaders.com](https://securityheaders.com) — Scott Helme's header grader (canonical).
- [Mozilla Observatory](https://observatory.mozilla.org/) — alternative header + TLS analyzer (canonical).
- [Snyk Code free tier](https://snyk.io/product/snyk-code/) — official product page; free tier terms on the pricing page.
- MEH-330 — pip-audit baseline (8 backend CVEs at ship; baseline cleared 2026-05-01).
- MEH-336 — `npm-audit` + `pip-audit` CI gate flipped to `continue-on-error: false`; new high/critical CVEs now block PRs.
- `docs/SECURITY.md` §CSP, §headers — authoritative source for the production header set this runbook scans.
- `docs/SECURITY-CHECKLIST.md` TRAPs 1–8 — the eight repeating patterns the existing test stack already gates.
