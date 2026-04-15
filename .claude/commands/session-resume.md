---
description: Read session-state.md and restore the plan after /clear.
---

Read `session-state.md` from the repo root and restore the prior session's plan. This is the resume-half of the context reset protocol (CLAUDE.md rule 13), paired with `/session-save`.

Steps:

1. **Read `session-state.md`.** If the file doesn't exist, tell the user no saved state was found and ask whether to run `/session-start` instead.
2. **Verify the branch** — run `git branch --show-current` and confirm it matches the "Branch" section of the state file. If not, `git checkout <saved-branch>` (after checking the user is OK with the switch).
3. **Re-hydrate the todo list** — copy the `## Todos` section into TodoWrite verbatim, preserving statuses. The previously in-progress item stays in-progress.
4. **Re-check the open PR** — if the state file lists a PR, fetch its current state via `mcp__github__pull_request_read` to catch any review comments, CI failures, or merge-state changes that happened while context was reset.
5. **Report to the user** in 3–5 lines: branch, PR state, in-progress todo, next concrete action (from the state file). End with: *"resuming from `<next action>` — confirm or redirect."*
6. **Wait for user confirmation** before executing the next action — the task may have shifted in the meantime.

Do not delete `session-state.md` after reading — leave it for follow-up `/session-save` calls to overwrite.
