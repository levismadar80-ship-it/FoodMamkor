# שדות backend בלי מקבילה ב-Zod — סיווג הבסיס ששער MEH-1891 הקפיא (MEH-1897, Phase 0)

**תאריך:** 2026-09-01 לילה · **סקופ:** חצי הסיווג בלבד (הכרעת 14/08 — חצי ההצהרות מוקפא עד ה-codegen של MEH-1748) · **אפס עריכת סכימה, אפס עריכת baseline.** מדידה על `origin/staging` @ `c31180fe`.

> **המסקנה בשורה:** **אפס באגים חיים.** כל 16 השדות שמשטח ציבורי קורא מגיעים אליו דרך parse שאינו מסלק (`.loose()` / fetch גולמי / owner / admin). ארבעת המשטחים שכן מקבלים אובייקט מסולק — `ProducerCard`, `MapProducerCard`, ה-hooks של `/map`, ו-`HomeRecentlyViewed` — **אינם קוראים אף אחד מ-27 השדות**. הפער לטנטי, לא חי, ושתי דרכים הופכות אותו לחי בלי שאיש ייגע ב-baseline (§4).

---

## 1 · הבסיס — **42, לא 46**

| מדידה | מקור | list | detail | סה"כ |
| -- | -- | -- | -- | -- |
| שורות ב-`KNOWN_UNDECLARED` | `frontend/__tests__/backend-contract-parity.test.js:112-128` (list), `:135-169` (detail) | **15** | **27** | **42** |
| שדות מוגשים (snapshot) | `backend/app/schemas/producer_contract_snapshot.json` | 70 | 87 | — |
| שדות מוצהרים ב-Zod | `frontend/lib/schemas.js:39` (`ProducerListSchema`), `:348` (`ProducerDetailSchema`) | 55 | 60 | — |
| **הפער החי** (מוגש − מוצהר), חושב **בלי** ה-baseline | הפרש קבוצות על שני הקבצים | **15** | **27** | **42** |
| הכרטיס | MEH-1897 (14/08) | 17 | 29 | 46 |

- הפער החי וה-baseline הם **אותן קבוצות** (הפרש קבוצות, לא ספירה) — השער עקבי עם עצמו.
- **27 שדות ייחודיים:** כל 15 של ה-list חוזרים ב-detail (`ProducerDetailOut(ProducerListOut)`, `schemas.py:2429`) + 12 של detail בלבד.
- **למה 46 → 42:** `8476c134` («show the producer-level delivery fee») הצהיר `delivery_fee` + `free_delivery_above` ומחק אותם משני ה-baselines. הקלון אינו רדוד (`--is-shallow-repository` → `false`), אז ה-provenance אמין.
- **הערות as-of מיושנות** (לא באגים; ה-PR המממש ירענן): `lib/schemas.js:16-18` («65/81»), `page.js:73` ו-`useProducerData.js:12` («51 of 81 … 30 fields» — היום 60/87, 27), וההפניות ב-`:130-133` של הטסט (`ProducerHeader.jsx:241` → `:246`, `ProducerSections.jsx:112` → `:196`, `ContactCard.jsx:125/:252` → `:118/:249`).

---

## 2 · אתרי ה-parse — מי בכלל יכול להיפגע מסילוק

שדה ב-baseline הוא באג **חי** רק אם קומפוננטה קוראת אותו מאובייקט שיצא מ-`z.object` **קפדני**.

