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
| 26 | `producer_offers` | ONE owner-declared, typed, expiring offer per business — free delivery / gift / first-order / pickup discount, with an optional non-monetary threshold. At most one row ACTIVE at a time (unique partial index); superseded rows persist as history (MEH-1823) | `ProducerOffer` |

> **MEH-1388 — `producer_locations` (multi-location, 2026-07-21):** moves the map from one-pin-per-business to one-marker-per-location. Columns: `id` · `producer_id` (FK CASCADE) · `kind` (`branch`\|`pickup`\|`market_stand`, CHECK) · `label` · `city` · `address` · `lat` · `lng` · `opening_hours` · `phone` · `is_primary` · `location_precision` (`exact`\|`approximate`, CHECK) · `created_at`/`updated_at`. **Expand-Contract** (ADR-007, chunk 1 `MEH-1395`): a `primary` row is backfilled from `Producer.lat/lng/city`; the old producer columns stay as a mirror during overlap. **Serialization (chunk 2 `MEH-1402`):** `ProducerListOut.locations[]` / `ProducerDetailOut.locations[]` emit `{kind, label, city, lat, lng, is_primary, precision}` (public — street `address`/`phone`/`hours` withheld per MEH-829; the owner-facing `ProducerLocationOwnerOut` on the CRUD includes them). **Geo (chunk 2):** "near me" distance = `MIN(Haversine)` over a correlated scalar subquery on `producer_locations`, with a `COALESCE` fallback to the producer's own `lat/lng` during the Expand overlap — **removed in MEH-1938 chunk 5a (02/09): rows are the only source, `ProducerListOut.lat/lng` are derived from the `is_primary` row (or null), the owner `PUT /producers/me` ignores `city/lat/lng`, and `producers.lat/lng` carry a `LEGACY(2026-10-15)` marker ahead of the chunk-5b drop**; BOTH the list query and the count query stay `DISTINCT` on `producer.id` so a multi-location business counts as **one** result, not N (the historic `_build_base_queries` trap). A delivery-only producer that has a `pickup` location now reappears on the map (controlled reversal of the MEH-213 delivery-only filter); a zero-location delivery-only producer stays hidden. **Map (chunk 3 `MEH-1412`):** per-location markers (pickup/market_stand = a secondary outline), a pickup-layer toggle, a location-label tooltip, and a cluster badge that counts **unique businesses** (dedup by `producerId`), not markers. **Owner CRUD (chunk 4a `MEH-1421`):** `GET/POST/PUT/DELETE /producers/me/locations` (see the API section) with an IDOR ownership 403, a single-primary invariant, and a same-city-label rule. Admin sees a read-only name/city dedup badge on `/admin/producers`. No PostGIS (Haversine in raw SQL, per DEPLOYMENT.md).

> **MEH-509 PR3 (2026-05-22):** `producers.risk_score` (Integer nullable) + `producers.risk_reasoning` (Text nullable) added by migration `92afa3cb76e2`. Populated asynchronously by `app/services/producer_risk.py` via FastAPI BackgroundTasks after producer signup using Claude Haiku 4.5. NULL on both = "not scored yet OR Anthropic call failed (fail-open)". Admin-only — `ProducerAdminOut` schema surfaces them; `ProducerDetailOut` (public) intentionally does not. New endpoint: `GET /admin/producers/{id}/risk-score` returns `{score, reasoning}`.

> **MEH-759 (ADR-022 gate 2, 2026-06-06):** `producers.declared_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `a7f3e9c14d28`, Chunk A) + `producers.declaration_version` (VARCHAR(10), nullable) record the binding tier-2 licensing declaration. Chunk B stamps them in `POST /auth/register/producer` (both new-account and MEH-143 upgrade paths) when the new **required** `declaration_accepted: bool` body field is truthy — the handler 422s (`יש לאשר את הצהרת הרישוי כדי להמשיך`) when it is falsy/absent, so a producer row is only ever created with both columns set. Constant `DECLARATION_VERSION` lives in `app/constants.py`. Admin-create / Excel-import paths leave both NULL (no owner declaration). Admin-only exposure — `ProducerAdminOut` surfaces them; `ProducerDetailOut`/`ProducerListOut` (public) intentionally do not.

> **MEH-1995 (Amendment-13 consent evidence, 2026-08-09):** `users.terms_accepted_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `b8d3e7a1c604`) + `users.terms_version` (VARCHAR(10), nullable) record acceptance of the terms of service. Deliberately shaped after the `producers.declared_at` / `declaration_version` pair above — a timestamp proves *that* someone agreed, the version proves *what* they agreed to once the wording changes. Constant `TERMS_VERSION` lives in `app/constants.py`. Stamped from the new **optional** `terms_accepted: bool` body field on `UserRegister` / `ProducerRegister` when truthy, at **all three** password paths: consumer registration, producer registration, and the MEH-143 producer **upgrade** (which mutates `current_user` rather than constructing a `User` — the upgrade renders the checkbox and hard-gates submit, so its consent event is as real as the other two). Optional rather than required so the field is additive: an omitted flag leaves both columns NULL and 422s nothing. **NULL means "no record of acceptance held", never "consent refused"** — there is deliberately NO backfill (Expand-only, ADR-007), because a retroactive timestamp would assert consent at a moment we cannot evidence, manufacturing the very proof the columns exist to provide. **The three OAuth account-creation paths (`/auth/google`, `/auth/apple`, `/auth/register/producer/oauth` step-0) leave both NULL** — those buttons are not gated by the checkbox, so no consent event occurs there; closing that is a product decision, not a code gap. **Exposed nowhere** — neither `UserOut` nor `UserAdminOut` declares them (audit-only; stricter than the sibling pair, which is admin-visible).

