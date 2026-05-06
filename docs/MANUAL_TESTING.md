# מהמקור — Manual Testing Checklist
> עדכון: אפריל 2026 | מתעדכן אחרי כל PR

---

## Password policy wire-up (MEH-306 sub-A backend)

> Backend behavior only — UI checklist + Hebrew error rendering ship with sub-B.

- [ ] Existing user login regression — איך לבדוק: התחברי עם user שנוצר לפני ה-PR (DB: `password_changed_at IS NULL`); **תוצאה מצופה:** 200 + JWT (MEH-305 fail-open path).
- [ ] Fresh signup floor — `POST /auth/register` עם `password` באורך 8 תווים → **422** עם `{"detail":[{"loc":["body","password"],"type":"string_too_short"}]}`. עם 12 תווים unique לא-deny-listed → **200**.
- [ ] Fresh signup deny-list — `POST /auth/register` עם `password=unbelievable` (12 תווים, ב-deny_list_10k) → **422** עם `detail.failures=["too_common"]`.
- [ ] /auth/check-password live preview — `POST /auth/check-password {"candidate":"unbelievable"}` → **200** עם `{"ok":false,"failures":["too_common"]}`.
- [ ] Reset reuse block — בקשי reset על account עם סיסמה `Foo!Bar123Bz`; פתחי את הקישור; שלחי `new_password=Foo!Bar123Bz` → **422** עם `same_as_current`.
- [ ] Reset session invalidation — login → קבלי JWT — בקשי reset → השלימי reset עם סיסמה חדשה → ה-JWT הקודם על `/auth/me` מחזיר **401** עם `session_invalidated_by_password_change`.
- [ ] Change password — `PATCH /users/me/password` עם current לא נכון → **403**; עם current ו-new זהים → **422** `same_as_current`; עם new < 12 → **422**; עם new תקין → **204** + `password_changed_at` מעודכן ב-DB.
- [ ] Forgot-password rate limit (per-email) — שלחי 6 בקשות `/auth/forgot-password` עם אותו email תוך פחות מ-15 דקות → 5 ראשונות **200**, ה-6th **429**.
- [ ] Forgot-password rate limit (per-IP) — שלחי 11 בקשות עם 11 emails שונים מאותה כתובת IP → 10 ראשונות **200**, ה-11th **429**.
- [ ] MEH-395 length-check bypass (security-critical) — `POST /auth/register {"password":"          aa"}` (12 raw chars, 2 post-strip) → **422** `string_too_short` (Pydantic BeforeValidator strips before min_length runs). אסור שהמערכת תיקבל ותhash את "aa".
- [ ] MEH-395 deny-list strip — `POST /auth/check-password {"candidate":"unbelievable    "}` (16 תווים: 12 + 4 רווחים) → **200** עם `{"ok":false,"failures":["too_common"]}` (Pydantic מחזיר "unbelievable", service מחזיק too_common).

---

## XSS sanitization sweep (MEH-329)

- [ ] HTML stripped server-side — איך לבדוק:
  1. בדף הרשמת בית עסק, הזיני בתיאור: `<script>alert(1)</script>תיאור עם הסבר`
  2. שמרי וצפי בפרופיל הציבורי
  3. **תוצאה מצופה:** הטקסט מוצג ללא אזהרת alert; ה-`<script>` נחתך ב-DB; רואים רק את הטקסט הנקי
- [ ] טופס "מהמטבח של השכן" — אותו דבר על `description` ו-`location_notes`
- [ ] טופס "צרי קשר" (`/contact`) — הזיני `<img src=x onerror=alert(1)>` בתוכן ההודעה; **תוצאה:** ההודעה נשמרת ב-DB ללא ה-tag

---

## Recipe ingredient cascade (MEH-311)

- [ ] FK violation regression — sanity check ידני בstaging:
  1. בקונסולת DB ב-Railway: צרי `RecipeIngredient` שמצביע על producer קיים — `INSERT INTO recipe_ingredients (id, recipe_id, ingredient_name, producer_id) VALUES (gen_random_uuid(), '<existing-recipe-id>', 'בדיקה', '<producer-id>');`
  2. דרך אדמין UI או DB: `DELETE FROM producers WHERE id = '<producer-id>';`
  3. **תוצאה מצופה:** Producer נמחק. RecipeIngredient נשאר. `SELECT producer_id FROM recipe_ingredients WHERE id = '<ingredient-id>';` → `NULL`.
  4. **בלי הfix:** היה נכשל בFK violation. אם זה עובד — הfix תקין.
- [ ] DELETE /auth/me regression — producer-user מוחקת חשבון דרך setting → "מחיקת חשבון" כשיש לה RecipeIngredient שמצביע אליה: ה-deletion מצליח (היה נכשל בFK violation לפני הfix).

---

## MEH-51 — Trust Ladder + Kashrut Badges (PR #183)

- [ ] ProducerCard: tier 3 producer shows "✅ עסק מאומת" green pill — סמני `is_verified=true` בDB לעסק → ProducerCard צריכה להציג badge ירוק
- [ ] ProducerCard: tier 1/2 producer shows no badge — עסק עם phone_verified=false, is_verified=false → אין badge
- [ ] ProducerCard: tier 5 (ambassador=true) shows "🏅 שגרירת מהמקור" dark pill
- [ ] ProducerDetail: TrustBadge shows next to name in header badge row
- [ ] ProducerDetail: KashrutBadgeStrip shows below highlights strip when kashrut_badges non-empty — הוסיפי `kashrut_badges=["badatz"]` בDB → strip עם "בדצ׳ה" מופיע
- [ ] KashrutBadgeStrip: expiry warning pill shows when kashrut_expires_at within 30 days — שיני expires_at ל-7 ימים קדימה → "⚠️ תעודה פגה בקרוב"
- [ ] KashrutBadgeStrip: no strip rendered when kashrut_badges empty (no regression to kosher text)
- [ ] /register/producer: phone verification step 4 appears after submit if producer has phone
- [ ] /register/producer: "שלחי לי קוד" button → POST /producers/me/verify-phone (check Twilio logs or check DB phone_otp_tokens)
- [ ] /register/producer: correct OTP code → phone_verified=true in DB
- [ ] /register/producer: wrong OTP code → "קוד שגוי או פג תוקף" error message
- [ ] /register/producer: "אאמת מאוחר יותר" → skips to confirmation (step 5)
- [ ] /admin/kashrut: page loads with pending requests list — צרי בקשה דרך POST /producers/me/kashrut-request → מופיעה בטבלה
- [ ] /admin/kashrut: אשרי button → badge added to producer.kashrut_badges in DB + kashrut_verified_at set
- [ ] /admin/kashrut: דחי button → opens modal with notes input → reject saves notes to DB
- [ ] /admin/kashrut: filter by status (pending/approved/rejected)
- [ ] POST /admin/producers/{id}/set-ambassador → ambassador=true → trust_tier=5 in GET /producers response
- [ ] Rate limiting: 3 OTP sends per 10 min per producer, 5 confirms per minute

רשימת בדיקות ידניות על הסביבה החיה לפני שחרור לפרודקשן.
פורמט: `[ ] Test — איך לבדוק — תוצאה מצופה`

---

## Producer Detail Page (feature/meh-producer-detail-redesign, 2026-04-18)

- [ ] Mobile 375px: producer name visible above fold without scrolling — פתחי דף עסק ב-DevTools מובייל 375px → h1 נראה מבלי לגלול
- [ ] Mobile: inline CTA visible above fold — כפתור יצירת קשר נראה מיד מתחת לשם
- [ ] Mobile: scroll past CTA → sticky bar slides in — גלולי מתחת לכפתור → StickyContactBar מגלשת מלמטה
- [ ] Mobile: scroll back to CTA → sticky bar slides out — גלולי חזרה למעלה → הבר נעלמת
- [ ] Vacation state: banner visible, CTA muted, sticky bar muted — שיני `availability_status` ל-`vacation` בDB → banner ענבר ← כפתור ירוק כהה + "יחזרו בקרוב"
- [ ] No images: category emoji + initials placeholder (not leaf) — עסק ללא תמונות → placeholder 120px עם emoji + 2 אותיות ראשונות
- [ ] With images: first image loads eagerly — פתחי Network tab → `images[0]` נטען עם `priority` (preload link בhead)
- [ ] Desktop: no duplicate PrimaryContactButton — ב-lg viewport → CTA רק בsidebar, לא בcolumn הראשי
- [ ] Reviews: not fetched until section scrolls into view — פתחי Network tab → אין בקשה ל-`/reviews` בטעינה; מופיעה רק כשגוללים לביקורות
- [ ] Gallery dots: 44px tap targets on mobile — Inspect element → כל dot button `min-h-[44px] min-w-[44px]`
- [ ] Review dates: display correctly in RTL — ביקורת עם תאריך → התאריך מוצג ב-`dir="ltr"` (לא הפוך)
- [ ] contact_name shows in main column — עסק עם contact_name → "מאחורי העסק: [שם]" מתחת ל-short_description
- [ ] highlights strip shows correct chips — grass_fed=true → 🌾 מרעה חופשי; delivery_areas non-empty → 🚚 משלוח

---

## Legal pages (אפריל 2026)

