# ProducerSchema — מיפוי call-sites והכרעת גבול הסכימה (MEH-1752, Phase 0)

> **סטטוס:** Phase 0 בלבד. אפס שינויי runtime. `frontend/lib/schemas.js` לא נגעה.
> **תאריך:** 28/07/2026 · **מקור האמת למספרים:** מסמך OpenAPI חי שנוצר מקוד `staging`
> הנוכחי (כולל MEH-1750), לא מדוח MEH-1748.
>
> **⛔ גודל bundle אינו שיקול במסמך הזה.** MEH-1751 מדד את מספרי הספייק כארטיפקט
> esbuild שהתהפך תחת `next build` אמיתי (+2,073 B, גרוע). הציר אינו מדוד לשני
> הכיוונים, ולכן ההכרעה כאן על **נכונות ותחזוקתיות בלבד**.

---

## 1 · הממצא המבני — ‏`ProducerDetailOut` הוא superset מלא של `ProducerListOut`

מדוד מול המסמך החי:

| | שדות |
|---|---|
| `ProducerListOut` | **63** |
| `ProducerDetailOut` | **80** |
| `ProducerSchema` (יד) | **50** |

```
ListOut ⊆ DetailOut ................ True    (list-only fields: 0)
ProducerSchema ⊆ DetailOut ......... True
ProducerSchema ⊆ ListOut ........... False   (בגלל 4 שדות detail-only)
```

**שני היחסים האלה קובעים את כל השאר:**

1. **אין ולו שדה אחד שקיים ב-`ListOut` ולא ב-`DetailOut`.** שני החוזים אינם "שני
   חוזים חופפים חלקית" — הם **מדרג**. detail = list + 17.
2. **`ProducerSchema` היא תת-קבוצה של `ProducerDetailOut`**, לא איחוד של שתיים.
   התיאור בכרטיס ("איחוד ידני של שתיים") מדויק בכוונה אך לא בצורה: היא פשוט
   **חלקית מול החוזה הגדול**, ובמקרה 4 מהשדות שלה לא מוגשים על-ידי הקטן.

זה משנה את מרחב האפשרויות — ראו §6.

---

## 2 · טבלת ה-call-sites — כל אתר שמפרסר תגובת producer

| # | file:line | endpoint | סכימה | חוזה backend |
|---|---|---|---|---|
| 1 | `lib/use-home-page.js:326` | `GET /producers` (`loadProducers`, `:318`) | `ProducersResponseSchema` | `ProducerListOut` |
| 2 | `lib/use-home-page.js:360` | `GET /producers` (`delivery_cities`) | `ProducersResponseSchema` | `ProducerListOut` |
| 3 | `lib/use-home-page.js:430` | `GET /producers` (geo `radius_km`) | `ProducersResponseSchema` | `ProducerListOut` |
| 4 | `app/[locale]/map/state/useProducersFeed.js:49` | `GET /producers` (`:45`) | `ProducersResponseSchema` | `ProducerListOut` |
| 5 | `app/[locale]/favorites/FavoritesClient.jsx:140` | `GET /users/me/favorites` | `FavoriteWithProducerSchema` → `ProducerSchema.loose()` | `FavoriteOut.producer` = `ProducerListOut` |
| 6 | **`lib/use-home-page.js:236`** | **`GET /producers/{id}`** (`:232`) | **`ProducerSchema`** | **`ProducerDetailOut`** |
| 7 | `lib/use-home-page.js:607` | `GET /producers/random` (`:606`) | `RandomProducerSchema` | `ProducerRandomOut` (`{id, slug}`) |
| 8 | `lib/favorites-cache.js:51` | `GET /users/me/favorites` | `FavoritesResponseSchema` | `FavoriteOut` (`producer_id` בלבד, ללא producer מקונן) |

