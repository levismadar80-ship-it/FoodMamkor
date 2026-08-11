# `E2E gate` — skip-green on `push` to `staging` (MEH-1799)

`.github/workflows/**` is **CC-deny (MEH-671)**, so Claude Code cannot apply this
itself. This doc is the exact edit for **Sapir** to make in
`.github/workflows/e2e.yml`.

Same shape as [`docs/ci/ci-gate-skip-green.patch.md`](./ci-gate-skip-green.patch.md)
(MEH-1582 — **applied**, `pr-checks.yml:754`), [`docs/ci/e2e-gate.patch.md`](./e2e-gate.patch.md)
and [`docs/ci/e2e-concurrency.patch.md`](./e2e-concurrency.patch.md).

> **This is not MEH-1601 mechanism 1.** That one — a shared concurrency group
> cancelling runs — **landed in `207b9894` on 27/07** (`github.ref` →
> `github.run_id`). Nothing here is cancelled. This is mechanism 2: a *fresh
> status published on top of an older one*, which survives that fix untouched.

---

## 1 · Root cause — a job-level `if:`, not a predicate

`e2e.yml:563-566`:

```yaml
  e2e-gate:
    name: E2E gate
    if: always()          # <-- runs on every event, including a skipped push
    needs: [filter, e2e]
```

and inside it, `e2e.yml:577`:

```bash
ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
```

`skipped → pass` is **correct in a PR** and **wrong on a push**, and the current
code cannot tell the two apart:

| Context | Why `e2e` skipped | Should the gate publish `success`? | Today |
|---|---|---|---|
| `pull_request`, docs-only | paths-filter: stack untouched | ✅ yes — nothing to check, and a skipped **required** context reads as `Expected` and blocks (MEH-892) | passes ✅ |
| `push` to `staging`, docs-only | same filter | ❌ **no — nothing ran, and the commit is the branch tip** | passes ❌ |

The asymmetry is not about the predicate's correctness; it is about **what a
status means in each context**. On a PR the status describes *that PR*. On a push
the status lands on the **tip of `staging`**, where it is read as "the state of
the branch" — so a docs-only push silently overwrites the signal of the code push
before it.

### 1.1 · Fresh reproduction — 10/08, at job level

The ticket's original evidence was 31/07. Re-measured on **10/08**, and the
sequence is tighter than the original:

