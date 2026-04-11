# מהמקור — Manual Testing Checklist

> Last updated: אפריל 2026
> Run this checklist before every production release. Items here cannot be
> covered by the pytest + Playwright suite — they need real eyes on a real
> device.

How to use this doc:
- Tick each box as you pass it. Leave it unticked (or add a note) if it fails.
- "Desktop" = Chrome + Firefox on macOS / Windows at 1440px width.
- "Mobile" = real iPhone (Safari) + real Android (Chrome), or DevTools
  device mode as a fallback.
- When a step says "live backend", run against the staging environment
  (`https://staging.mehamakor.online`), not localhost.

---

## 1. Core pages — visual + functional sanity

### 1.1 Homepage `/`
- [ ] **Hero renders with parallax** — scroll slowly; background image should
      move slower than the text. *Pass:* no gap at top/bottom of image.
- [ ] **Social Proof Bar shows real counts** — the `{X} יצרנים · {Y} קטגוריות`
      numbers are non-zero and match `/admin/analytics`.
- [ ] **Category Grid (6 cards)** — hover scales image ~6%; click routes to
      the map with that category selected.
- [ ] **Producer grid** — at least 12 approved producers visible; each card
      shows image, name, city, top product, price, badges.
- [ ] **"מהמטבח של השכן" section** — grid of home listings appears under the
      producers.
- [ ] **No layout shift** — Lighthouse CLS < 0.1. Pull up DevTools →
      Performance → Core Web Vitals while loading.

### 1.2 Map `/map`
- [ ] **Leaflet map loads** — no gray tiles; Israel is centered.
- [ ] **Pins match grid** — number of visible pins = number of producers in
      the side grid.
- [ ] **Click on a pin opens popup** with name + top product + "צפה בעמוד".
- [ ] **Click on a grid card** flies to pin + opens popup (dual binding).
- [ ] **Category filter** narrows both grid and pins simultaneously.
- [ ] **City filter** narrows both grid and pins simultaneously.
- [ ] **Distance filter** (10/25/50km) shrinks the pin cluster around user
      location (requires granting geolocation).

### 1.3 Events & Experiences `/events`
- [ ] **Approved events load** — only events with `status=approved` show.
- [ ] **Type filter** — clicking "אירועים" / "חוויות" narrows results.
- [ ] **Category dropdown** — pick "בישול" → only בישול events remain.
- [ ] **City dropdown** — lists only cities that currently have events.
- [ ] **"נקה סינון" clears all three** filters back to "הכל".
- [ ] **"נשארו X מקומות" badge** — visible on cards where
      `max_participants - participants_count ≤ 5` and > 0.
- [ ] **"אזל" badge** — visible when `spots_left === 0`; card is still
      clickable but WhatsApp CTA is hidden.
- [ ] **"🔁 חוזר" badge** — appears on recurring events.
- [ ] **Empty state copy** — filter to an empty combo → see
      "לא מצאנו אירועים שתואמים לסינון — עדיין 🌱".

### 1.4 Event detail `/events/:id`
- [ ] **Gallery swipes** on mobile; thumbnails on desktop change main image.
- [ ] **Sidebar shows** price, מועד, מיקום, מקומות, מארגן.
- [ ] **"פני למארגן ב-WhatsApp"** opens `wa.me` in a new tab with a
      pre-filled message. Hidden when status ≠ approved OR spots_left === 0.
- [ ] **Pending banner** — after submitting a new event, the detail page
      shows a green "האירוע נשלח לאישור!" banner at top.
- [ ] **Changes-requested banner** — after admin uses "בקש שינויים", host
      sees the orange banner with admin's feedback text verbatim.

### 1.5 `/neighbor` (מהמטבח של השכן)
> Directory layout: homepage section is rendered from `home_products` API;
> there is no dedicated `/neighbor` route in v1. Verify from the homepage
> section and the individual `/producer/:id` pages instead.
- [ ] **Grid loads** home listings from `GET /home-products`.
- [ ] **WhatsApp click** on a card records in `home_product_whatsapp_clicks`
      table (check DB or admin analytics).
