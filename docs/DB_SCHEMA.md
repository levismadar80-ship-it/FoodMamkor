# מהמקור — DB schema (generated)

> **Generated from the SQLAlchemy models — do not edit by hand.** Source:
> `backend/app/models/` via `Base.metadata`; privacy column from
> `docs/privacy/columns.tsv`. Regenerate:
> `UPDATE_DB_SCHEMA_DOC=1 pytest tests/test_db_schema_doc.py` (MEH-3929).
> `tests/test_db_schema_doc.py` fails when this file and the models differ.
> Limit: a Python-side default or on-update is shown by its function name
> (`<lambda>()` for an inline lambda) — read the model for what it computes.
>
> This is the one home for "what columns, types and constraints exist". The
> relationship picture is `.ai/diagrams/db-schema.md` and the prose (why a
> column exists, which PR) is `docs/DATA.md` «DB Schema»; where either
> disagrees with this file, this file is right.

<!-- BEGIN GENERATED: tests/test_db_schema_doc.py -->

70 tables, 831 columns.

| table | columns | FKs out |
|---|---|---|
| `admin_audit_log` | 8 | — |
| `admin_checklist_items` | 6 | — |
| `admin_passkeys` | 12 | users |
| `admin_recovery_codes` | 5 | users |
| `admin_settings` | 3 | — |
| `alembic_lineage` | 2 | — |
| `alert_log` | 6 | producers, users |
| `billable_events` | 13 | producers |
| `business_billing` | 7 | producers |
| `categories` | 6 | — |
| `category_requests` | 8 | producers |
| `cities` | 5 | — |
| `contact_messages` | 5 | — |
| `delivery_areas` | 13 | producers |
| `delivery_waitlist` | 11 | producers, users |
| `email_events` | 9 | users |
| `email_outbox` | 13 | — |
| `events` | 19 | producers |
| `experiences` | 34 | users |
| `favorite_alerts` | 13 | producers, users |
| `favorites` | 3 | producers, users |
| `group_buy_commits` | 9 | group_buys, users |
| `group_buy_waitlist` | 6 | group_buys, users |
| `group_buys` | 27 | producer_locations, producers |
| `home_product_ratings` | 7 | home_product_whatsapp_clicks, home_products, users |
| `home_product_whatsapp_clicks` | 7 | home_products, users |
| `home_products` | 30 | users |
| `inbound_messages` | 9 | — |
| `kashrut_badge_requests` | 8 | producers, users |
| `newsletter_subscribers` | 3 | — |
| `outbound_messages` | 9 | — |
| `outreach_leads` | 19 | — |
| `phone_otp_tokens` | 7 | producers |
| `producer_analytics_daily` | 6 | producers |
| `producer_categories` | 3 | categories, producers |
| `producer_contact_clicks` | 6 | producers, users |
| `producer_locations` | 19 | producers |
| `producer_name_change_requests` | 9 | producers |
| `producer_offers` | 11 | producers |
| `producer_order_settings` | 13 | producers |
| `producer_order_windows` | 7 | producers |
| `producer_page_views` | 6 | producers |
| `producer_recipe_products` | 2 | producer_recipes, products |
| `producer_recipes` | 15 | producers |
| `producer_review_checks` | 6 | admin_checklist_items, producers, users |
| `producer_reviews` | 13 | producers, users |
| `producer_staff` | 12 | producers, users |
| `producer_whatsapp_clicks` | 5 | producers, users |
| `producers` | 124 | products, users |
| `product_order_events` | 8 | product_orders, users |
| `product_order_items` | 11 | product_orders, product_variants, products |
| `product_order_notifications` | 10 | product_orders |
| `product_order_phone_codes` | 7 | — |
| `product_orders` | 30 | producers, users |
| `product_variants` | 6 | products |
| `products` | 30 | producers |
| `registrations` | 16 | events, experiences |
| `reports` | 8 | producers, users |
| `rescue_no_show_tombstones` | 4 | — |
| `rescue_offers` | 15 | producer_locations |
| `rescue_orders` | 11 | rescue_offers, users |
| `rescue_reviews` | 8 | rescue_orders |
| `rescue_typical_items` | 6 | producers |
| `retired_slugs` | 4 | producers |
| `saved_items` | 5 | users |
| `search_queries` | 4 | — |
| `share_links` | 7 | producers, users |
| `static_pages` | 4 | — |
| `user_phone_otp_tokens` | 8 | users |
| `users` | 30 | producers |

### `admin_audit_log`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | identity |
| `actor_id` | `UUID` | NOT NULL |  |  | identity |
| `action` | `VARCHAR(160)` | NOT NULL |  |  | identity |
| `target_type` | `VARCHAR(40)` | yes |  |  | identity |
| `target_id` | `VARCHAR(64)` | yes |  |  | identity |
| `details` | `JSONB` | yes |  |  | identity |
| `ip` | `VARCHAR(64)` | yes |  |  | technical |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | server: `now()` |  | identity |

**Indexes**

- `ix_admin_audit_log_actor_id` (actor_id)
- `ix_admin_audit_log_created_at` (created_at)

### `admin_checklist_items`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | not-personal |
| `position` | `INTEGER` | NOT NULL |  |  | not-personal |
| `label` | `TEXT` | NOT NULL |  |  | not-personal |
| `hint` | `TEXT` | yes |  |  | not-personal |
| `active` | `BOOLEAN` | NOT NULL | server: `true`<br>app: `True` |  | not-personal |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | server: `now()`<br>on update: `now()` |  | not-personal |

**Indexes**

- `ix_admin_checklist_items_position` (position)

### `admin_passkeys`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | technical |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | technical |
| `credential_id` | `BYTEA` | NOT NULL |  | UNIQUE | technical |
| `public_key` | `BYTEA` | NOT NULL |  |  | technical |
| `sign_count` | `BIGINT` | NOT NULL | server: `0`<br>app: `0` |  | technical |
| `aaguid` | `VARCHAR(36)` | yes |  |  | technical |
| `backup_eligible` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | technical |
| `backup_state` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | technical |
| `transports` | `VARCHAR(120)` | yes |  |  | technical |
| `name` | `VARCHAR(60)` | yes |  |  | technical |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | server: `now()` |  | technical |
| `last_used_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | technical |

**UNIQUE**

- (credential_id)

**Indexes**

- `ix_admin_passkeys_user_id` (user_id)

### `admin_recovery_codes`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | technical |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | technical |
| `code_hash` | `VARCHAR(128)` | NOT NULL |  |  | technical |
| `used_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | technical |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | server: `now()` |  | technical |

**Indexes**

- `ix_admin_recovery_codes_user_id` (user_id)

### `admin_settings`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `key` | `VARCHAR(100)` | NOT NULL |  | PK | not-personal |
| `value` | `TEXT` | yes |  |  | not-personal |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()`<br>on update: `utc_now()` |  | not-personal |

### `alembic_lineage`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `revision` | `VARCHAR(64)` | NOT NULL |  | PK | not-personal |
| `recorded_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | server: `now()` |  | not-personal |

### `alert_log`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | technical |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | technical |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | technical |
| `channel` | `VARCHAR(16)` | NOT NULL |  |  | technical |
| `alert_type` | `VARCHAR(32)` | NOT NULL |  |  | technical |
| `sent_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | technical |

**Indexes**

- `ix_alert_log_cap_lookup` (user_id, producer_id, channel, sent_at)

### `billable_events`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | yes |  | FK → `producers.id` ON DELETE SET NULL | business |
| `producer_ref` | `UUID` | NOT NULL | app: `<lambda>()` |  | business |
| `kind` | `VARCHAR(30)` | NOT NULL |  |  | business |
| `source_id` | `UUID` | NOT NULL |  |  | business |
| `occurred_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | app: `<lambda>()` |  | business |
| `quantity` | `INTEGER` | NOT NULL | app: `1` |  | business |
| `base_amount_agorot` | `BIGINT` | NOT NULL | app: `0` |  | business |
| `fee_agorot` | `BIGINT` | NOT NULL | app: `0` |  | business |
| `price_list_version` | `INTEGER` | NOT NULL |  |  | business |
| `status` | `VARCHAR(10)` | NOT NULL | app: `'counted'` |  | business |
| `voided_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | app: `<lambda>()` |  | business |

**CHECK**

- `ck_billable_events_amounts`: `base_amount_agorot >= 0 AND fee_agorot >= 0`
- `ck_billable_events_kind`: `kind IN ('event_registration','experience_registration','group_buy_order','rescue_bag','product_order')`
- `ck_billable_events_quantity`: `quantity >= 1`
- `ck_billable_events_status`: `status IN ('counted','voided')`

**UNIQUE**

- `uq_billable_events_kind_source`: (kind, source_id)

**Indexes**

- `ix_billable_events_producer_occurred` (producer_id, occurred_at)

### `business_billing`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `producer_id` | `UUID` | NOT NULL |  | PK<br>FK → `producers.id` ON DELETE CASCADE | business |
| `state` | `VARCHAR(12)` | NOT NULL |  |  | business |
| `state_since` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | app: `<lambda>()` |  | business |
| `price_list_version` | `INTEGER` | yes |  |  | business |
| `subscribed` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | app: `<lambda>()` |  | business |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | app: `<lambda>()`<br>on update: `<lambda>()` |  | business |

**CHECK**

- `ck_business_billing_state`: `state IN ('launch','notice','active','page_only','unpaid')`

### `categories`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `INTEGER` | NOT NULL |  | PK | not-personal |
| `name` | `VARCHAR(100)` | NOT NULL |  | UNIQUE | not-personal |
| `slug` | `VARCHAR(50)` | NOT NULL | app: `_column_default()` | UNIQUE | not-personal |
| `emoji` | `VARCHAR(10)` | yes |  |  | not-personal |
| `is_system` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | not-personal |
| `requires_license` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | not-personal |

**UNIQUE**

- (name)
- `uq_categories_slug`: (slug)

### `category_requests`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `requested_name` | `VARCHAR(100)` | NOT NULL |  |  | business |
| `examples` | `TEXT` | yes |  |  | business |
| `producer_id` | `UUID` | yes |  | FK → `producers.id` ON DELETE SET NULL | business |
| `status` | `VARCHAR(20)` | NOT NULL | app: `'pending'` |  | business |
| `admin_notes` | `TEXT` | yes |  |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | business |
| `reviewed_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |

