# MEH-1863 — צ'יפי כוונה ב-/producers: spike היתכנות (read-only)

**תאריך:** 2026-08-03 · **סוג:** spike קריאה-בלבד · **קוד מוצר שנכתב:** אפס

מסמך ממצאים בלבד. כל טענה נושאת `file:line` שאומת מול `origin/staging` בתאריך לעיל.
היכן שלא נמצאה ראיה — כתוב **"לא נמצא"**, ולא הסקה.

> **התוצאה הכי חשובה קודם:** שתי הנחות שהכרטיס (v1 וגם הנוסח המחודש §2) מציג
> כעובדות **אינן נכונות**. אין "אפס זרימת geo" — יש שתיים, והן מחוברות לחצי.
> ובנוסף, **אף preset שנבדק אינו כשיר** מול המלאי הזרוע, כולל אלה שהכרטיס
> הניח שיעבדו.

---

## Q1 — מפקד `CHIPS_CONFIG` מלא

מקור: `frontend/lib/producer-filters.js:15-24`. הערכים (label/scope/evidence) מגיעים
מ-`ATTRIBUTE_LABELS` דרך spread — `frontend/lib/attribute-labels.js`.

| # | key | label | param ל-API | scope | evidence | צורה |
|---|---|---|---|---|---|---|
| 0 | `kosher` | כשרות מאומתת | `kosher=true` | business | admin-verified | attribute |
| 1 | `vegan` | טבעוני | `vegan=true` | any-product | self-declared | attribute |
| 2 | `vegetarian` | צמחוני | `vegetarian=true` | any-product | self-declared | attribute |
| 3 | `gluten_free` | ללא גלוטן | `gluten_free=true` | any-product | self-declared | attribute |
| 4 | `lactose_free` | ללא לקטוז | `lactose_free=true` | any-product | self-declared | attribute |
| 5 | `has_delivery` | משלוח | `has_delivery=true` | business | self-declared | **intent-shaped** |
| 6 | `verified` | רישוי מאומת | `verified=true` | business | admin-verified | attribute |

בניית ה-params: `producer-filters.js:38-49` (`buildChipParams`). ברירות מחדל:
`:28-36` (`CHIPS_DEFAULT`).

**משטחי רינדור (שלושה, לא אחד):**

* `/producers` — `components/ProducersClient.jsx:19` (import), `:483` (`withChipIcons([...CHIPS_CONFIG, cityChip])`).
* דף הבית — `app/[locale]/home/HomeProducersGrid.jsx:15,70,131`.
* `/map` — **אינו** משתמש ב-`CHIPS_CONFIG`; יש לו `TOGGLE_CHIPS` משלו ב-`lib/map-chips.js:87`.

**intent-shaped מול attribute-shaped:** ששת הראשונים והאחרון מתארים **תכונה של
העסק או של מוצריו** ("טבעוני", "מאומת"). היחיד שמנוסח כ**כוונה של הקונה** הוא
`has_delivery` — «משלוח» = "שיגיע אליי". זה מאשר את ממצא ה-Phase 0 המקורי: צ'יפ 1
של v1 («מגיע עד הבית») הוא **ניסוח מחדש של `CHIPS_CONFIG[5]`**, לא פיצ'ר חדש.

---

## Q2 — האם קיימת זרימת geo? **כן — שתיים. הטענה "0" שגויה.**

הכרטיס (§2) קובע: *"«קרוב אליי» — אין ממה לעשות reuse. `grep` על זרימת geo
ב-/producers החזיר **0**."* **הממצא הזה אינו נכון**, וכך גם ה-STOP שנשען עליו.

ה-grep החזיר 0 מפני ש-`ProducersClient.jsx` **בעצמו** אינו מכיל את המחרוזות —
הקריאה ל-geolocation יושבת ב**קומפוננטת הבת**. זהו בדיוק "שאילתה שלא יכלה
לראות את התשובה" (CLAUDE.md: *"Before believing any negative, ask what the query
could not have seen"*).

### מה קיים בפועל

**(א) רכישת מיקום — קיימת ומורכבת כבר על /producers.**

