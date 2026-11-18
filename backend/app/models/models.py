"""
Module:    models/models
Purpose:   The core tables every other model module points at: City,
           Producer, User, RetiredSlug, AdminSetting, StaticPage, Category,
           ProducerCategory.
Does NOT:  Hold the rest. Catalog, engagement, home products, events,
           analytics, admin ops, recipes and rescue each have their own
           module in this package (MEH-3269); every name they define is
           re-exported at the bottom of this file, so
           `from app.models.models import X` still works for all of them.
"""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import relationship, validates

# MEH-2139: imported under its own name so the column definition below reads as
# a declaration rather than a call into a service.
from app.services.category_slug import _column_default as _category_slug_default

from app.data.cities import canonical_city
from app.database import Base

# MEH-1823: Producer.active_offer applies the expiry rule in Israel time, the
# same tz basis as the vacation_until validator. clock.py imports only
# app.config, so this adds no cycle.
from app.utils.clock import israel_today, utc_now


class City(Base):
    """MEH-213: canonical Israeli city list seeded from data.gov.il.
    Used to validate delivery_cities on producers — free text is forbidden
    to prevent duplicates and broken search (e.g. "ת״א" vs "תל אביב-יפו").
    """

    __tablename__ = "cities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name_he = Column(String(100), unique=True, nullable=False)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utc_now)


