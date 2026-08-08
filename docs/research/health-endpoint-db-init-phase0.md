# `/health` מדווח `ok` בזמן ש-`db_init` נכשל — Phase 0

**תאריך:** 2026-08-04 · **סוג:** חקירה read-only · **קוד שהשתנה:** אפס

כל ממצא מתויג **MEASURED** או **DEDUCED**. הכל נמדד מול פרודקשן (`mehamakor.co.il`),
מול הקוד של `origin/main` (מה שפרודקשן מריצה), ומול Sentry.

> ## תקציר — הפער אינו בעיצוב, הוא ב**מצביע**
>
> 1. **התשובה הנכונה כבר קיימת בפרודקשן.** `GET /health/readiness` מחזיר
>    **HTTP 503** `{"status":"not_ready","reason":"db_init_failed"}`. **MEASURED.**
> 2. **`/health` הוא alias לאחור מתועד** ש**מקודד** `"status": "ok"` — הוא לא
>    "שוכח" להיות degraded, הוא מחזיר צורה שהוקפאה בכוונה. **MEASURED.**
> 3. **הבאג האמיתי:** `railway.json:8` מצביע את ה-healthcheck על `/health`
>    ולא על `/health/readiness` — **בשני הענפים**. ה-docstring אומר במפורש
>    שההחלפה ידנית ופוסט-merge; היא לא בוצעה. **MEASURED.**
> 4. **ממצא חמור יותר שלא חיפשתי:** ל-Sentry **אפס אירועים מפרודקשן ב-90 יום**,
>    בזמן ש-`db_init` בפרודקשן כן נכשל דרך נתיב שקורא `capture_background_exception`.
>    **MEASURED** (שהאירועים נעדרים); **הסיבה לא נקבעה.**

---

## Q1 — מה `db_init` מודד בפועל

`backend/app/startup.py:145-160` — `_run_db_init_sync()` עושה **שני** דברים:

```python
Base.metadata.create_all(bind=engine)   # :150 — MEH-352 רשת ביטחון ל-dev/CI;
                                        # checkfirst=True → no-op כשהטבלאות קיימות
seed()                                  # :158 — seed_data.seed()
```

`_init_db_background` (`:162-176`) עוטף את שניהם: הצלחה → `db_init_status = "ready"`,
חריגה → `capture_background_exception(exc, task="db_init")` ואז `"failed"`.

**מה `db_init` אינו מודד:** נגישות ה-DB. זו בדיקה נפרדת (`_db_select_1_ok`),
ומשתמש בה **רק** `/health/readiness`. **MEASURED.**

לכן `db_init: "failed"` פירושו **"`create_all` או `seed()` זרקו"** — ולא
"ה-DB מת". הקוד עצמו אומר זאת ב-`startup.py:187`:
*"a seed() crash sets db_init='failed' but the DB may still hold a perfectly
valid revision"*.

---

## Q2 — מתי זה התחיל להיכשל

**לפרודקשן: לא ידוע. אין ראיה.** אין ולו אירוע אחד מ-environment `production`
ב-Sentry ב-90 הימים האחרונים (ראו Q5). אין לי גישה ללוגים של Railway
(egress חסום, MEH-360). **אני לא יודע מתי הפרודקשן התחיל להיכשל, ואין לי דרך
לקבוע זאת מכאן.**

**ל-staging יש תשובה מדויקת**, ואותו מנגנון בדיוק — `MEHAMAKOR-BACKEND-P`:

| שדה | ערך |
|---|---|
| שגיאה | `IntegrityError: ForeignKeyViolation … producer_categories_category_id_fkey` |
| פירוט | `Key (category_id)=(1) is not present in table "categories"` |
| מסגרת | `seed_data.py:380` — `db.flush()` בתוך `seed()` |
| נקרא מ- | `startup.py:158` → `_run_db_init_sync` → `seed()` |
| תג | `background_task: db_init` |
| **First seen** | **2026-08-02T08:20:25.285Z** |
| **Last seen** | **2026-08-04T08:41:31Z** |
| מופעים | **200** |
| environment | **`staging`** · release `2a348fa8` |

**זהירות — זו ראיה מ-staging, לא מפרודקשן.** התג אומר `staging` במפורש. הפיתוי
לייחס אותה לפרודקשן גדול (אותו קוד `seed()`, אותה צורת כשל), אבל זו **הסקה
ולא מדידה**. מה שכן ניתן לומר: **מנגנון כשל תואם קיים ומתועד**, והוא מסביר
`db_init: failed` בלי שום תקלה ב-DB עצמו.

---

## Q3 — האם משהו פונה-למשתמשת נפגע? **לא. MEASURED.**

חמש בדיקות מול פרודקשן:

| endpoint | HTTP |
|---|---|
| `/api/producers?limit=1` | **200** |
| `/api/stats` | **200** |
| `/api/categories` | **200** |
| `/api/events/upcoming?limit=1` | **200** |
| `/api/producers/by-slug/ruach-hasadeh` | **404** (`בית עסק לא נמצא`) — 404 תקין, לא 500 |

**והשלכה על הקוד:** `startup.py:174` כתב ללוג
*"background DB init failed — /producers et al will 500 until fixed"*.
**המדידה מפריכה את המשפט הזה במצב הנוכחי** — `/producers` מחזיר 200. הודעת
השגיאה טוענת יותר מדי, וקורא שיאמין לה יחפש תקלה שאינה קיימת.

