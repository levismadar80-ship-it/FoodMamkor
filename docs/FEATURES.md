# מהמקור — Features

> Single source of truth for **what's shipped** and **what's planned**.
> Status reflects what's currently on `main`. For the planning view
> (priorities, sequencing, "after launch + 10 producers"), see
> [ROADMAP.md](./ROADMAP.md).

| Status | Meaning |
|---|---|
| ✅ | Shipped on `main`, live on mehamakor.online |
| 🚧 | In progress on `staging` or a `feature/*` branch |
| 📋 | Planned, not started |
| 💡 | Idea, no commitment |

The **Version** column tells you which release a feature belongs to (v1, v2,
v3). Status is binary (shipped or not); use the Version column to skim "what's
left in v1" vs "what's planned for v2".

---

## v1 — MVP (live)

### Discovery & browse

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | Homepage hero with search pill (Ken Burns background) | `frontend/app/page.js` |
| ✅ | v1 | Category grid with hand-drawn line-art icons (6 categories) | `frontend/components/CategoryIcons.jsx` |
| ✅ | v1 | Marquee strip between sections (paused on hover, reduced-motion safe) | `frontend/app/page.js` |
| ✅ | v1 | Producers grid with skeleton loaders | `frontend/components/ProducerCard.jsx`, `Skeleton.jsx` |
| ✅ | v1 | Map (`/map`) — Leaflet + clustering + category-colored markers | `frontend/app/map/MapClient.jsx`, `MapComponent.jsx` |
| ✅ | v1 | "חפשי באזור זה" (search-this-area) — Airbnb pattern, committed bounds | `MapClient.jsx` |
| ✅ | v1 | "קרוב אלי" (geolocation) — single re-used marker, no leak | `MapComponent.jsx` |
| ✅ | v1 | Map ↔ list hover sync (bidirectional) | `MapClient.jsx` |
| ✅ | v1 | Mobile bottom-sheet for selected producer | `MapClient.jsx` |
| ✅ | v1 | Category legend = filter (toggleable) | `MapClient.jsx` |
| ✅ | v1 | Producer detail page with sticky contact sidebar | `frontend/app/[slug]/page.js`, `producer/[id]/ProducerDetail.jsx` |
| ✅ | v1 | Producer detail — mobile column order fixed (name above fold), inline mobile CTA, IO StickyContactBar | `producer/[id]/ProducerDetail.jsx` |
| ✅ | v1 | Producer detail — short_description subtitle + contact_name micro-line | `producer/[id]/ProducerDetail.jsx` |
| ✅ | v1 | Producer detail — highlights strip (grass_fed/organic/delivery/kosher chips) | `producer/[id]/ProducerDetail.jsx` |
| ✅ | v1 | Producer detail — vacation banner + sidebar dim + sticky bar vacation state | `producer/[id]/ProducerDetail.jsx` |
| ✅ | v1 | ImageGallery compact placeholder (emoji+initials, h-120px) | `frontend/components/ImageGallery.jsx` |
| ✅ | v1 | Producer reviews + star ratings (1 review per user, upsert) | `frontend/components/ProducerReviews.jsx` |
| ✅ | v1 | Image gallery with keyboard nav + 44px touch targets | `frontend/components/ImageGallery.jsx` |
| ✅ | v1 | Slug-based producer URLs (`/cow-farm-name`) | `frontend/app/[slug]/page.js` |
| ✅ | v1 | "מהמטבח של השכן" — dedicated `/neighbor` page | `frontend/app/neighbor/NeighborClient.jsx` |
| ✅ | v1 | Events: list, filter, detail (`/events`, `/events/:id`) | `frontend/app/events/` |
| ✅ | v1 | Upcoming events preview on homepage (3 cards) | `frontend/app/page.js` |
| ✅ | v1 | Community experiences: list, submit, detail (`/experiences`, `/experiences/new`, `/experiences/:id`) | `frontend/app/experiences/` |
| ✅ | v1 | Unified browse tab bar on `/events` (אירועים בחוות / חוויות וסדנאות) | `frontend/app/events/EventsClient.jsx` |
| ✅ | v1 | About page (`/about`) with founder story + values + contact form | `frontend/app/about/AboutClient.jsx` |

