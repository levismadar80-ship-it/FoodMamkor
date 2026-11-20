# Media archive — screenshots that left the repo (MEH-3534)

On 20/11/2026 every image and video under the folders below was removed from
the tip of `staging`. Nothing was deleted from history: each file is still in
git at the **archive commit**, and every Markdown link to one now points there.

**Archive commit:** `629eb3c6827171564fb9c6a2c9c83cd0cb043067`
(staging tip when MEH-3534 was cut; on `origin/staging`, so it is never
garbage-collected).

| Folder | Files | Size |
|---|---:|---:|
| `qa-artifacts/` | 3,620 | 130.4 MB |
| `docs/audits/` | 113 | 55.9 MB |
| `docs/design-audit/` | 24 | 24.0 MB |
| `frontend/qa-artifacts/` | 722 | 20.3 MB |
| `tests/screenshots/` | 28 | 11.8 MB |
| **Total** | **4,507** | **242.4 MB** |

Text evidence in those folders (`.md`, `.json`, `.log`, `.txt`, `.html`,
scripts) was kept.

## Getting a file back

Open it in the browser:

```
https://github.com/levismadar80-ship-it/FoodMamkor/blob/629eb3c6827171564fb9c6a2c9c83cd0cb043067/<path>
```

Or restore it locally, without committing it:

```bash
git show 629eb3c6827171564fb9c6a2c9c83cd0cb043067:qa-artifacts/MEH-1143/home-events-375.png > /tmp/home-events-375.png
```

A whole folder: `git archive 629eb3c68 qa-artifacts/MEH-1143 | tar -x -C /tmp`.
Needs full history (`git rev-parse --is-shallow-repository` → `false`; if not,
`git fetch --unshallow origin`).

## What this did and did not change

- **Did:** the checked-out tree is 242 MB smaller, so every CI checkout, Vercel
  build and fresh clone of the tip downloads that much less. New screenshots
  can no longer be committed: `scripts/checks/heavy-media-guard.sh` (Repo
  guards) fails on an image or video outside `frontend/public/`,
  `frontend/e2e/visual/` (VRT baselines), `design-reference/`, `logo/` and
  `docs/research/screenshots/2026-05/`, and `.gitignore` stops an accidental
  `git add` first.
- **Did not:** shrink `.git`. The old blobs stay in history, because removing
  them means rewriting history and force-pushing, which the repo rules forbid.
  A full clone is still ~950 MB of pack; it stops growing from screenshots.
  If a smaller full clone is ever needed, that is a separate, Sapir-only
  decision (`git filter-repo` + force-push + every clone re-cloned).

## Where screenshots go now

QA evidence for a PR (the 375 + 1440 captures of rule 23, the preview
captures of rule 38) goes to the PR's evidence folder and the PR body links it
with a `Screenshots: <https link>` line. `pr-evidence-guard.sh` checks that
line. Details: [.claude/rules/testing.md](../.claude/rules/testing.md)
«QA screenshots live outside the repo».

`docs/audits/**` and `docs/design-audit/**` reports work the same way: the
report stays in git, its images go to the evidence folder and the report links
them.
