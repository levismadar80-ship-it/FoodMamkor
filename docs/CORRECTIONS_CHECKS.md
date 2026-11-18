# Corrections → checks

> **What this file is.** Every row is a correction Sapir made **by hand**, more
> than once, mapped to the mechanical check that catches it now. The point is
> that none of these should ever reach her eyes again.
>
> **How to read a row.** «מי אוכף» names the one owner of that fact. If two
> rows ever name the same owner for the same fact, one of them is wrong — that
> is Smell #1 in [`.claude/rules/workflow.md`](../.claude/rules/workflow.md).
>
> Created under MEH-3351. The brand half of it is what
> [`docs/BRAND.md`](./BRAND.md) §7 has been asking for since MEH-1652
> («האכיפה מתוכננת כ-lexicon check ב-CI»).

---

## The five classes

| # | מה ספיר תיקנה ביד | מי אוכף את זה עכשיו | איפה זה רץ | היה קיים לפני MEH-3351? |
|---|---|---|---|---|
| 1 | «יצרן» / «יצרנית» בממשק, במקום «בית עסק» | `scripts/checks/brand-lexicon-guard.sh`, כלל `yatzran` | `Repo guards` ← `run-all.sh` | **לא** |
| 2 | אימוג'י בממשק | `frontend/__tests__/NoEmojiInComponents.test.js` · `NoEmojiInMessages.test.js` | `CI gate` ← vitest | **כן** |
| 3 | `left-*` / `ml-*` / `pl-*` במקום `start-*` / `ms-*` / `ps-*` | `scripts/checks/rtl-logical-props-guard.sh` | `Repo guards` ← `run-all.sh` | **חלקית** — ראו למטה |
| 4 | צבעים מחוץ לפלטה | `scripts/checks/raw-color-tokens.sh` (+ `z-index-tokens.sh` לשכבות) | `Repo guards` ← `run-all.sh` | **כן** |
| 5 | ביטויי שיווק אסורים (BRAND.md §7) | `scripts/checks/brand-lexicon-guard.sh`, שאר הכללים | `Repo guards` ← `run-all.sh` | **לא** |

### היקף הסריקה

`frontend/messages/*.json` · `frontend/{app,components,lib,hooks}` · `backend/app/**/*.py`.

ה-backend בהיקף **מפני שקופי משתמש נמצא שם**: גוף מיילים, טקסט וואטסאפ, ומחרוזות `detail=` ש-`backend/app/routers/CLAUDE.md` מחייב שיהיו בעברית. הסוקר העצמאי של PR #4686 מצא שם «וקניות קבוצתיות פתוחות בוטלו» במייל ביטול אמיתי (`backend/app/services/booking_cancellations.py:258`) — היקף frontend-only לא היה יכול לראות את זה לעולם.

### מה הבדיקה לא רואה (נמדד, לא משוער)

* **ביטוי שנשבר בין שתי שורות.** Prettier מפצל טקסט JSX, ואז «קנייה» בשורה אחת ו«קבוצתית» בשנייה. ב-JSON — שהוא עיקר הקורפוס — ערך הוא תמיד שורה אחת, ולכן החור הזה קיים רק ב-JSX.
* **`//` בתוך string literal.** `const s = "// "` עדיין מרוקן את שאר השורה. `//` אחרי `:` (סכמת URL) כבר **לא** מרוקן — זה היה ממצא אמיתי, ומקרה 9 ב-self-test נועל אותו.
* **פרוזה בשורת המשך של הערת בלוק** נתפסה נכון. זה בדיוק מה ש-`raw-color-tokens.sh` ו-`z-index-tokens.sh` מצהירים כנקודה עיוורת אצלם, ושם זה 3 false positives על הקורפוס הזה.

כל שלושת הפריטים מופיעים כאן ולא נשארו בהערות בקוד, כי «הפריט שמצהיר על כיסוי הוא הפריט שהכי פחות ייבדק» (`.claude/rules/testing.md`).

### על שורה 3 — למה «חלקית» ולא «כן»

הכלל היה ממוכן, אבל לא בשום מקום שמצביע על PR:

* `.claude/hooks/check-rtl.sh` הוא `PreToolUse`. הוא רואה **עריכה אחת בכל פעם**,
  ורק כשהיא עוברת דרך כלי Edit/Write של Claude Code. הוא גם fail-open בשלושה
  מקומות (אין `jq`, אין allowlist, `.md`).
* הסוכן `verify-frontend` סורק לפי בקשה, ואין לו קול ב-CI.

כלומר class גופני שהגיע בכל דרך אחרת — commit מחוץ ל-Claude Code, session עם
hooks כבויים, merge, `git apply` — נחת בלי שום אדום. הבדיקה החדשה סוגרת בדיוק את
החור הזה, על כל העץ, בכל PR.

**הכלל עצמו לא השתנה.** התבנית
(`\b(left-|right-|ml-|mr-|pl-|pr-)[0-9a-z]`) ושני מסלולי החריגה (`rtl-ok` בחלון
±1, ו-PATH EXCEPTIONS) **מועתקים מה-hook**, וה-allowlist נקרא מהקובץ של ה-hook
עצמו. בעלות אחת לעובדה «מה נחשב הפרה», ובעלות אחת ל«מה פטור». הרחבת התבנית
(ל-`text-left`, `border-l`) היא שינוי כלל ומקומה ב-hook, שהוא קובץ של ספיר
(כלל 32).

