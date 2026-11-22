---
paths:
  - "frontend/lib/badges.js"
  - "frontend/lib/filter-taxonomy.js"
  - "frontend/lib/attribute-labels.js"
  - "frontend/lib/producer-filters.js"
  - "frontend/lib/map-chips.js"
  - "frontend/components/BadgeRow.jsx"
  - "frontend/components/FilterSheet.jsx"
  - "frontend/components/ProducerCard.jsx"
  - "frontend/__tests__/LabelScopeContract*"
---

# Label Scope Contract (MEH-1507)

Every **consumer-facing label** on mehamakor.online must state two things:

- **scope** — WHAT the label applies to.
- **evidence** — WHO established it.

A label that hides its scope over-claims: a product-level filter reads as a
whole-business property, or a self-declaration reads as a certificate. That class
was fixed point-wise **four times** before this contract existed (§Precedents).
The contract encodes it once, and a CI guard blocks any new label that omits
either field.

**What counts as a label: a term the owner can attach to her business or product
as a claim about it.** Editorial prose that names a diet category and attaches
to nobody is not a label (MEH-2047: the chip «דל פחמימות» was withdrawn, the
phrase «תפריט דל פחמימות» in a landing page's intro rightly stays).


---

## The vocabulary

### scope (3 values)

| Value | Means | Example |
|---|---|---|
| `business` | The whole business carries it. | `verified` (רישוי מאומת) — the business's license; `has_delivery`; `kosher` (verified-only); `grass_fed`. |
| `any-product` | ≥ 1 matching product in the catalog — NOT the whole business. | `vegan` / `vegetarian` / `gluten_free` / `lactose_free` — `?vegan=true` is an EXISTS subquery over products (MEH-293). |
| `facility` | A property of the production site, not the catalog. | *Reserved* — used by the MEH-1508 gluten/lactose facility layer (shared vs dedicated). No label carries it yet. |

### evidence

| Value | Means | Example |
|---|---|---|
| `self-declared` | The business owner asserted it; no external check. | every diet filter, `has_delivery`, `grass_fed`. |
| `admin-verified` | An admin checked a document against an external registry. | `verified` (license vs Ministry of Health, ADR-022); `kosher` (kashrut_verified_at, MEH-986/1087). |
| `editorial` | A named editor's opinion. Nobody asserted it and nothing was checked — and it **cannot be bought** (ADR-030). | `recommended` (בחירת העורכות, MEH-1492; plural since MEH-3397). |
| `system` | Derived by the system: not asserted by anyone, not verified against anything. | `new` (BADGE_CONFIG — computed from `days_since_created <= 30`). Also the intended home for a computed distance / availability. |


The `license` badge (MEH-2191 ruling) left `BADGE_CONFIG` on 29/08 (#3156); its
history is in [docs/rules-history/2026-11-21/labels.md](../../docs/rules-history/2026-11-21/labels.md).
`has_producer_license` alone is self-declared: `admin-verified` describes the
admin gate, never the field.

---

## Where the metadata lives

There are **two** declaration sites, and they cover different surfaces:

| File | Governs | Consumers |
|---|---|---|
| `frontend/lib/filter-taxonomy.js` (`FILTER_AXES`) | **filter chips** — one declaration per axis, projected into `ATTRIBUTE_LABELS` / `CHIPS_CONFIG` / `TOGGLE_CHIPS` (MEH-2130) | home · /producers · /map filter rows, FilterSheet |
| `frontend/lib/badges.js` (`BADGE_CONFIG`) | **badges** — the pills on a card and a detail page (MEH-1753). Logic + metadata only; each badge's words are `badges.<key>.label` / `.tooltip` in `messages/{he,en}.json`, read via `useBadgeCopy()` (MEH-2740) | ProducerCard, BadgeRow, the `+N` overflow popover |

**Eleven claims exist on both** — ten sharing a key (`verified`, `grass_fed`,
`gluten_free`, `vegetarian`, `vegan`, `lactose_free`, `no_added_sugar`,
`kosher`, and — MEH-1508 chunk 3ב-2 — `vegan_all` / `vegetarian_all`, the
whole-business «טבעוני/צמחוני» layer (was «100% …» until MEH-2677) at `business` × `self-declared`) plus `delivery` ↔
`has_delivery`, which are the same claim under different keys. They are **not** hand-copies: `LabelScopeContract.test.js`
asserts each pair agrees on scope and evidence, so changing one side alone goes
red.

Their **labels** are deliberately not tied together — the `verified` badge reads
«מאומת» while its axis reads «רישוי מאומת», and their **predicates** may differ
too (the `delivery` badge also counts `delivery_count > 0` and is suppressed for
a delivery-only business, MEH-1841). The contract governs what a label *claims*
and *who established it*, never how the boolean is computed or how the copy is
worded.

`frontend/lib/attribute-labels.js` — `ATTRIBUTE_LABELS` is the projection the
filter surfaces consume. Each entry is an object:

```js
vegan: {
  scope: "any-product",       // MEH-293 EXISTS-over-products
  evidence: "self-declared",  // owner asserts it
  hasSubtext: true,           // filter_axes.vegan.subtext exists in messages
},
```

The words are NOT in code (MEH-2748): `filter_axes.<key>.label` / `.subtext` in
`messages/{he,en}.json` («מתאים לטבעונים» / «עסקים עם מוצרים טבעוניים בקטלוג»,
both LOCKED). A renderer passes each chip through `useChipCopy()`
(`lib/use-chip-copy.js`), which adds `label` / `subtext`, so `chip.label` is still a
plain string at the render site and every chip carries scope + evidence.
`/map`'s aggregate category chips read `map_category_chips.<key>` the same way.

The FilterSheet renders `subtext` under every diet row + grass_fed; the trust rows
(`kosher` · `verified`) fall back to their `BADGE_CONFIG` tooltip. The `/producers`
applied-filter summary reads scope-explicit via the `home.producers.filter_prefix`
copy ("מציג: עסקים עם").

---

## The guard

`frontend/__tests__/LabelScopeContract.test.js` — a **vitest** test (runs in the
required *CI gate*). It asserts every entry in `ATTRIBUTE_LABELS` / `CHIPS_CONFIG` /
`TOGGLE_CHIPS` declares a valid `scope` and `evidence`, and self-checks that the
validator actually rejects a missing/invalid field.

**Adding a new label:** add the object with `scope` + `evidence` + `hasSubtext` to
`FILTER_AXES` for a filter chip, with its words under `filter_axes.<key>` in
`messages/{he,en}.json` (`ChipCopyMessages.test.jsx` fails on a missing one,
MEH-2748), or to
`BADGE_CONFIG` for a badge. Omit either field → the guard fails. If the new label
is a claim that already exists on the other surface, add the pair to
`SHARED_CLAIMS` in the test so the two cannot drift. A badge's label and tooltip
go in `messages/{he,en}.json` under `badges.<key>` — `BadgeCopyMessages.test.jsx`
fails on a missing one (MEH-2740).

---

## Indicators & counters (MEH-1549)

> **Every counter, truncation, or abbreviation on a consumer surface must carry
> either interactive disclosure (tap/hover) or self-explanatory subtext.**

An indicator stands in for content it doesn't show (`+4`, `…`, a bare number,
an initialism). A `title` attribute does not count (invisible on touch); the
disclosure works by tap. A counter beside copy that already explains it
(«3 מוצרים בקטלוג») needs no popover. Worked case: `badge-overflow` `+N` on
ProducerCard is a `<button>` in `ui/Popover` (MEH-1547); as a static `<span>`
it was a dead end.

### The guard

`frontend/__tests__/LabelScopeContract.test.js` renders `ProducerCard` with 5
badges and asserts `badge-overflow` is a button carrying `aria-haspopup`. A new
indicator gets a disclosure or adjacent copy; a new overflow surface extends the
guard.

---

## Precedents (the four this contract encodes)

| Issue | Label | What went wrong |
|---|---|---|
| MEH-986 | כשרות | Unverified kosher claim on consumer surfaces — חוק איסור הונאה בכשרות → verified-only (admin-verified). |
| MEH-1259 | אורגני | Self-declared organic shown as a certificate — חוק תוצרת אורגנית 2005 → chip/badge removed. |
| MEH-1439 | diet tooltips | Product-level diet flags read as whole-business — tooltips corrected to any-product scope. |
| MEH-1492 | מומלץ / בחירת העורכת | Editorial priority read as an earned/paid status — renamed + criteria (ADR-030, pay-to-play ban). |

Cross-refs: `backend/app/services/producer_listing.py` (`_kosher_condition`
verified-only pattern).
