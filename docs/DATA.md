# מהמקור — DB Schema + API

> Canonical reference for backend tables and endpoints. Read before any
> schema or routing change. Last full refresh: **April 2026** (during the
> experiences-moderation feature).
>
> The codebase is the source of truth — when this file drifts, fix this
> file. Code lives at:
> - Models: `backend/app/models/models.py`
> - Schemas: `backend/app/schemas/schemas.py`
> - Routers: `backend/app/routers/`
>
> **Database:** PostgreSQL on Railway, **no PostGIS**. Distance queries
> use the Haversine formula against `producers.lat/lng` float columns.
> See [DEPLOYMENT.md](./DEPLOYMENT.md) for why.

---

## Tables overview

| # | Table | Purpose | Model |
|---|---|---|---|
| 1 | `producers` | Approved + pending businesses that own a public listing | `Producer` |
| 2 | `users` | Consumers, producers, admins (role column) | `User` |
| 3 | `categories` | Producer categories (6 rows seeded) | `Category` |
| 4 | `producer_categories` | Many-to-many producer↔category | `ProducerCategory` |
| 5 | `products` | Producer's catalog items | `Product` |
| 6 | `delivery_areas` | Cities a producer delivers to | `DeliveryArea` |
| 7 | `favorites` | User bookmarks on a producer | `Favorite` |
| 8 | `producer_followers` | Notification subscriptions per producer | `ProducerFollower` |
| 9 | `producer_reviews` | Public star+text reviews (one per user per producer) | `ProducerReview` |
| 10 | `recipes` | Community-submitted recipes (v2 feature, table exists) | `Recipe` |
| 11 | `recipe_ingredients` | Ingredient rows tied to recipes | `RecipeIngredient` |
| 12 | `home_products` | "מהמטבח של השכן" — community food listings | `HomeProduct` |
| 13 | `home_product_whatsapp_clicks` | Track when a buyer taps WhatsApp (for 24h rating prompt) | `HomeProductWhatsAppClick` |
| 14 | `home_product_ratings` | 1-5 star rating per click | `HomeProductRating` |
| 15 | `reports` | User-submitted reports on a producer | `Report` |
| 16 | `events` | Producer-hosted farm events (no moderation) | `Event` |
| 17 | `experiences` | Community-hosted workshops (**admin-moderated**) | `Experience` |
| 18 | `newsletter_subscribers` | Footer newsletter signups | `NewsletterSubscriber` |
| 19 | `contact_messages` | /about contact form submissions | `ContactMessage` |
| 20 | `admin_settings` | Key-value admin config | `AdminSetting` |
| 21 | `static_pages` | Editable slug-based content (about, terms) | `StaticPage` |

Auto-created on boot via `Base.metadata.create_all(engine)` +
`_migrate_columns()` in `backend/app/main.py`. The initial seed DDL
in `backend/init_db.sql` is for cold-start Railway deploys only.

---

## DB Schema

### Core

```sql
producers (
  id uuid PK,
  name, description, short_description,
  city, lat float, lng float,
  phone, instagram, website, whatsapp_group,
  status: pending|approved|rejected|inactive,
  images text[],
  is_verified bool,
  plan: free|premium,
  slug text unique,
  contact_name, top_product_name,
  starting_price_label, price_range,
  grass_fed bool, organic_certified bool, kosher,
  has_delivery bool, pickup_points bool,
  admin_notes, is_available_today bool,
  avg_rating float, reviews_count int,
  created_at, last_active_at
)

users (
  id uuid PK,
  email unique, name, password_hash (nullable for OAuth),
  phone, city,
  role: consumer|producer|admin,
  producer_id FK nullable,
  google_id, apple_id (unique when set),
  is_blocked bool,
  created_at
)

categories     (id, name unique, emoji)
producer_categories (producer_id FK, category_id FK, PK(both))
products       (id, producer_id FK, name, description, price_range)
delivery_areas (id, producer_id FK, city, min_order int, delivery_day)
favorites      (user_id FK, producer_id FK, PK(both), created_at)

producer_followers (
  id uuid PK, user_id FK, producer_id FK,
  notify_new_products bool, notify_back_in_stock bool,
  created_at,
  UNIQUE(user_id, producer_id)
)

producer_reviews (
  id uuid PK, producer_id FK, user_id FK,
  stars int (1-5), title, body,
  created_at,
  UNIQUE(producer_id, user_id)   -- one review per user per producer
)
```

