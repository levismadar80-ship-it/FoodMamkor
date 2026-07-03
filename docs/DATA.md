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
| 10 | `home_products` | "מהמטבח של השכן" — community food listings | `HomeProduct` |
| 11 | `home_product_whatsapp_clicks` | Track when a buyer taps WhatsApp (for 24h rating prompt) | `HomeProductWhatsAppClick` |
| 12 | `home_product_ratings` | 1-5 star rating per click | `HomeProductRating` |
| 13 | `reports` | User-submitted reports on a producer | `Report` |
| 14 | `events` | Producer-hosted farm events (no moderation) | `Event` |
| 15 | `experiences` | Community-hosted workshops (**admin-moderated**) | `Experience` |
| 16 | `newsletter_subscribers` | Footer newsletter signups | `NewsletterSubscriber` |
| 17 | `contact_messages` | /about contact form submissions | `ContactMessage` |
| 18 | `admin_settings` | Key-value admin config | `AdminSetting` |
| 19 | `static_pages` | Editable slug-based content (about, terms) | `StaticPage` |
| 20 | `search_queries` | Analytics log of every smart-search query (MEH-99) | _(raw SQL, no ORM model)_ |
| 21 | `producer_recipes` | Producer-owned recipes promoting their products (admin-moderated) | `ProducerRecipe` |
| 22 | `producer_recipe_products` | Many-to-many recipe ↔ product link (same-producer enforced in router) | _(association `Table`)_ |
| 23 | `inbound_messages` | Inbound WhatsApp messages — populated by future PR2c receiver, consumed by MEH-509 PR2b watchdog | `InboundMessage` |
| 24 | `outbound_messages` | Outbound WhatsApp sends — one row per real send written by the send layer (MEH-771 Chunk A); `status` lifecycle `accepted`→`delivered`/`failed` reconciled via the Chunk B delivery webhook; `meta_message_id` (wamid) UNIQUE for idempotency. Mirrors `inbound_messages` phone-key pattern (no FK) | `OutboundMessage` |

> **MEH-509 PR3 (2026-05-22):** `producers.risk_score` (Integer nullable) + `producers.risk_reasoning` (Text nullable) added by migration `92afa3cb76e2`. Populated asynchronously by `app/services/producer_risk.py` via FastAPI BackgroundTasks after producer signup using Claude Haiku 4.5. NULL on both = "not scored yet OR Anthropic call failed (fail-open)". Admin-only — `ProducerAdminOut` schema surfaces them; `ProducerDetailOut` (public) intentionally does not. New endpoint: `GET /admin/producers/{id}/risk-score` returns `{score, reasoning}`.

> **MEH-759 (ADR-022 gate 2, 2026-06-06):** `producers.declared_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `a7f3e9c14d28`, Chunk A) + `producers.declaration_version` (VARCHAR(10), nullable) record the binding tier-2 licensing declaration. Chunk B stamps them in `POST /auth/register/producer` (both new-account and MEH-143 upgrade paths) when the new **required** `declaration_accepted: bool` body field is truthy — the handler 422s (`יש לאשר את הצהרת הרישוי כדי להמשיך`) when it is falsy/absent, so a producer row is only ever created with both columns set. Constant `DECLARATION_VERSION` lives in `app/constants.py`. Admin-create / Excel-import paths leave both NULL (no owner declaration). Admin-only exposure — `ProducerAdminOut` surfaces them; `ProducerDetailOut`/`ProducerListOut` (public) intentionally do not.

> **MEH-762 (ADR-022 public tier contract, 2026-06-06):** `producers.verified_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `f1c7b9a3e264`, Chunk 1) + `producers.verification_doc_type` (VARCHAR(20), nullable; `license`\|`exemption`\|`cosmetics`) record the tier-1 "מאומת" document review. **Chunk 2:** admin stamping via `POST /admin/producers/{id}/grant-verified` (`{doc_type}`) + `/revoke-verified`; `is_verified` untouched (legacy axis, decoupling deferred). **Chunk 3 public exposure:** `ProducerListOut`/`ProducerDetailOut` now carry `verification_tier` (`"verified"`\|`"declared"`\|`null` — **computed** in `_compute_verification_tier`, never stored), `verified_at` (**date granularity only** — the TIMESTAMPTZ is truncated so no time leaks), and `verification_doc_type`. Resolver (D2/D3): `verified_at` set → `"verified"`; else if no category is in `LICENSE_REQUIRED_CATEGORIES` → `"declared"`; else `null` (no badge, no negative label). Mirrors the MEH-530 name-membership predicate (`license_validation.categories_require_license`) against the loaded categories. Privacy: `verified_at`(date)/`doc_type`/`tier` are public; `declared_at`/`declaration_version`/`producer_license_number` stay admin-only (`ProducerAdminOut`, which also inherits the three public fields at date granularity).

