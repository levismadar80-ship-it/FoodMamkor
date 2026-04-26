# Full workflow rules

All 20 workflow rules, regression prevention, custom commands, and
execution principles (exec §7–13). Preserved verbatim from the
pre-refactor CLAUDE.md — the main `CLAUDE.md` only carries the top-10
summary + pointer here.

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
14. **Context reset protocol.** When context usage hits **≥60%** or at
    a natural task boundary (PR merged, feature shipped): run
    `/session-save` to write `session-state.md` (current branch, open
    PR URL, todos, active decisions), then `/clear`, then
    `/session-resume` on next turn. Auto-compact is a last resort — it
    silently drops plan details. Pair with rule 7's 40% `/compact`
    trigger: below 40% keep working, 40–60% `/compact`, ≥60% save +
    `/clear`.
15. **Prompt compression (Caveman style).** Specs → keywords + values
    only, no filler words. Reasoning / context → full sentences ok.
    Apply to all future prompts in this repo.
    - Good: `Thumb RIGHT 88px (72px <1180). Cloudinary. Placeholder #EAF3DE.`
    - Bad: `The thumbnail should be positioned on the right side at 88 pixels wide.`
    - Good: `Trust strip MAX 2. if verified → ✓+rating. if not → rating only. Skip response_time.`
    - Bad: `The trust strip should show a maximum of two items. If the producer is verified, show the checkmark and rating.`
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
7. **Docs-only files → direct commit to staging, no PR.**
   `HANDOFF.md` / `CHANGELOG.md` / `ROADMAP.md` / `MANUAL_TESTING.md`
   do not need a PR.

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
- `/adversarial-review` — FINDER → ADVERSARY → REFEREE review of all
  changed files; required before every merge (rule 5a).

---

## עקרונות ביצוע (exec §7–13) — Cursor · Devin · V0 · Manus · Windsurf (2026)

> Workflow rules 1–20 cover primarily *structure*. These cover
> *execution*. When referencing by number, use "exec §N" to avoid
> collision with workflow rule N.

7. **Lazy Edit (Cursor)** — changed lines + `// ... existing code ...`
   markers only. Never return a full file.
8. **Atomic Edits (Cursor)** — 3 changes in one file = 1 edit call,
   not 3. All-or-nothing.
9. **Skeptic Mode (Devin)** — "Haven't verified X" > "X probably
   works". Declare uncertainty explicitly.
10. **File:Line Evidence (Devin)** — every code claim needs
    `file:line`. No citation = guess, not fact.
11. **Numbered Plan First (Manus)** — numbered steps before any code,
    even "small" tasks. Wait for `go`.
12. **Narrated Actions (Windsurf)** — one-line per action:
    "Reading X… Found Y… Fixing Z…" No black-box turns.
13. **Real Imports Only (V0)** — verify file exists before writing
    `import`. Never import imaginary modules.

### Execution order per task

- **Before:** read CLAUDE.md + HANDOFF → numbered plan → grep siblings
  → wait for `go`
- **During:** lazy edit (1 call / file / turn) → narrate each action →
  real imports only
- **After:** file:line evidence per claim → build + tests → preview
  URL → HANDOFF update
