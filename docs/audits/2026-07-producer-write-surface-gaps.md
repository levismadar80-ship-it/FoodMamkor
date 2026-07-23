# דו״ח ביקורת — פערי משטח-כתיבה של בעלת העסק (Producer write-surface gaps)

> **MEH-1392** · Discovery / read-only · docs-only · 2026-07-20
> **Auditor:** Claude Code (feature/meh-1392-producer-gap-audit off staging)
> **Scope:** רק פערים מסוג "backend/דאטה קיימים — אין לבעלת העסק UI לכתוב".
> Consumer-side, admin-only-by-design, ופערי-צריכה — **מחוץ ל-scope**.
> **Classification = המלצה בלבד. ספיר מכריעה.**

---

## תקציר מנהלים (Executive summary)

- **Pass A** — `check_api_contract.py --json`: 37 orphan-backend endpoints, מתוכם
  **1** הוא פער-כתיבה אמיתי של בעלת העסק (`POST /producers/me/kashrut-request`).
  שאר ה-37: admin-only, health, webhook, legacy-superseded, או false-negative
  (נתיב דינמי שכן נקרא) — פירוט ב-Pass A.
- **Pass B** — מטריצת עמודות producer-owned: **5 findings** (F0–F4). 3 כבר מתויקטים
  (MEH-1167, MEH-1385, MEH-1166), 2 חדשים (F2 contact_name, F3 slug).
- **Pass C** — cross-reference מול Linear: כל finding מסומן already-ticketed / new.
- **מסקנת-על:** אין פער *נסתר* גדול. הפער החמור ביותר (F0 kashrut) כבר מתויקט —
  אבל **חומרתו עלתה** מאז סיווג ה-12/07 (ראו F0 § "שינוי חומרה").

| ID | פער | Ticket | סיווג מומלץ | Effort |
|----|-----|--------|-------------|--------|
| **F0** | UI לבקשת badge כשרות — `POST /producers/me/kashrut-request` בלי frontend caller | **MEH-1167** (Backlog) | post-launch → **לבחון העלאה** | S |
| **F1** | טופס עריכת `owner_bio` + `owner_photo_url` בדשבורד (schema+upload קיימים) | **MEH-1385** (Backlog) | post-launch | M |
| **F2** | בעלת העסק לא יכולה לערוך `contact_name` — admin-only | *חדש* | needs-sapir (by-design?) | S |
| **F3** | בעלת העסק לא יכולה להגדיר `slug` / כתובת-URL מותאמת — admin-only | *חדש* | needs-sapir (likely by-design) | S |
| **F4** | ניהול אירועים — create-only, אין edit/cancel לבעלת העסק | **MEH-1166** (Backlog) | post-launch | M |

---

## Pass A — Orphan backend endpoints

מקור: `python scripts/check_api_contract.py --json` (פלט מלא ב-Appendix A).
`backend_routes=185`, `frontend_unique_paths=116`, `orphan_frontend=0`,
`orphan_backend=37`.

סינון 37 ה-orphans לפי רלוונטיות לבעלת-עסק:

| קטגוריה | # | דוגמאות | ורדיקט |
|---------|---|---------|--------|
| **admin-only** | 12 | `/admin/producers/{_}/reject`, `/admin/stats`, `/admin/reviews/{_}/hide` | by-design — לא משטח בעלת-עסק |
| **health / webhook / infra** | 6 | `/health`, `/webhook/whatsapp` (GET+POST) | by-design |
| **producer legacy — superseded** | 2 | `POST /producers/me/availability` (`producer_me.py:370`), `POST /producers/me/availability-status` (`:405`) | by-design — הוחלף ב-`/availability-state` (חי, ראו למטה) |
| **false-negative (נתיב דינמי שכן נקרא)** | 15 | כל `/home-products*`, `/producers/{_}/follow*`, `/users/me/following` | לא פער — נקראים דרך template-path |
| **פער-כתיבה אמיתי** | **1** | `POST /producers/me/kashrut-request` (`producer_me.py:906`) | **F0** |
| **out-of-scope (host=User)** | 1 | `GET /experiences/mine` (`experiences.py:141`) | consumer-side — ראו § out-of-scope |

### A.1 — Legacy availability orphans הם *לא* פער

הדשבורד כותב זמינות דרך ה-endpoint החי:

```
frontend/app/[locale]/producer/dashboard/page.js:204
  await api.post("/producers/me/availability-state", body);
```

