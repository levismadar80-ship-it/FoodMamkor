# ADR-013: Icon strategy — three-tier (Phosphor exclusive for Tier 1)

**Status:** Accepted
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** Doc-Consolidation-Plan §B.7 G4 + §B.5 E4; MEH-657 CONTENT SYNC v4.2; MEH-683 (Tier 2 implementation, blocked-by MEH-666); MEH-686 Session 2

## Assumptions (verify before merge)
- `@phosphor-icons/react` is already installed (75 files reference it per userMemories 2026-05). Phosphor regular weight at 14/16/20px with `text-current` + RTL `ms-1` is the established usage pattern.
- Lucide rule in `01-claude-design.md` `<no_ai_slop>` block (E4) still reads "Lucide icons used as-is" — this ADR explicitly closes that contradiction.
- MEH-683 is the Tier 2 owner (category tag glyphs, 30–50 emoji instances → SVG). It is blocked-by MEH-666, which is the single-glyph hot-fix (Category 01 fish glyph) — prerequisite, not the full implementation. This ADR does **not** spec individual glyphs.
- 6 known Phosphor gaps for food categories (🥩 meat, 🧀 cheese, 🍞 bread, 🫒 olive, 🥦 broccoli, 🥛 milk) are out-of-scope for Tier 1 — they live in Tier 2 territory.

## Context

Mehamakor's iconography ran on two unstable contradictions: Template 01's `<no_ai_slop>` block told Claude Code "Lucide icons used as-is" while CLAUDE.md line 20–21 explicitly forbade Lucide (75 files use Phosphor). Separately, Phosphor has 6 well-known gaps for the food categories Cohort 1 needs (meat, cheese, bread, olive, vegetable, dairy) — no canonical answer existed for how to fill them, leading to ad-hoc emoji substitutions in production (e.g. 🛒 in `he.json`, F2 in the audit).

MEH-657 research (2026-05-23) established the surface-scoped emoji LOCK v2 and the editorial premium positioning (Kinfolk/Natoora reference), but never formalized the icon architecture itself. The result: ad-hoc decisions per surface, mixing icon families, and no clear "what goes where" rule.

## Decision

Three-tier icon strategy. Each tier has a single canonical source. Tiers are never mixed within a single surface.

**Tier 1 — Functional UI icons.** `@phosphor-icons/react` exclusively. Lucide FORBIDDEN. Phosphor regular weight (no duotone — too playful for editorial). 14/16/20px sizes. `text-current` for color inheritance. RTL spacing via `ms-1` / `me-1`. Use cases: navigation, search, menu, close, check, heart, star, map pin, calendar, camera.

**Tier 2 — Category glyphs.** Hand-drawn SVG, owned by MEH-683 (blocked-by MEH-666 single-glyph prerequisite). Use case: food category identification (meat, cheese, bread, olive, vegetable, dairy, honey, wine — the long tail of producer types Phosphor doesn't cover). This is where the 6 Phosphor gaps resolve.

**Tier 3 — Editorial illustrations.** Custom per-surface art. Post-launch only (deferred). Use cases: hero illustrations, /about narrative spots, seasonal editorial moments. Not used pre-launch.

### Naming gotchas (Phosphor ≠ Lucide)

- `Mail` → `EnvelopeSimple`
- `Sparkles` (Lucide) → `Sparkle` (Phosphor, singular)
- Same name: `MapPin`, `Calendar`, `Check`, `Heart`, `Star`, `Trophy`, `House`, `Camera`, `X`/`XCircle`, `PencilSimple`, `Plant`/`Grains`, `CookingPot`
- Kosher mark: `StarOfDavid` (✡)

Verify against `node_modules/@phosphor-icons/react` at execution time — catalog knowledge drifts.

## Consequences

**Positive:** Closes Template 01 E4 contradiction (gates Pre-design-upload Checklist item 6); 75-file Phosphor codebase stays consistent; Tier separation makes the "what goes where" decision a one-step lookup; aligns with industry pattern (Phosphor for consumer editorial, per 2026 PkgPulse research — Lucide signals "AI template / dev dashboard", opposite of Mehamakor's thesis).

**Negative:** 6 Phosphor gaps require Tier 2 work (MEH-683, blocked-by MEH-666) before any category surface ships; Tier 3 unavailable pre-launch means hero/about surfaces must work with Tier 1 + Tier 2 only.

**Mitigations:** MEH-683 is already in backlog (blocked-by MEH-666 single-glyph prerequisite); if Tier 2 glyphs aren't ready when a surface needs them, fall back to category text label without icon rather than ad-hoc emoji substitution.

## Alternatives considered

- **Phosphor + Lucide hybrid (status quo).** Rejected: contradicts CLAUDE.md, splits the visual language, produces "AI template" signal that Mehamakor's editorial positioning explicitly opposes.
- **Phosphor only, no Tier 2 (emoji for category gaps).** Rejected: MEH-657 LOCK v2 forbids emoji in UI/brand/editorial surfaces; emoji rendering varies by OS (visual inconsistency); emoji signals "consumer app" not "editorial magazine".
- **Custom icon family (commission a designer).** Rejected: cost + timeline incompatible with pre-launch solo founder constraints; Tier 2 hand-drawn SVG (MEH-683, blocked-by MEH-666) captures the warmth without the full custom-family overhead.
- **Heroicons / Tabler / other free family.** Rejected: 75-file Phosphor migration cost; Phosphor's 7,700+ icon count + 6 weights is the broadest free option; family-switching is a sunk-cost trap.
