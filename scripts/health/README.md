# scripts/health — the weekly repo health scan (MEH-3615)

Checks that look at **age, dates and dead code**. They run once a week, not on
every PR: a calendar date or a folder's age must never warn on a PR that did
not cause it. The per-PR guards live in [`scripts/checks/`](../checks/README.md).

**Who runs it:** a scheduled Claude Code task, «בדיקת בריאות שבועית לריפו»,
Thursdays 09:00 Israel time. It runs `bash scripts/health/weekly-repo-health.sh`
on a fresh `origin/staging`, opens one Linear card per **new** finding (after a
duplicate search) and sends Sapir a short Hebrew report. It never deletes a
file and never opens a PR: a person decides every delete.

| Script | Finds | Self-test |
|---|---|---|
| [`orphan-folder-scan.sh`](./orphan-folder-scan.sh) | a folder nothing live points at, untouched 60 days | anchored to `3a5c2a3e3`, which still held `design-reference/` and `frontend/e2e/_qa-archive/` |
| [`recheck-date-scan.sh`](./recheck-date-scan.sh) | a folder whose README's `Re-check: MM/YYYY` has come | fixtures in `testdata/` |
| [`weekly-repo-health.sh`](./weekly-repo-health.sh) | runs the two above, `vulture` (Python, ≥ 80% confidence, new vs [`vulture-baseline.txt`](./vulture-baseline.txt)), the knip baseline totals, the expiry checks and the WARN lines of `run-all.sh` | each section runs its self-test first; a dead section prints ERROR |

## A folder that is kept "for now"

Give its `README.md` one line:

```
Re-check: 03/2027
```

From that month the weekly scan asks whether it is still needed. To keep it,
move the date; to drop it, delete the folder (it stays in git history).

## A folder the orphan scan lists by mistake

Add it to [`orphan-folder-allow.txt`](./orphan-folder-allow.txt) with the reason
a reviewer can check: usually "read only by a guard in `scripts/checks/`" or
"used through a computed path".
