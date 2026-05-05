# מהמקור — Schema Parity Audit

**Source:** MEH-433 (audit baseline)
**Baseline date:** 2026-05-05
**Layers covered:** DB (SQLAlchemy ORM) ↔ API (Pydantic v2) ↔ Frontend (Zod / implicit)
**Domains covered:** Producer, User, Product, Event, Review

---

## Purpose

Document the current state of schema-parity discipline across the 3 layers
that own each domain. Cite drift with `file:line` evidence, classify by
severity, and tie remediation to Linear tickets so future regressions
have a paper trail.

Per ADR-006, this document is the canonical baseline that the 5
enforcement rules (R1–R5) reference. Re-audit cadence at the bottom.

---

## Layer file inventory (`wc -l`, 2026-05-05)

| Path | Lines | Notes |
|---|---|---|
| `backend/app/models/models.py` | 897 | Monolithic ORM — all 5 domains |
| `backend/app/models/__init__.py` | 63 | Re-exports |
| `backend/app/schemas/schemas.py` | 1069 | Pydantic v2 — but Event + Review schemas are absent (see drift #2) |
| `backend/app/schemas/password.py` | 39 | `PasswordField` (12-char floor, MEH-306) |
| `backend/app/schemas/__init__.py` | 0 | Empty |
| `frontend/lib/schemas.js` | 38 | Zod — only ProducerSchema + 2 geo schemas |

Plus router-embedded Pydantic (architecture violation, see drift #2):
- `routers/events.py:34–107` — EventCreate / EventUpdate / EventOut
- `routers/reviews.py:93–136` — ReviewCreateNested / ReviewOut / AdminReviewOut / ReviewsPage

---

## Domain 1 — Producer

DB: `models.py:40–142` (60 columns).
API: `ProducerListOut` (`schemas.py:380–465`, 30+ public fields) + `ProducerDetailOut` (`schemas.py:468–485`, adds 8). Inputs: `ProducerCreate` (`schemas.py:174–184`), `ProducerAdminCreate` (`schemas.py:187–248`), `ProducerUpdate` (`schemas.py:276–377`), `ProducerRegister` (`schemas.py:41–73`).
Frontend: `ProducerSchema` Zod (`frontend/lib/schemas.js:7–17`, **9 fields**) + implicit usage in `ProducerCard.jsx:55–210`.

| Field | DB column | Pydantic input | Pydantic output | Frontend | Drift? |
|---|---|---|---|---|---|
| id | UUID PK (m:43) | — | UUID (s:381) | `id` (sch.js:8 union str/num) | ✓ |
| name | String(200) NOT NULL (m:44) | str (s:175, 189) | str (s:382) | `name` (sch.js:9) | ✓ |
| description | Text (m:46) | str\|None (s:176) | str\|None (s:383) | implicit | ✓ |
| short_description | Text (m:47) | str\|None (s:192, 280) | str\|None (s:384) | implicit | ✓ |
| city | String(100) (m:48) | str\|None (s:177) | str\|None (s:385) | `city` (sch.js:13) | ✓ |
| lat / lng | Float (m:49–50) | float\|None (s:178–179) | float\|None (s:386–387) | `lat` / `lng` (sch.js:10–11) | ✓ |
| phone | String(20) (m:51) | str\|None (s:180) | str\|None (s:414) | `phone` (sch.js:12) | ✓ |
| starting_price_label | String(50) (m:73) | not in Create; in Update (s:293) | str\|None (s:393) | `producer.starting_price_label` (ProducerCard:195) | INFO — explicitly "legacy alias" (m:73), still in 3 layers |
| availability_state | String(32) NOT NULL default `'accepting_orders'` (m:92–96) | str\|None (s:323) | str default (s:408) | `producer.availability_state` (ProducerCard:57) | INFO — mid-migration (MEH-291, Phase 4 pending) |
| availability_status | String(20) default `'available'` (m:88) | str\|None (s:320) | str default (s:405) | `producer.availability_status` (ProducerCard:63) | INFO — same MEH-291 overlap |
| is_available_today | Boolean default False (m:84) | bool\|None (s:307) | bool default (s:403) | `producer.is_available_today` (ProducerCard:64) | INFO — same MEH-291 overlap (3 fields express same concept) |
| has_physical_location | Boolean NOT NULL (m:104) | bool default True (s:222, 313) | bool default True (s:440) | implicit | ✓ |
| offers_delivery | Boolean NOT NULL (m:105) | bool default False (s:223, 314) | bool default False (s:441) | implicit | ✓ |
| delivery_nationwide | Boolean NOT NULL (m:107) | bool default (s:224, 315) | bool default (s:442) | implicit | ✓ |
| delivery_cities | ARRAY(Text) NOT NULL (m:108) | list[str] default [] (s:225, 316) | list[str] default [] (s:443) | implicit | ✓ |
| custom_questions | ARRAY(Text) NULL (m:121) | list[str]\|None (s:318) | list[str]\|None (DetailOut:483) | implicit | ✓ |
| rejection_reason | Text NULL (m:126) | — | exposed via `UserOut.producer_rejection_reason` (s:552) | implicit | INFO — proxy through UserOut, intentional |
| admin_notes | Text NULL (m:83) | str\|None (s:214, 303) | **excluded** from public Out | `admin_notes` only on admin form (admin/ProducerForm.jsx:43, 89, 620) | ✓ — correct boundary |
| avg_rating / reviews_count | Float / Int (m:110–111) | — | float / int (s:423–424) | `producer.avg_rating` / `reviews_count` (ProducerCard:206–210) | ✓ |
| favorites_count | (denormalized via query, no column) | — | int default 0 (s:431) | `producer.favorites_count` (ProducerCard:185) | ✓ — computed |
| trust_tier / phone_verified / ambassador / kashrut_badges / kashrut_verified_at / kashrut_expires_at | (m:114–119) | — | (s:433–438) | implicit (BadgeRow.jsx) | ✓ |
| last_active_at | DateTime (m:113) | — | **not in Out** | not used | ✓ — internal v2 metric |
| story_card_url | String(500) NULL (m:69) | — | DetailOut only (s:479) | implicit | ✓ |
| opening_hours | String NULL (m:100) | — | DetailOut only (s:481) | implicit | ✓ |
| ProducerRegister.password | (writes to User.password_hash) | str\|None min_length=8 (s:50) | — | — | **BLOCK** — see drift #1 |

(Producer has ~10 more boolean filter fields — grass_fed, organic_certified, gluten_free, vegan, lactose_free, has_delivery, pickup_points, kosher, is_recommended — all align cleanly across DB / Update / Out / implicit frontend.)

---

## Domain 2 — User

DB: `models.py:145–202` (23 columns).
API: `UserOut` (`schemas.py:531–556`, 14 public fields). Inputs: `UserRegister` (`schemas.py:12–21`), `LoginRequest` (`schemas.py:95–97`).
Frontend: no Zod schema; implicit in `auth-context.js` + `app/settings/page.jsx:68–267`.

| Field | DB column | Pydantic input | Pydantic output | Frontend | Drift? |
|---|---|---|---|---|---|
| id | UUID PK (m:148) | — | UUID (s:532) | implicit | ✓ |
| email | String(200) UNIQUE NOT NULL (m:149) | EmailStr (UserRegister s:13; ProducerRegister s:45) | str (s:533) | `user.email` (settings:267) | ✓ |
| name | String(200) NOT NULL (m:150) | str (s:14, 46) | str (s:534) | `user.name` (settings:266) | ✓ |
| password_hash | String(200) NULL (m:151) | (writes via password) | **excluded** | — | ✓ — correct boundary |
| city | String(100) (m:152) | str\|None (s:20) | str\|None (s:535) | implicit | ✓ |
| phone | String(20) (m:153) | str\|None (s:21) | str\|None (s:536) | implicit | ✓ |
| role | String(20) default `'consumer'` (m:154) | — | str (s:537) | `user.role` (settings:68) | ✓ |
| producer_id | UUID FK NULL (m:155) | — | UUID\|None (s:538) | `user.producer_id` (ProducerCard:104) | ✓ |
| google_id / apple_id | String UNIQUE NULL (m:156–157) | (writes via OAuth payload) | **excluded** | — | ✓ — correct boundary |
| is_blocked | Boolean default False (m:158) | — | **excluded** | — | INFO — intentional gap; admin-only signal |
| is_oauth (computed) | (Property `not password_hash`, m:196–202) | — | bool default False (s:542) | `user.is_oauth` (settings:177) | ✓ |
| is_producer | Boolean default False (m:170) | — | bool default False (s:544) | `user.is_producer` (settings:68) | ✓ |
| referral_code | String(20) UNIQUE NULL (m:167) | — | str\|None (s:545) | implicit | ✓ |
| avatar_url | String NULL (m:173) | — | str\|None (s:547) | `user.avatar_url` (settings:244) | ✓ |
| email_verified | Boolean default False (m:189) | — | bool default False (s:554) | implicit | ✓ |
| reset_token / reset_token_expires_at | (m:176–177) | — | **excluded** | — | ✓ |
| token_version | Integer default 1 NOT NULL (m:182) | — | **excluded** (claim `tv` in JWT only) | — | ✓ |
| password_changed_at | DateTime NULL (m:187) | — | **excluded** (used in `iat` comparison) | — | ✓ |
| email_verify_token / email_verify_expires | (m:190–191) | — | **excluded** | — | ✓ |
| last_active_at | DateTime indexed (m:164) | — | **excluded** | — | ✓ — admin-only metric |
| created_at | DateTime (m:159) | — | **excluded** | — | INFO — not in UserOut; possibly want for "member since" UI later |
| producer_status (proxy from User.producer.status) | — | — | str\|None (s:551) | implicit | ✓ — synthesized |
| producer_rejection_reason (proxy from User.producer.rejection_reason) | — | — | str\|None (s:552) | implicit | ✓ — synthesized |

---

## Domain 3 — Product

DB: `models.py:273–283` (6 columns).
API: `ProductCreate` (`schemas.py:139–148`), `ProductUpdate` (`schemas.py:151–160`), `ProductOut` (`schemas.py:163–170`).
Frontend: no Zod; implicit at `app/settings/page.jsx:907–923` and `app/producer/[id]/components/ProducerSections.jsx:153–177`.

| Field | DB column | Pydantic input (Create) | Pydantic output | Frontend | Drift? |
|---|---|---|---|---|---|
| id | UUID PK (m:276) | — | UUID (s:164) | `product.id` (settings:907) | ✓ |
| producer_id | UUID FK NOT NULL (m:277) | **not in ProductCreate** | **not in ProductOut** | — | INFO — set server-side from URL/auth (common REST pattern, not a true drift) |
| name | String(200) NOT NULL (m:278) | str (s:140) | str (s:165) | `product.name` (settings:918) | ✓ |
| description | Text (m:279) | str\|None (s:141) | str\|None (s:166) | `product.description` (sections:174) | ✓ |
| price_range | String(50) (m:280) | str\|None (s:142) | str\|None (s:167) | `product.price_range` (settings:919) | ✓ |
| image_url | Text (m:281) | str\|None max_length=500 (s:143) | str\|None (s:168) | `product.image_url` (settings:910, sections:159) | ✓ |

Product has the cleanest parity of the 5.

---

## Domain 4 — Event

DB: `models.py:466–487` (16 columns).
API: **schemas live in `routers/events.py`, NOT in `schemas/schemas.py`** — `EventCreate` (`events.py:34–57`), `EventUpdate` (`events.py:60–84`), `EventOut` (`events.py:87–107`).
Frontend: no Zod; implicit at `app/events/EventsClient.jsx:317–334` and `app/events/[id]/page.js:81–102`.

| Field | DB column | Pydantic input (Create) | Pydantic output | Frontend | Drift? |
|---|---|---|---|---|---|
| id | UUID PK (m:469) | — | UUID (e:88) | implicit | ✓ |
| producer_id | UUID FK NOT NULL (m:470) | **not in Create** | UUID (e:89) | implicit | INFO — set from `current_user.producer_id` (handler) |
| producer_name | (relationship; not a column) | — | str\|None (e:90; serializer e:114) | implicit | ✓ — joined |
| title | String(300) NOT NULL (m:471) | str (e:35) | str (e:91) | implicit | ✓ |
| description | Text (m:472) | str\|None (e:36) | str\|None (e:92) | implicit | ✓ |
| event_date | Date NOT NULL (m:473) | date (e:37) | date (e:93) | `event.event_date` (Client:317) | ✓ |
| event_time | Time NULL (m:474) | time\|None (e:38) | time\|None (e:94) | `event.event_time` (Client:318; `[id]:92` slices `:5`) | ✓ |
| location | String(300) (m:475) | str\|None (e:39) | str\|None (e:95) | `event.location` (`[id]:94`) | ✓ |
| city | String(100) (m:476) | str\|None (e:40) | str\|None (e:96) | implicit | ✓ |
| lat / lng | Float (m:477–478) | float\|None (e:41–42) | float\|None (e:97–98) | implicit | ✓ |
| image_url | Text (m:479) | str\|None (e:43) | str\|None (e:99) | implicit | ✓ |
| category | String(30) NOT NULL (m:480) | str min/max (e:44) | str (e:100) | `event.category` (Client:331) | ✓ |
| price | Integer default 0 (m:481) | int default 0 (e:45) | int (e:101; serializer casts `int(event.price or 0)` e:125) | `event.price` (Client:334) | ✓ |
| max_participants | Integer NULL (m:482) | int\|None (e:46) | int\|None (e:102) | implicit | ✓ |
| registration_url | String(500) NULL (m:483) | str\|None (e:47) | str\|None (e:103) | implicit | ✓ |
| is_active | Boolean default True (m:484) | — (Update only e:74) | bool (e:104) | implicit | ✓ |
| created_at | DateTime (m:485) | — | datetime (e:105) | implicit | ✓ |

Event has clean field parity. The discipline drift is the schema **location** (drift #2).

---

## Domain 5 — Review (ProducerReview)

DB: `models.py:586–606` (8 columns).
API: **schemas live in `routers/reviews.py`** — `ReviewCreateNested` (`reviews.py:93–100`), `ReviewOut` (`reviews.py:103–112`), `AdminReviewOut` (`reviews.py:115–127`).
Frontend: no Zod; implicit at `frontend/components/ProducerReviews.jsx:200–230` and `frontend/components/ReviewsSection.jsx:289`.

| Field | DB column | Pydantic input (Create) | Pydantic output (ReviewOut) | Frontend | Drift? |
|---|---|---|---|---|---|
| id | UUID PK (m:596) | — | UUID (r:104) | `review.id` (ProducerReviews:205) | ✓ |
| producer_id | UUID FK NOT NULL (m:597) | (URL path) | UUID (r:105) | implicit | ✓ |
| user_id | UUID FK NOT NULL (m:598) | (current_user) | UUID (r:106) | implicit | ✓ |
| user_name | (relationship) | — | str\|None (r:107; serializer r:167) | `review.user_name` (ProducerReviews:215) | ✓ — joined |
| stars | Integer NOT NULL (m:599) | int 1≤x≤5 (r:94) | int (r:108) | `review.stars` (ProducerReviews:207, 210) | ✓ |
| **title** | **String(200) NULL (m:600)** | **— (missing)** | **— (missing in ReviewOut r:103–112)** | **`review.title` rendered as `<h4>` (ProducerReviews.jsx:223–224)** | **WARN — 3-layer drift; title is dead code** |
| body | Text NULL (m:601) | str min/max 10–500 (r:95) | str\|None (r:109) | `review.body` (ProducerReviews:226–228; ReviewsSection:289) | ✓ |
| is_hidden | Boolean default False (m:602) | — | **only in AdminReviewOut (r:124)** | not used | ✓ — admin-only |
| created_at | DateTime (m:603) | — | **`str` type** (r:110; serializer `.isoformat()` r:170) | `new Date(review.created_at)` (ProducerReviews:218) | INFO — type-mismatch with rest of codebase (other Out schemas use `datetime`, e.g. EventOut:105, ProducerDetailOut:477, HomeProductOut:735) |

---

## Drift Inventory (severity-ordered)

### 1. Producer registration password floor — 8 chars — **BLOCK**

- `schemas.py:50` (`ProducerRegister.password: str | None = Field(default=None, min_length=8, max_length=200)`)
- `auth.py:252–301` (`register_producer` handler) does **not** call `await validate_password(data.password)`.
- Compare: `auth.py:215` (consumer `/auth/register`) **does** call `await validate_password(data.password)` per MEH-306.
- Compare: `UserRegister.password: PasswordField` (`schemas.py:19`) — 12-char floor (`password.py`).
- Outdated comment at `schemas.py:47–49` claims "same 8-char minimum as /register" — true pre-MEH-306, false now.
- **Impact:** a new producer account created via `/auth/register/producer` can have an 8-char password, with no HIBP check, no deny-list, no reuse check. Same User row → same JWT issuance → security regression vs consumer.
- **Tracking:** MEH-457 (P1 Urgent).

### 2. Event + Review Pydantic schemas live in router files — **INFO** (architecture drift)

- `routers/events.py:34, 60, 87` — EventCreate / Update / Out (74 lines of schemas inside the router).
- `routers/reviews.py:93, 103, 115, 130` — ReviewCreateNested / ReviewOut / AdminReviewOut / ReviewsPage.
- Compare: `docs/ARCHITECTURE.md:43` ("Change API I/O shape | `backend/app/schemas/schemas.py`").
- Compare: every other domain (Producer, User, Product, HomeProduct, Experience, Recipe, GroupBuy, OutreachLead, CategoryRequest) has its schemas in `schemas/schemas.py`.
- **Tracking:** MEH-458 (P2 High) — also adds R1 enforcement test.

### 3. Review.title — 3-layer drift; dead frontend code — **WARN**

- DB: `models.py:600` (`title = Column(String(200), nullable=True)`).
- API input: `reviews.py:93–100` `ReviewCreateNested` has only `stars` + `body`. No `title`.
- API output: `reviews.py:103–112` `ReviewOut` has no `title`. Serializer `reviews.py:162–171` doesn't read it.
- Frontend: `ProducerReviews.jsx:223–224` renders `{review.title && <h4>{review.title}</h4>}` — always falsy → never renders.
- Pure dead code on the FE; pure dead column on the DB. UX intent (review titles) lost without a ticket trail.
- **Tracking:** MEH-459 (P3 Medium) — drop or wire through; one decision.

### 4. `ReviewOut.created_at` typed as `str`, not `datetime` — **INFO**

- `reviews.py:110` (`created_at: str`).
- `reviews.py:170` (serializer `review.created_at.isoformat() if review.created_at else ""`).
- Compare: `EventOut.created_at: datetime` (`events.py:105`), `ProducerDetailOut.created_at: datetime` (`schemas.py:477`), `HomeProductOut.created_at: datetime` (`schemas.py:735`), `OutreachLeadOut.created_at: datetime` (`schemas.py:949`). All others let Pydantic serialize ISO-8601 automatically.
- The `else ""` branch produces an empty string, which `new Date("")` on the frontend (`ProducerReviews.jsx:218`) renders as `Invalid Date` — silent UI bug if a review row ever has NULL `created_at` (defensive coding making it worse than `null`).
- **Documented baseline.**

### 5. Frontend has Zod for Producer only — covers 9 of ~30 fields — **INFO**

- `frontend/lib/schemas.js:7–17` — `ProducerSchema` validates `id, name, lat, lng, phone, city, is_verified, plan, images`.
- `ProducerListOut` (`schemas.py:380–465`) emits 30+ public fields.
- Component reads ~20 more (e.g. `ProducerCard.jsx:55–210` uses `availability_state, availability_status, is_available_today, slug, price_range, starting_price_label, reviews_count, avg_rating, favorites_count, is_verified, is_recommended, ...`).
- Per the file's own comment (`schemas.js:22`), Zod is used as a "belt-and-braces safety net" only for map API calls — not as the type system. Documented but still a discipline gap.
- **Documented baseline.**

### 6. Frontend has zero Zod schemas for User / Product / Event / Review — **INFO**

- `frontend/lib/schemas.js` exports only `ProducerSchema`, `GeoSearchSchema`, `CoordSchema` (38 lines total).
- Implicit usage via `axios` responses; no validation at the API boundary on the frontend for these 4 domains.
- Stack is JS (not TS), so there's no compile-time guarantee either.
- **Documented baseline.**

### 7. Producer.starting_price_label — incomplete deprecation — **INFO**

- `models.py:73` ("legacy alias for price_range").
- `ProducerListOut:393` still emits it; `ProducerUpdate:293` still accepts it.
- `ProducerCard.jsx:195` uses fallback `producer.price_range || producer.starting_price_label`.
- Removing it is safe (fallback chain on FE) but no ticket tracks the removal.
- **Documented baseline.**

### 8. MEH-291 mid-migration — 3 fields express the same concept — **INFO**

- DB: `is_available_today`, `availability_status`, `availability_state` (`models.py:84, 88, 92`).
- All 3 mirrored in `ProducerListOut:403, 405, 408` and used on `ProducerCard.jsx:57, 63, 64`.
- Phase 4 (drop the two legacy fields) gated on R2 backups + 7-day soak per HANDOFF.md MEH-291 entry. Not new drift; documented dual-write.
- **Documented baseline** — converges when MEH-291 Phase 4 ships.

### 9. `ProductCreate` has no `producer_id` field — **INFO** (intentional)

- `schemas.py:139–148` — fields are `name, description, price_range, image_url`.
- `models.py:277` — `producer_id` is NOT NULL.
- The handler must set it from URL path (`/producers/{id}/products`) or `current_user.producer_id`. Common REST pattern; flagged for completeness, not as drift.
- **Documented baseline.**

### 10. `User.created_at` not exposed in `UserOut` — **INFO**

- `models.py:159` exists; `UserOut` (`schemas.py:531–556`) excludes it.
- No "member since" UI today, but expected for any future user-profile expansion.
- **Documented baseline.**

### 11. `User.is_blocked` not exposed in `UserOut` — **INFO**

- `models.py:158` exists; `UserOut` excludes it.
- Probably intentional (admin-only signal, not on `/auth/me`), but worth confirming the moderation flow surfaces it somewhere admin-facing.
- **Documented baseline** — verify in admin panel review.

---

## Recommended Discipline (R1–R5)

**R1 — All Pydantic schemas live in `backend/app/schemas/schemas.py` (or domain files inside `schemas/`).** No router-embedded `BaseModel` subclasses. Enforcement: a `pytest` test that walks every `routers/*.py`, AST-parses, and asserts no `class X(BaseModel)` outside `schemas/`. Blocks drift #2 from recurring.

**R2 — Schema-parity test per domain.** For each ORM model, a generated test asserts: every non-internal column appears in the corresponding `*Out` schema (or is on an explicit "internal-only" allowlist with a citation). Internal allowlist per domain stored in `schemas/_parity.json`. Blocks drift #3 (missing field) and #11 (silent omission) from recurring; flags new drifts immediately when models are edited.

**R3 — One auth policy entrypoint.** Every endpoint that creates a `User` row (write-path `User.password_hash`) MUST go through `app.services.password_policy.validate_password`. Enforced by a unit test that: `grep`s for `password_hash =` writes in routers, asserts the same handler also calls `validate_password`. Closes drift #1.

**R4 — Datetime fields in `*Out` schemas use `datetime` type, never `str`.** Pydantic serializes ISO-8601 automatically. Lint rule: a `pytest` parameterized over every `*Out` class, asserting `created_at` / `updated_at` / `*_at` annotations are `datetime | None`, not `str`. Closes drift #4.

**R5 — Frontend "implicit-shape" inventory.** A single `frontend/lib/api-types.md` doc lists every domain with its expected response shape (linked back to the Pydantic class). It's a lighter alternative to full Zod schemas (we are JS, not TS, and the existing comment in `schemas.js:22` correctly frames Zod as belt-and-braces, not type system). When a new field appears in `*Out`, the PR template requires updating the corresponding row in `api-types.md`. Closes drifts #5 and #6 without rewriting the stack.

---

## Re-audit cadence

Next baseline review: **30 days post-launch OR after any major schema change.**

A "major schema change" means:
- A new Linear ticket adding ≥ 5 columns across ≥ 2 tables, OR
- Any Alembic revision that adds a new top-level domain, OR
- The MEH-291 Phase 4 cleanup landing (which retires drift #8 and changes the Producer parity table materially).

Whoever runs the next audit: clone this file's structure, replace the dated baseline header, re-run `wc -l` on the layer files, and re-execute the per-domain parity check. Carry forward only drift findings that still exist; close out items whose tickets have shipped.