- [ ] **Rating link** — 24h after clicking, Twilio dispatcher sends a rating
      prompt; clicking the link lets you rate 1-5 stars + comment.

### 1.6 About `/about`
- [ ] **Hero image + quote** load without flicker.
- [ ] **3-column values section** displays all 3 cards.
- [ ] **Founder story section** loads placeholder image + text.
- [ ] **Contact form** — submit with valid fields → see
      "תודה! נחזור אליך בקרוב 🌿"; admin receives email.
- [ ] **Contact form validation** — submit empty → inline errors, no POST.

### 1.7 Admin `/admin`
- [ ] **Login gate** — log out, navigate to `/admin` → redirect to `/login`.
- [ ] **Consumer cannot enter** — log in as a non-admin → `/admin` returns
      403 UI.
- [ ] **Dashboard** — stat cards show correct counts (cross-check with
      `/admin/analytics`).
- [ ] **Sidebar nav** — all 8 items visible and active state highlights the
      current page.

### 1.8 Admin: Events `/admin/events`
- [ ] **Tabs render counts** — "ממתינים" tab is default and shows a
      count badge when pending > 0 on other tabs.
- [ ] **Approve** — click on a pending row → status flips to approved,
      host receives email, row moves to "מאושרים" tab on reload.
- [ ] **Request changes** — click "שינויים" → modal opens → cancel button
      closes modal without saving.
- [ ] **Request changes (submit)** — fill feedback, submit → status flips
      to `changes_requested`, host email sent, modal closes, row reloads.
- [ ] **Reject with reason** — click "דחה" → modal requires reason →
      submit → status flips to `rejected`.
- [ ] **Expand row** — click on a title → expanded panel shows full
      description + Claude moderation flags (if ANTHROPIC_API_KEY set).
- [ ] **"צפה"** link opens `/events/:id` in a new tab.
- [ ] **"דף ציבורי"** link (top-right) opens `/events` in a new tab.

---

## 2. Mobile + RTL layout

### 2.1 Mobile Safari (iPhone 14 or DevTools 375×812)
- [ ] **Header** — logo on right, hamburger on left; tapping hamburger
      slides the menu from the top.
- [ ] **Bottom Navigation** — 4 tabs visible at the bottom, active tab
      highlighted, menu behind.
- [ ] **Homepage hero** — text is centered and readable against the image
      at 375px width, no horizontal scroll.
- [ ] **Category grid** — 1 column on mobile, 2 on tablet, 3 on desktop.
- [ ] **Producer cards** — 1 column; image 200px tall; price visible.
- [ ] **Event cards** — 1 column; badges don't wrap off-screen.
- [ ] **RTL direction** — `html[dir="rtl"]` is set; text flows right-to-left;
      WhatsApp/phone icons sit on the left of the CTA.
- [ ] **Admin sidebar on mobile** — becomes a horizontally scrollable strip
      at the top, not a hamburger.
- [ ] **Fixed positioning** — no element sits above the bottom nav
      (`pb-16` body padding is applied).

### 2.2 Forms on iPhone — zoom issue
iOS Safari auto-zooms when you focus an input with `font-size < 16px`.
- [ ] **Login form** — tap email field; page must NOT zoom.
- [ ] **Producer registration form** — tap any field; no zoom.
- [ ] **Event submission `/events/new`** — tap title, description, date,
      price, participants; no zoom on any.
- [ ] **Contact form in `/about`** — same check.

*Pass:* every text input uses `font-size: 16px` or larger.
*Fix if failing:* add `font-size: 16px;` to the input in `globals.css`.

### 2.3 Hebrew text rendering
- [ ] **Frank Ruhl Libre loaded** — headings use the serif font.
      Check DevTools → Network → "Frank+Ruhl+Libre" font is 200 OK.
- [ ] **DM Sans loaded** — body text uses DM Sans.
- [ ] **No squared boxes** — no missing glyphs in ניקוד or final letters
      (ם, ן, ץ, ף, ך).
- [ ] **Line height feels loose** — body text `line-height ≈ 1.6`;
      headings `≈ 1.15`.
