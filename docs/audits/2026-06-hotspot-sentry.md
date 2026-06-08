# Hotspot + Sentry Audit — 2026-06-07 (overnight)

> Autonomous overnight bug-hunt. Two complementary read-mostly passes:
> **Task 1** = Sentry production/staging mining (`SEN-` series).
> **Task 2** = git-hotspot-targeted deep review, top-10 churn×complexity
> files, one read-only subagent per file (`HOT-` series).
> Dedup against `2026-06-full-audit.md` (AUD-001..056) +
> `2026-06-ui-states-audit.md` (UIS-001..024) — only genuinely NEW
> findings get `HOT-`/`SEN-` ids.
>
> **Lane discipline (this session):** owned tonight by the fix-wave =
> `schema / auth / workflows / WhatsApp / availability`. Findings in
> those territories are **finding-only** (no fix here). Mechanical,
> single-cause, locally-verifiable fixes *outside* those territories were
> authorized — see **Phase C** for why fixes were deferred to
> Sapir-reviewed follow-ups rather than auto-shipped overnight.
>
> All PRs from this session are **DRAFT**.

---

## תקציר מנהלים (Hebrew exec summary)

סריקת לילה משולבת: כרייה מ-Sentry + ביקורת עומק ממוקדת-hotspots.

**הממצא הקריטי (HOT-001):** דליפת מידע. הנתיב `GET/PUT /producers/me`
מחזיר `ProducerAdminOut` שכולל את `risk_score` ו-`risk_reasoning` —
ציון הסיכון הפנימי של ה-AI וההנמקה החופשית בעברית. כלומר **בעל העסק
שמדורג לסיכון יכול לקרוא את הציון שלו ואת ההנמקה** (שעלולה לחשוף את
הלוגיקה של זיהוי הונאות). אומת ידנית. דורש מודל-תגובה נפרד ל-self-serve.
טריטוריית schema → תיקון אצל ספיר.

**Sentry — תמונת מצב:** Frontend נקי (0 issues). Backend = 19 issues:
- **SEN-001 (≈500 events):** `QueuePool limit ... timed out` — מיצוי
  connection-pool בפרץ לפני 23 יום בכל ה-endpoints. ה-engine לא מכוון
  (`pool_size` ברירת-מחדל 5+10). config/infra → ספיר.
- **SEN-002/003 (ACTIVE):** `ForeignKeyViolation` (מחיקת producer) +
  `NotNullViolation` (phone_otp_tokens) — **כבר תוקנו בקוד** (PR #946,
  MEH-747/755) אבל ה-release בפרודקשן (`4ab691a`) קודם לתיקון → ידרשו
  deploy + resolve ב-Sentry. מאשרים את HOT-004 (פער schema עדיין קיים).
- **SEN-004 (ACTIVE, 6 users):** slowapi מדלג על rate-limit per-email
  כש-email ריק (`/auth/register/producer`). auth → ספיר.
- **SEN-005 (ACTIVE):** Anthropic "credit balance too low" — config
  (להוסיף קרדיט). ה-fail-open תופס אותו (אין נזק למשתמש) אבל
  אינטגרציית Sentry מדווחת `handled:no` → רעש.
- **SEN-007/008:** רעש (CancelledError בעת deploy + issue-בדיקה
  MEH-500) → ignore/resolve.

**Hotspot deep-review — הבולטים:** force-approve של עסק שנדחה דרך כפתור
toggle (HOT-002, HIGH), קריסת 500 מ-validators מוערמים על שדה title
(HOT-003, HIGH), פערי FK ברמת ה-schema שאומתו ע"י פרודקשן (HOT-004,
HIGH), היעדר ולידציית Zod לפני קריאות map (HOT-005, HIGH, חוק 19),
JSON-LD עיוור-locale ש-duplicate על HE/EN (HOT-006, HIGH).

---

## Task 1 — Sentry mining