> **MEH-1011 (2026-07-03):** producer **request-changes** (completion request) flow — the non-terminal twin of reject. Two nullable `producers` columns (migration `a1b2c3d4e5f6`): `requested_changes` (TEXT — the admin's free-text feedback) + `changes_requested_at` (TIMESTAMPTZ, tz-aware). `POST /admin/producers/{id}/request-changes` (`{feedback}`, empty → 400) records the feedback, KEEPS status `pending`, emails the producer, and WhatsApps admin; `approve_producer` clears both columns on success. Admin-only exposure via `ProducerAdminOut` (both fields), never public `ProducerListOut`/`ProducerDetailOut`.
>
> **MEH-971 chunk 3 (2026-06-28):** `ProducerAdminOut` gains a derived **`license_pending: bool`** — **computed** in `_compute_license_pending` (`@model_validator(mode="after")`), never a stored column / no migration. True iff the producer is in ≥1 `LICENSE_REQUIRED_CATEGORIES` category AND `producer_license_number` is empty/NULL; status-independent (an override-approved producer still shows it). Mirrors the MEH-762 `_compute_verification_tier` predicate over the already-loaded `categories` (no DB round-trip). **Admin-only** — on `ProducerAdminOut` only, NOT public `ProducerListOut`/`ProducerDetailOut`. Surfaced as the "רישיון ממתין" badge on the `/admin/producers` queue so an admin verifies the license before approving (pairs with the chunk-4 `allow_without_license` approval guard).

> **MEH-589 (2026-05-15):** `producer_recipes` + `producer_recipe_products`
> added (chunk 1/4 = MEH-588 schema + chunk 2/4 = MEH-589 endpoints +
> moderation). Producer-owned recipes go through Claude Haiku pre-check
> then admin approval. Chunks 3-4 add the UI.
>
> **MEH-587 (2026-05-15):** `recipes` and `recipe_ingredients` removed
> (chunk 0/4) ahead of the producer-recipes feature. See
> `backend/alembic/versions/20260515_1430_d7e3c9a82f5b_meh_587_remove_zombie_recipes.py`
> and CHANGELOG.

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
  phone, instagram, website, whatsapp_group, facebook, external_order_form,
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
  created_at, last_active_at,
  -- MEH-51: trust ladder + kashrut
  phone_verified bool default false,
  ambassador bool default false,
  kashrut_badges text[] default '{}',
  kashrut_verified_at timestamp nullable,
  kashrut_expires_at timestamp nullable
)

-- MEH-51: one-time WhatsApp OTP for phone verification
phone_otp_tokens (
  id uuid PK, producer_id FK,
  phone varchar, code varchar(6),
  expires_at timestamp, used bool default false, created_at
)