**Indexes**

- `ix_category_requests_producer_id` (producer_id)
- `ix_category_requests_status` (status)

### `cities`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `INTEGER` | NOT NULL |  | PK | not-personal |
| `name_he` | `VARCHAR(100)` | NOT NULL |  | UNIQUE | not-personal |
| `lat` | `FLOAT` | yes |  |  | not-personal |
| `lng` | `FLOAT` | yes |  |  | not-personal |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | not-personal |

**UNIQUE**

- (name_he)

### `contact_messages`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | ugc |
| `name` | `VARCHAR(200)` | NOT NULL |  |  | ugc |
| `email` | `VARCHAR(200)` | NOT NULL |  |  | ugc |
| `message` | `TEXT` | NOT NULL |  |  | ugc |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | ugc |

### `delivery_areas`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `city` | `VARCHAR(100)` | NOT NULL |  |  | business |
| `min_order` | `INTEGER` | yes |  |  | business |
| `delivery_day` | `VARCHAR(50)` | yes |  |  | business |
| `delivery_fee` | `INTEGER` | yes |  |  | business |
| `zone_name` | `VARCHAR(40)` | yes |  |  | business |
| `delivery_days` | `VARCHAR(10)[]` | yes |  |  | business |
| `free_delivery_above` | `INTEGER` | yes |  |  | business |
| `delivery_days_min` | `SMALLINT` | yes |  |  | business |
| `delivery_days_max` | `SMALLINT` | yes |  |  | business |
| `order_cutoff_day` | `VARCHAR(10)` | yes |  |  | business |
| `order_cutoff_time` | `VARCHAR(5)` | yes |  |  | business |

### `delivery_waitlist`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | identity |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | identity |
| `city` | `VARCHAR(60)` | NOT NULL |  |  | identity |
| `city_key` | `VARCHAR(60)` | NOT NULL |  |  | identity |
| `email` | `VARCHAR(200)` | NOT NULL |  |  | identity |
| `user_id` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | identity |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | identity |
| `notified_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | identity |
| `wants_to_host` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | identity |
| `host_confirm_sent_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | identity |
| `host_confirmed_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | identity |

**UNIQUE**

- `uq_delivery_waitlist_city_email`: (producer_id, city_key, email)

**Indexes**

- `ix_delivery_waitlist_email_host_sent` (email, host_confirm_sent_at)
- `ix_delivery_waitlist_producer_city` (producer_id, city_key)

### `email_events`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | messages |
| `svix_id` | `VARCHAR(64)` | NOT NULL |  | UNIQUE | messages |
| `event_type` | `VARCHAR(40)` | NOT NULL |  |  | messages |
| `kind` | `VARCHAR(40)` | NOT NULL | app: `'other'` |  | messages |
| `user_id` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | messages |
| `recipient_domain` | `VARCHAR(255)` | yes |  |  | messages |
| `resend_email_id` | `VARCHAR(64)` | yes |  |  | messages |
| `detail` | `VARCHAR(80)` | yes |  |  | messages |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | messages |

**UNIQUE**

- (svix_id)

**Indexes**

- `ix_email_events_created_at` (created_at)
- `ix_email_events_kind_created_at` (kind, created_at)
- `ix_email_events_user_id` (user_id)

### `email_outbox`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | messages |
| `kind` | `VARCHAR(40)` | NOT NULL |  |  | messages |
| `to_email` | `VARCHAR(320)` | yes |  |  | messages |
| `subject` | `TEXT` | yes |  |  | messages |
| `body` | `TEXT` | yes |  |  | messages |
| `html` | `TEXT` | yes |  |  | messages |
| `reply_to` | `VARCHAR(320)` | yes |  |  | messages |
| `outcome` | `VARCHAR(10)` | NOT NULL | server: `'pending'`<br>app: `'pending'` |  | messages |
| `send_after` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | messages |
| `attempts` | `INTEGER` | NOT NULL | server: `0`<br>app: `0` |  | messages |
| `last_error` | `VARCHAR(20)` | yes |  |  | messages |
| `sent_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | messages |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | messages |

**CHECK**

- `email_outbox_outcome_check`: `outcome IN ('pending', 'sent', 'failed', 'skipped')`

**Indexes**

- `ix_email_outbox_created_at` (created_at)
- `ix_email_outbox_due` (send_after) WHERE `outcome = 'pending'`

### `events`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `title` | `VARCHAR(300)` | NOT NULL |  |  | business |
| `description` | `TEXT` | yes |  |  | business |
| `event_date` | `DATE` | NOT NULL |  |  | business |
| `event_time` | `TIME WITHOUT TIME ZONE` | yes |  |  | business |
| `end_time` | `TIME WITHOUT TIME ZONE` | yes |  |  | business |
| `location` | `VARCHAR(300)` | yes |  |  | business |
| `city` | `VARCHAR(100)` | yes |  |  | business |
| `lat` | `FLOAT` | yes |  |  | business |
| `lng` | `FLOAT` | yes |  |  | business |
| `image_url` | `TEXT` | yes |  |  | business |
| `category` | `VARCHAR(30)` | NOT NULL |  |  | business |
| `price` | `INTEGER` | yes | app: `0` |  | business |
| `max_participants` | `INTEGER` | yes |  |  | business |
| `registration_url` | `VARCHAR(500)` | yes |  |  | business |
| `registration_method` | `VARCHAR(20)` | NOT NULL | server: `'site_form'`<br>app: `'site_form'` |  | business |
| `is_active` | `BOOLEAN` | yes | app: `True` |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | business |

### `experiences`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `title` | `VARCHAR(300)` | NOT NULL |  |  | business |
| `description` | `TEXT` | NOT NULL |  |  | business |
| `image_url` | `TEXT` | yes |  |  | business |
| `category` | `VARCHAR(50)` | yes |  |  | business |
| `host_user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | business |
| `event_date` | `DATE` | NOT NULL |  |  | business |
| `event_time` | `TIME WITHOUT TIME ZONE` | yes |  |  | business |
| `duration_minutes` | `INTEGER` | yes |  |  | business |
| `is_recurring` | `BOOLEAN` | yes | app: `False` |  | business |
| `recurring_schedule` | `TEXT` | yes |  |  | business |
| `sessions` | `JSONB` | yes |  |  | business |
| `course_meetings` | `JSONB` | yes |  |  | business |
| `location_type` | `VARCHAR(20)` | yes | app: `'home'` |  | business |
| `city` | `VARCHAR(100)` | yes |  |  | business |
| `address` | `TEXT` | yes |  |  | business |
| `lat` | `FLOAT` | yes |  |  | business |
| `lng` | `FLOAT` | yes |  |  | business |
| `max_participants` | `INTEGER` | yes |  |  | business |
| `min_participants` | `INTEGER` | yes |  |  | business |
| `participants_count` | `INTEGER` | yes | app: `0` |  | business |
| `price_per_person` | `NUMERIC(10, 2)` | yes |  |  | business |
| `requirements` | `TEXT` | yes |  |  | business |
| `registration_method` | `VARCHAR(20)` | NOT NULL | server: `'site_form'`<br>app: `'site_form'` |  | business |
| `registration_url` | `VARCHAR(500)` | yes |  |  | business |
| `status` | `VARCHAR(30)` | yes | app: `'pending'` |  | business |
| `moderation_status` | `VARCHAR(20)` | yes |  |  | business |
| `moderation_reason` | `TEXT` | yes |  |  | business |
| `moderation_suggestion` | `TEXT` | yes |  |  | business |
| `admin_feedback` | `TEXT` | yes |  |  | business |
| `rejection_reason` | `TEXT` | yes |  |  | business |
| `is_active` | `BOOLEAN` | NOT NULL | server: `true`<br>app: `True` |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | business |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()`<br>on update: `utc_now()` |  | business |

