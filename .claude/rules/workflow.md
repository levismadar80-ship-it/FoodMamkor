# Full workflow rules

All 20 workflow rules, regression prevention, custom commands, and
execution principles (exec §7–13). Preserved verbatim from the
pre-refactor CLAUDE.md — the main `CLAUDE.md` only carries the top-10
summary + pointer here.

---

## Branch-base verification (CRITICAL)

Before any read/write tool call on a new ticket — and before any
`git commit` — run BOTH:

```bash
git branch --show-current      # MUST NOT equal staging or main
git rev-list --count HEAD ^origin/staging   # MUST be < 5
```

If `git branch --show-current` returns `staging` or `main`, run
`git checkout -b feature/meh-XXX-<slug> origin/staging` **immediately**,
before any read/write tool call.

Large divergence (>50) indicates the harness created the branch off
`main` instead of `staging` — known CC bug (GitHub issue #24516).

If detected:
1. ABORT current work
2. `git stash` (if uncommitted changes exist)
3. `git fetch origin staging` — do NOT use `git checkout staging && git
   pull origin staging`: in the sandbox the local `staging` ref is often
   divergent and `pull` aborts with *"Need to specify how to reconcile
   divergent branches"*. Treat `origin/staging` as the only authoritative
   ref (MEH-542, 2026-06-13 — this failed twice in one session).
4. `git checkout -B <correct-branch-name> origin/staging`  # cut straight off origin
5. `git stash pop`
6. Re-verify divergence count is small (`git rev-list --count HEAD ^origin/staging`)
7. Resume work

DO NOT continue with a main-based branch — rebase will fail with
phantom add/add conflicts on hundreds of files (squash-merge SHA drift).

_Source: MEH-427 (2026-05-05) for the divergence check; MEH-462
(2026-05-06) added the `git branch --show-current` assertion after the
MEH-459 branch slip exposed that divergence returns 0 when `HEAD ==
origin/staging`. Earlier divergence traps: MEH-363 PR #439 (288 commits)
and MEH-374 (62 commits)._

---

## Workflow rules 1–20

1. **Session start protocol (MANDATORY — higher priority than any task).**
   Before doing ANY work: (a) read this file + [HANDOFF.md](../../HANDOFF.md)
   + [docs/DESIGN.md](../../docs/DESIGN.md) (UI) /
   [docs/DATA.md](../../docs/DATA.md) (backend) — HANDOFF.md first,
   (b) `git fetch --prune origin && git branch -r | grep -v 'HEAD\|main\|staging'`
   — list feature branches, (c) list open PRs (MCP
   `list_pull_requests` or equivalent), (d)
   `git log --oneline origin/staging..origin/main` — check if staging
   drifted from main, (e) **report findings to user** and ask
   "continue an open PR, or start fresh?" This prevents duplicate PRs,
   stale branches, lost work, and merge conflicts across sessions.
   Never skip this audit even if the user jumps straight to a task.
   **Single-session rule:** only ONE Claude Code session may be active
   at a time on this repo. If you find evidence of a parallel session
   (branches with similar timestamps, conflicting changes, `claude/*`
   branches): **stop and report to user** before proceeding. Parallel
   sessions caused PRs #71, #72, #77 to be re-applied — never again.
   - **Git worktrees for parallel tasks.** Sequential (one PR at a
     time) → current flow fine. Parallel (2+ PRs open simultaneously)
     → MUST use worktrees (see Rule 16).
   - **When the user references a PR by number.** Resolve the branch
     first: `gh pr view [number] --json headRefName -q .headRefName` →
     `git checkout [that branch]` → confirm
     `"Now on [branch] for PR #[number]"` before editing.
2. **Branch from `staging`** — never from `main`. See
   [.claude/rules/deployment.md](./deployment.md).
3. **Name branches `feature/*`** — no `claude/*` or other prefixes.
4. **Plan before coding + interview mode.** Propose the approach in
   plain text before touching files; wait for explicit `go` before
   editing. **If the task is ambiguous** — missing spec, unclear
   scope, fuzzy acceptance criteria, or a Linear/issue title with no
   body — enter interview mode: ask 2–5 targeted questions first, then
   plan. Don't guess at requirements, don't code-first.
   - **Pre-go scope-match check (MEH-342 lesson).** Before presenting
     any numbered plan that references a Linear issue: fetch the
     current Linear description. Compare every requirement in the spec
     against the proposed plan. For each spec requirement, confirm it
     appears in the plan — or surface the gap explicitly:
     *"Spec says X, plan proposes Y — which scope do you want?"*
     Never silently drop a spec requirement and never assume scope
     reduction is implicit approval. "go" approves the plan presented,
     not the Linear spec; if they diverge, the divergence must be
     named before "go" is given.
5a. **Adversarial review before every merge to staging.** See
   [.claude/rules/testing.md](./testing.md).
5. **Tests before implementation.** See
   [.claude/rules/testing.md](./testing.md).
6. **Commit per task with a clear message.** One logical change = one
   commit. Message states *why*, not just *what*. Update
   [docs/CHANGELOG.md](../../docs/CHANGELOG.md) only for substantial
   session work — small commits are documented by git log.
7. **`/compact` discipline — proactive, not reactive.** Run `/compact`
   when context hits **~40%**, not when the system warns at 95%.
   Auto-compact is a last resort: it summarizes without your intent
   and loses load-bearing plan details. **Before `/compact`:** dump
   current plan + pending todos to the user so nothing is lost. Once
   a `session-state.md` exists, prefer `/clear` + `/session-resume`
   (see rule 14 + custom commands below) over `/compact`.
8. **Use "ultrathink" for complex problems** — schema migrations,
   security tradeoffs, multi-file refactors, anything where a wrong
   call costs more than 10 minutes to undo.
9. **After every PR — always send the Vercel preview URL.** Format:
   `"בדיקי על: https://food-mamkor-[hash].vercel.app"`. **Wait for
   approval before merging to staging.** Full flow + mobile checklist:
   [.claude/rules/deployment.md](./deployment.md).
10. **After every PR — update
    [docs/MANUAL_TESTING.md](../../docs/MANUAL_TESTING.md)** with any
    new features. Format: `[ ] Test — איך לבדוק — תוצאה מצופה`. Add
    under the relevant page/feature section, or create a new section.
11. **After every PR — auto-update every doc your code touched.** If
    you edited a code area, update its doc in the same PR — don't wait
    to be asked. Rule: code change → doc update, same commit or same
    PR. **Stop hooks in `.claude/settings.json` run `npm run build` +
    `pytest tests/test_api.py` before any task is marked done** — if
    either fails, Claude blocks and must fix before proceeding. Also
    keep [.ai/diagrams/](../../.ai/diagrams/) (auth-flow / db-schema /
    api-routes) in sync if you changed any of those surfaces — they're
    loaded at session start via the alias in rule 1.
    - [`docs/DATA.md`](../../docs/DATA.md) — if DB schema or endpoints changed
    - [`docs/ADMIN.md`](../../docs/ADMIN.md) — if admin panel changed
    - [`docs/DESIGN.md`](../../docs/DESIGN.md) — if UI/UX changed
    - [`docs/FEATURES.md`](../../docs/FEATURES.md) — mark completed features as ✅
    - [`docs/MANUAL_TESTING.md`](../../docs/MANUAL_TESTING.md) — add new test cases (see rule 10)
    - [`docs/SECURITY.md`](../../docs/SECURITY.md) — if auth or permissions changed
    - [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) — if env vars or infra changed
    - [`docs/CHANGELOG.md`](../../docs/CHANGELOG.md) — always add a one-line entry
    - [`.ai/diagrams/`](../../.ai/diagrams/) — if DB schema, auth flow, or API routes changed
12. **After every PR that touches `backend/app/routers/**`,
    `backend/app/models/**`, or `backend/app/auth.py` — update
    [.ai/diagrams/](../../.ai/diagrams/).** These Mermaid diagrams are
    loaded at session start; if they drift from the code, they become
    actively misleading. (Before the April 2026 refactor, compact copies
    also lived inline in CLAUDE.md; they were removed because they
    duplicated the long-form versions in `.ai/diagrams/`.)
13. **End of session protocol (MANDATORY — same priority as Rule 1).**
    Before closing ANY session — update
    [HANDOFF.md](../../HANDOFF.md): (a) last PR merged or opened + PR
    number, (b) current branch + what's done / what's pending, (c)
    next task: Linear issue + first concrete step, (d) any decisions
    made this session (add to decisions table), (e) any known issues
    discovered but not yet filed. Never end a session without updating
    HANDOFF.md. If `/compact` fires mid-session → update HANDOFF.md
    immediately before continuing work. A session with no HANDOFF.md
    update = incomplete, same as a session with no CHANGELOG update.
    **After updating HANDOFF.md, run `/retro`** to extract behavior
    corrections / preferences / self-critique from the session and
    route each finding to the right source-of-truth file as a
    `str_replace` block (per
    [.claude/commands/retro.md](../commands/retro.md)). The retro
    proposes per finding; Smadar approves with `go <N>` before any
    edit lands. Empty-case (no findings) is a valid outcome — do not
    invent placeholders.
14. **Context reset protocol.** When context usage hits **≥60%** or at
    a natural task boundary (PR merged, feature shipped): run
    `/session-save` to write `session-state.md` (current branch, open
    PR URL, todos, active decisions), then `/clear`, then
    `/session-resume` on next turn. Auto-compact is a last resort — it
    silently drops plan details. Pair with rule 7's 40% `/compact`
    trigger: below 40% keep working, 40–60% `/compact`, ≥60% save +
    `/clear`.
15. **Prompt compression (Caveman style).** Full body + good/bad
    examples in [.claude/rules/prompting.md](./prompting.md).
16. **Git worktrees for parallel features.** 2+ simultaneous unrelated
    features → worktrees, not `git stash`. `.claude/worktrees/` is
    gitignored.
    - **Create:** `claude --worktree meh-78-map-bugs` → creates
      `.claude/worktrees/meh-78-map-bugs/`, checks out a new branch,
      scopes session there.
    - **After create (manual):** `cp .env.local .claude/worktrees/[name]/ && cd .claude/worktrees/[name] && npm install`
    - **Cleanup after merge:** `git worktree remove .claude/worktrees/[name] && git branch -d feature/[name]`
    - **Use when:** 2+ unrelated bugs; feature + hotfix running at
      same time. **Skip when:** changes touch same files; single
      small fix.
17. **New Claude Code features in workflow.**
    - **Post-merge: `Monitor` Vercel logs 3min.** `Monitor` tool →
      tail Vercel deploy logs, filter on `error`. Any error → open a
      bug issue before ending; do not silently close.
    - **Post-merge: `/loop` staging deploy health 5min.** `/loop 60s`
      → check Vercel deploy status +
      `curl -sI https://staging.mehamakor.online` expect `HTTP 200`.
      Stop on first success OR first error. Report to user.
    - **Pre-code: Ultraplan for multi-phase tasks (3+ phases, e.g.
      MEH-58 map redesign).** Start with
      `/plan ultraplan [caveman spec]`. Drafts build in cloud at
      code.claude.com. User reviews + approves the plan before any
      code is written; only execute after explicit `go`. Requires
      Claude Code web account + GitHub repo connected.
    - **Pre-code: `/goal` command for LOW-RISK end-to-end execution
      (Claude Code 2.1.139+, May 2026).** Define one mechanical completion
      condition; Claude works across turns until it's met, an evaluator
      model checks each turn, and the agent stops on its own. Cuts
      ping-pong on LOW-RISK tasks (test fixes, copy, i18n, docs-only,
      CI/workflow YAML, single-file deps).
      - **Usage:** `/goal [verifiable end-state]`. Examples that work:
        `/goal pytest tests/test_X.py green + draft PR opened`;
        `/goal npm run build green + preview URL posted + Lighthouse ≥ 90`.
      - **HIGH-RISK ban.** Never `/goal` on auth, schema, central
        components, security, or prod-deploy work. The evaluator can't
        judge architectural trade-offs — same family as MEH-373 subagent
        approximation drift.
      - **Goal must be mechanically verifiable.** ✅ `pytest green + PR
        state` (mechanical) — ❌ `design looks good` (subjective, will be
        judged wrong).
      - **STOP conditions stay in force (Risk-tiering section above).**
        Goal failure on: discovery exposes scope > defined; >2 failed
        attempts on same problem; cumulative runtime > 30 min. Set runtime
        cap inside the goal string when relevant.
      - **Pilot before mass adoption.** Use on one LOW-RISK Linear issue
        first (current pilot: MEH-571 FAQ page). If the evaluator marks
        "done" but PR isn't actually green → revert to manual flow, do not
        `/goal` again until the failure mode is documented here.
    - Caveat: `Monitor` needs the advertising MCP server connected;
      if unavailable, fall back to manual `curl` polling and note it
      in the session summary.
18. **One branch per feature (frontend + backend together).** Solo
    project rule: frontend and backend changes for the same feature
    go on ONE branch. Before opening any new branch:
    `gh pr list --state open` — if open PR exists for same feature →
    add fix to that branch, not a new one. If fix discovered during
    feature work → add to feature branch directly (same PR), one
    commit: `fix: [description]`. Only open separate branch when fix
    is completely unrelated to any open PR, or hotfix on production
    while feature branch is in review. Never: open backend PR +
    separate frontend PR for same feature; open new branch for bug
    discovered during existing feature work; leave related fixes on
    different branches requiring later merging.
19. **Zod validation before every map API call.** See
    [.claude/rules/frontend.md](./frontend.md).
20. **Review order — CI before adversarial (mandatory).** See
    [.claude/rules/testing.md](./testing.md).
21. **Never merge without a verified green CI signal.** If all CI jobs
    complete in <2 seconds with `conclusion: failure` and no log output,
    that is **budget exhaustion** — not a real failure and not a real
    pass. Check `Settings → Billing & plans → Spending limits` first.
    Do not merge on a "green" signal you cannot explain. Do not merge
    on a "failing" signal you cannot read logs for. Wait for budget
    resolution before proceeding. (Root cause: MEH-314/317, 2026-04-25 —
    test bug was masked by budget exhaustion and shipped in PR #337.)
    - **Superseded-run false-failure.** A `CI gate (required)` failure
      webhook can be a *cancelled* run, not a real one: flipping a PR
      draft→ready (or a rapid second push) starts a new `pr-checks` run
      that concurrency-cancels the in-flight one, and the gate's bash
      aggregator maps its `cancelled` deps to FAIL (`R_BUILD: cancelled`
      → `exit 1`). Before diagnosing a gate failure, list runs for the
      head SHA — if a newer run is `in_progress`, the older
      `conclusion: cancelled` gate is stale; wait for the newer run
      rather than "fixing" a non-bug. (MEH-1049, 2026-07-09 — PR #1530
      emitted "CI gate failed" from superseded run #2279 while #2280 ran
      green and auto-merged.)

---

## Regression prevention rules

1. **Grep before delete.** Before removing or renaming any variable,
   prop, or function: grep the entire codebase for all usages first.
   Do not remove until all consumers are updated.
2. **Verify key components after refactor.** After any refactor PR:
   verify that ProducerCard, Header, and BottomNav still import and
   render cleanly (no undefined variables, no missing props).
3. **One PR = one change.** One PR = one logical change. Never bundle
   a refactor with a feature, or a docs change with a code change.
4. **Mobile preview before approving UI changes.** Before approving any
   PR that changes visible UI: open the Vercel preview URL on mobile
   and check the pages most affected by the change.
5. **RTL logical properties.** Full rule + exception list:
   [.claude/rules/rtl.md](./rtl.md).
6. **Guard tests (401/403/409) must send schema-valid payloads.**
   A 422 proves nothing about the guard. FastAPI validates the request
   body before running `Depends(get_current_user)` when the body
   parameter precedes the auth dep in the function signature. Use
   `valid_*_payload()` fixtures from `tests/conftest.py`; schema
   changes must not silently invalidate security tests.
7. **Docs-only files still go through a feature branch + PR.**
   `HANDOFF.md` / `CHANGELOG.md` / `ROADMAP.md` / `MANUAL_TESTING.md`
   are no exception — the `protect-staging` ruleset blocks *all* direct
   pushes to `staging` (`push declined due to repository rule
   violations`), docs or not. Branch off `staging`, open a PR, let the
   docs-only twin checks (MEH-736) satisfy the required gates; merge
   stays Sapir-only. (This rule previously claimed docs could be
   committed straight to `staging` — factually wrong since the ruleset
   landed; corrected in MEH-1012 after a rejected push on 2026-07-03.)
8. **Never add new env vars without listing them explicitly**
   **and waiting for confirmation.**

---

## Architectural smell detection (MEH-271)

Learned from MEH-267 (Alembic migration scaffold): the codebase had two
parallel mechanisms doing the same job (`Base.metadata.create_all` on
boot + `_migrate_columns()` DDL). Both "worked" independently, so
neither surface showed an error — the smell was invisible until a
production incident.

### Smell #1 — Two parallel mechanisms for one job

**Signal:** any code where two separate paths both own the same state
(schema, config, auth, cache). Either path can succeed while the other
drifts silently.

**Canonical example:** `create_all` + `_migrate_columns` both owning DB
schema. Fix: one authority (Alembic). The other path is deleted, not
disabled.

**How to spot it during a session:** before touching `models/`,
`schemas/`, or any file that owns shared state — grep for a second
owner:

```bash
grep -r "create_all\|metadata.create\|_migrate" backend/ --include="*.py"
```

Adapt the pattern to the surface (e.g. for auth: grep for two JWT
decode paths; for config: grep for two env-var readers).

This applies to docs too — when two docs own the same fact, one is deleted, not disabled.

### Smell #2 — "Remember to update X when you change Y" in docs

**Signal:** any sentence in `CLAUDE.md` or `.claude/rules/` that says
"remember to update X", "keep X in sync with Y", or "also update X
after changing Y" — this is a docs patch over a missing enforcement
mechanism.

**Examples of the pattern:**
- "After changing `backend/app/models/`, update `docs/DATA.md`" — no
  tool enforces this; it drifts.
- "After changing auth routes, update `.ai/diagrams/auth-flow.md`" —
  same problem.

**Rule:** when you find this smell, do NOT fix it inline or silently
during another PR. Instead:
1. Open a Linear ticket describing the two surfaces that need to stay
   in sync and what the single source of truth should be.
2. Keep the "remember to update" note in place until the ticket ships —
   removing it early loses the reminder without fixing the underlying
   drift risk.

### When to run this check

Before any PR that touches `backend/app/models/`, `backend/app/routers/`,
`backend/app/auth.py`, or `lib/schemas.js` — scan `CLAUDE.md` and
`.claude/rules/` for "remember to update" / "keep.*in sync" / "also
update". Report findings in the PR description.

---

## Vibe Coding Guardrails (MEH-128)

`.claude/pre-edit-guard.js` (PreToolUse hook) warns (non-blocking) on
edits to central components. Before shipping: follow the 4-step
protocol in
[docs/CENTRAL_COMPONENTS.md](../../docs/CENTRAL_COMPONENTS.md).
Emergency skips must be logged per
[docs/EMERGENCY_OVERRIDE.md](../../docs/EMERGENCY_OVERRIDE.md).

---

## Custom commands

Session lifecycle helpers in `.claude/commands/`, invoked via
`/<name>`:

- `/session-start` — run the Session Start Protocol audit from rule 1
  and report findings.
- `/session-save` — write `session-state.md` (branch, open PR, todos,
  decisions) so the session survives `/clear`.
- `/session-resume` — read back `session-state.md` and restore the
  plan after `/clear`.
- `/retro` — end-of-session behavior retro:
  EXTRACT → CLASSIFY → OUTPUT (`str_replace` blocks) → WAIT →
  EMPTY CASE. Routes findings to `CLAUDE.md` /
  `.claude/rules/workflow.md` / `.claude/rules/rtl.md` /
  `templates/01-07` / DROP. Run after Rule 13's HANDOFF.md update;
  proposes per finding, never applies edits autonomously.
- `/adversarial-review` — FINDER → ADVERSARY → REFEREE review of all
  changed files; required before every merge (rule 5a).

---

## Code execution principles (exec §7–13)

Full body lives in [.claude/rules/code-execution.md](./code-execution.md).
That file is lazy-loaded for code edits (paths:
`**/*.{py,jsx,js,ts,tsx,sh}`); this pointer keeps the cross-reference
from workflow rules.

---

## Bug Protocol (unified)

When a bug is found and fixed:

1. **Identify the root cause** — don't just fix the symptom. Document
   *why* the bug happened.
2. **Grep for siblings (MANDATORY before closing task).**
   `grep -r "[pattern]" . --include="*.py" --include="*.jsx" --include="*.js" --include="*.tsx"`
   and report findings to user before marking done.
3. **Add a regression rule** to this file (workflow.md) if the pattern
   is likely to recur.
4. **Add a test** that would have caught the bug. If no automated test
   is possible → add a manual test case to
   [docs/MANUAL_TESTING.md](../../docs/MANUAL_TESTING.md).
5. **Update docs** if the fix reveals a non-obvious convention (e.g.
   physical `right-3` for LTR password toggles on RTL pages).

Known Bug Patterns (cross-ref before touching):
[docs/BUG_PATTERNS.md](../../docs/BUG_PATTERNS.md).

**Pattern — Free-text input without character-class validation (MEH-555, 10 May 2026):**
Free-text `str` fields feeding admin queues or public displays accept
punctuation-only strings (e.g. "???") unless explicitly validated.
When adding a `String` field visible to admins or users, add a
`field_validator` requiring ≥ 3 letter chars via `[א-תa-zA-Z]` regex.
Count letters AFTER `strip()`, not before. Return the stripped value.
Sibling gaps not yet fixed: `ProducerCreate.name`, `HomeProductCreate.title`,
`ExperienceCreate.title` — track in follow-up tickets.

---

## Commit discipline

- Hotfixes get their own commit — never bundled with a refactor.
- When Claude Code suggests "let's do both together" — say split.
- The temptation to combine is always there. The rule is: no.

_Source: post-mortem PR #304 (MEH-265), 2026-04-24 — `_migrate_columns`
drift broke production login; the hotfix PR bundled a 7-call-site
refactor under pressure._

---

## PR approval guide

**Definition of Done** (every PR, no exceptions): `npm run build` passes;
`pytest tests/test_api.py` passes; `/adversarial-review` passed with all
REFEREE verdicts fixed.

| PR type | Check | Testing? |
|---|---|---|
| docs-only / infra-only | Read the diff | None |
| UI change | Vercel preview on mobile | Yes |
| Backend change | Affected API endpoint | Yes |
| Hotfix | Only the broken thing | Minimal |

Docs-only commits (`HANDOFF.md`, `CHANGELOG.md`, `ROADMAP.md`,
`MANUAL_TESTING.md`): still branch + PR — direct pushes to `staging`
are blocked by the `protect-staging` ruleset. The docs-only twin checks
(MEH-736) satisfy the required gates so no admin override is needed;
merge stays Sapir-only. (See Regression rule 7 above.)

---

## Risk-tiered review frequency

Review frequency depends on risk tier of the task. Default if unsure: **ask
Smadar before starting**. Never silently downgrade to low-risk.

### HIGH-RISK — chunk-by-chunk review required

- Auth changes (login, OAuth, JWT, refresh tokens, password)
- Schema changes (Alembic migrations, model edits, DB column work)
- Central components (`MapClient`, `ProducerDetail`, `main.py` — see
  [`.claude/central-components.json`](../central-components.json))
- Security-sensitive code (XSS, CSRF, rate limit, secret handling, headers)
- Production-deploy-blocking changes (env vars, Dockerfile, Railway config)

Pattern: numbered plan first, **wait for `go`**, execute one chunk, wait for
`go <chunk>` between chunks. MEH-326 (auth refactor) is the canonical
example — chunked review caught regressions via Skeptic Mode.

### LOW-RISK — end-to-end with single review

- Single-file dependency upgrades (e.g. MEH-429 `psycopg2-binary` pin bump)
- Copy/text changes (Hebrew strings, button labels, microcopy)
- i18n sweeps (hardcoded → `t()` calls)
- Doc-only edits (CHANGELOG, HANDOFF, rule files (`.claude/rules/*.md`))
- Test additions (no production code change)

Pattern: numbered plan first, **wait for `go`**, then execute fully without
mid-flight checkpoints. At end: write a summary to
[`docs/session-state.md`](../../docs/session-state.md) (files changed, test
result, diff stat, blockers, what to verify). Smadar reads the summary, not
turn-by-turn output.

### DEFAULT — ask if unsure

If the task doesn't clearly fit a tier, ask Smadar before starting.
See [ADR-016](../../docs/decisions/ADR-016-risk-tier-nomenclature.md) for current GREEN/YELLOW/RED tier definitions.

_Source: MEH-450 (2026-05-04). Evidence: MEH-326 auth refactor (chunked
review justified), MEH-331/348 email transport — chunked review caught
Content-Transfer-Encoding regression, MEH-429 psycopg2 (chunked review
created unnecessary friction on a 1-line pin change). Mobile workflow
friction amplifies the cost of unjustified checkpoints._

---

## /ultrareview gate

לפני merge ל-staging, אם ה-PR עומד ב-2+ מהתנאים האלה — הריצי `/ultrareview` ב-Claude Code:

- 500+ שורות שינוי
- נוגע ב-auth / payments / DB schema migration
- refactor של מודל מרכזי (`main.py`, `MapClient.jsx`, `ProducerDetail.jsx`, `models.py`)

הפעלה ידנית בלבד דרך Claude Code CLI:

1. `git stash` או commit לפני (Branch mode bundles working tree at confirm time)
2. `/ultrareview` (לבדיקת branch מול default) או `/ultrareview <PR-number>` (PR mode)
3. ממתינות 5–20 דקות
4. בודקות ממצאים, מתקנות, batching לפני re-run
5. `/tasks` למעקב

**אסור:** להשתמש על PRs טריוויאליים (copy fix, single-line bug, CSS only) — בזבוז ריצה.

_Source: Claude Code v2.1.86+ (Opus 4.7 launch, 2026-04-16). 3 free runs expire 2026-05-05._

---

## PR Review Workflow

When asked to generate a PR review bundle for Claude.ai, run:

  git diff staging [changed-code-files]
  git diff staging docs/CHANGELOG.md
  git diff staging HANDOFF.md

Paste all output in one message with clear section headers:
  === DIFF: [filename] ===

This is the standard handoff to Claude.ai for code review.
GitHub MCP is not available in the Claude.ai web interface.

### Specialized adversarial-review variants (MEH-428)

The base `/adversarial-review` is the general fallback. Four specialized
variants narrow FINDER to documented incident families (per ADR-005). Pick
the variant matching the diff; use the base when the class is unknown:

- `/adversarial-review-types` — diff touches `backend/app/models/`,
  `backend/app/schemas/`, `frontend/lib/schemas.js`, or
  `backend/alembic/versions/` (MEH-283/321 schema-drift family).
- `/adversarial-review-errors` — diff touches `backend/app/services/`,
  `backend/app/routers/`, background tasks, or any `try:`/`except:` in
  side-effect code (MEH-325 silent-except family).
- `/adversarial-review-coverage` — diff extracts a helper, edits a
  central component, adds an API endpoint, or adds a React component
  (PR #43 bare-identifier family).
- `/adversarial-review-size` — diff touches any file in
  `.claude/central-components.json` (MEH-407 god-files family).

Multiple variants may apply to one PR — run each that fits. ADR-005
records the local-extension-vs-plugin decision.

---

## /loop — usage patterns

`/loop` runs prompts on a cron interval. Each iteration = full Claude
Code session = quota usage. Use on-demand, never always-on.

**Approved patterns:**
- Deploy babysit: `/loop check Railway /health, stop after 3x 200 OK`
- PR CI watch: `/loop 5m check gh pr checks <PR>` — Esc when green
- One-shot poll: `/loop 10m check if migration finished`

**Forbidden:**
- Always-on monitors (production observability → use Sentry/Vercel
  instead)
- `/loop` with no exit condition
- 5+ concurrent loops in same session

Tasks auto-expire after 7 days.

---

22. **Copy approval gate before Linear issue creation (MEH-579 lesson, May 14 2026).**
    Before creating a Linear issue that contains user-facing copy — FAQ
    pages, marketing copy, page text, error messages, form labels, email
    templates — the copy MUST be approved verbatim by Smadar in
    conversation first. Workflow:
    1. Draft the copy in chat (or upload reference document)
    2. Get explicit approval on each string ("approved", "go", "כן")
    3. ONLY THEN open the Linear issue with the locked copy in the description

    Anti-pattern: opening an issue with copy that "looks reasonable" and
    sending to Claude Code without approval. Result: PR ships, copy is
    wrong, follow-up fix issue needed (MEH-571 → MEH-579 cascade —
    documented case where unapproved FAQ copy required full rewrite).

    The rule `Description = source of truth` (rule 4) requires the
    description to be correct from the start, not after a feedback loop.

23. **`/goal` merge gate for UI work (MEH-571 + MEH-579 lessons, May 14 2026).**
    `/goal` strings touching frontend files MUST stop at **Draft PR opened
    + preview URL posted**, NOT at **PR merged**.

    Reason: the `Closes MEH-XX` annotation in PR body triggers auto-merge
    of the Linear issue to Done on PR merge. Any "Smadar confirms mobile
    QA" condition in the `/goal` string races against this auto-merge,
    and the auto-merge wins because it's mechanical and immediate.

    The flow that works:
    1. `/goal` ends at: "Draft PR opened + preview URL posted to Linear comment"
    2. Smadar opens preview URL on mobile, runs QA
    3. Smadar comments on Linear: "mobile QA ✅"
    4. Smadar (or separate Claude Code prompt) marks PR ready-for-review and merges
    5. `Closes MEH-XX` then correctly closes Linear after human approval

    Applies to: any `/goal` touching `frontend/app/**`, `frontend/components/**`,
    `frontend/pages/**`, or any other UI-visible code.

    Does NOT apply to: backend-only, docs-only, tests-only, CI-only — those
    can merge on green CI without human QA.

    Anti-pattern: `/goal` ends with "PR merged" + any human-confirmation
    condition. The conditions race, merge wins, QA is bypassed.

24. **Scope-creep prevention for copy changes (MEH-579 lesson).**
    When the prompt scope is "replace Q&A content", Claude Code MUST
    NOT modify page headings, subtitles, taglines, or any text element
    not explicitly named in `<acceptance_criteria>`. If a heading change
    seems "obviously needed" — STOP and ask before touching it.
    MEH-579 PR #639 silently changed the page heading from
    "שאלות נפוצות לבעלות עסק" to "8 שאלות לפני שמצטרפות" and added
    an unauthorized subtitle. Both required a follow-up PR to revert.
    Discovery step (grep before edit) is now mandatory for any copy
    fix that mentions specific text positions.

25. **Pre-push staging sync (MEH-585, 15 May 2026).**
    Before every `git push -u origin <feature-branch>`, sync the branch
    against the current tip of `staging` to absorb any append-only log
    edits (CHANGELOG.md, HANDOFF.md) that landed during the work window.
    Prevention layer — pairs with the `resolve-conflicts` skill
    (recovery). Rule 1's session-start fetch covers boot; this covers
    the moment between feature work completion and `push`.

    Canonical command sequence:

    ```bash
    git fetch origin
    git merge origin/staging   # produces a merge commit OR fast-forwards
    # resolve conflicts via .claude/skills/resolve-conflicts/ if non-trivial
    git push -u origin <feature-branch>
    ```

    CHANGELOG.md + HANDOFF.md follow **Accept-Both** (Haacked rule for
    append-only logs) — both entries land in chronological order, no
    information lost. The resolve-conflicts skill encodes this.

    `git rebase origin/staging` is acceptable but **merge is the default**
    — preserves the original feature SHAs for adversarial review and the
    merge commit makes the sync point explicit in `git log`. Never force-push.

    _Source: 2026-05-15 night batch — PR #662 (MEH-222) hit an avoidable
    CHANGELOG/HANDOFF conflict because PR #661 (MEH-464) and PR #660
    (MEH-481) merged between branch creation and push. Three merges in a
    one-hour window made the 4th branch stale. Forward-only convention;
    no retrofit of open feature branches._

26. **Verify PR scope before migration or close-without-merge.** A PR
    title containing "docs", "HANDOFF", or "session" does NOT mean the
    diff is docs-only. Before approving migration to staging or
    close-without-merge:
    a. Run `gh pr view #N --json files` to list every changed file
    b. If file count > 1 OR any file is outside `*.md` / `docs/` paths,
       treat as code/config change requiring full scope-match
    c. Surface every non-docs file explicitly to the human before
       proceeding — never silent abandonment
    (Root cause: 2026-04-30 PR #343 triage — would have abandoned Rule
    21, .gitignore *.db, and 2 Playwright fixes if not caught.)

27. **Search Linear before opening any new issue.** Before calling
    save_issue with no `id` (i.e., creating new), run list_issues with
    a query covering the proposed title's content nouns + 1-2
    synonyms. For every result in Backlog/In Progress, scope-match:
    a. If existing issue covers the same scope → recommend extending
       its description instead of opening new
    b. If existing issue partially overlaps → surface to human, ask:
       fold / sibling / open as new
    c. Never open silently when an overlap exists in active states
    Skip duplicate-check only when the human explicitly says "skip
    duplicate-check" or "open as sibling — I already verified".
    (Root cause: 2026-05-01 session opened MEH-428/430 without check.
    Self-audit on 3 follow-up proposals found MEH-310/384/215 as
    pre-existing overlaps for all 3 — backlog inflation prevented
    only by retroactive search. See also: MEH-307 same pattern.)

    _Source: MEH-405. Specced (2026-04-30) as Rules 22 + 23 — back then
    Rule 21 was the tail of the list. Rules 22–25 (MEH-579 ×3, MEH-585)
    landed in the interim, so these slot at 26 + 27 to preserve sequential
    numbering with no gaps and no collision. Rule bodies are verbatim from
    the MEH-405 spec; only the leading numbers changed._
