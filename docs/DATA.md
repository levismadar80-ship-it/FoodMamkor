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
| 25 | `producer_locations` | Physical presence points of a producer — branch / pickup / market_stand (a business can have many; e.g. 10 pickup points). Multi-location model (epic MEH-1388) | `ProducerLocation` |

> **MEH-1388 — `producer_locations` (multi-location, 2026-07-21):** moves the map from one-pin-per-business to one-marker-per-location. Columns: `id` · `producer_id` (FK CASCADE) · `kind` (`branch`\|`pickup`\|`market_stand`, CHECK) · `label` · `city` · `address` · `lat` · `lng` · `opening_hours` · `phone` · `is_primary` · `location_precision` (`exact`\|`approximate`, CHECK) · `created_at`/`updated_at`. **Expand-Contract** (ADR-007, chunk 1 `MEH-1395`): a `primary` row is backfilled from `Producer.lat/lng/city`; the old producer columns stay as a mirror during overlap. **Serialization (chunk 2 `MEH-1402`):** `ProducerListOut.locations[]` / `ProducerDetailOut.locations[]` emit `{kind, label, city, lat, lng, is_primary, precision}` (public — street `address`/`phone`/`hours` withheld per MEH-829; the owner-facing `ProducerLocationOwnerOut` on the CRUD includes them). **Geo (chunk 2):** "near me" distance = `MIN(Haversine)` over a correlated scalar subquery on `producer_locations`, with a `COALESCE` fallback to the producer's own `lat/lng` during the Expand overlap; BOTH the list query and the count query stay `DISTINCT` on `producer.id` so a multi-location business counts as **one** result, not N (the historic `_build_base_queries` trap). A delivery-only producer that has a `pickup` location now reappears on the map (controlled reversal of the MEH-213 delivery-only filter); a zero-location delivery-only producer stays hidden. **Map (chunk 3 `MEH-1412`):** per-location markers (pickup/market_stand = a secondary outline), a pickup-layer toggle, a location-label tooltip, and a cluster badge that counts **unique businesses** (dedup by `producerId`), not markers. **Owner CRUD (chunk 4a `MEH-1421`):** `GET/POST/PUT/DELETE /producers/me/locations` (see the API section) with an IDOR ownership 403, a single-primary invariant, and a same-city-label rule. Admin sees a read-only name/city dedup badge on `/admin/producers`. No PostGIS (Haversine in raw SQL, per DEPLOYMENT.md).

> **MEH-509 PR3 (2026-05-22):** `producers.risk_score` (Integer nullable) + `producers.risk_reasoning` (Text nullable) added by migration `92afa3cb76e2`. Populated asynchronously by `app/services/producer_risk.py` via FastAPI BackgroundTasks after producer signup using Claude Haiku 4.5. NULL on both = "not scored yet OR Anthropic call failed (fail-open)". Admin-only — `ProducerAdminOut` schema surfaces them; `ProducerDetailOut` (public) intentionally does not. New endpoint: `GET /admin/producers/{id}/risk-score` returns `{score, reasoning}`.