### Home products (מהמטבח של השכן)

```sql
home_products (
  id uuid PK, user_id FK,
  title, description, photo,
  quantity, price numeric(10,2),
  neighborhood, city,
  street, zip_code,         -- PRIVATE: never in HomeProductOut
  phone,                    -- used by WhatsApp button
  available_until timestamp,
  is_active bool, is_hidden bool,   -- auto-hidden after 3 negative ratings

  category, prep_date date, expiry_date date,
  storage_type, allergens, kosher,
  is_organic bool, unit, delivery_method, location_notes,
  images text[],

  moderation_status: APPROVED|FLAGGED|REJECTED,   -- Claude verdict
  moderation_reason, moderation_suggestion,
  created_at
)

home_product_whatsapp_clicks (
  id uuid PK, user_id FK, home_product_id FK,
  clicked_at, rating_sent bool, rated bool,
  rating_token text unique
)

home_product_ratings (
  id uuid PK, click_id FK UNIQUE,
  user_id FK, home_product_id FK,
  stars int (1-5), comment varchar(100),
  created_at
)

reports (
  id uuid PK, reporter_id FK, producer_id FK,
  reason text, created_at
)
```

### Events (producer farm events — no moderation)

```sql
events (
  id uuid PK,
  producer_id FK NOT NULL,           -- REQUIRED — only approved producers
  title, description,
  event_date date NOT NULL,          -- YYYY-MM-DD
  event_time time,                   -- HH:MM
  location, city, lat float, lng float,
  image_url text,                    -- single image
  category: סדנה|סיור|שוק|קטיף|טעימות|אחר,
  price int,                         -- 0 = free
  max_participants int,
  registration_url text,             -- external signup link
  is_active bool,
  created_at
)
```

### Experiences (community workshops — **admin-moderated**)

```sql
experiences (
  id uuid PK,
  title, description text NOT NULL, image_url,
  category,                          -- free text: בישול | תזונה | סיור אוכל | ...
  host_user_id FK NOT NULL,          -- any logged-in user can host

  event_date date NOT NULL, event_time time, duration_minutes int,
  is_recurring bool, recurring_schedule text,

  location_type: home|public,        -- producer_farm lives on Event
  city, address text,                -- address PRIVATE — redacted from public list
  lat float, lng float,

  max_participants int, participants_count int,
  price_per_person numeric(10,2),    -- NULL/0 = free
  requirements text,                 -- "what to bring / prerequisites"

  -- Moderation
  status: pending|approved|rejected|changes_requested,
  moderation_status: APPROVED|FLAGGED|REJECTED,  -- Claude Haiku verdict
  moderation_reason, moderation_suggestion,
  admin_feedback,                    -- set on "request changes"
  rejection_reason,                  -- set on "reject"

  created_at, updated_at
)
```

**Key distinction — `events` vs `experiences`:**

|  | `events` | `experiences` |
|---|---|---|
| Host | Approved producer only | Any logged-in user |
| Key FK | `producer_id` (NOT NULL) | `host_user_id` (NOT NULL) |
| Moderation | None (create = live) | Claude pre-mod + admin approval |
| Location types | `location` freetext | `home` / `public` enum |
| Pricing | `price` int (shekels) | `price_per_person` numeric(10,2) |
| Admin UI | `/admin/producers` (implicit) | `/admin/experiences` (dedicated) |
| Why separate | Simple producer calendar | Full trust-and-safety flow |

### Analytics (feature/producer-analytics, April 2026)

```sql
-- One row per GET /producers/{id} hit (minus bot user-agents).
-- Feeds the producer dashboard (profile_views, search_appearances,
-- views_by_day, top_cities) and the admin dashboard top_cities panel.
-- IP is HASHED (SHA-256 with a rotating salt from SECRET_KEY), never
-- stored raw — privacy minimization per חוק הגנת הפרטיות תיקון 13.
producer_page_views (
  id uuid PK,
  producer_id FK producers.id ON DELETE CASCADE (indexed),
  viewer_ip_hash varchar(64) NULL,       -- SHA-256 hex
  city varchar(100) NULL,                -- from authed user.city, else NULL
  referrer varchar(30) NULL,             -- search|map|category|home|favorites|follow|NULL
  created_at timestamp (indexed)
)

-- One row per WhatsApp CTA click on a producer detail page.
-- Distinct from home_product_whatsapp_clicks — producer clicks don't
-- trigger the 24h rating SMS loop, they're just counted.
producer_whatsapp_clicks (
  id uuid PK,
  producer_id FK producers.id ON DELETE CASCADE (indexed),
  clicked_at timestamp (indexed)
)

-- DAU tracking column on users. Updated by get_current_user() on every
-- authenticated request, throttled to at most 1 write per 5 minutes
-- per user. Feeds /admin/dashboard daily_active_users chart.
users.last_active_at timestamp NULL
```

