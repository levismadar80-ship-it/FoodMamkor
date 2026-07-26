# מהמקור — DB schema

> Mermaid ER diagram for the main tables + relationships. **Source of
> truth is `backend/app/models/models.py`** — if this drifts, update
> the diagram in the same PR (workflow rule 11).
>
> Grouped into four logical clusters to keep the diagram legible:
>   1. Core directory (producers, categories, delivery, users)
>   2. Community content (home products, experiences, events)
>   3. Trust & safety (reviews, reports, moderation, favorites, followers)
>   4. Analytics (views, WhatsApp clicks, DAU) + marketing (newsletter, contact)

## 1. Core directory

```mermaid
erDiagram
    users ||--o{ favorites : "saves"
    users ||--o| producers : "owns (1:1 via users.producer_id)"
    producers ||--o{ producer_categories : "tagged_with"
    producers ||--o{ products : "sells"
    producers ||--o{ delivery_areas : "delivers_to"
    categories ||--o{ producer_categories : ""

    users {
        uuid id PK
        string email UK
        string name
        string password_hash "nullable for OAuth"
        string city
        string phone
        string role "consumer|producer|admin"
        uuid producer_id FK "nullable, links to owned producer; ON DELETE SET NULL (MEH-773)"
        string google_id UK
        string apple_id UK
        boolean is_blocked
        timestamp created_at
        timestamp last_active_at "indexed, feeds DAU chart"
    }

    producers {
        uuid id PK
        string name
        string slug UK "nullable"
        string google_place_id "nullable — MEH-1490 admin map; only Google datum stored"
        string description
        string city
        string address "nullable — MEH-829, VARCHAR(255); collected at register"
        float lat "indexed with lng"
        float lng
        string status "pending|approved|rejected"
        float avg_rating "cached aggregate"
        int reviews_count "cached aggregate"
        boolean is_available_today "legacy — preserved during MEH-291 overlap"
        string availability_status "legacy — preserved during MEH-291 overlap"
        string availability_state "MEH-291 — accepting_orders|available_today|full_this_week|on_vacation"
        date vacation_until "nullable — required when availability_state=on_vacation"
        string plan "free|premium"
        boolean grass_fed
        boolean organic_certified
        string kosher
        string facebook "nullable — MEH-296, VARCHAR(200) — producer FB page/Messenger link"
        string external_order_form "nullable — MEH-296, VARCHAR(500) — external order-form URL"
        int risk_score "nullable — MEH-509 PR3, Anthropic Haiku 0-100, fail-open NULL"
        text risk_reasoning "nullable — one-sentence Hebrew explanation, truncated to 500 chars"
        timestamp declared_at "nullable — MEH-759, tz-aware; binding tier-2 declaration timestamp"
        string declaration_version "nullable — MEH-759, VARCHAR(10); declaration text version (e.g. 2026-06-v1)"
        timestamp verified_at "nullable — MEH-762, tz-aware; admin tier-1 document-check timestamp (public at date granularity)"
        string verification_doc_type "nullable — MEH-762, VARCHAR(20); license|exemption|cosmetics (S12 badge source)"
        text requested_changes "nullable — MEH-1011, admin completion-request feedback (non-terminal, status stays pending; cleared on approve)"
        timestamp changes_requested_at "nullable — MEH-1011, tz-aware; when the completion request was sent"
        timestamp created_at
        timestamp updated_at "nullable — MEH-1291, tz-aware; onupdate=func.now() stamp, no backfill; public freshness signal (ProducerDetailOut)"
        text owner_bio "nullable — MEH-1335, app-capped 300; public OwnerCard story (NULL = compact variant)"
        string owner_photo_url "nullable — MEH-1335, VARCHAR(500); Cloudinary mehamakor/owner, written by POST /upload/owner-photo"
        integer established_year "nullable — MEH-1541, self-reported founding year; app-validated 1800..current year; public 'מאז {שנה}' masthead line (NULL = absent from DOM)"
        string referral_source "nullable — MEH-1471, VARCHAR(40); self-reported attribution English key (admin-only, ProducerAdminOut)"
        string referral_source_other "nullable — MEH-1471, VARCHAR(120); free-text 'other' answer, bleach-sanitised"
    }

    categories {
        int id PK
        string name UK
        string emoji
    }

    products {
        uuid id PK
        uuid producer_id FK
        string name
        string description
        string price_range "legacy: drop tracked in MEH-295 follow-up"
        string image_url
        decimal price_min "MEH-295: NUMERIC(10,2) NULL"
        decimal price_max "MEH-295: NUMERIC(10,2) NULL"
        boolean is_gluten_free "MEH-293/MEH-479: single source of truth"
        boolean is_vegan "MEH-293/MEH-479: single source of truth"
        boolean is_vegetarian "MEH-1438: 4th dietary axis; ?vegetarian matches is_vegetarian OR is_vegan"
        boolean is_lactose_free "MEH-293/MEH-479: single source of truth"
    }

    delivery_areas {
        uuid id PK
        uuid producer_id FK
        string city
        int min_order
        string delivery_day
    }

    favorites {
        uuid user_id FK "composite PK"
        uuid producer_id FK "composite PK"
        timestamp created_at
    }

    producer_categories {
        uuid producer_id FK "composite PK"
        int category_id FK "composite PK"
        int position "MEH-1297: 0 = primary (first selected)"
    }
```

