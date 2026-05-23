# ADR-019: Component state tokens — opacity-on-cream + --fg-muted only

**Status:** Accepted
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** MEH-656 CONTENT SYNC v4.2 change #2; rejects Phase 2 v1 (`--slate`) + Phase 2 v2 (`loading-bg-brown`, `vacation-bg-grey`) proposals; MEH-686 Session 3 (scope-expanded from MEH-656 closure)

## Assumptions (verify before merge)
- The token namespace assumed below (`--bg-cream`, `--fg`, `--fg-muted`) matches what `docs/DESIGN.md` will export after the Phase β Google DESIGN.md transformation. If naming differs at commit time, align this ADR to the actual token names — the LOCK semantics are the load-bearing part, not the exact identifiers.
- "ProducerCard" is the representative component; the rule extends to all components that need a "muted" or "background" treatment (loading skeletons, vacation pills, disabled buttons, empty-state cards). ProducerCard is named here because it's where the rejected proposals were made.
- Cream background `#F5F0E8` is the universal page surface — opacity-on-cream produces predictable de-emphasis without requiring per-component color picks.

## Context

The design system stabilized on three core foreground tokens — `--fg` (`#1C1A17`), `--fg-muted` (warm muted gray, currently `#5c584f` in `tailwind.config.js`), and the brand primary `#2e6853` — plus the cream background `--bg-cream` (`#F5F0E8`). When ProducerCard variants for **loading** and **vacation** states needed a "de-emphasized" treatment, two parallel proposals appeared:

- **Phase 2 v1:** introduce a `--slate` token (`#64748B`, Tailwind slate-500) for both loading and vacation states.
- **Phase 2 v2:** introduce per-state background tokens — `loading-bg-brown` and `vacation-bg-grey`.

Both proposals expanded the state-color vocabulary by 1–3 tokens. The audit (Doc-Consolidation-Plan §B.2 B3) flagged that the design exploration tokens were drifting toward a wider state-color palette without thesis-tie-in. `--slate` in particular signals "SaaS dashboard" (Tailwind's default neutral), opposite of Mehamakor's editorial positioning. Without an ADR, the next state need (disabled, error, awaiting-approval) reintroduces the same pressure.

## Decision

Component state treatments use **opacity-on-cream + `--fg-muted`** only. No new state-color tokens.

### The two-mechanism rule

1. **De-emphasized foreground** → switch `color: var(--fg)` to `color: var(--fg-muted)`. This is the warm muted gray already in the design system; it preserves the editorial warmth.
2. **De-emphasized surface** → reduce opacity of foreground content on the existing `--bg-cream` surface. Opacity scale: 100% / 70% / 50% / 30%. Never introduce a darker or lighter background token for the state.

### Component examples

- **ProducerCard loading skeleton:** keep cream background; content at 30% opacity on cream; no `loading-bg-*` token.
- **ProducerCard vacation pill:** background = cream; text = `--fg-muted`; no `vacation-bg-*` token.
- **Disabled button:** background = cream (or primary at 50% opacity if button was primary); text = `--fg-muted`; no `disabled-bg-*` token.
- **Empty state illustration:** content at 50% opacity on cream; no separate "empty" surface color.

### Explicit rejections (permanent)

- ❌ `--slate` / Tailwind slate-500 (`#64748B`) — SaaS-dashboard signal, off-brand.
- ❌ `loading-bg-brown` — adds a 2nd background color to maintain.
- ❌ `vacation-bg-grey` — same.
- ❌ Tailwind's `gray-*` scale for state tokens — same SaaS-dashboard objection.
- ❌ A "neutral palette" tier added to DESIGN.md — that's the camel's nose; once one exists, every component proposes a new state-shade.

### When a future state genuinely needs more than this

If a future state (e.g. "destructive action confirmation") genuinely cannot be served by opacity-on-cream + `--fg-muted`, the resolution is a new ADR superseding this one — **not** a token added quietly in `tailwind.config.js`. The friction is the feature: it forces the question "is this really a new state, or does opacity-on-cream work?"

## Consequences

**Positive:** Token namespace stays small (the 8 canonical tokens in DESIGN.md + opacity); state treatments are predictable across components without per-component color picks; the rejection list (slate, loading-bg, vacation-bg) makes re-litigation cheap to bounce; aligns with Brad Frost atomic-design council guidance from MEH-124-v4 (state token system mandatory but small).

**Negative:** Components that need fine-grained state distinction (e.g. error vs warning vs info) lose the easy "just pick a color" path; opacity-on-cream is less expressive than full-color state palettes used in SaaS dashboards.

**Mitigations:** Mehamakor is a magazine, not a dashboard — fine-grained state distinction via color is a category-mismatched need. If a real case emerges, the new-ADR mechanism provides a slow but principled path; in the meantime, the small palette is itself a brand signal (curated, restrained).

## Alternatives considered

- **Phase 2 v1 `--slate` token.** Rejected — SaaS dashboard signal (Tailwind default neutral), undermines the "Mehamakor is editorial, not dashboard" thesis (per ADR-013 industry research on Lucide-vs-Phosphor as the same axis).
- **Phase 2 v2 per-state background tokens.** Rejected — combinatorial explosion (loading, vacation, disabled, error, empty — each gets its own bg?); maintenance burden grows with surface area.
- **Use Tailwind's `gray-*` scale.** Rejected — same dashboard objection as `--slate`; would also conflict with `--fg-muted` already in the system.
- **Per-component state choices, no LOCK.** Rejected — that's the status quo that produced the two competing proposals this ADR settles.