### `favorite_alerts`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | cookies |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | cookies |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | cookies |
| `notify_new_product` | `BOOLEAN` | yes | app: `True` |  | cookies |
| `notify_new_event` | `BOOLEAN` | yes | app: `True` |  | cookies |
| `notify_delivery_area` | `BOOLEAN` | yes | app: `True` |  | cookies |
| `notify_new_recipe` | `BOOLEAN` | yes | app: `True` |  | cookies |
| `notify_new_group_buy` | `BOOLEAN` | yes | app: `True` |  | cookies |
| `notify_new_rescue` | `BOOLEAN` | yes | app: `True` |  | cookies |
| `push_subscription` | `JSON` | yes |  |  | technical |
| `whatsapp_opt_in` | `BOOLEAN` | yes | app: `False` |  | cookies |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | cookies |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()`<br>on update: `utc_now()` |  | cookies |

**UNIQUE**

- `uq_favorite_alert_per_producer`: (user_id, producer_id)

### `favorites`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `user_id` | `UUID` | NOT NULL |  | PK<br>FK → `users.id` ON DELETE CASCADE | cookies |
| `producer_id` | `UUID` | NOT NULL |  | PK<br>FK → `producers.id` ON DELETE CASCADE | cookies |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | cookies |

### `group_buy_commits`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `group_buy_id` | `UUID` | NOT NULL |  | FK → `group_buys.id` ON DELETE CASCADE | orders |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | orders |
| `quantity` | `INTEGER` | NOT NULL | app: `1` |  | orders |
| `phone` | `VARCHAR(30)` | yes |  |  | orders |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | orders |
| `pickup_code` | `VARCHAR(4)` | yes |  |  | orders |
| `handed_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `no_show_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |

**CHECK**

- `group_buy_commits_one_outcome_check`: `handed_at IS NULL OR no_show_at IS NULL`
- `group_buy_commits_pickup_code_check`: `pickup_code IS NULL OR pickup_code ~ '^[0-9]{4}$'`

**UNIQUE**

- `uq_group_buy_commits_code`: (group_buy_id, pickup_code)
- `uq_group_buy_user`: (group_buy_id, user_id)

**Indexes**

- `ix_group_buy_commits_group_buy_id` (group_buy_id)
- `ix_group_buy_commits_user_id` (user_id)

### `group_buy_waitlist`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `group_buy_id` | `UUID` | NOT NULL |  | FK → `group_buys.id` ON DELETE CASCADE | orders |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | orders |
| `quantity` | `INTEGER` | NOT NULL | app: `1` |  | orders |
| `offered_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | orders |

**UNIQUE**

- `uq_group_buy_waitlist_user`: (group_buy_id, user_id)

**Indexes**

- `ix_group_buy_waitlist_group_buy_id` (group_buy_id)
- `ix_group_buy_waitlist_user_id` (user_id)

### `group_buys`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `title` | `VARCHAR(200)` | NOT NULL |  |  | business |
| `description` | `TEXT` | yes |  |  | business |
| `product_name` | `VARCHAR(200)` | NOT NULL |  |  | business |
| `unit` | `VARCHAR(50)` | yes |  |  | business |
| `price_per_unit_regular` | `NUMERIC(10, 2)` | NOT NULL |  |  | business |
| `price_per_unit_group` | `NUMERIC(10, 2)` | NOT NULL |  |  | business |
| `min_participants` | `INTEGER` | NOT NULL |  |  | business |
| `max_participants` | `INTEGER` | yes |  |  | business |
| `max_units` | `INTEGER` | yes |  |  | business |
| `joins_closed_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |
| `pickup_starts_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |
| `pickup_ends_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |
| `allergens` | `TEXT[]` | yes |  |  | business |
| `pickup_location_id` | `UUID` | yes |  | FK → `producer_locations.id` ON DELETE SET NULL | business |
| `pickup_reminder_sent_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |
| `deadline` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | business |
| `city` | `VARCHAR(100)` | yes |  |  | business |
| `fulfillment_note` | `TEXT` | yes |  |  | business |
| `pickup_note` | `TEXT` | yes |  |  | business |
| `delivery_note` | `TEXT` | yes |  |  | business |
| `status` | `VARCHAR(20)` | NOT NULL | app: `'open'` |  | business |
| `funded_notified_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |
| `below_goal_notified_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |
| `refunded_notified_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | business |

**Indexes**

- `ix_group_buys_pickup_location_id` (pickup_location_id)
- `ix_group_buys_producer_id` (producer_id)

### `home_product_ratings`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | ugc |
| `click_id` | `UUID` | NOT NULL |  | FK → `home_product_whatsapp_clicks.id` ON DELETE CASCADE<br>UNIQUE | ugc |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | ugc |
| `home_product_id` | `UUID` | NOT NULL |  | FK → `home_products.id` ON DELETE CASCADE | ugc |
| `stars` | `INTEGER` | NOT NULL |  |  | ugc |
| `comment` | `VARCHAR(100)` | yes |  |  | ugc |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | ugc |

**UNIQUE**

- `uq_one_rating_per_click`: (click_id)

### `home_product_whatsapp_clicks`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | cookies |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | cookies |
| `home_product_id` | `UUID` | NOT NULL |  | FK → `home_products.id` ON DELETE CASCADE | cookies |
| `clicked_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | cookies |
| `rating_sent` | `BOOLEAN` | yes | app: `False` |  | cookies |
| `rated` | `BOOLEAN` | yes | app: `False` |  | cookies |
| `rating_token` | `VARCHAR(100)` | yes |  | UNIQUE | cookies |

**UNIQUE**

- (rating_token)

### `home_products`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | ugc |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | identity |
| `title` | `VARCHAR(200)` | NOT NULL |  |  | ugc |
| `description` | `TEXT` | yes |  |  | ugc |
| `photo` | `TEXT` | yes |  |  | ugc |
| `quantity` | `VARCHAR(100)` | yes |  |  | ugc |
| `price` | `NUMERIC(10, 2)` | yes |  |  | ugc |
| `neighborhood` | `VARCHAR(100)` | yes |  |  | identity |
| `city` | `VARCHAR(100)` | yes |  |  | identity |
| `street` | `VARCHAR(200)` | yes |  |  | identity |
| `zip_code` | `VARCHAR(20)` | yes |  |  | identity |
| `phone` | `VARCHAR(20)` | yes |  |  | identity |
| `available_until` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | ugc |
| `is_active` | `BOOLEAN` | yes | app: `True` |  | ugc |
| `is_hidden` | `BOOLEAN` | yes | app: `False` |  | ugc |
| `category` | `VARCHAR(50)` | yes |  |  | ugc |
| `prep_date` | `DATE` | yes |  |  | ugc |
| `expiry_date` | `DATE` | yes |  |  | ugc |
| `storage_type` | `VARCHAR(30)` | yes |  |  | ugc |
| `allergens` | `TEXT` | yes |  |  | ugc |
| `kosher` | `VARCHAR(30)` | yes |  |  | ugc |
| `is_organic` | `BOOLEAN` | yes | app: `False` |  | ugc |
| `unit` | `VARCHAR(30)` | yes |  |  | ugc |
| `delivery_method` | `VARCHAR(30)` | yes |  |  | ugc |
| `location_notes` | `TEXT` | yes |  |  | identity |
| `images` | `TEXT[]` | yes | app: `[]` |  | ugc |
| `moderation_status` | `VARCHAR(20)` | yes | app: `'APPROVED'` |  | ugc |
| `moderation_reason` | `TEXT` | yes |  |  | ugc |
| `moderation_suggestion` | `TEXT` | yes |  |  | ugc |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | ugc |

### `inbound_messages`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | messages |
| `from_phone` | `VARCHAR(20)` | NOT NULL |  |  | messages |
| `body` | `TEXT` | NOT NULL |  |  | messages |
| `received_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | server: `now()`<br>app: `utc_now()` |  | messages |
| `meta_message_id` | `VARCHAR(100)` | yes |  | UNIQUE | messages |
| `bot_replied` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | messages |
| `bot_replied_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | messages |
| `bot_template_sent` | `VARCHAR(50)` | yes |  |  | messages |
| `human_replied` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | messages |

**UNIQUE**

- (meta_message_id)

**Indexes**

- `ix_inbound_messages_bot_replied` (bot_replied)
- `ix_inbound_messages_from_phone` (from_phone)
- `ix_inbound_messages_received_at` (received_at)

### `kashrut_badge_requests`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `badge_code` | `VARCHAR(50)` | NOT NULL |  |  | business |
| `cert_url` | `TEXT` | yes |  |  | business |
| `status` | `VARCHAR(20)` | NOT NULL | app: `'pending'` |  | business |
| `reviewed_by` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | business |
| `notes` | `TEXT` | yes |  |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | business |

**Indexes**

- `ix_kashrut_badge_requests_producer_id` (producer_id)

### `newsletter_subscribers`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | identity |
| `email` | `VARCHAR(200)` | NOT NULL |  | UNIQUE | identity |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | identity |

**UNIQUE**

- (email)

### `outbound_messages`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | messages |
| `to_phone` | `VARCHAR(20)` | NOT NULL |  |  | messages |
| `kind` | `VARCHAR(64)` | NOT NULL |  |  | messages |
| `meta_message_id` | `VARCHAR(100)` | yes |  | UNIQUE | messages |
| `status` | `VARCHAR(20)` | NOT NULL | server: `'accepted'`<br>app: `'accepted'` |  | messages |
| `error_code` | `INTEGER` | yes |  |  | messages |
| `error_message` | `TEXT` | yes |  |  | messages |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | server: `now()`<br>app: `utc_now()` |  | messages |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | messages |

