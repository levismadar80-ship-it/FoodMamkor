# WhatsApp click source-attribution audit (MEH-1219)

**Date:** 2026-07 · **Type:** read-only code archaeology, report only (zero code changes).
**Trigger:** Sapir (15/07) is weighing whether the per-card WhatsApp button serves the
magazine thesis or bypasses it. That decision needs data — *how many WhatsApp taps come
from list cards vs the profile page vs the map* — so step 1 is: do we even capture that today?

## Verdict (up front)

**MISSING.** Every producer-side WhatsApp CTA posts to one endpoint with only the producer
id in the URL path — no body, no query string — and the `producer_whatsapp_clicks` table has
no source/surface column. Source attribution is **confirmed not logged** (verified against the
model *and* the baseline migration, not merely "not found"). Today all taps are
indistinguishable rows; you cannot tell a map-card tap from a profile-sidebar tap.

---

## Section 1 — WhatsApp CTA surface inventory

All producer WhatsApp taps funnel through **`POST /api/producers/{id}/whatsapp-click`**, sent
via `navigator.sendBeacon` (no body). None sends a surface/source.

| # | Surface / component | file:line | Renders | Logs click? | Payload |
|---|---|---|---|---|---|
| 1 | **ContactCard** (profile — inline mobile + desktop sidebar, rendered twice) | `frontend/app/[locale]/producer/[id]/components/ContactCard.jsx:102-111` | `<PrimaryContactButton>` `<a href>`; `onClick` → `pingWhatsAppBeacon(producer.id)` when primary method = whatsapp | Yes | endpoint, **no body** |
| 2 | **StickyContactBar** (profile — mobile sticky bottom bar) | `frontend/app/[locale]/producer/[id]/components/StickyContactBar.jsx:82-86` | `<a href>`; `onClick` → `pingWhatsAppBeacon(producer.id)` | Yes | **no body** |
| 3 | **DeliveryBlock → WhatsAppButton** (profile — delivery section) | `frontend/components/DeliveryBlock.jsx:75-80` → `frontend/components/WhatsAppButton.jsx:46-61` | `<a href={wa.me}>`; beacon fires because `producerId` prop passed | Yes | `sendBeacon(.../whatsapp-click)` at `WhatsAppButton.jsx:57`, **no body** |
| 4 | **MapProducerCard** (map — result-list card) | `frontend/components/MapProducerCard.jsx:206` | `<a href={primaryHref}>`; inline `onClick` beacon when `primaryMethod === "whatsapp"` | Yes | **no body** |
| 5 | **MobileSheetSelectedCard** (map — mobile pinned bottom-sheet card) | `frontend/app/[locale]/map/components/MobileSheetSelectedCard.jsx:92` | `<a href>`; `onClick` → `pingWhatsAppBeacon(sp.id)` | Yes | **no body** |
| 6 | **ProducerCard** (the `/producers` directory list card) | `frontend/components/ProducerCard.jsx:221-247,291-295` | Only `<Link>` to the profile — **no WhatsApp CTA at all** | No | n/a (tapping navigates to the profile) |
| 7 | **PrimaryContactButton** (shared presentational button) | `frontend/components/PrimaryContactButton.jsx:78-92` | Pure `<a href>` that forwards an `onClick` prop; does no logging itself | via caller only | logging lives in the parent (#1) |

Helper hub for #1/#2/#5: `frontend/lib/contact-tracking.js:47-55` — `pingWhatsAppBeacon(producerId)`
(`sendBeacon`, **no payload**); `:30-45` `trackContactClick` handles the *non*-WhatsApp channels
via a separate `/contact-click` endpoint.

**Retired (not a gap):** the desktop-map `DesktopMiniPopup` WhatsApp CTA was removed —
`frontend/app/[locale]/map/MapClient.jsx:509` ("DesktopMiniPopup retired", MEH-1010).

**Separate path (out of scope, but note):** homepage *product* cards log to a different table —
`frontend/lib/use-home-page.js:277-284` → `POST /home-products/{id}/whatsapp-click`
(`backend/app/routers/home_products.py:333-351`, table `home_product_whatsapp_clicks`). Product-level,
drives a rating-SMS loop — and it **also** records no source.

---

## Section 2 — the logging path (backend)

**Endpoint** — `backend/app/routers/producers.py:252-277`:

```python
@router.post("/producers/{producer_id}/whatsapp-click")
@limiter.limit("10/minute")
def record_whatsapp_click(
    request: Request,
    producer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    get_producer_or_404(db, producer_id)                     # :269
    db.add(ProducerWhatsAppClick(
        producer_id=producer_id,                             # :272
        user_id=current_user.id if current_user else None,   # :273
    ))
    db.commit()
    return {"detail": "logged"}
```

Signature takes **only** `producer_id` (path) + optional JWT — no query params, no body model.
The "click logging" mention in `get_producer_or_404`
(`backend/app/services/producer_queries.py:130-136` docstring) is just the existence check.

**Model** — `backend/app/models/models.py:918-947`, table `producer_whatsapp_clicks`. Full column set:

- `id` — `models.py:934` (UUID PK)
- `producer_id` — `models.py:935-940` (FK producers, indexed)
- `user_id` — `models.py:941-946` (FK users, **nullable** — set only when JWT present)
- `clicked_at` — `models.py:947` (DateTime, default utcnow, indexed)

That is the entire table. Confirmed against the baseline migration
`backend/alembic/versions/20260424_0815_ef8fb1858f5b_baseline.py:444-455` (same four columns, three
indexes, **no source column**).

**Consumers (aggregate counts only, none read a source):**
`backend/app/routers/producer_me.py:456-460` + `:557` (dashboard 7d/30d/total);
`backend/app/routers/reviews.py:246-254` (review-gate: did this user+producer have a WA-click row).

---

## Section 3 — verdict: **MISSING**

Deciding evidence:

1. **No source column in the model** — `ProducerWhatsAppClick` = `{id, producer_id, user_id, clicked_at}`
   (`models.py:934-947`), matched by the baseline migration (`…baseline.py:444-455`).
2. **No source sent by any call site** — all five active CTAs beacon the producer id only, no body/query
   (`WhatsAppButton.jsx:57`, `MapProducerCard.jsx:206`, `contact-tracking.js:50`, `ContactCard.jsx:106`,
   `StickyContactBar.jsx:84`, `MobileSheetSelectedCard.jsx:92`).
3. **The endpoint accepts no source** — `record_whatsapp_click` has no query param or body
   (`producers.py:252-259`).

A producer/analyst cannot distinguish a map-list tap from a profile-sidebar / sticky-bar / delivery-block
tap. (Contrast: the sibling non-WhatsApp `ContactClick` model carries a `method` discriminator —
`models.py:974` — but that is channel *type* phone/instagram/website/email, still **not** surface, and it
doesn't cover WhatsApp.)

---

## Section 4 — minimal change to add attribution (proposal only — NOT implemented)

Smallest viable addition: a `source` query param on the existing endpoint + one new nullable column.

1. **DB column** `source VARCHAR(20) NULL` on `producer_whatsapp_clicks` (after `models.py:947`).
   Schema change → **hand-written Alembic migration required** (`.claude/rules/db.md`: Alembic-only since
   MEH-267; prod incident MEH-265). **HIGH-RISK — touches `backend/app/models/`**, so it pulls in the
   migration-safety checklist (generate revision, `alembic upgrade head` against an existing DB,
   update `.ai/diagrams/db-schema.md`, bump `EXPECTED_TABLES` if applicable). Keep it **nullable** so
   old/in-flight beacons don't 500.
2. **Endpoint** — add `source: str | None = None` query param to `record_whatsapp_click`
   (`producers.py:254-259`), validate against a surface enum
   `{profile_card, profile_sticky, profile_delivery, map_list, map_sheet}`, pass into
   `ProducerWhatsAppClick(..., source=source)`. Mirror the existing `_VALID_CONTACT_METHODS` frozenset
   pattern (`producers.py:280`, validation `:299-300`).
3. **Frontend call sites** — each appends its own `source` to the beacon URL (sendBeacon supports a query
   string; no body needed):
   - `contact-tracking.js:47` → `pingWhatsAppBeacon(producerId, source)`, then its callers:
     `ContactCard.jsx:106` → `profile_card` · `StickyContactBar.jsx:84` → `profile_sticky` ·
     `MobileSheetSelectedCard.jsx:92` → `map_sheet`
   - `WhatsAppButton.jsx:57` → `?source=profile_delivery` (thread a prop from `DeliveryBlock.jsx:75` if reused)
   - `MapProducerCard.jsx:206` → `?source=map_list`

No read-side change needed unless you want a per-surface dashboard breakdown (`producer_me.py:557`); the
column backfills null and can be grouped later.

**Scope note for the follow-up:** because this needs an Alembic migration + models edit, it is a
HIGH-RISK ticket (chunked review), not a GREEN copy tweak. The keep/remove-the-card product decision
should be taken *after* this instrumentation lands and a data window accumulates.

---

_Bug spotted in passing (reported, not fixed per audit scope): none — the logging works, it just lacks
the source dimension._
