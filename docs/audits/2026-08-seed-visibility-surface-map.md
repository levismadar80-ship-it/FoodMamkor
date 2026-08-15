# מפת משטחים — מה קורה לכל משטח ציבורי כשמסירים אישור מ-seed fixture

> **נמדד 2026-08-15** מול `https://mehamakor.co.il` — **GET בלבד, אפס כתיבות.**
> כרטיס: MEH-2083 (הכרעת ספיר: אפשרות א' — להסיר אישור). יורש: MEH-1992 / PR #2799.
> **זה דוח. הביצוע הוא של ספיר, דרך פאנל האדמין, שורה-שורה.**

---

## התשובה בשתי שורות

**Q1 — הפער 4 מול 5 מוסבר ואומת חי.** `golan-cheese` מאושר אך `on_vacation`;
הקטלוג מסתיר אותו כברירת מחדל, המונה לא. `/producers/count` = **5**, `/producers` = **4**.

**Q2 — ⚠️ משטח אחד אינו קורא סטטוס אישור בכלל: `sitemap.xml`.** הוא artifact סטטי
מזמן ה-build, נמדד **בן 4.14 ימים**, ומגיש כרגע את ארבעת ה-slugs. **הסרת אישור לא תוריד
אותם ממנו** — רק deploy חדש יעשה זאת. פירוט ב-§3.

**ממצא נוסף שלא נשאל אך רלוונטי להכרעה: `/golan-cheese` מחזיר `HTTP 200` כרגע** — עסק
מזויף עם טלפון פיקטיבי, נגיש בקישור ישיר, בזמן שהוא נעדר מהקטלוג. §5.

---

## 1 · סימון מקור לכל טענה

| # | טענה | מקור | איך אומת |
|---|---|---|---|
| S1 | 5 שורות מאושרות, 4 בקטלוג | **production** | `curl` ל-`/api/producers` + `/api/producers/count`, 15/08 |
| S2 | חמשתן `status: "approved"` | **production** | השדה `status` חשוף ב-`ProducerListOut`; נקרא ישירות |
| S3 | הפער נובע מ-`on_vacation` | **production** + קוד `main` | `golan-cheese` מחזיר `availability_state: "on_vacation"` |
| S4 | כל משטח backend מסנן `status == "approved"` | קוד `origin/main` | קריאה, file:line ב-§2 |
| S5 | `sitemap.xml` בן 4.14 ימים, cache HIT | **production** | כותרת `age:` בשתי בקשות עוקבות |
| S6 | עמוד עסק אינו edge-cached | **production** | `cache-control: private, no-cache, no-store` · `x-vercel-cache: MISS` |
| S7 | `toggle-status` הפיך, ללא side-effects | קוד `origin/main` | `admin.py:306-330` (main) — §6 |
| S8 | חמשתן fixtures | **MEH-1992** | לא נגזר מחדש כאן — הכרטיס מורה לא לגזור מחדש |

> **הקוד שנקרא הוא `origin/main`, לא `staging`.** פרודקשן מריץ את `main`
> (`857ea5bc`), ו-Release #2 (MEH-1909) עדיין לא מוזג. כל ציטוט `file:line` בדוח הזה
> נלקח מ-`git show origin/main:<path>` ולא מעץ העבודה — ההפרש בין הענפים הוא בדיוק מה
> שמסביר את Q1, אז קריאה מ-`staging` הייתה נותנת תשובה נכונה על קוד שאינו רץ.

---

## 2 · חמש השורות — נמדד מול production, 15/08/2026

| # | slug | id | טלפון | status | `availability_state` | בקטלוג |
|---|---|---|---|---|---|---|
| 1 | `teva-pure` | `3be14f53-6145-42dc-9851-ae1ec43d44bf` | 053-3334455 | approved | accepting_orders | ✓ |
| 2 | `tases-ferments` | `fc0f4a43-08ee-4f21-9fa8-ffd745fc9c08` | 050-7778899 | approved | accepting_orders | ✓ |
| 3 | `dana-sourdough` | `bef84145-ef16-48e2-bc8a-61ac6f457ca2` | 054-5551234 | approved | accepting_orders | ✓ |
| 4 | `galil-farm` | `4b814f0a-5b92-4bb8-8bf6-72a5cdeff9f1` | 050-1234567 | approved | available_today | ✓ |
| 5 | `golan-cheese` | `b8be6ffb-d333-471f-97d8-3bb3cb0a38f0` | 052-9876543 | approved | **on_vacation** | ❌ |

**`created_at` אינו זמין לי.** ה-API הציבורי אינו חושף אותו (רשימת השדות של
`ProducerListOut` נבדקה — `created_at` נעדר; `days_since_created` קיים אך הוא נגזרת).
הכרטיס ביקש אותו; הוא נקרא רק מול ה-DB, שהוא credential של ספיר. **אני לא יודעת.**

**הטלפונים שונים זה מזה** — הכרטיס תיאר "טלפון `050-1234567` חוזר על עצמם". זה נכון
לגבי `galil-farm` בלבד; ארבעת האחרים נושאים מספרים פיקטיביים שונים. לא משנה את ההכרעה,
אבל התיאור בכרטיס מדויק פחות ממה שהוא נשמע.

---

## 3 · Q1 — הפער 4 מול 5, מוסבר

**המנגנון, משני קבצים ב-`main`:**

| מה | file:line (`origin/main`) | מסנן |
|---|---|---|
| `GET /producers/count` | `backend/app/routers/producers.py:155` | `status == "approved"` **בלבד** |
| `GET /producers` | `backend/app/services/producer_listing.py:292-294` | `status == "approved"` **+** `availability_state != "on_vacation"` |

```python
# main — producers.py:155  (המונה)
db.query(func.count(Producer.id)).filter(Producer.status == "approved").scalar()

# main — producer_listing.py:292-294  (הרשימה)
if filters.get("availability_state") is None:
    q       = q.filter(Producer.availability_state != "on_vacation")
    count_q = count_q.filter(Producer.availability_state != "on_vacation")
```

`golan-cheese` הוא `approved` + `on_vacation` → **נספר, לא מוצג**. 5 מול 4.

**אומת חי:** `/api/producers/count` → `{"count":5}` · `/api/producers` → 4 שורות ·
`/api/producers/by-slug/golan-cheese` → `200`, `availability_state: "on_vacation"`.

**זו אי-עקביות שכבר תוקנה ב-`staging` ולא בפרודקשן.** MEH-1986 הוסיף
`catalog_default_availability_condition()` גם ל-`count`, ל-`cities` ול-`random`
(עץ העבודה, `producers.py:263,291,323`). כלומר **אחרי מיזוג Release #2 המונה יחזיר 4**,
והפער ייעלם מעצמו. **זה לא משנה דבר לגבי ההכרעה** — חמש השורות מאושרות בשני המקרים.

---

## 4 · Q2 — מפת המשטחים

**המסקנה המבנית:** כל מסנן ב-backend הוא **whitelist על המחרוזת `"approved"`**, אף פעם
לא blacklist (`!= "rejected"`). סרקתי את כל השימושים ב-`Producer.status` ב-`origin/main`
ולא מצאתי חריג. `toggle-status` כותב `"inactive"` — ולכן **כל משטח backend תופס אותו
בלי שינוי קוד**.

| # | משטח | הקובץ שמסנן (file:line, `origin/main`) | התנאי | יורד בהסרת אישור? |
|---|---|---|---|---|
| 1 | קטלוג `/producers` | `services/producer_listing.py:131,136` | `status == "approved"` | ✅ כן |
| 2 | מפה `/map` | אין endpoint נפרד → `api.get("/producers")` (`map/state/useProducersFeed.js:45`) | כנ"ל | ✅ כן |
| 3 | חיפוש `/search` | `routers/search.py:78` (עסקים) · `:109` (מוצרים) · `:135` (ערים) | `status == "approved"` | ✅ כן |
| 4 | עמודי קטגוריה | אין query נפרד — `/producers?category=` על אותו endpoint | כנ"ל | ✅ כן |
| 5 | גריד דף הבית | `GET /producers?limit=8` — אותו endpoint | כנ"ל | ✅ כן |
| 6 | **`sitemap.xml`** | `frontend/app/sitemap.js:71` — `fetch(${API_URL}/producers)` | **הנתון מסונן; ה-artifact סטטי** | ⚠️ **לא — §3 להלן** |
| 7 | OG / JSON-LD (`lib/seo.js`) | `seo.js` הוא **טהור** — אפס `fetch`. הנתון מגיע מ-`[slug]/page.js:15` (`by-slug`) | `status == "approved"` במקור | ✅ כן |
| 8 | `/producers/random` | `routers/producers.py:200` | `status == "approved"` | ✅ כן |
| 9 | עמוד עסק לפי slug | `routers/producers.py:223` | `slug == … AND status == "approved"` | ✅ כן |
| 9ב | עמוד עסק לפי id | `routers/producers.py:269` (בדיקת MEH-254) | `status != "approved"` → 404 לכל מי שאינו admin/בעלים | ✅ כן |
| 10 | RSS / feed | **לא קיים.** grep על `rss` / `feed.xml` / `application/rss` — אפס | — | לא רלוונטי |
| נלווה | מתכונים | `routers/producer_recipes.py:340` | `status == "approved"` | ✅ כן |
| נלווה | אירועים | `routers/events.py:87,120,166` | `status == "approved"` | ✅ כן |
| נלווה | רכישה קבוצתית | `routers/group_buys.py:188` | `producer.status != "approved"` → חסום | ✅ כן |

### ⚠️ הממצא — `sitemap.xml` אינו קורא סטטוס אישור בזמן אמת

**הנתון מסונן נכון; ה-artifact לא מתחדש.** `sitemap.js` קורא ל-`GET /producers`
(שמסנן `approved`), אבל התוצאה נצרבת ב-build ומוגשת מה-CDN.

**המדידה (production, 15/08):**

```
HTTP/2 200
age: 357988          →  99.4 שעות  =  4.14 ימים
cache-control: public, max-age=0, must-revalidate
x-vercel-cache: HIT
```

**בקרה — בקשה שנייה 26 שניות אחרי הראשונה:** `age: 358014`, שוב `x-vercel-cache: HIT`.
ה-`age` **התקדם בדיוק בזמן שחלף ולא אופס** — כלומר לא התרחש revalidation. זו הבקרה
שמבדילה בין "cache שמתחדש" לבין "artifact נעוץ ל-build", ובלעדיה `age` גבוה לבדו לא
היה מוכיח דבר.

**מה יש בו כרגע:** 32 רשומות `<url>`, ובתוכן **4 מתוך 5** ה-slugs —
`teva-pure` · `dana-sourdough` · `tases-ferments` · `galil-farm`. `golan-cheese` **נעדר**,
ועקביות זו מאששת שהקובץ אכן נבנה מהקטלוג המסונן.

**בקוד:** `frontend/app/sitemap.js` אינו מייצא `revalidate` ואינו מייצא `dynamic`
(נבדק בשני הענפים — אפס התאמות). `export const revalidate = 3600` שכן קיים ב-
`app/[locale]/layout.js:53` **אינו חל** — `sitemap.js` יושב בשורש `app/`, מחוץ למקטע
`[locale]`.

**המשמעות המעשית לספיר:**

> אחרי הסרת האישור, `mehamakor.co.il/sitemap.xml` ימשיך להצהיר בפני Google על
> **ארבעה עמודי עסק שיחזירו 404**. הקטלוג ייראה נקי; ה-sitemap לא.

זהו בדיוק תרחיש ה"הסרה-חלקית" שהכרטיס הזהיר ממנו — נקי במשטח שבודקים, מלוכלך במשטח
שלא. **התיקון אינו קוד: הוא deploy.** כל build של Vercel מייצר sitemap טרי מהקטלוג
שיהיה נכון לאותו רגע.

**הסדר שנובע מכך, והוא ההמלצה התפעולית היחידה בדוח:**

1. למזג את Release #2 (MEH-1909) → deploy
2. **ואז** להסיר אישור מחמש השורות
3. **ואז** deploy נוסף (או כל push ל-`main`) כדי לרענן את ה-sitemap
4. לאמת: `curl -s https://mehamakor.co.il/sitemap.xml | grep -c "galil-farm"` → צפוי `0`

אם שלב 3 מדולג, ה-sitemap יישאר שגוי עד ה-deploy הבא — ללא הודעה, ללא שגיאה.

**מה שהממצא הזה איננו:** הוא **לא** אומר שהעמודים עצמם יישארו חיים. הם יחזירו 404
(שורה 9 בטבלה). הנזק הוא הצהרה ל-crawler, לא עסק מזויף שנשאר נגיש.

### מה **כן** מתעדכן מיד — נמדד, לא הונח

עמוד עסק **אינו** נשמר ב-edge cache. נמדד על `/galil-farm`:

```
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
x-vercel-cache: MISS
age: 0
```

לכן ההשהיה היחידה בעמוד עסק היא ה-data cache של `serverFetch`
(`[slug]/page.js:15-16` — `next: { revalidate: 60 }`), כלומר **עד 60 שניות**. זו מדידה
שמחליפה השערה: קריאה סטטית של `export const revalidate = 3600` ב-layout הייתה מובילה
למסקנה של שעה, וההתנהגות בפועל שונה.

---

## 5 · הקישור הישיר — התשובה, ותצפית שלא נשאלה

**אחרי הסרת אישור: לא.** `by-slug` מסנן `status == "approved"`
(`producers.py:223`), אין בו עוקף admin/בעלים כלל, ולכן `/teva-pure` ואחיו יחזירו 404.
המסלול לפי id (`producers.py:269`) מחזיר 404 לכל מי שאינו admin או הבעלים —
ו-`serverFetch` אינו מעביר cookie של משתמש, כך שה-SSR הציבורי מקבל תמיד את ענף ה-404.

**חריג יחיד, לשקיפות:** בעלים מחוברת של אותה שורה, או admin, תראה `200` במסלול ה-id
מהדפדפן שלה. זה תכנון מכוון (MEH-254) ולא דליפה ציבורית. ל-fixtures אין ככל הנראה
חשבונות בעלים, אך **לא אימתתי זאת** — זה נקרא רק מול ה-DB.

### ⚠️ תצפית: `/golan-cheese` מחזיר `200` **כרגע**, לפני כל פעולה

```
GET https://mehamakor.co.il/golan-cheese                  →  HTTP 200
GET https://mehamakor.co.il/api/producers/by-slug/golan-cheese  →  HTTP 200
    name = גבינות הר הגולן · phone = 052-9876543 · availability_state = on_vacation
```

**בקרה:** `GET /nonexistent-slug-xyz` → `404`. כלומר ה-200 אמיתי ואינו "כל נתיב מחזיר
200"; ובנוסף שם העסק מופיע בגוף ה-HTML (2 מופעים), כך שזה עמוד מלא ולא UI של שגיאה.

**הסיבה:** `by-slug` מסנן על `status` בלבד — **לא** על `availability_state`. חופשה
מסתירה מהקטלוג, לא מהעמוד.

**למה זה שייך להכרעה:** הכרטיס מתאר את `golan-cheese` כ"אולי עסק אחד שאינו מוצג".
בפועל הוא עסק מזויף חי, עם טלפון פיקטיבי, נגיש בקישור ישיר — פשוט לא דרך הקטלוג.
**הסרת האישור סוגרת גם אותו**, ולכן הוא צריך להיכלל בחמש ולא להיחשב "כבר מוסתר".

---

## 6 · Q3 — הפיכות ותופעות לוואי

**הפעולה:** `POST /admin/producers/{id}/toggle-status` — `origin/main:admin.py:306-330`.

```python
_TOGGLEABLE_STATUSES = {"approved", "inactive"}          # admin.py:306
...
if producer.status not in _TOGGLEABLE_STATUSES:          # admin.py:326
    raise HTTPException(status_code=409, ...)
producer.status = "inactive" if producer.status == "approved" else "approved"
db.commit()
```

| שאלה | תשובה | ראיה |
|---|---|---|
| הפיך? | **כן, מלא** | אותו endpoint מחזיר `inactive → approved` (השורה למעלה, שני ענפי ה-ternary) |
| מוחק בקסקדה? | **לא** | נכתבת עמודה אחת. `db.delete` מופיע רק ב-`admin_delete_producer` (`admin.py:336`), נתיב אחר לגמרי |
| מנקה עמודות? | **לא** | `approve`/`reject` מנקים `requested_changes` / כותבים `rejection_reason`; `toggle-status` נוגע ב-`status` בלבד |
| שולח מייל? | **לא** | `_send_notification_email` נקרא ב-`approve_producer` וב-`reject_producer` — **לא** בנתיב הזה |
| WhatsApp / webhook? | **לא** | `_send_whatsapp` — אותה הבחנה בדיוק |
| אירוע אנליטיקס / listener? | **לא נמצא** | grep על `event.listens_for` / `after_update` / `before_update` מול `Producer` — אפס |

**ספיר ביקשה שה-fixtures לא ישלחו מייל לאיש. `toggle-status` אינו שולח — זו בדיוק
הסיבה שהוא הכלי הנכון כאן, ו-`reject` אינו.** `reject_producer` **כן** שולח מייל
לבעלים ו-WhatsApp לאדמין (`admin.py:905-917` בעץ העבודה), והוא גם terminal.

**תופעת לוואי עקיפה אחת, לא הרסנית:** `services/onboarding_followup.py` מסנן על
`status == "approved"`, כך שעסק מושהה מפסיק לקבל את שלבי מייל ההמשך. זהו **מסנן קריאה**
בג'וב מתוזמן, לא מוטציה, והוא מתאושש מעצמו עם החזרת האישור.

**מה שלא אימתתי:** האם קיימות שורות `pending`/`rejected` נוספות ב-production. ה-API
הציבורי חושף `approved` בלבד — הפער הזה נשאר פתוח מ-MEH-1992 §5, ונסגר רק מול ה-DB.

---

## 7 · Q4 — הנתיב שספיר לוחצת

```
/admin/producers
  → בשורת העסק, תפריט ⋮ (kebab)
    → «השהה»
```

| שלב | file:line (`origin/main`) |
|---|---|
| העמוד מעביר את ה-handler | `frontend/app/[locale]/admin/producers/page.js:176` |
| הפריט בתפריט | `frontend/app/[locale]/admin/producers/AdminProducersTable.jsx:206-207` |
| התווית «השהה» / «הפעל» | `frontend/messages/he.json:1360-1361` |
| ה-handler | `frontend/app/[locale]/admin/producers/use-admin-producers.js:134` |
| הקריאה | `POST /admin/producers/${id}/toggle-status` (`use-admin-producers.js:138`) |

> **מספרי השורות בטבלה הזו הם של `main` ולא של עץ העבודה.** ב-`staging` אותן שורות
> יושבות ב-`page.js:178` · `AdminProducersTable.jsx:229-236` · `he.json:1544-1545` ·
> `use-admin-producers.js:135,139`. ההתנהגות זהה בשני הענפים; רק המיקום זז. ספיר לוחצת
> על פרודקשן, ולכן `main` הוא הציטוט הקובע.

**הפקד קיים — אין ממצא חוסם.** הוא מוצג רק כאשר `status` הוא `approved` או `inactive`
(`AdminProducersTable.jsx:206`), וחמש השורות הן `approved`, כך שהוא יופיע על כולן.
התווית מתהפכת ל-«הפעל» אחרי הלחיצה — זו גם דרך האימות ה-UI שההסרה נקלטה, וגם דרך
החזרה.

**«השהה» אינו «מחיקה» ואינו «דחייה».** מחיקה (`DELETE`) הורסת שורות ותמונות Cloudinary
ואינה הפיכה; דחייה שולחת מייל וסופית. **«השהה» הוא בדיוק אפשרות א'.**

---

## 8 · אימות אחרי הביצוע — מה להריץ

```bash
# 1. הקטלוג ריק
curl -s https://mehamakor.co.il/api/producers | python3 -c "import sys,json;print(len(json.load(sys.stdin)))"   # צפוי: 0
curl -s https://mehamakor.co.il/api/producers/count                                                             # צפוי: {"count":0}

# 2. כל חמשת העמודים 404 — כולל golan-cheese
for s in teva-pure tases-ferments dana-sourdough galil-farm golan-cheese; do
  printf "%-16s " "$s"; curl -s -o /dev/null -w "%{http_code}\n" "https://mehamakor.co.il/$s"
done                                                                                                            # צפוי: 404 ×5

# 3. ⚠️ ה-sitemap — הבדיקה שנוטים לדלג עליה
curl -s https://mehamakor.co.il/sitemap.xml | grep -cE "mehamakor.co.il/(teva-pure|tases-ferments|dana-sourdough|galil-farm)<"
#   צפוי 0. אם חוזר 4 — ה-sitemap עדיין מה-build הישן. נדרש deploy, לא תיקון נוסף בפאנל.
```

**בקרה לשלב 2:** `curl -o /dev/null -w "%{http_code}" https://mehamakor.co.il/nonexistent-slug-xyz`
מחזיר `404` היום. אם **הוא** מחזיר משהו אחר, ה-404-ים למעלה חסרי משמעות — הרצתי אותה
היום והיא החזירה `404`.

---

## 9 · מה לא נעשה

- ❌ אפס `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` — כל בקשה היא GET
- ❌ לא הורצה שום מיגרציית Alembic
- ❌ לא נכתב סקריפט ניקוי, endpoint לביטול-אישור-בכמות, או כלי אדמין
- ❌ לא הוסק מצב production מ-staging — הקוד שנקרא הוא `origin/main`
- ❌ לא נגזר מחדש הסיווג "fixture" — MEH-1992 עשה זאת, והכרטיס מורה לא לחזור עליו
- ✅ הקובץ היחיד שנוצר הוא הדוח הזה
