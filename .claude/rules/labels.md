# Label Scope Contract (MEH-1507)

Every **consumer-facing label** on mehamakor.online must state two things:

- **scope** — WHAT the label applies to.
- **evidence** — WHO established it.

A label that hides its scope over-claims: a product-level filter reads as a
whole-business property, or a self-declaration reads as a certificate. That class
was fixed point-wise **four times** before this contract existed (§Precedents).
The contract encodes it once, and a CI guard blocks any new label that omits
either field.

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
| `system` | *Reserved* — derived by the system, not asserted or verified (e.g. a computed distance / availability). No label carries it yet. |

> Two evidence values are in active use (`self-declared`, `admin-verified`); `system`
> is reserved. (The MEH-1507 spec named "two evidence values" in one place and
> `self-declared | admin-verified | system` in the audit-table column in another —
> this doc follows the audit-table enumeration and marks `system` reserved.)

---

## Where the metadata lives

`frontend/lib/attribute-labels.js` — `ATTRIBUTE_LABELS` is the single source of
truth. Each entry is an object:

```js
vegan: {
  label: "טבעוני",            // the rendered string (chip row unchanged)
  scope: "any-product",       // MEH-293 EXISTS-over-products
  evidence: "self-declared",  // owner asserts it
  subtext: "עסקים עם מוצרים טבעוניים בקטלוג", // in-component scope explanation (LOCKED)
},
```

`CHIPS_CONFIG` (`producer-filters.js`) and `TOGGLE_CHIPS` (`map-chips.js`) **spread**
these objects, so `chip.label` stays a plain string (no visual change to any chip
row) while every chip carries scope + evidence. `grass_fed` is `/map`-local, so its
object lives in `map-chips.js` (`GRASS_FED_LABEL`), same shape.

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

Implemented as a vitest test (not a `.github/workflows/pr-checks.yml` step) because
`.github/workflows/**` is CC-deny (MEH-671) and vitest already gates every PR — and
because the pattern the MEH-1507 spec cites, the **MEH-1472 emoji guard**
(`NoEmojiInComponents.test.js`), is itself a vitest test. Same mechanism, real gate.

**Adding a new label:** add the object with `scope` + `evidence` (+ `subtext` if it
needs an in-component explanation) to `ATTRIBUTE_LABELS` (or a surface-local object
of the same shape). Omit either field → the guard fails.

---

## Indicators & counters (MEH-1549)

The contract above governs **labels** — a string that names a property. It says
nothing about the other thing a consumer surface renders: an **indicator** that
stands in for content it doesn't show. Those need a rule of their own, because a
label that hides its scope over-claims, while an indicator that hides its content
simply cannot be read at all.

> **Every counter, truncation, or abbreviation on a consumer surface must carry
> either interactive disclosure (tap/hover) or self-explanatory subtext.**

An indicator is anything whose rendered form is a stand-in: `+4`, `‎…`, a bare
number, an initialism, a shortened list. The reader can see that something was
withheld but not what — so the surface must offer a way to find out, in place. A
`title` attribute does not count (invisible on touch); the disclosure has to work
by tap, since mobile is the primary surface.

| | Example | Verdict |
|---|---|---|
| ✅ | `badge-overflow` `+N` on ProducerCard — a `<button>` wrapped in `ui/Popover` listing the hidden badge labels (MEH-1547) | Interactive disclosure. The reader taps `+3` and learns it means כשר · משלוח · מוצרים. |
| ❌ | the same `+N` as a static `<span>` (its shape before MEH-1547) | Dead end. Sapir's own QA: *"אני לא מבינה מה זה"* — if the founder can't decode it, no consumer will. |

The two routes are alternatives, not a ranking: a counter sitting beside copy that
already explains it ("3 מוצרים בקטלוג") needs no popover. What is never acceptable
is an indicator that is *only* a glyph or a number, with the thing it replaces
unreachable from that surface.

**Why this belongs next to the scope contract:** both encode the same failure —
a surface showing less than it implies. Scope answers *what does this apply to*;
disclosure answers *what is behind this*. Same review question, same file.

### The guard

`frontend/__tests__/LabelScopeContract.test.js` carries the assertion (same file,
same reasoning as above: `.github/workflows/**` is CC-deny, vitest already gates
every PR). It renders `ProducerCard` with a producer earning 5 badges and asserts
the `badge-overflow` element is interactive — a `<button>` (or `role="button"`)
carrying `aria-haspopup`.

Proven fail→pass: against the pre-MEH-1547 markup (a static `<span>` with neither
attribute) the assertion fails on all three counts; against the shipped component
it passes. A future refactor that flattens the `+N` back to a `<span>` re-reds it.

**Adding a new indicator:** give it a disclosure affordance or adjacent explanatory
copy, and extend the guard if it's a new overflow surface.

---

## Precedents (the four this contract encodes)

| Issue | Label | What went wrong |
|---|---|---|
| MEH-986 | כשרות | Unverified kosher claim on consumer surfaces — חוק איסור הונאה בכשרות → verified-only (admin-verified). |
| MEH-1259 | אורגני | Self-declared organic shown as a certificate — חוק תוצרת אורגנית 2005 → chip/badge removed. |
| MEH-1439 | diet tooltips | Product-level diet flags read as whole-business — tooltips corrected to any-product scope. |
| MEH-1492 | מומלץ / בחירת העורכת | Editorial priority read as an earned/paid status — renamed + criteria (ADR-030, pay-to-play ban). |

Cross-refs: `frontend/lib/badges.js` (BADGE_CONFIG tooltips),
`backend/app/services/producer_listing.py` (`_kosher_condition` verified-only pattern).
