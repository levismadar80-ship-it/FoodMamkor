# מהמקור — DB Schema + API

> Canonical reference for backend tables and endpoints. Read before any
> schema or routing change. Last full refresh: **April 2026** (during the
> experiences-moderation feature).
>
> The codebase is the source of truth — when this file drifts, fix this
> file. Code lives at:
> - Models: `backend/app/models/` — core tables in `models.py`, the rest one file per area (`catalog`, `engagement`, `home_products`, `events`, `analytics`, `admin_ops`, `recipes`, `rescue`); every name is importable from `app.models.models`
> - Schemas: `backend/app/schemas/` — shared field validators in `schemas.py`, the models one file per area (`registration`, `catalog`, `producer`, `producer_out`, `admin_review`, `community`, `experiences`, `recipes_outreach`, `group_buys_requests`, `events`, `reviews`, `site`); every name is importable from `app.schemas.schemas`
> - Routers: `backend/app/routers/`
>
> **Database:** PostgreSQL on Railway, **no PostGIS**. Distance queries
> use the Haversine formula against `producer_locations.lat/lng` (the
> nearest row per business — MEH-1402; since MEH-1938 chunk 5a the ONLY
> source, with no fallback to the legacy `producers.lat/lng` mirror).
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
| 8 | ~~`producer_followers`~~ | Dropped in MEH-2392 (migration `e5b2d8f4a913`); interest is a favorite | — |
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
| 24 | `outbound_messages` | Outbound WhatsApp sends — one row per real send written by the send layer (MEH-771 Chunk A); `status` lifecycle `accepted`→`delivered`/`failed` reconciled via the Chunk B delivery webhook; outside production also `blocked_nonprod` rows with the would-be content in `error_message` (MEH-3402, OTP codes masked, 7-day window, deduped 24 h); `meta_message_id` (wamid) UNIQUE for idempotency. Mirrors `inbound_messages` phone-key pattern (no FK) | `OutboundMessage` |
| 25 | `producer_locations` | Physical presence points of a producer — branch / pickup / market_stand (a business can have many; e.g. 10 pickup points). Multi-location model (epic MEH-1388) | `ProducerLocation` |
| 26 | `producer_offers` | ONE owner-declared, typed, expiring offer per business — free delivery / gift / first-order / pickup discount, with an optional non-monetary threshold. At most one row ACTIVE at a time (unique partial index); superseded rows persist as history (MEH-1823) | `ProducerOffer` |

> **MEH-1388 — `producer_locations` (multi-location, 2026-07-21):** moves the map from one-pin-per-business to one-marker-per-location. Columns: `id` · `producer_id` (FK CASCADE) · `kind` (`branch`\|`pickup`\|`market_stand`, CHECK) · `label` · `city` · `address` · `lat` · `lng` · `opening_hours` · `phone` · `is_primary` · `location_precision` (`exact`\|`approximate`, CHECK) · `created_at`/`updated_at`. **MEH-3512 (20/11, `a3d5f7b9c1e2`):** `pickup_days` (`varchar[]`, the `DELIVERY_DAYS` names; NULL/[] = «בתיאום», renders as before) · `order_cutoff_day` + `order_cutoff_time` (the point's own «מקבלים הזמנות עד», day and HH:MM together or neither; NULL = the business `order_window`). **MEH-3593 (21/11, `f2b4d6e8a0c3`):** `pickup_note` (`text`, «הוראות איסוף» for the point; see the MEH-3593 note below). Emitted on the public `ProducerLocationOut` and the owner `ProducerLocationOwnerOut`, written by the owner and admin location CRUD (`schemas/order_cutoff.py` → Hebrew 422). The page shows «איסוף ביום…», the cutoff and «האיסוף הבא» under the point (`components/PickupSchedule.jsx`). **Expand-Contract** (ADR-007, chunk 1 `MEH-1395`): a `primary` row is backfilled from `Producer.lat/lng/city`; the old producer columns stay as a mirror during overlap. **Serialization (chunk 2 `MEH-1402`):** `ProducerListOut.locations[]` / `ProducerDetailOut.locations[]` emit `{kind, label, city, lat, lng, is_primary, precision}` plus `opening_hours` + `phone` since MEH-1509 (public — only the street `address` is withheld per MEH-829; the owner-facing `ProducerLocationOwnerOut` on the CRUD includes it). The business page renders a pickup / market-stand row's hours and, since MEH-2477, its phone as a tap-to-call link (`DeliveryBlock.jsx` `PickupRow`). **Geo (chunk 2):** "near me" distance = `MIN(Haversine)` over a correlated scalar subquery on `producer_locations`, with a `COALESCE` fallback to the producer's own `lat/lng` during the Expand overlap — **removed in MEH-1938 chunk 5a (02/09): rows are the only source, `ProducerListOut.lat/lng` are derived from the `is_primary` row (or null), the owner `PUT /producers/me` ignores `city/lat/lng`, and `producers.lat/lng` carry a `LEGACY(2026-10-15)` marker ahead of the chunk-5b drop**; BOTH the list query and the count query stay `DISTINCT` on `producer.id` so a multi-location business counts as **one** result, not N (the historic `_build_base_queries` trap). A delivery-only producer that has a `pickup` location now reappears on the map (controlled reversal of the MEH-213 delivery-only filter); a zero-location delivery-only producer stays hidden. **Map (chunk 3 `MEH-1412`):** per-location markers (pickup/market_stand = a secondary outline), a pickup-layer toggle (removed from /map 13/11/2026 at Sapir's call; pickup pins always draw), a location-label tooltip, and a cluster badge that counts **unique businesses** (dedup by `producerId`), not markers. **Owner CRUD (chunk 4a `MEH-1421`):** `GET/POST/PUT/DELETE /producers/me/locations` (see the API section) with an IDOR ownership 403, a single-primary invariant, and a same-city-label rule. Admin sees a read-only name/city dedup badge on `/admin/producers`; since MEH-3408 `GET /admin/producers` also returns `ProducerAdminOut.dup_name` / `dup_phone`, counted over every business in every status (`services/producer_duplicates.py`, one 2-column query), so the badge fires on a shared phone and on a twin outside the loaded filter. No PostGIS (Haversine in raw SQL, per DEPLOYMENT.md). **Town-only coordinates (MEH-2480, 28/10):** when a location is written with a `city` but no `lat/lng` — at registration (`create_primary_branch_location`) or on the owner `POST`/`PUT` — the server fills the town's seeded centre from `cities.lat/lng` (`services/city_centroid.py`, exact `name_he` first, then `city_key`) and stamps `location_precision='approximate'`. Explicit coordinates are never touched; an unknown town or a delivery-only registration (`has_physical_location=false`) still writes no row. This is how a business passes the submission gate's location requirement with no address provider at all.

> **MEH-509 PR3 (2026-05-22):** `producers.risk_score` (Integer nullable) + `producers.risk_reasoning` (Text nullable) added by migration `92afa3cb76e2`. Populated asynchronously by `app/services/producer_risk.py` via FastAPI BackgroundTasks after producer signup using Claude Haiku 4.5. NULL on both = "not scored yet OR Anthropic call failed (fail-open)". Admin-only — `ProducerAdminOut` schema surfaces them; `ProducerDetailOut` (public) intentionally does not. The admin reads them on the producer list (`RiskBadge` in `AdminProducersTable.jsx`); the separate `GET /admin/producers/{id}/risk-score` route had no caller and was deleted in MEH-3527.

> **MEH-3912 (26/11):** `producers.admin_notes` («הערות פנימיות», the admin's own note) is now READ BACK on `ProducerAdminOut` (admin GET/PUT/POST/list). It had a write path only, so the edit form reopened empty and its next save sent `""` over the note. Never on `ProducerListOut` / `ProducerDetailOut` / `ProducerOwnerOut` (asserted by name in `tests/test_meh3912_admin_notes_readback.py`).

> **MEH-759 (ADR-022 gate 2, 2026-06-06):** `producers.declared_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `a7f3e9c14d28`, Chunk A) + `producers.declaration_version` (VARCHAR(10), nullable) record the binding tier-2 licensing declaration. Chunk B stamps them in `POST /auth/register/producer` (both new-account and MEH-143 upgrade paths) when the new **required** `declaration_accepted: bool` body field is truthy — the handler 422s (`יש לאשר את הצהרת הרישוי כדי להמשיך`) when it is falsy/absent, so a producer row is only ever created with both columns set. Constant `DECLARATION_VERSION` lives in `app/constants.py`. Admin-create / Excel-import paths leave both NULL (no owner declaration). Admin-only exposure — `ProducerAdminOut` surfaces them; `ProducerDetailOut`/`ProducerListOut` (public) intentionally do not.

> **MEH-1995 (Amendment-13 consent evidence, 2026-08-09):** `users.terms_accepted_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `b8d3e7a1c604`) + `users.terms_version` (VARCHAR(10), nullable) record acceptance of the terms of service. Deliberately shaped after the `producers.declared_at` / `declaration_version` pair above — a timestamp proves *that* someone agreed, the version proves *what* they agreed to once the wording changes. Constant `TERMS_VERSION` lives in `app/constants.py`. Stamped from the new **optional** `terms_accepted: bool` body field on `UserRegister` / `ProducerRegister` when truthy, at **all three** password paths: consumer registration, producer registration, and the MEH-143 producer **upgrade** (which mutates `current_user` rather than constructing a `User` — the upgrade renders the checkbox and hard-gates submit, so its consent event is as real as the other two). Optional rather than required so the field is additive: an omitted flag leaves both columns NULL and 422s nothing. **NULL means "no record of acceptance held", never "consent refused"** — there is deliberately NO backfill (Expand-only, ADR-007), because a retroactive timestamp would assert consent at a moment we cannot evidence, manufacturing the very proof the columns exist to provide. **The three OAuth account-creation paths (`/auth/google`, `/auth/apple`, `/auth/register/producer/oauth` step-0) leave both NULL** — those buttons are not gated by the checkbox, so no consent event occurs there; closing that is a product decision, not a code gap. **Exposed nowhere** — neither `UserOut` nor `UserAdminOut` declares them (audit-only; stricter than the sibling pair, which is admin-visible).
>
> **MEH-2080 (age self-declaration, 2026-09-06) — the field is no longer optional.** `terms_accepted: bool` is **required and must be `True`** on `UserRegister` and `ProducerRegister` (a `field_validator` refuses `False` and an omitted key alike with a Hebrew 422 — «יש לאשר את תנאי השימוש ולהצהיר על גיל 18 ומעלה»), because the single checkbox now carries two claims: acceptance of the terms **and** the 18+ self-declaration («אני מעל גיל 18 ומסכימה ל…»). `TERMS_VERSION` moved to `2026-09-v2` so a v1 stamp is distinguishable from one that includes the age claim. No date of birth is collected (ADDENDUM-9 ruling: self-declaration only). The additive-NULL semantics above still hold for rows stamped before this change and for the three OAuth paths, which remain ungated — chunk 2 of MEH-2080.

> **MEH-3026 (2026-11-21) — `TERMS_VERSION` → `2026-11-v3`.** Terms section 2 no longer says the business holds every required licence; it says the business is responsible for finding out what it needs, and that a business without «מאומת» was not checked (legal reasoning: `docs/legal/2026-11-not-a-marketer.md`). Rows stamped `2026-09-v2` keep naming the wording they accepted.

> **MEH-2080 chunk 2 (2026-10-29) — OAuth signup from /register records the consent.** `GoogleAuthRequest` / `AppleAuthRequest` gained an **optional** `terms_accepted: bool = False`. `/register` forwards its checkbox to both buttons (read when the provider answers, not at mount); `/auth/google` and `/auth/apple` stamp `terms_accepted_at` + `TERMS_VERSION` only when it is `True` — new or existing user, same as `register_producer`. An absent/`False` flag writes nothing and erases nothing, so `/login` (no checkbox) is unchanged and its new accounts stay NULL (the honest state; a sign-in-time consent banner would need new copy). Owners are covered elsewhere: Step 2 of `/register/producer` and `/producer-claim` both stamp it, so `/auth/register/producer/oauth` step-0 is deliberately left alone.

> **MEH-762 (ADR-022 public tier contract, 2026-06-06):** `producers.verified_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `f1c7b9a3e264`, Chunk 1) + `producers.verification_doc_type` (VARCHAR(20), nullable; `license`\|`exemption`\|`cosmetics`) record the tier-1 "מאומת" document review. **Chunk 2:** admin stamping via `POST /admin/producers/{id}/grant-verified` (`{doc_type}`) + `/revoke-verified`; the legacy `is_verified` column was fully retired and DROPPED in MEH-766 (writers ch3 #1420, contract ch5 #1578, column ch6 revision `d4e7a92c81b5`). **Chunk 3 public exposure:** `ProducerListOut`/`ProducerDetailOut` now carry `verification_tier` (`"verified"`\|`"declared"`\|`null` — **computed** in `_compute_verification_tier`, never stored), `verified_at` (**date granularity only** — the TIMESTAMPTZ is truncated so no time leaks), and `verification_doc_type`. Resolver (D2/D3): `verified_at` set → `"verified"`; else if no category has `requires_license` (MEH-3255; was the `LICENSE_REQUIRED_CATEGORIES` name list) → `"declared"`; else `null` (no badge, no negative label). Same predicate as `license_validation.categories_require_license`, read from the loaded categories' `requires_license`. Privacy: `verified_at`(date)/`doc_type`/`tier` are public; `declared_at`/`declaration_version`/`producer_license_number` stay admin-only (`ProducerAdminOut`, which also inherits the three public fields at date granularity).

> **MEH-2520 (2026-10-28) — the tier says only what is still true.** The resolver above is narrowed, not replaced; predicate in `app/services/verification_status.py`, shared by the schema tier and the `?verified` filter. `"verified"` additionally requires that the admin-captured `license_expires_at` (MEH-2072) is not before `israel_today()` — NULL = not captured, never expired; the business stays listed, only the badge drops, and a lapsed row counts under `?verified=false`. `"declared"` additionally requires `declared_at IS NOT NULL` — an admin-created, unclaimed business signed nothing, so it gets `null` and the «חתם על הצהרה מחייבת» line is not shown. No backfill (ADR-007): a retroactive `declared_at` would assert a signature nobody gave. Production impact, as last recorded 26/10 (not re-measured here — CC cannot query prod): 1 business, status draft, so no approved row loses a tier.

> **MEH-1011 (2026-07-03):** producer **request-changes** (completion request) flow — the non-terminal twin of reject. Two nullable `producers` columns (migration `a1b2c3d4e5f6`): `requested_changes` (TEXT — the admin's free-text feedback) + `changes_requested_at` (TIMESTAMPTZ, tz-aware). `POST /admin/producers/{id}/request-changes` (`{feedback}`, empty → 400) records the feedback, KEEPS status `pending`, emails the producer, WhatsApps the producer (**MEH-1051** — Meta-approved `producer_changes_requested_v1`, 2 body params `{name, missing}`, fail-open post-commit), and WhatsApps admin; `approve_producer` clears both columns on success. Admin-only exposure via `ProducerAdminOut` (both fields), never public `ProducerListOut`/`ProducerDetailOut`.

> **MEH-2210 chunk A (2026-09-04):** the **rejected → resubmit** loop. Three additive `producers` columns (migration `2c1033ca5745`, expand-only, no backfill): `rejection_reason_code` (VARCHAR(40), nullable — the admin's `preset_key` from `PRODUCER_REJECTION_PRESETS`, stored beside the composed text so the owner banner can branch on it; NULL on legacy rows and free-text rejections), `resubmission_count` (INTEGER NOT NULL DEFAULT 0 — history, never reset by approve), `resubmitted_at` (TIMESTAMPTZ, nullable). `POST /producers/me/request-review` now also admits `status=rejected`: cap `constants.MAX_PRODUCER_RESUBMISSIONS` (3) → 409 «הגעתן למספר השליחות המקסימלי», otherwise the same MEH-2120 completeness gate (unverified phone → 422 `missing=["phone_verified"]` — no `pending_whatsapp`, removed in MEH-2124), then `status=pending`, `resubmission_count += 1`, `resubmitted_at=now()`, admin ping «🔁 שליחה חוזרת #n». `reject` persists the code; `approve` clears `rejection_reason` + `rejection_reason_code` (symmetric with MEH-1011's clearing) and keeps the count. Exposed on `ProducerAdminOut`, `ProducerOwnerOut` and `GET /auth/me` (`producer_rejection_reason_code`, `producer_resubmission_count`).

> **MEH-2496 (2026-10-28):** `producers.claim_link_sent_at` (`TIMESTAMPTZ`, **nullable**, migration `8600916f1942`, Expand-only, **no backfill**) — when an admin last minted an owner-claim link for the draft. `POST /admin/producers/{id}/claim-link` now loads the draft `FOR UPDATE` (serialising with a concurrent claim, which locks the `users` row and then this one — no cycle), keeps every 404/409 before any write, and stamps `now()` in the transaction that mints; a refused mint stamps nothing and a re-mint overwrites. NULL means "no link minted since the column existed" — links minted before it left no trace. It records the **latest** link only; an earlier link stays valid until its own expiry (links are not revoked), and the latest is always the last-expiring one. Admin-only via `ProducerAdminOut.claim_link_sent_at`; absent from `ProducerListOut` / `ProducerDetailOut` / `ProducerOwnerOut`. The revision is pinned by an `ast` reader in `tests/test_meh2496_claim_link_sent_at.py` (self-tested on `2c1033ca5745` first). No new table — `EXPECTED_TABLES` unchanged.
>
> **MEH-2072 (2026-08-21):** `producers.license_expires_at` (**DATE**, nullable, migration `c3e9a1f7b204`) records the business-licence expiry the admin reads off the document at approval. Before it, `producer_license_number` recorded *that* a licence was seen and never *until when* — so the "licensed businesses only" promise was verified on day one and never again. **DATE, not TIMESTAMPTZ, and it deliberately diverges from the sibling `kashrut_expires_at`:** a licence is valid *through a calendar day*, so a timestamp would make "expires today" answer differently either side of 00:00 UTC, which in Israel falls inside the same working day; pairing the column with `israel_today()` keeps the comparison calendar-day vs calendar-day. Expand-only, **no backfill** (ADR-007) — the date lives only on a document, so `NULL` means "not captured yet" and **never** "no expiry" (the reminder query filters `IS NOT NULL`, so a NULL row is never reminded about rather than treated as expired). Admin-only exposure via `ProducerAdminOut`, never public `ProducerListOut`/`ProducerDetailOut` (MEH-530 privacy precedent); present on `ProducerUpdate` but **withheld from `_PRODUCER_WRITABLE_FIELDS`** so only the admin PUT can write it — the `google_place_id` (MEH-1490) arrangement, and for the same reason: it is a record of what the *admin* verified, so an owner-writable version would be self-certification. Deliberately **no validator** — a past date is legitimate input when the licence has already lapsed. **No enforcement anywhere:** nothing hides or un-verifies a lapsed producer; v1 is capture + remind, and auto-hiding a live business on a typo is more dangerous than the gap. Surfaced by `GET /admin/license-expiry-reminders` and edited in the admin `ProducerForm` beside the licence number ("תוקף רישיון (מהמסמך)").
>
> **MEH-1399 (2026-08-21):** the pre-approval review checklist becomes DATA, and every tick becomes an audit record (migration `d4a9c31e6f82`, two tables). Phase 1 (MEH-1396) put `docs/VERIFICATION.md`'s knowledge in front of the admin as a frozen frontend constant with session-local ticks; that left two gaps — editing an item required a deploy, and the ticks evaporated, so nothing recorded WHAT was verified before a business went live.
>
> `admin_checklist_items` — `id` UUID PK, `position` INT NOT NULL (indexed), `label` TEXT NOT NULL, `hint` TEXT NULL, `active` BOOL NOT NULL DEFAULT true, `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now() with model-level `onupdate=func.now()`. Seeded in the migration with the same 7 items `frontend/lib/admin-review-checklist.js` already shipped, so the switch is a change of source and not of content; the constant itself was deleted in MEH-2954 (the migration is the only copy in the repo; the admin edits the live rows in `/admin/settings`). `position` is written as `index * 10` by the router (never accepted from the client — a client-supplied position lets two items claim one slot and makes the order depend on an unspecified tiebreak), spaced so a later insertion needs no renumbering. **Only `updated_at`, no `created_at`:** the question anyone asks of a config row is when it last changed; the audit surface is the other table.
>
> `admin_audit_log` (MEH-3306) — `id` UUID PK, `actor_id` UUID NOT NULL (indexed, **deliberately not a FK**: CASCADE would erase the record with the account, SET NULL is an UPDATE on an append-only table), `action` VARCHAR(160) NOT NULL (method + route template, e.g. `PUT /admin/users/{user_id}/role`), `target_type` VARCHAR(40) NULL, `target_id` VARCHAR(64) NULL (the first path parameter), `details` JSONB NULL (reduced before/after: a role, a status, a flag — never names, phones or free text), `ip` VARCHAR(64) NULL, `created_at` TIMESTAMPTZ NOT NULL DEFAULT now() (indexed). **One row per SUCCESSFUL change made by an admin account**: `get_current_user` (`auth.py`) schedules the write for every signed-in mutating request whose user is an admin, so it covers the `/admin` routes and equally an owner route an admin enters by an inline role check (delete an event, a review). Reads, refused requests and changes that did not go through (404/409/422) leave no row. Append-only in the code (`services/admin_audit.py` inserts; nothing updates or deletes). Not logged: telemetry sent with `get_current_user_lenient`. Fail-open: the row is written after the response, and a failed write is logged, never raised.
>
> `admin_passkeys` + `admin_recovery_codes` (MEH-3305, migration `b4f2c8e1d6a3`, expand-only) — an admin account's second factor. `admin_passkeys`: `id` UUID PK, `user_id` FK users ON DELETE CASCADE (indexed), `credential_id` BYTEA UNIQUE (one credential never signs in as two accounts), `public_key` BYTEA, `sign_count` BIGINT DEFAULT 0 (a counter that goes backwards = a cloned key), `aaguid` VARCHAR(36) NULL (authenticator model), `backup_eligible` / `backup_state` BOOLEAN DEFAULT false (a synced passkey), `transports` VARCHAR(120) NULL, `name` VARCHAR(60) NULL, `created_at`, `last_used_at` NULL. `admin_recovery_codes`: `id`, `user_id` FK CASCADE (indexed), `code_hash` VARCHAR(128) (the code is shown once and never stored), `used_at` NULL (set = spent), `created_at`. Nothing reads them until the passkey routes ship (MEH-3305 chunk 3). CASCADE on both: a deleted admin leaves no usable key or code.
>
> `producer_review_checks` — `id` UUID PK, `producer_id` UUID → `producers.id` **ON DELETE CASCADE** (indexed), `item_id` UUID → `admin_checklist_items.id` **ON DELETE RESTRICT** (indexed **in its own right** — the composite unique below leads with `producer_id`, so it cannot serve the `item_id`-only lookup Postgres runs to enforce the RESTRICT on every parent DELETE), `label_snapshot` TEXT NOT NULL, `checked_by` UUID → `users.id` **ON DELETE SET NULL**, nullable, `checked_at` TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE `(producer_id, item_id)`. **An unchecked item is the ABSENCE of a row**, not a row with a false flag — "never ticked" and "ticked then un-ticked" are deliberately indistinguishable, because the ticket asks for a record of what was verified, not a keystroke log.
>
> **The three delete behaviours are each a decision.** CASCADE on the producer: the checks describe a business, and with the business gone there is nothing left to attest about. **RESTRICT on the item: this is the ticket's "no delete — deactivate only" rule enforced in the schema rather than trusted to the router** — a DELETE against an item that has ever been ticked fails at the database, so audit history cannot be destroyed by removing its subject; `active = false` is the sanctioned retirement path, and the settings UI therefore offers «הפסקת שימוש» and no bin. SET NULL on the actor: deleting an admin account must not delete the record that a check happened; a null actor is a weaker record than a named one and a far better one than none (matches the existing `users.id SET NULL` precedent).
>
> **`label_snapshot` looks redundant next to the FK and is the opposite.** The FK says WHICH item was ticked; the snapshot says what that item SAID at the moment of ticking. It is written at TICK time, never read back at display time — without it, an admin rewording an item next month would silently rewrite the meaning of every historical attestation, and the trail would describe a check nobody performed. Same reasoning as `producer_name_change_requests.current_name`.
>
> **Ticks never gate approval.** The hard gates (photo 422; the licence 422 was removed in MEH-3026) live in `admin_decisions.py::approve_producer` (rules: `services/producer_approval.py`) and are untouched; a tick is a record that a human looked, never a permission. **Re-ticking does not restamp** — an item already ticked keeps its FIRST `checked_by`/`checked_at`, or every autosave would rewrite the audit trail to the most recent page load.

> **MEH-971 chunk 3 (2026-06-28):** `ProducerAdminOut` gains a derived **`license_pending: bool`** — **computed** in `_compute_license_pending` (`@model_validator(mode="after")`), never a stored column / no migration. True iff the producer is in ≥1 category with `requires_license` (MEH-3255; was the name list) AND `producer_license_number` is empty/NULL; status-independent (an override-approved producer still shows it). Mirrors the MEH-762 `_compute_verification_tier` predicate over the already-loaded `categories` (no DB round-trip). **Admin-only** — on `ProducerAdminOut` only, NOT public `ProducerListOut`/`ProducerDetailOut`. Surfaced as the "רישיון ממתין" badge on the `/admin/producers` queue so an admin verifies the license before approving (since MEH-3026 the license no longer blocks approval; the badge only says the business will go live without «מאומת»).

> **MEH-2495 (2026-10-28):** `ProducerAdminOut` gains a derived **`has_owner: bool | None`** (default `None`, so a route that forgot to hydrate it **fails closed** — the admin UI renders neither chip nor action for a non-boolean) — True iff at least one `users` row has `producer_id` = the producer (the same predicate as `producer_claim._has_owner`, which 409s the claim link). **Never stored, no migration.** Hydrated by `services/admin_producer_reads.py::attach_has_owner` in **one** `SELECT DISTINCT users.producer_id … IN (…)` per response (no N+1; DISTINCT because `users.producer_id` has no unique index) on every route that returns `ProducerAdminOut` (`GET /admin/producers`, `/pending`, `/{id}`, `PUT /{id}`, `POST`). **Admin-only** — absent from `ProducerListOut` / `ProducerDetailOut` / `ProducerOwnerOut` (asserted in `tests/test_meh2495_admin_draft_owner.py`). Drives the drafts-list chips «מחכה לבעלים» / «נקלט, בהשלמה» and the row action «העתקת הודעה עם קישור» (ownerless drafts only). The set of routes returning `ProducerAdminOut` is pinned by an OpenAPI-derived inventory test, so a sixth route has to be added — and hydrated — on purpose.

> **MEH-3409 (2026-11-19):** `ProducerAdminOut` gains a derived **`draft_missing: list[str] | None`** — for a draft its owner has claimed (`has_owner` true), the submission requirement codes still missing, from the one definition in `services/submission_gate.py::submission_missing_items` (`image` / `product` / `category` / `location` / `phone_verified`; organizers `image` / `description` / `upcoming_event` / `phone_verified`). `[]` = ready, waiting for her to submit. `None` = not a claimed draft, or a route that does not hydrate it. **Never stored, no migration.** Hydrated by `services/admin_draft_missing.py::attach_draft_missing` on `GET /admin/producers` only, after `services/admin_producer_reads.py::attach_has_owner`; organizer drafts' upcoming events are counted in **one** `COUNT … GROUP BY producer_id` for the page (tests/test_meh3409_admin_draft_missing.py pins the query count). Admin-only.

> **MEH-2974 (2026-11-12):** owner invite for a business an admin built end to end. Eleven nullable columns on `producers` (migration `a7f3c2e94d18`, Expand-only, **no backfill**, `EXPECTED_TABLES` unchanged): `owner_invite_email` / `owner_invite_name` (`VARCHAR(200)`), `owner_invite_token_hash` (`VARCHAR(64)`, **indexed**), `owner_invite_expires_at` / `owner_invite_sent_at` / `owner_invite_accepted_at` (`TIMESTAMPTZ`), `owner_invite_consent_note` (`TEXT`), `owner_invite_created_by` (`UUID` FK `users.id` `ON DELETE SET NULL`), and the three the card's v3 revision added for the email code — `owner_invite_code_hash` (`VARCHAR(64)`), `owner_invite_code_expires_at` (`TIMESTAMPTZ`), `owner_invite_code_attempts` (`INTEGER`). The three joined revision `a7f3c2e94d18` rather than chaining a second one because it had not shipped: nothing had run `upgrade head` against it outside a scratch database, so there was no deployed schema to expand FROM. Columns rather than a table for the same reason as `f4a1e9c3b7d2` and `c4e81b7a2f96` — `EXPECTED_TABLES` lives in a workflow file CC cannot edit — and because a business has at most ONE outstanding invite: re-inviting REPLACES the token, which is also how an outstanding link is revoked. **Only the sha256 hex of the link token is stored**, so a reader of the database cannot accept an invite; the raw token exists only in the creating response and in the email, and `owner_invite_token_hash` is on **no** schema at all. The FK carries `use_alter=True` and an explicit name (`fk_producers_owner_invite_created_by_users`): `users.producer_id` already references `producers`, so this closes a cycle and an unnamed constraint makes SQLAlchemy's `drop_all` raise `CircularDependencyError` — which breaks `conftest._bootstrap_schema` and therefore the whole pytest suite. The same cycle is why `User.producer` now carries `foreign_keys="User.producer_id"`. `ProducerAdminOut` exposes six of the eleven plus a derived **`owner: {name, email} | None`**, hydrated beside `has_owner` in that same single query (a `relationship` would be read per row by Pydantic and reintroduce the N+1 MEH-2541 removed); `owner_invite_token_hash` and `owner_invite_created_by` are on no response shape, asserted structurally against `backend/openapi.json`. Onboarding follow-ups now count from `COALESCE(owner_invite_accepted_at, created_at)` — a self-registered business is byte-identical, an admin-built one counts from the day its owner arrived. **Suspending a live page revokes any outstanding invite on it** (`admin.py::toggle_producer_status`): `inactive` otherwise means two things the row cannot tell apart — hidden-while-building and taken-down — and acceptance publishes the first, so a week-old link could put a suspended page back on the site. An ACCEPTED invite is left alone; the consent note, `created_by` and `sent_at` survive either way. **v3 also widened the precondition**: an invite may be created for a business that is `approved` OR `inactive` (hidden), and accepting a hidden one flips it to `approved` in the same statement that claims the token — the owner's approval is what publishes the page, and IndexNow is pinged only on that real transition.

> **MEH-1255 (2026-07-17):** delivery-exclusion mode ("משלוחים לכל הארץ חוץ מ:"). `producers.delivery_excluded_cities` (`TEXT[] NOT NULL DEFAULT '{}'`, migration `e7c4b1f95a2d`) holds the cities a nationwide-delivery producer does NOT ship to (ShipperHQ include/exclude zone model). CHECK `delivery_excluded_requires_nationwide` (`delivery_nationwide OR delivery_excluded_cities = '{}'`) keeps it empty unless nationwide — the sibling of `delivery_nationwide_xor_cities`. Schema (`ProducerUpdate`/`ProducerAdminCreate`) validators reject an exclusion list without nationwide; partial-update effective-state (list sent alone, or nationwide switched off over a stored list) is guarded in the routers (`app/services/delivery_validation.py`) so it 422s instead of a DB CHECK 500 — detail `{code: "excluded_requires_nationwide", message: "ערים מוחרגות אפשריות רק עם משלוחים לכל הארץ", params: {}}` since MEH-1943 chunk 3 (its MEH-1879 sibling: `nationwide_requires_delivery`); the owner DeliveryCard and admin ProducerForm resolve the code to `dashboard.producer.delivery.errors.<code>` (`lib/delivery-errors.js`). **Public** — `ProducerListOut`/`ProducerDetailOut` carry `delivery_excluded_cities` so `DeliveryBlock` renders "משלוחים לכל הארץ (למעט …)". **Consumer filter:** `GET /producers?delivery_city=X` (`producer_listing.py`) switched from an inner `JOIN delivery_areas` to `EXISTS (…) OR (delivery_nationwide AND NOT X = ANY(delivery_excluded_cities))` — a nationwide producer now matches any city except its exclusions (previously nationwide producers were never returned by the city filter, their `delivery_areas` being empty by the XOR).

> **MEH-1291 (2026-07-18):** producer freshness signal. `producers.updated_at` (`TIMESTAMP WITH TIME ZONE`, **nullable**, migration `a3f1c9d2e4b7`, Chunk A) is stamped by the model-level `onupdate=func.now()` (`models.py`) on every real producer UPDATE — owner edits (`producer_me.py:update_my_producer`) and admin edits (`admin.py:admin_update_producer`), both of which load the ORM object + `setattr` + `commit` (a bulk `update()` execute would skip the stamp — no such path exists on producers). **No `server_default`, NO backfill** (ADR-007 Expand-only): the column stays NULL for producers never edited since the migration, so the public "עודכן לאחרונה: {חודש שנה}" line renders nothing for them (honest signal). **Public** — `ProducerDetailOut` (Chunk B) carries `updated_at` read-only; `ProducerListOut`/map do NOT (detail-page-only). Rendered as a modest month-year footnote at the page end (`ProducerSections.jsx`, `frontend/lib/format-date.js` → he-IL/en-US).

> **MEH-1644 (2026-07-27):** structured delivery-day capture. `delivery_areas.delivery_day` (existing column, NO migration) gains a **write-path whitelist**: `DeliveryAreaCreate.delivery_day` is a `DeliveryDayField` (`schemas.py` — canonical bare Hebrew day names `DELIVERY_DAYS = ["ראשון".."שבת"]`; blank → `None`; anything else 422 `יום משלוח לא מוכר`). `None` stays legal = "בתיאום מראש". **Expand-only:** `DeliveryAreaOut` carries NO whitelist — legacy free-text rows still serialize until Sapir runs `scripts/normalize_delivery_days.py` (dry-run by default, `--apply` to write, refuses non-localhost `DATABASE_URL` without `--allow-remote`). **New owner write path:** `PUT /producers/me` now accepts `delivery_areas: [DeliveryAreaCreate]` (structured rows: city · min_order · delivery_day) — takes precedence over the flat `delivery_area_cities` when both are sent; the nationwide-XOR covers the rows field too (`ProducerUpdate._validate_location_mode`). The dashboard `DeliveryCard` saves rows (per-city day select from `frontend/lib/delivery-days.js`, the frontend mirror of `DELIVERY_DAYS`) and preserves registration-captured `min_order` (the flat delete+insert path used to wipe it). Admin form still uses the flat list (no day input). New-city `delivery_area` alerts (MEH-54/MEH-1360) fire identically on both paths.

> **MEH-1883 (2026-08-04):** timezone sweep — four public read paths moved from the server clock to the Israel calendar day. `date.today()` returns the **UTC** date on Railway, so for the ~3 hours between Israeli midnight and 03:00 the backend still believed it was yesterday. Four call-sites were affected, all comparing against a plain `Date` column: the vacation auto-clear on `ProducerListOut` (a business whose `vacation_until` had passed stayed `on_vacation`, and therefore stayed **hidden from the listings**, until the server clock caught up), and the three "upcoming" filters on `GET /events` (×2) and `GET /experiences` (an event happening today dropped out of the public feed at 21:00 the evening before). All four now call `israel_today()` (`app/utils/clock.py`), which the **write** path had used since AUD-039/040 — the two halves of the same feature had disagreed for three hours a night. No schema change, no migration; response *shapes* are unchanged, only which calendar day the comparison uses. **Two further `date.today()` call-sites were deliberately NOT swept** — the 30-day analytics windows in `producer_me.py` and `admin_extra.py`. Their day buckets come from `func.date(<naive UTC timestamp column>)`, i.e. UTC dates, so converting only the Python label would have put Israel-dated labels on UTC-bucketed counts. Making those correct means converting the SQL bucketing too, which changes every existing number and is its own ticket.

> **MEH-3219 B5 (2026-11-14):** the catalog default-hide rule (`catalog_default_availability_condition`, `services/producer_listing.py`) now reads `vacation_until` too. MEH-1883 fixed the *response* auto-clear, but the SQL filter behind `/producers`, `/producers/count`, `/producers/cities`, `/producers/random` and `/stats` still hid every `on_vacation` row, so a business whose return date had passed stayed off every browse surface until its owner flipped the switch by hand. Rule now: hidden only while `vacation_until >= israel_today()` (or NULL). No schema change.

> **MEH-3219 B12 (2026-11-14):** a recurring experience (`is_recurring`) stores its FIRST occasion in `event_date`. `GET /experiences` (and the nav count that shares `_public_listing_query`) and `POST /experiences/{id}/registrations` now treat it as live after that date, as the host cap already did; a cancelled one (`is_active=false`) still drops out / answers 409. The 30-day registration purge ages a recurring experience's sign-ups by their own `created_at` instead of the experience date. No schema change.

> **MEH-1880 (2026-08-04):** `order_window` joins the **list** contract. The JSONB column (MEH-1543, migration `f4a1e9c3b7d2`; per-day range LIST since MEH-1869) was serialized on `ProducerDetailOut` only, so no listing surface — home grid, `/producers`, `/map` cards, `/favorites` — could tell whether a business is accepting orders right now. `ProducerListOut` now carries `order_window: dict | None` (Detail inherits it, the MEH-1823 `active_offer` / MEH-1577 `delivery_fee` precedent). **Serializer-only:** the column already existed, so there is **no Alembic revision** and `EXPECTED_TABLES` is unchanged; a producer that never set a window serves an explicit `null`, not a missing key. **Frontend contract, and the part that is easy to miss:** `lib/schemas.js` `ProducerListSchema` had to declare it in the same PR — `z.object` strips undeclared keys, so on the two Zod-parsed feeds the field would have arrived and been discarded in silence (the MEH-826 / 901 / 902 / 1704 / 1719 / 1823 mechanism). **UI:** `ProducerCard` renders one derived line, "פתוח להזמנות · עד {שעה}", only while the declared window is open now; closed / null / on-vacation render no node at all. Time-derived ⇒ mounted-guarded, so the SSR pass emits nothing and there is no hydration mismatch.

> **MEH-1889 chunk A (2026-09-04):** `producers.special_hours` — a nullable **JSONB** column (migration `c4e81b7a2f96`, expand-only; `EXPECTED_TABLES` unchanged — a column, not a table) holding per-DATE overrides above the weekly hours axes: `{"2026-09-22": {"ranges": [{"open": "09:00", "close": "13:00"}], "note": "ערב ראש השנה"}}`, where `"ranges": []` means **closed** on that date. **ORDER-AXIS AUTHORITATIVE, and this is the load-bearing part:** `ranges` overrides `order_window` on that date and nothing else. It does **not** override `opening_hours`, because that column is unbounded free text (`models.py:380`, MEH-102) and there is no arithmetic to do against free text — the same split `services/producer_listing.py:508-514` already draws ("`opening_hours` is when the shop is staffed; `order_window` is when the owner said she takes orders"). `note` is **display only**; the store-hours surface renders it and derives nothing from it, which is why JSON-LD (`lib/seo.js:311`, built from `resolveStoreHours()`) is unaffected by this chunk. **Range validation is `_validate_order_day` REUSED VERBATIM**, so `special_hours` and `order_window` cannot drift on what a valid range is. **chunk A is storage + validation only** — reader precedence, the editor, the holiday-suggestion chips and the `today-30` retention rule are all chunk B, and `special_hours` is deliberately **not** in `_PRODUCER_WRITABLE_FIELDS` until the editor ships with it.

> **MEH-3484 (2026-11-20) — delivery zones, several days per city:** migration `f2c6a8e4b0d7` (on `e4b8d2f6a1c3`; expand-only, four NULLable columns, no backfill, no table, `EXPECTED_TABLES` unchanged) adds `producers.delivery_zones` (JSONB NULL, `[{name, delivery_days, min_order, delivery_fee, free_delivery_above}]`, ≤ 20 zones, name ≤ 40), `delivery_areas.zone_name` (varchar(40) NULL — membership, stored once), `delivery_areas.delivery_days` (varchar(10)[] NULL; NULL = read `delivery_day`) and `delivery_areas.free_delivery_above` (int NULL; NULL = the business-level threshold). **Write:** `PUT /producers/me` and `PUT /admin/producers/{id}` take `delivery_zones` `[{name, cities[], delivery_days[], min_order, delivery_fee, free_delivery_above}]` — omitted = zones and memberships stay; `[]` = no zones (each city keeps the values it had, the zone threshold goes). Each `delivery_areas` row (`DeliveryAreaCreate`) also takes `delivery_days[]`; `delivery_day` is then written as the first day so single-day readers answer as before. `services/delivery_zones.py` is the one writer: it stores the zone and COPIES its days / minimum / fee / threshold onto each of its cities' rows (a zone city with no row gets one), so the public page, DeliveryChecker, the «משלוחים» filter and the order flow read a city row exactly as before, and a business without zones is untouched. **422 (Hebrew):** a city in two zones, a zone without a name, two zones with one name, an unknown day, money out of range, more than 20 zones (`MAX_DELIVERY_ZONES`) or 100 cities in a zone (`MAX_CITIES_PER_ZONE`), nationwide together with zone cities (lifted in MEH-3511). **Read:** `DeliveryAreaOut` gains `delivery_days` (`[delivery_day]` for an older row), `zone_name`, `free_delivery_above`; `ProducerOwnerOut` / `ProducerAdminOut` gain `delivery_zones` with each zone's `cities`. The day filter (`?delivery_days=`) matches any of a city's days. The order flow's free-delivery threshold is the city's zone threshold, else the business's.

> **MEH-3511 (2026-11-20) — delivery zones stage 2: delivery time, own cutoff, nationwide zones:** migration `b4e6a8c0d2f3` (on `a3d5f7b9c1e2`; expand-only, seven NULLable columns, no backfill) adds `producers.delivery_days_min` / `delivery_days_max` (smallint, business days, the business default) and `producers.delivery_min_order` (int, the business-wide minimum), and `delivery_areas.delivery_days_min` / `delivery_days_max` / `order_cutoff_day` / `order_cutoff_time` (copied from the city's zone; no per-city editor). **Write:** `PUT /producers/me` and `PUT /admin/producers/{id}` take the three producer fields; each `delivery_zones` item also takes `delivery_days_min`, `delivery_days_max`, `order_cutoff_day`, `order_cutoff_time`. **422 (Hebrew, `schemas/delivery_time.py` · `schemas/order_cutoff.py`):** a day count outside 1..30, «from» above «to», a bad HH:MM, an unknown day, half a cutoff. **Nationwide + zones is now allowed** (the MEH-3484 422 is gone): a nationwide business may hold zones — «אזורים בתנאים אחרים», cities picked freely — whose cities get `delivery_areas` rows; a nationwide business with zones keeps only zone rows, one without zones is untouched. **Read:** `ProducerOut` gains the three producer fields; `DeliveryAreaOut` and the zone items gain the four. The page shows «מגיע תוך …ימי עסקים», the minimum and «מקבלים הזמנות עד» per city / zone (`components/DeliveryTerms.jsx`) and the nationwide zones under «כל הארץ» (`components/NationwideZones.jsx`); DeliveryChecker answers a zone city with the zone's terms; «המשלוח הבא» (MEH-3485) uses the zone cutoff when there is one. The order flow's minimum is the city's, else `delivery_min_order`. A business that fills none of these renders and answers exactly as before.

> **MEH-3055 (2026-11-13) — product order and product groups:** migration `b7d4e2a9c615` (on `e3a5c1d7f904`; expand-only, no backfill, no table, `EXPECTED_TABLES` unchanged) adds `products.position` (int NULL — the owner's order, 0-based; NULL = never ordered), `products.group_id` (varchar(36) NULL, no FK — an id in the business's list) and `producers.product_groups` (JSONB NULL, ordered `[{id, name}]`, ≤ 20, name ≤ 40). Owner routes 👤 in `routers/product_organize.py`: `GET`/`PUT /producers/me/product-groups` (PUT replaces the whole ordered list — add without id, rename, reorder, delete by omission; products of a removed group become ungrouped; 60/hour), `PUT /producers/me/product-order` (`product_ids` must be exactly the business's products, else 409 Hebrew; 120/hour), `PUT /producers/me/products/{id}/group` (`group_id` or null; unknown group or another business's product → 404; 120/hour). Read on `ProductOut.position/group_id` and `ProducerDetailOut.product_groups` (`[]` when NULL). Display order has one owner: `frontend/lib/product-display-order.js` (owner order, else photos first; grouped products laid out by group, ungrouped last). The public page shows group chips only when 2+ groups hold products. **MEH-3477:** `PUT /producers/me/product-groups/assign` `{moves: [{group_id|null, product_ids[]}]}` (≤ 21 moves, ≤ 100 products in all, each once, else 422) moves many products in one all-or-nothing transaction under the producer lock; an unknown group or a product outside the business (or a draft) → 404 and nothing changes; 120/hour. **MEH-3478:** `POST /producers/me/product-groups/suggest` (no body) asks Claude (`AI_MENU_MODEL`, `services/group_suggester.py`) to group the products that are in no live group, from their names, and answers `{groups: [{id|null, name, product_ids}]}` — `id` set when the name matches an existing group; new groups stop at the room left under 20; nothing is saved; no key or a failed call → 503 Hebrew; 10/hour per IP and **10/day per business** (MEH-3497). Both have admin twins under `/admin/producers/{producer_id}/…` with drafts in scope (suggest 30/hour).

> **MEH-2936 (2026-11-19) — what a product's price is per:** no new column. `products.price_unit` and the order-line snapshot `product_order_items.price_unit` widen their CHECK to `unit · kg · 100g · bottle · box` (migration `c7e2a9d4f1b8`, expand-only; downgrade fails while a bottle/box row exists). `POST /producers/me/products` and `PUT /producers/me/products/{id}` accept `price_unit` (default `unit`; omitted on PUT keeps it; explicit null → 422), and every product read returns it. Only `kg` / `100g` make an exact price an estimate in orders (`WEIGHED_PRICE_UNITS`); bottle and box count like `unit`. One vocabulary: `PRODUCT_PRICE_UNITS` in `app/models/product_orders.py`, mirrored by `frontend/lib/product-price.js` and checked by `tests/test_meh2936_product_unit.py`.

> **MEH-3474 (2026-11-20) — «למארז»:** the same CHECK on both tables widens again to `unit · kg · 100g · bottle · box · pack` (migration `e4b8d2f6a1c3`, expand-only; downgrade fails while a pack row exists). `pack` counts like `unit` in orders. The admin import now maps «מארז» / «למארז» / package / pack to `pack` (it used to store them as `unit`); existing products are not rewritten. Pinned by `tests/test_meh3474_pack_unit.py`.

> **MEH-3430 (2026-11-19) — upload a menu, publish the products:** no migration. Owner routes 👤 in `routers/menu_import.py`. `POST /producers/me/menu-import/read` (multipart `files`, 1–5 photos JPG/PNG/WebP/GIF or PDF ≤ 10 pages, 4 MB a file, 6 MB in all — the browser shrinks photos to fit Vercel's ~4.5 MB body; magic bytes decide the type, HEIC → 415; 10/hour + 30/day per IP and 30/day per business → 429) sends the files to Claude (`config.AI_MENU_MODEL`, structured output) and returns `{rows: [{name, description, section, price_min, price_max, price_unit, uncertain[]}]}` — **nothing is saved, the files are not kept**; no key or a failed read → 503 Hebrew. `POST /producers/me/menu-import/publish` (`{products: [{name, description, price_min, price_max, price_unit}]}` — validated as `ProductCreate` with `price_min` required (MEH-2924), any other field → 422; 1–100; 10/hour) runs one MEH-3261 text check for the whole batch first, then creates the products under a row lock on the business, skips names the business already has (same rule as the admin import), refuses past the 100-product cap (409, nothing saved), and fires **no** new-product alerts (MEH-2312 precedent). `GET /producers/me/dashboard` `attention` gains `products` (count; `-1` when the count failed). **MEH-3478:** each publish item may carry `section` (≤200 chars, the menu heading); it is not stored on the product — it becomes the product's group, matched by name (strip + casefold) to the business's `product_groups`, new groups appended in menu order under the same lock. A heading that fails the group-name rule (1–40 chars) or would pass `MAX_PRODUCT_GROUPS` (20) leaves that product ungrouped; the publish is never refused over a heading.

> **MEH-3479 (2026-11-20) — «הצעת תיאור» for a product:** no migration, nothing saved. `POST /producers/me/product-description/suggest` 👤 (body `{name, group?, price_min?, price_unit?, description?}` — what the form holds, a new product included; 10/hour per IP and 30/day per business → 429) and its admin twin `POST /admin/producers/{producer_id}/product-description/suggest` 🔒 (60/hour; unknown business → 404) return `{description}` from Claude (`services/description_writer.py` via `services/ai_text.py`, the fast tier `config.AI_FAST_MODEL`, thinking off). Admin twin: hourly limit only, no daily cap. A sentence claiming kashrut, organic, gluten-/sugar-/lactose-/dairy-/nut-/egg-/soy-free, vegan, parve, natural, «דל …» or health benefits that the input does not already say is dropped (niqqud and maqaf ignored); ≤ 400 chars. No key, a failed call, or nothing left → 503 Hebrew. The text is stored only by the product POST/PUT, which moderate it like a typed description (MEH-3261).

> **MEH-3483 (2026-11-20) — «ספרו לנו על העסק», a page draft from free text:** no migration, nothing saved. `POST /producers/me/page-fill/read` 👤 (body `{text}`, 20–6,000 chars after trim, shorter → 422 Hebrew; 10/hour per IP and 20/day per business → 429) and its admin twin `POST /admin/producers/{producer_id}/page-fill/read` 🔒 (60/hour; unknown business → 404) return `{draft: {description, category_ids[], delivery_cities[], opening_hours, phone, instagram, facebook, website, contact_email, primary_contact_method}}` from Claude (`services/page_filler.py`, the fast tier, structured output). Nothing the text does not say survives: a contact detail must appear in the text (a phone by its digits), a category id must be one of `categories`, a city must be on the city list (`data/cities.py`, canonical spelling), hours must parse as the `opening_hours` grammar, the contact method must be an allowed one, and the description loses any claim sentence the text does not make (the MEH-3479 filter). No key or a failed call → 503 Hebrew. The screen saves the approved fields with `PUT /producers/me` (admin: `PUT /admin/producers/{id}`) and menu photos through `POST /producers/me/menu-import/read` + `/publish`.

> **MEH-3740 (2026-11-23) — a form draft from free text, one route for every dashboard form:** no migration, nothing saved. `POST /producers/me/ai-fill/{form}` 👤 (body `{text}`, the page-fill limits: 20–6,000 chars after trim, 10/hour per IP and 20/day per business → 429) returns `{form, draft: {<field key>: value}}` for the field map `backend/app/data/form_maps/<form>.json` (`services/form_filler.py`, the fast tier, structured output, behind the MEH-3498 ceiling). `form=recipe` today: `{title, description, ingredients, instructions, prep_time_min, cook_time_min, servings, product_ids[]}`. A product comes only from the owner's own products (numbered in the prompt, mapped back to ids), a number only when the text writes it (or its hours), a description sentence with a claim the text does not make is dropped. Unknown form → 404 Hebrew; no key, ceiling or a failed call → 503 Hebrew. The recipe form saves through `POST/PATCH /producers/me/recipes` as before. **MEH-3751 adds `form=event`** (`data/form_maps/event.json`): `{title, description, category (one of the four), event_date (today to a year out), event_time, end_time (HH:MM), location, city (on the site's list and named in the text), price, max_participants}`; today's Israel date is in the prompt so «ביום שישי» can be dated. The event form saves through `POST /events` as before. **MEH-3752 adds `form=order_setup`** (`data/form_maps/order_setup.json`): `{slot_cap, cancel_cutoff_hours, min_order (whole shekels), slot_minutes (30/60/120 only), lead_time_hours, windows: [{weekday 0=Sunday, start_time, end_time, fulfilment}], product_ids[]}`. A window is kept only when the text names its day and its hours, and only if the week passes `OrderWindowsIn` (no overlap, ends after it starts). Never drafted: the business ID, `enabled`, `auto_confirm`. Each card saves through its own route (`PUT /producers/me/order-settings`, `PUT /producers/me/order-windows`, `PUT /producers/me/products/{id}/ordering`) as before.

> **MEH-3480 (2026-11-20) — «הצעת תשובה» to a review:** no migration, nothing saved. `POST /reviews/{review_id}/reply/suggest` 👤 (no body; the owner of the reviewed business only — anyone else, the admin included, gets the reply route's 404 «ביקורת לא נמצאה»; 10/hour per IP and 30/day per business → 429) returns `{reply}`: a Claude draft from the stars and the review text (`services/reply_writer.py` via `services/ai_text.py`, fast tier). A sentence offering a refund, credit, discount, gift or anything free is dropped; ≤ 600 chars. No key, a failed call, or nothing left → 503 Hebrew. Only `PUT /reviews/{review_id}/reply` stores, moderates (MEH-3259) and notifies.

> **MEH-3035 chunk 1 (2026-11-13):** `producers.payment_info` — a nullable **JSONB** column (migration `e3a5c1d7f904`, on top of `a7f3c2e94d18`; expand-only, no backfill, `EXPECTED_TABLES` unchanged) describing how a business takes payment: `{"methods": [...], "timing": str|null, "note": str|null}`. `methods` ⊆ `bit · paybox · bank_transfer · cash · credit_card` (unique; stored in that order), `timing` ∈ `advance · on_pickup · deposit`, `note` one optional line, stripped, ≤ 80 chars, ≥ 3 letters (MEH-555). An all-empty value is stored as NULL. Validated by `schemas._payment_info_validator` (422 Hebrew); read on `ProducerDetailOut` (and so `ProducerOwnerOut`), not on the list contract. **Chunk 2:** owner-writable through `PUT /producers/me` (`_PRODUCER_WRITABLE_FIELDS`; explicit `null` clears), edited in the dashboard card «איך משלמים לעסק?» (`PaymentInfoEditor.jsx`, contact group, anchor `#payment-info`). **Chunk 3:** rendered on the business page as the «איך משלמים?» answer-first chip in the «שאלות נפוצות» section under «משלוחים» (`WhatsAppQuestionChips.jsx`, after the delivery question when that is asked — MEH-3460 — only when something is set) and in JSON-LD as `paymentAccepted` (methods only, English names). **MEH-3895:** an optional `link` key — the business's own prepay link (https only, no `user:pass@`, ≤ 300 chars; `schemas/payment_link.py`), stored only when set. A buyer is shown it only while `timing` ∈ `advance · deposit`: `GET /rescue/offers/{id}` returns it as `producer.prepay_link` + `producer.prepay_timing`, and the group-buy page reads it from the producer detail. A buyer's cancel at such a business emails the owners the amount to return.
>
> **MEH-1889 chunk B (MEH-2264, 2026-09-05):** the rest landed, no migration. `special_hours` is now **owner-writable** (`_PRODUCER_WRITABLE_FIELDS`, row 45 of the guidance audit) and **serialized on `ProducerListOut`** — the list contract, not only the detail one, for the MEH-1880 reason (ProducerCard's "open for orders" line and the open-now chip read the order axis from list data). The validator additionally **rejects dates older than `israel_today() − 30`** (422 «התאריך … כבר עבר — אפשר להגדיר שעות מיוחדות רק לתאריכים מה-30 הימים האחרונים ואילך»), after the shape checks. **Readers:** `GET /producers?open_for_orders_now=` consults today's override first (`special_hours -> <today> -> ranges` via JSONB subscripts; `[]` = closed; no key = the weekly answer byte-for-byte; an override with no weekly window is still a declaration, so it lands on the closed side rather than vanishing from both), and the frontend `getOrderWindowStatus(orderWindow, now, specialHours)` does the same for the header status, the card line and the chip evaluator, scanning 14 days ahead. Past dates are ignored by every reader and dropped by the editor on its next save. **Editor:** `SpecialHoursEditor.jsx` in the dashboard's זמנים group; holiday suggestion chips read `holidaysOn(today)` in `frontend/lib/holidays.js`; since MEH-3017 the dates are computed from the Hebrew calendar (`frontend/lib/hebrew-holidays.js`), not typed per year.
> **MEH-1456 chunk A (2026-09-04, night session):** `categories.is_system` — `BOOLEAN NOT NULL server_default false` (revision `b7d3e5a9c1f4`, expand-only; `EXPECTED_TABLES` unchanged). Declared ownership **on the row** for the 18 `seed_data.CATEGORIES` categories (Oracle Siebel *Protect Seed Data*, IBM RDU `WRITE_PROTECTED`; GBP's closed taxonomy and Etsy's immutable `taxonomy_id` say the same thing). **Two writers, on purpose:** the revision backfills existing databases by `name` — `name` is UNIQUE and is the seed's own conflict key (`seed_data.py:283`), so a seed-named row *is* the seed row and no prod measurement is needed — and `seed_categories` writes `is_system=True` on its own INSERT, because on a fresh database migrations run **before** the boot seed inserts anything, so a migration-only backfill would leave every seeded row `False`. The revision fails loud if categories exist but none carries a seed name (CATEGORIES drifted from its snapshot). `slug` already existed (`a7c3e91d5f28` / `c9f2a41e8b03`), `emoji` is **live** (`search.py:182`, admin stats) and is not dropped. Exposed read-only as `is_system: bool` on `CategoryOut` (ADR-006 R1, same PR — the CI reviewer caught its absence), so it rides every nested `categories[]` in the producer responses and is recorded in `producer_contract_snapshot.json`; deliberately **not** on `CategoryHit` (a search hit never gates an edit). **Chunk 2b** makes `update_category` / `delete_category` refuse a rename or delete while `is_system` is `True`.

> **MEH-3255 (grill retro D10, 2026-11-14) — expand step:** `categories.requires_license` — `BOOLEAN NOT NULL server_default false` (revision `f1a7c3e9b5d2`, ADR-007 expand-only; `EXPECTED_TABLES` unchanged). Backfilled by name from a snapshot of `constants.LICENSE_REQUIRED_CATEGORIES` (9 names); fresh databases get it from `seed_categories` on INSERT. `POST /admin/categories` now takes `CategoryCreate`, where `requires_license` is **required** (no default → 422), and the admin form asks «הקטגוריה דורשת רישיון ייצור ממשרד הבריאות?». `PUT` keeps `CategoryIn` — the flag is not editable there. Exposed as `requires_license: bool` on `CategoryOut`. **Contract step (same card):** every reader now uses the column — `license_validation.categories_require_license`, `_compute_verification_tier`, `_compute_license_pending`, the category rename guard (`admin_extra.update_category`, now `if cat.requires_license`) and the frontend `requiresProducerLicense` (falls back to the name list only for an object without the field). `constants.LICENSE_REQUIRED_CATEGORIES` stays as the seed's source; `tests/test_meh3255_requires_license_parity.py` keeps the seed and the migration snapshot equal to it.

> **MEH-1494 chunk A (2026-09-04, night session):** `producers.recommended_at` (`TIMESTAMPTZ`, nullable) + `producers.recommended_note` (`TEXT`, nullable) — revision `e2a7c9d4b6f1`, expand-only, `EXPECTED_TABLES` unchanged. The editor's pick (`is_recommended`, MEH-18) gets a **date** and a **reason**, the way the programmes it imitates work in cycles: TripAdvisor Travelers' Choice is a 12-month window, the MICHELIN Guide re-inspects every 12–18 months and withdraws stars. **No backfill** — rows already recommended keep `recommended_at = NULL`, which chunk B's review list reads as "picked before the clock existed, due now" rather than a fabricated date. **`recommended_note` is admin-only and is on no public schema**; `test_meh1494_recommended_at_note.py` asserts its absence from `ProducerListOut` and `ProducerDetailOut` by name. Chunk B: the admin toggle stamps `recommended_at` (False→True = now(), True→False = NULL), the note field joins `admin/ProducerForm.jsx`, the review list is `recommended_at IS NULL OR < now() - 12 months`, and `ProducerUpdate`'s stale `is_recommended` declaration (`schemas.py:1841`, ignored on write) is removed.

> **MEH-1287 chunk A (2026-09-04, night session):** `producers.in_season_until` (`DATE`, nullable) — revision `f5b8d2c7a3e9`, expand-only, `EXPECTED_TABLES` unchanged. Storage for the editorial "עכשיו בעונה" homepage module: the admin sets the date the business is in season **until** (Israel calendar day, compare with `israel_today()`); `NULL` = not curated. **A date, not a boolean**, so it expires by itself instead of being a flag someone forgets in winter — the same clock-not-flag shape as `recommended_at`, and the way Etsy/Instacart treat seasonal curation (time-bound moments, not attributes). No flag/tag/collection store existed on `producers` (measured; `lib/featured-producer.js` reuses `is_recommended`, which is already the editor's pick), so a column was needed; it migrates into a `homepage_collections` table trivially once MEH-391 opens. **Not owner-writable** — `test_meh1287_in_season_until.py` asserts absence from `ProducerUpdate` by name. Chunk B: admin date field, homepage module rendered only when `count(in_season_until >= today) >= 3` (ADDENDUM-4), with tests for both sides of the gate.

> **MEH-1823 (2026-08-02):** typed expiring offers — `producer_offers` (migration `b6e1d94a3f27`, EXPECTED_TABLES 38 → 39). **Why a table:** an offer is a bounded, dated object with its own lifecycle, not a property of the business. **Why threshold_value + threshold_unit:** the evidence that opened the ticket ("בהזמנה של 10 ליטרים ומעלה – המשלוח חינם") had nowhere to live — `producers.free_delivery_above` is INTEGER *shekels*. The pair is both-or-neither (CHECK), and is optional for **every** `offer_type` — deliberately not gated by type. **Public read:** `ProducerListOut.active_offer` (so `ProducerDetailOut` inherits it — the MEH-1577 `delivery_fee` precedent) emits `{id, offer_type, threshold_value, threshold_unit, headline, starts_at, expires_at}`. **Filtered SERVER-side, never client-side:** `Producer.active_offer` (models.py) is the single place the window rule is applied — `is_active AND (starts_at IS NULL OR starts_at <= israel_today()) AND expires_at >= israel_today()` — so an expired or not-yet-started offer cannot leave the API through any read path; `selectinload(Producer.offers)` at all four query sites keeps it O(1). Both boundaries are inclusive: an offer starting today is live today, one expiring today is live today. **Owner write:** `PUT /producers/me` carries `active_offer`, three-valued — omitted = no change, explicit `null` = deactivate, an object = replace (deactivate the current row, insert a new one; the superseded row stays as history). The omitted-vs-null distinction needs `model_fields_set`, not `exclude_unset`, or an unrelated dashboard save would silently wipe the offer. A concurrent double-save collides on the unique partial index and returns **409**, not 500. **Validation** (`ProducerOfferCreate`): closed vocabularies, `threshold_value > 0`, `expires_at` must be future by `israel_today()`, `headline` ≤ 60 chars and Emoji-LOCK rejected. **UI:** `OfferBadge` above the delivery block on the business page + a short chip on `ProducerCard`; a business with no offer renders nothing at all.
>
> **MEH-2598 (2026-10-29) — «קנייה במקום» filter:** `GET /producers?on_site=true` (`producer_listing._on_site_condition`) = `has_physical_location` AND NOT `by_arrangement` (MEH-2447) AND non-blank opening hours on the primary location, else the legacy `producers.opening_hours` (the same resolver as `frontend/lib/hours.js` `resolveStoreHours`). A third peer of the service group: OR-ed with the delivery axes and `pickup_points`, never AND-ed. No migration. `ProducerListOut.sells_on_site` (computed in `attach_badge_fields`) mirrors the predicate; `tests/test_meh2598_on_site_filter.py` asserts flag = filter membership. The map card's «קנייה במקום» tag reads `sells_on_site` and now shows beside «משלוח» / «איסוף עצמי» instead of only when neither is declared. The chip is data-gated (≥ 5 businesses) like every new axis.

> **MEH-1645 (2026-07-27):** consumer delivery-day filter. `GET /producers?delivery_day=` accepts ONE canonical Hebrew day (`schemas.DELIVERY_DAYS` — the MEH-1644 vocabulary; anything else 422 `יום משלוח לא מוכר`). **v1 semantics:** only EXPLICIT `delivery_areas` rows with a matching day count — nationwide producers and day-less rows ("בתיאום מראש") are excluded from day filtering (integrity of "משלוח ביום X" over recall). With `delivery_city` the city+day must match on the SAME row — a single EXISTS (`producer_listing._delivery_day_condition`), which REPLACES the `_delivery_city_condition` (its nationwide OR-branch is deliberately dropped when a day is present; the MEH-1487 shared helper is untouched). Home UI: progressive-disclosure day-pill row beside the ActiveFilterChip (renders only while a city filter is active — never a primary chip), chip label "משלוח ל{city} · יום {day}", `?day=` deep-link (city-guarded: a day-only URL drops the day — invisible-filter guard), and a zero-result "הסרת סינון היום" suggestion above the region fallback.

> **MEH-2459 (2026-10-28) — `producers.kind` (ADR-036):** `VARCHAR(20) NOT NULL DEFAULT 'producer'`, CHECK `producer_kind_values` (`producer`\|`organizer`), migration `f1a2b3c4d5e6`. An **organizer** (markets / events, sells nothing) is a `producers` row, not a new entity — `events.producer_id` is NOT NULL. One predicate, `producer_listing.is_business()` = `status='approved' AND kind='producer'`, is composed by every business surface: `GET /producers` (list, `?q=`, geo), `/producers/count` · `/cities` · `/random` · `/by-slug/{slug}` (organizer → 404) · `/producers/{id}` (public 404; owner/admin 200), `GET /search`, `GET /stats`, `cities.py`, public experiences/recipes joins, the dashboard city rank, admin stats/analytics/map pins. **Not** applied to `GET /events` / `/events/upcoming` (organizer events are the point) or the admin queue (`ProducerAdminOut.kind`, «מארגן» chip). `POST /admin/producers/{id}/grant-verified` → **409** for an organizer (never «מאומת»). Serialized as `ProducerListOut.kind`; `EventOut` gains `owner_kind` (`producer`\|`organizer`) + `owner_slug` for the event card's owner link (chunk 3).
>
> **MEH-2465 (2026-10-28) — existence-only gates closed:** endpoints that used to check only that the row exists now refuse or skip `kind='organizer'`: `POST /favorites/{id}` → 404, `GET /favorites` skips organizer rows; `POST /producers/{id}/reviews` → **409** «אי אפשר לכתוב ביקורת על מארגן», `GET /producers/{id}/reviews` + legacy `GET /reviews` return nothing for an organizer; `GET /producers/{id}/google-rating` → 404; `POST /reports/producer-info` → 404 (slug or id); `GET /producers/{id}/kashrut-cert/{code}` → 404 before any fetch (`servable_kashrut_certs` in `services/kashrut_cert_proxy.py` checks `kind`). Admin `total_producers`, `new_producers_this_week` and the monthly series (dashboard + `/admin/analytics`) count `kind='producer'`; `pending_producers` and recent activity still include organizers (they are approved through the same queue).

> **MEH-2952 (2026-11-11) — `producers.is_test` + `users.is_test` (MEH-2892 §C.3):** `BOOLEAN NOT NULL DEFAULT false`, migration `b8cb5480552f` (on top of `19ac967d78fb`; expand-only, no backfill, `EXPECTED_TABLES` unchanged). A seeded test business for the post-release smoke. **One rule:** `producer_listing.is_business(include_test=False)` now also requires `is_test = false`, so a test row is absent from every surface that already composed it, except its own page at by-slug (chunk 3, below) (list, `?q=`, map, count, cities, random, `/search`, `/stats`, `/cities`, group buys, experiences, recipes, favorites, follower alerts, delivery waitlist, admin business counts). Readers that keep organizers visible add the building block `not_test_producer()` instead: the events feed and `/events/upcoming`, saved events, the organizer pages, the rescue list. Gates on a loaded row use `is_business_row()`: `GET /producers/{id}` and `POST /producers/{id}/view` (404 to strangers, owner/admin still see), the experience host link. `is_live_owner_row()` (approved, not test, any `kind`) gates `GET /events/{id}` and event sign-up and is IndexNow's owner check; `indexnow.producer_urls()` / `recipe_urls()` return nothing for a test row, so no path pings one (the admin toggle / approve / reject ping without a public check). The remaining hand-written ORM checks of the form `<producer>.status ==/!= 'approved'` (or `.in_([...])`) are an inventory in the guard file, with a count and reason per file; raw SQL, `filter_by(status=...)` and other variable names are not counted. `POST /rescue/orders` refuses a test row's bag by id (404, same as a missing bag). `include_test=True` is allowlisted by file in `tests/test_meh2952_is_test_guards.py` (none in chunk 1; `routers/producers.py` from chunk 3, for by-slug). **Writers (chunk 4, 20/11):** exactly two, allowlisted by file in the same guard (`WRITERS_ALLOWED`), which still fails on any other write outside `tests/` and on any response model with an `is_test` field: the admin switch «עסק בדיקה — מוסתר מהאתר» (`routers/admin_test_business.py`, below; body key `hidden`, so the column name is in no schema) and `seed_demo_business.py --mark-test` (opt-in, **off by default**, and refused when `RAILWAY_ENVIRONMENT=staging` — the staging demo businesses stay visible for the /join clips and E2E). A failed read of the id list renders neither the switch nor the tag (unknown ≠ public). IndexNow on a flip announces the business page only; its recipe / event / experience / group-buy URLs already 404 to strangers (chunk 1) and drop at the next recrawl. **Chat tools:** `chat_db_tools` (role `mcp_reader`) filter `p.is_test IS FALSE` in all four tools; migration `c05dbc247ca1` grants that one column (`READER_COLUMNS` = the union of `a29c7a4a41e7` and `c05dbc247ca1`, pinned by `test_grant_mirror_matches_migration`). **Send layer (chunk 2):** `send_email` / `send_text` / `send_template` take `test_cause: bool = False`, and every caller whose send is caused by a business or a user passes it from the row it holds (`producer.is_test` / `user.is_test`), so a send caused by a test row is dropped with one INFO log line before any transport call — staging and production alike, no allowlist, pinned per call site in `tests/test_meh2952_send_layer.py`. **The business page (chunk 3, 21/11):** `GET /producers/by-slug/{slug}` composes `is_business(include_test=True)`, so a live test row answers everyone at its direct URL (the golden-path run's); a pending or organizer test row is still 404. `ProducerDetailOut.noindex` (bool, no column) is in **every** answer of by-slug and `GET /producers/{id}`: false for a live business, true for a test row. The page (`app/[locale]/[slug]/page.js`) then sets `robots: noindex, nofollow` and renders no JSON-LD. `GET /producers/{id}` and `POST /producers/{id}/view` keep the 404 to strangers. The sitemap needs no change: it lists `GET /producers`, which never returns a test row. The page's own resources (google-rating, reviews, kashrut-cert, contact/WhatsApp clicks, `POST /reports/producer-info`) follow the page and answer for a test row, so the golden path can walk them; sends from them are already dropped by the send layer.

> **MEH-2513 (2026-10-28) — not-live businesses gated the same way:** a business whose `status` is not `approved` (inactive / rejected / pending / draft) is treated like a missing one on the side doors: `POST /users/me/favorites/{id}` → 404, `GET /users/me/favorites` skips it (the row is kept, so a reinstated business returns to the list), `POST /producers/{id}/reviews` → 404 «בית עסק לא נמצא», and `fire_alerts` sends nothing for it (one gate for new product / event / delivery area / recipe alerts). All three use `is_business()`. `GET /producers/{id}/reviews` is unchanged, since the owner's own page preview reads it.
> **MEH-2460 (2026-10-28) — registering as an organizer:** `POST /auth/register/producer` accepts `kind` (`producer` default \| `organizer`). For an organizer the schema drops any `category_ids` (and skips the ≥1 rule), and writes `has_physical_location=true, offers_delivery=false, delivery_nationwide=false`, no delivery cities/areas, no license — the one shape CHECK `producer_location_mode` accepts with no delivery claim (the row is never shown as a business). `GET /auth/me` → `UserOut.producer_kind`. Submission gate (`services/submission_gate.py`): an organizer needs image + description + ≥1 active event dated today-or-later (Israel) + verified WhatsApp — codes `image` · `description` · `upcoming_event` · `phone_verified` (`ORGANIZER_SUBMISSION_REQUIREMENTS`); never product / category / location. `ProducerOwnerOut.upcoming_events_count` (filled by `GET`/`PUT /producers/me` for organizers, 0 otherwise) feeds the client mirror. An organizer row stores no `address` / `lat` / `lng` and gets no `producer_locations` row (no map point). The registration placeholder description («אכתוב אחר כך» → `auth.register.producer.default_description`) counts as missing (`DEFAULT_PRODUCER_DESCRIPTIONS`, parity-tested against `lib/producer-completeness.js`). Onboarding follow-up emails (`services/onboarding_followup.py`) select `kind='producer'` only. Edit hub: an organizer sees the profile + contact groups; a deep link or `?group=` into another group stays on the hub, and the «חובה» chips follow her gate (bio required).
> **MEH-2475 (2026-10-28) — organizer page fields + organizer city:** `OrganizerPublicOut` also carries the dashboard's profile + contact fields (null when unfilled). `PUT /producers/me` writes `city` for `kind='organizer'` only (stripped, 1–100 chars, blank → 422 «יש לבחור עיר»); for a business `city` is still ignored, because its city follows the primary location row (MEH-1938 ruling A) and an organizer has no location rows. Editor: `OrganizerCityCard` in the dashboard «קשר» group (anchor `#organizer-city`).
> **MEH-3137 (2026-11-14) — grower declaration after registration:** `farmer_declaration_accepted: bool = false` is also accepted by `PUT /producers/me`, `POST /producers/{id}/claim`, `POST /auth/owner-invite/{token}/accept` and `POST /producers`. A business with `farmer_declared_at` NULL that ends up in ירקות/פירות (`FARMER_DECLARATION_CATEGORIES`) without the flag gets 422 «יש לאשר את הצהרת המגדל כדי להמשיך» (after the license 422; on the invite, before the email code is spent). The owner paths stamp `farmer_declared_at` / `farmer_declaration_version` once; an already-declared business is never asked again, and a `PUT` that sends no `category_ids` is not gated. `POST /producers` gates but does **not** stamp — that row is an ownerless draft, so the claim or invite asks the real owner. Admin writes drop the key (the line is the owner's to sign), so an admin can still place a business in a grower category with the column NULL; the owner's next categories save asks her. `ProducerOwnerOut.farmer_declared_at` lets the dashboard categories card show the box only when needed; the invite lookup's `requires_farmer_declaration` is false once the line is recorded.
> **MEH-2461 (2026-10-28) — public organizer page:** `GET /organizers/{slug}` (`routers/organizers.py`) → `OrganizerPublicOut` {id, name, slug, description, short_description, city, images, phone, instagram, website, facebook, owner_bio, owner_photo_url, contact_name, established_year, primary_contact_method, contact_email, whatsapp_group, external_order_form (MEH-2475), upcoming_events: `EventOut[]`} for an **approved organizer only** — 404 «מארגן לא נמצא» for a business slug, a pending organizer or an unknown slug; upcoming = active, dated today-or-later (Israel), soonest first. No address / license / business fields. `GET /organizers` → `[{slug, name}]` (approved organizers with a slug) — the sitemap's source for `/organizers/{slug}`. `organizers` is a reserved slug (backend `slug_utils.RESERVED_SLUGS`, frontend `lib/slug.js` RESERVED). Both routes: 120/min (parity with `/producers/by-slug` and `/events/{id}`), `Cache-Control: public, s-maxage=30, stale-while-revalidate=30` on 200 only. Event JSON-LD (`lib/seo.js buildEventJsonLd`) points an organizer's event at `/organizers/{slug}` (no URL when the organizer has no slug).
>
> **MEH-3348 (2026-11-17) — JSON-LD from fields the pages already fetch (no API change):** `/organizers/{slug}` emits `Organization` + `BreadcrumbList` (`buildOrganizerJsonLd`). An `Event` (events and workshops) states `maximumAttendeeCapacity` from `max_participants`, and `remainingAttendeeCapacity` + `offers.availability` (`InStock` / `SoldOut`) from `spots_left`; nothing when there is no cap or the item is cancelled. A workshop also states `endDate` (start + `duration_minutes`, same day only), `organizer.url` (the host's business page) and keeps its `BreadcrumbList` when it has no date or city. A business with a location that also delivers states `areaServed` (`"Israel"` when `delivery_nationwide`, else the `delivery_areas` cities). All in `frontend/lib/seo.js`.
>
> **MEH-2469 (2026-10-28) — event end time:** `events.end_time TIME NULL` (revision `b7e3c1d9a2f4`, Expand-only). `EventCreate` / `EventUpdate` / `EventOut` carry `end_time`; an end time needs a start time and must be after it (same day) → 422 «שעת הסיום צריכה להיות אחרי שעת ההתחלה» — on create via the schema, on `PUT /events/{id}` against the values the row will hold. Shown as «09:30–15:00»; JSON-LD `endDate`.
>
> **MEH-2938 (2026-11-19):** `POST /auth/register/producer` accepts an optional `external_order_form` (online shop / order-form link, ≤500, same http(s)-only guard as `ProducerUpdate`) and writes it to the existing `producers.external_order_form` column (MEH-296) on both the new-account and MEH-143 upgrade paths. No migration. Same request, MEH-2925: `MAX_PRODUCER_CATEGORIES` is 5 (was 3) on every schema that carries `category_ids`.

> **MEH-1471 (2026-07-22):** self-reported attribution ("מאיפה שמעת עלינו?"). `producers.referral_source` (`VARCHAR(40)`, **nullable**) + `producers.referral_source_other` (`VARCHAR(120)`, **nullable**), migration `d7b2f4a9c6e1`. `referral_source` stores an **English key** from `constants.REFERRAL_SOURCE_KEYS` (`business_referral`\|`friends_family`\|`instagram`\|`facebook`\|`google`\|`whatsapp_group`\|`direct_outreach`\|`other`\|`prefer_not_to_say`) chosen at the final registration step; Hebrew labels are rendered from i18n. `referral_source_other` holds the optional free-text answer, revealed only when the key is `other`. Validated at the API boundary (`ProducerRegister._validate_referral_source` → **422** on an unknown key; `referral_source_other` bleach-sanitised) — **no DB CHECK/enum** (app-layer, like `availability_state`/`verification_doc_type`). Field is optional at the Pydantic layer (nullable column, MEH-143 upgrade path); required-ness is a **front-end** registration gate only. **No `server_default`, NO backfill** (ADR-007 Expand-only) — existing rows stay NULL (admin renders "—"). **Admin-only** — `ProducerAdminOut` surfaces both; public `ProducerListOut`/`ProducerDetailOut` do NOT (internal supply-side data, MEH-530 privacy precedent). Displayed read-only under the producer name in the `/admin/producers` table (`AdminProducersTable.jsx`, `"אחר: <text>"` for the `other` case). **MEH-2937 (2026-11-19):** a supplied `referral_source_other` must hold ≥3 letters after sanitising (`_min_letters_validator`, 422 «שדה זה חייב להכיל לפחות 3 תווים»); an empty or whitespace-only answer is accepted and stored as NULL.

> **MEH-2286 (2026-10-21):** `direct_outreach` («מהמקור פנו אליי ישירות») added to `REFERRAL_SOURCE_KEYS` — 9 keys. Code-side allowlist only; no migration.

> **MEH-3079 (2026-11-14):** weekly summary email to business owners. `producers.weekly_summary_opt_out` (`BOOLEAN NOT NULL`, `server_default false`) and `producers.weekly_summary_sent_at` (`TIMESTAMP WITH TIME ZONE`, **nullable**), migration `0cfa83f0f53e`, Expand-only (ADR-007), no backfill. opt_out is written by `POST /weekly-summary/unsubscribe` and its one-click twin (signed token, scope `weekly_summary_unsubscribe`, sub = producer id), and since MEH-3212 by the owner's own `PATCH /producers/me/weekly-summary`, which can also turn it back off; sent_at only by `services/weekly_owner_summary.py::send_weekly_summaries` (Sunday 08:00 Asia/Jerusalem, registered only when `WEEKLY_OWNER_SUMMARY_ENABLED`). A business is skipped when stamped within the last 6 days, opted out, not live (`is_business()`), its owner has no verified email, or its deduped 7-day page views are 0 — or, since MEH-3476, below `MIN_VIEWS` (5) with no WhatsApp or contact click in the week (`worth_sending`; skipped rows are not stamped). Exposed to the owner only, as `enabled` on `GET /producers/me/weekly-summary` (MEH-3212). Each email carries `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).

> **Page freshness (2026-11-18):** the monthly "is everything still correct?" email. `producers.last_confirmed_at` and `producers.freshness_email_sent_at` (both `TIMESTAMP WITH TIME ZONE`, **nullable**), migration `a8d41c2e7f90`, Expand-only (ADR-007), no backfill. `freshness_email_sent_at` is written only by `services/page_freshness.py::send_freshness_emails` (daily tick, off until `PAGE_FRESHNESS_ENABLED`); a live business older than 30 days whose owner has a verified email gets at most one email per 30 days, and none while she confirmed within them. `last_confirmed_at` is written only by `POST /page-freshness/confirm` (signed token, scope `page_freshness_confirm`, `exp` 21 days). `last_confirmed_at` is on `ProducerAdminOut` only. `GET /admin/producers?freshness_stale=true` lists live businesses older than 60 days not confirmed within 60 days, ownerless pages included.

> **MEH-1818 (2026-08-02):** day-1 pending-nudge email. `producers.email_pending_nudge_sent_at` (`TIMESTAMP WITH TIME ZONE`, **nullable**, migration `d3b7f1a92c64`) records when a business still awaiting approval was sent the one-time "here is what is missing" email. Mirrors the MEH-539 `email_followup_*` tracking columns exactly — `nullable=True`, **no `server_default`, NO backfill** (ADR-007 Expand-only; a backfill would retro-suppress the nudge for the exact pending businesses the feature exists to reach). No new index: the candidate query filters `created_at`, already covered by `idx_producers_created_at`. **Not exposed on any schema** — public, owner, and admin serializers all omit it; the sole consumer is `app/services/pending_nudge.py:send_pending_nudges`, invoked from the daily 10:00 UTC scheduler tick. Candidate predicate: `status IN ('draft','pending') AND created_at <= now()-24h AND email_pending_nudge_sent_at IS NULL`; the day-marks then count from `max(created_at, declared_at)` (MEH-2340), so an admin draft its owner claimed by link starts the sequence at the claim, not at the admin's creation (MEH-2100 added `draft`; MEH-2124 removed `pending_whatsapp`) — status membership is an explicit tuple, so a status value added later is excluded by default (fail-closed, same reasoning as the MEH-1587 approved-only gate). **The stamp is written even when nothing was missing and no email was sent** (a complete-but-unapproved business is waiting on admin review, not on itself): that is what removes it from the candidate set permanently and holds the send to exactly one email per producer.
>
> **MEH-3660 (2026-11-21) — the owner's email is a submit requirement (businesses only):** `services/submission_gate.py` adds code `email_verified` last in `SUBMISSION_REQUIREMENTS`; it is missing until a `User` with `producer_id` = this business has `email_verified=true` (a Google signup has it from the start). So `POST /producers/me/submit-for-review` and `POST /producers/me/request-review` answer 422 `params.missing=["email_verified"]` for an unconfirmed owner. `ProducerOwnerOut.owner_email_verified` (bool, filled by `GET`/`PUT /producers/me` for a business; `False` for an organizer and elsewhere) feeds the client mirror and the dashboard checklist's email row. Organizers are unchanged. The admin drafts list (`draft_missing`) reads the owners' confirmation for all its business drafts in one query. The pending nudge has no line for this code and drops it (`pending_nudge._ITEM_COPY`): an owner missing only this is stamped and mailed nothing.

> **MEH-2100 (2026-08-16):** draft → submit-for-review state machine. `producers.submitted_for_review_at` (`TIMESTAMP WITH TIME ZONE`, **nullable**, migration `e2a7c9d41b06`) records the instant the owner pressed "שליחה לבדיקה" and the row moved `draft` → `pending` — the point from which the 3-business-day review SLA is counted, replacing `created_at` in that role. **No `server_default`, NO backfill** (ADR-007 Expand-only): NULL is honest and permanent for two populations — a producer still in `draft`, and any row seeded before this revision (staging fixtures; production had no businesses, Sapir 16/08). Readers needing a submission instant use `submitted_for_review_at or created_at`, which is what makes the absent backfill correct rather than merely deferred. No new index — nothing filters or sorts on it. The paired `status` value `"draft"` needs no migration at all: `Producer.status` is a free `String(20)` with no enum and no DB CHECK, so a new value is data, not schema. **Not exposed on any schema** — public (`ProducerListOut`), owner (`ProducerOwnerOut`) and admin (`ProducerAdminOut`) serializers all omit it, deliberately: the dashboard banner and the admin queue both key on `status`, so nothing renders a submission instant and adding a field no surface reads would be dead API. Its only writer is `POST /producers/me/submit-for-review` (MEH-2100 PR2); it has **no reader yet**, and the `submitted_for_review_at or created_at` contract above is the rule for the first one that appears. Exposing it (e.g. a "submitted N days ago" column in the admin queue) is a deliberate follow-up, not an oversight.
>
> **MEH-2869 (2026-11-10, supersedes the two-term fallback above for the admin queue):** the admin queue (`attach_aging` badge and the oldest-first sort, `services/admin_producer_reads.py`) reads **`resubmitted_at or submitted_for_review_at or created_at`**. A resubmission after a rejection writes only `resubmitted_at`, and `submitted_for_review_at` keeps the first submission, so without it a business that resubmitted today topped the queue with weeks of "waiting". Drafts still age from `created_at`.
>
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

> The exact columns, types, defaults, FKs, CHECKs and indexes of every table are in
> [DB_SCHEMA.md](./DB_SCHEMA.md), generated from the models (MEH-3929). The DDL below
> is hand-kept prose; where it differs, DB_SCHEMA.md is right.

### Core

```sql
producers (
  id uuid PK,
  name, description, short_description,
  city, lat float, lng float,   -- lat/lng: LEGACY mirror of the primary producer_locations row (MEH-1938 5a: no reader, drop in 5b)
  phone, instagram, website, whatsapp_group, facebook, external_order_form,
  status: draft|pending|approved|rejected|inactive,   -- MEH-2100: draft is where every new producer starts; MEH-2124 removed pending_whatsapp
  images text[],
  plan: free|premium,
  slug text unique,
  -- MEH-1490: admin-mapped Google Maps Place ID. The ONLY Google datum stored —
  -- rating/userRatingCount are live-fetched (never persisted; ToS §3.2.3(b)).
  google_place_id varchar(300) nullable,
  contact_name, top_product_name,
  -- MEH-2137 expand step: the featured-product vote by IDENTITY. top_product_name
  -- is a free-text string, so the dashboard picked the featured product by name
  -- and two products called «לחם» both got the badge. FK -> products.id,
  -- ON DELETE SET NULL ("no featured product any more", which is true).
  -- NULL is HONEST here and stays common after the backfill: a producer whose
  -- name matched two products, or none, is deliberately left NULL rather than
  -- guessed at. Readers fall back to top_product_name, which is unchanged and
  -- still the only writer until the switch step. Revision f4b1c8e0a297.
  top_product_id uuid nullable references products(id) on delete set null,
  -- MEH-3339: optional second phone + label (migration c3e8a1f05d72, expand-only).
  -- Public on ProducerDetailOut as one text line «{label}: {number}» («טלפון נוסף»
  -- when unlabelled). Every CTA, phone verification and WhatsApp notification
  -- stays on `phone`. Owner PUT /producers/me + admin PUT; label without number → 422.
  secondary_phone       VARCHAR(20) NULL,
  secondary_phone_label VARCHAR(30) NULL,
  -- MEH-1335: owner story (public OwnerCard data; bio app-capped at 300)
  owner_bio text nullable, owner_photo_url varchar(500) nullable,
  logo_url varchar(500) nullable (MEH-3611: the business logo; owner saves it via PUT /producers/me after /upload/image, own-upload guard MEH-3247, replaced logo destroyed after commit; public on ProducerListOut and the rescue bag summary),
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
  -- MEH-3511 (b4e6a8c0d2f3): business-wide delivery time (business days, 1..30,
  -- min ≤ max) and minimum order for delivery; NULL = not stated.
  delivery_days_min smallint nullable, delivery_days_max smallint nullable,
  delivery_min_order integer nullable,
  -- MEH-1471: self-reported attribution (admin-only; English key + free-text "other")
  referral_source varchar(40) nullable, referral_source_other varchar(120) nullable,
  price_range,  -- MEH-1855 chunk 2 dropped the legacy alias (9849fab1637a)
  grass_fed bool, organic_certified bool, kosher,
  reservist_owned bool NOT NULL default false,  -- owner-declared «עסק של מילואימניקים»; badge only, never ranking (f1c7a2b9d4e6)
  has_delivery bool, pickup_points bool,
  -- MEH-213 location mode + MEH-1255 nationwide exclusion list
  has_physical_location bool, offers_delivery bool,
  by_arrangement bool NOT NULL default false (MEH-2447: «איסוף או ביקור בתיאום מראש»; read only AND has_physical_location — no «קנייה במקום» / not in ?on_site; written by POST /auth/register/producer, PUT /producers/me, admin create/update; no CHECK),
  delivery_nationwide bool, delivery_excluded_cities text[] NOT NULL default '{}',
  admin_notes, is_available_today bool (legacy column — no reader, no writer, in no response since MEH-2272; dropped by MEH-2273),
  avg_rating float, reviews_count int,
  created_at, last_active_at,
  -- MEH-51: trust ladder + kashrut
  phone_verified bool default false,
  ambassador bool default false,
  kashrut_badges text[] default '{}',
  kashrut_verified_at timestamp nullable,
  kashrut_expires_at timestamp nullable
)
  -- MEH-2137 SWITCH step: `PUT /producers/me` now accepts `top_product_id`
  -- (422 unless the product belongs to the caller; writing it syncs
  -- top_product_name from the product). ProducerListOut/DetailOut/AdminOut
  -- expose BOTH: the id is the authority, and top_product_name is DERIVED
  -- from the FK in attach_badge_fields when set, else the legacy column —
  -- so a product renamed after the vote no longer strands the name.

-- MEH-51: one-time WhatsApp OTP for phone verification
-- MEH-3171: rows are deleted one day after expires_at (retention_purge, daily)
phone_otp_tokens (
  id uuid PK, producer_id FK,
  phone varchar, code varchar(6),
  expires_at timestamp, used bool default false, created_at
)

-- MEH-3301 (D14): one-time WhatsApp code that verifies a USER's phone.
-- `phone` = the canonical number the code is bound to; `attempts` = wrong guesses
-- (5 per token). Written only by the MEH-3302 routes. Migration c7d3e1a9f4b2.
user_phone_otp_tokens (
  id uuid PK, user_id FK → users ON DELETE CASCADE (indexed),
  phone varchar(30), code varchar(6),
  expires_at timestamp, used bool default false, attempts int default 0, created_at
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
  phone_verified_at timestamptz nullable,   -- MEH-3301: when THIS phone was verified; a phone change clears it
  whatsapp_consent_at timestamptz nullable, -- MEH-3301: WhatsApp-updates consent; «הסר» clears it
  role: consumer|producer|admin,
  producer_id FK nullable,
  google_id, apple_id (unique when set),
  is_blocked bool,
  created_at
)

categories     (id, name unique, emoji,
                slug VARCHAR(50) NOT NULL UNIQUE)  -- MEH-2139: stable ASCII identity; matching keys on this, not on `name`. Added nullable in a7c3e91d5f28 (chunk 1), tightened to NOT NULL in c9f2a41e8b03 (chunk 2) once every writer produced one — the column default in models.py derives it from `name`, so no writer has to remember. Renaming a category does NOT re-derive its slug; surviving a rename is the point.
producer_categories (producer_id FK, category_id FK, PK(both),
                     position INT NOT NULL default 0)  -- MEH-1297: 0 = primary (first selected); categories ordered by it
products       (id, producer_id FK, name, description,
                price_range,                        -- LEGACY free-text; drop tracked in MEH-295 follow-up
                image_url,
                price_min Numeric(10,2) NULL,       -- MEH-295: canonical min, Pydantic ge=1 le=10000; optional since MEH-2924 (NULL = «מחיר משתנה לפי עונה» on the page; the admin import and the menu import still require it)
                price_max Numeric(10,2) NULL,       -- MEH-295: canonical max, optional, validator: >= price_min
                is_gluten_free Boolean NOT NULL DEFAULT FALSE,   -- MEH-293/MEH-479: single source of truth post column drop. EXISTS subquery powers /producers?gluten_free=true
                is_vegan Boolean NOT NULL DEFAULT FALSE,         -- MEH-293/MEH-479: same
                is_vegetarian Boolean NOT NULL DEFAULT FALSE,    -- MEH-1438: 4th dietary axis. ?vegetarian filter matches is_vegetarian OR is_vegan (a vegan product is vegetarian by definition); migration c5d9f3a1b2e8 seeded TRUE for existing vegan rows
                is_lactose_free Boolean NOT NULL DEFAULT FALSE,   -- MEH-293/MEH-479: same
                is_no_added_sugar Boolean NOT NULL DEFAULT FALSE, -- MEH-1934: 5th dietary axis ("ללא סוכר מוסף"). NO backfill — no existing flag implies it, so seeding would invent a nutrition claim on the business's behalf
                is_low_carb Boolean NOT NULL DEFAULT FALSE,
                ingredients Text NULL,                           -- MEH-2662: owner-declared free-text ingredient list; NULL = not filled
                price_unit String(10) NOT NULL DEFAULT 'unit',   -- MEH-3218: unit | kg | 100g; MEH-2936: + bottle | box; MEH-3474: + pack (CHECK products_price_unit_check). The price itself stays price_min/price_max; min == max is an exact price
                is_draft Boolean NOT NULL DEFAULT false,         -- MEH-2312 (b1d19ee0e8c1): an admin-imported product waiting for approval. Invisible to every public read: the Producer.products relationship filters it (page, list, ?q=, diet/pickup .any(), favorites) and search.py / producer_listing.py has_product filter it too; the owner's own list / edit / reorder / featured / recipe-link skip it
                source_image_url Text NULL,                      -- MEH-2312: the source store's image URL, stored only (MEH-1184 pending); never on a public schema, never uploaded
                is_orderable Boolean NOT NULL DEFAULT TRUE,      -- MEH-3218: the opt-in is per BUSINESS (producer_order_settings.enabled); the owner can take a single product out
                in_stock Boolean NOT NULL DEFAULT TRUE,          -- MEH-3218
                contains_alcohol Boolean NOT NULL DEFAULT FALSE, -- MEH-3218
                available_weekdays SmallInteger NULL,            -- MEH-3618: the days the product is made, bitmask Sun=1 … Sat=64; NULL = every day; CHECK 1..127 (products_available_weekdays_check). Migration d6a8b0c2e4f5
                daily_limit SmallInteger NULL,                   -- daily stock (27/11/2026): how many units can be ordered for one pickup day, summed over the product's variants; NULL = no limit; CHECK 1..999 (products_daily_limit_check). Migration c6e2a4f8b1d9
                lead_days SmallInteger NULL,                     -- MEH-3932: how many days ahead it must be ordered — the pickup's Israel day is at least today + lead_days; NULL = no product rule; CHECK 1..7 (products_lead_days_check). Migration e3b7d1f5a9c2
                allergens Text[] NULL,                           -- MEH-2662: owner-declared codes from app/allergens.py (15-item closed list since MEH-3439: EU 14 + fava_beans «פול», canonical order, unknown → 422); NULL = not filled, never "none"      -- MEH-1934: 6th dietary axis ("דל פחמימות"). Partial index idx_products_dietary on (producer_id) WHERE any flag TRUE — predicate extended with is_vegetarian in MEH-1438 and with both MEH-1934 flags in revision a2f7d4c8e153 (a product marked only low-carb would otherwise fall outside the index)
                may_contain Text[] NULL,                         -- MEH-3439: «עלול להכיל» (cross-contact), same closed list; a code in allergens is dropped from it («מכיל» wins, drop_contained); NULL = not filled. Migration f1a7c3e9b2d5
                storage_info Text NULL,                          -- MEH-3444: «אחסון ותוקף», owner free text, ≤300 chars on input, bleached; NULL = not shown. Migration b4d8e2f6a1c3
                gluten_detail Text NULL,                         -- MEH-3442: «איזה דגן?», ≤80 chars, bleached; dropped when gluten is in neither list (detail_if_declared). Migration c9e1a5d3f7b2
                nuts_detail Text NULL,                           -- MEH-3442: «איזה אגוז?», same rule for tree_nuts
                no_allergens Boolean NOT NULL DEFAULT false)     -- MEH-3445: «אין במוצר אלרגנים מהרשימה»; never true while a code is in allergens/may_contain
producer_offers (id, producer_id FK CASCADE, offer_type text NOT NULL,
                 threshold_value int nullable, threshold_unit text nullable,
                 headline text nullable, starts_at date nullable,
                 expires_at date NOT NULL, is_active bool NOT NULL DEFAULT true,
                 created_at, updated_at)
  -- MEH-1823 (b6e1d94a3f27). FIVE CHECKs, all declared on the model too so a
  -- fresh create_all test DB carries them (the MEH-272 precedent):
  --   producer_offer_type              offer_type IN (free_delivery_above,
  --                                    gift_above, first_order, pickup_discount,
  --                                    custom)   -- MEH-1898 (e4b1c72d9a35)
  --   producer_offer_threshold_unit    threshold_unit IN (ils, units, liters, kg)
  --   producer_offer_threshold_pair    (threshold_value IS NULL) = (threshold_unit IS NULL)
  --   producer_offer_threshold_positive threshold_value IS NULL OR > 0
  --   producer_offer_date_order        starts_at IS NULL OR expires_at > starts_at
  -- threshold_value/unit exist because producers.free_delivery_above is INTEGER
  -- SHEKELS, so a litres/units/kg threshold ("10 ליטרים ומעלה") had nowhere to
  -- live. The pair is both-or-neither. The threshold is optional for EVERY
  -- offer_type and deliberately NOT gated by type (Sapir 02/08) — "10% off
  -- pickup over ₪100" and "first order over ₪150" are real offers.
  -- expires_at is NOT NULL by design: an offer that cannot expire is a
  -- permanent discount nobody decided to give.
  -- MEH-1898 widened producer_offer_type to FIVE values by DROP + re-ADD
  -- (Postgres has no ALTER CHECK). The CHECK COUNT is still five — only the
  -- value list changed. `custom` = the owner words the offer herself: it has
  -- no platform sentence, so `headline` IS the offer text on the consumer
  -- surface instead of a secondary line under one, and a custom row with an
  -- empty headline renders NOTHING (OfferBadge.jsx). That empty row is a 200
  -- at the API on purpose — validation stays uniform across offer_types, with
  -- no type-conditional branch and no sixth CHECK; the dashboard requires the
  -- headline client-side, which is where the owner can act on it.
  -- uq_producer_offers_active_per_producer: UNIQUE partial index on
  -- (producer_id) WHERE is_active — enforces at-most-one-active AND serves the
  -- active-row lookup. One index, not two; a non-unique twin would carry the
  -- same columns and predicate for zero read benefit.
delivery_areas (id, producer_id FK, city, min_order int, delivery_day,
                delivery_fee int nullable, zone_name varchar(40) nullable,
                delivery_days varchar(10)[] nullable,
                free_delivery_above int nullable,
                delivery_days_min smallint nullable, delivery_days_max smallint nullable,
                order_cutoff_day varchar(10) nullable, order_cutoff_time varchar(5) nullable)
  -- MEH-3511 (b4e6a8c0d2f3): the four new columns are copied from the zone.
  -- MEH-3484 (f2c6a8e4b0d7): zone_name / delivery_days / free_delivery_above,
  -- and min_order / delivery_fee / delivery_day of a zoned city, are copied
  -- from producers.delivery_zones by services/delivery_zones.py.
  -- MEH-1772: per-area OVERRIDE of producers.delivery_fee (a4f7c2e91b58).
  -- NULL = no override → inherit the business-level fee; 0 = "משלוח חינם" to
  -- THIS city, distinct from NULL. INTEGER to match both min_order above and
  -- the producer-level column it overrides — a Decimal/int fork would
  -- serialize two JSON shapes for the same rendered "₪".
  -- The fallback resolves CLIENT-SIDE, on purpose: DeliveryAreaOut does not
  -- coalesce (schemas.py:849-855), because an already-resolved value cannot
  -- distinguish "overrides with the same number" from "inherits", and that
  -- distinction is exactly what the "משלוח מ-X₪" variance line consumes.
  -- App-validated on DeliveryAreaCreate only — no DB CHECK, same reasoning as
  -- the producer-level pair above (bad payload → clean 422, not a 500).
favorites      (user_id FK, producer_id FK, PK(both), created_at)

-- producer_followers (MEH-2392) and referral_clicks (MEH-2393): dropped in
-- e5b2d8f4a913. users.referral_code (+ ix_users_referral_code): dropped in
-- 1cd44149cc20 (MEH-2393 chunk 3).

producer_reviews (
  id uuid PK, producer_id FK, user_id FK,
  stars int (1-5), title, body,
  created_at,
  source varchar(20) NOT NULL DEFAULT 'click' CHECK (source IN ('click','invite_link')),  -- MEH-1428: how the contact gate was passed — 'click' (a contact/WA click row) | 'invite_link' (signed "request a review" token). Revision 3f9a7c2e5d18 (ck_producer_reviews_source)
  ai_moderation_status varchar(16) NULL CHECK (ai_moderation_status IN ('APPROVED','FLAGGED')),  -- MEH-2349: AI verdict on the body at the last write. NULL = no verdict: rows that predate the column, or a fail-open (MEH-2390 — it was stored as APPROVED and so never re-checked on an unchanged re-save; the review still publishes, its signal is the Sentry report). REJECTED is never stored (422). Informational — a FLAGGED review still publishes. Revision c4e81a2f9b6d
  reply_ai_moderation_status varchar(16) NULL CHECK (reply_ai_moderation_status IN ('APPROVED','FLAGGED')),  -- MEH-3259: AI verdict on the owner `reply` at its last write; same NULL rules as ai_moderation_status (no reply, fail-open, or predates the column). REJECTED is a 422 and never stored. An unchanged reply keeps its verdict. Revision f2c7a9d4b1e6
  edited_after_hidden_at timestamp NULL,  -- MEH-2381: the author's last change to body or stars while is_hidden. NULL = not edited since the admin last hid/unhid it; PUT /hide (also on an already-hidden row) and /unhide clear it. Admin-only (AdminReviewOut). Revision d7a3f5c1e2b8
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
  end_time time,                     -- MEH-2469: optional, > event_time, same day
  location, city, lat float, lng float,
  image_url text,                    -- single image
  category: שוק|קטיף|טעימות|אחר,   -- MEH-1657: 6 → 4
  price int,                         -- 0 = free
  max_participants int,
  registration_url text,             -- external signup link
  registration_method varchar(20) NOT NULL DEFAULT 'site_form',
                                     -- MEH-2763 «איך נרשמים?»: site_form|whatsapp|phone|external_url (CHECK)
  is_active bool,
  created_at
)
```

### Registrations (on-site sign-ups — MEH-2763, migration `e8c4a1f2b7d9`)

```sql
registrations (
  id uuid PK,
  event_id FK events ON DELETE CASCADE,          -- exactly one of the two
  experience_id FK experiences ON DELETE CASCADE,-- (CHECK ck_registrations_one_item)
  name varchar(100), phone varchar(20), email varchar(200),  -- what the visitor typed; no account
  cancel_token varchar(64) UNIQUE,               -- the visitor's only credential (cancel link in her email)
  status: registered|cancelled|waitlisted,     -- waitlisted: MEH-3314
  created_at, cancelled_at,
  reminder_sent_at,                              -- MEH-3312
  waitlist_offered_at,                           -- MEH-3314: the one offer email went out
  party_size smallint DEFAULT 1 CHECK 1..10,     -- MEH-3315: places this sign-up takes
  attendance NULL|attended|no_show,              -- MEH-3315: the owner's note, blocks nothing
  session_date date NULL, session_time time NULL -- MEH-3440: the workshop date this sign-up is for; NULL = no date. CHECK: a date only with experience_id, a time only with a date
)
```

Only items whose owner picked `registration_method = 'site_form'` take rows.
PII is returned to the owner/admin only. Purged 30 days after the item's
date (`retention_purge._purge_registrations`, the promise under the form).

### Billable events (ledger of bookings through the site — MEH-3179, migration `d5b8f2a6c341`; kept after the business is deleted — MEH-3208, migration `e6c9a3b7d452`)

```sql
billable_events (
  id uuid PK,
  producer_id FK producers ON DELETE SET NULL,  -- NULL once the business is deleted; the row stays (MEH-3208)
  producer_ref uuid NOT NULL,     -- the same business id, kept after the delete; NOT a FK. Fills itself from producer_id
  kind: event_registration|experience_registration|group_buy_order|rescue_bag|product_order,  -- product_order (MEH-3216): no writer yet
  source_id uuid,                 -- the registration / group-buy commit / rescue order; NOT a FK (outlives it)
  occurred_at timestamptz,
  quantity int >= 1,              -- units in a group-buy order, bags in a rescue order
  base_amount_agorot bigint,      -- the price of the booking (0 = free)
  fee_agorot bigint,              -- the NON-subscriber fee of that price list; a subscriber's reduced fee is computed at summary time. Nothing is charged in the launch phase
  price_list_version int,         -- app/pricing.py
  status: counted|voided, voided_at,
  created_at,
  UNIQUE (kind, source_id)        -- a booking is counted once
)
```

Rows are never deleted, by a business delete or by any job: they are the
record of what a business was, or would be, billed (bookkeeping records are
kept seven years from the end of the tax year, or six from the yearly report,
the later; source: secondary guides, the regulation text itself was not read).
The admin screen lists only businesses that still exist.

No personal data. Written only by `app/services/billing_ledger.py`, in the
booking's own transaction behind a SAVEPOINT (a ledger error never fails the
booking): on a sign-up (`registrations.py`), when a group buy becomes
`fulfilled` — one row per participant's order (`group_buys.py`), and when a
rescue order is marked handed (`rescue.py`). A sign-up cancelled before the
item's date is `voided`, and so are the rows of an upcoming event / experience
that is deleted (`events.py`, `experiences.py`); a late cancel and a past item
stay counted. Test businesses (`is_test`) are recorded like any other and left
out where the numbers are read (the admin view, MEH-3181). The numbers come from `app/pricing.py`, held
equal to `frontend/lib/pricing.js` and `docs/PRICING.md` by
`tests/test_meh3179_pricing_mirror.py`. Adds one table →
**`EXPECTED_TABLES` 50 → 51**.

**Monthly summary (MEH-3181, `routers/billing.py` → `services/billing_summary.py`).**
Read-only; nothing is charged (`phase: "launch"`, `charged_agorot: 0`). A month is
an Israel calendar month (`?month=YYYY-MM`, default the current one; a malformed
value → 422). Voided rows are never counted. A rescue order counts one booking
per bag; every other row counts one. The threshold is an AMOUNT: a month is
over it when the value of its paid bookings reaches `threshold_agorot`.

- 👤 `GET /producers/me/billing/summary` (60/minute) — the caller's own business
  only (the id comes from the session). `{month, phase, bookings, value_agorot,
  by_kind[{kind, bookings, value_agorot}], threshold_agorot, over_threshold,
  fee_without_subscription_agorot, fee_with_subscription_agorot, charged_agorot,
  price_list_version}`. The two fee figures are what the month WOULD cost on each
  track of the current price list: plain commission, or subscription + reduced
  commission. The plain figure is the fee stored on each row (its own price
  list); the subscriber figure is recomputed per booking with the current list.
  One list exists today; a month that spans a price change will need both
  figures taken from the row's list.
  Read by the dashboard home's monthly line (`MonthValueLine.jsx`, MEH-3194),
  which shows `bookings` and `value_agorot` only, never a fee.
- 🔒 `GET /admin/billing/overview` (60/minute) — every real business (test
  businesses excluded) with a counted booking that month, highest value first:
  `{month, threshold_agorot, businesses_over_threshold, businesses_over_two_months,
  start_billing_businesses, start_billing_months, would_pay_total_agorot, phase,
  year{year, income_agorot, ceiling_agorot, ceiling_year, percent, alert_percent},
  history[{month, businesses, businesses_over_threshold, value_agorot,
  would_pay_total_agorot}],
  rows[{producer_id, name, bookings, value_agorot, over_threshold,
  months_over_in_a_row, would_pay_agorot}]}`. `year` (MEH-3189) sums the same
  would-pay rule from January to the month, against the exempt-dealer ceiling in
  `app/pricing.py` (`EXEMPT_DEALER_CEILING_AGOROT`); `alert_percent` is 0, 70 or 90.
  `months_over_in_a_row` looks back at
  most 6 months. `would_pay_agorot` is the month's stored fees for a business at
  or over the threshold and 0 under it; nothing is charged. `phase` is `launch`
  until billing is switched on. `history` is the month and the five before it,
  newest first, each as it would have been billed (shadow billing; computed on
  read, nothing stored). Read by `/admin/billing` (MEH-3182).

**Billing-start signal (MEH-3413, `services/billing_start_signal.py`).** On the
1st, 2nd and 3rd of each month at 05:00 UTC the scheduler reads `overview()`
for the month that just ended and emails `ADMIN_EMAIL` «הגיע הזמן» when
`businesses_over_two_months >= start_billing_businesses` — once per month per
process (three mornings, so a restart over the 1st does not lose the month).
Below that, nothing is sent; once `BILLING_PHASE` is `billing`, nothing is
sent. Repeats each month the rule holds. Writes nothing; the same numbers are
on `/admin/billing`.

**Terms §11 → code (MEH-3413).** Every paragraph of «terms.sections.pricing»
is classified in `tests/test_meh3413_terms11_enforcement.py`: kept by a named
test, or listed in `pricing.SWITCH_ON_BLOCKERS`, which keeps billing off until
it is built. Price list 1 is frozen by the same file.

**Capabilities (MEH-3181, `services/capabilities.py`).** What a business may do is
asked of this module, not read off `producers.plan`. Today it owns one rule, moved
from `upload.py` unchanged: a business whose `plan` is exactly `free` may hold 3
gallery images.

**Billing state and paid tools (MEH-3180), switched off.**

```sql
business_billing (                -- migration f7d1b4c8e563; one row per business that left the launch default
  producer_id uuid PK FK producers ON DELETE CASCADE,
  state: launch|notice|active|page_only|unpaid,   -- no row = launch
  state_since timestamptz,
  price_list_version int NULL,    -- the list the business joined billing under (app/pricing.py)
  subscribed bool NOT NULL DEFAULT false,
  created_at, updated_at
)
```

Its own table, not columns on `producers`: the page and the billing account are
separate things. No payment details, no personal data. Read only through
`services/capabilities.py`. The state and the switch `app.pricing.BILLING_PHASE` (`launch` today; a
code constant, not an env var). While the switch is `launch` every state is
open. Once it is `billing`, a business in `page_only` or `unpaid` gets **403**
(`capabilities.PAID_TOOL_CLOSED_DETAIL`) on a NEW paid booking:

| Tool | Routes that ask |
|---|---|
| paid sign-up (price > 0 **and** `registration_method = site_form`) | `POST /events`, `PUT /events/{id}`, `POST /experiences`, `PUT /experiences/{id}` — an edit asks only when it OPENS one: makes the item a paid site sign-up, reactivates a cancelled one, or moves a past one forward |
| group buy | `POST /group-buys` |
| rescue bags | `POST /rescue/offers` (route dependency `capabilities.bags_open`) |
| product orders (MEH-3216) | none yet — the route that turns ordering on joins the list with that work |

Never closed: the page, WhatsApp / link / free sign-ups, editing or running an
item that already exists. Nothing moves a business between states yet (the
billing stage). `tests/test_meh3180_billing_state.py` fails when a route listed
in `capabilities.PAID_TOOL_ROUTES` stops asking.

### Experiences (community workshops — **admin-moderated**)

```sql
experiences (
  id uuid PK,
  title, description text NOT NULL, image_url,
  category,                          -- free text: בישול | תזונה | סיור אוכל | ...
  host_user_id FK NOT NULL,          -- any logged-in user can host

  event_date date NOT NULL, event_time time, duration_minutes int,
  is_recurring bool, recurring_schedule text,
  sessions jsonb NULL,               -- MEH-3440: [{date, time, participants_count}] a recurring workshop's dates; NULL/[] = one pool of places
  course_meetings jsonb NULL,        -- MEH-3898: [{date, time}] a course's meetings, ONE sign-up for all; event_date/event_time = the first; NULL = not a course

  location_type: home|public,        -- producer_farm lives on Event
  city, address text,                -- address PRIVATE — redacted from public list
  lat float, lng float,

  max_participants int, participants_count int,  -- count: host-reported, clamped to max (MEH-2663)
  min_participants int,              -- nullable; minimum to run, ≤ max or 422 (MEH-2665, migration c4d8e1f05a27)
  price_per_person numeric(10,2),    -- NULL/0 = free
  requirements text,                 -- "what to bring / prerequisites"
  registration_method varchar(20) NOT NULL DEFAULT 'site_form',  -- MEH-2763; rows before it backfilled to whatsapp
  registration_url varchar(500),     -- MEH-2763: used by external_url only

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
  referrer varchar(30) NULL,             -- search|map|category|home|favorites|follow|producers-index|similar|nearby|share|NULL (allowlist: services/analytics.py _ALLOWED_REFERRERS; share = MEH-3331)
  created_at timestamp (indexed)
)

-- One row per WhatsApp CTA click on a producer detail page.
-- Distinct from home_product_whatsapp_clicks — producer clicks don't
-- trigger the 24h rating SMS loop, they're just counted.
producer_whatsapp_clicks (
  id uuid PK,
  producer_id FK producers.id ON DELETE CASCADE (indexed),
  clicked_at timestamp (indexed),
  -- MEH-1677: the city a coverage-request click ("לא מגיעים אליך?") asked
  -- about. NULL on every ORDINARY WhatsApp click and on every pre-existing
  -- row, so NULL means "not a coverage click" rather than "we lost it".
  -- Validated softly: a locality outside the canonical list is STORED, not
  -- dropped -- those are the rows worth having. Trim, then cap at 60 to
  -- match the column width.
  city varchar(60) NULL
)

-- MEH-2079: the ANONYMOUS daily roll-up of the two raw tables above — one
-- row per (business, Israel calendar day), kept forever so the raw rows can
-- be purged (chunk C, 90 days) without the owner's dashboard numbers moving.
-- No viewer identifiers of any kind (that is its licence to be unbounded).
-- `producer_contact_clicks` has no column here, so its rows are never deleted:
-- past the same 90 days the purge sets their `ip_hash` and `user_id` to NULL
-- and keeps the row, so the contact total does not move (MEH-3244).
-- Written ONLY by services/analytics_rollup.py (daily 01:30 UTC via the
-- startup.py scheduler, or `scripts/rollup_analytics.py --from/--to`) with
-- INSERT … ON CONFLICT DO NOTHING: a rolled-up day is immutable, never
-- re-rolled (MEH-2283). Read ONLY by the `total` arm of
-- GET /producers/me/analytics: Σ aggregate + deduped raw rows whose Israel
-- day is ABOVE max(day) — the raw side never reads a day the aggregate owns.
-- The `last_7d` / `last_30d` arms stay raw-only.
producer_analytics_daily (
  id uuid PK DEFAULT gen_random_uuid(),   -- MEH-2282: the DB mints it (raw INSERT path)
  producer_id FK producers.id ON DELETE CASCADE (indexed),
  day date (indexed),                     -- Israel calendar day, same grain as the dedupe
  views_unique int NOT NULL DEFAULT 0,    -- unique_views_count() per day, NOT raw rows
  views_search_unique int NOT NULL DEFAULT 0,  -- same, referrer='search' only
  whatsapp_clicks int NOT NULL DEFAULT 0,
  UNIQUE (producer_id, day)               -- uq_producer_analytics_daily_producer_day
)

-- MEH-1677: the business's opt-out for the coverage-request CTA (MEH-1675).
-- server_default true (not a Python-side default) so existing rows are
-- backfilled by the DDL and a writer bypassing the ORM still gets true.
-- Exposed on ProducerDetailOut; NO toggle UI ships with it -- that is the
-- post-launch dashboard card.
producers.coverage_cta_enabled boolean NOT NULL DEFAULT true

-- DAU tracking column on users. Updated by get_current_user() on every
-- authenticated request, throttled to at most 1 write per 5 minutes
-- per user. Feeds /admin/dashboard daily_active_users chart.
users.last_active_at timestamp NULL
```

### Search analytics (MEH-99)

```sql
-- One row per /search call. Written only; /search/trending was removed (MEH-3257).
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
retired_slugs          (slug varchar(100) PK, producer_id uuid FK→producers SET NULL nullable,
                        reason 'deleted'|'renamed', retired_at)  -- MEH-2528
saved_items            (id uuid PK, user_id uuid FK→users CASCADE,
                        item_type 'recipe'|'event'|'experience' (CHECK), item_id uuid (no FK),
                        created_at, UNIQUE(user_id,item_type,item_id))  -- MEH-2556
delivery_waitlist      (id uuid PK, producer_id uuid FK→producers CASCADE,
                        city varchar(60), city_key varchar(60), email varchar(200),
                        user_id uuid FK→users SET NULL nullable, created_at, notified_at nullable,
                        wants_to_host bool NOT NULL DEFAULT false,
                        host_confirm_sent_at nullable, host_confirmed_at nullable,  -- MEH-2673
                        UNIQUE(producer_id,city_key,email), INDEX(producer_id,city_key))  -- MEH-2618
category_requests      (id uuid PK, requested_name varchar(100), examples text nullable,
                        producer_id uuid FK→producers SET NULL nullable (indexed),
                        status varchar(20) default 'pending' (indexed), admin_notes text nullable,
                        created_at, reviewed_at nullable)  -- MEH-141 (a business asks for a missing category at sign-up)
```

> **MEH-2618 — `delivery_waitlist` (30/10/2026):** «תודיעו לי כשתגיעו ל{עיר}». A visitor whose city the business does not deliver to leaves an **email + city** under the delivery checker's negative verdict — no account needed (Oddbox-style waitlist). `city` is her own spelling (used in her email); `city_key` is `app.data.cities.city_key`, the ONE comparison form (MEH-2456). `user_id` is set when she was signed in, and her empty profile `users.city` is filled from the form (never overwritten). `notified_at` is the once-only guard: when `PUT /producers/me` adds a city to `delivery_area_cities`, `services/delivery_waitlist.notify_cities` runs as a BackgroundTask (the same hop as the `delivery_area` favorite alert), mails every un-notified entry whose `city_key` matches, and stamps it; a send that raises leaves the row un-notified so the next add retries. Nothing is sent for a non-live business (`is_business()`, MEH-2513). Unsubscribe = a signed stateless token (`sub` = entry id, scope `delivery_waitlist_unsubscribe`, same pattern as the newsletter's) → `/delivery-waitlist/unsubscribe?token=` → `POST /delivery-waitlist/unsubscribe` deletes the row. Migration `d4e7a1b2c3f5`; **`EXPECTED_TABLES` 43 → 44**. **MEH-2673 (05/11/2026):** `wants_to_host` = she ticked «אשמח לארח נקודת מסירה ב{עיר}» **and clicked the confirmation link** mailed to that address (Sapir 05/11: the waitlist has no email verification, so the box alone must not hand a typed-in stranger's email to a business). Ticking sends `services/delivery_waitlist.send_host_confirmation` as a BackgroundTask (signed token, scope `delivery_waitlist_host_confirm`, distinct from the unsubscribe scope so neither link can do the other's job) → `/delivery-waitlist/host-confirm?token=` → `POST /delivery-waitlist/host-confirm` sets the flag and stamps `host_confirmed_at` (the consent record). The confirmation token expires after 7 days (`exp`, checked in `_decode`; unsubscribe tokens still never expire), and `host_confirm_sent_at` caps the mail at one per ENTRY per 24 h plus `HOST_CONFIRM_ADDRESS_CAP` (3) per ADDRESS per 24 h across every business and city — each link confirms one entry only, so a second business the same day still gets its own mail, while a re-submitted form cannot flood an inbox (serialised per address with `pg_advisory_xact_lock`; index `ix_delivery_waitlist_email_host_sent`). The POST answers `host_confirm: sent | already_sent | limit_reached | confirmed | null` so the form never claims a mail that was not sent (`already_sent` = this entry's link is already in the inbox; `limit_reached` = the address cap, nothing sent for this one); an expired link is **410** and, since the token still names the entry, the endpoint mails a fresh link to the same address under the same cooldown/cap and answers `{detail, resent: bool}` (no dead end, no confirmation); a bad or unsubscribed one is 400. Only ever False → True; an unticked repeat signup never clears it. The owner reads the list as `pickup_hosts` on `GET /producers/me/analytics`. Migration `e5a9c3d17b28` (additive column, `EXPECTED_TABLES` unchanged). The sibling for signed-in users stays `favorite_alerts.notify_delivery_area` (+ `whatsapp_opt_in`); the form points a signed-in visitor there for WhatsApp.

### Rescue bags (pilot, flag-gated — MEH-2644)

```sql
rescue_offers          (id uuid PK, producer_location_id uuid FK→producer_locations CASCADE,
                        date, qty_total, qty_left, price_agorot,
                        value_min_agorot nullable, value_max_agorot nullable,
                        pickup_start, pickup_end, cancel_until,
                        status 'active'|'cancelled' (CHECK), created_at,
                        CHECK qty_total 1..20, CHECK 0<=qty_left<=qty_total,
                        CHECK price_agorot>=0, CHECK pickup_end>pickup_start,
                        qty_donated int NOT NULL DEFAULT 0
                          (CHECK 0<=qty_donated<=qty_total),             -- MEH-2703
                        codes_sent_at timestamptz nullable               -- MEH-2756
                        INDEX (producer_location_id, date))             -- MEH-2644
rescue_orders          (id uuid PK, offer_id uuid FK→rescue_offers CASCADE,
                        user_id uuid FK→users CASCADE, qty (CHECK 1..2),
                        pickup_code char(4) (CHECK ^[0-9]{4}$),
                        status 'reserved'|'handed'|'no_show'|'cancelled' (CHECK),
                        handed_at nullable, handed_by uuid FK→users SET NULL nullable,
                        cancelled_at nullable, created_at,
                        UNIQUE(offer_id,pickup_code), INDEX (user_id))   -- MEH-2644
rescue_reviews         (id uuid PK, order_id uuid FK→rescue_orders CASCADE UNIQUE,
                        rating (CHECK 1..5), contents_tags jsonb nullable,
                        highlight_tags jsonb nullable, photo_url nullable,
                        comment text nullable, created_at)              -- MEH-2644
rescue_typical_items   (id uuid PK, producer_id uuid FK→producers CASCADE UNIQUE,
                        items jsonb NOT NULL, allergens text[] nullable,
                        created_at, updated_at)            -- MEH-2644, MEH-2752
alembic_lineage        (revision varchar(64) PK, recorded_at timestamptz
                        NOT NULL default now())                       -- MEH-2903
producer_order_settings (producer_id uuid PK FK→producers CASCADE,
                        enabled bool default false, auto_confirm bool default false,
                        auto_confirm_slot_cap int nullable (>=1),
                        cancel_cutoff_hours int default 24 (0..168),
                        shabbat_observant bool default false,
                        min_order_agorot int nullable, alcohol_licensed bool default false,
                        business_id_number varchar(9) nullable (9 digits),  -- MEH-3216
                        created_at, updated_at)                       -- MEH-3218
product_orders         (id uuid PK, producer_id uuid FK→producers CASCADE,
                        user_id uuid FK→users SET NULL nullable,
                        customer_name, customer_phone, fulfilment pickup|delivery,
                        delivery_address, slot_start, slot_end, note,
                        estimated_total_agorot int, final_total_agorot int nullable,
                        delivery_fee_agorot int default 0, status, payment_status,
                        pickup_code char(4) nullable, age_declared bool,
                        expires_at, confirmed_at, handed_at, closed_at,
                        status_token_hash char(64) nullable, idempotency_key varchar(64) nullable,
                        delivery_city varchar(100) nullable,
                        proposed_slot_start, proposed_slot_end, proposed_total_agorot,
                        proposal_note,                                -- MEH-3263
                        created_at, updated_at)                       -- MEH-3218
product_order_items    (id uuid PK, order_id uuid FK→product_orders CASCADE,
                        product_id uuid FK→products SET NULL nullable,
                        name, unit_price_agorot int, price_is_estimate bool,
                        price_unit unit|kg|100g|bottle|box|pack, qty int (1..99),
                        contains_alcohol bool,                        -- MEH-3218
                        variant_id uuid FK→product_variants SET NULL nullable,
                        variant_name varchar(40) nullable)            -- MEH-3617: copied at order time
product_variants       (id uuid PK, product_id uuid FK→products CASCADE,
                        name varchar(40), price_agorot int nullable (NULL = the product's price; CHECK 0..),
                        in_stock bool default true, position int default 0,
                        daily_limit smallint nullable (NULL = no limit; CHECK 1..999, daily stock 27/11);
                        INDEX (product_id))                           -- MEH-3617
product_order_repeats  (id uuid PK, producer_id uuid FK→producers CASCADE,
                        user_id uuid FK→users SET NULL nullable, customer_name, customer_phone,
                        fulfilment pickup|delivery, delivery_city, delivery_address, note,
                        items jsonb [{product_id, variant_id, qty}], last_slot_start,
                        skipped_in_row smallint default 0, state active|stopped,
                        stopped_by customer|business|system nullable, stopped_at, created_at;
                        INDEX (producer_id, state), INDEX (customer_phone)) -- MEH-3933
product_order_events   (id uuid PK, order_id uuid FK→product_orders CASCADE,
                        from_status nullable, to_status, actor customer|business|admin|system,
                        actor_user_id uuid FK→users SET NULL nullable, note,
                        created_at)                                   -- MEH-3218
product_order_phone_codes (id uuid PK, phone varchar(20), code_hash char(64),
                        expires_at, attempts int default 0, used_at nullable,
                        created_at)                                   -- MEH-3263
product_order_notifications (id uuid PK, order_id FK→product_orders CASCADE,
                        kind, channel, outcome default 'pending', send_after,
                        attempts int default 0, last_error varchar(20),
                        sent_at, created_at;
                        UNIQUE (order_id, kind, channel))             -- MEH-3296
email_outbox (id uuid PK, kind varchar(40), to_email, subject text, body, html,
                        reply_to (all nullable: cleared when finished),
                        outcome default 'pending', send_after, attempts int
                        default 0, last_error varchar(20), sent_at,
                        created_at)                                   -- MEH-3535
email_events (id uuid PK, svix_id varchar(64) UNIQUE, event_type varchar(40),
                        kind varchar(40), user_id FK→users SET NULL,
                        recipient_domain varchar(255), resend_email_id,
                        detail varchar(80), created_at)               -- MEH-3839
share_links (id uuid PK, code_hash varchar(64) UNIQUE (sha256 of the code,
                        never the code), scope draft_preview|producer_claim
                        (CHECK), producer_id FK→producers CASCADE, expires_at,
                        created_at, created_by FK→users SET NULL)    -- MEH-3896
producer_staff (id uuid PK, producer_id FK→producers CASCADE,
                        user_id FK→users CASCADE nullable (set on accept),
                        invited_email varchar(255), role 'orders',
                        token_hash varchar(64) nullable (sha256; NULL once used),
                        expires_at, invited_by FK→users SET NULL,
                        status pending|active|revoked, created_at,
                        accepted_at, revoked_at;
                        UNIQUE (user_id) WHERE status='active')     -- MEH-3526
```

> **MEH-3911 — English category slugs (26/11/2026):** revision `b3d5f7a9c1e2` on `a9c3e5f7b1d2`, data only: renames the slugs of the three admin-created categories by their old slug (`kph`→`coffee`, `byshvl-lpy-hzmnh`→`cooked-to-order`, `avgvt-vkynvchym`→`cakes-desserts`; reversible, fail-loud if a target is taken). `POST /admin/categories` takes an optional `slug` (`^[a-z0-9]+(-[a-z0-9]+)*$`, max 50; a taken one is 400); the admin screen requires it, so a new category no longer falls back to a letter-by-letter transliteration. `/admin/pages/{slug}` accepts English slugs only (422 otherwise).

> **MEH-3896 — short preview and claim links (26/11/2026):** revision `d2f4b6a8c0e1` on `c6e8a0b2d4f5` (MEH-3526), additive: table `share_links` (**`EXPECTED_TABLES` +1**, 69 → 70). The two admin "create link" routes now return `{frontend_url}/v/<code>` (preview) and `{frontend_url}/c/<code>` (claim), where `<code>` is 12 random base62 characters (~71 bits, `secrets.choice`). Only the SHA-256 of the code is stored. `services/share_links.py` mints and resolves it; every read route accepts the code OR the old JWT (`link_producer_id`), so links sent before this keep working until their own `exp`. Rows go with the draft (CASCADE) and are deleted 90 days after `expires_at` by the retention purge (the «send me a new link» request reads a lapsed claim code for 90 days, like a lapsed JWT).

> **MEH-3839 — what Resend reports back (24/11/2026):** revision `e1a3c5b7d9f2` on `b7d9f1a3c5e8` (MEH-3703), additive: table `email_events` (**`EXPECTED_TABLES` +1**). One row per delivery event Resend reports for an email we sent: `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.suppressed`, `email.failed`, `email.clicked` (`EMAIL_EVENT_TYPES`; `email.sent`, `email.opened` and the rest are acknowledged and dropped — opens are inflated by Apple Mail). Written only by `POST /webhook/resend`. `kind` is the tag `send_email(kind=…)` put on the email (`order_new_order`, `weekly_summary`, `onboarding_2`, …; `other` when untagged or invalid). No address and no text from the receiving server: the recipient's domain, and the user id when the address belongs to an account; `detail` is the bounce `type/subType` or the suppression type. Retried deliveries are one row (`svix_id` unique). Deleted 30 days after `created_at` (`services/retention_purge.py`). We keep no suppression list of our own: Resend skips a hard-bounced or complained address itself and reports `email.suppressed`.

> **MEH-3535 — the durable email queue (20/11/2026):** revision `c5e7a9b1d3f6` on `b4e6a8c0d2f3`, additive: table `email_outbox` (**`EXPECTED_TABLES` +1**). An email the site owes, queued by `services/email_outbox.py::enqueue_email` and sent by `dispatch_due` (same rules as the order outbox below: `SKIP LOCKED`, one commit per row, at least once). A Resend `failed` is retried after 2 min doubling, up to 5 tries, then `failed`, and ends that batch (an outage costs one 10 s timeout per tick); an unexpected error on a row (a DB blip at the commit, a bug) is retried the same way, never final at once; `unconfigured` (no Resend key in that process) leaves the row untouched and stops the batch, so a dispatcher with the key takes it; any other non-`sent` answer is a final `skipped` with the code in `last_error`; a row more than 2 days old is `skipped` / `stale`. A finished row keeps only `kind`, `outcome` and the times: address, subject, body, html and reply-to are set to NULL. Rows are deleted 30 days after `created_at` (`services/retention_purge.py`), and a restored copy deletes them all (`scripts/anonymize_restored_db.sql`). A **pending** row does hold the address and the words (for an owner's «הרשמה חדשה», the registrant's name, phone and email) until it is finished: minutes normally; if no dispatcher runs at all nothing marks it stale, and it holds them until the 30-day purge. An email caused by a test business or user is never queued (MEH-2952). **Who queues today:** the admin decisions on a business (`producer_approved`, `producer_rejected`, `producer_changes_requested`, `routers/admin_decisions.py`, in the decision's own commit — the approval's through `_persist_approval(before_commit=…)`, re-queued on its slug-collision retry) and an event or workshop sign-up (`visitor_confirmation`, `waitlist_confirmation`, `owner_new_registration`, `routers/registrations.py`, in the sign-up's own transaction; a composer or queue error is reported and the sign-up kept). **Who dispatches:** the web scheduler every minute while `OUTBOX_EXTERNAL_WORKER` is false (default); the worker service `python -u -m app.worker` every 30 s once it is true. No route.

> **MEH-3218 — on-site ordering, stage 1 (14/11/2026):** the tables behind «בקשת הזמנה» (parent MEH-3216), all dormant until `PRODUCT_ORDERS_ENABLED` (default off). A buyer picks products, pickup or delivery and a time; the business confirms. **No payment anywhere:** the buyer pays the business directly, so `payment_status` has the single value `direct_to_business` and the CHECK refuses anything else (ADR-042 §5). The column exists so on-site payment can be added later as a CHECK widening. Money is integer agorot; `estimated_total_agorot` is what the buyer saw, `final_total_agorot` is set at confirmation (weighed goods), `delivery_fee_agorot` is separate. An order line **copies** the product's name and price, and `product_id` is SET NULL, so renaming or deleting a product does not rewrite past orders. `status` is one of pending · confirmed · change_proposed · ready · handed · declined · cancelled · expired · no_show, and the **only writer** is `services/product_order_state.py::apply_transition`, which also appends the `product_order_events` row (from, to, who). Ordering is **opt-in per business**: no `producer_order_settings` row, or `enabled=false`, means off. `alcohol_licensed` is admin-only. Also adds four columns to `products`, each NOT NULL with a server default (no backfill): `price_unit` ('unit' · 'kg' · '100g'), `is_orderable` (true), `in_stock` (true), `contains_alcohol` (false). **No new price column:** `price_min == price_max` is the exact price. Vocabularies live once in `app/models/product_orders.py`; `tests/test_meh3218_product_orders.py` reds if the revision's CHECK literals drift. Migration `d5a7c3e9f1b4`; **`EXPECTED_TABLES` +4**. Routes (all 404 while the flag is off): `GET /producers/me/order-settings` 👤 (the defaults, ordering off, when never saved) · `PUT /producers/me/order-settings` 👤 (saves the whole form; auto-confirm needs a per-slot cap; never touches `alcohol_licensed`) · `PUT /admin/producers/{producer_id}/order-settings/alcohol` 🛡️ · `GET /admin/producers/{producer_id}/order-settings` 🛡️ (MEH-3524: what the admin edit page's alcohol switch reads; the defaults when never saved, no row created). Stage 1 itself has no route that creates or changes an order; those arrive in stage 2b (MEH-3263, below).
>
> **MEH-3216 — «מספר עוסק» (19/11/2026):** `producer_order_settings.business_id_number` (varchar 9, nullable; CHECK `producer_order_settings_business_id_check`: NULL or exactly 9 digits; migration `e3b9d1f7a2c4`, additive). The consumer-protection rules on distance selling require the seller's identity, including its ID number or company number (§14ג), to be shown to the buyer before the order, so the number appears on the order form. `PUT /producers/me/order-settings` takes `business_id_number` as a required field (null allowed): spaces and dashes are stripped, an 8-digit number is padded with a leading 0, anything else → 422 «המספר צריך להיות 9 ספרות.». Saving with `enabled=true` and no number → 422 «כדי לקבל הזמנות באתר צריך למלא מספר עוסק או תעודת זהות.». `takes_orders()` also requires the number, so a business that switched ordering on before this change stops offering orders until it fills it in (no business takes orders in production yet: the flag is off). `GET /producers/{producer_id}/order-menu` returns `business_id_number`.

> **MEH-3618 — a product made only on some days (21/11/2026):** `products.available_weekdays` (above), expand-only migration `d6a8b0c2e4f5`, no new table. Bits Sunday = 1 … Saturday = 64, the same Sunday-first week as `producer_order_windows.weekday`; NULL = every day, which every existing row is. Written through the product routes (`POST` / `PUT /producers/me/products/{id}` 👤 owner, `POST /admin/producers/{id}/products` 🛡️ on a claimable draft) as a field of `ProductCreate` / `ProductUpdate`: 0 or anything outside 1..127 → 422, 127 is stored as NULL (one spelling of «every day»), omitted on a PUT = unchanged, null = every day again. Every product read carries it (`ProductOut`), and so does each product of `GET /producers/{id}/order-menu`. `POST /product-orders` answers **409** ««{product}» לא זמין ביום שנבחר…» when the slot's day **on the Israel clock** (`services/product_weekdays.py::slot_weekday`, Asia/Jerusalem) is outside a line's mask; the quote has no slot and does not check it. A business proposing a new time (`ProposeChangeIn`) is not checked: that is her own call. The page and the order sheet apply the same rule (`frontend/lib/product-weekdays.js`). The assistant chat gets `made_only_on_days` for a limited product.

> **Daily stock (Fischgrund bakery, 27/11/2026):** `products.daily_limit` and `product_variants.daily_limit` (above), migration `c6e2a4f8b1d9`, expand-only. A product's limit counts all its variants together; a variant's limit counts that variant alone; both apply. Units are counted per Israel day of `slot_start`, over orders in `pending`, `change_proposed`, `confirmed`, `ready` and `handed`; a declined, cancelled, expired or no-show order gives its units back (`app/services/product_daily_stock.py`). `POST /product-orders` refuses past the limit with 409 + Hebrew (`refuse_over_limit`, under the business row lock that already serialises the per-slot cap). `PUT /producers/me/products/{id}/ordering` takes `daily_limit` (1..999 or null) and `variant_limits` (`[{id, daily_limit}]`, max 10; a variant of another product → 404). `GET /producers/{id}/order-menu` carries `stock`: one row `{day, product_id, variant_id, left}` per offered day for every limited product and variant. New `GET /producers/me/orders/prep` (owner or orders staff, `require_order_access`, 120/minute, 404 while `PRODUCT_ORDERS_ENABLED` is off): «מה להכין» — for each pickup day from today for 7 days that has a booked order, each product and variant with `confirmed`, `waiting` (pending + change_proposed) and its limit. The new-order email to the business adds one line when the order filled a product's day.

> **MEH-3932 — how many days ahead a product must be ordered (Fischgrund bakery, 27/11/2026):** `products.lead_days` (above), migration `e3b7d1f5a9c2`, expand-only. The pickup's day **on the Israel clock** must be at least today + `lead_days` (`app/services/product_lead_days.py::days_ahead`); `POST /product-orders` answers **409** «את «{product}» צריך להזמין לפחות {N ימים} מראש. צריך לבחור מועד מאוחר יותר או להסיר מההזמנה» otherwise, naming the first such line. It adds to the business-wide `lead_time_hours`, which still drops slots for every product. `PUT /producers/me/products/{id}/ordering` takes `lead_days` (1..7 or null; omitted = keep; slots are offered for 14 days, so 7 leaves a week), `GET /producers/me/products/ordering` and each product of `GET /producers/{id}/order-menu` carry it, and the order sheet offers only slots that far off (`frontend/lib/product-weekdays.js::takesSlot`). A time the business proposes herself (`ProposeChangeIn`) is not checked. The assistant chat gets `order_days_ahead`.
> **MEH-3933 — a weekly repeat of an order (Fischgrund bakery, 27/11/2026):** table `product_order_repeats` (above) and `product_orders.repeat_id` (uuid FK → `product_order_repeats.id` SET NULL, nullable), migration `a4c8e2f6b0d1`, expand-only; **`EXPECTED_TABLES` +1** (`docs/ci/meh-3933-expected-tables-71.patch.md`). `POST /product-orders` takes `repeat_weekly` (bool, default false): the order is written as before, and in the same transaction a repeat copies its lines, name, phone, way, address and note, with `last_slot_start` = its slot. Only a logged-in buyer can start one (a guest → 409 «כדי שההזמנה תחזור כל שבוע צריך להתחבר לחשבון…», since the skip and stop notices go to her account email), and not for an order with alcohol (→ 409 «על הזמנה עם אלכוהול אי אפשר לחזור כל שבוע…»: the age declaration is per order). Caps: 3 active repeats per phone per business → 409 «אפשר להחזיק עד 3 הזמנות קבועות אצל אותו בית עסק…», 300 per business (`limits.CAPS["order_repeats"]`) → 409 «בית העסק הזה לא מקבל כרגע הזמנות קבועות חדשות…»; a refused repeat writes no order either. **The job** (`services/product_order_repeat_job.py`, every hour 09:00–20:00 Asia/Jerusalem, behind `PRODUCT_ORDERS_ENABLED`, Sentry heartbeat `order-repeats-hourly`): for each active repeat whose `last_slot_start` has passed, it makes next week's order — the same Israel weekday and wall-clock time, so a clock change keeps the hour — through `create_order` with `repeat_id`: no phone code (proved when she asked), every other check as for a buyer (slot still offered, products orderable, made that day, daily stock, lead days, minimum, delivery, the business's open-order limit; the buyer's 3-open-orders limit does not count a repeat's orders, which the repeat caps already bound), the idempotency key `uuid5(repeat id, slot)`, so a second run finds the order instead of making another. The order is born `pending` like any order (or auto-confirmed), recorded with actor `system`, and the business gets the usual new-order message; the buyer hears from it once the business answers. A week that is refused moves `last_slot_start` on, adds one to `skipped_in_row` and emails the business and, when she has an account email, the buyer the reason (`order_repeat_skipped_*`); a made week resets it, unless last week's order was declined or expired, which counts as a skipped week too; the third in a row stops the repeat, before a fourth order is made (`stopped_by=system`, `order_repeat_stopped_*`). An observant business's Shabbat or festival waits for the next run and counts nothing. Weeks whose slot passed while the job did not run (ordering off, an outage) are passed over, not counted and not mailed: the next order is for the first week still ahead. Stopping clears the repeat's address and note. The repeat row is locked before it moves on, so two runs at once count one skip. **Stop:** `POST /product-orders/status/repeat/stop` `{token}` or `{order_id}` (the buyer, 30/hour) · `POST /producers/me/product-orders/{order_id}/repeat/stop` (the business or its staff, 240/hour; another business's order → 404); no repeat → 409 «ההזמנה הזאת לא חוזרת כל שבוע»; stopping a stopped one changes nothing; the orders already made stay. Both order views carry `repeat`: `active` · `stopped` · null. Deleting the buyer's account deletes her repeats (`services/product_order_privacy.py`).

> **MEH-3617 — sizes and flavours of a product («אפשרויות», 21/11/2026):** new table `product_variants` (above) and two columns on `product_order_items` (`variant_id` SET NULL, `variant_name` the copy). Migration `c5f7a9b1d3e4`, expand-only; **`EXPECTED_TABLES` +1** (66 after MEH-3535; 67 with MEH-3592 in release train 3). Cap: 10 a product (`MAX_VARIANTS_PER_PRODUCT` in `app/limits.py`, 409 + Hebrew). Route: `PUT /products/{product_id}/variants` 👤 60/hour (`app/routers/product_variants.py`) replaces the whole list in its order; the owner of the product or an admin, anyone else (and an imported draft for the owner) → 404; a list over 20 → 422, over 10 → 409, two rows with the same name → 422; ids that belong to another product are ignored, so a row is created. Not behind `PRODUCT_ORDERS_ENABLED`: the names show on the business page for every business. Every product read carries `variants` (`ProductOut`); `GET /producers/{id}/order-menu` carries them per product with `price_agorot` resolved (the variant's, or the product's top price) and a product is in stock when it is and at least one variant is. Ordering (`services/product_variants.py::choose`, used by create and quote): 0 variants → as before, and a `variant_id` → 409; 1 variant → applied when none is sent; 2+ → a missing `variant_id` → 422 «צריך לבחור אפשרות למוצר», another product's or a sold-out one → 409. The price stored is always the server's; the request has no price field (`extra=forbid`, so a sent price → 422). One cart may hold two lines of one product with different variants (twins are keyed on product + variant). The business's order view, the buyer's order page and the prep list print «{product} · {variant}». The order emails and WhatsApp messages name no line, so they are unchanged.

> **MEH-3262 — on-site ordering, stage 2a (14/11/2026):** what a business offers, still behind `PRODUCT_ORDERS_ENABLED`. New table `producer_order_windows` (id, producer_id FK CASCADE, `weekday` **0 = Sunday … 6 = Saturday**, the convention of `producers.order_window`, `start_time`, `end_time`, `fulfilment` pickup · delivery; CHECK end > start, so a window ends by 23:59): the weekly windows in which the business **hands orders over**. This is not `producers.order_window`, which is when the owner *answers* orders and has no pickup/delivery split; the two are different facts with different owners. They share the calendar above them: a date closed in `producers.special_hours` (`ranges: []`) and the owner's vacation (`availability_state = on_vacation`, through `vacation_until`, or every day when no return date is set) offer no slot. Written only as a whole list, capped at 28 rows a business. `producer_order_settings` gains `slot_minutes` (30 · 60 · 120, default 60) and `lead_time_hours` (0..168, default 24); both are required fields of `PUT /producers/me/order-settings`. `services/product_order_slots.py` cuts the windows into slots for the next 14 Israel days (pure function, no clock read): a slot must start at least `lead_time_hours` from now; on the two clock-change nights a slot is offered only when it really lasts its length (the skipped hour and the two-hour repeated hour are dropped); a slot touching 23:00–07:00 is marked `alcohol_ok=false`; for a `shabbat_observant` business a slot touching Friday 14:00 – Saturday 21:00 is dropped (a fixed wide margin; since MEH-3296 the same 14:00-eve to 21:00-day margin also covers every festival, computed from the Hebrew calendar). Migration `e6b9d4f1a2c7`; **`EXPECTED_TABLES` +1**. Routes (all 404 while the flag is off): `GET` / `PUT /producers/me/order-windows` 👤 (PUT replaces the whole week under a row lock on the business; overlapping windows of the same kind on one day → 422) · `PUT /producers/me/products/{product_id}/ordering` 👤 (`is_orderable`, `in_stock`, `price_unit`, `contains_alcohol`; another business's product, or an imported draft (`is_draft`, MEH-2312) → 404; orderable without `price_min` → 422) · `GET /producers/{producer_id}/order-menu` (public: minimum, cutoff, lead time, the orderable priced products (never an unapproved imported draft) with prices in agorot and `price_is_estimate`, and the slots; a product with alcohol appears only when the business is `alcohol_licensed`; one 404 for unknown / not approved / test row / ordering off). **Deleting a business:** both hard-delete paths (`DELETE /auth/me` via `services/user_deletion.py`, `DELETE /admin/producers/{id}`) answer 409 while the business has an order in pending · change_proposed · confirmed · ready (`services/product_order_guards.py`); closed orders go with the business (CASCADE), because they hold a buyer's name, phone and address.

> **MEH-3746 — the owner's preview of her order menu (24/11/2026):** `GET /producers/me/order-menu/preview` 👤 producer, 60/minute, 404 while `PRODUCT_ORDERS_ENABLED` is off. The same body as `GET /producers/{producer_id}/order-menu` (one builder, `_menu_body` in `app/routers/product_order_offer.py`), for the caller's own business only (no id in the request), **without** the `takes_orders()` gate: ordering may be off and the business number missing (then `business_id_number` is `""`). A business that never saved settings gets the defaults of `product_orders._defaults`, unsaved (nothing is written). Read only; the dashboard page `/producer/dashboard/orders/preview` reads it.

> **MEH-3216 stage 5b — the business page learns whether it takes orders (19/11/2026):** `GET /producers/{producer_id}` and `GET /producers/by-slug/{slug}` carry `takes_site_orders` (bool, default false), set by `services/product_order_menu.py::attach_takes_site_orders`: false while `PRODUCT_ORDERS_ENABLED` is off (no query runs), otherwise the same answer as the order menu (`takes_orders`: a public business, not a test row, ordering switched on). The page reads `GET /producers/{producer_id}/order-menu` only when it is true, so a business that takes no orders costs no extra read.

> **MEH-3216 gaps (18/11/2026):** `GET /producers/me/products/ordering` 👤 lists the caller's own products (`id`, `name`, `has_price`, `is_orderable`, `in_stock`, `price_unit`, `contains_alcohol`; bounded by the products cap; 404 while the flag is off) for the two switches in the orders tab. **`producer_order_settings.auto_confirm_slot_cap` is now the business's one cap per slot**, whether she confirms by hand or automatically: a slot holding that many open orders (pending · change_proposed · confirmed · ready) is not offered on the menu, so the order route answers `SLOT_GONE_DETAIL`. Auto-confirm still needs the cap. The business proposing a new time may go past her own cap. No schema change; the column keeps its stage-1 name.

> **MEH-3680 (21/11/2026):** `POST /product-orders` — `code` is now optional for a logged-in buyer whose account phone is verified (`users.phone_verified`) and equals the order's `phone` in canonical form (`utils/phone.py::canonical_il_msisdn`); no code row is read or consumed for her. Everyone else, a guest included, still gets 422 (the wrong-code detail) without a valid code. From her 4th order to one phone within an hour a code is asked again, the old 3-codes-an-hour bound. A verified buyer's `code`, when sent, is ignored. `services/product_order_create.py::account_phone_verified`.

> **MEH-3620 (21/11/2026):** the buyer view (`POST /product-orders/status` and its two siblings) gains `review_url`: null unless the order is `handed` and the business is `approved`, then the same verified-review URL as `GET /producers/me/review-link` (one builder, `services/review_invite.py`). Read by `/order/[id]` for «כתבו ביקורת».

> **MEH-3764 (23/11/2026):** every order line in the buyer view and the business view (`OrderLineOut`, `app/schemas/product_order_buy.py`) gains `product_id` and `variant_id` (UUID, nullable). They are the stored columns of `product_order_items`, so a product or variant deleted since reads null and the line keeps its copied name. No new column, no migration. Read by `/order/[id]` for «להזמין שוב», which puts the lines back in the cart on the business page (`frontend/lib/order-again.js`).

> **MEH-3216 stage 5a (18/11/2026):** the buyer's view (`POST /product-orders/status`, `/status/cancel`, `/status/accept-change`) gains `pickup_address`: for a confirmed or ready pickup only, the business's primary location as public as she made it (`address, city` when `location_precision = exact`, the city alone when approximate, null otherwise). Read by the new page `/order/[id]`.

> **MEH-3263 — on-site ordering, stage 2b (14/11/2026):** the order itself, still behind `PRODUCT_ORDERS_ENABLED` (every route 404 while off). Revision `f7c1a5e9b3d2`: table `product_order_phone_codes`; seven nullable columns on `product_orders` (above); three partial UNIQUE indexes — `(producer_id, pickup_code) WHERE status IN ('confirmed','ready')`, `idempotency_key`, `status_token_hash`. **Buyer routes** (`routers/product_order_buyer.py`): `POST /product-orders/phone-code` `{producer_id, phone}` sends a six-digit WhatsApp code (template `producer_otp_v1`) only for a business that takes orders now; 3 codes an hour per phone and 500 a day site-wide, both counted in the table; 503 when WhatsApp is not configured (no code, no order). Only `HMAC-SHA256(server secret, phone:code)` is stored; 10 minutes, 5 wrong tries (each committed before the 422), single use. `POST /product-orders` `{producer_id, items[{product_id, qty}] (≤30, qty 1..99), fulfilment, slot_start, customer_name, phone, code, delivery_city?, delivery_address?, note?, age_declared, idempotency_key (UUID)}` → 201 with the buyer view plus `status_token` (shown once). A guest and a logged-in buyer take the same path; both prove the phone (since MEH-3680, except a logged-in buyer ordering to her own verified phone). **The request carries no price**: every line is priced from `products` (a range is stored at its high end and marked an estimate; a weighed product is always an estimate), `estimated_total_agorot` is goods only, and `delivery_fee_agorot` comes from the business's existing delivery facts (`delivery_areas.delivery_fee` for the city, else `producers.delivery_fee`, zeroed at `free_delivery_above`; whole shekels → agorot). Refusals: 404 business not taking orders · 422 wrong/expired/used code, alcohol without the age declaration · 403 two no-shows on the phone in 90 days · 409 three open orders on the phone, 200 open orders on the business, slot no longer offered, a product no longer orderable, below the minimum, alcohol in a night slot, city not served / no published fee, an idempotency key that belongs to another request. A retry with the same key, phone and business within 10 minutes returns the same order and the same token. Auto-confirm (business setting + per-slot cap + no estimated line) moves the order to `confirmed` as `system` and assigns a pickup code. `POST /product-orders/status`, `POST /product-orders/status/cancel`, `POST /product-orders/status/accept-change` take `{token}` or — logged in — `{order_id}` in the **body** (never the URL) and answer with `Cache-Control: no-store`; the buyer view masks the phone, omits the street address, shows `pickup_code` only while the order is `confirmed`/`ready`, and stops answering 30 days after the order closed. A buyer cancels freely while `pending`/`change_proposed`, and a `confirmed` order until `cancel_cutoff_hours` before the slot. `GET /users/me/product-orders` lists the logged-in buyer's orders (50, newest first). **Business routes** (`routers/product_order_business.py`, own business only, another's order is 404): `GET /producers/me/product-orders?status=&limit=&offset=` and `POST /producers/me/product-orders/{order_id}/confirm` `{final_total_agorot?}` (required when a line is an estimate) · `POST /producers/me/product-orders/{order_id}/decline` `{note?}` · `POST /producers/me/product-orders/{order_id}/propose-change` `{slot_start?, total_agorot?, note}` (the slot must be one of the business's own windows) · `POST /producers/me/product-orders/{order_id}/ready` · `POST /producers/me/product-orders/{order_id}/handed` `{pickup_code?}` (a wrong code is 409) · `POST /producers/me/product-orders/{order_id}/no-show` (only after the slot ended) · `POST /producers/me/product-orders/{order_id}/cancel` `{note?}` · `GET /producers/me/product-orders/customers` (MEH-3561, 30/min, `no-store`) → `{customers:[{name, phone, order_count, last_order_at}]}`: one row per phone, the newest order's name, newest buyer first, at most 2,000; declined / expired / cancelled orders and orders whose phone was erased with a deleted account do not count. The business view carries the full phone and address and never the pickup code. Every move goes through `services/product_order_state.py`; the system may now also cancel an open order, used only when a buyer deletes her account (`services/product_order_privacy.py`: open orders cancelled, name / phone / address / note / token removed from all of them, rows kept). Order creation locks the phone (advisory lock) and then the business row; the delete guard of MEH-3262 now locks the same row. Not in this stage: any message to the business or the buyer about an order, the 24-hour expiry timer, the purge of closed guest orders (moved to stage 6), any screen. **Review fixes (same PR):** `confirm` and `accept-change` answer 409 once the (proposed) slot has started, so an order can never be confirmed late and then reported as a no-show. `final_total_agorot` on confirm is accepted **only** when a line is an estimate and only up to `estimated_total_agorot` (the figure the buyer saw); a higher total, or any change to a fixed price, goes through propose-change and the buyer's acceptance (422 otherwise). `expires_at` is stored but not yet enforced: the timer that moves a stale `pending` / `change_proposed` to `expired` is stage 3. A goods total above 100,000 ₪ → 409. The proposal columns are cleared on every move out of `change_proposed`. A buyer cancelling a packed (`ready`) order gets the same 409 as past the cutoff. `POST /product-orders/phone-code` is 5/hour per IP. `GET /users/me/product-orders` deliberately has no 30-day stop: it is the account's own history; the stop applies to the guest link. **Known gaps, accepted for now:** deleting an account erases the phone from its orders, so its no-show count restarts (a keyed phone hash on no-show rows is listed for stage 6); a nationwide business accepts a delivery city that is not in the static list (the list holds ~110 cities, not every moshav; the business reads the city and can decline; the customer UI of stage 5 sends the city from the picker).

> **MEH-3216 stage 5c — the price before sending:** `POST /product-orders/quote` `{producer_id, items[{product_id, qty}] (≤30), fulfilment, delivery_city? (required for a delivery)}` → `{subtotal_agorot, delivery_fee_agorot, total_agorot, has_estimate}`. The same pricing as `POST /product-orders` (`services/product_order_create.py::order_lines`, a range at its high end; the fee from `services/product_order_delivery.py::quote`) and the same Hebrew refusals for what a quote can know: 404 business not taking orders, 409 a product no longer orderable, below the minimum, above 100,000 ₪, city not served / no published fee. Writes nothing; no phone, slot or age check. 60/minute per IP, `Cache-Control: no-store`, 404 while `PRODUCT_ORDERS_ENABLED` is off.

> **MEH-3296 — on-site ordering, stage 3: messages and timers (15/11/2026):** still dark behind `PRODUCT_ORDERS_ENABLED`. Revision `a8d2c6f4e1b7` on `f7c1a5e9b3d2`, additive: table `product_order_notifications` (an **outbox**: one row per message an order owes, UNIQUE per order × kind × channel, so a retry or a double move never writes a second). Every status move writes its rows **in the same transaction** through `services/product_order_outbox.py::on_status`, called from `product_order_state.py` (`apply_transition` and `record_created`). What is owed: new order → WhatsApp + email to the business, and a reminder after 4 active hours if still pending; confirmed → WhatsApp to the buyer, plus «מחר» 24 h before the slot when the slot is at least 26 h away; change proposed, declined / expired / cancelled by the business → WhatsApp to the buyer; cancelled by the buyer → email to the business. An account deletion sends nothing to the buyer. **Dispatcher** (`dispatch_due`, at least once): picks due `pending` rows with `SKIP LOCKED`, sends, marks, commits per row; a 5xx / network failure retries after 5 min doubling, up to 5 tries; a 4xx (e.g. a template Meta has not approved) is final `failed`; a row more than 6 h late is `skipped`, and a reminder whose order moved on is `skipped`. Test businesses and test buyers are never messaged (`is_test`). The buyer link is `/he/order/{id}#t={token}`: the token sits in the fragment, never sent to a server. **Shabbat and chagim** are computed from the Hebrew calendar (`services/hebrew_calendar.py`, arithmetic, no library, Israel one-day festivals): rest runs 14:00 on the eve to 21:00 on the day, adjacent days merged. The 24-hour answer window and the 4-hour reminder count only hours outside rest (`product_order_clock.active_deadline`); no hand-over slot is offered inside rest; a Shabbat-observant business gets no message during rest (postponed to its end) and takes no new order then (409 «ההזמנות נפתחות שוב במוצאי שבת»). **Timer** (`services/product_order_sweeper.py::expire_due`): moves `pending` / `change_proposed` past `expires_at` to `expired` as `system`. Both run every 2 minutes in the app scheduler, each step guarded on its own, and the job is registered **only while the flag is on**. An order the business auto-confirms tells the business by email only («הזמנה חדשה התקבלה ואושרה»; the WhatsApp template asks for approval, so it is not sent). The business WhatsApp goes to `producers.phone` in international form; a landline gets email only. The account-deletion case is recognised only when the system cancels with its own note. The six WhatsApp templates (`ProductOrder*V1` in `whatsapp_templates.py`; WhatsApp Manager shows five as UTILITY and `product_order_change_v1` as MARKETING, MEH-3596) must be approved by Meta before buyers get messages; until then those rows end `failed` and the business still gets its email. Not in this stage: the purge of closed guest orders (stage 6), any screen.

> **MEH-3624 — «איך היה?» email (21/11/2026):** revision `e0436e1e20e3` on `d6a8c0e2f4b5` widens the `kind` CHECK of `product_order_notifications` with `review_request` (expand-only; downgrade deletes those rows first). A move to `handed` owes an **email** to a buyer **with an account**, 24 h later (`REVIEW_REQUEST_AFTER`): subject «איך היה אצל {business}?», body with the verified-review link from `services/review_invite.py` (`?rt=`, MEH-3620). At most **one per buyer per business, ever** (a second order from the same place is `asked_before`). At send time it is `skipped` when the order is not `handed` or the business is not `approved` (`not_live`), the buyer has no **verified** email (`no_address`), she is blocked or owns the business (`not_eligible`), or she already has a review of that business (`already_reviewed`). Rolling the backend back past this revision without the downgrade: close the owed rows first (`docs/release/ROLLBACK.md` §2b step 6). A guest gets no email; her order page shows «כתבו ביקורת». No WhatsApp: that needs a new Meta template.

> **MEH-2903 — `alembic_lineage` (11/11/2026):** boot bookkeeping, not app data. `alembic_version` stores only the current head, so an older image booting on a newer database (a backend rollback) cannot tell its own head is an ancestor of the database's revision. `backend/scripts/migrate_on_boot.py` (the only writer) records the image's whole revision chain here after every successful `upgrade head`; an image whose database is ahead of it takes rollback mode only if its own head is listed here, and otherwise fails the boot naming both revisions. Nothing in `app/` reads or writes it. Migration `19ac967d78fb`; **`EXPECTED_TABLES` 49 → 50**.

> **MEH-2528 — `retired_slugs` (28/10/2026):** tombstones for public business URLs. A business delete is a hard delete, so its UNIQUE `producers.slug` used to be free at once and the next business with the same name inherited every `/p/<slug>` link. Now admin delete, owner account delete and an admin slug change/clear write a row (`services/retired_slugs.py`, the only writer), and `_ensure_unique_slug` (`routers/admin.py`) treats a retired slug as taken (`-2`…). A business may take back a slug it retired itself (the row is then removed). Drafts are not retired — never public. `producer_id` = owner of a renamed slug (for a future redirect), NULL for a deleted business. Migration `c3d8e2f1a9b4`; **`EXPECTED_TABLES` 41 → 42**. A deleted business's URL answers **410** and renders the «בית העסק הזה כבר לא במהמקור» page (MEH-2534). Not yet: a 301 from a renamed slug.

> **MEH-2556 — `saved_items` (29/10/2026):** the recipes, events and experiences a user saved to «המועדפים שלי» (parent MEH-2555). Businesses keep `favorites` (FavoriteAlert hangs off it). `item_id` has no FK — it points at a different table per `item_type`; the read path serves only items that still exist and are public, so a deleted/hidden item drops out on its own. One save per item (UNIQUE), three types only (DB CHECK, mirrored by `SAVED_ITEM_TYPES` in models.py — `tests/test_meh2556_saved_items_table.py` fails if the two disagree), account delete cascades. Migration `9c534d477f2b`; **`EXPECTED_TABLES` 42 → 43**. API (MEH-2557): `GET /users/me/saved` → `{recipes, events, experiences}`, newest save first, public items only (recipe published+approved by a live business; event owner approved, past/cancelled kept and labelled by the page; experience `_publicly_visible_query`) · `GET /users/me/saved/ids` → `[{item_type, item_id}]` for the hearts' cache · `POST /users/me/saved/{type}/{id}` → 201, idempotent, **404 unless public** · `DELETE` → 200, own rows only, works after the item was hidden. All 🔑 (401 for a guest).

> **MEH-2644 — rescue bags, chunk 1 (03/11/2026):** the four tables behind «סלי הצלה» (parent MEH-2643), all dormant until `RESCUE_BAGS_ENABLED`. An offer hangs off a **location**, not a business — a bag is collected at a place, and chunk 2 refuses a location whose `location_precision` is not `exact`. `qty_left` is the counter chunk 2 decrements under `with_for_update` (the group_buys MEH-773 pattern); the `0<=qty_left<=qty_total` CHECK is what makes a lost oversell race a failed transaction instead of negative stock. `pickup_code` is unique **per offer**, not globally — two businesses may both issue 0431 on the same evening, and a global 4-digit code exhausts after 10k rows. Money is integer agorot. **The pilot has no payment** (03/11 ruling): there is no `amount_agorot`, no `paid_at`, and `paid` is not a status — buyers pay at the counter, and re-adding payment later is an expand-phase CHECK widening (ADR-007). Same revision adds `users.rescue_no_show_count` (int NOT NULL DEFAULT 0, server_default so no backfill pass): the second `no_show` inside 30 days blocks new reservations with a 422, and `rescue_orders.status` over the window stays the authority — this column is the cheap counter the gate reads first. Status vocabularies live once in `RESCUE_OFFER_STATUSES` / `RESCUE_ORDER_STATUSES` (models.py) and `tests/test_rescue_migration.py` reds if the revision's literal CHECK drifts from them. Migration `a1c9f3e8d204`; **`EXPECTED_TABLES` 43 → 47**. No endpoints yet (chunk 2), no UI (chunk 4).

> **MEH-2646 — rescue bags, chunk 2: the API (04/11/2026):** eight routes, all **404 while `RESCUE_BAGS_ENABLED` is off**, which is its default — 404 rather than 403 so the feature is not advertised before launch. **No payment endpoint and no amount field exist**: the buyer pays at the counter. `POST /rescue/offers` ✅👤 (approved business, pickup point must be `location_precision='exact'` per MEH-829, `qty_total` 1–20, one active bag per point per day else 409) · `GET /rescue/offers?city=&lat=&lng=` 🌐 (today's active bags with stock with at least 15 minutes of pickup window left — MEH-2713/MEH-2726, the same `RESERVE_CLOSES_BEFORE_END` the reserve guard uses, so reserve refuses the rest with 409 «זמן האיסוף חלף», producer summary, `typical_items`, and `distance_km` to **that pickup point** — deliberately not `haversine_min_km`, which answers "nearest of all the business's locations" and would quote a walk to a branch holding no bag) · `POST /rescue/offers/{id}/cancel` 👤 (cancels every open reservation with it; buyers are **not** messaged yet — a business-initiated WhatsApp needs a Meta-approved template and none exists for rescue) · `POST /rescue/orders` 🔑 (`qty` 1–2 **per buyer per offer**, summed not per-request; `SELECT … FOR UPDATE` on the offer per MEH-773; returns the 4-digit `pickup_code`, unique per offer) · `POST /rescue/orders/{id}/handed` 👤 (second call 409 naming `handed_at`, never a silent 200 — at a counter a repeated tap means the first was not seen) · `POST /rescue/orders/{id}/no_show` 👤 (only after `pickup_end`; now `/no-show`, MEH-3709) · `POST /rescue/orders/{id}/cancel` 🔑 (own order, only before `cancel_until`, returns stock under the same lock) · `POST /rescue/orders/{id}/review` 🔑 (own order, after `handed`, once — `uq_rescue_reviews_order`) · `POST /admin/rescue/users/{id}/clear-block` 🛡️. Adds `users.rescue_block_cleared_at` (migration `b2e6d4a17c93`, no table, `EXPECTED_TABLES` unchanged). **The 422 block counts no-shows from `rescue_orders` inside 30 days and after that stamp — `rescue_no_show_count` is a lifetime display/metrics counter and is NOT the gate**, because it has no window.

> **MEH-3225 — rescue bags: verified email first (14/11/2026):** `POST /rescue/orders` now depends on `require_verified_email`: an account with an unverified email gets **403** `{code: "email_unverified", message: "יש לאמת את כתובת המייל תחילה"}` (the same body every verified-only route returns) and no order is created. The pickup code and the no-show mails go to that address. The business page shows the resend notice in place («יש לאמת את כתובת המייל תחילה.», `rescue.errors.unverified`). No schema change.

> **MEH-3225 — rescue bags: the no-show block survives account deletion (14/11/2026):** new table `rescue_no_show_tombstones` (migration `f6c2a8d4e1b7`, expand-only, `EXPECTED_TABLES` 57 after this train): `id`, `email_hash` (hex HMAC-SHA256 of the lower-cased, trimmed email, keyed with the app secret — `services/rescue_no_show.py::email_hash`), `pickup_end`, `created_at`. No email, name, business or order. `services/user_deletion.py` writes one row per no-show still counting (inside 30 days and after `rescue_block_cleared_at`) before the account is deleted, on both doors (`DELETE /auth/me`, admin delete). `active_no_show_counts` — the reserve gate and `/admin/users` — adds the rows matching the user's email hash, under the same window and the same admin release. `services/retention_purge.py` deletes a row 30 days after its `pickup_end` (`PurgeResult.tombstones_deleted`). The privacy policy's retention section names the exception.

> **MEH-2715 — rescue bags: confirmation email (06/11/2026):** `POST /rescue/orders` now queues one email to the buyer after the commit (`app/services/rescue_emails.py`, a FastAPI BackgroundTask fed plain values, never the Session). It carries the pickup code, the total paid at the counter (`price_agorot × qty`), the pickup window and the free-cancel cutoff in Israel time, the pickup address, and a «לבטל את השריון» link to `/producer/{id}`. A refused reservation sends nothing. `send_email` stays fail-open, so a failed send never undoes a reservation. No schema or response change.

> **MEH-3313 — rescue bags: the business is told (15/11/2026):** the same `POST /rescue/orders` also queues one email (text body, plus the branded HTML part that `send_email` builds, MEH-3587) to every owner login of the business (`app/services/rescue_business_emails.py`, recipients from `booking_cancellations.owner_emails`): quantity, pickup code, total paid at the counter, the window, and a link to `/producer/dashboard/rescue`. Subject «נשמר סל הפתעה ב{name}». No buyer name or contact in it. A refused reservation sends nothing; fail-open. No schema change.

> **MEH-2680 — rescue bags: the buyer's own orders (05/11/2026):** `GET /rescue/orders/mine` 🔑 — the caller's `reserved`/`handed` orders on **today's** offers (Israel date), same fields as the `POST /rescue/orders` response plus `reviewed` (a review exists) and `producer_id`. The business page reads it on mount and on window focus, so a reload no longer loses the pickup code and the review appears once the counter marks the bag handed. It matches on `producer_id`, not `offer_id`, because `GET /rescue/offers` drops a sold-out offer. Guests are never asked (their 401 would end in the session-expired toast). Behind the same flag.

> **MEH-2716 — «מצילים מזון» badge (06/11/2026):** `ProducerListOut.rescued_recently` (bool, computed, no column) — True when the business, in the last 30 days, handed a surprise bag over (`rescue_orders.status='handed'`, `handed_at` in window) or reported bags given away free (`rescue_offers.qty_donated>0`, `pickup_end` in window). Set by `attach_rescue_saving()` (`services/producer_queries.py`) on `GET /producers`, `/producers/{id}`, `/producers/by-slug/{slug}` and the favorites list — two queries per page, none and always False while `RESCUE_BAGS_ENABLED` is off. Drives the `rescue_saving` badge (evidence `system`); never ranking.

> **MEH-3824 — the bag today on the map (25/11/2026):** `ProducerListOut.rescue_today` (object or null, computed, no column) — the business's earliest bag TODAY from the set `GET /rescue/offers` would list (active, `qty_left>0`, still reservable, approved non-test business, pickup point in a pilot town): `offer_id`, `location_id`, `price_agorot`, `value_min_agorot`, `pickup_start`, `pickup_end`, `qty_left`. Set by `attach_rescue_today()` (`services/producer_queries.py`) on `GET /producers` only, one query per page, none and always null while `RESCUE_BAGS_ENABLED` is off or `RESCUE_BAGS_CITIES` is empty. The list is edge-cached 30 s (+30 s stale), so a bag can show up to a minute after it sold out; the bag page and the reserve guard are the truth. Read by the map's `MapRescueRow`.

> **MEH-3824 — the map's offer switches (25/11/2026):** four boolean query params on `GET /producers` — `rescue_today`, `group_buy`, `event`, `experience` — keep the businesses that have ANY of the asked kinds (OR between them, AND with every other filter; `X-Total-Count` agrees). `ProducerListOut` gains three computed flags, no column: `has_open_group_buy`, `has_upcoming_event`, `has_listed_experience` (the bag already rides `rescue_today`). Each kind reads the ONE query its own public list runs (`services/offer_supply.py`): group buys `group_buys._status_tab_query(db, "open", None)`, experiences `experiences._public_listing_query(db)`, events `events.public_event_feed_query(db)` (the feed with no filter), bags `rescue_today_query` (shared with `attach_rescue_today`). So a flag is true exactly when that list would show the business something; `tests/test_meh3824_offer_filters.py` pins each flag against its list. Set by `attach_offer_flags()` on `GET /producers`, one query per kind per page. While the bag pilot is off, `?rescue_today=true` matches no business. The map's «סינון» shows a switch only when at least one business in its mount snapshot has the flag (`gate: "count"`, `gateMin: 1` in `lib/filter-taxonomy.js`).

> **MEH-2756 — rescue bags: the pickup_start codes digest (06/11/2026):** `rescue_offers.codes_sent_at` (`timestamptz` **NULL**able, no default, no backfill; migration `a3f7c21e9b05`, no table, `EXPECTED_TABLES` unchanged) is when the day's pickup codes for that offer were sent to the **business** over WhatsApp, and it is the whole duplicate-send guarantee. **No endpoint reads or writes it** — the only writer is the scheduler job `services/rescue_digest.py::send_rescue_digests`, registered on the existing `followup_scheduler` at a 5-minute interval (`startup.py`), because `pickup_start` is per-offer and no daily hour is the start of every business's window. Due = active · `codes_sent_at IS NULL` · `pickup_start` passed · `pickup_end` **not** passed · town in `RESCUE_BAGS_CITIES` · ≥1 `reserved` order. **An offer whose window closes undigested stays `NULL` forever** — `pickup_end > now` drops it from the candidate set, so NULL means "not digested" and the filter, not the column, separates "not yet" from "never". Gated by a second flag, `RESCUE_DIGEST_ENABLED` (default **False**), because the send needs the Meta-approved template `rescue_codes_digest_v1` — before approval every send answers 132001 and `send_template` returns False without raising. Each send appends one `alert_log` row on channel **`whatsapp_digest`**, deliberately NOT the consumer `whatsapp` channel: the cap key is `(user_id, producer_id, channel, sent_at)` and excludes `alert_type`, so a shared channel would make a business digest and a consumer favourite-alert share one 24h budget. **Note the mixed timezone on this table** — `codes_sent_at` is `timestamptz` while `pickup_start`/`pickup_end`/`created_at` are naive-UTC; that is intentional, matching `producers.email_pending_nudge_sent_at`, since a send-stamp is compared against `utc_now()` and never rendered on the Israel clock.

> **MEH-3703 — rescue bags: a weekly routine per pickup point (24/11/2026):** `producer_locations.rescue_schedule` (`JSONB` **NULL**able, no default, no backfill; migration `b7d9f1a3c5e8`, approved by Sapir 24/11; a column, not a table, so `EXPECTED_TABLES` is unchanged; CHECK: NULL or a JSON object). Its shape is `RescueScheduleStored` in `schemas/rescue_schedule.py`: `weekdays` (bitmask, Sunday = 1 … Saturday = 64, as `products.available_weekdays`), `pickup_start` / `pickup_end` (`HH:MM` on the Israel clock, same day), `cancel_minutes` (0–720 before the start), `qty` (1–20), `price_agorot`, `value_min_agorot`, `value_max_agorot` (each 0–1,000,000, ₪10,000), `paused`, `skip_dates` (Israel dates, past ones dropped on every write, at most two weeks ahead). Routes, all 👤 owner only and behind the rescue flag; a save and an unskip also need a verified email and the paid tool open (`capabilities.bags_open`, as a hand publish). Each row carries `publishing` (false when the routine cannot publish now): `GET /producers/me/rescue/schedules` (every pickup point of the business, with its routine or `null`) · `PUT /producers/me/rescue/locations/{id}/schedule` (set or change; **404** for another business's point, **422** for a point whose address is not exact, **403** outside the pilot towns; publishes the days already in reach at once) · `DELETE /producers/me/rescue/locations/{id}/schedule` (stops the routine; bags already up stay) · `PUT`/`DELETE /producers/me/rescue/locations/{id}/schedule/skips/{day}` (skip one day or take the skip back; **422** «אין לוח קבוע בנקודה הזאת» without a routine, «אפשר לדלג רק על יום בשבועיים הקרובים» outside the two weeks). An hourly job at :05 Israel (`services/rescue_schedule.py` `publish_due`, registered only with `RESCUE_BAGS_ENABLED`) inserts an ordinary `rescue_offers` row for each scheduled, unskipped day in `reserve_days` (today, tomorrow) whose window is still ahead, at a point that could host a bag by hand (approved business, exact address, pilot town, paid tool open). Each point runs in its own savepoint and re-reads its routine under the point's row lock (so a skip that lands mid-run counts), so a point that fails is logged and skipped and the other businesses still publish; a window a clock change folds to nothing, or whose reserve cut-off passed, is not published. A hand publish takes the same advisory lock, so the two never put up two bags. **A day that has any offer, cancelled included, is left alone**, so a rerun publishes nothing twice and a day the business cancelled by hand does not come back. A skip of a routine day whose bag is already up cancels that bag (a hand bag on a day off the routine is left alone) in the same transaction through `cancel_whole_offer`, emailing its buyers as a hand cancel does; when the bag has reservations the first call answers **409** «יש הזמנות לסל של היום הזה» and the dashboard asks, then sends `?cancel_reserved=true`. The new-bag follower alert (MEH-3117) is not sent for a routine bag.

> **MEH-3702 — rescue bags: today and tomorrow (24/11/2026):** a bag can be published and reserved for **today or tomorrow** on the Israel clock (`reserve_days` in `services/rescue_reads.py`, `RESCUE_MAX_DAYS_AHEAD = 1`). `POST /rescue/offers` with a later `date` is **422** «אפשר לפרסם סל רק להיום או למחר»; `POST /rescue/orders` on a bag outside the window is **409** «אפשר לשריין רק סלים של היום ושל מחר». `GET /rescue/offers`, `GET /rescue/offers/{id}`, `GET /rescue/orders/mine`, `GET /producers/me/rescue/orders` and `GET /producers/me/rescue/offers` now cover both days, and each row carries the bag's **`date`** (new field on `RescueOrderCreatedOut`, `RescueMyOrderOut`, `RescueOwnerOrderOut`, `RescueOwnerOfferOut`); the business's orders come today first. The confirmation email says «איסוף מחר» (and «מחר ב-» for the cutoff) for tomorrow's bag. A new daily job (08:00 Asia/Jerusalem, `services/rescue_reminders.py`, registered only when `RESCUE_BAGS_ENABLED`) queues one `rescue_reminder` row in `email_outbox` for every `reserved` order on today's active bag whose window has not ended and that was **created before 00:00 Israel today**. Nothing stamps an order as reminded; instead the run takes a Postgres advisory lock and skips the whole day when a `rescue_reminder` outbox row was already created since 00:00 Israel (a second replica or a manual re-run sends nothing). MEH-3805: a bag whose window ends at or before 08:00 Israel is reminded the evening before instead, by a 20:00 job (`queue_evening_reminders`, kind `rescue_reminder_eve`, subject «מחר אוספים את הסל ב…», the same once-a-day lock); the morning run takes only windows that end after 08:00, so no order gets both. `POST /rescue/orders/{id}/handed` on a bag dated after today is **409** «אפשר למסור את הסל רק ביום האיסוף» (a past day stays allowed). Publish also refuses (422) a window already over («שעת סיום האיסוף כבר עברה») and a bag whose pickup starts on an Israel day before its `date` («שעות האיסוף צריכות להיות ביום של הסל»); the dashboard builds the hours on the Israel clock, not the device's. The follower alert (MEH-3117) still fires only for a bag dated today. No schema change.

> **MEH-3704 — rescue bags: sort and send the code (24/11/2026):** each `GET /rescue/offers` row's `producer` now carries the business's public **`avg_rating`** (optional; null when there are no reviews yet, never 0), so the /rescue list can sort by rating; the field moved from `RescueProducerDetail` to `RescueProducerSummary`, so `GET /rescue/offers/{id}` is unchanged. The sort itself (time / closest / cheapest / rating) and «send the code to whoever collects» are client-side; no route, no schema change.

> **MEH-3586 — rescue bags: one bag's own page (21/11/2026):** `GET /rescue/offers/{id}` 🌐 (120/min, same flag — 404 while off) → `RescueOfferDetailOut`: the `GET /rescue/offers` row plus **`state`** (`available` · `sold_out` · `cancelled` · `ended`, decided in that order of precedence: cancelled, then the reserve window closed — the same `RESERVE_CLOSES_BEFORE_END` — then `qty_left = 0`), the pickup point's **`lat`/`lng`** (exact precision by construction), and the business's public **`avg_rating`/`reviews_count`** and own **`short_description`** (trimmed; null when empty) on `producer`. Unlike the list it still returns a bag that cannot be reserved, so a shared link says why; another day's bag, an unapproved or test business, or a town outside the pilot is **404 «הסל הזה לא נמצא»**, the set the list never shows. Read by `/rescue/[offerId]`. No schema change.

> **MEH-2921 — rescue bags: the pilot town, before the form (19/11/2026):** `GET /producers/me/rescue/pilot-locations` 👤 (`routers/rescue_pilot.py`, 60/min, same flag — 404 while off) → `{location_ids: UUID[]}`: the caller's own `producer_locations` whose town passes `city_in_pilot` (`RESCUE_BAGS_CITIES`, canonicalised). Read-only; the town list itself is not sent, and `POST /rescue/offers` keeps its own gate. The rescue tab uses it to say «עדיין לא פתוחים ביישוב הזה» before the form instead of after «לפרסם». No schema change.

> **MEH-3593 — «הוראות איסוף» on the pickup point (21/11/2026):** `producer_locations.pickup_note` (`text` **NULL**able, no default, no backfill; migration `f2b4d6e8a0c3`, expand-only). On the address, not on a bag, so a surprise bag, a product order and a group-buy pickup at the same point read one text. Written with the point in the locations editor (`POST /producers/me/locations`, `PUT /producers/me/locations/{id}` and the admin twins, field `pickup_note`, ≤ 200 chars, ≥ 3 letters per MEH-555, whitespace folded to one line; empty or whitespace = cleared to `NULL`; a PUT without the field leaves it unchanged, `exclude_unset`). Read on `ProducerLocationOwnerOut`, the public `ProducerLocationOut`, the bag page's `GET /rescue/offers/{id}` (`pickup_note` of the bag's own point, `null` when none) and as a «הוראות איסוף:» line in the buyer's reservation email (HTML-escaped). Not on the public list `GET /rescue/offers`.

> **MEH-2752 — rescue bags: per-business allergens (06/11/2026):** `rescue_typical_items.allergens` (`text[]` **NULL**able, no server default, no backfill; migration `e4c71b9a2f68`, no table, `EXPECTED_TABLES` unchanged) is the business's own allergen declaration for the bag, replacing a fixed sentence every bag showed whatever the business sold. **`NULL` and `[]` are different claims and only one of them is storable:** `NULL` = not filled, `[]` would read as "contains no allergens" — a statement about food nobody made. `normalize_allergens` (`app/allergens.py:29`) collapses both `[]` and `None` to `None`, de-dupes, returns the codes (14, then 15 with `fava_beans` «פול» since MEH-3439 — the rescue form shows it too) in canonical order and raises on an unknown one, so `RescueTypicalItemsIn` delegates to it and an unknown code is **422 with nothing written**. Carried on `GET`/`PUT /producers/me/rescue/typical-items` 👤 and on the public bag in `GET /rescue/offers` (`allergens`, `null` when undeclared — never `[]`). Same code list and Hebrew labels as `products.allergens` (MEH-2662); one owner, no second list.

> **MEH-2703 — rescue bags: what was not collected (06/11/2026):** `rescue_offers.qty_donated` (int NOT NULL, `server_default 0`, CHECK `0..qty_total`; migration `b7d2e4f1a903`, no table, `EXPECTED_TABLES` unchanged) is the business's own report of uncollected bags it gave away free. `GET /producers/me/rescue/offers` 👤 — today's bags for this business (Israel clock) with `leftover` = `qty_left` + bags on `no_show` orders; **0 before `pickup_end`** (a bag may still be reserved or collected) and **0 for a cancelled offer**; a `reserved` order not yet marked «לא הגיע» does not count. `PUT /producers/me/rescue/offers/{id}/donated` 👤 `{qty}` — owner or admin, a **set** not an increment (a repeated tap is a no-op, a mistake is corrected by sending the right number), 409 before `pickup_end` or on a cancelled bag, **422 above `leftover`** — the CHECK only bounds `qty_total`, because the no-show half lives on `rescue_orders`. `GET /admin/rescue/metrics` gains `bags_donated`. Behind the same flag.

> **MEH-2649 — rescue bags, chunk 5: the counter tool and the pilot controls (04/11/2026):** three routes, all behind the same flag. `GET /producers/me/rescue/orders` 👤 — today's reservations across the business's pickup points, Israel-clock today only; it returns **no buyer identity** (handing a bag over needs four digits, and a list of today's customers on a dashboard screen is more personal data than the job requires), and it carries the offer's `pickup_end` so the dashboard can decide whether «לא הגיע» is legal without a second request · `GET`/`PUT /producers/me/rescue/typical-items` 👤 — the «בדרך כלל» list, one row per business (`uq_rescue_typical_items_producer`), upserted in place, bounded at 12 so the line stays one line on a phone · `GET /admin/rescue/metrics?days=` 🛡️ — offers/day, sell-through, no-show rate and repeat buyers; **the two rates are `null`, never `0`, when their denominator is zero**, because in week one "nothing published" and "nothing sold" must not read the same. **Per-town gate:** `RESCUE_BAGS_CITIES` (comma separated) — **empty means NO town, not every town**, which is what a missing env var produces; names are canonicalised (`תל אביב` matches `תל אביב-יפו`); and it is enforced on the **read** as well as the write, so a town removed from the list stops serving offers published while it was in. No schema change in this chunk.

> **MEH-3897 — rescue bags: the business marks a prepay received (26/11/2026):** `rescue_orders.paid_at` (timestamp **NULL**able, no default, no backfill; migration `b4d6f8a0c2e3`, no table, `EXPECTED_TABLES` unchanged). `POST /rescue/orders/{id}/paid` 👤 body `{"paid": bool}` — owner of the offer or admin, else 403; only a `reserved` or `handed` order, else 409 «אפשר לסמן תשלום רק על שריון פעיל או על סל שנמסר»; `true` stamps `paid_at` once (idempotent) and needs a prepay link today, else 409 «אפשר לסמן תשלום רק כשבית העסק מקבל תשלום מראש בקישור»; `false` clears it, link or not; the offer is locked and the status re-read before the write (MEH-2865 pattern); 60/minute; returns `RescueOrderOut`. A cancelled order that was marked paid sends the owners' refund email even without a link, worded firmly («סימנת שהתשלום מראש התקבל»), and a whole-offer cancel (`POST /rescue/offers/{id}/cancel`, a skipped routine day) sends it for each paid reservation it cancelled. `GET /rescue/orders/mine` rows carry `paid_at`; `GET /producers/me/rescue/orders` rows carry `paid_at` and `prepay` (bool: the business has a prepay link today, so the dashboard offers the mark). We never see the money: this is the business's own word, as in a shop's manual payment.

> **MEH-3897 — the payment terms are kept on each reservation (27/11/2026):** `rescue_orders.prepay_timing` and `group_buy_commits.prepay_timing` (varchar(10) **NULL**able, CHECK `advance|deposit|counter`; migration `c5e7a9b1d3f4`, no table, `EXPECTED_TABLES` unchanged, no backfill). `issue_order` and the group-buy join write it from `producers.payment_info` (`payment_link.reservation_timing`: `counter` when there is no prepay link). The business refund notes (a buyer's bag cancel, a whole-offer cancel, a group leave or cancel) read it through `payment_link.refund_timing`, so a business that removes its link after a buyer paid still gets told what to return. A note goes out when the stored terms are advance/deposit **or** the business shows a link today (the buyer's page and reminders read the live link, so a counter reservation may still have been paid ahead); only `counter` with no link today sends nothing. NULL rows behave the same way (today's settings). Same pattern as Shopify's per-order `PaymentTerms`.

> **MEH-3709 — the no-show route is spelled with a hyphen (22/11/2026):** `POST /rescue/orders/{id}/no-show` 👤 replaces `/no_show`, the one API path that used an underscore (`/producers/me/product-orders/{id}/no-show` already used the hyphen). The old spelling stays as a hidden alias (`include_in_schema=False`, same handler, same limit and owner check) so a browser on the previous bundle keeps working through the release; MEH-3711 removes it. The status value `no_show` is unchanged.

> **MEH-3226 — no-show mail, the block link, the admin release (14/11/2026):** `POST /rescue/orders/{id}/no_show` now mails the buyer each time (`services/rescue_no_show.py`, BackgroundTask, fail-open): subject «הסל ב{name} לא נאסף»; the first mail explains that two no-shows in 30 days block reservations, the one that reaches the block says it is on now; both end «אם זו טעות, כתבו לנו ונבדוק:» + /contact. The 422 detail is now «השריונים חסומים אחרי שתי אי-הגעות. כתבו לנו», and the page renders «כתבו לנו» as a link to /contact. `GET /admin/users` rows gain `rescue_active_no_shows` (int) and `rescue_blocked` (bool) from the same windowed count the gate reads (`active_no_show_counts`, one grouped query — the rule's constants moved to that service); /admin/users shows a badge «חסומה לסלים ({n} אי-הגעות)» and a row-menu item «שחרור חסימת סלים» that calls `clear-block`. No schema change.
>
> **MEH-2737 — rescue bags: the buyer's cancel (06/11/2026):** `POST /rescue/orders/{id}/cancel` now locks the offer **and then the order** (`FOR UPDATE`, the order reserving takes them in) and re-reads the order's status under the lock — before this, two cancels of one order (double tap, or page + email) both passed the unlocked status check and returned its bags to `qty_left` twice. A successful cancel emails the buyer (`send_cancel_email`, fail-open, no code in it). The reservation email drops the cancel line and button when the bag was reserved after `cancel_until`. `GET /admin/rescue/metrics`: **`no_show_rate` is now out of the reservations that were not cancelled**, `repeat_buyers`/`buyers_total` ignore cancelled reservations, `bags_offered`/`bags_reserved`/`sell_through` exclude bags the business cancelled, and two new counts `orders_cancelled` / `offers_cancelled`. No schema change.

> **MEH-2738 — rescue bags: the business cancels the bag (06/11/2026):** `POST /rescue/offers/{id}/cancel` is now refused once `pickup_end` passed (409 «זמן האיסוף חלף»); a bag already handed stays handed (unchanged: only `reserved` orders are cancelled); after the commit each buyer whose reservation went with it gets **one** email (`send_business_cancel_email`, fail-open, links to `/rescue`). `GET /rescue/orders/mine` also returns the caller's reservations **the business cancelled**, with a new required bool **`cancelled_by_business`** (False on every other row). There is no column saying who cancelled: a buyer's cancel returns its bags to `qty_left` and the business cancel does not, so the business-cancelled bags are `(qty_total − qty_left) − bags on orders never cancelled`, stamped with the offer's latest `cancelled_at`. That also handles the case where the buyer cancelled first and nobody else held a bag. No schema change.

> **MEH-3698 — rescue bags: the buyer's history for «ההזמנות שלי» (22/11/2026):** `GET /rescue/orders/history` 🔑 — every reservation of the caller's, **any day**, newest first (offer date, then reservation time), at most `HISTORY_MAX_ROWS` = 50 (`services/rescue_reads.py`). Fields: `id`, `offer_id`, `qty`, `status` (all four, a buyer's own cancel included), `created_at`, `date`, `pickup_start`, `pickup_end`, `producer_id`, **`producer_name`**, `cancelled_by_business` (same arithmetic as MEH-2738). **No `pickup_code`** — the list row links to the bag's page, which shows it on the day. `/rescue/orders/mine` is unchanged. Behind the same flag (404 while it is off). No schema change.

> **MEH-3698 — «ההזמנות שלי» has anything? (22/11/2026):** `GET /users/me/orders/any` 🔑 → `{any: bool}` (`routers/my_orders_any.py`, 60/min, `Cache-Control: private, no-store`). True when the caller has a product order still listed by `GET /users/me/product-orders` (same 30-day window after close, and only while `product_orders_enabled()`), a group buy listed by `GET /users/me/group-buys` (through `_public_group_buys`), or a surprise bag (only while `rescue_bags_enabled()`). Three EXISTS queries, no rows returned. The account menus read it to show the «ההזמנות שלי» row; one request instead of three per page load, because every CI request comes from one IP (testing.md, MEH-2972).

---

### Admin, messaging, outreach — tables that had no schema line (added MEH-3604, 21/11/2026, from the models)

Generated once from `Base.metadata`; the model file is the authority. Read it for types and indexes.

```sql
admin_audit_log                (id PK, actor_id, action, target_type nullable, target_id nullable, details nullable, ip nullable, created_at)  -- models/admin_ops.py
admin_checklist_items          (id PK, position, label, hint nullable, active, updated_at)  -- models/admin_ops.py
admin_passkeys                 (id PK, user_id FK→users CASCADE, credential_id, public_key, sign_count, aaguid nullable, backup_eligible, backup_state, transports nullable, name nullable, created_at, last_used_at nullable)  -- models/admin_passkeys.py
admin_recovery_codes           (id PK, user_id FK→users CASCADE, code_hash, used_at nullable, created_at)  -- models/admin_passkeys.py
group_buy_commits              (id PK, group_buy_id FK→group_buys CASCADE, user_id FK→users CASCADE, quantity, phone nullable, created_at, pickup_code char4 nullable UNIQUE per group, handed_at, no_show_at — at most one; MEH-3735)  -- models/events.py
group_buy_waitlist             (id PK, group_buy_id FK→group_buys CASCADE, user_id FK→users CASCADE, quantity, offered_at nullable, created_at; UNIQUE(group_buy_id, user_id))  -- models/events.py (MEH-3592)
inbound_messages               (id PK, from_phone, body, received_at, meta_message_id nullable, bot_replied, bot_replied_at nullable, bot_template_sent nullable, human_replied)  -- models/admin_ops.py
outbound_messages              (id PK, to_phone, kind, meta_message_id nullable, status, error_code nullable, error_message nullable, created_at, updated_at nullable)  -- models/admin_ops.py
outreach_leads                 (id PK, name, phone nullable, instagram nullable, website nullable, city nullable, category nullable, notes nullable, source nullable, status nullable, prefill_token nullable, prefill_token_expires_at nullable, suggested_by_name nullable, suggested_by_email nullable, suggester_wants_update, suggestion_reason nullable, suggester_thanked_at nullable, created_at nullable, updated_at nullable)  -- models/admin_ops.py
producer_name_change_requests  (id PK, producer_id FK→producers CASCADE, current_name, requested_name, reason nullable, status, admin_notes nullable, created_at, reviewed_at nullable)  -- models/admin_ops.py
producer_review_checks         (id PK, producer_id FK→producers CASCADE, item_id FK→admin_checklist_items RESTRICT, label_snapshot, checked_by FK→users SET NULL nullable, checked_at)  -- models/admin_ops.py
```

## API Endpoints

All endpoints served from `backend/app/main.py`. Auth via JWT in the
`Authorization: Bearer …` header unless marked "public". Rate limiting
via `slowapi` — see `backend/app/rate_limit.py` and
[SECURITY.md](./SECURITY.md) §2.

> **MEH-2955 · MEH-3297 — answers any endpoint can give before the route
> runs** (`backend/app/db_bulkhead.py`). **503** «האתר עמוס כרגע…» +
> `Retry-After: 2` when the server is full for 10 s, or when buffered request
> bodies exceed 64 MB (only bytes past the first 64 KB of a body count, so
> small JSON POSTs are never refused this way). The request body is read
> before the request may run: **408** «הבקשה הגיעה לאט מדי…» after 15 s with
> no new bytes or 300 s in total; **413** «הבקשה גדולה מדי.» above 10 MB
> (declared or received). 408 / 413 close the connection.

> **MEH-3022 — per-business caps.** Creates answer **409** with a Hebrew
> `detail` once a business holds the maximum: products 100 (MEH-2312: drafts count), recipes 50,
> locations 20, upcoming events 30, upcoming/recurring experiences 30, open or
> funded group buys 30. `PUT /producers/me` refuses more than 20 `images` or
> 300 delivery cities/areas with a Hebrew 422. All numbers live in
> `backend/app/limits.py`. The same ticket added rate limits to 17 write
> routes that had none (`POST /producers`, events, experiences PUT/DELETE,
> group buys + commit, favorites, alert prefs, review reply/delete, and the
> product/recipe/location DELETEs).

> **MEH-1164 F5 (Chunk 2A) — verified-email gate on content creates.** The
> producer create endpoints `POST /events`, `POST /producers/me/recipes`, and
> `POST /group-buys` depend on `require_verified_producer` (`app/auth.py`) =
> `require_producer` (role first → "Producer access required") **then** the
> email-verified check (unverified → 403), matching the verification banner's
> promise. `POST /experiences` used `require_verified_email` at the time and
> was left unchanged; **MEH-2246 (04/09/2026, PR #3357) moved it to the same
> `require_verified_producer` gate** — since the read gate (approved business
> only) a consumer's submission could only ever sit in the admin queue
> unpublished. Non-create producer routes (PUT/update, list/delete) stay on
> `require_producer`. No schema change — uses the existing
> `users.email_verified`. (`POST /group-buys` has no dedicated block below;
> noted here.)
>
> **MEH-2436 — the business changes its own group buy's status.**
> `PATCH /group-buys/{id}/status`, body `{"status": "open"|"funded"|"cancelled"|"fulfilled"}`
> (anything else → 422). Non-admin callers pass the same gate as
> `POST /group-buys` (`require_producer` → `require_verified_producer`), then
> the IDOR check: `gb.producer_id == current_user.producer_id`, else 403.
> The owner gets exactly `open → cancelled` (before or after the deadline),
> `funded → fulfilled` and `funded → cancelled` (`OWNER_TRANSITIONS`); any other
> pair → 409, so cancelled and fulfilled are final for her. The route is
> owner-only: an admin (not a producer) gets 403 here and uses
> `PATCH /admin/group-buys/{id}/status`, which since MEH-2866 has no override:
> the same table (`ADMIN_TRANSITIONS = OWNER_TRANSITIONS`), the same row lock,
> an optional `expected_status` (409 on mismatch), and the same cancel email to
> every participant except the admin herself. A status outside the four → 400 `{code:"invalid_group_buy_status", params:{allowed}}` (MEH-1943). The check and the write run under a row lock
> (`with_for_update`, like `/commit`). 30/minute. No schema change.
>
> **MEH-2489 — `expected_status` (optional).** Same body plus
> `"expected_status": "open"|"funded"|"cancelled"|"fulfilled"`: the status the
> dashboard showed. Checked under the row lock, after the IDOR check; a mismatch
> → 409 with the same detail as a refused transition, nothing written, no email.
> Omitted → the behaviour above, unchanged. The owner dashboard always sends it,
> so a cancel opened on an open group that funded meanwhile is refused instead
> of landing on a funded group whose double confirm she never saw.
>
> **MEH-2435 chunk 4 — cancel email.** When that owner route writes
> `cancelled` (cancel before the deadline, close after it, or cancel a funded
> group), every participant gets «מהמקור — הקבוצה "{title}" בוטלה», naming the
> business, no link, no contact details
> (`services/group_buy_notifications.py:notify_participant_cancelled`).
> Recipients are read under the row lock before the commit; the send runs as a
> background task and a failed send never fails the 200. Once by construction:
> cancelled is final in `OWNER_TRANSITIONS`, so a repeat is a 409 and sends
> nothing. No latch column. An admin cancel (admin route) sends nothing.
>
> **MEH-3287 — deadline passed below the minimum.** A daily job
> (`startup._run_group_buy_expiry_job`, 06:00 UTC = 08:00/09:00 Israel,
> `GROUP_BUY_EXPIRY_CRON`) moves every `open` group whose `deadline` has
> passed to `cancelled` (row lock, SKIP LOCKED) and mails each participant
> «מהמקור — הקבוצה "{title}" לא הגיעה ליעד»
> (`services/group_buy_expiry.py`, `notify_participant_expired`). `funded`
> groups are not touched. The status change is the only stamp: a second run
> selects nothing. No email to the business.
>
> **MEH-2621 (MEH-2615 split, chunk 1) — pickup and delivery as two answers.**
> Two new nullable `Text` columns on `group_buys`: `pickup_note`,
> `delivery_note` (Expand-only, no backfill; `fulfillment_note` unchanged).
> `POST /group-buys` accepts both (stripped, ≤1000, ≥3 letters when given);
> **at least one of `pickup_note` / `delivery_note` / `fulfillment_note` is
> required** — none → 422 «יש למלא איסוף או משלוח»
> (`GroupBuyCreate._require_pickup_or_delivery`). Blank / whitespace / `null`
> count as not given. `fulfillment_note` is now optional on write (kept for the
> pre-split form) and keeps its own wordless-text message. `GET /group-buys`
> and `GET /group-buys/{id}` return `pickup_note` and `delivery_note`
> (`null` on older rows). This supersedes the "required" rule in the MEH-2453
> note below.
>
> **MEH-2453 (MEH-2435 chunk 5) — how a participant from another city gets the
> product.** `POST /group-buys`: `fulfillment_note` is now **required** — a
> string, stripped, ≤1000 chars, at least 3 letters (the MEH-555 floor, so "."
> or «כן» is refused too); missing / `null` → 422, too few letters → 422 with
> «יש לכתוב מתי ואיך מקבלים את המוצרים» (`GroupBuyCreate._require_fulfillment_note`).
> The column stays nullable (no migration): rows created before this keep NULL
> and the public page keeps hiding an empty note. The funded email to each
> participant gains «לדף העסק: {frontend_url}/producer/{producer_id}» above the
> group link — a link, never contact details (privacy contract unchanged). The
> public group page reads `GET /producers/{producer_id}` once (not on its
> 30-second refresh), validates the delivery slice with
> `GroupBuyProducerDeliverySchema`, then mounts the same «מגיעים אלייך?»
> `DeliveryChecker` as the business page (the «מאת {name}» link beside it is
> MEH-2472's). If that fetch fails (e.g. a business that is not public → 404),
> no checker shows. No new route.
>
> **MEH-2437 — the business's own group buys.** `GET /producers/me/group-buys`
> (`require_producer`; a producer user with no business → 403 `לא נמצא עסק
> מקושר`, like `/producers/me/recipes`). Returns `list[GroupBuyOut]` — the same
> shape as `GET /group-buys` — filtered to `producer_id == current_user.producer_id`,
> **all four statuses**, newest `created_at` first. 120/minute. Replaces the
> owner dashboard's four site-wide `GET /group-buys?status=…` calls that were
> filtered by `producer_id` in the browser. No schema change.
>
> **MEH-2484 — only an approved business's group buys are public.** `GET
> /group-buys` (and through it the sitemap) lists a group buy only while its
> business passes `producer_listing.is_business()` (approved, `kind='producer'`).
> `GET /group-buys/{id}` answers a stranger the same `404 קבוצת הרכש לא נמצאה`
> when it does not — the owner and admin still get `200` from the API (the
> public page is server-rendered without auth, so it 404s for them as well).
> `DELETE …/commit` (leaving) is deliberately not gated. `POST
> /group-buys/{id}/commit` is `404` for a non-public group buy too, so a held
> link cannot join it. One helper, `group_buys._public_group_buys`. The owner's
> list above and the admin list are unchanged. No schema change.
>
> MEH-3691: `POST /group-buys/{id}/commit` (and `…/waitlist`) answers `403 אי אפשר להצטרף לקבוצת
> הרכישה של בית עסק בבעלות החשבון הזה` when the caller's `producer_id` is the group's, and
> `POST /product-orders` answers `403 אי אפשר להזמין מבית עסק בבעלות החשבון הזה` when the
> logged-in buyer's `producer_id` is the order's business (checked before the
> phone code). A business buys from other businesses like any customer.
>
> **MEH-2498 — taking a business off the site cancels its live group buys.**
> When an admin moves a business out of `approved` — `POST
> /admin/producers/{id}/toggle-status` (approved→inactive), `POST
> /admin/producers/{id}/reject` (approved→rejected) — every group buy of it in
> `open` / `funded` becomes `cancelled` in the same commit
> (`services/group_buy_delist.cancel_live_group_buys`), and each participant
> except the business's own users gets the **delisted-cancel email**
> (`notify_participant_cancelled_delisted`: «…בוטלה כי בית העסק {name} כבר לא
> מופיע במהמקור», no link, no contact details). `fulfilled` / `cancelled` are
> untouched; re-activation un-cancels nothing; a failing email never fails the
> admin action. No schema change.
>
> **MEH-3227 — the same four paths cancel bags and sign-ups too.** Suspend,
> reject-while-live, admin delete and the owner's `DELETE /auth/me` all call
> `services/booking_cancellations.delist_business`, which runs the MEH-2498
> group-buy cancel and then: every `active` rescue offer of the business whose
> pickup has not ended → `cancelled`, its `reserved` orders → `cancelled`, one
> email per buyer («הסל ב{name} בוטל» / «…כבר לא מופיע במהמקור, ולכן השריון
> שלכם לסל בוטל»); every `registered` sign-up to its events from today on and to
> experiences its owner hosts (today on) → `cancelled`, one email
> each («ההרשמה ל-"{title}" בוטלה»). Suspend and admin delete also mail the
> owner («הדף של {name} הוסתר מהאתר» / «…הוסר», with a /contact link); reject
> already sends its own email, and the account deletion is her own act. Past
> or ended bookings and other businesses are untouched. Rows are read before
> the delete cascade. No schema change.
>
> **MEH-3768 — and its on-site orders it never accepted.** The same call moves
> the business's `pending` and `change_proposed` product orders to `cancelled`
> as the system (`product_order_actions.release_unaccepted_orders`, note «בית
> העסק הוסר מהאתר»); each buyer is owed the «closed» WhatsApp, and a «new
> order» message still owed to the business is skipped. `confirmed` / `ready`
> stay open, and the owner's email says so. The two delete paths refuse a
> business with open orders before this runs (MEH-3262).
>
> **MEH-3227 — the business changes one event or experience.**
> `PUT /events/{id}` / `PUT /experiences/{id}` with `is_active` true→false, and
> `DELETE` on either, cancel the item's `registered` sign-ups and mail each
> registrant («"{title}" בוטל»); a PUT that changes `event_date` or
> `event_time` of an active item keeps the sign-ups and mails the new time
> with the cancel link («המועד של "{title}" השתנה»). A past item sends
> nothing. All mail is a BackgroundTask (fail-open, `test_cause` for a test
> business).
>
> **MEH-3312 — the evening-before reminder (2026-11-15).** Migration
> `b8e4f2a6c9d1` adds `registrations.reminder_sent_at` (TIMESTAMP NULL, naive
> UTC). A daily job at 17:00 Israel (`REGISTRATION_REMINDER_CRON`, Sentry
> heartbeat `registration-reminder-daily`) mails every `registered` sign-up to
> an active event, or an approved, active, non-recurring experience, dated
> tomorrow on the Israel clock: «תזכורת: "{title}" מחר», with time, place and
> the cancel link. Rows are stamped and committed before sending, so a rerun
> sends nothing. A recurring workshop with listed dates reminds the sign-ups
> of tomorrow's date (MEH-3441); one without dates is still skipped. Service: `app/services/registration_reminders.py`.
>
> **MEH-3314 — the waitlist (2026-11-18).** Migration `c9f5a3b7d2e8` adds
> `registrations.waitlist_offered_at` and `'waitlisted'` to
> `ck_registrations_status`. A full item still answers a plain sign-up 409
> `registration_full`; the same body with `waitlist: true` stores a
> `waitlisted` row (201 `{status: "waitlisted"}`, max 50 per item, else 409
> `waitlist_full`), emails the visitor her cancel link, and sends no owner
> email and writes no ledger row. A cancel on an upcoming item emails the
> first waitlisted visitor not yet offered, once, with the item link; the spot
> is not held. Re-submitting the form with the same email promotes her row.
> Service: `app/services/registration_waitlist.py`.
>
> **MEH-3440 — a recurring workshop's dates (2026-11-19, stage 1 of MEH-3264).**
> Migration `f2c8a4d6e9b1` adds `experiences.sessions` (JSONB, a list of
> `{date, time, participants_count}`), `registrations.session_date` +
> `session_time`, and the index `ix_registrations_experience_session`. All
> nullable, no backfill, nothing reads them yet: a workshop with no dates keeps
> one pool of places. Columns, not a table, because `EXPECTED_TABLES` lives in
> a workflow file CC cannot write; the 12-date cap and one-row-per-date are
> enforced by the API (stage 2).
>
> **MEH-3315 — party size and attendance (2026-11-18).** Migration
> `d4a6b8c0e2f1` adds `registrations.party_size` (1–10, default 1) and
> `registrations.attendance` (NULL / `attended` / `no_show`). Places are the
> SUM of `party_size` over registered rows (`services/registrations.py`
> `registered_counts`), so `spots_left`, the cap check and «נשארו N מקומות»
> count people. A party that no longer fits gets 409 `registration_not_enough`
> «נשארו רק N מקומות» (or the waitlist, with `waitlist: true`). The owner or an
> admin marks attendance; nothing reads it to block a visitor. A cancel offers
> the freed places, in list order, to every waiting party that fits
> (`registration_waitlist.offer_places`): a party too big for what is free is
> skipped, not spent. The owner's «הרשמה חדשה» email adds «כמה אנשים» above 1.
>
> **MEH-3310 — the same two PUTs, for places and the sign-up method.** A
> `max_participants` below the item's active on-site sign-ups → **422**
> «כבר נרשמו N, ולכן אי אפשר להגדיר פחות מקומות מזה.» (MEH-2871,
> `services/registrations.refuse_too_few_places`), nothing written. Not checked
> when the value equals the stored one, or when the same PUT cancels the item:
> those sign-ups are cancelled with it, so nobody is left holding a place. Switching
> `registration_method` away from `site_form` on an active item keeps every
> sign-up and mails each registrant once («עדכון על ההרשמה ל"{title}"», with the
> cancel link). A PUT that also moves the date sends only the «moved» email. Both dashboards keep showing the list while `registered_count`
> > 0. No schema change.
>
> **MEH-2502 — the admin edit cannot change status.** `PUT
> /admin/producers/{id}` with `status` in the body → **422** «לא ניתן לשנות
> סטטוס בעריכה — יש להשתמש באישור, בדחייה או בהשעיה.», nothing written. Status
> moves only through approve / reject / toggle-status, which carry the approval
> gate, the MEH-509 hooks and the MEH-2498 cancel. `ProducerAdminUpdate` still
> declares the inherited field; the route refuses it. No schema change.
>
> **MEH-2503 — deleting a business or an account with group buys.** `DELETE
> /admin/producers/{id}` and the owner's `POST /auth/me/delete` first run the same
> cancel + delisted email on the business's `open` / `funded` group buys, then
> the DB cascade removes them. A participant's `POST /auth/me/delete` removes her
> commits (DB cascade) and reverts any `funded` group that drops below
> `min_participants` to `open`, as leaving does
> (`group_buy_delist.withdraw_user_commits`). Before this all three deletes
> 500'd: `Producer.group_buys`, `Producer.name_change_requests` and
> **MEH-3735 — «לא הגיע» in group buys.** `GET /producers/me/group-buys/{id}/pickups` (owner or admin) → `{can_mark, mark_state, pickup_ended_at, pickups: [{id, pickup_code, quantity, handed_at, no_show_at}]}` (`mark_state`: open · not_funded · delivery · no_window · wait · closed) — codes, never a person. `POST /group-buys/{id}/commits/{commit_id}/handed` and `POST /group-buys/{id}/commits/{commit_id}/no-show` (owner or admin; group funded or fulfilled, not delivery-only, with a pickup window that ended within the last 14 days; once — else 409; 60/min). `PATCH /group-buys/{id}/settings` refuses a new pickup end that already passed (400). A no-show mails the participant. Two no-shows inside 30 days, in groups not later cancelled, → `POST /group-buys/{id}/commit` answers `403 כרגע אי אפשר להצטרף…`. `POST /admin/group-buys/users/{user_id}/clear-block` writes `users.group_buy_block_cleared_at`. `GET /group-buys/{id}` returns `user_commit.pickup_code` to the participant; `GET /admin/users` adds `group_buy_active_no_shows` / `group_buy_blocked`. Separate from the rescue count.
>
> `User.group_buy_commits` lacked `passive_deletes` on a NOT NULL FK. A mapper
> scan in `tests/test_meh2503_delete_with_group_buys.py` guards the class. No
> schema change.
>
> **MEH-2544 — a group buy carries its business's first photo.** `GroupBuyOut`
> gains read-only `producer_image_url` (`producers.images[0]`, or `null`). The
> public list card, the group page hero and its og:image use it; a group buy
> has no photo of its own. No schema change.
>
> **MEH-1164 sub-chunk B — structured 403 detail.** The unverified-email 403
> `detail` is now an **object** `{"code": "email_unverified", "message": "יש
> לאמת את כתובת המייל תחילה"}` (all four gated creates — the three above plus
> `POST /experiences`). `code` is the stable, locale-neutral field the frontend
> matches on (`lib/errors.js:isUnverifiedEmailError`) to render the inline
> resend-verification CTA; `message` keeps the original Hebrew constant for
> transition safety. The role-first 403 (`"Producer access required"`) stays a
> plain string. Additive — no schema change.

> **MEH-3254 (grill retro D7, 2026-11-14):** `GroupBuyOut.units_total: int | null` — the sum of `group_buy_commits.quantity`. Filled **only** on `GET /producers/me/group-buys` (the owner's own list), `null` on every public reader. A count, never a roster (MEH-1651). No schema change.

> **MEH-3289 — joining continues after the minimum (2026-11-15):** `POST /group-buys/{id}/commit` accepts status `open` **or** `funded` (was `open` only), still refused past the deadline (400) and at `max_participants` (400 «קבוצת הרכישה מלאה»). A join into a `funded` group leaves it `funded` and emails **only the joiner** the funded email (`send_funded_notifications(..., late_joiner=True)`: no business email, no re-send to earlier participants). Before this, `max_participants` could never be reached, because the first commit at the minimum closed joining. `DELETE /group-buys/{id}/commit` already allowed `funded`. No schema change.

> **MEH-3591 — the joiner hears back (2026-11-21):** a `POST /group-buys/{id}/commit` that leaves the group below `min_participants` emails the joiner «מהמקור — ההצטרפות לקבוצה "{title}"»: her quantity, «N מתוך min», the deadline as an Israel date and the group link. Counts only, no contact details (MEH-1651). A join that funds the group, or joins a funded one, gets the funded email instead, never both. No schema change.

> **MEH-3311 — a funded group buy that drops below its goal (2026-11-15).** Migration `a7d3e9c1b5f2` adds two nullable naive-UTC columns to `group_buys`: `below_goal_notified_at`, `refunded_notified_at`. When `DELETE /group-buys/{id}/commit` reverts `funded → open` on a group whose funded email went out (`funded_notified_at` set), everyone who stayed gets one email «מהמקור — הקבוצה "{title}" ירדה מתחת ליעד» and `below_goal_notified_at` is stamped. When a later join re-crosses the minimum, every participant gets the funded email again (not the business) and `refunded_notified_at` is stamped. Each stamp is set once, so a flapping group mails a participant at most three times in all; `funded_notified_at` stays one-way (MEH-1651). The account-deletion revert (`group_buy_delist.withdraw_user_commits`) sends nothing. Service: `app/services/group_buy_goal_flap.py`.

> **MEH-3592 — caps, a stop switch, quantity edits, the last 24 hours and a waitlist (2026-11-21).** Migration `2189efe602b9` (Expand-only, Sapir approved 21/11) adds `group_buys.max_units` (int, null = no cap in units), `group_buys.joins_closed_at` (naive UTC, null = joins open) and the table `group_buy_waitlist` (`group_buy_id`, `user_id`, `quantity`, `offered_at`, `created_at`; unique per group buy + user; cascades with both). `GroupBuyOut` adds `max_units`, `joins_closed: bool`, `units_left: int | null` (null without a cap); `GroupBuyDetail` adds `user_waitlisted: bool`; `GroupBuyCreate` accepts `max_units`. Logic: `app/services/group_buy_capacity.py`; routes: `app/routers/group_buy_capacity.py`.
> - `POST /group-buys/{id}/commit` also refuses (400) when the business stopped joins («בית העסק עצר את ההצטרפות לקבוצה הזאת») or the quantity passes `max_units` («נשארו רק N יחידות…» / «קבוצת הרכישה מלאה»); a join removes her waitlist row; a join into a `funded` group also emails the business a count and a unit total (no names, MEH-1651 privacy contract).
> - `DELETE /group-buys/{id}/commit` — in the last 24 h before the deadline, a leave that would take a `funded` group below `min_participants` is 400 «ב-24 השעות האחרונות אי אפשר לבטל אם הקבוצה תרד מתחת ליעד» (Kickstarter's rule). A leave offers the freed place to the waitlist.
> - `PATCH /group-buys/{id}/commit` `{quantity: 1–100}` — her quantity, until the deadline, within `max_units`; a smaller quantity offers the freed units to the waitlist. 20/min.
> - `POST /group-buys/{id}/waitlist` `{quantity}` — only when the group is full (people or units); 409 when there is room or the list holds 50. `DELETE /group-buys/{id}/waitlist` — leave it (404 when not on it). 20/min. A freed place emails the first row not yet offered whose quantity fits; the place is not held; each row is offered once (same rule as the events waitlist, MEH-3314).
> - `PATCH /group-buys/{id}/settings` `{max_participants?, max_units?, joins_open?, pickup_starts_at?, pickup_ends_at?}` — the owning business or an admin (403 otherwise); a field left out is unchanged, an explicit null clears a cap; a cap below what already joined is 400; raising a cap or reopening offers the waitlist. 30/min.
>
> **MEH-3597 — the pickup window (2026-11-21).** Migration `40e9fd2c1b3a` (Expand-only, Sapir approved 21/11, decision card) adds `group_buys.pickup_starts_at` and `group_buys.pickup_ends_at` (naive UTC, both null = no window; the free-text `pickup_note` stays). `GroupBuyOut` returns both; `GroupBuyCreate` and `PATCH /group-buys/{id}/settings` accept them, both or neither (422 «יש למלא גם את תחילת האיסוף וגם את סופו»), the end after the start, at most 7 days long, and not starting before the group's `deadline` (422 on create, 400 in settings, «האיסוף צריך להתחיל אחרי המועד האחרון להצטרפות»). Settings change it from «הגדרות הצטרפות» on the owner's card while the group is open/funded, also after the deadline when only the two pickup fields are sent (everything else in settings still needs a running group). A real change on a group with participants emails each of them (`send_pickup_changed`: «קבע» / «שינה» / «הסיר»); an unchanged save, a cap-only save, and a delivery-only group mail nobody. Members get «הוספה ליומן» (an .ics built in the browser, `lib/event-ics.js`). The «reached its goal» email to participants carries the pickup time and the pickup / delivery notes (`app/services/group_buy_pickup_text.py`). A delivery-only group (a delivery note and no pickup note) shows no pickup time even if one was saved, on the page, the card and in the emails (`is_delivery_only`). The card and the page print them in Israel time (`frontend/lib/group-buy-pickup.js`).

> **MEH-3609 — «הקבוצות שלי» (2026-11-21).** `GET /users/me/group-buys` (signed in, 60/min, `Cache-Control: private, no-store`, `routers/group_buy_mine.py`) → `{group_buys:[{id, title, producer_name, status, quantity, unit, deadline, pickup_starts_at, pickup_ends_at, joined_at}]}`: the caller's own commits only, at most 50, running groups (`funded`, or `open` before its deadline) first by nearest deadline, then the rest by newest deadline. A delivery-only group returns null pickup times (MEH-3597's rule, `is_delivery_only`). A group whose business is no longer public is left out, because its page answers her 404 (`_public_group_buys`, MEH-2484). No schema change.

> **MEH-3610 — group buys get what bags have (2026-11-21).** Migration `7c3e5a9b1d2f` (Expand-only, Sapir approved 21/11, decision card «כן, שתיהן») adds three nullable `group_buys` columns: `allergens` (text[]; null = not declared, the same codes and rule as `rescue_typical_items.allergens`), `pickup_location_id` (uuid FK → `producer_locations.id`, ON DELETE SET NULL, indexed: the branch to pick up from) and `pickup_reminder_sent_at` (naive UTC; set once). `GroupBuyOut` adds `allergens` and `pickup_location {id, label, city, address, lat, lng}` (address and coordinates null when the branch is approximate, `services/group_buy_pickup_place.py`). `GroupBuyCreate` and `PATCH /group-buys/{id}/settings` accept `allergens` (max `MAX_TAG_LIST`, unknown codes 422) and `pickup_location_id` (404 «נקודת האיסוף לא נמצאה» unless the branch is the business's own); settings may change both while the group runs; a real allergen change emails everyone who joined («מהמקור — האלרגנים של "{title}" עודכנו»). A delivery-only group returns `pickup_location: null` and its emails name no branch. The «reached its goal» email names the branch. A daily job at 17:00 Israel (`services/group_buy_pickup_reminder.py`, heartbeat `group-buy-pickup-reminder-daily`) emails each participant of a `funded` group of a public business whose pickup starts before the end of tomorrow «מהמקור — תזכורת לאיסוף», once per pickup time (stamped before sending; moving the pickup time in settings clears the stamp; a delivery-only group is stamped and mails nobody; someone who joins after the reminder gets none, her join email already carries the time).

### Auth (`app/routers/auth.py`; `/auth/register/producer` and `/auth/register/producer/oauth` live in `app/routers/auth_register_producer.py` since MEH-3293)

```
POST   /auth/register            public  — consumer signup → RegisterAck {detail} (MEH-328 OWASP anti-enum; no auto-login; verify via email)
POST   /auth/register/producer   public  — producer multi-step; non-upgrade → RegisterAck {detail}; upgrade (auth) → Token + whatsapp_sent (MEH-328 Chunk B; MEH-306 sub-A out of scope). MEH-971 chunk 2: optional body field license_pending:bool=False — when true, skips the register-time license 422 so a license-required producer can submit with NULL license into the pending queue (transient input, not persisted; downstream approval guard + status gate still enforce licensed-only). MEH-3026 F11: optional prefill_token (≤128) — when it names an unexpired outreach lead, that lead's status becomes "registered" in the same commit; unknown/expired is a silent no-op (services/outreach_lead_registration.py)
POST   /auth/login               public  — email+password → JWT (no policy validation; verifies hash only per OWASP). Limits: 5/minute per IP + 10 FAILED attempts per address in 15 minutes (429, no lockout; a successful login is not counted — MEH-3372)
GET    /auth/me                  auth    — current user; producer_kind (MEH-2460) beside producer_status
POST   /auth/google              public  — Google OAuth ID token exchange; MEH-3813: a token whose `email_verified` is not exactly true → 401 «אסימון Google לא תקין» (checked in verify_google_token, so every Google consumer refuses it)
POST   /auth/google/code         public  — MEH-3690: {code} (≤2048) from our own Google button (GIS code client, popup) → {id_token}. Swaps the code at oauth2.googleapis.com/token with GOOGLE_CLIENT_SECRET (redirect_uri "postmessage"), then verify_google_token (aud = our client id) and email_verified must be True. Signs nobody in: the browser posts the id_token to the route it already used. 401 refused · 502 Google unreachable · 503 client id or secret unset; 10/minute (services/google_code_exchange.py)
POST   /auth/apple               public  — Apple Sign In ID token (App Store)
POST   /auth/me/delete           auth    — account deletion (App Store). MEH-3248: 403 for admins / super-admin (account_guards.assert_deletable); body {password} or, for an account without one, {id_token} — a Google/Apple token for THIS account, issued ≤5 min ago (either linked provider when both are; fails closed when the provider's client id is not configured); 5/hour. Replaces the bodyless DELETE /auth/me (removed) services/user_deletion.py; MEH-3252: also erases the email/phone-keyed rows (newsletter incl. Resend Contacts, contact_messages, delivery_waitlist, WhatsApp inbound/outbound incl. her business phone) and clears outreach_leads suggester fields
POST   /auth/check-password      public  — MEH-306 stateless policy preview (30/min/IP), no DB write
```

### Admin passkeys (`app/routers/admin_passkey.py`, MEH-3305)

Off where `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` are unset (local, vercel.app previews): the routes answer 404 and every sign-in works as before. On, an **admin account with ≥1 passkey** gets `PasskeyRequired {passkey_required: true, ticket, options}` from `/auth/login`, `/auth/google` and `/auth/apple` instead of a token — no session cookie is set until the second step. `ticket` = a 5-minute single-use JWT (scope `passkey_ticket`, bound to its purpose, the account and its `token_version`).

```
GET    /auth/passkey                    admin   — {enabled, passkeys[{id,name,synced,created_at,last_used_at}], recovery_codes_left, has_password}
POST   /auth/passkey/step-up/options    admin   — {ticket, options} for a device check before a change (10/min)
POST   /auth/passkey/register/options   admin   — body StepUp → {ticket, options}. Proof: a passkey (ticket+credential) or a recovery code once one exists, else the password, else (Google/Apple account) the session. 409 at 10 passkeys (10/min)
POST   /auth/passkey/register/verify    admin   — {ticket, credential, name?} → {passkey, recovery_codes, access_token} — 10 codes on the FIRST passkey only, shown once. Bumps token_version (every older session ends) and returns this device's new session: access_token + refresh and fingerprint cookies (10/min)
POST   /auth/passkey/{id}/delete        admin   — body StepUp → 204. Own passkeys only (another admin's = 404). The last one takes the recovery codes with it (10/min)
POST   /auth/passkey/recovery-codes     admin   — body StepUp → {recovery_codes}: replaces all 10 (5/min)
POST   /auth/passkey/login/verify       public  — {ticket, credential} → Token + the same cookies as /auth/login (10/min)
POST   /auth/passkey/login/recovery     public  — {ticket, code} → Token; a code works once; wrong codes count toward the MEH-3372 per-address failure ceiling (5/min)
POST   /auth/forgot-password     public  — MEH-306: 10/15min IP + 5/15min email
POST   /auth/reset-password      public  — MEH-306: 10/15min IP, full policy + reuse check, stamps password_changed_at; MEH-3591: emails «הסיסמה בחשבון שונתה» to the account
PATCH  /users/me/password        auth    — MEH-306: full policy + reuse, stamps password_changed_at, returns 204; MEH-3591: emails «הסיסמה בחשבון שונתה» to the account
PATCH  /users/me                 auth    — MEH-3095: a changed email resets email_verified, issues a new verify token and mails the link to the NEW address; a Google/Apple account cannot change its email (400 EMAIL_CHANGE_UNSUPPORTED); a lost race on the unique index is 409; MEH-3104: a real email change needs `current_password` (403 «הסיסמה הנוכחית שגויה»), clears any pending reset token, and the SUPER_ADMIN_EMAIL account cannot change its email (400 EMAIL_CHANGE_UNSUPPORTED); MEH-3425: 5 wrong passwords an hour per account → 429, an account with no password → its own 403, and a real change bumps `token_version` (other devices signed out; this one gets fresh cookies); after the commit the OLD address gets a notice that the address changed (no name in the greeting; new address shown as `n***@d***.tld`; link to /contact)
```

### Owner-claim link (`app/routers/producer_claim.py`) — MEH-2322 (MEH-2321 chunk A)

An admin prepares an ownerless DRAFT (`POST /admin/producers` with `as_draft: true`) and sends its owner a signed link. She signs in with her OWN account and takes it over. No password is created or sent by Mehamakor.

The page she lands on (MEH-2324) is `frontend/app/[locale]/claim/`. On first load it moves the token into the tab's sessionStorage (`lib/claim-token.js`) and replaces the address with `/claim`, so login/register redirects and analytics never carry it; Sentry and Speed Insights scrub `/claim/<x>`, and Clarity does not load there. The bare link has dots (a JWT), so `middleware.js` lists `/claim/:path*` in its matcher. Without that entry the catch-all skips it and the link 404s.

```
POST   /admin/producers/{id}/claim-link   admin  — 30/hour. Draft-only (409 otherwise), no owner yet (409 «העמוד הזה כבר שויך לחשבון.»), 404 if missing.
                                                     → {url: {frontend_url}/c/<code>, expires_at}. MEH-3896: a 12-character random code, a share_links row
                                                     (scope "producer_claim", 14 days, sha256 stored, services/share_links.py). Before MEH-3896 the link was
                                                     /claim/<HS256 JWT {producer_id, scope:"producer_claim"}>; every read route below still accepts that JWT until its exp.
POST   /producer-claim/preview {token}     public — 30/min. Token in the BODY, never a query string (it is a 14-day bearer credential; a URL reaches access logs + Sentry). → {name, city, short_description, image, category_names} ONLY (no phone/email/address/license; category names drive the grower declaration, as in registration).
                                                     Any unusable link (bad signature, expired, wrong scope, deleted draft) → the same 404; claimed or not a draft → 409.
POST   /producer-claim/new-link-request {token}  public — 5/hour (MEH-3122). For a link that is no longer active: accepts a correctly signed claim token up to 90 days past `exp` (`decode_lapsed_producer_claim_token`), and for a draft that can still be claimed tells the admin (email + WhatsApp, one notice per draft per day) so she can send a new link. Mints nothing, sends nothing to the owner. → always `{ok: true}`, whatever the token (no probing).
POST   /producer-claim                     auth   — 10/hour. Body {token, declaration_accepted, terms_accepted}. Refuses admin (403) and a user who already has a business (409);
                                                     both boxes required (422). Locks the producer row FOR UPDATE, re-checks draft + ownerless (409), then sets
                                                     user.producer_id / role="producer" / is_producer, stamps producers.declared_at + declaration_version and
                                                     users.terms_accepted_at + terms_version. Status STAYS "draft" — she completes the page and submits via
                                                     POST /producers/me/submit-for-review, so the manual approval gate is unchanged. Background: WhatsApp welcome,
                                                     producer welcome email, risk score (same three as a self-registered draft), and MEH-3410 the admin's «הטיוטה של … נקלטה» alert (email + WhatsApp: business, owner name + email, city; none for is_test, none on 4xx). → {producer_id, status}.
POST   /admin/producers/{id}/products      admin  — 60/hour. MEH-2326 (chunk D). ProductCreate → ProductOut, 201. ONLY while the draft is claimable
                                                     (draft + no owner, producer row locked FOR UPDATE); otherwise 409. No new-product alert (a draft is not public). The six diet flags (is_*) are DROPPED — they are the owner's self-declaration, set from her dashboard after the claim (Sapir, 26/10).
DELETE /admin/producers/{id}/products/{product_id}  admin — 60/hour. Same 409 rule; a product of another business → 404. Image destroyed after commit. 204.
POST   /admin/producers/{draft_id}/merge-owner  admin — 30/hour. MEH-3865. Body {target_producer_id}: a business its owner registered herself (draft or pending, exactly one
                                                     owner). The admin list offers the pairs `services/draft_twins.py` matched; the route itself does not re-run the match (an admin
                                                     action). Every refusal before any write (409, Hebrew): not an ownerless draft · target approved/rejected/inactive · different kind
                                                     or is_test · no owner · two owners · open orders · > MAX_PRODUCTS after the merge · same row. Both producers locked in id order.
                                                     What survives, column by column and child table by child table: `services/draft_merge_policy.py` (her name, contacts, images,
                                                     declarations and history win; the admin's prose stays; her delivery / pickup setup replaces the draft's whole). Her row is
                                                     deleted through admin_delete_producer in the same transaction. Pending stays pending only if the merged page passes submission_missing_items.
                                                     Background: the owner's email (send_owner_draft_merged). → {producer_id, status, products_moved}.
                                                     Once she owns the page the products are hers, edited from /producers/me/products only.
```

### Draft preview link + publish with recorded consent (`app/routers/producer_draft_preview.py`) — MEH-3377

For a business that has not registered: an admin builds its page as an ownerless DRAFT, shows it to the business before anything is public, and publishes it once the business has agreed in writing. The preview token is read-only and is a different scope from the claim token, so a forwarded preview link cannot take the page over, and a claim link cannot be used to read it here.

The public page is `frontend/app/[locale]/draft-preview/[token]/` (noindex, `referrer: no-referrer`, `force-dynamic`). It renders the regular business page under `PreviewModeProvider` with a banner that says the page is not on the site yet. `middleware.js` lists `/draft-preview/:path*` because the token has dots.

```
POST   /admin/producers/{id}/preview-link          admin  — 30/hour. Ownerless draft only (409 «אפשר רק לטיוטה שעוד אין לה בעלים»), 404 if missing.
                                                     → {url: {frontend_url}/v/<code>, expires_at}. MEH-3896: a 12-character random code, a share_links row
                                                     (scope "draft_preview", 14 days, sha256 stored). The old /draft-preview/<HS256 JWT scope:"producer_draft_preview">
                                                     links still open until their exp. Either kind stops working the moment the draft is claimed, published, rejected or deleted.
GET    /producer-preview/{token}                   public — 60/min. {token} = a short code or an old JWT. → ProducerDetailOut of the draft, hydrated like GET /producers/{id}.
                                                     Unknown or bad code, bad signature, expired, wrong scope, no longer an ownerless draft → the same 404 «הקישור לא תקף או שפג תוקפו».
POST   /admin/producers/{id}/publish-with-consent  admin  — 30/hour. Body {consent_confirmed: true, consent_note (1–500, non-blank), consent_screenshot_url? (https res.cloudinary.com image URL, else 422)}. Optional ?slug= and the 422 slug_required gate, as on approve (MEH-3914).
                                                     Ownerless draft only (409). Row FOR UPDATE. Runs the same gates as an approval (`_assert_approvable`:
                                                     photo; a missing licence is logged, not blocked, and the business gets no verified badge — MEH-3026), with the
                                                     phone-verified gate overridden — there is no owner to verify it yet. Sets status "approved", stores the
                                                     note in producers.owner_invite_consent_note and the optional screenshot URL in producers.consent_screenshot_url
                                                     (migration `c3e7a1f9d5b2`, VARCHAR(500) NULL, Expand-only; on ProducerAdminOut only), pings IndexNow. Sends NOTHING to the business.
                                                     → {producer_id, status, slug}. The owner gets her account afterwards through the owner invite (below).
```

`POST /admin/producers/{id}/approve` still answers 409 on a draft (MEH-2121). This route is the one exit from `draft` that skips `pending`, and it exists only for an ownerless draft with a recorded consent.

### Owner invite (`app/routers/producer_owner_invite.py`) — MEH-2974

The mirror image of the owner-claim link above, and **not** a duplicate of it. There, an admin prepares a DRAFT and its owner takes it over with an account she already has. Here, the admin builds and APPROVES the whole page — after written consent from the owner — and then hands over a live page to someone who has no account at all. The link is what creates one.

That difference is what the token shape follows from: handing over a LIVE page needs a credential that can be revoked, so this one is a random secret whose **sha256** lives on the producer row (single-use, 7 days, killed by a resend, a cancel or an acceptance), where the claim token is a stateless JWT that cannot be revoked before its `exp`. Merging the two would mean giving one flow the other's token, and both directions are worse. **There is no `users` row until acceptance** — that is what keeps the onboarding sequence, the welcome mail and forgot-password from reaching an invitee who has signed nothing.

The page she lands on is `frontend/app/[locale]/owner-invite/`, built on the `/claim` token flow (MEH-2324): first load moves the token into the tab's sessionStorage (`lib/claim-token.js`, extended for this path) and replaces the address with `/owner-invite`; the page is `noindex` + `Referrer-Policy: no-referrer`; Sentry and Speed Insights scrub `/owner-invite/<x>`. No `middleware.js` entry is needed — the token is `token_urlsafe` and carries no dot, so the catch-all matcher already covers it (unlike the JWT the claim link uses). `owner-invite` IS in `lib/static-routes.json`.

```
POST   /admin/producers/{id}/owner-invite          admin — 10/hour. Body {name, consent_confirmed, consent_note, email?}. v3: the email is OPTIONAL — with none, nothing is
                                                     mailed and the admin copies the link into WhatsApp or Instagram herself.
                                                     consent_confirmed != true, or a blank/whitespace note → 422 (schema-level: a statement about the body, so it leaks nothing).
                                                     Status neither "approved" nor "inactive" → 409 · already has an owner → 409 · the email, if given, already belongs to a user → 409 (v1 does NOT link an existing account).
                                                     MEH-3246: no photo → 422 Hebrew (services/invite_gate.py), because acceptance publishes the page. MEH-3026: a missing licence number no longer blocks the invite (the page goes live without «מאומת»).
                                                     404 if missing. A second call REPLACES the invite, token and all. → {invite_url, email, name, sent_at, expires_at} — the ONE response
                                                     that carries the raw token. There is no GET that re-reads it; the DB holds only the hash.
POST   /admin/producers/{id}/owner-invite/resend   admin — 10/hour. No body: resending to a DIFFERENT address is a different consent and goes through create.
                                                     New token, previous one dead. 404 when there is no invite, 409 once accepted, 422 when the page lost its photo (MEH-3246). Same response shape.
DELETE /admin/producers/{id}/owner-invite          admin — 30/hour. Withdraws an unaccepted invite and clears the invitee's email + name with the token (PII of a
                                                     non-user, MEH-2208's תיקון 13 class). Keeps owner_invite_created_by + the consent note — the record that an invite WAS sent.
                                                     404 when there is nothing to cancel, 409 once accepted. v3: a resend and a cancel each clear the three code columns too.
POST   /admin/producers/{id}/detach-owner          admin — 10/hour (MEH-3256 D9, «ניתוק בעלים»). Body {confirm_name, expected_owner_user_id}. The owner's account stays:
                                                     role → consumer, producer_id → NULL, is_producer → false, token_version += 1 (every session retired). The business keeps
                                                     its data and status; `owner_invite_accepted_at` → NULL, so the row is invitable again. 404 no business / no owner,
                                                     409 the owner is not `expected_owner_user_id` (changed since the page loaded), 409 two accounts are linked to the business,
                                                     409 the owner hosts a live experience (`experiences.host_user_id`, active, not rejected, dated today or later or
                                                     recurring: the experience belongs to her account, not the business, so it must be cancelled or end first),
                                                     422 the typed name differs (spaces around it ignored), 403 the owner is an admin or the SUPER_ADMIN_EMAIL account. Mails the former owner (`services/owner_detach.send_owner_detached_email`). → {ok: true}.
GET    /auth/owner-invite/{token}                  public — 30/hour. → {producer_name, email, requires_farmer_declaration, will_publish, preview} and nothing else.
                                                     v3: `email` is null when the invite carries none (the page renders an empty, editable field); `will_publish` is true while the
                                                     business is hidden, which is what the submit button's copy branches on; `preview` is the same five public fields the claim
                                                     page shows (ProducerClaimPreviewOut), built HERE rather than by pointing the page at /producers/* — a hidden business must not
                                                     become reachable through a public endpoint before its owner accepts, and holding the link is the only way to see it.
                                                     Every unusable link —
                                                     never minted, mistyped, expired, accepted, replaced, cancelled — answers ONE 404 with byte-identical bodies.
                                                     ⚠ The token is in the PATH, as the card specifies, so it reaches HTTP access logs and Sentry's request context.
                                                     `producer_claim.py` made the opposite call for its weaker token (PR #3579); `admin_outreach.get_prefill` is a live
                                                     precedent the other way. Pinned as a known exposure by a test, with a POST-with-body follow-up recommended.
POST   /auth/owner-invite/email-code               public — 5/hour. v3. Body {token, email}. Records the address (lower+trim) on owner_invite_email, mints a 6-digit code
                                                     (secrets.randbelow), stores ONLY its sha256, sets a 10-minute expiry, zeroes the attempts counter and mails the code.
                                                     THE ANSWER IS BYTE-IDENTICAL whatever happens — free address, address that already has an account, failed send — because the
                                                     endpoint takes an arbitrary address from whoever holds the link, so a different answer would be an account-existence oracle.
                                                     What differs is invisible: a taken address is not mailed and no code is stored, so the acceptance it would lead to dies at the
                                                     409 it was always going to die at. An invalid link still 404s — that is a fact about the LINK, which the caller already holds.
POST   /auth/owner-invite/email-code-existing      signed in + verified email (require_verified_email) — 5/hour. MEH-3256 (grill retro D8). Body {token}.
                                                     UI: /owner-invite renders OwnerInviteExistingAccount.jsx for a signed-in reader (no address, no password field); a signed-out reader gets «כבר יש לכם חשבון» → loginHrefBackHere(), shown only once the token has left the address bar.
                                                     Mails a code to the SIGNED-IN account's own address (no address input, so no oracle), records it on owner_invite_email.
                                                     403 for an admin / super-admin account, 409 for an account that already has a business (producer_id or is_producer)
                                                     or any role other than consumer (allow-list).
POST   /auth/owner-invite/accept-existing          signed in + verified email — 10/15 min. MEH-3256. Body {token, code? | google_id_token?, terms_accepted, declaration_accepted, farmer_declaration_accepted?}. MEH-3675: `google_id_token` (a Google ID token minted ≤ 5 min ago, `email_verified`, `sub` = the account's linked `google_id`) replaces `code`; any failure, or neither field, → the same 422 «צריך לבקש קוד». A grower-category page needs the grower line (MEH-3137) exactly as on /accept: 422 before the code is spent.
                                                     Same refusals, then the code (422, one attempt), (the attempts UPDATE takes the PRODUCER row lock), then the user
                                                     row is locked FOR UPDATE — lock order producer, then user — and re-read: the refusals again, plus blocked (403),
                                                     unverified (403) and a token_version changed since auth (401), then _has_owner (409), then the SAME conditional UPDATE as /accept (`_claim_invite`, one owner).
                                                     The account becomes the owner (role="producer", producer_id, is_producer, terms stamp), token_version += 1 so every
                                                     older (consumer) session dies, and a fresh session is issued like login. No users row is created, no password touched.
POST   /auth/owner-invite/accept                   public — 10/15 min. Body {token, email, code, password, terms_accepted, declaration_accepted}; both consents required (422),
                                                     full password policy (422). v3: the address must equal owner_invite_email and the code must verify against
                                                     owner_invite_code_hash (compare_digest) inside its 10-minute window and under 5 attempts. A wrong code or a mismatched
                                                     address → 422 and the attempts counter +1, which is the ONLY write a failed accept makes; at the cap the code is dead even
                                                     for the correct value and a new one must be requested. One transaction: a CONDITIONAL UPDATE claims the token (MEH-1820 — the affected-row count IS
                                                     the lock, so two in-flight accepts yield exactly one user), clears the hash, stamps producers.declared_at +
                                                     declaration_version + owner_invite_accepted_at, and INSERTs the user (role="producer", producer_id, is_producer,
                                                     email_verified=true, password_changed_at, terms_accepted_at + terms_version). The email being taken in between is
                                                     caught by the unique index and rolls the claim back with it → 409, zero writes, link still live.
                                                     v3, in the same UPDATE: the three code columns are cleared, and a hidden page is set to "approved" — the publish.
                                                     MEH-3268: a hidden page that lost its photo after the invite went out (MEH-3026: the licence is no longer a gap)
                                                     (services/invite_gate.py content_gaps) is HELD — the owner is linked, status stays "inactive", no 422 (she cannot
                                                     fix it from this page). An already-approved page gets no status write. IndexNow is pinged only when the page was
                                                     published. After the commit the admin is notified
                                                     (notify_admin_owner_invite_accepted — email only since MEH-3589, no new env var), with `published`
                                                     distinguishing the outcomes and `missing` naming what a held page lacks.
                                                     Issues the same access token + refresh/fingerprint cookies as /auth/login. Background: the EXISTING
                                                     business-approved email (the two builders in services/admin_producer_emails.py, by import) — no welcome mail, no WhatsApp template;
                                                     not sent for a held page (that email says the page is visible). /accept-existing follows the same rule.
```
### Order staff (`app/routers/producer_staff.py`) — MEH-3526

Table `producer_staff` (migration `c6e8a0b2d4f5`, expand-only, a new table: `EXPECTED_TABLES` +1): `id` · `producer_id` (FK CASCADE) · `user_id` (FK CASCADE, NULL until accepted) · `invited_email` · `role` (`'orders'`, CHECK) · `token_hash` (sha256 hex, NULL after accept) · `expires_at` (7 days) · `invited_by` (FK SET NULL) · `status` (`pending · active · revoked`, CHECK) · `created_at` · `accepted_at` · `revoked_at`. One active membership per user (partial unique on `user_id WHERE status='active'`); one live row per (business, lower(email)). Cap 5 per business in `limits.py` (`staff`), pending invites included until they expire. The permission is read from this table on every request (`services/order_access.py` `require_order_access`), never from the JWT; it applies to the eight routes of `product_order_business.py` that list and move orders, and to nothing else. Staff see open orders and those closed in the last 7 days. `/auth/me` carries `staff_of: {producer_id, name} | null`. A pending invite the owner withdraws is deleted; removing an active member, the member leaving, or the account becoming a business owner (claim, owner invite, business registration: `services/staff_membership.py`) marks the row `revoked`.

```
GET    /producers/me/staff                       owner — the list + max_staff
POST   /producers/me/staff                       owner — 10/hour. {email}. Same answer whether the address has an account or not; 409 Hebrew at the cap,
                                                 for the owner's own address, or an address already on the team. An expired invite is minted again.
DELETE /producers/me/staff/{id}                  owner — revokes (pending or active). 404 for another business's row.
POST   /staff-invites/accept                     signed in, verified email equal to the invited one — 10/hour. {token}. One conditional UPDATE, rowcount
                                                 checked; 409 for an owner, staff elsewhere, or a business with no owner. Answers {producer_id, name}.
DELETE /users/me/staff-membership                the staff member leaves.
```

The invite page is `frontend/app/[locale]/staff-invite/`, on the `/claim` token flow: first load moves the token into the tab's sessionStorage and replaces the address with `/staff-invite`; `noindex`, `no-referrer`; Sentry, Speed Insights and Clarity scrub or skip `/staff-invite/<x>`.

### Producers (`app/routers/producers.py`, `producer_me.py` + `producer_me_analytics.py`, `producer_me_review.py`, `producer_me_locations.py`)

```
GET    /producers                                 public — filters: lat+lng+radius_km, require_physical, category, delivery_city,
                                               has_delivery, verified, kosher, city (producer city), availability_state, grass_fed,
                                               near_city (MEH-2602 — the map's city filter: own city OR a location row in it OR
                                               delivers there; located ones ordered first, non-geo mode only)
                                               MEH-3219 (B17): lat/lng are rounded to 2 decimals (~1 km) on entry, here and in
                                               GET /rescue/offers, before any distance math; the client rounds before storing too
                                               sort: newest (default) | rating (MEH-1483). "newest"/absent → created_at DESC
                                               (byte-identical default). "rating" → unreviewed (NULL avg or reviews_count<1) LAST, then
                                               MEH-2617 Bayesian score (avg*n + 4.0*5)/(n + 5) DESC, tiebreak
                                               reviews_count DESC, then created_at DESC. Any other value → 422 "ערך מיון לא חוקי".
                                               Non-geo only (geo results always order by distance). Drives the /producers sort select.
                                               MEH-1829: sort=distance (needs lat+lng, NO radius_km) → ORDER BY the MEH-1402
                                               nearest-location Haversine ASC, NULL-coords rows LAST (sorted, never hidden — no
                                               radius filter, no has_physical_location filter), tiebreak created_at DESC. Attaches
                                               distance_km per row (null for a coordinate-less producer). X-Total-Count is the same
                                               number as under any other sort with the same filters (count_q untouched).
                                               sort=distance without lat or lng → 422 "מיון לפי מרחק דורש מיקום — lat ו-lng חובה".
                                               With radius_km the request is geo mode and the sort axis is ignored, as before.
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
PUT    /admin/producers/{producer_id}/google-place-id  admin — MEH-2582: body { google_place_id: str|null }
                                               (blank/null clears; bare place_id only, a Maps URL → 422).
                                               Writes ONLY that column; skips the full admin PUT's
                                               effective-state gates (licence, delivery) on purpose — the
                                               approval row maps pending businesses that still fail them.
                                               404 for unknown id or an organizer. 30/min.
GET    /producers/me/google-profile           👤 MEH-3641: { available (server has a Places key), google_place_id }.
GET    /producers/me/google-profile/candidates 👤 MEH-3641: ?q= (≤120; empty → the business's name + city). Places
                                               Text Search, ≤ 3 { place_id, display_name, formatted_address }; [] when
                                               Google found none; 503 Hebrew with no key or a Google error. 10/hour.
PUT    /producers/me/google-profile           👤 MEH-3641: body { google_place_id: str|null } (same normalisation as
                                               the admin PUT). A link is accepted only when the Google name or phone
                                               (mobile or landline) matches the business, else 409 Hebrew; a place_id
                                               already linked to another business → 409 Hebrew; 503 when
                                               Google cannot be asked; null unlinks with no Google call. A change on an
                                               approved business sends the admin the sensitive-edit email
                                               («הפרופיל בגוגל»). Organizer → 404. 10/hour.
GET    /producers/me/google-profile/check     👤 MEH-3641: live Place Details → rows [{ field: name|phone|website,
                                               ours, google, verdict: same|different|missing }] + hours_ours /
                                               hours_google (no verdict). Website «same» = any page on her own site,
                                               or her own page here (not another business's). Nothing from Google is stored (ToS §3.2.3(b)). 404 Hebrew
                                               when not linked, 503 on no key / Google error. 10/hour.
GET    /producers/by-slug/{slug}                  public
                                               MEH-2534: miss on a slug whose business was DELETED (ownerless
                                               retired_slugs row) → 410 «בית העסק כבר לא במהמקור»; never-existed
                                               or renamed-away slug → 404. Middleware rewrites (no status — a 410 rewrite shows Vercel's
                                               own GONE page) to /[locale]/business-gone → ProducerGone, 200 + noindex.
                                               Not via [slug]: its Data Cache keeps the last 200 after a delete (MEH-2576).
                                               MEH-3336: a slug RENAMED away from a business that is still public →
                                               404 {detail: {code: "slug_moved", message, slug: <current>}}; the
                                               middleware answers the browser 301 → /<current> (locale prefix kept,
                                               query kept, only a-z0-9- slugs followed). Every old slug points at the
                                               business, so renames chain. A renamed business that is no longer
                                               public → plain 404. Slugs are minted Latin (a-z0-9-, ≤40): Instagram
                                               handle, else the name transliterated; collision → town appended
                                               (`-2` only as the last resort); a typed slug must be Latin (422
                                               `slug_not_latin`), checked only when the slug CHANGES so a legacy
                                               Hebrew slug stays editable. A name that transliterates to nothing
                                               (all-Arabic, no handle) → NULL slug, /producer/{id}.
GET    /producer-name-check?name=               public, 30/min — MEH-3086: the sign-up form's "already on the site?" hint. Returns `{matches:[{id,slug,name,city}]}` (max 3): live businesses (`is_business()`) whose name EQUALS `name` after lower-casing, dropping quote marks and collapsing spaces. Never a prefix match, never a draft/pending/rejected page, and nothing is written to `search_queries`. Names under 3 chars → empty list.
POST   /producer-identity-check            public (optional auth), 10/min + 60/h — MEH-3884: the sign-up form's "this business already has a page" warning. Body `{phone}`; a signed-in caller's own account email and phone are added server-side once verified, owners' account phones are never compared here, and an email in the body is never read (MEH-328). Compares phone(s)/email against every business in any status, owned or not (`services/business_identity.py`), test vs real kept apart. Returns `{match: null | {owner_email}}` — at most one, the owned one first, email masked (`o***@domain`), no name/id/status.
GET    /producers/random                          public — MEH-1288: one random APPROVED producer for the homepage
                                               "הפתיעו אותי" button. ORDER BY random() LIMIT 1; 404 when the catalog is
                                               empty (button is render-gated client-side on statsProducersCount > 0).
                                               Declared BEFORE /producers/{producer_id} (route-order guard).
                                               response_model=ProducerRandomOut → { "id": UUID, "slug": str|null }
POST   /producers                                 auth   — self-register (writes pending)
GET    /categories                                public

# Follow / unfollow endpoints removed (MEH-2370). Interest is recorded as a
# favorite (/users/me/favorites); the producer_followers table was dropped in
# MEH-2392.

# Producer-self (role=producer)
GET    /producers/me                              producer
PUT    /producers/me                              producer — MEH-3026: no licence gate (the MEH-999 gate on newly-added license-required categories and on clearing the number is gone); without a number the business stays listed, without «מאומת». MEH-3220: free plan, `images` growing past 3 → 403 Hebrew (services/gallery_cap.py); same/shorter list saves. MEH-3245: a changed `phone` (compared as a normalised Israeli number) resets phone_verified=false and burns open codes; the owner re-verifies from the dashboard box.
                                                  MEH-2073: notification-only admin ping when an ALREADY-APPROVED producer changes a
                                                  sensitive field — SENSITIVE_FIELDS = {phone, vegan_scope, vegetarian_scope,
                                                  gluten_free_facility, whatsapp_group (MEH-2626)} (producer_me.py; `city` left
                                                  under MEH-1938 5a and pings from the locations CRUD). Values are snapshotted before the setattr
                                                  loop and diffed post-commit, so a form resubmitting an unchanged value does NOT
                                                  ping; one BackgroundTask per PUT listing every changed field. Persistence,
                                                  status, requested_changes and the response shape are all untouched — this closes
                                                  the MEH-1508 hole where a business could pass the dietary cross-check at approval
                                                  and edit vegan_scope the next day unobserved. Fail-open at the task boundary
                                                  (_sensitive_edit_task), because the notifier's preamble sits outside its own
                                                  per-channel try blocks and a raising BackgroundTask would break the owner's 200.
                                                  MEH-3261 (D11): for an APPROVED business, a changed description / short_description /
                                                  owner_bio (compared after strip) goes through the AI check first
                                                  (services/approved_edit_moderation.py) — REJECTED → 422 «הטקסט אינו עומד בהנחיות
                                                  הקהילה שלנו. אפשר לנסח מחדש ולשמור שוב.» and nothing in the PUT is saved; fail-open
                                                  saves. One admin ping «📝 עסק מאושר עדכן תוכן» per save that changed any of those
                                                  three or the `images` set (a reorder alone does not ping), « — טקסט סומן ע״י AI» when FLAGGED.
                                                  Product POST/PUT of an approved business get the same check on name/description/
                                                  ingredients (422 on REJECTED; ping only when FLAGGED). AI call: 10 s timeout, 1 retry.
POST   /users/me/verify-phone                    auth      — MEH-3302 (D14): send a WhatsApp code to the user's OWN phone (3/10min burst; 3 per user and 3 per canonical phone per rolling day across accounts → 429; after the 3-per-day caps, a number whose latest inbound message is «הסר»/stop → 503 with the generic «לא הצלחנו לשלוח» text, so the route does not reveal what a number replied; no phone → 400; already verified → 200). Token in user_phone_otp_tokens, 10 min, bound to the canonical phone
POST   /users/me/verify-phone/confirm            auth      — MEH-3302: { code: 6 digits } → stamps users.phone_verified_at + whatsapp_consent_at (5/min). Wrong guess increments attempts; the 5th kills the token. PATCH /users/me with a DIFFERENT canonical number clears phone_verified_at and kills unused codes; a reformatted same number keeps it. «הסר» clears whatsapp_consent_at. fire_alerts sends WhatsApp only when both stamps are set (the whatsapp_opt_in flag is kept, so verifying resumes alerts). GET /auth/me → phone_verified (bool) + whatsapp_ready (verified AND consent; false after «הסר», and then a new code restores consent). Caps run before the opt-out check, so a capped opted-out number answers 429 like any capped one
POST   /producers/me/verify-phone                producer  — send WhatsApp OTP (3/10min); MEH-2122 B: 503 «לא הצלחנו לשלוח את הקוד בוואטסאפ כרגע…» when WhatsApp is configured and the send failed (test rows and unconfigured envs stay 200)
POST   /producers/me/verify-phone/confirm        producer  — confirm code, sets phone_verified (5/min). MEH-3245: the code must have been sent to the CURRENT number (a code for an earlier number → 400)
POST   /producers/me/kashrut-request             producer  — request a kashrut badge (10/hr)
POST   /producers/me/name-change-requests        producer  — MEH-1872 file a business-name change for re-moderation (5/hr).
                                               The public producers.name does NOT move here — only an admin approval moves it.
                                               400 if the requested name equals the current one; 409 if a PENDING request
                                               already exists (one open request per producer, so the admin never has to guess
                                               which change was wanted). `name` remains ABSENT from producer_me's
                                               _PRODUCER_WRITABLE_FIELDS — MEH-1851 removed it and this does not re-open it.
GET    /producers/me/name-change-requests        producer  — own request history, newest first (60/min)
GET    /admin/name-change-requests               admin     — the review queue; ?status=pending (default). Each row carries
                                               current_name + requested_name side by side (60/min)
PATCH  /admin/name-change-requests/{id}          admin     — {status: approved|rejected, admin_notes?}. approved writes
                                               producers.name; rejected leaves it untouched. 409 on an already-reviewed
                                               request — re-approving would move the public name from a decision already
                                               taken. No "merged" status: unlike a category, a rename has no third outcome
GET    /producers/me/review-link                 producer  — MEH-1428 chunk 1: the owner's shareable "request a review" URL → {url}. Approved only (else 403 «קישור לבקשת ביקורת זמין רק לעסק מאושר»), 30/min, no DB write. URL = {frontend_url}/p/{slug}?rt=<token> (or /producer/{id} when the business has no slug). Token = HS256 JWT {producer_id, scope:"review_invite"}, 30-day TTL, NOT single-use (auth.py create_review_invite_token); a fresh call re-mints. Presenting it as `review_token` on POST /producers/{id}/reviews satisfies the contact-click gate for THAT producer only — invalid/expired/forged/other-producer → the same 403 as no contact; the row is stamped source="invite_link" (DB + admin payload only; the public ReviewOut never exposes it).
POST   /producers/me/request-review              producer  — MEH-1236 resubmit-for-review ping: pending → notification-only (admin WhatsApp+email via notify_admin_producer_resubmit, fail-open), NO DB write, requested_changes stays admin-owned. MEH-2210: ALSO admits rejected → cap 3 (constants.MAX_PRODUCER_RESUBMISSIONS) else 409; then the MEH-2120 completeness gate (unverified phone → 422); then status=pending, resubmission_count+=1, resubmitted_at=now(), rejection_reason+code KEPT, admin ping «🔁 שליחה חוזרת #n», returns {detail,status,resubmission_count}. Every other status → 409. 3/hr
POST   /producers/me/submit-for-review           producer  — MEH-2100 draft→pending: DRAFT ONLY (else 409), 5/hr. Server-side completeness gate via services/submission_gate.submission_missing_items — image>=1 · product>=1 · category>=1 · location · phone_verified. On failure 422 with detail={code:"submit_gate_incomplete", message, params:{missing:[codes]}} (MEH-1943 shape, so detailToMessage renders `message` unchanged). On success: status="pending", submitted_for_review_at=now(tz-aware), admin ping via notify_admin_new_producer (post-commit BackgroundTask, fail-open). License is deliberately NOT gated (MEH-971 license_pending must still reach the queue); opening hours are recommended, not required.
POST   /producers/me/availability-confirm          producer  — MEH-2697 «עדיין נכון»: stamps producers.availability_confirmed_at = now (tz-aware UTC)
                                                              and changes nothing else. 20/hour. Returns { availability_confirmed_at }.
                                                              The same stamp is written by availability-state below; an ADMIN edit never
                                                              writes it. Public: ProducerListOut.availability_confirmed_at (null = never).
POST   /producers/me/availability-state            producer  — MEH-291 enum write. MEH-2758: WRITES are pause-only
                                                              body: { state: "accepting_orders"|"on_vacation", vacation_until?: ISO date }
                                                              any other value → 400 (available_today / full_this_week removed, MEH-2782)
                                                              {code:"invalid_availability_state", params:{allowed:[...]}}. Both are the only values (MEH-2782).
                                                              a refused transition → 400 {code:"invalid_availability_transition",
                                                              params:{from, to}} (MEH-1943; unreachable while every state may move to both)
                                                              vacation_until REQUIRED when state="on_vacation" (422 with "תאריך חזרה לחופשה נדרש")
                                                              the ONLY availability write endpoint — the legacy POST /availability and
                                                              /availability-status are deleted (MEH-2758). PUT /admin/producers/{id} refuses
                                                              a CHANGE into a non-writable state (422, same code); an unchanged legacy value
                                                              resubmitted by ProducerForm still saves. PUT /producers/me never writes the field
                                                              GET /producers supports ?availability_state= filter (opt-in; default listing unchanged in Phase 2)
GET    /producers/me/locations                    producer  — MEH-1421 (MEH-1388 chunk 4a): owner's producer_locations
                                                              rows (ProducerLocationOwnerOut — full, incl. address/hours/phone),
                                                              ordered primary-first then created_at
POST   /producers/me/locations                    producer  — create a location (60/hr). ProducerLocationCreate.
                                                              First location forced is_primary; is_primary=true clears others.
                                                              same-city label rule → 422 with a STRUCTURED detail (MEH-1940,
                                                              same shape as auth.py's email_unverified / MEH-1164):
                                                                {"code": "location_same_city_needs_label",
                                                                 "message": <Hebrew, transition-safety only>,
                                                                 "params": {"city", "existing_kind", "existing_label",
                                                                            "existing_count"}}
                                                              The rendered copy lives in messages/he.json + en.json under
                                                              settings.locations.errors.same_city and is keyed on `code`;
                                                              `existing_kind` is the RAW enum, translated client-side.
PUT    /producers/me/locations/{id}               producer  — update (60/hr). Cross-owner id → 403 "אין הרשאה למיקום זה"
                                                              (missing id → 404). Demoting the sole primary → 422 "חובה מיקום ראשי אחד".
                                                              same-city check only when city/label in the patch.
                                                              MEH-3342: a PRIMARY row must stay `branch` — re-kinding it to
                                                              pickup/market_stand is 422, not only promoting a non-branch
                                                              (the resting state is checked, so both ways in are covered).
                                                              An explicit `null` for `kind` or `location_precision` is 422,
                                                              not the 500 the NOT NULL column used to raise; omitting a
                                                              field still means "leave it alone".
DELETE /producers/me/locations/{id}               producer  — delete. Cross-owner → 403. Deleting the PRIMARY while other
                                                              rows remain → 422 "חובה מיקום ראשי אחד": the owner promotes
                                                              another row first. It no longer promotes the oldest survivor
                                                              automatically — that had no kind filter, so deleting the primary
                                                              could make a pickup point the business's navigation target.
                                                              Deleting the last row is allowed.
GET    /admin/producers/{producer_id}/locations   admin     — MEH-3333: the same CRUD for any business, mounted on
POST   /admin/producers/{producer_id}/locations   admin       the admin edit page (LocationsEditor basePath). Same
PUT    /admin/producers/{producer_id}/locations/{location_id}  admin  invariants, imported from producer_me_locations.py
DELETE /admin/producers/{producer_id}/locations/{location_id}  admin  (same-city label, branch-only primary — also on a
                                                              kind edit of the primary row —, single primary, city
                                                              sync). A location of ANOTHER business under the path →
                                                              404 (not 403); unknown business → 404. 120/hr on writes.
                                                              No admin "sensitive edit" ping — the actor is the admin.
GET    /admin/producers/{producer_id}/events      admin     — MEH-3873: every event of the business (past and cancelled
POST   /admin/producers/{producer_id}/events      admin       too, newest first), and create/edit on its behalf. Body =
PUT    /admin/events/{event_id}                   admin       EventCreate / EventUpdate + `owner_consent: true` (missing or
POST   /admin/producers/{producer_id}/experiences admin       false → 422, nothing saved). Same rules as the owner path:
PUT    /admin/experiences/{experience_id}         admin       the handlers call events.create_event_for / update_event_row and
                                                              experiences.submit_experience_for / update_experience_row. An
                                                              experience is hosted by the business's owner account (oldest
                                                              users row with that producer_id); no owner account → 409. An
                                                              admin-written experience goes to the same pending queue and
                                                              moderation as the owner's. The consent is recorded on the admin
                                                              audit row (`details.after.owner_consent = true`). Unknown
                                                              business / event / experience → 404. 60–120/hr.
GET    /admin/producers/{producer_id}/experiences admin     — MEH-3876: every experience hosted by an account of the
                                                              business (any status, cancelled too, newest first,
                                                              ExperienceDetailOut); none when it has no account.
GET    /admin/test-businesses                     admin     — MEH-2952 chunk 4: {producer_ids: [uuid]} of the businesses hidden as test rows
PUT    /admin/test-businesses/{producer_id}       admin       («עסק בדיקה — מוסתר מהאתר»). PUT body {hidden: bool} (extra keys 422) →
                                                              {producer_id, hidden}. Writes producers.is_test only; status untouched,
                                                              so turning it off restores the page as it was. IndexNow: hiding pings
                                                              the URL read BEFORE the flip, showing pings it after; a non-public row
                                                              (draft, pending) is never pinged; a no-op flip pings nothing. Unknown → 404.
GET    /producers/me/dashboard                    producer  — stable legacy: favorites_count + whatsapp_clicks_week + attention {unreplied_reviews, new_signups[{kind,title,count}] (7 days), funded_group_buys, pending_orders (on-site orders waiting for an answer; 0 while PRODUCT_ORDERS_ENABLED is off, MEH-3316), products (MEH-3430; -1 when the count failed), products_no_allergens (published products with neither allergens nor may_contain, MEH-3445), live_rescue_offers (MEH-3767: active rescue offers whose pickup has not ended)} (MEH-3108) + community_invite_url (27/11: the business WhatsApp community invite, only for an approved non-organizer business and only when WHATSAPP_COMMUNITY_INVITE_URL is set, else null — the dashboard «קבוצת העדכונים לבתי עסק» row)
GET    /producers/me/analytics                    producer  — feature/producer-analytics (April 2026)
                                                              profile_views / search_appearances / whatsapp_clicks
                                                              as {last_7d, last_30d, total}; follower_count +
                                                              new_followers_this_week (MEH-1364: counted from
                                                              favorites, the canonical interest record — decision A);
                                                              average_rating + total_reviews;
                                                              views_by_day (30-entry zero-filled
                                                              series); top_cities (top 5, excludes NULL city);
                                                              coverage_requests (MEH-1676: [{city, count}], top 5,
                                                              last 30 days, from producer_whatsapp_clicks rows whose
                                                              city IS NOT NULL — i.e. «לא מגיעים ל{עיר}?» clicks only);
                                                              pickup_hosts (MEH-2673: [{email, city}], this business's
                                                              delivery_waitlist rows with wants_to_host, newest first, max 50);
                                                              share_visits (MEH-3331: {last_7d, last_30d, total}, page
                                                              views with referrer='share' — links the owner shared from
                                                              the share kit — visitors per Israel day. No roll-up
                                                              column, so `total` is raw-only and shrinks once raw
                                                              page views are purged (MEH-2283 chunk C); read
                                                              last_7d / last_30d. The dashboard reads last_30d only)
GET    /producers/me/weekly-summary               producer  — { enabled, available } (MEH-3212); available = WEEKLY_OWNER_SUMMARY_ENABLED
PATCH  /producers/me/weekly-summary               producer  — { enabled } → producers.weekly_summary_opt_out = !enabled; own business only; 30/hour

# Producer detail — public (tracked, anonymous)
GET    /producers/{id}?from=search|map|...        public    — GET that also logs a producer_page_views row
                                                              (bot UAs filtered, IP SHA-256 hashed with rotating salt,
                                                              city copied from authed viewer.city when present, NULL
                                                              otherwise; referrer normalized to an allowlist)
POST   /producers/{id}/whatsapp-click             public    — anonymous, rate-limited 10/min per IP
                                                              appends a producer_whatsapp_clicks row;
                                                              frontend fires via navigator.sendBeacon.
                                                              MEH-1677: accepts an OPTIONAL JSON body
                                                              {city} — stored on the row. It MUST stay
                                                              optional: sendBeacon cannot set
                                                              Content-Type: application/json (it sends
                                                              text/plain -> 422), so a required body
                                                              would break every anonymous click. Only
                                                              the coverage CTA sends one, via
                                                              fetch(keepalive)
POST   /producers/{id}/delivery-waitlist          public    — MEH-2618 «תודיעו לי כשתגיעו ל{עיר}».
                                                              { email, city, wants_to_host? } → delivery_waitlist row.
                                                              wants_to_host (MEH-2673, default false) mails a
                                                              confirmation link (new or existing row); the flag
                                                              itself is set only by /delivery-waitlist/host-confirm.
                                                              201 {status:"added"} · 200 {status:"exists"}
                                                              (same email+city already waiting) · 422 bad
                                                              email or a city without letters (MEH-555) ·
                                                              404 unknown OR non-live business (is_business).
                                                              JWT optional (lenient): sets user_id and fills
                                                              an EMPTY users.city. Rate-limited 10/min per IP.
POST   /delivery-waitlist/host-confirm            public    — MEH-2673 { token } (signed, from the host confirmation
                                                              email) → wants_to_host = true · 200 {producer_name} ·
                                                              410 expired {detail, resent} — mails a fresh link under
                                                              the cooldown/cap, confirms nothing ·
                                                              400 bad token / entry gone · idempotent · 10/min per IP
POST   /delivery-waitlist/unsubscribe             public    — MEH-2618 { token } (signed, from the email)
                                                              → deletes the one entry. Idempotent 200;
                                                              400 on a token that does not verify.
POST   /producers/{id}/contact-click              public    — 10/min, body {method} ∈ phone | instagram | website |
                                                              email | whatsapp_group (MEH-2626: the WhatsApp updates
                                                              link — contact-card bell + delivery-checker pill) |
                                                              facebook | external_order (MEH-2999); else
                                                              422. 204 + a producer_contact_clicks row (owner/admin
                                                              clicks not logged). A row with user_id satisfies the
                                                              first-review gate (reviews.py, MEH-2204).
```

### Favorites (`app/routers/favorites.py`)

```
GET    /favorites                  auth
POST   /favorites/{producer_id}    auth
DELETE /favorites/{producer_id}    auth — MEH-3222: also deletes her FavoriteAlert row for that business (alerts need a favorite); re-favoriting starts with alerts off
```

### Home products — removed

The router (`app/routers/home_products.py`) was unmounted in MEH-1406 and deleted in MEH-3646 (MEH-796). No `/home-products` route exists; `TestHomeProductsKillSwitch` holds that every one answers 404. The three tables stay until their drop migration.

### Events (producer farm events — `app/routers/events.py`)

```
GET    /events                    public — filter: city, category, from_date, to_date; category repeats (?category=A&category=B → OR, AND with the other filters; each value checked against VALID_CATEGORIES, an unknown one matches nothing — MEH-2847); approved producers only (MEH-1161; owner sees own via ?producer_id=, admin sees all); organizer-owned events included; EventOut.owner_kind + owner_slug (MEH-2459) + owner_image_url = owner's first photo or null, the list-row fallback (MEH-2546)
GET    /events/upcoming            public — limit=N next events; approved producers only (MEH-1161)
GET    /events/mine                producer — owner's own events, ALL states incl. inactive (MEH-1405; dashboard manage list). Declared before /events/{id} so "mine" isn't a UUID path.
GET    /events/{event_id}          public — pending producer's event → 404 for strangers (MEH-1161; owner/admin bypass)
POST   /events                     producer — require_verified_producer (MEH-1164 F5): producer role + verified email — unverified → 403 "יש לאמת את כתובת המייל תחילה"; non-producer → "Producer access required" (role checked first). A pending producer's event stays hidden until the business is approved — MEH-1161 · event_date before today (Israel) → 422 «התאריך כבר עבר. יש לבחור תאריך מהיום והלאה»; PUT /events/{id} and PUT /experiences/{id} refuse moving the date into the past, an unchanged past date still saves; POST /experiences the same (MEH-3224)
PUT    /events/{event_id}          producer — owner only (cross-owner → 404)
DELETE /events/{event_id}          auth    — owner or admin (stranger → 404)
```

**MEH-2763 — «איך נרשמים?».** `EventCreate/Update.registration_method`
(`site_form` default | `whatsapp` | `phone` | `external_url`). Prerequisites →
422 `{code, message}`: whatsapp needs an Israeli **mobile** on the business
(`registration_whatsapp_needs_mobile`), phone needs a phone
(`registration_phone_needs_phone`), external_url needs `registration_url`
(`registration_external_needs_url`). On PUT they are checked only when the
edit touches the method or the URL. `EventOut` adds `registration_method`,
`registered_count` (active on-site sign-ups) and `spots_left`
(`max_participants − registered_count`, null without a cap). Same fields on
experiences, where `spots_left` also subtracts the host's own
`participants_count`, and a method change does not re-moderate.
**MEH-2768:** `EventOut.producer_phone` — the owning business's phone (the
number its public page already shows), for the event page's WhatsApp / phone
CTA and «או שאלה למארחת». Experiences already carry it as `host.producer_phone`.

### Registrations (on-site sign-ups — `app/routers/registrations.py`, MEH-2763)

```
POST   /events/{id}/registrations         public — 10/hour/IP. {name, phone, email} all required, `party_size` 1–10 (default 1, MEH-3315). 201 {status:"registered"} (no token, no PII back); on a full event `waitlist: true` → 201 {status:"waitlisted"} (MEH-3314). Plus a per-RECIPIENT ceiling shared with the experience route: 3/hour and 10/day per email address (429; MEH-3373). Every request counts, also a 404, a 409 and a silent duplicate, so three posts an hour with someone's address stop her own sign-ups for that hour (accepted cost of a limit with no account behind it). The counter is in-process: a deploy resets it. The confirmation mail carries nothing the person signing up typed (title, place and host name are the item owner's).
POST   /experiences/{id}/registrations    public — same. Item must be public + upcoming (not started: a start time today that has passed on the Israel clock closes it, MEH-3288; a recurring experience is not closed by its first date) + active + registration_method=site_form, else 404 (not public) / 409 registration_closed. Full → 409 registration_full (row lock on the item), unless the body carries `waitlist: true` → 201 {status:"waitlisted"} (MEH-3314). Same email twice → same 201, nothing stored or sent. MEH-3441: a recurring workshop with dates needs `session_date` + `session_time` (422 registration_session_required «בחרו מועד.»; a date not among its upcoming ones → 409 registration_closed). Places (the date's own owner tally + its sign-ups), the waitlist and the repeat-email check are per date, so one address may book two dates; the confirmation and the owner's email carry the date («המועד»).
GET    /events/{id}/registrations         auth — owner or admin; others 404 (MEH-1001). Rows incl. cancelled and waitlisted, oldest first.
GET    /experiences/{id}/registrations    auth — host or admin; others 404.
GET    /registrations/{token}             public — {kind, item_id, title, event_date, status} for the cancel page (status may be waitlisted; the same link leaves the waitlist). MEH-3441: for a sign-up to a listed date, `event_date` is that date.
PATCH  /registrations/{registration_id}/attendance  auth — the item's owner (event: her business; workshop: the host) or an admin, else 403; 404 unknown id; 409 unless the row is registered. Body {attendance: "attended"|"no_show"|null}. 60/minute. MEH-3315.
POST   /registrations/{token}/cancel      public — idempotent; first cancel emails the owner and, when the form would still take a sign-up (active, site_form, not started, below the cap), offers the place to the first waitlisted visitor not yet offered (MEH-3314). A waitlisted row leaves the list the same way.
```

Emails (`services/registration_emails.py`, fail-open, queued after commit):
visitor confirmation with the cancel link; owner «הרשמה חדשה» with name,
phone, email and «נשארו N מקומות»; owner «ביטול הרשמה»; visitor «תזכורת:
"…" מחר» the evening before (MEH-3312, daily job). A home experience's
address never goes in the visitor email (city only, MEH-1417).

No per-event moderation. An **approved** producer publishes and it's live;
a **pending** producer's events exist but are invisible to the public until
the business is approved (MEH-1161, audit F1). Designed for the
"יום קטיף / יום פתוח בחווה" calendar on producer pages. Category enum:
`שוק | קטיף | טעימות | אחר`.

**MEH-1657 — the axis, and why the enum is 4 and not 6.** An **Event** is
something that happens **once, on a date**; an **Experience** is a guided
activity people **sign up for** (per-person price, repeatable). `סדנה` and
`סיור` name the Experience side exactly, so they were removed from the Event
enum — offering them here is what made owners guess which surface to publish
on. `Experience.category` is a **separate** set and still carries both words,
deliberately. A row created before this change may still hold a removed value:
the enum is enforced on **write** (`events.py` `VALID_CATEGORIES`, POST + PUT),
not by a DB constraint, and no backfill was run.

**MEH-1001 (existence-leak):** a cross-owner PUT/DELETE returns **404
"האירוע לא נמצא"**, not 403 — a foreign producer can't confirm an
event id exists (matches `producer_recipes.py:203-206`). DELETE keeps
its admin-override, so an admin still deletes (→ 200).

### Experiences (community workshops — `app/routers/experiences.py`)

```
POST   /experiences/validate           public  — 30/hour, real-time Claude Haiku hint
GET    /experiences                    public  — filter: category, city. category repeats (?category=A&category=B → OR, AND with city; each value checked against EXPERIENCE_CATEGORIES, an unknown one matches nothing — MEH-2847). Only approved+upcoming+is_active (MEH-1419). Each row carries owner_image_url = the host business's first non-blank photo, or null for a host with no public business (MEH-3894; the row/card/page fallback for image_url, as events).
GET    /experiences/count              public  — {"count": N} for the SAME set GET /experiences returns (MEH-1918). Both go through _public_listing_query, so the number can never disagree with the list. Declared BEFORE /{experience_id} or the catch-all eats it. Used to data-gate the "חוויות" nav link at >= 3. 120/min, the budget of the other nav reads (the nav reads it on every page load, and CI runs from one IP).
GET    /group-buys/counts               public  — {"open": N, "funded": N, "fulfilled": N} for ?city= (MEH-3128). Same `_status_tab_query` as GET /group-buys, so a tab's count and its list agree. Declared before /{group_buy_id}. 60/min. /group-buys hides a status tab whose count is 0 (the selected one stays; a failed count shows every tab).
GET    /experiences/mine               auth    — owner's submissions, any status (incl. is_active=False)
GET    /experiences/{id}               mixed   — approved=public; non-approved=owner+admin
                                         MEH-2476: `host` = {id, name, producer_id, producer_slug, producer_name, producer_phone} — the producer_* four only when the host's business is public (approved, kind=producer), else null. Same on every experience response.
POST   /experiences                    auth    — require_verified_producer (MEH-2246: producer role first → 403 "Producer access required", then email-verified → 403 {code: email_unverified}; was require_verified_email). 10/hour. REJECTED → 400. APPROVED/FLAGGED → pending. event_date before today (Israel) → 422 «התאריך כבר עבר. יש לבחור תאריך מהיום והלאה» (MEH-3224).
PUT    /experiences/{id}               auth    — owner only (cross-owner → 404). A CONTENT edit resets to status=pending + re-runs Claude; a pure is_active toggle (cancel/reactivate, MEH-1419) does NOT re-moderate. Moving event_date before today → 422; an unchanged past date still saves (MEH-3224). MEH-3441: `sessions` [{date, time, participants_count}] on a recurring workshop — a new date in the past → 422 «בחרו תאריך עתידי.», a date twice → 422 «המועד הזה כבר ברשימה.», more than 12 upcoming → 422 «אפשר להוסיף עד 12 מועדים קדימה.»; stored dates that have passed drop off; each tally is clamped to the cap. Saving dates does not re-moderate. A removed upcoming date cancels its sign-ups and waitlist, one cancel email each. MEH-3898: `course_meetings` [{date, time}] makes it a course (one sign-up for all meetings, on POST and PUT): 2..20 meetings, a new one in the past → 422 «בחרו תאריך עתידי.», one twice → 422 «המפגש הזה כבר ברשימה.», fewer than 2 → 422 «בקורס יש לפחות 2 מפגשים.», more than 20 → 422 «אפשר להוסיף עד 20 מפגשים לקורס.», with is_recurring → 422 «קורס לא יכול להיות גם חוויה חוזרת.»; the server sets event_date/event_time to the first meeting (an event_date sent with an unchanged course is ignored), so sign-ups close when it starts; [] makes it a one-off again, null leaves it unchanged. A meeting that has started must stay in the list, unmoved → 422 «מפגש שכבר התקיים נשאר ברשימה ואי אפשר להזיז אותו.» (dropping it would move the date and reopen sign-ups); for the same reason a running course cannot become a one-off. A UTC offset on a time is dropped (wall clock). People signed up are mailed: a moved first meeting by the usual «moved» email (after_item_edit), any other change by «המפגשים של … השתנו» with the new list (booking_cancellations.notify_course_changed); one email per edit. The meetings are content (re-moderation). Reads return `course_meetings` ([] = not a course). Reads return `sessions` (upcoming: date, time, participants_count, spots_left, registered — MEH-3447: the people a removal of that date would cancel, signed up or waiting, by party size; owner / admin reads only, null for everyone else — the owner's form asks before removing such a date and locks it against an in-place move) and `spots_left: null` when there are dates.
DELETE /experiences/{id}               auth    — owner or admin (stranger → 404)
```

**MEH-1001 (existence-leak):** a cross-owner PUT/DELETE returns **404
"החוויה לא נמצאה"**, not 403 — a stranger can't confirm an experience
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

**Model:** the fast-tier Haiku, `AI_FAST_MODEL` in `app/config.py`
(`claude-haiku-5-5` since MEH-2335 — one constant shared by chat, review /
experience / recipe moderation, producer risk and the bio draft). Home products use `settings.anthropic_model`
(Opus) because their verdict triggers immediate publication with a
badge; experiences still require admin approval, so Haiku is enough.

### Admin — core (`app/routers/admin.py`, `admin_decisions.py`, `admin_extra.py`)

```
# Producer moderation
GET    /admin/producers                        admin — filter: status, search
POST   /admin/producers                        admin — create auto-approved; MEH-2322 `as_draft: true` → status "draft", no owner; MEH-3026: no licence guard on either path — for the owner-claim link; MEH-3883: a business that shares a phone (either), email, Instagram, website or Facebook with ANY existing business (any status, owned or not; owners' account phones and emails count; test businesses excluded) → 409 `{code: "DUPLICATE_BUSINESS", message, total, matches: [{id, name, status, owner_email, reasons}]}`; a transaction advisory lock serialises admin creates so two parallel ones cannot both pass (≤ 5, strongest first), nothing written; `allow_duplicate: true` creates anyway (not stored)
PUT    /admin/producers/{id}                   admin — MEH-3245: a changed `phone` resets phone_verified=false and burns open codes (services/phone_reverify.py)
                                               MEH-3475: also takes `delivery_areas` rows (city · delivery_day · min_order · delivery_fee,
                                               the owner DeliveryCard's shape, same whitelist → 422) plus order_window / payment_info.
                                               Rows win over the flat `delivery_area_cities` list; the flat list now KEEPS each
                                               remaining city's day / minimum / fee (it used to rewrite them blank)
                                               MEH-3484: also takes `delivery_zones` (same shape and 422s as PUT /producers/me); the flat
                                               list keeps each remaining city in its zone
POST   /admin/producers/{id}/toggle-status     admin — MEH-2945: inactive→approved runs the approval gates (photo, licence, verified WhatsApp) → 422; approved→inactive is never gated
DELETE /admin/producers/{id}                   admin
GET    /admin/producers/pending                admin
POST   /admin/producers/{id}/approve           admin — emails + WhatsApp. A license-required category with no producer_license_number is approved and logged, without the verified badge (MEH-3026, replacing the MEH-971 422 and its ?allow_without_license override; the param is ignored if sent). MEH-3914: a business with no slug, no Instagram handle and no Latin letter in its name answers 422 {code: "slug_required", message, suggested}; the admin confirms or edits the suggestion and sends ?slug= (Latin, normalised; a reserved or non-Latin one is 400 / 422 slug_not_latin; one another business holds is 409 {code: "slug_taken", message, suggested: the free variant}, never suffixed silently). Same gate and param on publish-with-consent
POST   /admin/producers/{id}/grant-verified    admin — MEH-762: stamp tier-1 verified_at + verification_doc_type (license|exemption|cosmetics)
POST   /admin/producers/{id}/revoke-verified   admin — MEH-762: clear verified_at + verification_doc_type (mistake correction)
GET    /admin/license-expiry-reminders         admin — MEH-2072: approved producers whose producers.license_expires_at falls in
                                               [israel_today(), +30d]. Read-only — nothing is sent, hidden or un-verified (v1 is
                                               capture + remind). Four filters, each excluding a real row: IS NOT NULL (NULL means
                                               "not captured yet", never "no expiry"), >= today (an already-lapsed licence is a
                                               different problem, not this queue), <= today+30d, status == approved. Rows carry
                                               days_remaining computed server-side, phone_masked (never the raw number) and
                                               producer_license_number; ordered soonest-first. Unlike the kashrut sibling it does
                                               NOT filter on phone — a business with no number still needs chasing. 60/minute.
GET    /admin/producers/{producer_id}          admin — MEH-2072: the FULL ProducerAdminOut for one producer. Added because the
                                               admin edit page was loading the PUBLIC serializer, so ProducerForm hydrated every
                                               admin-only field as "" and wrote the blanks back on save (measured:
                                               producer_license_number '1234567' -> '', address 'הרצל 1' -> None). Declared AFTER
                                               /producers/pending and /producers/rejection-presets — FastAPI matches in declaration
                                               order, so a {param} route placed first would swallow both literals.
GET    /admin/checklist-items                  admin — MEH-1399: the review checklist, ordered by position. ?include_inactive=true
                                               returns retired items too. Default is FALSE because the review flow is the
                                               high-traffic caller and must never offer a retired item to an admin working a
                                               business; the settings screen passes true, since editing a list you cannot fully see
                                               is not editing. 60/minute.
PUT    /admin/checklist-items                  admin — MEH-1399: replace the list — add, edit, reorder and retire in one request.
                                               Body {items: [{id?, label, hint?, active}]}. position is assigned from the ARRAY
                                               INDEX (index * 10), never from the payload. id=null creates. An item ABSENT from the
                                               payload is left alone, NOT removed — there is no delete (see the RESTRICT above). An
                                               id that does not exist is a 404, not an insert: a stale tab saving against items
                                               another admin retired is told, rather than having its old rows quietly resurrected
                                               under new ids. 30/minute.
GET    /admin/producers/{producer_id}/review-checks   admin — MEH-1399: the ticks recorded for one producer, each with
                                               label_snapshot, checked_by_name (null for a deleted admin — the row survives) and
                                               checked_at. 404s on an unknown producer rather than returning an empty list: "no
                                               ticks" and "no such business" are different facts. 60/minute.
PUT    /admin/producers/{producer_id}/review-checks   admin — MEH-1399: record the ticked SET. Body {item_ids: [...]}. Idempotent
                                               and set-semantic — ids present are ticked, ids absent have their rows deleted. Not a
                                               diff API, which would require the client to know what it previously sent, the exact
                                               assumption that breaks with two admin tabs open on one business. Writes
                                               label_snapshot at tick time; an already-ticked item is left untouched so the first
                                               attestation stands. Inactive items are still ACCEPTED (an admin may be mid-review
                                               when another retires one; rejecting her save would lose work over a race she cannot
                                               see). Both writes are set-based statements — INSERT ... ON CONFLICT DO NOTHING and
                                               one bulk DELETE ... WHERE — so a concurrent save resolves instead of 500ing on the
                                               unique constraint or raising StaleDataError on a row already gone. 60/minute.
GET    /admin/kashrut                          admin — list badge requests (?status=pending|approved|rejected|revoked)
POST   /admin/kashrut/{id}/approve             admin — body {expires_on: date} = the expiry printed on the certificate
                                               (MEH-2518; 422 unless after today and ≤ today+400d). Activates the badge in
                                               kashrut_badges[]; kashrut_expires_at = end of that day in Israel (naive UTC).
                                               With another badge still live the EARLIER date wins (one expiry per
                                               business); approving the only badge replaces it. KNOWN LIMIT (fail-closed):
                                               with no per-badge date, renewing one badge while another is live, or
                                               revoking one of two, cannot move the date LATER — the badge may drop
                                               early, never late. Per-badge expiry needs an Alembic expand (follow-up).
POST   /admin/kashrut/{id}/revoke              admin — MEH-2518: body {notes?}. 409 unless approved. Marks every approved
                                               request for that badge code "revoked", drops the code from kashrut_badges[];
                                               no badge left → kashrut_verified_at/expires_at cleared.
POST   /admin/kashrut/{id}/reject              admin — rejects request with optional notes
GET    /admin/producers/rejection-presets      admin — MEH-226: the 5 canonical rejection reasons as [{key,label}].
                                               Backend is the single owner of the Hebrew labels; the admin reject
                                               modal renders this list rather than carrying its own copy, so the
                                               label shown, the label persisted and the label emailed cannot drift.
POST   /admin/producers/{id}/reject            admin — terminal → status=rejected. Body {preset_key?, reason?}
                                               (pre-MEH-226 bare {reason} still accepted). MEH-226: PERSISTS the
                                               composed text to producers.rejection_reason in the SAME commit as
                                               the status flip — previously the reason lived only in the email
                                               body and the column stayed NULL, so a rejected owner's dashboard
                                               banner showed "נדחה" with no reason. Composition: preset label,
                                               plus " — {reason}" when free text was typed; preset_key="other"
                                               yields the free text ALONE (its label describes the input box).
                                               400 on an unknown preset_key, and on "other" with no free text —
                                               validated BEFORE any mutation, so a bad body leaves the producer
                                               pending. Email fires post-commit only. Returns
                                               {detail, id, status, rejection_reason}. MEH-2210: the
                                               preset_key is ALSO persisted to producers.rejection_reason_code
                                               (NULL for a free-text-only body); approve clears both columns.
POST   /admin/producers/{id}/request-changes   admin — MEH-1011: feedback required (empty → 400); pending-only (409 if status != pending, MEH-769 precedent; MEH-2124 dropped the second status); NON-terminal (status stays pending), sets requested_changes + changes_requested_at (tz-aware), emails producer + WhatsApp admin; cleared on approve

# Users
GET    /admin/users                            admin — search · rows carry rescue_active_no_shows + rescue_blocked (MEH-3226), group_buy_active_no_shows + group_buy_blocked (MEH-3735)
PUT    /admin/users/{id}/role                  admin. role=consumer **or role=admin** on an account with a linked business (producer_id set) → 409 (MEH-3376): an owner is never an admin, and is not demoted while the business is linked; detach the owner first.
GET    /admin/audit-log                        admin — MEH-3306. ?limit (1–200, default 50) &before=<ISO created_at> [&before_id=<uuid>]. Newest first. With both, a keyset cursor on (created_at, id), so a tie on created_at at a page edge is not skipped.
                                               { items: [{ id, actor_id, actor_email, action, target_type, target_id, details, created_at }] }. actor_email is None when the account is gone.
                                               The stored IP is not returned.
POST   /admin/users/{id}/block                 admin  (toggle; blocking the only owner of a live business hides it → {is_blocked, business_hidden, cancelled} — MEH-2871; cancelled = customers' bookings cancelled (bags + sign-ups + group-buy participants, the business's own users excluded) — the same number GET block-impact showed, MEH-3375)
GET    /admin/users/{id}/block-impact          admin — MEH-3375, read only. { business_name, open_bookings }: the business blocking would hide (same rule as /block; null for a consumer, a co-owned business or an already-blocked user) and its open bookings — reserved bags + registered/waitlisted sign-ups + live group-buy participants, the business's own users excluded (booking_cancellations.count_open_bookings, the same filters the cancel uses).
DELETE /admin/users/{id}                       admin — hard delete + same cascade as POST /auth/me/delete, no email; 403 on admins/super-admin, 400 on self (MEH-2585)
GET    /admin/users/{id}/favorites             admin

# Content
GET    /admin/categories                       admin — rows include producer_count (query-time, MEH-1034)
POST   /admin/categories                       admin — body CategoryCreate: requires_license is required, no default (MEH-3255)
PUT    /admin/categories/{id}                  admin — 422 on a RENAME of an is_system row (MEH-1456 chunk 2b); emoji-only edits pass
DELETE /admin/categories/{id}                  admin — 422 on an is_system row, before the MEH-1297 linked-producer 409
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

### Resend delivery events (`app/routers/resend_webhook.py`) — MEH-3839

```
POST   /webhook/resend       public — Resend (Svix) signed events, 300/minute.
                             503 «קליטת האירועים כבויה» until RESEND_WEBHOOK_SECRET
                             is set (Resend retries, nothing lost); 413 over 64 KB;
                             401 «החתימה לא תקינה» on a bad or >5-minute-old
                             signature (resend.Webhooks.verify); 200 otherwise —
                             an event type we don't keep is acknowledged and
                             dropped; a retry with the same svix-id is a no-op.
```

### Admin — undelivered WhatsApp (`app/routers/admin_whatsapp.py`) — MEH-771 Chunk C

```
GET    /admin/whatsapp/failed     admin — undelivered outbound (status IN failed,
                                  window_expired, OR accepted more than a day
                                  ago with no delivery receipt — "stuck",
                                  MEH-2122 Chunk E) from the last 7 days,
                                  ordered created_at desc; list-only, no
                                  resend/retry. The admin-home count
                                  undelivered_whatsapp_7d uses the same
                                  predicate (services/whatsapp.py
                                  undelivered_predicate).
GET    /admin/whatsapp/blocked    admin — MEH-3402 follow-up: messages the
                                  outbound guard dropped outside production
                                  (status = blocked_nonprod), last 7 days,
                                  newest first, max 200. error_message holds
                                  what the message would have said (text body,
                                  or "template_name: param | param"). Never
                                  written in production, so empty there; kept
                                  out of the undelivered list and count.
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
                                                         MEH-3342: an old slug of a renamed business → 404
                                                         {detail: {code: "slug_moved", slug}} (both routes); middleware 301s
                                                         /<old>/recipes/<id> to /<new>/recipes/<id>. On the {id} route,
                                                         slug_moved only when that recipe is published+approved at the
                                                         new slug; else the plain 404 string

# Admin (require_admin)
PUT    /admin/producers/{producer_id}/product-groups          admin — MEH-3472: same body and rules as the owner's PUT /producers/me/product-groups
PUT    /admin/producers/{producer_id}/product-groups/assign   admin — MEH-3477: same body and rules as PUT /producers/me/product-groups/assign, drafts included
POST   /admin/producers/{producer_id}/product-groups/suggest  admin — MEH-3478: same as POST /producers/me/product-groups/suggest, drafts included; 30/hour
GET    /admin/producers/{producer_id}/product-groups          admin — MEH-3472: the business's groups [{id, name}]
PUT    /admin/producers/{producer_id}/products/{product_id}/price  admin — MEH-3942: {price_min, price_max, price_unit?}; null clears the price
                                                               («מחיר משתנה לפי עונה»), any business incl. approved with no owner; 120/hour
PUT    /admin/producers/{producer_id}/product-order           admin — MEH-3472: `product_ids` = every product of the business, published AND
                                                               draft, each once (else 409). The owner's route stays published-only.
                                                               One `products.position` column serves both: an owner reorder numbers
                                                               published rows 0..n-1 and moves drafts after them (n..), in their order.
PUT    /admin/producers/{producer_id}/products/{product_id}/group  admin — MEH-3472: {group_id|null}; a draft or published product of THAT
                                                               business (another business's product → 404). All four share
                                                               services/product_organize.py with the owner routes; 60/120/120 per hour.
POST   /admin/producers/{producer_id}/product-import          admin — MEH-2312: rows [{name, description, price, unit, source_image_url, group?}] (≤100) →
                                                               MEH-3472: `group` (≤200 or 422, blank = none) puts the draft in a product group of
                                                               that name — matched to an existing group by strip+casefold, else created in
                                                               first-seen order; a name the owner could not type (>40) → `invalid[]`;
                                                               existing + new groups > 20 → 409, nothing written.
                                                               DRAFT products. Each row validated through ProductCreate (name, price 1..10000);
                                                               bad rows → `invalid[]`, an existing name (draft or published, case/space-folded)
                                                               or a repeat in the batch → `skipped_duplicates[]`. The cap counts drafts (409).
GET    /admin/producers/{producer_id}/product-drafts          admin — the business's drafts (incl. source_image_url, admin-only; group_id, position — MEH-3472)
POST   /admin/producers/{producer_id}/product-drafts/approve  admin — {product_ids?} → publish those drafts, or all; filtered on producer_id
                                                               AND is_draft, so another business's ids match nothing. No "new product" alerts.
DELETE /admin/producers/{producer_id}/product-drafts/{product_id}  admin — a draft only (a published product → 404)
GET    /admin/recipes?moderation_status=…   admin     — filter or all
GET    /admin/recipes/pending               admin     — queue (oldest first)
POST   /admin/recipes/{id}/approve          admin     — sets published=true
POST   /admin/recipes/{id}/request-changes  admin     — feedback required → needs_revision
POST   /admin/recipes/{id}/reject           admin     — feedback optional → rejected
```

### Reviews (`app/routers/reviews.py`)

```
GET    /producers/{id}/reviews   public (optional auth) — MEH-3221: items carry NO `user_id`; `user_name` is already shortened by the server («שם פרטי + אות», `reviews.public_reviewer_name`); `is_mine` = the caller wrote it (False anonymous). Items do NOT carry `source` (admin-only on GET /admin/reviews via AdminReviewOut; dropped from the public payload on #3368 review — whether a reviewer was invited is moderation signal, not consumer data). MEH-1337: the page also carries `rating_counts` {"1".."5": int}, visible reviews per star over EVERY page (same visibility filter as `total`; always all five keys) — the business page draws its distribution bars from it at ≥5 reviews
POST   /producers/{id}/reviews   auth  — upsert (1 per user per producer), 20/day. Body {stars, body, review_token?}. First review needs proof of contact: a WA/contact click row from the last 90 days (older WhatsApp rows are purged and older contact rows lose `user_id`, MEH-3244) OR (MEH-1428) a valid `review_token` for THIS producer (the `rt` of GET /producers/me/review-link) — any bad/other-producer token → the same 403 «יש ליצור קשר עם בית העסק לפני כתיבת ביקורת». Response is the public ReviewOut — no `source` field (admin-only)
POST   /reviews                  auth  — upsert (1 per user per producer)
DELETE /reviews/{id}             auth  — owner or admin (stranger → 404; owner of an admin-hidden review → 404, MEH-2348)
GET    /admin/reviews            admin — all reviews incl. hidden (AdminReviewOut; carries `source`, MEH-2349 `ai_moderation_status`, MEH-2381 `edited_after_hidden_at` ISO | null, MEH-3259 `reply` / `reply_at` / `reply_ai_moderation_status`, MEH-3258 `conflict` "owner" | "competitor" | null)
                                 MEH-3258: a review whose author NOW owns the business, or owns one sharing a category (the MEH-2076 intersection), is left out of both public GETs, `total`, `rating_counts` and the stored avg_rating/reviews_count. Computed per read (services/review_conflicts.py), never stored; is_hidden untouched. Rating recomputed on claim, registration upgrade, owner/admin category save, approval, and admin delete of the author's business (each fail-open, logged). Applies to any linked account, admin included, and to a business in any status (draft counts: the conflict is the ownership, not the listing). The owner's unreplied-reviews badge (services/owner_attention.py) uses the same filter
PUT    /admin/reviews/{id}/hide  admin — is_hidden=true, edited_after_hidden_at=NULL, recompute aggregates (on a hidden row = "keep hidden", MEH-2381; optional ?seen=<the ISO value the page showed> → 409 {code: "review_changed"} when a newer edit landed)
PUT    /admin/reviews/{id}/unhide admin — is_hidden=false, edited_after_hidden_at=NULL, recompute aggregates (MEH-2348)
PUT    /admin/reviews/{id}/clear-reply admin — MEH-3259: reply, reply_at, reply_ai_moderation_status = NULL; the review itself is untouched; the business may reply again. No notification to the business (v1 gap)
```

Unknown id on hide/unhide/clear-reply → **404 `{code: "review_not_found", message: "ביקורת לא נמצאה"}`**
(MEH-2389). `/admin/reviews` reads `code` to drop a row deleted elsewhere.

**MEH-2348 (sticky hide):** only the admin endpoints write `is_hidden`, so a
hidden review is always admin-hidden. An author edit (POST upsert) keeps it
hidden, and the author cannot DELETE it (delete + repost would undo the hide).
Only `PUT /admin/reviews/{id}/unhide` brings it back.

**MEH-2381 (edited after hidden):** an author edit that changes body or stars
on a hidden row stamps `edited_after_hidden_at` (an unchanged re-save does
not). The upsert re-reads the row `FOR UPDATE` after the moderation call, so a
hide/unhide committed while Haiku answered is what it compares against.

**MEH-1001 (existence-leak):** a non-owner-non-admin DELETE returns **404
"ביקורת לא נמצאה"**, not 403 — review existence isn't leaked. Admin-override
preserved (admin → 200).

### Reports (`app/routers/reports.py`)

```
POST /producers/{id}/report                auth  — 3 OPEN reports auto-flag for admin; 409 if already reported (MEH-773); every new report emails settings.admin_email (MEH-3223)
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
POST /reports/review           🌐 public (optional auth), rate-limited 5/day/IP — MEH-3260 «דיווח על ביקורת».
                               Body {producer_slug, review_id, reason: fake|abusive|personal|irrelevant|other,
                               details?(≤1000, required for other), reporter_email?}. 404 «ביקורת לא נמצאה» unless
                               the review is a visible review of that business. Emails admin: subject
                               «מהמקור - דיווח על ביקורת: {business}», reason, «מי דיווחה: אורחת / משתמשת רשומה /
                               בעלת העסק», the review text, the review id, a link to /admin/reviews. Same IP + same
                               review within 24 h → 204, no second email; the first report wins even if the reason
                               changed (in-memory, capped at 5,000 keys). NO DB row, no
                               automatic action. 204.
```

### Marketing (`app/routers/marketing.py`)

```
GET  /stats                      public — { producers_count, categories_count, cities_count }
POST /newsletter                 public — { email } → MEH-3300 double opt-in: writes NOTHING; a new
                                 address gets a confirmation email (signed token, scope
                                 `newsletter_confirm`, exp 48 h); an address already on the list gets
                                 no email (grandfathered) and the same 201 answer (no enumeration)
                                 rate-limited 5/hour per IP + 3/hour per email
                                 + existing rows only: background mirror to Resend Contacts
                                   (MEH-2611 back-fill; never clears an opt-out)
POST /newsletter/confirm         public — { token } → inserts newsletter_subscribers (idempotent),
                                 Resend sync, welcome email on the first confirm only; 400 on a
                                 bad/expired/wrong-scope token; 20/hour. The page
                                 /newsletter/confirm POSTs only from a button click
POST /newsletter/unsubscribe     public — { token } → deletes the row
                                 + deletes the Resend contact (MEH-2611); a Broadcast-footer opt-out stays sticky
POST /weekly-summary/unsubscribe public — { token } → producers.weekly_summary_opt_out = true (MEH-3079)
                                 rate-limited 20/hour per IP; token scope `weekly_summary_unsubscribe`,
                                 sub = producer id; 400 «הקישור אינו תקין או שפג תוקפו.»; idempotent 200
POST /weekly-summary/unsubscribe/one-click?token=  public — RFC 8058 one-click target of the summary's
                                 List-Unsubscribe header (MEH-3212); same token and effect as above, 300/hour (shared mail-provider IPs).
GET  /weekly-summary/unsubscribe/one-click?token=  public — changes nothing; 303 to the /unsubscribe/weekly
                                 page with the same token (a client that opens the header URL); 60/hour
POST /page-freshness/confirm     public — { token } → producers.last_confirmed_at = now (page freshness)
                                 rate-limited 20/hour per IP; token scope `page_freshness_confirm`,
                                 sub = producer id, exp 21 days; one 404 body for every dead link
                                 (expired, other scope, garbage, business no longer live)
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
                                 CONTACT_TOPIC_LABELS in schemas/site.py.
GET  /cities                     public — canonical cities table (data.gov.il seed,
                                 MEH-1343) ∪ live producer/delivery cities; static
                                 list only as unseeded-env fallback (MEH-1349).
                                 MEH-2919: the QUERY is folded through
                                 CITY_ALIASES too, by prefix, so an everyday
                                 name reaches the official locality
                                 («גבעת עדה» → «בנימינה-גבעת עדה»); the alias
                                 pattern tolerates the data.gov hyphen spacing,
                                 and an alias-derived hit is ranked after every
                                 direct prefix match. MEH-3867: a space or dash
                                 in the query matches any separator in the row
                                 («תל-מונד» → «תל מונד»), and a city typed by its
                                 current name reaches a row stored under the old
                                 one («נוף הגליל» → «נצרת עילית»)
POST /cities/match               public, 30/min, read-only — MEH-3867.
                                 { names: [str ≤100] ≤300 } → { matched, unmatched }.
                                 matched = known localities in the chip spelling
                                 (city_key after canonical_city, against the
                                 cities table, or the static list when unseeded),
                                 pasted order, deduped; unmatched = the rest as
                                 typed (trimmed). Backs the «paste a list» of
                                 CitiesAutocomplete (components/cities-paste.js)
```

### Community business suggestions (`app/routers/business_suggestions.py` — MEH-2633)

```
POST /business-suggestions       public — { name, city, instagram|phone|website (≥1),
                                 reason?, suggester_name?, suggester_email?,
                                 wants_update?, company? } → an outreach_leads row
                                 with source="community". Nothing is published.
                                 rate-limited 5/hour per IP
                                 RESPONSE IS ALWAYS {"ok": true} — no id, no echo.
                                 A new suggestion, a duplicate and a honeypot hit
                                 are byte-identical from outside, so the endpoint
                                 cannot be used to probe whether a business is
                                 already in the outreach queue.
                                 company = honeypot: any value → 201, nothing
                                 stored, no admin ping.
                                 duplicate (lower(name), lower(city)) → the reason
                                 is appended to the existing lead's notes
                                 ("המלצה נוספת: …"); the first suggester is kept,
                                 except where the slot is empty (an admin-typed
                                 lead), which is filled so the person can still be
                                 thanked. `source` is never rewritten.
                                 MEH-2642: a typed suggester_email is accepted
                                 but IGNORED. The stored address is the signed-in
                                 account's, only if email_verified and only with
                                 wants_update; otherwise no address and
                                 wants_update=false.
```

`outreach_leads` gains five columns (revision `d7a511246b14`, no new table):
`suggested_by_name` VARCHAR(100) NULL · `suggested_by_email` VARCHAR(254) NULL ·
`suggester_wants_update` BOOLEAN NOT NULL DEFAULT false ·
`suggestion_reason` TEXT NULL · `suggester_thanked_at` TIMESTAMP NULL.
**`suggested_by_email` is admin-only** — the single reader is `OutreachLeadOut`,
behind `require_admin`; no public endpoint returns it and it is never logged
unmasked (`services/email.py:47` `_mask`). Retention is MEH-2638.
MEH-2642 data revision `e4b8d2f6a913` (no schema change) clears
`suggested_by_email` and sets `suggester_wants_update=false` on `community`
rows unless the address belongs to a user with a verified email AND the
update was asked for: those addresses were typed before the opt-in and proof
existed. Ships with #4498. The name is kept; only the row count is logged.
Residual: a stranger who typed a verified member's address with the tick is
indistinguishable (no `user_id`) and kept. Downgrade is a no-op; the
pre-release DB backup is the way back.

```
GET  /admin/outreach?source=     admin — new optional filter, exact, validated
                                 against {manual, community} (400 otherwise).
                                 COALESCEs a NULL source to "manual".
POST /admin/outreach/{id}/thank-suggester
                                 admin — emails the suggester that the business
                                 joined; stamps suggester_thanked_at, which is the
                                 idempotency key. Five distinct 409s: no
                                 suggester email · no opt-in · the address is
                                 not a verified account's (MEH-2642, so rows
                                 typed before it get no mail) · already
                                 thanked · status != "registered".
GET  /admin/outreach/metrics/summary
                                 admin — gains "community" (a SOURCE count, not a
                                 status); still ONE grouped SELECT (MEH-2553).
```

### Search (`app/routers/search.py` — MEH-99)

```
GET  /search            public — q (max 100 chars), limit (1–20, default 8),
                                 as_typed (bool, default false — skip the keyboard-layout re-read)
                                 returns { producers, products, cities, categories, corrected_query }
                                 rate-limited 60/minute per IP
```

**What a producer hit matches on (MEH-2478).** `GET /search` matches a business on
`name` · `description` · `short_description` (the card tagline); `GET /producers?q=`
matches the same three plus `city`, category names, product names + descriptions and
delivery-area cities (`producer_listing._token_search_filter`). Both use the same
per-token ilike patterns (`hebrew_search.token_patterns`, escaped).

**Wrong keyboard layout, niqqud, final letters (MEH-3415).** The query is normalised
first (`hebrew_search.normalise`: niqqud dropped, nothing else; a trailing regular
letter also tries its final form). When the query as typed returns nothing, both
endpoints re-read it on the other SI 1452 layout (`hebrew_search.layout_alternative`:
`sca` → `דבש`, `נרקשג` → `bread`; ≥ 3 characters, no 1-character token, one script
only) and run once more. `GET /search` then sets `corrected_query` to the
word the results are for (`null` otherwise; `as_typed=true` skips the re-read — the hero
dropdown's «לחפש בכל זאת», `frontend/components/SearchCorrectionNote.jsx`); `GET /producers?q=` serves the corrected
results silently and logs the query as typed with the count served.

### Chat widget (`app/routers/chat.py`)

```
POST /chat                       public — one-shot Claude Haiku Q&A about the platform
                                 MEH-586: hybrid — an intent router (Haiku, structured output)
                                 may run ONE of four bounded read-only tools and append the JSON
                                 to the system prompt; otherwise the fixed-knowledge flow.
                                 MEH-3528: the fixed knowledge = SYSTEM_PROMPT + the business
                                 tools (built from business-features.js → app/data/
                                 chat_business_features.json, services/chat_site_knowledge.py)
                                 + the page list (app/site_pages.py). The reply names a page by
                                 its path; the widget links only listed paths (lib/site-pages.js).
                                 MEH-3481: a question that names exactly ONE public business
                                 (whole-word name ≥ 3 letters in the last 3 user turns; a name
                                 inside a longer matching one gives way) also gets that
                                 business's facts in a <business_page> block:
                                 services/chat_business_context.py facts() — store hours
                                 (primary location, then the legacy column) + open_now (Israel
                                 clock; false on vacation/paused) + next_opening (MEH-3504, computed, never left to the model), special_hours, order_window,
                                 delivery areas (MEH-3510: every day, zone, min order, fee,
                                 free_above, next_delivery computed from the order cutoff and
                                 vacation), nationwide and excluded
                                 cities, delivers_to_asked_city (false when offers_delivery is
                                 off), pickup points (kind, label, city, hours), contact method
                                 (not the contact), site ordering, payment methods, whole-kitchen
                                 dietary scope, non-draft products up to limits.MAX_PRODUCTS
                                 (MEH-3505; price unit in Hebrew + product group, MEH-3510).
                                 MEH-3510: activities (public events, workshops/experiences,
                                 open group buys, 10 each), rating {average, count} and up to
                                 20 newest public reviews with text (stars, text, business
                                 reply; no reviewer name, hidden and conflict reviews out).
                                 Lookup failure → the block is left out, the chat still answers.
                                 MEH-3489: optional body field producer_id (UUID) = the business
                                 page the chat was opened from. Read only as a public business
                                 (is_business()); a business named in the question wins; with no
                                 name, the page. Unknown / non-public id → no block, same reply.
                                 MEH-3584: no path to the business page in the facts;
                                 on_its_page (true only when producer_id is that business),
                                 and how_to_order.contact_by is the channel the page's contact
                                 button resolves to (chat_business_extras.contact_channel, the
                                 port of lib/contact-method.js getResolvedMethod) — a name, never
                                 the number or link.
POST /chat/owner                 👤 owner (require_producer) — MEH-3902, the dashboard
                                 assistant (routers/chat_owner.py). Body {messages, section,
                                 locale}: section = the dashboard path she is on, kept only
                                 when it is a screen in app/owner_sections.py (else null);
                                 locale he|en picks the answer language. The prompt lists every
                                 dashboard screen and edit card; a fenced <owner_business>
                                 block carries her status, what still blocks «שליחה לבדיקה»
                                 and where to fix it, and empty fields. Answer {reply, draft,
                                 products, action, unanswered}. Tools: fill_page_from_chat →
                                 draft (services/page_filler.read_page on HER messages only);
                                 products_from_chat → products (menu_reader.read_menu_text,
                                 her messages only; none found → action add_products);
                                 show_in_chat → action add_products | upload_photos |
                                 send_for_review (the last for a draft only); note_unanswered
                                 → unanswered = a screen key or "other", never her words.
                                 Saves nothing: the widget opens the dashboard's own card
                                 (PUT /producers/me, POST /producers/me/menu-import/publish,
                                 POST /upload/image, POST /producers/me/submit-for-review).
                                 Limits 20/min · 120/h per IP, 150/day per business, and
                                 20/day per business for a fill or a product read (each is a
                                 second, larger model call; over it → the heavy_limit line).
                                 ai_budget "fast" (+ "menu" for products) is the global ceiling;
                                 the public site chat's anonymous cap does not apply. No key →
                                 offline line.
```

The business facts are read through the app's own session, **not** the `mcp_reader`
role below: the whitelist is the `facts()` dict itself, and `tests/test_meh3481_chat_business_context.py`
fails if phone, email, contact name, address or WhatsApp group reach the prompt.

`mcp_reader` role (revision `a29c7a4a41e7`, `app/services/chat_db_tools.py`):

| | |
|---|---|
| Login | none (`NOLOGIN`; assumed via `SET LOCAL ROLE` inside a READ ONLY transaction) |
| Members | the app's login role: the schema owner, or `app_runtime` once DEPLOYMENT.md §1.3 is applied (MEH-3307 grants `mcp_reader` to it) |
| SELECT (column-level) | `producers` (id, name, city, slug, status, kind) · `categories` (id, name, slug) · `producer_categories` (producer_id, category_id) · `producer_locations` (producer_id, kind, city) · `events` (producer_id, title, event_date, event_time, city, location, category, is_active) |
| Everything else | denied — including `producers.phone/contact_email/contact_name/address/whatsapp_group`, `users`, `home_products`, `reports` and all writes |
| statement_timeout | 5000 ms, per transaction |
| Tools | `count_producers_in_city(city)` · `list_producers_by_category(category_slug, city?, limit?)` · `get_site_stats()` · `list_upcoming_events(city?, limit?)` — `LIMIT` clamped to 20 |

### Upload (`app/routers/upload.py`)

```
POST /upload/image               auth — Cloudinary direct upload with magic-byte validation
                                 (no plan cap: the free-plan 3-photo cap is a GALLERY cap, enforced on
                                 PUT /producers/me `images` → 403, services/gallery_cap.py — MEH-3220)
                                 20/hour per IP; an admin is exempt from that bucket and has her own,
                                 200/hour per admin user (MEH-3906: admin threads share one browser IP)
POST /upload/owner-photo         auth+producer — MEH-1335 owner photo; no freemium gate, square crop,
                                 folder mehamakor/owner, public_id=owner_{producer_id} overwrite=True,
                                 writes producers.owner_photo_url atomically
POST /upload/owner-photo/{producer_id}  admin — MEH-3338: the same upload for the business in the PATH
                                 (admin builds the page on the owner's behalf). Shared helper
                                 `_store_owner_photo`: same size cap, magic-byte sniff, fixed slot.
                                 Owner → 403 (she has the route above); unknown business → 404. 30/hr.
                                 `ProducerAdminCreate` also accepts `owner_bio` (sanitized, ≤300).
POST /upload/product-image/{product_id}  admin — MEH-3456: the admin uploads or replaces the photo
                                 of ANY business's product (live page or ownerless draft). Same
                                 `read_validated_image` (5MB cap + magic-byte sniff) as every upload
                                 route, stored like /upload/image (uploader's own folder, MEH-3247);
                                 writes products.image_url, destroys the old image after commit.
                                 Non-admin (owner included) → 403; unknown product → 404. 60/hr.
                                 Logged in admin_audit_log (target product). Returns {url}.
                                 Any product, an import draft included. The URL sits in the admin's
                                 folder: the owner keeps it on that product (grandfathered) but cannot
                                 reuse it on another product or her gallery (403, MEH-3247).
```

> **Destroying an old photo (MEH-3247).** Every post-commit cleanup
> (`cloudinary_utils.destroy_image` / `destroy_removed_images`) first asks
> `services/image_refs.py` whether ANY row still stores that public_id, and
> skips the destroy when one does (another business's photo, or the same photo
> still in a gallery). A failed check skips too (fail closed). The column list
> (`SCALAR_URL_SOURCES` / `ARRAY_URL_SOURCES`) is the same one the orphan sweep
> `backend/scripts/cleanup_cloudinary_orphans.py` uses.
>
> **Only your own photos (MEH-3247 part 2).** `POST /upload/image` stores into
> `mehamakor/u/<owner_key>/` and `POST /upload/kashrut-cert` into
> `mehamakor/kashrut/u/<owner_key>/` (`owner_key` = HMAC of the user id, so the
> id is not in the URL). Every non-admin write that stores an image URL
> (gallery + owner photo on PUT /producers/me, products, events, experiences,
> recipes, PATCH /users/me avatar, rescue review photo, kashrut request; also
> home products, whose router is not mounted today) calls `services/image_ownership.assert_own_new_images`: a NEW
> URL that mentions Cloudinary (host percent-decoded and Unicode-folded first)
> must be the canonical upload shape (no query, transformation segment or `..`;
> the id must equal what `extract_public_id` parses), and if its public_id is in `mehamakor/` it must be in the
> caller's own folder or her fixed avatar / owner-photo id → else **403**
> «אפשר להוסיף רק תמונה שהעליתם בעצמכם. העלו את התמונה מחדש.». URLs already
> on the row are not re-checked (old rows still save; an old flat-folder photo
> moved into a different field is refused). `tests/test_meh3247_own_uploads_only.py`
> fails on a route whose body carries an image field without the check.
> Limits: no scrub on account deletion (a non-admin write can no longer create
> a hot-link, and prod had no businesses before this); a photo from ANOTHER
> Cloudinary account outside `mehamakor/` is still accepted, and removing it
> asks our cloud to destroy that public_id (harmless: our assets all live
> under `mehamakor/`); Google sign-in avatars (`mehamakor/avatars/<uuid>`) are
> not in the caller's own set, so they re-save in place but cannot move to
> another field; photos a former owner uploaded stay
> on a business that changed owner (invite flow), by design. Never add a blind
> delete-by-folder on account deletion — `destroy_image(db=)` already skips an
> asset another row uses.

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

GET /health/places               public, 10/min — is the Google Places key answering? (MEH-2482)
                                 Makes ONE real places:autocomplete call with the server key.
                                   200 {"status":"disabled"}   GOOGLE_PLACES_API_KEY unset
                                   200 {"status":"ok"}         Google answered 2xx
                                   503 {"status":"error","http":<code|null>,"code":<Google
                                        status word, e.g. PERMISSION_DENIED | exception name>}
                                 Never the key, never Google's body. A 503 also lands in Sentry
                                 (fingerprint places-health/<code>) and in the uptime
                                 workflow (every 30 minutes; `disabled` fails there too).
                                 Cause/remedy: DEPLOYMENT.md § D-quater.

GET /health/ai                   public, 10/min — is the Anthropic client buildable and answering? (MEH-3724)
                                 Builds it like the product (make_anthropic_client), then ONE
                                 token-free call (models.list).
                                   200 {"status":"disabled"}   ANTHROPIC_API_KEY unset
                                   200 {"status":"ok"}         client built, API answered
                                   503 {"status":"error","stage":"init"|"call","code":<exception name>}
                                 A 503 also lands in Sentry (fingerprint ai-health/<stage>/<code>).

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

### Smaller routes: session, verification, category requests, alerts, admin utilities (MEH-3602)

These 22 routes were served but not named in this reference; they sat in
`scripts/checks/api-docs-baseline.txt` from the day the guard was created
(14/11/2026). Each line below was written from the handler and its schema on
21/11/2026. The complete route list, with who may call each route, is generated
from the code in [release/action-map.md](./release/action-map.md).

```
POST   /auth/refresh             public (the HttpOnly `refresh_token` cookie is the credential), 30/min.
                                 No body. 200 → Token (new access token) and a rotated refresh cookie,
                                 sliding 14 days, plus a new fingerprint cookie. 401 cookie absent /
                                 undecodable / user not found / token_version changed / password changed
                                 since the token was issued; 403 blocked user. (MEH-326)

POST   /auth/logout              public, 30/min. No body. 204, clears the refresh cookie. No auth on
                                 purpose: a holder of an expired access token must still be able to
                                 log out. Also clears the fingerprint cookie. (MEH-326)

POST   /auth/logout-all-devices  any logged-in user, 5/hour. No body. Increments token_version, so every
                                 other session gets 401 on its next request. 200 → Token for this session.

GET    /auth/verify-email?token= public, 10/min. Consumes the one-time token. 404 «קישור האימות לא תקין»
                                 unknown token; 410 «קישור האימות פג תוקף» expired (MEH-320). On success
                                 the response of `verify_email_session`, which may also sign the user in
                                 (MEH-3087).

POST   /auth/resend-verify       any logged-in user. 3/hour per IP, plus 3/hour and 10/day per account
                                 (MEH-2906, `services/resend_verify_cap.py`). No body.
                                 200 {"detail":"אימייל אימות נשלח"}, or {"detail":"האימייל כבר מאומת"}
                                 when there is nothing to send.

POST   /upload/avatar            any logged-in user, 10/hour. multipart `file`. Same size cap and
                                 magic-byte check as /upload/image; 400 px square, `avatars/` folder.
                                 Saves `users.avatar_url` itself, so no PATCH /users/me is needed.
                                 200 {"url": ...}.

POST   /producers/me/bio/generate   business, 5/hour per IP and 20/day per business.
                                 Body {sells (1-200), area?, special?, instagram?}. 200 {"bio": "<Hebrew,
                                 up to 150 chars>"}; {"bio": ""} when the AI is unavailable (fail-open).
                                 (MEH-1173)

GET    /producers/me/kashrut-requests   business, 30/min. 200 → KashrutRequestOut[], the caller's own
                                 kashrut badge requests, newest first. (MEH-1167)

GET    /users/me/favorites/{producer_id}/alerts   any logged-in user. 200 → AlertPrefsOut {enabled,
                                 notify_new_product, notify_new_event, notify_delivery_area,
                                 notify_new_recipe, notify_new_group_buy, notify_new_rescue,
                                 whatsapp_opt_in, has_push}. No alert row → 200 with everything false.

PUT    /users/me/favorites/{producer_id}/alerts   any logged-in user, 60/min. Body AlertPrefsIn: the
                                 six notify_* flags (default true), whatsapp_opt_in (default false),
                                 push_subscription? (object). 200 → AlertPrefsOut.
                                 400 «יש לשמור את בית העסק במועדפים תחילה» when the business is not in the
                                 caller's favorites; 422 «יש להזין מספר טלפון כדי להפעיל עדכונים בוואטסאפ»
                                 when whatsapp_opt_in is true and the user has no phone.

POST   /category-requests        public (a token is optional), 5/hour. Body {requested_name (1-100,
                                 3+ letters), examples? (≤300)}. A `producer_id` in the body is ignored:
                                 the business is taken from the caller's token, or left empty (MEH-386).
                                 201 → CategoryRequestOut. Pings the admin. A token that is sent but
                                 invalid gets 401; it is not treated as anonymous.

GET    /admin/category-requests  admin, 120/min. 200 → requests grouped by name (case-insensitive),
                                 most-requested first: [{requested_name, count, examples[], requests[
                                 {id, producer_id, status, admin_notes, created_at, reviewed_at}]}].

PATCH  /admin/category-requests/{request_id}   admin, 60/min. Body {status: pending|approved|rejected|
                                 merged, admin_notes?}. 200 → CategoryRequestOut; 404 «בקשה לא נמצאה».

GET    /admin/group-buys?status= admin. 200 → GroupBuyDetail[], every group buy of every business;
                                 `status` filters. Not paginated.

PATCH  /admin/outreach/{lead_id} admin. Body OutreachLeadUpdate (any of name, phone, instagram, website,
                                 city, category, notes, status). 200 → OutreachLeadOut; 404 «ליד לא נמצא»;
                                 400 «סטטוס לא תקין».

DELETE /admin/outreach/{lead_id} admin. 204; 404 «ליד לא נמצא».

POST   /admin/outreach/{lead_id}/prefill-token   admin. Creates or rotates the lead's prefill token.
                                 The token lives 30 days. 200 → OutreachLeadOut including `prefill_token`
                                 and `prefill_token_expires_at`; 404 «ליד לא נמצא».

GET    /register/producer/prefill/{token}   public (the token is the credential), 30/hour. 200 →
                                 {name, phone?, instagram?, website?, city?, category?}; the lead's
                                 notes and status are never returned. 404 «אסימון לא נמצא» unknown token;
                                 404 «תוקף האסימון פג» expired. (MEH-1724)

GET    /admin/producers/{producer_id}/google-place-candidates?q=   admin, 30/min. Up to 3 Google Place
                                 candidates, searched by the business's name + city, or by `q` (≤120)
                                 when the admin typed one (MEH-2602). 200 {"candidates": [...]}.
                                 204 when there is no server key,
                                 no result, or Google errors; 404 unknown business. Display only: the
                                 admin picks one in the business form, nothing is saved here.

POST   /admin/producers/{producer_id}/story-card   admin. Body {image_data: base64 JPEG data URI}.
                                 Uploads to Cloudinary and saves the URL on the business.
                                 200 {url, saved: true}. With no Cloudinary configured: {url: placeholder,
                                 saved: false} and nothing is saved. 400 «נתוני תמונה לא תקינים»;
                                 404 «בית עסק לא נמצא»; 500 «העלאת התמונה נכשלה».

POST   /admin/seed-cities        admin. No body. Fetches Israeli localities from data.gov.il and
                                 inserts the ones `cities` does not have yet (an existing city is not
                                 changed). Safe to run again. 200 {"seeded": <rows inserted>}.
                                 502 «לא הצלחנו להביא את רשימת היישובים מ-data.gov.il», and 502 when the
                                 records arrive without a locality-name column.

POST   /admin/kashrut/expiry-reminders?dry_run=   admin, 10/hour. `dry_run` defaults to true: the rows
                                 are returned and nothing is sent. With dry_run=false sends the WhatsApp
                                 reminder to approved businesses with an active badge, a phone, and a
                                 certificate that expires between now and 30 days from now (one that
                                 already expired is not selected; test businesses never are).
                                 200 → {dry_run, window_days, total, sent_count, failed_count, rows[]}.
                                 (MEH-1673)

GET    /push-vapid-key           public. 200 {"public_key": "<VAPID key, or empty>"} for the browser's
                                 push subscription.

GET    /holiday-mode             public, 60/min. 200 {enabled, key}, read from the admin settings
                                 `holiday_override_enabled` / `holiday_override_key`; feeds the holiday
                                 banner. (MEH-247)
```

---

## Notifications

Every email, WhatsApp message and push a user receives — its trigger, channel,
recipient and the code that sends it — is in
[NOTIFICATIONS.md](./NOTIFICATIONS.md), generated from the code (MEH-3594).
This file used to carry a hand-written table here; it had drifted (it still
named Twilio) and was removed under MEH-3604 so the fact has one home.

**«הסר» stops every WhatsApp template (MEH-3640).** `whatsapp.send_template` / `send_template_result` skip a recipient whose latest `inbound_messages` row is an opt-out word (`user_phone_verify.is_opted_out`), outcome `opted_out`, never retried. Exempt: `OtpCodeV1` (a code the person asked for) and `send_text` (only ever an in-window reply). Any later inbound message clears it.

All Resend + Twilio sends are **best-effort** — missing env vars or send
errors are logged but never raise. A broken notification must never
break the underlying flow.

Email is sent via `app/services/email.py` → Resend HTTP API (HTTPS/443).
Railway blocks SMTP ports (25/465/587); `smtplib` was removed in full.

### IndexNow — search-engine pings (MEH-2852)

`app/services/indexnow.py` POSTs changed public URLs (he + `/en`, the shapes
`frontend/app/sitemap.js` emits) to `https://api.indexnow.org/indexnow`, as a
BackgroundTask after the commit. **Production only** (`RAILWAY_ENVIRONMENT ==
"production"`); anywhere else it logs and returns. Timeout 5 s, never raises
(log + Sentry breadcrumb), ≤ 10,000 URLs per call, deduped. Key: the
`INDEXNOW_KEY` constant, served at `frontend/public/<key>.txt` (public by
design). No env var, no retry, no Google.

| Endpoint | Pings when |
|---|---|
| `POST /admin/producers` | created approved (not `as_draft`) |
| `PUT /admin/producers/{id}` | business is approved — old + new URL on a slug change |
| `POST /admin/producers/{id}/approve` | always (the page appeared) |
| `POST /admin/producers/{id}/toggle-status` | always (hidden / back on the site) |
| `POST /admin/producers/{id}/reject` | the business was approved |
| `DELETE /admin/producers/{id}` | the business was approved |
| `PUT /producers/me` | the business is approved |
| `POST /events` · `PUT /events/{id}` · `DELETE /events/{id}` | the business is approved |
| `POST /admin/experiences/{id}/approve` | the host's business is approved |
| `POST /admin/experiences/{id}/reject` · `/request-changes` | the experience was approved |
| `POST /group-buys` · `PATCH /group-buys/{id}/status` · `PATCH /admin/group-buys/{id}/status` | the business is approved |
| `POST /admin/recipes/{id}/approve` | the business is approved and has a slug |
| `POST /admin/recipes/{id}/reject` · `/request-changes` | the recipe was published |

---

## Env vars

Every env var the code reads, backend and frontend, is in
[ENVIRONMENT.md](./ENVIRONMENT.md), generated from the code (MEH-3598). The
hand-written list that was here (it still gave a 4.6-era model default) was
removed under MEH-3604 so the fact has one home. Which value is set in which
environment: [DEPLOYMENT.md](./DEPLOYMENT.md) §1.


---

## Apple App Store compliance

- `POST /auth/me/delete` (MEH-3248; was `DELETE /auth/me`) — after the password / provider re-check, deletes the user row + cascaded rows (favorites,
  home_products, home_product_ratings, producer_reviews, experiences,
  group_buy_commits — MEH-2503).
  Events hosted by the user's producer are NOT
  cascaded — they belong to the producer record.
- `POST /auth/apple` — identity token verification + user create/link.
- `apple_id` column on `users` (unique when set).
