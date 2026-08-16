# i18n literal gate — ESLint patch ל-`frontend/eslint.config.mjs` (MEH-1618)

> **הבלוק כאן מיועד לספיר להדבקה ידנית.** `frontend/eslint.config.mjs` הוא
> **CC-deny** — `.claude/hooks/protect-lint-config.sh` (MEH-442) חוסם אותו
> ב-`PROTECTED_FULL` כחסימת-קובץ-מלאה, וההודעה של ה-hook עצמו היא *"If a rule
> blocks your task, REPORT to user with explanation. Do NOT modify config."*
> CC לא נגעה בקונפיג. **שום דבר כאן לא הוחל.**
>
> מה כן נחת ב-PR: התלות `eslint-plugin-i18next@^6.1.5` ב-`package.json`
> (לא מוגן), כך שההחלה אצל ספיר היא הדבקה של בלוק אחד — בלי `npm i`.

---

## מה זה פותר

שלושה גילויים באותה מחלקה תוך 24 שעות — `cards.jsx:641` (MEH-1608),
5 placeholders + ChatWidget שלם (MEH-1617), ו-6 נוספים ב-`/dev`. כולם נמצאו
**ידנית**. sweep תופס את מה שיש; שער מונע את מה שיבוא.

---

## ⚠️ הבלוק לא נכתב מהראש — הוא נמדד

הקונפיג הנאיבי (זה שה-ticket תיאר: `mode: jsx-only` בלבד) **בלתי-שמיש**. כל צעד
כאן נמדד מול הקוד האמיתי, ע"י הרצת ESLint עם קונפיג-בדיקה שמייבא את
`eslint.config.mjs` האמיתי ומוסיף את הבלוק — כך שהמספרים משקפים התנהגות ממוזגת
אמיתית ולא הערכה.

| שלב | ממצאים | מה השתנה |
|---|---|---|
| `mode: jsx-only` בלבד | **1589** | הבסיס הנאיבי |
| escape ל-`[locale]` ב-allowlist | 1516 | ראו המלכודת למטה |
| `callees.exclude` + שמות המתרגמות | 1365 | `tCommon("loading")` דווח כ-literal |
| `jsx-attributes.include` מצומצם | **233** | `weight="light"`, `aria-hidden="true"` |
| `t\w*` + צורות `.rich`/`.raw` | 142 | `ti("eyebrow")`, `t.rich(...)` |
| exclude לגליפים דקורטיביים | **139** | `●` של מחוון ההקלדה |

**ירידה של 91%** — 1450 מתוך 1589 הממצאים המקוריים היו false positives.

### 🪤 המלכודת: `[locale]` הוא character-class, לא שם תיקייה

הרשומה `"app/[locale]/dev/**"` ב-allowlist **לא עושה כלום**. ב-glob, `[locale]`
הוא מחלקת-תווים שמתאימה לתו בודד מתוך `{l,o,c,a,e}` — ולכן היא לא מתאימה
לתיקייה ששמה, מילולית, `[locale]`. חייבים escape:

```
"app/\\[locale\\]/dev/**"
```

בלי זה `/dev` נשאר בסקופ ותורם 73 ממצאים — כלומר allowlist שנראה תקין ושותק
בשקט. זו בדיוק מחלקת ה-guarded-registries של MEH-1030: רשומה שמפסיקה להתאים
ומשביתה את עצמה בלי שגיאה.

### מלכודת שנייה: האופציות **מחליפות** ברירות מחדל, לא ממזגות

`lib/rules/no-literal-string.js:35` עושה
`const { include = [], exclude = [] } = options.callees || {}` — כלומר העברת
`callees` **דורסת** את רשימת ברירת המחדל של התוסף. לכן הבלוק למטה מונה מחדש את
כל ברירות המחדל לפני התוספות. אותו דבר ל-`words.exclude`.

---

## הבלוק להדבקה

ב-`frontend/eslint.config.mjs` — import בראש הקובץ:

```js
import i18next from "eslint-plugin-i18next";
import htmlEntities from "eslint-plugin-i18next/lib/options/htmlEntities.js";
```

ואז, **בסוף המערך** (אחרי הבלוק של `next.config.js`), שני אובייקטים:

