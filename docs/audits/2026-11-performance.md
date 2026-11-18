# ביצועים: ‏bundle, תמונות, lazy loading, ‏N+1

> נמדד 17/11/2026 מבנייה מקומית של production ומקריאת הקוד. **בלי שינוי סכמה.**

---

## ‏1. ‏N+1 — נמצא אחד אמיתי, ותוקן

### ‏`GET /group-buys` — שאילתה לכל שורה

`_enrich` (`routers/group_buys.py:49`) קורא `len(gb.commits)` (`:50`) ו-
`gb.producer.name` / `.images` (`:54`, `:58`) **לכל שורה**, ושתי הקשרים הם
`lazy="select"`. לרשימה הציבורית לא היה `.options(...)` בכלל.

ה-`.join(Producer)` ב-`_public_group_buys` **לא** ממלא את `gb.producer` — הוא
מסנן. רק `contains_eager` או `selectinload` ממלאים.

**האסימטריה היא כל הבאג:** מסלול הבעלים (`:185`) נושא **בדיוק** את שני
ה-`selectinload` האלה מאז שנכתב. הרשימה הציבורית מעולם לא.

| מסלול | לפני | אחרי |
|---|---|---|
| ‏`GET /group-buys?producer_id=` | ‏`1 + G` שאילתות (‏G = קבוצות פתוחות, תקרה 30) | קבוע |
| ‏`GET /admin/group-buys` | ‏`1 + G` **בלי תקרה** — האדמין רואה הכול | קבוע |

ה-`selectinload` נוסף ב**מסלולי הרשימה** ולא בתוך `_status_tab_query`, מפני
שמסלול ה-`/counts` חולק את אותה שאילתה ורק סופר שורות — טעינת `commits` שם
הייתה בזבוז בכיוון ההפוך.

**שומר:** `tests/test_meh0000_group_buys_query_count.py`, לפי הדפוס של
`test_meh2541_admin_producers_query_count.py`: ספירת ה-SELECT לקבוצה **אחת**
חייבת להיות שווה לספירה ל**ארבע**. כל טעינה עצלה לכל שורה — `commits`,
`producer`, או כזו שתיווסף בעתיד — שוברת אותו.

---

## 2. מה שנראה כמו N+1 ואיננו — כדי שלא ייבדק שוב

שלושת המסלולים המרכזיים **נקיים**:

| מסלול | כבר טעון מראש |
|---|---|
| `GET /producers` (`producer_listing.py:436-444`) | `joinedload(categories)` · `selectinload` ל-products, delivery_areas, locations, offers |
| `GET /producers/{id}` · `/by-slug/{slug}` (`producers.py:482-490`, `:431-439`) | שלושה `joinedload` ועוד שני `selectinload` |
| `/events` · `/experiences` · `/recipes` · `/reviews` | `joinedload` על ה-producer/host, והספירות ב-`GROUP BY` אחד |

* `active_offer` (`models.py:761`) קורא `self.offers` לכל שורה — אבל `offers`
  טעון מראש בשני ענפי הרשימה ובשני מסלולי הפרט. תוקן כבר ב-MEH-1823 / MEH-2541.
* `Producer.reviews`, `favorited_by`, `reports`, `producer_recipes`,
  `group_buys` הם קשרים עצלים ש**אינם ב-`ProducerListOut`/`DetailOut`**.
  ‏`reviews_count` ו-`avg_rating` הם עמודות רגילות (`models.py:527-528`). אף
  אחד מהם לא נקרא, ולכן אין שם N+1.
* «נצפו לאחרונה» בדף הבית — עד 5 קריאות `GET /producers/{id}` מהדפדפן
  (`use-home-page.js:324`, תקרה ב-`recently-viewed.js:15`). זו התפרסות בצד
  לקוח, לא N+1 במסד.

---

## 3. מה שנמצא ולא תוקן — דורש הכרעה

### ‏א. ‏cartesian של שלושה `joinedload` בדף בית העסק

`producers.py:482-484` ו-`:431-433` מצרפים **שלוש אוספים** בבת אחת: products,
delivery_areas, categories. ‏SQLAlchemy מקבל `P × A × C` שורות ומסנן כפילויות
ב-Python.

דוגמה: 30 מוצרים × 12 אזורי משלוח × 3 קטגוריות = **1,080 שורות** לצפייה אחת
בעמוד. התקרות (`limits.py:31`, `:44`) מרשות במקרה הקיצון 100 × 300 × 3.

