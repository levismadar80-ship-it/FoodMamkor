# MEH-713 — Audit: pre-#857 `bg-green-50` usages (#f0fdf4 → #EAF3DE shift)

> **Scope (Option A):** רק 4 ה-usages של `bg-green-50` שהיו קיימים **לפני** PR #857, ושעברו shift שקט מ-Tailwind default `#f0fdf4` ל-canonical Mehamakor `#EAF3DE`.
> Discovery-only — אפס עריכות קוד. Closes MEH-713.
> Date: 2026-05-27 · Branch: `feature/meh-713-green-50-audit` · Refs MEH-686 / #857 / #859.

---

## 1. אימות טענת ה-"silent shift" (git evidence)

הטענה: ה-token `green-50` לא היה מוגדר ב-theme לפני #857; כל `bg-green-50` קודם נפתר ל-**Tailwind default `#f0fdf4`**. PR #857 (MEH-710) הוסיף `green-50: #EAF3DE` ל-`tailwind.tokens.json`, וה-config צורך אותו דרך `require()`+spread — כך שכל ה-usages הקיימים עברו shift ל-`#EAF3DE` בלי שאף קובץ קומפוננטה נגע.

ראיות קונקרטיות:

| בדיקה | תוצאה |
|---|---|
| `green-50` ב-`tailwind.tokens.json` ב-`ff43fbc` (pre-#857) | **0** — לא קיים |
| `green-50` ב-`tailwind.tokens.json` ב-`ea29721` (#857) | `green-50: "#eaf3de"` (line 14) |
| commit שהכניס `green-50` ל-tokens.json (`git log -S`) | **`ea29721`** — `feat(MEH-710): green scale tokens → DESIGN.md (#857)` |
| קבצים ששונו ב-#857 (`git diff-tree ea29721`) | `HANDOFF.md`, `docs/CHANGELOG.md`, `docs/DESIGN.md`, `frontend/tailwind.tokens.json` בלבד |
| האם מי מ-4 הקבצים נגע ב-#857? | **לא** — אף אחד מהם לא ב-diff של #857 |

**מסקנה:** הטענה מאומתת. ה-shift היה תוצר-לוואי של שינוי config (#857), לא עריכה מכוונת per-file. 4 ה-usages קדמו ל-#857 (קיימים כבר ב-`ff43fbc`).

> **הרחבה (flag):** #857 דרס לא רק `green-50` אלא את כל ה-scale — `green-50/100/300/500/700/900`. לכן כל usage של `green-100`/`green-700` שקדם ל-#857 עבר shift גם הוא (רלוונטי ל-Surface 1 למטה). `green-200` **לא** נוסף ב-#857 ולכן נשאר Tailwind default `#bbf7d0`.

---

## 2. סיווג per-surface (4 surfaces)

### Surface 1 — Admin: כפתור "אישור" בקשת קטגוריה
- **קובץ:** `frontend/app/[locale]/admin/category-requests/page.js:131`
- **הקשר:** כפתור `approve` (פעולת אדמין חיובית) — `text-xs bg-green-50 text-green-700 border border-green-200 hover:bg-green-100`.
- **Pre-#857 → Post-#857:**
  - `bg-green-50`: `#f0fdf4` → `#EAF3DE`
  - `text-green-700`: `#15803d` → `#2E4A2E` (= canonical `primary-dark`)
  - `hover:bg-green-100`: `#dcfce7` → `#C8DCB3`
  - `border-green-200`: `#bbf7d0` → **ללא שינוי** (#857 לא הוסיף green-200)
- **Verdict: ⚠️ AMBIGUOUS — needs Sapir designer call.** הכפתור כעת מערבב greens canonical (50/100/700) עם `border-green-200` שנשאר Tailwind-default — פלטה לא-קוהרנטית. שאלת עיצוב: לאמץ במלואו את ה-scale ה-canonical (כולל החלפת `border-green-200` בטוקן canonical), או להחזיר את הכפתור לפלטת Tailwind-green עקבית. זו הכפתור היחיד מבין ה-4 שמשתמש ב-multi-stop green scale.

### Surface 2 — Admin: כרטיס סטטיסטיקה ב-Import Preview
- **קובץ:** `frontend/app/[locale]/admin/producers/AdminProducersImportPreview.jsx:61`
- **הקשר:** `<div className="bg-green-50 rounded-[12px] p-3">` — כרטיס "to_import" עם `text-primary` כתוכן. רקע רך לכרטיס מונה.
- **Shift:** `#f0fdf4` → `#EAF3DE`.
- **Verdict: ✅ ACCEPT.** הירוק הרך ה-canonical (`#EAF3DE`, אותו ערך כמו `light`/`green-50` ה-brand) משתלב עם תוכן ה-`text-primary` — on-brand יותר מ-Tailwind default. אין רגרסיה.

### Surface 3 — Experience detail: באנר "הוגש זה עתה"
- **קובץ:** `frontend/app/[locale]/experiences/[id]/ExperienceDetailClient.jsx:116`
- **הקשר:** `<div className="bg-green-50 border border-primary text-primary ...">` — באנר אישור pending. כבר משתמש ב-`primary` ל-border+text.
- **Shift:** `#f0fdf4` → `#EAF3DE`.
- **Verdict: ✅ ACCEPT.** ה-`#EAF3DE` (brand pale green) קוהרנטי עם ה-`primary` border/text שלצדו — שיפור על-פני Tailwind default שישב ליד brand-primary.
- **הערה:** שורות 139/185/209 באותו קובץ משתמשות גם הן ב-`bg-green-50` אך **נוספו ב-#859** (MEH-702 `bg-light`→`bg-green-50`) — לא pre-existing, מחוץ ל-scope (legitimate by design).

### Surface 4 — Verify-email: עיגול אייקון הצלחה
- **קובץ:** `frontend/app/[locale]/verify-email/VerifyEmailClient.jsx:58`
- **הקשר:** `<div className="w-16 h-16 rounded-full bg-green-50 ...">✅</div>` — עיגול רקע לאמוג'י ✅ במסך "אימייל אומת". הכרטיס כבר משתמש ב-`shadow rgba(46,104,83,...)` (brand green).
- **Shift:** `#f0fdf4` → `#EAF3DE`.
- **Verdict: ✅ ACCEPT.** רקע ירוק-רך brand מאחורי checkmark של הצלחה — on-brand, ועקבי עם ה-brand shadow של הכרטיס.

---

## 3. סיכום המלצות

| # | Surface | Verdict |
|---|---|---|
| 1 | admin/category-requests:131 (כפתור approve) | ⚠️ **AMBIGUOUS** |
| 2 | AdminProducersImportPreview:61 (כרטיס מונה) | ✅ ACCEPT |
| 3 | ExperienceDetailClient:116 (באנר pending) | ✅ ACCEPT |
| 4 | verify-email:58 (עיגול ✅) | ✅ ACCEPT |

**3 ACCEPT · 1 AMBIGUOUS · 0 FIX (definite).**

- **ACCEPT (3):** המעבר ל-`#EAF3DE` הוא שיפור brand-consistency (אותו pale-green של `light`/badges), במיוחד היכן שהמשטח כבר משתמש ב-`primary`. אין רגרסיה — לא נדרשת פעולה.
- **AMBIGUOUS (1):** כפתור ה-approve ב-category-requests. **Sapir to decide** — האם לאמץ scale ירוק canonical מלא לכפתור (כולל `border-green-200` → טוקן canonical), או להחזיר פלטת Tailwind-green עקבית. אם תוחלט תיקון → **PR נפרד** (כרוך בעריכת source; מחוץ ל-scope discovery-only של MEH-713).
- **0 FIX מיידי:** אף surface לא דורש תיקון דחוף; אין רגרסיה ויזואלית ברורה. ה-AMBIGUOUS היחיד הוא שאלת קוהרנטיות-פלטה, לא שבירה.

**פעולת המשך:** אם Sapir בוחרת FIX ל-Surface 1 → לפתוח issue נפרד (source edit). אחרת — לסגור MEH-713 כ-`wontfix`/accepted עם הסיכום הזה.

---

## 4. Out-of-scope note

199 ה-usages הנוספים של `green-50` (מתוך 203 בסך הכל ב-staging) הם תוצאת ה-migration `light`→`green-50` של MEH-702/#859 — **legitimate by design ולא נבדקו כאן.**
