# «‏executed ירד» — YAML patch for `e2e.yml` (MEH-1904 §5.2)

> **The block here is for Sapir to apply by hand.** `.github/workflows/**` is
> CC-deny (`.claude/settings.json`, MEH-671) — CC writes the diff into this `.md`
> and does not touch the workflow. **Nothing here has been applied.**

---

## ⚠️ Read this before applying: two thirds of MEH-1904 §5 are already staged elsewhere

MEH-1904 §5 asks for three things. **Only the third is unstaged**, and staging
all three here would put two owners on one fact — the smell `workflow.md`
names, and the one this note exists to prevent.

| §5 ask | Where it lives | Status |
|---|---|---|
| 5.1 — the verdict must come from the counts, not from the exit code | [`meh-2196-qa-three-state.patch.md`](./meh-2196-qa-three-state.patch.md) + the shipped `scripts/ci/qa-report-verdict.cjs` | staged, with a self-test that proves the discrimination |
| 5.3 — `flaky` visible even on a green run | same patch — `qa-report-verdict.cjs` prints the counts line unconditionally | staged |
| **5.2 — a run whose `executed` dropped must say so** | **nowhere** | **this file** |

**Apply `meh-2196-qa-three-state.patch.md` first.** The hunk below edits the
block that patch installs, and does not apply to the code on `staging` today.

### One deliberate divergence from MEH-1904's own wording, recorded rather than silently taken

§5.1 asks for a distinct `RED (flake gate) — 0 failed, 2 flaky` headline,
separate from a real failure. **MEH-2196 does not do that** — it folds `flaky`
into `FAIL`, on the grounds that the suite runs with `--fail-on-flaky-tests`,
which makes a flaky result a failing result by definition
(`qa-report-verdict.cjs:51-55`). That is a defensible answer to the same
question and it is the one carrying a self-test, so it wins. If Sapir prefers
MEH-1904's taxonomy, that is a change to `qa-report-verdict.cjs` — a normal CC
PR, not a workflow edit.

---

## What §5.2 is actually about

A run that goes green **because fewer specs ran** is indistinguishable, in the
PR comment, from a run that went green because the code got better. The counts
that would expose it are already printed; nothing compares them to anything.

Measured, MEH-1904 §1 case 3: PR #2597 reported `executed=191 … skipped=33`
where the previous run on the same branch reported `194 / 30`. Three specs
stopped running, the verdict improved, and the comment said nothing. That is
the fake-coverage shape MEH-1717 was opened on, and today it is invisible.

### Where the previous run's numbers come from — no new API, no artifact

The comment step already lists the PR's comments and finds its own previous
one by marker (`existing`). So the last reported run's counts are available for
free **if the comment carries them in a machine-readable form**. The hunk below
writes an HTML-comment data line and reads it back on the next run.

Two ordering constraints, both load-bearing:

- The `marker` stays the **first** line — `existing` is found by `startsWith`.
- The data line goes **last**, and is read inside `try/catch`. A comment written
  before this hunk lands has no data line; that must read as "no previous
  numbers", never as a crash or as zero.

**A cancelled run does not post** (the step's own `if:`), so the comment always
holds the last *reported* run, which is the correct comparand.

---

## The hunk — applies AFTER `meh-2196-qa-three-state.patch.md`

Inside the `Post QA report comment` step's `script:`, where that patch leaves
`const verdict = require(...)` and builds the comment body:

```diff
             const { data: comments } = await github.rest.issues.listComments({
               ...context.repo,
               issue_number: context.issue.number,
               per_page: 100,
             });
             const existing = comments.find((c) => c.body && c.body.startsWith(marker));
+
+            // MEH-1904 §5.2 — the previous REPORTED run on this PR. A cancelled
+            // run never posts, so the standing comment is the right comparand.
+            // Absent or malformed reads as "no previous numbers"; it must never
+            // read as zero, which would claim a drop on every first run.
+            let prev = null;
+            if (existing && existing.body) {
+              const m = existing.body.match(/<!-- e2e-qa-data (\{.*?\}) -->/);
+              if (m) { try { prev = JSON.parse(m[1]); } catch (_) { prev = null; } }
+            }
+
+            const lines = [body];
+
+            // A verdict that improved while coverage shrank is not an
+            // improvement. Guarded on BOTH being real numbers: `executed`
+            // is null when the counts never arrived (MEH-2196's NO VERDICT
+            // state), and "null < 194" is true in JS — which would print a
+            // drop for a run that measured nothing at all.
+            if (
+              prev &&
+              typeof prev.executed === "number" &&
+              typeof executed === "number" &&
+              executed < prev.executed
+            ) {
+              const fewer = prev.executed - executed;
+              lines.push(
+                "",
+                `🔻 **${executed} executed (was ${prev.executed}) — ${fewer} spec${fewer === 1 ? "" : "s"} fewer ran.** ` +
+                  `Skipped went ${prev.skipped ?? "?"} → ${skipped ?? "?"}. ` +
+                  "Find out what stopped running before reading this comment as progress.",
+              );
+            }
+
+            lines.push(
+              "",
+              `<!-- e2e-qa-data ${JSON.stringify({
+                executed, skipped,
+                sha: context.payload.pull_request.head.sha.slice(0, 7),
+                runId: String(context.runId),
+              })} -->`,
+            );
+            const finalBody = lines.join("\n");
```

…and the upsert calls then send `finalBody` instead of `body`.

> **Variable names depend on what MEH-2196's Step 2 leaves in scope.** That
> patch computes the verdict in `qa-report-verdict.cjs` and assembles the
> comment from its return; `executed` / `skipped` above are the numeric values
> the verdict object already carries (`toCount`, so `number | null` — which is
> exactly why both `typeof` guards are there). **Reconcile the names against the
> Step-2 text at apply time rather than trusting this hunk's identifiers.**

---

## Verifying it discriminates, which is the whole point

A block that only ever prints on a real drop is untestable by observation —
nobody can tell a working comparison from one that never fires. Two runs
settle it, in this order:

1. **It fires.** Push a commit adding `test.skip()` to three specs. Expect
   `🔻 … 3 specs fewer ran`, and expect it to name the previous number.
2. **It does not fire on the first run of a PR.** Open any new PR. Expect the
   comment with **no** `🔻` block — there is nothing to compare against, and a
   first run that claims a drop is the failure mode this checks for.

Run (2) even if (1) passes. Only (1) proves the comparison exists; only (2)
proves it is a comparison rather than an unconditional line.

---

## What this does NOT do

- **It does not compare across branches.** The comparand is this PR's own last
  comment. A first run has nothing to compare against and correctly says nothing.
- **It does not change any verdict or exit code.** Purely additive text.
- **It does not fix the specs that stopped running.** Naming the drop is the
  whole job; MEH-1717 owns the specs.

Refs MEH-1904 · builds on MEH-2196 · related MEH-1717, MEH-1742.
