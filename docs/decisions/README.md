# Architecture Decision Records (ADRs)

Permanent architectural decisions recorded once, never re-litigated.

> Why: Claude Code re-proposes alternatives every session unless told a
> decision is locked. Each ADR below is a "decision is locked, here's
> why" record so future sessions don't waste tokens re-debating it.

## How to use
- **Reading:** scan the index below before proposing alternatives that
  touch auth, email, DB schema, or skills tooling.
- **Adding:** copy `_TEMPLATE.md` → `ADR-NNN-kebab-title.md`, fill in,
  link from this index. Use the next free NNN.
- **Superseding:** never edit an Accepted ADR. Write a new one with
  `Status: Supersedes ADR-NNN`, then change the old one's status to
  `Superseded by ADR-MMM` (one-line edit only).
- **Format:** Status / Date / Deciders / Source / Context / Decision /
  Consequences / Alternatives. ≤30 lines.

## Index

| # | Title | Status | Date | Source |
|---|---|---|---|---|
| [001](./ADR-001-jwt-httponly-cookie.md) | JWT in HttpOnly cookie, not localStorage | Superseded by ADR-017 | 2026-04-26 | MEH-326 |
| [002](./ADR-002-email-resend-http.md) | Email via Resend HTTP API, not SMTP | Accepted | 2026-04-21 | Railway SMTP block |
| [003](./ADR-003-alembic-migrations-only.md) | DB schema via Alembic only | Accepted | 2026-04-24 | MEH-265 |
| [004](./ADR-004-skills-lockdown-5-layers.md) | Skills supply chain — 5-layer defense | Accepted | 2026-04-30 | MEH-397 |
| [005](./ADR-005-adversarial-review-local-extension.md) | `/adversarial-review` local extension vs plugin | Accepted | 2026-05-01 | MEH-428 |
| [006](./ADR-006-schema-parity-discipline.md) | Schema parity discipline — 5 enforcement rules | Accepted | 2026-05-05 | MEH-433 |
| [007](./ADR-007-expand-contract-schema-changes.md) | Schema changes use Expand-Contract pattern | Accepted | 2026-05-07 | MEH-486 |
| [008](./ADR-008-autodream-defer.md) | Defer AutoDream activation on Claude Code | Accepted | 2026-05-16 | MEH-501 |
| [009](./ADR-009-decision-capture-proactive.md) | Decision capture (proactive instruction) | Accepted | 2026-05-23 | MEH-678 |
| [010](./ADR-010-pricing-model-v2.md) | Pricing model v2.0 — six LOCKs and four hypothesis options | Accepted | 2026-05-23 | MEH-686 |
| [011](./ADR-011-tagline-locked.md) | Tagline locked — 14-word canonical version | Accepted | 2026-05-23 | MEH-686 |
| [012](./ADR-012-logo-watt-4phase.md) | Logo design — Watt 4-phase method | Accepted | 2026-05-23 | MEH-686 |
| [013](./ADR-013-icon-strategy-three-tier.md) | Icon strategy — three-tier (Phosphor exclusive for Tier 1) | Accepted | 2026-05-23 | MEH-686 |
| [014](./ADR-014-voice-rules-hebrew-hybrid.md) | Voice rules — Hebrew Hybrid (UI gerund / brand feminine) | Accepted | 2026-05-23 | MEH-686 |
| [015](./ADR-015-strategic-cancellations-pattern.md) | Strategic-framework cancellation pattern (2026-05-14 cohort) | Accepted | 2026-05-23 | MEH-686 |
| [016](./ADR-016-risk-tier-nomenclature.md) | Risk-tier nomenclature — GREEN/YELLOW/RED (3-tier) | Accepted | 2026-05-23 | MEH-686 |
| [017](./ADR-017-jwt-access-token-localStorage.md) | JWT access token in localStorage (refresh in HttpOnly cookie) | Accepted | 2026-05-23 | MEH-686 |
| [018](./ADR-018-hero-direction-hierarchy.md) | Hero direction hierarchy — Direction A canonical, Direction B secondary | Accepted | 2026-05-23 | MEH-686 |
| [019](./ADR-019-component-state-tokens.md) | Component state tokens — opacity-on-cream + --fg-muted only | Accepted | 2026-05-23 | MEH-686 |

## Related
- `docs/LOCKED_DECISIONS.md` — older free-form decisions; being migrated
  into ADRs incrementally. Still authoritative until each entry is
  promoted.
- `CLAUDE.md` — one-line pointer back here.
