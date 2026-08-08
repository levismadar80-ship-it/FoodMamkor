# `.loose()` is top-level only — nested-object stripping audit

**MEH-1896 · Phase 0 · 2026-08-08 · read-only, no schema changed**

---

## 0 · The headline: the ticket predicted a latent gap. One instance is LIVE.

MEH-1896 opens with `categories[].producer_count` and calls the class *"inert today"*.
Both halves need correcting, in opposite directions:

- **`categories[].producer_count` is even more inert than the ticket says** — see §3. It is
  stripped, but nothing on that path ever populates it, so the strip removes a `null`.
- **`delivery_areas[].delivery_fee` was a LIVE BUG — fixed 2026-08-08 under MEH-1942.**
  It was stripped on the producer-detail path while `DeliveryBlock.jsx:429` read it.
  Every link verified; the fix and the one gap it does not close are in §2.

The ticket asked for live bugs to be reported "separately and loudly". This is that section.

---

## 1 · Inventory — every nested object literal, and what it strips

`.loose()` appears in exactly **one** runtime place (`useProducerData.js:26`) and one
composition (`api-schemas.js:92`). Neither reaches a nested object.

| # | Zod nested shape | file:line | Pydantic counterpart | keys STRIPPED |
|---|---|---|---|---|
| 1 | `categories[]` | `schemas.js:85-89` | `CategoryOut` `schemas.py:831-841` | `producer_count` |
| 2 | `delivery_areas[]` | `schemas.js:104-109` | `DeliveryAreaOut` `schemas.py:~899-911` | ~~**`delivery_fee`**~~ — **none, fixed 08/08 (MEH-1942, §2)** |
| 3 | `locations[]` | `schemas.js:117-125` | `ProducerLocationOut` `schemas.py:~936-951` | `opening_hours`, `phone` |
| 4 | `active_offer` | `schemas.js:134-142` | `ProducerOfferOut` `schemas.py:1218-1224` | **none — complete** |
| 5 | `CategorySchema` (top level) | `api-schemas.js:23-27` | `CategoryOut` | `producer_count` |
| 6 | `OrderWindowRange` | `schemas.js:34` | (range literal) | not compared — not an API shape |

`active_offer` is the control that shows this is not a blanket failure: its seven declared
keys match `ProducerOfferOut` exactly. Nested declaration *can* be complete; three of the
four simply are not.

`locations[].precision` is correctly declared — Pydantic sends
`location_precision` under `serialization_alias="precision"` (`schemas.py:951`), and the Zod
side declares `precision`. Worth noting because it looks like a mismatch and is not.

---

## 2 · ✅ FIXED 2026-08-08 (MEH-1942) — `delivery_areas[].delivery_fee`

> **The schema half is closed.** `schemas.js` now declares
> `delivery_fee: z.number().nullable().optional()` inside the `delivery_areas`
> shape, matching `int | None`. The parse keeps the value, and a city with free
> delivery renders **משלוח חינם** instead of the producer's rate.
> Guard: `frontend/__tests__/DeliveryFeeNestedSchema.test.jsx` — five cases,
> **all five shown failing** against the shape below and passing after.
>
> **One thing the schema fix does NOT reach, measured while fixing it.** The
> component only consults per-area fees when they **vary**
> (`DeliveryBlock.jsx:430` — `new Set(effectiveFees).size > 1`). A producer with
> a **single** area overriding to 0 against a producer-level rate therefore still
> shows the producer rate: the value now arrives, and nothing reads it. That is a
> component selection rule, not a stripping bug, and it is out of MEH-1942's
> stated scope — pinned as a characterisation case in the same test file so the
> follow-up starts from a measurement. **Worth knowing because MEH-1942's own DoD
> proposed exactly that single-area payload as its discriminating case**; it does
> not discriminate, and the two-area form is what does.
>
> The rest of this section is preserved as the diagnosis that produced the fix.
> §1's inventory row 2 is now stale for the same reason.

**Every link verified, in order:**

| # | link | evidence |
|---|---|---|
| 1 | detail page takes the parsed producer | `ProducerDetail.jsx:42` — `const { producer } = useProducerData({...})` |
| 2 | the parse is **top-level** loose | `useProducerData.js:26` — `ProducerDetailSchema.loose()` |
| 3 | the detail schema does **not** redeclare `delivery_areas` | `schemas.js:264-269` — `.extend({website, instagram, facebook, external_order_form})`, four top-level strings only |
| 4 | so the nested shape is inherited, and omits the key | `schemas.js:104-109` — `z.array(z.object({ id, city, min_order, delivery_day }))` |
| 5 | Pydantic **does** serialize it per area | `schemas.py:911` — `delivery_fee: int \| None = None` on `DeliveryAreaOut` |
| 6 | the producer is passed down | `ProducerDetail.jsx:262` → `ProducerSections.jsx:525` — `areas={producer.delivery_areas \|\| []}` |
| 7 | the component reads it **per area** | `DeliveryBlock.jsx:429` — `.map((da) => da.delivery_fee ?? producerFee)` |

**What the user sees.** `da.delivery_fee` is `undefined` for every area, so the `?? producerFee`
fallback fires **every time** and the per-area fee is replaced by the producer-level one.

**Why it is silent rather than broken** — and why this is the worse shape:

- It renders a **plausible wrong number**, never an error or a blank.
- `DeliveryBlock.jsx:417` carries a comment stating the API serializes `delivery_fee` per area
  **without coalescing** — i.e. the component was written *knowing* per-area values exist and
  deliberately reads them. The schema silently removed the input to that design.
