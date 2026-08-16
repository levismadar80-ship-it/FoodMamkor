# שני שערי lint — ESLint patch ל-`frontend/eslint.config.mjs` (MEH-1696)

> **הבלוקים כאן מיועדים לספיר להדבקה ידנית.** `frontend/eslint.config.mjs` הוא
> **CC-deny** — `.claude/hooks/protect-lint-config.sh:21` (MEH-442) חוסם אותו
> ב-`PROTECTED_FULL` כחסימת-קובץ-מלאה, וההודעה של ה-hook עצמו היא *"If a rule
> blocks your task, REPORT to user with explanation. Do NOT modify config."*
> CC לא נגעה בקונפיג. **שום דבר כאן לא הוחל.**
>
> מה כן נחת ב-PR: התלות `eslint-plugin-playwright@2.2.2` ב-`package.json`
> (לא מוגן), כך שההחלה אצל ספיר היא הדבקה — בלי `npm i`.
> `eslint-plugin-unicorn@^64.0.0` **כבר מותקן ומחווט** (`eslint.config.mjs:6,20,30`).
>
> תקדים: MEH-1618 / `docs/ci/i18n-lint.patch.md` — אותה צורת deliverable בדיוק.

---

## מה זה פותר

שתי מחלקות שנמצאו בסריקה אחרי רגרסיית MEH-896 (בורר שפה נעלם מהדסקטופ, 5 שבועות
בלי שאף אחד תפס):

* **Class C — deferral שפג תוקפו.** הערה שמצהירה על טיקט כתנאי-מוקדם, הטיקט נסגר,
  ההערה נשארת וקוראים אותה כאילו היא עדיין תקפה. `Header.jsx:394` הוא בדיוק זה.
* **Class B — טסט שמנטרל את עצמו.** `test.fixme`, או `if (count===0) test.skip(...)`
  שהופך "האלמנט לא קיים" ל-**ירוק**. `14-language-toggle.spec.ts` הוא בדיוק זה —
  הטסט שהיה אמור לתפוס את MEH-896.

**שני השערים ב-WARN.** המטרה בסבב הזה היא למדוד נפח, לא לחסום. אף violation קיים
לא תוקן כאן — זה טיקט נפרד.

---

## ⚠️ שני ממצאים שמשנים את הקונפיג לעומת מה שהוזמן

הבלוקים לא נכתבו מהראש. כל מספר כאן **נמדד** בהרצת ESLint עם קונפיג-בדיקה
שמייבא את `eslint.config.mjs` האמיתי ומוסיף את הבלוק מעליו.

### 1 · `terms` לבדו נותן **אפס** ממצאים — צריך `allowWarningComments: false`

`unicorn/expiring-todo-comments` **כבר פעיל היום** דרך `flat/recommended`
(`eslint.config.mjs:20,30`) — ומדווח **0**. זה לא במקרה:

| מקור | ערך |
|---|---|
| `expiring-todo-comments.js:264` | `terms: ['todo', 'fixme', 'xxx']` (ברירת מחדל) |
| `expiring-todo-comments.js:268` | `allowWarningComments: true` (ברירת מחדל) |
| `expiring-todo-comments.js:308` | `getAllComments: () => options.allowWarningComments ? [] : unusedComments` |

שורה 308 היא הלב: כש-`allowWarningComments` הוא `true`, TODO **בלי תנאי תפוגה**
(תאריך / גרסת חבילה / גרסת engine) לא נבדק בכלל. כל ה-deferrals שמצאנו הם מהסוג
הזה — `TODO(MEH-1343)` הוא לא תאריך. **הוספת `terms` בלבד הייתה מייצרת שער שלא
תופס כלום ונראה ירוק.** לכן `allowWarningComments: false` חובה בבלוק.

### 2 · `e2e/**` **מוחרג גלובלית** מ-ESLint — בלי הסרתו Gate 2 הוא no-op

`eslint.config.mjs:42-50` כולל `"e2e/**"` ב-`ignores` הגלובלי. ב-flat config,
`ignores` ברמת-קונפיג **לא ניתן לביטול** ע"י בלוק מאוחר יותר. כלומר: להוסיף כללי
playwright בלי להסיר את השורה = השער לא רץ על אף קובץ.

