# MEH-1868 chunk 3 — arm the Knip gate via the ratchet

**Staged for Sapir. CC cannot apply this**: `.github/workflows/**` is mechanically
denied (`.claude/settings.json` `permissions.deny` → `Edit/Write/MultiEdit(.github/workflows/**)`),
per MEH-1837.

**Precondition — already met.** The script, the baseline and the npm scripts land
in the same PR as this file. Applying the diff below without them red-lines the
job on a missing script, so apply it only after that PR is on `staging`.

**As of 2026-08-12**, against `pr-checks.yml` at `origin/staging` (`70b591f5`).
Line numbers drift — match on content, not position.

---

## Why the current job is a non-gate (both swallows, measured)

`frontend-knip` carries **two** independent swallows, the same "belt-and-braces"
pair chunk 0 found on `backend-mypy`:

| Where | Line | What |
|---|---|---|
| job level | `:555` | `continue-on-error: true` |
| step level | `:574` | `npm run knip \|\| true` |

**Removing only one buys nothing**, and this is the part worth being explicit
about: with `continue-on-error: true` on the job, `needs.frontend-knip.result`
resolves to **`success`** even when the step exits non-zero. So the aggregator's
existing `check "Frontend Knip (warn-only)" "$R_FRONTEND_KNIP"` at `:806` is
already wired — it is simply being fed a result that cannot be anything but
`success`. Both layers go, or the gate stays decorative.

---

## The diff — four changes

### 1 · Drop the job-level swallow (`:549-556`)

```diff
   frontend-knip:
-    name: Frontend Knip (dead code, warn-only)
+    name: Frontend Knip (dead-code ratchet)
     needs: changes
     if: ${{ needs.changes.outputs.frontend == 'true' || needs.changes.outputs.workflows == 'true' }}
     runs-on: ubuntu-latest
     timeout-minutes: 10
-    continue-on-error: true
     defaults:
```

### 2 · Replace the warn-only step with the ratchet (`:573-574`)

```diff
-      - name: Run Knip (warn-only — findings logged, check passes)
-        run: npm run knip || true
+      - name: Ratchet self-test (the comparator must still discriminate)
+        run: node ../scripts/checks/lint-ratchet.mjs --self-test
+
+      - name: Knip ratchet (baseline frozen; only NEW findings fail)
+        run: npm run lint:ratchet
```

**The self-test step exists because the gate is otherwise unfalsifiable.** If
`compare()` ever regressed to returning zero violations unconditionally,
`lint:ratchet` would go **permanently green** and nothing in CI would notice — a
green with a second cause, which is exactly what this repo's testing rules exist
to catch. Running the self-test first means a broken comparator fails loudly
*before* its verdict is read. Same guarantee `skills-audit.yml` gets from
`audit-skills.sh --self-test`.

> ### ⚠️ Expected exit code is **0**, not 1 — do not copy `skills-audit.yml` here
>
> The CI reviewer suggested this step and cited `audit-skills.yml` as precedent,
> **including its assertion that the self-test must exit 1**. The finding was
> right and the prescription is wrong for this script; applying it verbatim
> would red the gate on every run, permanently.
>
> The two are not the same kind of self-test. Measured 2026-08-12:
>
> | Script | On success | Why |
> |---|---|---|
> | `audit-skills.sh --self-test` | **exit 1** | it audits a deliberately *malicious* fixture; exit 1 **is** the pass — `skills-audit.yml:66` wraps it in `if … then` and fails when it succeeds |
> | `lint-ratchet.mjs --self-test` | **exit 0** | an ordinary assertion suite: 13 assertions, 0 failed. It exits 1 when an assertion *fails* |
>
> So `run:` with no wrapper is correct here — the step fails iff the self-test
> fails. Verified: a broken comparator (`compare()` iterating baseline keys only)
> exits **1** with `FAILED: new-key/blocks`, and the restored version exits 0.

`npm run lint:ratchet` → `node ../scripts/checks/lint-ratchet.mjs`. The job's
`working-directory: frontend` is what makes the relative path correct, and the
script re-derives the repo root from its own location regardless.

### 3 · Update the job comment (`:545-548`)

```diff
   # JOB 6: frontend-knip (MEH-562 Layer 2)
   # Dead-code + unused-deps detection.
-  # Two-layer warn-only — see backend-mypy comment above.
+  # Ratcheted (MEH-1868): scripts/checks/lint-ratchet-baseline.tsv freezes the
+  # findings that existed at arming time. Everything in the baseline is
+  # grandfathered; only counts that RISE fail the job. Nobody is asked to clean
+  # up existing findings — that is the design, not an oversight.
```

### 4 · `check` → `check_ran` in the aggregator (`:806`)

```diff
-            check "Frontend Knip (warn-only)" "$R_FRONTEND_KNIP"
+            check_ran "Frontend Knip (ratchet)" "$R_FRONTEND_KNIP"
```

**Why this one matters and is easy to skip.** `check` accepts `skipped` as a
pass. Once the job can genuinely fail, a draft-suppressed or otherwise skipped
run would report green having never executed — the skip-green mechanic MEH-1582
exists to close, and the file's own comment at `:751-753` says so: *"a job that
the gate is actively enforcing must have RUN… `skipped` there means an absence of
evidence, not a pass."*

Note the job's `if:` already restricts it to `frontend == 'true' || workflows ==
'true'`, and the `check_ran` call sits inside the `if [ "$FRONTEND_TOUCHED" =
"true" ]` branch — so a backend-only or docs-only PR never reaches it. The
strictness applies exactly where the job was supposed to run.

---

## Absence assertion (the card asks for this numerically)

After applying, `pr-checks.yml` must contain **exactly one** Knip invocation —
the old warn-only step is *replaced*, never left alongside:

```bash
grep -c "npm run knip\|npm run lint:ratchet" .github/workflows/pr-checks.yml
# expected: 1   (the lint:ratchet line)

grep -n "npm run knip" .github/workflows/pr-checks.yml
# expected: no output
```

Measured on `origin/staging` before the change: `npm run knip` appears **once**,
at `:574`. `npm run lint:ratchet` appears **zero** times.

---

## What this does NOT touch

- **`backend-mypy`.** Its two swallows (`:524` `continue-on-error`, `:541`
  `|| true`) are still present, and `uv run mypy app/auth.py --strict || true` is
  unchanged on `staging` — chunk 0's script landed but its workflow half never
  did. Same shape, different card-chunk; not bundled here.
- **`frontend-tsc-strict`** and **`linear-mentions`** — both explicitly dropped
  from scope by chunk 1's Phase 0 findings.
- **Any existing Knip finding.** Zero are fixed. The baseline grandfathers all
  46.

---

## ❓ One question for Sapir, and it is the only judgement call here

**Should `frontend-knip` become a genuinely merge-blocking leg, or stay
reporting-only with a real signal?**

Changes 1–2 alone make the job *fail visibly* on a new finding. Change 4 makes
that failure **block the merge**, because `ci-gate` is a required context.

- **Arming it fully (all four)** is what the card asks for and what makes the
  gate real. Risk: a PR that adds a legitimately-unused export — a component
  landing one PR ahead of its consumer — is blocked until the baseline is bumped
  with `--allow-increase`.
- **Changes 1–3 only** gives an honest red without merge-blocking, which is a
  strictly better state than today and reversible in one line.

**Recommendation: apply all four.** The card's own evidence is that a gate which
does not block is a gate nobody reads, and the escape hatch is deliberate and
cheap — `npm run lint:ratchet:baseline -- --allow-increase`, with the rise
justified in the PR body. But this is a merge-blocking change to a required gate,
so it is yours, not CC's.
