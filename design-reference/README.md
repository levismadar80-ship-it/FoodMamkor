# design-reference/ — Claude Design artifacts in-repo (MEH-991)

Canonical design source for the design-code parity program. Imported 2026-07-03
from two Claude Design "Send to local coding agent" exports:
`S2 — Logo System-handoff.zip` + `Mehamakor DS — Components-handoff (1).zip`
(delivered via branch `feature/meh-991-design-export`; under the repo's
squash-merge flow the raw ZIPs never enter staging history — the export branch
holds them until deleted, and Sapir retains the original exports locally).
The old "Mehamakor Design System" project is **excluded** — its stale
pre-export snapshot is quarantined in
[`_archive-2026-06/`](./_archive-2026-06/README.md) and is not audit material.

Gap analysis lives in [`docs/DESIGN-GAP-MATRIX.md`](../docs/DESIGN-GAP-MATRIX.md).
Frames are HTML/CSS/JS **prototypes** — read the source; recreate visual output
with repo idioms (tokens, logical properties), don't copy prototype internals.

## Directory map

| Dir | Source | Contents |
|---|---|---|
| `s2-logo/` | S2 zip `project/` | Page-level frames (Phases 1–6, S5–S14), logo system, nav lab sources. `debug/` iteration screenshots (50 files, 2.2MB) excluded — recoverable from the export branch ZIP / Sapir's originals. |
| `ds-components/` | DS zip `project/` | DS bundle + token css + `components/` — **synced copies of the repo's own React library** (design context, NOT new design work) + component-level frames. |
| `dashboard/` | DS zip | Producer Dashboard redesign (MEH-964) — frame + app/overview/sections/ui jsx. **COLLISION: audit only, MEH-964 owns implementation.** |
| `join/` | DS zip | Join page conversion hub (MEH-995). **Hifi v3 is authoritative; v2 kept for provenance. COLLISION: MEH-995 gated.** |
| `_archive-2026-06/` | PR #1410 scope-bleed | 16 stale pre-export HTMLs. Excluded from matrix. |

## Frame → route/component map

### s2-logo/ (page frames)

| Frame | App route / component | Status note |
|---|---|---|
| `Design System v1.0.html` | tokens: `frontend/tailwind.config.js` + `docs/DESIGN.md` | token authority = tailwind.config.js (MEH-136/710) |
| `Phase 1 · Hero (revised v2).html` | `/` hero — `frontend/components/HomeHero.jsx` | warmth-token items → MEH-537 collision |
| `Phase 2 · ProducerCard v4.html` + `ProducerCard v4 Populated.html` | `frontend/components/ProducerCard.jsx` | |
| `Phase 3 · Category Grid v8.html` | `/` category grid + `frontend/components/CategoryIcons.jsx` | see also ds-components Category Glyphs frames |
| `Phase 4 · Floating Navbar v5 / pill refinement (MEH-732) / v6 Single Voice.html` | `frontend/components/Header.jsx` | superseded chain — v6 latest of Phase 4 |
| `Phase 6 · Nav System - Signature Bottom Pill.html` | `frontend/components/BottomNav.jsx` + Header | authoritative nav frame (latest) |
| `Phase 5 · Homepage Assembly v2.html` + `Sections 06 + 10` (html + 2 spec MDs) | `/` — `frontend/app/[locale]/page.js` sections | |
| `Map Page v2 - Fixed + States (S5).html` + `Honey Map Pin (S5 addendum · MEH-666).html` | `/map` — `MapClient.jsx` (central) | onboarding items → MEH-970 collision |
| `Business Page - Desktop + Mobile + States (S6).html` | producer public page — `frontend/app/[locale]/p/…` + Producer* components | kashrut items → MEH-986 collision |
| `Register Flow - Producer + Consumer (S7).html` | `/register` | **COLLISION — MEH-132 + MEH-994 in flight** |
| `About Page - Direction D (S8).html` | `/about` | |
| `Login Page - Direction C Two Doors (S9).html` | `/login` | auth logic = RED; visual = YELLOW |
| `Events Page - Direction A The Almanac (S10).html` | `/events` | |
| `Process Page - Direction D Criteria in the Open (S11).html` | see matrix (route existence checked there) | |
| `Badge & Tier Component Spec (S12).html` | Badge/Trust components | tier semantics gated by MEH-742 |
| `Photography + Texture (S13/S14).html` | cross-cutting art direction | no single route |
| `ProfileCompletenessCard (S-verify)` ×2 | `frontend/components/ProfileCompletenessCard.jsx` | dashboard placement → MEH-964 |
| `logo-frames.jsx`, `uploads/logo.svg`, `CategoryIcons.jsx`, `navlab*`, `navsystem*` | supporting design sources for the frames above | |
| `_ds/mehamakor-design-system-…/` | styles dependency of the frames (token css snapshot) | NOT audit material on its own |

### ds-components/ (component frames + DS context)

| Frame | App route / component |
|---|---|
| `Category Glyphs*.html` (4 frames — `18 - Preview v2` latest) | `frontend/components/CategoryIcons.jsx` |
| `Imageless Hero - Tinted Masthead.html` | `/` hero variant (exploration) |
| `IA Directions.html` | site IA exploration — no single route |
| `Location Onboarding - 4 Patterns.html` | `/map` onboarding — **COLLISION MEH-970** |
| `ProfileCompletenessCard-yellow-high.html` | `frontend/components/ProfileCompletenessCard.jsx` |
| `components/**` | synced repo library (design context only) |
| `docs/audits/premium-vs-community-2026-06.*` | MEH-537 material — **COLLISION** |
| `uploads/`, `screenshots/`, `_vendor/`, `_preview/` | prototype assets / iteration captures |

### dashboard/ · join/

See directory map above — both are audit-only collisions (MEH-964 / MEH-995).