**UNIQUE**

- (meta_message_id)

**Indexes**

- `ix_outbound_messages_status` (status)
- `ix_outbound_messages_to_phone` (to_phone)

### `outreach_leads`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | outreach |
| `name` | `VARCHAR(200)` | NOT NULL |  |  | outreach |
| `phone` | `VARCHAR(20)` | yes |  |  | outreach |
| `instagram` | `VARCHAR(100)` | yes |  |  | outreach |
| `website` | `VARCHAR(200)` | yes |  |  | outreach |
| `city` | `VARCHAR(100)` | yes |  |  | outreach |
| `category` | `VARCHAR(100)` | yes |  |  | outreach |
| `notes` | `TEXT` | yes |  |  | outreach |
| `source` | `VARCHAR(50)` | yes | app: `'manual'` |  | outreach |
| `status` | `VARCHAR(20)` | yes | app: `'new'` |  | outreach |
| `prefill_token` | `VARCHAR(64)` | yes |  | UNIQUE | outreach |
| `prefill_token_expires_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | outreach |
| `suggested_by_name` | `VARCHAR(100)` | yes |  |  | identity |
| `suggested_by_email` | `VARCHAR(254)` | yes |  |  | identity |
| `suggester_wants_update` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | outreach |
| `suggestion_reason` | `TEXT` | yes |  |  | outreach |
| `suggester_thanked_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | outreach |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | outreach |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()`<br>on update: `utc_now()` |  | outreach |

**Indexes**

- `ix_outreach_leads_prefill_token` UNIQUE (prefill_token)

### `phone_otp_tokens`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | technical |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | technical |
| `phone` | `VARCHAR(30)` | NOT NULL |  |  | technical |
| `code` | `VARCHAR(6)` | NOT NULL |  |  | technical |
| `expires_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | technical |
| `used` | `BOOLEAN` | NOT NULL | app: `False` |  | technical |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | technical |

**Indexes**

- `ix_phone_otp_tokens_producer_id` (producer_id)

### `producer_analytics_daily`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | server: `gen_random_uuid()`<br>app: `uuid4()` | PK | not-personal |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | not-personal |
| `day` | `DATE` | NOT NULL |  |  | not-personal |
| `views_unique` | `INTEGER` | NOT NULL | server: `0` |  | not-personal |
| `views_search_unique` | `INTEGER` | NOT NULL | server: `0` |  | not-personal |
| `whatsapp_clicks` | `INTEGER` | NOT NULL | server: `0` |  | not-personal |

**UNIQUE**

- `uq_producer_analytics_daily_producer_day`: (producer_id, day)

**Indexes**

- `ix_producer_analytics_daily_day` (day)
- `ix_producer_analytics_daily_producer_id` (producer_id)

### `producer_categories`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `producer_id` | `UUID` | NOT NULL |  | PK<br>FK → `producers.id` ON DELETE CASCADE | business |
| `category_id` | `INTEGER` | NOT NULL |  | PK<br>FK → `categories.id` ON DELETE CASCADE | business |
| `position` | `INTEGER` | NOT NULL | server: `'0'` |  | business |

### `producer_contact_clicks`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | cookies |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | cookies |
| `user_id` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | cookies |
| `method` | `VARCHAR(20)` | NOT NULL |  |  | cookies |
| `ip_hash` | `VARCHAR(64)` | yes |  |  | technical |
| `clicked_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | cookies |

**Indexes**

- `ix_contact_clicks_producer_at` (producer_id, clicked_at)
- `ix_producer_contact_clicks_clicked_at` (clicked_at)
- `ix_producer_contact_clicks_producer_id` (producer_id)
- `ix_producer_contact_clicks_user_id` (user_id)

### `producer_locations`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `kind` | `VARCHAR(20)` | NOT NULL |  |  | business |
| `label` | `VARCHAR(200)` | yes |  |  | business |
| `city` | `VARCHAR(100)` | yes |  |  | business |
| `address` | `VARCHAR(255)` | yes |  |  | business |
| `lat` | `FLOAT` | yes |  |  | business |
| `lng` | `FLOAT` | yes |  |  | business |
| `opening_hours` | `VARCHAR` | yes |  |  | business |
| `pickup_days` | `VARCHAR(10)[]` | yes |  |  | business |
| `order_cutoff_day` | `VARCHAR(10)` | yes |  |  | business |
| `order_cutoff_time` | `VARCHAR(5)` | yes |  |  | business |
| `phone` | `VARCHAR(20)` | yes |  |  | business |
| `pickup_note` | `TEXT` | yes |  |  | business |
| `rescue_schedule` | `JSONB` | yes |  |  | business |
| `is_primary` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `location_precision` | `VARCHAR(20)` | NOT NULL | server: `'exact'`<br>app: `'exact'` |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | server: `now()`<br>app: `utc_now()` |  | business |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | server: `now()`<br>app: `utc_now()`<br>on update: `utc_now()` |  | business |

**CHECK**

- `producer_location_kind`: `kind IN ('branch', 'pickup', 'market_stand')`
- `producer_location_precision`: `location_precision IN ('exact', 'approximate')`
- `producer_locations_rescue_schedule_check`: `rescue_schedule IS NULL OR jsonb_typeof(rescue_schedule) = 'object'`

**Indexes**

- `ix_producer_locations_city` (city)
- `ix_producer_locations_producer_id` (producer_id)

### `producer_name_change_requests`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `current_name` | `VARCHAR(100)` | NOT NULL |  |  | business |
| `requested_name` | `VARCHAR(100)` | NOT NULL |  |  | business |
| `reason` | `TEXT` | yes |  |  | business |
| `status` | `VARCHAR(20)` | NOT NULL | app: `'pending'` |  | business |
| `admin_notes` | `TEXT` | yes |  |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | business |
| `reviewed_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |

**Indexes**

- `ix_producer_name_change_requests_producer_id` (producer_id)
- `ix_producer_name_change_requests_status` (status)

### `producer_offers`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `offer_type` | `TEXT` | NOT NULL |  |  | business |
| `threshold_value` | `INTEGER` | yes |  |  | business |
| `threshold_unit` | `TEXT` | yes |  |  | business |
| `headline` | `TEXT` | yes |  |  | business |
| `starts_at` | `DATE` | yes |  |  | business |
| `expires_at` | `DATE` | NOT NULL |  |  | business |
| `is_active` | `BOOLEAN` | NOT NULL | server: `true`<br>app: `True` |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | server: `now()`<br>app: `utc_now()` |  | business |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | server: `now()`<br>app: `utc_now()`<br>on update: `utc_now()` |  | business |

**CHECK**

- `producer_offer_date_order`: `starts_at IS NULL OR expires_at > starts_at`
- `producer_offer_threshold_pair`: `(threshold_value IS NULL) = (threshold_unit IS NULL)`
- `producer_offer_threshold_positive`: `threshold_value IS NULL OR threshold_value > 0`
- `producer_offer_threshold_unit`: `threshold_unit IN ('ils', 'units', 'liters', 'kg')`
- `producer_offer_type`: `offer_type IN ('free_delivery_above', 'gift_above', 'first_order', 'pickup_discount', 'custom')`

**Indexes**

- `uq_producer_offers_active_per_producer` UNIQUE (producer_id) WHERE `is_active`

