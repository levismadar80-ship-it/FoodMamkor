# מהמקור — Implementation Plan (MVP v1)

## Summary of Changes

Full Next.js rewrite of the React+Vite frontend, keeping the FastAPI backend with schema updates.

### Key Decisions (from interview)
- **Frontend**: Next.js App Router (full rewrite) + Tailwind CSS + Leaflet.js
- **Backend**: FastAPI (keep, update schema)
- **Images**: Cloudinary
- **Auth**: Email/password + Google OAuth (JWT)
- **Hosting**: Vercel (frontend) + Railway (backend + DB)
- **Mobile**: PWA
- **Language**: Hebrew only (no toggle)
- **Bot**: Removed
- **מהמטבח של השכן**: Section on home page, WhatsApp redirect for chat

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
- Add `role` option: `home_producer` (in addition to consumer/producer/admin)
- Actually: any logged-in user can post home products, no need for a separate role
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
- Used by: producer registration, home products, admin recipe photos
- Add `cloudinary` to requirements.txt

### 1.5 Google OAuth
- Add `POST /auth/google` endpoint
- Accept Google ID token, verify with Google API
- Create user if not exists, return JWT
- Add `google-auth` to requirements.txt

### 1.6 Admin Notifications
- Email notification on new producer registration (SMTP)
- WhatsApp notification via Twilio API
- Triggered in `POST /producers` (new registration)

---

## Phase 2: Frontend — Next.js Rewrite

### 2.1 Project Setup
- Create Next.js 14 app with App Router in `/frontend`
- Configure Tailwind CSS with RTL support + custom color palette:
  - Primary: green (#2d6a4f)
  - Warm beige (#f5f0e8), cream (#faf7f2)
  - Accent earthy tones
- Configure PWA (next-pwa)
- Set up Cloudinary Next.js integration (next-cloudinary)
- Hebrew font (Heebo or Assistant from Google Fonts)

### 2.2 Layout & Navigation
- Root layout: RTL, Hebrew font, warm/organic feel
- Header with nav: דף בית | מפה | הצטרף כיצרן
- Footer: basic links + disclaimer
- Mobile hamburger menu

### 2.3 Pages (5 Core MVP Pages)

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
- SSR/SSG for SEO (getStaticProps or server component)
- Image gallery (carousel) from Cloudinary
- Name + verified badge
- Full description
- Category tags
- Contact buttons: phone / WhatsApp / Instagram / website
- Delivery table: city | day | min_order
- Products list
- Heart button (favorites, logged-in only)
- "הצג במפה" button

#### Page 4: Producer Registration `/register/producer`
- Multi-step form (4 steps):
  1. Account: email + password (or Google OAuth)
  2. Business: name, description, city, categories, photos (Cloudinary upload)
  3. Delivery: cities + min order + delivery day
  4. Confirmation: "ממתין לאישור" screen
- Form validation at each step
- Photo upload via Cloudinary widget

#### Page 5: Admin Dashboard `/admin`
- Protected route (admin only)
- Tab 1: Pending producers — approve/reject with reason
- Tab 2: Stats overview (count of producers, pending, etc.)
- On approve/reject → trigger email + WhatsApp notification
- Simple, clean table/card layout

### 2.4 Auth Pages
- `/login` — Email/password + Google OAuth button
- `/register` — Consumer registration + Google OAuth
- Auth context/provider with JWT in localStorage
- Protected route wrapper component

### 2.5 Shared Components
- `ProducerCard` — reusable card for grid/list views
- `HomeProductCard` — card for מהמטבח section
- `CategoryTag` — colored category chip with emoji
- `FavoriteButton` — heart icon toggle
- `ImageGallery` — Cloudinary carousel
- `MapComponent` — Leaflet wrapper (dynamic import)
- `SearchBar` — search input with filters
- `WhatsAppButton` — opens wa.me link with pre-filled message

---

## Phase 3: Integration & Polish

### 3.1 SEO
- Meta tags per page (title, description, og:image)
- Producer pages: dynamic meta from DB data
- Structured data (JSON-LD) for producers
- Sitemap generation

### 3.2 PWA
- Manifest.json with Hebrew name + icons
- Service worker for offline caching
- "Add to home screen" prompt

### 3.3 Seed Data
- Keep existing 5 producers from seed_data.py
- Categories already seeded (15 categories)

---

## Implementation Order

1. **Backend first**: HomeProduct model + Cloudinary + Google OAuth + notifications
2. **Next.js setup**: Project scaffold + Tailwind + layout + auth
3. **Core pages**: Home → Map → Producer Detail → Registration → Admin
4. **מהמטבח של השכן**: Home page section + backend endpoints
5. **Polish**: SEO, PWA, responsive testing

---

## What's Deferred to v2
- Recipes section
- About/Vision page (/about)
- Reviews/ratings
- Freemium billing/payments
- EN/Hebrew language toggle
- Advanced producer dashboard
- Push notifications
