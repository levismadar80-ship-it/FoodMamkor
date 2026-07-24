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

## Precedents (the four this contract encodes)

| Issue | Label | What went wrong |
|---|---|---|
| MEH-986 | כשרות | Unverified kosher claim on consumer surfaces — חוק איסור הונאה בכשרות → verified-only (admin-verified). |
| MEH-1259 | אורגני | Self-declared organic shown as a certificate — חוק תוצרת אורגנית 2005 → chip/badge removed. |
| MEH-1439 | diet tooltips | Product-level diet flags read as whole-business — tooltips corrected to any-product scope. |
| MEH-1492 | מומלץ / בחירת העורכת | Editorial priority read as an earned/paid status — renamed + criteria (ADR-030, pay-to-play ban). |

Cross-refs: `frontend/lib/badges.js` (BADGE_CONFIG tooltips),
`backend/app/services/producer_listing.py` (`_kosher_condition` verified-only pattern).
