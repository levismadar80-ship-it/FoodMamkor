# Staged patch — give release PRs E2E coverage (`e2e.yml`)

> **Staged, not applied.** `.github/workflows/**` is CC-deny (MEH-671), same as the 19
> other documents here. **This file changes nothing on its own.**
>
> Ticket: **MEH-1932** (Urgent, launch-blocking).

---

## The defect, in three lines

```yaml
# .github/workflows/e2e.yml:36-38
on:
  pull_request:
    branches: [staging]
```

`branches:` on a `pull_request` trigger filters by **base**. A release PR has `base: main`.
GitHub therefore **never creates an e2e.yml `pull_request` run for a release** — it is not
"skipped", it was never eligible.

**Every release merged to production has done so with zero E2E, and nothing announced it.**

## Measured, 2026-08-07

**`e2e.yml` is the only gated workflow that excludes `main`:**

| workflow | `pull_request.branches` |
|---|---|
| `pr-checks.yml` | `['staging', 'main']` |
| `deploy.yml` | `['main', 'staging']` |
| `skills-audit.yml` | `['staging', 'main']` |
| `dependency-audit.yml` | `['staging', 'main']` |
| `i18n-icu-parity.yml` | `['staging', 'main']` |
| **`e2e.yml`** | **`['staging']`** ← the outlier |

Every sibling was updated to cover `main`. This one was not. **Option A below is therefore
not a new policy — it is bringing the last workflow into line with the others.**

**Release #1 (PR #1807) is in the affected set:** `base.ref = "main"`, head `staging @ 9bc32157`,
merged `2026-07-23T07:56:20Z`, 621 commits / 2,047 files. Its post-deploy verification only
closed on 06/08 — it ran in production for two weeks and was signed off, having never had a
single E2E run.

## Feasibility — verified before recommending anything

Two things had to be true for the cheap fix to actually work, and both are:

1. **No preview dependency.** MEH-1044 moved the suite onto a **local `next start`**
   (`e2e.yml:160`, `PLAYWRIGHT_BASE_URL: http://localhost:3000` at `:224`). It does **not**
   need a Vercel preview, so a `base: main` PR can run it with no deployment. This is the
   fact that makes A viable at all — before MEH-1044 it would not have been.
2. **The paths filter will not then skip it.** The filter is `frontend/**`, `public/**`,
   `package.json`, `package-lock.json` (`e2e.yml:74-78`). A release diff is ~1,400 files and
   necessarily includes `frontend/**`, so it matches. Adding the branch is *sufficient* —
   there is no second gate silently waiting behind it.

**One thing to watch, not a blocker:** the concurrency group is
`e2e-${{ github.head_ref || github.run_id }}` with `cancel-in-progress: true` (`:56-58`). A
release PR's `head_ref` is `staging`, so it occupies group `e2e-staging`. Push-events on
staging fall through to `run_id` (unique) and do not collide. The only self-collision is a
second push to the release PR cancelling the first, which is correct behaviour.

---

## Option A — add `main` to `pull_request.branches` ✅ recommended

```diff
 on:
   pull_request:
-    branches: [staging]
+    branches: [staging, main]
   push:
     branches: [staging]
```

**One line.**

**For:**
- **The release is verified by exactly the suite that gated every commit inside it.** No new
  surface, no second definition of "passing", nothing to keep in sync.
- Brings `e2e.yml` in line with all five siblings; removes an outlier rather than adding a
  special case.
- **The path is continuously exercised.** It runs on every PR today, so it is known-good,
  its flakes are understood, and it cannot rot between releases.
- Cost is **~4.5 minutes, once per release cut.**

**Against:**
- The release suite is then identical to the PR suite — you do not get *extra* scrutiny at
  the moment the risk is highest.
- The `staging` push trigger still exists alongside it, so a release cut will produce two
  E2E runs on the same SHA (one from the PR, one from the last staging push). Harmless, but
  it doubles the log surface for that SHA.

## Option B — a release-scoped job running a different suite

Add a separate job (or workflow) keyed on `base == 'main'`, running a *broader* suite —
e.g. WebKit promoted from shadow to blocking, or added mobile projects, or a longer
smoke against the deployed staging URL.

**For:**
- A release is a different risk profile from a PR. There is a real argument that it deserves
  **more** coverage, not the same — this is the last gate before real users.
- Lets the release check things a per-PR suite cannot afford, e.g. cross-browser or
  full-catalogue runs, without slowing the ordinary loop.

**Against — and this is the argument that decides it:**
- **A suite that only runs on releases is a suite that runs every few weeks.** It will
  drift, and the first time anyone needs it is the worst possible moment to discover it has
  been broken for a month. That is precisely the failure class this repo keeps hitting: a
  check nobody exercises is indistinguishable from a check that works, right up until it
  matters. `e2e.yml`'s own history is the evidence — a trigger nobody exercised on `main`
  is what produced this ticket.
- It creates a **second definition of "the E2E suite"** that must be kept in sync with the
  first by hand. That is a Smell #2 sentence waiting to be written.
- More moving parts on the highest-stakes path, at the moment when the fewest people are
  looking closely.

**Verdict:** B is the more ambitious answer and the wrong first move. If broader release
coverage is wanted, the right sequence is **A now** (close the hole with the known-good
suite), then widen the *shared* suite later so both PRs and releases benefit — rather than
forking a release-only path that nobody watches.

## Option C — accept it, and rely on the manual smoke checklist

**For:** zero change; the checklist in #2480 is genuinely thorough.

**Against:** it is a human running ~40 checks by hand, once, under release pressure — and
it has never been the *only* verification before, because everyone assumed E2E was running.
Choosing C means choosing that deliberately and writing it down. **If C is chosen, it must
be recorded in the release template**, or the next reader will re-derive the same false
assumption this ticket exists to correct.

---

## Recommendation

**Apply Option A.** One line, brings the last outlier into line, uses a continuously
exercised suite, ~4.5 minutes per release. Then decide separately whether the shared suite
should grow — that is a different question and should not block closing this hole.

## Verification after applying — do not skip this

The config being right is not evidence the run happens. On the next release PR:

- [ ] an `e2e.yml` run exists **for the PR event** (not only the staging push) — check
      `event: pull_request` on the run
- [ ] `Playwright E2E (Vercel preview)` reports **`success`**, not `skipped`
- [ ] `E2E gate` is green **because the leg ran**, not because it was skipped

That last line is the whole point: this bug produced a green `E2E gate` for months.
**Re-reading a green is what let it survive; only `conclusion: success` on the leg itself
closes it.**