### Auth & accounts

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | Email + password registration with feminine-voice validation | `frontend/app/register/page.js` |
| ✅ | v1 | Multi-step producer registration (3 steps) | `frontend/app/register/producer/page.js` |
| ✅ | v1 | Google OAuth | `frontend/components/GoogleAuthButton.jsx` |
| ✅ | v1 | Apple OAuth | `frontend/components/AppleAuthButton.jsx` |
| ✅ | v1 | JWT auth (24h expiry, secret from env, never default) | `backend/app/auth.py` |
| ✅ | v1 | DELETE /users/me (App Store compliance) | `backend/app/routers/auth.py` |
| ✅ | v1 | Welcome email (consumer + producer flavors, fail-open) | `backend/app/routers/auth.py` |

### Producer-only

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | Producer dashboard (`/producer/dashboard`) — availability + favorites + quick links | `frontend/app/producer/dashboard/page.js` |
| ✅ | v1 | Toggle "available today" | `backend/app/routers/producer_me.py` |
| ✅ | v1 | Add event from dashboard | `frontend/app/producer/dashboard/events/new/page.js` |
| ✅ | v1 | Follow / unfollow producers (`producer_followers` table) | `backend/app/routers/producers.py`, `frontend/components/FollowButton.jsx` |

### Home cooks (`/neighbor`)

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | Free posting (no producer approval required) | `backend/app/routers/home_products.py` |
| ✅ | v1 | Hybrid AI moderation: APPROVED / FLAGGED / REJECTED | `backend/app/services/home_product_moderation.py` |
| ✅ | v1 | Real-time validation while typing (debounced 1.5s) | `frontend/components/HomeProductForm.jsx` |
| ✅ | v1 | Experiences moderation: Claude Haiku pre-check + admin approval gate | `backend/app/services/experience_moderation.py`, `backend/app/routers/admin_experiences.py` |
| ✅ | v1 | `/admin/experiences` queue with tabs, approve / request-changes / reject + feedback modal | `frontend/app/admin/experiences/page.js` |
| ✅ | v1 | Address autocomplete via Nominatim (street + house number) | `frontend/components/AddressSearch.jsx` |
| ✅ | v1 | Trust badges (organic, kosher, storage, category) | `frontend/components/HomeProductCard.jsx` |
| ✅ | v1 | Private street/zip stored server-side, only city/neighborhood shown publicly | `backend/app/models/models.py` |
| ✅ | v1 | "🔍 בבדיקה" badge for FLAGGED listings | `HomeProductCard.jsx` |

### AI features

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | AI Q&A chat widget (Hebrew, claude-haiku-4-5, desktop only) | `backend/app/routers/chat.py`, `frontend/components/ChatWidget.jsx` |
| ✅ | v1 | Auto-moderation for `/neighbor` listings (Anthropic, fail-open) | `backend/app/services/home_product_moderation.py` |
| 📋 | v2 | AI search agent — natural-language search ("בשר grass-fed בחיפה") | [ROADMAP.md](./ROADMAP.md) |
| 📋 | v2 | Migrate chat widget to `claude-agent-sdk` with tool use | [ROADMAP.md](./ROADMAP.md) |
| 📋 | v2 | Migrate moderation pipeline to agent loop with follow-up tools | [ROADMAP.md](./ROADMAP.md) |

