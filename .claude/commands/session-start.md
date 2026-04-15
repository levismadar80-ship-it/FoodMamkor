---
description: Run the mandatory Session Start Protocol audit from CLAUDE.md rule 1.
---

Run the **Session Start Protocol** from `CLAUDE.md` rule 1 before doing any other work. This audit is MANDATORY at the beginning of every session — it prevents duplicate PRs, stale branches, and lost work across sessions.

Execute these steps in order:

1. **Read the core docs** — `CLAUDE.md` (this file) plus [docs/DESIGN.md](../../docs/DESIGN.md) if the upcoming work is UI, or [docs/DATA.md](../../docs/DATA.md) if it's backend. Don't guess which — ask the user if the task domain is ambiguous.
2. **Fetch + list remote feature branches:**
   ```bash
   git fetch --prune origin
   git branch -r | grep -v 'HEAD\|main\|staging'
   ```
3. **List open PRs** via the GitHub MCP (`mcp__github__list_pull_requests` with `state: "open"`). Note their branch, title, and `mergeable_state`.
4. **Check if `staging` drifted from `main`:**
   ```bash
   git log --oneline origin/staging..origin/main
   git log --oneline origin/main..origin/staging
   ```
5. **Single-session check** — scan the branch list for evidence of a parallel session: `claude/*` prefixed branches, branches with timestamps within the last hour that you didn't create, or conflicting work in flight. If any: **stop and report to the user before proceeding** (per the Single Session Rule). Parallel sessions caused PRs #71/#72/#77 to be re-applied.
6. **Report findings to the user** in a concise summary: open PRs + their state, feature branches that look stale or continuable, any drift between staging and main, any parallel-session red flags. Then ask: *"continue an open PR, or start fresh?"*

Do **not** start any task work until the user has responded to the summary. Never skip this audit even if the user jumps straight to a task description.