- [ ] **Mixed LTR/RTL** — English brand names (Grass Fed, Organic) stay
      left-to-right inside RTL paragraphs.
- [ ] **Emoji alignment** — 🌿 🥩 🥛 render inline without shifting baseline.

---

## 3. Auth + user flows

### 3.1 Google OAuth
- [ ] **Button renders** on `/login` and `/register`.
- [ ] **Popup opens Google chooser** when clicked.
- [ ] **New user creation** — first-time Google account creates a consumer
      user in the `users` table with `google_id` populated.
- [ ] **Returning user login** — same Google account resolves to the
      existing row, not a duplicate.
- [ ] **Token persists** — after reload, user stays logged in
      (`localStorage.token`).
- [ ] **Logout clears token** — click logout → token and user keys removed
      from localStorage.

### 3.2 Producer registration flow `/register/producer`
- [ ] **Step 1: user account** — email, name, password, city, phone.
      Duplicate email shows inline error, no double-submit.
- [ ] **Step 2: producer details** — name, description, city, categories
      (multi-select), delivery areas.
- [ ] **Step 3: images** — 3 image slots for free plan, upload via
      Cloudinary preview working.
- [ ] **Submission** — creates `producer` row with `status=pending` and
      links the user.
- [ ] **"ממתין לאישור" banner** — after login, `/producer/me` shows a
      pending message with green leaf emoji.
- [ ] **Admin approval email** — admin inbox receives "עסק חדש…" email
      AND WhatsApp via Twilio (check `admin_whatsapp_to` configured).
- [ ] **After admin approval** — refresh `/producer/me` → producer now
      editable + publicly visible on the map.

### 3.3 Event submission + approval flow `/events/new`
- [ ] **Unauthenticated** — navigating to `/events/new` bounces to
      `/login?next=/events/new`.
- [ ] **Required fields enforced** — submit with empty title → inline
      error, no POST.
- [ ] **Short title rejected** — submit with 3-char title → server returns
      422, inline error shown.
- [ ] **Short description rejected** — same for < 20 chars.
- [ ] **At least one image required** — client validation enforces.
- [ ] **Success redirect** — `201` response → redirect to
      `/events/:id?pending=1` and green banner visible.
- [ ] **Admin email** — admin inbox receives "אירוע חדש ממתין לאישור"
      with host name + city in the body.
- [ ] **Admin WhatsApp** — `admin_whatsapp_to` receives a summary line.
- [ ] **Host approval email** — after admin approves in `/admin/events`,
      host receives "האירוע שלך אושר! 🌿" with link to the event.
- [ ] **Host changes-requested email** — after admin requests changes,
      host receives email with the exact feedback text.
- [ ] **Host rejection email** — after admin rejects with a reason, host
      receives email containing the reason.
- [ ] **Re-edit flips to pending** — host re-opens event, edits
      description → event goes back to `pending`, admin email is re-sent.
- [ ] **Claude pre-moderation** — with `ANTHROPIC_API_KEY` set, admin sees
      flags/suggestions inside the expanded row; without the key, sees
      `not_checked: …` and flow still works.

---

## 4. Integrations

### 4.1 Image upload (Cloudinary)
- [ ] **Upload widget opens** from producer profile edit and event form.
- [ ] **Progress bar** runs during upload.
- [ ] **URL returned** is a `res.cloudinary.com/…` URL.
- [ ] **Image appears in gallery** within 1s of upload completion.
- [ ] **Delete image** — remove button on an existing image removes it from
      the `images` array (verify with DevTools → Network → PUT body).
- [ ] **Free-plan limit** — producer with `plan=free` cannot add a 4th
      image; sees upgrade prompt.

### 4.2 WhatsApp links
- [ ] **Producer card WhatsApp icon** — opens `https://wa.me/<phone>`
      with the country code prefix (972).
- [ ] **Home listing WhatsApp button** — opens `wa.me/<phone>?text=…`
      with a pre-filled "היי, ראיתי את המודעה שלך…" message.
- [ ] **Event WhatsApp CTA** — opens `wa.me/?text=…` with
      "היי! אני רוצה להירשם ל-<title>" pre-filled.