| ראיה | `file:line` |
|---|---|
| `/producers` מייבא `LocationModal` | `components/ProducersClient.jsx:12` |
| ...ו**מרכיב** אותו | `components/ProducersClient.jsx:794-798` |
| המודאל קורא ל-GPS אמיתי | `components/LocationModal.jsx:71` (`navigator.geolocation.getCurrentPosition`) |
| ...וכותב ל-store המשותף | `components/LocationModal.jsx:77` (`setUserLocation(lat, lng)`) |
| ה-store המשותף | `lib/user-location.js:54` (`setUserLocation`), `:85` (`useUserLocation`) |

הקוד עצמו אומר זאת במפורש: *"it opens the LocationModal **this page already
mounts**"* — `ProducersClient.jsx:442-446`.

**(ב) סינון geo בצד השרת — קיים ומלא.**

| ראיה | `file:line` |
|---|---|
| `GET /producers` מקבל `lat`, `lng`, `radius_km` | `backend/app/routers/producers.py:74-76` |
| ...ומעביר לשירות | `backend/app/routers/producers.py:150-152` |
| מסלול Haversine + `ORDER BY distance ASC` | `backend/app/services/producer_listing.py:114-164` |

**(ג) יש כבר שני קוראים עובדים לאותו endpoint עם אותם פרמטרים.**

