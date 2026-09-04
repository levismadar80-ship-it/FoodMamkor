# MEH-2184 — the qa-artifacts size cap is blind to the directory the test suite writes into

> **`.github/workflows/**` is CC-deny (MEH-671). This file is the diff for Sapir to apply.
> CC did not edit the workflow, and the one attempt to simulate the fix in the working
> tree was refused by the hook — correctly, and not routed around (rule 32).**

## The defect in one line

`pr-checks.yml:119` selects files with a **root-only** pathspec:

```bash
done < <(git diff --name-only --diff-filter=AM "$BASE_SHA" "$HEAD_SHA" -- qa-artifacts/)
```

A git pathspec without a glob is anchored at the repo root, so `qa-artifacts/` matches
`qa-artifacts/**` and **nothing else**. `frontend/qa-artifacts/**` is invisible to it.

## Why this is not "a PR could evade the cap"

It is where the suite writes **by default**.

`e2e.yml` runs Playwright with `working-directory: frontend`. A spec that writes a
relative path therefore lands under `frontend/`. This is not hypothetical —
`frontend/e2e/flows/28-register-success-state.spec.ts:265` writes:

```js
await page.screenshot({ path: `qa-artifacts/MEH-2138f/success-${c.w}-${c.motion}.png` });
```

and the resulting directory exists at `frontend/qa-artifacts/MEH-2138f/`, **not** at
`qa-artifacts/MEH-2138f/`. The cap's blind half is the default output location of the
thing the cap exists to measure.

## Measured, not asserted

Every number below is `git ls-files` on `origin/staging`:

| pathspec | files matched | of those, under `frontend/` |
|---|---|---|
| `qa-artifacts/` *(what the gate uses today)* | 1620 | **0** |
| `frontend/qa-artifacts/` | 495 | 495 |
| `:(glob)**/qa-artifacts/**` *(proposed)* | **2115** | 495 |
| `qa-artifacts/` + `*/qa-artifacts/*` *(equivalent)* | 2115 | 495 |

`1620 + 495 = 2115` — the proposed form is exactly the union, with no double count.

- **Directories:** 276 under root + **96** under `frontend/` = 372. The gate sees 74.2%.
- **Bytes already committed in the blind half: 14,806,301 (≈14.8 MB)** — against a
  **2 MB per-PR** cap.

## The diff

```diff
--- a/.github/workflows/pr-checks.yml
+++ b/.github/workflows/pr-checks.yml
@@ -116,7 +116,11 @@
             sz=$(git cat-file -s "$HEAD_SHA:$f" 2>/dev/null || echo 0)
             total=$((total + sz))
-          done < <(git diff --name-only --diff-filter=AM "$BASE_SHA" "$HEAD_SHA" -- qa-artifacts/)
+          # MEH-2184: a bare `qa-artifacts/` pathspec is anchored at the repo root, so
+          # it never matched frontend/qa-artifacts/ — which is where Playwright writes,
+          # because e2e.yml runs it with working-directory: frontend. Measured on
+          # staging: 495 tracked files / 14.8 MB were invisible to a 2 MB cap.
+          # `:(glob)` makes the leading `**/` match at any depth, root included.
+          done < <(git diff --name-only --diff-filter=AM "$BASE_SHA" "$HEAD_SHA" \
+                     -- ':(glob)**/qa-artifacts/**')
```

`:(glob)` is required. Without it git treats `**` as a normal wildcard that does not
cross directory separators, and the leading `**/`-matches-at-any-depth behaviour is a
`:(glob)` magic-pathspec property (gitglossary). If the magic prefix is unwanted inside
YAML, the two-pathspec form `-- qa-artifacts/ '*/qa-artifacts/*'` measures identically
(2115) and is a drop-in substitute.

## How to know it worked — and how to know it did NOT

**Do not read a green cap as proof.** A green is this gate's normal output and was green
throughout the entire period it was blind — that is the whole defect. The discriminating
check is a count, run once after applying:

```bash
git ls-files -- ':(glob)**/qa-artifacts/**' | grep -c '^frontend/'    # expect 495, not 0
```

**A 0 means the pathspec did not take** and the gate is still blind while reporting
success — the same failure with a new spelling.

## The consequence to expect, stated up front

The first PR that touches `frontend/qa-artifacts/` after this lands will be **measured
for the first time**, and may red a check that has always been green for it. That is the
gate starting to work, not a regression. The 14.8 MB already committed is **not**
re-measured: the cap reads `git diff --diff-filter=AM BASE HEAD`, so only files a given
PR adds or modifies count.

## Not in this patch

The three uncompressed `page.screenshot(...png)` calls in
`28-register-success-state.spec.ts` (`:161`, `:176`, `:265`) are **MEH-2239** and are
deliberately left alone — see that card's note in the drain log. They are three calls
across two directories and no spec in the repo compresses today, so it is a pattern
change, not the one-line fix it was described as.