זו חריגה מהבקשה המקורית ("על `frontend/e2e/**` בלבד") — הבקשה הניחה שהתיקייה
כבר נבדקת. היא לא. **ההסרה נדרשת, וזו החלטה של ספיר**, כי היא חושפת את `e2e/**`
לכל שאר כללי הקונפיג, לא רק ל-playwright.

---

## בלוק 1 — Gate 1: deferrals שפג תוקפם

מוסיפים בסוף מערך הקונפיג (אחרי הבלוק של MEH-1617):

```js
  // MEH-1696 Gate 1 — deferral שפג תוקפו.
  // allowWarningComments:false הוא הלב: בלעדיו הכלל בודק רק TODO עם תנאי תפוגה
  // (תאריך/גרסה) ומדווח 0 על כל ה-TODO-ים האמיתיים בריפו. ראו §1 למעלה.
  // WARN בכוונה — סבב מדידה. אין להפוך ל-error לפני שהרשימה מנוקה.
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    rules: {
      "unicorn/expiring-todo-comments": ["warn", {
        terms: ["todo", "fixme", "hack", "xxx"],
        allowWarningComments: false,
        ignoreDatesOnPullRequests: true,
      }],
    },
  },
```

### נפח נמדד — **6 ממצאים** (מתוך כל הריפו)

| file:line | term | קטע |
|---|---|---|
| `frontend/__tests__/ProfileCompletenessCard.test.jsx:123` | todo | `image/location/contact done, products...` |
| `frontend/__tests__/ProfileCompletenessCard.test.jsx:198` | todo | `location todo → 3/4 → 75%, and the...` |
| `frontend/__tests__/en-parity-guard.test.js:54` | todo | `MEH-1106:...` |
| `frontend/app/[locale]/map/MapClient.jsx:558` | hack | `kills the documented ~10px spill the old...` |
| `frontend/app/[locale]/producer/[id]/components/StickyContactBar.jsx:34` | todo | `* TODO below.` |
| `frontend/app/[locale]/producer/[id]/components/StickyContactBar.jsx:118` | todo | `MEH-1426: TODO resolved — the sticky bar...` |

