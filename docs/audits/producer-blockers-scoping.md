# Producer-lifecycle blockers — scoping (Refs MEH-999)

> **Read-only Phase 0.** Scopes the 4 confirmed producer-lifecycle blockers from
> the MEH-999 dogfood audit (CC part A, 04/07) into separate fix tickets, each at
> the right risk tier per [ADR-016](../decisions/ADR-016-risk-tier-nomenclature.md).
> **Zero code edits in this run** — each fix becomes its own ticket after Sapir
> reviews this table.
>
> Source comment: MEH-999 dogfood friction log (#1, #2, #3, #5 of its top-10).
> Every claim below re-verified against `staging`-tip working tree, file:line.

---

## Scoping table

| # | Blocker | Confirmed live (file:line) | Risk tier | Schema change? | Chunked? | Collision |
|---|---|---|---|---|---|---|
| **B8** | Vacation mode impossible (422 loop) | **Y** — `frontend/app/[locale]/producer/dashboard/page.js:330` (radio fires `setAvailabilityState("on_vacation")` dateless) + `:353` (date input gated on `state==="on_vacation"`); `backend/app/routers/producer_me.py:384` `resolve_vacation_until` → 422 | **YELLOW** (⚠️ prompt said RED — see note) | **No** | Single PR (FE + tiny BE) | **None** |
| **B9** | No UI path to add a product | **Y** — `ProductsSection` defined `frontend/app/[locale]/settings/page.jsx:814`, **`grep '<ProductsSection'` = 0 usages** (orphaned); `BusinessTab:746` renders only status banners + a link | **GREEN→YELLOW** (by mount site) | **No** | Single PR wiring (YELLOW+chunk only if mounted into `edit/page.js`) | **None live** — MEH-1017 (Done) did **not** add a products path |
| **B10** | Profile save 422s while license-pending | **Y** — `backend/app/routers/producer_me.py:176` `ensure_license_for_categories(...)` on every `PUT /producers/me`, no pending bypass; helper `backend/app/services/license_validation.py:52-70` | **RED** | **Conditional** — see fix shape | **Chunk-by-chunk** | **None** (MEH-971 register-path Done; MEH-1011 is admin.py) |
| **B11** | Cannot reply to a review | **Y** — no reply endpoint in `backend/app/routers/reviews.py` (only GET/POST/DELETE/admin `:144,175,198,311,336,352`); `ProducerReview` model has no reply column `backend/app/models/models.py:806-835`; `ReviewsSection.jsx:300` `isOwner` swaps empty-state only | **RED** | **Yes** — new columns → Alembic | **Chunk-by-chunk** | **None code-wise**; migration must chain off head `a1b2c3d4e5f6` (MEH-1011) |

---

## B9 — the decisive question (new feature vs wiring fix)

**Answer: B9 is a WIRING fix, not a new feature. `ProductsSection` is still fully orphaned — MEH-1017's edit tab does NOT expose any product-add path.**

Evidence:
- `ProductsSection` (full CRUD against `GET/POST/PUT/DELETE /producers/me/products`) is defined at `frontend/app/[locale]/settings/page.jsx:814` and fetches at `:834` — the **component and its backend endpoints already exist**.
- `grep -n '<ProductsSection'` across `frontend/` → **0 render sites**. It is defined but never mounted.
- MEH-1017 (Done, 5 PRs merged) added exactly three editor cards to `frontend/app/[locale]/producer/dashboard/edit/page.js` — `CategoriesCard:347`, `ImagesCard:472`, `LocationCard:605` (plus pre-existing `BioPanelCard:699`, `CustomQuestionsCard:114`, `ContactChannelsCard:207`). `grep 'product'` in `edit/page.js` → **0 hits**. No products card, no products route.
- `BusinessTab` (`settings/page.jsx:746`, rendered at `:144`) shows only status banners + a `/producer/dashboard` link (`:803-807`) — no products affordance.

**Implication for tiering:** because the component + backend are done, B9 is frontend-only mounting with **no schema/backend work**. The tier is decided by *where* it mounts:
- Mount `<ProductsSection />` in `BusinessTab` (settings) → **GREEN/YELLOW**, single-file, standard review.
- Add a "מוצרים" card to the Edit tab (`edit/page.js`, the file MEH-1017 treated HIGH-RISK) following the MEH-1017 card pattern → **YELLOW**, chunk-by-chunk on that file.

→ **Sapir decision needed: settings BusinessTab vs edit-tab card.** Recommend the edit tab for consistency with the MEH-1017 self-service cards (one management surface), accepting the chunk-by-chunk cost.

---

## Per-blocker detail + minimal fix shape

### B8 — Vacation mode 422 loop — YELLOW
**Live mechanism (chicken-and-egg):** the `on_vacation` radio (`dashboard/page.js:330`) POSTs `state="on_vacation"` with no `vacation_until`; `resolve_vacation_until` (`producer_me.py:384`) raises `AvailabilityValidationError` (kind ≠ `value`) → **422**; the optimistic state reverts, so the date input — which only renders when `state === "on_vacation"` (`:353`) — never appears. The owner can never supply the date the backend demands.

**Minimal fix shape:** render the return-date input as soon as the `on_vacation` radio is *selected/pending* (not only after the state persists), and only POST `on_vacation` once a date is present — or default `vacation_until` server-side to +7d and let her adjust. Frontend-led; the optional BE default is a one-line change in `resolve_vacation_until`, no schema.

**Tier note (meta-patterns §1 — verify orchestrator claims):** the prompt pre-classified B8 as *"producer_me.py auth/validation (RED)."* I assess **YELLOW**: the endpoint is `POST /availability-state`, **not** auth; `producer_me.py` is **not** on `.claude/central-components.json` (only `auth.py`, `main.py`, `config.py` are); no schema. It is availability-state validation + a conditional render. Recommend **single PR, standard review** — not chunk-by-chunk. Flagging the divergence, not overriding it.

### B9 — No product-add UI — GREEN/YELLOW
See the decisive-question section above. **Minimal fix shape:** mount the existing `ProductsSection` — either render `<ProductsSection />` in `BusinessTab` (`settings/page.jsx`), or add a products card to the Edit tab mirroring MEH-1017's `CategoriesCard`. No backend, no schema; `/producers/me/products` already exists.

### B10 — Profile save 422 while license-pending — RED (schema conditional)
**Live mechanism:** `PUT /producers/me` re-runs `ensure_license_for_categories` (`producer_me.py:176`) against the producer's *effective* category set + license; a producer who registered via the license-pending opt-in has a license-required category but no number, so **every** later save (bio, image, contact) 422s with `"מספר רישיון יצרן חובה לקטגוריה זו"` until she drops the category.

**⚠️ Fix-shape blocker the audit missed:** the audit proposed *"skip the gate when the producer row is still `license_pending`"* — but **there is no `license_pending` column on the `Producer` model** (`models.py:43` Producer has only `producer_license_number:104`). `license_pending` exists only in the register *payload* (`schemas.py:165,923`) and is consumed at register time (`auth.py:458`); it is **not persisted**. So the fix requires a design decision:
- **Option A (schema):** add a persisted `license_pending` boolean → Alembic migration → mirror the register bypass in the PUT. → schema change, larger surface.
- **Option B (no schema):** on PUT, only enforce the gate for *newly-added* license-required categories (grandfather the existing set) — enforce when a new license-required category is added or the number is cleared, otherwise skip. Contained to `producer_me.py` + `license_validation.py`.
- **Option C (no schema):** drop the PUT-time gate entirely, rely on the approval/publish gate.

**Recommend Option B** (no schema, contained). **Either way RED** — a data-quality gate on a producer mutation, needs numbered plan + WAIT. **Schema change = only if Option A is chosen.**

### B11 — Cannot reply to a review — RED (schema required)
**Live mechanism:** no producer-reply capability exists anywhere — no endpoint in `reviews.py` (`grep reply` = 0), no reply/`replied_at` columns on `ProducerReview` (`models.py:806-835` = id/producer_id/user_id/stars/body/is_hidden/created_at), and `ReviewsSection.jsx:300` uses `isOwner` only to swap the empty-state.

**Minimal fix shape (new feature, 3 chunks):**
1. **Schema** — add `reply TEXT NULL` + `reply_at TIMESTAMPTZ NULL` to `producer_reviews`; Alembic revision chaining off head **`a1b2c3d4e5f6`** (MEH-1011); update `docs/DATA.md` + `.ai/diagrams/db-schema.md`.
2. **Endpoint** — `POST/PUT /producers/me/reviews/{id}/reply` with IDOR ownership check (`review.producer_id == current_user.producer_id`) + a `field_validator` (≥3 letter chars, MEH-555 pattern); extend the review-out schema.
3. **UI** — owner reply affordance in `ReviewsSection.jsx` (gated on `isOwner`) + render the reply on the public list.

**Chunk-by-chunk** (schema → endpoint → UI); the audit itself flagged this as v2.1-feature scope, not a one-liner.

---

## Collision summary (checked against MEH-1017 / MEH-1011 / MEH-1023)

| Ticket | State | Files it touched | Overlap with a blocker? |
|---|---|---|---|
| **MEH-1017** | Done (merged) | `producer/dashboard/edit/page.js` (categories/images/location cards) | **B9-adjacent, no collision.** Confirms B9 is uncovered — no products card. If B9 mounts on the edit tab it *extends* MEH-1017's pattern; no open branch. |
| **MEH-1011** | Done (merged) | `admin.py`, `models.py` (Producer `requested_changes`/`changes_requested_at`), migration `a1b2c3d4e5f6` | **No code collision.** B10 is producer-side `producer_me.py`; B11 touches `ProducerReview`, not `Producer`. B11's migration must chain off MEH-1011's head. |
| **MEH-1023** | In Progress | `admin/users/page.js`, `admin/content/page.js`, `components/admin/AdminRowMenu.jsx` | **No collision** — admin surface only; none of the 4 blockers touch admin pages. |

---

## Recommended ticket split

| Ticket | Blocker | Tier | Review mode | Schema |
|---|---|---|---|---|
| new | B8 vacation 422 loop | YELLOW | single PR, standard | none |
| new | B9 mount ProductsSection | GREEN/YELLOW (mount-site decision) | single PR (chunk if edit-tab) | none |
| new | B10 license-pending PUT bypass | RED | chunk-by-chunk | conditional (Option A only) |
| new | B11 review reply | RED | chunk-by-chunk (schema→endpoint→UI) | **yes**, Alembic off `a1b2c3d4e5f6` |

**STOP — Sapir spawns per-blocker tickets at the stated tiers.** Two open decisions
carried in the fix shapes: B9 mount site (settings vs edit tab); B10 approach
(Option B recommended, no schema).
