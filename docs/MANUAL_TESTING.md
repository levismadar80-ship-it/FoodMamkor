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

## איך לעדכן מסמך זה
אחרי כל PR שמוסיף פיצ׳ר/עמוד חדש:
1. הוסיפי סקציה חדשה או הרחיבי קיימת בפורמט `[ ] Test — איך — מצופה`.
2. שימרי את הבדיקות קצרות — פעולה אחת, תוצאה אחת.
3. סמני ✅ רק אחרי שרצה הבדיקה על staging/production.
