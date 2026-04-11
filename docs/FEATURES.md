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

---

## v1 — MVP (live)

### Discovery & browse

| Status | Feature | Where |
|---|---|---|
| ✅ | Homepage hero with search pill (Ken Burns background) | `frontend/app/page.js` |
| ✅ | Category grid with hand-drawn line-art icons (6 categories) | `frontend/components/CategoryIcons.jsx` |
| ✅ | Marquee strip between sections (paused on hover, reduced-motion safe) | `frontend/app/page.js` |
| ✅ | Producers grid with skeleton loaders | `frontend/components/ProducerCard.jsx`, `Skeleton.jsx` |
| ✅ | Map (`/map`) — Leaflet + clustering + category-colored markers | `frontend/app/map/MapClient.jsx`, `MapComponent.jsx` |
| ✅ | "חפשי באזור זה" (search-this-area) — Airbnb pattern, committed bounds | `MapClient.jsx` |
| ✅ | "קרוב אלי" (geolocation) — single re-used marker, no leak | `MapComponent.jsx` |
| ✅ | Map ↔ list hover sync (bidirectional) | `MapClient.jsx` |
| ✅ | Mobile bottom-sheet for selected producer | `MapClient.jsx` |
| ✅ | Category legend = filter (toggleable) | `MapClient.jsx` |
| ✅ | Producer detail page with sticky contact sidebar | `frontend/app/[slug]/page.js`, `producer/[id]/ProducerDetail.jsx` |
| ✅ | Producer reviews + star ratings (1 review per user, upsert) | `frontend/components/ProducerReviews.jsx` |
| ✅ | Image gallery with keyboard nav + 44px touch targets | `frontend/components/ImageGallery.jsx` |
| ✅ | Slug-based producer URLs (`/cow-farm-name`) | `frontend/app/[slug]/page.js` |
| ✅ | "מהמטבח של השכן" — dedicated `/neighbor` page | `frontend/app/neighbor/NeighborClient.jsx` |
| ✅ | Events: list, filter, detail (`/events`, `/events/:id`) | `frontend/app/events/` |
| ✅ | Upcoming events preview on homepage (3 cards) | `frontend/app/page.js` |
| ✅ | About page (`/about`) with founder story + values + contact form | `frontend/app/about/AboutClient.jsx` |

### Auth & accounts

| Status | Feature | Where |
|---|---|---|
| ✅ | Email + password registration with feminine-voice validation | `frontend/app/register/page.js` |
| ✅ | Multi-step producer registration (3 steps) | `frontend/app/register/producer/page.js` |
| ✅ | Google OAuth | `frontend/components/GoogleAuthButton.jsx` |
| ✅ | Apple OAuth | `frontend/components/AppleAuthButton.jsx` |
| ✅ | JWT auth (24h expiry, secret from env, never default) | `backend/app/auth.py` |
| ✅ | DELETE /users/me (App Store compliance) | `backend/app/routers/auth.py` |
| ✅ | Welcome email (consumer + producer flavors, fail-open) | `backend/app/routers/auth.py` |

### Producer-only

| Status | Feature | Where |
|---|---|---|
| ✅ | Producer dashboard (`/producer/dashboard`) — availability + favorites + quick links | `frontend/app/producer/dashboard/page.js` |
| ✅ | Toggle "available today" | `backend/app/routers/producer_me.py` |
| ✅ | Add event from dashboard | `frontend/app/producer/dashboard/events/new/page.js` |
| ✅ | Follow / unfollow producers (`producer_followers` table) | `backend/app/routers/producers.py`, `frontend/components/FollowButton.jsx` |

### Home cooks (`/neighbor`)

| Status | Feature | Where |
|---|---|---|
| ✅ | Free posting (no producer approval required) | `backend/app/routers/home_products.py` |
| ✅ | Hybrid AI moderation: APPROVED / FLAGGED / REJECTED | `backend/app/services/home_product_moderation.py` |
| ✅ | Real-time validation while typing (debounced 1.5s) | `frontend/components/HomeProductForm.jsx` |
| ✅ | Address autocomplete via Nominatim (street + house number) | `frontend/components/AddressSearch.jsx` |
| ✅ | Trust badges (organic, kosher, storage, category) | `frontend/components/HomeProductCard.jsx` |
| ✅ | Private street/zip stored server-side, only city/neighborhood shown publicly | `backend/app/models/models.py` |
| ✅ | "🔍 בבדיקה" badge for FLAGGED listings | `HomeProductCard.jsx` |

### AI features

| Status | Feature | Where |
|---|---|---|
| ✅ | AI Q&A chat widget (Hebrew, claude-haiku-4-5, desktop only) | `backend/app/routers/chat.py`, `frontend/components/ChatWidget.jsx` |
| ✅ | Auto-moderation for `/neighbor` listings (Anthropic, fail-open) | `backend/app/services/home_product_moderation.py` |
| 📋 | AI search agent — natural-language search ("בשר grass-fed בחיפה") | v2 — see [ROADMAP.md](./ROADMAP.md) |
| 📋 | Migrate chat widget to `claude-agent-sdk` with tool use | v2 — see [ROADMAP.md](./ROADMAP.md) |
| 📋 | Migrate moderation pipeline to agent loop with follow-up tools | v2 — see [ROADMAP.md](./ROADMAP.md) |

