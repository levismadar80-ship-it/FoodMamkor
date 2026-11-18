# טסטים שעוברים מהסיבה הלא נכונה

> נמדד 17/11/2026 על staging HEAD. שלוש מחלקות: **אין assert אמיתי**,
> **mock שמסתיר את הקוד הנבדק**, ו-**skip נשכח**.
>
> **חפיפה, ומה נעשה איתה.** הכלי לזה כבר בעבודה בסשן מקביל:
> `origin/feature/meh-3295-tests-wrong-reason` (commit `a2008e027`, «WIP»,
> מושהה מ-15/11, חידוש מתוכנן ל-19/11) מחזיק
> `scripts/checks/test-honesty-guard.sh`, `scripts/checks/lib/test_honesty.py`,
> `test-honesty-baseline.txt`, `tests/test_meh3295_test_honesty.py`,
> `mutation-guard.sh`, `scripts/mutation/*` ו-`expect.requireAssertions`
> ב-`vitest.config.js`. **לא נגעתי באף אחד מהם**, והתיקונים כאן נבחרו דווקא
> במה שה-guard ההוא לא מכסה.

---

## מה ה-guard שבעבודה כבר תופס, ומה לא

| מחלקה | מכוסה שם | פער |
|---|---|---|
| 1 — אין assert, ב-pytest | כן: גוף `def test_*` בלי `assert`, `raises`, `raise` או קריאה מאמתת. ‏15 כאלה ב-baseline, עם `# no-assert: <reason>` כמוצא | **assert חלש** לא נתפס |
| 1 — אין assert, ב-vitest | לא נסרק כלל. רק `expect.requireAssertions` בזמן ריצה, ורק בענף ההוא | HEAD כולו בלי זה |
| 2 — mock שמסתיר | **לא מכוסה בכלל.** התשובה המתוכננת היא mutation testing, ו-`mutation-guard.sh` הוא warn-only | הכול |
| 3 — skip, ב-pytest | דקורטורים בלבד (`skip`/`skipif`/`xfail`), נדרש `MEH-\d+` בטווח שורה | `pytest.skip()` בזמן ריצה, `importorskip`, ‏`pytestmark` ברמת מודול |
| 3 — skip, ב-vitest | רק `.only` ו-`it/test/describe.skip\|todo("literal"` | `xit`, `xdescribe`, `test.fixme`, `.skipIf`, `.runIf`, הצורה `test.skip(cond, "reason")` |
| ‏e2e | **לא נסרק בכלל** | `frontend/e2e/**` כולו |

פער נוסף, שקט במיוחד: **כל `MEH-\d+` בטקסט נחשב כרטיס**, גם ציטוט של כרטיס אחר.
‏`test_outreach_prefill_edge_cases.py:373` עובר רק מפני שהטקסט מזכיר «MEH-1188
F13», שהוא על משהו אחר לגמרי.

---

## מה תוקן כאן

### ‏`MapSsrFallback.test.jsx` — שישה טסטים שבדקו עותק של עצמם

הקובץ **מעולם לא ייבא** את `fetchProducersForSSR`. הוא כתב מחדש את הלוגיקה
בתוך כל מקרה, והקובץ אומר את זה בעצמו: *«Instead, inline the same logic to
verify contract»*. כלומר **שישה טסטים שהיו עוברים אילו הפונקציה האמיתית
נמחקה.** והיא לא פונקציה שולית: זה האינדקס שגוגלבוט רואה ב-`/map`.

מקרה אחד היה גרוע יותר — `expect(true).toBe(false)` בתוך `try` ש-`catch {}` שלו
בלע את ה-assertion שנזרק, ואחריו assert שמערך `[]` שהטסט בדיוק כתב הוא באורך 0.
**הוא לא יכול היה להיכשל בשום מצב עולם.**

הפונקציה הוצאה ל-`frontend/lib/map-ssr-producers.js` **כדי שאפשר יהיה לייבא
אותה**, והטסט מייבא אותה.

**ראיה שהוא באמת בודק עכשיו:** שברתי את ה-helper האמיתי בשלוש דרכים (endpoint
שגוי, בלי שמירת `Array.isArray`, ו-`null` במקום `[]` בשגיאה):

```
× returns the businesses on success, and asks the right URL
× returns [] when the fetch throws
× returns [] when the payload is not an array
× returns [] when the body is not JSON
Tests  4 failed | 2 passed (6)
```

**הקובץ הישן היה תופס אפס מתוך הארבעה.**

> **הערה על ה-mock, כי היא עלתה זמן:** ‏`vi.fn()` שומר כל תוצאה ב-`mock.results`,
> ותוצאה שהיא שגיאה שנזרקה או promise שנדחה מדווחת ע"י vitest כ-unhandled
> ומפילה את המקרה — **גם כשהקוד הנבדק תפס אותה והחזיר `[]`**. נמדד:
> `out=[] err=null`, והמקרה עדיין אדום. לכן ה-mock כאן הוא פונקציה רגילה
> והקריאות נרשמות ביד.

### שלושה טסטים ב-backend שהתקינו mock ולא אישרו אותו

