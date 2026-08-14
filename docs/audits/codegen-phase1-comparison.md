# MEH-1748 Phase 1 — generated Zod vs the hand-written schemas

**Date:** 2026-08-14 · **Scope:** additive only. No call site swapped, no hand schema
touched, Phase 2 not authorised.
**Authority:** Sapir's ruling on MEH-1748, 14/08 — *"לאמץ, בשלבים"*.

Every number below was measured on this branch, against
`backend/openapi.json` as generated on 14/08 (152 paths, 123 schemas) and
`frontend/lib/generated/api.zod.js` as generated from it. Re-measure rather than
quote: the contract has already moved twice since the 28/07 spike.

---

## 0 · Headline

**The pipeline works, and it is better than the hand-written schemas on the exact
axis the ticket exists for: it declares every field the backend serves, and it
loses nothing the hand schemas currently have.**

| | measured |
|---|---|
| generated list schema | **69 fields** — identical set to `ProducerListOut` |
| generated detail schema | **85 fields** — identical set to `ProducerDetailOut` |
| fields generation adds over the hand schemas | **17** (list) + **29** (detail) = **46** |
| fields generation DROPS vs the hand schemas | **0** — in both directions, both schemas |
| bundle delta under a real `npm run build` | **0 bytes**, byte-identical |

**And three findings that make Phase 2 harder than the ruling assumed.** They are in
§7, they are not fatal, and none of them was visible from the spike:

1. the generated schemas are **stricter** than the hand ones and reject a row the
   hand ones accept — on `/map`'s all-or-nothing array parse that is a feed-killer;
2. `order_window` generates as a **structureless** `looseObject({})`, so for that one
   field the hand schema is *more* informative than the generated one;
3. **42% of response operations (79/188) generate as `zod.unknown()`** — the routes
   with no declared `response_model` get nothing at all.

---

## 1 · Tool choice — orval stays, and this was a real check

The ruling named orval the baseline "because it was tested, not because it was
chosen". It was compared against `openapi-zod-client`, the closest alternative.
**Both were actually run against this repo's spec**; nothing below is inferred from
a README or a dependency list.

| axis | **orval 8.24.0** ✅ | openapi-zod-client 1.18.3 |
|---|---|---|
| **Zod 4** | Explicit `version: 3 \| 4 \| 'auto'` target. Emits `import * as zod from 'zod/mini'` | Depends on `zod: ^3.19.1`. Output uses `.passthrough()`, the Zod 3 form |
| **Tree-shaking** | `variant: 'mini'` + `/*#__PURE__*/` on every export | Plain `z.object()`. No mini variant, no pure annotations |
| **Runtime deps** | none — output imports only `zod` | **output imports `@zodios/core`** — a *runtime* dependency |
| **Language** | `.js` (configurable) | `.ts` only — would be the repo's first real `.ts` source file in `lib/` |
| **Nested fidelity** | mirrors every nested object (§5) | not reached — disqualified above |
| **Extendable output** | sibling files survive regeneration (§4, measured) | not reached |
| **Maintenance** | published **2026-08-08**, 6 days before this measurement | **2026-06-15**, ~2 months stale |

`@zodios/core` is decisive on its own: this task's stop condition (a) fires on a
generator that needs a *runtime* dependency. Combined with Zod 3 output and a
TypeScript-only emitter, the alternative was disqualified on axis 1 and never needed
axes 2–3.

### The one axis where orval is worse, stated plainly

orval names schemas **per operation** and inlines the shape at each one;
openapi-zod-client names them **per component** and reuses them. Measured on the
producer contract via a distinctive field:

| | occurrences of `kashrut_badges` | output size |
|---|---|---|
| orval | **11** | 406,159 B |
| openapi-zod-client | 4 | 177,427 B |

So orval's output is **2.3× larger**, and one backend model appears as eleven
independent copies. That costs nothing today (§6: the delta is zero because nothing
imports it) but it is the thing to watch in Phase 2: swapping six call sites means
picking six *operation-named* schemas, and a reviewer cannot tell from the name that
`ListProducersProducersGetResponseItem` and
`GetProducerBySlugProducersBySlugSlugGetResponse` are the same Pydantic pair. **This
is a real argument the ruling did not have. It does not reverse the ruling** — the
alternative loses on three harder axes — but it should shape Phase 2's call-site
work, and it is why §8 recommends a thin named-adapter sibling rather than importing
operation names directly into components.

