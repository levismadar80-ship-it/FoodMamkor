# Edge Cases Audit — מקרי קצה לפני Launch
> Generated: 2026-04-21 | Branch: feature/meh-142-edge-cases-audit | MEH-142
> Method: static analysis (frontend + backend + security) + live-site probe + schema assumption review
> Hard rule: no P0 unresolved before launch; no P1 unresolved before first public marketing push.

---

## Executive Summary

The codebase is in solid shape for an Israeli v1 marketplace — the security fundamentals (JWT, rate limits, IDOR ownership checks, magic-byte upload validation, CSP) are all present and intentional. The most dangerous gap is **JWT token revocation**: if an admin blocks an abusive user, that user's existing token remains valid for up to 24 hours — on a small community site this is a meaningful trust risk. The second class of urgent issues is **idempotency**: double-tapping Favorite or Review triggers a raw 500 rather than a graceful 409/200, which will be the first bug users file. Beyond those two, the audit found **4 admin-panel null-crash vectors** that would prevent the admin from functioning on launch day, a **trivial DoS** via unlimited search query length, and a **fail-open SMTP/Anthropic gap** that silently swallows both contact form messages and content moderation without any admin alert. All P0 issues are 1-line or 1-day fixes. Confidence level: high — **78 edge cases** catalogued across frontend, backend, security, schema, SEO, accessibility, legal, and analytics layers.

---

## Full Edge Case Table