---

## מה נמצא במדידה הראשונה (17/11/2026)

### RTL — נקי

597 קבצים, **0 מופעים** לא-פטורים. 18 ההתאמות הגולמיות כולן פטורות כדין: קובץ
ב-PATH EXCEPTIONS, או `rtl-ok` עם נימוק (`MapKey.jsx:51-52`, `:127` הן הדוגמה
הטובה), או פרוזה בתוך הערה. המיגרציה ל-`ms-`/`me-`/`ps-`/`pe-` באמת הושלמה, ולכן
הבדיקה נחתה כ**כשל קשה עם baseline ריק**, בלי ratchet.

> **0 הוא גם מה שסורק שבור מדפיס.** לכן המספר לבדו אינו ראיה, ושתי הבקרות
> חובה: `--self-test` (7 מקרים, כולל בקרת parsed-0 שחייבת להאדים בעצמה) רץ
> **לפני** השער ומבטל את הריצה אם נכשל; והזרקת `ml-4` ל-`frontend/components/Footer.jsx`
> מאדימה את השער בשם `Footer.jsx:183`, ושחזור הקובץ מחזיר אותו לירוק.

### Lexicon — ארבע הפרות אמת, אחת מהן תוקנה כאן

| מה | איפה | מה נעשה |
|---|---|---|
| «קנייה קבוצתית» · «קניות קבוצתיות» | `he.json` ×4 (`business_warning`, `fee_item_group`, `counted_body`, `counted_body_no_rescue`) | **תוקן.** הוחלף במונח הנעול «קבוצת רכישה» (BRAND.md §7, ספיר 08/11/2026, MEH-2827). החלפת מונח בתוך משפט מאושר, לא קופי חדש. |
| «קניות קבוצתיות» במייל ביטול | `backend/app/services/booking_cancellations.py:258` | **תוקן.** מייל אמיתי ללקוחות. נמצא ע"י הסוקר העצמאי של PR #4686, אחרי שההיקף הורחב ל-`backend/app`. |
| «מורשים» בקופי צרכני | `he.json`, תיאור ה-meta של `/experiences` | **ב-baseline.** הפרה אמיתית של ADR-022 (שפת שכבות = מאומת/מוצהר), אבל הניסוח המחליף הוא קופי חדש ודורש אישור מילה-במילה (כלל 22). **מחכה לספיר.** |
| «marketplace» · «פלטפורמת מסחר» | `he.json` ×2, `en.json` ×1 | **ב-baseline.** שלושתן אומרות «מהמקור **לא** בנוי כמו marketplace» — המונח מופיע כדי לשלול אותו. BRAND.md §7 אוסר את המילה ולא מחריג שימוש שולל. שינוי = קופי חדש. **מחכה לספיר.** |
| «marketplace» ב-prompt של ה-AI | `backend/app/services/producer_risk.py:68` | **ב-baseline.** זה לא קופי בכלל, אלא ה-system prompt באנגלית ל-Anthropic («You are a marketplace fraud detector…»). §7 חל על מה שאדם קורא באתר ובשיווק; הוראה למודל איננה אף אחד מהשניים, והמילה שם נושאת מידע — היא אומרת למודל איזה סוג הונאה לחפש. |
| «יצרן» | 4 מופעים, כולם בהערות ובתוך «רישיון יצרן» | **אין הפרה.** החריג של MEH-1264 (שם הרישיון הרשמי) מכוסה בבדיקה. |

---

## איך מוסיפים כלל חדש ל-lexicon

1. קודם כותבים אותו ב-[`docs/BRAND.md`](./BRAND.md) §7. **BRAND.md הוא ה-SoT** —
   כלל בבדיקה בלי שורה שם הוא באג **בבדיקה**.
2. מוסיפים שורה ל-`RULES` ב-`scripts/checks/brand-lexicon-guard.sh`:
   `id<TAB>תבנית-אסורה<TAB>תבנית-חריג` (או `-` אם אין חריג).
   המפריד הוא TAB בדיוק מפני שכל תבנית מכילה `|`.
3. מוסיפים מקרה ל-`--self-test`, ו**מראים אותו נכשל לפני התיקון** (MEH-1619).
   מקרה אחד לפחות מעוגן לקובץ אמיתי בריפו (MEH-1909).
4. אם יש הפרות חיות שדורשות קופי — `--update-baseline`, ונימוק מעל השורות.
5. מוסיפים שורה לטבלה כאן.

## איך מורידים שורה מ-baseline

מתקנים את המחרוזת ומריצים `--update-baseline`. השורה חייבת להיעלם: שורת baseline
שלא מתאימה לכלום היא **אדומה**, ולכן מחרוזת שתוקנה לא משאירה אחריה רישיון קבוע.

---

## מה ה-baseline-ים לא עושים

אף אחד מהם לא מחליט אם ניסוח הוא **טוב**. הם מחליטים דבר אחד: «נכנס ביטוי שכבר
הוחלט עליו, ואף אחד לא רשם את זה». החלטות ניסוח הן של ספיר — כלל 22 ב-
[`.claude/rules/workflow.md`](../.claude/rules/workflow.md).
