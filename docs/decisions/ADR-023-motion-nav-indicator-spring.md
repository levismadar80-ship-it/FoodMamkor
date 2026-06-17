# ADR-023 — Motion: restrained spring for the bottom-nav active-indicator

**Status:** Accepted
**Date:** 2026-06-16
**Deciders:** Sapir
**Source:** MEH-789

## Context
The motion system is locked to fade + slide on ease-out, with bounce/spring banned (design-principles.md: "No bouncy/spring animations except Ken Burns"; FadeInSection.jsx: the only primitive is fade+slide). Ken Burns is a slow zoom, not a spring — so no element uses a spring today. MEH-789 adopts the 2026 platform-standard floating-pill nav with a sliding active-indicator; Instagram and WhatsApp (iOS 26 "Liquid Glass") both use it, and Sapir chose that transition. The IG/WA feel is spring-based; a pure ease-out tween reads flat against the reference.

## Decision
Permit ONE restrained spring, scoped to the BottomNav active-indicator position transition only (framer-motion `layoutId` shared-layout). Bounded envelope:
- single subtle overshoot ≤ ~10%, settle ≈ 200–260ms (near the 150–300ms band)
- recommended: framer `transition={{ type:"spring", stiffness:520, damping:32, mass:1 }}` (tune in QA); conservative fallback = tween `cubic-bezier(.34,1.4,.5,1)`
- `prefers-reduced-motion` → instant (already global: CSS @media + `<MotionConfig reducedMotion="user">` — no extra work)
- backdrop-filter is never animated (reuse the MEH-732 guardrail)

Everywhere else stays no-spring: reveals (FadeInSection), buttons, cards, page/route transitions, hover — all keep fade+slide / `ease-quart`.

## Consequences
- design-principles.md motion line gains a one-line carve-out pointing here.
- Sanctioned-spring count = 1 (the nav indicator). Any future spring needs its own ADR.
- Central component → `/adversarial-review` required before merge.
- Spring config is a framer constant — motion can't live in DESIGN.md (the @google/design.md exporter drops cubic-bezier/ms; same reason as the globals.css motion utils).

## Alternatives rejected
- Pure ease-out tween (no spring): on-policy but reads flat vs the IG/WA reference chosen.
- Spring allowed globally: unbounded bounce risk; contradicts the editorial-calm DNA.
- True iOS Liquid Glass motion: native-only, not web-reproducible.