### Marketing + admin + content

```sql
newsletter_subscribers (id, email unique, created_at)
contact_messages       (id, name, email, message text, created_at)
admin_settings         (key text PK, value text)
static_pages           (slug text PK, title, body, updated_at)

-- v2 feature — tables exist but no public UI
recipes (
  id, title, description, steps json, category_id FK,
  submitted_by FK, status: pending|approved|rejected,
  created_at
)
recipe_ingredients (
  id, recipe_id FK, ingredient_name,
  producer_id FK nullable, notes
)
```

---

## API Endpoints

All endpoints served from `backend/app/main.py`. Auth via JWT in the
`Authorization: Bearer …` header unless marked "public". Rate limiting
via `slowapi` — see `backend/app/rate_limit.py` and
[SECURITY.md](./SECURITY.md) §2.

### Auth (`app/routers/auth.py`)

```
POST   /auth/register            public  — consumer signup, returns JWT
POST   /auth/register/producer   public  — producer multi-step signup
POST   /auth/login               public  — email+password → JWT
GET    /auth/me                  auth    — current user
POST   /auth/google              public  — Google OAuth ID token exchange
POST   /auth/apple               public  — Apple Sign In ID token (App Store)
DELETE /users/me                 auth    — account deletion (App Store)
```

### Producers (`app/routers/producers.py`, `producer_me.py`)

```
GET    /producers                                 public — filters: lat+lng+radius_km, category, city, verified
GET    /producers/{producer_id}                   public
GET    /producers/by-slug/{slug}                  public
POST   /producers                                 auth   — self-register (writes pending)
GET    /categories                                public

# Follow / unfollow producers (v1 data layer only, notifications in v2)
POST   /producers/{producer_id}/follow            auth
DELETE /producers/{producer_id}/follow            auth
GET    /producers/{producer_id}/follow-status     auth
GET    /users/me/following                        auth

# Producer-self (role=producer)
GET    /producers/me                              producer
PUT    /producers/me                              producer
POST   /producers/me/availability                 producer  — toggle is_available_today
GET    /producers/me/dashboard                    producer  — stable legacy: favorites_count + whatsapp_clicks_week
GET    /producers/me/analytics                    producer  — feature/producer-analytics (April 2026)
                                                              profile_views / search_appearances / whatsapp_clicks
                                                              as {last_7d, last_30d, total}; follower_count +
                                                              new_followers_this_week; average_rating + total_reviews;
                                                              home_products_count; views_by_day (30-entry zero-filled
                                                              series); top_cities (top 5, excludes NULL city)

# Producer detail — public (tracked, anonymous)
GET    /producers/{id}?from=search|map|...        public    — GET that also logs a producer_page_views row
                                                              (bot UAs filtered, IP SHA-256 hashed with rotating salt,
                                                              city copied from authed viewer.city when present, NULL
                                                              otherwise; referrer normalized to an allowlist)
POST   /producers/{id}/whatsapp-click             public    — anonymous, rate-limited 10/min per IP
                                                              appends a producer_whatsapp_clicks row;
                                                              frontend fires via navigator.sendBeacon
```

### Favorites (`app/routers/favorites.py`)

```
GET    /favorites                  auth
POST   /favorites/{producer_id}    auth
DELETE /favorites/{producer_id}    auth
```

### Home products — מהמטבח של השכן (`app/routers/home_products.py`)

```
GET    /home-products                     public — filter: city
GET    /home-products/{product_id}        public
POST   /home-products                     auth   — 10/hour limit, Claude-moderated (Opus)
PUT    /home-products/{product_id}        auth   — owner only
DELETE /home-products/{product_id}        auth   — owner only
POST   /home-products/validate            public — 30/hour, real-time moderation hint
POST   /home-products/{id}/whatsapp-click auth   — log the click, returns rating token
GET    /home-products/{id}/ratings        public
GET    /home-products/rate/{token}        public — rating page bootstrap
POST   /home-products/rate/{token}        public — submit rating
```