-- MEH-51: producer uploads cert → admin approves → badge activates
kashrut_badge_requests (
  id uuid PK, producer_id FK,
  badge_code varchar,           -- rabanut|badatz|chalak|mehadrin|organic-kosher|shmitta|kilayim|grass-fed|raw-dairy
  cert_url text nullable,
  status varchar default 'pending',  -- pending|approved|rejected
  reviewed_by FK → users nullable,
  notes text, created_at
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
products       (id, producer_id FK, name, description,
                price_range,                        -- LEGACY free-text; drop tracked in MEH-295 follow-up
                image_url,
                price_min Numeric(10,2) NULL,       -- MEH-295: canonical min, Pydantic ge=1 le=10000 (required on create)
                price_max Numeric(10,2) NULL,       -- MEH-295: canonical max, optional, validator: >= price_min
                is_gluten_free Boolean NOT NULL DEFAULT FALSE,   -- MEH-293/MEH-479: single source of truth post column drop. EXISTS subquery powers /producers?gluten_free=true
                is_vegan Boolean NOT NULL DEFAULT FALSE,         -- MEH-293/MEH-479: same
                is_lactose_free Boolean NOT NULL DEFAULT FALSE)  -- MEH-293/MEH-479: same; partial index idx_products_dietary on (producer_id) WHERE any flag TRUE
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
  reason text, created_at,
  UNIQUE(reporter_id, producer_id)   -- uq_report_reporter_producer (MEH-773)
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

### Producer recipes (producer-owned, **admin-moderated** — MEH-588/589)

```sql
producer_recipes (
  id uuid PK,
  producer_id FK → producers.id ON DELETE CASCADE (indexed),
  title text NOT NULL, description text,
  ingredients text NOT NULL,         -- Hebrew markdown
  instructions text NOT NULL,        -- Hebrew markdown
  prep_time_min int, cook_time_min int, servings int,
  image_url text,                    -- Cloudinary

  -- Moderation (Claude Haiku pre-check, then human admin)
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK IN ('pending','approved','rejected','needs_revision'),
  moderation_notes text,             -- Claude verdict reason OR admin feedback
  published bool NOT NULL DEFAULT false,

  created_at, updated_at
  -- Partial index on (published, moderation_status) WHERE published=true
  -- supports the public producer-page read path.
)

-- M2M: a recipe can promote 1..N of the SAME producer's products.
-- Cross-producer linking blocked at router level (FINDER#6 defense from
-- MEH-588 adversarial review).
producer_recipe_products (
  recipe_id  FK → producer_recipes.id  ON DELETE CASCADE,
  product_id FK → products.id          ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, product_id)
  -- Reverse index on product_id for "which recipes mention X".
)
```

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

### Search analytics (MEH-99)

```sql
-- One row per /search call. results_count=0 rows surface in trending suppression.
-- Table created by _migrate_columns() in main.py; no ORM model.
search_queries (
  id uuid PK DEFAULT gen_random_uuid(),
  query text NOT NULL,
  results_count integer NOT NULL DEFAULT 0,
  searched_at timestamp NOT NULL DEFAULT NOW()
)
```

### Marketing + admin + content

```sql
newsletter_subscribers (id, email unique, created_at)
contact_messages       (id, name, email, message text, created_at)
admin_settings         (key text PK, value text)
static_pages           (slug text PK, title, body, updated_at)
```

---

## API Endpoints

All endpoints served from `backend/app/main.py`. Auth via JWT in the
`Authorization: Bearer …` header unless marked "public". Rate limiting
via `slowapi` — see `backend/app/rate_limit.py` and
[SECURITY.md](./SECURITY.md) §2.

### Auth (`app/routers/auth.py`)

```
POST   /auth/register            public  — consumer signup → RegisterAck {detail} (MEH-328 OWASP anti-enum; no auto-login; verify via email)
POST   /auth/register/producer   public  — producer multi-step; non-upgrade → RegisterAck {detail}; upgrade (auth) → Token + whatsapp_sent (MEH-328 Chunk B; MEH-306 sub-A out of scope). MEH-971 chunk 2: optional body field license_pending:bool=False — when true, skips the register-time license 422 so a license-required producer can submit with NULL license into the pending queue (transient input, not persisted; downstream approval guard + status gate still enforce licensed-only)
POST   /auth/login               public  — email+password → JWT (no policy validation; verifies hash only per OWASP)
GET    /auth/me                  auth    — current user
POST   /auth/google              public  — Google OAuth ID token exchange
POST   /auth/apple               public  — Apple Sign In ID token (App Store)
DELETE /auth/me                  auth    — account deletion (App Store)
POST   /auth/check-password      public  — MEH-306 stateless policy preview (30/min/IP), no DB write
POST   /auth/forgot-password     public  — MEH-306: 10/15min IP + 5/15min email
POST   /auth/reset-password      public  — MEH-306: 10/15min IP, full policy + reuse check, stamps password_changed_at
PATCH  /users/me/password        auth    — MEH-306: full policy + reuse, stamps password_changed_at, returns 204
```

### Producers (`app/routers/producers.py`, `producer_me.py`)

```
GET    /producers                                 public — filters: lat+lng+radius_km, category, delivery_city, has_delivery,
                                               verified, organic, kosher, city (producer city), is_available_today, grass_fed
                                               sort: newest (default) | rating
                                               MEH-986 ch3b (P0 legal — חוק איסור הונאה בכשרות): ?kosher is VERIFIED-ONLY.
                                               kosher=true → kashrut_verified_at IS NOT NULL (admin-stamped, admin_kashrut.py:75);
                                               kosher=false → kashrut_verified_at IS NULL. NEVER keys off the free-text
                                               Producer.kosher column (which no longer serializes on public ProducerListOut/
                                               DetailOut — kept only on ProducerAdminOut/OwnerOut).
GET    /producers/{producer_id}                   public
GET    /producers/by-slug/{slug}                  public
GET    /producers/cities                          public — MEH-970: per-city APPROVED-producer counts for /map.
                                               GROUP BY city over approved producers; NULL/blank city omitted;
                                               ordered count desc, then city. Counts live from DB (MEH-519 over-claim guard).
                                               response_model=list[ProducerCityOut] → [{ "city": str, "count": int }]
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
POST   /producers/me/verify-phone                producer  — send WhatsApp OTP (3/10min)
POST   /producers/me/verify-phone/confirm        producer  — confirm code, sets phone_verified (5/min)
POST   /producers/me/kashrut-request             producer  — request a kashrut badge (10/hr)
POST   /producers/me/availability                 producer  — toggle is_available_today (legacy; mirrors to availability_state during MEH-291 7-day overlap)
POST   /producers/me/availability-status           producer  — set durable status (legacy; mirrors to availability_state during MEH-291 overlap)
POST   /producers/me/availability-state            producer  — MEH-291 unified 4-value enum
                                                              body: { state: "accepting_orders"|"available_today"|"full_this_week"|"on_vacation",
                                                                      vacation_until?: ISO date }
                                                              vacation_until REQUIRED when state="on_vacation" (422 with "תאריך חזרה לחופשה נדרש")
                                                              dual-writes to is_available_today + availability_status during 7-day overlap
                                                              GET /producers supports ?availability_state= filter (opt-in; default listing unchanged in Phase 2)
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
POST   /admin/producers/{id}/approve           admin — emails + WhatsApp; ?allow_without_license=true overrides the MEH-971 license-pending guard (refuses approval when a license-required category has no producer_license_number)
POST   /admin/producers/{id}/set-ambassador    admin — toggle ambassador flag (trust tier 5)
POST   /admin/producers/{id}/grant-verified    admin — MEH-762: stamp tier-1 verified_at + verification_doc_type (license|exemption|cosmetics)
POST   /admin/producers/{id}/revoke-verified   admin — MEH-762: clear verified_at + verification_doc_type (mistake correction)
GET    /admin/kashrut                          admin — list badge requests (?status=pending|approved|rejected)
POST   /admin/kashrut/{id}/approve             admin — activates badge in kashrut_badges[], sets expiry
POST   /admin/kashrut/{id}/reject              admin — rejects request with optional notes
POST   /admin/producers/{id}/reject            admin — with reason (terminal → status=rejected)
POST   /admin/producers/{id}/request-changes   admin — MEH-1011: feedback required (empty → 400); NON-terminal (status stays pending), sets requested_changes + changes_requested_at (tz-aware), emails producer + WhatsApp admin; cleared on approve
POST   /admin/producers/import                 admin — Excel/CSV upload, dry_run=true by default

# Home products moderation
GET    /admin/home-products/flagged            admin
POST   /admin/home-products/{id}/approve       admin — clears FLAGGED
POST   /admin/home-products/{id}/remove        admin — deactivates + email
GET    /admin/home-products/hidden             admin
POST   /admin/home-products/{id}/restore       admin
DELETE /admin/home-products/{id}               admin

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
GET    /admin/settings/vacation                admin — typed vacation-mode read (MEH-509 PR2a)
POST   /admin/settings/vacation                admin — typed vacation-mode write (MEH-509 PR2a)
POST   /admin/settings/test/{service}          admin — Twilio/Cloudinary test pings
GET    /admin/dashboard                        admin
GET    /admin/stats                            admin
GET    /admin/reports                          admin — producer reports inbox
```

### WhatsApp webhook receiver (`app/routers/whatsapp_webhook.py`) — MEH-509 PR2c

```
GET    /webhook/whatsapp     public — Meta subscription challenge, verify_token gate
POST   /webhook/whatsapp     public — Meta inbound events, HMAC-SHA256 signature gate
```

### Admin — undelivered WhatsApp (`app/routers/admin_whatsapp.py`) — MEH-771 Chunk C

```
GET    /admin/whatsapp/failed     admin — undelivered outbound (status IN failed,
                                  window_expired) from the last 7 days, ordered
                                  created_at desc; list-only, no resend/retry
```

### Admin — experiences (`app/routers/admin_experiences.py`)

```
GET  /admin/experiences?status=…                       admin
POST /admin/experiences/{id}/approve                   admin — emails host "approved"
POST /admin/experiences/{id}/request-changes           admin — feedback required
POST /admin/experiences/{id}/reject                    admin — feedback optional
```

### Producer recipes (`app/routers/producer_recipes.py`, `admin_recipes.py` — MEH-589)

```
# Producer self (require_producer)
POST   /producers/me/recipes                producer  — 10/hr — Claude pre-check, REJECTED→400
GET    /producers/me/recipes                producer  — list all statuses
GET    /producers/me/recipes/{id}           producer  — 404 if not own
PATCH  /producers/me/recipes/{id}           producer  — 10/hr — content change re-moderates
DELETE /producers/me/recipes/{id}           producer  — owner only

# Public (no auth — slug + published+approved filter)
GET    /producers/{slug}/recipes            public    — published+approved only
GET    /producers/{slug}/recipes/{id}       public    — 404 if not published+approved

# Admin (require_admin)
GET    /admin/recipes?moderation_status=…   admin     — filter or all
GET    /admin/recipes/pending               admin     — queue (oldest first)
POST   /admin/recipes/{id}/approve          admin     — sets published=true
POST   /admin/recipes/{id}/request-changes  admin     — feedback required → needs_revision
POST   /admin/recipes/{id}/reject           admin     — feedback optional → rejected
```

### Reviews (`app/routers/reviews.py`)

```
GET    /producers/{id}/reviews   public
POST   /reviews                  auth  — upsert (1 per user per producer)
DELETE /reviews/{id}             auth  — owner or admin
```

### Reports (`app/routers/reports.py`)

```
POST /producers/{id}/report      auth  — 3 reports auto-flag for admin; 409 if already reported (MEH-773)
GET  /admin/reports              admin
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

### Search (`app/routers/search.py` — MEH-99)

```
GET  /search            public — q (max 100 chars), limit (1–20, default 8)
                                 returns { producers, products, cities, categories }
                                 rate-limited 60/minute per IP
GET  /search/trending   public — top 5 queries with results_count>0, cached 1hr
                                 rate-limited 30/minute per IP
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

## Notifications (Twilio + Resend)

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

All Resend + Twilio sends are **best-effort** — missing env vars or send
errors are logged but never raise. A broken notification must never
break the underlying flow.

Email is sent via `app/services/email.py` → Resend HTTP API (HTTPS/443).
Railway blocks SMTP ports (25/465/587); `smtplib` was removed in full.

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
- `RESEND_API_KEY` — Resend.com API key; `ADMIN_EMAIL` — notification recipient; `CONTACT_EMAIL` — public contact form recipient (falls back to `ADMIN_EMAIL`)
- `ANTHROPIC_MODEL` (defaults to `claude-opus-4-6`)

See [DEPLOYMENT.md](./DEPLOYMENT.md) §1 for the full setup matrix.

---

## Apple App Store compliance

- `DELETE /auth/me` — deletes the user row + cascaded rows (favorites,
  home_products, home_product_ratings, producer_reviews, experiences,
  producer_followers). Events hosted by the user's producer are NOT
  cascaded — they belong to the producer record.
- `POST /auth/apple` — identity token verification + user create/link.
- `apple_id` column on `users` (unique when set).