```js
  // ── MEH-1618: i18n literal gate ──────────────────────────────────────
  // Catches the next hardcoded user-facing string mechanically, instead of
  // by sweep. Every option below is here because it was MEASURED to remove
  // a false-positive class — see docs/ci/i18n-lint.patch.md for the numbers.
  //
  // NOTE: the plugin REPLACES `callees.exclude` / `words.exclude` rather
  // than merging (lib/rules/no-literal-string.js:35), so the shipped
  // defaults are re-listed verbatim before the project additions.
  {
    files: ["app/**/*.{js,jsx}", "components/**/*.{js,jsx}"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "warn",
        {
          mode: "jsx-only",

          // Only attributes that carry COPY. Without this the rule reports
          // every enum prop (weight="light", aria-hidden="true", dir, role,
          // type) — 1365 findings vs 233.
          "jsx-attributes": {
            include: ["placeholder", "alt", "title", "aria-label"],
          },

          callees: {
            exclude: [
              // plugin defaults
              "i18n(ext)?", "t", "require", "addEventListener",
              "removeEventListener", "postMessage", "getElementById",
              "dispatch", "commit", "includes", "indexOf", "endsWith",
              "startsWith",
              // this repo's translator convention: t, ti, tCommon, tError,
              // tBadge, tValidation … (29 distinct names) + next-intl's
              // member forms. Without these every t(key) call inside JSX is
              // reported as a literal.
              "t\\w*", "t\\w*\\.rich", "t\\w*\\.raw", "t\\w*\\.markup",
              "intlT",
            ],
          },

          words: {
            exclude: [
              // plugin defaults
              "[0-9!-/:-@[-`{-~]+",
              "[A-Z_-]+",
              htmlEntities,
              /^\p{Emoji}+$/u,
              // decorative glyphs that are not copy — the chat typing
              // indicator (U+25CF) sits outside both the punctuation range
              // and the Emoji property, so it needs naming.
              "^[●•·–—…]+$",
            ],
          },
        },
      ],
    },
  },

  // Allowlist — one reason per entry. NOTE the escaped brackets on
  // [locale]: unescaped it is a glob character class and silently matches
  // nothing (see the doc).
  {
    files: [
      "data/**",                  // cities/regions — data, not copy
      "lib/holidays.js",          // date registry, not copy
      "lib/categoryQuestions.js", // MEH-1617 §2ג — deliberate data structure
      "lib/badges.js",            // MEH-1617 §2ג
      "lib/contact-method.js",    // MEH-1617 §2ג
      "lib/attribute-labels.js",  // MEH-1507 label registry (scope+evidence)
      "app/\\[locale\\]/dev/**",  // internal showcase, never user-facing
      "**/__tests__/**",          // fixtures, not shipped copy
      "**/*.test.{js,jsx}",
      "messages/**",              // the message files themselves
      // e2e/** is already covered by the config's global `ignores`.
    ],
    rules: { "i18next/no-literal-string": "off" },
  },

  // The MEH-1617 files are clean TODAY and must stay clean — error here so a
  // regression on them blocks, while the 139-finding backlog elsewhere stays
  // at warn. This is the "do not let the gate be born red" rollout
  // (MEH-1604: a gate that is born unreliable gets deleted).
  {
    files: [
      "components/ChatWidget.jsx",
      "components/AlertPrefsPanel.jsx",
      "components/ExperienceForm.jsx",
      "app/\\[locale\\]/settings/page.jsx",
      "app/\\[locale\\]/login/LoginClient.jsx",
    ],
    rules: { "i18next/no-literal-string": ["error", /* same options object */] },
  },
```

> על הבלוק השלישי: כדי לא לשכפל את אובייקט האופציות, הכי נקי להוציא אותו
> לקבוע אחד בראש הקובץ (`const I18N_RULE_OPTIONS = { … }`) ולהפנות אליו
> משני המקומות.

---

## ✅ Self-test — השער הוכח שהוא **מסוגל** להאדים

עקרון MEH-1604: *שער שלא הוכח שנכשל אינו שער.* שלושת השלבים הורצו בפועל:

| שלב | פעולה | תוצאה |
|---|---|---|
| 1 | baseline על 5 קבצי ה-error-set, severity=`error` | **0 errors** · exit `0` (ירוק) |
| 2 | נשתלו ב-`components/ExperienceForm.jsx:269-270`:<br>`<p>MEH-1618 self-test: this string is deliberately untranslated</p>`<br>`<input placeholder="MEH-1618 self-test placeholder" />` | **2 errors** · exit **`1`** (אדום) |
| 3 | הוסרו | **0 errors** · exit `0` · working tree נקי |

הפלט המדויק משלב 2:

```
269:10  error  disallow literal string: <p>MEH-1618 self-test: this string is deliberately untranslated</p>  i18next/no-literal-string
270:26  error  disallow literal string: placeholder="MEH-1618 self-test placeholder"                        i18next/no-literal-string
✖ 31 problems (2 errors, 29 warnings)
```

שימו לב ששני הווקטורים נתפסו: גם **טקסט JSX** וגם **attribute** מסוג
`placeholder` — כלומר בדיוק מחלקת הבאג של MEH-1608 (`cards.jsx:641`).

---

## אין צורך בשינוי workflow

`frontend/package.json` → `"lint": "eslint ."`, וה-job **Frontend lint (RTL +
Next.js rules)** (`deploy.yml:118-146`) מריץ `npm run lint`. לכן ברגע שהבלוק
נמצא בקונפיג, ה-job הקיים אוסף אותו **אוטומטית**.

אין `--max-warnings`, ולכן ההתנהגות היא בדיוק הרצויה:

* **139 ה-warnings** → `eslint` יוצא `0` → השער נשאר ירוק
* **error על 5 הקבצים הנקיים** → `eslint` יוצא `1` → **Deploy gate (required)**
  מאדים (`deploy.yml:402`, `R_LINT`)

לא נדרש patch ל-`.github/workflows/**`, ולכן לא נכתב.

---

## ה-backlog שנשאר (139 ממצאים · 41 קבצים · כולם `warn`)

הרשימה המלאה נמצאת ב-PR body של MEH-1618. חמשת הגדולים:

| קובץ | ממצאים |
|---|---|
| `app/[locale]/admin/whatsapp-failures/page.jsx` | 10 |
| `app/[locale]/producer/dashboard/page.js` | 10 |
| `components/admin/ProducerForm.jsx` | 10 |
| `app/[locale]/admin/reviews/page.jsx` | 8 |
| `components/Footer.jsx` · `components/GuideArticle.jsx` | 6 · 6 |

הרוב מרוכז במסכי **admin** — משטח פנימי, ולכן מועמד טבעי לגל השני. ההקשחה
ל-`error` גורף היא החלטה נפרדת אחרי שה-backlog מטופל.

---

## Cross-refs

`.claude/hooks/protect-lint-config.sh` (MEH-442 — למה זה doc) ·
`docs/ci/check-semantics.patch.md` (אותו דפוס) · MEH-1604 (עקרון ה-self-test) ·
MEH-1030 (registry שמשבית את עצמו בשקט) · MEH-1608 · MEH-1617 · MEH-978/840.
