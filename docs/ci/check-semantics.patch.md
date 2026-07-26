# Check semantics — YAML patch ל-`e2e.yml` + `playwright.config.ts` (MEH-1604)

> **הבלוקים כאן מיועדים לספיר להדבקה ידנית.** `.github/workflows/**` הוא CC-deny
> (`.claude/settings.json`, MEH-671) — CC כותב את ה-diff בקובץ `.md` הזה בלבד
> ואינו נוגע ב-workflow. **שום דבר כאן לא הוחל.**

---

## הבעיה: אדום אחד, שתי משמעויות

CI אדום דורש היום פרשנות ידנית בכל פעם, ולכן הפסיק לתפקד כשער. שני כשלים שונים
לובשים את אותו צבע:

| מה קרה באמת | איך זה נראה | מה זה אומר |
|---|---|---|
| **שער מת** — E2E נופל ב-`global-setup`, אפס specs נטענו | `CI gate: failure` | **אפס כיסוי.** לא נבדק כלום |
| **אדום שקרי** — run שבוטל ע"י draft→ready (כלל 21) | `CI gate: failure` | **הכל בסדר.** ה-run החדש רץ |

השני קרה **שלוש פעמים ב-26/07 לבדו** (PRs #2213, #2235, ואחד נוסף באותו ערב).
הראשון הוא מצב ה-E2E **הנוכחי** (MEH-1590, פתוח, של ספיר בלבד).

עובדה מהותית: **התוצאה הגרועה מכולן היא "אפס כיסוי" שנראה כמו כישלון רגיל** —
כי אז מתקנים את הטסט הלא-נכון, או גרוע מכך, ממזגים על סמך "זה הכישלון המוכר".

**האינווריאנטה היא מספר הטסטים שרצו, לא exit code.** גודל ה-artifact (‎197KB מול
מגה-בייטים) הוא רק proxy — הוא מתאם, לא מודד.

---

## ⚠️ תנאי מוקדם (חובה) — אין reporter מסוג JSON היום

`frontend/playwright.config.ts:18-20` מגדיר ב-CI **רק** `html` + `list`:

```ts
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["list"]]
    : [["list"]],
```

**רצפת הכיסוי לא יכולה לקרוא סטטיסטיקה שלא נכתבת.** לכן שלב 0 הוא שינוי
ב-`playwright.config.ts` — קובץ שאינו CC-deny, אבל הוא מחוץ ל-scope של MEH-1604
(מסמך אחד), ולכן הוא מתועד כאן ולא הוחל:

```ts
  reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["list"],
        // MEH-1604: ה-JSON reporter הוא מקור האמת ל"כמה טסטים באמת רצו".
        // ה-summary נקרא ע"י שלב "E2E coverage floor" ב-e2e.yml.
        ["json", { outputFile: "playwright-report/results.json" }],
      ]
    : [["list"]],
```

בלי השלב הזה, שלב 1 למטה ייכשל על קובץ חסר — וזה, למרבה האירוניה, בדיוק סוג
ה"אדום שלא ניתן לפענוח" שהמסמך הזה בא לחסל. לכן: **מחילים 0 ו-1 יחד, לא בנפרד.**

---

## 1. רצפת כיסוי — `E2E coverage floor`

**מה זה עושה:** אחרי `npx playwright test`, קורא את ה-JSON reporter. אם מספר
הטסטים שבוצעו הוא 0 → נופל עם marker ייחודי, תחת שם check נפרד שנבדל ויזואלית
מ-"כמה טסטים נכשלו".

**להוסיף מיד אחרי השלב `Run E2E tests`** (`e2e.yml:153-170`), ולפני
`Post QA report comment`:

```yaml
      # MEH-1604: האינווריאנטה היא "כמה טסטים רצו", לא exit code. global-setup
      # שנופל מפיל את כל ה-run לפני שנטען ולו spec אחד — וזה מדווח כ-failure
      # רגיל, בלתי-נבדל מ"טסט אחד נכשל". אפס כיסוי הוא התוצאה הגרועה ביותר
      # ולכן חייב את הרעש הכי גדול, לא את אותו אדום.
      # if: always() — דווקא כשהשלב הקודם נכשל אנחנו צריכים לדעת אם משהו רץ.
      # ה-cancelled מוחרג: run מוחלף (כלל 21) אינו חוסר-כיסוי אמיתי.
      - name: E2E coverage floor
        if: >-
          always() && steps.e2e-run.outcome != 'cancelled' &&
          steps.e2e-run.outcome != 'skipped'
        working-directory: frontend
        run: |
          REPORT=playwright-report/results.json
          if [ ! -f "$REPORT" ]; then
            echo "::error::ZERO COVERAGE — no JSON report at $REPORT. The json reporter is missing from playwright.config.ts (MEH-1604 step 0), or the run died before writing it."
            exit 1
          fi
          EXPECTED=$(jq '[.suites[]?.specs[]?, (.suites[]?.suites[]?.specs[]?)] | length' "$REPORT")
          STATS_EXPECTED=$(jq '.stats.expected // 0' "$REPORT")
          STATS_UNEXPECTED=$(jq '.stats.unexpected // 0' "$REPORT")
          STATS_FLAKY=$(jq '.stats.flaky // 0' "$REPORT")
          STATS_SKIPPED=$(jq '.stats.skipped // 0' "$REPORT")
          EXECUTED=$((STATS_EXPECTED + STATS_UNEXPECTED + STATS_FLAKY))
          echo "executed=$EXECUTED (expected=$STATS_EXPECTED unexpected=$STATS_UNEXPECTED flaky=$STATS_FLAKY skipped=$STATS_SKIPPED specs=$EXPECTED)"
          echo "executed=$EXECUTED" >> "$GITHUB_OUTPUT"
          echo "skipped=$STATS_SKIPPED" >> "$GITHUB_OUTPUT"
          if [ "$EXECUTED" -eq 0 ]; then
            echo "::error::ZERO COVERAGE — global-setup aborted, 0 tests executed"
            echo "The suite reported no executed tests. This is NOT 'some tests failed' —"
            echo "nothing ran. Check global-setup.ts (auth fixture provisioning) first."
            exit 1
          fi
        id: coverage-floor
```

**למה `id: coverage-floor`:** כדי ש-`Post QA report comment` יוכל לקרוא את המספר.

### 1b. להציף את המספר בתגובת ה-PR

בלי זה, אדם שקורא את התגובה רואה "FAIL" גנרי במקום "0 טסטים רצו". **להחליף** את
בניית ה-`body` בשלב `Post QA report comment` (`e2e.yml:190-199`):

```yaml
          script: |
            const marker = "<!-- e2e-qa-report -->";
            const outcome = "${{ steps.e2e-run.outcome }}";
            const executed = "${{ steps.coverage-floor.outputs.executed }}" || "unknown";
            const skipped = "${{ steps.coverage-floor.outputs.skipped }}" || "0";
            const passed = outcome === "success";
            const zeroCoverage = executed === "0";
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            const headline = zeroCoverage
              ? "Playwright QA — ZERO COVERAGE"
              : `Playwright QA — ${passed ? "PASS" : "FAIL"}`;
            const body = [
              marker,
              `## ${headline}`,
              "",
              `**${executed} tests executed**, ${skipped} skipped ([run](${runUrl})), commit ${context.payload.pull_request.head.sha.slice(0, 7)}.`,
              "",
              zeroCoverage
                ? "**Nothing ran.** global-setup aborted before any spec loaded — this PR has no E2E signal at all. Do not read the other checks as coverage."
                : passed
                  ? "All E2E specs green (flake gate --fail-on-flaky-tests included)."
                  : "At least one spec failed — the playwright-report artifact on the run has traces and screenshots.",
            ].join("\n");