### Events (producer farm events — `app/routers/events.py`)

```
GET    /events                    public — filter: city, category, from_date, to_date
GET    /events/upcoming            public — limit=N next events
GET    /events/{event_id}          public
POST   /events                     producer — only approved producers
PUT    /events/{event_id}          producer — owner only
DELETE /events/{event_id}          auth    — owner or admin
```

No moderation. Producer publishes, it's live. Designed for the
"יום קטיף / סיור בחווה" calendar on producer pages. Category enum:
`סדנה | סיור | שוק | קטיף | טעימות | אחר`.

### Experiences (community workshops — `app/routers/experiences.py`)

```
POST   /experiences/validate           public  — 30/hour, real-time Claude Haiku hint
GET    /experiences                    public  — filter: category, city. Only approved+upcoming.
GET    /experiences/mine               auth    — owner's submissions, any status
GET    /experiences/{id}               mixed   — approved=public; non-approved=owner+admin
POST   /experiences                    auth    — 10/hour. REJECTED → 400. APPROVED/FLAGGED → pending.
PUT    /experiences/{id}               auth    — owner only. Any edit resets to status=pending + re-runs Claude.
DELETE /experiences/{id}               auth    — owner or admin
```

**Moderation flow:**

```
POST /experiences
  ↓
Claude Haiku via experience_moderation.validate_experience()
  ├ REJECTED          → HTTP 400 { error: "experience_rejected", reason }
  └ APPROVED/FLAGGED  → persist status='pending', moderation_status=…
                         → email admin (best-effort)

admin → /admin/experiences/{id}/approve           → status='approved', email host
admin → /admin/experiences/{id}/request-changes   → status='changes_requested', admin_feedback, email host
admin → /admin/experiences/{id}/reject            → status='rejected', rejection_reason, email host

host edits after non-approved verdict → status back to 'pending',
  admin_feedback + rejection_reason cleared, Claude re-runs, admin notified
```

**Privacy:** `experiences.address` is stored but never returned in
`ExperienceListOut`. The detail endpoint returns it only to the owner
or an admin — public detail views see `address: null`. Mirrors the
`home_products.street/zip_code` privacy model.

**Model:** Hardcoded to `claude-haiku-4-5-20251001` in
`experience_moderation.py`. Home products use `settings.anthropic_model`
(Opus) because their verdict triggers immediate publication with a
badge; experiences still require admin approval, so Haiku is enough.

### Admin — core (`app/routers/admin.py`, `admin_extra.py`)

```
# Producer moderation
GET    /admin/producers                        admin — filter: status, search
POST   /admin/producers                        admin — create auto-approved
PUT    /admin/producers/{id}                   admin
POST   /admin/producers/{id}/toggle-status     admin
DELETE /admin/producers/{id}                   admin
GET    /admin/producers/pending                admin
POST   /admin/producers/{id}/approve           admin — emails + WhatsApp
POST   /admin/producers/{id}/reject            admin — with reason
POST   /admin/producers/import                 admin — Excel/CSV upload, dry_run=true by default

# Home products moderation
GET    /admin/home-products/flagged            admin
POST   /admin/home-products/{id}/approve       admin — clears FLAGGED
POST   /admin/home-products/{id}/remove        admin — deactivates + email
GET    /admin/home-products/hidden             admin
POST   /admin/home-products/{id}/restore       admin
DELETE /admin/home-products/{id}               admin

# Recipes (v2)
GET    /admin/recipes/pending                  admin
POST   /admin/recipes/{id}/approve             admin
POST   /admin/recipes/{id}/reject              admin

# Users
GET    /admin/users                            admin — search
PUT    /admin/users/{id}/role                  admin
POST   /admin/users/{id}/block                 admin
GET    /admin/users/{id}/favorites             admin

# Content
GET    /admin/categories                       admin
POST   /admin/categories                       admin
PUT    /admin/categories/{id}                  admin
DELETE /admin/categories/{id}                  admin
GET    /admin/pages/{slug}                     admin
PUT    /admin/pages/{slug}                     admin

# Analytics + settings + dashboard
GET    /admin/analytics                        admin
GET    /admin/settings                         admin
PUT    /admin/settings                         admin
POST   /admin/settings/test/{service}          admin — Twilio/Cloudinary test pings
GET    /admin/dashboard                        admin
GET    /admin/stats                            admin
GET    /admin/reports                          admin — producer reports inbox
```

