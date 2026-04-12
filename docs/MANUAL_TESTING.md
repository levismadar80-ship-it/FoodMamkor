# מהמקור — Manual Testing Checklist
> עדכון: אפריל 2026 | מתעדכן אחרי כל PR

רשימת בדיקות ידניות על הסביבה החיה לפני שחרור לפרודקשן.
פורמט: `[ ] Test — איך לבדוק — תוצאה מצופה`

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

## Comprehensive mobile layout audit (feature/comprehensive-mobile-audit)

### WCAG touch targets (all buttons ≥ 44px)
- [ ] ProducerCard "מידע נוסף" button — tap with finger on mobile, should be comfortable (was 36px, now 44px)
- [ ] `/events` category filter pills — height should be comfortable to tap (py-2, not py-1)
- [ ] `/experiences` category filter pills — same as events
- [ ] `/map` legend category buttons — comfortable tap targets (py-2)
- [ ] `/login` password eye toggle — tap area should be ≥ 44px (was ~28px with p-1, now p-2)
- [ ] `/register` password eye toggle — same fix
- [ ] `/register/producer` category selection buttons — comfortable tap (py-2, was py-1)
- [ ] `/settings` "מחק חשבון" button — comfortable tap (py-3, was py-2)
- [ ] `/settings` delete dialog Cancel/Delete buttons — comfortable tap (py-3), stack vertically on mobile
- [ ] FavoriteButton default size — comfortable tap (p-2, was p-1)
- [ ] Header mobile menu links — each link has py-2 for comfortable tap area

### Layout fixes
- [ ] `/producer/:id` delivery areas table — horizontal scroll on narrow mobile (overflow-x-auto), not clipped
- [ ] `/producer/:id` h1 producer name — readable on mobile (text-2xl, not text-4xl)
- [ ] `/register/producer` step 3 delivery grid — stacks vertically on mobile (1 column), 3 columns on desktop
- [ ] `/events/:id` action buttons — full-width on mobile, inline on desktop
- [ ] `/experiences/:id` action buttons — full-width on mobile, inline on desktop

### Mobile padding/sizing
- [ ] `/producer/:id` sidebar — comfortable padding (p-4 on mobile, p-6 on desktop)
- [ ] `/producer/:id` Favorites + Share buttons — same height, same border treatment, both full-width in row
- [ ] `/producer/:id` "הצג במפה" button — same height as other sidebar buttons (py-3)
- [ ] `/login` card — not too padded on mobile (p-5, not p-8)
- [ ] `/register` card — same comfortable padding (p-5 on mobile)
- [ ] `/register` inputs — match `/login` input sizing (px-4 py-3, not px-3 py-2)
- [ ] `/register/producer` card + inputs — same sizing improvements
- [ ] Map bottom-sheet close button — comfortable tap area (p-2.5)

### Desktop regression checks
- [ ] `/producer/:id` desktop (> 1024px) — sidebar still sticky 320px card, all buttons look correct
- [ ] ProducerCard on homepage desktop — "מידע נוסף" button didn't get too tall
- [ ] `/events` desktop — category pills still look like pills (not oversized)
- [ ] `/login` desktop — card still centered, password eye toggle still aligns
- [ ] `/register/producer` step 3 desktop — delivery grid still 3 columns
- [ ] FavoriteButton on `/favorites` page — uses default compact style (p-2)
- [ ] ShareButton in ProducerCard — still compact inline style
- [ ] Header desktop nav — completely unchanged

---

## איך לעדכן מסמך זה
אחרי כל PR שמוסיף פיצ׳ר/עמוד חדש:
1. הוסיפי סקציה חדשה או הרחיבי קיימת בפורמט `[ ] Test — איך — מצופה`.
2. שימרי את הבדיקות קצרות — פעולה אחת, תוצאה אחת.
3. סמני ✅ רק אחרי שרצה הבדיקה על staging/production.