class Producer(Base):
    __tablename__ = "producers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    contact_name = Column(String(200), nullable=True)
    description = Column(Text)
    short_description = Column(Text, nullable=True)
    city = Column(String(100))
    address = Column(String(255), nullable=True)
    # LEGACY(2026-11-30, MEH-1938) — `lat` / `lng` are the business-level mirror
    # of the primary `producer_locations` row. Since chunk 5a (02/09) no
    # CONSUMER SURFACE reads them (geo, submit gate, admin map, producerPoints,
    # JSON-LD all read the rows, with no fallback) and the owner PUT ignores
    # them; `ProducerListOut.lat/lng` are DERIVED from the primary row at
    # serialization. Two readers remain on purpose, in the WRITE direction:
    # producer_queries.create_primary_branch_location and
    # upsert_primary_branch_location copy the columns INTO the row, because
    # admin, import and the seeds still deliver coordinates through them
    # during the soak. Chunk 5b rewires those helpers to take coordinates
    # directly and drops both columns — [DESTRUCTIVE], its own revision,
    # ≥7-day soak, R2 backup ≤24h, the MEH-2056 count query = 0 on production.
    # DO NOT add a reader of these columns on any consumer path —
    # producer_queries.haversine_min_km carries the standing "no COALESCE" rule.
    lat = Column(Float)
    lng = Column(Float)
    phone = Column(String(20))
    instagram = Column(String(100))
    website = Column(String(200))
    whatsapp_group = Column(String(300), nullable=True)  # invite link
    # MEH-17: flexible contact methods. `primary_contact_method` decides
    # which CTA is rendered prominently on ProducerDetail + which icon
    # is highlighted on ProducerCard. Values (MEH-296): whatsapp | phone |
    # instagram | email | website | facebook | external_order
    # (default: whatsapp). `contact_email` is the producer's business
    # email — distinct from the owner user's login email.
    primary_contact_method = Column(String(20), default="whatsapp")
    # MEH-1677: the business's opt-out for the "לא מגיעים אליך?" CTA
    # (MEH-1675). server_default=true, NOT a Python-side default: existing
    # rows are backfilled by the DDL, and a writer that bypasses the ORM
    # still gets true. No toggle UI ships with this column -- that is
    # MEH-1676; the column lands now so the opt-out does not cost a second
    # schema change later.
    coverage_cta_enabled = Column(
        Boolean, nullable=False, server_default=text("true"), default=True
    )
    contact_email = Column(String(200), nullable=True)
    # MEH-296: extra contact channels. URLs validated at the API boundary
    # (schemas.ProducerUpdate, http(s) only). Free-text columns, no enum.
    facebook = Column(String(200), nullable=True)
    external_order_form = Column(String(500), nullable=True)
    # MEH-1612: free String(20) — no enum, no DB CHECK constraint. The
    # authoritative enumeration is the admin filter pattern in
    # routers/admin.py's list_producers (`status` Query pattern):
    #   draft | pending | approved | rejected | inactive
    # (An earlier version of this comment cited routers/admin.py:112,
    # auth.py:509 and auth.py:624 — all three line numbers had drifted.
    # Cited by section rather than by line here, since the line numbers are
    # what rotted. Re-derived MEH-2100.)
    #
    # MEH-2100: `draft` is where every newly created producer starts, from
    # all THREE creation sites (routers/auth.py's upgrade and new-email
    # branches, plus producer_queries.create_producer_with_relations behind
    # POST /producers). It leaves via POST /producers/me/submit-for-review
    # and no other path.
    #
    # MEH-2124: a sixth value, `pending_whatsapp`, was retained through the
    # Expand phase and removed in MEH-2124. No migration was needed — the
    # column is a free String with no enum and no CHECK constraint, so
    # removing a VALUE is code-only.
    #
    # THE TWO PREMISES, with their sources, because a future reader inherits
    # them as fact otherwise and they are what makes the removal safe:
    #
    #   1. UNREACHABLE — CC-verified, mechanically. `grep -rn 'status =
    #      "pending_whatsapp"' backend/app/` returns nothing, so no writer
    #      exists; the OTP flip in producer_me.py was its only EXIT. Still
    #      checkable today, and `tests/test_meh2100_draft_submit.py` asserts
    #      no creation site can re-introduce it.
    #   2. ZERO ROWS, EVER — **Sapir's confirmation, 16/08/2026, on the
    #      MEH-2124 card. NOT measured by CC and not measurable from a CC
    #      session**: the production database URL is deny-listed for Claude
    #      Code (.claude/rules/security.md) and `*.up.railway.app` is
    #      egress-blocked from the sandbox (MEH-2090). It is a human
    #      attestation about data, recorded as one rather than dressed up as
    #      a query result.
    #
    # If premise 2 were ever wrong, a surviving row would go quiet rather than
    # loud: `?status=pending` and the pending counters would omit it, and the
    # toggle / request-changes / request-review guards would answer 409. That
    # asymmetry is why the attestation is cited here instead of assumed.
    #
    # The DEFAULT moved "pending" -> "draft" with the same reasoning, and it is
    # a fail-closed choice rather than a cosmetic one. Every one of the five
    # Producer(...) constructors in app/ passes `status` explicitly (three
    # write "draft"; admin-create and the Excel importer write "approved" —
    # both pre-approved by definition), and a sweep of tests/ found nothing
    # relying on the default either, so this changes no behaviour today. What
    # it changes is the failure mode of a SIXTH creation site added later: on
    # the old default, forgetting `status=` silently minted a live admin-queue
    # entry — exactly the hole this ticket closes — whereas now it mints an
    # invisible draft that simply never gets submitted. Loud and harmless
    # instead of quiet and wrong.
    status = Column(String(20), default="draft")
    # MEH-2459: 'producer' (a business that sells) | 'organizer' (a market /
    # event organizer that sells nothing). An organizer is a Producer row, not
    # a second entity — `events.producer_id` is NOT NULL and 24 routers hang
    # off Producer, so a parallel table would be workflow smell #1. The row is
    # hidden from every business surface by `producer_listing.is_business()`
    # and reachable only through its events. NOT NULL + server_default so the
    # five create-from-payload sites and psql all mint a business unless they
    # say otherwise. Values locked by CHECK `producer_kind_values`
    # (migration f1a2b3c4d5e6). ADR-036.
    kind = Column(
        String(20), nullable=False, default="producer", server_default="producer"
    )
    # MEH-2952 (MEH-2892 §C.3): a seeded test business that may run on
    # production for the post-release smoke. Hidden from every public surface
    # by `producer_listing.is_business()` (the one rule; `include_test=True`
    # only where a guard test allows it). Expand-only, NOT NULL + server
    # default false (revision b8cb5480552f). Writers: the seed script and an
    # admin toggle only (chunk 4) — never a self-service form, never a public
    # response (tests/test_meh2952_is_test_guards.py).
    is_test = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # MEH-2100: the instant the owner pressed "שליחה לבדיקה" and this row
    # moved draft -> pending. That instant, NOT created_at, is when the
    # 3-business-day review SLA starts once the submit gate ships.
    #
    # Nullable, NO default, NO server_default, NO backfill — an HONEST NULL
    # in the MEH-762 verified_at / MEH-1291 updated_at sense: the column
    # stays NULL until a real submission writes it, so "never submitted" is
    # representable and is not silently rendered as "submitted at signup".
    # Two populations carry NULL legitimately and permanently: a producer
    # still in draft, and any row seeded before revision e2a7c9d41b06
    # (staging fixtures — production had no businesses, Sapir 16/08).
    #
    # Readers that need a submission instant use
    # `submitted_for_review_at or created_at`; that fallback is what makes a
    # backfill unnecessary rather than merely deferred. Readers that need the
    # LATEST submission (the admin SLA badge and queue order, MEH-2869) put
    # `resubmitted_at` first: a resubmission after a rejection writes only
    # that stamp, never this one.
    #
    # tz-aware (DateTime(timezone=True)), written with
    # datetime.now(timezone.utc) — never naive utcnow. Expand-only (ADR-007).
    # Paired migration: e2a7c9d41b06.
    submitted_for_review_at = Column(DateTime(timezone=True), nullable=True)
    images: Column[list[str]] = Column(ARRAY(Text), default=[])
    # MEH-766 ch6: is_verified DROPPED (revision d4e7a92c81b5) — verification
    # is verification_tier/verified_at only (ADR-022). Do not re-add.
    # MEH-18: manual "מומלץ" (recommended) badge toggled by admins. Separate
    # from the "verified" trust badge — recommended ≈ editorial pick.
    is_recommended = Column(Boolean, default=False)
    # MEH-1494 chunk A: the editor's pick gets a DATE and a REASON (TripAdvisor
    # Travelers' Choice = 12-month window; MICHELIN re-inspects every 12-18
    # months and withdraws stars). Both nullable, NO backfill — rows already
    # recommended keep recommended_at NULL, read by chunk B's review list as
    # "picked before the clock existed, due now" rather than a fabricated date.
    # recommended_note is ADMIN-ONLY: the editor's internal reasoning about a
    # real business. Never on ProducerListOut / ProducerDetailOut — the guard
    # test asserts its absence by name. Chunk B stamps recommended_at on the
    # admin toggle and adds the note field to the admin form; chunk A only
    # creates the two facts. Paired migration: e2a7c9d4b6f1.
    # DO NOT expose recommended_note on any public serializer.
    recommended_at = Column(DateTime(timezone=True), nullable=True)
    recommended_note = Column(Text, nullable=True)
    # MEH-1287 chunk A: date-bounded editorial curation for the "עכשיו בעונה"
    # homepage module. The business is in season UNTIL this date (inclusive,
    # Israel calendar day — compare with israel_today(), never date.today()).
    # NULL = not curated. A DATE rather than a boolean so it expires by itself
    # instead of being a flag someone forgets in winter; same clock-not-flag
    # shape as recommended_at above. Admin-only, NOT on ProducerUpdate —
    # seasonality is the editor's call, not the owner's declaration (guard
    # test asserts absence). Chunk B reads it with a count >= 3 render gate
    # (ADDENDUM-4). Paired migration: f5b8d2c7a3e9.
    in_season_until = Column(Date, nullable=True)
    # MEH-53: URL of the auto-generated Instagram story card (Cloudinary).
    story_card_url = Column(String(500), nullable=True)
    # MEH-1335: owner story fields consumed by the public OwnerCard
    # ("מאחורי העסק", MEH-1334 — dormant until data exists). Both nullable,
    # Expand-only, no backfill: NULL = owner hasn't told her story yet and
    # the card stays in its compact variant. owner_bio caps at 300 chars at
    # the app layer (schemas.ProducerUpdate sanitize validator), mirroring
    # short_description (Text column + app cap, no DB CHECK). owner_photo_url
    # is written by POST /upload/owner-photo (Cloudinary, mehamakor/owner,
    # fixed public_id + overwrite — MEH-375 zero-orphan pattern). Paired
    # migration: f7d2a9c4b1e8.
    owner_bio = Column(Text, nullable=True)
    owner_photo_url = Column(String(500), nullable=True)
    # MEH-1541: self-reported founding year → the quiet "מאז {שנה}" heritage
    # line on the public masthead (a trust signal for veteran businesses, not a
    # badge). Nullable, Expand-only (ADR-007, no backfill) — NULL = the owner
    # hasn't stated a year and the line is absent from the DOM. Range
    # (1800..current year) is enforced at the app layer (schemas.ProducerUpdate),
    # not a DB CHECK — mirrors the availability_state app-layer-validation
    # precedent. Paired migration: e4a9c1f7b2d3.
    established_year = Column(Integer, nullable=True)
    plan = Column(String(20), default="free")  # free | premium
    slug = Column(String(100), unique=True, nullable=True)  # custom URL: /[slug]
    # MEH-1490: admin-mapped Google Maps Place ID. The ONLY Google datum we
    # store — rating/userRatingCount are live-fetched per request and NEVER
    # persisted (Google Maps Platform ToS §3.2.3(b) No Caching; place_id is
    # the explicit storable exception). NULL until an admin maps it; the quiet
    # public GoogleRatingLine renders only when set AND the live profile has
    # ≥20 reviews. Written admin-only (excluded from _PRODUCER_WRITABLE_FIELDS
    # in producer_me.py). Migration: a9f2c7d41b6e.
    google_place_id = Column(String(300), nullable=True)
    # LEGACY(2026-11-30, MEH-2137) — superseded by top_product_id below as of
    # the switch step. Still WRITTEN (producer_me.py syncs it from the chosen
    # product) and still SERVED (ProducerListOut), so cards/map need no change;
    # it is not dead and must not be dropped here. The drop is its own ticket in
    # the MEH-2064 drop-after-soak pattern, opened at the switch — not this PR.
    top_product_name = Column(
        String(200), nullable=True
    )  # featured product for cards/map
    # MEH-2137 expand step: the featured-product vote by IDENTITY, replacing
    # the name comparison above. Two products legitimately named «לחם» both
    # carried the badge (Sapir, 20/08) because the vote was a string.
    # ON DELETE SET NULL: deleting the featured product means "there is no
    # featured product", which is exactly what NULL says here — not a cascade
    # to the producer, and not a dangling id.
    # `use_alter` + an explicit name: producers.top_product_id and
    # products.producer_id form a cycle, so the constraint is created by ALTER
    # after both tables exist — the same order the revision uses, and the name
    # is pinned so `alembic check` compares like with like.
    # Paired revision: f4b1c8e0a297. top_product_name is NOT deprecated by this
    # commit — it stays the sole writer and reader until the switch step.
    #
    # ADR-006 R2 — DELIBERATELY NOT in ProducerListOut / ProducerDetailOut yet.
    # R2 wants every non-internal column in a `*Out` schema OR on an explicit
    # allowlist, and the allowlist it names (`schemas/_parity.json`,
    # docs/SCHEMA_PARITY_AUDIT.md:272) DOES NOT EXIST — measured, along with the
    # per-domain parity test itself; ADR-006's own Mitigations list R2 as not
    # yet shipped. So this comment is the citation, standing in for the row
    # there is nowhere to write. Exposing the field is a CONTRACT change and
    # belongs to the switch step, which adds it to `*Out` and wires the derived
    # reader in one move; adding it here would ship a public field that is
    # always null. Whoever builds the R2 parity test: this column is expected
    # to be absent from `*Out` until that step, and is an orphan only until then.
    top_product_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "products.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_producers_top_product_id_products",
        ),
        nullable=True,
    )
    # MEH-1855 chunk 2 (contract step, ADR-007 Phase 4): the legacy
    # price-label alias column that used to sit here is GONE — backfilled into
    # this column by 97669fe803f5 (Phase 1) and dropped by 9849fab1637a.
    # price_range is the single price-label field; do not re-add an alias.
    price_range = Column(String(100), nullable=True)  # "מ-₪20" / "מ-₪65/ק״ג"
    grass_fed = Column(Boolean, default=False)
    # «עסק של מילואימניקים»: the owner declares that one of the owners serves
    # in the IDF reserves. Self-declared (no document is collected or stored),
    # drives a badge only, never ranking (ADR-027/030). NOT NULL + server
    # default false: nobody is marked without opting in.
    reservist_owned = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    organic_certified = Column(Boolean, default=False)
    # MEH-1508 chunk 1 (schema only): business-level dietary scope — distinguishes
    # "one tagged product" (product-level flags, on Product in models/catalog.py) from "the whole catalog".
    # VARCHAR + app-level validation (no PG enum), like availability_state.
    # NOT NULL with both a Python-side `default` (ORM inserts) AND a DB
    # `server_default` ('unknown') — mirrors the MEH-293 product flags
    # (nullable=False + default + server_default). server_default makes ADD COLUMN
    # NOT NULL safe on existing rows; NOT NULL then forbids a fourth state outside
    # the unknown|some|all / unknown|shared|dedicated spec. No filter reads these
    # yet, so zero behaviour change until chunks 2 (form/admin) + 3 (chip) land.
    vegan_scope = Column(
        String(20), nullable=False, default="unknown", server_default=text("'unknown'")
    )  # unknown | some | all
    vegetarian_scope = Column(
        String(20), nullable=False, default="unknown", server_default=text("'unknown'")
    )  # unknown | some | all
    gluten_free_facility = Column(
        String(20), nullable=False, default="unknown", server_default=text("'unknown'")
    )  # unknown | shared | dedicated
    lactose_free_facility = Column(
        String(20), nullable=False, default="unknown", server_default=text("'unknown'")
    )  # unknown | shared | dedicated
    # MEH-293/MEH-479: dietary flags moved to products.is_X (canonical) and
    # ProducerListOut.has_X_products (aggregated, computed at attach time).
    has_delivery = Column(Boolean, default=False)
    pickup_points = Column(Boolean, default=False)
    # values: "כשר" / "לא כשר" / "כשר למהדרין"
    kosher = Column(String(50), nullable=True)
    # MEH-530: manufacturer license number (Ministry of Health). Nullable at the
    # DB level so existing producer rows stay valid; required-vs-optional
    # is enforced at the application layer (router-level helper
    # app/services/license_validation.py — depends on selected categories).
    # Exposed publicly only as the derived boolean `has_producer_license`
    # on ProducerListOut / ProducerDetailOut; the raw value is admin-only
    # via ProducerAdminOut.
    producer_license_number = Column(String(20), nullable=True)
    # MEH-2072: the licence's expiry date, read off the document by the admin
    # at approval. Without it the "licensed businesses only" promise is checked
    # once, on day one, and never again — a lapsed licence is indistinguishable
    # from a current one in the data.
    #
    # Date, NOT DateTime, and it deliberately diverges from the sibling
    # kashrut_expires_at (:400) whose reminder pattern this mirrors: a licence
    # is valid THROUGH a calendar day, not to an instant, so a timestamp would
    # make "expires today" answer differently either side of 00:00 UTC — which
    # in Israel falls inside the same working day. Paired with israel_today()
    # (utils/clock.py:33) the comparison is calendar-day vs calendar-day.
    #
    # Nullable, Expand-only (ADR-007, no backfill): the date lives only on a
    # document, so there is nothing to backfill from. NULL means "not captured
    # yet", NEVER "no expiry" — the reminder query filters IS NOT NULL so a
    # NULL row is never reminded about rather than treated as expired.
    #
    # Admin-owned (MEH-530 precedent): ProducerAdminOut only, never the public
    # ProducerDetailOut/ListOut, and withheld from _PRODUCER_WRITABLE_FIELDS so
    # PUT /producers/me cannot write it — same shape as google_place_id
    # (MEH-1490). Tests assert both. Enforcement lives in
    # services/verification_status.py (MEH-2520): `licence_lapsed` /
    # `verification_is_current` drop the verified tier once this date has
    # passed, and both the public tier and the `?verified` filter read through
    # them. NULL means "not captured", never "lapsed", so an expired licence
    # with no captured date stays indistinguishable (MEH-2637). Paired
    # migration: c3e9a1f7b204.
    license_expires_at = Column(Date, nullable=True)
    # MEH-1471: self-reported attribution ("מאיפה שמעת עלינו?") captured at the
    # final registration step. `referral_source` holds an English key from
    # constants.REFERRAL_SOURCE_KEYS (validated at the API boundary — no DB
    # enum/CHECK, app-layer like availability_state); `referral_source_other`
    # holds the optional free-text answer revealed only when the key is "other".
    # Both nullable — existing rows predate the field (Expand-only, ADR-007, no
    # backfill). Admin-only exposure via ProducerAdminOut; never on the public
    # ProducerListOut/DetailOut (internal supply-side data — MEH-530 privacy
    # precedent). Paired migration: d7b2f4a9c6e1.
    referral_source = Column(String(40), nullable=True)
    referral_source_other = Column(String(120), nullable=True)
    # MEH-759 (ADR-022 gate 2): binding tier-2 declaration audit trail.
    # Both nullable — existing rows predate the trail; Expand-only (ADR-007,
    # no backfill). `declared_at` = when the binding declaration was made;
    # `declaration_version` = which lawyer-locked text version was agreed to
    # (Brief Q1.4 — timestamp + version strengthen the good-faith reliance
    # defense). Stamping is Chunk B; raw values are admin-only exposure
    # (ProducerAdminOut), never public — MEH-530 privacy-first precedent.
    declared_at = Column(DateTime(timezone=True), nullable=True)
    declaration_version = Column(String(10), nullable=True)
    # MEH-2923: the grower declaration, recorded APART from the licensing pair
    # above. NULL = not a grower category, or a row from before the revision.
    farmer_declared_at = Column(DateTime(timezone=True), nullable=True)
    farmer_declaration_version = Column(String(10), nullable=True)
    # MEH-762 (ADR-022 public tier contract, Chunk 1): tier-1 "מאומת"
    # verification trail. Both nullable, Expand-only (ADR-007, no backfill).
    # `verified_at` = when the admin checked the qualifying document
    # (timezone-aware; Chunk-2 stamping uses now(timezone.utc) like MEH-759,
    # NOT utcnow). `verification_doc_type` = which document granted the badge —
    # by-convention 'license' | 'exemption' | 'cosmetics' (1:1 with
    # VERIFICATION.md §3; no DB enum/CHECK, app-layer enforced like
    # availability_state). The public `verification_tier` ("verified" |
    # "declared") is COMPUTED in schemas (Chunk 3) from verified_at + the
    # category's licensing requirement — NEVER stored. No `verified_by`
    # column in V1 (single admin — MEH-762 D1). Paired migration: f1c7b9a3e264.
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verification_doc_type = Column(String(20), nullable=True)
    admin_notes = Column(Text, nullable=True)  # internal — not exposed publicly
    # MEH-509 PR3: Anthropic-Haiku-backed signup risk score.
    # Populated asynchronously by app/services/producer_risk.py via
    # FastAPI BackgroundTasks after producer signup. Both columns
    # nullable — NULL means "not scored yet OR Anthropic call failed
    # (fail-open)". score is clamped to [0,100] at the app layer; no
    # CHECK constraint so any corrupt persisted value still renders in
    # the admin "out of range" grey state rather than 500ing the GET.
    risk_score = Column(Integer, nullable=True)
    risk_reasoning = Column(Text, nullable=True)
    is_available_today = Column(Boolean, default=False)  # producer self-marks daily
    # MEH-12: durable availability status (vs. the per-day is_available_today above).
    # Values: "available" (default) | "full" | "vacation". Rendered as a
    # colored-dot badge on ProducerCard + ProducerDetail.
    availability_status = Column(String(20), default="available")
    # MEH-291 enum that replaced is_available_today + availability_status.
    # Values: accepting_orders | on_vacation (MEH-2782 removed available_today /
    # full_this_week). The two legacy columns above are dropped by MEH-2273.
    availability_state = Column(
        String(32),
        nullable=False,
        server_default=text("'accepting_orders'"),
    )
    # MEH-155: optional vacation end date — cleared automatically when past.
    vacation_until = Column(Date, nullable=True)
    # MEH-102: weekly opening hours, free-text.  Format: "Sun-Thu 09:00-18:00, Fri 09:00-14:00"
    opening_hours = Column(String, nullable=True)
    # MEH-1543: optional weekly ORDER-acceptance window — distinct from
    # opening_hours (store hours) and from ProducerLocation.opening_hours
    # (pickup-point hours, MEH-1509). Format (MEH-1869 — a LIST per day):
    #   {"sunday": [{"open": "09:00", "close": "13:00"},
    #               {"open": "16:00", "close": "20:00"}], ...}
    # keys a subset of sunday..saturday; a day absent = orders closed that day.
    # Up to 3 ranges per day, ascending and non-overlapping (a lunch break, or
    # Friday morning + Saturday night post-Shabbat). The pre-MEH-1869 single-dict form
    # ({"sunday": {"open", "close"}}) is still ACCEPTED on write and normalised
    # to a one-element list, and every reader normalises both — so rows written
    # before the cutover keep working untouched. This was a JSONB VALUE-shape
    # change only: no column change, hence NO Alembic revision for MEH-1869.
    # NULL = feature unused → nothing rendered. Backend only stores/validates/
    # returns; the "open now" derivation is client-side (MEH-1546). JSONB (not
    # JSON) so a future EXISTS/containment query stays cheap. Owner-writable via
    # producer_me PUT; validated in schemas.ProducerUpdate (day keys, HH:MM 24h,
    # close>open, order + non-overlap, ≤3 → 422). Expand-only per ADR-007.
    # Paired migration for the COLUMN: f4a1e9c3b7d2 (MEH-1543).
    order_window = Column(JSONB, nullable=True)
    # MEH-3035: how the business takes payment — {"methods": [...], "timing":
    # str|None, "note": str|None}, or NULL (said nothing → the page renders
    # nothing). Validated in schemas._payment_info_validator. Expand-only per
    # ADR-007. Paired migration: e3a5c1d7f904.
    payment_info = Column(JSONB, nullable=True)
    # MEH-3055: ordered [{id, name}] product groups (b7d4e2a9c615).
    product_groups = Column(JSONB, nullable=True)
    # MEH-1889 chunk A: per-DATE overrides above the weekly axes, shape
    # {"2026-09-22": {"ranges": [{"open": "09:00", "close": "13:00"}],
    #                 "note": "ערב ראש השנה"}} — keys ISO YYYY-MM-DD,
    # `"ranges": []` = CLOSED that date. NULL = feature unused.
    # ORDER-AXIS AUTHORITATIVE: `ranges` overrides `order_window` on that date
    # only. It does NOT override `opening_hours` — that axis is unbounded free
    # text (see the column above at :380), so there is nothing to compute
    # against; `note` is DISPLAY ONLY for the store-hours surface. The repo
    # already ruled the two are different facts and that the computed surfaces
    # read the order axis deliberately: services/producer_listing.py:508-514
    # and routers/producers.py:146.
    # Ranges reuse `order_window`'s per-day rules verbatim (HH:MM 24h,
    # close>open, ascending + non-overlapping, ≤3) via _validate_order_day, so
    # the two fields cannot drift on what a "range" means. Validated in
    # schemas.ProducerUpdate -> 422. Expand-only per ADR-007.
    # Precedence at the READERS is chunk B — chunk A stores and validates only.
    # Paired migration for the COLUMN: c4e81b7a2f96 (MEH-1889).
    special_hours = Column(JSONB, nullable=True)
    # MEH-213: location mode. Two independent booleans (not an enum) because
    # a producer can have BOTH a physical store AND offer delivery.
    # CHECK constraint (has_physical_location OR offers_delivery) enforced in DB.
    has_physical_location = Column(Boolean, nullable=False, default=True)
    offers_delivery = Column(Boolean, nullable=False, default=False)
    # Delivery scope — mutually exclusive: nationwide flag XOR city list.
    delivery_nationwide = Column(Boolean, nullable=False, default=False)
    delivery_cities: Column[list[str]] = Column(ARRAY(Text), nullable=False, default=[])
    # MEH-1255: nationwide exclusion list — "משלוחים לכל הארץ חוץ מ:".
    # Only meaningful when delivery_nationwide=true; CHECK constraint
    # delivery_excluded_requires_nationwide keeps it empty otherwise
    # (ShipperHQ include/exclude zone model).
    delivery_excluded_cities: Column[list[str]] = Column(
        ARRAY(Text),
        nullable=False,
        default=[],
        server_default=text("'{}'::text[]"),
    )
    # MEH-1577: structured delivery cost, producer-level (NOT per delivery_area
    # — delivery_areas.min_order below already owns the per-city dimension).
    # NULL = not stated → the public DeliveryBlock renders no line at all;
    # delivery_fee=0 is a distinct, meaningful value ("free delivery").
    # INTEGER to match delivery_areas.min_order (:605), the same conceptual
    # cluster — NOT the NUMERIC(10,2) of products.price / price_per_person.
    # Two adjacent delivery-money fields with different types would fork
    # serialization (Decimal vs int in one Pydantic response), rendering and
    # fixtures; these are display-only whole shekels, no cent arithmetic.
    # Owner-writable via producer_me PUT; validated in schemas.ProducerUpdate
    # (both >= 0, free_delivery_above > 0 when set → 422), no DB CHECK —
    # app-layer enforcement mirroring order_window. Expand-only per ADR-007.
    # Paired migration: c7e2a4b91f38.
    delivery_fee = Column(Integer, nullable=True)
    free_delivery_above = Column(Integer, nullable=True)
    # Aggregates (denormalized for fast list queries) — maintained in review router
    avg_rating = Column(Float, default=0)
    reviews_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now)
    last_active_at = Column(DateTime, default=utc_now)  # for v2 activity check
    # MEH-1291: "עודכן לאחרונה" freshness signal. Nullable, NO default, NO
    # server_default, NO backfill — an honest signal: the column stays NULL
    # until a real UPDATE fires `onupdate=func.now()`, so untouched producers
    # render nothing on the public page. tz-aware (MEH-762 verified_at
    # precedent, NOT naive utcnow). Expand-only (ADR-007). Paired migration:
    # a3f1c9d2e4b7. Exposed public read-only via ProducerDetailOut (MEH-1291
    # Chunk B).
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now())
    # MEH-51: trust ladder + kashrut badges
    phone_verified = Column(Boolean, default=False)
    ambassador = Column(Boolean, default=False)
    kashrut_badges: Column[list[str]] = Column(ARRAY(Text), default=[])
    kashrut_verified_at = Column(DateTime, nullable=True)
    kashrut_expires_at = Column(DateTime, nullable=True)
    # MEH-210 Phase 2 — producer-defined WhatsApp question chips (overrides category defaults).
    custom_questions: Column[list[str]] = Column(ARRAY(Text), nullable=True)
    # MEH-283 — admin reject reason surfaced on /auth/me as producer_rejection_reason.
    # Accessed in auth.py::get_me; missing column was raising AttributeError for any
    # user with a producer_id since MEH-206 (ORM never declared it, _migrate_columns
    # never added it to the DB, baseline didn't pick it up).
    rejection_reason = Column(Text, nullable=True)
    # MEH-2210 — the rejected → resubmit loop. `rejection_reason_code` is the
    # admin's preset key (admin.py::PRODUCER_REJECTION_PRESETS — the SAME dict
    # that composes the text above; a second code dictionary would be
    # workflow.md Smell #1), stored beside the composed text so the owner
    # dashboard can branch its copy on it. NULL on every row rejected before
    # this column existed (legacy free-text reject with no preset_key); `other`
    # is stored as the string "other" — the banner falls back to the text.
    # `resubmission_count` is HISTORY: incremented by POST /producers/me/
    # request-review from `rejected`, never reset by approve. Capped at
    # constants.MAX_PRODUCER_RESUBMISSIONS server-side. `resubmitted_at` is
    # the tz-aware stamp of the latest resubmission (MEH-762).
    rejection_reason_code = Column(String(40), nullable=True)
    resubmission_count = Column(Integer, nullable=False, default=0, server_default="0")
    resubmitted_at = Column(DateTime(timezone=True), nullable=True)
    # MEH-2496: tz-aware stamp of the latest owner-claim link an admin minted
    # for this draft (producer_claim.create_claim_link, same transaction, on
    # success only). NULL = none minted since the column existed (revision
    # 8600916f1942, no backfill). Admin-only via ProducerAdminOut.
    claim_link_sent_at = Column(DateTime(timezone=True), nullable=True)
    # MEH-2974: owner invite for a business an admin built end to end. Sapir
    # creates the page through /admin after written consent from its owner,
    # then hands it over: a one-time link on which the owner sets a password
    # and signs the terms + the licensing declaration herself.
    #
    # The invite lives on THIS row and NOT in a table of its own, and there is
    # no `users` row until the invite is accepted (card «החלטות סגורות» 2 + 3).
    # Consequences worth knowing before reading any of it:
    #   - no half-user: the onboarding follow-ups, the welcome email and
    #     forgot-password all key on `users`, so none of them can fire for an
    #     invitee who has not accepted;
    #   - exactly one invite per business at a time. Re-inviting REPLACES it,
    #     which is also how an outstanding link is revoked.
    #
    # DO NOT store the raw token. `owner_invite_token_hash` is the sha256 hex
    #        of a `secrets.token_urlsafe(32)` that exists only in the creating
    #        response and in the email — a DB reader must not be able to accept
    #        an invite. The lookup hashes the candidate and matches on this
    #        column (routers/producer_owner_invite.py).
    # DO NOT expose any of these through ProducerAdminUpdate — the admin PUT
    #        applies its payload with a bulk setattr (admin.py:1012), and these
    #        are written only by the three owner-invite endpoints.
    #
    # All eight are nullable with no server_default and no backfill
    # (ADR-007 expand-only): a row that predates the feature stays NULL, which
    # reads as "never invited". Admin-only exposure via ProducerAdminOut; the
    # hash is on NO schema at all. Paired migration: a7f3c2e94d18.
    owner_invite_email = Column(String(200), nullable=True)
    owner_invite_name = Column(String(200), nullable=True)
    owner_invite_token_hash = Column(String(64), nullable=True, index=True)
    owner_invite_expires_at = Column(DateTime(timezone=True), nullable=True)
    owner_invite_sent_at = Column(DateTime(timezone=True), nullable=True)
    # Set once, at acceptance. Also the onboarding-sequence clock: the day
    # 2/5/10/30 emails count from here when it is set, from `created_at`
    # otherwise (services/onboarding_followup.py) — an admin-built page can sit
    # live for weeks before its owner ever sees it, and «עברו כמה ימים» has to
    # mean days since SHE arrived.
    owner_invite_accepted_at = Column(DateTime(timezone=True), nullable=True)
    # The admin's own record of how the written consent was given, e.g.
    # «אישור בוואטסאפ, 12/11». Required (non-blank) on every invite — this
    # column plus `owner_invite_created_by` IS the audit trail.
    owner_invite_consent_note = Column(Text, nullable=True)
    # MEH-3377: an optional screenshot of that written consent (the WhatsApp
    # «כן»), attached on «פרסום בהסכמה». A Cloudinary URL. Admin-only: it shows
    # a private person's chat, so it is on ProducerAdminOut and no other shape.
    consent_screenshot_url = Column(String(500), nullable=True)
    # `use_alter` + an explicit name, exactly as `top_product_id` above does,
    # and for the same reason: `users.producer_id` already points HERE, so this
    # reference closes a producers ↔ users cycle. Without the pair, SQLAlchemy
    # cannot order a `drop_all` and raises CircularDependencyError — which in
    # this repo means `tests/conftest.py::_bootstrap_schema` fails and the
    # WHOLE pytest suite errors at setup, not just this feature's tests.
    # Measured: the first version of this column, with a bare
    # `ForeignKey("users.id", ondelete="SET NULL")`, did exactly that.
    # DO NOT drop either argument.
    owner_invite_created_by = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_producers_owner_invite_created_by_users",
        ),
        nullable=True,
    )
    # MEH-2974 v3: the invite link no longer has to carry an email. Most
    # businesses reach us on Instagram or WhatsApp and we have no address for
    # them, so the admin may mint a link with none and the owner types her own
    # on the acceptance page.
    #
    # That makes the link a pure bearer credential, and an address typed into
    # it is unproven — a typo would lock her out of her own page, and a
    # deliberate entry could park someone else's address on a live business.
    # So the typed address is verified with a one-time CODE before any account
    # exists (closed decision 14): `email_verified=True` then rests on the code,
    # not on the invite mail having been delivered.
    #
    # Only the sha256 of the code is stored, which is stricter than the repo's
    # existing OTP (`PhoneOtpToken.code` is plaintext, models.py:2518) and the
    # same reasoning as the invite token two blocks up.
    #
    # `owner_invite_code_attempts` is the per-code counter. NULL and 0 both
    # mean "no wrong guesses yet"; it is reset with every new code, and the
    # code dies at OWNER_INVITE_CODE_MAX_ATTEMPTS so a 6-digit secret cannot be
    # walked. All three are cleared together — by a resend, a cancel, or an
    # acceptance.
    owner_invite_code_hash = Column(String(64), nullable=True)
    owner_invite_code_expires_at = Column(DateTime(timezone=True), nullable=True)
    owner_invite_code_attempts = Column(Integer, nullable=True)
    # MEH-1011: producer "request-changes" trail — the non-terminal twin of
    # rejection_reason. When the admin sends a completion request (missing
    # photo / license), status STAYS "pending"; `requested_changes` holds the
    # admin's free-text feedback and `changes_requested_at` stamps when it was
    # sent (tz-aware — MEH-762 D1 precedent, NOT naive utcnow). Both nullable,
    # Expand-only (ADR-007, no backfill); cleared on approve. Admin-only
    # exposure via ProducerAdminOut. Paired migration: a1b2c3d4e5f6.
    requested_changes = Column(Text, nullable=True)
    changes_requested_at = Column(DateTime(timezone=True), nullable=True)
    # MEH-539: timestamps for the 4 onboarding follow-up emails (Day 2 / 5 /
    # 10 / 30). NULL = not yet sent — non-null is the durable "delivered to
    # Resend" record. Scheduler (APScheduler, daily) reads created_at +
    # these flags to decide who's due. See migration b504e4be4225.
    email_followup_2_sent_at = Column(DateTime(timezone=True), nullable=True)
    email_followup_3_sent_at = Column(DateTime(timezone=True), nullable=True)
    email_followup_4_sent_at = Column(DateTime(timezone=True), nullable=True)
    email_followup_5_sent_at = Column(DateTime(timezone=True), nullable=True)
    # MEH-1818: day-1 nudge for a business still awaiting approval (status
    # draft / pending). Same NULL-means-not-sent contract as the
    # MEH-539 columns above, and the same fail-open caveat. Stamped even when
    # nothing was actually missing (nothing to nudge → stamp, no email), so
    # the column means "this producer has been through the nudge pass once",
    # which is what holds the send to EXACTLY ONE email.
    # See migration d3b7f1a92c64.
    email_pending_nudge_sent_at = Column(DateTime(timezone=True), nullable=True)
    # Page freshness: the monthly "is everything still correct?" email.
    # last_confirmed_at is set when the owner presses "yes" in that email;
    # freshness_email_sent_at is the idempotency stamp. Expand-only (ADR-007),
    # migration a8d41c2e7f90. Sender: services/page_freshness.
    last_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    freshness_email_sent_at = Column(DateTime(timezone=True), nullable=True)
    # MEH-3079: weekly summary email. opt_out is set by the signed unsubscribe
    # link; sent_at is the idempotency stamp (skip if < 6 days old). Expand-only
    # (ADR-007), migration 0cfa83f0f53e. Sender: services/weekly_owner_summary.
    weekly_summary_opt_out = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    weekly_summary_sent_at = Column(DateTime(timezone=True), nullable=True)

    # MEH-1297: order_by position so categories[0] is deterministic (the
    # producer's primary/first-selected category), not an arbitrary row.
    categories = relationship(
        "Category",
        secondary="producer_categories",
        back_populates="producers",
        order_by="ProducerCategory.position",
    )
    # MEH-2137: `foreign_keys` is now REQUIRED, not stylistic. Adding
    # producers.top_product_id created a SECOND FK path between producers and
    # products, and SQLAlchemy refuses to guess which one this collection
    # joins on (`AmbiguousForeignKeysError` — measured, not anticipated: it
    # broke 4 tests before the argument was added). The catalogue joins on the
    # child's owner column; the featured-product FK points the other way and
    # is a scalar, never a collection.
    products = relationship(
        "Product",
        back_populates="producer",
        cascade="all, delete-orphan",
        foreign_keys="Product.producer_id",
    )
    delivery_areas = relationship(
        "DeliveryArea", back_populates="producer", cascade="all, delete-orphan"
    )
    favorited_by = relationship(
        "Favorite", back_populates="producer", cascade="all, delete-orphan"
    )
    reports = relationship(
        "Report", back_populates="producer", cascade="all, delete-orphan"
    )
    reviews = relationship(
        "ProducerReview", back_populates="producer", cascade="all, delete-orphan"
    )
    # MEH-588: producer-owned recipes (chunk 1/4). Cascade delete so a
    # producer teardown removes its recipes (and the link rows via the
    # FK cascade on producer_recipe_products.recipe_id).
    producer_recipes = relationship(
        "ProducerRecipe", back_populates="producer", cascade="all, delete-orphan"
    )
    # MEH-1395 (MEH-1388 chunk 1): physical presence points (branches / pickup
    # points / market stands). Expand-phase data layer only — no serialization
    # or UI in this chunk. Default (lazy="select") loading is deliberate: an
    # eager joinedload would fan a producer row out per location and regress
    # the list/count queries (producer_queries.py Haversine + producer_listing
    # counts). back_populates + delete-orphan mirrors delivery_areas.
    locations = relationship(
        "ProducerLocation", back_populates="producer", cascade="all, delete-orphan"
    )
    # MEH-1823 (chunk 1): typed, expiring offers. At most one row is active at
    # a time (unique partial index on producer_offers), but the relationship is
    # a collection because expired/deactivated rows stay for history. Default
    # lazy="select" and delete-orphan mirror delivery_areas above.
    offers = relationship(
        "ProducerOffer", back_populates="producer", cascade="all, delete-orphan"
    )

    # MEH-2602: one stored spelling per city, whatever the write path (owner
    # form, admin, import, seed). «בנימינה» and «בנימינה-גבעת עדה» were two
    # entries in the city list and two answers to the city filter.
    @validates("city")
    def _canonical_city(self, _key: str, value: str | None) -> str | None:
        return canonical_city(value)

    @validates("delivery_excluded_cities")
    def _canonical_excluded_cities(
        self, _key: str, value: list[str] | None
    ) -> list[str] | None:
        if not value:
            return value
        # A blank entry canonicalises to None and has no meaning in the list.
        return [cc for c in value if (cc := canonical_city(c))]

    @property
    def active_offer(self) -> "ProducerOffer | None":
        """MEH-1823 chunk 2: the one offer that is live RIGHT NOW, or None.

        This is what `ProducerListOut.active_offer` serializes, and it is the
        single place the expiry rule is applied — so an expired offer cannot
        leave the API through any read path, rather than each consumer being
        trusted to re-check the date.

        `israel_today()` and not `date.today()`: the same tz reasoning as
        _validate_vacation_until (schemas.py). `>=` because an offer expiring
        today is still live today — it stops being live tomorrow.

        Reads the loaded `offers` collection instead of issuing a query, so the
        LIST paths that `selectinload(Producer.offers)` pay no N+1. The unique
        partial index guarantees at most one row satisfies `is_active`, so the
        loop returns at most one. It does load inactive history rows alongside;
        acceptable while an owner has one offer at a time, and the place to
        revisit if that ever stops being true.
        """
        today = israel_today()
        offer: ProducerOffer
        for offer in self.offers:
            # BOTH ends of the window, not just the far one. Omitting the
            # starts_at half served a scheduled offer as live from the moment it
            # was created — measured: starts_at 2026-09-01 returned on
            # 2026-08-02. The dashboard does not expose starts_at yet, so it was
            # unreachable through the UI, but the API accepts it and the
            # revision docstring already promised "a future date is a scheduled
            # offer". The code contradicted its own documentation.
            started = offer.starts_at is None or offer.starts_at <= today
            if offer.is_active and started and offer.expires_at >= today:
                return offer
        return None

    # Full-text search on producer name (Hebrew-friendly via 'simple' config).
    __table_args__ = (
        Index(
            "idx_producers_name",
            text("to_tsvector('simple', name)"),
            postgresql_using="gin",
        ),
        # idx_producers_availability_state — added in MEH-291 migration
        # 2a74fa41ceb1 (2026-05-04). Partial index covers non-default
        # availability states; pairs with producer_listing.py:174 filter.
        # Predicate written in Postgres canonical form (varchar comparison
        # with ::text casts + <> operator) to satisfy `alembic check`.
        # Source migration uses `!=` → Postgres reconstructs as `<>` in
        # pg_get_expr(), forcing the canonical-form match here.
        Index(
            "idx_producers_availability_state",
            "availability_state",
            postgresql_where=text(
                "(availability_state)::text <> 'accepting_orders'::text"
            ),
        ),
        # MEH-539: btree index on created_at supports the daily follow-up
        # scheduler query `WHERE created_at BETWEEN today-N AND today-N+1`.
        # Added in migration b504e4be4225 alongside the 4 email_followup_*
        # columns above.
        Index("idx_producers_created_at", "created_at"),
        # MEH-272: two CHECK constraints that already live on prod/staging
        # (added by the removed `_migrate_columns` raw SQL, MEH-267 era) but
        # were never declared in the ORM or the alembic baseline — so fresh
        # bootstrapped DBs (local dev, new env, CI) silently lacked them.
        # Pydantic `model_validator` guards the API layer; these protect the
        # direct-SQL paths (seeds, imports, psql). Migration f9a2c7d41b83 adds
        # them idempotently (IF NOT EXISTS) so it's a no-op where they exist.
        CheckConstraint(
            "has_physical_location OR offers_delivery",
            name="producer_location_mode",
        ),
        # MEH-2459: the only two kinds. Mirrors migration f1a2b3c4d5e6 so a
        # bootstrapped DB (`create_all`, CI) carries the same guard as staging.
        CheckConstraint(
            "kind IN ('producer', 'organizer')",
            name="producer_kind_values",
        ),
        CheckConstraint(
            "NOT (delivery_nationwide AND array_length(delivery_cities, 1) > 0)",
            name="delivery_nationwide_xor_cities",
        ),
        # MEH-1849: nationwide scope without the delivery switch is a
        # contradiction — the strongest delivery configuration on a business
        # that declares it does not deliver. Mirrors CHECK
        # producer_nationwide_requires_delivery, added in d8c3f1a75e29.
        # The write-path half of MEH-1848, which made producer_listing.py's
        # two delivery predicates consult offers_delivery: that stops the row
        # being SHOWN, this stops it EXISTING (seeds, imports, psql).
        # NOTE: a CHECK cannot span tables, so the sibling contradiction
        # "delivery_areas rows + offers_delivery=false" is enforced ONLY in
        # the query layer.
        CheckConstraint(
            "NOT (delivery_nationwide AND NOT offers_delivery)",
            name="producer_nationwide_requires_delivery",
        ),
        # MEH-1255: an exclusion list without nationwide mode is contradictory.
        # Column is NOT NULL so the equality form is NULL-free (no
        # array_length three-valued-logic edge). Added in e7c4b1f95a2d.
        CheckConstraint(
            "delivery_nationwide OR delivery_excluded_cities = '{}'::text[]",
            name="delivery_excluded_requires_nationwide",
        ),
    )


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(200), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    password_hash = Column(
        String(200), nullable=True
    )  # nullable for Google OAuth users
    city = Column(String(100))
    phone = Column(String(20))
    role = Column(String(20), default="consumer")  # consumer | producer | admin
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="SET NULL"),
        nullable=True,
    )
    google_id = Column(String(200), unique=True, nullable=True)
    apple_id = Column(String(200), unique=True, nullable=True)
    is_blocked = Column(Boolean, default=False)
    # MEH-2952 (MEH-2892 §C.3): a test identity for the post-release smoke.
    # Same rules as Producer.is_test: NOT NULL + server default false
    # (revision b8cb5480552f), written only by the seed script and an admin
    # toggle (chunk 4), never exposed in a public response.
    is_test = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    created_at = Column(DateTime, default=utc_now)
    # Analytics (feature/producer-analytics): updated on every authenticated
    # request via a tiny middleware in main.py. Used to compute daily-active-user
    # counts on the /admin/dashboard. Nullable for pre-existing users who
    # haven't made a request yet after this column was added.
    last_active_at = Column(DateTime, nullable=True, index=True)
    # MEH-143: one account / multiple roles. True once the user has ever
    # registered a producer, even if role is later changed by admin.
    is_producer = Column(Boolean, default=False)
    # MEH-138: profile photo. Populated from Google OAuth picture on first
    # login, or via manual upload through POST /upload/avatar.
    avatar_url = Column(String, nullable=True)
    # MEH-166: password reset. Token is a 32-byte URL-safe random string,
    # expires 1 hour after issue, cleared on redeem or re-issue.
    reset_token = Column(String(64), nullable=True, index=True)
    reset_token_expires_at = Column(DateTime, nullable=True)
    # MEH-1995: evidence that this user accepted the terms, and which version.
    # Mirrors the Producer.declared_at / declaration_version pair (see ~:188) —
    # same shape, same rationale, same Expand-only treatment (ADR-007).
    #
    # Both nullable with NO backfill, and that is deliberate rather than lazy:
    # NULL means "we hold no record of acceptance", which is the truth for
    # every user created before this column existed. Writing a retroactive
    # timestamp would assert she agreed at a moment we cannot evidence — worse
    # than an honest NULL, because it manufactures the very proof the column
    # exists to provide.
    #
    # Stamped on ALL THREE password paths (auth.py): consumer register, producer
    # register, and the MEH-143 producer UPGRADE — which mutates current_user
    # instead of constructing a User, and so fell outside the "enumerate every
    # User(...) site" sweep and shipped briefly with the consent discarded. The
    # right question is which routes COLLECT consent, not which build a User.
    # (This comment said "the two password-registration paths" until the upgrade
    # stamp landed; a stale count here is the same enumeration error that caused
    # the bug, so it is worth keeping exact.) The three OAuth account-creation
    # paths present no checkbox at all, so there is no consent event to record
    # there — see the OAuth gap noted on MEH-1995; a product decision, not a gap.
    # DO NOT expose in UserOut — audit-only (MEH-1995). Deliberately absent from
    # every response schema, admin included. This is STRICTER than the sibling
    # pair, NOT a mirror of it: declared_at / declaration_version ARE admin-
    # visible via ProducerAdminOut (schemas.py:2313-2314), while these two are
    # exposed nowhere. Phrasing matters here — "mirroring the sibling's admin-
    # only treatment" would invite a future ADR-006 R2 parity sweep to "restore
    # parity" by publishing a consent timestamp on an admin payload, which is
    # the exact outcome this comment exists to prevent (docs/DATA.md agrees:
    # "stricter than the sibling pair, which is admin-visible").
    # Both UserOut and UserAdminOut
    # enumerate fields explicitly and Pydantic v2 from_attributes maps only
    # declared fields, so these cannot surface by accident — this comment records
    # the omission as intentional so a future ADR-006 R2 parity sweep does not
    # "fix" it by publishing a consent timestamp on a public profile payload.
    terms_accepted_at = Column(DateTime(timezone=True), nullable=True)
    terms_version = Column(String(10), nullable=True)
    # MEH-206: logout-all-devices. Encoded as `tv` claim in JWT.
    # POST /auth/logout-all-devices increments this; old tokens with a
    # stale `tv` value are rejected. Fail-open: tokens without a `tv`
    # claim (issued before this column) are still accepted.
    token_version = Column(Integer, default=1, nullable=False, server_default="1")
    # MEH-305: timestamp of last password change. Compared against the
    # `iat` claim in get_current_user / /auth/refresh — tokens issued
    # before the password change are rejected. NULL = never changed
    # (or pre-MEH-305 user) — fail-open, no token rejection.
    password_changed_at = Column(DateTime(timezone=True), nullable=True, default=None)
    # MEH-192: email verification. Token is cleared on successful verify.
    email_verified = Column(Boolean, default=False)
    email_verify_token = Column(String(64), nullable=True, index=True)
    email_verify_expires = Column(DateTime, nullable=True)
    # MEH-2644: rescue-bag no-shows. The pilot blocks new reservations after
    # the SECOND no_show inside 30 days, so the window is what decides and
    # `rescue_orders.status` is the authority; this is the cheap denormalised
    # counter the 422 gate checks first, and the number the admin reset
    # endpoint zeroes. NOT NULL DEFAULT 0 — every pre-existing account has
    # had zero no-shows, so there is nothing to backfill.
    rescue_no_show_count = Column(
        Integer, default=0, nullable=False, server_default="0"
    )
    # MEH-2646: when an admin released this buyer's rescue-bag block. The 422
    # gate counts only no-shows whose offer `pickup_end` falls AFTER this
    # moment, so one write releases a buyer without deleting the no-show
    # history the chunk-5 metrics read. NULL = never cleared.
    rescue_block_cleared_at = Column(DateTime, nullable=True)

    # MEH-2974: `foreign_keys` is REQUIRED here, and the requirement arrived
    # with `producers.owner_invite_created_by`. There are now two foreign-key
    # paths between `users` and `producers` — this column, and that one — so
    # SQLAlchemy cannot infer which one joins this relationship and raises
    # AmbiguousForeignKeysError while MAPPING, i.e. on the first ORM query of
    # the process, for every caller, not only the invite's own. Same
    # disambiguation, same reason, as `Product.producer` (:1202, MEH-2137).
    # DO NOT remove it.
    producer = relationship("Producer", foreign_keys="User.producer_id")
    favorites = relationship(
        "Favorite", back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_oauth(self) -> bool:
        """MEH-16: True when the user signed up via OAuth (no local
        password). Consumed by UserOut → /settings to hide the
        password-change form for accounts that have no password_hash.
        """
        return not self.password_hash

    @property
    def oauth_provider(self) -> str | None:
        """MEH-3248: which provider an account without a password signs in
        with, so /settings knows which button confirms a deletion. Google
        wins when both are linked — verify_deletion_credentials checks the
        same order."""
        if self.google_id:
            return "google"
        if self.apple_id:
            return "apple"
        return None


class RetiredSlug(Base):
    """MEH-2528 — a public business URL that must never pass to another row.

    `producers.slug` is UNIQUE, but deletion is a hard delete, so the moment a
    business is deleted (or an admin changes its slug) the old `/p/<slug>` is
    free again and the next business with that name inherits every link still
    circulating in WhatsApp, Instagram and search results. This table is the
    tombstone: `_ensure_unique_slug` (routers/admin.py) treats a retired slug
    exactly like a taken one and suffixes past it.

    `producer_id` is the business that owns the URL's history — set when the
    slug was retired by a rename (the business still exists, so a later 301
    can follow it), NULL when the business was deleted. ON DELETE SET NULL, so
    deleting a renamed business leaves its old URLs reserved, not freed.

    Only slugs that were ever public are retired (`retire_slug` in
    services/retired_slugs.py checks the status): a draft that was never
    approved had no live URL, and reserving its slug would only push a
    re-created business onto `-2`.
    """

    __tablename__ = "retired_slugs"

    slug = Column(String(100), primary_key=True)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reason = Column(String(20), nullable=False)  # deleted | renamed
    retired_at = Column(DateTime, default=utc_now, nullable=False)


class AdminSetting(Base):
    __tablename__ = "admin_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class StaticPage(Base):
    __tablename__ = "static_pages"

    slug = Column(String(50), primary_key=True)  # 'about' | 'terms'
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class Category(Base):
    __tablename__ = "categories"

    # MEH-2139: `slug` is the STABLE identity; `name` is display text and `id`
    # is environment-specific. CategorySelector matched popular/grouping on the
    # Hebrew name, so a rename made a chip vanish silently (MEH-1104 needed a
    # temporary alias to survive one). `id` is no better: it is autoincrement
    # and this repo has measured holes in the sequence that differ between
    # staging and production (seed_data.py :296-308).
    # UNIQUE is applied by the paired revision AFTER its backfill, so it lands
    # on complete data — see a7c3e91d5f28.
    # NOT NULL was DEFERRED out of chunk 1, deliberately and against the
    # ticket's literal chunk split, and chunk 2 (this state) applied it —
    # `nullable=False` below, paired with revision c9f2a41e8b03. The reason for
    # the deferral, kept because it explains the column default that follows:
    # 11 sites construct `Category(name=…, emoji=…)` with no slug — production
    # `admin_extra.py:218` plus 9 tests — so a NOT NULL in chunk 1 would have
    # failed them with `NotNullViolation: null value in column "slug"`
    # (reproduced) for the whole window before those writers learned to
    # generate one. Nullable + UNIQUE cost nothing meanwhile: Postgres allows
    # many NULLs under UNIQUE, the backfill left none behind, and slug matching
    # does not match a NULL.
    # The constraint is NAMED here to match the revision exactly, so
    # `alembic check` compares like with like (same reason as the MEH-2137 FK).
    # DO NOT re-derive the slug from the name on rename: surviving a rename is
    # the entire point.
    __table_args__ = (UniqueConstraint("slug", name="uq_categories_slug"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    # MEH-2139 chunk 2: the default covers every ORM writer — the nine
    # `Category(name=…, emoji=…)` sites under tests/ and anything added later —
    # so NOT NULL does not depend on each of them remembering the column.
    # It does NOT cover a multi-row CORE insert: `seed_data.py`'s `pg_insert`
    # evaluates this default once per statement and raises
    # `KeyError: 'categories.name_m0'`, so that one writer passes slug itself.
    # Measured, and written down in services/category_slug._column_default so
    # nobody "simplifies" the explicit value back out.
    slug = Column(String(50), nullable=False, default=_category_slug_default)
    emoji = Column(String(10))
    # MEH-1456 chunk A: declared ownership ON THE ROW (Oracle Siebel "Protect
    # Seed Data", IBM RDU WRITE_PROTECTED — and, measured 04/09, GBP's closed
    # taxonomy / Etsy's immutable taxonomy_id). TRUE for exactly the rows
    # seed_data.CATEGORIES owns, FALSE for admin-created rows. Two writers, on
    # purpose: revision b7d3e5a9c1f4 backfills existing databases by name
    # (name is UNIQUE and the seed's own conflict key, so a seed-named row IS
    # the seed row); seed_categories writes True on its own INSERT for fresh
    # ones, where migrations run BEFORE the boot seed inserts anything.
    # Two-state by design (NOT NULL + server_default false) — ownership has no
    # "unknown". Chunk 2b makes update_category / delete_category refuse a
    # rename or delete while this is True; chunk A only creates the fact.
    # DO NOT expose this as admin-editable — a flag the second authority can
    #        clear is not a lock (the whole point of the column).
    is_system = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # MEH-3255 (D10): the manufacturer-licence requirement lives on the row,
    # answered when the category is created. EXPAND step — the readers still
    # use constants.LICENSE_REQUIRED_CATEGORIES until the contract PR, and
    # tests/test_meh3255_requires_license_parity.py holds the two equal.
    requires_license = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    producers = relationship(
        "Producer", secondary="producer_categories", back_populates="categories"
    )


class ProducerCategory(Base):
    __tablename__ = "producer_categories"

    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    category_id = Column(
        Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True
    )
    # MEH-1297: 0-based order within the producer's selection; 0 = primary.
    # server_default text("'0'") mirrors the migration ADD so `alembic check`
    # sees no model↔schema drift.
    position = Column(Integer, nullable=False, server_default=text("'0'"))


# --- Re-exports (MEH-3269) -------------------------------------------------
# The classes below live in sibling modules, one per area. They are imported
# here, at the bottom, for two reasons: every `from app.models.models import X`
# keeps working, and importing this module still registers every table on
# `Base.metadata` and every class for string-named relationships.
from app.models.admin_ops import (  # noqa: E402
    AdminAuditLog as AdminAuditLog,
    AdminChecklistItem as AdminChecklistItem,
    AlembicLineage as AlembicLineage,
    CategoryRequest as CategoryRequest,
    InboundMessage as InboundMessage,
    KashrutBadgeRequest as KashrutBadgeRequest,
    OutboundMessage as OutboundMessage,
    OutreachLead as OutreachLead,
    PhoneOtpToken as PhoneOtpToken,
    ProducerNameChangeRequest as ProducerNameChangeRequest,
    ProducerReviewCheck as ProducerReviewCheck,
)
from app.models.analytics import (  # noqa: E402
    ContactClick as ContactClick,
    ProducerAnalyticsDaily as ProducerAnalyticsDaily,
    ProducerPageView as ProducerPageView,
    ProducerWhatsAppClick as ProducerWhatsAppClick,
)
from app.models.catalog import (  # noqa: E402
    DeliveryArea as DeliveryArea,
    ProducerLocation as ProducerLocation,
    ProducerOffer as ProducerOffer,
    Product as Product,
)
from app.models.engagement import (  # noqa: E402
    AlertLog as AlertLog,
    ContactMessage as ContactMessage,
    DeliveryWaitlistEntry as DeliveryWaitlistEntry,
    Favorite as Favorite,
    FavoriteAlert as FavoriteAlert,
    NewsletterSubscriber as NewsletterSubscriber,
    ProducerReview as ProducerReview,
    Report as Report,
    SAVED_ITEM_TYPES as SAVED_ITEM_TYPES,
    SavedItem as SavedItem,
    SearchQuery as SearchQuery,
)
from app.models.events import (  # noqa: E402
    Event as Event,
    Experience as Experience,
    GroupBuy as GroupBuy,
    GroupBuyCommit as GroupBuyCommit,
    REGISTRATION_METHODS as REGISTRATION_METHODS,
    Registration as Registration,
)
from app.models.home_products import (  # noqa: E402
    HomeProduct as HomeProduct,
    HomeProductRating as HomeProductRating,
    HomeProductWhatsAppClick as HomeProductWhatsAppClick,
)
from app.models.recipes import (  # noqa: E402
    ProducerRecipe as ProducerRecipe,
    producer_recipe_products as producer_recipe_products,
)
from app.models.rescue import (  # noqa: E402
    RESCUE_MAX_QTY_PER_OFFER as RESCUE_MAX_QTY_PER_OFFER,
    RESCUE_MAX_QTY_PER_ORDER as RESCUE_MAX_QTY_PER_ORDER,
    RESCUE_OFFER_STATUSES as RESCUE_OFFER_STATUSES,
    RESCUE_ORDER_STATUSES as RESCUE_ORDER_STATUSES,
    RescueNoShowTombstone as RescueNoShowTombstone,
    RescueOffer as RescueOffer,
    RescueOrder as RescueOrder,
    RescueReview as RescueReview,
    RescueTypicalItems as RescueTypicalItems,
    _check_in as _check_in,
)


# MEH-3218: the on-site ordering tables live in their own module (this file was
# on the file-size baseline then). Imported here, at the end, so that everything
# importing models.py — Alembic's env.py included — registers them on
# Base.metadata. It sits at the end only to keep the model definitions above
# free of a mid-file import; product_orders.py imports nothing from this file,
# so there is no cycle either way.
import app.models.product_orders  # noqa: E402,F401