> **MEH-762 (ADR-022 public tier contract, 2026-06-06):** `producers.verified_at` (TIMESTAMP WITH TIME ZONE, nullable, migration `f1c7b9a3e264`, Chunk 1) + `producers.verification_doc_type` (VARCHAR(20), nullable; `license`\|`exemption`\|`cosmetics`) record the tier-1 "מאומת" document review. **Chunk 2:** admin stamping via `POST /admin/producers/{id}/grant-verified` (`{doc_type}`) + `/revoke-verified`; the legacy `is_verified` column was fully retired and DROPPED in MEH-766 (writers ch3 #1420, contract ch5 #1578, column ch6 revision `d4e7a92c81b5`). **Chunk 3 public exposure:** `ProducerListOut`/`ProducerDetailOut` now carry `verification_tier` (`"verified"`\|`"declared"`\|`null` — **computed** in `_compute_verification_tier`, never stored), `verified_at` (**date granularity only** — the TIMESTAMPTZ is truncated so no time leaks), and `verification_doc_type`. Resolver (D2/D3): `verified_at` set → `"verified"`; else if no category is in `LICENSE_REQUIRED_CATEGORIES` → `"declared"`; else `null` (no badge, no negative label). Mirrors the MEH-530 name-membership predicate (`license_validation.categories_require_license`) against the loaded categories. Privacy: `verified_at`(date)/`doc_type`/`tier` are public; `declared_at`/`declaration_version`/`producer_license_number` stay admin-only (`ProducerAdminOut`, which also inherits the three public fields at date granularity).

> **MEH-1011 (2026-07-03):** producer **request-changes** (completion request) flow — the non-terminal twin of reject. Two nullable `producers` columns (migration `a1b2c3d4e5f6`): `requested_changes` (TEXT — the admin's free-text feedback) + `changes_requested_at` (TIMESTAMPTZ, tz-aware). `POST /admin/producers/{id}/request-changes` (`{feedback}`, empty → 400) records the feedback, KEEPS status `pending`, emails the producer, WhatsApps the producer (**MEH-1051** — Meta-approved `producer_changes_requested_v1`, 2 body params `{name, missing}`, fail-open post-commit), and WhatsApps admin; `approve_producer` clears both columns on success. Admin-only exposure via `ProducerAdminOut` (both fields), never public `ProducerListOut`/`ProducerDetailOut`.

> **MEH-2210 chunk A (2026-09-04):** the **rejected → resubmit** loop. Three additive `producers` columns (migration `2c1033ca5745`, expand-only, no backfill): `rejection_reason_code` (VARCHAR(40), nullable — the admin's `preset_key` from `PRODUCER_REJECTION_PRESETS`, stored beside the composed text so the owner banner can branch on it; NULL on legacy rows and free-text rejections), `resubmission_count` (INTEGER NOT NULL DEFAULT 0 — history, never reset by approve), `resubmitted_at` (TIMESTAMPTZ, nullable). `POST /producers/me/request-review` now also admits `status=rejected`: cap `constants.MAX_PRODUCER_RESUBMISSIONS` (3) → 409 «הגעתן למספר השליחות המקסימלי», otherwise the same MEH-2120 completeness gate (unverified phone → 422 `missing=["phone_verified"]` — no `pending_whatsapp`, removed in MEH-2124), then `status=pending`, `resubmission_count += 1`, `resubmitted_at=now()`, admin ping «🔁 שליחה חוזרת #n». `reject` persists the code; `approve` clears `rejection_reason` + `rejection_reason_code` (symmetric with MEH-1011's clearing) and keeps the count. Exposed on `ProducerAdminOut`, `ProducerOwnerOut` and `GET /auth/me` (`producer_rejection_reason_code`, `producer_resubmission_count`).
>
> **MEH-2072 (2026-08-21):** `producers.license_expires_at` (**DATE**, nullable, migration `c3e9a1f7b204`) records the business-licence expiry the admin reads off the document at approval. Before it, `producer_license_number` recorded *that* a licence was seen and never *until when* — so the "licensed businesses only" promise was verified on day one and never again. **DATE, not TIMESTAMPTZ, and it deliberately diverges from the sibling `kashrut_expires_at`:** a licence is valid *through a calendar day*, so a timestamp would make "expires today" answer differently either side of 00:00 UTC, which in Israel falls inside the same working day; pairing the column with `israel_today()` keeps the comparison calendar-day vs calendar-day. Expand-only, **no backfill** (ADR-007) — the date lives only on a document, so `NULL` means "not captured yet" and **never** "no expiry" (the reminder query filters `IS NOT NULL`, so a NULL row is never reminded about rather than treated as expired). Admin-only exposure via `ProducerAdminOut`, never public `ProducerListOut`/`ProducerDetailOut` (MEH-530 privacy precedent); present on `ProducerUpdate` but **withheld from `_PRODUCER_WRITABLE_FIELDS`** so only the admin PUT can write it — the `google_place_id` (MEH-1490) arrangement, and for the same reason: it is a record of what the *admin* verified, so an owner-writable version would be self-certification. Deliberately **no validator** — a past date is legitimate input when the licence has already lapsed. **No enforcement anywhere:** nothing hides or un-verifies a lapsed producer; v1 is capture + remind, and auto-hiding a live business on a typo is more dangerous than the gap. Surfaced by `GET /admin/license-expiry-reminders` and edited in the admin `ProducerForm` beside the licence number ("תוקף רישיון (מהמסמך)").
>
> **MEH-1399 (2026-08-21):** the pre-approval review checklist becomes DATA, and every tick becomes an audit record (migration `d4a9c31e6f82`, two tables). Phase 1 (MEH-1396) put `docs/VERIFICATION.md`'s knowledge in front of the admin as a frozen frontend constant with session-local ticks; that left two gaps — editing an item required a deploy, and the ticks evaporated, so nothing recorded WHAT was verified before a business went live.
>
> `admin_checklist_items` — `id` UUID PK, `position` INT NOT NULL (indexed), `label` TEXT NOT NULL, `hint` TEXT NULL, `active` BOOL NOT NULL DEFAULT true, `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now() with model-level `onupdate=func.now()`. Seeded in the migration with the same 7 items `frontend/lib/admin-review-checklist.js` already shipped, so the switch is a change of source and not of content; the constant survives only as that seed plus two copy exports. `position` is written as `index * 10` by the router (never accepted from the client — a client-supplied position lets two items claim one slot and makes the order depend on an unspecified tiebreak), spaced so a later insertion needs no renumbering. **Only `updated_at`, no `created_at`:** the question anyone asks of a config row is when it last changed; the audit surface is the other table.
>
> `producer_review_checks` — `id` UUID PK, `producer_id` UUID → `producers.id` **ON DELETE CASCADE** (indexed), `item_id` UUID → `admin_checklist_items.id` **ON DELETE RESTRICT** (indexed **in its own right** — the composite unique below leads with `producer_id`, so it cannot serve the `item_id`-only lookup Postgres runs to enforce the RESTRICT on every parent DELETE), `label_snapshot` TEXT NOT NULL, `checked_by` UUID → `users.id` **ON DELETE SET NULL**, nullable, `checked_at` TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE `(producer_id, item_id)`. **An unchecked item is the ABSENCE of a row**, not a row with a false flag — "never ticked" and "ticked then un-ticked" are deliberately indistinguishable, because the ticket asks for a record of what was verified, not a keystroke log.
>
> **The three delete behaviours are each a decision.** CASCADE on the producer: the checks describe a business, and with the business gone there is nothing left to attest about. **RESTRICT on the item: this is the ticket's "no delete — deactivate only" rule enforced in the schema rather than trusted to the router** — a DELETE against an item that has ever been ticked fails at the database, so audit history cannot be destroyed by removing its subject; `active = false` is the sanctioned retirement path, and the settings UI therefore offers «הפסקת שימוש» and no bin. SET NULL on the actor: deleting an admin account must not delete the record that a check happened; a null actor is a weaker record than a named one and a far better one than none (matches the existing `users.id SET NULL` precedent).
>
> **`label_snapshot` looks redundant next to the FK and is the opposite.** The FK says WHICH item was ticked; the snapshot says what that item SAID at the moment of ticking. It is written at TICK time, never read back at display time — without it, an admin rewording an item next month would silently rewrite the meaning of every historical attestation, and the trail would describe a check nobody performed. Same reasoning as `producer_name_change_requests.current_name`.
>
> **Ticks never gate approval.** The hard gates (photo 422 / licence 422) live in `admin.py::approve_producer` and are untouched; a tick is a record that a human looked, never a permission. **Re-ticking does not restamp** — an item already ticked keeps its FIRST `checked_by`/`checked_at`, or every autosave would rewrite the audit trail to the most recent page load.

> **MEH-971 chunk 3 (2026-06-28):** `ProducerAdminOut` gains a derived **`license_pending: bool`** — **computed** in `_compute_license_pending` (`@model_validator(mode="after")`), never a stored column / no migration. True iff the producer is in ≥1 `LICENSE_REQUIRED_CATEGORIES` category AND `producer_license_number` is empty/NULL; status-independent (an override-approved producer still shows it). Mirrors the MEH-762 `_compute_verification_tier` predicate over the already-loaded `categories` (no DB round-trip). **Admin-only** — on `ProducerAdminOut` only, NOT public `ProducerListOut`/`ProducerDetailOut`. Surfaced as the "רישיון ממתין" badge on the `/admin/producers` queue so an admin verifies the license before approving (pairs with the chunk-4 `allow_without_license` approval guard).

> **MEH-1255 (2026-07-17):** delivery-exclusion mode ("משלוחים לכל הארץ חוץ מ:"). `producers.delivery_excluded_cities` (`TEXT[] NOT NULL DEFAULT '{}'`, migration `e7c4b1f95a2d`) holds the cities a nationwide-delivery producer does NOT ship to (ShipperHQ include/exclude zone model). CHECK `delivery_excluded_requires_nationwide` (`delivery_nationwide OR delivery_excluded_cities = '{}'`) keeps it empty unless nationwide — the sibling of `delivery_nationwide_xor_cities`. Schema (`ProducerUpdate`/`ProducerAdminCreate`) validators reject an exclusion list without nationwide; partial-update effective-state (list sent alone, or nationwide switched off over a stored list) is guarded in the routers (`app/services/delivery_validation.py`) so it 422s (`ערים מוחרגות אפשריות רק עם משלוחים לכל הארץ`) instead of a DB CHECK 500. **Public** — `ProducerListOut`/`ProducerDetailOut` carry `delivery_excluded_cities` so `DeliveryBlock` renders "משלוחים לכל הארץ (למעט …)". **Consumer filter:** `GET /producers?delivery_city=X` (`producer_listing.py`) switched from an inner `JOIN delivery_areas` to `EXISTS (…) OR (delivery_nationwide AND NOT X = ANY(delivery_excluded_cities))` — a nationwide producer now matches any city except its exclusions (previously nationwide producers were never returned by the city filter, their `delivery_areas` being empty by the XOR).

> **MEH-1291 (2026-07-18):** producer freshness signal. `producers.updated_at` (`TIMESTAMP WITH TIME ZONE`, **nullable**, migration `a3f1c9d2e4b7`, Chunk A) is stamped by the model-level `onupdate=func.now()` (`models.py`) on every real producer UPDATE — owner edits (`producer_me.py:update_my_producer`) and admin edits (`admin.py:admin_update_producer`), both of which load the ORM object + `setattr` + `commit` (a bulk `update()` execute would skip the stamp — no such path exists on producers). **No `server_default`, NO backfill** (ADR-007 Expand-only): the column stays NULL for producers never edited since the migration, so the public "עודכן לאחרונה: {חודש שנה}" line renders nothing for them (honest signal). **Public** — `ProducerDetailOut` (Chunk B) carries `updated_at` read-only; `ProducerListOut`/map do NOT (detail-page-only). Rendered as a modest month-year footnote at the page end (`ProducerSections.jsx`, `frontend/lib/format-date.js` → he-IL/en-US).

> **MEH-1644 (2026-07-27):** structured delivery-day capture. `delivery_areas.delivery_day` (existing column, NO migration) gains a **write-path whitelist**: `DeliveryAreaCreate.delivery_day` is a `DeliveryDayField` (`schemas.py` — canonical bare Hebrew day names `DELIVERY_DAYS = ["ראשון".."שבת"]`; blank → `None`; anything else 422 `יום משלוח לא מוכר`). `None` stays legal = "בתיאום מראש". **Expand-only:** `DeliveryAreaOut` carries NO whitelist — legacy free-text rows still serialize until Sapir runs `scripts/normalize_delivery_days.py` (dry-run by default, `--apply` to write, refuses non-localhost `DATABASE_URL` without `--allow-remote`). **New owner write path:** `PUT /producers/me` now accepts `delivery_areas: [DeliveryAreaCreate]` (structured rows: city · min_order · delivery_day) — takes precedence over the flat `delivery_area_cities` when both are sent; the nationwide-XOR covers the rows field too (`ProducerUpdate._validate_location_mode`). The dashboard `DeliveryCard` saves rows (per-city day select from `frontend/lib/delivery-days.js`, the frontend mirror of `DELIVERY_DAYS`) and preserves registration-captured `min_order` (the flat delete+insert path used to wipe it). Admin form still uses the flat list (no day input). New-city `delivery_area` alerts (MEH-54/MEH-1360) fire identically on both paths.

> **MEH-1883 (2026-08-04):** timezone sweep — four public read paths moved from the server clock to the Israel calendar day. `date.today()` returns the **UTC** date on Railway, so for the ~3 hours between Israeli midnight and 03:00 the backend still believed it was yesterday. Four call-sites were affected, all comparing against a plain `Date` column: the vacation auto-clear on `ProducerListOut` (a business whose `vacation_until` had passed stayed `on_vacation`, and therefore stayed **hidden from the listings**, until the server clock caught up), and the three "upcoming" filters on `GET /events` (×2) and `GET /experiences` (an event happening today dropped out of the public feed at 21:00 the evening before). All four now call `israel_today()` (`app/utils/clock.py`), which the **write** path had used since AUD-039/040 — the two halves of the same feature had disagreed for three hours a night. No schema change, no migration; response *shapes* are unchanged, only which calendar day the comparison uses. **Two further `date.today()` call-sites were deliberately NOT swept** — the 30-day analytics windows in `producer_me.py` and `admin_extra.py`. Their day buckets come from `func.date(<naive UTC timestamp column>)`, i.e. UTC dates, so converting only the Python label would have put Israel-dated labels on UTC-bucketed counts. Making those correct means converting the SQL bucketing too, which changes every existing number and is its own ticket.

> **MEH-1880 (2026-08-04):** `order_window` joins the **list** contract. The JSONB column (MEH-1543, migration `f4a1e9c3b7d2`; per-day range LIST since MEH-1869) was serialized on `ProducerDetailOut` only, so no listing surface — home grid, `/producers`, `/map` cards, `/favorites` — could tell whether a business is accepting orders right now. `ProducerListOut` now carries `order_window: dict | None` (Detail inherits it, the MEH-1823 `active_offer` / MEH-1577 `delivery_fee` precedent). **Serializer-only:** the column already existed, so there is **no Alembic revision** and `EXPECTED_TABLES` is unchanged; a producer that never set a window serves an explicit `null`, not a missing key. **Frontend contract, and the part that is easy to miss:** `lib/schemas.js` `ProducerListSchema` had to declare it in the same PR — `z.object` strips undeclared keys, so on the two Zod-parsed feeds the field would have arrived and been discarded in silence (the MEH-826 / 901 / 902 / 1704 / 1719 / 1823 mechanism). **UI:** `ProducerCard` renders one derived line, "פתוח להזמנות · עד {שעה}", only while the declared window is open now; closed / null / on-vacation render no node at all. Time-derived ⇒ mounted-guarded, so the SSR pass emits nothing and there is no hydration mismatch.

> **MEH-1823 (2026-08-02):** typed expiring offers — `producer_offers` (migration `b6e1d94a3f27`, EXPECTED_TABLES 38 → 39). **Why a table:** an offer is a bounded, dated object with its own lifecycle, not a property of the business. **Why threshold_value + threshold_unit:** the evidence that opened the ticket ("בהזמנה של 10 ליטרים ומעלה – המשלוח חינם") had nowhere to live — `producers.free_delivery_above` is INTEGER *shekels*. The pair is both-or-neither (CHECK), and is optional for **every** `offer_type` — deliberately not gated by type. **Public read:** `ProducerListOut.active_offer` (so `ProducerDetailOut` inherits it — the MEH-1577 `delivery_fee` precedent) emits `{id, offer_type, threshold_value, threshold_unit, headline, starts_at, expires_at}`. **Filtered SERVER-side, never client-side:** `Producer.active_offer` (models.py) is the single place the window rule is applied — `is_active AND (starts_at IS NULL OR starts_at <= israel_today()) AND expires_at >= israel_today()` — so an expired or not-yet-started offer cannot leave the API through any read path; `selectinload(Producer.offers)` at all four query sites keeps it O(1). Both boundaries are inclusive: an offer starting today is live today, one expiring today is live today. **Owner write:** `PUT /producers/me` carries `active_offer`, three-valued — omitted = no change, explicit `null` = deactivate, an object = replace (deactivate the current row, insert a new one; the superseded row stays as history). The omitted-vs-null distinction needs `model_fields_set`, not `exclude_unset`, or an unrelated dashboard save would silently wipe the offer. A concurrent double-save collides on the unique partial index and returns **409**, not 500. **Validation** (`ProducerOfferCreate`): closed vocabularies, `threshold_value > 0`, `expires_at` must be future by `israel_today()`, `headline` ≤ 60 chars and Emoji-LOCK rejected. **UI:** `OfferBadge` above the delivery block on the business page + a short chip on `ProducerCard`; a business with no offer renders nothing at all.
>
> **MEH-1645 (2026-07-27):** consumer delivery-day filter. `GET /producers?delivery_day=` accepts ONE canonical Hebrew day (`schemas.DELIVERY_DAYS` — the MEH-1644 vocabulary; anything else 422 `יום משלוח לא מוכר`). **v1 semantics:** only EXPLICIT `delivery_areas` rows with a matching day count — nationwide producers and day-less rows ("בתיאום מראש") are excluded from day filtering (integrity of "משלוח ביום X" over recall). With `delivery_city` the city+day must match on the SAME row — a single EXISTS (`producer_listing._delivery_day_condition`), which REPLACES the `_delivery_city_condition` (its nationwide OR-branch is deliberately dropped when a day is present; the MEH-1487 shared helper is untouched). Home UI: progressive-disclosure day-pill row beside the ActiveFilterChip (renders only while a city filter is active — never a primary chip), chip label "משלוח ל{city} · יום {day}", `?day=` deep-link (city-guarded: a day-only URL drops the day — invisible-filter guard), and a zero-result "הסרת סינון היום" suggestion above the region fallback.

> **MEH-1471 (2026-07-22):** self-reported attribution ("מאיפה שמעת עלינו?"). `producers.referral_source` (`VARCHAR(40)`, **nullable**) + `producers.referral_source_other` (`VARCHAR(120)`, **nullable**), migration `d7b2f4a9c6e1`. `referral_source` stores an **English key** from `constants.REFERRAL_SOURCE_KEYS` (`business_referral`\|`friends_family`\|`instagram`\|`facebook`\|`google`\|`whatsapp_group`\|`other`\|`prefer_not_to_say`) chosen at the final registration step; Hebrew labels are rendered from i18n. `referral_source_other` holds the optional free-text answer, revealed only when the key is `other`. Validated at the API boundary (`ProducerRegister._validate_referral_source` → **422** on an unknown key; `referral_source_other` bleach-sanitised) — **no DB CHECK/enum** (app-layer, like `availability_state`/`verification_doc_type`). Field is optional at the Pydantic layer (nullable column, MEH-143 upgrade path); required-ness is a **front-end** registration gate only. **No `server_default`, NO backfill** (ADR-007 Expand-only) — existing rows stay NULL (admin renders "—"). **Admin-only** — `ProducerAdminOut` surfaces both; public `ProducerListOut`/`ProducerDetailOut` do NOT (internal supply-side data, MEH-530 privacy precedent). Displayed read-only under the producer name in the `/admin/producers` table (`AdminProducersTable.jsx`, `"אחר: <text>"` for the `other` case).

> **MEH-1818 (2026-08-02):** day-1 pending-nudge email. `producers.email_pending_nudge_sent_at` (`TIMESTAMP WITH TIME ZONE`, **nullable**, migration `d3b7f1a92c64`) records when a business still awaiting approval was sent the one-time "here is what is missing" email. Mirrors the MEH-539 `email_followup_*` tracking columns exactly — `nullable=True`, **no `server_default`, NO backfill** (ADR-007 Expand-only; a backfill would retro-suppress the nudge for the exact pending businesses the feature exists to reach). No new index: the candidate query filters `created_at`, already covered by `idx_producers_created_at`. **Not exposed on any schema** — public, owner, and admin serializers all omit it; the sole consumer is `app/services/pending_nudge.py:send_pending_nudges`, invoked from the daily 10:00 UTC scheduler tick. Candidate predicate: `status IN ('draft','pending') AND created_at <= now()-24h AND email_pending_nudge_sent_at IS NULL` (MEH-2100 added `draft`; MEH-2124 removed `pending_whatsapp`) — status membership is an explicit tuple, so a status value added later is excluded by default (fail-closed, same reasoning as the MEH-1587 approved-only gate). **The stamp is written even when nothing was missing and no email was sent** (a complete-but-unapproved business is waiting on admin review, not on itself): that is what removes it from the candidate set permanently and holds the send to exactly one email per producer.
>
> **MEH-2100 (2026-08-16):** draft → submit-for-review state machine. `producers.submitted_for_review_at` (`TIMESTAMP WITH TIME ZONE`, **nullable**, migration `e2a7c9d41b06`) records the instant the owner pressed "שליחה לבדיקה" and the row moved `draft` → `pending` — the point from which the 3-business-day review SLA is counted, replacing `created_at` in that role. **No `server_default`, NO backfill** (ADR-007 Expand-only): NULL is honest and permanent for two populations — a producer still in `draft`, and any row seeded before this revision (staging fixtures; production had no businesses, Sapir 16/08). Readers needing a submission instant use `submitted_for_review_at or created_at`, which is what makes the absent backfill correct rather than merely deferred. No new index — nothing filters or sorts on it. The paired `status` value `"draft"` needs no migration at all: `Producer.status` is a free `String(20)` with no enum and no DB CHECK, so a new value is data, not schema. **Not exposed on any schema** — public (`ProducerListOut`), owner (`ProducerOwnerOut`) and admin (`ProducerAdminOut`) serializers all omit it, deliberately: the dashboard banner and the admin queue both key on `status`, so nothing renders a submission instant and adding a field no surface reads would be dead API. Its only writer is `POST /producers/me/submit-for-review` (MEH-2100 PR2); it has **no reader yet**, and the `submitted_for_review_at or created_at` contract above is the rule for the first one that appears. Exposing it (e.g. a "submitted N days ago" column in the admin queue) is a deliberate follow-up, not an oversight.
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
  price_range,  -- MEH-1855 chunk 2 dropped the legacy alias (9849fab1637a)
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
  -- MEH-2137 SWITCH step: `PUT /producers/me` now accepts `top_product_id`
  -- (422 unless the product belongs to the caller; writing it syncs
  -- top_product_name from the product). ProducerListOut/DetailOut/AdminOut
  -- expose BOTH: the id is the authority, and top_product_name is DERIVED
  -- from the FK in attach_badge_fields when set, else the legacy column —
  -- so a product renamed after the vote no longer strands the name.

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

categories     (id, name unique, emoji,
                slug VARCHAR(50) NOT NULL UNIQUE)  -- MEH-2139: stable ASCII identity; matching keys on this, not on `name`. Added nullable in a7c3e91d5f28 (chunk 1), tightened to NOT NULL in c9f2a41e8b03 (chunk 2) once every writer produced one — the column default in models.py derives it from `name`, so no writer has to remember. Renaming a category does NOT re-derive its slug; surviving a rename is the point.
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
                is_lactose_free Boolean NOT NULL DEFAULT FALSE,   -- MEH-293/MEH-479: same
                is_no_added_sugar Boolean NOT NULL DEFAULT FALSE, -- MEH-1934: 5th dietary axis ("ללא סוכר מוסף"). NO backfill — no existing flag implies it, so seeding would invent a nutrition claim on the business's behalf
                is_low_carb Boolean NOT NULL DEFAULT FALSE)      -- MEH-1934: 6th dietary axis ("דל פחמימות"). Partial index idx_products_dietary on (producer_id) WHERE any flag TRUE — predicate extended with is_vegetarian in MEH-1438 and with both MEH-1934 flags in revision a2f7d4c8e153 (a product marked only low-carb would otherwise fall outside the index)
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
                delivery_fee int nullable)
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
  category: שוק|קטיף|טעימות|אחר,   -- MEH-1657: 6 → 4
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
  clicked_at timestamp (indexed),
  -- MEH-1677: the city a coverage-request click ("לא מגיעים אליך?") asked
  -- about. NULL on every ORDINARY WhatsApp click and on every pre-existing
  -- row, so NULL means "not a coverage click" rather than "we lost it".
  -- Validated softly: a locality outside the canonical list is STORED, not
  -- dropped -- those are the rows worth having. Trim, then cap at 60 to
  -- match the column width.
  city varchar(60) NULL
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
> promise. `POST /experiences` used `require_verified_email` at the time and
> was left unchanged; **MEH-2246 (04/09/2026, PR #3357) moved it to the same
> `require_verified_producer` gate** — since the read gate (approved business
> only) a consumer's submission could only ever sit in the admin queue
> unpublished. Non-create producer routes (PUT/update, list/delete) stay on
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
PUT    /producers/me                              producer — MEH-999: license gate grandfathers already-held categories (validates NEWLY-ADDED category_ids only, so MEH-971 license-pending producers can edit their profile); clearing a held producer_license_number while a license-required category remains → 422.
                                                  MEH-2073: notification-only admin ping when an ALREADY-APPROVED producer changes a
                                                  sensitive field — SENSITIVE_FIELDS = {city, phone, vegan_scope, vegetarian_scope,
                                                  gluten_free_facility} (producer_me.py). Values are snapshotted before the setattr
                                                  loop and diffed post-commit, so a form resubmitting an unchanged value does NOT
                                                  ping; one BackgroundTask per PUT listing every changed field. Persistence,
                                                  status, requested_changes and the response shape are all untouched — this closes
                                                  the MEH-1508 hole where a business could pass the dietary cross-check at approval
                                                  and edit vegan_scope the next day unobserved. Fail-open at the task boundary
                                                  (_sensitive_edit_task), because the notifier's preamble sits outside its own
                                                  per-channel try blocks and a raising BackgroundTask would break the owner's 200.
POST   /producers/me/verify-phone                producer  — send WhatsApp OTP (3/10min)
POST   /producers/me/verify-phone/confirm        producer  — confirm code, sets phone_verified (5/min)
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
POST   /producers/me/request-review              producer  — MEH-1236 resubmit-for-review ping: pending → notification-only (admin WhatsApp+email via notify_admin_producer_resubmit, fail-open), NO DB write, requested_changes stays admin-owned. MEH-2210: ALSO admits rejected → cap 3 (constants.MAX_PRODUCER_RESUBMISSIONS) else 409; then the MEH-2120 completeness gate (unverified phone → 422); then status=pending, resubmission_count+=1, resubmitted_at=now(), rejection_reason+code KEPT, admin ping «🔁 שליחה חוזרת #n», returns {detail,status,resubmission_count}. Every other status → 409. 3/hr
POST   /producers/me/submit-for-review           producer  — MEH-2100 draft→pending: DRAFT ONLY (else 409), 5/hr. Server-side completeness gate via services/submission_gate.submission_missing_items — image>=1 · product>=1 · category>=1 · location · phone_verified. On failure 422 with detail={code:"submit_gate_incomplete", message, params:{missing:[codes]}} (MEH-1943 shape, so detailToMessage renders `message` unchanged). On success: status="pending", submitted_for_review_at=now(tz-aware), admin ping via notify_admin_new_producer (post-commit BackgroundTask, fail-open). License is deliberately NOT gated (MEH-971 license_pending must still reach the queue); opening hours are recommended, not required.
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
                                                              frontend fires via navigator.sendBeacon.
                                                              MEH-1677: accepts an OPTIONAL JSON body
                                                              {city} — stored on the row. It MUST stay
                                                              optional: sendBeacon cannot set
                                                              Content-Type: application/json (it sends
                                                              text/plain -> 422), so a required body
                                                              would break every anonymous click. Only
                                                              the coverage CTA sends one, via
                                                              fetch(keepalive)
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
"Event not found"**, not 403 — a foreign producer can't confirm an
event id exists (matches `producer_recipes.py:203-206`). DELETE keeps
its admin-override, so an admin still deletes (→ 200).

### Experiences (community workshops — `app/routers/experiences.py`)

```
POST   /experiences/validate           public  — 30/hour, real-time Claude Haiku hint
GET    /experiences                    public  — filter: category, city. Only approved+upcoming+is_active (MEH-1419).
GET    /experiences/count              public  — {"count": N} for the SAME set GET /experiences returns (MEH-1918). Both go through _public_listing_query, so the number can never disagree with the list. Declared BEFORE /{experience_id} or the catch-all eats it. Used to data-gate the "חוויות" nav link at >= 3.
GET    /experiences/mine               auth    — owner's submissions, any status (incl. is_active=False)
GET    /experiences/{id}               mixed   — approved=public; non-approved=owner+admin
POST   /experiences                    auth    — require_verified_producer (MEH-2246: producer role first → 403 "Producer access required", then email-verified → 403 {code: email_unverified}; was require_verified_email). 10/hour. REJECTED → 400. APPROVED/FLAGGED → pending.
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
GET    /admin/kashrut                          admin — list badge requests (?status=pending|approved|rejected)
POST   /admin/kashrut/{id}/approve             admin — activates badge in kashrut_badges[], sets expiry
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
