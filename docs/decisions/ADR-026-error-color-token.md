# ADR-026 — Error color token (AA-passing, cream + on-dark pair)

**Status:** Proposed — pending Sapir approval of the exact hex (MEH-1073 T1 gate)
**Date:** 2026-07-09
**Supersedes/amends:** narrows [ADR-019](./ADR-019-component-state-tokens.md) — adds the **first** state-color token, by explicit exception, for the one case ADR-019 anticipated ("a state that genuinely cannot be served by opacity-on-cream + fg-muted ... the resolution is a new ADR that supersedes ADR-019").

---

## Context

Form/validation error text across the app uses raw Tailwind reds (`text-red-500`, `text-red-600`, `text-red-700`, `text-red-200`) that were never tokenized and, at small sizes on the cream page (`#F5F0E8`), **fail WCAG AA 4.5:1** — worst case `RegisterClient.jsx:306` `text-red-500` ≈ **3.3:1** on cream, on the critical registration flow (impeccable-audit IMP-19). `border-red-400` on an invalid field ≈ 2.4:1 (< 3:1 for UI). ADR-019 deliberately has no state-color palette, so there is no sanctioned error color to migrate these to.

Constraint discovered during research: the affected sites span **both** light surfaces (cream/white: Register, Reviews, About, Header dropdown, BottomNav pill) **and** one dark surface — `Footer.jsx:192` newsletter error on the `green-900` (`#143228`) footer. A single dark-red passes on cream but fails on dark green (~1.7–2.6:1). This mirrors the existing `accent` (`#896714`) / `gold-on-dark` (`#e7c88a`) split, so error needs the same light/on-dark **pair**.

## Decision (proposed — awaiting hex approval)

Add two tokens to `frontend/tailwind.tokens.json` (→ `docs/DESIGN.md` front-matter, the token pipeline authority):

| Token | Proposed hex | Role | Contrast (computed, WCAG 2.1 relative luminance) |
|---|---|---|---|
| `error` | **`#B3261E`** | error text/border on light surfaces (cream, white, surface-card) | **5.76:1 on cream** `#F5F0E8` · 6.54:1 on white — **AA pass** (≥4.5:1) |
| `error-on-dark` | **`#FCA5A5`** | error text on dark green surfaces (`green-900` footer) | **7.30:1 on `#143228`** — **AA pass** |

**Basis / source for `#B3261E`:** Material Design 3 `error` role (light color scheme) — the canonical, independently-documented error color. It is purpose-built for error semantics and clears AA on both cream and white. `#FCA5A5` is Tailwind `red-300`, the lightest red that stays unambiguously "red" while clearing AA on the dark footer (red-200 also passes at 9.57:1 if a softer tone is preferred).

**Warm-brand alternative (if Material's crimson reads too "product"):** `error = #9A2A22` (warm terracotta) — **6.79:1 on cream**, better fit with the earthy editorial palette (BRAND.md "no SaaS signal-red"), but it has no external pedigree (my derivation, not a cited system). Sapir's call between pedigree (`#B3261E`) and brand-warmth (`#9A2A22`).

Full candidate table (contrast on cream / white / green-900), computed 2026-07-09:

| Candidate | cream | white | green-900 |
|---|---|---|---|
| `#B3261E` (M3 error) — **recommended** | 5.76 | 6.54 | 2.12 |
| `#9A2A22` (warm terracotta — alt) | 6.79 | 7.70 | 1.80 |
| `#B91C1C` (Tailwind red-700) | 5.70 | 6.47 | 2.14 |
| `#A32D2D` (existing raw "closed" red) | 6.23 | 7.07 | 1.96 |
| `#FCA5A5` (red-300) on-dark — **recommended** | — | — | 7.30 |

## Scope of the sweep (after hex approval)

Raw red → the approved token, each site re-verified ≥4.5:1:

- `RegisterClient.jsx:306,333,373` — `text-red-500` + `border-red-400` → `text-error` + `border-error` (light)
- `ReviewsSection.jsx:125,370` — `text-red-600` → `text-error` (light)
- `AboutClient.jsx:431` — `text-red-600` → `text-error` (light)
- `Header.jsx:473` — logout `text-red-700` → `text-error` (light dropdown)
- `BottomNav.jsx:184` — hard-coded `text-[#4b4841]`… (verify actual raw value at sweep time) → token (light pill)
- `Footer.jsx:192` — `text-red-200` → `text-error-on-dark` (dark footer)

`Header.jsx`, `Footer.jsx`, `BottomNav.jsx` are **central components** → `/adversarial-review` required even on green build (workflow rule 20). `tailwind.tokens.json` is a central token file → any value change is RED-tier; this ADR is the required superseding-decision vehicle.

## Consequences

- ADR-019's "no state-color palette" now has **exactly one** documented exception (error), gated behind this ADR. The camel's-nose risk ADR-019 warned about is bounded by: this is error-only, requires an ADR to extend further, and adds a light/on-dark pair rather than a full scale.
- `warning`/`info`/`success` remain un-tokenized (success stays `primary`); a future need still requires its own ADR.

## Open question for Sapir (the gate)

**Which hex for `error`:** `#B3261E` (Material M3, pedigree) or `#9A2A22` (warm terracotta, brand-fit)? And confirm `#FCA5A5` for `error-on-dark` (or `#FECACA` red-200 for a softer tone). No `tokens.json` write or sweep happens until this is answered.
