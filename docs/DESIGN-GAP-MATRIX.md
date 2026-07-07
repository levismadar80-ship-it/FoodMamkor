# DESIGN-GAP-MATRIX — Claude Design → code parity audit (MEH-991 Chunk 1)

**Date:** 2026-07-03 · **Design source:** `design-reference/` (2026-07-03 agent-ZIP export: `s2-logo/` + `ds-components/` + `dashboard/` + `join/`) · **Code baseline:** `origin/staging` @ `e549b153`.
**Method:** 9 parallel read-only surface audits, file:line evidence per claim, frames read as source (not rendered). Old "Mehamakor Design System" project excluded (`design-reference/_archive-2026-06/` — stale, never audited). Live-staging screenshot evidence: [`docs/design-audit/screenshots/`](./design-audit/screenshots/).

**Tier legend (ADR-016):** GREEN = CC end-to-end authority · YELLOW = plan approval + per-chunk summaries · RED = chunk-by-chunk WAIT gates (auth / central components / tailwind.config.js / he.json structural / brand-level).
**Severity:** 0 = parity (listed for provable coverage) · 4 = missing entirely.

**EXCLUSIONS (in-flight collisions — audit only, NO sweep):** producer dashboard incl. `dashboard/` design (MEH-964 chunks 1C/1D), `join/` design (MEH-995 gated), /map onboarding + location-permission flow (MEH-970), /register wizard (MEH-132 + MEH-994), homepage warmth/section-rhythm tokens (MEH-537), kashrut badges (MEH-986). Verified/tier-badge SEMANTICS additionally gated by MEH-742.

---

## Summary

### Tier counts

**249 matrix rows** across 14 surfaces (severity-0 parity rows included for provable coverage).

| Surface | Rows | GREEN | YELLOW | RED | COLLISION | parity-only |
|---|---|---|---|---|---|---|
| Homepage (HOME) | 32 | 13 | 11 | 1 | 1 (MEH-537) | 6 |
| Nav system (NAV) | 20 | 6 | 13 | 1 | — | — |
| ProducerCard (CARD) | 29 | 15 | 12 | 1 | 1 (MEH-986) | — |
| /map (MAP) | 23 | — | 10 | 11 | 2 (MEH-970) | — |
| Business page (BIZ) | 27 | 9 | 10 | 7 | 1 (MEH-986) | — |
| About (ABOUT) | 14 | 12 | 2 | — | — | — |
| Process (PROC) | 10 | 10 | — | — | — | — |
| Events (EVENT) | 13 | 9 | 4 | — | — | — |
| Login (LOGIN) | 11 | 1 | 8 | 2 | — | — |
| Register (REG) | 15 | — | — | — | 15 (MEH-132/994) | — |
| Badges (BADGE) | 15 | 4 | 9 | 1 | 1 (MEH-986) | — |
| Completeness (COMPL) | 10 | 5 | 4 | — | 1 (MEH-964) | — |
| Dashboard (DASH) | 21 | — | — | — | 21 (MEH-964) | — |
| Join (JOIN) | 9 | — | — | — | 9 (MEH-995) | — |
| **Total** | **249** | **84** | **83** | **24** | **52** | **6** |

Of the 84 GREEN rows, ~35 are severity-0 parity confirmations; the **actionable GREEN sweep list** (sev ≥ 1) is the grouped checklist below. LOGIN-06 is split YELLOW(styling)/RED(auth-path) — counted YELLOW.

### The headline findings

1. **The single biggest homepage gap is a frozen surface with zero code:** Section 06 "Editorial Breath" / S14 feature band (HOME-13, sev 4, RED) — its absence intersects the MEH-883 content-first removal, so reinstatement is a brand call, not a mechanical port.
2. **Honey pin (MEH-666) is ~⅓ implemented** (MAP-06): color token landed, but the glyph is Phosphor `Hexagon`, which the addendum's LOCK explicitly forbids; `--honey-deep` and the hand-drawn dipper don't exist. A code comment mis-attributes the Hexagon to "MEH-763 (S5)" — SoT conflict to resolve.
3. **Design-vs-decision conflicts (need Sapir ruling, NOT auto-fixes):** Header CTA removed vs P6 quiet link (NAV-06); top-bar hide-on-scroll dropped (NAV-16); avatar treatment inverted on Header + BottomNav (NAV-07/14); two competing logo lockups in-repo (NAV-08); WhatsApp brand-green CTAs vs "editorial green only" lock (BIZ-11/MAP-13); S5 frame vs later "S5 FINAL MEH-763" locks (MAP-04/08/10); FREEZE-vs-PORT CTA hierarchy on homepage §10 (HOME-24); badge chip shape/colors where the two card frames disagree (CARD-10/15); yellow-high vs Regen completeness-card conflicts (COMPL-02/03).
4. **Stale-gold residue:** every design artifact still says `#8B6914`; code+docs moved to `#896714` (MEH-917, AA). 5 JSX sites still hardcode the stale gold (StarSelector, ReviewsSection ×2, MapComponent premium ring, admin/users) — the fixed value appears in ZERO component files.
5. **Both zips are RTL-native** — no LTR→RTL conversion debt on port; only a handful of absolute `left:/right:` positions in ds-components frames need per-port checks.
6. **Strongest ports:** S11 process page (10/10 parity-or-GREEN), S8 about, AccountSheet (NAV-15), completeness-card base (Regen frame), S12 locked copy + bidi isolation.
7. **Reverse gaps (design behind code):** dashboard tools frame marks shipped routes "בקרוב" (DASH-18); ProfileCompletenessCard frames show 5 fields, code correctly has 6 (MEH-1002); register wizard field set reflects real OWASP auth flow, not the frame's.

### Recommended GREEN sweep order (Chunk 2) — dependency-aware

