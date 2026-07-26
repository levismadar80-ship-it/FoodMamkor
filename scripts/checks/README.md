# `scripts/checks/` — repo guards

**To add a guard: drop an executable `*.sh` here that exits non-zero on violation
and prints `file:line`. No workflow edit required.**

That sentence is the whole point of this directory. `.github/workflows/**` is
**CC-deny (MEH-671)**, so before this existed every new guard cost Sapir a
workflow edit and guards were bottlenecked on one person. Now a single generic
job runs [`run-all.sh`](./run-all.sh), which discovers and runs everything in
here — thin YAML, fat script.

---

## The contract

A guard is any file in this directory that satisfies all four:

| Requirement | Why |
|---|---|
| **Executable** (`chmod +x`) and named `*.sh` | How the dispatcher identifies a guard. A non-executable `.sh` is reported as a `NOTICE` and **not run** — never silently skipped. |
| **Directly in `scripts/checks/`** (no subdirectories) | Discovery is `find -maxdepth 1`. Helper libraries can live in a subdirectory; they just won't be run as guards. |
| **Exit 0 = pass, non-zero = fail** | The only signal the dispatcher reads. |
| **Prints violations as `file:line`** | So the CI log is actionable without re-running anything locally. |

Everything else is up to the guard. It gets its own process, so it sets its own
strict mode and cannot affect its siblings.

### Also expected, by convention

- **Run from the repo root regardless of cwd.** Derive it rather than assuming:
  ```bash
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$REPO_ROOT" || exit 1   # the `|| exit 1` is load-bearing — see below
  ```
  Without `|| exit 1`, a failed `cd` leaves the guard grepping the wrong
  directory, matching nothing, and exiting **0** — a silently-passing check that
  reports `PASS`. `shellcheck` flags this as SC2164.
- **Stay fast.** The whole dispatcher run should stay ~1s. These are grep-level
  shape checks; no `npm install`, no full-history checkout, no network.
- **Carry a file header** per the exec §14 contract
  (`.claude/rules/code-execution.md`) — `Purpose` / `Does NOT` / `History` earn
  their keep most on a guard, where the *scope* of a rule is the thing future
  readers get wrong.
- **Be grep-level on purpose.** A grep a reader can verify by eye beats a parser
  nobody maintains. Simple patterns false-positive, which is what the escape
  hatch below is for.

---

## Escape hatch — `guard-ok: <reason>`

Every guard should honour the same suppression marker, so contributors learn it
once:

```js
// guard-ok: this page's back link predates BackLink and ships its own icon
```

- Put `guard-ok: <reason>` in a comment **on the offending line, or on either
  adjacent line (±1)**.
- **A reason is required.** The bare marker is not enough — the point is that
  the next reader learns *why* the exception exists.
- The ±1 window and the naming both mirror the `rtl-ok` convention in
  `.claude/hooks/check-rtl.sh`, which is where this repo's suppression idiom
  comes from.

Reference implementation: `suppressed()` in
[`ui-pattern-guard.sh`](./ui-pattern-guard.sh).

---

## Running them

```bash
bash scripts/checks/run-all.sh        # every guard; works from any cwd
bash scripts/checks/ui-pattern-guard.sh   # just one, while iterating on it
```

`run-all.sh` runs **every** guard even after one fails — one run tells you about
all of them — then exits 1 if any failed. Passing guards stay quiet; a failing
guard's own output is echoed inline, followed by a `PASS`/`FAIL` summary.

Zero guards found is a `NOTICE` and exit **0**, not a failure.

---

## Current guards

| Guard | Guards against | Ticket |
|---|---|---|
| [`ui-pattern-guard.sh`](./ui-pattern-guard.sh) | Producer-dashboard pages hand-rolling `EmptyState` / `BackLink` / text arrows in `he.json` back keys | MEH-999 |
| [`changelog-branch-guard.sh`](./changelog-branch-guard.sh) | A **code** PR also carrying `docs/CHANGELOG.md` / `HANDOFF.md` (MEH-1372). Docs-only PRs still pass. `--self-test` proves all three cases. | MEH-1602 |

### The one guard that needs a diff

`changelog-branch-guard.sh` is the first guard here that reasons about the
**PR's diff** rather than the working tree, which the `repo-guards` job does not
hand it: that job checks out shallow (depth 1) and passes no base SHA. The guard
therefore resolves its own base — `$CHANGELOG_GUARD_BASE`, else
`$GITHUB_BASE_REF` (fetched at `--depth=1` when absent), else the local default
branch — and **exits non-zero if it can resolve none**, rather than reporting OK
for a check it never ran. If you write another diff-based guard, reuse that
ladder; a guard that silently passes when it cannot see the diff is worse than
no guard.

## Not run from here

`scripts/check_env_drift.sh` keeps its **own** CI job (`env-drift`,
`pr-checks.yml:468`) and its own named leg in the `CI gate (required)`
aggregator. It is not a zero-config grep guard — it diffs env vars read by code
against every `.env.example` across both stacks — and folding it in would
collapse a named required check into a generic one. Its workflow edit is already
spent; this directory is for guards that would otherwise need a new one.

---

## CI wiring

One job, `repo-guards`, runs `bash scripts/checks/run-all.sh` and is wired into
the `CI gate (required)` aggregator. Because it is generic, **adding a guard
never touches it.** The exact YAML for Sapir to apply is
[`docs/ci/repo-guards.patch.md`](../../docs/ci/repo-guards.patch.md).
