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
        uuid producer_id FK "nullable, links to owned producer"
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
        string description
        string city
        float lat "indexed with lng"
        float lng
        string status "pending|approved|rejected"
        boolean is_verified
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
        timestamp created_at
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
        string status "open|resolved|dismissed"
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
```

## Locked invariants (do not drift)

- **No PostGIS.** `producers.lat` + `producers.lng` are plain `FLOAT`. Distance queries use Haversine in raw SQL (see `backend/app/routers/producers.py::_haversine_km`). Reverting this breaks Railway deploy.
- **IPs are always hashed.** `producer_page_views.viewer_ip_hash` is SHA-256 of `ip + settings.secret_key[:32]` — never raw IP, per Privacy Law amendment 13 (2025) and `docs/SECURITY.md` §8a.
- **Cached rating aggregates.** `producers.avg_rating` + `producers.reviews_count` are cached from `producer_reviews` to avoid a JOIN on every producer detail request. Update them transactionally when writing/deleting a review.
- **Experience vs Event moderation are different flows.** Events: direct admin approval. Experiences: Claude Haiku pre-check → admin queue → approval. Don't conflate them (see `docs/MODERATION.md`).