- [ ] /privacy — פתחי בדפדפן — מכיל "תיקון 13" ושם Cloudinary/Google
- [ ] /terms — פתחי בדפדפן — מכיל "חוק רישוי עסקים" ו-18+
- [ ] /contact — מלאי טופס ושלחי — התגובה "תודה! נחזור אליך בקרוב 🌿"
- [ ] /contact — אחרי שליחה — מגיע אימייל ל-`CONTACT_EMAIL` (`levismadar80@gmail.com`) עם שם/אימייל/הודעה בגוף, `From:` גם הוא `levismadar80@gmail.com` (לא spoofed)
- [ ] /contact — אחרי שליחה — יש שורה ב-`contact_messages` עם הערכים הנכונים (בדקי דרך `/admin` או `psql`)
- [ ] /contact — שלחי 6 פניות ברצף מאותה IP — השישית מחזירה 429
- [ ] /contact — זמני השבת של SMTP (או SMTP_USER ריק) — הטופס עדיין מחזיר 200 וה-DB שומר את השורה (fail-open)
- [ ] /accessibility — פתחי בדפדפן — מכיל תאריך עדכון ופרטי קשר
- [ ] Footer — גללי למטה — 4 לינקים: מדיניות / תנאי / נגישות / קשר
- [ ] Cookie banner — כנסי בחלון פרטי — מופיע עם 2 כפתורים
- [ ] "רק הכרחיים" — לחצי — banner נעלם, analytics לא נטען
- [ ] Producer registration — נסי לשלוח בלי checkboxes — כפתור disabled (גם checkbox הרישיונות וגם checkbox תנאי השימוש חובה)
- [ ] DirectoryDisclaimer — כנסי לדף יצרן — disclaimer מוצג מעל כפתור הדיווח
- [ ] DirectoryDisclaimer — גללי את גריד "מהמטבח של השכן" — כל כרטיסייה מציגה את ה-disclaimer בתחתית

---

## Security — POST /producers auth (PR #33)

- [ ] `curl -X POST /api/producers -d '{...}' -H "Content-Type: application/json"` ללא Authorization — 401
- [ ] אותה קריאה עם JWT תקף — 201, שורה חדשה ב-`producers` עם `status=pending`
- [ ] `pytest tests/test_api.py::TestProducers -v` על staging — כל 9 הבדיקות ירוקות כולל 4 החדשות: `test_post_producers_requires_auth`, `test_post_producers_rejects_invalid_token`, `test_post_producers_with_auth_creates_pending_producer`, `test_post_producers_with_blocked_user_fails`
- [ ] הזרימה הציבורית `POST /auth/register/producer` עדיין עובדת ללא אימות (לא הושפעה מהתיקון)

---

## Events (קהילה — אירועים מקומיים)

- [ ] /events — נטען עם פילטרים לפי עיר + תאריך
- [ ] /events/new — טופס עם 12 שדות בעברית (שם, תיאור, עיר, תאריך, שעה, מחיר, קיבולת, קטגוריה, תמונה, אימייל יצירת קשר, וואטסאפ, סוג אירוע)
- [ ] שלחי אירוע בדיקה — מגיע pending ב-/admin/events
- [ ] אשרי — מופיע ב-/events הציבורי
- [ ] "נשארו X מקומות" — מופיע כשנשאר מקום
- [ ] אימייל ל-`ADMIN_EMAIL` — מגיע כשמוגש אירוע חדש
- [ ] אימייל למארח — מגיע כשמאושר/נדחה

---

## Filter chips — two-row layout (feature/meh-two-row-filter-chips, אפריל 2026)

