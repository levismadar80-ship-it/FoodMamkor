---
name: resolve-conflicts
description: Resolve merge conflicts per Mehamakor categorization rules. Use when reconciling a feature branch with origin/staging produces CONFLICT markers. Categorizes each conflict file by path and applies a deterministic rule; STOPS on business-logic conflicts that require human judgment.
---

# resolve-conflicts

Apply when `git merge origin/staging` (or any branch merge) leaves `UU` files in `git status`. Each conflicted file maps to one of six categories. Follow the rule for the category; do not improvise.

## Categorization rules

| Path / pattern | Rule | Why |
|---|---|---|
| `docs/CHANGELOG.md` | **Accept Both** — keep both halves, in chronological order (newer entry first) | Append-only session log; both sides legitimately added entries |
| `docs/HANDOFF.md` | **Accept Both** — keep both halves | Append-only handoff log |
| `tests/test_api.py`, `tests/test_*.py` | **Accept Both** — keep both halves | Tests are additive; both sets belong |
| `.pre-commit-config.yaml` | **Accept Incoming** (`--theirs` against `origin/staging`) | Staging is source of truth for tooling config; if your branch made the same fix, staging's version already incorporates it |
| `frontend/lib/use-home-page.js` and other branch-specific business code your PR rewrites | **Keep Mine** — your branch fix is the intent | Whole-file rewrites cannot be auto-merged; your branch is the authoritative version |
| `package-lock.json` / `frontend/package-lock.json` | **Accept Incoming** then `cd frontend && npm install` to regenerate | Lockfile drift is mechanical; regenerate against branch's package.json |
| Any other code conflict (router, model, service, component, lib) | **STOP** — report to user with `file:line` evidence | Business logic conflicts need human judgment |

## STOP conditions (abort merge, report to user)

- Conflict in `backend/app/routers/**`, `backend/app/services/**`, `backend/app/schemas/**`, `backend/app/models/**`, or `backend/app/auth.py`
- Conflict in `frontend/components/**`, `frontend/app/**` (excluding `[locale]/about/AboutClient.jsx`-style copy-only files)
- Conflict in any Alembic migration (`backend/alembic/versions/**`)
- More than 3 files conflict on the same branch — suggest the user `git rebase -i` instead (smaller, sequential conflicts are easier to reason about)
- pytest fails after resolution
- `npm run lint` fails after resolution on a frontend file you touched

When stopping: `git merge --abort`, then summarize each conflict as
`<path>:<line-range> — <staging-side intent> vs <branch-side intent>`.

## Per-branch workflow

```bash
git fetch origin staging
git checkout <branch>
git merge origin/staging
# inspect: git status --short | grep "^UU"
# for each UU file:
#   - look up category in table above
#   - apply rule
# verify clean:
grep -rn "^<<<<<<<\|^=======\|^>>>>>>>" .  # must return zero
git status --short | grep "^UU"             # must return zero
# run gates if relevant files touched:
[ touched tests/ ] && uv run pytest tests/test_api.py
[ touched frontend/ ] && cd frontend && npm run lint && cd ..
git add <resolved files>
git commit -m "chore: merge staging into <branch> — resolved <category> conflicts in <files>"
git push origin <branch>
```

## Verification before commit

1. `grep -rn "^<<<<<<<\|^=======\|^>>>>>>>" .` returns nothing
2. `git status --short | grep "^UU\|^AA\|^DD"` returns nothing
3. If `tests/` touched: `uv run pytest tests/test_api.py` green
4. If `frontend/` touched: `cd frontend && npm run lint --quiet`
5. Commit message names the **categories** resolved (CHANGELOG, tests, lockfile), not just the file count

## Anti-patterns

- ❌ Silently picking one side without identifying the category
- ❌ Resolving a `routers/` or `models/` conflict without asking
- ❌ Skipping the verification grep after resolution (conflict markers leak into commits)
- ❌ Bundling unrelated cleanup into a merge commit
- ❌ Force-pushing after a conflict resolution — preserve history; `git push` only

## Harness-specific path (when local `git push` is blocked)

If the harness git proxy returns 403 for non-`claude/*` branches:

1. After local merge + commit, create a `claude/merge-<ticket>-into-<PR#>` branch
2. Push the merge commit there: `git push -u origin claude/merge-<ticket>-into-<PR#>`
3. Open a fast-forward PR via GitHub MCP: head=`claude/...`, base=`<feature-branch>`
4. Merge that PR with method=`merge` (preserves the merge commit)
5. The original PR (`<feature-branch>` → `staging`) becomes mergeable

This pattern was used for PRs #584/#585/#586/#587 on 2026-05-10 to fast-forward four feature branches that had `docs/CHANGELOG.md` conflicts after `#579` landed.

## Source

Codified after the 2026-05-10 batch of 6 conflicting PRs (#577, #578, #580, #581 plus the prerequisite #575, #579). Cross-ref: `.claude/rules/workflow.md` (workflow rule 18 — one branch per feature) and `.claude/rules/file-preservation.md` (str_replace, diff verification).