> **✅ תוקן 05/08 (MEH-1905 §6.3).** השורה נכתבה מחדש ואומרת עכשיו מה שידוע ולא
> מה שנשמע מדאיג:
> *"background DB init failed — create_all/seed did not complete. /health/readiness
> will report 503; endpoints may still serve normally if the schema was already
> present (MEH-1905)."*
>
> הציטוט למעלה נשמר כפי שהוא — הוא הרשומה של מה שנמדד, ומחיקתו הייתה מוחקת את
> הסיבה שבגללה השורה השתנתה. **מספר השורה זז** (הנימוק המלא נכנס כהערה מעל
> ה-`log.error`), אז חפשו את המחרוזת ולא את `:174`.

---

## Q4 — למה הסטטוס `ok` ולא `degraded`

**כי `/health` הוא alias מתועד, לא בדיקת בריאות.** `backend/app/routers/health.py`
מגדיר **שלושה** משטחים (docstring `:1-15`):

| endpoint | תפקיד | התנהגות ב-main |
|---|---|---|
| `/health/liveness` | התהליך חי, בלי DB | 200 תמיד — **נמדד 200** |
| `/health/readiness` | `SELECT 1` + `db_init_status` + alembic head | **נמדד 503** `db_init_failed` |
| `/health` | **alias לאחור** — משמר את הצורה שלפני MEH-483 | `{"status":"ok","db_init":…}` — `ok` **מקודד** ב-main `:96` |

**זו ההפרדה התקנית של k8s** (liveness מול readiness), והריפו כבר מיישם את
המוסכמה שהתלונה מבקשת: תלות קריטית שנפלה → **readiness מחזיר 503**, לא
"degraded". אין כאן פגם עיצובי.

**הפגם הוא המצביע:**

```json
// railway.json:8 — זהה ב-origin/main וב-origin/staging
"healthcheckPath": "/health",
```

וה-docstring (`health.py:10-14`) אומר את זה בפירוש:

> *"so the Railway healthcheck (currently pointed at ``/health`` per
> ``railway.json:8``) … keep working **until the path is flipped to
> ``/health/readiness`` manually** post-merge."*

**ההחלפה לא בוצעה.** התוצאה: Railway בודקת את המשטח היחיד מהשלושה שמובטח
להחזיר `ok`. **זהו בדיוק "מוניטור ששיקר"** — לא בגלל באג, אלא בגלל שהמדידה
מופנית לכתובת הלא נכונה.

**מחלקה מוכרת בריפו:** פעולה ידנית פוסט-merge בלי אכיפה ובלי תאריך — אותה
משפחה של MEH-1643 ו-MEH-487 שהריפו כבר נכווה מהן.

---

## Q5 — ממצא נלווה: פרודקשן אינה מדווחת ל-Sentry כלל

לא חיפשתי את זה; הוא צף כשניסיתי לתארך את Q2.

| מדידה | תוצאה |
|---|---|
| `environment:production`, 90 יום | **0 issues** |
| כלל ה-issues הפתוחים, 90 יום | **8** — **כולן** `environment: staging` |
| ה-URLs באירועים | `foodmamkor-staging.up.railway.app` |

בו-זמנית, `/health` של פרודקשן מדווח `db_init: "failed"` — כלומר הענף
`except` ב-`startup.py:171` **כן רץ בפרודקשן** וקרא ל-`capture_background_exception`.
אירוע כזה אמור היה להופיע.

**שתי סיבות אפשריות, אף אחת לא אומתה:** (א) אין DSN של Sentry בסביבת
הפרודקשן ב-Railway, כך שהלכידה לא מגיעה לשום מקום; (ב) פרודקשן מדווחת תחת תג
environment אחר. **לא בדקתי משתני סביבה של פרודקשן** — הם מחוץ להישג יד מכאן.

**למה זה חמור:** זה מכפיל את הבעיה המקורית. ה-healthcheck מדווח `ok`, **וגם**
מדווח השגיאות שקט. שני מקורות האמת על מצב הפרודקשן מסכימים שהכל תקין, ואף
אחד מהם לא באמת מסתכל.

---

## ממצא שאינו בתחום השאלות — 500 חי ב-staging

`MEHAMAKOR-BACKEND-T` (+4 issues אחיות): `RecursionError: maximum recursion
depth exceeded` על `/producers/by-slug/{slug}`, **4,167 מופעים** ב-issue אחד
(סה"כ ~4,534 בחמש), first seen **2026-08-02T10:22:44Z**, last seen לפני דקות,
substatus **escalating**. המסגרת: `app/middleware.py:142` — שרשרת ה-middleware.
`environment: staging`.

**זה סוגר פריט פתוח ב-HANDOFF:** *"`by-slug` של Railway staging מהבהב — 500
לסירוגין … ה-traceback נמצא בלוגים של Railway; ה-sandbox חסום"*. ה-traceback
אינו רק ב-Railway — **הוא ב-Sentry**, והשגיאה היא `RecursionError`, לא בעיית DB.

**בפרודקשן אותו נתיב מחזיר 404 תקין** (נמדד למעלה), כך שההשפעה שנצפתה היא
staging בלבד.

---

## מה לא נעשה, במכוון

אין תיקון. הפיתוי הברור — לשנות `railway.json:8` ל-`/health/readiness` — הוא
שינוי תצורת deploy של פרודקשן, וההשלכה שלו אינה קוסמטית: ברגע שההחלפה תבוצע,
Railway תתחיל **להיכשל** את ה-healthcheck על המצב הנוכחי (`db_init: failed`),
מה שעלול למנוע deploy או להפיל את השירות בבדיקה. **קודם צריך להבין למה
ה-seed נכשל בפרודקשן — וזה בדיוק מה שאי אפשר לדעת בלי Sentry או לוגים.**

הסדר הנכון: (1) להחזיר דיווח Sentry מפרודקשן · (2) לאבחן ולתקן את כשל ה-seed
· (3) רק אז להחליף את מצביע ה-healthcheck.
