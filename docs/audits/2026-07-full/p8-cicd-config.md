# P8/8 — CI/CD + config hygiene: gates · drift · env · branch protection

> Pass 8 of the **MEH-1721** audit epic. **Read-only** — `.github/` is Sapir's
> territory (MEH-671). This report maps pipeline reliability; it changes no
> workflow, and every fix derived from it is **RED**.
>
> **No secret values appear in this report** — variable names and
> present/missing only.

---

## 1 · Snapshot

| | |
|---|---|
| **Audited tree** | `origin/staging` @ `363803d6` (P7 merge) |
| Workflows | **12** files, 2,337 LOC |
| Required aggregator gates | `CI gate` · `Deploy gate` · `E2E gate` |
| Jobs feeding `CI gate` | 13 |
| Committed secret-shaped values found | **0** |
| Secret-scanning workflows | **0** |

**Not started from `#2392`.** PR #2392 is branch-linked to this card but is a
**parked** docs PR on test-signal semantics (`⛔ PARKED, do not merge`), authored
by another session. It was left untouched; this pass ran on its own branch.

---

## 2 · Findings summary

| ID | Sev | Finding | Fix | Tier |
|---|---|---|---|---|
| F-1 | 🟠 High | **All three** required gates count a `skipped` job as passed | M | 🔴 RED |
| F-2 | 🟠 High | `dependency-audit` is blocking *internally* but is **not a required check** | S | 🔴 RED |
| F-3 | 🟡 Med | `scripts/**` is in **no** paths filter — the API-contract validator can change untested | S | 🔴 RED |
| F-4 | 🟡 Low | No secret scanning (gitleaks/trufflehog) in any workflow | M | 🔴 RED |
| F-5 | ⚪ Info | Branch protection unverifiable from the repo; the documented as-of is 24 days stale | — | — |

All fixes are RED: every one lands in `.github/workflows/**` or in GitHub
settings, both Sapir-only.

---

## 3 · F-1 🟠 High — a skipped job counts as a pass, in every required gate

The aggregator's verdict function, **identical in all three**:

```bash
.github/workflows/pr-checks.yml:697-702   ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
.github/workflows/deploy.yml:394          ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
.github/workflows/e2e.yml:381             ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
```

`skipped` is mapped to **OK**. Since the three aggregators are the *only*
required checks on the repo, this is the single rule that decides whether a PR
can merge — and it cannot distinguish **"this check passed"** from **"this check
never ran."**

**This is deliberate and it is load-bearing.** It is what lets a docs-only PR
merge without an admin override: the individual jobs are paths-filtered, they
skip, and the aggregate still reports success. Removing the `skipped` branch
would block every docs-only PR. **The finding is not that the rule is wrong —
it is that one rule serves two situations that need opposite answers**, and
nothing distinguishes them:

| Situation | Should be | Is |
|---|---|---|
| docs-only PR, backend job skipped because backend untouched | ✅ pass | ✅ pass |
| **draft PR touching backend, pytest skipped because it is a draft** | ⚠️ "nothing ran" | ✅ **pass** |

Six jobs carry `&& github.event.pull_request.draft == false`
(`pr-checks.yml:166, 217, 284, 436, 482, 608`). On a draft PR that touches
`backend/**`, `changes.outputs.backend` is `true`, so `ci-gate` **does** evaluate
`check "Backend tests (pytest)" "$R_PYTEST"` — and `$R_PYTEST` is `skipped`, so
it prints `OK`. **`CI gate (required)` reports success on a PR where pytest never
executed.**

The workflow header (`pr-checks.yml:11-18`) argues this is safe because "a draft
PR isn't mergeable anyway." That is true of *merging* and false of *signalling*:
a human reading a green `CI gate` on a draft concludes the tests passed. This
repo's own rule file already records the consequence — `.claude/rules/workflow.md`
rule 21: *"That green means 'nothing ran,' not 'tests passed.'"*

**Cross-ref MEH-1582** (skip-green bypass, High, In Progress). This pass adds
two things to that ticket: the mechanic is **not confined to `pr-checks.yml`** —
it is byte-identical in `deploy.yml` and `e2e.yml`, so all three required gates
share it; and the `ready_for_review` half of MEH-1582's premise **is already
handled** (`pr-checks.yml:27` includes it, and `:40` gives it a separate
concurrency group per MEH-1653 so it cannot cancel an in-flight `synchronize`).

**Fix M**, and it is a design decision rather than a patch: the aggregator needs
to distinguish *skipped-because-not-applicable* from *skipped-because-not-run*,
e.g. by treating `skipped` as OK **only** when the corresponding stack flag is
false, and as FAIL when the stack is touched. 🔴 RED.

---

## 4 · F-2 🟠 High — the dependency scanner reds without blocking

`dependency-audit.yml` runs `pip-audit` and `npm audit`, and its own header
(line 7) states: *"Both jobs are now blocking (`continue-on-error: false`)."*
Confirmed at `:65` and `:110`.

**But "blocking" there means the job fails — not that the merge is blocked.**
The workflow is **not referenced by any aggregator**:

