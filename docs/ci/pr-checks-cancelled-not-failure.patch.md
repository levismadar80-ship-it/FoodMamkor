> **✅ Status: APPLIED — as-of 01/09.** Measured against `origin/staging`: `is_cancelled` present x3 in `pr-checks.yml`, and observed firing.
> The banner below is a claim with an as-of date, not the current state — read this line first.

# `CI gate` — a cancelled job is not a failed job (MEH-1907)

`.github/workflows/**` is **CC-deny (MEH-671)**, so Claude Code cannot apply this
itself. This doc is the exact edit for **Sapir** to make in
`.github/workflows/pr-checks.yml`.

Mirror-image bug to
[`ci-gate-skip-green.patch.md`](./ci-gate-skip-green.patch.md) (MEH-1582 —
**applied**, `pr-checks.yml:767-781`): there a *non-conclusive* result
(`skipped`) was wrongly read as a **pass**; here a *non-conclusive* result
(`cancelled`) is wrongly read as a **fail**. Both are fixed the same way — name
the non-conclusive case explicitly instead of collapsing it into a binary.

---

## 1 · The bug, from the source — already named in a comment, never fixed in code

`pr-checks.yml:36-41` (current, unpatched):

```yaml
concurrency:
  # MEH-1653: ready_for_review מקבל group נפרד כדי שלא יבטל ריצת synchronize
  # שבאוויר. ריצה מבוטלת מדווחת cancelled, וה-aggregator ממפה cancelled ל-FAIL —
  # אודם שקרי. GitHub Support על אותה מחלקה: community discussion #77942.
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}-${{ github.event.action == 'ready_for_review' }}
  cancel-in-progress: true
```

Translation: *"a cancelled run reports `cancelled`, and the aggregator maps
`cancelled` to FAIL — a false red."* The comment has said this since MEH-1653.
`check()`/`check_ran()` (`:748-781`) still don't handle it:

```bash
ok() {
  case "$1" in
    success|skipped) return 0 ;;
    *) return 1 ;;              # <-- cancelled falls through here
  esac
}
check() {
  if ok "$2"; then echo "  OK  $1: $2"; else echo "  FAIL $1: $2"; fail=1; fi
}
strict_ok() {
  case "$1" in
    success) return 0 ;;
    *) return 1 ;;              # <-- and here
  esac
}
check_ran() {
  if strict_ok "$2"; then
    echo "  OK  $1: $2"
  else
    echo "  FAIL $1: $2 (required job did not run — 'skipped' is not a pass)"
    fail=1
  fi
}
```

`cancel-in-progress: true` (`:41`) guarantees that a second push on the same PR
cancels whichever job was still running on the prior SHA. That cancellation is
an **absence of measurement**, not a measured failure — the new push's own run
is already the real answer. Today's `check_ran` message even mislabels it: a
cancelled job did run, and was stopped, which is a different fact from "did not
run" (dependabot/draft suppression, the case the message was written for).

---

## 2 · The edit

**Add**, immediately after `ok()`/before `check()`, and mirrored into
`check_ran()`:

```diff
           ok() {
             case "$1" in
               success|skipped) return 0 ;;
               *) return 1 ;;
             esac
           }

+          # MEH-1907: `cancelled` means a newer push superseded this run
+          # before it finished — this workflow's own concurrency group
+          # (cancel-in-progress: true, line ~41) guarantees that. It is an
+          # absence of measurement, not a failed one. Mirror of MEH-1582's
+          # skip-green fix in the opposite direction: there a non-conclusive
+          # result (skipped) was wrongly read as a pass; here a
+          # non-conclusive result (cancelled) is wrongly read as a fail.
+          # NON-BLOCKING BY DESIGN — see .claude/rules/testing.md for why.
+          is_cancelled() { [ "$1" = "cancelled" ]; }
+
           check() {
-            if ok "$2"; then
+            if is_cancelled "$2"; then
+              echo "  SUPERSEDED $1: $2 (a newer push cancelled this run — not counted as a failure, MEH-1907)"
+            elif ok "$2"; then
               echo "  OK  $1: $2"
             else
               echo "  FAIL $1: $2"
               fail=1
             fi
           }

           strict_ok() {
             case "$1" in
               success) return 0 ;;
               *) return 1 ;;
             esac
           }

           check_ran() {
-            if strict_ok "$2"; then
+            if is_cancelled "$2"; then
+              echo "  SUPERSEDED $1: $2 (a newer push cancelled this run — not counted as a failure, MEH-1907)"
+            elif strict_ok "$2"; then
               echo "  OK  $1: $2"
             else
               echo "  FAIL $1: $2 (required job did not run — 'skipped' is not a pass)"
               fail=1
             fi
           }
```

