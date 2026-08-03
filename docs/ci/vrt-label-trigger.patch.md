# `vrt-update.yml` — label-triggered regen (MEH-1764)

`.github/workflows/**` is **CC-deny (MEH-671)**, so Claude Code cannot apply this
itself. This doc is the exact edit for **Sapir** to make in
`.github/workflows/vrt-update.yml`.

Same shape as [`docs/ci/ci-gate-skip-green.patch.md`](./ci-gate-skip-green.patch.md),
[`docs/ci/e2e-gate.patch.md`](./e2e-gate.patch.md) and
[`docs/ci/repo-guards.patch.md`](./repo-guards.patch.md).

---

## 0 · Read this first — the premise this ticket was written on is FALSE

MEH-1764 §2א opens by quoting `vrt-update.yml:15`:

> *"Dispatch needs a token with actions:write (the GitHub MCP integration in CC
> sessions does not have it — run it from the Actions tab / gh CLI on a feature
> branch)."*

**That sentence is wrong, and every conclusion drawn from it is wrong.** CC
dispatched this workflow twice on 2026-07-29, from a CC session, via the GitHub
MCP:

| Run | Ref | Input | Result |
|---|---|---|---|
| [30444155966](https://github.com/levismadar80-ship-it/FoodMamkor/actions/runs/30444155966) | `feature/meh-1733-home-baseline-regen` | `route: home` | success |
| [30446255751](https://github.com/levismadar80-ship-it/FoodMamkor/actions/runs/30446255751) | `levismadar80/meh-1390-tabs-hide-empty` | `route: producer.detail` | success |

Both queued (`204 No Content`), ran the full build → Playwright → commit
sequence, and completed. The GitHub App this session authenticates as holds
`actions: write` and `workflows: write`.

**So this patch is not a workaround for a missing permission. It is a deliberate
narrowing of a permission CC demonstrably holds** — and that reframing changes
what the patch is *for*, which §2 below states before the diff, so nobody applies
it believing it unblocks something that was never blocked.

### The same false claim lives in four places — fix all four

| Where | Status |
|---|---|
| `.github/workflows/vrt-update.yml:15` | **corrected by §3 of this patch** (CC-deny — Sapir applies) |
| MEH-1764 §2א | corrected in the card |
| MEH-1733 description | corrected in the card |
| MEH-1390 / PR #2242 body (*"dispatch returned 403 — exactly as the workflow's own comment predicts"*) | corrected in the PR body |

The 403 in the PR #2242 body is the origin of the whole chain: a single failed
call, generalised into a documented permission boundary, then cited by three
later tickets as established fact. Nobody re-tested it for three days. **A
negative permission result is a claim about one moment, not a property of the
system** — the same shape as `mcp__github__list_branches` being trustworthy for
positive claims and not negative ones (CLAUDE.md, MEH-478).

### The App's grant is Sapir's to review

`actions: write` + `workflows: write` on the Claude GitHub App means CC can
dispatch **any** `workflow_dispatch` workflow in this repo, and could edit
workflow files if the CC-deny convention (MEH-671) were bypassed — that deny is
enforced by local hooks, **not by the token**. Whether that grant should be
narrowed at the App level is a decision for Sapir; this patch does not touch it
and does not depend on it.

---

## 1 · Decision — this design, and PR #2425 closed

Two designs existed for one problem. Picking one was a required step of this
ticket.

| | **#2425 — push trigger on `vrt-regen/**`** | **This patch — label trigger** |
|---|---|---|
| How CC requests | push a `vrt-regen/**` branch | add the `vrt-regen:<route>` label to the PR |
| Where scope comes from | `frontend/e2e/visual/.regen-scope`, a committed file | the label name, mapped through a closed `case` |
| Where baselines land | on the `vrt-regen/**` branch — **not the PR's branch** | on the PR's head branch, where they are needed |
| Leftover state | `.regen-scope` must be deleted before merge or it ships | none |
| Injection surface | file contents → shell variable → `--grep` | none — the pattern never comes from user text |
| Re-adds | the `on: push` mechanism MEH-1496 deleted | nothing |

**Decision: ship the label trigger; close #2425.**

Source: the Percy/Chromatic separation of **generation** from **approval** — the
capture is automatic on every commit, the diff is surfaced on the PR, and a human
approving is what turns a candidate image into a baseline. Percy has no manual
regen at all; comparison is always against the last *approved* build.

Three reasons, in order of weight:

1. **#2425 lands the baselines on the wrong branch.** The commit step pushes to
   the ref the run was launched from, so a `vrt-regen/**` push commits the PNGs
   to `vrt-regen/**` — and someone then has to cherry-pick them onto the PR. The
   label fires on the PR, so `github.ref` **is** the PR's head branch and the
   baselines land in the diff under review.
2. **`.regen-scope` is a file that must be forgotten exactly once to cause
   harm.** It is committed, read into a shell variable, and interpolated into
   `--grep`. It also has to be removed before merge or it rides into `staging`.
   A label carries no such obligation, and the closed `case` map means the grep
   pattern is repo-authored, never user-authored.
3. **#2425 re-introduces `on: push`**, the exact mechanism MEH-1496 removed. It
   bounds it to a branch prefix, which is a real mitigation — but the safest
   version of a deleted mechanism is still the one you didn't re-add.

**#2425 is not wrong about the problem.** Its `.regen-scope` fail-closed step is
a genuinely good guard, and §2's `case` map is the same idea with the free text
removed. It also can't be reviewed as it stands: its PR body is an unfilled
template — no summary, every checkbox blank, including the `Builder-Model`
declaration MEH-1668 requires.

---

## 2 · What this actually buys, now that the permission premise is gone

Not the ability to regen — CC has that. Three things it does not have:

1. **The request is on the PR.** A dispatch is a run in the Actions tab with no
   link to the PR whose baselines it rewrote. A label is an event in the PR's own
   timeline: who asked, when, for which route, next to the diff it produced.
2. **The scope is a closed vocabulary.** `workflow_dispatch` takes `route` as
   **free text**, and an empty value means *regenerate every baseline* — the
   MEH-1496 failure is one blank field away, every time. A label can only be one
   of the names that exist, and each maps to a fixed pattern.
3. **It closes the `${{ }}`-into-`run:` injection sink.** `${{ inputs.route }}`
   is interpolated straight into a `run:` block today (`:194`). Anyone who can
   dispatch can execute arbitrary shell on the runner. The `case` map removes the
   sink for the label path and §3.4 removes it for the dispatch path too.

`workflow_dispatch` **stays**. It is the escape hatch for a route the label
vocabulary doesn't cover yet, and removing it would be a regression.

---

## 3 · The edit

### 3.1 · Correct the header comment (`:14-16`)

```diff
-# run to one baseline; empty input keeps the full regen. Dispatch needs a token
-# with actions:write (the GitHub MCP integration in CC sessions does not have
-# it — run it from the Actions tab / gh CLI on a feature branch).
+# run to one baseline; empty input keeps the full regen.
+#
+# MEH-1764: this comment previously claimed CC's GitHub integration lacks
+# actions:write. It does not — runs 30444155966 and 30446255751 (29/07) were
+# both dispatched from a CC session and both completed. The claim originated in
+# a single 403 on PR #2242 and was then cited as fact by three tickets over
+# three days. The label path below is a deliberate NARROWING of a permission CC
+# holds, not a workaround for one it lacks.
```

### 3.2 · Add the trigger (`on:`, after the existing `workflow_dispatch` block)

```yaml
  # MEH-1764: label = a REQUEST for a regen, scoped by the label's own name.
  # workflow_dispatch above stays as the escape hatch for a route this
  # vocabulary does not cover.
  pull_request:
    types: [labeled]
```

`pull_request`, **not** `pull_request_target`. `pull_request_target` runs with the
base repo's token against untrusted head code, which is the exact class the CSA
*Comment and Control* write-up covers. The fork guard in §3.3 is belt-and-braces
on top of that.

### 3.3 · Job-level guard (replaces the `if:` on `update-baselines`, `:53`)

```yaml
    # Self-loop guard (existing): the baseline commit this job pushes must not
    # re-run it. MEH-1764 adds the label conditions — on a `labeled` event ALL
    # of these must hold; on a dispatch only the actor check applies.
    if: >-
      github.actor != 'github-actions[bot]'
      && (
        github.event_name == 'workflow_dispatch'
        || (
          startsWith(github.event.label.name, 'vrt-regen:')
          && github.event.pull_request.head.repo.full_name == github.repository
        )
      )
```

### 3.4 · Resolve the scope from a closed map (new step, before `Set up Node.js 20`)

```yaml
      # MEH-1764: the --grep pattern is chosen by the workflow, never supplied
      # by the event. A label name selects a case; an unknown label exits 0
      # without regenerating. This is also what removes the injection sink —
      # `${{ inputs.route }}` used to reach `run:` directly (see 3.5).
      - name: Resolve regen scope
        id: scope
        env:
          LABEL: ${{ github.event.label.name }}
          ROUTE: ${{ inputs.route }}
        run: |
          set -euo pipefail
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            case "$LABEL" in
              vrt-regen:home)            pattern='home' ;;
              vrt-regen:map)             pattern='map' ;;
              vrt-regen:about)           pattern='about' ;;
              vrt-regen:login)           pattern='login' ;;
              vrt-regen:register)        pattern='register' ;;
              vrt-regen:producer-detail) pattern='producer.detail' ;;
              *)
                echo "::notice::'$LABEL' is not a regen label — nothing to do."
                echo "skip=true" >> "$GITHUB_OUTPUT"
                exit 0
                ;;
            esac
            echo "Scope from label '$LABEL' -> --grep '$pattern'"
          else
            pattern="$ROUTE"
            echo "Scope from dispatch input -> --grep '${pattern:-<ALL ROUTES>}'"
          fi
          echo "pattern=$pattern" >> "$GITHUB_OUTPUT"
```

Both event values arrive through `env:`, never through `${{ }}` inside the
script body. On the label path the value is discarded after the `case` match —
only the repo-authored `pattern` survives.

**Every subsequent step gains** `if: steps.scope.outputs.skip != 'true'` so a
non-regen label costs one ~10s job and no build.

### 3.5 · Use the resolved pattern (`Regenerate baselines`, `:186-199`)

```diff
+        env:
+          PATTERN: ${{ steps.scope.outputs.pattern }}
         run: |
-          if [ -n "${{ inputs.route }}" ]; then
-            npx playwright test e2e/visual --update-snapshots --grep "${{ inputs.route }}"
+          if [ -n "$PATTERN" ]; then
+            npx playwright test e2e/visual --update-snapshots --grep "$PATTERN"
           else
             npx playwright test e2e/visual --update-snapshots
           fi
```

### 3.6 · Remove the label after the run (new final step)

```yaml
      # Make the label a one-shot request rather than a standing state, so
      # re-labelling is how you ask again.
      - name: Remove the regen label
        if: always() && github.event_name == 'pull_request' && steps.scope.outputs.skip != 'true'
        continue-on-error: true
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh pr edit "${{ github.event.pull_request.number }}" --remove-label "${{ github.event.label.name }}"
```

This needs `pull-requests: write` added to the top-level `permissions:` block
alongside `contents: write`. If you would rather not widen it, drop this step —
everything above works without it; the label just stays on until removed by hand.

---

## 4 · The three guards, walked against three cases

| Case | `github.actor != 'github-actions[bot]'` | `startsWith(label, 'vrt-regen:')` | head repo == this repo | Job |
|---|---|---|---|---|
| **Fork PR** labelled `vrt-regen:home` | ✅ | ✅ | ❌ `octocat/FoodMamkor` ≠ `levismadar80-ship-it/FoodMamkor` | **skipped** |
| Same-repo PR labelled `needs-review` | ✅ | ❌ | ✅ | **skipped** |
| Label added by `github-actions[bot]` | ❌ | ✅ | ✅ | **skipped** |
| Same-repo PR labelled `vrt-regen:home` by Sapir/CC | ✅ | ✅ | ✅ | **runs**, `--grep home` |

The fork case is the one that matters: without it, anyone who can get a label
onto a fork PR gets a `contents: write` job running build scripts from their own
head. It is why `pull_request_target` is banned above.

A fifth case is worth naming because the guard does **not** cover it: a
same-repo PR labelled `vrt-regen:home` whose branch is `staging`. The existing
*"Reject dispatch against a protected branch"* step (`:69`) catches it and exits
1 with usage — kept verbatim, and now load-bearing on a second path.

---

## 5 · What this does NOT change — approval stays human

The label is a **request**. It produces *candidate* baselines and nothing more.

Per `.claude/rules/testing.md` and MEH-1552/MEH-1583: **a runner-generated
baseline is a candidate, not truth.** A bot that regenerates on demand freezes
whatever the code did, bug included. The PNG must be opened and reviewed before
merge, and Sapir approving the PR is what makes a candidate a baseline. This
patch moves *who presses the button*; it does not move *who decides*.

### 5.1 · Read the text in the frame, not just the layout

**A green VRT is not evidence that copy is unchanged.** Any baseline review has
to read the text rendered in the image — not merely check that the layout looks
right. Two measurements from 29/07, on the same 2% budget:

| Surface | Change | VRT verdict |
|---|---|---|
| `home` mobile | hero label `«מחפשות עכשיו:»` → `«פופולרי עכשיו:»` | **green** — passed, never regenerated |
| `producer-detail` mobile ×3 (MEH-1390) | mobile tab bar **4 tabs → 2** | **green** — regen run 30446255751 reported *"Baselines unchanged"* |

`playwright.config.ts:61` sets `maxDiffPixelRatio: 0.02`. On the mobile project
(Pixel 5, 393×851, no `fullPage`) that is a **6,688 px** budget; on desktop
(1440×900) it is **25,920 px**. A line of Hebrew hero copy is ~2,800 px of ink
and a tab-bar rewrite ~3,100 px — both comfortably inside. Worse, because
`--update-snapshots` only rewrites a *failing* snapshot, a passing comparison
produces **no new PNG to review**: there is nothing for the eye pass to catch.

So a regen reporting *"Baselines unchanged"* means **"the diff was under
tolerance"**, never **"the frame is the same"**. Whether 2% is the right number
is **MEH-1765**, which is Sapir's — this patch does not touch
`playwright.config.ts`.

---

## 6 · How to verify after applying

1. Create the labels in GitHub: `vrt-regen:home`, `vrt-regen:map`,
   `vrt-regen:about`, `vrt-regen:login`, `vrt-regen:register`,
   `vrt-regen:producer-detail`. **The `case` map is the source of truth** — a
   label with no case is a no-op, and a case with no label is unreachable.
2. **Positive:** on an open same-repo PR whose frontend changed, add
   `vrt-regen:home`. A run must start, log
   `Scope from label 'vrt-regen:home' -> --grep 'home'`, and either commit the
   PNG to the PR's head branch or print *"Baselines unchanged"*.
3. **Negative:** add any other label. No run — or a run that logs the `::notice::`
   and stops before Node setup.
4. **Regression:** dispatch manually with `route: map`. Unchanged behaviour.
5. The bot pushes with `GITHUB_TOKEN`, so **no workflow re-runs on the baseline
   commit** (MEH-991/1112/1113). Push a follow-up commit as yourself to re-fire
   the gates against the fresh baselines.

---

## 7 · DoD mapping (ticket §5)

- [x] **Phase 0 answered unambiguously** — and inverted the question: CC can label
      a PR *and* dispatch the workflow. Evidence in §0.
- [x] **Patch doc in `docs/ci/`** — this file.
- [x] **Three guards documented + walked over three cases** — §4, four rows plus
      the protected-branch case the guard deliberately leaves to `:69`.
- [x] **`workflow_dispatch` preserved** — §2, last line.
- [x] **Pointer line in `.claude/rules/testing.md`.**
- [ ] **Sapir applies the YAML + creates the six labels** — §6 step 1.
- [ ] **Live positive check** — §6 step 2.
- [ ] **Live negative check** — §6 step 3.