| אתר parse | סכימה | מסלק? | מזין |
| -- | -- | -- | -- |
| `lib/use-home-page.js:409, :443, :570` | `ProducersResponseSchema` | **כן** | גריד הבית → `ProducerCard` |
| `lib/use-home-page.js:317` | `ProducerSchema` על `GET /producers/{id}` | **כן — ושורה שנכשלת נזרקת** (`:318`) | `recentlyViewed` → `HomeStaticBlocks.jsx:42-69` (קורא `slug,id,images,name,city` בלבד) |
| `app/[locale]/map/state/useProducersFeed.js:49` | `ProducersResponseSchema` | **כן, הכל-או-כלום** (`:51`) | `/map` → `MapProducerCard`, markers, `useMapFilters` |
| `producer/[id]/hooks/useProducerData.js:27,62` | `ProducerDetailSchema.loose()` | **לא** (passthrough; גולמי בכישלון `:71`) | עמוד העסק כולו |
| `producer/[id]/page.js:65-78` | `safeParse` **כ-probe בלבד**, מחזיר את ה-raw | לא | JSON-LD + metadata |
| `app/[locale]/[slug]/page.js:28-48` | אין — `res.json()` | לא | `initialProducer` + JSON-LD |
| `favorites/FavoritesClient.jsx:155` | `producer: ProducerSchema.loose()` (`api-schemas.js:92`) | לא | כרטיסי מועדפים |
| `[slug]/recipes/[recipe_id]/page.jsx:52-73` | אין — `getJson` גולמי | לא | עמוד מתכון (`producer.products`) |
| דשבורד בעלת עסק (`/producers/me`) | אין | לא | `dashboard/**` |
| admin (`/admin/producers*`) | אין | לא | `AdminProducersTable`, `ProducerForm` |

סריקת 27 השמות על `ProducerCard.jsx`, `MapProducerCard.jsx`, `app/[locale]/map/**`, `HomeStaticBlocks.jsx` — **אפס קריאות**. (ה-hits היחידים: משתנה מקומי `status` מ-`deriveAvailability` ב-`ProducerCard.jsx:64/:253` — קורא `availability_state`/`availability_status`/`is_available_today`, כולם מוצהרים; ו-`chipState.pickup_points` ב-`FilterChipsBar.jsx:67` — state של פילטר, לא שדה של עסק.)

---

## 3 · שלושת הדליים — 27 שדות

טיפוסי Pydantic מ-`backend/app/schemas/schemas.py:2166-2504`. «כשהערך חסר» = מה הקורא עושה אם המפתח היה מסולק. סגנון Zod בריפו: `.nullable().optional()` ל-`X | None`; `.optional()` לברירת מחדל לא-null; `.optional().default([])` ל-`list = []`; תאריכים `z.string()`.

מקרא: **CONSUMED-pub** = נקרא במשטח צרכני ציבורי · **own/adm** = נקרא רק בדשבורד/admin (ולכן INTERNAL לחוזה הציבורי) · **RENDERABLE** · **INTERNAL**.

