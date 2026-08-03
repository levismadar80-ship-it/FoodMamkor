# MEH-1878 — בעלות על "האם העסק מספק משלוח": Phase 0

**תאריך:** 2026-08-03 · **סוג:** חקירה read-only · **קוד/סכימה שהשתנו:** אפס

כל ממצא מתויג **MEASURED** (נמדד ישירות) או **DEDUCED** (הוסק). התיוג הזה הוא
מה שהפך את הבאג הזה לניתן לפעולה מלכתחילה — הוא נשמר כאן.

> ## תקציר — שלוש מסקנות שמשנות את הכרטיס
>
> 1. **ההסקה שהכרטיס נשען עליה — הופרכה.** ארבע השורות בפרודקשן נושאות
>    `offers_delivery = **false**`, לא `true`. **MEASURED.**
> 2. **אין באג גלוי למשתמשת היום.** תג המשלוח על הכרטיס **כן נדלק** לארבעתן,
>    כי `badges.js` עושה OR עם `delivery_count` (=3 לכל אחת). הסתירה
>    "סינון אומר יש, כרטיס אומר אין" **אינה מתקיימת**. **MEASURED.**
> 3. **הסיכון האמיתי הפוך ועתידי:** פרודקשן מריצה קוד ישן ב-**786 commits**.
>    ברגע ש-staging תגיע ל-main, הפרדיקט של MEH-1848 יוסיף
>    `offers_delivery IS TRUE`, וארבע השורות ייפלו ממנו — צ'יפ «משלוח» יעבור
>    מ-4 תוצאות ל-**0**. ה-backfill של MEH-1849 **לא** יתקן אותן. **MEASURED + DEDUCED.**

---

## Q1 — השורות בפרודקשן

`GET https://mehamakor.co.il/api/producers?limit=100&has_delivery=true` →
`x-total-count: 4`, אורך מערך 4.

| עסק | `has_delivery` | `offers_delivery` | `delivery_nationwide` | `delivery_areas` | `delivery_count` |
|---|---|---|---|---|---|
| טבע פור — סבונים ושמנים | `false` | **`false`** | `false` | **3** | 3 |
| תסס — מותססים טבעיים | `false` | **`false`** | `false` | **3** | 3 |
| מאפיית המחמצת של דנה | `false` | **`false`** | `false` | **3** | 3 |
| חוות הגליל — בשר אורגני | `false` | **`false`** | `false` | **3** | 3 |

**MEASURED.** כל ארבעת השדות מסודרים על `ProducerListOut`
(`backend/app/schemas/schemas.py:1891` — המחלקה; `has_delivery` `:1928`,
`offers_delivery` `:1984`, `delivery_nationwide` `:1985`, `delivery_areas`
`:2000`, `delivery_count` `:1957`), ולכן נקראו מה-API הציבורי של פרודקשן ולא
מ-DB. **לא נדרשה ולא בוצעה גישה ל-DB של פרודקשן** — היא ממילא ב-deny-list
(`.claude/rules/security.md`).

### ההסקה של MEH-1863 מופרכת

מסמך ה-spike כתב: *"הוסק ולא אומת — שארבע השורות נושאות `offers_delivery=true`
עם שורות `delivery_areas` או דגל ארצי. זו הדרך היחידה שהפרדיקט מתאים."*

**המדידה מראה `offers_delivery = false` בכולן.** ההסקה הייתה שגויה — והיא
הייתה שגויה מפני שהיא הניחה שפרודקשן מריצה את הקוד שבריפו. היא לא.

### מה פרודקשן באמת מריצה

| בדיקה | תוצאה |
|---|---|
| `fbe18d52` (MEH-1848, הוספת `offers_delivery` לפרדיקט) ב-`origin/staging`? | **כן** |
| אותו commit ב-`origin/main`? | **לא** |
| `git rev-list --count origin/main..origin/staging` | **786** |
| `grep -c offers_delivery` על `producer_listing.py` **ב-main** | **0** |

**MEASURED.** הפרדיקט שרץ בפרודקשן הוא (`origin/main`,
`backend/app/services/producer_listing.py:352-354`):

```python
elif has_delivery:
    q = q.filter(Producer.delivery_areas.any())
```

`delivery_areas.any()` בלבד. לכל אחת מארבע השורות יש 3 שורות `delivery_areas`
→ הפרדיקט מתאים. `offers_delivery` אינו נקרא כי **הקוד הפרוס אינו מכיר אותו**,
ו-`has_delivery` אינו נקרא באף גרסה.

**ההתנהגות שנצפתה מוסברת במלואה. אין שארית לא מוסברת.**