- [ ] **Click is logged** — DB row added to `home_product_whatsapp_clicks`
      for each click on a home listing (needed for 24h rating dispatch).

### 4.3 Email notifications (SMTP)
Run with real SMTP configured (not console logging).
- [ ] **Newsletter signup confirmation** — POST email to `/api/newsletter`
      → receives welcome mail.
- [ ] **Contact form** — POST through `/about` form → admin receives the
      message.
- [ ] **Producer approved** — after `/admin/producers/:id/approve`, the
      producer user receives a mail with the public profile URL.
- [ ] **Producer rejected** — reject mail includes the admin's reason.
- [ ] **Event: 4 mails land in the right inboxes** (see 3.3 above).
- [ ] **Hebrew body renders** — open a sent email in Gmail/Outlook on
      mobile + desktop; Hebrew is right-aligned, no broken glyphs.

### 4.4 Chat widget (if enabled via admin settings)
- [ ] **Widget loads** on the homepage bottom-right.
- [ ] **Does not cover Bottom Nav on mobile** — widget sits above tab bar.
- [ ] **Opens on click** — input box + history visible.
- [ ] **Sending a message** delivers to the admin inbox (or Claude bot
      in v2).
- [ ] **Hidden when disabled** in `/admin/settings`.

### 4.5 Accessibility widget
- [ ] **A11y button visible** on all pages (usually bottom-left).
- [ ] **Options work:** font size +/−, high contrast, underline links,
      grayscale, highlight headings.
- [ ] **Settings persist** across page loads (localStorage).
- [ ] **Reset to defaults** button restores original styles.
- [ ] **Keyboard accessible** — can tab into the widget and toggle options
      with Space/Enter.

### 4.6 Cookies banner
- [ ] **Banner appears on first visit** — bottom of screen, explains
      essential vs analytics cookies.
- [ ] **"אשר הכל" accepts all** — banner disappears, tracking loads.
- [ ] **"רק חיוניות" accepts essentials only** — banner disappears, no
      analytics JS is injected.
- [ ] **Choice persists** across pages (localStorage / cookie).
- [ ] **Decision revocable** — link in footer lets user change choice.

---

## 5. Accessibility + performance

- [ ] **Lighthouse A11y ≥ 95** on `/`, `/map`, `/events`, `/producer/:id`.
- [ ] **Color contrast** — primary on background passes WCAG AA
      (≥ 4.5:1 for body text).
- [ ] **Alt text** — every `<Image>` has a non-empty `alt`.
- [ ] **Focus visible** — tab through the homepage; every focusable
      element shows a visible ring.
- [ ] **Skip-to-content link** — first tab stop jumps past the header.
- [ ] **Lighthouse Perf mobile ≥ 80** on `/` and `/events`.
- [ ] **LCP < 2.5s** on a throttled 4G connection.

---

## 6. Release smoke test (5 min version)

Run this every time before pushing to production:

- [ ] Homepage loads on desktop + iPhone.
- [ ] `/events` lists at least one approved event with all filters working.
- [ ] Submit a new event as a consumer → reaches admin queue.
- [ ] Approve it from `/admin/events` → appears publicly on `/events`.
- [ ] Map loads with pins on desktop + mobile.
- [ ] Login with Google still works.
- [ ] No red errors in browser console on any page.
- [ ] `/api/stats` returns sensible counts
      (`curl https://mehamakor.online/api/stats`).

---

## Notes on scope

- "Chat widget", "Accessibility widget", "Cookies banner" are listed here
  because the brief asked for them, but as of אפריל 2026 only the
  accessibility widget is in the codebase. Leave the others unchecked
  until they ship.
- `/neighbor` is rendered as a section on the homepage, not a standalone
  route. The checks in 1.5 apply to that section.
- Playwright E2E specs already cover a subset of these flows
  (`tests/test_e2e.spec.ts`) — this file exists for the human-only parts
  like font rendering, RTL feel, iOS zoom, Cloudinary upload, and real
  SMTP/WhatsApp delivery.
