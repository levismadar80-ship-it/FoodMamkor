# מהמקור — Implementation Plan (MVP v1)

## Summary of Changes

Full Next.js rewrite of the React+Vite frontend, keeping the FastAPI backend with schema updates.

### Key Decisions (from interview + final brief + roadmap)
- **Frontend**: Next.js App Router (full rewrite) + Tailwind CSS + Leaflet.js
- **Backend**: FastAPI (keep, update schema)
- **Images**: Cloudinary
- **Auth**: Email/password + Google OAuth (JWT)
- **Hosting**: Vercel (frontend) + Railway (backend + DB)
- **Mobile**: PWA
- **Language**: Hebrew only (no toggle — add in v2)
- **Bot**: Removed
- **מהמטבח של השכן**: Section on home page, WhatsApp redirect for chat

### Design System (from final brief)
- **Inspiration**: chai-bria.co.il
- **Primary green**: `#2D6A2D` (buttons, logo, headings)
- **Background**: `#FAF8F3` (warm cream, not cold white)
- **Accent**: `#E8823A` (warm orange for highlights)
- **Text**: `#1C1C1C` primary / `#6B6B6B` secondary
- **Style**: Minimal, warm, organic — rounded corners 12px, no gradients, no heavy shadows
- **Font**: Heebo or Assistant (Hebrew Google Font)
- **RTL**: Hebrew default

---

## Phase 1: Backend Updates

### 1.1 New DB Model: `HomeProduct` (מהמטבח של השכן)
Add to `models.py`:
```
home_products table:
  id uuid PK
  user_id FK → users
  title text
  description text
  photo text (Cloudinary URL)
  quantity text
  price decimal
  neighborhood text
  city text
  phone text (for WhatsApp redirect)
  is_active bool (default true)
  created_at timestamp
```

### 1.2 Update User model
- Any logged-in user can post home products (no separate role needed)
- Add `phone` field to User model (for WhatsApp redirect)

### 1.3 New API Endpoints
```
GET  /home-products          — list active home products (filterable by city)
POST /home-products          — create (any logged-in user)
PUT  /home-products/:id      — update own listing
DELETE /home-products/:id    — deactivate own listing
```

### 1.4 Cloudinary Integration
- Add `POST /upload/image` endpoint
- Accept file upload, push to Cloudinary, return URL
- Used by: producer registration, home products
- Add `cloudinary` to requirements.txt

### 1.5 Google OAuth
- Add `POST /auth/google` endpoint
- Accept Google ID token, verify with Google API
- Create user if not exists, return JWT
- Add `google-auth` to requirements.txt

### 1.6 Admin Notifications
- Email notification on new producer registration (SMTP)
- WhatsApp notification via Twilio API
- Triggered in `POST /auth/register/producer`

### 1.7 Freemium Logic
- Add `plan` field to Producer model: `free` | `premium` (default: `free`)
- Free: 3 images max + appear on map
- Premium: unlimited images + products list + statistics
- Enforce image limit in upload endpoint based on plan

### 1.8 Report System
- New `reports` table: id, reporter_id (FK→users), producer_id (FK→producers), reason, created_at
- `POST /producers/:id/report` — any logged-in user
- `GET /admin/reports` — admin only
- Auto-flag producer for review when report count >= 3

### 1.9 Producer Activity Check (cron/scheduled)
- Track last_active_at on Producer model
- Auto-email every 3 months: "confirm you're still active"
- 6 months no response → mark as inactive

---

## Phase 2: Frontend — Next.js Rewrite

### 2.1 Project Setup
- Create Next.js 14 app with App Router in `/frontend`
- Configure Tailwind CSS with RTL support + custom color palette:
  - Primary: `#2D6A2D`
  - Background: `#FAF8F3`
  - Accent: `#E8823A`
  - Text: `#1C1C1C` / `#6B6B6B`
- Configure PWA (next-pwa)
- Set up Cloudinary Next.js integration (next-cloudinary)
- Hebrew font (Heebo or Assistant from Google Fonts)
- Border-radius: 12px throughout

### 2.2 Layout & Navigation
- Root layout: RTL, Hebrew font, warm/organic feel
- Header with nav: דף בית | מפה | הצטרף כיצרן
- Footer: basic links + link to /terms
- Mobile hamburger menu

### 2.3 Pages (MVP v1)

