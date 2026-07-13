# E2E gate (required) — YAML patch ל-`e2e.yml` (MEH-1201)

> **הבלוק הזה מיועד לספיר להדבקה ידנית.** `.github/workflows/**` הוא CC-deny
> (`.claude/settings.json`, MEH-671) — CC כותב את ה-diff בקובץ `.md` הזה בלבד
> ואינו נוגע ב-workflow. הדביקי את הבלוק, מזגי, ואז הוסיפי את ה-context
> `E2E gate (required)` ל-required checks של ה-ruleset `protect-staging`
> (ID 15240090).

## מה זה עושה

הופך את שער ה-E2E (mobile Pixel 5 + VRT parity, הרצים בתוך job `e2e`) ל-**חוסם
merge** — בלי לשבור PRs של docs-only — דרך aggregator בתבנית `ci-gate`/`deploy-gate`
הקיימת. ה-job הזה תמיד רץ (`if: always()`), ולכן כש-`e2e` מדולג ב-paths-filter
(docs-only) ה-gate עדיין מדווח `success` וה-PR מתמזג נקי.

**למה aggregator ולא להוסיף את `Playwright E2E (Vercel preview)` ישירות ל-ruleset:**
MEH-892 הוכיח ב-merge אמיתי (405: `6 of 6 required status checks have not
succeeded: 5 expected`) ש-job שדולג ורשום **ישירות** כ-required נקרא `Expected`
וחוסם תחת ה-ruleset `protect-staging`. הוספת ה-job הישיר ב-13/07 הוחזרה באותו יום
בגלל בדיוק זה (ראו ADR-028 Appendix A amendment). ה-aggregator הוא המסלול המאושר —
הוא, ולא ה-job הישיר, מתווסף ל-ruleset.

## איפה להדביק

בסוף `e2e.yml`, **אחרי** ה-job `e2e` (כרגע נגמר בשורה 227, `retention-days: 7`),
כ-job נוסף תחת `jobs:` (הזחה של 2 רווחים, כמו `filter:` ו-`e2e:`). אין לשנות שום
job קיים; אין לשנות את שדה ה-`name:` של `e2e` (`Playwright E2E (Vercel preview)`)
— שם זה הוא זהות ה-branch-protection (`e2e.yml:77-80`).

## הבלוק (English — YAML/job names/paths):

```yaml
  # ─────────────────────────────────────────────────────────────────
  # E2E GATE (MEH-1201) — required-check aggregator for the E2E suite.
  # Mirrors ci-gate (pr-checks.yml:522-616) / deploy-gate (deploy.yml:379-409):
  # `if: always()` + `needs`, so the gate reports its own status regardless of
  # whether the E2E job ran, skipped, or failed. On a docs-only PR the `e2e`
  # job skips via paths-filter (needs.filter.outputs.frontend == 'false'), and
  # a skipped need evaluates as pass here — so docs-only still merges clean.
  #
  # MEH-892: a *skipped* job listed DIRECTLY in the protect-staging ruleset
  # reads as "Expected" and BLOCKS merge (real 405 on a docs-only PR). That is
  # why the E2E job must NOT be added to the ruleset — THIS aggregator is the
  # required context instead. Add `E2E gate (required)` to ruleset 15240090.
  # ─────────────────────────────────────────────────────────────────
  e2e-gate:
    name: E2E gate (required)
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

          # Guard the paths-filter result first — mirrors ci-gate's R_CHANGES
          # guard (pr-checks.yml:577-580). If the filter itself broke we can't
          # trust the e2e skip decision, so block. (skipped counts as pass, but
          # `filter` has no job-level `if:` so it always runs.)
          if ! ok "$R_FILTER"; then
            echo "::error::Paths-filter job did not succeed (result=$R_FILTER) — cannot determine E2E scope."
            exit 1
          fi

          # success = mobile Pixel 5 + VRT specs green.
          # skipped  = docs-only PR (paths-filter) or dependabot — pass.
          # failure/cancelled = block.
          check "Playwright E2E (Vercel preview)" "$R_E2E"

          if [ "$fail" -ne 0 ]; then
            echo "::error::E2E gate failed — Playwright E2E (mobile Pixel 5 + VRT) did not pass."
            exit 1
          fi
          echo "E2E gate passed."
```

## אחרי ההדבקה — צעדי ספיר (ruleset UI)

1. מזגי את ה-PR של e2e.yml (או הדביקי ידנית + push כעצמך — push עם `GITHUB_TOKEN`
   לא מפעיל workflows; ראו הערת VRT-baseline ב-CLAUDE.md).
2. ודאי ש-`E2E gate (required)` רץ פעם אחת על staging כדי ש-GitHub יציע את שם
   ה-context.
3. Settings → Rules → Rulesets → `protect-staging` (ID 15240090) → הוסיפי את
   `E2E gate (required)` ל-required status checks.
4. **אימות:** PR של docs-only מתמזג נקי (ה-gate = success על e2e שדולג); PR של
   frontend עם E2E אדום נחסם (ה-gate = failure).

## הערת consistency

הבלוק תואם בדיוק ל-`ok()`/`check()` של `ci-gate` (`pr-checks.yml:559-573`) ושל
`deploy-gate` (`deploy.yml:394-395`) — לא הומצא style חדש. `success|skipped` עוברים;
`failure|cancelled` חוסמים. שער ה-VRT parity אינו job נפרד — הוא רץ בתוך אותו
`npx playwright test` של `e2e` (`e2e.yml:162`, ADR-028 Gate inventory), ולכן חסימת
`e2e` חוסמת גם אותו.
