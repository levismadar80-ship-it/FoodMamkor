# Full workflow rules

The rules only. Every rule's sources, incidents, measurement tables and
corrections live **verbatim** in
[docs/rules-history/workflow.md](../../docs/rules-history/workflow.md)
(archived 2026-10-26, MEH-2338) — same headings, same rule numbers. Read the
matching section there before re-opening, weakening or re-deriving a rule.
`scripts/checks/rules-inventory-guard.sh` fails if a heading or numbered rule
from that archive disappears from this file.

---

## Working the queue

**Linear is the channel. Nothing arrives by chat.** At session start and after
each item, run **both** lanes. Lane A first, then Lane B, each Urgent → High →
Normal → Low. The card description is the full spec (§4 = the XML prompt);
authority is ADR-032: **§3.5** RED items stop before merge until the
adversarial reviewer runs; **§3.6** exploit-proving tests assert **behaviour**,
never that the prescribed change was applied.

### Lane A — `In Progress`: opt-in only

`state = In Progress · team = Mehamakor · labeled cc-queue`. In Progress means
started-and-unfinished, not assigned-to-CC. **An unlabeled card is not yours.**

### Lane B — `Todo` / `Backlog`: opt-out, then content-gated

`state = Todo OR Backlog · team = Mehamakor`, minus B1–B4. Labels exclude,
never admit.

- **B1 label:** `not-cc` · `post-launch` · `blocked-needs-sapir` · `needs-sapir`
- **B2 title substring:** `decision-first` · `HIGH-RISK` · `RED` · `SIGNAL-GATED` · `[מגירה]` · `ספיר מריצה` · `[ספיר` · `ידני`
- **B3 read the FULL description; skip silently (do not park) if:** an open
  question to Sapir · the fix needs a denied action (alembic
  `upgrade`/`downgrade`/`stamp`, prod mutation, force-push, editing
  `.claude/settings.json`) · it needs a brand/copy/design ruling not locked in
  BRAND.md or an ADR · you cannot state a pass/fail check you run yourself.
- **B4:** no open PR on the same files, no `feature/meh-<N>-*` branch on `origin`.

### On taking any card

Label it **`cc-queue` before the first edit**, either lane. Never on a card you
opened yourself. Empty Lane A is normal; empty Lane B = sweep done — say so, stop.

### Finishing, blocking, handing off

| Situation | Action |
|---|---|
| Finished | Card **Done** + batch summary as a card comment |
| Blocked | Back to **Backlog**, one-paragraph why, take the next item |
| Needs Sapir's hands (secrets, `.github/`, Railway, GitHub settings, VRT baselines) | Label **`not-cc`**, comment exactly what she must do, move on |

**Never idle, never wait for a message.**

---

## Branch-base verification (CRITICAL)

Before any read/write on a new ticket and before any `git commit`:

```bash
git branch --show-current                   # MUST NOT be staging or main
git rev-list --count HEAD ^origin/staging   # MUST be < 5
```