#### Page 1: Home `/`
- **Hero section**: Large search bar + tagline "אוכל אמיתי, ישר מהמקור אליך"
- **3 filters**: Category dropdown | City input | Delivery checkbox
- **Producer grid**: 3 cols desktop, 1 mobile
  - Card: image + name + city + category tags + verified badge
  - Click → `/producer/[id]`
- **"הצג במפה" button** → `/map` with same filters
- **"מהמטבח של השכן" section**:
  - Separate grid below producers
  - Banner: "האחריות על המוצר היא של המוכר בלבד"
  - Cards: photo + title + price + neighborhood + "ביתי" badge
  - WhatsApp button on each card
  - "פרסם מוצר ביתי" button (opens modal/form for logged-in users)

#### Page 2: Map `/map`
- Leaflet.js with category markers + sidebar filters
- Dynamic import (no SSR for map)
- Marker popups with producer preview
- Sidebar: category chips, city filter, results list
- Click producer → navigate to detail page

#### Page 3: Producer Detail `/producer/[id]`
- SSR for SEO (server component)
- Image gallery (carousel) from Cloudinary
- Name + verified badge
- Full description
- Category tags
- Contact buttons: phone / WhatsApp / Instagram / website
- Delivery table: city | day | min_order
- Products list (premium producers only)
- Heart button (favorites, logged-in only)
- **"דווח על עסק" button** — report system
- "הצג במפה" button

#### Page 4: Producer Registration `/register/producer`
- Multi-step form (4 steps):
  1. Account: email + password (or Google OAuth)
  2. Business: name, description, city, categories, photos (Cloudinary upload, max 3 for free)
  3. Delivery: cities + min order + delivery day
  4. Confirmation: "ממתין לאישור" screen
- Form validation at each step
- Photo upload via Cloudinary widget

#### Page 5: Admin Dashboard `/admin`
- Protected route (admin only)
- Tab 1: Pending producers — approve/reject with reason
- Tab 2: Reports — flagged producers (3+ reports)
- Tab 3: Stats overview (count of producers, pending, etc.)
- On approve/reject → trigger email + WhatsApp notification
- Simple, clean table/card layout

#### Page 6: Terms of Service `/terms`
- Static page with full terms text (from final brief)
- Sections: מהות השירות, אחריות על מוצרים, מהמטבח של השכן, עסקים מאומתים, דיווח, פרטיות

### 2.4 Auth Pages
- `/login` — Email/password + Google OAuth button
- `/register` — Consumer registration + Google OAuth
- Auth context/provider with JWT in localStorage
- Protected route wrapper component

### 2.5 Shared Components
- `ProducerCard` — reusable card for grid/list views
- `HomeProductCard` — card for מהמטבח section with WhatsApp button
- `CategoryTag` — colored category chip with emoji
- `FavoriteButton` — heart icon toggle
- `ReportButton` — "דווח על עסק" with reason modal
- `ImageGallery` — Cloudinary carousel
- `MapComponent` — Leaflet wrapper (dynamic import)
- `SearchBar` — search input with filters
- `WhatsAppButton` — opens wa.me link with pre-filled message
- `FreemiumBadge` — shows plan status on producer dashboard

---

## Phase 3: Integration & Polish

### 3.1 SEO
- Meta tags per page (title, description, og:image)
- Producer pages: dynamic meta from DB data — title: "[שם עסק] - [עיר] | מהמקור"
- Structured data (JSON-LD schema.org) for local businesses
- Sitemap.xml auto-generated with all producers

### 3.2 PWA
- Manifest.json with Hebrew name + icons
- Service worker for offline caching
- "Add to home screen" prompt

### 3.3 Seed Data
- Keep existing 5 producers from seed_data.py
- Categories already seeded (15 categories)

---

## Implementation Order

1. **Backend first**: Schema updates (HomeProduct, reports, freemium) + Cloudinary + Google OAuth + notifications
2. **Next.js setup**: Project scaffold + Tailwind + layout + auth
3. **Core pages**: Home → Map → Producer Detail → Registration → Admin → Terms
4. **מהמטבח של השכן**: Home page section + backend endpoints
5. **Polish**: SEO, PWA, responsive testing, report system

---

## What's Deferred to v2
- Recipes section
- About/Vision page (/about)
- Reviews/ratings
- EN/Hebrew language toggle (i18next)
- Advanced producer dashboard with statistics
- Push notifications
- Claude bot
- Freemium billing/payment processing
- Native mobile app
- Community validators
- Producer auto-email every 3 months (implement cron in v2, prepare schema in v1)