### Admin (`/admin`)

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | Dashboard with 4 stat cards | `frontend/app/admin/page.js` |
| ✅ | v1 | Producers management — search, approve, edit | `frontend/app/admin/producers/` |
| ✅ | v1 | Users management | `frontend/app/admin/users/` |
| ✅ | v1 | Reports — 3 tabs (user reports / FLAGGED home-products / hidden) | `frontend/app/admin/reports/` |
| ✅ | v1 | Content / static pages | `frontend/app/admin/content/` |
| ✅ | v1 | Analytics | `frontend/app/admin/analytics/` |
| ✅ | v1 | Settings | `frontend/app/admin/settings/` |
| ✅ | v1 | Admin seed via `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars | `backend/seed_data.py` |

Detail: [ADMIN.md](./ADMIN.md)

### Analytics (feature/producer-analytics, April 2026)

Shipped as one atomic PR. No new JS dependencies — charts are inline
SVG following the admin dashboard precedent. Privacy-minimized: IPs are
SHA-256 hashed with a rotating salt (the JWT secret), raw IP is never
stored.

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | `producer_page_views` + `producer_whatsapp_clicks` models + auto-migration | `backend/app/models/models.py`, `backend/app/main.py::_migrate_columns` |
| ✅ | v1 | View tracking on `GET /producers/{id}` — best-effort, bot UA filter, SHA-256 IP hash, city from authed viewer, referrer allowlist | `backend/app/services/analytics.py::track_producer_view`, `backend/app/routers/producers.py::get_producer` |
| ✅ | v1 | `POST /producers/{id}/whatsapp-click` — anonymous, rate-limited 10/min per IP | `backend/app/routers/producers.py::record_whatsapp_click` |
| ✅ | v1 | Fire-and-forget `navigator.sendBeacon` from the WhatsApp CTA (producer detail page + `WhatsAppButton.jsx`) | `frontend/app/producer/[id]/ProducerDetail.jsx`, `frontend/components/WhatsAppButton.jsx` |
| ✅ | v1 | `?from=search` / `?from=home` referrer threading through `ProducerCard` (homepage grid, "newest" strip, /map) | `frontend/components/ProducerCard.jsx`, `frontend/app/page.js`, `frontend/app/map/MapClient.jsx` |
| ✅ | v1 | `GET /producers/me/analytics` — 7d/30d/total windows for views/search/whatsapp, follower delta, avg rating, home products count, 30-day zero-filled views_by_day, top 5 cities | `backend/app/routers/producer_me.py::producer_analytics` |
| ✅ | v1 | Producer dashboard (`/producer/dashboard`) — 6 stat cards + inline SVG line chart + inline SVG horizontal bar chart + 3 quick links + availability hero | `frontend/app/producer/dashboard/page.js` |
| ✅ | v1 | Admin dashboard extension — 4 secondary stat cards (weekly deltas + events + experiences) + DAU 30d line chart + top 10 cities + server health panel | `frontend/app/admin/page.js`, `backend/app/routers/admin_extra.py::get_dashboard` |
| ✅ | v1 | `pending_moderation_count` badge on admin sidebar — sums pending producers + open reports + flagged home products + pending experiences | `frontend/app/admin/layout.js` |
| ✅ | v1 | `users.last_active_at` + throttled (5 min) bump inside `get_current_user` — feeds the DAU chart | `backend/app/auth.py`, `backend/app/models/models.py::User.last_active_at` |
| ✅ | v1 | Sliding-window request metrics (per-process, 1-hour deque) for admin `server_health` panel | `backend/app/services/analytics.py::record_request / server_health`, `backend/app/main.py::record_request_metrics` middleware |
| ✅ | v1 | 22 TDD pytest cases covering tracking, endpoints, windows, aggregations, moderation sum | `tests/test_analytics.py` |

### Cross-cutting infra

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | PWA + service worker + manifest | `frontend/public/manifest.json`, `next-pwa` |
| ✅ | v1 | Responsive bottom navigation (5 tabs) | `frontend/components/BottomNav.jsx` |
| ✅ | v1 | Toast system (`role="status" aria-live="polite"`) | `frontend/lib/toast.js`, `Toaster.jsx` |
| ✅ | v1 | Cookie banner | `frontend/components/CookieBanner.jsx` |
| ✅ | v1 | Open Graph + Twitter metadata on all pages | `frontend/app/layout.js` + each `page.js` |
| ✅ | v1 | Microsoft Clarity analytics (opt-in via env var) | `frontend/app/layout.js` |
| ✅ | v1 | Sentry error monitoring scaffolding (opt-in via env var) | `frontend/sentry.*.config.js` |
| ✅ | v1 | Cloudinary `f_auto,q_auto` injection on all images | `frontend/lib/cloudinary.js` |
| ✅ | v1 | Print stylesheet | `frontend/app/globals.css` |
| ✅ | v1 | RTL Hebrew throughout, feminine voice (locked micro-copy in [DESIGN.md](./DESIGN.md)) | — |
| ✅ | v1 | All images have alt text + lazy loading | — |
| ✅ | v1 | `prefers-reduced-motion` honored across Ken Burns / marquee / cursor / counter | — |

### Legal compliance (Israel, April 2026)

Shipped in PR #23 + #24 + #31 as the legally-required surface for an Israeli
directory platform. All four pages are linked from the Footer's שקיפות ואמון
column and use staging's `SECTIONS`-array layout with `font-headline` + `site-text` tokens.

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | `/privacy` — Privacy Policy aligned with חוק הגנת הפרטיות amendment 13 (2025); data categories, third parties (Cloudinary/Google/Anthropic/Twilio/Vercel/Railway), user rights, cookies, 18+, contact | `frontend/app/privacy/page.js` |
| ✅ | v1 | `/terms` — Terms of Service: directory-only platform; seller licensing responsibility under חוק רישוי עסקים התשכ״ח–1968; 18+ requirement; violation reporting; Israeli governing law + Tel Aviv jurisdiction | `frontend/app/terms/page.js` |
| ✅ | v1 | `/contact` — public contact form with SMTP delivery to `CONTACT_EMAIL` (falls back to `ADMIN_EMAIL`), fail-open to `contact_messages` DB row, 3-business-day SLA copy | `frontend/app/contact/page.js`, `backend/app/routers/marketing.py::submit_contact` |
| ✅ | v1 | `/accessibility` — Israeli Standard ת״י 5568 AA / WCAG 2.1 AA statement with an accessibility coordinator email | `frontend/app/accessibility/page.js` |
| ✅ | v1 | `DirectoryDisclaimer` — shared "פלטפורמת דירקטורי בלבד. האחריות על המוצרים ורישוי המוכר חלה על המוכר בלבד." note, rendered on every producer detail page and inline on every `HomeProductCard` | `frontend/components/DirectoryDisclaimer.jsx` |
| ✅ | v1 | Cookie banner — two-button ("אני מסכימה" / "רק הכרחיים") consent dialog, persists to `localStorage.cookies_accepted`, SSR-safe (no flash for returning users) | `frontend/components/CookieBanner.jsx` |
| ✅ | v1 | Producer registration required checkboxes — declaration of business-licensing compliance under חוק רישוי עסקים התשכ״ח–1968 + explicit terms+privacy consent, submit disabled until both are checked | `frontend/app/register/producer/page.js` |
| ✅ | v1 | Consumer registration terms+privacy checkbox — links both `/terms` and `/privacy` | `frontend/app/register/page.js` |

### Marketing & growth

| Status | Version | Feature | Where |
|---|---|---|---|
| ✅ | v1 | Newsletter signup (footer) — POST /newsletter, rate-limited 5/hour per IP | `backend/app/routers/marketing.py` |
| ✅ | v1 | Contact form — standalone `/contact` page (migrated out of `/about`), POST /contact persists to `contact_messages` + sends SMTP email to CONTACT_EMAIL, fail-open if SMTP unconfigured, rate-limited 5/hour per IP, 12 pytest cases | `frontend/app/contact/page.js`, `backend/app/routers/marketing.py::submit_contact`, `tests/test_api.py::TestContact` |
| ✅ | v1 | WhatsApp share button on every producer page (viral loop) | `frontend/components/WhatsAppShareButton.jsx` |
| ✅ | v1 | WhatsApp click tracking on home products | `home_products.py` |
| ✅ | v1 | Social proof bar with `AnimatedCounter` | `frontend/components/AnimatedCounter.jsx` |
| ✅ | v1 | Sitemap.xml (auto-generated, includes producer slugs) | `frontend/app/sitemap.js` |
| ✅ | v1 | robots.txt | `frontend/public/robots.txt` |

---

## v1 — open work (still ahead of launch)

> 🚧 **Branch protection on GitHub UI still pending.** The `main` and `staging`
> protection rules documented in [DEPLOYMENT.md](./DEPLOYMENT.md) §C are
> step-by-step manual setup — they cannot be configured via the codebase. Until
> they're added in the GitHub UI, the `feature/* → staging → main` workflow is
> documented but not enforced. **Do this before launch.**

| Status | Version | Feature | Notes |
|---|---|---|---|
| 🚧 | v1 | GitHub branch protection rules (`main`, `staging`) | Manual UI setup — see [DEPLOYMENT.md](./DEPLOYMENT.md) §C |
| 🚧 | v1 | Real Lighthouse run against production domain | Sandbox can't run Chrome — must run from a dev machine. See [TESTING.md](./TESTING.md) |
| 🚧 | v1 | Railway `staging` environment + Vercel `staging.mehamakor.online` domain | Manual UI setup — see [DEPLOYMENT.md](./DEPLOYMENT.md) §A + §B |
| 📋 | v1 | User testing (5 consumers + 3 producers per [LAUNCH_CHECKLIST.md](./archive/LAUNCH_CHECKLIST.md)) | Manual, not in scope for code |
| 📋 | v1 | Real producer image of ספיר for `/about` | Currently a `<Leaf>` placeholder |
| 📋 | v1 | Sentry DSN hooked up in production | Scaffolding ready, just needs the env var |
| 📋 | v1 | `whatsapp_clicks_week` real tracking on producer dashboard | Hardcoded to `0` — needs `producer_whatsapp_clicks` table |
| 📋 | v1 | Smart cross-field search (name + category + city + product) | Currently the hero search routes the query as `delivery_city`, hack-tier |
| 📋 | v1 | Producer page extras: opening hours, mini-map, similar producers, share button, breadcrumb | Not built |
| 📋 | v1 | Calendar view for `/events` (currently grid only) | — |

---

## v2 — Post-launch

Priority: **after v1 launch + 10 real producers onboarded.** See
[ROADMAP.md](./ROADMAP.md) for the full v2 list.

| Status | Version | Feature | Notes |
|---|---|---|---|
| 📋 | v2 | Claude Agent SDK migration — 3 agents (support chat, search, moderation) | [ROADMAP.md](./ROADMAP.md) → "v2 — Claude Agent SDK Integration" |
| 📋 | v2 | Push notifications (Twilio + FCM) | Foundation already in place via `producer_followers` |
| 📋 | v2 | React Native app | — |
| 📋 | v2 | Bilingual (EN/HE toggle, i18next) | — |
| 📋 | v2 | Recipes section | User submissions → admin approval |
| 📋 | v2 | "אחרים שמרו" social proof on producer cards | — |
| 📋 | v2 | Volunteer ambassadors (`role: ambassador`) | — |
| 📋 | v2 | CSA — weekly veg-box subscriptions | — |
| 📋 | v2 | Coupon codes for producers | — |
| 📋 | v2 | Public API for producers | — |
| 📋 | v2 | Price comparison | — |
| 📋 | v2 | Verified-business reviews | — |

---

## v3 — Speculative

See [ROADMAP.md](./ROADMAP.md) → `## v3+ — רעיונות`.

| Status | Version | Feature |
|---|---|---|
| 💡 | v3 | Virtual market day |
| 💡 | v3 | Neighborhood / regional sub-communities |
| 💡 | v3 | Restaurant + chef partnerships |
| 💡 | v3 | Expansion outside Israel |

---

## How to update this file

When you ship a feature: flip the status from 📋/🚧 to ✅, link the code path,
and add a one-line entry in [docs/CHANGELOG.md](./CHANGELOG.md). When you
move a v2 item into v1, also check that [ROADMAP.md](./ROADMAP.md) reflects
the new state.