On `staging`/`main` → `git checkout -b feature/meh-XXX-<slug> origin/staging`
immediately. Divergence > 50 = harness branched off `main` (CC bug #24516):
abort → `git stash` → `git fetch origin staging` (never `checkout staging &&
pull`) → `git checkout -B <branch> origin/staging` → `git stash pop` →
re-check count. Never continue on a main-based branch.

---

## Provenance verification — shallow clones fabricate file history (MEH-1519)

Before any "file X last changed in commit Y" claim:
`git rev-parse --is-shallow-repository` MUST print `false`
(else `git fetch --unshallow origin`). A shallow clone silently reports the
graft commit as every file's origin. When provenance is load-bearing, compare
**blobs** (`git rev-parse <commit>:<path>`), not commits.

---

## An unresolvable `MEH-XXXX` is archived-because-Done at least as often as missing — check the repo before treating it as open (MEH-1519 · MEH-1146)

`get_issue` returns the same "not found" for never-existed and archived-Done.
Before treating it as open, missing, or a Sapir action, run all three:

```bash
grep -n "MEH-<N>" HANDOFF.md docs/CHANGELOG.md
git log --oneline --all --grep="MEH-<N>"
git merge-base --is-ancestor <sha> origin/staging   # settles it
```

The tie is broken in the repo, never in Linear. The answer goes into the card
DESCRIPTION and any registry that carried the stale gate (rule 34).

### The two cases, because one of them is a near-miss and the other is not

MEH-1519 (read as open, resolved six weeks earlier) and MEH-1146 (wrong Sapir
action in four artifacts). Naming the ambiguity is not resolving it — only the
three commands do. Both directions of the null are live (`MEH-360` never
existed; `MEH-1948` was archived).

---

## ✅ RESOLVED 2026-08-13 (MEH-1844) — CI reviewer confirmed working; temporary section removed

The CI reviewer works. `continue-on-error: true` stays and the job stays out of
`ci-gate`. Check the PR in front of you for its comment — never write "the
reviewer is down / reviewed this" from this file. Promotion order lives on
MEH-569; the outage history is in
`docs/audits/2026-08-meh-1844-ci-reviewer-outage-history.md`.

---

## Workflow rules 1–20

1. **Session start protocol (MANDATORY — higher priority than any task).**
   Read this file + HANDOFF.md (first) + DESIGN.md (UI) / DATA.md (backend);
   `git fetch --prune origin` and list feature branches; list open PRs;
   `git log --oneline origin/staging..origin/main`; report and ask "continue an
   open PR, or start fresh?". **Single session:** evidence of a parallel
   session (`claude/*` branches, conflicting changes) → stop and report.
   Never skip the audit, even if the user jumps straight to a task.
   Parallel PRs → worktrees (rule 16). PR referenced by number → check out its
   head branch and confirm before editing.
2. **Branch from `staging`** — never from `main`. See
   [deployment.md](./deployment.md).
3. **Name branches `feature/*`** — no `claude/*` or other prefixes. Pattern
   `^(feature|levismadar80)/meh-[0-9]+(-[a-z0-9]+)*$|^dependabot/.*`, enforced
   by `check-branch-name.sh` + `Branch name gate`. A harness-assigned `claude/*`
   branch is not an exception: re-cut `git checkout -B feature/meh-XXXX-<slug>
   origin/staging` per ticket before the first commit — the repo wins.
4. **Plan before coding + interview mode.** Propose in plain text, wait for
   `go`. Ambiguous spec → 2–5 targeted questions first. Before a plan that
   references a Linear issue, fetch the live description and name every
   spec-vs-plan gap ("Spec says X, plan proposes Y"); never drop a requirement
   silently.
5a. **Adversarial review before every merge to staging.** See
   [testing.md](./testing.md). Check the PR for a `claude[bot]` comment; never
   infer reviewer status from this file.
5. **Tests before implementation.** See [testing.md](./testing.md).
6. **Commit per task with a clear message.** One logical change = one commit;
   the message states *why*.
7. **`/compact` discipline — proactive, not reactive.** `/compact` at ~40%
   context; dump plan + todos first. Once `session-state.md` exists prefer
   `/clear` + `/session-resume`.
8. **Use "ultrathink" for complex problems** — schema, security, multi-file
   refactors, anything costing >10 min to undo.
9. **After every PR — send the Vercel preview URL when one exists.** Format
   `"בדיקי על: https://food-mamkor-[hash].vercel.app"`. Feature branches
   produce **no** Vercel deployment (MEH-2062, `git.deploymentEnabled`); a
   preview exists only via Sapir's `vercel deploy`. Otherwise the UI evidence
   is the 375/1440 bundle (rule 23) + staging after merge — say which; never
   report an absent preview as rendered. Wait for approval before merging to
   staging (UI QA itself is CC's — rule 23 amendment).
10. **After every PR — update docs/MANUAL_TESTING.md** with new features:
    `[ ] Test — איך לבדוק — תוצאה מצופה`.
11. **After every PR — auto-update every doc your code touched**, same PR:
    DATA.md (schema/endpoints) · ADMIN.md · DESIGN.md · FEATURES.md (✅) ·
    MANUAL_TESTING.md · SECURITY.md (auth/permissions) · DEPLOYMENT.md (env,
    infra) · CHANGELOG.md (docs-only PR, rule 31) · `.ai/diagrams/`. Stop hooks
    run `npm run build` + `pytest tests/test_api.py`; fix before done.
12. **After every PR that touches `backend/app/routers/**`,
    `backend/app/models/**` or `backend/app/auth.py` — update `.ai/diagrams/`.**
13. **End of session protocol (MANDATORY — same priority as Rule 1).** Update
    HANDOFF.md (last PR, branch state, next task + first step, decisions,
    unfiled issues), then run `/retro` (proposes; Smadar approves `go <N>`; an
    empty retro is valid).
14. **Context reset protocol.** ≥60% context or a natural boundary →
    `/session-save`, `/clear`, `/session-resume`. <40% keep working; 40–60%
    `/compact`.
15. **Prompt compression (Caveman style).** See [prompting.md](./prompting.md).
16. **Git worktrees for parallel features.** 2+ unrelated simultaneous features
    → `claude --worktree <name>` (`.claude/worktrees/`, gitignored); copy
    `.env.local` + `npm install`; remove worktree + branch after merge. Skip for
    same-file or single small fixes.
17. **New Claude Code features in workflow.** Post-merge: `Monitor` Vercel logs
    3 min (error → open a bug) and `/loop` staging health until first
    success/error. Multi-phase (3+) → Ultraplan, execute only after `go`.
    `/goal` only for LOW-RISK, mechanically verifiable end states — **never** on
    auth, schema, central components, security or prod deploy; STOP conditions
    (scope grows, >2 failed attempts, >30 min) stay in force. If the evaluator
    says done but the PR isn't green → back to the manual flow.
18. **One branch per feature (frontend + backend together).** Check open PRs
    first; a fix found during feature work goes on that branch as `fix: …`.
    Separate branch only for unrelated work or a prod hotfix.
19. **Zod validation before consuming an API response.** See
    [frontend.md](./frontend.md).
20. **Review order — CI before adversarial (mandatory).** See
    [testing.md](./testing.md).
21. **Never merge without a verified green CI signal.** All jobs failing in <2 s
    with no logs = budget exhaustion, neither pass nor fail — check billing,
    wait. Never merge on a green you cannot explain or a red you cannot read.
    - **Triggers:** the push credential decides (CCR relay and MCP PRs trigger).
      A push whose tip SHA already exists on `origin` fires nothing — you need a
      NEW SHA (real commit or `git merge origin/staging`, never empty). Last
      resort: Sapir closes/reopens.
    - **Cancelled ≠ failed:** list runs for the head SHA. A newer run in
      progress → the old gate is stale, wait. A job hung in its own setup
      (`The operation was canceled`, no newer run) → `rerun_failed_jobs`; a
      re-run is not a rule-30 violation — confirm real output in the log.
    - **Draft PRs skip-green:** draft aggregators are green because nothing ran.
      Mark ready before treating CI as a signal.
    - **`enable_auto_merge` on an armed PR is a silent no-op** and keeps the
      existing method. To change method: disable, then enable, and re-read the
      method from the response.
    - **`merge_pull_request` with squash can land a merge commit** — read the
      landed commit message (`<title> (#N)` vs `Merge pull request #N`).
    - **Open docs-only PRs non-draft.** A stranded draft-run red is fixed only by
      a genuine push (`synchronize`); a re-run replays `draft: true`.

---

## Regression prevention rules

1. **Grep before delete.** Grep all usages before removing/renaming anything.
2. **Verify key components after refactor.** ProducerCard, Header, BottomNav
   still import and render.
3. **One PR = one change.** Never bundle refactor + feature or docs + code.
4. **Mobile evidence before merging UI changes.** CC captures and reads the
   375/1440 screenshots of the most-affected pages (rule 23).
5. **RTL logical properties.** See [rtl.md](./rtl.md).
6. **Guard tests (401/403/409) must send schema-valid payloads.** A 422 proves
   nothing; use the `valid_*_payload()` fixtures in `tests/conftest.py`.
7. **Docs-only files still go through a feature branch + PR.** `staging` rejects
   all direct pushes; merge stays Sapir-only.
8. **Never add new env vars without listing them explicitly** and waiting for
   confirmation.
9. **Test dummy URLs must be real backend routes (matching method).** See
   [testing.md](./testing.md).

---

## Architectural smell detection (MEH-271)

### Smell #1 — Two parallel mechanisms for one job

Two paths owning the same state (schema, config, auth, cache, a doc fact) →
one authority; the other is deleted, not disabled. Grep for a second owner
before touching `models/`, `schemas/` or shared state
(`grep -r "create_all\|metadata.create\|_migrate" backend/`).

### Smell #2 — "Remember to update X when you change Y" in docs

Such a sentence is a docs patch over missing enforcement. Don't fix it inline:
open a Linear ticket naming both surfaces and the intended SoT, and leave the
note until it ships.

### When to run this check

Before any PR touching `backend/app/models/`, `backend/app/routers/`,
`backend/app/auth.py` or `lib/schemas.js`: scan CLAUDE.md + `.claude/rules/`
for "remember to update" / "keep.*in sync" / "also update"; report in the PR.

---

## Vibe Coding Guardrails (MEH-128)

`.claude/pre-edit-guard.js` warns on central-component edits. Follow
[docs/CENTRAL_COMPONENTS.md](../../docs/CENTRAL_COMPONENTS.md); log emergency
skips per [docs/EMERGENCY_OVERRIDE.md](../../docs/EMERGENCY_OVERRIDE.md).

---

## Custom commands

`/session-start` (rule 1 audit) · `/session-save` · `/session-resume` ·
`/retro` (after HANDOFF, rule 13; proposes, never applies) ·
`/adversarial-review` (FINDER → ADVERSARY → REFEREE, rule 5a).

---

## Code execution principles (exec §7–13)

[code-execution.md](./code-execution.md) (lazy-loaded for code files).

---

## Bug Protocol (unified)

1. **Identify the root cause** — document *why*, not just the symptom.
2. **Grep for siblings (MANDATORY before closing task)** and report them.
   - **2a — i18n copy siblings (MEH-1308):** a changed user-visible string →
     grep the rendered VALUE in `messages/he.json` + `en.json`.
   - **2b — VRT baselines (MEH-1328):** a changed `he.json` value on a VRT route
     (`/`, `/map`, `/about`, `/login`, `/register`, producer detail) →
     regenerate `parity.spec.ts-snapshots/` in the SAME PR.
3. **Add a regression rule** here if the pattern is likely to recur.
4. **Add a test** that would have caught it; else a MANUAL_TESTING.md case.
5. **Update docs** if the fix reveals a non-obvious convention.
6. **An anomaly seen during QA is explained or reported — never attributed to
   the harness and dropped.** Label an unverified diagnosis as unverified. A
   race that won't reproduce → inject the end state deterministically.

**Pattern — free-text input without character-class validation (MEH-555):** a
`String` field shown to admins/users gets a `field_validator` requiring ≥ 3
letters `[א-תa-zA-Z]`, counted after `strip()`, returning the stripped value.

Known Bug Patterns: [docs/BUG_PATTERNS.md](../../docs/BUG_PATTERNS.md).

---

## Commit discipline

Hotfixes get their own commit, never bundled with a refactor. "Let's do both
together" → split.

### `Builder-Model:` trailer — required on every commit (MEH-1668)

Last block of every commit message: `Builder-Model: <model the session actually
ran as>`. `scripts/checks/builder-model-guard.sh` (Repo guards) fails when it is
absent from the last authored (non-merge) commit, or equals the reviewer pin in
`claude-review.yml`. Dependabot is exempt. Never write a model you did not run as.

#### It conflicts with CC's harness instructions. That conflict is DECIDED: the repo wins (MEH-1718)

Write the trailer despite the harness's "no model id in artifacts" instruction.
Do not re-derive this per session.

---

## PR approval guide

DoD (every PR): `npm run build` · `pytest tests/test_api.py` · `/adversarial-review`
with all REFEREE verdicts fixed.

| PR type | Check |
|---|---|
| docs-only / infra-only | Read the diff |
| UI change | 375/1440 evidence (rule 23) |
| Backend change | Affected endpoint |
| Hotfix | Only the broken thing |

Docs-only commits still branch + PR (regression rule 7).

---

## Risk-tiered review frequency

Unsure of the tier → ask Smadar before starting. Never silently downgrade.
Tiers: [ADR-016](../../docs/decisions/ADR-016-risk-tier-nomenclature.md).

### HIGH-RISK — chunk-by-chunk review required

Auth · schema/Alembic · central components (`.claude/central-components.json`) ·
security-sensitive code · prod-deploy-blocking (env, Dockerfile, Railway).
Numbered plan → `go` → one chunk → `go <chunk>` per chunk.

### LOW-RISK — end-to-end with single review

Single-file dep bumps · copy · i18n sweeps · doc/rule edits · test additions.
Plan → `go` → execute fully → summary in `docs/session-state.md`.

### DEFAULT — ask if unsure

An explicit per-batch DO-NOT-MERGE / Sapir-merges instruction overrides tier
auto-merge authority (ADR-016 amendment).

---

## /ultrareview gate

PR שעומד ב-2+ מ: 500+ שורות · auth / payments / DB migration · refactor של
`main.py` / `MapClient.jsx` / `ProducerDetail.jsx` / `models.py` → `/ultrareview`
לפני merge (ידני, CLI). אסור על PR טריוויאלי.

---

## PR Review Workflow

Bundle for Claude.ai: `git diff staging <files>` + CHANGELOG + HANDOFF diffs,
each under `=== DIFF: <file> ===`.

### Specialized adversarial-review variants (MEH-428)

Run every variant that fits (base `/adversarial-review` otherwise):
`-types` (models / schemas / `lib/schemas.js` / alembic) · `-errors`
(services / routers / background tasks / `try`/`except` in side effects) ·
`-coverage` (helper extraction, central component, new endpoint or component) ·
`-size` (any central component).

---

## /loop — usage patterns

Each iteration costs quota — on demand only. Approved: deploy babysit, PR CI
watch, one-shot poll. Forbidden: always-on monitors, no exit condition, 5+
concurrent loops. Tiers + `mehamakor-dod` self-check: ADR-025.

---

22. **Copy approval gate before Linear issue creation (MEH-579 lesson, May 14 2026).**
    User-facing copy is approved verbatim by Smadar in conversation before it
    goes into an issue (draft → explicit approval per string → then the issue).
23. **`/goal` merge gate for UI work (MEH-571 + MEH-579 lessons, May 14 2026).**
    A `/goal` must never race a human confirmation against a mechanical
    auto-close.

    ### Amendment 2026-10-22 (MEH-2302) — there is no human mobile-QA pass. CC owns UI QA end to end

    Never wait for, ask for, or report "waiting on Sapir's mobile check". Before
    merging a UI PR CC supplies: `CI gate` + `Deploy gate` green on the head ·
    375 + 1440 screenshots in `qa-artifacts/MEH-XXXX/` (compressed, MEH-1156),
    opened and **read** by CC, linked from the PR · VRT clean or re-baselined
    with each PNG reviewed · a note when storage/hydration/sticky/dates/touch
    were covered by Chromium only. Still in force: rule 22, rule 30, and the
    permission gates (workflow YAML, branch protection, Alembic apply,
    `staging → main`).
24. **Scope-creep prevention for copy changes (MEH-579 lesson).** Never touch
    headings, subtitles or taglines not named in `<acceptance_criteria>`; grep
    before any positional copy edit; if a change seems needed, stop and ask.
25. **Pre-push staging sync (MEH-585, 15 May 2026).** Before every push:
    `git fetch origin` (immediately before) → `git merge origin/staging`
    (default over rebase; never force-push) → confirm expected deletions came
    through → push. Accept-Both on CHANGELOG/HANDOFF only in docs-only PRs.
    Churn loop → arm auto-merge for the next clean window.
26. **Verify PR scope before migration or close-without-merge.** List the files
    (`gh pr view N --json files`); anything beyond `*.md`/`docs/` is a code
    change — surface every non-docs file before proceeding.
27. **Search Linear before opening any new issue.** `list_issues` on the title's
    nouns + synonyms; overlap in an active state → extend / ask fold-sibling-new,
    never open silently (unless told "skip duplicate-check").
28. **Single-dispatch rule — one prompt per ticket, from the ticket.** No ticket
    → numbered plan only; the prompt lives in the description; changes edit the
    description. Before dispatch: live Linear check, already-merged check,
    umbrella vs split (close one first), read the card's live attachments and
    `git ls-remote origin | grep <branch>`. **Read the branch number off the
    created card — never predict it.**
29. **Linear auto-reopen guard — no bare `MEH-XXXX` in docs/HANDOFF PRs that
    only MENTION already-Done issues.** Write `PR #N` or prose for Done cards
    in branch, title and body; the card the PR closes still gets `Closes MEH-X`.
    Run `bash .claude/scripts/check-linear-mentions.sh <title-file> <body-file>`
    **before** opening — the CI job is warn-only and fires after the damage.

    ### 29b — branch-name auto-close: the condition is DOCUMENTED. Verify anyway.

    Merge outcome is not predictable (a bare id / closing word closed 7/7;
    `Refs` closed 2/5). **Never predict** a close or a non-close. Carry the
    trailer you mean (`Closes` when DoD is met, `Refs` when not). **After every
    merge, `get_issue` every MEH id in the branch name and check BOTH
    directions**; reopen with a Hebrew reason if the DoD is unmet, then re-read
    the status (a reopen can be re-closed seconds later). Turning off
    close-on-merge-to-`staging` is a Linear setting — Sapir's call.
30. **A DO-NOT-MERGE marker (or any blocking gate) is a STOP condition — never
    self-clear it.** Sapir clears it, even after merge is authorized and even on
    CC's own marker, even when it looks stale. Never edit metadata or push a
    no-op to get past a gate; only fix a real cause CC owns. "Auto-merge
    unarmed" is not a substitute for the marker.

    ### 30b — the marker is a LABEL, not a sentence (MEH-1523)

    `do-not-merge` is a GitHub **label**, the only marker
    (`pr-checks.yml:72`, labels only). Draft = still in progress; the label =
    ready, don't land. Prose in a body no longer reds anything.
31. **Append-only logs never ride in a code branch — enforced, not advised
    (MEH-1372, gated by MEH-1602).** `docs/CHANGELOG.md` + `HANDOFF.md` only in
    a separate docs-only PR (`changelog-branch-guard.sh`). If it fires:
    `git checkout origin/staging -- docs/CHANGELOG.md HANDOFF.md`.

    ### 31b — separating the FILES did not separate the ORDER (MEH-2103)

    Do not arm auto-merge on a docs PR until every PR it describes has merged.
    Optional `Describes-PRs: #N, #M` trailer is checked (warn-only) by
    `docs-ordering-guard.sh`.
32. **CC מוסיפה אילוצים, לא מסירה — CC adds constraints, never removes or
    weakens one (MEH-1779).** Judge by outcome (the set of caught violations must
    not shrink), not by whether the diff "adds". `.claude/settings.json` and
    `.claude/hooks/**` are hard-denied — guardrail changes are Sapir-only in both
    directions.

    ### The parallel-actor case: the direction of the change is the test (11/08)

    When a parallel actor produced a forbidden state, act unasked **only** in
    the direction that adds a constraint (disarm auto-merge: yes; arm, clear a
    marker, merge: no) — and report.
33. **A DoD checkbox is a claim of fact — check it only for a box you performed
    yourself and can cite evidence for (MEH-1755).** Otherwise leave `[ ]` with
    a reason in prose; same for N/A.
34. **A refuted premise updates the card DESCRIPTION, not just a comment
    (MEH-2085 correction, MEH-1959 chain).** `save_issue` with a `patch` op.
35. **CC never posts a bot command. It reports the command; a human posts it
    (MEH-2226).** Put the exact `@dependabot …` command on its own line, say who
    posts it and the acknowledgement to expect (`OK, I won't notify you…`; the
    generic blurb means not parsed). Don't run a post-and-delete re-test.
36. **Multi-PR work is split into Linear sub-issues, one per chunk — each PR
    `Closes` its sub-issue; the parent carries no `Closes` and is closed by
    Linear's auto-close-parent setting (MEH-2244).** Create the sub-issue before
    the branch; slug = sub-issue id; body ends `Closes MEH-<sub>` on its own
    line. Auto-close-parent is ON — so a parent that must stay open (e.g. a
    drain control card) never gets its docs sub-issue as a child.