### `producer_order_settings`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `producer_id` | `UUID` | NOT NULL |  | PK<br>FK → `producers.id` ON DELETE CASCADE | business |
| `enabled` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `auto_confirm` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `auto_confirm_slot_cap` | `INTEGER` | yes |  |  | business |
| `cancel_cutoff_hours` | `INTEGER` | NOT NULL | server: `24`<br>app: `24` |  | business |
| `shabbat_observant` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `min_order_agorot` | `INTEGER` | yes |  |  | business |
| `slot_minutes` | `INTEGER` | NOT NULL | server: `60`<br>app: `60` |  | business |
| `lead_time_hours` | `INTEGER` | NOT NULL | server: `24`<br>app: `24` |  | business |
| `alcohol_licensed` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `business_id_number` | `VARCHAR(9)` | yes |  |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | business |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()`<br>on update: `utc_now()` |  | business |

**CHECK**

- `producer_order_settings_business_id_check`: `business_id_number IS NULL OR business_id_number ~ '^[0-9]{9}$'`
- `producer_order_settings_cutoff_check`: `cancel_cutoff_hours >= 0 AND cancel_cutoff_hours <= 168`
- `producer_order_settings_lead_time_check`: `lead_time_hours >= 0 AND lead_time_hours <= 168`
- `producer_order_settings_min_order_check`: `min_order_agorot IS NULL OR min_order_agorot >= 0`
- `producer_order_settings_slot_cap_check`: `auto_confirm_slot_cap IS NULL OR auto_confirm_slot_cap >= 1`
- `producer_order_settings_slot_minutes_check`: `slot_minutes IN (30, 60, 120)`

### `producer_order_windows`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `weekday` | `SMALLINT` | NOT NULL |  |  | business |
| `start_time` | `TIME WITHOUT TIME ZONE` | NOT NULL |  |  | business |
| `end_time` | `TIME WITHOUT TIME ZONE` | NOT NULL |  |  | business |
| `fulfilment` | `VARCHAR(10)` | NOT NULL |  |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | business |

**CHECK**

- `producer_order_windows_fulfilment_check`: `fulfilment IN ('pickup', 'delivery')`
- `producer_order_windows_time_check`: `end_time > start_time`
- `producer_order_windows_weekday_check`: `weekday >= 0 AND weekday <= 6`

**Indexes**

- `ix_producer_order_windows_producer_id` (producer_id)

### `producer_page_views`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | cookies |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | cookies |
| `viewer_ip_hash` | `VARCHAR(64)` | yes |  |  | technical |
| `city` | `VARCHAR(100)` | yes |  |  | cookies |
| `referrer` | `VARCHAR(30)` | yes |  |  | cookies |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | cookies |

**Indexes**

- `ix_producer_page_views_created_at` (created_at)
- `ix_producer_page_views_producer_id` (producer_id)

### `producer_recipe_products`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `recipe_id` | `UUID` | NOT NULL |  | PK<br>FK → `producer_recipes.id` ON DELETE CASCADE | business |
| `product_id` | `UUID` | NOT NULL |  | PK<br>FK → `products.id` ON DELETE CASCADE | business |

**Indexes**

- `ix_producer_recipe_products_product_id` (product_id)

### `producer_recipes`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `title` | `TEXT` | NOT NULL |  |  | business |
| `description` | `TEXT` | yes |  |  | business |
| `ingredients` | `TEXT` | NOT NULL |  |  | business |
| `instructions` | `TEXT` | NOT NULL |  |  | business |
| `prep_time_min` | `INTEGER` | yes |  |  | business |
| `cook_time_min` | `INTEGER` | yes |  |  | business |
| `servings` | `INTEGER` | yes |  |  | business |
| `image_url` | `TEXT` | yes |  |  | business |
| `moderation_status` | `TEXT` | NOT NULL | server: `'pending'`<br>app: `'pending'` |  | business |
| `moderation_notes` | `TEXT` | yes |  |  | business |
| `published` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | server: `now()`<br>app: `utc_now()` |  | business |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | server: `now()`<br>app: `utc_now()`<br>on update: `utc_now()` |  | business |

**CHECK**

- `producer_recipes_moderation_status_check`: `moderation_status IN ('pending', 'approved', 'rejected', 'needs_revision')`

**Indexes**

- `ix_producer_recipes_producer_id` (producer_id)
- `ix_producer_recipes_published_moderation` (published, moderation_status) WHERE `published = true`

### `producer_review_checks`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `item_id` | `UUID` | NOT NULL |  | FK → `admin_checklist_items.id` ON DELETE RESTRICT | business |
| `label_snapshot` | `TEXT` | NOT NULL |  |  | business |
| `checked_by` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | business |
| `checked_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | server: `now()` |  | business |

**UNIQUE**

- `uq_producer_review_checks_producer_item`: (producer_id, item_id)

**Indexes**

- `ix_producer_review_checks_checked_by` (checked_by)
- `ix_producer_review_checks_item_id` (item_id)
- `ix_producer_review_checks_producer_id` (producer_id)

### `producer_reviews`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | ugc |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | ugc |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | ugc |
| `stars` | `INTEGER` | NOT NULL |  |  | ugc |
| `body` | `TEXT` | yes |  |  | ugc |
| `is_hidden` | `BOOLEAN` | yes | app: `False` |  | ugc |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | ugc |
| `reply` | `TEXT` | yes |  |  | ugc |
| `reply_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | ugc |
| `source` | `VARCHAR(20)` | NOT NULL | server: `click` |  | ugc |
| `ai_moderation_status` | `VARCHAR(16)` | yes |  |  | ugc |
| `reply_ai_moderation_status` | `VARCHAR(16)` | yes |  |  | ugc |
| `edited_after_hidden_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | ugc |

**CHECK**

- `ck_producer_reviews_ai_moderation_status`: `ai_moderation_status IN ('APPROVED', 'FLAGGED')`
- `ck_producer_reviews_reply_ai_moderation_status`: `reply_ai_moderation_status IN ('APPROVED', 'FLAGGED')`
- `ck_producer_reviews_source`: `source IN ('click', 'invite_link')`

**UNIQUE**

- `uq_one_review_per_producer_per_user`: (producer_id, user_id)

### `producer_staff`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | orders |
| `user_id` | `UUID` | yes |  | FK → `users.id` ON DELETE CASCADE | orders |
| `invited_email` | `VARCHAR(255)` | NOT NULL |  |  | orders |
| `role` | `VARCHAR(20)` | NOT NULL | server: `orders`<br>app: `'orders'` |  | orders |
| `token_hash` | `VARCHAR(64)` | yes |  |  | orders |
| `expires_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL |  |  | orders |
| `invited_by` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | orders |
| `status` | `VARCHAR(20)` | NOT NULL | server: `pending`<br>app: `'pending'` |  | orders |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | NOT NULL | server: `now()` |  | orders |
| `accepted_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | orders |
| `revoked_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | orders |

**CHECK**

- `ck_producer_staff_role`: `role IN ('orders')`
- `ck_producer_staff_status`: `status IN ('pending', 'active', 'revoked')`

**Indexes**

- `ix_producer_staff_producer_id` (producer_id)
- `uq_producer_staff_active_user` UNIQUE (user_id) WHERE `status = 'active'`
- `uq_producer_staff_live_email` UNIQUE (producer_id, lower(invited_email)) WHERE `status IN ('pending', 'active')`
- `uq_producer_staff_token_hash` UNIQUE (token_hash) WHERE `token_hash IS NOT NULL`

### `producer_whatsapp_clicks`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | cookies |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | cookies |
| `user_id` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | cookies |
| `clicked_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | cookies |
| `city` | `VARCHAR(60)` | yes |  |  | cookies |

**Indexes**

- `ix_producer_whatsapp_clicks_clicked_at` (clicked_at)
- `ix_producer_whatsapp_clicks_producer_id` (producer_id)
- `ix_producer_whatsapp_clicks_user_id` (user_id)