ההערה ב-`:485-486` **יודעת על זה** — היא הסיבה ש-locations ו-offers כבר הועברו
ל-`selectinload`. התיקון הוא להעביר גם את products ו-delivery_areas, ואז מספר
השאילתות עולה מ-6–7 ל-8–9 **קבוע**, והשורות צונחות.

**לא עשיתי** כי `ProductOut` נושא `position` ו-`group_id`, ו-`selectinload`
מחזיר בסדר אחר. צריך לבדוק אם הלקוח מסתמך על הסדר, וזו בדיקה שלא יכולתי להריץ
כאן (אין pytest בסביבה הזאת). **מחכה לספיר / לכרטיס משלו.**

### ב. ‏over-fetch ברשימה

`producer_listing.py:438` טוען שורות `Product` **מלאות** לעד 100 בתי עסק, רק
כדי לחשב `products_count` ושישה דגלי `has_*_products`
(`producer_queries.py:128-170`). אותו דבר ל-delivery_areas. התיקון הוא
אגרגציות ב-SQL במקום טעינת ישויות — שינוי גדול יותר, וכרטיס משלו.

---

## 4. ‏Bundle ותמונות

### מה שנמדד

| מה | ערך |
|---|---|
| ‏JS ב-`.next/static` | 7.4 MB על פני 191 chunks (כולל admin ולוח הבקרה, לא רק הבית) |
| ה-chunk הגדול | 670 KB |
| `public/` | 9.1 MB |

### ‏`android-chrome-*.png` — 486 KB שאף אחד לא מבקש

`public/android-chrome-512x512.png` (422 KB) ו-`android-chrome-192x192.png`
(63.6 KB) **לא מופיעים ב-`manifest.json` ולא בשום קובץ ב-`app/` או
ב-`components/`**. ה-manifest משתמש ב-`icon-192.png` (5.6 KB) וב-`icon-512.png`
(14.3 KB).

**זה לא עלות למשתמשת** — קובץ ב-`public/` נשלח רק אם מבקשים אותו. זו עלות
פריסה ורעש בריפו. **מחיקה היא ההחלטה הנכונה והיא לא שלי** (כלל 32b: `rm` נדחה
בסשן הזה, ולא עוקפים דחייה דרך פועל אחר). **מחכה לספיר.**

**הוכרע ובוצע 17/11** (`docs/decisions/rulings-2026-11-17.md` §א12): שני הקבצים
נמחקו ב-MEH-3386.

### ‏`og-image.png` ×2 — 2.5 MB, ובכוונה

ההערה ב-`layout.js` מסבירה: MEH-2827 העביר את ה-OG ל-JPEG (~50 KB) כי
«WhatsApp often drops a preview image that heavy», **והשאיר את ה-PNG כדי
שקישורים שכבר שותפו ישמרו על התמונה שלהם**. זו החלטה, לא פער.

### ‏Rendering — הטענה הישנה כבר לא נכונה

‏HANDOFF מ-10/11 אומר «88 מתוך 89 הדפים הציבוריים מרונדרים בכל בקשה», בגלל
`loading.js` שקרא ל-`getTranslations` בלי locale.

**נמדד היום: 64 נתיבים מרונדרים מראש (●), 65 דינמיים (ƒ), אחד סטטי (○).**
‏`app/[locale]/loading.js` הוא כבר **client component** עם `useTranslations`,
ו-MEH-2878 תיקן את זה, עם `scripts/static-routes-guard.mjs` ששומר על כך.
**הטענה הזאת ב-HANDOFF מיושנת; אין כאן מה לתקן.**

---

## 5. מה **לא** נמדד

* **מספרי שאילתות בפועל.** אין pytest בסביבה הזאת וההתקנה נדחתה, ולכן
  האריתמטיקה בסעיף 1 **נגזרה מהקוד** ולא נמדדה בריצה. השומר שנוסף **ימדוד**
  אותה ב-CI, וזו בדיוק הסיבה שהוא נוסף.
* **First Load JS לכל נתיב.** Turbopack ב-Next 16 לא מדפיס את העמודה הזאת
  בפלט הזה, ו-7.4 MB על 191 chunks הוא סך הכול ולא מה שדף הבית מוריד.
* **Lighthouse.** רץ ב-`post-deploy-checks.yml` על production בלבד, אחרי מיזוג.
