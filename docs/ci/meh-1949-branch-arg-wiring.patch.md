# Wire the branch name into the mention guard — YAML patch for `pr-checks.yml` (MEH-1949)

> **The blocks here are for Sapir to apply by hand.** `.github/workflows/**` is
> CC-deny (`.claude/settings.json`, MEH-671) — CC writes the diff into this `.md`
> and does not touch the workflow. **Nothing here has been applied.**
>
> The script half is **already merged** (PR #2782): `check-linear-mentions.sh`
> takes an optional third argument, treats it with inverted semantics, exempts
> `dependabot/*`, and its `--self-test` covers all three branch cases. Verified
> today — `bash .claude/scripts/check-linear-mentions.sh --self-test` exits 0,
> and the branch cases are at `:167-190`. **Only the wiring is left.**

---

## ⛔ Phase 0 found a second gap, and it is the larger one

The card describes the remaining work as passing a third argument. That is hunk
1 below and it is two words. **But the job it would be added to does not run on
the PRs this guard exists for**, so hunk 1 alone buys nothing.

`pr-checks.yml:659`:

```yaml
if: ${{ needs.changes.outputs.frontend != 'true' && needs.changes.outputs.backend != 'true' && needs.changes.outputs.workflows != 'true' }}
```

The job runs **only when no code changed**. Its comment block (`:650-651`) says
why, and for the original rule 29 the scoping was right: that rule bans bare
identifiers in *docs/HANDOFF* PRs.

**The MEH-1949 branch check has the opposite scope.** A `feature/meh-<N>-*`
branch carrying an *active* ticket is what a **code** PR looks like — the
branch-name gate (MEH-1141) requires that shape — so the check would be
installed exactly where it can never fire.

### Measured today, not inferred

Two PRs open at the time of writing, both on `feature/meh-<N>-*` branches, both
naming a ticket that must NOT be closed by the merge:

| PR | diff | `Linear mention guard` |
|---|---|---|
| #3292 | `frontend/**` | **`skipped`** |
| #3294 | `backend/**` + `tests/**` | **`skipped`** |

Two for two, on the only two shapes that matter. Applying hunk 1 without hunk 2
produces a guard that is green because it never ran — the `null` output that is
also the reassuring output, which `.claude/rules/testing.md` spends a section on.

---

## Hunk 1 — pass the branch name (`pr-checks.yml:665-673`)

```diff
       - name: Write PR title and body to files
         env:
           PR_TITLE: ${{ github.event.pull_request.title }}
           PR_BODY: ${{ github.event.pull_request.body }}
         run: |
           printf '%s' "$PR_TITLE" > "$RUNNER_TEMP/pr_title.txt"
           printf '%s' "$PR_BODY"  > "$RUNNER_TEMP/pr_body.txt"
       - name: Check for bare Linear identifiers (warn-only)
-        run: bash .claude/scripts/check-linear-mentions.sh "$RUNNER_TEMP/pr_title.txt" "$RUNNER_TEMP/pr_body.txt" || true
+        # MEH-1949: third argument = the head branch name. A `meh-<N>` in a
+        # branch name is an auto-link with no closing keyword available, so the
+        # script checks CONSISTENCY (is it declared as `Closes` in the body?)
+        # rather than banning the identifier — banning it would collide with
+        # the Branch name gate, which REQUIRES it.
+        env:
+          # Via env, never interpolated into the `run:` string. A branch name
+          # is attacker-controlled on a fork PR, and `${{ }}` inside `run:`
+          # is substituted before the shell sees it — the standard Actions
+          # script-injection sink. The step above already does this for the
+          # title and body; this is the same discipline for the same reason.
+          PR_HEAD_REF: ${{ github.event.pull_request.head.ref }}
+        run: bash .claude/scripts/check-linear-mentions.sh "$RUNNER_TEMP/pr_title.txt" "$RUNNER_TEMP/pr_body.txt" "$PR_HEAD_REF" || true
```

## Hunk 2 — let the job run on the PRs the branch check is for (`:659`)

```diff
   linear-mentions:
     name: Linear mention guard (rule 29, warn-only)
     needs: changes
-    if: ${{ needs.changes.outputs.frontend != 'true' && needs.changes.outputs.backend != 'true' && needs.changes.outputs.workflows != 'true' }}
+    # MEH-1949: the docs-only gate was correct for rule 29's TEXT ban and is
+    # wrong for the branch-name consistency check, whose whole population is
+    # code PRs (a `feature/meh-<N>-*` branch is what the Branch name gate
+    # requires of them). Measured 02/09: the job reported `skipped` on #3292
+    # (frontend) and #3294 (backend) — the two shapes it needs to see.
+    # Removed rather than inverted: one job with both scopes beats two jobs
+    # sharing one script. The cost is stated below and it is warnings only.
     runs-on: ubuntu-latest
```

### The cost of hunk 2, stated rather than discovered later

Widening the job also runs the **text** scan on code PRs, where rule 29 does
not ban a bare identifier. Expect some new `::warning::` lines there.

Three reasons that is the right trade, and not merely the cheap one:

1. **Nothing blocks.** The step ends in `|| true` and the job is
   `continue-on-error: true` (`:662`). Every finding is an annotation.
2. **A bare identifier in a code PR body is not harmless anyway.** It
   auto-links, and rule 29's measured damage — a Done ticket flipped back to In
   Progress — does not care which kind of PR mentioned it.
3. **The alternative is worse.** A second job with the inverse `if:`, calling
   the same script with two empty temp files, splits one guard across two jobs
   whose scopes must then be kept in sync by hand — the "remember to update X"
   smell, for a saving of some warnings on a non-blocking check.

If the warnings do prove noisy, the fix belongs in the script (a flag that
scopes the text scan), not in a second job — and `.claude/scripts/**` is a
normal CC PR, not a workflow edit.

---

## Verifying it discriminates — the guard must be seen firing AND not firing

`--self-test` already proves the script's logic; what these runs prove is the
**wiring**, which is the only thing this patch adds. A guard that is wired to
nothing passes its own self-test perfectly.

1. **It runs at all.** Any code PR after applying. The job must report a real
   conclusion, **never `skipped`**. That is the whole of hunk 2, and it is the
   step to check first — every result below is void if the job did not run.
2. **It fires.** A `feature/meh-<N>-*` PR whose body has no `Closes MEH-<N>`.
   Expect one `::warning::` naming that N. Both PRs in the table above are this
   case, deliberately, so no fixture is needed.
3. **It stays quiet when it should.** A `feature/meh-<N>-*` PR that DOES declare
   `Closes MEH-<N>`. Expect no branch warning. Without this, a guard that warns
   unconditionally is indistinguishable from one that works.
4. **Dependabot is exempt.** Any open `dependabot/*` PR — no branch warning.

Steps 2 and 3 are the pair. Either alone is compatible with a broken guard.

---

## What this does NOT do

- **It does not prevent the close.** The integration closes on merge and this is
  a text-consistency check, exactly as the card specifies. Its output is a
  warning to the author before merge, not a block.
- **It does not make branch-name auto-close predictable.** `workflow.md` rule
  29b records ten measured merges in which the same form produced opposite
  outcomes. The flip-check after every merge stays mandatory; this guard narrows
  when you need to remember it, and never replaces it.
- **It does not touch the Branch name gate.** Banning `meh-<N>` in branch names
  was considered and rejected on the card — MEH-1141 requires it, and the two
  guards would contradict each other.

Refs MEH-1949 · script half merged in #2782 · related MEH-1615, MEH-1736, MEH-1141.
