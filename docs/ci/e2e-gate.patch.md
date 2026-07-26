# E2E gate (required) — YAML patch ל-`e2e.yml` (MEH-1201)

> **הבלוקים כאן מיועדים לספיר להדבקה ידנית.** `.github/workflows/**` הוא CC-deny
> (`.claude/settings.json`, MEH-671) — CC כותב את ה-diff בקובץ `.md` הזה בלבד
> ואינו נוגע ב-workflow.

> ## ⚠️ הנוסח שהיה כאן (13/07) אינו נכון עוד — הסטטוס החי הוא בבלוק "סטטוס" תחת תנאי מוקדם C
>
> **בעל אחד לסטטוס.** שלושת התנאים נבדקים ומתועדים במקום אחד בלבד — בלוק ה"סטטוס"
> שבסוף תנאי מוקדם C. אין לשכפל אותו לכאן: שני מקומות שמחזיקים את אותה עובדה הם
> בדיוק המחלקה שהקובץ הזה נפל בה (MEH-271 smell #1, ו-MEH-1601 תיקן ארבעה בעלים
> של אותה טענה).
>
> בקצרה, ובלי מספרים שיתיישנו: **תנאי A מתקיים** — הסעיף "תנאי מוקדם A" למטה נשמר
> כתיעוד היסטורי של הבאג ושל התיקון, **ואין לבצע אותו שוב**.
>
> ⚠️ ולא לבלבל: העובדה שה-filter מדלג docs-only היא **נכונה**, אבל בשילוב עם
> קבוצת ה-concurrency הקורסת של staging היא מוחקת כיסוי אחרי merge — דחיפת docs
> מבטלת את ריצת הקוד שלפניה ולא מעמידה דבר במקומה. זה **MEH-1601**, והתיקון שלו הוא
> [`docs/ci/e2e-concurrency.patch.md`](./e2e-concurrency.patch.md).
>
> <details><summary>הנוסח הקודם (13/07) — נכון לתאריכו, לא נכון היום</summary>
>
> **ה-paths-filter הנוכחי ב-`e2e.yml` אינו מדלג docs-only.** ה-run של ה-PR הזה
> (docs-only, 5 קבצים `.md` בלבד) הריץ את מלוא סוויטת ה-E2E ו**נכשל** — ה-job
> `Paths filter` פלט `frontend = true` על 5 קבצי docs. לכן שני צעדים חובה **לפני**
> הוספת `E2E gate (required)` ל-ruleset, אחרת **כל PR של docs-only ייחסם** (בדיוק מה
> ש-MEH-1201 בא למנוע).
>
> </details>

---

## מה זה עושה

הופך את שער ה-E2E (mobile Pixel 5 + VRT parity, הרצים בתוך job `e2e`) ל-**חוסם
merge** — בלי לשבור PRs של docs-only — דרך aggregator בתבנית `ci-gate`/`deploy-gate`
הקיימת. ה-job הזה תמיד רץ (`if: always()`), ולכן כש-`e2e` **מדולג** ב-paths-filter
(docs-only) ה-gate מדווח `success` וה-PR מתמזג נקי.

**קריטי:** ה-דילוג הזה עובד רק אחרי שמתקנים את ה-paths-filter (תנאי מוקדם A למטה) —
**וזה כבר בוצע.** ה-`e2e` מדלג היום כראוי על docs-only, ולכן ה-aggregator עושה את
עבודתו. הסטטוס החי של שלושת התנאים נמצא בבלוק "סטטוס" תחת תנאי מוקדם C.

**למה aggregator ולא להוסיף את `Playwright E2E (Vercel preview)` ישירות ל-ruleset:**
MEH-892 הוכיח ב-merge אמיתי (405: `6 of 6 required status checks have not
succeeded: 5 expected`) ש-job שדולג ורשום **ישירות** כ-required נקרא `Expected`
וחוסם תחת ה-ruleset `protect-staging`. הוספת ה-job הישיר ב-13/07 הוחזרה באותו יום
בגלל בדיוק זה (ראו ADR-028 Appendix A amendment). ה-aggregator הוא המסלול המאושר —
הוא, ולא ה-job הישיר, מתווסף ל-ruleset. **אבל** ה-aggregator עוזר רק ל-job שמצליח
לדלג; הוא לא מתקן filter שבור. לכן Prerequisite A.

---

## ✅ תנאי מוקדם A — **בוצע** (26/07). תיעוד היסטורי, אין לבצע שוב