- `DeliveryBlock.jsx:320` notes *"`0` is a VALUE here and not an absence"*. So a city with
  **free delivery** (`delivery_fee = 0`) does not render free — `0 ?? producerFee` keeps `0`
  in JS, but the key is `undefined`, not `0`, so it falls through to the producer fee. **A
  free-delivery city displays a charge.**

This is the seven-times-repeated class (MEH-901 / 1704 / 1713 / 1719) with one difference: the
field is nested, so `.loose()` — the fix adopted for the top level — does not reach it.

**Not fixed here.** Phase 0 is report-only, and the over-engineering guard forbids fixing a live
bug found in passing. It needs its own ticket.

---

## 3 · Latent, with the ticket's premise refined

**`categories[].producer_count` (#1) — inert, and more so than the ticket states.**
`CategoryOut`'s own comment (`schemas.py:836-838`) says it is *"populated only by
`GET /admin/categories`… so public consumers (`GET /categories`, `ProducerOut.categories`)
serialize unchanged — NOT a DB column."* `ProducerOut.categories` is `list[CategoryOut]`
(`schemas.py:2018`), so on the producer path the key serializes as `null`. **The strip removes
a null.** The ticket's *"ה-API מחזיר אותו"* is true only in the sense that the key is present.

**`CategorySchema` top-level (#5) — omits `producer_count`, and it does not matter, for a
reason worth writing down.** The one consumer that reads it is the admin content page
(`admin/content/page.js:93`, `:164`, `:200`), and that page does **no Zod parse at all**:
`:58` is `api.get("/admin/categories").then((r) => setItems(r.data))`. Raw response, nothing
stripped. **Not a live bug — but it is a live bug waiting for someone to "harden" that page
by adding the parse.** Anyone wiring `CategoriesResponseSchema` into it turns
`{count} בתי עסק` into a permanent `0 בתי עסק`, because `:200` reads
`cat.producer_count ?? 0`.

**`locations[].opening_hours` / `.phone` (#3) — latent.** `OpeningHours.jsx:47` takes
`opening_hours` as a prop, but from the producer-level field, not from a `locations[]` element.
No component reads a per-location `opening_hours` or `phone` today. That is exactly the shape
of MEH-1412's intent though — per-location detail — so this strip will bite whoever builds it.

---

## 4 · The verdict the ticket exists for

> **No. The MEH-1891 parity guard cannot see nested stripping.**
> `backend-contract-parity.test.js:192` is `const zodKeys = new Set(Object.keys(zod.shape))` —
> one level. It never unwraps `ZodArray` and never descends into a nested `ZodObject`, so a
> nested strip produces no top-level difference and the guard reports green.

That is a green with two causes — *"the contracts agree"* and *"the difference is one level
below where I look"* — and nothing in its output separates them. Four of the six shapes above
are invisible to it.

---

## 5 · The three options, compared — and the argument against my own pick

| | verbosity | how the next field gets forgotten | debuggability |
|---|---|---|---|
| **(א)** `.loose()` on every nested object | High — 4 sites now, every future nested shape after | **Easy.** Nothing reminds anyone. Same failure mode that produced this audit | **Best.** Leniency is visible at each site |
| **(ב)** recursive helper over the whole tree | Lowest | **Hard to forget** — applies automatically | **Worst.** When a schema behaves unexpectedly, the cause is a traversal you have to reason about, not a line you can read |
| **(ג)** leave it + extend the guard to nested | None in the schemas | Doesn't apply — the guard *reports* | **Good.** A failing test naming the key |

**(ג) is not an alternative to (א)/(ב) — the ticket says so and it is right.** It converts a
silent strip into a visible one; it does not stop the stripping.

**Phase 0 was asked whether (ג) alone suffices given the known nested fields are inert. It does
not — because they are not all inert.** §2 is live. (ג) alone would have turned
`delivery_fee` red in CI and left the wrong fee on the page until someone acted on it.

**Recommendation: (ג) first, then (א).** (ג) is the higher-value half and is pure addition —
it makes the *class* visible, including the shapes nobody has audited yet. Then (א) at the
four measured sites, because explicit-at-the-site is what this repo has repeatedly chosen and
what a reader can verify without holding a traversal in their head.

**The argument against my own recommendation, as required:**

(א) is *exactly* the mechanism that failed here. Six shapes, three wrong — a per-site
convention with no enforcement has a demonstrated ~50% miss rate in this very file, and
recommending more of it is recommending the thing that broke. (ב)'s debuggability cost is
speculative; (א)'s forgetting cost is **measured, in this document**. The honest reading is
that (ג) is doing the real work in my recommendation and (א) is a convention I am trusting
against evidence. If (ג) ships and holds, the case for (ב) over (א) gets stronger, not weaker
— and the structurally correct answer is neither: it is MEH-1748's OpenAPI codegen, which
deletes the hand-maintained parallel entirely.

---

## 6 · Scope

Read-only. No schema touched, no `.loose()` added, nothing fixed — including §2. `git status`
carries only this file.

_(This section describes the audit PR's own scope and stays as written. The
follow-up status below is the only thing kept current.)_

**Follow-ups this audit should produce (not opened here):**
1. ~~the `delivery_fee` live bug (§2) — its own ticket, with the free-delivery case as the
   test~~ — **shipped 08/08 (MEH-1942).** The free-delivery case is indeed the test, with one
   correction the ticket could not have known: it needs **two** areas, not one. See §2.
2. extend the parity guard to walk nested shapes (option ג)
3. a note on `admin/content/page.js` so a future "add validation" pass does not introduce §3's
   waiting bug