```
grep -n "dependency-audit|pip-audit|npm audit" pr-checks.yml deploy.yml  →  (no matches)
ci-gate needs:  changes · do-not-merge-gate · qa-artifacts-size · repo-guards · build ·
                ai-artifact-scan · pytest · lint-backend · env-drift · backend-mypy ·
                frontend-knip · frontend-tsc-strict · frontend-vitest
```

Since only `CI gate` / `Deploy gate` / `E2E gate` are required, a red
`Dependency Audit` sits on the PR as a failed check that **gates nothing**.

**This is the exact mechanic behind MEH-1585** (*"pip-audit gate detects 31
vulns in 9 packages on staging but cannot block"* — Urgent). The ticket names
the symptom; the cause is one missing entry in `ci-gate.needs` plus a `check`
line.

**A second, compounding limit:** the workflow is `paths:`-gated on
`backend/pyproject.toml`, `backend/uv.lock`, `frontend/package.json`,
`frontend/package-lock.json`. So it only runs when a lockfile changes.
Vulnerabilities already sitting in an unchanged lockfile — which is precisely
MEH-1585's 31, and P2's 9 `next` advisories — are never re-surfaced by a PR that
doesn't touch dependencies. A `schedule:` trigger exists (`:24`), which is the
mitigation, but a scheduled red run blocks nothing either.

**Fix S** (add to the aggregator's `needs` + one `check` line). 🔴 RED —
and note it should land *after* the backlog is cleared, or every PR goes red on
day one.

---

## 5 · F-3 🟡 Med — `scripts/**` is in no paths filter

Both `pr-checks.yml:149-158` and `deploy.yml:100-109` declare identical filters:

```yaml
frontend:  frontend/** · package.json · package-lock.json
backend:   backend/** · tests/**
workflows: .github/workflows/**
```

`scripts/**` appears in **none** of them, and a repo-wide grep finds no
workflow filtering on it at all.

Consequence for a PR touching only `scripts/`: `changes` emits
`frontend=false backend=false workflows=false`, so `api-contract-static`
(`deploy.yml:157`, conditioned on exactly those three flags) is **skipped** —
and by F-1 that counts as OK.

**`scripts/check_api_contract.py` is the file that job executes.** So the
API-contract validator can be edited, weakened, or broken in a PR where the only
job that runs it does not run, and `Deploy gate` still reports success. It would
next be exercised only on some later PR that happens to touch a stack.

This is the same class as **MEH-1030** (guarded registries silently
self-disabling when a listed path moves) — a checker whose own changes aren't
checked.

**Partial mitigation, worth stating:** four jobs run **stack-independently** —
`do-not-merge-gate`, `qa-artifacts-size`, `repo-guards`, `env-drift`. Because
`repo-guards` executes `scripts/checks/run-all.sh` on every PR, the guard scripts
under `scripts/checks/` *are* exercised. The exposure is the scripts invoked by
**stack-conditional** jobs: `check_api_contract.py` and `check_env_drift.sh`
(the latter is covered, since `env-drift` is always-on).

**Fix S** — add `scripts/**` to both filters, or to the always-on set.
🔴 RED.

---

## 6 · F-4 🟡 Low — no secret scanning

No workflow references `gitleaks`, `trufflehog`, or any secret-scanning action.
GitHub's native secret scanning may be enabled at the org/repo level, which is
**not visible from the repository** (see F-5).

An independent scan for committed secret-shaped values —
`(SECRET|TOKEN|API_KEY|PASSWORD)\s*=\s*['"]<16+ chars>` across `backend/app`,
`frontend/lib`, `frontend/app` — returned **zero matches**, so there is no known
live exposure. The finding is the absence of a *recurring* control, not a
present leak.

Adjacent controls that do exist: `.claude/hooks/check-env-read.sh` blocks Read
on `.env*` inside a CC session, and `.gitignore` covers the env files. Both
guard the authoring path; neither scans history or a PR diff.

**Fix M.** 🔴 RED.

---

## 7 · Config hygiene — 12-Factor

### Env parity: clean

`scripts/check_env_drift.sh` runs as the **`Env drift (.env.example)`** job,
which is in the always-required set (`ci-gate` checks it stack-independently at
`pr-checks.yml:724`). So env drift is genuinely gated on every PR, docs-only
included.

An independent scan: **67** variables declared across `.env.example` files;
**37** read by code (`os.environ` / `getenv` / `process.env`). Three are read
but not declared — `NEXT_RUNTIME`, `RAILWAY_GIT_COMMIT_SHA`,
`SKIP_ENV_VALIDATION` — all **platform-injected** (Next.js internal, Railway
build metadata, a build flag), not application config. The required job passes,
so its own allowlist evidently accounts for them. **No finding.**

### Config-in-env: clean

`backend/app/config.py` centralises settings, and the security invariant already
enforces the important half — `JWT_SECRET_KEY`/`SECRET_KEY` **raises
`RuntimeError` at boot** in production rather than falling back
(`config.py:161-166`), and `cors_origins` fails **closed** if unset
(`config.py:41-43`). That is fail-closed config, which is the 12-Factor
behaviour that actually matters.

### Drift gates: still matching reality

`EXPECTED_TABLES=38` (`pr-checks.yml:354`) was verified against the models in
**P3** — 37 `__tablename__` + 1 association table = exactly 38. `alembic check`
(`:377-379`) additionally diffs `Base.metadata` against the migrated schema, so
the column-level direction a bare count would miss is covered. **No drift.**

---

## 8 · F-5 ⚪ Info — branch protection cannot be verified from here

Ruleset configuration lives in GitHub settings, not in the repository. Per the
ticket's calibration clause this is recorded as **requires a GitHub settings
check by Sapir**, not asserted.

What the repo *documents* — `.claude/rules/testing.md` — is that the
`protect-staging` ruleset (ID **15240090**) requires exactly the two aggregators
`CI gate` + `Deploy gate`, *"verified against the ruleset API 2026-07-04."*

**That as-of is 24 days old**, and this pass observed a third aggregator —
`E2E gate (required)` — reporting on live PRs (it appeared on #2393 and every
subsequent audit PR). Whether it has since been **added to the ruleset** or is
merely *reporting* without being required is exactly the distinction the repo
cannot answer about itself. The same rule file states the gate was deliberately
**not** added because the suite was red, and that adding it while red would block
every PR.

**This is not a contradiction to resolve from the repo — it is a question for
Sapir**, and it matters, because if `E2E gate` *is* required and the suite is
still red, merges depend on it aggregating skips to green (F-1 again).

The direct-push protection *is* independently evidenced: `.claude/rules/workflow.md`
regression rule 7 records a rejected push (`push declined due to repository rule
violations`) on a docs-only commit to `staging`, so the ruleset does block direct
pushes.

---

## 9 · Not measured

- **Branch protection / ruleset contents** — not visible from the repo (F-5).
  Required-review counts, force-push settings, and admin-bypass are all
  unverified.
- **Whether GitHub native secret scanning / Dependabot alerts are enabled** —
  org-level settings (F-4). Dependabot *PRs* exist on the repo, which implies
  version updates are on; that says nothing about security alerts.
- **Actual workflow run history.** Findings are read from YAML. No run logs were
  fetched to confirm, e.g., how often `dependency-audit` has actually gone red.
- **`e2e.yml` concurrency collapse (MEH-1601)** — documented in
  `.claude/rules/testing.md` as a live defect where a docs-only push cancels a
  code push's run and puts nothing in its place. Cross-referenced, **not
  re-derived**.
- **Secret rotation / age.** No check on whether any configured secret has ever
  been rotated.
- **`claude-review.yml` model pin vs the `Builder-Model:` trailer collision** —
  the guard exists (`scripts/checks/builder-model-guard.sh`) and passed on every
  PR this session; its warn-only→blocking transition on 2026-08-17 was not
  exercised.

---

## 10 · Appendix — configuration quotes

```
workflows: 12 files, 2,337 LOC

pr-checks.yml:19-28    on: workflow_dispatch · pull_request
                       types: [opened, synchronize, reopened, ready_for_review]
                       branches: [staging, main]
pr-checks.yml:40       concurrency group includes  == 'ready_for_review'   (MEH-1653)

pr-checks.yml:697-702  ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
deploy.yml:394         (identical)
e2e.yml:381            (identical)

pr-checks.yml:166,217,284,436,482,608   && github.event.pull_request.draft == false

ci-gate needs (13):    changes · do-not-merge-gate · qa-artifacts-size · repo-guards ·
                       build · ai-artifact-scan · pytest · lint-backend · env-drift ·
                       backend-mypy · frontend-knip · frontend-tsc-strict · frontend-vitest
deploy-gate needs (3): changes · lint · api-contract-static

always-enforced (stack-independent):
  DO-NOT-MERGE marker gate · qa-artifacts size cap · Repo guards · Env drift

paths filters (pr-checks.yml:149-158 == deploy.yml:100-109):
  frontend: frontend/** · package.json · package-lock.json
  backend:  backend/** · tests/**
  workflows: .github/workflows/**
  scripts/**: ABSENT from every filter in every workflow

dependency-audit.yml:7,65,110   "Both jobs are now blocking (continue-on-error: false)"
                                → not in any aggregator's needs → not a required check
dependency-audit.yml:24         schedule: (present)
                     paths:     backend/pyproject.toml · backend/uv.lock ·
                                frontend/package.json · frontend/package-lock.json

secret scanning:       no gitleaks / trufflehog / secret-scan reference in .github/workflows/
committed secrets:     0 matches for (SECRET|TOKEN|API_KEY|PASSWORD)=<16+ chars>

env:  67 declared in .env.example · 37 read in code
      read-not-declared: NEXT_RUNTIME · RAILWAY_GIT_COMMIT_SHA · SKIP_ENV_VALIDATION
      (all platform-injected; Env drift job is required and passes)

staging-smoke.yml:     workflow_dispatch only — intentional V1 scope (MEH-671)
```