```

השאר של השלב (חיפוש ה-marker, upsert) נשאר **ללא שינוי**.

> **הערה על `jq`:** זמין כברירת מחדל על `ubuntu-latest`. ה-`.suites[]?` עם `?`
> סובל מבנה ריק בלי לקרוס — חשוב, כי המקרה שאנחנו מודדים הוא בדיוק דוח ריק.

---

## 2. Run מוחלף → `neutral`, לא `failure`

**הבעיה:** flip של draft→ready (או push שני מהיר) מפעיל run חדש שמבטל
ב-concurrency את זה שרץ. ה-bash aggregator ממפה dep במצב `cancelled` ל-FAIL
(`R_BUILD: cancelled` → `exit 1`), וה-webhook יוצא כ-"CI gate failed" על run
שכבר לא רלוונטי. זה קרה שלוש פעמים ב-26/07.

**התיקון:** `neutral` הוא המנגנון הסטנדרטי של GitHub להפרדת "לא חוסם" מ-"נכשל".
ב-aggregator, `cancelled` בכל dep → יציאה `neutral` במקום `failure`:

```yaml
      # MEH-1604: dep שבוטל אינו כישלון — הוא run שהוחלף. exit 78 הוצא משימוש,
      # ולכן הדרך הנתמכת היא לסמן את ה-conclusion ל-neutral דרך ה-Checks API.
      # ה-ruleset מתייחס ל-neutral כלא-חוסם, בדיוק כמו skipped.
      - name: Detect superseded run
        id: superseded
        if: always()
        run: |
          if [ "${{ needs.build.result }}" = "cancelled" ] || \
             [ "${{ needs.test.result }}" = "cancelled" ] || \
             [ "${{ needs.lint.result }}" = "cancelled" ]; then
            echo "superseded=true" >> "$GITHUB_OUTPUT"
            echo "::notice::Superseded run — a newer run for this SHA cancelled this one. Reporting neutral, not failure."
          else
            echo "superseded=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Mark check neutral when superseded
        if: always() && steps.superseded.outputs.superseded == 'true'
        uses: actions/github-script@v9
        with:
          script: |
            const { data } = await github.rest.checks.listForRef({
              ...context.repo,
              ref: context.payload.pull_request?.head.sha ?? context.sha,
              check_name: "CI gate (required)",
            });
            for (const run of data.check_runs) {
              if (run.id === context.runId) continue;
              await github.rest.checks.update({
                ...context.repo,
                check_run_id: run.id,
                conclusion: "neutral",
                output: {
                  title: "Superseded",
                  summary: "A newer run for this commit cancelled this one. Not a failure — see the newer run.",
                },
              });
            }