**‏6 מתוך 8 נוגעים ב-`ProducerSchema`; אתר אחד בלבד (#6) מפרסר תגובת detail.**
‏#7 ו-#8 משתמשים בסכימות עצמאיות קטנות ואינם מושפעים מאף אפשרות ב-§6.

### אתר שאינו בטבלה — ובכוונה

`app/[locale]/producer/[id]/page.js:9` מביא `GET /producers/{id}` דרך
`serverFetch` ו**אינו מפרסר ב-Zod כלל** (`lib/server-fetch.js` לא מכיל
`Schema`/`safeParse`). זהו המסלול שמזין את `ProducerDetail` → `ContactCard`.
עובדה זו נושאת את כל §4.

---

## 3 · השדות ה-detail-only — מול המסמך החי

**MEH-1748 אמר "four". המספר הנכון הוא 17 — והארבעה הם תת-קבוצה שלהם.**
הדוח ההוא ספר את ה-detail-only ש-`ProducerSchema` **מצהירה עליהם**; הכרטיס ביקש
לאמת "כמה שדות detail-only יש", וזו שאלה אחרת. שתי התשובות נכונות לשתי שאלות
שונות, ולכן: **תיקון, לא סתירה.**

17 השדות שקיימים ב-`ProducerDetailOut` ולא ב-`ProducerListOut`:

```
contact_name · created_at · custom_questions · established_year ·
external_order_form ★ · facebook ★ · google_place_id · instagram ★ ·
order_window · owner_bio · owner_photo_url · products · report_count ·
story_card_url · updated_at · website ★ · whatsapp_group
```

`★` = מוצהר ב-`ProducerSchema` (4 מתוך 17). היתר — 13 — אינם מוצהרים כלל.

---

## 4 · ⚠️ הממצא המכריע: ארבעת השדות ה-detail-only הם משקל מת

זו הנקודה שמפילה את ההנחה שעליה נבנתה השאלה בכרטיס. שלוש עובדות, כל אחת נמדדה:

**א. הם inert בכל חמשת אתרי ה-list.** `GET /producers` לעולם אינו מחזיר
`website` / `instagram` / `facebook` / `external_order_form` — הם אינם ב-`ProducerListOut`.
בחמשת האתרים 1–5 ההצהרות האלה אינן עושות דבר.

**ב. האתר היחיד שמפרסר detail אינו צורך אף אחד מהם.**
`use-home-page.js:236` מזין `recentlyViewed` → `page.js:244` →
`HomeRecentlyViewed` (`app/[locale]/home/HomeStaticBlocks.jsx:18`).
הרכיב קורא **בדיוק חמישה שדות**, ואומתו אחד-אחד:

```
p.id · p.name · p.slug · p.images · p.city
```

**כל החמישה קיימים ב-`ProducerListOut`.** אפס שדות detail-only.

**ג. הצרכן האמיתי שלהם לא עובר דרך `ProducerSchema` בכלל.**
`ContactCard.jsx:120-121` קורא `p.facebook` ו-`p.external_order_form` (ו-`:105-106`
את `instagram`) — אבל הוא מקבל את ה-producer מ-`ProducerDetail`, שמוזן מ-
`page.js:9` **ללא Zod**. השדות מגיעים אליו במסלול לא-מאומת.

### מה זה מבטל

> דוח MEH-1748, blocker (b): *"generating only ProducerListOut silently breaks
> recently-viewed."*

**זה שגוי, ואני כתבתי את זה.** `recentlyViewed` צורך חמישה שדות שכולם ב-`ListOut`.
פירוק ל-list+detail, או אפילו החלפת האתר ב-#6 בסכימה list-shaped, **לא היה שובר
אותו.** הדוח הסיק מ"השדות מוצהרים ומשמשים במקום כלשהו" ל"משמשים באתר הזה", ולא
בדק את הרכיב. הקוד מנצח, ואומר את ההפך.

---

## 5 · פגמים חיים — מדווחים, לא מתוקנים

| # | פגם | היקף | קולני או שקט? |
|---|---|---|---|
| **D1** | **17 שדות ש-`ListOut` מגיש ו-`ProducerSchema` מפשיטה** בכל 5 אתרי ה-list: `ambassador`, `delivery_cities`, `delivery_excluded_cities`, `delivery_fee`, `delivery_nationwide`, `description`, `free_delivery_above`, `gluten_free_facility`, `kashrut_certs`, `lactose_free_facility`, `organic_certified`, `phone_verified`, `pickup_points`, `status`, `vacation_until`, `vegan_scope`, `vegetarian_scope` | 5 אתרים | **שקט** — בדיוק מנגנון ההישנויות 1–7 |
| **D2** | **30 שדות מופשטים באתר ה-detail** (`:236`) — 17 של D1 + 13 detail-only לא-מוצהרים | אתר 1 | **שקט**. לא מזיק **היום** כי `HomeRecentlyViewed` צורך 5 בלבד |
| **D3** | **4 הצהרות inert** על אתרי ה-list (§4א) | 5 אתרים | **שקט**, לא מזיק — `.optional()` |
| **D4** | **מסלול ה-detail הראשי אינו מאומת כלל** — `page.js:9` דרך `serverFetch`, ללא Zod, בעוד rule 19 מחייב אימות לפני צריכה | דף העסק כולו | **שקט** |

**D4 הוא הגדול מכולם ואינו בסקופ הכרטיס.** הכרטיס שואל אם סכימה אחת יכולה לשרת
שני חוזים; D4 אומר שהחוזה השני **כמעט ואינו מפורסר בפועל** — אתר יחיד ושולי
(`recentlyViewed`) מול הדף המרכזי שעוקף את השכבה. אני מדווח ולא מתקן.

`kashrut_certs` ב-D1 ראוי לתשומת לב נפרדת: `KashrutBadgeStrip` מקבל `certs`
(MEH-1672), והשדה מופשט בכל feed שמפורסר.

---

## 6 · האפשרויות

### (1) להשאיר סכימה מאוחדת אחת — status quo

* **call-sites שמשתנים:** 0
* **מה נשבר בבחירה שגויה:** אין "בחירה" — אין מה לטעות בו
* **קולני או שקט:** לא רלוונטי; הכשל אינו בבחירה אלא ב**הצטברות** — D1/D2 נשארים, וההישנות השמינית מגיעה באותו מנגנון
* **עלות:** המבנה שייצר 7 הישנויות נשאר על כנו

### (2) פיצול ל-`ProducerListSchema` + `ProducerDetailSchema`

* **call-sites שמשתנים:** 6 (‏1–6). חמישה עוברים ל-list, אחד (#6) ל-detail
* **מה נשבר בבחירה שגויה:** אתר list שיבחר בטעות detail-schema — **לא נשבר כלל**, כי detail ⊇ list, פשוט מצהיר יותר משיגיע. אתר detail שיבחר list-schema — מפשיט 17 שדות
* **קולני או שקט:** **שקט לשני הכיוונים.** `z.object` מפשיט בלי לזעוק — זהו בדיוק המנגנון של ההישנויות
* **עלות:** מכפיל את מספר הסכימות ומוסיף החלטה בכל call site חדש, בלי שהטעות תהיה גלויה. **וחשוב:** מכיוון ש-`ListOut ⊆ DetailOut`, הפיצול יוצר שתי סכימות שאחת מהן היא רישא של השנייה — כלומר דורש תחזוקה כפולה של אותם 46 שדות משותפים

### (3) סכימת בסיס + הרחבת detail

```
ProducerListSchema  = z.object({ ...46 השדות המשותפים })
ProducerDetailSchema = ProducerListSchema.extend({ ...השדות ה-detail-only })
```

* **call-sites שמשתנים:** 6, בדיוק כמו (2)
* **מה נשבר בבחירה שגויה:** זהה ל-(2) — שקט
* **עלות:** **אפס שכפול.** 46 השדות המשותפים מוצהרים פעם אחת, וההרחבה מצהירה רק את הדלתא. זה **משקף את מבנה ה-backend אחד-לאחד**, כי `ListOut ⊆ DetailOut` הוא בדיוק היחס ש-`.extend()` מבטא
* **‏`.loose()` שורד:** `.extend()` מחזיר `z.object` רגיל, ו-`.loose()` נשאר מתודה עליו — `api-schemas.js:92` ממשיך לעבוד ללא שינוי (MEH-1713 מוגן)

---

## 7 · המלצה

**אפשרות (3) — בסיס + הרחבה.** בביטחון בינוני-גבוה על הצורה, נמוך יותר על התזמון.

הנימוק אינו "שתי סכימות עדיפות על אחת" אלא **שהיחס בין החוזים כבר קיים ומדוד**:
`ListOut ⊆ DetailOut`, 0 שדות list-only. `.extend()` הוא הביטוי המדויק של היחס
הזה ב-Zod. אפשרות (2) מבטאת את אותו דבר תוך שכפול 46 שדות, ואפשרות (1) לא מבטאת
אותו כלל. מבין השלוש, רק (3) הופכת "אני מפרסר detail" ל**הצהרה מפורשת בקוד** במקום
לעובדה שצריך לגלות דרך `git log`.

**ההמלצה אינה נשענת על "הפיצול מציל את `recentlyViewed`" — §4 הראה שאין מה להציל שם.**

### הטיעון הנגד — ואני חושב שהוא חזק

**‏(3) לא סוגר את מחלקת ההישנות. היא מזיזה אותה.** שבע ההישנויות היו "שדה שהחוזה
מגיש ואיש לא הצהיר עליו". אחרי הפיצול, D1 עדיין קיים — 17 שדות מופשטים ב-list —
כי `ProducerListSchema` תיוולד מ-46 השדות הקיימים, לא מ-63. **הישנות מספר 8 תיראה
בדיוק אותו דבר**, רק בקובץ עם שם אחר. הדבר היחיד שבאמת סוגר את המחלקה הוא שהצהרת
השדות תיגזר מהחוזה במקום להיכתב ביד — וזה MEH-1748, שהכרטיס הזה חוסם.

**ושנית:** הפיצול מוסיף החלטה־לכל־call-site שכשלונה **שקט**, בתמורה לבהירות מבנית.
זו בדיוק העסקה שהכרטיס עצמו מזהיר מפניה ("פיצול מכריח כל call site לבחור"). מי
שסבור שהערך של הבהירות אינו מכסה את הסיכון — עמדתו לגיטימית, והיא (1).

**מסקנת ביניים כנה:** ההכרעה בין (1) ל-(3) אינה מכריעה את מחלקת ההישנות לאף כיוון.
היא מכריעה אם **החוזה גלוי בקוד**. אם ספיר בוחרת (3), כדאי שתיבחר **כהכנה
ל-MEH-1748** ולא כתחליף לו.

---

## 8 · MEH-1608 — נבדק, אין התנגשות

MEH-1608 הוסיף `_normalize_instagram` (`backend/app/schemas/schemas.py:203`) ו-
`@field_validator("instagram")` (`:668`) — נורמליזציה **בצד הקלט**, לאחסון handle
חשוף. MEH-1752 עוסק ב**איזו סכימת תגובה מצהירה** על השדה. אותו שם שדה, שני צדדים
שונים של החוזה — **אין חפיפה ואין התנגשות.**

נקודת עניין: ההערה ב-`schemas.py:191-192` מצביעה על `ContactCard.jsx:105-106`
כ-renderer הציבורי — כלומר MEH-1608 מסתמך על אותו מסלול לא-מאומת שתועד ב-D4.

---

## 9 · STOP

הכרעת ספיר נדרשת לפני כל שינוי runtime. `ProducerSchema` לא פוצלה,
`frontend/lib/schemas.js` לא נגעה, והקובץ הזה הוא היחיד שנוצר.
