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
| [001](./ADR-001-jwt-httponly-cookie.md) | JWT in HttpOnly cookie, not localStorage | Accepted | 2026-04-26 | MEH-326 |
| [002](./ADR-002-email-resend-http.md) | Email via Resend HTTP API, not SMTP | Accepted | 2026-04-21 | Railway SMTP block |
| [003](./ADR-003-alembic-migrations-only.md) | DB schema via Alembic only | Accepted | 2026-04-24 | MEH-265 |
| [004](./ADR-004-skills-lockdown-5-layers.md) | Skills supply chain — 5-layer defense | Accepted | 2026-04-30 | MEH-397 |

## Pending
- ADR-005 — `/adversarial-review` local extension vs plugin → blocked on MEH-428 shipping. Open a follow-up after merge.

## Related
- `docs/LOCKED_DECISIONS.md` — older free-form decisions; being migrated
  into ADRs incrementally. Still authoritative until each entry is
  promoted.
- `CLAUDE.md` — one-line pointer back here.