שני ה-orphans `POST /producers/me/availability` (`producer_me.py:370`) +
`POST /producers/me/availability-status` (`:405`) מסומנים בגוף הקוד עצמו
*"Legacy endpoint — kept during MEH-291 7-day overlap"*. היכולת מכוסה במלואה.
**ורדיקט: by-design (dead legacy).** לא פער-כתיבה.

### A.2 — home-products / follow orphans הם false-negatives

`scripts/check_api_contract.py` מפספס נתיבים דינמיים. אימות ידני:

```
$ grep -rn "home-products" frontend/app --include=*.js | grep "api\."
  frontend/app/[locale]/admin/reports/page.js:73  api.post(`/admin/home-products/${id}/approve`)
  ... (הקריאות קיימות דרך template literals)
```

`home_products` = מסלול "פרסום מוצר שכנה" (consumer/home-cook), משטח כתיבה שלם
וגם מחוץ ל-scope (לא producer-owned). לא פער.

---

## Pass B — מטריצת עמודות producer-owned → write-UI

טבלאות producer-owned שנבדקו: `producers`, `kashrut_badge_requests`, `products`,
`delivery_areas`, `events`, `group_buys`, `producer_recipes`, `producer_reviews`
(שדה `reply`), `category_requests`.

**קריטריון "covered":** קיים writer ב-`register/producer/*`,
`producer/dashboard/**`, או קריאת `api.put/post` מטופס בעלת-עסק.
**קריטריון "gap":** יש קורא-ציבורי או schema-support אבל 0 writers בכל משטח
בעלת-עסק (admin-only או כלום).

### B.1 — עמודות `producers` (הליבה)

| עמודה | קורא ציבורי? | write-UI בעלת-עסק? | admin-only? | ורדיקט |
|-------|:---:|:---:|:---:|--------|
| name, description, short_description, city, address, phone, instagram, website, whatsapp_group, facebook, external_order_form, primary_contact_method, contact_email | ✓ | ✓ edit `cards.jsx` | — | **covered** |
| price_range, top_product_name, images, opening_hours | ✓ | ✓ edit + `HoursEditor.jsx` | — | **covered** |
| has_physical_location, offers_delivery, delivery_nationwide, delivery_cities, delivery_excluded_cities | ✓ | ✓ edit `page.js:531,651` | — | **covered** (MEH-213) |
| custom_questions | ✓ | ✓ edit | — | **covered** (MEH-210) |
| producer_license_number | derived | ✓ register `:` + edit LicenseCard | — | **covered** (MEH-1258 — דפוס ה-"covered" הקנוני) |
| availability_state / vacation_until | ✓ | ✓ dashboard `page.js:204` | — | **covered** (MEH-291) |
| **owner_bio** | ✓ `OwnerCard.jsx:35` | ✗ **0 writers** | — | **F1 — gap** |
| **owner_photo_url** | ✓ `OwnerCard.jsx:36` | ✗ **0 writers** (upload endpoint יתום) | — | **F1 — gap** |
| **contact_name** | ✓ `OwnerCard.jsx:31` | ✗ **0 writers** | ✓ `ProducerForm.jsx:319` | **F2 — gap** |
| **slug** | ✓ (href בכל card) | ✗ **0 writers** | ✓ `ProducerForm.jsx:333` | **F3 — gap** |
| kosher | ✗ (MEH-986 הסיר מציבורי) | ✗ | ✓ admin | by-design (verified-only chain) |
| grass_fed, organic_certified | derived | ✗ | ✓ admin | by-design — superseded ל-`products.is_X` (MEH-293) |
| has_delivery, pickup_points | — | ✗ | ✓ admin | by-design — superseded ל-location-mode (MEH-213) |
| status, is_recommended, verified_at, verification_doc_type, declared_at, declaration_version, admin_notes, risk_score, risk_reasoning, rejection_reason, requested_changes, phone_verified, ambassador, plan, story_card_url, kashrut_verified_at, kashrut_expires_at, kashrut_badges, email_followup_*, avg_rating, reviews_count | חלקי | ✗ | ✓ | **by-design admin/system-only** |

### B.2 — טבלאות producer-owned נלוות

| טבלה | write-UI בעלת-עסק? | ורדיקט |
|------|:---:|--------|
| `products` | ✓ dashboard/edit | covered |
| `delivery_areas` | ✓ edit delivery card | covered |
| `producer_recipes` | ✓ create `recipes/page.js` + edit `recipes/[id]/edit/page.js` | covered (MEH-588/590) |
| `group_buys` | ✓ `dashboard/group-buys/page.js` | covered (MEH-52) |
| `producer_reviews.reply` | ✓ `ReviewsSection.jsx:119` PUT `/reviews/{id}/reply` | covered (MEH-1039) |
| `category_requests` | ✓ register (`category`×33) | covered (MEH-141) |
| **`kashrut_badge_requests`** | ✗ **0 writers** | **F0 — gap** |
| `events` | ⚠️ create-only (`events/new/`), אין edit/cancel | **F4 — partial gap** |