### /map — mobile (375px)
- [ ] פתחי /map בחלון 375px — שורת קטגוריות מוצגת (כל · בשר ועוף · ...) ושורת תכונות מוצגת מתחתיה (🚚 משלוח אליי · ✓ מאומתים · ...)
- [ ] שתי שורות — edge-fade משני הצדדים (ימין + שמאל)
- [ ] גללי בשורת הקטגוריות שמאלה — גריד נגלל, הצ'יפ הראשון לא נכרת (סיום עם w-8 spacer)
- [ ] לחצי על "לחם ומאפה" (הצ'יפ בקצה שמאל) — הצ'יפ נצבע bg-primary **ומתגלל אוטומטית לתוך ה-viewport** (scrollIntoView)
- [ ] לחצי על "בשר ועוף" — הצ'יפ נצבע bg-primary; תחת שורת התכונות מופיע tag ירוק "× בשר ועוף" + קישור "× נקי הכל"
- [ ] לחצי על "🌿 אורגני" — tag נוסף "× 🌿 אורגני" מופיע ליד הקודם
- [ ] לחצי על × בתוך ה-tag "× בשר ועוף" — הסינון מוסר, הצ'יפ "בשר ועוף" כבה, "כל" שוב פעיל
- [ ] לחצי על "× נקי הכל" — כל הסינונים מאופסים, אזור ה-tags נעלם
- [ ] בדיקת responsive — פתחי ב-375 / 430 / 768 / 1024 / 1280px — בכל גודל אין צ'יפ שנכרת ללא fade נראה, הצ'יפ הפעיל תמיד גלוי

### /map — desktop
- [ ] פתחי /map — sidebar מציג שתי שורות צ'יפים (קטגוריה + תכונות) + שורת סיכום כשיש סינון פעיל

### דף הבית — filters מעל גריד היצרנים
- [ ] פתחי דף הבית — שורת תכונות אחת (כשר · אורגני · משלוח · מאומת בלבד) עם edge-fade בצד שמאל
- [ ] לחצי "אורגני" — הצ'יפ נצבע; שורת סיכום "מסנן לפי: אורגני" מופיעה מעל הגריד
- [ ] הפעילי 2 צ'יפים — הסיכום מציג את שניהם מופרדים ב-·
- [ ] כבי את כל הצ'יפים — שורת הסיכום נעלמת

---

## Analytics — Producer + Admin dashboards (feature/producer-analytics, April 2026)

### Tracking infrastructure
- [ ] GET /producers/{id} — פתחי את עמוד היצרן פעם אחת — יש שורה חדשה ב-`producer_page_views` עם `viewer_ip_hash` שאינו null, `city` null (לא מחוברת), `referrer` null
- [ ] GET /producers/{id}?from=search — פתחי עם ה-param — שורה חדשה עם `referrer='search'`
- [ ] GET /producers/{id} עם Authorization header של משתמשת שלה city='תל אביב' — שורה חדשה עם `city='תל אביב'`
- [ ] `curl -H "User-Agent: Googlebot/2.1" /producers/{id}` — 200 תקין אבל **אין** שורה חדשה (bot filter)
- [ ] POST /producers/{id}/whatsapp-click — 200 + שורה ב-`producer_whatsapp_clicks`
- [ ] POST 11 קריאות ברצף מאותה IP — השישית עד ה-עשירית: 200; ה-11: 429 (rate limit 10/min)
- [ ] POST /producers/bad-uuid/whatsapp-click — 404, אין שורה

### Producer dashboard (/producer/dashboard)
- [ ] התחברי כיצרן — הדף מציג שם + כפתור זמינות היום + 6 כרטיסיות סטטיסטיקה + 2 תרשימים + 3 quick links
- [ ] כרטיסיית "צפיות בפרופיל" מציגה 3 מספרים: `last_7d / last_30d / total`
- [ ] כרטיסיית "הופעות בחיפוש" מציגה את אותו פורמט (רק צפיות עם `referrer='search'`)
- [ ] כרטיסיית "לחיצות ווטסאפ" מציגה 3 מספרים מ-`producer_whatsapp_clicks`
- [ ] כרטיסיית "עוקבות" מציגה את הספירה הכללית + `+X השבוע`
- [ ] כרטיסיית "דירוג ממוצע" מציגה מספר עם decimal + "מתוך X ביקורות"
- [ ] כרטיסיית "מוצרים פעילים במטבח" סופרת רק home_products של **המשתמשת המחוברת** עם `is_active=true`
- [ ] תרשים "צפיות ב-30 הימים האחרונים" — SVG line chart עם 30 נקודות, תוויות תאריך בהתחלה/אמצע/סוף
- [ ] תרשים "ערים מובילות" — horizontal bars עד 5 ערים; אם אין נתונים מציג טקסט fallback
- [ ] לחיצה על WhatsApp בעמוד יצרן (לא משלך) — ב-Network tab רואים POST /whatsapp-click sendBeacon נשלח לפני פתיחת חלון wa.me
- [ ] חזרה ל-/producer/dashboard — ספירת whatsapp_clicks עלתה ב-1

### Admin dashboard (/admin)
- [ ] סה״כ תצוגה: 4 stat cards ראשיים + 4 משניים (new_users_this_week, new_producers_this_week, total_events, total_experiences) + alert cards + 2 גרפים + פאנל בריאות שרת + פעילות
- [ ] "DAU — 30 ימים אחרונים" — line chart עם 30 נקודות, מבוסס `users.last_active_at`
- [ ] ערים מובילות (עד 10) — מצטבר מ-`producer_page_views.city` על פני **כל** היצרנים
- [ ] פאנל בריאות שרת מציג `response_time_avg_ms` ו-`requests_per_minute` + הערה "per-process בזיכרון"
- [ ] על בוט עם traffic בסיסי (curl /producers), ספירת `sample_count` עולה, avg וכו׳ מתעדכנים
- [ ] אחרי redeploy של Railway — הפאנל מתאפס (ok)

### Sidebar pending moderation badge
- [ ] צרי יצרנית חדשה עם status=pending + דיווח פתוח אחד + מוצר ביתי FLAGGED אחד + חוויה pending אחת
- [ ] /admin/dashboard — כרטיסיות alerts מפרטות את ה-4
- [ ] ב-sidebar על "לוח מחוונים" מופיע pill צהוב עם המספר 4
- [ ] מעבר ל-/admin/producers, ה-badge עדיין מופיע עם 4 (ה-layout טוען מחדש על כל שינוי pathname)
- [ ] אישור כל ה-4 → הרענון הבא: ה-badge נעלם

### Privacy invariant
- [ ] `SELECT viewer_ip_hash FROM producer_page_views LIMIT 10` — כל הערכים הם hex 64-תווים (SHA-256), אף אחד לא נראה כמו כתובת IP
- [ ] `SELECT column_name FROM information_schema.columns WHERE table_name='producer_page_views'` — אין עמודה `viewer_ip` בלי hash

---

## Experiences (קהילה — חוויות קולינריות)

> Experiences are **different** from Events: they go through a two-step
> moderation flow (Claude Haiku pre-check → admin approval) instead of
> a simple admin approval. The admin UI is a separate page at
> `/admin/experiences` with 5 tabs for each moderation state.

- [ ] /experiences — נטען עם פילטרים
- [ ] /experiences/new — טופס זמין למשתמשים מחוברים (ולא לאנונימיים)
- [ ] שלחי חוויה בדיקה — נכנסת ל-Claude Haiku pre-check; אם pass → `pending` ב-/admin/experiences; אם fail → `changes_requested` עם הסבר מהמודל
- [ ] /admin/experiences — 5 טאבים: "ממתינות לאישור" / "דרוש תיקון" / "מאושרות" / "נדחו" / "הכל"
- [ ] אשרי חוויה — מופיעה ב-/experiences הציבורי
- [ ] "בקשי שינויים" — אימייל למארח עם ההערות שלך מה-modal
- [ ] "דחי" — אימייל למארח עם סיבת הדחייה
- [ ] Claude Haiku לא זמין (ANTHROPIC_API_KEY ריק) — החוויה עוברת ישירות ל-`pending` (fail-open), הגשה לא נכשלת

---

## Registration forms — RTL + dashboard copy (tasks_for_claude_code.md PR 1 — tasks 1+2)

RTL tests (Task 1) — verify on a mobile viewport (iOS Safari / Android Chrome), not only on desktop. The bug reproduces only on mobile.

- [ ] `/register` — פתחי במובייל — שדה "שם מלא" מיישר ימין ונכתב מימין לשמאל
- [ ] `/register` — שדה "אימייל" — עדיין LTR (תווים לטיניים, intentional)
- [ ] `/register` — שדה "סיסמה" — עדיין LTR (intentional)
- [ ] `/register` — שדה "עיר" (CitySearch) — RTL, placeholder "חפשי עיר..." מיושר ימין, התוצאות באוטוקומפליט RTL
- [ ] `/register` — שדה "טלפון" — עדיין LTR (intentional)
- [ ] `/register/producer` שלב 1 — שדה "שם מלא" — RTL
- [ ] `/register/producer` שלב 2 — שדה "שם העסק" — RTL
- [ ] `/register/producer` שלב 2 — textarea "תיאור העסק" — RTL
- [ ] `/register/producer` שלב 2 — שדה "עיר" — RTL
- [ ] `/register/producer` שלב 3 — שדות "עיר משלוח" ו-"יום משלוח" — RTL
- [ ] `/register/producer` שלב 2 — "אינסטגרם" / "אתר" — עדיין LTR (intentional)

Dashboard copy tests (Task 2):

- [ ] `/producer/dashboard` — שלום משתמשת — הטקסט מתחת לכותרת קורא "ברוכה הבאה לניהול העסק של [שם העסק]" (לא "דשבורד")
- [ ] `/producer/dashboard/events/new` — breadcrumb בראש הדף — הקישור הראשון קורא "ניהול העסק" (לא "דשבורד"), קליק מחזיר ל-`/producer/dashboard`
- [ ] Footer — עמודת "בתי עסק" — הלינק השלישי קורא "ניהול העסק" (לא "דשבורד"), ה-`href` עדיין `/producer/dashboard`
- [ ] `grep -rn 'דשבורד' frontend/` → אפס תוצאות (ניתן להריץ אוטומטית לפני merge)

---

## Map city search width + dropdown z-index (tasks_for_claude_code.md PR 2 — task 3)

The width bug only shows on desktop (≥ `md` breakpoint, 768px+). Mobile was already correct (`w-full`). The z-index bug shows on `/map` specifically because Leaflet's panes (z-index 200–700) were covering the dropdown (z-50).

- [ ] `/map` על דסקטופ (חלון ≥ 768px) — הקלידי "ראשון לציון" בשדה החיפוש — הטקסט המלא נראה לגמרי, אין חיתוך (truncation) של התווים האחרונים
- [ ] `/map` על דסקטופ — הקלידי "ראש" — ה-autocomplete dropdown מציג "ראשון לציון" ו-"ראש העין" בשורה מלאה כל אחת, ללא טקסט קטוע או גלילה אופקית
- [ ] `/map` על דסקטופ — לחצי על "ראשון לציון" ב-dropdown — השדה מתמלא עם הערך המלא
- [ ] `/map` על דסקטופ — הקלידי "מעלה אדומים" ידנית — הטקסט המלא גלוי בשדה
- [ ] `/map` על מובייל (< 768px) — שדה החיפוש עדיין תופס את כל רוחב הפיד (`w-full`), לא התווסף regression
- [ ] `/map` — הקלידי "זכ" — ה-dropdown מצויר **מעל** המפה, רקע לבן אטום, אין טקסט ערבי/עברי של תוויות OSM שמבצבץ דרכו (z-index fix — לפני התיקון ה-dropdown היה מאחורי panes של Leaflet z-200 עד z-700)
- [ ] `/register` ו-`/register/producer` — שדה "עיר" — ה-dropdown עדיין עובד נכון (אין regression מה-z-[1000]), אין אלמנטים אחרים בעמוד שנחסמים על ידו

---

## Category card images — dairy + care (tasks_for_claude_code.md PR 3 — tasks 4+5)

Both cards render on the homepage category grid (`frontend/app/page.js` `CATEGORY_CARDS` array). Each card is a `<motion.button>` with a `backgroundImage: url(…)` style and a 65% green overlay (`rgba(46,104,83,0.65)`) on top. A "plain green" card means the image URL 404'd — the overlay is showing through nothing. A card that looks OK but has a visible logo/text is the image loading fine but carrying branding.

- [ ] דף הבית — גלילי לגריד הקטגוריות — **חלב וגבינות** מציג תמונה אמיתית של גבינה (לא צבע ירוק אחיד) עם שכבת גוון ירוקה על גביה
- [ ] דף הבית — **חלב וגבינות** — אין טקסט/לוגו/סימן מסחרי גלוי בתמונה
- [ ] דף הבית — **טיפוח וסבונים** — מציג תמונה אמיתית של סבון/מוצר טיפוח ללא טקסט Act+Acre (או כל מותג אחר) גלוי מעבר לשכבת הגוון
- [ ] דף הבית — **טיפוח וסבונים** — אין טקסט/לוגו בתמונה
- [ ] דף הבית על מובייל — שני הכרטיסים נטענים נכון (אין broken-image icon או ריק)
- [ ] DevTools → Network — הטעינה של `photo-1771578742735-36009188c207` (dairy) ו-`photo-1600857544200-b2f666a9a2ec` (care) — שתיהן 200 OK, לא 404
- [ ] 4 הקטגוריות האחרות (בשר / ירקות / לחמים / שמנים) לא התשנו — regression guard

---

## iOS Safari parallax verification (tasks_for_claude_code.md PR 4 — task 16)

Task 16 asked to add a `background-attachment: fixed` fallback for iOS Safari, but the hero and `ParallaxQuote` had already been refactored to Ken Burns CSS-transform animations in the April 8 PREMIUM_DESIGN commit, so no code fallback is needed. The refactor removed the bug described in the task. This checklist verifies the current Ken Burns pattern renders correctly on real iOS Safari (and Chrome iOS), which is what the task wanted us to confirm.

Test on a **real iOS device** (iPhone Safari + Chrome iOS preferred) — simulators are OK but don't always reproduce iOS-specific rendering quirks.

- [ ] דף הבית — iOS Safari — ה-hero הטעון (תמונת רקע) מציג את אנימציית ה-Ken Burns (pan/zoom איטי); התמונה לא קפואה/תקועה
- [ ] דף הבית — iOS Safari — כאשר גוללים את הדף למטה ה-hero נשאר חלק ואין jitter/stutter על הטרנספורמציה
- [ ] דף הבית — Chrome iOS — אותה בדיקה (Chrome iOS הוא Safari WebView תחת מכסה המנוע אבל שווה לאמת)
- [ ] דף הבית — שני בלוקי ParallaxQuote בין הסקשנים — Ken Burns רץ, הציטוט קריא מעל overlay ירוק 60%
- [ ] iOS Settings → Accessibility → Motion → **Reduce Motion: ON** — טוענים את הדף מחדש — אנימציות ה-Ken Burns נעצרות, התמונות סטטיות (זה התנהגות מכוונת לפי `@media (prefers-reduced-motion: reduce)` ב-globals.css:161)
- [ ] iOS Settings → Reduce Motion: OFF — אנימציות חוזרות לפעול אחרי רענון
- [ ] iPad בלנדסקייפ (lot > 768px) — אנימציות עדיין פעילות, אין regression מהסרת `.parallax-bg` המיותר
- [ ] `grep -rn 'background-attachment' frontend/` → רק הערות בקוד, אין שימוש פעיל (regression check — לוודא שה-class המת לא חזר)

---

## WhatsApp phone normalization (tasks_for_claude_code.md PR 5 — task 17)

The bug was: 4 separate inline phone-normalization implementations across the frontend, each with its own subset of handled input formats. One of them (`ProducerCard.jsx` and its copy in `ProducerDetail.jsx`) had an order-of-operations bug where input with leading whitespace would output an unchanged local-format number. Fix: a single `normalizePhone()` helper in `lib/utils.js` with 19 unit tests, applied at all 4 call sites.

### Unit tests (run locally before merge)

- [ ] `cd frontend && node lib/utils.test.mjs` → `19 passed, 0 failed` ← pure Node, no Jest/Vitest needed

### End-to-end: the wa.me link actually works for every input format

For each of the formats below, set an approved producer's phone field (via `/admin/producers` edit or directly in the DB) and tap the WhatsApp button:

- [ ] Plain local format `"0501234567"` → `/producer/:id` → WhatsApp button opens `wa.me/972501234567` (not `wa.me/0501234567`)
- [ ] Dashes `"052-123-4567"` → `wa.me/972521234567`
- [ ] Parentheses `"(050) 123-4567"` → `wa.me/972501234567`
- [ ] E.164 with `+` `"+972501234567"` → `wa.me/972501234567` (no stray `+` in the URL)
- [ ] Dots `"050.123.4567"` → `wa.me/972501234567`
- [ ] **Leading whitespace** `" 0501234567"` → `wa.me/972501234567` (this was the ProducerCard/ProducerDetail order-of-operations bug — verify the fix on the producer card + the detail page)
- [ ] Already normalized `"972501234567"` → `wa.me/972501234567` (no double-prefix)

### All 4 call sites must be tested

The fix applies to **4 distinct UI surfaces** — verify each:

- [ ] **Homepage producer grid** → click the WhatsApp icon on a `ProducerCard` → correct wa.me URL
- [ ] **`/producer/:id` detail page** → click the big green WhatsApp button in the sticky contact sidebar → correct wa.me URL
- [ ] **`/map` popup** → click a producer marker → popup has a WhatsApp link → opens wa.me with correct number
- [ ] **`/neighbor` home-product cards** → click the green WhatsApp CTA (the `WhatsAppButton` component) → correct wa.me URL

### Empty-input guards still work

- [ ] Producer with `phone: null` → no WhatsApp button rendered on ProducerCard, ProducerDetail, MapComponent popup, WhatsAppButton
- [ ] Producer with `phone: ""` → same: button hidden
- [ ] Producer with `phone: "abc"` (letters only) → `normalizePhone("abc") === ""` → button hidden

### Regression guards (grep-based, safe to automate)

- [ ] `grep -rn "replace(/\^0" frontend/` → zero matches outside `lib/utils.js` + `lib/utils.test.mjs` (no residual inline phone logic)
- [ ] `grep -rn "normalizePhone" frontend/` → exactly 4 imports (WhatsAppButton, ProducerCard, ProducerDetail, MapComponent) + 4 usages at the relevant call sites + 1 export in `lib/utils.js` + the test file

---

## Form submit loading state — 5 forms (tasks_for_claude_code.md PR 6 — task 18)

A shared `ButtonSpinner` component (`frontend/components/ButtonSpinner.jsx`, wraps Phosphor `CircleNotch` + Tailwind `animate-spin`) is now used inside the submit button of every public form. Each form also kept `disabled={loading}` so double-submission is prevented before the spinner even needs to be visible.

Test each form on real mobile + desktop. The spinner should be visible for the network round-trip (usually 200–800ms on prod), then disappear on success OR on error.

### /login

- [ ] `/login` — fill email + password → tap "כניסה" → **button disables immediately** (can't tap again), spinner + "מתחברת..." show inside the button for the duration of the request
- [ ] `/login` — wrong password → after the server returns an error, button re-enables and the original text "כניסה" comes back, spinner hidden
- [ ] `/login` — slow-3G (DevTools network throttling) — verify spinner is visible for ~2+ seconds

### /register

- [ ] `/register` — fill all fields + agree to terms → tap "הצטרפי" → button shows spinner + "נרשמת..."
- [ ] `/register` — trigger a client validation failure (wrong password shape) → button doesn't go into loading state at all (validation happens before `setLoading(true)`)
- [ ] `/register` — server error (duplicate email) → button recovers to "הצטרפי"

### /register/producer

- [ ] `/register/producer` → progress through step 1 + step 2 → on step 3, check both compliance checkboxes → tap **"שלחי בקשה"** (NOTE: was "שלח בקשה" — masculine — before this PR; verify it's now feminine)
- [ ] `/register/producer` step 3 → during submit the button shows spinner + **"שולחת..."** (NOTE: was "שולח..." — masculine — before this PR; verify it's now feminine)
- [ ] `/register/producer` — server error (e.g. duplicate email at step 1 surfacing here) → button recovers to "שלחי בקשה"

### /about contact form

- [ ] `/about` → scroll to contact form → fill name/email/message → tap "שלחי" → button shows spinner + "שולחת..."
- [ ] `/about` — success → button disappears or recovers, success message below the form
- [ ] `/about` — server error → button recovers to "שלחי", error message shows

### Footer newsletter

- [ ] Any page → scroll to footer → enter email → tap "הצטרפי" → button shows spinner + **"מצטרפת..."** (NOTE: was the cryptic "..." before this PR — verify the new text)
- [ ] Footer — success → feminine Hebrew "welcome" message appears below
- [ ] Footer — rate-limit error (429, after 6 quick signups) → button recovers to "הצטרפי"

### Cross-cutting accessibility checks

- [ ] `prefers-reduced-motion: reduce` — the spinner's CSS `animate-spin` is a simple rotation, not a content-shifting animation, so it's fine to leave running even under reduced-motion per WCAG. Verify it doesn't cause any layout shift.
- [ ] Keyboard-only — tab to any submit button, press Enter, confirm button disables via the same loading branch
- [ ] Screen reader — the spinner has `aria-hidden="true"` so it doesn't announce; the button label + disabled state is what matters

### Regression guards (grep-based)

- [ ] `grep -rn 'שולח\.\.\.' frontend/` → zero matches (the masculine form should not exist anywhere)
- [ ] `grep -rn 'ButtonSpinner' frontend/` → 5 imports (login, register, register/producer, AboutClient, Footer) + 5 usages + 1 component file

---

## CSP — Vercel Live feedback widget on preview URLs (fix/csp-allow-vercel-live-preview)

Vercel injects `https://vercel.live/_next-live/feedback/feedback.js` into every preview deployment so reviewers can leave inline comments. The previous CSP in `next.config.js` didn't whitelist `vercel.live`, so Chrome blocked the script and spammed the console with CSP violation warnings on every preview page load — making it hard to spot real errors during testing.

The fix conditionally appends `vercel.live` (and Pusher, which the widget uses for realtime) to 6 CSP directives **only when `process.env.VERCEL_ENV === "preview"`**. Production CSP stays strict — `vercel.live` does not load in production and is not whitelisted there.

- [ ] Open any Vercel **preview URL** → DevTools → Console → reload → **zero** `"Loading the script ... violates the following Content Security Policy directive"` messages for `vercel.live`
- [ ] Same preview → bottom-left → Vercel feedback widget button loads and is clickable
- [ ] **Production** `mehamakor.online` → DevTools → Network tab → no requests to `vercel.live/*` at all (widget is not injected)
- [ ] Production → DevTools → Response Headers on any page → `Content-Security-Policy` does NOT contain `vercel.live` anywhere in its directives — regression guard that the conditional isn't leaking into prod
- [ ] `/login` Google OAuth still works (regression check — we touched the same CSP block as Google's GSI whitelist)
- [ ] Apple Sign-In button on `/login` still works (regression check — same reason)
- [ ] Unsplash images on the homepage category grid still load (regression check — `img-src` gained an entry so order/syntax matters)
- [ ] Cloudinary producer photos still render (regression check — `img-src` again)
- [ ] OpenStreetMap Leaflet tiles still render on `/map` (regression check — same directive)

### Local verification commands (run once before merging)

```bash
# Production CSP (strict, vercel.live should NOT appear)
node -e "const c=require('./frontend/next.config.js'); c.headers().then(h=>console.log(h[0].headers.find(x=>x.key==='Content-Security-Policy').value))"

# Preview CSP (vercel.live + pusher should appear on 6 directives)
VERCEL_ENV=preview node -e "const c=require('./frontend/next.config.js'); c.headers().then(h=>console.log(h[0].headers.find(x=>x.key==='Content-Security-Policy').value))"
```

---

## Chat widget — plain Hebrew (feature/chatbot-plain-hebrew-v2)

### Suggested prompts — order + copy
- [ ] Open the widget from desktop homepage — the 8 suggested prompts appear in this exact order: `איך נרשמים כבעלת עסק?` / `איך מוצאים עסקים קרובים אליי?` / `איך מפרסמים מוצר ביתי?` / `מה זה מהמקור?` / `האם האתר בחינם?` / `איך יוצרים קשר עם בית עסק?` / `מה זה "מהמטבח של השכן"?` / `כמה זמן לוקח האישור של העסק?`
- [ ] `איך מדווחים על בעיה?` and `האם ההרשמה בחינם?` and `כמה זמן לוקח האישור?` (bare, without "של העסק") should NOT appear anywhere in the prompt list

### Hardcoded answers — instant + plain Hebrew
- [ ] Click `איך נרשמים כבעלת עסק?` — instant response (no typing dots), text contains `"תוך יום-יומיים"` and `"העסק שלך"`, does NOT contain `"הפרופיל"` or `"מודרציה"` or `"אוטומטית"`
- [ ] Click `איך מוצאים עסקים קרובים אליי?` — instant response mentioning both המפה + דף הבית and the WhatsApp button
- [ ] Click `איך מפרסמים מוצר ביתי?` — instant response contains `"המוצר שלך"` and `"תוך שעות ספורות"`, does NOT contain `"מודרציה"` or `"הפרופיל"`
- [ ] Network tab: clicking any of the 3 canonical prompts does NOT fire a request to `/api/chat`

### Freeform questions — backend KB sections
- [ ] Type `מה זה מהמקור?` — response explains the directory concept + categories + map (may use slight model rephrasing but must not mention "מודרציה" / "פרופיל")
- [ ] Type `האם האתר בחינם?` — response confirms free for both buyers + sellers and mentions premium as optional
- [ ] Type `כמה זמן לוקח האישור של העסק?` — response mentions `"יום-יומיים"` and `"העסק"` explicitly
- [ ] Type `איך יוצרים קשר עם בית עסק?` — response mentions WhatsApp button + phone/Instagram/site
- [ ] Type `מה זה "מהמטבח של השכן"?` — response mentions neighbors cooking at home + review by team, does NOT use "מודרציה"

### Regression guards (grep-based)
- [ ] `grep -n 'מודרציה' backend/app/routers/chat.py` — every match must be either inside a `#` comment block or inside the meta-instruction `אל תשתמשי במונחים טכניים כמו "מודרציה"`; must NEVER appear inside a KB section like `**איך נרשמים...**`
- [ ] `grep -n 'הפרופיל' backend/app/routers/chat.py` — must only appear in the comment (`never say "הפרופיל מאושר"`) or the meta-instruction; must NEVER appear inside a KB section
- [ ] `grep -n 'מודרציה\|הפרופיל' frontend/components/ChatWidget.jsx` — must only appear in the `//` comment block above `HARDCODED_ANSWERS`; must NEVER appear inside any value of the `HARDCODED_ANSWERS` map
- [ ] Backend + frontend approvals of businesses must always say `"העסק שלך"`: `grep -c 'העסק שלך' frontend/components/ChatWidget.jsx` → ≥1; `grep -c 'העסק שלך' backend/app/routers/chat.py` → ≥1

---

## Eye toggle + inline form validation on /login + /register (tasks_for_claude_code.md PR 8 — tasks 7+8)

Two tightly coupled tasks shipped in one PR. Task 7 = show/hide password button. Task 8 = inline onBlur validation with red borders, green checkmarks, error messages, and a submit button that's disabled until the form is valid.

### Password visibility toggle (task 7) — both pages

- [ ] `/login` — password field has a small eye icon on its left side (visual LEFT of the LTR input, which is the END of the RTL reading flow)
- [ ] `/login` — tap the eye → input type flips `password` → `text` → the typed characters become visible
- [ ] `/login` — tap again → flips back to `password` → characters become dots
- [ ] `/login` — icon changes: closed eye (`Eye`) when hidden, slashed eye (`EyeSlash`) when visible
- [ ] `/register` — same 4 checks on the password field there
- [ ] Keyboard — tab to the password field → tab again → focus lands on the eye button → press Enter → toggles
- [ ] Screen reader — button has `aria-label` that swaps between "הציגי סיסמה" and "הסתירי סיסמה" + `aria-pressed` reflects state

### Inline validation — /login (task 8)

- [ ] `/login` — load page — submit button is **disabled** (form is empty)
- [ ] Email field — tap then tap away without typing → no error (touched but empty is neutral)
- [ ] Email — type `foo` → tap away → red border + error `"האימייל לא תקין"` below the field
- [ ] Email — fix to `foo@bar.com` → red border gone, now green border + `"✓ תקין"` below
- [ ] Password — tap then tap away empty → no error
- [ ] Password — type `abc` → tap away → red border + error `"סיסמא חייבת להכיל לפחות 8 תווים"`
- [ ] Password — fix to `abcdefgh` (8 chars) → green border + `"✓ תקין"`
- [ ] Submit button — disabled until BOTH email is valid AND password is ≥8 chars — then enabled
- [ ] Server error path — submit with right-format-but-wrong-credentials → banner-level error appears → button re-enables

### Inline validation — /register (task 8)

- [ ] `/register` — load page — submit button is **disabled** (form is empty + terms not agreed)
- [ ] Name field — tap then tap away empty → red border + `"שם מלא הוא שדה חובה"`
- [ ] Name — type `שרה` → green border + `"✓ תקין"`
- [ ] Email — same pattern as /login (`"האימייל לא תקין"` error)
- [ ] Password — same pattern as /login (`"סיסמא חייבת להכיל לפחות 8 תווים"` error)
- [ ] Password — **strength indicator** appears below the input as soon as the user types anything:
  - 1 rule passes (e.g. `"abc"` — only len fails, no upper, no digit: **0 rules**) — strength bar shows no color, no label (field still effectively too short)
  - 1 rule passes (e.g. `"abcdefgh"` — len ✓, upper ✗, digit ✗) — label `"חוזק סיסמה: חלשה"` in red, 1/3 of the bar in red
  - 2 rules pass (e.g. `"Abcdefgh"` — len ✓, upper ✓, digit ✗) — label `"חוזק סיסמה: בינונית"` in amber, 2/3 of the bar in amber
  - 3 rules pass (e.g. `"Abcdefg1"` — all three ✓) — label `"חוזק סיסמה: חזקה"` in primary-green, 3/3 of the bar in primary
- [ ] Password — the existing rule checklist is still visible below the strength bar (one ✓/○ per rule)
- [ ] Phone — **optional field** — tap and tap away empty → no error, no green check (empty is fine)
- [ ] Phone — type `123` → tap away → red border + `"מספר טלפון לא תקין"`
- [ ] Phone — fix to `0501234567` → green border + `"✓ תקין"`
- [ ] City field (CitySearch) — no inline validation added (not in task 8 spec; field is optional)
- [ ] Submit button — disabled until ALL required fields pass AND terms checkbox is ticked:
  - Name non-empty ✓
  - Email valid format ✓
  - Password ≥8 chars ✓
  - Phone empty OR valid format ✓
  - Terms checkbox checked ✓

### Task-spec exactness — error message wording

The task spec dictates the exact Hebrew error text for each rule. Verify the strings match character-for-character:

- [ ] `grep -rn 'האימייל לא תקין' frontend/app/login frontend/app/register` → 2 matches (1 per page, in the inline validation block)
- [ ] `grep -rn 'סיסמא חייבת להכיל לפחות 8 תווים' frontend/app/login frontend/app/register` → 2 matches
- [ ] `grep -rn 'שם מלא הוא שדה חובה' frontend/app/register` → 1 match
- [ ] `grep -rn 'מספר טלפון לא תקין' frontend/app/register` → 1 match

### Accessibility checks

- [ ] Eye button has `aria-label` that swaps + `aria-pressed` that reflects state
- [ ] Invalid inputs have `aria-invalid="true"` (verify in DevTools Elements tab)
- [ ] Error messages are rendered in the same `<div>` as the input so screen readers pick them up
- [ ] `prefers-reduced-motion: reduce` — nothing in this PR adds animation, but verify the eye toggle still works smoothly under reduce-motion (it uses only a CSS `transition` on the icon color — no transform/opacity)

### Regression checks — do NOT break existing behavior

- [ ] `/login` Google OAuth button still works (we imported a new icon but didn't touch the OAuth block)
- [ ] `/login` Apple Sign-In button still works
- [ ] `/register/producer` step 1 still works — the `PasswordStrength` upgrade (tier indicator) propagates to its password field too. Verify the new tier bar renders there without layout breakage.
- [ ] `/register` → submit with invalid data server-side (e.g. email already exists) → error banner at the bottom of the form appears, submit button recovers
- [ ] `/register` → form validation AFTER clearing a field (e.g. type valid email then backspace to nothing) → red border appears (field is still touched, and the empty-string + touched state should reset to neutral or invalid per the logic). Actually for email: touched + empty → neither invalid nor valid (because `emailInvalid` requires `email.length > 0`). Expected: no red border, no green check, button disabled because `validateEmail("") === false`.

---

## Producer cards — 2-column mobile grid (task 9)

### Mobile 2-column layout (< 768px)
- [ ] Homepage — open on a mobile device / narrow viewport (< 768px) — producer cards display in **2 columns** instead of 1
- [ ] Homepage — gap between cards is tighter on mobile (~12px) vs tablet+ (~24px)
- [ ] Homepage — "עסקים חדשים ✨" section also shows 2-column grid on mobile
- [ ] `/map` — scroll down to the producer list below the map — same 2-column grid on mobile
- [ ] Tablet (768px–1023px) — grids stay 2-column (unchanged from before)
- [ ] Desktop (1024px+) — grids stay 4-column (unchanged from before)

### Shorter card images on mobile
- [ ] Mobile — card image height is **140px** (shorter than desktop)
- [ ] Desktop — card image height is **200px** (unchanged)
- [ ] Images are not squished or stretched — `object-cover` fills the shorter container

### Text truncation
- [ ] Long producer name (e.g. "חוות השקמה של משפחת אברהמי מרחובות") truncates with `…` instead of wrapping to a second line
- [ ] Long city + category line truncates with `…`
- [ ] Long top product name truncates with `…`

### Regression checks
- [ ] `/favorites` grid is **unchanged** — still 1-col on mobile, 2-col at md, 3-col at lg
- [ ] Card hover shadow + lift effect still works on desktop
- [ ] "מאומת" / "פרמיום" / "זמין היום" badges still visible on the image
- [ ] WhatsApp / phone / Instagram icon row in footer still clickable
- [ ] "מידע נוסף" CTA button still works

---

## Compliance fixes (ESLint + RTL + accessibility + disclosures)

### ESLint
- [ ] `cd frontend && npx eslint . --ext .js,.jsx` → 0 errors

### Skip navigation (IS 5568)
- [ ] Tab once from page load → "דלג לתוכן הראשי" link appears → Enter → focus jumps to main content

### Business disclosures
- [ ] Footer shows ח.פ., address, email

### RTL dir="ltr"
- [ ] Admin settings email input: cursor starts on left
- [ ] Footer newsletter email: cursor starts on left
- [ ] Experiences/new image URL: cursor starts on left

### Accessibility statement
- [ ] `/accessibility` — coordinator name "צוות מהמקור" visible
- [ ] Phone placeholder "להשלים" visible
- [ ] Link to gov.il accessibility authority present
- [ ] Date label: "תאריך בדיקה אחרונה" (not "עדכון אחרון")

### Admin tables RTL
- [ ] Admin tables use `text-end` (not `text-right`) — text aligns correctly in RTL

---

## Map z-index token system + UI bugfixes

### Z-index hierarchy (per CLAUDE.md)
- `tiles:0 → markers:400 → tooltips:500 → bottom-sheet:600 → legend:800 → controls:1000 → chat:9999`

### Bug fixes
- [ ] Mobile: bottom sheet open → zoom +/- still clickable above it (z-600 < z-1000)
- [ ] Desktop: hover marker → only ONE tooltip (no browser-native duplicate)
- [ ] Mobile: sheet content scrolls fully, "מידע נוסף" visible with padding
- [ ] Mobile: X close button stays at top-left during scroll → tap → closes
- [ ] Mobile: category legend NOT visible (hidden, filter chips serve this role)
- [ ] Desktop: legend visible at bottom-right (z-800)

### Regression
- [ ] "חפשי באזור זה" button works (z-1000)
- [ ] "קרוב אלי" clickable with sheet open
- [ ] CitySearch dropdown above map tiles
- [ ] Map pan/zoom works above the sheet

---

## Dynamic OG tags + share message (social sharing)

### OG tags on /producer/:id and /:slug
- [ ] View page source or `curl -s https://mehamakor.online/producer/1 | grep 'og:'` — `og:title` is the producer name (no "| מהמקור" suffix)
- [ ] `og:description` is the first 120 chars of producer description
- [ ] `og:image` is a Cloudinary URL with `w_1200,h_630,c_fill` transform
- [ ] `og:url` matches the configured production canonical (NEXT_PUBLIC_SITE_URL / SITE_URL / fallback per `frontend/app/sitemap.js` 3-tier resolution)
- [ ] Share a producer link on WhatsApp → preview shows producer photo + name + description snippet
- [ ] Share a slug URL (e.g. `/havat-hashikma`) → same preview quality

### Share button text
- [ ] Click share on producer page (desktop, no native share) → clipboard contains multi-line message:
  ```
  גיליתי את [name] במהמקור 🌿
  [first 80 chars of description]...
  ב[city] • [category]
  👉 [URL]
  ```
- [ ] Mobile: native share sheet opens with the formatted text
- [ ] Producer with no description → description line is omitted
- [ ] Producer with no city/category → location line is omitted

### Regression
- [ ] Producer page still loads and renders correctly
- [ ] WhatsApp share button still works separately
- [ ] JSON-LD structured data still present in page source

---

## Performance — Core Web Vitals (CWV audit)

### Image optimization (LCP)
- [ ] `grep -rn 'images.unsplash.com' frontend/app/ frontend/components/ | grep -v fm=webp | grep -v next.config | grep -v layout.js` → **0 matches** (all URLs include `&fm=webp`)
- [ ] `grep -rn 'images.unsplash.com.*w=600' frontend/app/page.js` → all 6 category cards include `&q=80&fm=webp`
- [ ] Network tab: hero image response header `Content-Type: image/webp` (when browser supports it)

### Layout shift (CLS)
- [ ] ProducerCard image container has explicit `h-[140px] md:h-[200px]`
- [ ] HomeProductCard image container has explicit `h-48`
- [ ] Category cards have explicit `height: 280px`
- [ ] Hero sections use `height: 100vh`
- [ ] No visible content jump on page load (manual check)

### Bundle size
- [ ] `npm run build` — homepage first load JS < 200kB
- [ ] Shared chunk < 90kB

---

## Component tests — vitest (automated)

### Running
- [ ] `cd frontend && npx vitest run --reporter=verbose` — all 33 tests pass
- [ ] Stop hook runs vitest automatically on every task completion

### ProducerCard — Phase A → B → C redesign (2026-04-18)
- [ ] **Anatomy** — image (1:1 mobile, 4:3 desktop) → name row with inline `★ rating · count` → location dot + city + distance → description line → max-2 pill row → footer (price + primary-method hint). No contact-icon row. No CTA link.
- [ ] **Image ratio** — resize viewport from 375→768→1280; image stays square on mobile, shifts to 4:3 at `lg` breakpoint. No letterboxing / stretching.
- [ ] **Cloudinary smart-crop** — for a Cloudinary source image, the URL has `c_fill,g_auto,ar_4:3` injected. Portrait producer photos don't crop heads off.
- [ ] **Rating gate** — producer with `reviews_count = 2` shows no rating; `reviews_count >= 3` shows `★ 4.5 · 12` in the name row, `dir="ltr"`.
- [ ] **Availability dot** — `is_available_today=true` → green; `availability_status="vacation"` → orange (overrides even if `is_available_today=true`); neither → no dot.
- [ ] **Description fallback** — `short_description` shown when present; else `top_product_name`; else row hidden. Descriptions past 80 chars get a trailing `…`.
- [ ] **BadgeRow fold** — producer with `is_verified + is_recommended + organic_certified + grass_fed` shows exactly 2 pills (verified + recommended) per the new 8-key priority.
- [ ] **Footer** — price truncates at `max-w-[120px]`; primary-method icon switches per `primary_contact_method` (whatsapp → WhatsappLogo, phone → Phone, website → Globe, email → EnvelopeSimple).
- [ ] **Heart — guest flow** — tap heart while logged out → heart fills red, snackbar appears with "שמרתי — התחברי לראות את כל המועדפים שלך" and a `התחברי` link. Tap link → `/login?next=<current-url>`. After login, snackbar "נשמר למועדפים ❤️" appears and the favorite is persisted server-side.
- [ ] **Heart — authed flow** — tap heart while logged in → heart fills, `POST /users/me/favorites/{id}` fires, toast "נשמר למועדפים ❤️". Tap again → unfills, `DELETE` fires, toast "הוסר מהמועדפים".
- [ ] **Heart — error revert** — disable network, tap heart → heart fills then reverts, error toast "משהו השתבש, נסי שוב".
- [ ] **Heart — own-card hide** — as a logged-in producer, navigate to a page showing your own producer card (e.g. `/favorites` if you favorited yourself, or admin → producers index). Heart is absent.
- [ ] **Heart — click doesn't navigate** — tapping the heart does NOT open the producer detail page.
- [ ] **RTL** — heart sits at `top-3 start-3` (physical right in Hebrew). Rating + distance numerics stay LTR via `dir="ltr"` spans, no parentheses flipping.
- [ ] **onClick preserved** — on `/map`, tapping a card body (outside heart / Link) still pans the map.
- [ ] **Skeleton** — while `producers` loads, `SkeletonProducerGrid` renders the exact-same anatomy (square→4:3 image + body rows + footer row) with shimmer. No CLS jump when real cards arrive.

### HomeProductCard (16 tests)
- [ ] Renders image when available, placeholder when null
- [ ] Price: null → empty, 0 → "🎁 במתנה", number → "₪X / unit"
- [ ] Neighborhood when available, city as fallback
- [ ] Allergens/quantity/seller shown only when present
- [ ] Moderation badge for FLAGGED status
- [ ] Organic badge only when is_organic=true

### FavoriteButton (4 tests)
- [ ] Returns null when no user logged in
- [ ] Shows 🤍 heart when logged in (unfavorited)
- [ ] Correct aria-label and aria-pressed

---

## Share button on producer page (task 14)

### Share button (copy link)
- [ ] `/producer/:id` — sticky sidebar has a share button with a **ShareNetwork** icon (not a Link icon)
- [ ] Click share button (desktop, no native share) → toast **"הקישור הועתק ✓"**
- [ ] Clipboard contains the producer page URL
- [ ] Mobile (with native share API) → native share sheet opens

### WhatsApp share
- [ ] WhatsApp share button visible in the sidebar
- [ ] Click → opens `wa.me` with text: **"גיליתי את [שם העסק] במהמקור — [URL]"**
- [ ] Text contains the correct producer name and URL

### Regression checks
- [ ] Other ShareButton consumers (if any) also get the updated icon + toast
- [ ] Producer detail page still loads and renders correctly

---

## Recently viewed businesses (task 13)

### localStorage persistence
- [ ] Visit any producer page (e.g. `/producer/1`) → open DevTools → Application → Local Storage → `recently_viewed` key contains `[1]`
- [ ] Visit a second producer → `recently_viewed` is `[2, 1]` (most recent first)
- [ ] Visit the same producer again → no duplicates, ID moves to front
- [ ] Visit 6 different producers → only the 5 most recent are stored

### Homepage "ביקרת לאחרונה" section
- [ ] Homepage — with at least 1 recently viewed producer: **"ביקרת לאחרונה"** section appears above the main producer grid
- [ ] Section shows small cards in a horizontal scroll row (image + name + city)
- [ ] Cards are 160px wide with 100px tall images
- [ ] Long producer names truncate with `…`
- [ ] Click a card → navigates to that producer's page
- [ ] Mobile: cards scroll horizontally

### Edge cases
- [ ] Clear localStorage (`recently_viewed`) → refresh homepage → section is hidden
- [ ] Fresh browser with no localStorage data → section is hidden (no empty state)
- [ ] If a stored producer ID no longer exists (deleted) → that card is silently skipped

### Regression checks
- [ ] Producer detail page still loads correctly (the useEffect doesn't break anything)
- [ ] Homepage producer grid still renders below the recently-viewed section
- [ ] Category cards + search + geolocation all still work

---

## Advanced filter chips — homepage + /map (task 12)

### Chip appearance (both pages)
- [ ] Homepage — below "בתי עסק מומלצים" heading, 4 filter chips: ✡️ כשר · 🌿 אורגני · 🚚 משלוח · ✅ מאומת בלבד
- [ ] `/map` — below the city search, same 4 chips
- [ ] Mobile — chips row is horizontally scrollable (no line wrap)
- [ ] Inactive chip: white bg, border, dark text
- [ ] Active chip: primary-green bg, white text

### Toggle behavior
- [ ] Click "כשר" → chip turns green → grid reloads with only kosher producers
- [ ] Click "כשר" again → chip turns white → grid reloads without kosher filter
- [ ] Multi-select: activate "כשר" + "אורגנ��" simultaneously → grid shows only kosher AND organic producers
- [ ] Network tab: `GET /producers?kosher=true&organic=true` fires (both params)

### Composability with other filters
- [ ] Activate "משלוח" chip → search a city in the search bar → both `has_delivery=true` and `delivery_city=` sent
- [ ] Activate "מאומת בלבד" chip → click a category card → both `verified=true` and `category=` sent
- [ ] "קרוב אלי" button → with "אורגני" active → `lat=&lng=&radius_km=15&organic=true` sent
- [ ] Clear category filter ("נקה סינון") → chip filters preserved

### Backend params (new)
- [ ] `GET /producers?organic=true` → only producers with `organic_certified=true`
- [ ] `GET /producers?kosher=true` → only producers with a non-empty `kosher` field
- [ ] Both compose with existing params (`lat`, `lng`, `radius_km`, `category`, `delivery_city`, `verified`)

### Regression checks
- [ ] Homepage search still works without any chips active
- [ ] Category card clicks still work
- [ ] `/map` city search + legend category filter still work
- [ ] "הצגי עוד" load-more button works after chip-filtered results

---

## "קרוב אלי" geolocation button on homepage (task 11)

### Button appearance
- [ ] Homepage hero section — below the search bar there's a **"קרוב אלי"** button with a Crosshair icon
- [ ] Button styled as a frosted-glass pill (semi-transparent white with backdrop blur)
- [ ] Button fades in with the rest of the hero content (Framer Motion stagger)

### Geolocation flow — permission granted
- [ ] Click "קרוב אלי" → browser asks for location permission
- [ ] While waiting: button shows **"מחפשת..."** with a spinning Crosshair icon + disabled state
- [ ] On success: page scrolls to the producer grid, which now shows only nearby producers (radius 15km)
- [ ] Network tab: `GET /producers?lat=...&lng=...&radius_km=15` fires

### Geolocation flow — permission denied
- [ ] Click "קרוב אלי" → deny the browser permission prompt
- [ ] Toast appears: **"אפשרי גישה למיקום בהגדרות הדפדפן"**
- [ ] Button returns to normal state (not stuck on "מחפשת...")

### Geolocation unavailable
- [ ] In a browser/context without geolocation API — same toast message appears

### Regression checks
- [ ] Search bar still works (type a city → Enter → producers filtered)
- [ ] Category card clicks still filter the grid
- [ ] "הצגי עוד" load-more button still works after geolocation filter

---

## /neighbor empty state (task 10)

### City-filtered empty state
- [ ] `/neighbor` — select a city with no products (e.g. an obscure city) — empty state appears
- [ ] Large emoji: **🏡** (house with garden) in a round `bg-light` container
- [ ] Heading: **"אין מוצרים באזור הזה עדיין 🌱"** (exact text)
- [ ] Subtext (logged in): **"היי את הראשונה לפרסם מוצר בית!"** (exact text)
- [ ] CTA button (logged in): **"פרסמי מוצר +"** — click opens the product form
- [ ] Subtext (logged out): **"התחברי כדי לפרסם מוצר משלך."**
- [ ] CTA button hidden when logged out

### General empty state (no city filter)
- [ ] `/neighbor` with no products at all — heading: **"אין עדיין מוצרים ביתיים 🌱"**
- [ ] Same emoji, subtext, and CTA behavior as above

### Regression checks
- [ ] `/neighbor` with products — grid renders normally, no empty state shown
- [ ] "הצגי הכל" button still clears city filter
- [ ] Mobile floating CTA button still works
- [ ] Disclaimer banner still visible above the grid

---

## RTL Layout Regression — logical vs. physical classes

Added with `feature/rtl-regression-protection`.

### Login page — eye toggle
- [ ] `/login` — password field — eye toggle button appears on the **right** side of the input (physical right, inside `dir="ltr"` input — intentional exception)
- [ ] Toggle shows/hides password

### Modal close buttons (start-3)
- [ ] Click favorite when logged out → LoginPromptModal opens → ✕ close button appears on the **top-right** of the modal (RTL inline-start = physical right)

### Admin sidebar (start-0)
- [ ] Log in as admin → `/admin` — sidebar appears on the **right** side; main content fills the left

### ProducerCard badges (start-3)
- [ ] Homepage — if a "פרמיום" or "זמין היום" badge appears on a card, it is in the **top-right** corner of the card image (inline-start in RTL = physical right)

### ESLint CI
- [ ] Open a PR to staging → GitHub Actions "Frontend lint" job runs and passes (exits 0 even with pre-existing warnings)
- [ ] After PR #137 merges → run lint locally; RTL warnings should be nearly zero

---

## Session Handoff

Added with `feature/session-handoff`.

- [ ] Start new session → Claude reads HANDOFF.md before any other file (Rule 1 step a)
- [ ] End of session → HANDOFF.md updated with: last PR number, current branch state, next task, any new decisions
- [ ] `/compact` fires mid-session → HANDOFF.md updated immediately before continuing work
- [ ] Open new session next day → "Next task" section matches what was left unfinished

---

## איך לעדכן מסמך זה
אחרי כל PR שמוסיף פיצ׳ר/עמוד חדש:
1. הוסיפי סקציה חדשה או הרחיבי קיימת בפורמט `[ ] Test — איך — מצופה`.
2. שימרי את הבדיקות קצרות — פעולה אחת, תוצאה אחת.
3. סמני ✅ רק אחרי שרצה הבדיקה על staging/production.

---

## MEH-213: Business location types + cities autocomplete (PR #242)

### Admin ProducerForm — "סוג העסק" section
- [ ] Create new producer → "סוג העסק" section shows 2 checkboxes: "חנות פיזית" (checked by default) + "משלוחים" (unchecked) — צור עסק button is enabled
- [ ] Uncheck both checkboxes → inline error "חייב לסמן לפחות אחד מהשניים" appears; save button becomes disabled
- [ ] Check "משלוחים" only → cascading section appears with "משלוחים לכל הארץ" checkbox + CitiesAutocomplete below it
- [ ] Check "משלוחים לכל הארץ" → CitiesAutocomplete disappears; save is enabled
- [ ] Uncheck "משלוחים לכל הארץ" with no cities selected → inline error "יש לבחור לפחות עיר אחת"; save disabled
- [ ] Type "תל" in CitiesAutocomplete → dropdown shows cities starting with "תל" (requires seeded cities table); click a result → city chip appears
- [ ] Click × on a city chip → chip is removed
- [ ] Keyboard: ArrowDown/Up navigates dropdown; Enter adds selected city; Backspace removes last chip when input is empty
- [ ] Save delivery-only producer (no physical, offers_delivery=true, delivery_nationwide=true) → producer created; confirm in DB

### ProducerDetail — 4 location modes
- [ ] Physical-only producer → MiniMap visible, Waze/Gmaps buttons visible, no DeliveryBlock
- [ ] Physical + delivery producer → MiniMap visible AND DeliveryBlock visible below
- [ ] Delivery-only + nationwide → no MiniMap, no Waze/Gmaps; DeliveryBlock shows "🚚 משלוחים לכל הארץ" badge
- [ ] Delivery-only + city list → no MiniMap; DeliveryBlock shows city chips
- [ ] Delivery-only + no area set → DeliveryBlock shows "משלוחים בתיאום מראש — צרי קשר לפרטים"
- [ ] DeliveryBlock WhatsApp button → tapping opens WhatsApp correctly; Network tab shows POST /producers/:id/whatsapp-click beacon

### ProducerCard — "משלוחים בלבד" badge
- [ ] Delivery-only producer in list grid → shows "🚚 משלוחים בלבד" chip in badge row
- [ ] Physical-only or physical+delivery producer → no "משלוחים בלבד" chip

### Geo-search (map) exclusion
- [ ] Open /map → delivery-only producer does NOT appear as a pin; physical producer at same coords DOES appear

### Admin completeness dot
- [ ] Delivery-only producer with delivery_nationwide=true but no lat/lng → completeness dot is green (not red)
- [ ] Delivery-only producer with offers_delivery=true but no cities and no nationwide → completeness dot is yellow with "אזורי משלוח" in tooltip

### GET /cities?q= endpoint
- [ ] After running seed script: GET /api/cities?q=תל → returns ["תל אביב-יפו", "תל מונד", ...] (Hebrew sorted)
- [ ] GET /api/cities?q= (empty) → returns up to 20 cities alphabetically
- [ ] GET /api/cities?q=xxxxnotacityxxx → returns []

---

## Smart Search — HeroSearch + /producers?q= (MEH-99, PR #199)

### Hero search pill — recent / trending dropdown
- [ ] Homepage — click the search pill without typing → if there are recent searches (localStorage `mehamakor_recent_searches`) → dropdown shows "חיפושים אחרונים" with up to 5 items; each click routes to `/producers?q=<term>`
- [ ] Homepage — click search pill with no recent searches → dropdown shows "חיפושים פופולריים" items from `GET /search/trending`
- [ ] Homepage — type a single character → no autocomplete fired (debounce requires ≥ 2 chars)
- [ ] Homepage — type 2+ chars → after 300ms debounce, dropdown shows grouped results: יצרנים / מוצרים / ערים / קטגוריות
- [ ] Homepage — keyboard nav: ArrowDown/Up cycles through all items in the flat list; Enter submits the highlighted item
- [ ] Homepage — type "חוו" → press Enter → navigates to `/producers?q=חוו`
- [ ] Homepage — successful search term is saved to `mehamakor_recent_searches` (max 5, most recent first)
- [ ] Network tab: `GET /search?q=...` fires at most once per 300ms burst (debounce guard)
- [ ] Network tab: rapid type-delete → old in-flight request is aborted (AbortController), no stale results

### /producers?q= results page
- [ ] Navigate to `/producers?q=עגבנייה` → heading **"תוצאות עבור: עגבנייה"** appears above the grid
- [ ] Active filter chip **🔍 עגבנייה** appears in the chip row; click × → clears `q`, heading and chip disappear, full grid reloads
- [ ] ProducerCard names and descriptions show matched text in **bold** (no yellow background — `bg-transparent font-bold text-primary`)
- [ ] `/producers?q=xxxnotexist` → empty state shows "לא נמצאו בתי עסק" with category pill shortcuts
- [ ] `/producers?q=` (empty q) → behaves as normal unfiltered grid (no heading, no chip)
- [ ] `GET /producers?q=50%` → backend handles `%` as literal character (wildcard escaping), returns correct results (no SQL crash)
- [ ] `GET /producers?q=ח_ל_ב` → `_` treated as literal underscore, not LIKE wildcard

### Rate limiting
- [ ] Fire > 60 requests to `GET /search?q=x` in 1 minute → 429 response
- [ ] Fire > 30 requests to `GET /search/trending` in 1 minute → 429 response

---

## Google OAuth / CSP (fix #173, 2026-04-19)

- [ ] /login — open DevTools Console → zero CSP violations when page loads
- [ ] /login — click "כניסה עם Google" → Google popup opens and completes without postMessage error
- [ ] /login — Network tab → `accounts.google.com/gsi/style` loads with status 200 (not blocked)

---

## MEH-287 — Producer registration WhatsApp welcome

- [ ] `/register/producer` → submit הרשמה תקינה עם טלפון אמיתי → תוך 60 שניות מתקבלת הודעת WhatsApp "ברוכה הבאה למהמקור 🌿" — ודאי ש-TWILIO_* vars מוגדרים ב-Railway
- [ ] Response של `POST /auth/register/producer` בDevTools → Network → מכיל `whatsapp_sent: true` (כשTwilio מוגדר) או `whatsapp_sent: false` (כשחסר)
- [ ] Staging ללא `TWILIO_WHATSAPP_FROM` מוגדר → הרשמה חוזרת 200 + `whatsapp_sent: false` → success screen מציג banner צהוב diagnostic: "לא קיבלת הודעת WhatsApp? ייתכן שמספר הטלפון שגוי, או שתוכלי להמשיך ולהשלים את הפרופיל ישירות מהדשבורד." (טקסט בלבד — ללא כפתור; CTA הראשי "לדשבורד שלי" נשאר למטה) — MEH-302 dedupe
- [ ] Railway logs בזמן ההרשמה ה-"חסרה" → `[WHATSAPP] Producer welcome SKIPPED — missing: TWILIO_WHATSAPP_FROM` ברמת ERROR (לא warning)
- [ ] הרשמה עם `whatsapp_sent: true` → success screen מציג את הטקסט המקורי "שלחנו לך הודעת WhatsApp..." ללא banner

---

## MEH-326 — JWT refresh token flow

### Case A — Silent refresh on access expiry
- [ ] Login on staging, note timestamp
- [ ] Wait 16 minutes (access TTL = 15min)
- [ ] Click any protected action (e.g. favorite a producer)
- [ ] EXPECT: Action succeeds. No "פג תוקף ההתחברות" toast.
- [ ] DevTools → Network → `/auth/refresh` returned 200 immediately before the retried action request

### Case B — Forced logout when refresh expired / missing
- [ ] Login on staging
- [ ] DevTools → Application → Cookies → delete `refresh_token` cookie
- [ ] Edit `localStorage.token` to garbage (or wait for access to expire)
- [ ] Click any protected action
- [ ] EXPECT: "פג תוקף ההתחברות" toast appears. Page redirects to `/login`.

### Case C — logout-all-devices stays authenticated on current device
- [ ] Login on staging in browser A; login on staging in browser B (same account)
- [ ] In browser A: call `POST /auth/logout-all-devices`
- [ ] EXPECT browser A: stays authenticated (new access token + rotated refresh cookie)
- [ ] In browser B: click any protected action
- [ ] EXPECT browser B: receives 401 on next refresh attempt → "פג תוקף" toast + redirect to `/login`

## MEH-291 Phase 3 — Unified availability card across 5 surfaces (May 2026)

### Producer dashboard (/producer/dashboard)
- [ ] Open dashboard while logged in as a producer — איך לבדוק: navigate to `/producer/dashboard` — תוצאה מצופה: a single "מצב זמינות" card replaces the previous two stacked cards ("זמינות היום" + "סטטוס זמינות").
- [ ] Click "פתוח להזמנות" — תוצאה מצופה: pill highlights, no vacation date input shown.
- [ ] Click "זמינה היום 🟢" — תוצאה מצופה: pill highlights, no vacation date input.
- [ ] Click "עמוסה השבוע 🟠" — תוצאה מצופה: pill highlights, no vacation date input.
- [ ] Click "בהפסקה ⏸" — תוצאה מצופה: pill highlights, vacation date input appears below.
- [ ] Pick a future date in the vacation input + blur — תוצאה מצופה: state persists; refresh page → still on vacation with the same date.
- [ ] Switch back to "פתוח להזמנות" — תוצאה מצופה: vacation date cleared.

### ProducerCard badge dot
- [ ] /map or /producers list, look at a producer with `availability_state='available_today'` — תוצאה מצופה: green dot next to the location line.
- [ ] Producer with `full_this_week` — תוצאה מצופה: orange dot.
- [ ] Producer with `on_vacation` — תוצאה מצופה: NOT visible in default `/producers` listing (default-hide). Visible only on direct slug / favorites / explicit `?availability_state=on_vacation`.

### ProducerDetail banners (/producer/[id])
- [ ] Producer with `accepting_orders` — תוצאה מצופה: AvailabilityBadge "פתוח להזמנות"; no extra banner.
- [ ] Producer with `available_today` — תוצאה מצופה: AvailabilityBadge "זמינה היום 🟢"; no extra banner.
- [ ] Producer with `full_this_week` — תוצאה מצופה: amber banner "⏳ זמני תגובה ארוכים יותר השבוע" below the highlights strip.
- [ ] Producer with `on_vacation` — תוצאה מצופה: slate vacation banner "🌙 בית עסק זה בהפסקה כרגע" + return-date label. The full-this-week banner is suppressed.

### Admin form (/admin/producers/new + /admin/producers/[id])
- [ ] Open admin producer form — תוצאה מצופה: "מצב זמינות" section shows 4 radio pills matching dashboard labels.
- [ ] Choose "בהפסקה ⏸" — תוצאה מצופה: vacation date field appears below.
- [ ] Save form — תוצאה מצופה: PUT `/admin/producers/{id}` succeeds with `availability_state` in payload.
- [ ] Reload edit page — תוצאה מצופה: form pre-populates with the saved state.

### Friday delivery strip (homepage)
- [ ] Load homepage on a Thursday/Friday window — תוצאה מצופה: strip shows producers where `availability_state='available_today'` (Network tab: GET `/producers?availability_state=available_today&page_size=12`).

### Default `/producers` listing change
- [ ] Mark a test producer as `on_vacation` via the dashboard or admin form — תוצאה מצופה: producer disappears from the default `/producers` list.
- [ ] Hit `GET /producers?availability_state=on_vacation` directly — תוצאה מצופה: producer appears.
- [ ] Visit producer's direct slug URL — תוצאה מצופה: detail page still loads with the vacation banner.

## MEH-408 Phase 4 — DR drill (one-time, before MEH-408 closes)

Disaster-recovery drill — proves that a backup file in R2 actually
restores into a working Postgres DB. "You have a backup" is not true
until you have demonstrated the restore. Smadar runs this once;
record the outcome in HANDOFF.md.

Prereqs:
- PostgreSQL 18 client on PATH (`/c/Program Files/PostgreSQL/18/bin/`)
- `python` + `boto3` available locally (or run via the cron Docker image)
- R2 credentials in shell env (sourced from `.env.staging`)

Drill steps:

- [ ] **1. Find latest R2 backup.**
      `aws s3 ls s3://mehamakor-backups/ --endpoint-url $R2_ENDPOINT | tail -1`
      תוצאה מצופה: filename with today's or yesterday's date (cron just ran).

- [ ] **2. Create empty test DB locally.**
      `createdb mehamakor_dr_test`
      תוצאה מצופה: command exits 0, no errors.

- [ ] **3. Restore via the script.**
      `python scripts/restore_from_backup.py --latest postgresql://localhost/mehamakor_dr_test`
      תוצאה מצופה: exit 0, log lines show download + pg_restore + row-count table.

- [ ] **4. Verify row counts roughly match production.**
      Manually compare the script's row-count summary to production
      (Railway dashboard → Postgres → Data, or
      `psql $DATABASE_URL -tAc "SELECT count(*) FROM producers;"` from
      Smadar's terminal against the public proxy URL).
      תוצאה מצופה: counts match within ±1% (drift OK if backup is hours old).

- [ ] **5. Drop the test DB.**
      `dropdb mehamakor_dr_test`
      תוצאה מצופה: clean up the local artifact.

- [ ] **6. Log the result.**
      Add a one-liner to HANDOFF.md under MEH-408 Phase 4:
      `DR drill executed YYYY-MM-DD — restored mehamakor_<env>_<timestamp>.dump → row counts match — Phase 4 closed.`