**Configuration** (`frontend/orval.config.js`): response schemas only — the ruling
leaves the request side (`GeoSearchSchema`, `CoordSchema`, `LocationInputSchema`)
hand-written. `version: 4` is pinned rather than `'auto'` so a zod bump cannot
silently rewrite every file and red the drift gate for a reason unrelated to the
contract.

---

## 2 · Field-level comparison

Derived by importing the real modules — `lib/schemas.js` and the generated file —
and reading their shapes, never by re-implementing either.

| | backend | generated | hand |
|---|---|---|---|
| `ProducerListOut` / `ProducerListSchema` | 69 | **69** | 52 |
| `ProducerDetailOut` / `ProducerDetailSchema` | 85 | **85** | 56 |

- **generated vs backend: `[]` missing, both schemas.** The generated file is a
  complete mirror of the served contract, which is the property the seven
  recurrences (MEH-826 · 901 · 902 · 766 ch5 · 1412 · 1704 · 1719) each violated once.
- **hand → generated: `[]` dropped, both schemas.** Nothing the hand schemas declare
  is lost. See §3.
- **generated → hand: 46 fields the hand schemas do not declare** — 17 on the list,
  29 on the detail. This is exactly the `KNOWN_UNDECLARED` baseline that
  `backend-contract-parity.test.js` grandfathers, arrived at from the opposite
  direction.

The 17 list-side additions:

```
ambassador · delivery_cities · delivery_excluded_cities · delivery_fee
delivery_nationwide · description · free_delivery_above · gluten_free_facility
kashrut_certs · lactose_free_facility · organic_certified · phone_verified
pickup_points · status · vacation_until · vegan_scope · vegetarian_scope
```

### Instrument check

`backend/openapi.json` and `backend/app/schemas/producer_contract_snapshot.json` are
produced by two independent mechanisms — FastAPI's OpenAPI generator, and a pytest
that introspects the Pydantic classes. They agree **field for field, symmetric
difference `[]`, on both classes**. That is the cross-validation that makes the 69/85
counts trustworthy; either artifact alone would be a single unchecked instrument.

---

## 3 · The four detail-only fields — **CONFIRMED, not refuted**

The spike's blocker (b) was that `ProducerSchema` was a hand-merge of two backend
contracts, so `website` · `instagram` · `facebook` · `external_order_form` were
dropped by generation. **MEH-1752 resolved this, and the resolution holds.**

- `frontend/lib/schemas.js:287-292` — `ProducerDetailSchema = ProducerListSchema.extend({ website, instagram, facebook, external_order_form })`.
- `frontend/lib/schemas.js:300` — `ProducerSchema` is now an alias of the detail schema.
- Backend: `ProducerDetailOut` declares all four; `ProducerListOut` declares none.

Measured consequence: **`hand has, gen drops` is `[]` for both schemas.** There is now
a generated schema whose field set is a superset of each hand schema, which is
precisely what the spike said did not exist. **Stop condition (e) does not fire.**

---

## 4 · The two deliberate exclusions — recommendation: **adapter sibling**

`delivery_cities` (`schemas.js:82-84`) and `organic_certified` (`schemas.js:169-173`)
are excluded from the hand schemas **on purpose**, with reasoning comments. Both are
in `ProducerListOut` and therefore both appear in the generated output. Three ways to
keep them excluded:

| option | verdict |
|---|---|
| **`.omit()` at the consumption site** | ❌ Recreates a hand-maintained field list — the exact artifact class this ticket exists to delete. The spike said so and was right. |
| **`override.transformer`** | ❌ Mutates the spec *before* generation, so the generated file stops being a faithful mirror of the contract. It also hides the exclusion inside build config, where no reader of the schema will find it. |
| **adapter sibling** ✅ | A small hand-written module beside the generated file that imports it and re-exports the shape the app should consume. |