## 2. Community content — home products, events, experiences

```mermaid
erDiagram
    users ||--o{ home_products : "lists"
    users ||--o{ events : "hosts (producer)"
    users ||--o{ experiences : "hosts (producer)"
    home_products ||--o{ home_product_whatsapp_clicks : "gets clicks"
    home_product_whatsapp_clicks ||--o| home_product_ratings : "optional 1:1"

    home_products {
        uuid id PK
        uuid user_id FK
        string title
        text description
        string phone
        string city
        string neighborhood
        int quantity
        numeric price
        string category
        string moderation_status "APPROVED|FLAGGED|REJECTED"
        text moderation_reason "Claude Opus output"
        text moderation_suggestion
        boolean is_active
        boolean is_hidden
        date available_until
        timestamp created_at
    }

    home_product_whatsapp_clicks {
        uuid id PK
        uuid user_id FK "viewer"
        uuid home_product_id FK
        timestamp clicked_at
        boolean rating_sent "Twilio follow-up 24h"
        boolean rated
        string rating_token UK
    }

    home_product_ratings {
        uuid id PK
        uuid click_id FK UK "one rating per click"
        uuid user_id FK
        int stars "1-5"
        string comment "max 100 chars"
    }

    events {
        uuid id PK
        uuid producer_id FK
        string title
        text description
        date event_date
        time event_time
        numeric price
        int capacity
        string city
        string status "pending|approved|rejected"
    }

    experiences {
        uuid id PK
        uuid user_id FK "host"
        string title
        text description
        string city
        timestamp starts_at
        int duration_minutes
        numeric price
        int capacity
        string status "pending|changes_requested|approved|rejected"
        boolean is_active "MEH-1419: reversible host cancel; public list filters true"
        text moderation_notes "Claude Haiku pre-check output"
        timestamp created_at
    }
```

## 3. Trust & safety — reviews, reports, followers

```mermaid
erDiagram
    users ||--o{ reports : "files"
    users ||--o{ producer_followers : "follows"
    users ||--o{ producer_reviews : "writes"
    producers ||--o{ reports : "reported"
    producers ||--o{ producer_followers : "followed_by"
    producers ||--o{ producer_reviews : "reviewed_by"

    reports {
        uuid id PK
        uuid producer_id FK
        uuid user_id FK "reporter"
        string reason
        string status "open|resolved|dismissed (MEH-1266)"
        timestamp resolved_at "MEH-1266"
        uuid resolved_by FK "users, ON DELETE SET NULL (MEH-1266)"
        timestamp created_at
    }

    producer_followers {
        uuid id PK
        uuid user_id FK
        uuid producer_id FK
        boolean notify_new_products
        boolean notify_back_in_stock
        timestamp created_at
    }

    producer_reviews {
        uuid id PK
        uuid producer_id FK
        uuid user_id FK
        int stars "1-5"
        text comment
        timestamp created_at
    }
```

> **MEH-773 integrity constraints (migration `382128b23383` + Chunk B ORM):**
> `reports` has `UNIQUE(reporter_id, producer_id)` (`uq_report_reporter_producer`)
> and `referral_clicks` has `UNIQUE(referee_id)` (`uq_referral_one_per_referee`)
> — one report per (reporter, producer), one referral credit per referee.
> `users.producer_id` is `ON DELETE SET NULL`. `phone_otp_tokens` and
> `kashrut_badge_requests` carry `ON DELETE CASCADE` producer FKs with ORM
> `passive_deletes=True`, so deleting a producer cascades children at the DB
> layer instead of the ORM nullifying a NOT-NULL column.