Org `df7d71a2ad7a` (region `https://us.sentry.io`). Projects:
`javascript-nextjs` (frontend) + `mehamakor-backend`. Pulled
`is:unresolved` sorted by frequency.

- **Frontend (`javascript-nextjs`): 0 unresolved.** Clean.
- **Backend (`mehamakor-backend`): 19 unresolved.**

Prod release at time of capture: `4ab691ad9f2166315aeb73e0f02baa026224d57e`
(PR #932). OTP/FK fix PR #946 (`5e5cace`) confirmed **NOT** an ancestor of
that release → explains the still-active 06-05 events on SEN-002/003.

### SEN-001 — QueuePool exhaustion (connection-pool timeout) · REAL / CONFIG · ~500 events
`TimeoutError: QueuePool limit of size 5 overflow 10 reached, connection
timed out, timeout 30.00`. Spread across **11 issues / every endpoint**
(`/producers/{id}` 270, `/producers` 192, `/cities` 8, `/categories` 8,
`/stats` 5, `/events/upcoming` 5, `/home-products` 5, `/auth/register` 2,
`/events` 2, `/search` 2, `/holiday-mode` 1). All first **and** last seen
~23 days ago → one burst, no recurrence since.

- **Root cause:** `backend/app/database.py:14-18` `create_engine(...)` sets
  only `pool_pre_ping=True` — **no `pool_size`, no `max_overflow`, no
  `pool_recycle`**. The error string literally reports the SQLAlchemy
  defaults (size 5 + overflow 10 = 15 max). A load spike (or a transient
  slow-DB window) exhausted all 15 and queued requests timed out at 30s.
- **Cross-ref:** amplified by N+1 / connection-holding loops —
  `admin.py:65-81 _ensure_unique_slug` (HOT-016), admin list endpoints.
- **Class:** config/infra (MEH-744-class). **→ Sapir.** Fix direction
  (needs Railway-Postgres `max_connections` knowledge before picking
  numbers): set `pool_size`/`max_overflow` deliberately + `pool_recycle`
  (Railway drops idle conns) + `pool_timeout`. Picking sizes blindly can
  exhaust Postgres `max_connections` → **not** a blind auto-fix.

### SEN-002 — ForeignKeyViolation `users_producer_id_fkey` on producer delete · REAL, ALREADY FIXED · 7 events, 2 users, ACTIVE (last 06-05)
`DELETE /admin/producers/{id}` → `admin.py:311 db.commit()` →
`update or delete on producers violates users_producer_id_fkey`.
- **Status:** fixed in code by **MEH-747** (`admin.py:319-324` nullifies
  `User.producer_id`) — but the fix (PR #946) is **not in prod release
  `4ab691a`**. Production evidence **upgrades HOT-004** (schema FK still
  bare; router-only patch).
- **→ Sapir:** deploy staging→main, then resolve SEN-002.

### SEN-003 — NotNullViolation `phone_otp_tokens.producer_id` · REAL, ALREADY FIXED · 3 events (J+K), ACTIVE (06-05)
`/auth/me` + `/admin/producers/{id}`. Fixed by **MEH-755**
(`admin.py:332` + `auth.py:1286` explicit OTP pre-delete). Same
not-yet-in-prod situation as SEN-002. Confirms HOT-004 (the
`passive_deletes` schema gap remains; only router code patched).
- **→ Sapir:** deploy + resolve.

### SEN-004 — slowapi skips per-email rate-limit on empty key · REAL (minor) · 8 events, 6 users, ACTIVE (06-05)
`Skipping limit: 5 per 15 minute. Empty value found in parameters.`
`logger: slowapi`, `level: error`, route `/auth/register/producer`.
- **Root cause:** `rate_limit.py:85 email_from_body` returns `""` when the
  body has no/empty/non-string email; slowapi treats `""` as "skip this
  limit" and logs at error level. The IP-keyed limit (`auth.py:378
  3/hour`) still applies, so this is **not** a full bypass — but (a) the
  per-email bucket collapses to one shared `""` bucket, and (b) it floods
  Sentry as `error`. Cross-link: auth deep-review #1/#2.
- **Territory: AUTH → finding-only / Sapir.** Direction: fall back to IP
  when email empty, or lower the slowapi log level.

### SEN-005 — Anthropic "credit balance too low" (BadRequestError 400) · CONFIG-ENV · 5 events, 3 users, ACTIVE (06-05)
`/auth/register/producer`, span `ai.messages.create.anthropic`,
`mechanism: anthropic`, `handled: no`.
- **Analysis:** the only AI calls in the registration path are
  **BackgroundTasks** — `score_producer` (`auth.py:144,253`) and it is
  **fail-open** (`producer_risk.py:211 except Exception → (None,None)`),
  as is `bio_generator`. So **registration succeeds; risk_score is just
  left NULL — no user impact.** The 400 reaches Sentry only because the
  SDK auto-instrumentation captures it at the SDK boundary as
  `handled:no` *before* the app's `except` swallows it.
- **Two actions:** (1) **config → Sapir:** top up Anthropic credits
  (MEH-744-class verbatim). (2) **noise:** consider `before_send` /
  integration tuning so fail-open-caught AI errors don't page as
  `handled:no`.

### SEN-006 — WhatsApp producer-welcome FAILED · WHATSAPP-OWNED · 2 events
`[WHATSAPP] Producer welcome FAILED for ***7823`, `/auth/register/producer`.
Territory WhatsApp → **finding-only / Sapir verbatim.**

### SEN-007 — `asyncio.CancelledError` in lifespan receive · NOISE · 1 event (staging)
Normal uvicorn lifespan cancellation during a deploy/restart.
**Suggest ignore-rule** (`uvicorn.error` lifespan CancelledError). Do not fix.

### SEN-008 — `RuntimeError: [MEH-500] Sentry verification — delete after confirm` · NOISE · 1 event
Deliberate verification issue. **Resolve/delete in Sentry.** Not a bug.

### Sentry → existing-finding links
| Sentry | Links to | Effect |
|---|---|---|
| SEN-002 (FK violation, prod) | HOT-004 (schema FK gap) | production evidence — upgrades HOT-004 to HIGH |
| SEN-003 (NotNull, prod) | HOT-004 (`passive_deletes`) | same |
| SEN-004 (slowapi empty key) | auth review #1/#2 | confirms the empty-bucket path fires in prod |
| SEN-001 (pool exhaustion) | HOT-016 (admin N+1), HOT-004 | connection-holding loops amplify |

---

## Task 2 — Hotspot deep review

### Phase A — hotspot ranking (last 6 months: 2025-12-06 → 2026-06-07)

Change-frequency (commits touching file) × complexity proxy (LOC).
Excludes docs/tests/generated/migrations.

| # | File | churn | LOC | score |
|---|---|---|---|---|
| 1 | `backend/app/schemas/schemas.py` | 12 | 1779 | 21348 |
| 2 | `backend/app/routers/auth.py` | 11 | 1317 | 14487 |
| 3 | `backend/app/models/models.py` | 11 | 1245 | 13695 |
| 4 | `backend/app/routers/admin.py` | 11 | 801 | 8811 |
| 5 | `frontend/components/MapComponent.jsx` | 13 | 439 | 5707 |
| 6 | `frontend/components/HomeProductForm.jsx` | 11 | 516 | 5676 |
| 7 | `frontend/components/ReviewsSection.jsx` | 11 | 353 | 3883 |
| 8 | `frontend/app/[locale]/map/MapClient.jsx` | 11 | 320 | 3520 |
| 9 | `frontend/lib/seo.js` | 10 | 332 | 3320 |
| 10 | `frontend/app/[locale]/map/components/MapPane.jsx` | 13 | 189 | 2457 |

Bug-fix density (commits w/ `fix|bug|hotfix`, 6mo) corroborates:
`HomeProductCard.jsx` 2, `ExperienceCard.jsx` 2, then 1 each on
`ReviewsSection.jsx`, `MapProducerCard.jsx`, `auth.py`, `admin.py`,
`producer_me.py`, `whatsapp_templates.py` — consistent with the churn list.

### Phase B — findings (deduped → NEW only)

Severity scale: CRITICAL / HIGH / MED / LOW. `fixable`: YES (mechanical,
non-owned) / NEEDS-SAPIR (owned territory, central component, or
product-judgment).

#### HOT-001 — CRITICAL — AI risk score/reasoning leaked to the producer being scored · `fixable=NEEDS-SAPIR (schema)`
`producer_me.py:55 (GET) + :109 (PUT) /producers/me` →
`response_model=ProducerAdminOut`. `ProducerAdminOut(ProducerDetailOut)`
(`schemas.py:654`) adds `risk_score:int|None` (`:659`) +
`risk_reasoning:str|None` (`:660`). **Verified by orchestrator directly.**
- **Scenario:** the exact producer flagged by the AI signup-risk scorer
  reads, on their own self-serve profile fetch, their internal risk score
  (0–100) and the free-text Hebrew reasoning — which may quote detection
  heuristics / admin-facing notes. The schema's own comment claims these
  are "admin-only, never exposed via the public `ProducerDetailOut`" — but
  `ProducerAdminOut` *is* the model the producer's own endpoint returns.
- **Fix direction (Sapir):** give `/producers/me` a dedicated response
  model WITHOUT `risk_*` (e.g. `ProducerSelfOut`), or strip the fields in
  the handler. Schema territory → finding-only here.
- **Dedup:** NOT in AUD/UIS (grep `risk_score` on full-audit = 0 hits). NEW.

#### HOT-002 — HIGH — `toggle_producer_status` force-approves any non-approved producer · `fixable=NEEDS-SAPIR (product/availability-adjacent)`
`admin.py:~281` — `producer.status = "inactive" if producer.status ==
"approved" else "approved"`.
- **Scenario:** admin clicks the status-toggle on a `pending` /
  `pending_whatsapp` / **`rejected`** producer → the `else` branch
  silently sets `approved`, putting a **rejected business live on the
  public map**, bypassing the `approve_producer` flow entirely (no
  approval email, no `producer_approved_v1` WhatsApp, no admin WhatsApp).
- **Fix direction:** guard — only toggle within `{approved ↔ inactive}`;
  reject other source states with 409, routing through the real approve
  flow. Touches producer status (approval/availability-adjacent) +
  notification side-effects → **NEEDS-SAPIR**, not an overnight auto-fix.
- **Dedup:** NEW.

#### HOT-003 — HIGH — stacked title validators crash with 500 on punctuation/HTML-only input · `fixable=NEEDS-SAPIR (schema)`
`schemas.py:788-796 HomeProductCreate.title` runs `_sanitize_title` (788)
then `_min_letters_validator` (793) in definition order. `sanitize_text`
returns `None` for an empty cleaned result. A title like `"<b></b>"` or
`"   "` → sanitize returns `None` → `_min_letters_validator(None)` calls
`None.strip()` → **`AttributeError` → HTTP 500** (instead of a clean 422).
- **Same pattern:** `ExperienceCreate.title` (`:967/969`),
  `ProducerRecipeBase.title` (`:1130/1132`).
- **Reachable from the public "מהמטבח של השכן" submit form.** DoS-ish /
  ugly 500. Schema territory → Sapir. Fix: make `_min_letters_validator`
  null-safe, or reorder so the letter check runs on the raw value.
- **Dedup:** distinct from AUD-011 (missing validator) and AUD-012
  (`admin_notes` unvalidated). This is a *crash from the interaction of
  two present validators*. NEW.

#### HOT-004 — HIGH (upgraded by SEN-002/003 prod evidence) — schema-level FK gaps; router-only patches leave latent re-break + un-fixed sibling · `fixable=NEEDS-SAPIR (schema)`
- `models.py:248 User.producer_id` — FK with **no `ondelete`**,
  `nullable=False`→ actually nullable but bare; any new producer-delete
  path that doesn't copy the manual nullify dance re-opens
  `ForeignKeyViolation` (= SEN-002). Should be `ondelete="SET NULL"`.
- `models.py:1022 PhoneOtpToken.producer_id` NOT NULL + column
  `ondelete="CASCADE"`, but the `producer` relationship (`:1034`) lacks
  `passive_deletes=True` → ORM nullifies children before the DB cascade →
  `NotNullViolation` (= SEN-003). Fix: `passive_deletes=True`.
- **Un-fixed sibling:** `models.py:1043 KashrutBadgeRequest.producer_id`
  NOT NULL + CASCADE, **no `passive_deletes`, not pre-deleted in either
  delete path** → deleting a producer with pending kashrut requests
  (session-loaded) is a latent NotNullViolation 500, same shape as
  SEN-003 but not yet patched.
- Smell #1 (MEH-271): `Producer.products` etc. carry BOTH ORM
  `cascade="all, delete-orphan"` AND DB `ondelete="CASCADE"` — two owners
  of one delete; adding `passive_deletes` to fix the above without
  auditing these diverges behavior.
- **Note vs AUD:** full-audit:438 asserts "FK ondelete actions
  intentional (MEH-311/313)" — that pass **missed `User.producer_id`'s
  bare FK**; production (SEN-002) proves it. Schema → Sapir.

#### HOT-005 — HIGH — map data consumed with no Zod validation (workflow rule 19) · `fixable=NEEDS-SAPIR (central map path)`
`useProducersFeed.js:29` (`loadProducers`) + `useMapSync.js:224`
(`handleSearchThisArea`) set `r.data` straight into `allProducers` with no
`ProducerSchema.safeParse` — though `ProducerSchema` exists
(`schemas.js:7`). `MapComponent.jsx:404` guards markers on
`typeof lat === "number"`, so if the API ever serializes lat/lng as
**strings** (common for DB decimals) every marker is silently dropped →
**blank map, no error UI, no console error**. Rule 19 +
`.claude/rules/frontend.md` require validation before map API calls.
- **Fix direction:** `safeParse` + coerce numeric coords; show an error
  state on parse failure. Central map path → Sapir.

#### HOT-006 — HIGH — locale-blind JSON-LD: EN pages emit HE-prefixed `@id`/`url` → duplicate structured-data identity across locales · `fixable=NEEDS-SAPIR (SEO surface)`
`seo.js:283-306` (`buildJsonLd`) + `:161` + `:239` build every
`url`/`@id`/breadcrumb `item` from bare `SITE_URL` with **no `/en`
prefix**, while the page canonical (via `buildAlternates`) correctly uses
`/en/<slug>`. Result on `/en/<slug>`: JSON-LD `url` ≠ canonical, and the
HE+EN pages share identical `@id`s → Google sees the EN structured-data
graph describing the HE page.
- **Fix direction:** thread `locale` through
  `buildJsonLd`/`buildPageUrl`/breadcrumb builders. Multi-call signature
  change on a central SEO surface → Sapir.

#### HOT-007 — MED — selected producer not cleared across several filter paths → stale popup/sheet for a filtered-out producer · `fixable=NEEDS-SAPIR (central)`
`useMapFilters.js:145-157 toggleCategory` (legend de-select),
`useMapSync.js:171-227 handleSearchThisArea` (geo), and the inline
`MapClient.jsx:215-221 onResetAll` all fail to clear
`selectedProducer`/`activeProducerId`, whereas
`useMapFilters.resetAllFilters` (`:119-133`) does. The desktop
`DesktopMiniPopup` / mobile `MobileSheetSelectedCard` keep showing a
producer that the active filter just removed from the map. (Two divergent
reset paths = Smell #1.) Central → Sapir.

#### HOT-008 — MED — HomeProductForm: non-functional `setForm` spreads drop keystrokes; backend 422 on bad title surfaces as a generic error → retry/dupe · `fixable=NEEDS-SAPIR (critical flow → Playwright-first)`
`HomeProductForm.jsx:300` + the `update(field)` / `handleImageUpload` /
`removeImage` handlers call `setForm({ ...form, ... })` (value capture),
while `:406/:411` correctly use `setForm((f) => ...)`. Rapid edits or an
interleaved re-render spread a stale `form` → first field silently lost.
Separately, a title like `"???"` passes client checks but the backend
`_validate_title_letters` returns **422** (array detail), which the catch
at `:199-206` maps to the generic "משהו השתבש" → user retries the same bad
title. Critical-flow component (rule 5 requires a Playwright test first) →
Sapir.

#### HOT-009 — MED — ReviewsSection optimistic-update bugs: count drift + stale average · `fixable=YES`
`ReviewsSection.jsx:157` increments `total` on an **edit** when the user's
existing review isn't in the current page's `reviews` (cross-page edit) →
count drifts above server truth. `:156` prepends the review to whatever
page is shown (wrong position on page 2+). `:167` gates the summary on the
**prop** `avgRating`, captured at mount and never refreshed post-submit →
first reviews don't update the shown average until full reload. Non-owned,
frontend; but interlocking with pagination → fix as one considered change.

#### HOT-010 — MED — `delete_account` non-atomic, no rollback, side-effects after a possibly-failed commit · `fixable=NEEDS-SAPIR (auth)`
`auth.py:1264-1293` issues several `.delete()` + `db.delete(producer)` +
`db.delete(user)` then one `db.commit()` with **no `try/except` +
`db.rollback()`**. If the commit raises (e.g. a future child table FK not
in the manual list), the handler still proceeds to the Cloudinary
`destroy_image` loop (`:1303`) and `_send_deletion_email` (`:1315`) → user
gets an "account deleted" email and assets are destroyed while the DB row
survives. AUTH territory → Sapir.

#### HOT-011 — MED — `push_subscription` is an untyped, unbounded `dict` persisted verbatim · `fixable=NEEDS-SAPIR (schema)`
`schemas.py:1671 AlertPrefsIn.push_subscription: dict | None` — no
key/size/depth cap. A multi-MB nested JSON blob is accepted, stored, and
re-serialized on every alert fire (row/memory DoS). Distinct from AUD-013
(`list[str]` caps). Schema → Sapir. Fix: typed sub-model or handler size
guard.

#### HOT-012 — MED — MapComponent stale Leaflet refs on unmount / breakpoint switch → `getBounds`/`flyTo` on a removed map · `fixable=NEEDS-SAPIR (map central path)`
`MapComponent.jsx:374-387` cleanup nulls `mapInstanceRef`/`clusterGroupRef`
but **never resets `parentMapRef.current`**; `useMapSync` `registerMapApi`
early-returns on `!api` without clearing `mapApiRef`/`mapRef`. On a
desktop↔mobile breakpoint switch (one pane unmounts) the shared
`mapRef.current` keeps pointing at the removed instance →
`handleSearchThisArea.getBounds()` / `handleGpsClick.flyTo()` hit a
`.remove()`-ed map (throw or dead bounds). Also: the
`goToMyLocation`/geolocation callback has no mounted-guard after the async
GPS resolve. Map central → Sapir.

#### HOT-013 — LOW — staging boots an ephemeral JWT secret when unset · `fixable=NEEDS-SAPIR (auth/config)`
`config.py:151-161` fail-fasts only when `env.lower()=="production"`. A
staging deploy missing `JWT_SECRET_KEY` silently generates a per-process
random secret → every redeploy invalidates all staging tokens (mass 401s),
and two staging pods sign with different secrets (cross-pod 401 churn).
AUTH/config → Sapir.

#### HOT-014 — LOW — `InboundMessage.meta_message_id` nullable+unique defeats idempotency on null · `fixable=NEEDS-SAPIR (schema/whatsapp)`
`models.py:1227` — `unique=True` + `nullable=True`. Postgres treats
multiple NULLs as distinct, so two webhook deliveries arriving **without**
`meta_message_id` both insert → duplicate auto-replies, defeating the
"at-least-once → idempotent" guarantee the docstring claims. WhatsApp +
schema → Sapir.

#### HOT-015 — LOW — rating `stars` + status/enum columns have no DB CHECK · `fixable=NEEDS-SAPIR (schema)`
`models.py:786/813` `stars Integer NOT NULL`, range 1–5 enforced only at
the app layer; `:64/729/924/...` status/method enums stored as free
`String`. Any non-validated insert path (admin tool, backfill, future
endpoint) can persist `stars=0/99` (corrupts `avg_rating`) or a typo'd
status that silently never matches the partial-index predicate (`:225`).
Accept-risk-or-CHECK decision → Sapir.

#### HOT-016 — LOW — admin N+1 + un-rolled-back seed loops pressure the pool (ties SEN-001) · `fixable=YES`
`admin.py:65-81 _ensure_unique_slug` issues one `SELECT` per suffix
candidate (N round-trips holding a connection); `:762-786 seed_cities`
loops up to 1500 `INSERT`s with one tail commit and **no `db.rollback()`**
on a mid-loop failure (only the `name_he` unique key is guarded by
`ON CONFLICT`). Admin-only, small N in practice. Non-owned; low priority.

#### HOT-017 — LOW — SEO `sameAs` accepts malformed/insecure URLs; OG image may be relative; no fallback OG image · `fixable=YES`
`seo.js:204-207` guards website/`sameAs` with `startsWith("http")` → lets
`httptival.co.il` (typo, no `://`) and bare `http://` through into JSON-LD
`sameAs` (invalid/insecure structured data). `:317/326` pass a
non-Cloudinary/relative first image straight into `openGraph.images[].url`
(scrapers need absolute https), and emit **no fallback** OG image when
`images:[]`. `:51-53` description slice can split a surrogate-pair emoji →
`�` in the SERP snippet. All single-cause, non-owned. (Lowest-risk
mechanical candidates — see Phase C.)

#### HOT-018 — LOW — ReviewsSection date/empty-body/pagination edges · `fixable=YES`
`:307` a malformed non-empty `created_at` renders literal "Invalid Date"
(empty string is already guarded). `:149` blocks empty body client-side
though the server allows star-only reviews (`reviews.py:256 if data.body`)
→ feature mismatch. `:329/340` pagination buttons have no in-flight guard →
rapid clicks resolve out of order → displayed page mismatches state.
Non-owned, frontend.

### Dedup ledger (found-but-NOT-new)
| Subagent finding | Existing id | Disposition |
|---|---|---|
| `ProducerRegister.producer_name` no letter validator | **AUD-011** | dup — extend AUD-011 to add `UserRegister.name` |
| Unbounded `list[str]` (`images`/`delivery_cities`/`category_ids`) | **AUD-013** | dup |
| `admin_notes` unvalidated free-text | **AUD-012** | dup |
| `/reset-password` 404-vs-410 token oracle | **AUD-015** | dup |
| `/reset-password` per-email rate-limit (empty key) | **AUD-015** + SEN-004 | dup of audit; SEN-004 = prod confirmation |

### Phase C — mechanical-fix lane (DEFERRED, with rationale)

The fix lane was authorized for **single-cause, locally-verifiable changes
outside `schema/auth/workflows/WhatsApp/availability`**. Outcome: **no
fix PRs shipped this session.** Why:

- The CRITICAL + all three HIGH backend findings (HOT-001/003/004) are in
  **schema** territory (owned) → finding-only.
- HOT-002 (force-approve) touches producer **approval/availability** +
  notification side-effects → owned/product-judgment.
- The non-owned HIGHs (HOT-005 Zod-map, HOT-006 SEO JSON-LD) are **central
  map path** / multi-signature SEO change → repo culture (central-component
  4-step protocol, rule 19) demands plan-first human review, not an
  overnight auto-merge.
- The genuinely trivial non-owned fixes (HOT-017, HOT-018) are **LOW**
  severity and **crawler-/user-facing output** changes; shipping them
  half-verified overnight (the CC sandbox cannot run the full mandated
  `npm build → pytest → /adversarial-review` gate against Railway) is not
  worth the blast radius. They are queued as ready-to-implement with exact
  loci above.
- Branch constraint: this session is pinned to one branch, so the
  "separate small PR per root cause" requirement can't be honored cleanly
  here anyway.

**Recommendation for MORNING-BRIEF:** action HOT-017/HOT-018 as the first
two low-risk fix PRs (clear single causes, fast vitest), then the HIGHs via
the normal chunked-review flow.

---

## Status ledger

| id | sev | file:line | territory | disposition |
|---|---|---|---|---|
| SEN-001 | — | database.py:14 | config/infra | Sapir (pool tuning) |
| SEN-002 | — | admin.py:311 | schema | fixed PR#946, deploy+resolve |
| SEN-003 | — | auth.py:1286 | schema | fixed PR#946, deploy+resolve |
| SEN-004 | — | rate_limit.py:85 | auth | Sapir |
| SEN-005 | — | producer_risk.py | config-env | Sapir (credits) + noise |
| SEN-006 | — | whatsapp | whatsapp | Sapir |
| SEN-007 | — | lifespan | noise | ignore-rule |
| SEN-008 | — | verify-sentry | noise | resolve |
| HOT-001 | CRITICAL | producer_me.py:55,109 / schemas.py:659 | schema | Sapir |
| HOT-002 | HIGH | admin.py:281 | availability-adj | Sapir |
| HOT-003 | HIGH | schemas.py:788-796 | schema | Sapir |
| HOT-004 | HIGH | models.py:248,1022,1043 | schema | Sapir |
| HOT-005 | HIGH | useProducersFeed.js:29 | central map | Sapir |
| HOT-006 | HIGH | seo.js:283-306 | SEO | Sapir |
| HOT-007 | MED | useMapFilters.js:145 | central map | Sapir |
| HOT-008 | MED | HomeProductForm.jsx:300 | critical flow | Sapir |
| HOT-009 | MED | ReviewsSection.jsx:156-167 | frontend | fixable |
| HOT-010 | MED | auth.py:1264-1293 | auth | Sapir |
| HOT-011 | MED | schemas.py:1671 | schema | Sapir |
| HOT-012 | MED | MapComponent.jsx:374-387 | central map | Sapir |
| HOT-013 | LOW | config.py:151-161 | auth/config | Sapir |
| HOT-014 | LOW | models.py:1227 | schema/whatsapp | Sapir |
| HOT-015 | LOW | models.py:786,813 | schema | Sapir |
| HOT-016 | LOW | admin.py:65-81,762-786 | admin | fixable |
| HOT-017 | LOW | seo.js:204-207,317,326,51 | frontend | fixable |
| HOT-018 | LOW | ReviewsSection.jsx:307,149,329 | frontend | fixable |

**Method note:** Sentry via MCP (org `df7d71a2ad7a`). Hotspots via
`git log --since` churn × LOC. Phase B = 10 read-only subagents,
full-file adversarial reads incl. callers. HOT-001 verified by the
orchestrator directly; SEN-002/003 lineage verified via
`git merge-base --is-ancestor`. For MORNING-BRIEF synthesis: this doc is
new — incorporate the SEN-/HOT- series alongside AUD-/UIS-.
