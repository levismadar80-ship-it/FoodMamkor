# Testing rules

Rules 5, 5a, and 20 from the workflow list — grouped here because they
describe the same pre-merge pipeline.

---

## Rule 5 — Tests before implementation

Write the failing test first (pytest for backend, playwright/component
for frontend), then make it pass. See
[docs/TESTING.md](../../docs/TESTING.md).

### Frontend critical flows — Playwright test required before writing code

- login / register
- WhatsApp button click
- פרסום מוצר שכנה (home product form)
- טופס הרשמת עסק

### NOT required for

- Styling changes
- Color / spacing tweaks
- Minor UI adjustments

---

## Rule 5a — Adversarial review before every merge to staging

Run `/adversarial-review` on all changed files. Fix every REFEREE
verdict before opening the PR.

PRs touching `auth.py` / `upload.py` / permissions also get a web-search
CVE check (see [.claude/rules/security.md](./security.md)).

---

## Rule 20 — Review order: CI before adversarial (mandatory)

Every PR must follow this exact sequence:

```
npm run build  →  pytest tests/test_api.py  →  /adversarial-review  →  merge
```

Never run `/adversarial-review` before CI passes — adversarial review on
broken code wastes time.

### Exception — central components

Central components (`MapClient.jsx`, `ProducerDetail`, `main.py`) — run
adversarial even if build fails. Logic risk > syntax risk on these
files. Central component list: `.claude/central-components.json`.

---

## Definition of Done (every PR, no exceptions)

- [ ] `npm run build` passes
- [ ] `pytest tests/test_api.py` passes
- [ ] `/adversarial-review` עבר — all REFEREE verdicts fixed

---

## Required status checks + docs-only merge (MEH-716)

**Staging required checks = 2 aggregator gates:** `CI gate` (`pr-checks.yml`) +
`Deploy gate` (`deploy.yml`). These are the **only** contexts the `protect-staging`
ruleset (ID 15240090) requires — verified against the ruleset API 2026-07-04. The
individual named jobs (`Frontend build`, `Backend tests`, `Backend lint`,
`Env drift`, `Frontend lint (RTL + Next.js rules)`, `API contract audit`, …) are
**not** individually required: they're job-level paths-filter gated and **skip** on
a docs-only or config-only diff, which is expected — a skipped job still lets its
parent aggregate (`CI gate` / `Deploy gate`) report `success`, so both required
gates go green and the PR merges with **no admin override**. (Exactly how the
docs/config-only PRs #1012, #1026, #1485 merged: the named jobs showed `skipped`,
both aggregators showed `success`.) There are **no** "docs-only twin jobs" and none
are needed — an earlier version of this note claimed MEH-736 added them to satisfy
"6 required checks"; both the twins and the six-checks framing were wrong (the
ruleset only ever gated on the 2 aggregators). Full mechanism:
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) → "Required checks".

**`Playwright E2E (Vercel preview)` is NOT a required check.** It lives in
`e2e.yml`, triggered by `deployment_status` (after the Vercel preview deploys),
and job-skips on docs diffs (`e2e.yml:54-60`). **Docs-only PRs: don't poll E2E.**
Merge when the **2 required aggregator gates** are green.

**Transient "waiting for status / expected" right after push** = the required gates
are still registering (workflow startup), **not** a failure. Let them settle, then
retry the merge once. (Observed on PR #908 — first merge attempt blocked on a
not-yet-reported gate, second succeeded with no override.)

---

## Guarded registries — path-drift validator (MEH-1030)

Some guard/config files list **repo file paths** their tooling depends on. When a
refactor moves or deletes a listed file, the registry silently stops matching and
its guard disables itself with no error — caught reactively twice (MEH-668
`rtl-allowlist.txt`, MEH-1026 `central-components.json`, both after the `[locale]`
migration). `scripts/validate-registry-paths.py` asserts every listed path still
resolves (exit non-zero + offender list on any miss), wired as a `repo: local`
pre-commit hook in `.pre-commit-config.yaml` that runs whenever a guarded registry
or the validator itself changes.

**Currently guarded (2):**

| Registry | Format the validator parses |
|---|---|
| `.claude/central-components.json` | JSON — every string in the `components[]` array |
| `.claude/hooks/rtl-allowlist.txt` | newline list — **only** the `PATH EXCEPTIONS` section (between the two `# ==== … ====` markers); the `CONTENT PATTERNS` markers (`rtl-ok`) are not paths and are skipped |

**Add a registry (two steps — both required):**
1. Append one entry to the `REGISTRIES` list in `scripts/validate-registry-paths.py`
   — `{"file": "<path>", "parser": <fn>}` — reusing `_parse_json_array` /
   `_parse_rtl_allowlist` or adding a small parser that returns
   `[(lineno, repo_relative_path), …]`.
2. Add the new registry's path to the `files:` trigger regex of the
   `validate-registry-paths` hook in `.pre-commit-config.yaml` — otherwise edits
   to the new registry won't re-fire the hook (it only auto-runs when a listed
   registry or the validator itself changes), a silent coverage gap of exactly
   the class this guard prevents.

Path-existence only — no schema/owner checks (over-engineering guard). The
validator emits a stderr `warning: parsed 0 paths …` if a registry's format drifts
so a parser silently returning nothing can't turn the guard into a no-op. Not a CI
gate: `.github/workflows/**` is CC-deny (MEH-671) and collides with MEH-787 on
`pr-checks.yml`; a required-gate form is a separate A2 follow-up.

---

## Driving Playwright against staging from the CC sandbox (TLS workaround)

When you launch Playwright/Chromium against the **live** staging URL
(`https://staging.mehamakor.online`) or a `*.vercel.app` preview **from
the CC sandbox**, force the max TLS version to 1.2:

```js
chromium.launch({ args: ["--ssl-version-max=tls1.2"] })
```

Without it the sandbox's Chromium offers a TLS-1.3 ClientHello that the
Vercel edge drops, surfacing as `ERR_CONNECTION_CLOSED` — which looks like
the site is down but is really the handshake failing. Capping at TLS 1.2
lets the handshake complete.

**Sandbox-only.** Real browsers and the GitHub-hosted CI runners don't
need it — the `e2e.yml` suite is unaffected. This is for one-off **live
verification from a CC session** (e.g. confirming a screenshot bug is
*stale* vs a real regression before filing/fixing — 2026-06-25 MEH-938 /
MEH-942), not for the automated E2E pipeline. Pairs with the
`*.up.railway.app` egress block in [CLAUDE.md](../../CLAUDE.md) "Known Bug
Patterns": backend/API smoke from the sandbox is blocked outright; this
covers the *frontend* live-check path that Chromium can reach but only
over TLS 1.2.

_Source: 2026-06-25 /map UX batch (handoff note) — surfaced while
verifying MEH-942's GPS-button screenshot against live staging._