**הראיה (run `29283974004`, job `Paths filter` של PR #1741):**

```
predicate-quantifier: some
Detected 5 changed files
Filter frontend = true
Matching files:
  .claude/rules/testing.md [modified]
  HANDOFF.md [modified]
  docs/CHANGELOG.md [modified]
  docs/ci/e2e-gate.patch.md [added]
  docs/decisions/ADR-028-qa-gates-per-tier.md [modified]
```

**שורש הבעיה:** ה-`filters` של `e2e.yml` (`:62-74`) משתמש ב-`predicate-quantifier:
some` (ברירת המחדל) יחד עם דפוסי-שלילה (`!**/*.md`, `!docs/**`, `!.changeset/**`,
`!CHANGELOG.md`). תחת `some`, כל דפוס-שלילה נבדק בנפרד כ-OR — `!.changeset/**` = "כל
קובץ שאינו תחת `.changeset`" = כמעט כל קובץ → `frontend = true` תמיד. ה-"docs-skip"
של MEH-499 **מעולם לא עבד**; ה-E2E רץ על כל PR. (לשם השוואה: ה-job `changes`
ב-`pr-checks.yml:117-121` **ללא** דפוסי-שלילה — ולכן פולט נכון `frontend=false`
על docs-only; זו הסיבה ששני שערי ה-required עברו ירוק על ה-PR הזה.)

**התיקון — להחליף את בלוק ה-`filters` הקיים (`e2e.yml:62-74`) בזה** (מירור של
`pr-checks.yml` שמוכח עובד; הסרת דפוסי-השלילה השבורים):

```yaml
          filters: |
            frontend:
              - 'frontend/**'
              - 'public/**'
              - 'package.json'
              - 'package-lock.json'
```

אחרי התיקון: docs-only → אף דפוס חיובי לא מותאם → `frontend=false` → `e2e` מדלג →
ה-aggregator מדווח success על skip → docs-only מתמזג נקי. (תופעת-לוואי מקובלת: שינוי
בקובץ `frontend/**/*.md` יימנה כעת כ-frontend וה-E2E ירוץ — נכון יותר מהמצב הנוכחי,
ובטוח. אם רוצים בכל זאת לחרוג על `.md` תחת `frontend/`, אפשר `predicate-quantifier:
every` — אבל הוא שובר את החלופה החיובית ולכן לא מומלץ כאן.)

## תנאי מוקדם B (חובה) — הסוויטה חייבת להיות ירוקה

ה-run על ה-PR הזה: `4 failed · 1 flaky · 100 passed`. הכשלים אינם קשורים ל-diff
(docs בלבד, אפס קוד frontend):

```
[desktop] › e2e/flows/12-axe-a11y.spec.ts:85:7 › axe a11y (critical/serious = 0) › /producer/[id]
[desktop] › e2e/visual/parity.spec.ts:131:7 › Visual parity — MEH-991 › producer detail
[mobile]  › e2e/flows/12-axe-a11y.spec.ts:85:7 › axe a11y (critical/serious = 0) › /producer/[id]
[mobile]  › e2e/visual/parity.spec.ts:131:7 › Visual parity — MEH-991 › producer detail
```

parity על `/producer/[id]` הוא בדיוק MEH-991 Chunk 3 (VRT baselines, In Progress
לפי ADR-028). כל עוד הסוויטה אדומה, הוספת ה-gate ל-ruleset תחסום **כל** PR שאינו
docs-only. יש לסגור/לייצב את 4 הכשלים (MEH-991 Chunk 3 + a11y `/producer/[id]`)
לפני הפעלת השער.

## תנאי מוקדם C (חובה) — אף spec תלוי-דאטה לא נשאר אדום דרך קבע

זהו הכלל הכללי שתנאי B הוא מקרה פרטי שלו, והוא נרשם בנפרד כי הוא **חוזר**: spec
שנשען על דאטה חיה נשבר מעצמו — בלי שאף אחד נגע בקוד — ולכן הוא לא "כשל שמתקנים
פעם אחת" אלא **מקור אדום מתחדש**. ברגע שה-E2E הוא merge-blocking, כל אירוע כזה
עוצר את **כל** ה-PRs בריפו עד שמישהו מתפנה ל-regen. זו בדיוק הסיבה שהשער לא הופעל
עד היום.

**המקרה שהוליד את התנאי — `/map`, ועכשיו הוא סגור.** ה-baseline של `/map` צילם
דאטה חיה: הרייל ושורת הצ'יפים אינם ממוסכים, כך שכל אישור/השבתה של עסק הזיז את
הצילום (13 → 12 עסקים, 31,091px ≈ 3%). regen שם היה הליכון — הוא היה מאדים שוב
בעסק הבא. **MEH-1591 (PR #2210, מוזג `a22c4a85` 27/07 00:03) סגר את זה** עם
`page.route()` על ה-collection ועל `/categories` + fixtures קבועים, **וגם** הנחית
baseline מחודש (`map-desktop-linux.png` → `581f41e4fbac`). אומת אמפירית בריצה
`30221482924`: `[desktop] map` ו-`[mobile] map` שניהם ירוקים.

**איך בודקים את התנאי לפני הפעלת השער:** לכל spec ב-`e2e/visual/**` — האם הפיקסלים
שלו יכולים להשתנות בלי commit? אם כן, הוא צריך `page.route()` + fixture (דפוס
MEH-1497 / MEH-1591), לא regen. מיסוך הוא **לא** תשובה מקובלת על אזור תוכן — הוא
מסתיר רגרסיות אמיתיות (ראו §2 של MEH-1591).

> **סטטוס נכון ל-27/07 00:45** — נבדק מול staging חי, לא מהזיכרון:
>
> * **תנאי A — ✅ מתקיים.** ה-`filters` ב-`e2e.yml:65-70` הוא כבר **בדיוק** בלוק
>   ההחלפה שמומלץ למעלה: ארבעה דפוסים חיוביים בלבד, **אפס** דפוסי-שלילה, ואין
>   `predicate-quantifier` בקובץ כולו. הוכחה אמפירית מהיום: `5e003993`
>   (guard + docs) ו-`7383f00a` (merge #2220) — בשתיהן ה-job
>   `Playwright E2E (Vercel preview)` = **`skipped`** תוך ~16 שניות.
>   *(שאריות: הסעיף לעיל עדיין מתאר את המצב השבור כ"קיים" ומפנה ל-`:62-74`; זהו
>   תיעוד היסטורי של הבעיה, לא של הקוד הנוכחי.)*
> * **תנאי B — ❌ פתוח, אבל נותר **כשל אחד בלבד**, והוא flaky.** ארבעת הכשלים
>   המקוריים (parity `/producer/[id]` ×2 + a11y `/producer/[id]` ×2) **אינם
>   מופיעים יותר**. גם ה-`25-role-reachability` שנרשם כאן קודם **נסגר**: הוא לא
>   היה באג מוצר אלא **בדיקה שטענה על URL חולף**, ו-`ae06a786` (PR #2230,
>   MEH-1599) תיקן גם את המוצר (403 מרונדר במקום, בלי הפניה) וגם את הטענה.
>   **עדכון נכון לריצה `30222430014`** (סוויטה מלאה, **160 passed · 0 failed ·
>   1 flaky · 27 skipped**): כל 10 מבחני `25-role-reachability` עברו בשני
>   ה-projects **באפס retries**, ו-`parity` `map`+`home` ירוקים.
>   **החסם היחיד שנשאר:** `e2e/flows/02-search-producer.spec.ts:4` —
>   strict-mode, `[data-testid="hero-search"]` מתאים לשני inputs (ה-double-mount
>   המוכר: שני ה-shells מותקנים, מוסתרים זה מזה ב-CSS בלבד). עבר ב-retry, אבל
>   ה-job מריץ `--fail-on-flaky-tests`, אז flaky = אדום. **זה, ורק זה, מפריד את
>   תנאי B מ-✅.**
> * **תנאי C — ✅ מתקיים עבור `/map`.** ראו למעלה. לא נסרקו שאר ה-specs מול
>   השאלה "יכול להשתנות בלי commit" — זו בדיקה שצריכה להיעשות לפני ההפעלה.
>
> **המשמעות המצטברת (עודכן 27/07 אחרי `ae06a786`):** החסם היחיד שנותר הוא **B**,
> והוא **spec פונקציונלי אחד** ב-`e2e/flows/` — לא VRT, ולא באג מוצר: זהו
> `02-search-producer` ה-flaky, ששורשו `data-testid` כפול ב-DOM. **השער רחוק
> מהפעלה במרחק תיקון אחד.** אין לו ticket (ה-workspace ב-Linear הגיע לתקרת
> ה-issues בתוכנית החינמית), ולכן הוא מדווח כאן ולספיר ישירות.
>
> **תיקון סביר:** לתת לכל shell testid משלו (`hero-search-mobile` /
> `hero-search-desktop`), או לצמצם את ה-locator ל-shell הנראה
> (`.filter({ visible: true })`). המצב הנוכחי — שני אלמנטים חיים שחולקים testid —
> שובר את חוזה ה-`data-testid` של [E2E-LOCATORS](../E2E-LOCATORS.md), שמניח מזהה
> יחיד לכל פקד.

---

## הבלוק — ה-aggregator job (English — YAML/job names/paths):

בסוף `e2e.yml`, **אחרי** ה-job `e2e` (כרגע נגמר בשורה 227, `retention-days: 7`),
כ-job נוסף תחת `jobs:` (הזחה של 2 רווחים, כמו `filter:` ו-`e2e:`). אין לשנות את שדה
ה-`name:` של `e2e` (`Playwright E2E (Vercel preview)`) — שם זה הוא זהות
ה-branch-protection (`e2e.yml:77-80`).

```yaml
  # ─────────────────────────────────────────────────────────────────
  # E2E GATE (MEH-1201) — required-check aggregator for the E2E suite.
  # Mirrors ci-gate (pr-checks.yml:522-616) / deploy-gate (deploy.yml:379-409):
  # `if: always()` + `needs`, so the gate reports its own status regardless of
  # whether the E2E job ran, skipped, or failed. On a docs-only PR the `e2e`
  # job skips via paths-filter (needs.filter.outputs.frontend == 'false') and a
  # skipped need evaluates as pass here — so docs-only merges clean.
  #
  # PREREQUISITE (MEH-1201, found in PR #1741 CI): the paths-filter in e2e.yml
  # must first be fixed to actually skip docs-only. Under predicate-quantifier
  # `some` its negation patterns match everything (frontend=true on docs), so
  # `e2e` currently does NOT skip — see docs/ci/e2e-gate.patch.md "תנאי מוקדם A".
  # Adding this gate to the ruleset before that fix + a green suite would BLOCK
  # every docs-only PR.
  #
  # MEH-892: a *skipped* job listed DIRECTLY in the protect-staging ruleset
  # reads as "Expected" and BLOCKS merge (real 405 on a docs-only PR). That is
  # why the E2E job must NOT be added to the ruleset — THIS aggregator is the
  # required context instead. Add `E2E gate (required)` to ruleset 15240090
  # ONLY after prerequisites A + B are met.
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

---

## סדר ההחלה — צעדי ספיר

1. **Prerequisite A** — הדביקי את תיקון ה-`filters` (למעלה) ל-`e2e.yml:62-74`.
   ודאי על PR של docs-only ש-`Paths filter` פולט `frontend = false` וש-`Playwright
   E2E (Vercel preview)` מדווח `skipped`.
2. **Prerequisite B** — ייצבי/סגרי את 4 כשלי הסוויטה (MEH-991 Chunk 3 parity +
   a11y `/producer/[id]`). ודאי run ירוק על non-docs PR.
3. הדביקי את בלוק ה-aggregator `e2e-gate` (למעלה) לסוף `e2e.yml`. מזגי/דחפי כעצמך
   (push עם `GITHUB_TOKEN` לא מפעיל workflows — ראו הערת VRT-baseline ב-CLAUDE.md).
4. ודאי ש-`E2E gate (required)` רץ פעם אחת על staging כדי ש-GitHub יציע את שם
   ה-context.
5. Settings → Rules → Rulesets → `protect-staging` (ID 15240090) → הוסיפי את
   `E2E gate (required)` ל-required status checks.
6. **אימות סופי:** PR של docs-only מתמזג נקי (ה-gate = success על e2e שדולג); PR
   של frontend עם E2E אדום נחסם (ה-gate = failure).

---

## הערת consistency

בלוק ה-aggregator תואם בדיוק ל-`ok()`/`check()` של `ci-gate` (`pr-checks.yml:559-573`)
ושל `deploy-gate` (`deploy.yml:394-395`) — לא הומצא style חדש. `success|skipped`
עוברים; `failure|cancelled` חוסמים. שער ה-VRT parity אינו job נפרד — הוא רץ בתוך אותו
`npx playwright test` של `e2e` (`e2e.yml:162`, ADR-028 Gate inventory), ולכן חסימת
`e2e` חוסמת גם אותו.
