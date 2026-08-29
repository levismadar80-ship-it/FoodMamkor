# `E2E gate` — skip must carry a reason, not just a value (MEH-1742)

`.github/workflows/**` is **CC-deny (MEH-671)**, so Claude Code cannot apply this
itself. This doc is the exact edit for **Sapir** to make in
`.github/workflows/e2e.yml`.

Same shape and same precedent as
[`docs/ci/ci-gate-skip-green.patch.md`](./ci-gate-skip-green.patch.md) (MEH-1582
— **applied**, `pr-checks.yml:767-821`) and
[`scripts/ci-gate-selftest.sh`](../../scripts/ci-gate-selftest.sh), whose
`strict_ok`/`check_ran` split this patch reuses verbatim on the `e2e-gate` job.

**Not the same bug as** [`e2e-skip-green.patch.md`](./e2e-skip-green.patch.md)
(MEH-1799 — a `push`-to-`staging` freshness problem) or
[`e2e-concurrency.patch.md`](./e2e-concurrency.patch.md) (a cancelled-run
problem). This one is about a `pull_request` run where `e2e` reports `skipped`
for a reason the gate cannot see.

---

## 1 · The gap, from the source

`e2e.yml:563-598` (current, unpatched):

```yaml
  e2e-gate:
    name: E2E gate
    if: always()
    needs: [filter, e2e]
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Aggregate E2E required-check result
        env:
          R_FILTER: ${{ needs.filter.result }}
          R_E2E: ${{ needs.e2e.result }}
        run: |
          set -euo pipefail
          fail=0
          ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
          check() { if ok "$2"; then echo "  OK  $1: $2"; else echo "  FAIL $1: $2"; fail=1; fi; }

          if ! ok "$R_FILTER"; then
            echo "::error::Paths-filter job did not succeed (result=$R_FILTER) — cannot determine E2E scope."
            exit 1
          fi

          check "Playwright E2E (Vercel preview)" "$R_E2E"

          if [ "$fail" -ne 0 ]; then
            echo "::error::E2E gate failed — Playwright E2E (mobile Pixel 5 + VRT) did not pass."
            exit 1
          fi
          echo "E2E gate passed."
```

`needs.e2e.result` collapses to exactly one of `success | failure | cancelled |
skipped` — GitHub Actions does not expose *why* a job skipped. So today, two
worlds produce the identical token `skipped`, and `ok()` cannot tell them apart:

| World | Why `e2e` is `skipped` | Should the gate pass? |
|---|---|---|
| Docs-only PR | `filter` found no `frontend/**`/`public/**`/`package*.json` change — **expected**, nothing to check | ✅ yes |
| A frontend PR, but the job's own `if:` (`e2e.yml:89-91`, dependabot/draft/other future condition) suppressed it for a reason unrelated to scope | ❌ **no — this PR's frontend change went unchecked** | should be RED, is green today |

The `filter` job already computes the answer and exposes it:

```yaml
  filter:
      outputs:
        frontend: ${{ steps.filter.outputs.frontend }}
```

`e2e-gate` already lists `filter` in its `needs:` — it just never reads
`needs.filter.outputs.frontend`, the one signal that would let it require
`success` instead of accepting any `skipped`.

---

## 2 · The edit

**Add**, importing the exact `strict_ok`/`check_ran` pair already live in
`pr-checks.yml:767-775` (do not reinvent it — same predicate, same names):

```diff
       - name: Aggregate E2E required-check result
         env:
           R_FILTER: ${{ needs.filter.result }}
           R_E2E: ${{ needs.e2e.result }}
+          FRONTEND_TOUCHED: ${{ needs.filter.outputs.frontend }}
         run: |
           set -euo pipefail
           fail=0
           ok() { case "$1" in success|skipped) return 0 ;; *) return 1 ;; esac; }
+          strict_ok() { case "$1" in success) return 0 ;; *) return 1 ;; esac; }
           check() { if ok "$2"; then echo "  OK  $1: $2"; else echo "  FAIL $1: $2"; fail=1; fi; }
+          check_ran() {
+            if strict_ok "$2"; then
+              echo "  OK  $1: $2"
+            else
+              echo "  FAIL $1: $2 (required job did not run — 'skipped' is not a pass)"
+              fail=1
+            fi
+          }

           if ! ok "$R_FILTER"; then
             echo "::error::Paths-filter job did not succeed (result=$R_FILTER) — cannot determine E2E scope."
             exit 1
           fi

-          check "Playwright E2E (Vercel preview)" "$R_E2E"
+          # MEH-1742: a skip with no known cause is not the same as a skip
+          # paths-filter intended. Only "frontend untouched" is a legitimate
+          # reason to accept `skipped` here — every other case, `e2e` was
+          # supposed to run and must show `success`.
+          if [ "$FRONTEND_TOUCHED" = "true" ]; then
+            check_ran "Playwright E2E (Vercel preview)" "$R_E2E"
+          else
+            check "Playwright E2E (Vercel preview)" "$R_E2E"
+          fi
```