| טסט | מה היה | מה נוסף |
|---|---|---|
| `test_meh1000_...py` `test_fail_open_never_raises` | התקין `send_text` מתפוצץ, קרא לנוטיפייר, והסתמך על «must not raise» בלבד | `wa_mock.assert_called_once()` |
| `test_meh1063_...py`, אותו שם | אותו דבר | אותו דבר |
| `test_meh_509_pr3_risk_score.py` `test_score_producer_unknown_id_no_op` | התקין mock של Anthropic ו**זרק אותו**; «no-op» לא נבדק בכלום | `assert create.call_count == 0` |

בשני הראשונים «fail-open» ו«מעולם לא רץ» היו אותו ירוק בדיוק. בשלישי, הטסט עבר
בין אם ה-id הלא מוכר דולג ובין אם נשלח ל-Anthropic וחויב עליו.

---

## מה לא תוקן, ולמה — לפי סדר הסיכון

### 1. ‏`test_fuzz_schemathesis.py` — חבילת fuzz שלמה שלא רצה אף פעם

`:41` — `skipif(not RUN_FUZZ)`. **`RUN_FUZZ` לא מופיע באף workflow ב-`.github`.**
`schemathesis` כן ב-`backend/pyproject.toml:45`, כלומר ה-`importorskip` ב-`:33`
לא יורה. המודול כולו קוד מת.

**לא תיקנתי כי שתי האפשרויות הן החלטה:** לחווט אותו ל-job לילי (מוסיף דקות
Actions, ו-MEH-2891 מדד 4,248 דקות ב-24 שעות), או למחוק (מאבד כיסוי שמישהו
התכוון אליו). **מחכה לספיר.**

### 2. ‏e2e שמדלג כשאין נתונים — השער הולך ירוק כשאין בתי עסק ב-staging

* `e2e/flows/15-map-markers.spec.ts:41` — `if (markers.count()===0) test.skip(...)`
* `e2e/visual/parity.spec.ts` — שישה מופעים של
  `test.skip(true, "No producer on staging to borrow an id from")`
* `e2e/visual/badge-tooltip-collision.spec.ts:337` — אותה צורה

זה בדיוק «guard שמתייעץ עם הנושא של עצמו» מ-`.claude/rules/testing.md`: אם
הסיכות ייעלמו, הטסט **ידלג** במקום להיכשל. אף אחד מהם לא נושא כרטיס.

**לא תיקנתי** כי «להיכשל במקום לדלג» משנה את מה ש-CI עושה על staging, ורגע
ההשקה הוא הזמן הגרוע ביותר להפוך דילוג שקט לאדום בלי להחליט על זה. **מחכה
לספיר.**

### 3. ‏`xfail` בלי כרטיס — `test_outreach_prefill_edge_cases.py:373`

«FINDING-4», באג ידוע עם תווי wildcard ב-LIKE. עובר את ה-guard שבעבודה רק מפני
שהטקסט מזכיר כרטיס אחר. שלושת אחיו כבר נתבעו (MEH-3317 / 3318 / 3319); זה לא.
**צריך כרטיס, ולא יכולתי לפתוח אחד** — ה-workspace הגיע למכסת הכרטיסים החינמית
באמצע הסשן.

### 4. ‏assertions שלא יכולות להיכשל

* `tests/test_schema_symmetry.py:216` — `assert backlog >= 0` על סכום של
  `len()`. תמיד נכון, וה-docstring אפילו אומר «Non-failing».
* `tests/test_logging.py:27` — `assert bound is not None` אחרי `.bind()`,
  שתמיד מחזיר אובייקט.

**לא תיקנתי** — שתיהן דורשות החלטה על מה כן לבדוק במקום, והן בטוחות כפי שהן.

### 5. ‏probes של vitest בתוך ה-glob

`qa-meh1901-markup.test.jsx`, `qa-meh1916-markup.test.jsx`,
`qa-meh1917-markup.test.jsx` — `describe.skipIf(process.env.MEH19xx_QA !== "1")`,
תמיד מדולגים ב-CI, **אפס assertions**, וכותבים dumps ל-`qa-artifacts`. זו הפרה
של כלל 42 («probe לא נכתב בתוך test glob»). **מחיקה היא ההחלטה הנכונה, והיא לא
שלי.**

### 6. דילוגים מקוטלגים, שנשארים כפי שהם

`test_api.py:4589, 4978, 5004, 5029` (‏MEH-1406, router לא מורכב),
`Dashboard1DStates.test.jsx:134` (‏MEH-2876), `FooterCopyrightYear.test.jsx:83`
(תלוי אזור זמן), והדילוגים התלויים בסביבה ב-`e2e/golden/04-g4-rescue.spec.ts`.
לכולם סיבה כתובה. **אין מה לעשות.**

---

## ההמלצה למי שימשיך את MEH-3295

ארבע הרחבות, לפי סדר התועלת:

1. לסרוק את `frontend/e2e/**` — שם יושבים הדילוגים-על-נתונים-ריקים, והם היחידים
   שיכולים להפוך חבילה שלמה לירוקה בלי שרצה.
2. לכסות `xit`, `xdescribe`, `test.fixme`, `.skipIf`, `.runIf` והצורה
   `test.skip(cond, "reason")`.
3. לאמת שה-MEH שצוטט **קשור** לטסט, ולא רק שהוא קיים בטקסט.
4. לכסות `pytest.skip()` בזמן ריצה, `importorskip`, ו-`pytestmark` ברמת מודול.
