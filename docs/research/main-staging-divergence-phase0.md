# פער `main` ↔ `staging` — Phase 0

**תאריך:** 2026-08-04 · **סוג:** חקירה read-only · **קוד שהשתנה:** אפס

פרודקשן מריצה `main`. כל טענה בריפו בנוסח "בפרודקשן קורה X" היא בפועל טענה על
**הקוד שלפני הפער** — וזה השורש מאחורי כמה מסקנות שגויות של אתמול.

> ## תקציר — הפער גדול, אבל המיזוג פשוט ממה שנראה
>
> | מדידה | ערך |
> |---|---|
> | `staging` לפני `main` | **863 commits** |
> | `main` לפני `staging` | **7 commits — כולם merge commits, אפס תוכן ייחודי** |
> | נקודת הפיצול | `9bc32157`, **2026-07-23** (12 יום) |
> | `git diff origin/staging...origin/main` | **ריק** — תוכן `main` הוא תת-קבוצה של `staging` |
> | מיגרציות Alembic חדשות | **13** |
> | ראשי Alembic ב-staging | **אחד** — `d8c3f1a75e29` (מתוך 52 revisions) |
>
> **המשמעות:** אין סיכון לאיבוד תוכן, ואין multi-head לפתור. הסיכון כולו
> בנתונים ובהתנהגות, לא ב-git.

---

## 1 · הטופולוגיה — ו-7 ה-commits שאינם מה שנראה

`main` מחזיקה 7 commits ש-`staging` לא. **כולם merge commits** (`rev-list --parents`
מחזיר 3 tokens לכל אחד = commit + 2 הורים), וכולם merges של release
`staging → main`:

```
857ea5bc 2026-07-23  Merge pull request #1807 from …/staging
7abcc33e 2026-07-03  release: staging → production 2026-07-02 (#1438)
74133a2e 2026-06-23  Merge pull request #1326 from …/staging
a180fe96 2026-06-20  release: staging → main — MEH-789 nav, MEH-829 migration …
aae8ba44 2026-06-16  Release: staging → main (27 commits) …
7cfafd35 2026-06-16  Release: staging → main (#1158)
4cb50a31 2026-06-15  Release: staging → main (#1139)
```

**זו טופולוגיה, לא עבודה.** `git diff --stat origin/staging...origin/main`
מחזיר **ריק** — אין ולו שורה אחת ב-`main` שאינה ב-`staging`.