`ok()` stays exactly as-is and still governs the `$R_FILTER` guard above it —
unchanged, same as MEH-1582 left `pr-checks.yml`'s `ok()` alone for its own
`$R_CHANGES` guard.

### 2.1 · Why this doesn't reopen MEH-892 or the docs-only path

The failure MEH-892 named — a **required, always-on** context reading `Expected`
on a skip — is a ruleset-level concern about the aggregator's own status, not
about what `check_ran` decides internally. `E2E gate` is not (yet) a required
context in `protect-staging` (`docs/ci/e2e-gate.patch.md`'s live status block),
so this patch changes nothing about that. And the docs-only path is exactly
scenario B below — `FRONTEND_TOUCHED=false` keeps the lenient `check`, so a
docs-only PR is untouched by this change; it is the *other* half of the
condition, not a regression of the first.

---

## 3 · Proof — failing-by-construction, and it discriminates

Per `.claude/rules/testing.md` (MEH-1619 — a guard never shown failing on its
own defect is not evidence it discriminates), `scripts/e2e-gate-selftest.sh`
(added alongside this doc) feeds the real predicate three scenarios under both
the old and the new logic:

```
  SCENARIO                                  OLD        NEW
  A frontend PR, e2e skipped, no known cause   GREEN      RED
  B docs-only, filter says frontend=false      GREEN      GREEN
  C frontend PR, e2e ran and passed            GREEN      GREEN
```

- **A is the bug this patch closes.** Today a frontend PR whose `e2e` job was
  skipped for an unrelated reason — not paths-filter — reports `E2E gate:
  success`. After the patch, the same inputs report `FAIL … (required job did
  not run — 'skipped' is not a pass)`.
- **B and C must stay green under both predicates** — this patch must not touch
  the legitimate docs-only skip or a normal healthy run. The self-test asserts
  both, not just A, so a change that "fixes" A by breaking B would fail the
  harness before it ever reaches Sapir.

Run: `bash scripts/e2e-gate-selftest.sh`. Exit 0 = the predicates discriminate
exactly as the table says, regardless of whether the patch has been applied yet
(Pass 1 reports live-vs-not-yet-applied by grepping `e2e.yml` for
`check_ran "Playwright E2E`; Pass 2 exercises a local reproduction of both
predicates, per the "exercise the real implementation" principle — Pass 1 is
what catches drift between this harness and the real workflow).

**Not promoted to `scripts/checks/` yet**, same reasoning as
`ci-gate-selftest.sh`: that directory is auto-discovered by the required *Repo
guards* job, and a script reporting a known-unapplied state as informational
would need to not fail the gate before the patch lands — safer to leave it
standalone until Sapir applies this and it can be promoted alongside a real
"is it applied" assertion.

---

## 4 · What this does not fix — named, not silently out of scope

- **Items 3 and 4 of MEH-1742's original scope are already satisfied**,
  predating this ticket:
  - `frontend/e2e/visual/parity.spec.ts`'s `settle()` (MEH-1727) already asserts
    a **positive count** of loaded font-faces via `judgeFonts()`, with its own
    self-test (`__tests__/FontGate.test.js`) — not just `document.fonts.ready`,
    which the function's own docstring names as non-discriminating.
  - `.claude/rules/testing.md` § "A green that has two possible causes is not a
    signal" already documents this exact failure class at length, including the
    MEH-1727 webfont incident by name. This patch's own §1 table is additive to
    that section, not a replacement.
- **A full audit of every other gate in `e2e.yml` for the same weakness**
  (MEH-1742's item 2) is not attempted here — this patch closes the one
  instance the ticket's own evidence (three near-misses, 28/07) pointed at.
  Naming this rather than implying the sweep is complete.