| # | Page / Layer | Edge Case | Likely | Severity | Current | Fix | Priority |
|---|---|---|---|---|---|---|---|
| 1 | `auth` / all | **JWT not invalidated on user block** — blocked user keeps using existing token for up to 24h TTL | sometimes | security | ~~broken~~ **FIXED in PR #201** (`get_current_user` now checks `is_blocked`; note: DB read is throttled 5min — max exposure window is 5min, not 24h) | ~~1 day~~ | ~~**P0**~~ ✅ |
| 2 | `GET /producers?q=` | **Search query no max length** — unlimited string logged to `search_queries` table; trivial disk-exhaustion DoS on launch day | every day | security | broken | 1 line | **P0** |
| 3 | `/admin` | **Admin dashboard crashes on null `monthly_producers`** — `data.monthly_producers.map(…)` throws if API returns null/undefined | rare | broken page | broken | 1 day | **P0** |
| 4 | `/admin` | **`pending_producers` crash when API fails** — no `?.` or default `[]` guard before `.map()` | rare | broken page | broken | 1 day | **P0** |
| 5 | `favorites` endpoint | **Double-submit Favorite = HTTP 500** — check-then-insert not atomic; DB unique constraint violation surfaces as 500 instead of 200 idempotent | sometimes | broken feature | broken | 1 day | **P0** |
| 6 | `reviews` endpoint | **Double-submit Review = HTTP 500** — same TOCTTOU pattern; upsert not atomic | sometimes | broken feature | broken | 1 day | **P0** |
| 7 | `/[slug]` | **Reserved slug collision** — producer named "about", "admin", "events", "neighbor", etc. gets permanent 404; `RESERVED` set is incomplete | rare | broken page | graceful (404) | 1 day | **P0** |
| 8 | `auth` / Google | **OAuth token verification degrades silently** — if `GOOGLE_CLIENT_ID` env var is unset, `_verify_google_token()` returns None and the login silently fails with no explanation | rare | broken feature | ugly | 1 day | **P1** |
| 9 | `POST /producers` schema | **Lat/lng no bounds validation** — `lat=9999` accepted by API; Haversine formula still runs (clamps via SQL `func.least`) but stores garbage coordinates; producer never appears on map | rare | broken feature | ugly | 1 line | **P1** |
| 10 | `auth` / phone | **Phone format not normalised** — `_notify_producer_registered()` does `"+972" + phone.lstrip("0")` but input with dashes / spaces / `+` prefix silently produces malformed WhatsApp number → notification fails without any user feedback | sometimes | broken feature | ugly | 1 day | **P1** |
| 11 | `/map` | **Map renders blank with no message when all producers have null lat/lng** — `forEach` skips invalid markers but no empty-state UI is shown; user sees a tile layer with zero pins and no explanation | sometimes | broken feature | ugly | 1 day | **P1** |
| 12 | `/producers` homepage | **Category chip click silent fail** — if `/categories` API fails, `card.categoryId` is null, click handler returns silently, no toast; user taps and nothing happens | sometimes | broken feature | ugly | 1 day | **P1** |
| 13 | `ProducerCard` | **WhatsApp CTA missing for old records without phone** — producers registered before phone became mandatory have no phone in DB; WA button is silently hidden; user sees no call-to-action | every day | broken trust | ugly | 1 day | **P1** |
| 14 | `/register` vs `/register/producer` | **Password policy mismatch** — consumer: `length >= 8`; producer: `length >= 8 + uppercase + digit`; no explanation shown; producer gets rejected on a password the consumer page would accept | sometimes | broken trust | ugly | 1 day | **P1** |
| 15 | `/register/producer` step 2 | **Category required but looks optional** — no asterisk, validation error appears only on submit attempt | sometimes | broken feature | ugly | 1 day | **P1** |
| 16 | Cloudinary / all producer pages | **Broken image with no fallback** — Cloudinary asset deleted or CDN timeout; `<img>` shows browser broken-image icon with no placeholder | sometimes | broken trust | ugly | 1 day | **P1** |
| 17 | `home_product_moderation` | **Auto-hide threshold too aggressive** — `avg_rating <= 2` treats 2-star "okay" as negative vote; three 2-star ratings hide a legitimate listing | sometimes | broken feature | broken | 1 line | **P1** |
| 18 | `search_queries` / analytics | **Search analytics poisoned by bots** — no rate limit on `/search` endpoint (rate limit added to `/search/trending` but not the main query path per adversarial review fix note in CHANGELOG) | sometimes | broken feature | broken | 1 line | **P1** |
| 19 | `/settings` password change | **Password mismatch error hidden off-screen on mobile** — confirmation error rendered below viewport in flex column; no `scrollIntoView` on validation trigger | sometimes | broken feature | ugly | 1 day | **P1** |
| 20 | `auth` / all | **Account deduplication: Gmail + Google OAuth = 2 accounts** — user who registers with `user@gmail.com` and later signs in with Google OAuth ends up with two separate accounts; favorites and history split | sometimes | broken trust | broken | 1 week | **P1** |
| 21 | `POST /home-products` | **AI moderation prompt injection** — title/description fields interpolated directly into Claude prompt string without escaping; sophisticated injection could manipulate APPROVED/FLAGGED/REJECTED output | rare | broken trust | ugly | 1 day | **P2** |
| 22 | `/admin` | **Admin notes stored unescaped** — `admin_notes` text accepted as raw HTML; if admin pastes malicious content and admin UI renders it as innerHTML, stored XSS | rare | broken trust | ugly | 1 day | **P2** |
| 23 | `auth` / Apple | **Apple identity_token expiry check** — `_verify_apple_token()` does parse the JWT claims but does not verify `exp` claim against current time before returning sub; stale (replayed) Apple tokens could be accepted | rare | security | broken | 1 day | **P2** |
| 24 | `/admin` slug creation | **Slug uniqueness race condition** — `_ensure_unique_slug` does SELECT-then-INSERT without `FOR UPDATE`; two simultaneous admin bulk-import requests could both generate `slug-2` → DB unique constraint violation → 500 | rare | broken feature | broken | 1 day | **P2** |
| 25 | `POST /producers/:id/follow` | **Follow endpoint no rate limit** — user can send thousands of follow requests → `producer_followers` table bloat | sometimes | broken feature | broken | 1 line | **P2** |
| 26 | `POST /home-products/:id/whatsapp-click` | **WA click rate limit missing** — authenticated route but no per-user rate limit; artificially inflates producer analytics | sometimes | broken feature | broken | 1 line | **P2** |
| 27 | `DELETE /users/me` (GDPR) | **User delete leaves orphan reviews, favorites, and analytics rows** — foreign key cascades cover most relations but analytics events (page views, WA clicks) reference `user_id` which may not cascade | rare | broken trust | ugly | 1 week | **P2** |
| 28 | `/[slug]` (closed business) | **Orphan detail page for closed producers** — no `status=closed` flag; admin marks `status=rejected` to hide but page returns 404 without explanation ("this producer is no longer available") | sometimes | broken trust | ugly | 1 day | **P2** |
| 29 | `/events` or `/experiences` | **Past events not filtered** — events with `date < today` surface in discovery list; no `is_past` flag or auto-hide on expiry | every day | broken feature | ugly | 1 day | **P2** |
| 30 | `chat.py` | **Chat widget 400 on malformed history** — client sends assistant-only messages; `api_messages` becomes empty after trim; raises HTTP 400 instead of returning graceful Hebrew "offline" message | rare | broken feature | broken | 1 line | **P2** |
| 31 | `/register/producer` | **Draft restore fails in private browsing** — `localStorage.setItem` throws in strict privacy mode; try/catch swallows error silently; user fills multi-step form, browser auto-refreshes, all data lost | sometimes | broken feature | ugly | 1 day | **P2** |
| 32 | `ProducerCard` | **Price displays "₪NaN"** — `Number("abc")` returns NaN; no `isNaN` guard; price badge shows gibberish | rare | broken trust | ugly | 1 day | **P2** |
| 33 | `/login` | **OAuth buttons hidden silently when env var missing in staging** — no banner or explanation; user thinks platform doesn't support Google login | sometimes | broken feature | ugly | 1 day | **P2** |
| 34 | `/settings` | **Delete account dialog: Hebrew input without `dir="rtl"`** — confirmation input renders LTR in RTL page; cursor position confusing | rare | broken trust | ugly | 1 line | **P2** |
| 35 | `MEH-56` IG scrape | **Instagram handle scrape throttled** — Instagram returns 429 on bot requests; scrape fails silently; producer profile shows no IG posts even after providing valid handle | sometimes | broken trust | ugly | 1 week | **P2** |
| 36 | `/map` | **MapComponent blank when all containers have `display:none` at init** — Leaflet registers 0-size container; tiles never load; no error shown (HANDOFF known issue #MEH-78 partial fix) | sometimes | broken feature | ugly | 1 day | **P2** |
| 37 | `auth` / password reset | **Password reset for Google-registered user shows confusing state** — reset email sent but user has no password; reset succeeds but next login attempt with password fails; no explanation that account was OAuth-only | sometimes | broken trust | ugly | 1 day | **P2** |
| 38 | `/producers` grid | **Category chip click before categories load** — race condition; `categoryId` is null; grid scrolls but no filter applied; user sees false positive interaction | sometimes | broken feature | ugly | 1 day | **P2** |
| 39 | `ProducerCard` | **Heart button post-login replay not implemented (Phase C)** — user taps heart while logged out → redirect to login → returns to page → heart is not pre-filled / action not replayed | every day | broken feature | ugly | 1 week | **P2** |
| 40 | `/register` consumer | **City field optional but backend may require it** — no `required` attribute, no inline validation, no asterisk; user can submit without city; API behavior on null city not documented | sometimes | broken feature | ugly | 1 day | **P2** |
| 41 | `producers.py` | **Two producers with same name → search collision** — no uniqueness on `producers.name`; search returns both; slug differs but card title is identical; user can't distinguish | rare | broken trust | ugly | 1 day | **P2** |
| 42 | `upload.py` | **File size not validated server-side** — `MAX_FILE_SIZE` checked in frontend but no server-side enforcement; client can strip the check and upload large files directly to the upload endpoint | rare | security | ugly | 1 day | **P2** |
| 43 | `home_products.py` | **HomeProduct vacation/availability_return_date null when vacation=true** — vacation banner shows "חוזרת בקרוב" with no date; if return date is null, copy says nothing useful | sometimes | broken feature | ugly | 1 day | **P2** |
| 44 | `availability_status` / Producer | **Vacation banner + is_available_today=true conflict** — producer sets `availability_status=vacation` but forgets to toggle off `is_available_today`; vacation badge shows but WhatsApp CTA remains active; customer messages producer who's on holiday → trust erosion | sometimes | broken trust | ugly | 1 day | **P1** |
| 45 | `services/home_product_moderation.py` | **Missing ANTHROPIC_API_KEY → fail-open publishes unsafe content** — intentional fail-open design, but no admin alert or dashboard indicator when key is absent; unsafe home products publish unchecked with zero visibility | rare | broken trust | ugly | 1 day | **P1** |
| 46 | `POST /contact` | **SMTP down → contact form silently loses messages** — fail-open: backend returns 200, DB row persisted, but email never sent; admin has no notification; user assumes message delivered | sometimes | broken trust | ugly | 1 day | **P1** |
| 47 | `experiences` / map | **Experience with null lat/lng on `location_type=public`** — no server-side validation that public experiences require coordinates; detail page map component crashes; no NOT NULL constraint on experience coords | sometimes | broken feature | broken | 1 day | **P2** |
| 48 | `experiences` moderation | **Rejected experience re-edit: unclear which feedback applies** — host edits rejected experience, status reverts to pending; Claude re-runs; if rejected again, does `rejection_reason` update or stay stale? Frontend shows ambiguous feedback state | sometimes | broken feature | ugly | 1 day | **P2** |
| 49 | `CookieBanner` + `lib/analytics.js` | **Analytics fire after user selects "essential only"** — `trackEvent()` has no consent gate; fires backend tracking calls regardless of `cookieConsent` value in localStorage; GDPR violation | every day | security | broken | 1 day | **P0** |
| 50 | `/map` page | **Googlebot sees only a loading spinner** — `MapClient` is dynamically imported with `ssr: false`; crawler gets `<p>טוענת מפה...</p>` with no producer data; sitemap lists `/map` at priority 0.9; effectively invisible to search | every day | broken feature | broken | 1 week | **P1** |
| 51 | `lib/seo.js` / `[slug]` | **OG image missing for producers with no images** — `ogImage()` returns null; social shares show text-only card with no preview; description fallback works but image doesn't | sometimes | broken trust | ugly | 1 day | **P2** |
| 52 | `WhatsAppButton` / desktop | **WhatsApp deep link on desktop with no app** — `wa.me/...` opens blank page on desktop if WhatsApp Web is not already logged in; no fallback or tooltip | sometimes | broken feature | ugly | 1 day | **P1** |
| 53 | `lib/utils.js` `normalizePhone` | **Landline number silently nullifies WhatsApp CTA** — `normalizePhone` rejects 02/03 landline prefixes with no error; user enters a valid Israeli business number; WA button vanishes with zero explanation | rare | broken feature | broken | 1 day | **P2** |
| 54 | `group_buys` router | **Group buy deadline passes while user fills the form** — `POST /group-buys/{id}/commit` returns 400 on expired deadline; frontend discards user input with no recovery; no client-side countdown warning | rare | broken feature | broken | 1 week | **P2** |
| 55 | `group_buys` router | **Group buy min_participants=0 auto-funds on first commit** — no validation that `min_participants >= 1`; status flips to "funded" immediately; subsequent users see a funded buy with no explanation | rare | broken feature | ugly | 1 day | **P2** |
| 56 | `upload.py` / Cloudinary | **Cloudinary policy rejection returns generic 500** — magic-byte check passes but Cloudinary rejects content; frontend shows undifferentiated error; user retries with same image indefinitely | sometimes | broken feature | broken | 1 day | **P1** |
| 57 | `upload.py` + profile save | **Image uploaded but profile save fails → orphaned Cloudinary asset** — upload succeeds, returns URL; subsequent profile POST fails; image lives in Cloudinary forever with no DB reference; storage cost accumulates | rare | broken feature | broken | 1 week | **P2** |
| 58 | `producer/dashboard` | **Pending producer edits profile with no feedback on whether edits are visible** — status=pending banner appears but no message clarifying "edits won't be visible until approved"; producers assume edits go live | every day | broken trust | ugly | 1 day | **P1** |
| 59 | `lib/api.js` + auth | **JWT 24h expiry with no re-auth prompt** — interceptor clears token on 401 but shows no "session expired" message; user gets silent API failures; no refresh-token mechanism; no login modal | sometimes | broken feature | broken | 1 week | **P1** |
| 60 | `MapClient.jsx` | **Shared map URL loses filter state** — `/map?city=תל אביב&chip=organic` URL shared externally; `MapClient` doesn't read `searchParams`; recipient sees default empty state | sometimes | broken feature | broken | 1 week | **P2** |
| 61 | `LoginPromptModal` / `LocationModal` | **Modal keyboard: Escape closes but focus is not restored** — WCAG 2.1 AA requires focus returns to trigger element on close; currently lands on `<body>`; screen reader users lose navigation context | sometimes | broken feature | ugly | 1 day | **P1** |
| 62 | `lib/producer-import.py` | **Bulk Excel import with Hebrew encoding issues** — `producer_import.py` reads Excel with openpyxl; if file is saved as Windows-1255 (common Israeli Excel export) instead of UTF-8, Hebrew columns produce garbled text; no encoding detection | rare | broken feature | broken | 1 day | **P2** |
| 63 | `ProducerCard` / `[slug]` | **Producer name with Hebrew niqqud (vowel marks) breaks slug generation** — slugify may strip niqqud but leave double dashes or trailing dashes; slug `חֶמְאָה--טְבָעִית` normalises to an ugly URL; two producers with same consonants but different niqqud collide | rare | broken trust | ugly | 1 day | **P2** |
| 64 | `/admin/users` | **Admin expand-favorites crashes when orphaned favorite references deleted producer** — `producer.name` is null for an orphaned row; frontend `.map()` doesn't null-coalesce; admin can't manage that user | rare | broken feature | ugly | 1 day | **P1** |
| 65 | `ProducersClient` pagination | **Stale "X מתוך Y" counter after producer deleted mid-browse** — `initialTotal` set at SSR time; when admin deletes a producer while user browses, `hasMore` flips false but counter says 120 while only 116 exist | sometimes | broken feature | broken | 1 week | **P1** |
| 66 | `search.py` + `producers.py` | **Hebrew niqqud mismatch in ILIKE** — producer name stored as "בָּשָׂר" (with diacritics); user searches "בשר" (without); SQL ILIKE is byte-by-byte; no match; result is empty even though they're the same word | sometimes | broken feature | broken | 1 day | **P2** |
| 67 | `search.py` | **Single Hebrew character causes broad ILIKE or DB timeout** — `min_length` check only strips whitespace; `q="א"` passes validation; `LIKE "%א%"` matches every word containing alef; potential 500 on slow DB | rare | broken feature | ugly | 1 line | **P2** |
| 68 | `producer_import.py` | **Excel import with Windows-1252/Latin1 encoding stores mojibake** — openpyxl reads misencoded file; Hebrew cells become "ш║╡ш║╜"; import reports "50 imported successfully" with silently corrupt names | sometimes | broken trust | broken | 1 week | **P1** |
| 69 | `producer_import.py` | **Duplicate rows in one Excel upload** — import checks DB after each row; if the same producer appears twice, the first insert creates the row and the second skips it; concurrent admin re-imports can bypass the dedupe window | rare | broken trust | ugly | 1 week | **P2** |
| 70 | `admin_extra.py` analytics | **Admin dashboard map renders out-of-bounds coordinates** — `map_points` query filters `lat.isnot(None)` but not `BETWEEN -90 AND 90`; a stale `lat=400` crashes Leaflet on the admin dashboard | rare | broken page | broken | 1 day | **P2** |
| 71 | `experience_notifications.py` | **Approval email not sent when host email is null** — `if not to_email: return` silently skips; host never learns their experience was approved; no WARNING logged to admin-visible surface | rare | broken feature | ugly | 1 day | **P1** |
| 72 | auth / multi-tab | **Tab A logs out; Tab B continues with stale in-memory token** — `localStorage.removeItem` in Tab B not observed by Tab A; Tab A's auth state stays authenticated until next 401; flash of broken authenticated UI | sometimes | broken feature | ugly | 1 week | **P2** |
| 73 | map / mobile iOS | **Pinch-zoom while filter modal open misaligns fixed-position modal** — iOS Safari viewport scale changes after `position:fixed` elements are painted; modal click target drifts from visual position | rare | broken feature | broken | 1 week | **P2** |
| 74 | `lib/friday-mode.js` | **Friday mode flickers during DST transition hour** — Israel DST "spring forward" happens Friday 2 AM; client `Intl` may be 1h off on unsynced Android; server UTC checks don't match client Jerusalem time during transition window | rare | broken feature | ugly | 1 week | **P2** |
| 75 | `analytics.py` `track_producer_view` | **Bot filtering bypassed with spoofed UA → inflated view counts** — `is_bot_user_agent()` matches known bot strings only; curl with Chrome UA passes; IP hash dedupes within one session but load-balancer IP makes all requests hash identical — or attacker rotates IPs | sometimes | broken trust | ugly | 1 week | **P1** |
| 76 | `availability_status` | **Stale vacation badge after return date passes** — no auto-clear logic; producer forgets to toggle back; badge shows "בהפסקה" indefinitely even when producer is actively taking orders; customers think the business is closed | sometimes | broken feature | broken | 1 day | **P1** |
| 77 | `admin_extra.py` settings | **No test endpoint for VAPID/push — misconfiguration invisible to admin** — "Test Services" panel covers Twilio + Cloudinary but not Web Push; missing VAPID keys silently disable push subscriptions with no admin alert | sometimes | broken feature | ugly | 1 day | **P2** |
| 78 | `admin_extra.py` role mgmt | **Admin accidentally demotes self with no recovery path** — backend protects only `SUPER_ADMIN_EMAIL`; no audit log; an admin who demotes themselves loses access with no undo | rare | broken feature | ugly | 1 week | **P2** |

---

## Top 5 P0 — Must Fix Before Launch

These block the launch. All have short fix times.

| # | Edge Case | Rationale |
|---|---|---|
| 1 | ~~**JWT not invalidated on user block**~~ (#1) | ✅ **Fixed in PR #201** — `get_current_user` now checks `is_blocked` inline; remaining exposure is ≤5min (DB-read throttle). No longer a launch blocker. |
| 2 | **Cookie consent not enforced — analytics fire after "essential only"** (#49) | GDPR violation. Every user who opts out of tracking is still tracked. On launch day this is a legal liability, not a UX issue. 1-day fix: gate `trackEvent()` on `cookieConsent` value. |
| 3 | **Double-submit Favorite/Review = HTTP 500** (#5, #6) | Tapping Favorite or submitting Review while network is slow sends a duplicate request → raw DB constraint error → 500 page. This will be the first bug filed by real users on launch day. |
| 4 | **Search query no max length** (#2) | Trivial single-line fix. Without it, anyone can send a 1MB search string written to `search_queries` table on every keystroke (300ms debounce). On a media launch with traffic spike this causes disk exhaustion. |
| 5 | **Admin dashboard crashes on null data** (#3, #4) | Admin can't approve pending producers at launch if the dashboard crashes on incomplete API data. 1-day fix: null guards + default `[]`. |
| 6 | **Reserved slug collision** (#7) | Producer named "about", "admin", "neighbor", "events", "map", etc. gets a permanent 404. The `RESERVED` set must be complete before any producer can register. |

---

## Top 5 P1 — Should Ship Before Launch

High-confidence issues that will surface within the first week. All fixable in 1–2 days.

| # | Edge Case | Rationale |
|---|---|---|
| 1 | **WhatsApp CTA missing for producers without phone** (#13) | Every day frequency. Producers registered before phone was mandatory have no WA button. The primary monetisation/discovery action is silently absent. |
| 2 | **Password policy mismatch: producer vs consumer** (#14) | Producer registration page enforces stricter rules than consumer page with no explanation. First cohort of producers will get rejected on a password they used successfully on the consumer form the day before. |
| 3 | **Account deduplication: Gmail + Google OAuth** (#20) | User registers with `user@gmail.com`, later uses "Sign in with Google" on another device → two accounts, split history. Moderate complexity fix (merge accounts or block duplicate on email match). |
| 4 | **Map blank when producers have null lat/lng** (#11) | `/map` is a primary discovery surface. If a batch of producers has no coordinates, users see a map with tiles and no pins — they'll assume the site is broken. Needs a "no producers in this area" empty state. |
| 5 | **Broken image no fallback** (#16) | Cloudinary assets can be deleted by admin or expire. No `onError` fallback means producer cards and detail pages show broken-image icons on production. Needs an `onError → placeholder` pattern. |
| 6 | **Vacation mode conflict: vacation badge + WhatsApp still active** (#44) | Producer sets vacation but doesn't flip `is_available_today`; customer messages during holiday; trust erodes immediately. |
| 7 | **Missing ANTHROPIC_API_KEY → unsafe home products publish silently** (#45) | Fail-open is intentional but zero admin visibility when moderation is skipped; unreviewed content goes live on launch day. |
| 8 | **SMTP down → contact messages silently lost** (#46) | Returns 200 but email never reaches team; operators miss launch-day feedback. |

---

## Top 5 P2 — Document, Handle Post-Launch

These are real issues but won't block the launch experience materially.

| # | Edge Case | Rationale |
|---|---|---|
| 1 | **GDPR user delete orphans analytics rows** (#27) | Only relevant post-launch when GDPR requests come in. Fix before any EU-user push. |
| 2 | **Heart post-login replay (Phase C)** (#39) | Known gap in HANDOFF. User intent is lost after login redirect. Annoying but not trust-breaking. |
| 3 | **AI moderation prompt injection** (#21) | Claude is robust to naive injections. Real risk only with sophisticated adversarial input. Monitor moderation logs post-launch. |
| 4 | **Past events not filtered** (#29) | Stale events surface in discovery. Add `date >= today` filter once first events expire naturally. |
| 5 | **File size not validated server-side** (#42) | Frontend check is present. Server-side enforcement should be added but isn't an active exploit path for typical users. |

---

## Security Deep Dive

### Threat Model Summary

mehamakor.online is an Israeli community marketplace. The primary threat actors are:
1. **Spam producers** — fake or low-quality listings trying to gain visibility
2. **Disgruntled users** — blocked accounts trying to evade bans
3. **Analytics manipulators** — inflating click counts to gain ranking
4. **Competitive scrapers** — bulk-extracting producer data + contact info

The codebase has solid baseline security: JWT HS256, slowapi rate limiting, IDOR ownership checks, magic-byte file validation, CSP headers. The gaps below are in the second layer.

---

### SEC-01 — JWT Token Revocation (P0)
**Risk:** High. Admin blocks abusive user → 24h active token window.
**Current code:** `auth.py` checks `user.is_blocked` on every request via `get_current_user`. But this DB read is throttled to once per 5 minutes (`last_active_at` debounce). A blocked user has at least 5 minutes before the next DB check revokes their session.
**Recommended fix (fast):** Add a `blocked_user_ids` in-memory set or Redis set. On block, add user ID. `get_current_user` checks the set before the throttled DB read. TTL: 1h.
**Recommended fix (proper):** Shorten access token TTL to 15 minutes + add refresh token endpoint. Industry standard for community sites.

### SEC-02 — OAuth Token Replay (P2)
**Risk:** Low. Apple `identity_token` is a JWT — `_verify_apple_token` validates signature but does not check `exp` claim against wall clock. A stolen Apple token could be replayed.
**Recommended fix:** Add `if time.time() > apple_claims.get("exp", 0): raise 401` before returning the `sub`.

### SEC-03 — Rate Limit Coverage Gap (P1/P2)
**Endpoints missing rate limits as of this audit:**
| Endpoint | Risk |
|---|---|
| `GET /search` | Search DB log spam |
| `POST /producers/:id/follow` | Table bloat |
| `POST /home-products/:id/whatsapp-click` | Analytics inflation |
**All are 1-line fixes:** `@limiter.limit("30/minute")` on each.

### SEC-04 — Input Sanitization (P2)
**AI moderation prompt:** User-controlled `title` + `description` are interpolated into the Claude prompt string. Claude is robust to basic injection attempts, but structured prompting (separate user/system turn with strict JSON schema) is safer than string interpolation. Low urgency — add before MEH-103 (AI moderation v2).
**Admin notes field:** Raw HTML accepted; stored in DB; if admin UI ever renders it as `dangerouslySetInnerHTML`, stored XSS. Fix: server-side `bleach.clean()` or strict text-only constraint.

### SEC-05 — File Upload (P2)
**Current:** Magic-byte validation ✅, Cloudinary folder scoped to producer ID ✅, UUID public_id ✅. One gap: **file size not enforced server-side** — frontend `MAX_FILE_SIZE` check can be stripped by direct API call. Fix: add `if len(await file.read()) > MAX_FILE_SIZE: raise 413` before Cloudinary upload.

### SEC-06 — IDOR Audit Result
All producer ownership checks follow the pattern `if resource.user_id != user.id and user.role != "admin": raise 403`. This is correct and consistent across `home_products.py`, `producer_me.py`, `reviews.py`, `upload.py`. No IDOR vulnerabilities found in normal operation. Risk only materialises if JWT secret is leaked (which would compromise all tokens anyway).

### SEC-07 — Secrets in Code
Grep result: no hardcoded secrets found. All keys read from env via `config.py` Settings class. `JWT_SECRET_KEY` raises on missing value (no insecure default). ✅

### SEC-08 — CORS
`main.py` reads `CORS_ORIGINS` from env. Default allows localhost + mehamakor.online + staging.mehamakor.online. No wildcard `*`. ✅

---

## Recommended Linear Issues to Open

Priority order — open these after this audit PR merges:

| # | Title | Priority | Fix time |
|---|---|---|---|
| MEH-143 | `fix(auth): invalidate JWT on user block — token blacklist or 15min TTL` | P0 | 1 day |
| MEH-144 | `fix(api): max_length=200 on search_q query param` | P0 | 1 line |
| MEH-145 | `fix(api): idempotent favorite + review endpoints — INSERT ON CONFLICT` | P0 | 1 day |
| MEH-146 | `fix(admin): null guard on pending_producers + monthly_producers in dashboard` | P0 | 1 day |
| MEH-147 | `fix(routing): complete RESERVED slug set to include all app routes` | P0 | 1 day |
| MEH-148 | `fix(producers): WhatsApp CTA fallback for phone-null legacy records` | P1 | 1 day |
| MEH-149 | `fix(auth): unify password validation policy between consumer + producer registration` | P1 | 1 day |
| MEH-150 | `fix(auth): block Gmail/Google OAuth duplicate account merge on matching email` | P1 | 1 week |
| MEH-151 | `fix(images): add onError placeholder to all producer images (card + detail + map)` | P1 | 1 day |
| MEH-152 | `fix(upload): enforce MAX_FILE_SIZE server-side before Cloudinary upload` | P2 | 1 day |
| MEH-153 | `fix(availability): force is_available_today=false when vacation mode set` | P1 | 1 day |
| MEH-154 | `fix(ops): admin alert when ANTHROPIC_API_KEY missing (moderation bypassed)` | P1 | 1 day |
| MEH-155 | `fix(contact): admin dashboard indicator + Slack fallback when SMTP is down` | P1 | 1 day |
| MEH-156 | `fix(gdpr): gate trackEvent() on cookieConsent value — no tracking after essential-only opt-out` | P0 | 1 day |
| MEH-157 | `fix(auth): JWT expiry re-auth prompt — login modal on 401 + session-expired toast` | P1 | 1 week |
| MEH-158 | `fix(a11y): restore focus to trigger element on modal close (WCAG 2.1 AA)` | P1 | 1 day |
| MEH-159 | `fix(upload): translate Cloudinary policy-rejection error to Hebrew message` | P1 | 1 day |
| MEH-160 | `fix(seo): fallback OG image for producers with no photos` | P2 | 1 day |
| MEH-161 | `fix(search): min_length=2 after strip + Unicode normalize ILIKE for niqqud` | P2 | 1 day |
| MEH-162 | `fix(import): detect non-UTF-8 Excel files — warn admin, reject corrupt Hebrew` | P1 | 1 week |
| MEH-163 | `fix(availability): auto-clear vacation status when availability_return_date passes` | P1 | 1 day |
| MEH-164 | `fix(analytics): rate-limit producer view endpoint by IP to prevent count inflation` | P1 | 1 day |

---

## Template Recommendation

| Issue type | Linear template |
|---|---|
| Security (P0/P1) | **Bug** — severity: critical/high, label: `security` |
| Race condition / idempotency | **Bug** — severity: high, label: `reliability` |
| UI empty-state / fallback | **Bug** — severity: medium, label: `ux` |
| GDPR / data integrity | **Bug** — label: `compliance` |
| Rate limit additions | **Chore** — no severity label needed |
| Phase C features (heart replay, etc.) | **Feature** — milestone: v1.1 |

---

*Last updated: 2026-04-21. 78 edge cases total across 3 research passes. Run another audit pass after MEH-103 (AI moderation v2) and MEH-130 (full roadmap) land — both add new surfaces. Linear issues to open: MEH-143–MEH-164 (22 issues).*
