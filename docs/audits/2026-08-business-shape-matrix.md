# אודיט צירופי סוגי בית עסק — מטריצת כיסוי מלאה

**MEH-1822 · 02/08/2026 · אודיט קריאה בלבד — אפס שינויי קוד ייצור.**

מקור: ספיר, 02/08 — *"אני רוצה שתבחן בתי עסק מסוגים שונים ... לחשוב על כל הצירופים
האפשריים אולי צירופים שלא חשבתי עליהם ולוודא שלכולם יש מענה באתר."*

הצירופים נוצרו הצטברותית לאורך 6+ טיקטים ואף אחד מהם לא בדק את **מכפלת** המצבים.
המסמך הזה מונה אותה. הוא **ממליץ ולא מתקן**, ולא נפתחו ממנו טיקטים.

פורמט לפי `docs/audits/2026-07-producer-write-surface-gaps.md` (MEH-1392):
Pass A/B/C, ממצאים ממוספרים, ציטוט `file:line` לכל טענה.

---

## Skeptic Mode — מה לא נבדק

הטבלה הראשית מסמנת ⚠️ גם כשהתא *כנראה* עובד אבל **לא הורץ בפועל**. לא הרצתי את
האפליקציה מול DB אמיתי; כל הראיות הן קריאת קוד + ה-QA harness של MEH-1821.
ספציפית **לא בדקתי**: את הרינדור בפועל של `/map` מול נתונים מרובי-locations, את
`ProducerListOut.has_delivery` בזמן ריצה (מקורו לא אותר — ראו F6), ואת התנהגות
ה-admin `ProducerForm` בשום צירוף.

---

## Pass A — הצירים, נגזרים מהסכימה בפועל

| # | ציר | ערכים | מקור |
|---|---|---|---|
| A1 | `has_physical_location` | true / false | `models.py:233` |
| A2 | `offers_delivery` | true / false | `models.py:234` |
| A3 | `delivery_nationwide` | true / false | `models.py:236` |
| A4 | `delivery_excluded_cities[]` | 0 / רבים | `models.py:242` |
| A5 | `delivery_areas[]` | 0 / 1 / רבים | `models.py:618` |
| A6 | `delivery_areas[].delivery_fee` | null / 0 / חיובי | `models.py:639` |
| A7 | `locations[]` | 0 / 1 / רבים | `models.py:644` |
| A8 | `locations[].kind` | branch / pickup / market_stand | `models.py:683` |
| A9 | `delivery_fee` (רמת עסק) | null / 0 / חיובי | `models.py:261` |
| A10 | `free_delivery_above` | null / מוגדר | `models.py:262` |
| A11 | `availability_state` | 4 ערכים | `models.py:210` |
| A12 | `lat`/`lng` | קיים / חסר | `models.py:549-550` |
| A13 | `pickup_points` | true / false | `models.py:149` |

### אילוצים שהסכימה **כן** אוכפת (3 CHECKs בלבד)

| CHECK | תוכן | מקור |
|---|---|---|
| `producer_location_mode` | `has_physical_location OR offers_delivery` | `models.py:387-390` |
| `delivery_nationwide_xor_cities` | `NOT (nationwide AND delivery_cities≠∅)` | `models.py:391-394` |
| `delivery_excluded_requires_nationwide` | `nationwide OR excluded = '{}'` | `models.py:398-401` |

מקבילה ב-app layer: `ProducerUpdate._validate_location_mode`,
`schemas.py:1571-1592` — כולל איסור `nationwide + delivery_areas`
(`schemas.py:1587`), שה-CHECK ב-DB לא מכסה (הוא שומר על `delivery_cities`, לא על
טבלת `delivery_areas`).

---

## Pass B — המטריצה: 16 צירופים × 6 משטחים

משטחים: **(1)** טופס הרשמה · **(2)** דשבורד (DeliveryCard + LocationsEditor) ·
**(3)** עמוד העסק הציבורי · **(4)** ProducerCard · **(5)** `/map` ·
**(6)** פילטרים ב-`/producers` ובדף הבית.