| Time (UTC) | Run | Push | `Playwright E2E` | Duration | `E2E gate` |
|---|---|---|---|---|---|
| 12:19:51 | `31387507043` | code (PR #2757) | **ran** | 483 s | **failure** |
| 12:23:09 | `31387761417` | docs-only | `skipped` | 29 s | **success** |
| 12:32:07 | `31388477139` | docs-only (PR #2738) | `skipped` | 29 s | **success** ← tip |

Job-level detail for `31388477139` (head `7b3dd5f6`), which is the one that
mattered:

```
Paths filter                          success
Playwright E2E (Vercel preview)       skipped
E2E gate                              success   <-- published on the staging tip
```

**Thirteen minutes after a real red, the tip of `staging` read green**, and two
separate docs-only pushes had to do nothing at all to put it there.

> Read the **duration** column, not the conclusion — a `success` at 29 s is the
> aggregator, a conclusion at 483 s is a result. That is ORDERS §3.2's *duration
> tell*, and this table is what it looks like when it fires.

### 1.2 · A note on what the gate does *not* aggregate

`needs: [filter, e2e]` — the newer `Playwright E2E (WebKit — shadow,
non-blocking)` job is deliberately outside the gate. This patch does not change
that, and should not: the WebKit leg is explicitly non-blocking.

---

## 2 · The edit

**Options considered** (the ticket names three):

| | Option | Verdict |
|---|---|---|
| (a) | pass `skipped` only when `github.event_name == 'pull_request'` | Works, but publishes **failure** on every docs-only push to `staging`. A red that is expected on ordinary merges is a red nobody reads — the decay ORDERS §3.3 names. Rejected. |
| **(b)** | **on a skipped push, do not publish a status at all** | **Recommended.** Cheapest, no new job, and the tip carries `skipped` — visibly not `success`, and honest about what happened. |
| (c) | a job that queries "what did the last real run say" and republishes it | Correct but needs `actions: read`, an API call and a failure mode of its own. Not worth it for the same outcome. |

**Replace `e2e.yml:565`** (`if: always()`) with:

```yaml
    # MEH-1799: on a PUSH, `skipped` is not a pass. A docs-only push skips the
    # suite, and this gate would otherwise publish a fresh `success` onto the
    # tip of `staging`, overwriting the signal of the code push before it.
    # Suppressing the job leaves the tip with `skipped` — visibly not a pass.
    #
    # PR behaviour is deliberately untouched: on `pull_request` the gate still
    # runs and still maps skipped -> pass, because a skipped *required* context
    # reads as `Expected` and blocks docs-only PRs (MEH-892).
    #
    # The third conjunct is load-bearing: if the paths-filter itself failed,
    # `e2e` is skipped as a consequence, and the gate must still run so its
    # R_FILTER guard (:583-586) can block. Without it, a broken filter would
    # silently publish nothing instead of failing.
    if: >-
      always() &&
      !(github.event_name == 'push' &&
        needs.e2e.result == 'skipped' &&
        needs.filter.result == 'success')
```

**Nothing else changes.** `ok()` at `:577` is untouched, the `run:` block is
untouched, and no other job is touched.

### 2.1 · Why this is safe for the future required-check promotion

`E2E gate` is **not** a required context today — `protect-staging` (ruleset
15240090) gates on `CI gate (required)` + `Deploy gate (required)` only. When
[`e2e-gate.patch.md`](./e2e-gate.patch.md)'s promotion eventually happens:

- Required contexts are evaluated **for merging a PR**. On `pull_request` this
  patch changes nothing at all — same job, same `if: always()` path, same
  `skipped → pass`. So MEH-892 cannot re-open.
- `push` to `staging` is **post**-merge. There is no merge for a status to gate,
  so suppressing the job there cannot block anything.

That is the branch-protection side effect the ticket asked to verify, and the
answer is: none, in either the current or the promoted state.

### 2.2 · One intentional consequence, named

A dependabot push to `staging` also skips `e2e` (`:105`, actor check) while the
paths-filter says the frontend *was* touched. Under this patch that push
publishes `skipped` instead of `success`. That is the correct reading — the suite
did not run — but it is a behaviour change on a path the ticket did not name, so
it is called out rather than discovered later.

---

## 3 · Proof — failing-by-construction, and it discriminates

Per `.claude/rules/testing.md` (MEH-1619) the harness models **both** halves of
the decision — whether the job runs (the `if:`) and what the bash returns — and
reports the conclusion that actually lands on the commit, under the old and new
conditions side by side.

**Pass 1 reads the real `e2e.yml`** to report whether the fix is applied and to
assert the aggregator still has the shape Pass 2 models (lenient `ok()`, the
`R_FILTER` guard, the `needs:` list). That is the anchor to a real repo file that
`testing.md` requires — a fixture-only harness would pass against a workflow that
no longer exists.

```
== Pass 1 — live state of e2e.yml ==
  NOT YET   — e2e-gate is 'if: always()'; a skipped push still publishes success (the MEH-1799 hole).
  drift check: aggregator shape unchanged (lenient ok, R_FILTER guard, needs list) — OK

== Pass 2 — what conclusion lands on the commit? ==
  SCENARIO                                   OLD        NEW
  A push, docs-only (e2e skipped)            SUCCESS    SKIPPED
  B pull_request, docs-only (MEH-892)        SUCCESS    SUCCESS
  C push, code, suite green                  SUCCESS    SUCCESS
  D push, code, suite red                    FAILURE    FAILURE
  E push, paths-filter itself broke          FAILURE    FAILURE

  SELF-TEST PASS — the change discriminates exactly scenario A.
  (Gate is still UNPATCHED in this checkout — scenario A is live today.)
```

- **A** is the bug — old publishes green, new does not. The discriminating case,
  and `1.1` is the same row observed in production three times on 10/08.
- **B** is the MEH-892 path the lenient mapping exists for. It must not regress,
  and does not.
- **C**/**D** — a push that actually ran reports identically under both.
- **E** — a broken paths-filter must still block.

### 3.1 · The control — the harness can fail, and here is it failing

A self-test that has never been observed failing is a green light of unknown
wiring (ORDERS §3.0: *run a known-answer control before believing any probe*).
Re-running with the **third conjunct removed** — the obvious two-condition
version of this patch, which is what a reviewer would most plausibly propose:

```
  SCENARIO                                   OLD        NEW
  E push, paths-filter itself broke          FAILURE    SKIPPED
  REGRESSION: a broken paths-filter must stay FAILURE under both.
  SELF-TEST FAIL — this harness no longer models the gate; fix it before trusting it.
  EXIT=1
```

Two things follow, and the second is the one worth keeping:

1. The harness discriminates — it is not decoration.
2. **`needs.filter.result == 'success'` is load-bearing, not defensive noise.**
   Without it, this patch would convert a broken paths-filter from a blocking
   failure into silence — introducing a fail-open hole while closing one. Do not
   simplify the condition to two conjuncts.

### 3.2 · Harness location — a deviation from the MEH-1582 precedent

`ci-gate-selftest.sh` was committed to `scripts/`. This one is **embedded in this
document** (Appendix A) rather than committed there, because `scripts/**` is
outside this session's lane. It is copy-paste runnable and takes the repo root as
`$1`. **Promoting it to `scripts/e2e-gate-selftest.sh` is worth doing** by a
session that owns that path — as a file it would catch workflow drift on every
run instead of only when someone reads this doc.

---

## 4 · DoD mapping (ticket §DoD)

- [x] `docs/ci/e2e-skip-green.patch.md` exists, with copy-paste YAML and a
      measurable acceptance test (§5)
- [x] PR context (skipped = pass, kept) explicitly separated from push context
      (skipped ≠ pass) — §1, §2, §2.1
- [x] States that MEH-1601 mechanism 1 landed in `207b9894` and that this is
      **not** the same fix — banner at the top
- [x] No file under `.github/workflows/` edited in this PR
- [ ] `.claude/rules/testing.md` line — **not done, deliberately.**
      `.claude/rules/**` is outside this session's lane, so the file was not
      touched. The line to add is drafted in Appendix B for whoever owns it.
- [ ] **After Sapir applies:** red code push followed by a docs-only push → tip
      not green. Hers to run, §5.

---

## 5 · How to verify after applying

1. Find any commit on `staging` where `Playwright E2E` genuinely ran (**duration
   > 5 min**) and went red.
2. Push a docs-only commit on top.
3. The tip must now show `E2E gate — skipped`, **not** `success`. Before this
   patch it showed `success`, as in the table at §1.1.
4. Confirm a docs-only **PR** still goes green on `E2E gate` (scenario B) — this
   is the regression that would re-open MEH-892.

---

## 6 · Unrelated nit, found while reading the file

`e2e.yml:564` is `name: E2E gate ` — with a **trailing space**. It is harmless
today because the gate is not a required context. If it is ever added to ruleset
15240090, the context string must match whatever GitHub actually stores. **I have
not verified whether GitHub trims it**, so this is flagged, not diagnosed —
worth a look in the same edit, since the file is already open.

---

## Appendix A — the harness

Save anywhere, run as `bash e2e-gate-selftest.sh <repo-root>`.

```bash
#!/usr/bin/env bash
# e2e-gate-selftest.sh — MEH-1799
#
# Proves that the proposed `E2E gate` job-level `if:` sorts five scenarios
# correctly, and reports whether the fix is applied yet.
#
# NOTE ON FIDELITY (.claude/rules/testing.md — "exercise the real implementation,
# never a copy"): the gate's decision is split across a YAML `if:` expression and
# a bash `run:` block, neither of which can be sourced. Pass 1 reads the REAL
# workflow file to detect (a) whether the fix is live and (b) whether the
# aggregator still has the shape Pass 2 models.
#
# Exit: 0 = the conditions discriminate as expected; 1 = the harness is wrong.

set -uo pipefail

REPO_ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
WF="$REPO_ROOT/.github/workflows/e2e.yml"

# ---------------------------------------------------------------- Pass 1
echo "== Pass 1 — live state of $(basename "$WF") =="
if [ ! -f "$WF" ]; then
  echo "  ERROR: workflow file not found at $WF" >&2
  exit 1
fi

if awk '/^  e2e-gate:/,/^  [a-z-]+:$/' "$WF" | grep -qE "github.event_name == 'push'"; then
  APPLIED=1
  echo "  APPLIED   — e2e-gate carries a push-context guard; a skipped push no longer publishes success."
else
  APPLIED=0
  echo "  NOT YET   — e2e-gate is 'if: always()'; a skipped push still publishes success (the MEH-1799 hole)."
  echo "              Fix is staged in docs/ci/e2e-skip-green.patch.md (Sapir applies;"
  echo "              .github/workflows/** is CC-deny, MEH-671)."
fi

# Drift guard: if the aggregator's shape changed, Pass 2 is modelling something
# that no longer exists and must not be trusted.
DRIFT=0
grep -q 'success|skipped) return 0' "$WF" || { echo "  DRIFT: lenient ok() not found in the workflow" >&2; DRIFT=1; }
grep -q 'cannot determine E2E scope' "$WF" || { echo "  DRIFT: R_FILTER guard not found in the workflow" >&2; DRIFT=1; }
grep -q 'needs: \[filter, e2e\]' "$WF"     || { echo "  DRIFT: e2e-gate needs: [filter, e2e] not found" >&2; DRIFT=1; }
[ "$DRIFT" -eq 0 ] && echo "  drift check: aggregator shape unchanged (lenient ok, R_FILTER guard, needs list) — OK"

# ---------------------------------------------------------------- Pass 2
echo
echo "== Pass 2 — what conclusion lands on the commit? =="

# Models BOTH halves of the decision:
#   1. does the e2e-gate job run at all?      (the YAML `if:` — what this patch changes)
#   2. if it runs, what does the bash return? (unchanged by this patch)
gate_outcome() {
  local variant="$1" event="$2" r_filter="$3" r_e2e="$4"

  if [ "$variant" = new ]; then
    if [ "$event" = push ] && [ "$r_e2e" = skipped ] && [ "$r_filter" = success ]; then
      echo SKIPPED; return
    fi
  fi

  ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
  ok "$r_filter" || { echo FAILURE; return; }   # "cannot determine E2E scope"
  if ok "$r_e2e"; then echo SUCCESS; else echo FAILURE; fi
}

declare -a NAMES EVENTS FILTERS E2ES
add() { NAMES+=("$1"); EVENTS+=("$2"); FILTERS+=("$3"); E2ES+=("$4"); }

#    label                                        event         filter    e2e
add "A push, docs-only (e2e skipped)"             push          success   skipped
add "B pull_request, docs-only (MEH-892)"         pull_request  success   skipped
add "C push, code, suite green"                   push          success   success
add "D push, code, suite red"                     push          success   failure
add "E push, paths-filter itself broke"           push          failure   skipped

printf '  %-42s %-10s %-10s\n' "SCENARIO" "OLD" "NEW"
PASS=1
for i in "${!NAMES[@]}"; do
  O=$(gate_outcome old "${EVENTS[$i]}" "${FILTERS[$i]}" "${E2ES[$i]}")
  N=$(gate_outcome new "${EVENTS[$i]}" "${FILTERS[$i]}" "${E2ES[$i]}")
  printf '  %-42s %-10s %-10s\n' "${NAMES[$i]}" "$O" "$N"
  eval "OUT_OLD_$i=\$O; OUT_NEW_$i=\$N"
done

echo
[ "$OUT_OLD_0" = SUCCESS ] && [ "$OUT_NEW_0" != SUCCESS ] || {
  echo "  DISCRIMINATION FAIL: A must be SUCCESS under old and non-SUCCESS under new." >&2; PASS=0; }
[ "$OUT_OLD_1" = SUCCESS ] && [ "$OUT_NEW_1" = SUCCESS ] || {
  echo "  REGRESSION: docs-only PR must stay SUCCESS under both." >&2; PASS=0; }
[ "$OUT_OLD_2" = SUCCESS ] && [ "$OUT_NEW_2" = SUCCESS ] || {
  echo "  REGRESSION: a green push must stay SUCCESS under both." >&2; PASS=0; }
[ "$OUT_OLD_3" = FAILURE ] && [ "$OUT_NEW_3" = FAILURE ] || {
  echo "  REGRESSION: a red push must stay FAILURE under both." >&2; PASS=0; }
[ "$OUT_OLD_4" = FAILURE ] && [ "$OUT_NEW_4" = FAILURE ] || {
  echo "  REGRESSION: a broken paths-filter must stay FAILURE under both." >&2; PASS=0; }

if [ $PASS -eq 1 ]; then
  echo "  SELF-TEST PASS — the change discriminates exactly scenario A."
  [ $APPLIED -eq 0 ] && echo "  (Gate is still UNPATCHED in this checkout — scenario A is live today.)"
  exit 0
fi
echo "  SELF-TEST FAIL — this harness no longer models the gate; fix it before trusting it." >&2
exit 1
```

**To reproduce the control in §3.1**, delete `&& [ "$r_filter" = success ]` from
`gate_outcome` and re-run: scenario E flips to `SKIPPED` and the harness exits 1.

---

## Appendix B — the `.claude/rules/testing.md` line (drafted, not applied)

Out of lane this session (§4). To be added under *"Required status checks +
docs-only merge (MEH-716)"*, next to the existing skip-green material:

> **A green `E2E gate` on the tip of `staging` may be a *skip*, not a pass.**
> `e2e-gate` maps `skipped → pass`, and on a `push` the status is published on
> the branch tip — so a docs-only push overwrites the previous code push's
> signal with a fresh green. Measured 10/08: `31387507043` ran 483 s and went
> **red**; `31387761417` and `31388477139` skipped, took 29 s each, and both
> published **success** on top of it. Read the **duration** before trusting a
> green: < 1 min = the aggregator, > 5 min = a result. The fix is staged in
> [`docs/ci/e2e-skip-green.patch.md`](../../docs/ci/e2e-skip-green.patch.md)
> (MEH-1799); `.github/workflows/**` is CC-deny, so it is Sapir's to apply.
