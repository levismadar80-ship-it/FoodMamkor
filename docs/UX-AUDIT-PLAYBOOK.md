# UX-AUDIT-PLAYBOOK — Mehamakor 11-page heuristic audit

## Origin
Method authored 2026-06-12 (Drive). Committed 2026-06-15 as versioned SoT. staging = source of truth (prod stale).

## Method
Heuristic evaluation per section. Two passes (flow → detail) + a fresh-eyes pass. Single evaluator ~35% coverage; multi-pass compensates, does not replace real user testing.

## Lens-set — Nielsen 10 + Mehamakor
Nielsen 10 (status visibility · match real-world · user control · consistency · error prevention · recognition>recall · flexibility · aesthetic/minimalist · error recovery · help)
+ Mehamakor lenses:
- above-the-fold / 5-sec test
- primary-action / conversion
- mobile + RTL
- accessibility (AA · 44px · focus)
- performance (LCP)
- brand + voice (vs BRAND.md / DESIGN.md + anti-patterns; Emoji LOCK v2, ADR-014, "בית עסק" not "יצרן")
- empty / error / loading states
+ benchmark vs best-in-class: Airbnb / Natoora / Kinfolk (BRAND §5).

## Per finding
description · heuristic/lens violated · location (file:line OR screenshot area) · severity 0–4 · recommendation · ready CC/Design prompt.
Severity: 0 polish · 1 cosmetic · 2 minor friction · 3 clear usability/brand-LOCK violation · 4 blocker (broken/unusable/legal).

## Capture (our infra)
Widths 375 / 768 / 1280 / 1440, fold + full. staging SSO/Vercel-protected → CC-web env: Network=Custom + staging.mehamakor.online; Playwright headers x-vercel-protection-bypass=$VERCEL_AUTOMATION_BYPASS_SECRET + x-vercel-set-bypass-cookie=true; target /he. Prefer DOM/text probe over PNGs. Real entity for dynamic routes; skip "twt". (Original doc said web_fetch live page — superseded: prod stale, staging gated.)

## Output flow
findings table severity-sorted → dedup vs Linear LIVE → tickets (template 06/07) → CC draft PRs off staging → Sapir merges. Skeptic Mode: file:line evidence, Phase 0 design-vs-code, STOP on scope/asset/central-component.

## Program (impact order)
1 Home ✓ · 2 /producer/[id] ✓ · 3 /search · 4 /map · 5 /register/producer · 6 /login+/register · 7 /about · 8 /events(+[id]) · 9 /experiences+/group-buys · 10 Global Navbar+BottomNav+Footer · 11 cross-cutting (mobile+RTL · a11y · performance · empty/error/loading · voice).