---

## Q2 — כותבים

### `has_delivery` (העמודה, `models.py:159` — `Column(Boolean, default=False)`)

| נתיב | anchor | הערה |
|---|---|---|
| יצירת עסק ע"י אדמין | `backend/app/routers/admin.py:184` | `has_delivery=data.has_delivery` |
| ייבוא CSV | `backend/app/services/producer_import.py:284` | עמודה K בגיליון (`:7`) |
| baseline migration | `alembic/versions/20260424_0815_ef8fb1858f5b_baseline.py:108` | `nullable=True` |
| טופס אדמין (frontend) | `components/admin/ProducerForm.jsx:149,408,890-894` | checkbox |

**MEASURED.** **אין כותב בהרשמה ואין כותב בדשבורד הבעלים** — grep על
`has_delivery` ב-`auth.py` וב-`producer_me.py` לא מחזיר השמה
(`producer_me.py:921` הוא `has_delivery_area`, שם אחר ומשתנה מקומי).
כלומר בעלת עסק **אינה יכולה לקבוע את הערך הזה בעצמה**; רק אדמין או ייבוא.

### `offers_delivery` (`models.py:253` — `NOT NULL, default=False`)

| נתיב | anchor |
|---|---|
| יצירת עסק ע"י אדמין | `backend/app/routers/admin.py:194` |
| עדכון בעלים | `ProducerUpdate.offers_delivery` (`schemas.py:1593`) דרך `PUT /producers/me` |
| הרשמה | `ProducerRegister` — נבדק, **לא נמצא** |
| CHECK + backfill | `alembic/versions/20260803_1200_d8c3f1a75e29` (MEH-1849) |

---

## Q3 — קוראים (הלקח של MEH-903: עמודה ריקה ≠ עמודה מתה)

**הממצא המרכזי, ו-MEASURED: אף משטח צרכני אינו קורא את `has_delivery` לבדו.**

`frontend/lib/badges.js:258-262` — תג המשלוח:

```js
return (
  !!producer.has_delivery ||
  (typeof producer.delivery_count === "number" && producer.delivery_count > 0)
);
```

זהו **OR**. עם `delivery_count = 3` בכל ארבע השורות, **התג נדלק** למרות
`has_delivery: false`. נמדד לכל ארבעתן.

| קורא | anchor | קורא את השדה לבדו? |
|---|---|---|
| תג משלוח (כרטיס/פירוט) | `frontend/lib/badges.js:258-262` | **לא** — OR עם `delivery_count` |
| טבלת אדמין | `frontend/app/[locale]/admin/producers/AdminProducersTable.jsx:127` | **כן** — אך משטח אדמין בלבד |
| טופס אדמין | `frontend/components/admin/ProducerForm.jsx:890` | כן (עריכה) |
| צ'יפ «משלוח» | `frontend/lib/producer-filters.js:24,46` | **לא** — שולח `?has_delivery=true` כפרמטר; ההכרעה בשרת |
| `/map` chipState | `app/[locale]/map/state/useMapFilters.js:121,168,…` | **לא** — שם מקומי ל-toggle, לא שדה מהשרת |

**מסקנה: טענת החומרה בכרטיס אינה מתקיימת.** אין היום סתירה גלויה למשתמשת בין
הסינון לכרטיס. `has_delivery` היא עמודה שקטה שקוראים אותה בעיקר משטחי אדמין.

---

## Q4 — דלתא 4 מול 5: **נפתרה, MEASURED**

| מקור | ערך |
|---|---|
| `GET /api/stats` | `producers_count: 5` |
| `GET /api/producers` (ברירת מחדל) | 4 |
| `GET /api/producers?availability_state=on_vacation` | **1 — «גבינות הר הגולן»**, `status = approved`, `availability_state = on_vacation` |

4 + 1 = 5. **הסיבה:** `producer_listing.py` (main) `:291-293` —

```python
if filters.get("availability_state") is None:
    q = q.filter(Producer.availability_state != "on_vacation")
```

MEH-291 Phase 3: עסק בחופשה מוסתר מהליסטינג **כברירת מחדל**, ונשאר נגיש
בסלאג ישיר או ב-`?availability_state=on_vacation` — בדיוק כפי שההערה בקוד
מבטיחה, ובדיוק כפי שנמדד. `/api/stats` (`marketing.py:89`) סופר **רק**
`status == "approved"` ולכן כולל אותו.

**שני המספרים נכונים; הם עונים על שתי שאלות שונות.** לא באג. **קאשינג נשלל:**
`/api/stats` מחזיר `x-vercel-cache: MISS` ו-`max-age=0, must-revalidate`,
ושלוש קריאות עם cache-buster החזירו 5 עקבי.