`ok()` and `strict_ok()` are **unchanged** — both callers gain the
`is_cancelled` branch ahead of them, same shape as MEH-1582 left the original
`ok()` alone and added `strict_ok`/`check_ran` alongside it. The `$R_CHANGES`
guard just above (`if ! ok "$R_CHANGES"; then … exit 1; fi`) is untouched —
if the paths-filter job itself is cancelled, the run can't determine scope at
all and aborting is still correct; this patch only changes the per-job checks
inside the loop.

### 2.1 · Why `SUPERSEDED` and not silence

Per this repo's own testing culture ("A green that has two possible causes is
not a signal"): if a cancelled job printed nothing, or printed `OK`
identically to a real pass, a reader scanning the log could not tell
"measured and passed" from "never finished" without opening the run. The
distinct tag makes the non-conclusive case visible on the summary line itself,
which is the concrete form of MEH-1907's acceptance criterion *"a reader must
be able to tell 'superseded' from 'passed' without opening the run."*

---

## 3 · Proof — failing-by-construction, both directions (MEH-1619)

`scripts/ci-gate-cancelled-selftest.sh` (added alongside this doc) feeds the
real predicate three scenarios under both the old and the new logic:

```
  SCENARIO                                  OLD        NEW
  A required job cancelled (superseded)     RED        GREEN
  B required job genuinely failed           RED        RED
  C required job succeeded                  GREEN      GREEN
```

- **A is the bug this patch closes.** Today a job cancelled by a newer push
  reports `CI gate: FAIL`. After the patch, the same input reports
  `SUPERSEDED … (not counted as a failure, MEH-1907)` and the gate goes green.
- **B must stay RED under both** — this patch must not turn a genuine failure
  into a pass. `cancelled` and `failure` are different GitHub Actions result
  values; `is_cancelled()` only matches the literal string `cancelled`, so a
  real `failure` still falls through to the `else` branch in both `check()`
  and `check_ran()`.
- **C must stay GREEN under both** — an ordinary successful run is untouched.

Run: `bash scripts/ci-gate-cancelled-selftest.sh`. Exit 0 = the predicates
discriminate exactly as the table says, regardless of whether the patch has
been applied yet (Pass 1 reports live-vs-not-yet-applied by grepping
`pr-checks.yml` for `is_cancelled`; Pass 2 exercises a local reproduction of
both predicates, per "exercise the real implementation" — Pass 1 is what
catches drift between this harness and the real workflow).

**Not promoted to `scripts/checks/` yet**, same reasoning as its two siblings
(`ci-gate-selftest.sh`, `e2e-gate-selftest.sh`): it reports a known-unapplied
state and would need an "is it applied" branch before it could safely join the
required *Repo guards* job without misreporting on every PR before Sapir
applies this patch.

---

## 4 · What this does not fix — named, not silently out of scope

- **Whether `E2E gate` should become a required context** (MEH-1907's second
  decision point, "ב'"): **not attempted here**, matching the ticket's own
  recommendation ("לא בכרטיס הזה"). [MEH-1590](https://linear.app/mehamakor/issue/MEH-1590)
  documents `e2e-gate` as broken beneath the live gate — making it required
  today would block every merge to `staging`. `.claude/rules/testing.md`
  already documents (§ "Required status checks + docs-only merge") that only
  `CI gate` and `Deploy gate` are the two contexts `protect-staging` (ruleset
  15240090) actually requires; this patch adds one paragraph stating the
  auto-merge consequence of that fact (below), not a policy change.
- **The concurrency group itself** (`pr-checks.yml:36-41`) is unchanged — this
  patch only changes how the aggregator *reads* a `cancelled` result, not
  what causes one.

---

## 5 · Companion doc change (not CC-deny — already applied)

`.claude/rules/testing.md` § "Required status checks + docs-only merge
(MEH-716)" gained one paragraph making the auto-merge consequence explicit:
with auto-merge armed, a PR lands the instant `CI gate` + `Deploy gate` report
`success`, regardless of any verbal instruction like "wait for two consecutive
green E2E runs" — that instruction is enforceable only by *not arming
auto-merge*, never by the merge machinery itself, because `E2E gate` carries
no vote in what merges. See that file for the full paragraph; it required no
`.github/workflows/**` edit and is not part of what Sapir needs to apply here.
