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
as a claim about it. Editorial prose that merely names a diet category is not a
label and is not bound by this contract — the test is whether a business gets
marked by it, not whether the words appear on screen.** MEH-2047 is the worked
pair: the *chip* «דל פחמימות» was withdrawn from every surface because no
standard defines it and an owner cannot substantiate it, while the phrase
«תפריט דל פחמימות» correctly survives in the locked intro copy of the
no-added-sugar landing page, where it describes who that page suits and attaches
to nobody. Deleting the second on the strength of the first would be a scope
error in the opposite direction — under-claiming — and it needs a copy decision,
not this rule.

---

## The vocabulary

### scope (3 values)

| Value | Means | Example |
|---|---|---|
| `business` | The whole business carries it. | `verified` (רישוי מאומת) — the business's license; `license` (רישיון יצרן, BADGE_CONFIG); `has_delivery`; `kosher` (verified-only); `grass_fed`. |
| `any-product` | ≥ 1 matching product in the catalog — NOT the whole business. | `vegan` / `vegetarian` / `gluten_free` / `lactose_free` — `?vegan=true` is an EXISTS subquery over products (MEH-293). |
| `facility` | A property of the production site, not the catalog. | *Reserved* — used by the MEH-1508 gluten/lactose facility layer (shared vs dedicated). No label carries it yet. |

### evidence

| Value | Means | Example |
|---|---|---|
| `self-declared` | The business owner asserted it; no external check. | every diet filter, `has_delivery`, `grass_fed`. |
| `admin-verified` | An admin checked a document against an external registry. | `verified` (license vs Ministry of Health, ADR-022); `kosher` (kashrut_verified_at, MEH-986/1087); `license` (BADGE_CONFIG — gated on the same `verification_tier === "verified"` check, MEH-1162). |
| `editorial` | A named editor's opinion. Nobody asserted it and nothing was checked — and it **cannot be bought** (ADR-030). | `recommended` (בחירת העורכת, MEH-1492). |
| `system` | Derived by the system: not asserted by anyone, not verified against anything. | `new` (BADGE_CONFIG — computed from `days_since_created <= 30`). Also the intended home for a computed distance / availability. |

> **All four values are now in active use.** `editorial` was added by MEH-1753,
> which brought `BADGE_CONFIG` under this contract and found `recommended` fitting
> neither existing value: the owner cannot set it, and no document is checked, so
> filing it under `admin-verified` would repeat the very over-claim MEH-1492
> fixed — that value reads as an earned status. `system` was **reserved with no
> example** until the same pass gave it one in `new`.
>
> _(This block previously read "Two evidence values are in active use … `system`
> is reserved", and the `system` row was missing its Example cell entirely — a
> three-column table with a two-cell row. Both corrected under MEH-1753 from the
> live config, not from the spec.)_

### The `license` ruling (MEH-2191, 26/08)

| Label | scope | evidence | Rationale |
|---|---|---|---|
| `license` (רישיון יצרן) | `business` | `admin-verified` | The claim is established by the manual per-business approval against the documents — the DNA lock («עסקים מורשים בלבד» + «אישור ידני לכל עסק»), not by the owner typing a number. |

**Why this row exists at all.** MEH-1753 brought all twelve `BADGE_CONFIG`
entries under this contract, and `license` was the **one cell of the twelve that
was derived rather than looked up**: the badge gates on the same
`verification_tier === "verified"` admin check as `verified` (MEH-1162), so the
values were read off the `verified` row — a defensible inference, and still an
inference. CC flagged it instead of quietly minting policy (rule 24), and this
row is the lookup that replaces the derivation.

`has_producer_license` **alone** is self-declared — a producer typing
`000000000` earned the chip before MEH-1162 added the verified gate. The
`admin-verified` value describes the gate, never the field, which is the same
distinction the kashrut precedent (MEH-1711) draws.

**Measured at ruling time:** `frontend/lib/badges.js` already carried
`scope: "business"` · `evidence: "admin-verified"`, so the ruling **matched** the
derived cell and no code changed.

---

## Where the metadata lives

There are **two** declaration sites, and they cover different surfaces:

| File | Governs | Consumers |
|---|---|---|
| `frontend/lib/filter-taxonomy.js` (`FILTER_AXES`) | **filter chips** — one declaration per axis, projected into `ATTRIBUTE_LABELS` / `CHIPS_CONFIG` / `TOGGLE_CHIPS` (MEH-2130) | home · /producers · /map filter rows, FilterSheet |
| `frontend/lib/badges.js` (`BADGE_CONFIG`) | **badges** — the pills on a card and a detail page (MEH-1753) | ProducerCard, BadgeRow, the `+N` overflow popover |

**Nine claims exist on both** — eight sharing a key (`verified`, `grass_fed`,
`gluten_free`, `vegetarian`, `vegan`, `lactose_free`, `no_added_sugar`,
`kosher`) plus `delivery` ↔ `has_delivery`, which are the same claim under
different keys. They are **not** hand-copies: `LabelScopeContract.test.js`
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
needs an in-component explanation) to `FILTER_AXES` for a filter chip, or to
`BADGE_CONFIG` for a badge. Omit either field → the guard fails. If the new label
is a claim that already exists on the other surface, add the pair to
`SHARED_CLAIMS` in the test so the two cannot drift.

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

Cross-refs: `backend/app/services/producer_listing.py` (`_kosher_condition`
verified-only pattern).

_(`frontend/lib/badges.js` used to be listed here as a cross-reference. It is
**in-contract** as of MEH-1753 and is documented above under "Where the metadata
lives" — which is the point of that ticket: all four precedents this file
encodes are badge incidents, so the badge surface was the one governed by the
rule its own history wrote and not covered by the guard.)_