---

## Findings — פירוט + ראיות

### F0 — UI לבקשת badge כשרות · **MEH-1167** · post-launch → לבחון העלאה · S

**ראיה:**
```
backend/app/routers/producer_me.py:906   @router.post("/kashrut-request")   # limiter 10/hour
$ grep -rn "kashrut-request\|badge_code" frontend/app --include=*.js --include=*.jsx | grep -v __tests__
  frontend/app/[locale]/admin/kashrut/page.js:140   # admin reads/reviews only — 0 producer callers
```
ה-backend שלם מאז MEH-51. אין שום frontend caller שיוצר בקשה. בעלת העסק לא יכולה
להעלות תעודת כשרות.

**Ticket:** MEH-1167 (Backlog, Low, `post-launch`) — קיים ומאמת את הפער. (הטיקט מצטט
`producer_me.py:839`; הנתיב נדד ל-`:906` — endpoint קיים.)

**שינוי חומרה (acceptance F0):** ב-12/07 סווג post-launch/Low. מאז נסגרה שרשרת
ה-verified-only:
```
backend/app/services/producer_listing.py:184   Producer.kashrut_verified_at.isnot(None)   # MEH-986 ch3b
backend/app/services/producer_listing.py:57    # free-text kosher filter הוסר (MEH-986)
```
MEH-986 (Done 02/07) הסיר free-text kosher מכל משטח צרכני; MEH-1087 (Done 17/07) החזיר
chip "כשרות מאומתת" ל-/map — **verified-only**. המשמעות: מסלול בקשת-הכשרות (F0) הוא כעת
**המסלול היחיד** שדרכו בעלת עסק יכולה בכלל להגיע ל-badge כשרות ציבורי. בלי UI זה, לכל
פיצ'ר סינון-הכשרות הצרכני (home/producers/map) **אין supply מצד בעלות העסק**. זו טענה
חזקה יותר מ-"nice-to-have post-launch". **המלצה: ספיר תבחן העלאת עדיפות** (החלטה שלה).

### F1 — טופס "מאחורי העסק" בדשבורד (`owner_bio` + `owner_photo_url`) · **MEH-1385** · post-launch · M

**ראיה:**
```
backend/app/schemas/schemas.py (ProducerUpdate)   owner_bio + owner_photo_url מקובלים ב-PUT
backend/app/routers/upload.py:220                 @router.post("/owner-photo")   # יתום — 0 callers
frontend/.../producer/[id]/components/OwnerCard.jsx:35-36   קורא bio+photo (ציבורי)
$ grep -rn "owner_bio\|owner-photo" frontend/app/[locale]/producer/dashboard/edit/   → 0 writers
```
`OwnerEditBar.jsx` מקשר ל-`/producer/dashboard/edit` — אבל בטופס העריכה אין שדות
owner_bio/owner_photo. Schema + upload endpoint + כרטיס ציבורי נחתו (MEH-1335 Done),
טופס-הכתיבה בדשבורד לא. **Ticket: MEH-1385** (chunk 3 של MEH-1335, Backlog High) —
מכסה בדיוק את הפער.

### F2 — בעלת העסק לא יכולה לערוך `contact_name` · **חדש** · needs-sapir · S

**ראיה:**
```
frontend/components/admin/ProducerForm.jsx:319   contact_name: form.contact_name   # admin כותב
frontend/.../producer/[id]/components/OwnerCard.jsx:31   producer.contact_name   # קורא ציבורי
$ grep -c contact_name  RegisterProducerClient.jsx=0 · dashboard/page.js=0 · edit/=0
```
`contact_name` מוצג ציבורית ב-OwnerCard וקיים ב-`ProducerUpdate` — אבל היחיד שכותב אותו
הוא טופס האדמין. בעלת העסק לא יכולה להגדיר/לערוך את שם איש-הקשר שלה. **ייתכן by-design**
(נלכד ב-outreach/אדמין) — לכן needs-sapir, לא הנחה. Effort קטן (שדה בודד לטופס edit קיים).

### F3 — בעלת העסק לא יכולה להגדיר `slug` / URL מותאם · **חדש** · likely by-design · S