**Recommended: the adapter sibling**, and it is what makes Sapir's ruling point 4
("generated code is no longer a black box — a file you can extend that regen does not
overwrite") true in practice. Measured, not assumed: a file placed in
`frontend/lib/generated/` **survives regeneration byte-identical** — orval rewrites
only its configured target. Verified by writing `_probe_sibling.js`, regenerating, and
reading it back unchanged.

The honest caveat: an adapter still contains a hand-written list of two field names.
The difference from `.omit()`-at-six-call-sites is **arity and visibility** — one list
in one file that exists to say "these are deliberately not consumed, here is why",
versus a list repeated at every parse site with nothing tying the copies together.
That is a real improvement, not an elimination, and it should not be sold as one.

**Not built in Phase 1** — an adapter is a consumption mechanism, and nothing consumes
the generated schemas yet.

---

## 5 · Nested objects — generation mirrors what the hand schemas strip

`docs/audits/nested-schema-stripping.md` established that `.loose()` is top-level only,
so nested `z.object`s go on stripping. Every case from that audit's §1 inventory,
re-measured against the generated output:

| nested shape | hand | generated | keys the hand schema strips | audit agreement |
|---|---|---|---|---|
| `categories[]` | 3 | **4** | `producer_count` | ✅ row 1 |
| `delivery_areas[]` | 5 | 5 | — none | ✅ row 2 (fixed by MEH-1942) |
| `locations[]` | 7 | **9** | `opening_hours`, `phone` | ✅ row 3 |
| `active_offer` | 7 | 7 | — none | ✅ row 4 |

**Generation reproduces all four verdicts independently.** The audit found rows 1 and 3
by hand; the generated schemas surface the same two gaps mechanically, which is the
strongest single piece of evidence that the pipeline catches what humans miss — it
re-derived a known-correct answer without being told it.

**The exception, and it runs the other way — `order_window`.** The hand schema declares
a structured `OrderWindowRange` (`schemas.js:34`) with `open`/`close`. Generation emits:

```js
"order_window": zod.optional(zod.union([zod.looseObject({}), zod.null()]))
```

…because the spec declares it as a bare `{"anyOf": [{"type": "object"}, {"type": "null"}]}`
with no properties — Pydantic types it as an untyped dict. **For this field the
hand-written schema carries more information than the generated one**, and no
generator can invent structure the contract does not declare. The fix is upstream, in
the Pydantic model, not in the generator.

---

## 6 · Bundle delta — **0 bytes**, measured under a real `npm run build`

MEH-1751 refuted the spike's esbuild-proxy number. This is a real Next build, run twice
on the same machine — once with the generated file present, once with the branch
stashed to clean `staging`:

| | JS files emitted | total bytes under `.next/static` |
|---|---|---|
| without `lib/generated/` | 123 | 4,348,814 |
| with `lib/generated/` | 123 | **4,348,814** |

**Byte-identical.** The generated schemas cost nothing because nothing imports them —
that is a property of Phase 1 being additive, **not** a demonstration that `variant:
'mini'` tree-shakes. **Do not cite this number as evidence about `mini`.** It is
evidence that Phase 1 is free, and the honest reading is that the bundle question
remains **open until Phase 2 imports something**. `mini` + `/*#__PURE__*/` is the
mitigation that should make the eventual delta small; it is unmeasured, and the 2.3×
duplication in §1 is the reason not to assume it will be negligible.

---

## 7 · Three findings that complicate Phase 2

None of these blocks Phase 1. All three should be settled before any call site is
swapped.

### 7.1 · The generated schemas are stricter, and that is dangerous here

The generated schemas carry the spec's **formats**; the hand schemas are deliberately
permissive so that `/map`'s all-or-nothing array parse "can never newly drop a
producer" (`schemas.js` comment on the MEH-901 block). Measured on a minimal row:

```
row = { id: "not-a-uuid", name: "מאפיית שקד" }
  hand      : ACCEPT
  generated : REJECT  (id: invalid_format — zod.uuid() vs z.union([z.string(), z.number()]))
```

The hand schema types `id` as `string | number` **on purpose** — a documented defence
against a future int→uuid migration. A naive Phase 2 swap at
`useProducersFeed.js` would convert one malformed row into an empty map feed. Phase 2
must decide, per call site, whether it wants the spec's strictness or the hand
schema's permissiveness — and that is a behaviour change, which is exactly why the
ruling made Phase 2 a separate HIGH-RISK authorisation.

### 7.2 · 42% of response operations generate as `zod.unknown()`

**79 of 188** generated response exports are `zod.unknown()` — every route without a
declared `response_model`. Codegen cannot cover them, and a `zod.unknown()` is a parse
that validates nothing while looking like validation. Any Phase 2 call-site swap must
check that the operation it targets is not one of these. Closing the gap means adding
`response_model=` in the backend, which is independently worth doing.

### 7.3 · Operation-named, eleven-times duplicated

See §1. Phase 2 should import through a small named adapter
(`ProducerList = ListProducersProducersGetResponseItem`) rather than scattering
operation names through components, or the call sites become unreadable and a
contract change becomes impossible to review.

---

## 8 · The drift gate — what it covers, and what it does not

`scripts/checks/openapi-codegen-drift-guard.sh`, collected automatically by the
existing `Repo guards` job (`scripts/checks/run-all.sh` discovers any executable
`*.sh`; **no workflow edit was made or needed** — `.github/workflows/**` is CC-deny,
MEH-671).

The chain has three links and they are **not** equally protected:

| link | check | runs in CI? |
|---|---|---|
| generated ↔ spec, both directions | **Tier A** — sha256 vs a committed manifest | ✅ **yes** |
| spec → generated, by re-running orval | Tier B — regenerate + diff | ❌ needs `node_modules` |
| **Pydantic → spec** | Tier C — regenerate + diff | ❌ needs the backend venv |

**The `Repo guards` job is a bare `actions/checkout` plus one bash call.** No `npm ci`,
no `uv sync`, no network, and `scripts/checks/README.md` puts the budget at ~1s. A
regenerate-and-`git diff` guard — the shape the ticket described — therefore cannot
run there at all. Tier A exists so the guard is not a no-op in the only environment it
actually runs in; Tiers B and C do run the real regeneration wherever the toolchain
exists (a dev machine, `npm run codegen`), and **announce whether they ran on every
run**, printing `WARNING` when they do not so `run-all.sh` surfaces it inline
(MEH-1715) instead of reporting a silent pass.

> ### ⚠️ The gap, stated so nobody infers coverage that is not there
>
> **In CI today, a backend Pydantic field added without re-running the generator is
> not caught.** The spec and the manifest agree with each other while both disagree
> with the app, and Tier A cannot see that.
>
> **Recommended Phase 1.5 (not built here):** a pytest that regenerates the spec and
> fails if `backend/openapi.json` is stale — the exact shape of
> `tests/test_producer_contract_snapshot.py`, riding the `Backend tests (pytest)` leg
> where the venv already exists. That is a new backend test file, outside this
> ticket's authorised file list, so it is recommended rather than smuggled in.
>
> Partial mitigation that already exists: `producer_contract_snapshot.json` covers
> the two producer classes on that same pytest leg, so the highest-traffic contract
> is not unguarded — just not guarded *by this gate*, and only for two classes out of
> 123.

**The gate was verified failing, not just passing** (`.claude/rules/testing.md` — a
guard never seen to fail is not a verified guard):

- `--self-test` runs the **real** `tier_a` against copies of the repo's own committed
  artifacts, **control first**: 11 cases, 5 break-then-restore pairs, 0 failed. If the
  control fails the run aborts and says every subsequent red is untrustworthy.
- End-to-end: adding one field to `ProducerListOut` in
  `backend/app/schemas/schemas.py` made the gate **exit 1** naming the stale spec;
  reverting made it **exit 0**.

---

## 9 · Verdict

**Phase 1 delivers what the ruling asked for, and the evidence supports Phase 2 —
with three named conditions rather than as a formality.**

The core claim survives measurement: generation produces a complete, faithful mirror
of the backend contract, drops nothing the hand schemas have, adds the 46 fields they
miss, and independently reproduces two nested-stripping defects a human audit found by
hand. That is a structural fix for a class that recurred seven times.

**Before Phase 2 swaps anything:**

1. Decide strictness per call site (§7.1). This is a behaviour change and the reason
   Phase 2 is HIGH-RISK.
2. Close the CI gap on link 1 (§8) — otherwise the gate's strongest link is the one
   that does not run.
3. Adopt the adapter-sibling pattern (§4, §7.3) before the first import, not after.

**Nothing in Phase 1 is load-bearing yet.** `frontend/lib/generated/` is imported by
zero files, `lib/schemas.js` and `lib/api-schemas.js` are byte-identical to `staging`,
and `backend-contract-parity.test.js` passes 9/9 unchanged.
