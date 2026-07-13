# Design benchmarks — external reference

> **REFERENCE ONLY.** This document is precedent + rationale, **not** a source of
> truth. It does **not** define brand, tokens, voice, or any design rule. On any
> conflict, **[docs/BRAND.md](../BRAND.md)**, **[docs/DESIGN.md](../DESIGN.md)**, and
> the Brand Hub win — in that order per the
> [Truth Hierarchy](../CONTEXT.md#3--truth-hierarchy) (ADRs → `.claude/rules/` →
> CONTEXT.md → BRAND.md/DESIGN.md → other docs). Nothing here overrides them.

Its job: give the next design ticket ([MEH-991](https://linear.app/mehamakor/issue/MEH-991)
onward) a **stated external precedent** to start from, instead of "make it nice".
The comparisons used to live in chat and evaporate; this pins them.

Note: `design-reference/` (MEH-991) holds Claude Design **artifacts** — this file is
the **external** benchmark layer with rationale, a different thing.

## The five benchmarks

| Site | Pattern to take | Why it fits Mehamakor |
| --- | --- | --- |
| Natoora (2024 rebrand) | Seasonal editorial layer: "In Season" surface, grower interviews, recipes, updates — content changes constantly | A ~5-business catalog cannot win on breadth. Editorial motion makes a small catalog feel alive. Direct support for "מגזין, לא marketplace". |
| Airbnb | Category strip visually distinct from the filter row; ONE primary CTA per card/page; cold-start rank boost for new listings | Our /producers had three identical pill rows (fixed in MEH-1186). New businesses must not be buried. |
| Faire | Launched already carrying supply — buyers cannot browse an empty catalogue | Seed supply before demand. Pre-launch: fill before you open. |
| USDA Local Food Portal | Directory type + total listing count stated up front (e.g. 7,148 farmers markets) | Counts are proof ONLY when the number is impressive. At 5 businesses: do NOT display counts. Inverse lesson. |
| Baymard (filtering research) | Active filters must be visible and removable; filters that lead to 0 results are a dead end | Our zero-result work (MEH-1088) is deliberately data-gated — this row records WHY, so nobody re-opens it early. |

## RTL caveat — read before borrowing anything

All five benchmarks are **LTR / Western** sites. What transfers and what does not:

- **Transfers:** information architecture, content strategy, interaction patterns —
  the editorial layer, the category-vs-filter distinction, seed-supply-before-demand,
  the count-only-when-impressive rule, visible/removable filters. These are structural
  ideas, direction-agnostic.
- **Does NOT transfer:** typography, mirroring, and Hebrew line-length. Mehamakor is
  Hebrew-first RTL. **Do not copy typographic decisions from these sites** — type scale,
  measure, weight pairing, and letter-spacing are all owned by
  [docs/DESIGN.md](../DESIGN.md) and must not be inferred from an LTR benchmark. When a
  benchmark's *look* is tempting, take the *pattern*, not the *type treatment*.

## How to use this in a ticket

When opening a design ticket, **cite the site + the row** as the stated precedent —
e.g. *"per BENCHMARKS.md → Airbnb: category strip visually distinct from the filter row"* —
then design against BRAND.md / DESIGN.md. The benchmark says *what pattern* and *why*;
the brand SoTs say *how it looks in our system*. If a benchmark row and a brand rule
disagree, the brand rule wins (see the header) — surface the conflict in the ticket
rather than following the benchmark.
