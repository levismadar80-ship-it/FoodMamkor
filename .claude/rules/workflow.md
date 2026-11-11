# Full workflow rules

Rules only. Each rule's sources, incidents and measurements live verbatim in
[docs/rules-history/workflow.md](../../docs/rules-history/workflow.md) — same
headings and numbers; read it before re-opening a rule.
`scripts/checks/rules-inventory-guard.sh` fails if a rule goes missing here.

---

## Working the queue

**Linear is the channel. Nothing arrives by chat.** At session start and after
each item, run **both** lanes. Lane A first, then Lane B, each Urgent → High →
Normal → Low. The card description is the full spec (§4 = the XML prompt);
authority is ADR-032: **§2.5** RED items stop before merge until the
adversarial reviewer (the fresh reviewer subagent, rule 5a) runs; **§2.6**
exploit-proving tests assert **behaviour**, never that the prescribed change
was applied. (These read §3.5/§3.6 until 08/11; ADR-032 numbers them §2.5/§2.6.)

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

Naming the ambiguity is not resolving it — only the three commands do. Both
directions of the null are live (`MEH-360` never existed; `MEH-1948` was
archived).

---

## The reviewer is a fresh subagent — the CI reviewer is off (Sapir 08/11, until MEH-569)

The `claude[bot]` CI review (`claude-review.yml`, workflow «Claude PR Review»,
job «Adversarial review (calibration)») was red
on every PR for a reason it never printed (MEH-2845), so Sapir disabled it from
the Actions page until the MEH-569 audit. Its job goes to a **fresh reviewer
subagent** (rule 5a): a missing `claude[bot]` comment blocks nothing and is
never waited for. (MEH-1844's "the CI reviewer works" — 13/08 — is history.)

---

## Workflow rules 1–20

1. **Session start protocol (MANDATORY — higher priority than any task).**
   Read HANDOFF.md first, this file, DESIGN.md/DATA.md; list feature branches,
   open PRs and `origin/staging..origin/main`; report and ask "continue an open
   PR, or start fresh?" — never skip it. Evidence of a parallel session → stop
   and report. PR given by number → check out its head branch first.
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
   [testing.md](./testing.md). In addition to `/adversarial-review`, the
   independent pass is a **fresh reviewer subagent** CC starts with the diff
   and the card's acceptance_criteria (not the `claude[bot]` CI comment — off
   since 08/11, until MEH-569); every finding is fixed or answered in the PR
   before the merge.
5. **Tests before implementation.** See [testing.md](./testing.md).
6. **Commit per task with a clear message.** One logical change = one commit;
   the message states *why*.
7. **`/compact` discipline — proactive, not reactive.** `/compact` at ~40%
   context; dump plan + todos first. Once `session-state.md` exists prefer
   `/clear` + `/session-resume`.
8. **Use "ultrathink" for complex problems** — schema, security, multi-file
   refactors, anything costing >10 min to undo.
9. **After every PR — send the Vercel preview URL when one exists.**
   (`"בדיקי על: https://food-mamkor-[hash].vercel.app"`). A feature branch
   gets a preview only for a commit whose message contains `[preview]`
   (MEH-2845; `frontend/vercel.json` `ignoreCommand`) — every other push is
   cancelled. **Every** feature push, built or cancelled, spends one of Vercel
   Hobby's 100 deployments a day (MEH-2062, deployment.md), and a spent quota
   blocks staging and main too: keep pushes few (batch commits; rule 25's
   staging merge is a push). Never report an absent preview as rendered.
   Merging to staging follows rule 38.
10. **After every PR — a test, not a checklist line (MEH-2796).** New
    behaviour gets an automated test (pytest / vitest / Playwright). Only what
    automation cannot see (real iPhone Safari, a third-party console, a flag
    flipped by hand) gets one line in
    [docs/RELEASE_CHECKLIST.md](../../docs/RELEASE_CHECKLIST.md), cap 30.
    `docs/MANUAL_TESTING.md` is archived — never add to it.
