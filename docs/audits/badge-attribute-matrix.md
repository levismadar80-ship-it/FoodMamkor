# Badge / Attribute / Status Inventory — מטריצת כל התגים, הסטטוסים והמשלוח

> **READ-ONLY audit — MEH-1205** (Refs [MEH-1136](https://linear.app/mehamakor/issue/MEH-1136), owner of the outcome: MEH-813).
> מיפוי מלא של **כל** התגים, הצ'יפים, ה-badges ומחווני הסטטוס בכל המשטחים הצרכניים.
> **אין קוד. אין עיצוב. אין החלטה מיושמת.** הפלט = מטריצה + הצעת טקסונומיה אחת בלבד.
>
> Every code claim = `path:line`. Backend model = `backend/app/models/models.py`,
> schema = `backend/app/schemas/schemas.py`, badge logic = `frontend/lib/badges.js`.
> `verification_tier` / dietary aggregates / `days_since_created` are **computed** in
> `schemas.py`, never stored — see the data-source column per row.
>
> _הערה: הרפרנסים ל-`/favorites` תקפים מול `origin/staging` שממנו נחתך ה-branch הזה.
> MEH-1203 (grid/FAB parity) **לא מוזג** בזמן כתיבת המסמך (draft, F2 מוחזק), והוא לא
> מוסיף/מסיר שום אינדיקטור — כרטיס המועדפים ממשיך לרנדר את ה-`ProducerCard` המשותף._

---

## Core data / logic sources (referenced throughout)

**Badge taxonomy (single source of truth):** `frontend/lib/badges.js:25-109` `BADGE_CONFIG`
(12 badge keys), priority `:112-125`, earn-logic `:130-193`.

**Backend source fields** (all on `Producer` unless noted):

| Field | Where | Note |
|---|---|---|
| `is_recommended` | `models.py:79` | boolean, default false |
| `verified_at` / `verification_doc_type` | `models.py:126-127` | drives computed `verification_tier` (`schemas.py:861-882`) — public tier is **never stored** |
| `has_producer_license` | `schemas.py:820` (computed) | raw `producer_license_number` admin-only `models.py:105` |
| `organic_certified` / `grass_fed` | `models.py:92` / `models.py:91` | |
| `has_gluten_free_products` / `has_vegan_products` / `has_lactose_free_products` | `schemas.py:752-754` (computed aggregates from `products.is_*`) | |
| `kashrut_verified_at` / `kashrut_badges` / `kashrut_expires_at` | `models.py:172` / `:171` / `:173` | |
| `has_delivery` / `delivery_areas` / `pickup_points` | `models.py:95` / (rel) / `models.py:96` | |
| `availability_status` | `models.py:142` (`String(20)`, default `"available"`) | legacy 3-value |
| `availability_state` | `models.py:146-150` (`String(32)`, server_default `accepting_orders`) | current 4-value, supersedes above |
| `opening_hours` | `models.py:153-154` (`String`, nullable, **free-text**) | see Analysis C |
| `avg_rating` / `reviews_count` | `models.py:164` / `:165` | denormalized |
| `favorites_count` | `schemas.py:793` (computed) | |
| `days_since_created` | `schemas.py:782` (computed) | drives "חדש" |
| `products_count` / `delivery_count` | `schemas.py:783` / `:784` | |
| `trust_tier` | `schemas.py:794-795,840-844` (computed via `app.services.trust_tier`) | |
| `plan` | `models.py:82` | drives "פרמיום" |
| `status` | `models.py:71-73` (`pending`\|`approved`\|`rejected`\|`inactive`) | approval axis — **separate** from verified |

---

## THE MATRIX — one row per distinct indicator

> Columns: **label** · **render sites (file:line — every site)** · **data source** · **i18n key** ·
> **proposed type** (TRUST / EARNED / ATTRIBUTE / SERVICE / STATUS / META) · **filter chip? (file:line)** ·
> **universal to all approved producers?** · **duplicated surfaces**.
> Types are a **proposal** (see recommendation), not shipped.

### A. Trust / platform-issued

| # | Label (he) | Render sites | Data source | i18n key | Type | Filter chip? | Universal? | Dupes |
|---|---|---|---|---|---|---|---|---|
| 1 | **מאומת** | header `ProducerHeader.jsx:75` (BadgeRow); gallery seal `ProducerDetail.jsx:104`; card `ProducerCard.jsx:253`; map card `MapProducerCard.jsx:160-162`; map marker `MapComponent.jsx:98-107` | `verification_tier === "verified"` (`badges.js:133-139`); computed `schemas.py:861-882` (`verified_at is not None`) | `producer.badge.verified_label`; filter plural `attribute-labels.js:16` "מאומתים"; map aria `map.producer_card.verified` | **TRUST** | ✅ /producers `producer-filters.js:6-14`; /map `map-chips.js:42-50` (`verified`) → matches `verified_at IS NOT NULL` (`producer_listing.py:199-203`) | **NO** — driven by `verified_at`, independent of `status="approved"` (see Analysis D) | 5 sites |
| 2 | **רישיון יצרן** | header `ProducerHeader.jsx:75` (BadgeRow); card `ProducerCard.jsx:253` | `verification_tier==="verified" && has_producer_license` (`badges.js:150-153`) | `producer.badge.license_label` | **TRUST** | ❌ none | NO | header+card |
| 3 | **מומלץ** | header BadgeRow; card BadgeRow | `is_recommended` (`badges.js:140-141`, `models.py:79`) | `producer.badge.recommended_label` | **TRUST** (editorial) | ❌ none | NO | header+card |
| 4 | **פרמיום** | header chip `ProducerHeader.jsx:97-101`; map marker gold ring `MapComponent.jsx:121` (`,0 0 0 6px #896714`) | `plan === "premium"` (`models.py:82`) | `producer.detail.header.premium` | **TRUST** (commercial) | ❌ none | NO | 2 sites |
| 5 | **מובילת קהילה / שגרירת מהמקור** (TrustBadge 4/5) | header `ProducerHeader.jsx:79`; card `ProducerCard.jsx:269-271` (compact) | `trust_tier >= 4` (`TrustBadge.jsx:27`; computed `schemas.py:794-795`) | `trust.tier_4.label` / `trust.tier_5.label` | **EARNED** (recognition) | ❌ none | NO | header+card |

### B. Earned / social proof (from reviews & favorites)

| # | Label (he) | Render sites | Data source | i18n key | Type | Filter chip? | Universal? | Dupes |
|---|---|---|---|---|---|---|---|---|
| 6 | **דירוג / N ביקורות** (4.7 · 5) | header `ProducerHeader.jsx:84-96`; card `ProducerCard.jsx:300-308`; map card `MapProducerCard.jsx:153-158`; sticky bar `StickyContactBar.jsx:58-68` | `avg_rating`/`reviews_count` (`models.py:164-165`); card gate `reviews_count>=3 && avg_rating>0` (`ProducerCard.jsx:180-185`) | `producer.detail.header.review_count` | **EARNED** | ❌ none | NO | 4 sites |
| 7 | **מונה מועדפים** (♥ N) | header `ProducerHeader.jsx:102-107`; card `ProducerCard.jsx:353-359` | `favorites_count >= 5` (`schemas.py:793`) | `producer.detail.header.favorites_count` / `producer.card.favorites_count_short` | **EARNED** | ❌ none | NO | header+card |

### C. Attributes (filterable facts)

| # | Label (he) | Render sites | Data source | i18n key | Type | Filter chip? | Universal? | Dupes |
|---|---|---|---|---|---|---|---|---|
| 8 | **אורגני** / header "אורגני מוסמך" | BadgeRow (header+card); header highlights chip `ProducerHeader.jsx:185-189` | `organic_certified` (`models.py:92`) | `producer.badge.organic_label` "אורגני" vs `producer.detail.header.attr.organic` "אורגני מוסמך" ⚠ **label divergence** | **ATTRIBUTE** | ✅ /producers + /map (`organic`) | NO | BadgeRow + header chip + 2 filters |
| 9 | **גראס פד** / header "מרעה חופשי" | BadgeRow; header chip `ProducerHeader.jsx:180-184` | `grass_fed` (`models.py:91`) | `badges.js:69` "גראס פד" vs `attr.grass_fed` "מרעה חופשי" ⚠ **divergence** | **ATTRIBUTE** | ✅ /map `map-chips.js:46`; /producers | NO | BadgeRow + header chip + filters |
| 10 | **ללא גלוטן** | BadgeRow | `has_gluten_free_products` (`schemas.py:752`, aggregate) | `attribute-labels.js` `gluten_free` | **ATTRIBUTE** | ✅ /producers + /map | NO | BadgeRow + filters |
| 11 | **טבעוני** | BadgeRow | `has_vegan_products` (`schemas.py:753`) | `vegan` | **ATTRIBUTE** | ✅ /producers + /map | NO | BadgeRow + filters |
| 12 | **ללא לקטוז** | BadgeRow | `has_lactose_free_products` (`schemas.py:754`) | `lactose_free` | **ATTRIBUTE** | ✅ /producers + /map | NO | BadgeRow + filters |
| 13 | **כשר** | BadgeRow; header chip `ProducerHeader.jsx:198-202`; kashrut strip `ProducerHeader.jsx:207-215` → `KashrutBadgeStrip.jsx` | `kashrut_verified_at` (`models.py:172`); filter matches `kashrut_verified_at IS NOT NULL` (`producer_listing.py:187-194`) | `producer.detail.header.attr.kosher` | **ATTRIBUTE** | ✅ /producers ONLY (`producer-filters.js`); **NOT /map** — `map-chips.js:40-41` "Do NOT add … kosher is verified-only per MEH-986" | NO | BadgeRow + header chip + strip + filter |
| 14 | **קודי כשרות** (בד"ץ / מהדרין / חלק … 8 codes) | `KashrutBadgeStrip.jsx:42-58` (one pill per code, `:9-18`) | `kashrut_badges[]` (`models.py:171`) | `kashrut.badges.${key}.label` | **ATTRIBUTE** (sub-facet of kosher) | ❌ only binary `kosher` chip; individual codes not filterable → **partial orphan** | NO | strip only |
| 15 | **כשרות בתפוגה** (near-expiry) | `KashrutBadgeStrip.jsx:59-63` (`expiresInDays <= 30`) | `kashrut_expires_at` (`models.py:173`) | `kashrut.expiry.near_expiry` | **STATUS** (temporal) | ❌ none | NO | strip only |

### D. Service options (delivery / pickup)

| # | Label (he) | Render sites | Data source | i18n key | Type | Filter chip? | Universal? | Dupes |
|---|---|---|---|---|---|---|---|---|
| 16 | **משלוח** (capability signal) | header highlights chip `ProducerHeader.jsx:190-194` (Truck); delivery **TAB** `ProducerDetail.jsx:121`; delivery **SECTION** heading `ProducerSections.jsx:270-281` → `DeliveryBlock.jsx` | union `delivery_areas?.length>0 || has_delivery || delivery_count>0` (`ProducerHeader.jsx:37-40`) | `producer.detail.header.attr.delivery` "משלוח"; tab `producer.detail.tabs.delivery` "משלוח" | **SERVICE** | ✅ /producers + /map (`has_delivery`) | NO | see Analysis B (chip + tab + section = 3 sites) |
| 17 | **משלוחים בלבד** | card `ProducerCard.jsx:272-276` | `has_physical_location === false && offers_delivery` | `producer.card.badges.delivery_only` | **SERVICE** | ❌ (subset of `has_delivery`) | NO | card only |
| 18 | **משלוחים לכל הארץ** | `DeliveryBlock.jsx:33-36` | nationwide delivery flag (DeliveryBlock) | (delivery block key) | **SERVICE** | ❌ none | NO | section only |
| 19 | **משלוח לעיר שלך** (delivers-to-your-city) | map card `MapProducerCard.jsx:190-196` | `deliveryMatch` vs `useUserCity()` (`MapProducerCard.jsx:65-67`) | `map.producer_card.distance_prefix` + city | **SERVICE** (contextual) | n/a (derived) | NO | map card only |

### E. Status (live / temporal)

| # | Label (he) | Render sites | Data source | i18n key | Type | Filter chip? | Universal? | Dupes |
|---|---|---|---|---|---|---|---|---|
| 20 | **פתוח להזמנות** (green dot) | contact card `ContactCard.jsx:93-98` — rendered **×2** (mobile inline `ProducerDetail.jsx:161-166` + desktop sidebar `:181-186`) | `availability_state \|\| availability_status` ∈ OPEN_STATES `["available","accepting_orders","available_today"]` (`ContactCard.jsx:38,81-82`) | `producer.detail.contact_card.status_open` | **STATUS** | ❌ (`map-chips.js:35-36` explicitly: no "פתוחים השבוע" chip) | NO | ×2 (mobile+sidebar) |
| 21 | **נקודת זמינות** (dot on card) | card `ProducerCard.jsx:315-322` (`availabilityDot()` `:33-45`) | `availability_state`: `available_today`→`bg-primary`; `on_vacation`/`full_this_week`→`bg-fg-muted`; `accepting_orders`→ no dot | (aria) | **STATUS** | ❌ | NO | card only |
| 22 | **זמני תגובה ארוכים** (full_this_week banner) | header `ProducerHeader.jsx:220-224` | `availability_state === "full_this_week"` | `producer.detail.header.slow_response` | **STATUS** | ❌ | NO | header only |
| 23 | **בהפסקה** (vacation banner) | header `ProducerHeader.jsx:229-236`; sticky-bar CTA `StickyContactBar.jsx:100` | `availability_state === "on_vacation"` (or `availability_status==="vacation"`) | `producer.detail.header.vacation` / `sticky_bar.vacation_msg` | **STATUS** | ❌ | NO | header + sticky bar |
| 24 | **פתוח עכשיו / סגור** (opening hours) | `OpeningHours.jsx:24-58`; mounted `ProducerSections.jsx:333` | `opening_hours` free-text (`models.py:153-154`), parsed `lib/hours.js` | `open_now` "פתוח עכשיו" / `closed_now` "סגור" | **STATUS** | ❌ | NO (nullable field) | detail only |

### F. Meta (recency / catalog)

| # | Label (he) | Render sites | Data source | i18n key | Type | Filter chip? | Universal? | Dupes |
|---|---|---|---|---|---|---|---|---|
| 25 | **חדש** | BadgeRow (header+card) | `days_since_created <= 30` (`badges.js:154-159`, `schemas.py:782`) | `producer.badge.new_label` | **META** | ❌ none | NO (temporal) | BadgeRow |
| 26 | **מוצרים** (products auto-badge) | card BadgeRow (`badges.js:185-189`, `products_count>=3`) | `products_count` (`schemas.py:783`) | `producer.badge.products_label` | **META** | ❌ (products section is a catalog, not a signal match) | NO | card |
| 27 | **מגיעה היום** (Friday mode) | card `ProducerCard.jsx:347-351` (`fridayMode && is_available_today`) | `is_available_today` | `producer.card.badges.available_today` | **STATUS** (contextual) | ❌ | NO | card only |

### G. Navigation / non-badge chrome (listed for completeness, NOT badges)

| Item | Render sites | Note |
|---|---|---|
| **קטגוריה** (eyebrow / secondary tags / chip) | header secondary tags `ProducerHeader.jsx:167-172` (`CategoryTag`); logistics line `:141-146`; card eyebrow `ProducerCard.jsx:285-289`; map card chip `MapProducerCard.jsx:144-151`; /producers + /map category **radio** rows | Category is IA/navigation, not a trust/attribute badge. Filterable via category radio. |
| **מרחק** (distance pill) | card `ProducerCard.jsx:325-332`; map card `MapProducerCard.jsx:170-175` | Computed client-side (haversine), not a stored attribute. |
| **הסבר "מוצהר"** (declared explainer) | `ProducerHeader.jsx:157-161` (`verification_tier==="declared"`) | Quiet **copy**, not a pill (ADR-022) — the deliberate non-badge for un-verified. |

---

# ANALYSIS A–E

## A. COUNT — distinct indicators vs render sites

**27 distinct indicators (rows 1–27) across ~55 render sites.** Render sites ≫ distinct indicators →
the system is **duplication-heavy**. The worst offenders (every duplicate site listed in the matrix):

| Indicator | # sites | Sites |
|---|---|---|
| מאומת (verified) | **5** | header BadgeRow, gallery seal, card, map card, map marker |
| משלוח (delivery signal) | **3–4** | header chip + tab + section (+ card delivery-only variant) |
| דירוג/ביקורות | **4** | header, card, map card, sticky bar |
| סטטוס זמינות | **6** (as a family) | card dot, contact-card ×2, full_this_week banner, vacation banner+sticky, opening-hours |
| אורגני | 4 | BadgeRow, header chip, /producers chip, /map chip |
| כשר | 4 | BadgeRow, header chip, kashrut strip, /producers chip |
| קטגוריה | 6 | header tags, logistics line, card eyebrow, map card, /producers radio, /map radio |
| פרמיום / TrustBadge / מונה מועדפים | 2 each | header + card (or marker) |

**Label divergence flags** (same fact, different Hebrew — a symptom of no single owner):
אורגני "אורגני" vs "אורגני מוסמך"; גראס-פד "גראס פד" vs "מרעה חופשי"; מאומת "מאומת" vs plural "מאומתים";
משלוח "משלוח" vs "משלוחים בלבד" vs section heading "משלוחים".

## B. DELIVERY — chip vs tab vs section (3 render sites, judged on evidence)

Three sites on the **same** producer page carry the delivery signal:

1. **CHIP** — header highlights strip `ProducerHeader.jsx:190-194` (Truck + "משלוח"). Binary "has delivery".
2. **TAB** — mobile section-scroll nav `ProducerDetail.jsx:121` (label "משלוח", Truck). Navigation.
3. **SECTION** — `ProducerSections.jsx:270-281` → `DeliveryBlock.jsx` (nationwide pill, per-area rows, pickup line, tertiary WhatsApp CTA). The **detail**.

**Verdict — the CHIP is redundant.** The code already deduped **one** delivery surface: `ProducerHeader.jsx:74`
drops the BadgeRow delivery badge "so delivery renders exactly once — in the capability strip." But the
capability-strip **chip**, the **tab**, and the **section** still coexist. The tab is legitimate (navigation to
the section); the section is the payload; the **chip is a bare binary repeat of a fact the tab+section already
carry**, adding a third equal-weight pill to an already-crowded header. **Recommend: drop the header delivery
chip; keep tab (nav) + section (detail).** (This is a finding, NOT a shipped change.)

## C. STATUS — every `availability_*` value + does an opening-hours field exist?

**Two overlapping availability fields on the public contract** (both serialized `schemas.py:765-770`;
frontend prefers `availability_state`, falls back to `availability_status` — `ContactCard.jsx:81`,
`ProducerCard.jsx:34-44`, `ProducerDetail.jsx:70-72`):

| Field | Definition | Values (quoted) | Enforcement |
|---|---|---|---|
| `availability_status` (legacy) | `models.py:142` `Column(String(20), default="available")` | **`available` \| `full` \| `vacation`** (comment `:140-141`) | none (plain String) |
| `availability_state` (current) | `models.py:146-150` `Column(String(32), server_default 'accepting_orders')` | **`accepting_orders` \| `available_today` \| `full_this_week` \| `on_vacation`** (`AVAILABILITY_STATES` `schemas.py:568-573`) | app-layer only (`availability_validation.py:55`); **no DB enum/CHECK** |

Render sites for status: card dot (row 21), contact-card open line ×2 (row 20), full_this_week banner (row 22),
vacation banner + sticky CTA (row 23), opening-hours open/closed (row 24).

**Opening-hours field — YES, it EXISTS.** `models.py:153-154`:
`# MEH-102: weekly opening hours, free-text … opening_hours = Column(String, nullable=True)`
(format example in-comment: `"Sun-Thu 09:00-18:00, Fri 09:00-14:00"`). Public schema `schemas.py:762-764`
`opening_hours: str | None = None`. It is a **single free-text string**, NOT structured per-day columns; parsed
at render by `lib/hours.js` (`parseHours`/`computeStatus`) and shown by `OpeningHours.jsx`. _(Distinct from the
backend after-hours WhatsApp watchdog window, which is a hardcoded config range `config.py:174-181` /
`auto_reply_watchdog.py:52-74` — unrelated to consumer display.)_ So: **an opening-hours field is present**
(free-text, nullable) — I am **not** inferring one.

## D. UNIVERSAL BADGES — is "מאומת" true for every approved producer?

**No — verified is NOT universal.** Evidence:

- Badge driver: `badges.js:133-139` `case "verified": return producer.verification_tier === "verified";`.
- `verification_tier` computed `schemas.py:861-882`: `"verified"` **iff** `verified_at is not None` (`:874-875`);
  else `"declared"` (no license-required category); else `None`.
- `verified_at` is set **only** when an admin checks a qualifying document (`models.py:117-126`). The legacy
  `is_verified` boolean was **dropped** (`models.py:75-76` "is_verified DROPPED (revision d4e7a92c81b5) … Do not re-add"; also removed from public schema `schemas.py:737-738`).
- **Approval is a separate axis:** `status` (`models.py:71-73`, `pending`\|`approved`\|`rejected`\|`inactive`).
  An `approved` producer with `verified_at IS NULL` and a non-license category resolves to
  `verification_tier="declared"` → **no seal** (`BadgeRow.jsx:20-24` renders nothing for declared; the quiet
  explainer copy shows instead, `ProducerHeader.jsx:157-161`).

**→ The MEH-1205 hypothesis ("מאומת ל-כל בית עסק, DNA-LOCK → תג לא-מבדל") is REFUTED by the code.** Verified is
document-gated and orthogonal to approval; some approved producers are "מוצהר", not "מאומת". _Caveat: the
distribution "how many approved producers actually have `verified_at` set" is a **data question**, not
determinable statically — "unknown — needs a data query" for the real-world ratio._ The **license** badge is
even narrower: double-gated `verification_tier==="verified" && has_producer_license` (`badges.js:150-153`).

## E. ORPHANS — indicator with NO filter chip AND NO dedicated section

Filter chips exist for: `verified, has_delivery, organic, grass_fed, gluten_free, vegan, lactose_free, kosher, category`
(`producer-filters.js:6-14`, `map-chips.js:42-50`; backend params `producers.py:56-72`). **Orphans** (a fact with
nowhere to filter/land):

| Orphan | Why | Row |
|---|---|---|
| **מומלץ** | `is_recommended`, no chip/section | 3 |
| **רישיון יצרן** | no chip/section | 2 |
| **חדש** | `days_since_created<=30`, temporal, no chip | 25 |
| **פרמיום** | commercial, no chip/section | 4 |
| **TrustBadge 4/5** | recognition, no chip/section | 5 |
| **מונה מועדפים** | social proof, no chip | 7 |
| **סטטוס זמינות** (dot / "פתוח" / full_this_week / vacation) | deliberately non-filterable (`map-chips.js:35-36`) | 20–23 |
| **מוצרים** (badge) | catalog exists but no signal-matched section/chip | 26 |
| **קודי כשרות** (individual codes) | only binary `kosher` chip; codes not filterable | 14 |

---

# RECOMMENDATION — one proposed taxonomy (PROPOSAL, not implemented)

Map every row to **six buckets**, each with **one canonical render location**. The organizing principle mirrors
Google Business Profile (attribute *families*, objective vs subjective) + Airbnb (platform `verified` separated
from review-earned) + Google/Yelp (live status = a status **line**, not a badge) + Amazon/Etsy (one accrued mark).

| Bucket | Rows | Canonical render location | Rationale |
|---|---|---|---|
| **1. TRUST (platform-issued)** | מאומת (1), רישיון יצרן (2), מומלץ (3), פרמיום (4) | **Header, beside the name** — ONE seal cluster, deduped. "מאומת" is the single primary seal; license folds *into* verified (it already double-gates on it); מומלץ/פרמיום are quieter secondary marks. | Airbnb: platform marks live at identity, not scattered. Kill the 5-site verified sprawl → seal on detail-header + icon-only on card/map. |
| **2. EARNED (from reviews / community)** | דירוג·ביקורות (6), TrustBadge 4/5 (5), מונה מועדפים (7) | **Reviews anchor / identity line** — rating next to name; tier + favorites as secondary social proof. | Amazon/Etsy: nrarity = meaning; keep earned marks together, distinct from platform trust. |
| **3. ATTRIBUTE (filterable objective facts)** | אורגני (8), גראס-פד (9), ללא-גלוטן (10), טבעוני (11), ללא-לקטוז (12), כשר (13)+קודים (14) | **A dedicated attribute LIST section** (à la GBP "Offerings/Highlights"), **not** the header pill row. Each maps 1:1 to its filter chip. | GBP: attributes are a grouped list, never a flat header pill strip. Fixes label divergence by giving each fact ONE owner. |
| **4. SERVICE OPTION (delivery / pickup)** | משלוח (16), משלוחים-בלבד (17), לכל-הארץ (18), לעיר-שלך (19) | **The delivery SECTION + the tab** — **drop the header chip** (Analysis B). Card keeps the compact "משלוחים בלבד" only when it's the defining trait. | GBP "Service options" family; removes the redundant 3rd delivery pill. |
| **5. STATUS (live / temporal)** | פתוח-להזמנות (20), dot (21), full_this_week (22), vacation (23), opening-hours (24), כשרות-בתפוגה (15), מגיעה-היום (27) | **A status LINE** (contact card / under identity), never a badge. Consolidate the ×2 contact-card render + the two availability fields into one status expression. | Google/Yelp: "פתוח · נסגר ב-18:00" is a status line. Status ≠ tag. Also resolves the `availability_status`↔`availability_state` dual-field drift. |
| **6. META (recency / catalog)** | חדש (25), מוצרים (26) | **Demote** — "חדש" as a light temporal ribbon (already tonal per MEH-1168 P1), "מוצרים" folds into the catalog count; neither competes with trust/attributes. | Baymard: low-signal meta must not crowd the item-defining attribute. |

**Named trade-off.** Moving attributes out of the header pill row into a grouped list **reduces at-a-glance
scannability of a single flagship attribute** (a shopper skimming for "כשר" now reads a list, not a top pill).
Mitigation: promote **at most one** producer-defining attribute back to the header (the same "max 2 / +N" discipline
already in `ProducerCard.jsx:254-263`), and keep the rest in the list. The win is that the header stops being a
6-equal-weight pill wall (the exact MEH-1205 trigger) and each fact gets exactly one owner + one label.

**Cross-reference for the follow-up design ticket (do NOT open before this matrix is accepted):** the natural owner
of the outcome is **MEH-813** (BadgeRow/highlights, design-gated). This audit is input to a `template 01`
options-first design decision on header hierarchy + render location — per the MEH-1205 follow-up note.

---

## Verification

- Diff = **exactly one file** (`docs/audits/badge-attribute-matrix.md`) — see `git show --stat`.
- Analysis A count: **27 distinct indicators / ~55 render sites**.
- Zero code / copy / i18n / design changed (READ-ONLY, per scope).
