# ADR-013: Icon strategy — three-tier (Phosphor exclusive for Tier 1)

**Status:** Accepted — **Amended 2026-07-22** (Tier 2 hand-drawn track superseded by a single unified geometric set; see [Amendment](#amendment--2026-07-22--tier-2-hand-drawn-superseded-by-a-unified-geometric-set) below)
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** Doc-Consolidation-Plan §B.7 G4 + §B.5 E4; MEH-657 CONTENT SYNC v4.2; MEH-683 (Tier 2 implementation, blocked-by MEH-666); MEH-686 Session 2

> **⚠️ Read the [Amendment](#amendment--2026-07-22--tier-2-hand-drawn-superseded-by-a-unified-geometric-set) first.** The original decision below specced Tier 2 as **hand-drawn SVG**. That track never shipped and is **archived** — PR #2026 (LOCKED v2.1) replaced it with a single unified geometric line family (Phosphor + vendored MIT/Apache-2.0/CC0) in one `CategoryIcons.jsx` module, collapsing the Tier 1 / Tier 2 split. The body below is preserved as the historical record; where it says "hand-drawn," read the Amendment.

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

**Tier 2 — Category glyphs.** ~~Hand-drawn SVG, owned by MEH-683 (blocked-by MEH-666 single-glyph prerequisite).~~ **[Superseded 2026-07-22 — see Amendment: the hand-drawn track was archived; Tier 2 is now a unified geometric set vendored into one `CategoryIcons.jsx` module.]** Use case: food category identification (meat, cheese, bread, olive, vegetable, dairy, honey, wine — the long tail of producer types Phosphor doesn't cover). This is where the 6 Phosphor gaps resolve.

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

---

## Amendment — 2026-07-22 — Tier 2 hand-drawn superseded by a unified geometric set

**Deciders:** Sapir Levi (LOCKED v2.1, 2026-07-21)
**Source:** PR #2026 (the merged icon set) + its docs follow-up PR #2037; the toggle-chip icon prop (PR #2021) and the category-chip glyphs (PR #2046) that consume the set.

Tier 2's original **hand-drawn SVG** track (the old D1–D5 "Assembly v2" family, blocked-by MEH-666) **never shipped and is archived**. LOCKED v2.1 replaced it with a **single unified geometric line family**, collapsing the Tier 1 / Tier 2 split into one canonical source:

- **One module** — `frontend/components/CategoryIcons.jsx` exports `CATEGORY_ICONS`, an **18-glyph** set **keyed by the canonical DB category name** (the exact `backend/seed_data.py` strings, post-taxonomy-merge). A category name with no key has no glyph (add its row when the taxonomy grows); an unknown admin category falls back to **no icon** (never a generic Leaf).
- **Composition (18):** **11 Phosphor** re-exports + **5 Tabler** (MIT) + **1 Material Symbols `hive`** (Apache-2.0) + **1 SVG Repo `olive-oil` #201507** (CC0). The 7 non-Phosphor glyphs are vendored as local SVG components and **normalized to Phosphor's regular line weight** (Tabler 2/24 → 1.5/24) so the whole set reads as one family at 44px and 16px; `hive` is the single filled glyph. Vendored-license texts + CC0 provenance live in `frontend/lib/icons/LICENSES.md`.
- **Monochrome (V2):** glyphs default to `currentColor` — colour appears only on the **map pins** (`lib/map-categories.js`, honey gold `#C8821E` accent retained for דבש); chips and the register selector inherit the text colour. **No emoji** anywhere in render (Emoji-LOCK v2, MEH-990 precedent — the geometric glyphs are the sanctioned substitute); the `categories.emoji` column stays (no schema change).
- **Consumers:** map pins (`lib/map-categories.js`), the register category selector (`CategorySelector.jsx`, all 18 cards), the homepage no-photo fallback (`HomeCategoryGrid.jsx` — home cards keep their photos), the emoji-consumption strip, and — via the `ChipScrollRow` 16px `icon` slot (PR #2021) — the toggle/attribute chips and the **category** chips on `/producers` + `/map` (PR #2046).

**Net effect on this ADR:**

- **Tier 1** (functional UI = Phosphor exclusive, Lucide forbidden) and **Tier 3** (editorial illustrations, post-launch, deferred) are **unchanged**.
- **Tier 2** is no longer a separate hand-drawn track — it is now the **same geometric line family as Tier 1**, extended with vendored glyphs for the categories Phosphor doesn't cover, in one module. The "6 Phosphor gaps → hand-drawn SVG" framing in **Assumptions**, **Decision (Tier 2)**, **Consequences**, and **Alternatives** ("custom icon family" / "hand-drawn SVG captures the warmth") is **obsolete**: the gaps are filled by vendored geometric glyphs, not hand-drawn art, and MEH-666 (the single-glyph hand-drawn prerequisite) is moot.
- The fallback rule survives in stronger form: an unresolved category renders its **text label without an icon** — never an ad-hoc emoji, and never a wrong-category glyph.