```

> **⚠️ לאמת לפני החלה:** שמות ה-`needs` (`build` / `test` / `lint`) הם **הנחה** —
> CC לא יכול לקרוא את גוף ה-job `ci-gate` בוודאות מספקת כדי לנעול אותם, ו-
> `.github/workflows/**` הוא CC-deny. ספיר: להתאים לשמות ה-`needs` האמיתיים
> ב-`ci-gate` לפני הדבקה. אם הרשימה ארוכה, עדיף לולאה על
> `toJSON(needs)` מאשר תנאי ידני לכל dep.

**הדרך הפשוטה יותר, אם השינוי למעלה נראה כבד:** להשאיר את ה-aggregator כמו שהוא
ולהסתפק ב-`::notice::` — הוא לא משנה את הצבע, אבל הוא **כן** שם את המילה
"Superseded" בלוג, מה שהופך את הפענוח מ-30 שניות של חקירה לשורה אחת. פחות נכון,
הרבה יותר זול.

---

## 3. נוהל self-test לשערים (ידני, חד-פעמי)

**שער שמעולם לא הוכח כמסוגל להיכשל אינו שער.** הנוהל: לשבור כל שער נדרש פעם אחת
בכוונה, לוודא שהוא באמת אדום, ולחזור.

עובדים ב-branch זמני אחד (`chore/gate-selftest`), PR **draft** עם `DO-NOT-MERGE`
בכותרת, ומוחקים בסוף. **לא ממזגים אף אחד מהשלבים.**

| # | שער | איך לשבור אותו (שינוי מינימלי) | צפוי | מה זה מוכיח |
|---|---|---|---|---|
| 1 | `Frontend build (Next.js)` | להוסיף `import x from "@/nope";` לקובץ עמוד כלשהו | 🔴 red | ה-build באמת נבנה, לא cached |
| 2 | `Frontend unit tests (vitest)` | `expect(1).toBe(2)` בטסט קיים | 🔴 red | vitest באמת רץ ב-CI |
| 3 | `Backend tests (pytest)` | `assert False` בטסט קיים | 🔴 red | pytest באמת רץ (ולא skipped ב-draft) |
| 4 | `Backend lint (ruff)` | שורה עם `import os` לא בשימוש | 🔴 red | ruff באמת אוכף |
| 5 | `Repo guards` | להוסיף שורה ל-`docs/CHANGELOG.md` ב-branch שנוגע גם בקוד | 🔴 red | guard כלל 31 חי |
| 6 | `Branch name gate` | לפתוח PR מ-branch בשם `test/gate-selftest` | 🔴 red | תבנית השם נאכפת |
| 7 | `qa-artifacts size cap` | להוסיף PNG של 3MB תחת `qa-artifacts/` | 🔴 red | ספירת הבתים אמיתית |
| 8 | `E2E coverage floor` (חדש) | לשנות סיסמה ב-`global-setup` לערך שגוי | 🔴 red + `ZERO COVERAGE` | **השער החדש עובד** |
| 9 | `DO-NOT-MERGE marker gate` | להשאיר `DO-NOT-MERGE` בכותרת | 🔴 red | ה-marker חוסם |

### טבלת תוצאות — למילוי ע"י ספיר

| # | שער | תאריך | נכשל כצפוי? | run URL | הערות |
|---|---|---|---|---|---|
| 1 | Frontend build | | ☐ | | |
| 2 | vitest | | ☐ | | |
| 3 | pytest | | ☐ | | |
| 4 | ruff | | ☐ | | |
| 5 | Repo guards | | ☐ | | |
| 6 | Branch name gate | | ☐ | | |
| 7 | qa-artifacts size cap | | ☐ | | |
| 8 | E2E coverage floor | | ☐ | | |
| 9 | DO-NOT-MERGE marker | | ☐ | | |

**שער שלא נכשל בשלב שלו = ממצא, לא טעות בנוהל.** לפתוח ticket, לא "לתקן" את הבדיקה.

> הערך של הנוהל הזה נובע דווקא מהמקרים שכבר קרו: MEH-314/317 (מיצוי תקציב
> שהתחזה ל-CI ירוק), ו-כלל 21 "draft PRs produce a skip-green signal" — שני
> מקרים שבהם שער דיווח משהו שלא היה מה שנראה. הנוהל הופך את "האם השער עובד?"
> משאלה תיאורטית לשורה בטבלה.

---

## מה אנחנו **לא** עושים, ולמה

**אין retries אוטומטיים.** מפתה: run שנכשל מנסה שוב, ואם עבר — ירוק. אבל זה
בדיוק מה שמסתיר flakiness אמיתית, וזו הסיבה ש-MEH-484 הוסיף
`--fail-on-flaky-tests` — כלומר הרפו כבר **החליט** במפורש שטסט שעובר בניסיון
השני הוא כישלון. retry ברמת ה-workflow יבטל את ההחלטה הזאת מבחוץ. (ה-`retries: 1`
ב-`playwright.config.ts` נשאר — הוא מזין את גלאי ה-flake, לא עוקף אותו.)

**אין `skip`.** לדלג על שער שמפריע נותן אפס אות **ואפס היסטוריית כשלים** — ואז
אי אפשר אפילו לשאול "מתי זה נשבר?". `neutral` (סעיף 2) הוא ההפך: הוא אומר
"לא חוסם" ועדיין מותיר רשומה.

**אין שינוי ל-ruleset כאן.** הוספת `E2E coverage floor` כ-context נדרש היא
החלטה נפרדת, ו-MEH-892 הוכיח ש-job שמדולג ורשום ישירות כ-required נקרא
`Expected` וחוסם docs-only. אם הוא נכנס — דרך aggregator, בתבנית של
[e2e-gate.patch.md](./e2e-gate.patch.md), ורק אחרי שהוא הוכח בסעיף 3.

---

## סדר החלה מומלץ

1. **שלב 0** (`playwright.config.ts` — json reporter) + **סעיף 1** יחד. בלי 0,
   סעיף 1 נופל על קובץ חסר.
2. לאמת על PR פתוח אחד ש-`executed=` מופיע בלוג ושהתגובה מציגה את המספר.
3. **סעיף 3** — self-test, לפחות שורה 8 (השער החדש). זו ההוכחה שהעבודה הזאת שווה משהו.
4. **סעיף 2** אחרון — הוא הכי פחות דחוף (אי-נוחות, לא חוסר-כיסוי) והכי דורש
   התאמה לשמות ה-`needs` האמיתיים.

Cross-refs: [e2e-gate.patch.md](./e2e-gate.patch.md) ·
[e2e-auth-fixtures.patch.md](./e2e-auth-fixtures.patch.md) ·
[.claude/rules/workflow.md](../../.claude/rules/workflow.md) כלל 21 ·
[ADR-028](../decisions/ADR-028-qa-gates-per-tier.md)