### `producers`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `name` | `VARCHAR(200)` | NOT NULL |  |  | business |
| `contact_name` | `VARCHAR(200)` | yes |  |  | identity |
| `description` | `TEXT` | yes |  |  | business |
| `short_description` | `TEXT` | yes |  |  | business |
| `city` | `VARCHAR(100)` | yes |  |  | business |
| `address` | `VARCHAR(255)` | yes |  |  | business |
| `lat` | `FLOAT` | yes |  |  | business |
| `lng` | `FLOAT` | yes |  |  | business |
| `phone` | `VARCHAR(20)` | yes |  |  | business |
| `secondary_phone` | `VARCHAR(20)` | yes |  |  | business |
| `secondary_phone_label` | `VARCHAR(30)` | yes |  |  | business |
| `instagram` | `VARCHAR(100)` | yes |  |  | business |
| `website` | `VARCHAR(200)` | yes |  |  | business |
| `whatsapp_group` | `VARCHAR(300)` | yes |  |  | business |
| `primary_contact_method` | `VARCHAR(20)` | yes | app: `'whatsapp'` |  | business |
| `coverage_cta_enabled` | `BOOLEAN` | NOT NULL | server: `true`<br>app: `True` |  | business |
| `contact_email` | `VARCHAR(200)` | yes |  |  | identity |
| `facebook` | `VARCHAR(200)` | yes |  |  | business |
| `external_order_form` | `VARCHAR(500)` | yes |  |  | business |
| `status` | `VARCHAR(20)` | yes | app: `'draft'` |  | business |
| `kind` | `VARCHAR(20)` | NOT NULL | server: `producer`<br>app: `'producer'` |  | business |
| `is_test` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `submitted_for_review_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `images` | `TEXT[]` | yes | app: `[]` |  | business |
| `is_recommended` | `BOOLEAN` | yes | app: `False` |  | business |
| `recommended_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `recommended_note` | `TEXT` | yes |  |  | business |
| `in_season_until` | `DATE` | yes |  |  | business |
| `story_card_url` | `VARCHAR(500)` | yes |  |  | business |
| `owner_bio` | `TEXT` | yes |  |  | business |
| `owner_photo_url` | `VARCHAR(500)` | yes |  |  | business |
| `logo_url` | `VARCHAR(500)` | yes |  |  | business |
| `established_year` | `INTEGER` | yes |  |  | business |
| `plan` | `VARCHAR(20)` | yes | app: `'free'` |  | business |
| `slug` | `VARCHAR(100)` | yes |  | UNIQUE | business |
| `google_place_id` | `VARCHAR(300)` | yes |  |  | business |
| `top_product_name` | `VARCHAR(200)` | yes |  |  | business |
| `top_product_id` | `UUID` | yes |  | FK → `products.id` ON DELETE SET NULL | business |
| `price_range` | `VARCHAR(100)` | yes |  |  | business |
| `grass_fed` | `BOOLEAN` | yes | app: `False` |  | business |
| `reservist_owned` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `organic_certified` | `BOOLEAN` | yes | app: `False` |  | business |
| `vegan_scope` | `VARCHAR(20)` | NOT NULL | server: `'unknown'`<br>app: `'unknown'` |  | business |
| `vegetarian_scope` | `VARCHAR(20)` | NOT NULL | server: `'unknown'`<br>app: `'unknown'` |  | business |
| `gluten_free_facility` | `VARCHAR(20)` | NOT NULL | server: `'unknown'`<br>app: `'unknown'` |  | business |
| `lactose_free_facility` | `VARCHAR(20)` | NOT NULL | server: `'unknown'`<br>app: `'unknown'` |  | business |
| `has_delivery` | `BOOLEAN` | yes | app: `False` |  | business |
| `pickup_points` | `BOOLEAN` | yes | app: `False` |  | business |
| `kosher` | `VARCHAR(50)` | yes |  |  | business |
| `producer_license_number` | `VARCHAR(20)` | yes |  |  | business |
| `license_expires_at` | `DATE` | yes |  |  | business |
| `referral_source` | `VARCHAR(40)` | yes |  |  | business |
| `referral_source_other` | `VARCHAR(120)` | yes |  |  | business |
| `declared_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `declaration_version` | `VARCHAR(10)` | yes |  |  | business |
| `farmer_declared_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `farmer_declaration_version` | `VARCHAR(10)` | yes |  |  | business |
| `verified_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `verification_doc_type` | `VARCHAR(20)` | yes |  |  | business |
| `admin_notes` | `TEXT` | yes |  |  | business |
| `risk_score` | `INTEGER` | yes |  |  | business |
| `risk_reasoning` | `TEXT` | yes |  |  | business |
| `is_available_today` | `BOOLEAN` | yes | app: `False` |  | business |
| `availability_status` | `VARCHAR(20)` | yes | app: `'available'` |  | business |
| `availability_state` | `VARCHAR(32)` | NOT NULL | server: `'accepting_orders'` |  | business |
| `vacation_until` | `DATE` | yes |  |  | business |
| `availability_confirmed_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `opening_hours` | `VARCHAR` | yes |  |  | business |
| `order_window` | `JSONB` | yes |  |  | business |
| `payment_info` | `JSONB` | yes |  |  | business |
| `product_groups` | `JSONB` | yes |  |  | business |
| `delivery_zones` | `JSONB` | yes |  |  | business |
| `delivery_days_min` | `SMALLINT` | yes |  |  | business |
| `delivery_days_max` | `SMALLINT` | yes |  |  | business |
| `delivery_min_order` | `INTEGER` | yes |  |  | business |
| `special_hours` | `JSONB` | yes |  |  | business |
| `has_physical_location` | `BOOLEAN` | NOT NULL | app: `True` |  | business |
| `offers_delivery` | `BOOLEAN` | NOT NULL | app: `False` |  | business |
| `by_arrangement` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `delivery_nationwide` | `BOOLEAN` | NOT NULL | app: `False` |  | business |
| `delivery_cities` | `TEXT[]` | NOT NULL | app: `[]` |  | business |
| `delivery_excluded_cities` | `TEXT[]` | NOT NULL | server: `'{}'::text[]`<br>app: `[]` |  | business |
| `delivery_fee` | `INTEGER` | yes |  |  | business |
| `free_delivery_above` | `INTEGER` | yes |  |  | business |
| `avg_rating` | `FLOAT` | yes | app: `0` |  | business |
| `reviews_count` | `INTEGER` | yes | app: `0` |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | business |
| `last_active_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | business |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | yes | on update: `now()` |  | business |
| `phone_verified` | `BOOLEAN` | yes | app: `False` |  | business |
| `ambassador` | `BOOLEAN` | yes | app: `False` |  | business |
| `kashrut_badges` | `TEXT[]` | yes | app: `[]` |  | business |
| `kashrut_verified_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |
| `kashrut_expires_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | business |
| `custom_questions` | `TEXT[]` | yes |  |  | business |
| `rejection_reason` | `TEXT` | yes |  |  | business |
| `rejection_reason_code` | `VARCHAR(40)` | yes |  |  | business |
| `resubmission_count` | `INTEGER` | NOT NULL | server: `0`<br>app: `0` |  | business |
| `resubmitted_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `claim_link_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `owner_invite_email` | `VARCHAR(200)` | yes |  |  | identity |
| `owner_invite_name` | `VARCHAR(200)` | yes |  |  | identity |
| `owner_invite_token_hash` | `VARCHAR(64)` | yes |  |  | business |
| `owner_invite_expires_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `owner_invite_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `owner_invite_accepted_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `owner_invite_consent_note` | `TEXT` | yes |  |  | business |
| `consent_screenshot_url` | `VARCHAR(500)` | yes |  |  | business |
| `owner_invite_created_by` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | business |
| `owner_invite_code_hash` | `VARCHAR(64)` | yes |  |  | business |
| `owner_invite_code_expires_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `owner_invite_code_attempts` | `INTEGER` | yes |  |  | business |
| `requested_changes` | `TEXT` | yes |  |  | business |
| `changes_requested_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `email_followup_2_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `email_followup_3_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `email_followup_4_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `email_followup_5_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `email_pending_nudge_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `last_confirmed_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `freshness_email_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |
| `weekly_summary_opt_out` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `weekly_summary_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |

**CHECK**

- `delivery_excluded_requires_nationwide`: `delivery_nationwide OR delivery_excluded_cities = '{}'::text[]`
- `delivery_nationwide_xor_cities`: `NOT (delivery_nationwide AND array_length(delivery_cities, 1) > 0)`
- `producer_kind_values`: `kind IN ('producer', 'organizer')`
- `producer_location_mode`: `has_physical_location OR offers_delivery`
- `producer_nationwide_requires_delivery`: `NOT (delivery_nationwide AND NOT offers_delivery)`

**UNIQUE**

- (slug)

**Indexes**

- `idx_producers_availability_state` (availability_state) WHERE `(availability_state)::text <> 'accepting_orders'::text`
- `idx_producers_created_at` (created_at)
- `idx_producers_name` USING `gin` (to_tsvector('simple', name))
- `ix_producers_owner_invite_token_hash` (owner_invite_token_hash)

### `product_order_events`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `order_id` | `UUID` | NOT NULL |  | FK → `product_orders.id` ON DELETE CASCADE | orders |
| `from_status` | `VARCHAR(20)` | yes |  |  | orders |
| `to_status` | `VARCHAR(20)` | NOT NULL |  |  | orders |
| `actor` | `VARCHAR(10)` | NOT NULL |  |  | orders |
| `actor_user_id` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | orders |
| `note` | `TEXT` | yes |  |  | orders |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | orders |

**CHECK**

- `product_order_events_actor_check`: `actor IN ('customer', 'business', 'admin', 'system')`
- `product_order_events_to_status_check`: `to_status IN ('pending', 'confirmed', 'change_proposed', 'ready', 'handed', 'declined', 'cancelled', 'expired', 'no_show')`

**Indexes**

- `ix_product_order_events_order_id` (order_id)

### `product_order_items`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `order_id` | `UUID` | NOT NULL |  | FK → `product_orders.id` ON DELETE CASCADE | orders |
| `product_id` | `UUID` | yes |  | FK → `products.id` ON DELETE SET NULL | orders |
| `name` | `VARCHAR(200)` | NOT NULL |  |  | orders |
| `unit_price_agorot` | `INTEGER` | NOT NULL |  |  | orders |
| `price_is_estimate` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | orders |
| `price_unit` | `VARCHAR(10)` | NOT NULL | server: `'unit'`<br>app: `'unit'` |  | orders |
| `qty` | `INTEGER` | NOT NULL |  |  | orders |
| `contains_alcohol` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | orders |
| `variant_id` | `UUID` | yes |  | FK → `product_variants.id` ON DELETE SET NULL | orders |
| `variant_name` | `VARCHAR(40)` | yes |  |  | orders |

**CHECK**

- `product_order_items_price_check`: `unit_price_agorot >= 0`
- `product_order_items_price_unit_check`: `price_unit IN ('unit', 'kg', '100g', 'bottle', 'box', 'pack')`
- `product_order_items_qty_check`: `qty >= 1 AND qty <= 99`

**Indexes**

- `ix_product_order_items_order_id` (order_id)
- `ix_product_order_items_product_id` (product_id)
- `ix_product_order_items_variant_id` (variant_id)

