# CLAUDE.md — מהמקור (MeHaMakor) Project Spec

> This file is auto-read by Claude Code. It contains the full project context.

## What is מהמקור?
A platform connecting local food producers with consumers in Israel.
Users discover small businesses (organic farms, home bakers, cheese makers) via a map and directory.
Separate "מהמטבח של השכן" section for casual home sellers with WhatsApp-based contact and ratings.

## Tech Stack
- **Frontend**: Next.js 14 App Router, Tailwind CSS, Leaflet.js maps, PWA (next-pwa)
- **Backend**: Python FastAPI, SQLAlchemy ORM, PostgreSQL + PostGIS
- **Auth**: JWT (email/password + Google OAuth)
- **Images**: Cloudinary
- **Notifications**: Twilio WhatsApp API, SMTP email
- **Hosting**: Vercel (frontend) + Railway (backend + DB)
- **Language**: Hebrew only (RTL), Heebo font

## Design System
```
primary:    #2e6853   — buttons, logo, headings
secondary:  #4cb08b   — highlights, accents
background: #eaf4ee   — page background
accent:     #c9e2d3   — subtle accent, hover states
accent-warm:#E8823A   — premium badges, warm highlights
text:       #1C1C1C (primary) / #6B6B6B (secondary)
```
- Style: Minimal, warm, organic — 12px border-radius, no gradients
- Font: Heebo (Google Fonts)
- Inspiration: chai-bria.co.il

## Naming Convention (Hebrew UI)
- "יצרן" → "בית עסק" throughout
- "יצרני מזון" → "בתי עסק"
- Register button: "הוסף את העסק שלך"
- Home seller: "שכן מוכר" in UI

## Project Structure
```
/backend
  /app
    /models/models.py    — SQLAlchemy models
    /routers/            — FastAPI route files
    /schemas/schemas.py  — Pydantic schemas
    /config.py           — env vars
    /database.py         — DB engine
    /main.py             — app entry + migrations
  /seed_data.py          — initial data
  /requirements.txt

/frontend
  /app                   — Next.js App Router pages
    /about, /admin, /favorites, /login, /map,
    /producer/[id], /rate/[token], /register,
    /register/producer, /terms, /upgrade
  /components            — Reusable React components
  /lib                   — api.js, auth-context.js
  /public                — manifest.json, robots.txt, sw.js
```

## Key Backend Models
- **Producer**: name, city, lat/lng, phone, status, images[], plan (free/premium), last_active_at
- **User**: email, name, password_hash (nullable for OAuth), phone, google_id, role
- **HomeProduct**: title, photo, price, neighborhood, city, phone, is_hidden
- **Report**: reporter_id, producer_id, reason
- **HomeProductWhatsAppClick**: rating_token, rating_sent, rated
- **HomeProductRating**: click_id (unique), stars 1-5, comment (100 chars max)

## Key Features (v1)
1. Producer directory with map + grid views
2. Category/city/delivery filters
3. Producer detail pages with SSR SEO (generateMetadata + JSON-LD)
4. "מהמטבח של השכן" section — home sellers with WhatsApp redirect
5. Rating system: 24h post-WhatsApp-click → Twilio rating request → token-based rating page
6. Report system: 3 reports → auto-flag for admin
7. Freemium: free = 3 images + map, premium = unlimited
8. Google OAuth + email/password auth
9. Favorites system
10. Admin dashboard: approve/reject producers, manage reports, hidden listings, stats
11. /about page with vision, values, criteria
12. Terms of service page
13. "הצג עוד" (show more) pagination on home page
14. PWA with manifest + service worker

## Deferred to v2
- Recipes section
- EN/Hebrew language toggle
- Advanced producer dashboard with statistics
- Push notifications
- Freemium billing/payment
- Native mobile app
- Community validators
- Producer auto-email every 3 months (schema prepared in v1)

## Dev Commands
```bash
# Frontend
cd frontend && npm run dev      # dev server
cd frontend && npx next build   # production build

# Backend
cd backend && uvicorn app.main:app --reload  # dev server

# Docker
docker-compose up               # full stack
```

## Branch
Development branch: `claude/review-document-HlIVP`