### Admin — experiences (`app/routers/admin_experiences.py`)

```
GET  /admin/experiences?status=…                       admin
POST /admin/experiences/{id}/approve                   admin — emails host "approved"
POST /admin/experiences/{id}/request-changes           admin — feedback required
POST /admin/experiences/{id}/reject                    admin — feedback optional
```

### Reviews (`app/routers/reviews.py`)

```
GET    /producers/{id}/reviews   public
POST   /reviews                  auth  — upsert (1 per user per producer)
DELETE /reviews/{id}             auth  — owner or admin
```

### Reports (`app/routers/reports.py`)

```
POST /producers/{id}/report      auth  — 3 reports auto-flag for admin
GET  /admin/reports              admin
```

### Recipes (v2 — `app/routers/recipes.py`)

```
GET  /recipes                    public — filter: category
GET  /recipes/{recipe_id}        public
POST /recipes                    auth   — writes status=pending
```

### Marketing (`app/routers/marketing.py`)

```
GET  /stats                      public — { producers_count, categories_count, cities_count }
POST /newsletter                 public — { email } → newsletter_subscribers
                                 rate-limited 5/hour per IP
POST /contact                    public — { name, email, message } → contact_messages row
                                 + SMTP email to CONTACT_EMAIL (falls back to
                                 ADMIN_EMAIL). Fail-open: if SMTP is unconfigured
                                 or raises, the submission is still persisted.
                                 rate-limited 5/hour per IP
GET  /cities                     public — deduped producer+listing city list
```

### Chat widget (`app/routers/chat.py`)

```
POST /chat                       public — one-shot Claude Haiku Q&A about the platform
```

### Upload (`app/routers/upload.py`)

```
POST /upload/image               auth — Cloudinary direct upload with magic-byte validation
```

---

## Notifications (Twilio + SMTP)

| Trigger | Channel | Target | File |
|---|---|---|---|
| Producer registers | WhatsApp | Admin | `admin.py._send_whatsapp` |
| Producer approved/rejected | Email + WhatsApp | Producer + admin | `admin.py` |
| Experience submitted | Email | Admin (FLAGGED subject if Claude flagged) | `experience_notifications.py` |
| Experience approved | Email | Host | `experience_notifications.py` |
| Experience changes-requested | Email | Host (feedback verbatim) | `experience_notifications.py` |
| Experience rejected | Email | Host (reason verbatim) | `experience_notifications.py` |
| Home product removed | Email | Seller | `admin.py` |
| Newsletter signup | Email | Admin | `marketing.py` |
| Contact form | Email | Admin | `marketing.py` |
| 24h after WhatsApp click | WhatsApp | Buyer (rating prompt) | `rating_dispatcher.py` |

All SMTP + Twilio sends are **best-effort** — missing env vars or send
errors are logged but never raise. A broken notification must never
break the underlying flow.

---

## Env vars

Critical:
- `DATABASE_URL` — Railway Postgres reference
- `JWT_SECRET_KEY` or `SECRET_KEY` — **required in production**, ephemeral in dev
- `ANTHROPIC_API_KEY` — moderation + chat widget (fail-open if missing)
- `ENV` — `development|staging|production`
- `CORS_ORIGINS` — comma-separated, production MUST set explicitly

Integrations:
- `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET`
- `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`
- `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN` / `_WHATSAPP_FROM` / `ADMIN_WHATSAPP_TO`
- `SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `ADMIN_EMAIL`
- `ANTHROPIC_MODEL` (defaults to `claude-opus-4-6`)

See [DEPLOYMENT.md](./DEPLOYMENT.md) §1 for the full setup matrix.

---

## Apple App Store compliance

- `DELETE /users/me` — deletes the user row + cascaded rows (favorites,
  home_products, home_product_ratings, producer_reviews, experiences,
  producer_followers). Events hosted by the user's producer are NOT
  cascaded — they belong to the producer record.
- `POST /auth/apple` — identity token verification + user create/link.
- `apple_id` column on `users` (unique when set).