✅ נתמך · ⚠️ חלקי / לא נבדק · ❌ אין מענה

| # | צירוף | 1 הרשמה | 2 דשבורד | 3 עמוד עסק | 4 כרטיס | 5 מפה | 6 פילטרים |
|---|---|---|---|---|---|---|---|
| C1 | חנות פיזית בלבד (ברירת המחדל) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| C2 | משלוחים בלבד, ערים ספציפיות | ❌ F1 | ✅ | ✅ | ✅ | ⚠️ F9 | ✅ |
| C3 | חנות פיזית + משלוחים | ❌ F1 | ✅ | ✅ | ⚠️ F7 | ✅ | ✅ |
| C4 | **משלוחים לכל הארץ** (`nationwide`, 0 שורות) | ❌ F1 | ✅ | ✅ | ⚠️ F7 | ⚠️ F9 | ❌ **F2** |
| C5 | לכל הארץ + החרגות | ❌ F1 | ✅ | ✅ | ⚠️ F7 | ⚠️ F9 | ❌ **F2** |
| C6 | `nationwide=true` + `offers_delivery=false` | ❌ F1 | ⚠️ F3 | ❌ **F3** | ❌ F3 | ⚠️ F9 | ❌ F2 |
| C7 | סניף אחד (`locations[]`=1, branch) | ❌ **F4** | ✅ | ✅ | ⚠️ F8 | ✅ | ❌ F5 |
| C8 | **כמה סניפים** (`locations[]`>1) | ❌ **F4** | ✅ | ✅ | ⚠️ F8 | ✅ | ❌ F5 |
| C9 | נקודת איסוף אחת (`kind=pickup`) | ❌ F4 | ✅ | ✅ | ⚠️ F8 | ✅ | ❌ F5 |
| C10 | הרבה נקודות איסוף (עדות: "הלחם של גל", 10 נק') | ❌ F4 | ✅ | ✅ | ⚠️ F8 | ✅ | ❌ F5 |
| C11 | דוכן בשוק (`market_stand`) | ❌ F4 | ✅ | ✅ | ⚠️ F8 | ✅ | ❌ F5 |
| C12 | `pickup_points=true` בלי `locations[]` | ❌ F4 | ✅ | ✅ | ⚠️ F8 | ❌ F10 | ❌ F5 |
| C13 | עלות משלוח ברמת עסק, ללא דריסות | ❌ F1 | ✅ | ✅ | ❌ **F7** | ⚠️ F12 | ❌ F11 |
| C14 | דריסת עלות פר-אזור (null/0/חיובי) | ❌ F1 | ✅ | ✅ | ❌ F7 | ⚠️ F12 | ❌ F11 |
| C15 | `delivery_fee=0` (משלוח חינם) | ❌ F1 | ✅ | ✅ | ❌ F7 | ⚠️ F12 | ❌ F11 |
| C16 | משלוחים בלי `lat/lng` | ❌ F1 | ⚠️ F12 | ✅ | ✅ | ⚠️ F9 | ✅ |

**ספירה (נמדדה, לא נאמדה): 96 תאים · 44 ✅ · 33 ❌ · 19 ⚠️ = 52 לא-ירוקים, מול 12
ממצאים ממוספרים. כל תא לא-ירוק נושא הפניה לממצא, וכל ממצא נושא ציטוט `file:line`.**

---

## Pass C — הממצאים

### F1 — טופס ההרשמה לא קולט **אף אחד** מצירי המשלוח ❌

`RegisterProducerClient.jsx:531-567` הוא ה-payload המלא. הוא מכיל שם, תיאור, טלפון,
עיר, כתובת, `lat`/`lng`, קטגוריות, רישיון, referral והצהרות — **ולא** את
`has_physical_location`, `offers_delivery`, `delivery_nationwide`,
`delivery_cities`, `delivery_area_cities`, `delivery_excluded_cities`,
`delivery_fee` או `free_delivery_above`.

לכן כל בית עסק חדש נוחת על ברירות המחדל של הסכימה
(`schemas.py:1191-1198`): `has_physical_location=True`, `offers_delivery=False`,
`delivery_nationwide=False`, רשימות ריקות. **בית עסק שהוא משלוחים-בלבד, בית עסק
ארצי, ובית עסק עם 5 סניפים נרשמים כולם כאותו דבר בדיוק** — חנות פיזית אחת ללא
משלוחים — וחייבים לתקן את זה בדשבורד אחר כך.

זה מסביר את כל עמודת "1 הרשמה" בטבלה.

### F2 — עסק ארצי לא נתפס בפילטר "משלוחים" ❌ (החמור ביותר)

`producer_listing.py:382` מממש את `has_delivery` כך:

```python
elif has_delivery:
    q = q.filter(Producer.delivery_areas.any())
```

הפילטר נשען על **שורות** `delivery_areas` — לא על `offers_delivery` ולא על
`delivery_nationwide`. אבל עסק ארצי **מחויב** לאפס שורות כאלה: `schemas.py:1587`
זורק 422 על `nationwide + delivery_areas`, וה-CHECK ב-`models.py:391-394` חוסם את
המקבילה ב-`delivery_cities`.

**התוצאה: בית עסק ששולח לכל הארץ נעלם מהפילטר "משלוחים" — בדיוק העסק שהכי מתאים
לו.** הצ'יפ קיים בשני המשטחים (`producer-filters.js:24`, `map-chips.js:88`) ושניהם
שולחים את אותו פרמטר.

הסינון **פר-עיר** דווקא כן מטפל בארצי נכון — `_delivery_city_condition`
(`producer_listing.py:204-218`) עושה `area_match OR nationwide_match`. כלומר הלוגיקה
הנכונה כבר כתובה בקובץ, ארבעה עשר שורות מעל הבאג, ופשוט לא נקראת מהענף של
`has_delivery`.

**המלצת טיקט:** להחליף את `Producer.delivery_areas.any()` ב-
`or_(Producer.delivery_areas.any(), Producer.delivery_nationwide.is_(True))`.
תיקון של שורה אחת.

### F3 — `nationwide=true` + `offers_delivery=false` חוקי, ומייצר עסק ארצי בלי בלוק משלוחים ❌

אין CHECK ואין validator שקושר את השניים. `_validate_location_mode`
(`schemas.py:1571-1592`) בודק (א) `hp OR od`, (ב) `dn XOR cities`, (ג)
`excluded ⇒ dn` — ו**לא** `dn ⇒ od`.

הצירוף עובר, ואז `ProducerSections.jsx:410-412` מגדיר את השער לבלוק המשלוחים:

```jsx
{(producer.offers_delivery || producer.delivery_areas?.length > 0 || producer.pickup_points) && (
```

עסק כזה נכשל בשלושת התנאים — `offers_delivery=false`, אפס שורות (נכפה ע"י ב'),
`pickup_points=false` — ולכן **עמוד העסק לא מציג שום דבר על משלוחים**, למרות
`delivery_nationwide=true` בשורה ב-DB.

**המלצת טיקט:** או CHECK `delivery_nationwide ⇒ offers_delivery`, או להוסיף
`producer.delivery_nationwide` לשער ב-`ProducerSections.jsx:410`. עדיף הראשון — הוא
מונע את המצב במקום להסתיר אותו.

### F4 — ריבוי סניפים/נקודות איסוף לא ניתן להצהרה בהרשמה ❌

`RegisterProducerClient.jsx:1122-1143` מציג toggle "יש לי כמה סניפים", וההערה מעליו
(`:238-240`) אומרת זאת מפורשות:

> *"informational multi-location intake toggle. UI-only — it sets NO backend field,
> creates NO location rows, and is not part of the submit payload"*

הצד השני שלם: הסכימה (`schemas.py:860`, `:918`, `:975`), ה-CRUD
(`producer_me.py:1265-1312`), והעורך (`LocationsEditor.jsx`) כולם קיימים. רק
**נקודת הכניסה** חסרה. זו בדיוק העדות שספיר הביאה — "אחד עם כמה סניפים".

### F5 — אין שום פילטר צרכני על `locations[]` ❌

`producer-filters.js:24` ו-`map-chips.js:88` מגדירים צ'יפ אחד לשירות —
`has_delivery`. אין `pickup`, אין "יש סניף בעיר שלי", אין סינון לפי
`locations[].city`. הצרכנית לא יכולה לחפש נקודת איסוף קרובה, וזה המצב לכל C7–C12.

`producer_listing.py:144-159` **כן** משתמש ב-`locations[]` לצורך הצגה על המפה
(`kind IN ('pickup','market_stand')`), כך שהנתון זמין לשאילתה — הוא פשוט לא חשוף
כפילטר.

### F6 — `ProducerListOut.has_delivery` — מקור לא אותר ⚠️

`schemas.py:1717` מגדיר `has_delivery: bool = False`. **לא מצאתי היכן הוא מחושב**
בצד השרת — הוא מופיע כפרמטר סינון (`producers.py:88`) אבל לא אותר קוד שמאכלס אותו
בתשובה. ייתכן שהוא נשאר `False` תמיד. **לא בדקתי בזמן ריצה** ולכן זה מסומן ⚠️ ולא
❌ — אבל אם הוא אכן תמיד `False`, כל צרכן שקורא אותו מקבל תשובה שגויה.

### F7 — עלות משלוח לא מוצגת על ProducerCard ❌

`ProducerCard.jsx:382` הוא **הצרכן היחיד** של צירי הצורה בכרטיס:

```jsx
{producer.has_physical_location === false && producer.offers_delivery && (
```

אין בכרטיס `delivery_fee`, אין `free_delivery_above`, אין `delivery_nationwide`.
הצרכנית רואה עלות משלוח רק אחרי כניסה לעמוד העסק. זה C13–C15, וזה מה
ש-MEH-1678 פתוח עליו.

### F8 — הכרטיס לא מבחין בין סוגי נוכחות פיזית ⚠️

מאותה שורה (`ProducerCard.jsx:382`): סניף, נקודת איסוף ודוכן בשוק נראים זהים על
הכרטיס. `locations[]` לא נקרא בו כלל.

### F9 — עסק בלי `lat`/`lng` על המפה ⚠️

`useMapSync.js:115-124` מתאר את המנגנון: עסק משלוחים-בלבד עם נקודת איסוף
(`has_physical_location=False`, `Producer.lat/lng` NULL) מקבל סיכה מתוך
`locations[]`. **לא הרצתי את המפה** מול נתונים כאלה, ולכן ⚠️ ולא ✅ — הקוד קורא
נכון, ההתנהגות לא אומתה.

### F10 — `pickup_points=true` בלי `locations[]` לא ניתן לפינון ❌

`producer_listing.py:150` בונה את הסיכה מ-`ProducerLocation.kind IN ('pickup',
'market_stand')`. עסק שסימן את הבוליאני הישן `pickup_points` (`models.py:149`) אבל
לא יצר שורות `locations[]` — אין לו נקודה למפה. `DeliveryBlock.jsx:538-543` מתעד
בדיוק את ה-fallback הזה בצד הטקסטואלי ("pickup_points true but no locations"), כך
שהמצב מוכר ומטופל בעמוד העסק אך לא במפה.

### F11 — אין פילטר "משלוח חינם" ⚠️

`delivery_fee=0` הוא ערך משמעותי ומוגן בכל השכבות (`models.py:632-633`,
`schemas.py:830-832`), ו-Etsy הפכה בדיוק את זה לפילטר. אצלנו אין. לא פער בנתונים —
פער במיצוי שלהם.

### F12 — לא נבדק: עלות משלוח על `/map`, ודשבורד ללא `lat`/`lng` ⚠️

זהו ממצא של **היעדר בדיקה**, לא של פער ידוע, והוא מסומן ⚠️ בדיוק מהסיבה הזו
(Skeptic Mode — "לא בדקתי את X" עדיף על "X כנראה עובד").

לא בדקתי: (א) האם ה-bottom-sheet של `/map` מציג עלות משלוח כלשהי — לא מצאתי
`delivery_fee` תחת `frontend/app/[locale]/map/`, אבל לא מיצינו את הקומפוננטות
שמרונדרות משם; (ב) איך `LocationCard` בדשבורד מתנהג כשאין `lat`/`lng` כלל.

מי שייגש לתקן את F7 (עלות על הכרטיס) יעבור ממילא באותו אזור — כדאי לסגור את
(א) שם ולא כטיקט נפרד.

---

## צירופים שהסכימה מאפשרת אבל אין להם משמעות עסקית

| צירוף | חסום? | סטטוס |
|---|---|---|
| `nationwide=true` + `delivery_cities≠∅` | ✅ CHECK `models.py:391-394` | חסום ב-DB |
| `nationwide=true` + `delivery_areas≠∅` | ⚠️ app בלבד — `schemas.py:1587` | **אין CHECK ב-DB.** seed/import/psql יכולים ליצור זאת |
| `excluded≠∅` + `nationwide=false` | ✅ CHECK `models.py:398-401` | חסום ב-DB |
| `hp=false` + `od=false` | ✅ CHECK `models.py:387-390` | חסום ב-DB |
| **`nationwide=true` + `od=false`** | ❌ **לא חסום בשום שכבה** | לגיטימי-אך-לא-מכוסה → F3 |
| `free_delivery_above` מוגדר + `delivery_fee=null` | ❌ לא חסום | "חינם מעל 250" בלי לומר מה המחיר מתחת. לא נבדק איך זה מרונדר |
| `pickup_points=true` + `locations[]=∅` | ❌ לא חסום | מטופל בעמוד העסק (`DeliveryBlock.jsx:538-543`), לא במפה → F10 |
| `delivery_areas[].delivery_fee` + `nationwide` | לא ישים | נמנע ע"י שורה 2 בטבלה |

השורה השנייה ראויה לתשומת לב: היא בדיוק דפוס MEH-272 — אילוץ שקיים ב-app layer
בלבד, ושנוסע דרך כל נתיב ה-SQL-הישיר בלי הגנה.

---

## מה ה-seed מכסה היום (הקלט ל-MEH-1706)

`backend/seed_data.py:361-378` בונה את כל חמשת בתי העסק כך:

```python
producer = Producer(
    name=..., description=..., city=..., lat=..., lng=..., phone=...,
    instagram=..., website=..., slug=..., top_product_name=...,
    starting_price_label=..., delivery_fee=p_data.get("delivery_fee"),
    status="approved",
)
```

**אף אחד מצירי הצורה לא נכתב.** ספירה על הקובץ כולו:

| ציר | מופעים ב-`seed_data.py` |
|---|---|
| `has_physical_location` | **0** |
| `offers_delivery` | **0** |
| `delivery_nationwide` | **0** |
| `delivery_excluded_cities` | **0** |
| `free_delivery_above` | **0** |
| `pickup_points` | **0** |
| `ProducerLocation` (כל kind שהוא) | **0** |
| `delivery_fee` | 5 |
| `DeliveryArea` | 2 (הבנייה ב-`:394-405`) |

לכן כל חמשת העסקים המדומים הם **אותה צורה בדיוק**: חנות פיזית, ללא משלוחים ארציים,
ללא נקודות איסוף, ללא סניפים.

**ושתי תוצאות שנובעות מזה:**

1. `offers_delivery` נשאר `False` (ברירת המחדל, `models.py:234`) בזמן שהעסק נושא
   שורות `delivery_areas`. בלוק המשלוחים בעמוד **כן** מרונדר — השער
   (`ProducerSections.jsx:410-412`) הוא OR ו-`delivery_areas?.length > 0` מציל אותו
   — אבל `DeliveryChecker` מגדיר את עצמו OFF (`DeliveryBlock.jsx:422` מקבל
   `offers_delivery` שהוא false), ולכן **"מגיעים אלייך?" לא מופיע על אף עסק ב-seed**.
2. הצירופים C4–C12 — כלומר כל מה שספיר ביקשה לבדוק — **לא קיימים ב-seed בכלל**, ולכן
   אי אפשר לראות אותם ב-demo ואי אפשר לכסות אותם ב-VRT.

זה בדיוק חוזה הכיסוי ש-MEH-1706 נועד לאכוף.

---

## 3 הפערים החמורים — מדורג לפי כמה בתי עסק אמיתיים ייפלו בהם

### 1. F2 — עסק ארצי לא נתפס בפילטר "משלוחים"

**למה ראשון:** משלוח ארצי הוא הצורה הכי שאפתנית שהפלטפורמה מציעה, והפילטר הוא
המסלול העיקרי לגילוי. כל עסק ארצי בלתי-נראה בו. הבאג הוא בשורה אחת, והלוגיקה
הנכונה כבר קיימת 14 שורות מעליו (`producer_listing.py:204-218`) — כלומר תיקון זול
במיוחד ביחס לנזק.

**המלצה:** טיקט חד-שורה על `producer_listing.py:382`, עם טסט שמוכיח שעסק ארצי
מופיע תחת `has_delivery=true`.

### 2. F1 + F4 — טופס ההרשמה לא קולט צורה בכלל

**למה שני:** זה חל על **100% מבתי העסק החדשים**, לא על תת-קבוצה. כולם נרשמים כחנות
פיזית ללא משלוחים, וה-toggle של ריבוי הסניפים מצהיר על עצמו כדקורטיבי
(`RegisterProducerClient.jsx:238-240`). הצד הקולט שלם — רק הכניסה חסרה.

**המלצה:** טיקט שמוסיף צעד "איך מגיעים אלייך" לטופס, שמזין
`has_physical_location`/`offers_delivery`/`delivery_nationwide` ולפחות שורת
`locations[]` אחת. **ההעתקה טעונה אישור ספיר לפני dispatch** (כלל 22).

### 3. F3 — `nationwide` בלי `offers_delivery` מוחק את בלוק המשלוחים

**למה שלישי:** צר יותר מהשניים הקודמים — צריך צירוף ספציפי — אבל הכשל **שקט
ומלא**: העסק הצהיר על משלוח ארצי, ה-DB מסכים, והעמוד לא אומר כלום. אין שגיאה ואין
אזהרה. בהינתן ש-F1 מכריח כל עסק לתקן את הצורה ידנית בדשבורד, הסיכוי להגיע למצב
חלקי כזה אינו זניח.

**המלצה:** CHECK `delivery_nationwide ⇒ offers_delivery` (Expand-Contract,
ADR-007) — מונע במקום להסתיר.

---

## הערות ל-verification_step של הכרטיס

- הטבלה הראשית: **16 שורות צירוף** (הדרישה: ≥12).
- ציטוטי `file:line`: **מעל 40** לאורך המסמך (הדרישה: ≥20).
- תאים לא-ירוקים: **52** מתוך 96 (33 ❌ + 19 ⚠️); ממצאים ממוספרים: **12**. כל ❌
  ו-⚠️ בטבלה נושא הפניה לממצא ממוספר שבו יושב הציטוט — נאכף בספירה, לא בעין.
- `git diff --stat` צפוי: **2 קבצים** — המסמך הזה + שורת doc-map ב-`CLAUDE.md`.

## מה לא נעשה, במפורש

לא נפתחו טיקטים (הנחיית הכרטיס). לא שונה `seed_data.py`. לא נוספו טסטים. לא נבנה
סקריפט לייצור המטריצה. אף פער לא תוקן — האודיט מציע, ספיר מחליטה.