### `product_order_notifications`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `order_id` | `UUID` | NOT NULL |  | FK → `product_orders.id` ON DELETE CASCADE | orders |
| `kind` | `VARCHAR(20)` | NOT NULL |  |  | orders |
| `channel` | `VARCHAR(10)` | NOT NULL |  |  | orders |
| `outcome` | `VARCHAR(10)` | NOT NULL | server: `'pending'`<br>app: `'pending'` |  | orders |
| `send_after` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | orders |
| `attempts` | `INTEGER` | NOT NULL | server: `0`<br>app: `0` |  | orders |
| `last_error` | `VARCHAR(20)` | yes |  |  | orders |
| `sent_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | orders |

**CHECK**

- `product_order_notifications_channel_check`: `channel IN ('whatsapp', 'email')`
- `product_order_notifications_kind_check`: `kind IN ('new_order', 'business_reminder', 'confirmed', 'change_proposed', 'closed', 'buyer_cancelled', 'day_before', 'review_request')`
- `product_order_notifications_outcome_check`: `outcome IN ('pending', 'sent', 'failed', 'skipped')`

**Indexes**

- `ix_product_order_notifications_due` (send_after) WHERE `outcome = 'pending'`
- `uq_product_order_notifications_once` UNIQUE (order_id, kind, channel)

### `product_order_phone_codes`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `phone` | `VARCHAR(20)` | NOT NULL |  |  | orders |
| `code_hash` | `CHAR(64)` | NOT NULL |  |  | orders |
| `expires_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | orders |
| `attempts` | `INTEGER` | NOT NULL | server: `0`<br>app: `0` |  | orders |
| `used_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | orders |

**Indexes**

- `ix_product_order_phone_codes_created_at` (created_at)
- `ix_product_order_phone_codes_phone_created` (phone, created_at)

### `product_orders`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | orders |
| `user_id` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | orders |
| `customer_name` | `VARCHAR(120)` | NOT NULL |  |  | orders |
| `customer_phone` | `VARCHAR(20)` | NOT NULL |  |  | orders |
| `fulfilment` | `VARCHAR(10)` | NOT NULL |  |  | orders |
| `delivery_address` | `TEXT` | yes |  |  | orders |
| `slot_start` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | orders |
| `slot_end` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | orders |
| `note` | `TEXT` | yes |  |  | orders |
| `estimated_total_agorot` | `INTEGER` | NOT NULL |  |  | orders |
| `final_total_agorot` | `INTEGER` | yes |  |  | orders |
| `delivery_fee_agorot` | `INTEGER` | NOT NULL | server: `0`<br>app: `0` |  | orders |
| `status` | `VARCHAR(20)` | NOT NULL | server: `'pending'`<br>app: `'pending'` |  | orders |
| `payment_status` | `VARCHAR(30)` | NOT NULL | server: `'direct_to_business'`<br>app: `'direct_to_business'` |  | orders |
| `pickup_code` | `CHAR(4)` | yes |  |  | orders |
| `age_declared` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | orders |
| `expires_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `confirmed_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `handed_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `closed_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `status_token_hash` | `CHAR(64)` | yes |  |  | orders |
| `idempotency_key` | `VARCHAR(64)` | yes |  |  | orders |
| `delivery_city` | `VARCHAR(100)` | yes |  |  | orders |
| `proposed_slot_start` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `proposed_slot_end` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `proposed_total_agorot` | `INTEGER` | yes |  |  | orders |
| `proposal_note` | `TEXT` | yes |  |  | orders |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | orders |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()`<br>on update: `utc_now()` |  | orders |

**CHECK**

- `product_orders_amounts_check`: `estimated_total_agorot >= 0 AND delivery_fee_agorot >= 0 AND (final_total_agorot IS NULL OR final_total_agorot >= 0)`
- `product_orders_fulfilment_check`: `fulfilment IN ('pickup', 'delivery')`
- `product_orders_payment_status_check`: `payment_status IN ('direct_to_business')`
- `product_orders_pickup_code_check`: `pickup_code IS NULL OR pickup_code ~ '^[0-9]{4}$'`
- `product_orders_slot_check`: `slot_end > slot_start`
- `product_orders_status_check`: `status IN ('pending', 'confirmed', 'change_proposed', 'ready', 'handed', 'declined', 'cancelled', 'expired', 'no_show')`

**Indexes**

- `ix_product_orders_customer_phone` (customer_phone)
- `ix_product_orders_expires_at` (expires_at)
- `ix_product_orders_producer_slot` (producer_id, slot_start)
- `ix_product_orders_producer_status` (producer_id, status)
- `ix_product_orders_user_id` (user_id)
- `uq_product_orders_idempotency_key` UNIQUE (idempotency_key) WHERE `idempotency_key IS NOT NULL`
- `uq_product_orders_open_pickup_code` UNIQUE (producer_id, pickup_code) WHERE `status IN ('confirmed', 'ready')`
- `uq_product_orders_status_token_hash` UNIQUE (status_token_hash) WHERE `status_token_hash IS NOT NULL`

### `product_variants`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `product_id` | `UUID` | NOT NULL |  | FK → `products.id` ON DELETE CASCADE | business |
| `name` | `VARCHAR(40)` | NOT NULL |  |  | business |
| `price_agorot` | `INTEGER` | yes |  |  | business |
| `in_stock` | `BOOLEAN` | NOT NULL | server: `true`<br>app: `True` |  | business |
| `position` | `INTEGER` | NOT NULL | server: `0`<br>app: `0` |  | business |

**CHECK**

- `product_variants_price_check`: `price_agorot IS NULL OR price_agorot >= 0`

**Indexes**

- `ix_product_variants_product_id` (product_id)

### `products`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | business |
| `name` | `VARCHAR(200)` | NOT NULL |  |  | business |
| `description` | `TEXT` | yes |  |  | business |
| `price_range` | `VARCHAR(50)` | yes |  |  | business |
| `image_url` | `TEXT` | yes |  |  | business |
| `price_min` | `NUMERIC(10, 2)` | yes |  |  | business |
| `price_max` | `NUMERIC(10, 2)` | yes |  |  | business |
| `is_gluten_free` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `is_vegan` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `is_vegetarian` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `is_lactose_free` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `is_no_added_sugar` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `is_low_carb` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `ingredients` | `TEXT` | yes |  |  | business |
| `position` | `INTEGER` | yes |  |  | business |
| `group_id` | `VARCHAR(36)` | yes |  |  | business |
| `allergens` | `TEXT[]` | yes |  |  | business |
| `may_contain` | `TEXT[]` | yes |  |  | business |
| `storage_info` | `TEXT` | yes |  |  | business |
| `gluten_detail` | `TEXT` | yes |  |  | business |
| `nuts_detail` | `TEXT` | yes |  |  | business |
| `no_allergens` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `price_unit` | `VARCHAR(10)` | NOT NULL | server: `'unit'`<br>app: `'unit'` |  | business |
| `is_orderable` | `BOOLEAN` | NOT NULL | server: `true`<br>app: `True` |  | business |
| `in_stock` | `BOOLEAN` | NOT NULL | server: `true`<br>app: `True` |  | business |
| `contains_alcohol` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `available_weekdays` | `SMALLINT` | yes |  |  | business |
| `is_draft` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | business |
| `source_image_url` | `TEXT` | yes |  |  | business |

**CHECK**

- `products_available_weekdays_check`: `available_weekdays >= 1 AND available_weekdays <= 127`
- `products_price_unit_check`: `price_unit IN ('unit', 'kg', '100g', 'bottle', 'box', 'pack')`

**Indexes**

- `idx_products_dietary` (producer_id) WHERE `is_gluten_free OR is_vegan OR is_vegetarian OR is_lactose_free OR is_no_added_sugar OR is_low_carb`

### `registrations`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | registrations |
| `event_id` | `UUID` | yes |  | FK → `events.id` ON DELETE CASCADE | registrations |
| `experience_id` | `UUID` | yes |  | FK → `experiences.id` ON DELETE CASCADE | registrations |
| `name` | `VARCHAR(100)` | NOT NULL |  |  | registrations |
| `phone` | `VARCHAR(20)` | NOT NULL |  |  | registrations |
| `email` | `VARCHAR(200)` | NOT NULL |  |  | registrations |
| `cancel_token` | `VARCHAR(64)` | NOT NULL |  | UNIQUE | registrations |
| `status` | `VARCHAR(20)` | NOT NULL | server: `'registered'`<br>app: `'registered'` |  | registrations |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | registrations |
| `cancelled_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | registrations |
| `waitlist_offered_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | registrations |
| `reminder_sent_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | registrations |
| `party_size` | `SMALLINT` | NOT NULL | server: `1`<br>app: `1` |  | registrations |
| `attendance` | `VARCHAR(10)` | yes |  |  | registrations |
| `session_date` | `DATE` | yes |  |  | registrations |
| `session_time` | `TIME WITHOUT TIME ZONE` | yes |  |  | registrations |

**CHECK**

- `ck_registrations_attendance`: `attendance IS NULL OR attendance IN ('attended', 'no_show')`
- `ck_registrations_one_item`: `(event_id IS NULL) <> (experience_id IS NULL)`
- `ck_registrations_party_size`: `party_size BETWEEN 1 AND 10`
- `ck_registrations_session_experience`: `session_date IS NULL OR experience_id IS NOT NULL`
- `ck_registrations_session_time_needs_date`: `session_time IS NULL OR session_date IS NOT NULL`
- `ck_registrations_status`: `status IN ('registered', 'cancelled', 'waitlisted')`

**UNIQUE**

- (cancel_token)

**Indexes**

- `ix_registrations_event_id` (event_id)
- `ix_registrations_experience_id` (experience_id)
- `ix_registrations_experience_session` (experience_id, session_date, session_time)

### `reports`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | ugc |
| `reporter_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | ugc |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | ugc |
| `reason` | `TEXT` | yes |  |  | ugc |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | ugc |
| `status` | `VARCHAR` | NOT NULL | server: `'open'`<br>app: `'open'` |  | ugc |
| `resolved_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | ugc |
| `resolved_by` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | ugc |

**UNIQUE**

- `uq_report_reporter_producer`: (reporter_id, producer_id)

### `rescue_no_show_tombstones`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `email_hash` | `VARCHAR(64)` | NOT NULL |  |  | orders |
| `pickup_end` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | orders |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | orders |

**Indexes**

- `ix_rescue_no_show_tombstones_email_hash` (email_hash)
- `ix_rescue_no_show_tombstones_pickup_end` (pickup_end)

### `rescue_offers`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_location_id` | `UUID` | NOT NULL |  | FK → `producer_locations.id` ON DELETE CASCADE | business |
| `date` | `DATE` | NOT NULL |  |  | business |
| `qty_total` | `INTEGER` | NOT NULL |  |  | business |
| `qty_left` | `INTEGER` | NOT NULL |  |  | business |
| `price_agorot` | `INTEGER` | NOT NULL |  |  | business |
| `value_min_agorot` | `INTEGER` | yes |  |  | business |
| `value_max_agorot` | `INTEGER` | yes |  |  | business |
| `pickup_start` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | business |
| `pickup_end` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | business |
| `cancel_until` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | business |
| `status` | `VARCHAR(20)` | NOT NULL | app: `'active'` |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | business |
| `qty_donated` | `INTEGER` | NOT NULL | server: `0`<br>app: `0` |  | business |
| `codes_sent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | business |

**CHECK**

- `rescue_offers_pickup_window_check`: `pickup_end > pickup_start`
- `rescue_offers_price_check`: `price_agorot >= 0`
- `rescue_offers_qty_donated_check`: `qty_donated >= 0 AND qty_donated <= qty_total`
- `rescue_offers_qty_left_check`: `qty_left >= 0 AND qty_left <= qty_total`
- `rescue_offers_qty_total_check`: `qty_total >= 1 AND qty_total <= 20`
- `rescue_offers_status_check`: `status IN ('active', 'cancelled')`

**Indexes**

- `ix_rescue_offers_location_date` (producer_location_id, date)

### `rescue_orders`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | orders |
| `offer_id` | `UUID` | NOT NULL |  | FK → `rescue_offers.id` ON DELETE CASCADE | orders |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | orders |
| `qty` | `INTEGER` | NOT NULL |  |  | orders |
| `pickup_code` | `CHAR(4)` | NOT NULL |  |  | orders |
| `status` | `VARCHAR(20)` | NOT NULL | app: `'reserved'` |  | orders |
| `handed_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `handed_by` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | orders |
| `cancelled_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `paid_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | orders |