**מה זה שולל:** לא היו hotfixes ישירים ל-`main` שלא הוחזרו ל-`staging`. כלל
ה-back-merge של `deployment.md` **לא הופר**. (ההנחה ההפוכה מתבקשת מ-"main ahead
by 7" ושגויה — נבדקה ונשללה.)

---

## 2 · מה שונה מהותית

`git diff --name-only origin/main origin/staging` — ריכוז לפי תיקייה:

| תיקייה | קבצים |
|---|---|
| `frontend/e2e` | 135 |
| `frontend/__tests__` | 127 |
| `frontend/app` | 69 |
| `frontend/components` | 57 |
| `frontend/qa-artifacts` | 47 |
| **`backend/app`** | **41** |
| `frontend/lib` | 33 |

### 2.1 · פרדיקטים — הדוגמה שכבר עלתה בדם

| | `main` (פרודקשן) | `staging` |
|---|---|---|
| פילטר משלוח | `producer_listing.py:352-354`: `q.filter(Producer.delivery_areas.any())` | `_has_delivery_condition()` — `offers_delivery.is_(True) AND (delivery_areas.any() OR delivery_nationwide)` |
| `grep -c offers_delivery` באותו קובץ | **0** | **5** |

**זה בדיוק מה שהפיל את ההסקה של אתמול.** הסקה שהניחה שפרודקשן מריצה את קוד
הריפו הגיעה למסקנה הפוכה מהמדידה.

### 2.2 · סכימות ומודלים

`backend/app/models/models.py`, `backend/app/schemas/schemas.py`,
`backend/app/routers/*` — 41 קבצים ב-`backend/app` נבדלים. מדגם שאומת:
`ProducerListOut` ב-`staging` נושא `version` ב-`/health` (MEH-1596) ו-`main`
לא — **וזה נמדד מהחוץ**: תגובת הפרודקשן היא `{"status","db_init"}` בלבד, בלי
`version`. תגובת ה-API עצמה מתארכת את הפריסה.

### 2.3 · 13 מיגרציות Alembic חדשות

```
20260722  meh1490_producer_google_place_id
20260722  meh1471_add_referral_source_to_producers
20260723  meh_1508_dietary_scope_columns
20260726  meh1541_producer_established_year
20260726  meh1543_producer_order_window
20260726  merge_meh1541_meh1543_heads          ← merge revision
20260727  meh1651_group_buy_funded_notified_at
20260727  meh1577_producer_delivery_fee_fields
20260727  merge_meh1651_meh1577_heads          ← merge revision
20260729  meh1772_delivery_area_fee
20260802  meh1818_pending_nudge_sent_at
20260802  meh1823_producer_offers
20260803  meh1849_nationwide_requires_delivery ← CHECK + backfill
```

**ראש אחד בלבד** (`d8c3f1a75e29`) מתוך 52 revisions — שתי ה-merge revisions כבר
פתרו את הפיצולים בתוך העץ. **אין multi-head לפתור בזמן הפריסה.**

---

## 3 · הסיכון האמיתי אינו git — הוא נתונים והתנהגות

### 3.1 · `meh1849` מוסיף CHECK על טבלה חיה

`20260803_1200_d8c3f1a75e29` מוסיף
`NOT (delivery_nationwide AND NOT offers_delivery)`. ה-docstring שלו מזהיר
במפורש שאם ה-DB מחזיק ולו שורה מפרה אחת בזמן הפריסה, `create_check_constraint`
**מפיל את ה-BOOT** — לא CI, לא PR check, אלא השירות הרץ. לכן הוא נושא backfill
(`:105-106`) שמריץ `UPDATE producers SET offers_delivery = true WHERE
delivery_nationwide = true AND offers_delivery = false` **לפני** ההגבלה.

**מדידה רלוונטית מפרודקשן (04/08):** ארבעת העסקים שנבדקו נושאים
`delivery_nationwide = false`, ולכן **ה-CHECK אינו נוגע בהם**. ה-backfill מטפל
בכל שורה שכן. **לא נסרקו כל השורות** — רק ארבע.

### 3.2 · רגרסיה ודאית ופונה-למשתמשת ברגע המיזוג

אותם ארבעה עסקים נושאים `offers_delivery = false` עם 3 שורות `delivery_areas`
כל אחד. היום, תחת הפרדיקט של `main`, הם **מוחזרים** מצ'יפ «משלוח». אחרי המיזוג
הפרדיקט ידרוש `offers_delivery IS TRUE` — והם **ייפלו**.

**צ'יפ «משלוח» יעבור מ-4 תוצאות ל-0.** ה-backfill של `meh1849` לא יציל אותם
(הוא ממוקד ב-`delivery_nationwide = true`). זה מתועד במלואו ב-
[`meh-1878-delivery-ownership.md`](./meh-1878-delivery-ownership.md), והשאלה
החוסמת — האם ארבעת העסקים אמורים לספק משלוח — עדיין פתוחה.

---

## 4 · מסלול מיזוג בטוח-Alembic (הצעה, לא הוראה)

| # | שלב | למה |
|---|---|---|
| 0 | **להחזיר דיווח Sentry מפרודקשן** | אין 90 יום של אירועי production. מיזוג של 863 commits אל תוך סביבה שאינה מדווחת שגיאות הוא פריסה עיוורת. ראו [`health-endpoint-db-init-phase0.md`](./health-endpoint-db-init-phase0.md) §Q5 |
| 1 | **גיבוי + אימות שחזור** | 13 מיגרציות, אחת מהן CHECK עם backfill. MEH-1442/MEH-1517 כבר מכסים את הנוהל |
| 2 | **לספור שורות מפרות לפני הפריסה** | `SELECT count(*) FROM producers WHERE delivery_nationwide AND NOT offers_delivery` — ה-backfill אמור לאפס אותו; אימות לפני ולא הנחה |
| 3 | **להכריע את שאלת ארבעת העסקים** | אחרת המיזוג מוריד את צ'יפ המשלוח ל-0 בלי שאיש בחר בכך (§3.2) |
| 4 | **מיזוג `staging → main` ב-PR אחד** | תוכן `main` הוא תת-קבוצה, ולכן אין קונפליקט תוכן צפוי; ה-PR הוא נקודת הביקורת |
| 5 | **`alembic upgrade head` — ראש יחיד** | 13 revisions, ראש אחד. אין multi-head |
| 6 | **אימות עשן על `/health/readiness`** ולא על `/health` | המשטח היחיד שיאמר את האמת |

**שלב 3 חוסם את שלב 4.** השאר ניתן להכנה מראש.

---

## 5 · ההשלכה הרחבה

**כל טענת "בפרודקשן X" בריפו היא טענה על קוד מ-23/07 ומוקדם יותר.** זה כולל
תיעוד, הערות בקוד, וכל מסקנה שנשענה על קריאת הריפו במקום על מדידה. אתמול זה
הפיל הסקה אחת במסמך ה-spike; המחלקה רחבה יותר מהמופע.

**המבחן הזול:** לפני שקובעים מה פרודקשן עושה — למדוד את פרודקשן, או לקרוא את
`origin/main`. לא את עץ העבודה.
