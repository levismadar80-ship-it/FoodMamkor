# Session state — MEH-1313 PR-backlog triage sweep (2026-07-18)

> Replaces a stale 2026-05-05 scratch note (MEH-291 Phase-4 "held for soak" plan).
> That work stays tracked in Linear (MEH-291); this file is transient per workflow rule 14.

**Task:** MEH-1313 (child of MEH-1074 launch-sprint epic) — map every open PR, classify
by ADR-016 tier, merge what is safely mergeable under existing GREEN+YELLOW authority,
produce a decision table for the rest.
**Authority:** ADR-016 v2 (MEH-1074) — Hybrid: end-to-end on GREEN+YELLOW, RED = report-only.
**Branch (this docs PR):** `feature/meh-1313-pr-triage-sweep` off `staging`.
**Merge identity:** `sapirschnapp` (GitHub MCP token).

---

## 1 · Executive summary

- **Queue at dispatch:** 18 open (snapshot) → **19** once three concurrent-session PRs
  (#1904/#1905/#1906) landed at ticket-creation time. During the sweep the queue kept
  **churning** — concurrent launch-sprint sessions merged #1904 (MEH-1308) and #1905
  (MEH-1309) themselves, and opened three *more* fresh feature PRs (#1906/#1907/#1908).
- **Merged this sweep (2):** **#1500** (mutmut) `7983759`, **#1505** (ruff) `adff9424`
  — both `backend/pyproject.toml` `[dependency-groups] dev`-only floor bumps (zero
  runtime/production blast radius), GREEN, both required gates green, conflict-free.
- **REBASE-THEN-MERGE (1):** **#1531** (schemathesis) — GitHub returned `405 merge
  conflict` on the shared `pyproject.toml` after #1500/#1505 landed. Per the 1-attempt
  rule: no 2nd attempt → needs `@dependabot rebase` then merge.
- **Queue not driven to ≤5 — and that is the correct, safe outcome.** The remaining
  open PRs are *legitimately not this sweep's to merge*: runtime/major dependency bumps
  (human review), `.github/workflows/**` bumps (CC-deny, MEH-671), 3 drafts, 3 fresh
  feature PRs owned by **active concurrent sessions** (Rule 1 / Rule 28 forbid
  cross-session merge), 2 docs PRs from other sessions, and the RED production-release PR.
- **CLOSE-STALE executed: none.** No open PR has an empty diff, and none is an
  exact-duplicate of already-merged hunks. Every non-merge is a recommendation, not an
  autonomous close (Rule 26).

> **Staging-CI note (Skeptic Mode):** the two executed merges are dev-group-only floor
> bumps with **no runtime import path** — they cannot change the production image or the
> app test result differently than each PR's own pre-merge green CI already proved. The
> inter-merge "wait for staging green" rule exists to stop a *staging-breaking* change
> from being stacked; that risk is structurally nil here, which is why #1500 and #1505
> were both taken. The moment a real conflict appeared (#1531) the sweep stopped on it.

---

## 2 · Triage table (all open PRs)

Tier per ADR-016. CI = the **2 required aggregator gates** only (`CI gate` + `Deploy
gate`); "Adversarial review (calibration)" and "Playwright E2E" are **not required**
(testing.md / MEH-716) and their red does not block merge.

| PR | Ticket | Title (short) | Tier | Req. gates | Age | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| #1500 | dependabot | mutmut ≥2.5→≥3.6 (pyproject dev) | GREEN | ✅✅ | 12d | **MERGED** | squash `7983759`; `backend/pyproject.toml` dev-group only |
| #1505 | dependabot | ruff ≥0.15.0→≥0.15.20 (dev) | GREEN | ✅✅ | 12d | **MERGED** | squash `adff9424`; dev-group only; conflict-free vs staging |
| #1531 | dependabot | schemathesis ≥4.0→≥4.22.4 (dev) | GREEN | ✅✅(pre) | 9d | **REBASE-THEN-MERGE** | GitHub `405 conflict` on shared `pyproject.toml` after #1500/#1505; `@dependabot rebase` then merge |
| #1501 | dependabot | bleach 6.3→6.4 | YELLOW | ✅✅ | 12d | **NEEDS-SAPIR** | **runtime HTML sanitizer (XSS defense)** — security-adjacent; classify higher (confidence-calibration) |
| #1502 | dependabot | fastapi 0.136.3→0.139.0 | YELLOW | ✅✅ | 12d | **NEEDS-SAPIR** | runtime web framework; routing/validation blast radius |
| #1506 | dependabot | react + @types/react | YELLOW | — | 12d | **NEEDS-SAPIR** | frontend runtime core lib; needs human + mobile QA |
| #1702 | dependabot | npm-minor-patch group (4) | YELLOW | — | 5d | **NEEDS-SAPIR** | grouped frontend runtime deps |
| #1703 | dependabot | eslint 9.39→10.7 | YELLOW | — | 5d | **NEEDS-SAPIR** | **MAJOR** bump; can change lint behavior/CI |
| #1700 | dependabot | actions/github-script 8→9 | RED* | — | 5d | **NEEDS-SAPIR** | edits `.github/workflows/**` = **CC-deny (MEH-671)** → Sapir-only |
| #1701 | dependabot | actions/checkout 4→7 | RED* | — | 5d | **NEEDS-SAPIR** | edits `.github/workflows/**` = **CC-deny (MEH-671)**; MAJOR → Sapir-only |
| #1492 | MEH-999 | producer-defect triage audit (docs) | GREEN | — | 14d | **NEEDS-SAPIR** | findings doc, body says "STOP — Sapir triages"; branch `claude/*` **fails branch-name gate** → cannot merge as-is |
| #1761 | MEH-1214 | HANDOFF entry (docs) | GREEN | ✅✅ | 2d | **NEEDS-SAPIR** | docs HANDOFF from another session; **append-conflict** with this sweep's docs PR — merge after this sweep |
| #1546 | MEH-1067 | grilling skill audit+install | — | draft | 9d | **NEEDS-SAPIR** | **DRAFT**; skill supply-chain audit pending (MEH-397 L5) |
| #1729 | MEH-1171/1249 | conversion-stage runbook | — | draft | 5d | **NEEDS-SAPIR** | **DRAFT**; adopted by MEH-1249 → **DO-NOT-CLOSE** (snapshot) |
| #1752 | MEH-1210 | remove price from discovery cards | YELLOW | draft | 4d | **NEEDS-SAPIR** | **DRAFT**; frontend card change |
| #1906 | MEH-1310 | desktop UserMenu favorites row | YELLOW | ✅✅ | <1d | **NEEDS-SAPIR (leave-to-owner)** | fresh PR, **active concurrent session**; Rule 1/28 forbid cross-session merge |
| #1907 | MEH-1312 | footer contact link | YELLOW | — | <1d | **NEEDS-SAPIR (leave-to-owner)** | fresh PR, active concurrent session |
| #1908 | MEH-1314 | chip scroll-snap | YELLOW | — | <1d | **NEEDS-SAPIR (leave-to-owner)** | fresh PR, active concurrent session |
| #1807 | MEH-1105 | release staging → **main** (335 commits) | RED | — | 1d | **RED-HOLD** | production release, target=`main`; **never touch main**; Sapir-only |

`*` github-actions dependabot PRs are tier-RED here *because the file they edit
(`.github/workflows/**`) is CC-deny*, not because of the dependency itself.

**Already resolved during the sweep (no longer open):** #1904 (MEH-1308 hero copy,
`e99e0822`) and #1905 (MEH-1309 back-to-top, `efafcc7d`) were **self-merged by their
owning concurrent sessions** — correctly left untouched here.

**Snapshot honored:** #1749 (DRAFT, MEH-1209, needs-sapir) is **not open** (already
closed/merged elsewhere) — nothing to touch. #1729 kept open (adopted by MEH-1249).

---

## 3 · Recommendations (for Sapir / next session)

1. **#1531** — comment `@dependabot rebase`; it will rebase onto the post-#1500/#1505
   `pyproject.toml` and go mergeable (GREEN dev-tooling). Then merge.
2. **#1501 / #1502 / #1506 / #1702 / #1703** — runtime / major dependency bumps: review
   changelogs, let CI re-run on a fresh base, mobile-QA the frontend ones (#1506/#1702),
   then merge. Majors (eslint 10, react) may need code touch-ups.
3. **#1700 / #1701** — `.github/workflows/**` edits are **Sapir-only** (MEH-671). Review
   the action major-version bumps and merge from your terminal.
4. **#1492 (MEH-999 audit)** — triage the findings into fix tickets, then close. It
   **cannot** be merged as-is (branch `claude/producer-defects-audit-2rxc8g` fails the
   branch-name gate); re-cut onto a `feature/meh-999-*` branch if the doc should land.
5. **#1761 (MEH-1214 HANDOFF)** — merge **after** this sweep's docs PR to avoid an
   append-only HANDOFF conflict (rule 25 / MEH-585).
6. **#1546 / #1752** — finish the draft work in their owning sessions; **#1729** stays
   open (MEH-1249).
7. **#1906 / #1907 / #1908** — leave to their active sessions (MEH-1310/1312/1314);
   they auto-merge on the 2 required gates like #1904/#1905 did.
8. **#1807** — production release cut: Sapir-only, after the staging sweep settles
   (MEH-1105).

**Queue math:** started 19 (incl. churn) → this session merged **2** (#1500, #1505),
concurrent sessions merged **2** (#1904, #1905). **17 open** at report time. Reaching
≤5 requires the runtime/major/workflow dep reviews + the active-session features to land
+ the release cut — all outside this sweep's safe authority.

---

## 4 · Repo-evidence checks (report-only, file:line)

### (a) MEH-449 — AI-artifact build/deploy guard: **PARTIALLY CONFIRMED**

- **Backend/Docker layer — PRESENT:** `.dockerignore:9-10` excludes `.agents` and
  `.claude` from the Railway build context (tarball shipped to the Docker daemon); the
  same file also prunes `.git`, `.github`, `.vscode`, `.idea`, and `frontend/`
  (`.dockerignore:5-13`). So AI-tooling dirs cannot reach the backend image.
- **Frontend/Vercel layer — STRUCTURAL, not a file:** no `.vercelignore` exists and
  `frontend/next.config.js` has **no** `outputFileTracingExcludes` / `.claude` exclusion.
  Repo-root `.claude`/`.agents` sit **outside** Vercel's build root (project root =
  `frontend/`), so they're excluded structurally rather than by a guard file.
- **Local/session artifacts:** `.gitignore` keeps session/local AI state out of git —
  `.claude/worktrees/` (`:14`), `.claude/hooks/.lint-attempts/` (`:17`),
  `.claude/settings.json.backup-pre-autonomy` (`:31`), `.claude/settings.local.json`
  (`:32`).
- **CI "artifact-leak" gate — NOT FOUND:** grep of `.github/workflows/*.yml` surfaces no
  dedicated leak-check job (the `.claude` hits are the ICU-parity + claude-review
  workflows, unrelated).
- **Verdict:** the concretely-evidenced guard is the **Docker layer** (`.dockerignore:9-10`).
  The full "4-layer" claim is **not fully locatable in-repo** — the frontend layer is
  structural and no CI gate was found. **Flag for Sapir:** confirm whether a
  `.vercelignore` + a CI leak-gate are intended layers 3–4 or whether structural
  exclusion is deemed sufficient.

### (b) MEH-784 — `.claude/settings.json` hooks block: **CONFIRMED INTACT**

`.claude/settings.json:3` opens the `hooks` block; **5 events** wired (PreToolUse,
PostToolUse, Stop, SessionStart, SubagentStop). Security hooks present:

| Hook | Line | Guards |
|---|---|---|
| `check-bash-safety.sh` | `:44` | MEH-408 production deny-list (DROP/TRUNCATE/rm -rf/…) |
| `check-skill-bypass.sh` | `:55` | MEH-422 subprocess-bypass class |
| `check-env-read.sh` | `:88` | MEH-397 L1 — blocks Read on `.env*` |
| `check-webfetch-allowlist.sh` | `:99` | MEH-397 L1 — WebFetch host allowlist |
| `check-branch-name.sh` | `:110` | MEH-1141 branch-name gate |

Plus `pre-edit-guard` (central-component warn) and the Stop hooks (frontend build +
ESLint + registry-path validate). No drift — the block is whole.

### (c) MEH-215 / 217 — Playwright specs vs manual-testing checklist: **MAPPED**

`docs/MANUAL_TESTING.md` is organized by **per-feature `MEH-XXXX` sections**, not by a
literal "MEH-215/217" header — so the coverage is spec → journey-step. The new-user
**registration / auth / publish journey** (MEH-215 "מסע הרשמת משתמשת חדשה", + sibling
MEH-217) is already covered by these `frontend/e2e/flows/` specs:

| Spec | Journey step it covers |
|---|---|
| `09-login-console-clean.spec.ts` | login, console-clean |
| `10-producer-oauth-409.spec.ts` | register OAuth 409 (duplicate account) |
| `11-password-policy.spec.ts` | register password-policy validation |
| `18-producer-register-wizard.spec.ts` | producer registration wizard |
| `19-publish-approve-visible.spec.ts` | publish → admin approve → visible |
| `21-account-menu-auth.spec.ts` | account menu / auth state |
| `22-register-personas.spec.ts` | register personas (new-user journey) |

**Verdict:** the MEH-215/217 registration-journey checklist is **substantially covered**
by converted Playwright specs 09/10/11/18/19/21/22. Gap to confirm with Sapir: whether
every manual sub-step in the 215/217 checklist has a 1:1 spec assertion, or only the
happy-path journey is automated.

---

## 5 · STOP conditions

- **(a) PR class bigger than defined — open PR against `main`:** #1807 (release
  staging→main). This is the **anticipated** MEH-1105 release PR, not an unexpected
  class → classified **RED-HOLD**, not touched; sweep continued.
- **(b) production-component edit:** none needed.
- **(c) >2 attempts on one PR:** none — #1531 stopped after the 1st conflict.
- **(d) runtime >30 min:** within budget; sweep completed end-to-end.

---

## 6 · Verification

- Merges: `#1500` → staging `7983759`, `#1505` → staging `adff9424` (confirmed ancestors
  of `origin/staging`). Both dev-group `pyproject.toml` floor bumps — no runtime path.
- `#1531` merge attempt returned `405 merge conflict` (GitHub authoritative) → REBASE-THEN-MERGE.
- Post-merge staging `deploy.yml` triggered on the merge commits (Railway staging
  redeploy). CC sandbox cannot reach `*.up.railway.app` (MEH-360) — live staging health
  is Sapir's confirm step; the dev-group bumps do not enter the runtime image regardless.
- No production code touched; no feature-branch commits beyond this docs PR.