**CHECK**

- `rescue_orders_pickup_code_check`: `pickup_code ~ '^[0-9]{4}$'`
- `rescue_orders_qty_check`: `qty >= 1 AND qty <= 2`
- `rescue_orders_status_check`: `status IN ('reserved', 'handed', 'no_show', 'cancelled')`

**UNIQUE**

- `uq_rescue_orders_code`: (offer_id, pickup_code)

**Indexes**

- `ix_rescue_orders_user_id` (user_id)

### `rescue_reviews`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | ugc |
| `order_id` | `UUID` | NOT NULL |  | FK → `rescue_orders.id` ON DELETE CASCADE<br>UNIQUE | ugc |
| `rating` | `INTEGER` | NOT NULL |  |  | ugc |
| `contents_tags` | `JSONB` | yes |  |  | ugc |
| `highlight_tags` | `JSONB` | yes |  |  | ugc |
| `photo_url` | `VARCHAR(500)` | yes |  |  | ugc |
| `comment` | `TEXT` | yes |  |  | ugc |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | ugc |

**CHECK**

- `rescue_reviews_rating_check`: `rating >= 1 AND rating <= 5`

**UNIQUE**

- `uq_rescue_reviews_order`: (order_id)

### `rescue_typical_items`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | business |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE<br>UNIQUE | business |
| `items` | `JSONB` | NOT NULL | app: `list()` |  | business |
| `allergens` | `TEXT[]` | yes |  |  | business |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | business |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()`<br>on update: `utc_now()` |  | business |

**UNIQUE**

- `uq_rescue_typical_items_producer`: (producer_id)

### `retired_slugs`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `slug` | `VARCHAR(100)` | NOT NULL |  | PK | business |
| `producer_id` | `UUID` | yes |  | FK → `producers.id` ON DELETE SET NULL | business |
| `reason` | `VARCHAR(20)` | NOT NULL |  |  | business |
| `retired_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | business |

**Indexes**

- `ix_retired_slugs_producer_id` (producer_id)

### `saved_items`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | cookies |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | cookies |
| `item_type` | `VARCHAR(20)` | NOT NULL |  |  | cookies |
| `item_id` | `UUID` | NOT NULL |  |  | cookies |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | cookies |

**CHECK**

- `saved_items_item_type_check`: `item_type IN ('recipe', 'event', 'experience')`

**UNIQUE**

- `uq_saved_items_user_item`: (user_id, item_type, item_id)

### `search_queries`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | cookies |
| `query` | `TEXT` | NOT NULL |  |  | cookies |
| `results_count` | `INTEGER` | NOT NULL | app: `0` |  | cookies |
| `searched_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | cookies |

### `share_links`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | not-personal |
| `code_hash` | `VARCHAR(64)` | NOT NULL |  | UNIQUE | not-personal |
| `scope` | `VARCHAR(20)` | NOT NULL |  |  | not-personal |
| `producer_id` | `UUID` | NOT NULL |  | FK → `producers.id` ON DELETE CASCADE | not-personal |
| `expires_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | not-personal |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | not-personal |
| `created_by` | `UUID` | yes |  | FK → `users.id` ON DELETE SET NULL | not-personal |

**CHECK**

- `share_links_scope_check`: `scope IN ('draft_preview', 'producer_claim')`

**UNIQUE**

- (code_hash)

**Indexes**

- `ix_share_links_expires_at` (expires_at)
- `ix_share_links_producer_id` (producer_id)

### `static_pages`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `slug` | `VARCHAR(50)` | NOT NULL |  | PK | not-personal |
| `title` | `VARCHAR(200)` | NOT NULL |  |  | not-personal |
| `body` | `TEXT` | NOT NULL | app: `''` |  | not-personal |
| `updated_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()`<br>on update: `utc_now()` |  | not-personal |

### `user_phone_otp_tokens`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | technical |
| `user_id` | `UUID` | NOT NULL |  | FK → `users.id` ON DELETE CASCADE | technical |
| `phone` | `VARCHAR(30)` | NOT NULL |  |  | technical |
| `code` | `VARCHAR(6)` | NOT NULL |  |  | technical |
| `expires_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL |  |  | technical |
| `used` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | technical |
| `attempts` | `INTEGER` | NOT NULL | server: `0`<br>app: `0` |  | technical |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | NOT NULL | app: `utc_now()` |  | technical |

**Indexes**

- `ix_user_phone_otp_tokens_user_id` (user_id)

### `users`

| column | type | null | default | key | privacy |
|---|---|---|---|---|---|
| `id` | `UUID` | NOT NULL | app: `uuid4()` | PK | identity |
| `email` | `VARCHAR(200)` | NOT NULL |  | UNIQUE | identity |
| `name` | `VARCHAR(200)` | NOT NULL |  |  | identity |
| `password_hash` | `VARCHAR(200)` | yes |  |  | technical |
| `city` | `VARCHAR(100)` | yes |  |  | identity |
| `phone` | `VARCHAR(20)` | yes |  |  | identity |
| `role` | `VARCHAR(20)` | yes | app: `'consumer'` |  | identity |
| `producer_id` | `UUID` | yes |  | FK → `producers.id` ON DELETE SET NULL | identity |
| `google_id` | `VARCHAR(200)` | yes |  | UNIQUE | technical |
| `apple_id` | `VARCHAR(200)` | yes |  | UNIQUE | technical |
| `is_blocked` | `BOOLEAN` | yes | app: `False` |  | identity |
| `is_test` | `BOOLEAN` | NOT NULL | server: `false`<br>app: `False` |  | identity |
| `created_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes | app: `utc_now()` |  | identity |
| `last_active_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | technical |
| `is_producer` | `BOOLEAN` | yes | app: `False` |  | identity |
| `avatar_url` | `VARCHAR` | yes |  |  | identity |
| `reset_token` | `VARCHAR(64)` | yes |  |  | technical |
| `reset_token_expires_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | technical |
| `terms_accepted_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | identity |
| `terms_version` | `VARCHAR(10)` | yes |  |  | identity |
| `token_version` | `INTEGER` | NOT NULL | server: `1`<br>app: `1` |  | technical |
| `password_changed_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | technical |
| `email_verified` | `BOOLEAN` | yes | app: `False` |  | identity |
| `phone_verified_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | identity |
| `whatsapp_consent_at` | `TIMESTAMP WITH TIME ZONE` | yes |  |  | identity |
| `email_verify_token` | `VARCHAR(64)` | yes |  |  | technical |
| `email_verify_expires` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | technical |
| `rescue_no_show_count` | `INTEGER` | NOT NULL | server: `0`<br>app: `0` |  | orders |
| `rescue_block_cleared_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |
| `group_buy_block_cleared_at` | `TIMESTAMP WITHOUT TIME ZONE` | yes |  |  | orders |

**UNIQUE**

- (apple_id)
- (email)
- (google_id)

**Indexes**

- `ix_users_email_verify_token` (email_verify_token)
- `ix_users_last_active_at` (last_active_at)
- `ix_users_reset_token` (reset_token)
<!-- END GENERATED -->