> **MEH-272 producer CHECK constraints (migration `f9a2c7d41b83` + ORM
> `__table_args__`):** `producers` carries two CHECK constraints — a producer
> must be reachable (`producer_location_mode`: `has_physical_location OR
> offers_delivery`) and nationwide-delivery excludes an explicit city list
> (`delivery_nationwide_xor_cities`: `NOT (delivery_nationwide AND
> array_length(delivery_cities, 1) > 0)`). Both already lived on prod/staging
> from the removed `_migrate_columns` (MEH-267) but were absent from the ORM +
> baseline, so fresh DBs lacked them; MEH-272 declares them in the model and
> re-adds them idempotently (`IF NOT EXISTS`). Pydantic `model_validator`
> guards the API layer; these protect direct-SQL paths (seeds, imports, psql).

> **MEH-1255 delivery-exclusion (migration `e7c4b1f95a2d` + ORM
> `__table_args__`):** `producers.delivery_excluded_cities` (`TEXT[] NOT NULL
> DEFAULT '{}'`) lists the cities a nationwide producer does NOT deliver to.
> Third CHECK on `producers` — `delivery_excluded_requires_nationwide`
> (`delivery_nationwide OR delivery_excluded_cities = '{}'::text[]`) — keeps it
> empty unless nationwide (sibling of `delivery_nationwide_xor_cities`; the
> NOT-NULL column lets it use the NULL-free equality form). New column, no new
> table (`EXPECTED_TABLES` unchanged). Public on `ProducerListOut`; the
> `?delivery_city=` consumer filter now returns nationwide producers minus
> their exclusions.

## 4. Analytics + marketing

```mermaid
erDiagram
    producers ||--o{ producer_page_views : "view_logged"
    producers ||--o{ producer_whatsapp_clicks : "click_logged"

    producer_page_views {
        uuid id PK
        uuid producer_id FK "indexed"
        string viewer_ip_hash "SHA-256 + rotating salt, never raw IP"
        string city "nullable, from authed viewer.city"
        string referrer "search|map|category|home|favorites|follow|NULL"
        timestamp created_at "indexed"
    }

    producer_whatsapp_clicks {
        uuid id PK
        uuid producer_id FK "indexed"
        timestamp clicked_at "indexed"
    }

    newsletter_subscribers {
        uuid id PK
        string email UK
        timestamp created_at
    }

    contact_messages {
        uuid id PK
        string name
        string email
        text message
        timestamp created_at
    }

    admin_settings {
        string key PK
        text value
        timestamp updated_at
    }

    static_pages {
        string slug PK "about|terms"
        string title
        text body
        timestamp updated_at
    }

    inbound_messages {
        uuid id PK
        string from_phone "indexed (MEH-509 PR2b)"
        text body
        timestamp received_at "indexed"
        string meta_message_id UK "Meta at-least-once idempotency"
        boolean bot_replied "indexed — watchdog gate"
        timestamp bot_replied_at
        string bot_template_sent "audit-trail: NULL = tried + failed"
        boolean human_replied
    }

    alert_log {
        uuid id PK
        uuid user_id FK "CASCADE"
        uuid producer_id FK "CASCADE"
        string channel "push|whatsapp (16)"
        string alert_type "new_event|new_product|delivery_area (32)"
        timestamp sent_at "indexed (user,producer,channel,sent_at)"
    }
```

> **MEH-1338 — `alert_log` frequency cap:** append-only ledger backing the
> `fire_alerts` cap (≤1 message per `(user, producer, channel)` per rolling 24h;
> `alert_type` recorded but not part of the cap key). Composite index
> `ix_alert_log_cap_lookup(user_id, producer_id, channel, sent_at)` serves the
> EXISTS check. Adds one table → **`EXPECTED_TABLES` 36 → 37** (`pr-checks.yml`).
> No retention/purge job yet (rows CASCADE-delete with their user/producer).

## Locked invariants (do not drift)

- **No PostGIS.** `producers.lat` + `producers.lng` are plain `FLOAT`. Distance queries use Haversine in raw SQL (see `backend/app/routers/producers.py::_haversine_km`). Reverting this breaks Railway deploy.
- **IPs are always hashed.** `producer_page_views.viewer_ip_hash` is SHA-256 of `ip + settings.secret_key[:32]` — never raw IP, per Privacy Law amendment 13 (2025) and `docs/SECURITY.md` §8a.
- **Cached rating aggregates.** `producers.avg_rating` + `producers.reviews_count` are cached from `producer_reviews` to avoid a JOIN on every producer detail request. Update them transactionally when writing/deleting a review.
- **Experience vs Event moderation are different flows.** Events: direct admin approval. Experiences: Claude Haiku pre-check → admin queue → approval. Don't conflate them (see `docs/MODERATION.md`).