**הערה נלווית שלא נחקרה:** `GET /api/health` בפרודקשן מחזיר
`{"status":"ok","db_init":"failed"}`. `db_init: failed` לא נבדק כאן ואינו חלק
מהשאלות — נרשם כתצפית פתוחה.

---

## Q5 — המלצה (המלצה, לא הכרעה)

### מה שהחקירה שינתה

הכרטיס הוגדר סביב "שתי בעלויות על אותה עובדה". **הבעיה הזו אמיתית** — אף
פרדיקט, לא הישן ולא החדש, אינו קורא את `has_delivery`, בעוד הוא השדה המסודר.
אבל היא **אינה** מה שגרם לתצפית, והיא **אינה** גלויה למשתמשת.

### מה שדחוף יותר — רגרסיה ממתינה

**DEDUCED (מקוד מדוד, לא מהרצה):** כש-786 ה-commits יגיעו ל-main, הפרדיקט
יהפוך ל-`offers_delivery IS TRUE AND (delivery_areas.any() OR nationwide)`
(`producer_listing.py:268-276` ב-staging). ארבע השורות נושאות
`offers_delivery = false` → **צ'יפ «משלוח» יחזיר 0 במקום 4.**

ו-**ה-backfill של MEH-1849 לא יציל אותן**: הוא מעדכן
`WHERE delivery_nationwide = true AND offers_delivery = false`
(`d8c3f1a75e29:105-106`), ולארבע השורות `delivery_nationwide = false`.

זה בדיוק המצב ש-MEH-1849 עצמו מתאר כבלתי-אכיף: *"rows in `delivery_areas`
while `offers_delivery = false` … lives across two tables and is therefore NOT
expressible here; it is enforced only in the query layer."* **הנתונים בפרודקשן
נמצאים היום במצב הזה, בכל השורות שנבדקו.**

### שלוש אפשרויות, עם tradeoffs

| | גישה | בעד | נגד |
|---|---|---|---|
| **א** | `offers_delivery` הוא הבעלים; `has_delivery` נגרעת (Expand-Contract, ADR-007) | מיישר קו עם MEH-1848/1849; עמודה אחת מוצהרת ע"י הבעלים | דורש גריעה מ-3 משטחי אדמין + backfill; העמודה עדיין נקראת ב-`AdminProducersTable:127` |
| **ב** | `has_delivery` הופכת לעמודה נגזרת (derived) מ-`offers_delivery`+scope | השדה המסודר מפסיק לשקר; אפס שינוי ל-frontend | דורש trigger או שכבת סנכרון — MEH-1849 סימן את שניהם כמחוץ לסקופ |
| **ג** | לא לגעת בסכימה; **לתקן את הנתונים** לפני הדיפלוי הבא | הכי זול, מסיר את הרגרסיה הממתינה, אפס סיכון סכימה | לא פותר את שתי-הבעלויות; אותו drift יחזור |

**המלצה: (ג) קודם, ואז (א).** התיקון הדחוף הוא **דאטה**, לא סכימה: להביא את
ארבע השורות ל-`offers_delivery = true` (הן באמת מספקות משלוח — יש להן 3 אזורי
משלוח כל אחת), **לפני** שה-786 commits מגיעים לפרודקשן. כיוון התיקון זהה לזה
ש-MEH-1849 כבר נימק: לתקן **לכיוון** היכולת הקיימת, לא לכיוון ברירת המחדל.

**אין כאן הצעת migration ואין SQL.** לפי ADR-003/ADR-007 כל שינוי סכימה עובר
Alembic בלבד, ותיקון דאטה בפרודקשן אינו בסמכות CC.

---

## מה שנעצר במכוון

התיקון **נראה מובן מאליו** — לעדכן `offers_delivery = true` בארבע שורות. זה
בדיוק הרגע שהכרטיס הגדיר כ-STOP, והוא נעצר:

* התיקון נשען על שאלה שלא נמדדה — **האם ארבע השורות באמת אמורות לספק משלוח**,
  או ש-`offers_delivery=false` הוא הצהרה מכוונת של הבעלים ושורות ה-`delivery_areas`
  הן שאריות. ההבדל הוא בין תיקון לבין הפעלת יכולת שבעלת עסק כיבתה במכוון —
  וזו בדיוק המחלקה ש-MEH-1848 נכתב כדי לכבד.
* אין לי קריאה להיסטוריית השינויים של השורות, ולכן אין לי דרך להכריע.

**זו השאלה היחידה שחוסמת את ההמשך**, והיא לספיר.