* דף הבית: `lib/use-home-page.js:476` — `params: { lat, lng, radius_km: radius, … }`
* `/map`: `app/[locale]/map/state/useMapSync.js:256` — `radius_km: centerRadius?.radius_km`
* ולידציית Zod לפרמטרים: `lib/schemas.js:196-203` (תקרת 50 ק"מ נגד full-table scan)

### מה באמת חסר

**רק החיווט.** מדוד:

```
grep -c "useUserLocation"            components/ProducersClient.jsx  ->  0
grep -c "radius_km\|lat:\|lng:"      components/ProducersClient.jsx  ->  0
```

`/producers` מרכיב מודאל שמבצע GPS fix וכותב את הקואורדינטות ל-store — **ואז
מתעלם מהן**. הוא מעביר למודאל `onSelectCity` בלבד (`:796`), וה-handler
(`:430-438`) מיישם **סינון שוויון-עיר** (`setCityFilter`), לא מרחק.

**מה שנדרש כדי לחבר «קרוב אליי» ל-/producers:** לקרוא `useUserLocation()` בעמוד,
ולהשחיל שלושה פרמטרים קיימים לתוך ה-fetch הקיים. אין endpoint חדש, אין מיגרציה,
אין לוגיקת geo חדשה — שני הקצוות בנויים ומשוחררים, ורק לא מחוברים זה לזה.

> **המסקנה של v1 ("לעצור") נשארה נכונה — אבל לא מהסיבה שנכתבה.** הסיבה איננה
> "אין תשתית"; יש. הסיבה האמיתית היא Q3 למטה.

---

## Q3 — אילו presets בני-ביטוי היום? **מול המלאי הזרוע: אף אחד.**

**מקור הנתונים:** `backend/seed_data.py`, נטען ל-Postgres 16 מקומי דרך
`alembic upgrade head`, ונשאל דרך ה-API האמיתי (`uvicorn app.main:app`) — לא
מקריאת קוד. הספירות הן `x-total-count` מהתגובה.

**מגבלה שיש לומר במפורש:** זהו ה-**seed שבריפו**, לא staging ולא production.
egress ל-Railway חסום מה-sandbox (CLAUDE.md, MEH-1861), ולכן ספירות פרודקשן לא
נמדדו כאן. כל מספר למטה הוא as-of 03/08 מול ה-seed בלבד.

| שאילתה | תוצאות |
|---|---|
| ללא פילטרים (בסיס) | **5** |
| `has_delivery=true` | **0** |
| `verified=true` | **0** |
| `kosher=true` | **0** |
| `vegan=true` | **0** |
| `vegetarian=true` | **0** |
| `gluten_free=true` | **0** |
| `lactose_free=true` | **0** |
| `has_delivery=true&verified=true` | **0** |
| `has_delivery=true&kosher=true` | **0** |
| `has_delivery=true&vegan=true` | **0** |
| `verified=true&kosher=true` | **0** |
| `has_delivery=true&gluten_free=true` | **0** |
| `sort=rating` | **5** |

**האפסים אומתו כנתונים, לא כתקלת probe.** קריאת ה-payload של חמשת העסקים
(`GET /producers?limit=100`) מראה שהערכים באמת ריקים:

| עסק | `has_delivery` | `verification_tier` | דגלי תזונה |
|---|---|---|---|
| טבע פור — סבונים ושמנים | False | `None` | כולם False |
| תסס — מותססים טבעיים | False | `declared` | כולם False |
| מאפיית המחמצת של דנה | False | `None` | כולם False |
| גבינות הר הגולן | False | `None` | כולם False |
| חוות הגליל — בשר אורגני | False | `None` | כולם False |

`?verified=true` מחזיר 0 גם כשקיים `declared` אחד — עקבי עם `verified` = **הדרג
המאומת ע"י אדמין** (`attribute-labels.js`: `evidence: admin-verified`), לא
הצהרה עצמית. אין כאן באג.

**לפי כלל הכרטיס עצמו — *"a preset returning 0 is disqualified"* — כל ה-presets
שנבדקו נפסלים.** זה כולל את שני הצ'יפים של v1: «מגיע עד הבית» מחזיר 0, ו-«קרוב
אליי» אינו בר-מדידה כלל כי אף עסק בזרע אינו נושא נתוני משלוח או מיקום שנבדקו כאן.

**ההשלכה החשובה:** החסם אינו טקסונומיה ואינו תשתית — הוא **מלאי**. שכבת הצ'יפים
כבר עשירה מהנתונים שמאחוריה. זה בדיוק הנושא של MEH-1862 (סף מלאי לצ'יפים), והוא
הופך מ"נחמד שיהיה" ל**תנאי מוקדם**: הוספת צ'יפ כוונה מעל מלאי ריק מייצרת מסלול
מובטח לאפס תוצאות.

---

## Q4 — מה MEH-388 צריך לספק לפני «מתנה» / «לשולחן שישי»?

`MEH-388` הוא `post-launch`, סטטוס Backlog, ומוגדר בו במפורש כ**foundation**
שחוסם את ארבעת ה-sub-issues האחרים של MEH-387.

הפער הוא לא שדה חסר אחד אלא **ארבעה צירים שלא קיימים** בסכימה היום: `dietary_tags`,
`values_tags`, `business_type_tags`, `region_tags`. הצירים הקיימים היום שונים
בטיבם: `CHIPS_CONFIG` הוא **בוליאני שטוח** (7 דגלים בינאריים), בעוד "מתנה" או
"לשולחן שישי" הם **קונטקסט של שימוש** — הם חוצים קטגוריה, מחיר, אריזה ומועד, ואף
אחד מהם אינו נגזר מדגל בוליאני קיים. אין ביטוי ל"מתנה" כצירוף של `kosher`,
`vegan`, `has_delivery` ו-`verified`, בכל תמורה שלהם.

**ומה שהכרטיס עצמו מציב כתנאי קודם לקוד:** MEH-388 דורש **הכרעה עריכתית לפני
מימוש** — ספיר מתייגת ידנית 5-10 עסקים, נבנית רשימה של ~30-50 tags, ואז מבחן
**דיסקרימינטיביות**: *"אם הכל מסומן «אורגני», ה-tag חסר ערך."* זהו בדיוק המבחן
ש-Q3 למעלה מראה שהמצב הנוכחי נכשל בו — בכיוון ההפוך: לא "כולם מסומנים", אלא
**אף אחד**.

לכן הסדר הוא: **מלאי → tags → צ'יפי כוונה.** בלי המלאי, גם טקסונומיה מושלמת
תייצר צ'יפים שמחזירים 0.

---

## סיכום למקבל ההחלטה

1. **v1 היה נכון לעצור, מסיבה שגויה.** תשתית ה-geo קיימת בשני הקצוות (Q2);
   מה שחסר הוא חיווט של שלושה פרמטרים. זה קטן משמעותית ממה שהכרטיס הניח.
2. **החסם האמיתי הוא מלאי, לא טקסונומיה** (Q3). מול ה-seed, **כל** preset מחזיר 0.
   כל צ'יפ כוונה שיישלח היום נוחת על אפס תוצאות.
3. **«מגיע עד הבית» אינו פיצ'ר** — הוא `CHIPS_CONFIG[5]` בניסוח אחר (Q1).
4. **MEH-388 חסום על הכרעה עריכתית**, לא על קוד (Q4).

**המלצה:** לא לפתוח כרטיס פיתוח לצ'יפי כוונה. למדוד קודם את המלאי **בפרודקשן**
(המדידה כאן היא של ה-seed בלבד), ולקשור את ההמשך ל-MEH-1862.
