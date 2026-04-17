---
description: Write session-state.md so the session survives /clear or /compact.
---

Write `session-state.md` at the repo root with the current session's load-bearing state, so the next session (after `/clear` or `/compact`) can resume without losing the plan. This is the save-half of the context reset protocol (CLAUDE.md rule 13).

Gather the following and write it to `session-state.md`:

1. **Current branch** — `git branch --show-current`
2. **Open PR for this branch (if any)** — branch URL, PR number, title, `mergeable_state`, any outstanding review comments. Use `mcp__github__list_pull_requests` filtered by head branch.
3. **Active todos** — dump the current TodoWrite list verbatim (content + status for each item). Mark the in-progress one clearly.
4. **Decisions made this session** — 3–5 bullets covering architectural choices, rejected alternatives, and any new conventions. These are the items that would be lost if `/compact` auto-summarizes.
5. **Blockers / awaiting-user** — anything you're waiting on (review approval, Linear issue body, network access, credentials).
6. **Next concrete action** — one sentence describing what `/session-resume` should pick up first.

Format as markdown with these exact section headers (so `/session-resume` can parse them predictably):

```markdown
# Session state — <ISO date>

## Branch
<branch name>

## Open PR
<PR URL + number + state, or "none">

## Todos
- [status] content
- ...

## Decisions
- ...

## Blockers
- ...

## Next action
<one sentence>
```

After writing the file, print a one-line confirmation to the user: *"Session state saved to `session-state.md` — safe to `/clear` now."* Do **not** add `session-state.md` to git; it's a local scratchpad.
