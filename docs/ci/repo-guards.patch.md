# `repo-guards` — workflow patch (MEH-999)

> **Supersedes `docs/ci/ui-pattern-guard.patch.md`** (deleted in this PR, never
> applied). That doc wired **one named job per guard**, which meant every future
> guard cost another workflow edit — and `.github/workflows/**` is **CC-deny
> (MEH-671)**, so each one bottlenecked on Sapir. This patch wires a **generic
> dispatcher job instead: apply it once and no guard ever needs a workflow edit
> again.** If you were about to apply the old doc, apply this one instead — it
> covers `ui-pattern-guard` and everything after it.

`.github/workflows/**` is CC-deny, so Claude Code cannot wire this job itself.
The scripts are merged and runnable today; this doc is the exact YAML for
**Sapir** to apply to `.github/workflows/pr-checks.yml`.

Same shape as [`docs/ci/e2e-gate.patch.md`](./e2e-gate.patch.md).

---

## What it runs

`scripts/checks/run-all.sh` — a dispatcher that runs **every executable
`scripts/checks/*.sh`**, aggregates the results, and exits 1 if any guard failed.

- Runs all guards even after one fails — one CI run reports every broken guard.
- Passing guards stay quiet; a failing guard's own output is echoed inline,
  followed by a `PASS`/`FAIL` summary naming each guard.
- Zero guards found → `NOTICE` + exit 0, not a failure.
- A `*.sh` that lost its `+x` bit is reported as a `NOTICE`, never silently
  skipped (the self-disabling class MEH-1030 closed for guarded registries).

Guards live behind it, not in the workflow:

| Guard | Guards against |
|---|---|
| `scripts/checks/ui-pattern-guard.sh` | Producer-dashboard pages hand-rolling `EmptyState` / `BackLink`, and text arrows in BackLink-owned `he.json` back keys (the three 26/07 QA-sweep defects). |

**Adding a guard after this lands requires no workflow change** — drop an
executable `*.sh` into `scripts/checks/`. The authoring contract is
[`scripts/checks/README.md`](../../scripts/checks/README.md).

Runtime is ~1s: no history checkout, no Node, no install.

---

## Step 1 — add the job

Insert alongside the other lightweight always-run gates (near `qa-artifacts-size`,
`pr-checks.yml:76`):

```yaml
  repo-guards:
    name: Repo guards
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v7
      - name: Run every guard in scripts/checks/ (MEH-999)
        run: bash scripts/checks/run-all.sh
```

No `paths-filter` gating. Two reasons, both carried over from the superseded
doc and still true:

1. The dispatcher is ~1s, so always-run costs nothing.
2. Always-run keeps it off the "skipped required check reports as `Expected`"
   trap (MEH-892) if the job is ever promoted to a directly-required context.

A third reason is new and specific to the dispatcher: a paths-filter here would
have to be the **union of the filters of every guard that will ever exist** —
it would silently go stale the first time a guard watches a new path, which is
precisely the drift class these guards exist to catch.

## Step 2 — wire it into the `CI gate (required)` aggregator

Three edits inside the existing `ci-gate` job (`pr-checks.yml:644`):

**2a.** add to `needs:` (after `- qa-artifacts-size`, `pr-checks.yml:650`):

```yaml
      - repo-guards
```

**2b.** add to the step `env:` block (after `R_QA_SIZE`, `pr-checks.yml:669`):

```yaml
          R_REPO_GUARDS: ${{ needs.repo-guards.result }}
```

**2c.** add to the always-required leg (after the `qa-artifacts size cap`
`check` call, `pr-checks.yml:708`):

```bash
          check "Repo guards" "$R_REPO_GUARDS"
```

It belongs in the **stack-independent** block, not behind
`if [ "$FRONTEND_TOUCHED" = "true" ]`. Guards read whatever they read —
`ui-pattern-guard` rule 3 reads `frontend/messages/he.json`, and future guards
may read backend or config paths — so pinning the leg to one stack would mean
revisiting the workflow every time that assumption changes. On a docs/config-only
PR the guards are a no-op that costs ~1s, while `always()` plus the existing
`ok()` helper (`pr-checks.yml:681-686`, which treats `skipped` as pass) keeps
those PRs green.

**No ruleset change is needed.** `CI gate (required)` is already a required
context on ruleset 15240090; adding a leg to its aggregator makes the guards
blocking without touching the ruleset — the same mechanism `qa-artifacts-size`
uses (MEH-1156).

---

## What is deliberately NOT in this job

`scripts/check_env_drift.sh` stays its own `env-drift` job (`pr-checks.yml:468`)
with its own named aggregator leg (`pr-checks.yml:674` + `:709`). It is not a
zero-config grep guard — it diffs env vars read by code against every
`.env.example` across both stacks, with a documented reason at
`pr-checks.yml:461-467` for why it is not paths-filter gated. Folding it in would
collapse a named required check into a generic one (a red `env-drift` would
surface as "Repo guards FAIL") and would cost a workflow edit to *remove* a
required leg — strictly more risk than the zero gain. Its one-time workflow cost
is already paid; `scripts/checks/` is for guards that would otherwise need a new
one.

---

## Verification already done (CC side)

All four run against this branch, from the repo root unless noted:

1. **Clean `staging`** → exit **0**, summary shows `PASS ui-pattern-guard`.
2. **Planted failing guard** (`aaa-temp-fail.sh`, sorts *before* the real guard)
   → exit **1**; **both** guards ran; summary names the failing one; its output
   is echoed inline. Removed afterwards.
3. **Failing guard alongside passing guards** → exit **1**, `3 run`, no early
   abort — the failing guard sorts first and the two passing guards after it
   still ran.
4. **`shellcheck` clean** on `run-all.sh` and `ui-pattern-guard.sh` (v0.11.0,
   exit 0).

Also verified: zero-guards → `NOTICE` + exit 0; a non-executable `*.sh` →
`NOTICE`, not run, exit unaffected; dispatcher run from `/` produces identical
output to a run from the repo root.

Full console output is pasted in the PR body.

## Known gap to close later (inherited)

`ui-pattern-guard` rule 3 is scoped to the namespaces MEH-999 migrated. Two keys
ending in `.back` still carry a `→` and are **not** flagged —
`recipes.detail.back` and the admin-panel `back` (both `frontend/messages/he.json`).
Their pages do not use `BackLink`, so stripping the arrow would leave them with
no arrow at all. Widen `NAMESPACES` in the script as each page is migrated; the
gap is documented in the script header too. Unchanged by this patch.