> **MEH-759 (ADR-022 gate 2, 2026-06-06):** `producers.declared_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `a7f3e9c14d28`, Chunk A) + `producers.declaration_version` (VARCHAR(10), nullable) record the binding tier-2 licensing declaration. Chunk B stamps them in `POST /auth/register/producer` (both new-account and MEH-143 upgrade paths) when the new **required** `declaration_accepted: bool` body field is truthy — the handler 422s (`יש לאשר את הצהרת הרישוי כדי להמשיך`) when it is falsy/absent, so a producer row is only ever created with both columns set. Constant `DECLARATION_VERSION` lives in `app/constants.py`. Admin-create / Excel-import paths leave both NULL (no owner declaration). Admin-only exposure — `ProducerAdminOut` surfaces them; `ProducerDetailOut`/`ProducerListOut` (public) intentionally do not.

> **MEH-762 (ADR-022 public tier contract, 2026-06-06):** `producers.verified_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `f1c7b9a3e264`, Chunk 1) + `producers.verification_doc_type` (VARCHAR(20), nullable; `license`\|`exemption`\|`cosmetics`) record the tier-1 "מאומת" document review. **Chunk 2:** admin stamping via `POST /admin/producers/{id}/grant-verified` (`{doc_type}`) + `/revoke-verified`; the legacy `is_verified` column was fully retired and DROPPED in MEH-766 (writers ch3 #1420, contract ch5 #1578, column ch6 revision `d4e7a92c81b5`). **Chunk 3 public exposure:** `ProducerListOut`/`ProducerDetailOut` now carry `verification_tier` (`"verified"`\|`"declared"`\|`null` — **computed** in `_compute_verification_tier`, never stored), `verified_at` (**date granularity only** — the TIMESTAMPTZ is truncated so no time leaks), and `verification_doc_type`. Resolver (D2/D3): `verified_at` set → `"verified"`; else if no category is in `LICENSE_REQUIRED_CATEGORIES` → `"declared"`; else `null` (no badge, no negative label). Mirrors the MEH-530 name-membership predicate (`license_validation.categories_require_license`) against the loaded categories. Privacy: `verified_at`(date)/`doc_type`/`tier` are public; `declared_at`/`declaration_version`/`producer_license_number` stay admin-only (`ProducerAdminOut`, which also inherits the three public fields at date granularity).

> **MEH-1011 (2026-07-03):** producer **request-changes** (completion request) flow — the non-terminal twin of reject. Two nullable `producers` columns (migration `a1b2c3d4e5f6`): `requested_changes` (TEXT — the admin's free-text feedback) + `changes_requested_at` (TIMESTAMPTZ, tz-aware). `POST /admin/producers/{id}/request-changes` (`{feedback}`, empty → 400) records the feedback, KEEPS status `pending`, emails the producer, WhatsApps the producer (**MEH-1051** — Meta-approved `producer_changes_requested_v1`, 2 body params `{name, missing}`, fail-open post-commit), and WhatsApps admin; `approve_producer` clears both columns on success. Admin-only exposure via `ProducerAdminOut` (both fields), never public `ProducerListOut`/`ProducerDetailOut`.
>
> **MEH-971 chunk 3 (2026-06-28):** `ProducerAdminOut` gains a derived **`license_pending: bool`** — **computed** in `_compute_license_pending` (`@model_validator(mode="after")`), never a stored column / no migration. True iff the producer is in ≥1 `LICENSE_REQUIRED_CATEGORIES` category AND `producer_license_number` is empty/NULL; status-independent (an override-approved producer still shows it). Mirrors the MEH-762 `_compute_verification_tier` predicate over the already-loaded `categories` (no DB round-trip). **Admin-only** — on `ProducerAdminOut` only, NOT public `ProducerListOut`/`ProducerDetailOut`. Surfaced as the "רישיון ממתין" badge on the `/admin/producers` queue so an admin verifies the license before approving (pairs with the chunk-4 `allow_without_license` approval guard).

> **MEH-1255 (2026-07-17):** delivery-exclusion mode ("משלוחים לכל הארץ חוץ מ:"). `producers.delivery_excluded_cities` (`TEXT[] NOT NULL DEFAULT '{}'`, migration `e7c4b1f95a2d`) holds the cities a nationwide-delivery producer does NOT ship to (ShipperHQ include/exclude zone model). CHECK `delivery_excluded_requires_nationwide` (`delivery_nationwide OR delivery_excluded_cities = '{}'`) keeps it empty unless nationwide — the sibling of `delivery_nationwide_xor_cities`. Schema (`ProducerUpdate`/`ProducerAdminCreate`) validators reject an exclusion list without nationwide; partial-update effective-state (list sent alone, or nationwide switched off over a stored list) is guarded in the routers (`app/services/delivery_validation.py`) so it 422s (`ערים מוחרגות אפשריות רק עם משלוחים לכל הארץ`) instead of a DB CHECK 500. **Public** — `ProducerListOut`/`ProducerDetailOut` carry `delivery_excluded_cities` so `DeliveryBlock` renders "משלוחים לכל הארץ (למעט …)". **Consumer filter:** `GET /producers?delivery_city=X` (`producer_listing.py`) switched from an inner `JOIN delivery_areas` to `EXISTS (…) OR (delivery_nationwide AND NOT X = ANY(delivery_excluded_cities))` — a nationwide producer now matches any city except its exclusions (previously nationwide producers were never returned by the city filter, their `delivery_areas` being empty by the XOR).

> **MEH-1291 (2026-07-18):** producer freshness signal. `producers.updated_at` (`TIMESTAMP WITH TIME ZONE`, **nullable**, migration `a3f1c9d2e4b7`, Chunk A) is stamped by the model-level `onupdate=func.now()` (`models.py`) on every real producer UPDATE — owner edits (`producer_me.py:update_my_producer`) and admin edits (`admin.py:admin_update_producer`), both of which load the ORM object + `setattr` + `commit` (a bulk `update()` execute would skip the stamp — no such path exists on producers). **No `server_default`, NO backfill** (ADR-007 Expand-only): the column stays NULL for producers never edited since the migration, so the public "עודכן לאחרונה: {חודש שנה}" line renders nothing for them (honest signal). **Public** — `ProducerDetailOut` (Chunk B) carries `updated_at` read-only; `ProducerListOut`/map do NOT (detail-page-only). Rendered as a modest month-year footnote at the page end (`ProducerSections.jsx`, `frontend/lib/format-date.js` → he-IL/en-US).

> **MEH-1471 (2026-07-22):** self-reported attribution ("מאיפה שמעת עלינו?"). `producers.referral_source` (`VARCHAR(40)`, **nullable**) + `producers.referral_source_other` (`VARCHAR(120)`, **nullable**), migration `d7b2f4a9c6e1`. `referral_source` stores an **English key** from `constants.REFERRAL_SOURCE_KEYS` (`business_referral`\|`friends_family`\|`instagram`\|`facebook`\|`google`\|`whatsapp_group`\|`other`\|`prefer_not_to_say`) chosen at the final registration step; Hebrew labels are rendered from i18n. `referral_source_other` holds the optional free-text answer, revealed only when the key is `other`. Validated at the API boundary (`ProducerRegister._validate_referral_source` → **422** on an unknown key; `referral_source_other` bleach-sanitised) — **no DB CHECK/enum** (app-layer, like `availability_state`/`verification_doc_type`). Field is optional at the Pydantic layer (nullable column, MEH-143 upgrade path); required-ness is a **front-end** registration gate only. **No `server_default`, NO backfill** (ADR-007 Expand-only) — existing rows stay NULL (admin renders "—"). **Admin-only** — `ProducerAdminOut` surfaces both; public `ProducerListOut`/`ProducerDetailOut` do NOT (internal supply-side data, MEH-530 privacy precedent). Displayed read-only under the producer name in the `/admin/producers` table (`AdminProducersTable.jsx`, `"אחר: <text>"` for the `other` case).

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
  plan: free|premium,
  slug text unique,
  -- MEH-1490: admin-mapped Google Maps Place ID. The ONLY Google datum stored —
  -- rating/userRatingCount are live-fetched (never persisted; ToS §3.2.3(b)).
  google_place_id varchar(300) nullable,
  contact_name, top_product_name,
  -- MEH-1335: owner story (public OwnerCard data; bio app-capped at 300)
  owner_bio text nullable, owner_photo_url varchar(500) nullable,
  -- MEH-1541: self-reported founding year → public "מאז {שנה}" masthead line
  -- (app-validated 1800..current year; NULL = line absent from DOM)
  established_year integer nullable,
  -- MEH-1577: structured delivery cost → public DeliveryBlock line. Whole
  -- shekels (INTEGER, matching delivery_areas.min_order, not the NUMERIC(10,2)
  -- of products.price — display-only, no cent arithmetic). delivery_fee = 0 is
  -- a VALUE meaning "משלוח חינם" and is distinct from NULL ("not stated" → no
  -- line renders); free_delivery_above rejects 0 (a threshold every order
  -- clears says nothing). Independent: a threshold with no fee is legal.
  -- App-validated in ProducerUpdate ONLY — no DB CHECK, so a bad payload is a
  -- clean 422 rather than a 500. Declared on ProducerListOut (Detail inherits).
  delivery_fee integer nullable, free_delivery_above integer nullable,
  -- MEH-1471: self-reported attribution (admin-only; English key + free-text "other")
  referral_source varchar(40) nullable, referral_source_other varchar(120) nullable,
  starting_price_label, price_range,
  grass_fed bool, organic_certified bool, kosher,
  has_delivery bool, pickup_points bool,
  -- MEH-213 location mode + MEH-1255 nationwide exclusion list
  has_physical_location bool, offers_delivery bool,
  delivery_nationwide bool, delivery_excluded_cities text[] NOT NULL default '{}',
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
producer_categories (producer_id FK, category_id FK, PK(both),
                     position INT NOT NULL default 0)  -- MEH-1297: 0 = primary (first selected); categories ordered by it
products       (id, producer_id FK, name, description,
                price_range,                        -- LEGACY free-text; drop tracked in MEH-295 follow-up
                image_url,
                price_min Numeric(10,2) NULL,       -- MEH-295: canonical min, Pydantic ge=1 le=10000 (required on create)
                price_max Numeric(10,2) NULL,       -- MEH-295: canonical max, optional, validator: >= price_min
                is_gluten_free Boolean NOT NULL DEFAULT FALSE,   -- MEH-293/MEH-479: single source of truth post column drop. EXISTS subquery powers /producers?gluten_free=true
                is_vegan Boolean NOT NULL DEFAULT FALSE,         -- MEH-293/MEH-479: same
                is_vegetarian Boolean NOT NULL DEFAULT FALSE,    -- MEH-1438: 4th dietary axis. ?vegetarian filter matches is_vegetarian OR is_vegan (a vegan product is vegetarian by definition); migration c5d9f3a1b2e8 seeded TRUE for existing vegan rows
                is_lactose_free Boolean NOT NULL DEFAULT FALSE)  -- MEH-293/MEH-479: same; partial index idx_products_dietary on (producer_id) WHERE any flag TRUE (predicate extended with is_vegetarian in MEH-1438)
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
  status varchar NOT NULL default 'open',   -- open|resolved|dismissed (MEH-1266)
  resolved_at timestamp NULL,               -- (MEH-1266)
  resolved_by uuid FK users NULL,           -- ON DELETE SET NULL (MEH-1266)
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

  is_active bool NOT NULL DEFAULT true,  -- MEH-1419: reversible host cancel (mirrors Event.is_active). Public list filters is_active IS TRUE; /mine returns inactive too.

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

> **MEH-1164 F5 (Chunk 2A) — verified-email gate on content creates.** The
> producer create endpoints `POST /events`, `POST /producers/me/recipes`, and
> `POST /group-buys` depend on `require_verified_producer` (`app/auth.py`) =
> `require_producer` (role first → "Producer access required") **then** the
> email-verified check (unverified → 403), matching the verification banner's
> promise. `POST /experiences` already used `require_verified_email` and is
> unchanged. Non-create producer routes (PUT/update, list/delete) stay on
> `require_producer`. No schema change — uses the existing
> `users.email_verified`. (`POST /group-buys` has no dedicated block below;
> noted here.)
>
> **MEH-1164 sub-chunk B — structured 403 detail.** The unverified-email 403
> `detail` is now an **object** `{"code": "email_unverified", "message": "יש
> לאמת את כתובת האימייל תחילה"}` (all four gated creates — the three above plus
> `POST /experiences`). `code` is the stable, locale-neutral field the frontend
> matches on (`lib/errors.js:isUnverifiedEmailError`) to render the inline
> resend-verification CTA; `message` keeps the original Hebrew constant for
> transition safety. The role-first 403 (`"Producer access required"`) stays a
> plain string. Additive — no schema change.

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
GET    /producers                                 public — filters: lat+lng+radius_km, require_physical, category, delivery_city,
                                               has_delivery, verified, kosher, city (producer city), is_available_today, grass_fed
                                               sort: newest (default) | rating (MEH-1483). "newest"/absent → created_at DESC
                                               (byte-identical default). "rating" → avg_rating DESC, NULLs last, tiebreak
                                               reviews_count DESC, then created_at DESC. Any other value → 422 "ערך מיון לא חוקי".
                                               Non-geo only (geo results always order by distance). Drives the /producers sort select.
                                               MEH-1465: ?category is REPEATABLE (list[int]) — ?category=1&category=2 ORs over the
                                               ids (a producer in any selected category matches). A single ?category=5 still works
                                               (parses to [5]). Filtered via EXISTS on producer_categories (Producer.categories.any),
                                               so a producer in two selected categories appears once; X-Total-Count stays consistent.
                                               MEH-1282: ?require_physical (geo-only, default false). Geo results include
                                               delivery-only producers (has_physical_location=false) by default so the home
                                               "קרוב אליי" flow surfaces every nearby business; require_physical=true keeps
                                               MEH-213's has_physical_location filter (map-pin semantics). No effect outside geo mode.
                                               MEH-986 ch3b (P0 legal — חוק איסור הונאה בכשרות): ?kosher is VERIFIED-ONLY.
                                               kosher=true → kashrut_verified_at IS NOT NULL (admin-stamped, admin_kashrut.py:75);
                                               kosher=false → kashrut_verified_at IS NULL. NEVER keys off the free-text
                                               Producer.kosher column (which no longer serializes on public ProducerListOut/
                                               DetailOut — kept only on ProducerAdminOut/OwnerOut).
                                               MEH-1259 (P0 legal — חוק תוצרת אורגנית 2005): ?organic REMOVED — it matched the
                                               self-declared organic_certified boolean (unverified). Re-add only behind an
                                               admin-verified flow. Column + owner toggle + admin checkbox kept.
GET    /producers/{producer_id}                   public
GET    /producers/{producer_id}/google-rating     public — MEH-1490: live Google-rating trust line. Read-only
                                               server-side proxy to Places API (New) (X-Goog-FieldMask:
                                               rating,userRatingCount,googleMapsUri). NEVER persists any value
                                               (ToS §3.2.3(b) No Caching). 200 → { rating, user_rating_count,
                                               google_maps_uri } only when a place_id is mapped AND count ≥ 20;
                                               204 (fail-quiet) on no place_id / count<20 / API error / no
                                               GOOGLE_PLACES_API_KEY; 404 only for an unknown producer. 60/min.
GET    /producers/by-slug/{slug}                  public
GET    /producers/cities                          public — MEH-970: per-city APPROVED-producer counts for /map.
                                               GROUP BY city over approved producers; NULL/blank city omitted;
                                               ordered count desc, then city. Counts live from DB (MEH-519 over-claim guard).
                                               response_model=list[ProducerCityOut] → [{ "city": str, "count": int }]
GET    /producers/random                          public — MEH-1288: one random APPROVED producer for the homepage
                                               "הפתיעו אותי" button. ORDER BY random() LIMIT 1; 404 when the catalog is
                                               empty (button is render-gated client-side on statsProducersCount > 0).
                                               Declared BEFORE /producers/{producer_id} (route-order guard).
                                               response_model=ProducerRandomOut → { "id": UUID, "slug": str|null }
POST   /producers                                 auth   — self-register (writes pending)
GET    /categories                                public

# Follow / unfollow producers (v1 data layer only, notifications in v2)
POST   /producers/{producer_id}/follow            auth
DELETE /producers/{producer_id}/follow            auth
GET    /producers/{producer_id}/follow-status     auth
GET    /users/me/following                        auth

# Producer-self (role=producer)
GET    /producers/me                              producer
PUT    /producers/me                              producer — MEH-999: license gate grandfathers already-held categories (validates NEWLY-ADDED category_ids only, so MEH-971 license-pending producers can edit their profile); clearing a held producer_license_number while a license-required category remains → 422
POST   /producers/me/verify-phone                producer  — send WhatsApp OTP (3/10min)
POST   /producers/me/verify-phone/confirm        producer  — confirm code, sets phone_verified (5/min)
POST   /producers/me/kashrut-request             producer  — request a kashrut badge (10/hr)
POST   /producers/me/request-review              producer  — MEH-1236 resubmit-for-review ping: pending/pending_whatsapp only (else 409), 3/hr; notification-only (admin WhatsApp+email via notify_admin_producer_resubmit, fail-open) — NO DB write, requested_changes stays admin-owned
POST   /producers/me/availability                 producer  — toggle is_available_today (legacy; mirrors to availability_state during MEH-291 7-day overlap)
POST   /producers/me/availability-status           producer  — set durable status (legacy; mirrors to availability_state during MEH-291 overlap)
POST   /producers/me/availability-state            producer  — MEH-291 unified 4-value enum
                                                              body: { state: "accepting_orders"|"available_today"|"full_this_week"|"on_vacation",
                                                                      vacation_until?: ISO date }
                                                              vacation_until REQUIRED when state="on_vacation" (422 with "תאריך חזרה לחופשה נדרש")
                                                              dual-writes to is_available_today + availability_status during 7-day overlap
                                                              GET /producers supports ?availability_state= filter (opt-in; default listing unchanged in Phase 2)
GET    /producers/me/locations                    producer  — MEH-1421 (MEH-1388 chunk 4a): owner's producer_locations
                                                              rows (ProducerLocationOwnerOut — full, incl. address/hours/phone),
                                                              ordered primary-first then created_at
POST   /producers/me/locations                    producer  — create a location (60/hr). ProducerLocationCreate.
                                                              First location forced is_primary; is_primary=true clears others.
                                                              same-city label rule → 422 "כשיש שני מיקומים באותה עיר יש להוסיף תווית מזהה"
PUT    /producers/me/locations/{id}               producer  — update (60/hr). Cross-owner id → 403 "אין הרשאה למיקום זה"
                                                              (missing id → 404). Demoting the sole primary → 422 "חובה מיקום ראשי אחד".
                                                              same-city check only when city/label in the patch.
DELETE /producers/me/locations/{id}               producer  — delete. Cross-owner → 403. Deleting the primary promotes
                                                              the oldest survivor so exactly one primary remains.
GET    /producers/me/dashboard                    producer  — stable legacy: favorites_count + whatsapp_clicks_week
GET    /producers/me/analytics                    producer  — feature/producer-analytics (April 2026)
                                                              profile_views / search_appearances / whatsapp_clicks
                                                              as {last_7d, last_30d, total}; follower_count +
                                                              new_followers_this_week (MEH-1364: counted from
                                                              favorites, the canonical interest record — decision A);
                                                              average_rating + total_reviews;
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
GET    /events                    public — filter: city, category, from_date, to_date; approved producers only (MEH-1161; owner sees own via ?producer_id=, admin sees all)
GET    /events/upcoming            public — limit=N next events; approved producers only (MEH-1161)
GET    /events/mine                producer — owner's own events, ALL states incl. inactive (MEH-1405; dashboard manage list). Declared before /events/{id} so "mine" isn't a UUID path.
GET    /events/{event_id}          public — pending producer's event → 404 for strangers (MEH-1161; owner/admin bypass)
POST   /events                     producer — require_verified_producer (MEH-1164 F5): producer role + verified email — unverified → 403 "יש לאמת את כתובת האימייל תחילה"; non-producer → "Producer access required" (role checked first). A pending producer's event stays hidden until the business is approved — MEH-1161
PUT    /events/{event_id}          producer — owner only (cross-owner → 404)
DELETE /events/{event_id}          auth    — owner or admin (stranger → 404)
```

No per-event moderation. An **approved** producer publishes and it's live;
a **pending** producer's events exist but are invisible to the public until
the business is approved (MEH-1161, audit F1). Designed for the
"יום קטיף / סיור בחווה" calendar on producer pages. Category enum:
`סדנה | סיור | שוק | קטיף | טעימות | אחר`.

**MEH-1001 (existence-leak):** a cross-owner PUT/DELETE returns **404
"Event not found"**, not 403 — a foreign producer can't confirm an
event id exists (matches `producer_recipes.py:203-206`). DELETE keeps
its admin-override, so an admin still deletes (→ 200).

### Experiences (community workshops — `app/routers/experiences.py`)

```
POST   /experiences/validate           public  — 30/hour, real-time Claude Haiku hint
GET    /experiences                    public  — filter: category, city. Only approved+upcoming+is_active (MEH-1419).
GET    /experiences/mine               auth    — owner's submissions, any status (incl. is_active=False)
GET    /experiences/{id}               mixed   — approved=public; non-approved=owner+admin
POST   /experiences                    auth    — require_verified_email (already gated pre-MEH-1164 — left unchanged by Chunk 2A). 10/hour. REJECTED → 400. APPROVED/FLAGGED → pending.
PUT    /experiences/{id}               auth    — owner only (cross-owner → 404). A CONTENT edit resets to status=pending + re-runs Claude; a pure is_active toggle (cancel/reactivate, MEH-1419) does NOT re-moderate.
DELETE /experiences/{id}               auth    — owner or admin (stranger → 404)
```

**MEH-1001 (existence-leak):** a cross-owner PUT/DELETE returns **404
"Experience not found"**, not 403 — a stranger can't confirm an experience
id exists (matches `producer_recipes.py:203-206` + events). DELETE keeps
its admin-override (admin → 200).

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
POST   /admin/producers/{id}/request-changes   admin — MEH-1011: feedback required (empty → 400); pending-only (409 if status ∉ pending/pending_whatsapp, MEH-769 precedent); NON-terminal (status stays pending), sets requested_changes + changes_requested_at (tz-aware), emails producer + WhatsApp admin; cleared on approve
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
GET    /admin/categories                       admin — rows include producer_count (query-time, MEH-1034)
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
# Producer self (require_producer; create = require_verified_producer)
POST   /producers/me/recipes                producer  — require_verified_producer (MEH-1164 F5: verified email; unverified → 403) — 10/hr — Claude pre-check, REJECTED→400
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
DELETE /reviews/{id}             auth  — owner or admin (stranger → 404)
```

**MEH-1001 (existence-leak):** a non-owner-non-admin DELETE returns **404
"ביקורת לא נמצאה"**, not 403 — review existence isn't leaked. Admin-override
preserved (admin → 200).

### Reports (`app/routers/reports.py`)

```
POST /producers/{id}/report                auth  — 3 OPEN reports auto-flag for admin; 409 if already reported (MEH-773)
GET  /admin/reports                        admin — every producer with >=1 OPEN report; report_count (open) + auto_flagged (>=3). Closed excluded (MEH-1266)
POST /admin/reports/{report_id}/resolve    admin — status→resolved + resolved_at/by; 409 if already closed (MEH-1266)
POST /admin/reports/{report_id}/dismiss    admin — status→dismissed + resolved_at/by; 409 if already closed (MEH-1266)
```

### Info-report — "מצאתן טעות בפרטים?" (`app/routers/report_info.py`)

```
POST /reports/producer-info    🌐 public, rate-limited 5/day/IP — visitor reports wrong info on a producer page.
                               Body {producer_slug, message(1..1000), reporter_email?}. Resolves producer by slug
                               OR uuid id (else 404). Emails admin (RTL HTML, message escaped); NO DB persist. 204.
                               MEH-1443. Distinct from the DB-backed abuse reports above.
```

### Marketing (`app/routers/marketing.py`)

```
GET  /stats                      public — { producers_count, categories_count, cities_count }
POST /newsletter                 public — { email } → newsletter_subscribers
                                 rate-limited 5/hour per IP
POST /contact                    public — { name, email, message, topic? } → contact_messages row
                                 + SMTP email to CONTACT_EMAIL (falls back to
                                 ADMIN_EMAIL). Fail-open: if SMTP is unconfigured
                                 or raises, the submission is still persisted.
                                 rate-limited 5/hour per IP
                                 topic (MEH-1113): optional, whitelist
                                 {business, general, correction, other}; invalid → 422
                                 (Hebrew detail), missing/None → "general". No DB column —
                                 the Hebrew label is prepended to the stored message
                                 ("נושא: <label>") and to the email subject. Single source:
                                 CONTACT_TOPIC_LABELS in schemas.py:2074.
GET  /cities                     public — canonical cities table (data.gov.il seed,
                                 MEH-1343) ∪ live producer/delivery cities; static
                                 list only as unseeded-env fallback (MEH-1349)
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
POST /upload/owner-photo         auth+producer — MEH-1335 owner photo; no freemium gate, square crop,
                                 folder mehamakor/owner, public_id=owner_{producer_id} overwrite=True,
                                 writes producers.owner_photo_url atomically
```

### Health (`app/routers/health.py`)

Three surfaces, one owner. All public, all unrate-limited. Undocumented since
MEH-483 shipped them; added in MEH-1598 alongside the MEH-1596 version block.

```
GET/HEAD /health/liveness        public — {"status":"alive"}. Always 200 while the worker is up.
                                 No DB call, no app.state read.

GET/HEAD /health/readiness       public — 200 {"status":"ready","migrations":<rev|"unknown">,
                                 "db_init":<state>} only when SELECT 1 succeeds AND db_init
                                 settled. Otherwise 503 {"status":"not_ready","reason":...}:
                                   db_unreachable:<ExcName>  SELECT 1 raised
                                   db_init_failed            db_init_status == "failed"
                                   db_init_pending           db_init_status == "initializing"
                                 A 503 here means the boot-time DB init (create_all + seed)
                                 failed or has not finished — NOT that the service is down.
                                 The process is serving; it is not ready. MEH-1530 Chunk 2
                                 points the Railway healthcheck here, so read the `reason`
                                 before concluding anything.
                                 `migrations` is "unknown" when the alembic_version table is
                                 absent (e.g. a create_all-bootstrapped DB) — informational,
                                 never a readiness failure.

GET/HEAD /health                 public — backwards-compat alias, the path Railway currently
                                 polls (railway.json). ALWAYS 200; it never reports failure
                                 via status code, only via the db_init field.
                                 {"status":"ok","db_init":<state>,"version":{...}}
                                 `version` carries EXACTLY FOUR fields (MEH-1596):
                                   git_sha       GIT_SHA or RAILWAY_GIT_COMMIT_SHA
                                   git_branch    GIT_BRANCH or RAILWAY_GIT_BRANCH
                                   alembic_head  revision cached ONCE at startup, not per request
                                   booted_at     UTC ISO-8601 process start
                                 Any of the four may be the string "unknown" — that is a known
                                 state, not a bug. alembic_head is "unknown" whenever the
                                 alembic_version table is absent or was unreadable at startup;
                                 git_sha/git_branch are "unknown" when the env vars are unset
                                 or empty. Nothing here raises: a health endpoint that 500s is
                                 worse than one that says it does not know.
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