### Admin (`/admin`)

| Status | Feature | Where |
|---|---|---|
| ✅ | Dashboard with 4 stat cards | `frontend/app/admin/page.js` |
| ✅ | Producers management — search, approve, edit | `frontend/app/admin/producers/` |
| ✅ | Users management | `frontend/app/admin/users/` |
| ✅ | Reports — 3 tabs (user reports / FLAGGED home-products / hidden) | `frontend/app/admin/reports/` |
| ✅ | Content / static pages | `frontend/app/admin/content/` |
| ✅ | Analytics | `frontend/app/admin/analytics/` |
| ✅ | Settings | `frontend/app/admin/settings/` |
| ✅ | Admin seed via `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars | `backend/seed_data.py` |
| ✅ | Detail: [ADMIN.md](./ADMIN.md) |

### Cross-cutting infra

| Status | Feature | Where |
|---|---|---|
| ✅ | PWA + service worker + manifest | `frontend/public/manifest.json`, `next-pwa` |
| ✅ | Responsive bottom navigation (5 tabs) | `frontend/components/BottomNav.jsx` |
| ✅ | Toast system (`role="status" aria-live="polite"`) | `frontend/lib/toast.js`, `Toaster.jsx` |
| ✅ | Cookie banner | `frontend/components/CookieBanner.jsx` |
| ✅ | Open Graph + Twitter metadata on all pages | `frontend/app/layout.js` + each `page.js` |
| ✅ | Microsoft Clarity analytics (opt-in via env var) | `frontend/app/layout.js` |
| ✅ | Sentry error monitoring scaffolding (opt-in via env var) | `frontend/sentry.*.config.js` |
| ✅ | Cloudinary `f_auto,q_auto` injection on all images | `frontend/lib/cloudinary.js` |
| ✅ | Print stylesheet | `frontend/app/globals.css` |
| ✅ | RTL Hebrew throughout, feminine voice (locked micro-copy in [DESIGN.md](./DESIGN.md)) | — |
| ✅ | All images have alt text + lazy loading | — |
| ✅ | `prefers-reduced-motion` honored across Ken Burns / marquee / cursor / counter | — |

### Marketing & growth

| Status | Feature | Where |
|---|---|---|
| ✅ | Newsletter signup (footer) | `backend/app/routers/marketing.py` |
| ✅ | Contact form (`/about`) | `backend/app/routers/marketing.py` |
| ✅ | WhatsApp share button on every producer page (viral loop) | `frontend/components/WhatsAppShareButton.jsx` |
| ✅ | WhatsApp click tracking on home products | `home_products.py` |
| ✅ | Social proof bar with `AnimatedCounter` | `frontend/components/AnimatedCounter.jsx` |
| ✅ | Sitemap.xml (auto-generated, includes producer slugs) | `frontend/app/sitemap.js` |
| ✅ | robots.txt | `frontend/public/robots.txt` |

---

## v1 — open work (still ahead of launch)

| Status | Feature | Notes |
|---|---|---|
| 🚧 | Real Lighthouse run against production domain | Sandbox can't run Chrome — must run from a dev machine. See [TESTING.md](./TESTING.md) |
| 📋 | User testing (5 consumers + 3 producers per [LAUNCH_CHECKLIST.md](./archive/LAUNCH_CHECKLIST.md)) | Manual, not in scope for code |
| 📋 | Real producer image of ספיר for `/about` | Currently a `<Leaf>` placeholder |
| 📋 | Sentry DSN hooked up in production | Scaffolding ready, just needs the env var |
| 📋 | `whatsapp_clicks_week` real tracking on producer dashboard | Hardcoded to `0` — needs `producer_whatsapp_clicks` table |
| 📋 | Smart cross-field search (name + category + city + product) | Currently the hero search routes the query as `delivery_city`, hack-tier |
| 📋 | Producer page extras: opening hours, mini-map, similar producers, share button, breadcrumb | Not built |
| 📋 | Calendar view for `/events` (currently grid only) | — |

---

## v2 — Post-launch (priority: after v1 launch + 10 real producers onboarded)

See [ROADMAP.md](./ROADMAP.md) for the full v2 list. Highlights:

- **Claude Agent SDK migration** — three agents (support chat, search, moderation) — see [ROADMAP.md](./ROADMAP.md) → "v2 — Claude Agent SDK Integration"
- Push notifications (Twilio + FCM transport — foundation already in place via `producer_followers`)
- React Native app
- Bilingual (EN/HE toggle)
- Recipes section
- "אחרים שמרו" social proof on producer cards
- Volunteer ambassadors (`role: ambassador`)
- CSA — weekly veg-box subscriptions
- Coupon codes
- Public API for producers
- Price comparison

---

## v3 — Speculative

See [ROADMAP.md](./ROADMAP.md) → `## v3+ — רעיונות`. Highlights:

- Virtual market day
- Neighborhood / regional sub-communities
- Restaurant + chef partnerships
- Expansion outside Israel

---

## How to update this file

When you ship a feature: flip the status from 📋/🚧 to ✅, link the code path,
and add a one-line entry in [docs/CHANGELOG.md](./CHANGELOG.md). When you
move a v2 item into v1, also check that [ROADMAP.md](./ROADMAP.md) reflects
the new state.