11. **After every PR — auto-update every doc your code touched**, same PR
    (DATA / ADMIN / DESIGN / FEATURES / SECURITY / DEPLOYMENT,
    `.ai/diagrams/`; CHANGELOG via rule 31). Stop hooks run build + pytest.
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
    3 min (error → open a bug), `/loop` staging health to first success/error.
    3+ phases → Ultraplan, execute after `go`. `/goal` only for LOW-RISK,
    mechanically verifiable ends — never auth, schema, central components,
    security, prod deploy; STOP conditions hold; evaluator-done but PR red →
    back to manual.
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
    The only exception is rule 39.
    - **Triggers:** a push whose tip SHA already exists on `origin` fires
      nothing; push a NEW SHA (real commit or staging merge, never empty).
    - **Cancelled ≠ failed:** newer run for the head SHA in progress → wait;
      job hung in setup with no newer run → `rerun_failed_jobs` (not a rule-30
      violation) and confirm real output.
    - **Draft PRs skip-green** — mark ready before trusting CI.
    - **`enable_auto_merge` on an armed PR is a silent no-op** keeping the old
      method: disable → enable → re-read the method.
    - **`merge_pull_request` squash can land a merge commit** — read the landed
      message.
    - **Open docs-only PRs non-draft**; a stranded draft red needs a real push.

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
4. **Add a test** that would have caught it; else (real device only) a
   line in `docs/RELEASE_CHECKLIST.md`.
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

    Never wait for or report "waiting on Sapir's mobile check". Before merging
    UI: both gates green on the head · 375 + 1440 screenshots in
    `qa-artifacts/MEH-XXXX/` (compressed), **read** by CC, linked · VRT clean (add
    the `run-e2e` label to get the run, MEH-2779) or each re-baselined PNG
    reviewed · say when only Chromium covered it. Rules 22 and 30 and the
    permission gates still apply.
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

    Merge outcome is unpredictable (`Refs` closed 2/5). **Never predict** a
    close or non-close; carry the trailer you mean (`Closes` / `Refs`). **After
    every merge, `get_issue` every MEH id in the branch name, both directions**;
    if wrongly closed, reopen with a Hebrew reason and re-read the status.
30. **A DO-NOT-MERGE marker (or any blocking gate) is a STOP condition — never
    self-clear it.** Sapir clears it, even after merge is authorized and even on
    CC's own marker, even when it looks stale. Never edit metadata or push a
    no-op to get past a gate; only fix a real cause CC owns. "Auto-merge
    unarmed" is not a substitute for the marker. Narrowly: the ADR-032 §2.5
    "RED stops until the adversarial reviewer runs" is satisfied by the
    **fresh reviewer subagent's** pass (rule 5a) with its findings fixed or
    answered — not by waiting for a `claude[bot]` comment, which is off since
    08/11 (Sapir, until MEH-569). That is the only thing the pass satisfies: a
    `do-not-merge` label or any other marker is still Sapir's to clear.

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

    ### 32b — when a delete is denied, leave the file and say so

    A denied `rm` is a decision about the file, not about the command. Reaching
    for `mv` (to `/tmp`, to a scratch directory, to a `.bak` name) produces the
    outcome the deny refused, by a route the deny does not cover — the file
    stops being where it was, which is the only thing the denial was
    protecting. The same goes for `git clean`, `git rm`, truncating the file to
    nothing, or rewriting it to a stub.

    **What to do instead:** leave the file exactly as it is, finish the rest of
    the task, and report the file by path and why you wanted it gone. If it is
    untracked, it stays untracked — stage by explicit path (`git add <path>`),
    never `git add -A`, so an untracked file cannot ride along into a commit by
    accident.

    This is rule 32 applied to one's own workspace: a deny is a constraint, and
    routing around it removes one. It is also the general case — any denied
    action is reported, not re-attempted through a different verb.

    _Source: Sapir, 11/11/2026, standing instruction._
33. **A DoD checkbox is a claim of fact — check it only for a box you performed
    yourself and can cite evidence for (MEH-1755).** Otherwise leave `[ ]` with
    a reason in prose; same for N/A.
34. **A refuted premise updates the card DESCRIPTION, not just a comment
    (MEH-2085 correction, MEH-1959 chain).** `save_issue` with a `patch` op.
35. **CC never posts a bot command. It reports the command; a human posts it
    (MEH-2226).** Post the exact `@dependabot …` line as plain text, say who
    posts it and the expected ack (`OK, I won't notify you…`).
36. **Multi-PR work is split into Linear sub-issues, one per chunk — each PR
    `Closes` its sub-issue; the parent carries no `Closes` and is closed by
    Linear's auto-close-parent setting (MEH-2244).** Create the sub-issue before
    the branch; slug = sub-issue id; body ends `Closes MEH-<sub>` on its own
    line. Auto-close-parent is ON — so a parent that must stay open (e.g. a
    drain control card) never gets its docs sub-issue as a child.
37. **Placement research before code for every new UI feature (MEH-2725).**
    A new block, row, button or banner gets a short placement study before the
    first edit: (1) who sees it and what she came to do at that moment; (2) a
    375 screenshot of the screen today; (3) 2–4 candidate positions rendered for
    real, including "don't add it"; (4) for each, where it lands in px and what
    it pushes down; (5) what comparable sites do, with sources; (6) earlier
    decisions on the same screen (e.g. MEH-912); (7) a recommendation. Sapir
    picks, then code. Post-launch, add a PostHog click event on the feature.
    Precedent: MEH-2724 built under the hero before the study was asked for.