6 בלבד — כי ארבעת ה-deferrals שפג תוקפם כבר נוקו ב-MEH-1695 (PR #2349). שתי
השורות ב-`StickyContactBar` מעניינות: `:118` אומרת מפורשות **"TODO resolved"**
— ההערה מתעדת פתרון ומכילה את המילה, בדיוק הרעש ש-`allowWarningComments:false`
מייצר. סביר להסב אותה לניסוח בלי המילה, לא להשתיק את הכלל.

---

## בלוק 2 — Gate 2: טסטים שמנטרלים את עצמם

**שני חלקים. שניהם נדרשים.**

### 2א — להסיר את `"e2e/**"` מה-ignores הגלובלי (`eslint.config.mjs:49`)

```diff
     ignores: [
       "public/sw.js",
       "public/workbox-*.js",
       ".next/**",
       "node_modules/**",
       "out/**",
       "build/**",
-      "e2e/**",
     ],
```

> ⚠️ ההסרה חושפת את `e2e/**` ל**כל** כללי הקונפיג, לא רק ל-playwright. הבלוק
> ב-2ב מכבה את המשמעותיים שבהם ל-e2e כדי שהחשיפה לא תייצר אלפי warnings חדשים.
> `eslint.config.mjs:214` מתעדת את ההחרגה הזו כהנחה קיימת (`"e2e/** is already
> covered by the config's global ignores"`) — כדאי לעדכן גם את ההערה ההיא.

### 2ב — הבלוק עצמו (בסוף המערך)

```js
  // MEH-1696 Gate 2 — טסט שמנטרל את עצמו.
  // תלוי בהסרת "e2e/**" מה-ignores הגלובלי (2א) — בלעדיה הבלוק לא רץ על כלום.
  // WARN בכוונה: 81 ממצאים קיימים, לא מתוקנים בסבב הזה.
  {
    files: ["e2e/**/*.{js,mjs,ts,tsx}"],
    plugins: { playwright },
    rules: {
      "playwright/no-conditional-in-test": "warn",
      "playwright/no-conditional-expect": "warn",
      // ה-e2e הם harness, לא קוד מוצר — הכללים האלה לא רלוונטיים שם
      // וההחרגה הגלובלית שהוסרה ב-2א הייתה מסתירה אותם.
      "i18next/no-literal-string": "off",
      "no-magic-numbers": "off",
      "max-lines": "off",
      "max-lines-per-function": "off",
      "max-statements": "off",
    },
  },
```

ובראש הקובץ, ליד שאר ה-imports (`eslint.config.mjs:6`):

```js
import playwright from "eslint-plugin-playwright";
```

### נפח נמדד — **81 ממצאים** ב-19 specs

`no-conditional-in-test` = 67 · `no-conditional-expect` = 14

| spec | ממצאים |
|---|---|
| `frontend/e2e/screenshots.spec.ts` | 15 |
| `frontend/e2e/visual/parity.spec.ts` | 15 |
| `frontend/e2e/flows/24-producer-locations.spec.ts` | 9 |
| `frontend/e2e/flows/05-map-navigation.spec.ts` | 6 |
| `frontend/e2e/flows/03-view-producer-detail.spec.ts` | 5 |
| `frontend/e2e/flows/11-password-policy.spec.ts` | 5 |
| `frontend/e2e/flows/04-whatsapp-click.spec.ts` | 3 |
| `frontend/e2e/flows/16-producers-browse.spec.ts` | 3 |
| `frontend/e2e/flows/22-register-personas.spec.ts` | 3 |
| `frontend/e2e/flows/06-lightbox.spec.ts` | 2 |
| `frontend/e2e/flows/08-calendar-view.spec.ts` | 2 |
| `frontend/e2e/flows/19-publish-approve-visible.spec.ts` | 2 |
| `frontend/e2e/flows/26-delivery-checker.spec.ts` | 2 |
| `frontend/e2e/mobile-audit/mobile-audit.spec.ts` | 2 |
| `frontend/e2e/visual/badge-overflow-collision.spec.ts` | 2 |
| `frontend/e2e/visual/badge-tooltip-collision.spec.ts` | 2 |
| `frontend/e2e/flows/12-axe-a11y.spec.ts` | 1 |
| `frontend/e2e/flows/14-language-toggle.spec.ts` | 1 |
| `frontend/e2e/flows/15-map-markers.spec.ts` | 1 |

**81, לא ~20** (ההערכה בכרטיס). הפער מגיע כמעט כולו מ-`screenshots.spec.ts`
ומ-`parity.spec.ts` — שני harness-ים ארוכים שבונים דוחות עם ענפים, ולא בהכרח
מייצגים את מחלקת ה"טסט שמשקר". **הרשימה דורשת טריאז' לפני כל מעבר ל-error:**
`14-language-toggle.spec.ts:19` (השומר שנכשל ב-MEH-896) ו-`parity.spec.ts`
(15 × `test.skip(true, "No producer on staging…")`) הם המחלקה האמיתית;
`screenshots.spec.ts` כנראה לגיטימי.

---

## מה **לא** נכלל — Gate 3 כבר קיים

הבקשה כללה "להוסיף desktop project ל-Playwright". **הוא כבר שם:**

```ts
// frontend/playwright.config.ts:83-92
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile",  use: { ...devices["Pixel 5"], … } },
  ],
```

1440×900 ולא 1280×800, אבל שניהם ≥1024 ולכן חוצים את אותו breakpoint
(`md` = 768) שבו MEH-896 נעלם. אין מה להוסיף. שינוי הרוחב היה מפיל את כל
baselines ה-VRT ב-`parity.spec.ts-snapshots/` — עלות גבוהה, אפס תועלת.

---

## סדר החלה מומלץ

1. הדביקי את בלוק 1 → `npm run lint` → צריך להופיע **6** warnings של
   `unicorn/expiring-todo-comments`, ו-**0 errors**.
2. הסירי את `"e2e/**"` (2א) + הדביקי את בלוק 2ב + ה-import.
3. `npm run lint` → צריך להופיע **81** warnings של `playwright/*`, ו-**0 errors**.
4. אם ספירת ה-errors זזה מ-0 — עצרי. משמעות הדבר שהחשיפה של `e2e/**` הדליקה כלל
   שלא כובה ב-2ב; הוסיפי אותו לרשימת ה-`"off"` שם.

**אין להפוך ל-`error` בסבב הזה.** שני השערים נולדים ב-warn בכוונה — MEH-1604:
שער שנולד אדום נמחק.