Groups of actionable GREEN items (sev ≥ 1). Check off per PR (this list is the sweep's status column).

**Group 1 — `parity-tokens-residue` (lowest risk, unblocks visual QA of everything else; token VALUES untouched — no config edits):**
- [ ] Stale `#8B6914` → `accent` in StarSelector.jsx:29, ReviewsSection.jsx:34,61, admin/users/page.js:135 (MapComponent site is RED-central — excluded)
- [ ] Old border `#e8e0d0` → `border` token in Skeleton.jsx, StarSelector.jsx, ReviewsSection.jsx, WhatsAppQuestionChips.jsx:36, events/new/page.js:288
- [ ] `ds-components/README.md:41` stale gold note → `#896714` (reference-doc fix)

**Group 2 — `parity-producer-card` (single component + skeleton):**
- [ ] CARD-09 "+N" overflow chip (helper already exported in lib/badges.js)
- [ ] CARD-22 pressed state (`active:opacity-95 active:scale-[0.98]`)
- [ ] CARD-23 card-level focus-ring on links
- [ ] CARD-26 skeleton radius 16→0 + pulse per spec (one file, 5 consumers)
- [ ] CARD-03/05 placeholder glyph size + heart size/bg polish (cosmetic)
- [ ] CARD-02 Cloudinary crop follows 1:1 mobile box
- [ ] CARD-21 name greens on whole-card hover (`group-hover:text-primary`)

**Group 3 — `parity-home` (page-level, non-central):**
- [ ] HOME-02 hero H1 `font-bold`→`font-black` (FRL 900 lock)
- [ ] HOME-15 drop category glyph hover-scale (v8 LOCK violation) + optional gold underline
- [ ] HOME-16 VegIcon → corrected branch+leaf cluster glyph (Assembly v2:2340)
- [ ] HOME-18 small-card glyph aspect matrix per lock
- [ ] HOME-23 featured-producer ratio 4:5 + solid caption chip (logical props)
- [ ] HOME-25 §10 eyebrow gold + 32×1px rule
- [ ] HOME-31 Cormorant `ital` axis in Google-Fonts URL (kills sitewide faux-italic; verify byte size)
- [ ] HOME-05/06 hero search treatment + CTA row alignment/border token
- [ ] HOME-08 Ken Burns 22s / scale ≤1.06 (check ParallaxQuote/Events consumers)
- [ ] HOME-04 Friday subtitle separator (copy gate — surface string to Sapir first)

**Group 4 — `parity-nav-footer` (single-file wins):**
- [ ] NAV-18 footer logo → `logo-on-warm-dark.svg` (drop `brightness-0 invert`)
- [ ] NAV-14 name-as-label on account tab (spec item, keep avatar treatment question for Sapir)

**Group 5 — `parity-static-pages` (about/process/events/login-visual):**
- [ ] ABOUT-02 hero clamp ceiling, ABOUT-04 byline eyebrow, ABOUT-05 em-mark, ABOUT-07 numeral alignment/em-dash, ABOUT-09 tips intro (copy gate), ABOUT-10 hover motion
- [ ] PROC-02 dotted connector spine (logical props), PROC-08 caveat `t.rich` link → `#join`
- [ ] EVENT-03 add-action placement, EVENT-06 WA glyph on rows, EVENT-08 month count, EVENT-13 floating add pill (copy exists)
- [ ] LOGIN-04 email placeholder (visual-only; anything touching auth flow stays out)
- [ ] BIZ-05 chip radius, BIZ-12 website-CTA ↗ affordance, BIZ-15 hours red→muted + range collapsing, BIZ-18 reviews summary placement, BIZ-19 review card grid, BIZ-20 empty-state invitation copy (copy gate)
- [ ] BADGE-01 hero chip scale to S12 metrics (`ps-`/`pe-` optical padding)
- [ ] COMPL-04 checklist markers/next-row structure (verify claimed "locked design" first), COMPL-06 wording (copy gate)

**Explicitly NOT in the sweep (YELLOW/RED/COLLISION):** everything in finding #3 above, all MAP-* RED rows (MapClient/MapComponent central), BIZ central-file rows (BIZ-07/08/09/24/25), token value changes (RED, ADR-019 pipeline), state-color tokens (needs ADR), LOGIN error-styling (design-lock conflict + auth-path), EVENT-07/09/10 (multi-file architecture), HOME-13/20/24, BADGE-05 (he.json structural), all MEH-964/995/970/132/994/537/986 surfaces.

### YELLOW follow-up issues to open (post-approval)

One Linear issue per line (rule 27 duplicate-check before opening):
1. Nav design-vs-decision bundle: NAV-06/07/08/14/16 + NAV-05 icon trio (Header/BottomNav, YELLOW×6)
2. ProducerCard structural: CARD-08 badge cap, CARD-16/24/25 availability+vacation/disabled states, CARD-18 Latin-units distance, CARD-27 mobile density
3. Map non-central: MAP-03 dead sort, MAP-09 zero-count chips, MAP-11/12/13 sheet+card fidelity (incl. WA-green + 28px target), MAP-15/16 empty/skeleton
4. Map central (RED, chunked): MAP-02/04/05/06/07/19/20/23 — honey pin SoT ruling first
5. Business page editorial register: BIZ-02/10/13/14/16/21/22 (+ RED rows chunked separately: BIZ-01/07/08/09/24/25)
6. WhatsApp-green brand ruling: BIZ-11 + MAP-13 + HOME-24 (one decision, many surfaces)
7. Events almanac architecture: EVENT-02/07/09/10
8. Login S9: LOGIN-01/02/06/08/09 (+ RED: LOGIN-03/05 auth-adjacent)
9. Badges: BADGE-04 Popover spec, BADGE-06/07 placement/color, BADGE-09 registration-tooltip lock check, BADGE-10 emoji labels (MEH-742-adjacent), BADGE-11 `bg-cream` dead token, BADGE-12/13/14 off-token surfaces
10. BADGE-05 declared trust-block architecture (RED — he.json structural)
11. Homepage IA/structure: HOME-03/07/17/21/26/27/28/29/32 (+ HOME-13 RED brand call, HOME-20 18-glyph adoption)
12. Token additions (YELLOW): `#E9E3D6` nav-pill border token, `--ease-out` utility, fluid hero fontSize entries; + AvailabilityBadge raw state-colors surfaced for ADR-019 ruling (RED if tokenized)
13. CARD-28 / BIZ-27 gold canon note: accept `#896714` as SoT, mark HTML values stale (docs-only close)

---

## Token drift (design zips vs tailwind.config.js + docs/DESIGN.md)

**Authority chain verified:** `frontend/tailwind.config.js:5` imports `frontend/tailwind.tokens.json` (generated from `docs/DESIGN.md` front-matter per ADR-019) and spreads it at `tailwind.config.js:15-25`. No other tokens live in the config — motion/focus/glass are a CSS utility layer in `frontend/app/globals.css`.

**Design sources disagree with each other.** Three generations: (a) older `s2-logo/_ds/.../colors_and_type.css`, (b) `s2-logo/Design System v1.0.html` `:root` (lines 23-73), (c) newest `ds-components/_ds_bundle.css` + `s2-logo/uploads/tailwind.tokens.json`. Generation (c) matches code almost exactly; (a)/(b) carry pre-consolidation values — mapped in Notes, never copied.

**Verdict rule (ADR-016):** any VALUE change to an existing token in `tailwind.config.js`/`tailwind.tokens.json` = **RED** (central file); pure token **additions = YELLOW**; alias/no-change/docs-only = **GREEN**.

| Token / role | Design value (source) | Code value | docs/DESIGN.md | Drift? | Verdict + Notes |
|---|---|---|---|---|---|
| **primary (brand green)** | `#2e6853` — uploads/tailwind.tokens.json:5; colors_and_type.css:11; DS v1.0.html:25; _ds_bundle.css:2991-2993 | `#2e6853` tokens.json:5 (wired config.js:17-19) | `#2e6853` DESIGN.md:11 | No | GREEN — aligned across all 3 design generations. |
| **primary-dark / green-700** | `#2e4a2e` uploads json:6; colors_and_type.css:13. BUT DS v1.0.html:26 `--green-dark: #1F4A38` | `#2e4a2e` tokens.json:6,21 | `#2E4A2E` DESIGN.md:12,27 | **Intra-design drift** | GREEN for code. Ports from DS v1.0.html must map `--green-dark` → `primary-dark #2E4A2E`, NOT copy the hex. Changing the token value = RED. |
| **primary-light** | `#3a7d64` colors_and_type.css:12 | **absent** — hover goes darker via `primary-dark` | Absent by decision — DESIGN.md:161-163 | Yes (design-only) | GREEN — do NOT add; DS v1.0.html:33-37 retired the lighter greens. |
| **secondary greens** | `#4cb08b`/`#6dc4a3` colors_and_type.css:14-15 | absent | Absent; 6-stop tint scale DESIGN.md:151-156 | Design-internal | GREEN — DS v1.0.html:33-37 marks them "dev exploration only — DO NOT REINTRODUCE". |
| **green scale 50/100/300/900** | 50 `#eaf3de` (colors_and_type.css:22, DS v1.0:30); 100/300/900 uploads json:17-22 + bundle | identical, tokens.json:17-22 | identical DESIGN.md:23-28 | No | GREEN. |
| **accent (gold) — THE KNOWN TRAP** | **`#8b6914`** in ALL design sources: uploads json:13; colors_and_type.css:19; DS v1.0.html:29; `_ds_bundle.css:2825-2827`,:4277,:4293; ds-components/HANDOFF-README token table | **`#896714`** tokens.json:13 | **`#896714`** DESIGN.md:19; rationale :184-186 (WCAG AA on cream — MEH-917) | **YES — every design artifact is stale** | GREEN in code (code+docs already fixed; ratios 4.61/4.59 vs old 4.48 FAIL). **Every port must transpose `#8b6914`→`accent`.** Reverting = RED + AA regression. Residual: 5 raw `#8B6914` JSX sites (see Raw-hex flags). |
| **honey** | `#c8821e` uploads json:14 | `#c8821e` tokens.json:14 | `#C8821E` DESIGN.md:20 | No | GREEN — token exists; `--honey-deep #A8690F` from the MEH-666 addendum does NOT exist anywhere (see MAP-06). |
| **gold-on-dark** | `#e7c88a` uploads json:15; `.text-gold-on-dark` bundle:4052-4054 | `#e7c88a` tokens.json:15 | `#E7C88A` DESIGN.md:21,187-192 | No | GREEN. Older s2 frames approximate with raw `#e8c788`/`#c99846` — map to this token on port. |
| **background (cream)** | `#f5f0e8` everywhere | `#f5f0e8` tokens.json:7; hardcoded body `globals.css:154` | `#F5F0E8` DESIGN.md:13,164-166 (LOCK) | No | GREEN. |
| **background-alt** | `#ede4d2` uploads json:8; bundle:2870-2872 | `#ede4d2` tokens.json:8; `.seam-cut` embeds it globals.css:99 | `#EDE4D2` DESIGN.md:14,167-173 | No | GREEN. |
| **surface / surface-card / surface-floating** | `#ffffff` uploads json:9 (BUT DS v1.0:44 `--bg-card: #FFFEFB` "NEVER #ffffff"); surface-card/floating `#fffefb` uploads json:23-24 | `surface #ffffff`, others `#fffefb` tokens.json:9,23-24; `.nav-pill-glass` hardcodes `#FFFEFB` globals.css:41,54 | DESIGN.md:15,29-30,174-175,361-363 | Minor intra-design conflict | GREEN — DESIGN.md arbitrates. `.nav-pill-glass` border `#E9E3D6` (globals.css:42,57) matches `_ds_bundle.css:4635` but is a raw-hex bypass — YELLOW candidate to tokenize as addition. |
| **text (ink)** | `#1c1a17` everywhere | `#1c1a17` tokens.json:10; body globals.css:156; `.scrim-ink` :75-84 | `#1C1A17` DESIGN.md:16,176-177 | No | GREEN. |
| **muted** | `#6b6860` uploads json:11. Absent from (a)/(b) — DS v1.0:41 `--fg-muted: #57524A` | `#6b6860` tokens.json:11 | `#6B6860` DESIGN.md:17,178-179 | Intra-design drift | GREEN for code. DS v1.0's `#57524A` ships nowhere — map `--fg-muted`→`fg-muted #5c584f` on port. |
| **fg-muted** | `#5c584f` uploads json:12; colors_and_type.css:18 | `#5c584f` tokens.json:12 | `#5c584f` DESIGN.md:18,180-183 | No | GREEN. |
| **border** | `#e5dfd3` uploads json:16; bundle:2655-2657. BUT colors_and_type.css:23 + DS v1.0:31 = `#e8e0d0` | `#e5dfd3` tokens.json:16 | `#E5DFD3` DESIGN.md:22,193-194 | Intra-design drift + code stragglers | GREEN for the token. Old `#e8e0d0` survives raw in 8 code sites (Skeleton.jsx:77-95, StarSelector.jsx:29, ReviewsSection.jsx:34,61, WhatsAppQuestionChips.jsx:36, events/new/page.js:288) — migrating = GREEN-sweep Group 1 (1 warm step visual delta). |
| **action-primary / -hover / state-selected** | `#2e6853`/`#2e4a2e`/`#2e4a2e` uploads json:25-27 | identical tokens.json:25-27 | DESIGN.md:31-33,364-375 | No | GREEN — pure aliases. |
| **semantic success/warn/error** | colors_and_type.css:34 `--success: var(--secondary)`; DS v1.0:48 self-contradicting; no error/warn token in any design source (`--doc-warn #8B2E2E` = spec-canvas chrome, NOT a product token) | No state-color tokens (deliberate) | DESIGN.md:331-350 — ADR-019 rejected state palette | Aligned-by-absence | GREEN — do not add. **RED trap:** adding requires an ADR superseding ADR-019. `AvailabilityBadge.jsx:10-39` already smuggles raw Tailwind-default state colors — surfaced in YELLOW follow-up #12. |
| **font families** | FRL (+David Libre/Georgia) headlines, DM Sans+Heebo body: uploads json:29-53. colors_and_type.css adds Cormorant `--font-english`; DS v1.0.html:63 body stack has NO Heebo | tokens.json:29-53 (Heebo restored MEH-712); Cormorant = `.font-english` class only (globals.css:163-165, deliberately untokenized) | DESIGN.md:36-73,205-231 | Minor | GREEN. DS v1.0's Heebo-less stack is the exact MEH-712 regression — don't re-import. |
| **type scale** | Fixed px scale uploads json:55-103 = bundle. BUT colors_and_type.css:44-51 uses a fluid clamp() scale | Fixed px, tokens.json:55-103 | DESIGN.md:34-74 identical | Fluid vs fixed | YELLOW if fluid hero wanted: exporter can't emit clamp() (DESIGN.md:355-357) → would land as NEW fontSize additions, not value edits. Silent per-frame clamp() re-creation in JSX = drift. |
| **radii** | sm8/md12/lg16/xl20 uploads json:105-110. BUT colors_and_type.css:77-80: md 16 / lg 24 / full | sm8/md12/lg16/xl20 tokens.json | DESIGN.md:87-91 (+ no rounded-full on rectangles, BRAND §3) | Intra-design drift | GREEN for code. Old-CSS ports: remap `--radius-md 16`→`rounded-lg`, `--radius-lg 24`→nearest or ask. Value changes = RED. |
| **spacing** | xs4…6xl128 uploads json:111-123; DS v1.0.html:52-59 is a DIFFERENT doubled scale | tokens.json:111-123 | DESIGN.md:75-86 | Intra-design drift | GREEN. Never copy `var(--space-N)` numerically from DS v1.0. The 80px editorial step exists only as `.section-y` (globals.css:273-282) — fine as-is. |
| **shadows / elevation** | colors_and_type.css:83-84 `--shadow-card` etc. | No shadow tokens anywhere | DESIGN.md:245-251: flat tonal, "no shadow lift on hover" | design(a) vs everything | GREEN — deliberate rejection; do NOT port. Adding a shadow token contradicts the flat-tonal LOCK (RED-adjacent). |
| **motion durations** | bundle:4605-4619: fast 180 / base 420 / slow 640ms. BUT colors_and_type.css:89-91: base 300 / slow 800 | `.duration-fast/base/slow` = 180/420/640 globals.css:26-28 | DESIGN.md:386 | Intra-design drift | GREEN for code (matches newest gen + docs). Old-frame `--dur-base 300ms` lands on `.duration-base` 420 unless frame specs otherwise. These are utility classes, not config tokens; changing = YELLOW blast radius. |
| **easings** | `--ease-quart` = bundle:4617-4619; plus `--ease-out` colors_and_type.css:87 — not ported | `.ease-quart` globals.css:29 | DESIGN.md:386-387 | Partial | GREEN — `--ease-out` intentionally not carried; if a port needs it, add a utility (GREEN/YELLOW addition). |
| **focus-ring** | DS v1.0.html:49 `rgba(46,104,83,0.40)` | `.focus-ring:focus-visible` box-shadow identical, globals.css:131-134 | DESIGN.md:388-389 | No | GREEN — visual parity (outline vs box-shadow implementation delta only). |

### Raw-hex flags

**Design frames — non-token hexes (top offenders):** `Phase 4 · Floating Navbar v5.html` (82), `Location Onboarding - 4 Patterns.html` (36), `Phase 5 · Homepage Assembly v2.html` (34), `Phase 1 Hero`/`Phase 2 ProducerCard`/`About S8` (27 each), `Badge & Tier S12` (24), `IA Directions` (19). Top values → disposition: 42× `#8b6914` (stale gold → `accent`); 30× `#e8e0d0` (old border → `border`); 26× `#57524a` (→ `fg-muted`); 24× `#1f4a38` + variants (rogue dark greens → `primary-dark`); 21× `#6b4f0f` (darker gold — NO token, needs decision on port); 18× `#8b2e2e` + doc-chrome neutrals (spec-canvas annotation — never port); assorted untokenized green tints (`#c9d9b8`, `#7baa90`, …); 14× `#3a7d64` + retired secondaries ("DO NOT REINTRODUCE"); `#c99846`/`#e8c788` (→ `gold-on-dark`).

**Frontend code — 133 raw 6-digit-hex occurrences** in `app/**` + `components/**` (JSX). Most are brand values in canvas/SVG/Leaflet contexts (legit) or className strings (violates DESIGN.md:326-327). Worst files: `AvailabilityBadge.jsx` (10 — Tailwind-default state colors `#22c55e/#f97316/#9ca3af`, contradicts ADR-019), `StoryCardCanvas.jsx` (9, canvas-exempt), `MapComponent.jsx` (8 — incl. **stale gold `#8B6914` premium ring at :119**), `admin/users/page.js` (`bg-[#FEF3C7] text-[#8B6914]` :135), `StarSelector.jsx:29` + `ReviewsSection.jsx:34,61` (stale gold + old border in one prop), `Skeleton.jsx:77-95`/`WhatsAppQuestionChips.jsx:36`/`events/new/page.js:288` (old border). **`#896714` (the fixed gold) appears in ZERO component files** — every JSX gold is stale.

## RTL authorship check

Sampled 8 frames across both zips (DS v1.0, S7, P5 Assembly, S5 Map, Location Onboarding, IA Directions, Imageless Hero, ProfileCompletenessCard-yellow-high). **Verdict: both zips are RTL-native.** Every sampled frame declares `dir="rtl"` at document or viewport level; physical-property usage ≈ 0 (`margin-left/right`, `ml-/mr-`: none in page frames); logical properties actively used (49 hits in Map S5, 19 in Homepage v2, 10 in S7); `dir="ltr"` appears only as the numeric-isolate idiom (matching code's `.numeric`/`dir="ltr"` convention). Several spec docs have an LTR doc-shell (`<html dir="ltr">`) with RTL mock viewports inside — doc chrome, not product UI.

**Implication:** ports do NOT need an LTR→RTL conversion pass; frames' `start/end` semantics transfer directly to logical Tailwind classes per `.claude/rules/rtl.md`. Residual risk: a handful of absolute `left:/right:` positions in ds-components frames (Location Onboarding — mostly map-pin/canvas placement, direction-neutral per the rtl.md map exception) — verify each per port. Direction-sensitive glyphs (`↗`, chevron `scaleX(-1)`, `ph-arrow-left`) must land as Phosphor + `rtl:rotate-180` per repo convention.

---

## Surface: Homepage (`/`)

Frames: Phase 1 Hero v2, Phase 3 Category Grid v8, Phase 5 Homepage Assembly v2 + Sections 06+10 (FREEZE/PORT specs), Imageless Hero (exploration), Category Glyphs (ds), Photography+Texture S13/S14. **Design chain:** S14 supersedes P1 v2 for position 01; FREEZE/PORT specs post-date the P5 mock for sections 06+10. All home components RTL-clean (0 physical directional classes, grep-verified).

| ID | Design element (frame → section) | Code state (file:line) | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| HOME-01 | S14 → 01 Hero: full-bleed IMG-02 + scrim-ink, H1+sub on scrim, search rides seam to cream, CTAs on cream | `home/HomeHero.jsx:61-131`, `app/globals.css:75-84` | Composition implemented. Height cap 360/440px vs S14 4:5-mobile/560px-desktop; 16:9 crop on mobile — documented deliberate (MEH-788, HomeHero.jsx:31-39) | 1 | S | GREEN | Re-verify scrim AA on real crop per globals.css:71-74 note |
| HOME-02 | P5/S14 → Hero H1 = Frank Ruhl **900** | `home/HomeHero.jsx:93-99` `font-bold` (=700); FRL 900 loaded (layout.js:194) | H1 one weight class below locked 900 | 2 | S | GREEN | One-class fix (`font-black`) |
| HOME-03 | P5 v2 copy lock → subtitle `בתי עסק מקומיים בישראל — ישר מהמקור` (no period) | he.json `home.hero.subtitle` = `ישר מהמקור אלייך. עסקים שכבר בדקנו בשבילך.` | Different copy; matches MEH-879 trust phrase — no lock found superseding P5 | 2 | S | YELLOW | Copy gate (rule 22) — which string is canonical? |
| HOME-04 | P5 v2 → Friday subtitle variant with 🛒 + clause separator | `home.hero.friday_subtitle` — emoji + separator dropped, reads as run-on | Copy drift | 2 | S | GREEN | Emoji design-approved in this microcopy; copy gate applies |
| HOME-05 | S14 → hero search: cream card (radius 16) w/ white inner field + filled green square submit | `HomeHero.jsx:123-124` single pill radius 50px; `HeroSearch.jsx:242-250` icon-only submit | Pill vs card-in-card; no filled submit | 2 | S | GREEN | Dropdown behavior = MERGED MEH-99 lock, don't touch |
| HOME-06 | S14 → hero CTAs start-aligned; near-me border `--primary`; `גלו עסקים` | `HomeHero.jsx:135-166`: justify-center, near-me `border-border`, copy ✓ | Alignment + border token | 1 | S | GREEN | Copy matches MEH-472 locks |
| HOME-07 | S13 §7 → hero photo = LCP: eager + fetchpriority=high + preload | `HomeHero.jsx:67-77` background-image div; 0 repo hits for fetchpriority/preload | LCP priority contract unimplementable via background-image | 2 | M | YELLOW | next/image fill priority vs Ken Burns transform = the uncertainty |
| HOME-08 | S13 motion → Ken Burns 22s, scale ≤1.06, hero only | `globals.css:322-333`: 20s, scale 1.08; reduced-motion ✓ | Slightly past ceiling | 1 | S | GREEN | Keyframe shared w/ ParallaxQuote/Events — check consumers |
| HOME-09 | Imageless Hero (ds exploration) | No code counterpart | NO CODE — correctly so; frame is a business-page masthead exploration | 0 | — | — | Belongs to producer-page track |
| HOME-10 | P5 → 02 HomepageMiniMap (MERGED lock) | `page.js:89`, `HomepageMiniMap.jsx:210-291` + skeleton | Full parity, CLS-guarded (MEH-604) | 0 | — | — | |
| HOME-11 | P5 → 03 HolidayBanner + 04 FridayDeliveryStrip | `page.js:94-96,162-167` | Present; MEH-879 single-slot precedence + DOM order post-date frame | 1 | S | GREEN | No action unless flow-map order re-asserted |
| HOME-12 | P5 → 05 Stats counter ("COPY TBD — DO NOT propose") | `page.js:98-139` trust strip, gold LTR-isolated numerals | Parity with the process; code carries MEH-879-approved resolution | 0 | — | — | Code authoritative by design's own instruction |
| HOME-13 | FREEZE/PORT + S14 → **06 Editorial Breath / feature band**: quote w/ gold emphasis, numeral 06 + gold rule, alt-step bg, hand-cut seams, framed 3:2 IMG-03 + caption chips | **NO CODE.** Quote absent (0 grep hits); ParallaxQuote.jsx orphaned; `.seam-cut` has zero homepage consumers; `page.js:222-223` records MEH-883 removal | Frozen approved surface entirely missing — entangled with MEH-883 | 4 | M | RED | Brand-level call. RTL: port needs logical props (frame LTR-authored) |
| HOME-14 | P3 v8 LOCK → 07 grid layout: 2+4 asymmetric desktop / 2×3 tablet / 2+4 mobile, sharp corners, cream glyph panel, gold numeral, no counters | `home/HomeCategoryGrid.jsx:45-99` | All match | 0 | — | — | Verified vs Assembly v2:767-837 |
| HOME-15 | P3 v8 LOCK → hover = border→green (+gold underline); "No glyph scale" (v8:1009) | `HomeCategoryGrid.jsx:78-79` `group-hover:scale-[1.06]` on glyph | Explicit v8 LOCK violation | 2 | S | GREEN | Drop scale, optional underline per :557 |
| HOME-16 | Assembly v2 Iteration-3 glyph family (Kare #10) | `CategoryIcons.jsx:42-118`: 5/6 match; VegIcon (:56-64) is the older single-leaf variant, not branch+leaf cluster (:2340) | Produce glyph from wrong variant | 1 | S | GREEN | File header cites the ProducerCard placeholder set |
| HOME-17 | P3 v8/P5 → grid header: eyebrow DM Sans 11px 0.18em + 32×1px gold rule, start-aligned; H2 `גלי לפי קטגוריה` (Q05: keep feminine) | `HomeCategoryGrid.jsx:36-43`: eyebrow as Cormorant-italic gold 18px centered, no rule; H2 = `גלו לפי קטגוריה` | Eyebrow uses numeral treatment; H2 pluralized against recorded Q05 | 2 | S | YELLOW | H2 may be later MEH-472 unification — copy gate before "fixing" back |
| HOME-18 | P3 v8 → small-card glyph aspect 1:1 (desktop+mobile), 4:3 tablet; mobile hero 16:7 | `HomeCategoryGrid.jsx:71`: 4/3 everywhere; hero mobile 16:9 | Aspect matrix simplified | 1 | S | GREEN | Single component |
| HOME-19 | P5 cat 05 = `שמנים ודבש` | `lib/home-categories.js:17`: `שמנים` | Deliberate — MEH-743 honey split | 0 | — | — | Post-dates frame |
| HOME-20 | Category Glyphs 18 Preview v2 (final 18-glyph keyline set) | **NO CODE.** Only 6 grid icons exist; homepage still renders category **emoji** (`HomeProducersGrid.jsx:94`, `HeroSearch.jsx:304`) | 18-glyph system unadopted; emoji contradicts v4.1 no-emoji LOCK | 3 | L | YELLOW | emoji RESOLVED via MEH-1020 (both render sites 0 emoji, 05/07); 18-glyph remainder -> MEH-683 |
| HOME-21 | P5 → 08 Featured Producers: separate 3-card editorial row, eyebrow `השבוע` | No separate section; main grid reuses H2 | 08+09 merged; editorial beat missing | 2 | M | YELLOW | IA question; interacts w/ MEH-809 thin-catalog gating |
| HOME-22 | P5 → 09 main grid + P2 v4 card lock | `HomeProducersGrid.jsx:45-120+`; `ProducerCard.jsx:233-291` | Full parity on locked treatment | 0 | — | — | Kashrut on home cards: COLLISION (MEH-986) |
| HOME-23 | FREEZE/PORT → 10 Meet a Producer: framed 4:5 image radius 16, `--light` loading fill, solid caption chip bottom+inline-start | `HomeStaticBlocks.jsx:97-113`: mat treatment, 5:6, no chip | Ratio + treatment + chip missing | 2 | S | GREEN | FREEZE §10.4: chip solid (blur dropped) — FREEZE wins over design-pass HTML |
| HOME-24 | FREEZE flag 2 vs PORT → §10 CTA pair (primary = write-WhatsApp vs primary = meet) | `HomeStaticBlocks.jsx:132-151`: primary = meet (PORT); write-CTA underline link, no WA glyph, `writeHref` never populated (`lib/featured-producer.js:16-26`) → dead code every render | WA CTA functionally missing; FREEZE-vs-PORT contradiction unreconciled | 3 | M | YELLOW | Needs Sapir call + WA target in mapping + glyph; i18n keys exist |
| HOME-25 | FREEZE/PORT → §10 text column: gold eyebrow + 32×1px rule, clamp(28→38), ≤46ch, attribution | `HomeStaticBlocks.jsx:117-131`: eyebrow not gold/no rule, clamp(24→36), attribution omitted (dup of meta) | Gold accent treatment missing ("must read as a real accent — currently zero gold in section") | 1 | S | GREEN | Eyebrow copy + H2 verbatim ✓ |
| HOME-26 | FREEZE §8 → page position map (06 between stats↔categories; 10 between grid↔events) | `page.js` order diverges (new-producers inserted; events demoted) — MEH-879/883/912 IA re-anchor | Deliberate post-design IA | 1 | M | YELLOW | FREEZE calls flow map "source of truth" — needs one-line reconciliation decision, not code |
| HOME-27 | P5 → 12 How It Works: gold numeral + hand-drawn step glyph + title/body; S14 alt-step bg + seams | `HomeStaticBlocks.jsx:161-191`: numerals/titles/bodies ✓; no step glyphs, no alt bg/seams; titles pluralized vs design feminine narrative | Glyph column missing; verb-form drift | 2 | S | YELLOW | Glyph SVGs exist verbatim in Assembly v2:2330-2332; copy gate on verbs. Alt-bg/seams → MEH-537 territory |
| HOME-28 | P5 v2.1 + S14 → 13 For Business: **light** warm section, 64×1px gold rule, gold-italic em in H2, 3 locked body lines, green pill CTA | `HomeStaticBlocks.jsx:228-256`: **dark** `bg-primary-dark` band centered; H2 + CTA label ✓; body L1-L3 ≠ the lock the code comment cites | Inverted color treatment; body copy diverges from cited lock | 2 | S | YELLOW | (a) visual = GREEN-shaped; (b) copy gate to establish canon |
| HOME-29 | P5 → 14 Footer: 4 themed nav columns, italic `הצטרפו ↗` submit, locked strings | `Footer.jsx:81-166+`: 3-column body, icon-arrow submit; locked strings all match | Column IA is the structural gap | 2 | M | YELLOW | WCAG-driven deviations documented in file header |
| HOME-30 | S13/S14 cross-cutting: grain 0.035, one scrim recipe, background-alt + seam tokens, section rhythm map | Primitives all shipped (globals.css); homepage applies NONE of the rhythm — flat cream throughout | "The void S14 set out to kill is still flat" | 3 | M | **COLLISION — audit only (MEH-537)** | Surface-warmth calibration = MEH-537 territory |
| HOME-31 | All frames: gold numerals in Cormorant Garamond **true italic** | `layout.js:194` loads no `ital` axis — all `font-english italic` renders synthesized oblique | Sitewide faux-italic | 2 | S | GREEN | One-line fonts URL fix; verify byte impact |
| HOME-32 | (no design source) — LocationBanner/Modal, HomeComparisonTeaser, HomeRecentlyViewed, "עסקים חדשים" | Code-only surfaces (MEH-41/841/912/809) | NO DESIGN SOURCE — flow map never modeled them | 1 | — | YELLOW | Future P5 v3 flow map should absorb or kill deliberately |

## Surface: Nav system (Header / BottomNav / AccountSheet / Footer-logo)

Frames: Phase 4 v5 → MEH-732 refinement → v6 Single Voice → **Phase 6 Signature Bottom Pill (AUTHORITATIVE — explicit "supersedes" note)**; MEH-732/v6 locks inherited for glass values + pill contents. All four frames RTL-authored — no conversion debt. **No raw drift found** — every divergence traces to a documented later MEH decision in code comments; the audit's real output is the design-vs-decision conflicts (NAV-06/07/08/14/16).

| ID | Design element (frame → section) | Code state (file:line) | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| NAV-01 | Desktop pill geometry (P6 centered bar max-w 1040px; MEH-732 lock 940px/top 32px) | `Header.jsx:234,266` — content-hug `max-w-[92vw]`, state-dependent padding | Content-hug vs fixed max-width | 1 | S | YELLOW | Deliberate MEH-890/899 supersession — not drift |
| NAV-02 | Scrolled glass LOCKED MEH-732: rgba(245,240,232,.85) + blur 12 + #E8E0D0 border; trigger scrollY>60 | `Header.jsx:258-260` at-rest /85, scrolled /60, inner pages solid (MEH-947); threshold+shadow+border parity | Scrolled opacity 60 vs locked 85; three-way surface | 1 | S | YELLOW | MEH-896 deliberate lightening |
| NAV-03 | Over-image dark veil state (v6/P6 `is-over` rgba(22,38,30,.30-.34) + cream ink/logo flip, gold-on-dark) | NO CODE — no `is-over` equivalent (MEH-890: hero scrim removed, dark ink) | Entire over-image state absent | 2 | L | RED | Reinstating restructures Header surface/ink theming |
| NAV-04 | Desktop active link = gold 1.5px underline | `Header.jsx:376-384` — tint chip `bg-text/[0.07] text-primary` | Underline → chip | 1 | S | YELLOW | MEH-896 explicitly replaced it |
| NAV-05 | Desktop icon trio: search · globe · user/avatar | `Header.jsx:314-320` search only; globe removed (pending MEH-472); guest login = text link | 2 of 3 diverge | 2 | M | YELLOW | Login-as-icon unported |
| NAV-06 | Desktop CTA "הוסיפו עסק" — P6 quiet text link + gold ↗ | NO CODE in Header — removed by MEH-907 ("magazine, not marketplace") | Header CTA absent | 3 | S | YELLOW | Documented product decision vs P6 — flag to Sapir, not auto-restore |
| NAV-07 | Logged-in avatar: 30px, #EAF3DE bg, green-dark FRL initial | `Header.jsx:441-447` — 34px, solid green bg, white sans initial | Inverted treatment | 2 | S | YELLOW | Code's "design is silent" rationale is stale post-P6 |
| NAV-08 | Logo lockup (P6/v6 inline SVG: 5-seed mark + מהמקור FRL 700 + Cormorant "— from the source"; 168×50 / 140×44) | `Header.jsx:278-287` raster /logo.png rendered 101×38; repo `logo-horizontal-he.svg` uses Suez One + HE tagline — a THIRD lockup | Raster vs SVG; ~40% smaller; two competing lockup definitions | 2 | M | YELLOW | Seed-mark geometry parity ✓; canonical-lockup = human call |
| NAV-09 | Mobile top: logo + quiet search, logo 140×44 | `Header.jsx:346-352` structure ✓; logo ~28% smaller | Logo scale | 1 | S | YELLOW | v6 hamburger correctly NOT ported (P6 supersedes) |
| NAV-10 | Bottom pill: max-w 343px centered, tabs 64×56 | `BottomNav.jsx:152-174` full-width, h-14, tabs min 44px | Wide-slim vs narrow-tall | 1 | S | YELLOW | Deliberate MEH-852 tune; ≥44px preserved |
| NAV-11 | Bottom pill surface: cream #F5F0E8 solid + #E8E0D0 border (glass alt @85/blur12) | `.nav-pill-glass` globals.css:40-51 — whiter/stronger glass + fallbacks | Different surface | 1 | S | YELLOW | MEH-789/ADR-023 extension; shadow parity ✓ |
| NAV-12 | Active tab = filled green pill-in-pill | `BottomNav.jsx:182-193` — primary/10 tint capsule + fill icons | Tint vs solid fill | 1 | S | YELLOW | MEH-843/852 supersede; fill-on-active ✓ |
| NAV-13 | Tab set compass/map-trifold/flower/user; labels DM 500 11px | `BottomNav.jsx:10,102-105,142` icons+copy ✓; 10.5px/600 | Label metrics | 1 | S | GREEN | AA darkening MEH-919 — keep |
| NAV-14 | Account tab logged-in: 24px avatar --light bg + FRL initial; **label = user's name** | `BottomNav.jsx:262-278` — avatar inverted; label always "חשבון" | Name-as-label missing; avatar family NAV-07 | 2 | S | YELLOW | Name label = real unported spec item |
| NAV-15 | AccountSheet (P6): green-900, radius 20, bottom 88px, all rows, MEH-669 gate | `AccountSheet.jsx:85-199` | Parity; deltas are documented improvements (ArrowUpLeft MEH-868, dedup MEH-908, focus trap) | 0 | — | GREEN | Best-ported surface |
| NAV-16 | Hide-on-scroll "reuse MEH-734 (top + bottom)" (P6 spec row) | Bottom ✓ (`BottomNav.jsx:65-86`); top NOT hidden — always sticky (MEH-896 removed collapse) | Top hide-on-scroll absent | 2 | M | YELLOW | Conflict w/ P6 spec row — surface to Sapir |
| NAV-17 | Footer | `Footer.jsx:46-229` | NO DESIGN SOURCE in nav frames (canonical spec = docs/DESIGN.md §Footer); P6's only requirement (add-business path) present ✓ | 0 | — | GREEN | Don't infer footer gaps from these frames |
| NAV-18 | Footer logo light-variant: per-petal cream opacities; repo ships `logo-on-warm-dark.svg` | `Footer.jsx:95-100` — `logo-footer.png` + `brightness-0 invert` (flattens mark); purpose-built asset unused (0 refs) | CSS-invert kills graded-cream lockup | 2 | S | GREEN | Single-file swap |
| NAV-19 | Homepage trust strip above pill | `Header.jsx:197-206` (MEH-884) | NO DESIGN SOURCE — code-side addition | 0 | — | GREEN | Not a defect |
| NAV-20 | Motion tokens 180/420/ease-quart, reduced-motion instant, never animate backdrop-filter | `globals.css:26-29` identical; guards on both components | Parity incl. MEH-732 guardrail | 0 | — | GREEN | |

## Surface: ProducerCard

Frames: `Phase 2 · ProducerCard v4.html` + `ProducerCard v4 Populated.html` (**Populated = later, "shipped, LOCKED" — supersedes v4 on hover + insets**; conflicts flagged per row). Both frames already logical-property-authored; code's `start-*`/`dir="ltr"` conversions verified correct.

| ID | Design element | Code state (file:line) | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| CARD-01 | Shell: #FFFEFB, 1px border, radius 0, no shadow | `ProducerCard.jsx:234` `bg-surface-card border rounded-none` | None | 0 | — | GREEN | |
| CARD-02 | Media aspect 1:1 mobile / 4:3 desktop | `:241` ✓; Cloudinary crop always 4:3 (:184) | Center-crop mismatch possible on mobile | 1 | S | GREEN | |
| CARD-03 | No-photo placeholder: cream + leaf + wordmark | `:250-260` — color exact; glyph 40px/op .70 vs 60px/.32 | Cosmetic | 1 | S | GREEN | Canonical per MEH-602 |
| CARD-04 | Warm grain overlay on image (v4 only) | NO CODE; Populated (LOCKED) has no grain either | Source conflict | 1 | S | YELLOW | Confirm which source governs |
| CARD-05 | Heart top-start circle 40px, cream bg | `:164` 44px `bg-surface-card/95`, inset 12 ✓ | Size/bg polish | 1 | S | GREEN | Logical `start-3` ✓ |
| CARD-06 | Heart color law: outline→green fill, never red | `:167-172` ✓ | None | 0 | — | GREEN | Gerund aria ✓ (MEH-472) |
| CARD-07 | Badge row bottom-start, inset 12 | `:268` ✓ | None | 0 | — | GREEN | |
| CARD-08 | **Hard cap max 2 chips** on image (LOCK both frames) | `BadgeRow limit={2}` + TrustBadge + delivery chip → up to 4 stacked | Cap violated when chips co-occur | 2 | M | YELLOW | Product call which 2 win |
| CARD-09 | "+N" overflow chip | NO CODE — `badgeCount` helper exists unused (lib/badges.js:202-204) | Missing affordance | 2 | S | GREEN | Card-only change |
| CARD-10 | Chip styling: v4 square gold/green-bg vs Populated radius-2 cream-bg | `rounded-full` pills; "חדש" green vs gold in BOTH sources | Two sources conflict with each other AND code | 2 | S | YELLOW | Needs Sapir ruling; MEH-730 claims v4 recolor applied |
| CARD-11 | Verified seal icon-only 30px cream circle | BadgeRow.jsx:126-130 ≈26px + border | Minor | 1 | S | GREEN | Declared renders nothing on cards ✓ |
| CARD-12 | Kosher badge colors/shape | BadgeRow muted class, gated `kashrut_verified_at`, priority 10/12 rarely surfaces | Shape + effective invisibility | 1 | S | COLLISION (MEH-986) | Legal gate |
| CARD-13 | Eyebrow = CATEGORY 11px 0.15em fg-muted | `:286-288` ✓ | None | 0 | — | GREEN | |
| CARD-14 | Name FRL 700 20px LH 1.25 | `:293` ✓ except leading-snug 1.375 | Minor | 1 | S | GREEN | |
| CARD-15 | Rating: v4 13px sans vs Populated Cormorant-italic 15px (conflict) | `:299-307` matches v4; ≥3-reviews threshold in neither source | Typography conflict + NO DESIGN SOURCE threshold | 1 | S | YELLOW | Ruling needed |
| CARD-16 | Availability **status text** ("פעיל היום" / italic vacation date) | NO CODE — dot only (:310-321) | Whole text role missing | 3 | M | YELLOW | Needs he.json key + vacation_until surface |
| CARD-17 | Availability dot 8px logic | `:57-69,314-321` parity; Populated adds glow w/ nonexistent token | Glow needs new token | 1 | S | YELLOW | Recommend keep as-is (v4 has no glow) |
| CARD-18 | Distance: Latin numerals + "km", **never "12 ק״מ"** (v4 LOCK) | `lib/distance.js:51-66` returns `ק"מ ממך`, wrapped dir="ltr" | Direct LOCK violation + bidi smell | 2 | M | YELLOW | Shared helper — feeds MapProducerCard + tests |
| CARD-19 | Description one line 13px, hidden mobile | `:207-212,335-342` 14px, always shown | Minor | 1 | S | GREEN | |
| CARD-20 | Design has NO card CTAs | Footer row: price + contact icon + fridayMode chip + fav count (:344-377) | Extra elements, NO DESIGN SOURCE | 2 | M | YELLOW | Removal = product decision (post-frame MEHs) |
| CARD-21 | Hover (Populated LOCKED): border→primary + img 1.02 + name→green; NO underline/shadow | `:235,247` ✓; name greens only on self-hover; transition 420 vs 200ms | Partial | 1 | S | GREEN | Do NOT re-add v4 gold underline |
| CARD-22 | Pressed: opacity .95 scale .98 | NO CODE | Missing press feedback | 2 | S | GREEN | One-line fix |
| CARD-23 | Focus: 2px focus-ring on card | Only heart has it; links have none | Keyboard affordance missing | 2 | S | GREEN | |
| CARD-24 | Vacation state: image overlay + muted name + italic copy | Only dot changes | Most of state missing | 3 | M | YELLOW | Depends on CARD-16; verify vacation producers reach lists |
| CARD-25 | Disabled state | NO CODE | Likely unreachable (server-side filtered) | 3 | S | YELLOW | Confirm reachability; may be N/A |
| CARD-26 | Skeleton: radius 0, cream media, opacity pulse 1.8s | `Skeleton.jsx:38` **rounded-2xl** + shimmer 1.5s | Radius 16 vs 0 + pulse style | 2 | S | GREEN | One file fixes 5 consumer surfaces |
| CARD-27 | Mobile density variant (name 16, heart 34, insets 8, desc hidden) | Breakpoint-aware only for aspect | Entire mobile scale-down absent | 2 | M | YELLOW | Multi-class responsive sweep |
| CARD-28 | Tokens: gold #8B6914 / fg-muted #57524A / border #E8E0D0 | accent #896714 / #5c584f / #e5dfd3 (generated per ADR-019) | Sub-perceptual drift ×3 | 1 | M | RED | Accept DESIGN.md as SoT; HTML values stale (see Token drift) |
| CARD-29 | Map card variant | `MapProducerCard.jsx:76-219` | NO DESIGN SOURCE — v4 scope excludes map view; S5 governs | 0 | — | YELLOW | Excluded from parity scorecard |

## Surface: /map (S5 + Honey Pin MEH-666)

**Global caveat:** code repeatedly cites a later "S5 FINAL (MEH-763 Chunk 2)" handoff lock that deliberately diverges from the S5 HTML frame (uniform 36px markers, PEEK+45 sheet, rounded-md text-only chips per MEH-764/657). Those rows are flagged "possible supersession — confirm SoT". MapClient/MapComponent = central → RED.

| ID | Design element | Code state (file:line) | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| MAP-01 | Desktop split 60/40, list on reading-start | `MapClient.jsx:281-333` ✓ + extra ratio toggles | Parity (additive toggles) | 0 | — | RED | |
| MAP-02 | List head: gold-rule eyebrow + display-font count "N בתי עסק **מאומתים**" | `:302-309` plain text-xs; copy "מקומיים" | Hierarchy missing; copy delta | 2 | S | RED | "מאומתים" only true if list verified-only — verify first |
| MAP-03 | Mobile sheet-sort "לפי מרחק"; desktop NO sort | Desktop select is **dead UI** (`sortBy` zero consumers, :57-58,310-319); mobile none | Inverted vs design; dead control | 2 | M | RED | UX-trust bug independent of parity |
| MAP-04 | Photo markers 46px; selected 60px + **3px gold** + name-label pill w/ distance | `MapComponent.jsx:70-142` uniform 36px (S5 FINAL); active #2E4A2E ring; **no name pill** | Selected identity invisible on canvas | 2 | M | RED | Possible supersession; pill = biggest UX delta |
| MAP-05 | Photo-less fallback: category color + hand-drawn glyph | `:87-93` + marker-glyph.js — Phosphor (MEH-936) | Glyph tier differs | 1 | M | RED | Tier-mixing question, same family as MAP-06 |
| MAP-06 | **Honey pin: #C8821E + #A8690F, hand-drawn dipper, LOCK "no Phosphor anywhere on this glyph"** | `map-categories.js:38` color ✓ + Phosphor **Hexagon**; no dipper anywhere; no #A8690F | Direct LOCK violation; code comment mis-attributes to MEH-763 | 3 | M | RED | SoT ruling: MEH-666 addendum vs MEH-763 claim |
| MAP-07 | Cluster 46px "+N" | `:321-341` 40px, no "+" | Near-parity | 1 | S | RED | |
| MAP-08 | Category pills: 9999px + 20px hand-drawn glyph; single row | rounded-md text-only (MEH-764/657 locks) + extra toggle/tag rows; chip set 4+כל vs frame 6 | Superseded shape/glyphs; set differs | 1 | S | YELLOW | Likely intentional; honey/oils chip missing |
| MAP-09 | Zero-count pill: dashed, dimmed, not tappable | NO CODE in chips; desktop legend only (MEH-722) | Chips lack count wiring | 3 | M | YELLOW | If MEH-970 scope covers chip counts → COLLISION |
| MAP-10 | Sheet snaps 45vh ↔ full; map interactive at rest | `MapBottomSheet.jsx:10-13` PEEK 14 ↔ 45; no full | Snap pair shifted down | 2 | M | YELLOW | "S5 FINAL: TWO snaps" — confirm SoT |
| MAP-11 | Sheet chrome: 24px radius, 44×5 handle, eyebrow + gold count, fade | rounded-t-lg, 32×4 `#D4C5A9` (un-tokenized per code's own comment), plain count | Fidelity gaps | 1 | S | YELLOW | |
| MAP-12 | List/sheet card: plain eyebrow, seal in name row, city+distance, neutral hours, no rating/price | `MapProducerCard.jsx` — icon chip category, seal in trust strip WITH rating, no city, + price line, colored hours | 5 element-level deltas | 2 | M | YELLOW | `.numeric` isolation ✓; `ק"מ` vs gershayim `ק״מ` nit |
| MAP-13 | ONE labelled primary pill ≥40px, brand green **never WA green** | `:195-206` icon-only 28px circle; WA path `bg-whatsapp`; also MobileSheetSelectedCard:94 + DesktopMiniPopup:50 | Violates two frame locks + 44px floor | 2 | S | YELLOW | Pairs w/ BIZ-11 ruling |
| MAP-14 | Location-denied flow | LocationModal routing | — | — | — | **COLLISION — audit only (MEH-970)** | Facts recorded only |
| MAP-15 | Category-aware empty state + "הרחיבי את האזור" CTA | Generic empty ×2 competing (list + map overlay) | Generic; no expand action | 2 | M | YELLOW | Minor architectural smell |
| MAP-16 | List loading skeleton | NO CODE — `useProducersFeed` exposes no loading flag | Missing entirely | 3 | M | YELLOW | Doesn't touch MapComponent |
| MAP-17 | Legend | Desktop legend (MapPane.jsx:144-199) | NO DESIGN SOURCE — code-only; duplicates chips' job | 1 | — | YELLOW | Consolidation decision, not deletion |
| MAP-18 | Search-in-map | Always-visible CitySearch + "חפשו באזור זה" | NO DESIGN SOURCE — additive | 1 | — | RED | Record as intentional deviation; MEH-970-adjacent |
| MAP-19 | Near-me: desktop labelled pill + FAB inset-inline-start (=RIGHT in RTL) | Desktop icon-only `end-4` (=LEFT) unlabelled; mobile NearMePill ✓ | Desktop side flipped + unlabelled | 2 | S | RED | Handler in MapClient → RED; behavior = MEH-970 |
| MAP-20 | My-location: 18px dot + white border + pulse ring | circleMarker r8, no border, no pulse | Near-invisible among 36px markers | 2 | S | RED | divIcon/CSS swap; respect reduced-motion |
| MAP-21 | Location Onboarding 4 Patterns | Code = pattern 01 (no gate) already | — | — | — | **COLLISION — audit only (MEH-970)** | |
| MAP-22 | IA Directions (skim) | n/a | No map-page IA mandates | 0 | — | YELLOW | Note only |
| MAP-23 | Warm map tone (named S5 section) | Raw OSM default tiles, no tint | Brand-warm canvas missing | 2 | M | RED | Confirm intent (CSS tile filter vs styled provider) |

## Surface: Business page (S6 → `/[slug]` → ProducerDetail composition)

Route: `app/[locale]/[slug]/page.js` (+ `/p/[slug]` redirect) → `producer/[id]/ProducerDetail.jsx` (**central**, compose-only post-MEH-407 over ProducerHeader/ActionRow/ContactSidebar/ProducerSections/StickyContactBar). Code is AHEAD of S6 in 3 places (S12 badge, MEH-815 Tinted Masthead, MEH-986 gating).

| ID | Design element | Code state (file:line) | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| BIZ-01 | Hero editorial collage (1+2 stacked, 460/300px, media credit) | `ProducerDetail.jsx:105-109` → single-image carousel h-52 | Collage paradigm missing | 3 | L | RED | LCP block in central file |
| BIZ-02 | Name masthead FRL 900 72/46px + gold eyebrow + Cormorant dek | `ProducerHeader.jsx:41-43,81-85` — 36px/700, no eyebrow, plain dek | Magazine register absent | 3 | M | YELLOW | SUPERSEDED by MEH-815 (name-only masthead, eyebrow dropped) + Cormorant-on-Hebrew LOCK; imaged name-scale intentional (photo-led) |
| BIZ-03 | Verified seal beside name (S6 plain) | BadgeRow → S12 VerifiedTierBadge (newer spec) | S6 stale here | 1 | S | YELLOW | (MEH-742 gate) — don't "fix back" |
| BIZ-04 | Hero has NO rating | Rating chip in name row + sticky bar | Code-extra surface | 1 | S | YELLOW | Product call |
| BIZ-05 | Tag pills rounded-full under dek | Highlights strip rounded-xl; text hidden on mobile | Styling delta | 1 | S | GREEN | |
| BIZ-06 | Kashrut surfaces | kosher chip + KashrutBadgeStrip | — | 1 | S | COLLISION (MEH-986) | |
| BIZ-07 | Breadcrumb 2-level, no self | `:84-102` + self-crumb + back button | Extra chrome | 1 | S | RED | Central file edit |
| BIZ-08 | NO tab bar (editorial single scroll) | Mobile sticky tab bar `:112-139` | Code-extra chrome design avoids | 2 | M | RED | useTabScroll plumbing |
| BIZ-09 | Desktop grid 1fr/360, gap 56, max 1120, aside top 24 | `:142` 1fr/320 gap-8 max-w-6xl | Metrics drift | 1 | S | RED | One-line but central |
| BIZ-10 | Contact card: kicker + demoted share + directory rows + "ערוץ ראשי" tag | `ContactSidebar.jsx:37-197` — chips, tile grid, Follow + WA-group (lock forbids) | Anatomy diverges | 3 | M | YELLOW | RTL: chevron scaleX(-1) → logical icon |
| BIZ-11 | **Brand-LOCK: every CTA #2E6853, never WA brand green even on WA button** | `.btn-whatsapp` #25D366 (globals.css:9-11), 7+ consumers | Direct violation on primary CTA | 3 | S | YELLOW | Needs Sapir ruling (recognition vs lock) — one decision, many surfaces |
| BIZ-12 | Website-primary CTA: ↗ + globe, stays green | Outline variant, no ↗ | Affordance missing | 1 | S | GREEN | |
| BIZ-13 | Story: eyebrow+rule, opening words FRL 900 gold, pull-quote w/ cite | `ProducerSections.jsx:77-84` plain h2 + paragraph | All missing; pull-quote needs data field | 3 | L | YELLOW | Backend + he.json scope |
| BIZ-14 | Gallery: asymmetric grid + "+N עוד" tile + heading | `ImageGallery.jsx:87-157` carousel | Different paradigm | 3 | M | YELLOW | Shared component, blast radius unverified |
| BIZ-15 | Hours: halo dot, collapsed ranges, italic סגור muted | `OpeningHours.jsx:19-77` — close; closed = raw #A32D2D red (off-palette) | Range collapsing + red | 1 | S | GREEN | dir="ltr" ranges ✓ |
| BIZ-16 | Mini-map: warm map, photo/name-pill marker, address pill, Waze+Google always | `MiniMap.jsx:33-94` — default blue marker, Waze mobile-only | Marker identity + Waze desktop | 2 | M | YELLOW | Marker work shared w/ MEH-666 |
| BIZ-17 | Delivery block | `DeliveryBlock.jsx:17-55` | NO DESIGN SOURCE (S6 has none) | 0 | — | GREEN | Inherits BIZ-11 issue |
| BIZ-18 | Reviews summary: 52px score inline in section head | `ReviewsSection.jsx:199-215` boxed/centered 48px, ≥3 gate | Placement + gate | 1 | S | GREEN | StarRow hardcodes stale gold (see tokens) |
| BIZ-19 | Review cards 3-col grid | Single-column divide-y list | Layout family | 2 | M | GREEN | Non-central |
| BIZ-20 | Reviews empty: "היי הראשונה" + ghost CTA | Leaf + message, no CTA; write-CTA WA-click-gated | Invitation framing missing; gate = product policy | 2 | S | GREEN | Flag gate, don't change |
| BIZ-21 | Sticky mobile CTA: floating inset-12 rounded-24 blur + phone/share minis | `StickyContactBar.jsx:31-93` full-width solid, CTA only | Visual language + 2 controls | 2 | M | YELLOW | z-order ledger w/ BottomNav |
| BIZ-22 | Vacation (LOCK: WA stays live, hint line) | Banner ✓; sidebar dims 50% + sticky label-swap | Softer violations of lock spirit | 1 | S | YELLOW | 3 files |
| BIZ-23 | No-photos: monogram tile + gallery invite | MEH-815 Tinted Masthead (Sapir-approved, supersedes) | Only gallery invite open | 1 | S | GREEN | Treat Masthead as newer SoT |
| BIZ-24 | Loading state | Bare centered text | NO DESIGN SOURCE; repo convention = geometry skeletons | 1 | S | RED | Central file |
| BIZ-25 | Similar strip: 3 pcards no heart + hours line | ProducerCard w/ heart | Card internals | 1 | M | RED | ProducerCard central variant |
| BIZ-26 | Minimal profile: story absent when empty, never placeholder | `:77` conditional ✓ | Parity | 0 | — | GREEN | |
| BIZ-27 | Gold #8B6914 in S6 | accent #896714; ReviewsSection hardcodes 8B6914 | Token drift (see §Token drift) | 1 | S | RED | Canon ruling → docs-only close |

## Surface: About (S8 Direction D → `/about`)

Strong port. Frames LTR doc-shell / RTL mock surfaces; code logical-props verified.

| ID | Design element | Code state (file:line) | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| ABOUT-01 | Hero H1+sub | AboutClient.jsx:90-98 | Parity | 0 | — | GREEN | |
| ABOUT-02 | Desktop H1 clamp(60,5.9cqw,82) | `text-[clamp(28px,5vw,52px)]` :92 | Caps at 52 vs 60-82 | 1 | S | GREEN | |
| ABOUT-03 | Story 2-col + sticky portrait | :102-162 ✓ | None | 0 | — | GREEN | Portrait upgraded (S14/MEH-788 supersede) |
| ABOUT-04 | Byline eyebrow "ספיר · מהמקור" + 2 captions | captions only :149-158 | Eyebrow missing | 1 | S | GREEN | border-s-2 RTL ✓ |
| ABOUT-05 | ParallaxQuote em-mark + italic + air 80/120 | :165-171 no em-mark, upright (documented), py-9/14 | Em-mark + rhythm | 1 | S | GREEN | |
| ABOUT-06 | (no frame) comparison 3-stop section | :173-198 (MEH-841) | NO DESIGN SOURCE | 0 | — | GREEN | RTL-safe |
| ABOUT-07 | Benefits: start-aligned gold `01—` numerals on flat cream | Centered, no em-dash, on background-alt | Alignment + canvas | 1 | S | GREEN | Tonal blocks = later pass |
| ABOUT-08 | Section order tips→testimonials→values | benefits→values→tips→testimonials | Swapped | 1 | S | YELLOW | Intent undocumented |
| ABOUT-09 | Tips intro paragraph | Absent from he.json | Missing | 1 | S | GREEN | Code items canonical |
| ABOUT-10 | Testimonials invite → #contact anchor + hover motion | → /contact page, no motion | Minor | 1 | S | GREEN | |
| ABOUT-11 | Values box: 1px border + white .34 fill | border-2 accent/30, no fill | Token/weight | 1 | S | GREEN | MEH-742 spec chrome correctly unrendered |
| ABOUT-12 | CTA: 2 buttons (business primary) | Consumer-primary → /map, business demoted (documented) | Hierarchy inverted | 1 | M | YELLOW | Deliberate product supersede |
| ABOUT-13 | Contact form 2-col | :348-436 ✓ + live-region (MEH-855) | None | 0 | — | GREEN | email dir="ltr" ✓ |
| ABOUT-14 | Paper-grain film | :445-453 ✓ | None | 0 | — | GREEN | |

## Surface: Process (S11 → `/about/process` — route EXISTS, MEH-534)

Best port in the audit — matrix rows all parity or GREEN-small.

| ID | Design element | Code state | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| PROC-01 | Hero + gold em H1 (Sapir-LOCKED) | AboutProcessClient.jsx:117-133 t.rich | None | 0 | — | GREEN | |
| PROC-02 | Dotted connector spine (vertical inline-start mobile / horizontal ≥760) | Absent (grep verified) | Missing both breakpoints | 1 | M | GREEN | Port stays logical |
| PROC-03 | Step-4 badge aside inside ol | After ol; visually equivalent | None material | 0 | — | GREEN | MEH-742 gate |
| PROC-04 | Everyone 3-col + `01—` | :185-214 ✓ | None | 0 | — | GREEN | |
| PROC-05 | Badge box + tooltip + absence block | :218-258 ✓; absence border green-300 vs --secondary | Refchip correctly omitted | 0 | — | GREEN | MEH-742 gate |
| PROC-06 | Matrix A 8 rows | 9 rows (MEH-927 meat/fish split) | Intentional supersede | 0 | — | GREEN | |
| PROC-07 | Matrix B 8 rows | 7 rows (MEH-927) | Intentional | 0 | — | GREEN | |
| PROC-08 | Caveat "דברו איתנו" → #join link | Linkless text | Link lost | 1 | S | GREEN | #join id exists :383 |
| PROC-09 | Closing quote (LOCKED) | :368-379 ✓ | None | 0 | — | GREEN | |
| PROC-10 | CTA → register + hint | :383-405 ✓ ArrowLeft RTL-forward | None | 0 | — | GREEN | |

## Surface: Events (S10 Almanac → `/events`)

| ID | Design element | Code state | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| EVENT-01 | Breadcrumb | :210-212 ✓ | None | 0 | — | GREEN | |
| EVENT-02 | Type-led hero (zero photography — anti-pattern #1) | Photo Ken Burns + scrim all viewports (MEH-788) | Supersede in tension w/ S10 anti-pattern | 1 | — | YELLOW | |
| EVENT-03 | Per-tab add sub-labels | Single add link at row end | Placement | 1 | S | GREEN | rtl:rotate-180 ✓ |
| EVENT-04 | Toolbar search + rows/calendar toggle | :296-338 ✓ | None | 0 | — | GREEN | |
| EVENT-05 | Category chips pill radius | rounded-md (MEH-764 site-wide) | Superseded | 0 | — | GREEN | |
| EVENT-06 | EntryRow full anatomy | :394-458 parity incl. species accents; WA glyph on rows absent (grep 0) | WA glyph | 1 | S | GREEN | start-0 ✓ |
| EVENT-07 | Near-term bucket "סוף השבוע הקרוב" + feat/compact rows | Absent; uniform rows | Hierarchy missing | 2 | M | YELLOW | Marked "proposed" in frame — approval state uncertain |
| EVENT-08 | Month divider + event count | :366-376 no count | Count missing | 1 | S | GREEN | |
| EVENT-09 | Calendar: species dots + legend, gold today, muted past, rail-row day panel | CalendarView.jsx:130-208 single green dot, primary ring, compact list | 5 elements missing | 2 | M | YELLOW | PARTIAL shipped MEH-1042 (gold today + muted past); dots/legend/day-panel post-launch (needs frame); chevron RTL verify pending |
| EVENT-10 | Desktop 1fr/300 sidebar (up-next + calendar-promo); calendar 1fr/320 sticky day panel | Absent — single column max-w-5xl | Entire desktop architecture | 3 | L | YELLOW | Largest S10 gap |
| EVENT-11 | Empty states: 2 actions (primary + bell notify) | One action | Notify CTA absent both tabs | 1 | M | GREEN | Implies subscription feature |
| EVENT-12 | Loading skeleton mirrors rail | :506-525 ✓ | None | 0 | — | GREEN | |
| EVENT-13 | Floating per-tab add pill above BottomNav | Absent | Thumb-zone affordance | 1 | S | GREEN | Copy exists |

## Surface: Login (S9 Two Doors → `/login`)

Rule: login **logic** = RED; visual/copy = YELLOW.

| ID | Design element | Code state | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| LOGIN-01 | Single centered column ("60% empty") | Split-screen photo+form (MEH-788, documented) | Superseded layout | 1 | — | YELLOW | Form col keeps 416px measure |
| LOGIN-02 | Head: eyebrow + FRL 52px + Cormorant dek | :161-170 headline 32px (MEH-131), dek absent | Dek missing | 1 | S | YELLOW | SUPERSEDED: eyebrow already shipped; 32px deliberate (MEH-131); dek = Cormorant-on-Hebrew LOCK |
| LOGIN-03 | Social-first order Google→Apple→email | :172-198 ✓ | None | 0 | — | RED (reorder = auth flow) | S9+S7 flip gated by MEH-742 |
| LOGIN-04 | Email: adorn + LTR + placeholder | :202-235 ✓ except placeholder | Placeholder missing | 1 | S | YELLOW | |
| LOGIN-05 | Password label-row + forgot + eye | :237-292 ✓ | None | 0 | — | RED | rtl.md exception honored |
| LOGIN-06 | Error: warm Cormorant italic, accent-warm, "never red" LOCK + inline reset link | text-red-500/border-red-400, no icon, no link | Full divergence from explicit lock | 2 | M | YELLOW (styling) / RED (reset-link = auth path) | aria semantics DO match |
| LOGIN-07 | Loading "רגע, נכנסים…" | :306-313 ✓ | None | 0 | — | YELLOW | |
| LOGIN-08 | Second "door" cross-link panel | Understated text link (MEH-788 de-box) | Direction-C signature gesture removed | 2 | M | YELLOW | Worth explicit decision record |
| LOGIN-09 | Submit green pill + arrow | rounded-[10px], no arrow ("NOT green pill" constraint comment) | Shape/arrow | 1 | S | YELLOW | Constraint source not found in repo docs |
| LOGIN-10 | (no frame) valid "✓ תקין" microcopy | :232-233 | NO DESIGN SOURCE | 0 | — | YELLOW | |
| LOGIN-11 | noindex | page.js:28 ✓ | None | 0 | — | GREEN | |

## Surface: Register (S7 → `/register`, `/register/producer`) — ALL ROWS: COLLISION — audit only (MEH-132 + MEH-994 in flight)

| ID | Design element | Code state | Gap | Sev | Notes |
|---|---|---|---|---|---|
| REG-01 | Consumer: name+email+phone, no password | name+email+password+terms (OWASP, MEH-306/328) | Field set diverges | 2 | Code canonical for auth mechanics |
| REG-02 | Social-first step-00 gate | Form-first FROZEN (MEH-132 #3) | The named collision | 2 | MEH-742 gates the flip |
| REG-03 | Business-door tile cross-link | Text links only (MEH-839/909 de-box) | Door absent | 2 | Port must use logical transform |
| REG-04 | "כבר יש לך חשבון?" | ✓ | None | 0 | |
| REG-05 | (no frame) split-screen image pane | MEH-788 addition | NO DESIGN SOURCE | 0 | |
| REG-06 | Producer funnel 7 frames (04 photos, 05 channels) | 5-step enum; photos → disclosure (MEH-914); channels → phone in DETAILS, contact_method hardcoded whatsapp | Steps absent | 3 | S7 05·CTA variant C has no code path |
| REG-07 | Desktop rail ladder + note card + breadcrumb | Horizontal stepper only | Rail architecture missing | 2 | aria-current ✓ |
| REG-08 | Category selector MEH-203 dim-not-hide | ✓ | None | 0 | |
| REG-09 | Conditional license field | MEH-530 ✓ | None material | 0 | MEH-742 gate |
| REG-10 | Story + quote field + rail note | tagline + description + counters ✓; rail-note absent | Minor | 1 | |
| REG-11 | Mobile progress fill + frosted sticky CTA | Plain stepper; scrolling CTAs | Missing | 2 | |
| REG-12 | 06A success gold seal + tier line | Green check + full content parity | Visual simpler | 1 | MEH-742 gate (tier line) |
| REG-13 | 06B verify-email + **resend** | Inbox screens, no resend either flow | Resend missing | 1 | |
| REG-14 | Explicit draft-save button | Auto-draft localStorage (superset) | Functional superset | 1 | |
| REG-15 | (no frame) pre-flight intro screen | MEH-994 in flight | NO DESIGN SOURCE | 0 | |

## Surface: Badges (S12) + ProfileCompletenessCard (S-verify frames)

Completeness authority: **Regen (S-verify)** + **yellow-high (ds)** supersede the first S-verify frame (not audited against). S12 frame LTR-authored — optical paddings port as `ps-`/`pe-`.

| ID | Design element | Code state | Gap | Sev | Effort | Tier | Notes |
|---|---|---|---|---|---|---|---|
| BADGE-01 | Hero chip metrics: 600/15px, glyph 17, gap 7, optical 15/13 padding, gold @7% + solid border | BadgeRow.jsx:127-131 — 12px/500, glyph 14, gap 4, @10% + /40 border | Rendered at map-compact scale | 2 | S | GREEN | |
| BADGE-02 | Bespoke scalloped-seal SVG | Phosphor SealCheck | Substitution OK per ADR-013 | 1 | S | GREEN | |
| BADGE-03 | Card icon-only seal: bare 16px | Wrapped in pill backing (documented legibility fix) | Chrome added | 1 | S | GREEN | |
| BADGE-04 | Tooltip: above+centered+arrow, primary-dark/cream, hover+focus+tap, fade, flip | Popover.jsx — bottom, start-anchored, white, click-only | Placement/skin/input diverge | 2 | M | YELLOW | Shared primitive; Esc/outside-click/tap-guard DO match |
| BADGE-05 | **Declared: NO chip near name ever; structural trust block + badge.declared.body/link keys; explainer S11-only** | DeclaredTierBadge chip beside name w/ full explainer popover; no trust block; keys absent | Wrong pattern, wrong slot, wrong copy | 3 | M | RED | he.json structural. Semantics untouched (MEH-742 gate) |
| BADGE-06 | Hero: full chip alone, 16px from name, top-aligned | gap-2 items-center + TrustBadge + rating + premium + fav pills | Multi-pill strip vs single quiet chip | 2 | M | YELLOW | Which pills survive = MEH-742-adjacent |
| BADGE-07 | Map popup: compact gold chip + tooltip | MobileSheetSelectedCard:81 green pill; MapProducerCard:182 muted seal; no tooltips | Wrong color family ("gold is the only badge color") | 3 | M | YELLOW | Possible MEH-938/943 decision |
| BADGE-08 | Locked copy `producer.badge.*` + {date} LTR-isolated | Verbatim + LRI/PDI ✓ | None | 0 | — | GREEN | |
| BADGE-09 | Only 2 verified tooltip states locked | Code skips registration tooltip ("not locked yet") but he.json HAS the key | Code↔he.json disagree on lock state | 2 | S | YELLOW | Sapir lock-check first |
| BADGE-10 | מאומת/מוצהר only; no emoji; no second accent | TrustBadge 4-tier + he.json tier labels w/ literal emoji (✓✅⭐🏅) on hero | Violates iconography/color locks | 2 | M | YELLOW | Semantics = MEH-742; styling flagged only |
| BADGE-11 | (no frame) CategoryTag | `bg-cream` resolves to NOTHING (no such token) + renders emoji | Dead token + emoji lock | — | S | YELLOW | Fix path: bg-background-alt (GREEN) vs new token (RED) |
| BADGE-12 | (no frame) AvailabilityBadge | Raw hex state colors | Off-token | — | — | YELLOW | ADR-019 ruling |
| BADGE-13 | (no frame) RecipeStatusBadge | Off-brand palette + raw #EAF3DE | — | — | — | YELLOW | Future frame |
| BADGE-14 | (no frame) VerifyBanner | amber band | — | — | — | YELLOW | |
| BADGE-15 | Kashrut pills native title (hover-only, anti-pattern) | KashrutBadgeStrip:41-64 | — | 2 | — | COLLISION (MEH-986) | |
| COMPL-01 | Regen ring: 56/5, exact state colors, rotate -90 | ProfileCompletenessCard.jsx:49-105 identical | None | 0 | — | GREEN | Frames conflict on numeral font; code follows Regen |
| COMPL-02 | yellow-high headline 27px + Cormorant .num percent | text-xl/2xl plain | Missing IF yellow-high is the lock | 1 | S | YELLOW | Frame-vs-frame conflict |
| COMPL-03 | yellow-high card shadow vs Regen none | No shadow (Regen) | Conflict | 1 | S | YELLOW | Also dashboard-skin territory |
| COMPL-04 | yellow-high checklist: 19px checks, in-list next-row (8% bg, circle marker, eyebrow, aria-current) | 14px checks, no markers ("per locked design" — lock not among the 4 frames), external next box, no aria-current | Structure diverges | 2 | M | GREEN | Verify claimed lock before sweeping |
| COMPL-05 | Regen locked state copy (red/yellowLow/green/CTA neutral) | he.json diverges on every non-yellow-high string; mixed gender register | Copy drift | 2 | S | YELLOW | Rule-22 gate; value-level |
| COMPL-06 | yellow-high sub bolds count | No bold, "רק" vs "נשאר" | Minor | 1 | S | GREEN | Copy gate |
| COMPL-07 | Checklist unconditional in yellow>70 | `locale === "he"` gate (MEH-472) | EN never sees checklist | 1 | S | YELLOW | en.json sweep dependency |
| COMPL-08 | 5 checklist rows | 6 (MEH-1002) | Design stale, code supersedes | 0 | — | GREEN | |
| COMPL-09 | CTA geometry + RTL-forward arrow | Identical + ArrowRight rtl:rotate-180 | None | 0 | — | GREEN | |
| COMPL-10 | Card staged max-w 560/600 | Full container width | Dashboard-skin territory | 1 | — | COLLISION — audit only (MEH-964) | |

## Surface: Producer Dashboard (MEH-964) — ALL ROWS: COLLISION — audit only, no sweep (MEH-964)

Design: `design-reference/dashboard/` (frame + app/overview/sections/ui jsx, RTL-authored). Code: `app/[locale]/producer/dashboard/**`. Largest theme: the incomplete↔live state machine — code computes the signals (`page.js:199-205`) but never switches rendering (chunk 1D pending). **Active contradiction for MEH-964:** VanityLinkCard invites sharing pre-approval while design locks sharing behind approval. **Reverse gap:** design marks shipped recipes/group-buys routes "בקרוב".

| ID | Design element | Code state | Gap | Sev | Notes |
|---|---|---|---|---|---|
| DASH-01 | Persistent appbar: avatar+name+city+gear | Tab nav only (layout.js:60-88) | Identity header missing | 2 | Design pins gear as only settings entry |
| DASH-02 | Mobile bottom tab bar / desktop top | Sticky top both viewports; tab set matches | No mobile bottom variant | 1 | |
| DASH-03 | **State-aware overview (incomplete vs live compositions)** | Signals computed, exposed as data-* only; identical render both states | Core concept unwired (1D pending) | 3 | |
| DASH-04 | Dynamic next-step greeting / live KPI subtitle | Static he.json greeting | Missing | 2 | Maps onto existing completeness .missing[0] |
| DASH-05 | Preview row + takeover ("ככה הלקוחות רואות אותך") | Absent (grep 0) | 1-tap trust loop missing | 2 | |
| DASH-06 | CompletenessCard: always-on 6-item checklist + next-highlight + field-specific CTA | Checklist only yellow>70 + he; generic CTA | Partial | 2 | Field parity DONE (6 incl. short_desc) |
| DASH-07 | Placement first under greeting; slims to dismissible pc-slim when live | Mid-page; never slims | Diverges | 2 | Green state collapse = closest analog |
| DASH-08 | PhoneVerify standalone gold card + inline OTP | Only inside pending_whatsapp banner | Coupling differs | 1 | OTP dir=ltr matches rtl.md exception |
| DASH-09 | AvailabilityCard 4 states + pre-approval lock | Enum matches; no locked branch | Lock missing (1D scope) | 2 | |
| DASH-10 | LaunchPath 3-step ladder w/ share locked until approved | Absent; VanityLinkCard shares regardless | Contradiction | 2 | |
| DASH-11 | SpokeGrid hub cards | Absent (tab-bar-only nav) | Secondary launchpad missing | 1 | Design notes tabs canonical |
| DASH-12 | Live KPIs: lead emphasis + section head + shared window chip + footnote | OverviewStatsHero — order ✓, per-card labels; no hierarchy cues/gating | ~70% there | 1 | FLAG-1 honored |
| DASH-13 | Conversion line + funnel icon + tip | Plain text line | Cosmetic | 0 | |
| DASH-14 | ActivityPulse inbox preview (≤3 anonymous rows + WA CTA) | Absent (grep 0) | Second co-lead of live state missing | 3 | Partially NEEDS-BACKEND per prototype |
| DASH-15 | Edit: grouped accordion + status chips; name editor; 120-char bio counter | Flat 6-card stack; NO business-name editor; 150-char bio | Structure + name editor | 2 | Coverage broader than design elsewhere |
| DASH-16 | Insights pre-data blurred sample | Real data always; plain-text empties | Not implemented | 1 | |
| DASH-17 | Insights live: curated 2-KPI + 30d chart + rank-in-city | Relocated deep-analytics verbatim | Layout diverges; NEEDS-BACKEND rows correctly absent | 1 | |
| DASH-18 | Tools: preview navrow + events empty card + "בקרוב" rows | 5 live quick-links | **Reverse gap** — design behind code | 1 | Flag to design owner |
| DASH-19 | Dashboard-scoped settings screen | Global /settings covers it | Missing surface | 1 | Slug/phone LTR islands = rtl.md convention |
| DASH-20 | Quiet WA help line on every screen | Absent (grep 0) | Missing | 1 | Trivially additive |
| DASH-21 | Toast feedback idiom incl. 100% moment | alert() + inline label swaps; repo showToast unused here | Inconsistent | 1 | Adoption, not construction |

## Surface: Join page (MEH-995) — ALL ROWS: COLLISION — audit only, no sweep (MEH-995)

**v3 authoritative** (benefit-led; v2 moat-led superseded — title diff confirms). **No `/join` route exists** (grep 0). ~60% of raw material shipped elsewhere (RegisterPreflight checklist, /about/process, for-businesses FAQ + JSON-LD) — MEH-995 is largely composition + copy-locking + resolving the `/upgrade` premium-visibility conflict with v3's no-premium fold principle.

| ID | Design element | Code state | Gap | Sev | Notes |
|---|---|---|---|---|---|
| JOIN-01 | `/join` conversion hub route | NO CODE | Entire page absent | 4 | Root dir inherits locale RTL |
| JOIN-02 | Benefit-led hero, single CTA, fold ≤700px, zero images | NO CODE; nearest = for-businesses top CTA | Unimplemented | 4 | Title/sub/CTA = DRAFT (rule-22 gate) |
| JOIN-03 | Testimonial SLOT + reassurance card | NO CODE | Absent | 4 | No stat-slop principle ("500+ עסקים" banned) |
| JOIN-04 | 4 numbered steps (Cormorant numerals) + 320px numeral test | NO CODE; content partially in RegisterPreflight | Absent | 4 | ph-arrow-left → ArrowRight+rtl:rotate-180 at build |
| JOIN-05 | Prep checklist + pending-tag (LOCK) | Checklist shipped INSIDE wizard (MEH-994) | Public version absent; duplication Q for MEH-995 | 3 | |
| JOIN-06 | Price only in FAQ; "אין עמלות — לעולם" LOCK; zero premium mentions | NO CODE; /upgrade renders premium cards | Conflict to resolve in MEH-995 | 4 | Verify forever-promise vs business model |
| JOIN-07 | FAQ teaser 3 Qs + crosslink | NO CODE; source content shipped on for-businesses | Reuse existing faq.* keys, don't fork | 4 | |
| JOIN-08 | Final CTA repeat + trust hint | NO CODE | Absent | 4 | One CTA style repeated, never competing |
| JOIN-09 | `join.*` he.json namespace w/ LOCK/DRAFT/SLOT ledger | Absent (grep verified) | i18n scaffolding | 4 | 3 LOCK strings land verbatim; DRAFT needs approval |

---

## Screenshot evidence index (`docs/design-audit/screenshots/`)

Live staging (`staging.mehamakor.online`), captured 2026-07-03 from the CC sandbox (TLS 1.2 cap + Vercel protection-bypass header), desktop 1440×900 + mobile Pixel 5, reduced motion, full-page (except /map).

| Route | Files |
|---|---|
| `/` | `home--desktop.png` · `home--mobile.png` |
| `/map` | `map--desktop.png` · `map--mobile.png` (viewport) |
| `/producers` | `producers--desktop.png` · `producers--mobile.png` |
| producer detail (`/tases-ferments`) | `producer-detail--desktop.png` · `producer-detail--mobile.png` |
| `/about` | `about--desktop.png` · `about--mobile.png` |
| `/login` | `login--desktop.png` · `login--mobile.png` |
| `/register` | `register--desktop.png` · `register--mobile.png` |
| `/events` | `events--desktop.png` · `events--mobile.png` |

No frames were rendered for comparison (per the export READMEs' instruction to read source); screenshots document the live side of every matrix claim.
