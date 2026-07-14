# Programmatic-SEO Inventory Spike — קטגוריה × גאוגרפיה

> **Phase-0 read-only spike עבור [MEH-1204](https://linear.app/mehamakor/issue/MEH-1204) · ticket [MEH-1206].**
> מטרה: לספור כמה חיתוכי **קטגוריה × גאוגרפיה** באמת עוברים סף תוכן ראוי, ולנעול 3 החלטות IA
> (עיר מול אזור · ערך סף · URL shape) **לפני** שבונים עמוד נחיתה אחד.
> **אפס קוד מוצר. docs-only.** כל טענה על קוד קיים = ציטוט `file:line`.

**נאסף:** 2026-07-14 09:29 UTC · **מחבר:** Claude Code (Phase-0 analyst) · **סטטוס:** proposal ל‑review של ספיר.

---

## TL;DR (ההמלצה, מלמעלה)

**אל תבנו עמודי n/category×geo כרגע.** במלאי החי (production) יש **5 בתי עסק מאושרים בלבד**, פרוסים על
**5 ערים שונות** ו‑~6 קטגוריות — **כל תא במטריצה = 1 לכל היותר**. **אפס** חיתוכים עוברים אפילו את סף ה‑≥3,
לא בחלוקה לפי עיר ולא לפי אזור. ייצור עמודים עכשיו = **doorway/empty pages** = נטל SEO אמיתי (soft‑404,
[MEH-918](https://linear.app/mehamakor/issue/MEH-918)), לא נכס.

**כשהמלאי יגדל** (ההמלצות המותנות, ראו §7): לחלק **לפי אזור** (לא עיר) · סף **≥5** · **path‑based URL**
(`/producers/{category}/{region}`) · self‑canonical · ותא מתחת לסף מחזיר **404 אמיתי** ולא 200.

---

## 1 · מקור הנתונים (data source) — מה נשאל ומה חזר

**מה השתמשתי:** ה‑**API הציבורי של production** דרך `https://mehamakor.co.il/api/*`
(ה‑Next.js rewrite ב‑`frontend/next.config.js:138-142` ממפה `/api/:path*` → ה‑backend server‑side).

**למה לא staging (כפי שהכרטיס ביקש):** `staging.mehamakor.online` חסום מאחורי **Vercel SSO /
Deployment Protection** — כל בקשה מ‑ה‑CC sandbox מקבלת `302 → vercel.com/sso-api` ואז
`CONNECT tunnel failed, response 403`. ה‑sandbox לא יכול לעבור את שער ה‑SSO (מגבלת סביבה מוכרת,
משפחת [MEH-360](https://linear.app/mehamakor/issue/MEH-360) — Railway/פרוקסי). production **פתוח וקריא**,
וזהו **המלאי האמיתי** שעליו נשענת החלטת ה‑SEO ממילא — לכן זה גם המקור הנכון וגם היחיד הזמין.
**caveat:** ל‑staging ייתכן demo/test data שונה; המסקנה (defer) עמידה בכל מקרה כי production=5.

**כל הבקשות read‑only (`GET`), ללא auth, על נתונים ציבוריים** — אותם endpoints שכל דפדפן פוגע בהם.

### הפילטר של "public‑visible" — מאומת `file:line` לפני הספירה

הפרדיקט של הרשימה הציבורית הוא **`Producer.status == "approved"`**, ב‑query builder (לא ב‑router):

- `backend/app/services/producer_listing.py:137` — `.filter(Producer.status == "approved")` (SELECT, ענף non‑geo)
- `backend/app/services/producer_listing.py:143` — אותו פילטר על ה‑COUNT query
- `backend/app/services/producer_listing.py:105` + `:118` — אותו פילטר בענף ה‑geo
- אין שער `is_verified`/`published`/`moderation_status` על הרשימה הציבורית. אימות משפיע רק על הפילטר
  האופציונלי `?verified` (`producer_listing.py:199-206`, על `verified_at`).
- **ניואנס:** הרשימה הדיפולטית מסתירה `availability_state == "on_vacation"` אלא אם נתבקש במפורש
  (`producer_listing.py:180-182`). לעומת זאת `/producers/count` ו‑`/producers/cities` סופרים את **כל**
  ה‑approved (בלי החרגת vacation). לכן `count=5` אך הרשימה הדיפולטית מחזירה 4 — ה‑5 (קצרין) ב‑vacation.
  לצורך מלאי SEO ספרתי את **כל 5 ה‑approved** (עמוד vacation עדיין קיים ונגיש ב‑slug → עדיין "מלאי").

### Raw count output (query + result) — לשחזור

```bash
# 1) total approved (canonical public-visibility filter: status=="approved")
$ curl -sS "https://mehamakor.co.il/api/producers/count"
{"count":5}

# 2) approved non-vacation (default public list) — city + categories per producer
$ curl -sS "https://mehamakor.co.il/api/producers?limit=100&offset=0"
# returned 4:
#  טבע פור - סבונים ושמנים   | city=זכרון יעקב | cats=[סבונים טבעיים, קוסמטיקה טבעית]
#  תסס - מותססים טבעיים       | city=ירושלים    | cats=[מותססים וכבושים]
#  מאפיית המחמצת של דנה       | city=תל אביב    | cats=[לחמים ואפייה]
#  חוות הגליל - בשר אורגני    | city=כרמיאל     | cats=[דגים]

# 3) the hidden 5th (on_vacation, counted in /count + /cities but not in default list)
$ curl -sS "https://mehamakor.co.il/api/producers?limit=100&availability_state=on_vacation"
# returned 1:
#  גבינות הר הגולן            | city=קצרין      | cats=[חלב וגבינות]

# 4) per-city approved counts (server-side GROUP BY city)
$ curl -sS "https://mehamakor.co.il/api/producers/cities"
[{"city":"זכרון יעקב","count":1},{"city":"ירושלים","count":1},
 {"city":"כרמיאל","count":1},{"city":"קצרין","count":1},{"city":"תל אביב","count":1}]

# 5) live taxonomy (18 categories — matches seed SoT)
$ curl -sS "https://mehamakor.co.il/api/categories"   # → 18 rows
```

---

## 2 · המלאי המלא (5 בתי עסק מאושרים)

| # | בית עסק | עיר | אזור (הצעה §5) | קטגוריות | availability_state |
|---|---------|-----|----------------|----------|--------------------|
| 1 | טבע פור - סבונים ושמנים | זכרון יעקב | חיפה | סבונים טבעיים, קוסמטיקה טבעית | accepting_orders |
| 2 | תסס - מותססים טבעיים | ירושלים | ירושלים | מותססים וכבושים | accepting_orders |
| 3 | מאפיית המחמצת של דנה | תל אביב | מרכז | לחמים ואפייה | accepting_orders |
| 4 | חוות הגליל - בשר אורגני | כרמיאל | צפון | דגים¹ | available_today |
| 5 | גבינות הר הגולן | קצרין | צפון | חלב וגבינות | on_vacation (מוסתר מהרשימה) |

> ¹ **data quirk (לתיעוד, לא לתיקון בכרטיס זה):** בית העסק בשם "חוות הגליל - **בשר** אורגני" מסווג בפועל
> תחת הקטגוריה **דגים** (`cats=["דגים"]`). כנראה שגיאת seed/assignment. מחוץ ל‑scope (read‑only), נרשם כאן.

**עובדות מפתח לספירה:** 5 בתי עסק · 5 ערים שונות · **בכל עיר בדיוק 1** · producer #1 נושא **2 קטגוריות**
(→ תורם 2 תאים). סה"כ תאים לא‑ריקים = **6** (5 עסקים, אחד עם 2 קטגוריות).

---

## 3 · מטריצה A — קטגוריה × **עיר** (raw `city`)

18 קטגוריות (rows, לפי `GET /categories` החי) × 5 ערים (cols). תא = מספר בתי עסק מאושרים.

| קטגוריה \ עיר | זכרון יעקב | ירושלים | תל אביב | כרמיאל | קצרין |
|---|---|---|---|---|---|
| חלב וגבינות | 0 | 0 | 0 | 0 | **1** |
| ביצים | 0 | 0 | 0 | 0 | 0 |
| לחמים ואפייה | 0 | 0 | **1** | 0 | 0 |
| ירקות | 0 | 0 | 0 | 0 | 0 |
| פירות | 0 | 0 | 0 | 0 | 0 |
| מותססים וכבושים | 0 | **1** | 0 | 0 | 0 |
| מוצרים מוכנים | 0 | 0 | 0 | 0 | 0 |
| צמחי מרפא ותוספים | 0 | 0 | 0 | 0 | 0 |
| סבונים טבעיים | **1** | 0 | 0 | 0 | 0 |
| קוסמטיקה טבעית | **1** | 0 | 0 | 0 | 0 |
| נרות וארומה | 0 | 0 | 0 | 0 | 0 |
| יין, בירה ומשקאות | 0 | 0 | 0 | 0 | 0 |
| תבלינים וצמחי תיבול | 0 | 0 | 0 | 0 | 0 |
| שוקולד וממתקים בוטיק | 0 | 0 | 0 | 0 | 0 |
| שמנים | 0 | 0 | 0 | 0 | 0 |
| דבש | 0 | 0 | 0 | 0 | 0 |
| דגים | 0 | 0 | 0 | **1** | 0 |
| בשר | 0 | 0 | 0 | 0 | 0 |

**סיכום מטריצה A (עיר):** 18 × 5 = **90** תאים אפשריים · **6** לא‑ריקים · ערך תא מקסימלי = **1**.

| סף | # חיתוכים שעוברים |
|---|---|
| ≥3 | **0** |
| ≥5 | **0** |
| ≥10 | **0** |

---

## 4 · מטריצה B — קטגוריה × **אזור** (הצעת מיפוי §5)

18 קטגוריות × 7 אזורים. אזורים ללא מלאי (שרון / שפלה / דרום) מושמטים מהתצוגה (כולם 0).

| קטגוריה \ אזור | צפון | חיפה | ירושלים | מרכז |
|---|---|---|---|---|
| חלב וגבינות | **1** (קצרין) | 0 | 0 | 0 |
| לחמים ואפייה | 0 | 0 | 0 | **1** (ת"א) |
| מותססים וכבושים | 0 | 0 | **1** (י-ם) | 0 |
| סבונים טבעיים | 0 | **1** (זכ"י) | 0 | 0 |
| קוסמטיקה טבעית | 0 | **1** (זכ"י) | 0 | 0 |
| דגים | **1** (כרמיאל) | 0 | 0 | 0 |
| *(12 קטגוריות נותרות)* | 0 | 0 | 0 | 0 |

**סיכום מטריצה B (אזור):** 18 × 7 = **126** תאים אפשריים · **6** לא‑ריקים · ערך תא מקסימלי = **1**.
(צפון מרכז 2 עסקים — כרמיאל+קצרין — אך בקטגוריות שונות, לכן שום תא category×region לא מגיע ל‑2.)

| סף | # חיתוכים שעוברים |
|---|---|
| ≥3 | **0** |
| ≥5 | **0** |
| ≥10 | **0** |

> **מסקנת שתי המטריצות זהה:** אגרגציה לאזור **לא** מצילה — כי הפיזור הוא בעיקר על פני **קטגוריות**
> שונות, לא רק ערים. עם 5 עסקים ב‑6 קטגוריות, אין צפיפות בשום ממד. הצוואר הוא **גודל מלאי מוחלט**,
> לא בחירת ה‑bucket.

---

## 5 · טבלת מיפוי עיר → אזור  ⚠️ הצעה ל‑review של ספיר

7 אזורים לפי הכרטיס: **צפון · חיפה · שרון · מרכז · שפלה · ירושלים · דרום**.
המיפוי החי (5 הערים) + ערים נפוצות כ‑seed ל‑approve. **סימון:** כל שורה = הצעה, לא נעול.

| עיר | אזור מוצע | ודאות | הערה |
|---|---|---|---|
| קצרין | צפון | גבוהה | רמת הגולן |
| כרמיאל | צפון | גבוהה | גליל |
| זכרון יעקב | **חיפה** | בינונית | חוף הכרמל — גבול חיפה/שרון, החלטה של ספיר |
| ירושלים | ירושלים | גבוהה | — |
| תל אביב | מרכז | גבוהה | גוש דן |
| *(seed להרחבה — לא במלאי כרגע)* | | | |
| חיפה, נהריה, עכו, טבריה, צפת, קרית שמונה | צפון/חיפה | — | חיפה+קריות=חיפה; גליל/גולן=צפון |
| נתניה, הרצליה, רעננה, כפר סבא, הוד השרון | שרון | — | — |
| רמת גן, גבעתיים, בני ברק, פתח תקווה, חולון, בת ים | מרכז | — | גוש דן |
| ראשון לציון, רחובות, נס ציונה, מודיעין, לוד, רמלה, אשדוד | שפלה | — | אשדוד גבול שפלה/דרום |
| בית שמש, מבשרת ציון | ירושלים | — | מטרופולין ירושלים |
| באר שבע, אשקלון, אילת, דימונה, ערד | דרום | — | — |

> **פתוח להחלטה:** (א) זכרון יעקב = חיפה או שרון? (ב) אשדוד = שפלה או דרום? (ג) האם "מרכז" ו"שפלה"
> נפרדים או מאוחדים? ספיר מאשרת לפני שהמיפוי נכנס לקוד כלשהו.

---

## 6 · דפוסי קוד קיימים — `file:line` (4 המבוקשים + בונוס)

### 6.1 — `/events` city+category URL sync ([MEH-1085](https://linear.app/mehamakor/issue/MEH-1085))
`frontend/app/[locale]/events/EventsClient.jsx`:
- seed מ‑URL ב‑mount: `EventsClient.jsx:133-138` (`search.get("city")`, `search.get("category")` מול vocab).
- **ה‑writer היחיד** (הסנכרון): `EventsClient.jsx:159-169` — בונה `URLSearchParams` מ‑`{tab,city,category}`
  (`p.set("city",…)` `:162`, `p.set("category",…)` `:163`) וכותב עם **`window.history.replaceState`** `:169`
  (בכוונה **לא** `router.replace` — כדי לא לרסס מחדש את גבול ה‑`useSearchParams`).
- reload על שינוי tab/city/category: `EventsClient.jsx:171-174`.
- **דפוס:** query‑params (`?city=&category=`) + `replaceState`, לא path. עמוד אחד, סינון client‑side.

### 6.2 — `sitemap.js` emit
`frontend/app/sitemap.js`:
- `localizeEntry()` — `sitemap.js:26-35`: מרחיב path לוגי אחד לרשומה‑per‑locale (HE ללא prefix, EN `/en`),
  כל אחת עם `alternates.languages` מלא (hreflang; `HREFLANG_CODES` `:21`, `urlForLocale` `:12-15`).
- `sitemap()` `:37-145` פולט דרך `localizeEntry`: static (`staticDefs` `:40-56`), producer detail
  (fetch `${API_URL}/producers` `:69`, slug או `/producer/{id}` `:72-79`), **producer index**
  `/producers?page=1..N` @24/page `:81-92`, recipes `:98-114`, events `:121-136`.
- **אין** כרגע emit של עמודי category או category×geo. הוספתם = שינוי כאן (מחוץ ל‑scope הכרטיס).

### 6.3 — `/producers` reading `?category=` (post [MEH-1079](https://linear.app/mehamakor/issue/MEH-1079))
`frontend/components/ProducersClient.jsx`:
- קריאה מ‑URL ב‑mount: `ProducersClient.jsx:86-88` (`searchParams.get("category")`).
- שליחה ל‑API כ‑`params.category`: `ProducersClient.jsx:141` (בתוך `fetchFiltered`), נשלח `:148`.
  ה‑backend מקבל `category: int` (`producers.py:56`) → join `ProducerCategory` (`producer_listing.py:208-213`).
- כתיבה חזרה ל‑URL: `ProducersClient.jsx:121-133` (`syncUrl`, `params.set("category",…)` `:123`).
- ה‑server component `frontend/app/[locale]/producers/page.jsx` **לא** קורא `?category=` ל‑SSR — רק `?page=`
  (`page.jsx:46,97`). כלומר סינון קטגוריה הוא **client‑side בלבד** → העמוד המסונן לא נשלח מוגמר מהשרת.

### 6.4 — האם נפלט `rel=canonical`?  **כן — site‑wide**
דרך Next Metadata API (`alternates.canonical` → `<link rel="canonical">`). אין תג ידני; הכל דרך metadata.
- בונה מרכזי: `frontend/lib/i18n-seo.js:61-70` `buildAlternates()` — `canonical: urlForLocalePath(...)` `:67`
  (self‑referencing per‑locale + `languages` hreflang כולל `x-default`).
- fallback ב‑root layout: `frontend/app/[locale]/layout.js:112-116`.
- `/producers` index: `frontend/app/[locale]/producers/page.jsx:62` (+`?page=N` ל‑canonical `:65`).
- פרופיל `/[slug]`: `frontend/app/[locale]/[slug]/page.js:26-27`.
- `/events`, `/events/[id]`, `/map`, `/experiences`, `/group-buys`, `/join` — כולם `buildAlternates`.
- `/search` — **noindex** מכוון (`frontend/app/[locale]/search/page.js:28`).
- **משמעות ל‑programmatic SEO:** עמוד category×geo חדש **יצטרך canonical משלו** דרך `buildAlternates`,
  אחרת יירש fallback מ‑layout וימוזג. וריאנט query‑param (`?category=&city=`) נוטה להתמזג/לא להיאינדקס
  כעמוד נפרד — עוד סיבה ל‑path‑based (§7).

### 6.5 — בונוס: taxonomy SoT (18 קטגוריות)
- **backend SoT (seed):** `backend/seed_data.py:15-45` — `CATEGORIES`, 18 שורות `(שם עברי, אמוji)`,
  keyed ב‑autoincrement `id` (אין slug). מודל `Category`: `backend/app/models/models.py:390-399`.
- **runtime SoT:** `GET /categories` (`producers.py:336-338`) — מה שאישרתי חי (18 פריטים).
- אין **קבוע frontend יחיד** שמונה 18; ה‑frontend מביא `/categories` ב‑runtime. מראות חלקיים:
  `frontend/lib/home-categories.js:17-31` (10 כרטיסי בית), `frontend/lib/map-categories.js:29-40`
  (**stale** — תוויות ממוזגות שלא תואמות ל‑18), `frontend/lib/categories.js:4-12` (**stale**, 7 בלבד).
  → **דגל drift** לטיפול נפרד: `map-categories.js` + `categories.js` לא מיושרים לטקסונומיה החדשה.

### 6.6 — בונוס: שדות גאוגרפיה במודל
`backend/app/models/models.py` (`Producer` מ‑`:43`): `city` `:51` · `lat` `:53` · `lng` `:54` ·
`categories` (M2M) `:199-201` join `producer_categories` `:402-412` · `status` `:71-73`
(`pending|approved|rejected|inactive`).

---

## 7 · המלצה — עיר vs אזור · ערך סף · URL shape

### החלטה 0 (קודמת לכולן) — **לא בונים עכשיו**
המלאי (5 עסקים, 0 חיתוכים ≥3) לא מצדיק ולו עמוד אחד. ייצור עכשיו = doorway pages = פגיעה ב‑SEO של
כל הדומיין (Google devalues thin/templated pages), וגם soft‑404 ([MEH-918](https://linear.app/mehamakor/issue/MEH-918)).
**Gate:** לא מייצרים עמוד לחיתוך אלא אם הוא **עובר את הסף בזמן ה‑build/ISR**, ומתחת לסף → **404 אמיתי**.

### החלטה 1 — עיר או אזור? → **אזור**
- לפי עיר: המרחב מפוצל מדי (5 ערים = 5 דליים של 1). גם ב‑10× מלאי, ערים בודדות יישארו דלילות.
- לפי אזור: 7 דליים צפופים יותר → חיתוך יעבור סף **הרבה יותר מוקדם** ככל שהמלאי גדל. פחות עמודים,
  כל אחד עשיר יותר. (כרגע שניהם 0, אבל אזור הוא הבחירה הנכונה ל‑scale.)
- **הצעה:** עמודי אזור עכשיו; עמודי עיר רק אם/כשעיר ספציפית חוצה סף לבדה (ערים גדולות בלבד).

### החלטה 2 — ערך סף → **≥5** (עם ≥3 כ‑soft floor אופציונלי)
- ≥3 = מינימום כדי שעמוד לא ייראה ריק, אבל 3 פריטים עדיין thin.
- **≥5** נותן עמוד עם ממש רשימה + מגוון, מספיק "content asset" לעיני Google.
- ≥10 = אידיאלי אבל יחסום כמעט הכל בשלב הצמיחה הראשון — יקר מדי כשער.
- **הצעה:** סף ראשי **≥5**. אם רוצים כיסוי רחב יותר בהתחלה, ≥3 עם דרישת "≥2 עסקים פעילים
  (לא vacation)" כדי למנוע עמוד שכולו vacation.

### החלטה 3 — URL shape → **path‑based, לא query‑param**
- דפוס `/events` ו‑`/producers` הנוכחי = query‑params + `replaceState` (§6.1, §6.3) — מצוין ל‑**סינון
  אינטראקטיבי**, גרוע ל‑**עמוד אינדקסבילי** (Google ממזג/מתעלם מ‑`?category=&city=` variants; §6.4).
- **הצעה:** `/producers/{category-slug}/{region-slug}` (path segments), SSR/ISR עם:
  - `generateMetadata` + `buildAlternates` ל‑canonical עצמי per‑locale (§6.4) + hreflang HE/EN.
  - הוספה ל‑`sitemap.js` דרך `localizeEntry` (§6.2) — **רק** לחיתוכים שעוברים סף.
  - צריך **category slugs** — כרגע לקטגוריות אין slug (§6.5, keyed ב‑id/שם עברי). זו **תלות‑קדם**:
    יצירת slug map לקטגוריות לפני עמודי path.
  - תת‑סף → `notFound()` (404 אמיתי, [MEH-918](https://linear.app/mehamakor/issue/MEH-918)), לא עמוד ריק ב‑200.

### תלויות‑קדם לפני Phase 1 (בנייה)
1. **מלאי** יגיע ל‑מסה קריטית (לפחות כמה אזורים×קטגוריות ≥5). מומלץ להריץ את ספירת §1 מחדש כ‑gate.
2. **category slug map** (§6.5) — אין כרגע.
3. **מיפוי עיר→אזור** מאושר (§5).
4. תיקון drift של `map-categories.js`/`categories.js` (§6.5) — לא חוסם אבל רלוונטי לטקסונומיה.

---

## 8 · אימות (verification)

1. **Raw counts** — §1 (query + result, ניתן לשחזור מלא).
2. **`git diff --stat`** = קובץ אחד בלבד תחת `docs/` — `docs/synthesis/2026-07-programmatic-seo-inventory.md`.
3. `npm run build` — לא נדרש (docs‑only).
4. **אפס edits** ל‑`frontend/` או `backend/` — כל אזכור קוד הוא קריאה בלבד עם `file:line`.

**DoD exception:** docs‑only → אין "נבדק בנייד", אין CHANGELOG (per ticket).

**החלטות שממתינות ל‑approve של ספיר (proposal, לא נעול):** מיפוי עיר→אזור (§5) · עיר‑vs‑אזור=אזור ·
סף=≥5 · URL=path‑based. אלה הקלטים ל‑[MEH-1204](https://linear.app/mehamakor/issue/MEH-1204) EPIC.

---

*Refs [MEH-1204](https://linear.app/mehamakor/issue/MEH-1204) (parent EPIC) · Phase‑0 read‑only spike, ticket MEH-1206.*
