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

Files that landed on staging while this PR was open, removed in the same PR
and kept at the staging tip it merged in, `df052ed1dd41b11ec3de68d74b78e02de7f7c77d`:
`qa-artifacts/MEH-3524/` (4 WebP captures).

And 37 more that landed overnight 20→21/11 (`qa-artifacts/` MEH-2233, 2952,
3194, 3511, 3524, 3525, 3528), kept at `a8c69fe08ba8deb610318eaf053394c5d95de64d`.

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
  `frontend/e2e/visual/` (VRT baselines), `logo/` and
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

## Old files deleted on 21/11/2026 (MEH-3614)

Sapir's call: files nothing reads any more were taken out of the tree. They
are still in git at commit **`3a5c2a3e3`** (the `origin/staging` tip the
branch was cut from), so `git show 3a5c2a3e3:<path>` or
`git checkout 3a5c2a3e3 -- <path>` brings any of them back.

| Path | Files | What it was |
|---|---:|---|
| `design-reference/` | 551 | Claude Design export of 03/07/2026 (MEH-991): page frames, DS bundle, dashboard and join mocks. No code, build or test read it. |
| `frontend/e2e/_qa-archive/` | 188 | One-off `qa-meh<N>-*.mjs` probes, archived by MEH-3531. No runner ran them. |
| `frontend/qa-*.mjs`, `frontend/_qa-shot.mjs` | 31 | Probes of the same kind left at the `frontend/` root. |

Code comments that cited one of these probes now say
`[deleted probe, docs/media-archive.md]`. Dated reports under `docs/audits/`,
`docs/overnight/` and `qa-artifacts/` still name them as they were; they are
records of their day and were not rewritten.