38. **A PR that changes what users see: CC self-merges it to staging after the
    full self-check (Sapir 09/11, MEH-2860 — replaces MEH-2825's wait for
    «go merge» on staging merges).** The self-check, all five before the merge:
    (1) `CI gate` + `Deploy gate` green on the head; (2) one `[preview]` commit,
    then screenshots of the Vercel preview (390×844 WebKit + 1280 Chromium, with
    the protection-bypass headers of testing.md) — if no preview arrives
    (quota, cancelled, unreachable), from CC's own local production build, and
    the PR says so; (3) every reviewer / CI-bot comment newer than the last push
    answered; (4) a fresh reviewer subagent (rule 5a), every finding fixed or
    answered; (5) every Hebrew string diffed against the card's approved table.
    Then squash-merge, confirm the staging deploy is green, and report (card ·
    PR · what changed · screenshots · next item). "Changes what users see" = any
    rendered pixel or copy on any surface, `/admin` included; unsure → treat it
    as UI. **Still gated:** staging → main only on Sapir's «go merge» via
    [RELEASE_CHECKLIST](../../docs/RELEASE_CHECKLIST.md); an Alembic revision
    waits for her OK; a `do-not-merge` label, a card or batch that says Sapir
    merges, or new copy not in an approved table still stops CC (rules 22, 30;
    ADR-016 amendment). This adds to rule 23 (375/1440 in `qa-artifacts/`) and
    replaces none of it.
39. **A red E2E gate blocks a merge to staging unless all three hold, and the
    PR body says so, one line each (Sapir 11/11, every PR from then on).**
    (a) **0 failed**: quote each shard's `executed=… unexpected=0 …` line.
    (b) **Every flaky test is in a spec this PR does not touch, and has a
    card**: name the card. (c) **The flaky tests' names and lines are read and
    quoted, not inferred**: the `✘` / `✓ (retry #1)` lines and the error block,
    from the job log or the report. A count, a summary comment, or "not in the
    flaky list" is not (c). If the log can't be read, run the E2E once more and
    quote that run. If any of the three is missing, don't merge.
    `--fail-on-flaky-tests` stays on. This rule decides when a red caused by
    someone else's flake may be merged past; it never loosens the gate. A flake
    with no card gets one before the merge. Precedent: #4316.
40. **A PR that touches `frontend/` or `backend/app` carries the `run-e2e`
    label before it merges, and the PR body quotes the E2E result (Sapir
    11/11).** Quote it — each shard's `N passed` / `N failed` / `N flaky`, or
    the `✘` lines — never "E2E gate: success". **A gate that aggregated a
    SKIPPED run is not evidence**: `Playwright E2E` does not run on a feature
    PR without that label (MEH-2779), and `E2E gate` reports `success` either
    way. Three PRs merged on 11/11 with every gate green and no E2E suite run
    on any of them; one of them broke staging. Read the per-JOB conclusions,
    not the run's: a run shows `cancelled` when a non-blocking shadow job is
    cancelled after the blocking shards have already passed.
    Rule 39 says when a RED may be merged past; this one says there has to be
    a run at all. Until the trigger moves into the workflow itself, this is a
    rule that depends on someone remembering it.

---

## Launch tier (/join tool list) — MEH-2830

`frontend/lib/business-features.js` feeds the tool list on /join (MEH-2791).
Its test catches a tool that was **removed**, not one that was **added and
never listed** — so every PR that adds or changes something a **business** can
use states its tier in the PR body:

- **א׳ new tool** → add an entry to `frontend/lib/business-features.js`, with
  the he/en copy from the issue's approved table. No tile unless the issue says
  so (max 4 tiles per group — Sapir decides).
- **ב׳ change to an existing tool** → update that entry's copy / `codeRef`.
- **ג׳ internal** (bug, design, perf) → no registry change; CHANGELOG only.

If the issue states no tier and the PR touches a business-facing tool →
**STOP and ask.** No registry copy without word-by-word approval in the issue.

---

## Dashboard placement (/producer/dashboard) — MEH-2885

Every tool lives where its frequency says: daily → the dashboard home, weekly →
a tab, one-time → «כלים» or «עריכה» (audit:
`docs/audits/2026-11-dashboard-placement.md`). Two parts:

- **Enforced:** `frontend/__tests__/DashboardPlacementGuard.test.js` fails when
  a page under `app/[locale]/producer/dashboard/**` has no place in
  `frontend/lib/business-features.js` (a tool's `dashboard: { home, href }`, or
  the explicit frame / sub-page / without-entry lists), when a tool's page has
  no link pointing at it, when it is more than 2 taps from the home, or when
  the tab its `dashboard.home` names does not itself link to it. Taps come
  from a static graph: a tab = 1; a link written in a page file or in a file
  that page imports directly = +1 — whatever state renders it. Comments, the
  tools tab's `also:` highlight list and the organizer's own tabs are not
  links. A new page → its place goes in the registry in the same PR: a tool's
  landing page gets `dashboard: { home, href }`; a form / print view inside a
  tool goes in `DASHBOARD_SUBPAGES`; a tool page with no registry entry yet
  (one needs approved copy, «Launch tier» א׳) goes in
  `DASHBOARD_PAGES_WITHOUT_ENTRY` with the reason.
- **Reviewed:** a card for any PR that touches `/producer/dashboard` carries the
  «מיקום בלוח הבקרה» block (template 06): tool · frequency · where · entry
  (href) · taps from home at 390 · inbound links · empty state. The fresh
  reviewer (rule 5a) checks the block against what was built, and the PR body
  says where each changed surface landed.