**ראיה:**
```
frontend/components/admin/ProducerForm.jsx:333   slug: form.slug   # admin בלבד
$ grep slug  register=0 · dashboard-write=0   (המופעים בדשבורד הם קריאה: href)
```
`slug` (כתובת /[slug]) נכתב רק ע״י אדמין. בעלת העסק לא יכולה לבחור URL מותאם.
**סביר שזה by-design** (אדמין מוודא vanity-URLs, מונע התנגשויות/abuse). מדווח לשקיפות;
ספיר מכריעה אם זה פער או כוונה. הערה: MEH-1356 (Done) טיפל ב-*באג* של slug חסר בעמוד
העוקבות — לא בהגדרת-slug ע״י בעלת העסק.

### F4 — ניהול אירועים create-only · **MEH-1166** · post-launch · M

**ראיה:**
```
frontend/app/[locale]/producer/dashboard/events/new/page.js   # create בלבד — אין edit/cancel
```
בעלת העסק יכולה ליצור אירוע אבל לא לערוך/לבטל אותו מה-UI (endpoints ה-PUT/DELETE קיימים
לפי MEH-1001). פער-כתיבה חלקי. **Ticket: MEH-1166** (Backlog Low, `post-launch`) — מכסה
בדיוק (list/edit/cancel).

---

## Out-of-scope (מתועד, לא נספר כ-finding)

- **`GET /experiences/mine` (`experiences.py:141`)** — `Experience.host_user_id` = **User**,
  לא Producer (מודל: "host is a User, not a Producer"). זה consumer-side, מחוץ ל-scope
  של ביקורת בעלת-עסק. `ExperienceCard.jsx:15` מציין שהכניסות היו stale. לא נספר.
- **כל 12 ה-admin orphans + 6 infra/webhook** — by-design.
- **פערי-צריכה** (consumer write surfaces) — ביקורת נפרדת, לא כאן.

---

## Pass C — Linear cross-reference (סיכום)

| Finding | חיפוש (he+en) | תוצאה |
|---------|---------------|-------|
| F0 | "kashrut badge request producer UI" | **MEH-1167** — already-ticketed (מאמת את הפער; pre-seeded F0 ✓) |
| F1 | "owner bio photo dashboard edit מאחורי העסק" | **MEH-1385** — already-ticketed (chunk 3 של MEH-1335 Done) |
| F2 | "producer contact name edit profile" | **new** — לא נמצא טיקט להגדרת contact_name ע״י בעלת-עסק |
| F3 | "producer slug custom URL" | **new** — MEH-1356 (Done) הוא באג slug-חסר, לא הגדרת-slug |
| F4 | "ניהול אירועים list/edit/cancel" | **MEH-1166** — already-ticketed |

> Linear MCP היה זמין ב-session — כל ה-cross-refs מאומתים (לא "unverified").

---

## Appendix A — פלט `check_api_contract.py --json` (excerpt)

```json
{
  "frontend_call_sites": 215,
  "frontend_unique_paths": 116,
  "backend_routes": 185,
  "orphan_frontend": [],
  "orphan_backend": [ /* 37 entries — producer-relevant subset: */
    {"path": "/producers/me/availability",        "method": "POST", "file": "backend/app/routers/producer_me.py", "line": 370},
    {"path": "/producers/me/availability-status", "method": "POST", "file": "backend/app/routers/producer_me.py", "line": 405},
    {"path": "/producers/me/kashrut-request",     "method": "POST", "file": "backend/app/routers/producer_me.py", "line": 906},
    {"path": "/upload/owner-photo",               "method": "POST", "file": "backend/app/routers/upload.py",      "line": 220},
    {"path": "/experiences/mine",                 "method": "GET",  "file": "backend/app/routers/experiences.py", "line": 141}
    /* + 12 admin, 6 infra/webhook, 15 dynamic-path false-negatives — see Pass A */
  ]
}
```

## Appendix B — פקודות אימות (reproducibility)

```bash
python scripts/check_api_contract.py --json           # Pass A source
grep -rn "kashrut-request\|badge_code" frontend/app    # F0: 0 producer callers
grep -rn "owner_bio\|owner-photo" frontend/app/[locale]/producer/dashboard/edit/   # F1: 0 writers
grep -c contact_name frontend/app/[locale]/register/producer/RegisterProducerClient.jsx   # F2: 0
grep slug frontend/components/admin/ProducerForm.jsx   # F3: admin-only writer
```

---

*Read-only audit. אפס עריכות קוד/schema/config. אין פתיחת טיקטים — הדו״ח מציע, ספיר/אורקסטרטור מחליטים.*