| # | שדה | חוזה | Pydantic | דלי | קורא (file:line) | דרך Zod? | כשהערך חסר | Zod מוצע |
| -- | -- | -- | -- | -- | -- | -- | -- | -- |
| 1 | `ambassador` | list+detail | `bool = False` (`:2298`) | own/adm → INTERNAL | `AdminProducersTable.jsx:313,317` | לא | falsy → פעולת «set ambassador» מוצגת | `z.boolean().optional()` |
| 2 | `delivery_cities` | list+detail | `list[str] = []` (`:2310`) | **INTERNAL** — עמודה מתה (`schemas.py:2322-2324`: «currently unused … separate cleanup ticket») | אין על אובייקט API; רק state של טופס | n/a | n/a | `z.array(z.string()).optional().default([])` |
| 3 | `delivery_excluded_cities` | list+detail | `list[str] = []` (`:2313`) | **CONSUMED-pub** | `ProducerSections.jsx:607`; `lib/quickAnswers.js:45` ← `WhatsAppQuestionChips.jsx:8` ← `ContactCard.jsx:249` | **לא** (loose) | `\|\| []` → רשימת «למעט…» ריקה בשקט | `z.array(z.string()).optional().default([])` |
| 4 | `delivery_nationwide` | list+detail | `bool = False` (`:2309`) | **CONSUMED-pub** | `ProducerSections.jsx:606`; `lib/quickAnswers.js:44`; `lib/seo.js:243` (JSON-LD `areaServed`, מ-SSR גולמי) | **לא** | falsy → שורת «ארצי» ו-`areaServed: "Israel"` נעלמות; עסק ארצי נקרא כעירוני | `z.boolean().optional()` |
| 5 | `description` | list+detail | `str \| None` (`:2169`) | **CONSUMED-pub** | `ProducerHeader.jsx:330`; `ProducerSections.jsx:268,277`; `ProducerDetail.jsx:179` | **לא** (loose). הכרטיס **לא** קורא — `ProducerCard.jsx:246` משתמש ב-`short_description` | falsy → מקטע «אודות» + הטאב נעלמים | `z.string().nullable().optional()` |
| 6 | `gluten_free_facility` | list+detail | `str = "unknown"` (`:2192`, NOT NULL) | **CONSUMED-pub** | `ProducerHeader.jsx:279,287` | **לא** | `=== "shared"/"dedicated"` בלבד → כלום (כמו unknown) | `z.string().optional()` (הערה א') |
| 7 | `kashrut_certs` | list+detail | `list[KashrutCertRef] = []` (`:2307`, `:2153-2163`) | **CONSUMED-pub** | `ProducerHeader.jsx:265` → `KashrutBadgeStrip.jsx:169,196` | **לא** | undefined → `[]` → לינקי תעודה נעלמים | `z.array(z.object({ badge_code: z.string() })).optional().default([])` |
| 8 | `lactose_free_facility` | list+detail | `str = "unknown"` (`:2193`) | **RENDERABLE** (שכבת MEH-1508; `labels.md` שומר `scope: facility`) | **אף אחד** — גם `ProducerHeader` מרנדר רק את אחות הגלוטן | n/a | n/a | `z.string().optional()` |
| 9 | `organic_certified` | list+detail | `bool = False` (`:2188`) | own/adm → INTERNAL (**MEH-1259**: הוסר מכל משטח צרכני מטעם חוקי — `lib/badges.js:13,142,329`) | `AdminProducersTable.jsx:191`; `ProducerForm.jsx:453,772` | לא | falsy → אייקון עלה נעדר ב-admin | `z.boolean().optional()` |
| 10 | `phone_verified` | list+detail | `bool = False` (`:2297`) | own → INTERNAL (הנגזרת הציבורית `trust_tier` מוצהרת) | `ProfileCompletenessCard.jsx:230`; `lib/submission-gate.js:120`; `dashboard/page.js:486` | לא | falsy → פריט completeness «לא בוצע» | `z.boolean().optional()` |
| 11 | `pickup_points` | list+detail | `bool = False` (`:2215`; נדרס ב-serialization ע"י `offers_pickup`, MEH-2060 `:2211-2214`) | **CONSUMED-pub** | `ProducerSections.jsx:603,609`; `ProducerDetail.jsx:197` | **לא** | falsy → מקטע/טאב משלוח נעלמים לעסק pickup-only | `z.boolean().optional()` (הערה ב') |
| 12 | `status` | list+detail | `str = "pending"` (`:2174`) | **INTERNAL** (מסלולים ציבוריים מגישים approved בלבד) | `admin/page.js:205` בלבד | n/a | n/a | `z.string().optional()` |
| 13 | `vacation_until` | list+detail | `date \| None` (`:2239`; מאופס כשעבר `:2400-2416`) | **CONSUMED-pub** | `producer/[id]/lib/producer-format.js:43-45` ← `ProducerHeader.jsx:112` | **לא** | falsy → מחרוזת «בחופשה» בלי תאריך | `z.string().nullable().optional()` |
| 14 | `vegan_scope` | list+detail | `str = "unknown"` (`:2190`) | **RENDERABLE** | owner בלבד: `DietaryScopeCard.jsx:55,81` | לא | `?? "unknown"` | `z.string().optional()` |
| 15 | `vegetarian_scope` | list+detail | `str = "unknown"` (`:2191`) | **RENDERABLE** | owner בלבד: `DietaryScopeCard.jsx:56,82` | לא | `?? "unknown"` | `z.string().optional()` |
| 16 | `contact_name` | detail | `str \| None` (`:2434`) | **CONSUMED-pub** | `OwnerCard.jsx:31-32` | **לא** | `if (!name) return null` → **כל ה-OwnerCard נעלם** | `z.string().nullable().optional()` |
| 17 | `created_at` | detail | `datetime \| None` (`:2451`) | INTERNAL (audit; הנגזרת `days_since_created` מוצהרת) | `AdminProducersTable.jsx:99` | לא | fallback ל-`submitted_for_review_at` | `z.string().nullable().optional()` |
| 18 | `custom_questions` | detail | `list[str] \| None` (`:2477`) | **CONSUMED-pub** | `lib/categoryQuestions.js:88` ← `WhatsAppQuestionChips.jsx:7` | **לא** | `?.length > 0` false → ברירות מחדל לפי קטגוריה במקום הצ'יפים של הבעלים | `z.array(z.string()).nullable().optional()` |
| 19 | `established_year` | detail | `int \| None` (`:2493`) | **CONSUMED-pub** | `ProducerHeader.jsx:246-249` | **לא** | falsy → שורת «מאז {שנה}» נעלמת | `z.number().int().nullable().optional()` |
| 20 | `google_place_id` | detail | `str \| None` (`:2486`) | **CONSUMED-pub** | `ProducerSections.jsx:655` (מגדר `GoogleRatingLine`) | **לא** | falsy → שורת הדירוג לא נטענת | `z.string().nullable().optional()` |
| 21 | `owner_bio` | detail | `str \| None` (`:2462`) | **CONSUMED-pub** | `OwnerCard.jsx:35` | **לא** | `\|\| null` → כרטיס קומפקטי | `z.string().nullable().optional()` |
| 22 | `owner_photo_url` | detail | `str \| None` (`:2463`) | **CONSUMED-pub** | `OwnerCard.jsx:36` | **לא** | `\|\| null` → אווטאר אות | `z.string().nullable().optional()` |
| 23 | `products` | detail | `list[ProductOut] = []` (`:2444`; `ProductOut` `:1516-1532`) | **CONSUMED-pub** | `ProducerSections.jsx:196-207,286`; `ProducerDetail.jsx:187`; `recipes/[recipe_id]/page.jsx:152` (גולמי) | **לא** | `\|\| []` → מקטע + טאב מוצרים נעלמים | הערה ג' |
| 24 | `report_count` | detail | `int = 0` (`:2446`) | **INTERNAL** (מונה moderation; ה-admin מקבל אותו מ-`/admin/reports`) | `admin/reports/page.js:83,102` | לא | n/a | `z.number().int().optional()` |
| 25 | `story_card_url` | detail | `str \| None` (`:2458`) | own/adm → INTERNAL | `StoryCardCanvas.jsx:232`; `use-admin-producers.js:243` | לא | `\|\| null` | `z.string().nullable().optional()` |
| 26 | `updated_at` | detail | `datetime \| None` (`:2456`) | **CONSUMED-pub** | `ProducerSections.jsx:791-794` («עודכן לאחרונה») | **לא** | falsy → הערת השוליים נעלמת | `z.string().nullable().optional()` |
| 27 | `whatsapp_group` | detail | `str \| None` (`:2438`) | **CONSUMED-pub** | `ContactCard.jsx:118` | **לא** | `?.trim()` falsy → שורת הערוץ לא מרונדרת | `z.string().nullable().optional()` |

**סיכום (נגזר):** CONSUMED-pub **16** · own/adm-only (INTERNAL לחוזה הציבורי) **5** (`ambassador`, `organic_certified`, `phone_verified`, `story_card_url`, `created_at`) · RENDERABLE **3** · INTERNAL בלי קורא **3** (`delivery_cities`, `status`, `report_count`). **כל התנהגויות «כשהערך חסר» הן הסתרה שקטה או fallback — אפס crash.**

**הערה א' — `z.string()` ולא `z.enum` לארבעת שדות ה-scope/facility.** Pydantic מטפל אותם `str`, לא `Literal`; הריפו משתמש ב-`z.enum` רק מול `Literal` (`verification_tier`, `lib/schemas.js:52,61`). מאחר ש-feed המפה הוא הכל-או-כלום (`useProducersFeed.js:51` → רשימה ריקה + toast) ו-`recentlyViewed` זורק שורה כושלת, `z.enum` כאן הופך כל ערך רביעי עתידי ל**השבתת feed שלם**. אם רוצים enum — קודם `Literal` ב-backend, ואז שיקוף.

**הערה ב' — `pickup_points` הוא alias legacy.** מאז MEH-2060 הוא נדרס ב-`offers_pickup` (מוצהר). שלושת הקוראים עדיין קוראים את ה-alias. להצהיר = המהלך הזול לסבב ראשון; להעביר את שלוש הקריאות ל-`offers_pickup` ולהסיר מהחוזה = הסגירה הנכונה.

**הערה ג' — `products`: הצורה הפנימית חייבת להישאר סלחנית.**
```js
products: z.array(z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  description: z.string().nullable().optional(),
  price_range: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  price_min: z.union([z.number(), z.string()]).nullable().optional(),  // Pydantic Decimal — פורמט wire לא אומת
  price_max: z.union([z.number(), z.string()]).nullable().optional(),
  is_gluten_free: z.boolean().optional(), is_vegan: z.boolean().optional(),
  is_vegetarian: z.boolean().optional(), is_lactose_free: z.boolean().optional(),
  is_no_added_sugar: z.boolean().optional(), is_low_carb: z.boolean().optional(),
})).optional().default([]),
```
`price_min/max` הם `Decimal | None` (`schemas.py:1521-1522`); Pydantic v2 מסריאל `Decimal` כ**מחרוזת** אלא אם הוגדר אחרת — **לא אימתתי את ה-wire**, ולכן ה-union מכוון. אובייקט פנימי קפדני מדי **לא** ישבור את עמוד העסק (loose נופל ל-raw) אבל **כן** יזרוק את העסק מ«נצפו לאחרונה» בבית ויירה Sentry warning בכל צפייה. אין `ProductSchema` קיים לשימוש חוזר (grep ריק); `components/public/ProductSheet.jsx:79` הוא הצרכן להצלבה.

---

## 4 · באגים חיים — **ריק**

כל קורא ב-§3 מקבל את האובייקט שלו מ-`.loose()` של עמוד העסק, מ-fetch גולמי, מ-`/producers/me`, או מ-admin. ההערה של הטסט עצמו (`:130-134`) אומרת זאת על שישה מהם («survive only because that route does not run a stripping parse»); האודיט מרחיב ל-16.

**לטנטי, לא חי — שתי הדרכים שזה הופך לחי בלי שאיש ייגע ב-baseline:**
1. מישהי מוסיפה `safeParse` + `parsed.data` למסלול `[slug]` או למסלול המתכון (שניהם גולמיים היום). `lib/seo.js:243` (`areaServed`) ו-`recipes/[recipe_id]/page.jsx:152` (`products`) יסולקו בשקט. ההערה ב-`page.js:74-78` כבר אוסרת בדיוק את זה למסלול `/producer/[id]`.
2. `ProducerCard`/`MapProducerCard` מתחיל לרנדר אחד מ: `vacation_until` (שורת «חוזרים ב-»), `description`, `delivery_nationwide`/`delivery_excluded_cities` (pill «ארצי»), `kashrut_certs`. זה **בדיוק** המנגנון של MEH-826/901/902/1704/1719/1823/1880, ושער ה-parity **לא יתפוס** — השדה ב-baseline. `__tests__/ProducerSchemaBadgeParity.test.js:371` הוא השומר שכן — רק למה שהוא מכסה.

**ממצא צד, לא באג frontend:** `schemas.py:2225` — ההערה על `delivers` אומרת ש-`delivery_nationwide` «is not serialized»; הוא **כן** מוגש (`:2309`) ומופיע ב-snapshot. הערה מיושנת.

---

## 5 · המלצת batching — **הצעה, STOP לפני כל עריכת סכימה**

**עיקרון:** הצהרה לא משנה כלום לאתרים הקפדניים היום (אין שם קורא) ורק **מאמתת** באתרי ה-loose/probe — לכן הסיכון בסבב ראשון הוא כולו «טיפוס Zod שגוי → סופת Sentry + שורת recently-viewed נזרקת», לא רגרסיה גלויה. הטיפוסים חייבים להיות סלחניים (הערות א'/ג').

### סבב ראשון — 17 שדות (כל ה-CONSUMED-pub + האחות החינמית)
`description` · `delivery_nationwide` · `delivery_excluded_cities` · `pickup_points` · `vacation_until` · `gluten_free_facility` · `lactose_free_facility` · `kashrut_certs` · `contact_name` · `custom_questions` · `established_year` · `google_place_id` · `owner_bio` · `owner_photo_url` · `products` · `updated_at` · `whatsapp_group`.

לכל אחד יש renderer ציבורי היום והוא `parsed.data` אחד מסילוק שקט (§4). `lactose_free_facility` נוסע כי הוא האחות המדויקת של `gluten_free_facility` — להצהיר אחת ולהשאיר את השנייה ב-baseline הוא בדיוק חצי-התיקון ש-testing.md מזהיר ממנו («when a reviewer names two sites, grep for the third»). שדות list על `ProducerListSchema`, 11 של detail על ה-`.extend()`.

**אימות שהסשן המממש מריץ בעצמו:** (a) `KNOWN_UNDECLARED` מצטמצם ל-`ProducerListOut: [7]`, `ProducerDetailOut: [10]` ושישה טסטי ה-parity ירוקים; (b) «the baseline carries no stale entries» (`:216`) **מאדים לפני** עריכת ה-baseline — זו ההרצה הכושלת המודגמת שהכלל דורש; (c) fixture עם `products: [{price_min: "12.50"}]` ואחד עם `12.5` — שניהם חייבים לעבור parse.

### מאוחר יותר — 7 (סבב שני, או סגירה מצד ה-backend)
- `vegan_scope`, `vegetarian_scope` — RENDERABLE בלי renderer; להצהיר כשלשכבת MEH-1508 יהיה משטח, או לצרף לסבב ראשון (אפס סיכון, אותו טיפוס).
- `phone_verified`, `ambassador`, `created_at`, `story_card_url` — נקראים רק במשטחים שלא נוגעים ב-`lib/schemas.js`. החלופה: הסרה מהחוזה **הציבורי** והצהרה מחדש על `ProducerAdminOut`/`ProducerOwnerOut` (תקדים `kosher`, `schemas.py:2219-2224`).
- `delivery_cities` — עמודה מתה לפי ה-backend עצמו; להצהיר = לבצר אותה. עדיף כרטיס הניקוי.

### לעולם לא להצהיר — 3, סגירה בהסרה מהחוזה הציבורי
- `status` — מצב moderation; הערך קבוע על כל payload ציבורי (approved בלבד). הצהרה מזמינה `status === "approved"` בצד לקוח — מיותר היום, שגוי ביום ששורה לא-מאושרת תדלוף.
- `report_count` — מונה moderation על endpoint ציבורי (`GET /producers/{id}`, `routers/producers.py:377`). **information-disclosure smell** קטן; התיקון הנכון הוא server-side, וזה כרטיס משלו — לא הצהרת Zod שתקל לרנדר אותו.
- `organic_certified` — MEH-1259 הסיר כל רינדור צרכני מטעם חוקי. הצהרה על הסכימה הצרכנית פותחת מחדש את הדלת שהתקדים סגר.

**סייג על שלושת ה-«לעולם»:** ההסרה היא Expand-Contract על `ProducerListOut` שמגיעה גם ל-Admin/Owner בירושה, ולכן דורשת הצהרה מחדש שם — כרטיס backend עם tier משלו, לא הסקופ של MEH-1897. עד אז הם נשארים ב-`KNOWN_UNDECLARED`, וזה בדיוק מה שה-baseline בשבילו.

**התוצאה אם סבב ראשון + ההסרות ינחתו:** baseline → `ProducerListOut: ["ambassador","delivery_cities","phone_verified","vegan_scope","vegetarian_scope"]` (5) ו-`ProducerDetailOut: [אותם 5 + "created_at","story_card_url"]` (7) — כולם owner/admin-only או רדומים, אף אחד עם קורא ציבורי.

---

_Phase 0 בלבד. אפס שינוי ב-`lib/schemas.js`, ב-snapshot, או ב-`.github/**`. שני הממצאים הצדדיים (`report_count` על endpoint ציבורי; ההערה המיושנת ב-`schemas.py:2225`) מדווחים כאן ולא נפתחו ככרטיסים — הכרעת ספיר._
