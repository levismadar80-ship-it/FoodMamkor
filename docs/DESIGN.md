---
version: alpha
name: Mehamakor
description: >-
  Mehamakor (מהמקור) — an editorial directory of licensed Israeli food
  businesses. The visual identity is warm, restrained, and magazine-like:
  cream over pure white, deep forest green as the single brand accent, and
  Hebrew-first RTL typography. Tokens are the normative source of truth;
  the prose explains why each value exists and how to apply it.
colors:
  primary: "#2e6853"
  primary-dark: "#2E4A2E"
  background: "#F5F0E8"
  surface: "#FFFFFF"
  text: "#1C1A17"
  muted: "#6B6860"
  fg-muted: "#5c584f"
  accent: "#8B6914"
  border: "#E5DFD3"
typography:
  headline-display:
    fontFamily: Frank Ruhl Libre
    fontSize: 48px
    fontWeight: 900
    lineHeight: 1.2
  headline-lg:
    fontFamily: Frank Ruhl Libre
    fontSize: 32px
    fontWeight: 900
    lineHeight: 1.25
  headline-md:
    fontFamily: Frank Ruhl Libre
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.3
  body-lg:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  label-sm:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  "2xl": 32px
  "3xl": 48px
  "4xl": 64px
  gutter: 16px
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: 12px
    typography: "{typography.label-md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-caption:
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
  card-skeleton:
    backgroundColor: "{colors.background}"
    textColor: "{colors.fg-muted}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 12px
  input-divider:
    backgroundColor: "{colors.border}"
  price-tag:
    textColor: "{colors.accent}"
    typography: "{typography.label-md}"
---

# Mehamakor — DESIGN.md

> Canonical design-system source of truth, in the [Google DESIGN.md](https://github.com/google-labs-code/design.md)
> format. The YAML front matter above is normative; this prose explains the
> rationale. Generated Tailwind tokens are exported to
> `frontend/tailwind.tokens.js` (see References). Truth Hierarchy: ADRs win
> over this file — where an ADR and a token disagree, the ADR is correct and
> this file is the drift.

## Overview

Mehamakor is a **magazine, not a marketplace** — an editorial directory of
licensed Israeli food businesses (`בתי עסק`). The UI should feel like a
warm print publication: generous whitespace, calm hierarchy, no SaaS-dashboard
chrome. The emotional target is *trust and craft*, not *transact now*.

The whole system rests on two anchors: a **warm cream page surface**
(`background #F5F0E8`, never pure white) and a **single deep-forest-green
accent** (`primary #2e6853`). Everything else is restraint — one accent color,
two type families, a small spacing scale. The restraint is itself the brand
signal: a curated, edited feel rather than a feature-dense product.

Hebrew is the primary script and the layout is **RTL-first**. Latin text is the
exception (quotes, loan words), not the baseline.

## Colors

The palette is deliberately small. One brand green, one warm gold accent, a
cream background, and a tight set of neutrals. There is **no state-color
palette** (no red/amber/slate) — see *Elevation & Depth* for how state is
expressed instead, and *Do's and Don'ts* for why.

- **Primary (`#2e6853`):** Deep forest green. The single brand accent —
  primary CTAs, the logo, links, "available today" affordances. Also serves
  the `success` role; we do not maintain a separate success green.
- **Primary-dark (`#2E4A2E`):** Hover/active state for primary, hero overlays,
  footer ground. Darker, never brighter — the brand greens go deeper on
  interaction, they don't light up.
- **Background (`#F5F0E8`):** Warm cream. The universal page surface. **Never
  pure white as a page background** — pure white reads as "app", cream reads as
  "magazine". This is a hard brand LOCK (BRAND.md §3).
- **Surface (`#FFFFFF`):** Pure white, allowed **only** for content that sits
  on top of the cream page — cards, modals, inputs. Never the page itself.
- **Text (`#1C1A17`):** Warm near-black for body copy and headings. Not
  `#000000` — a warm ink, consistent with the cream warmth.
- **Muted (`#6B6860`):** Warm gray for secondary text, captions, helper copy
  and placeholders. Passes WCAG AA (≥ 4.5:1) on the cream background.
- **Fg-muted (`#5c584f`):** The single de-emphasis foreground (the `--fg-muted`
  of ADR-019). Used for state de-emphasis (disabled, loading, vacation) instead
  of introducing new state colors. Slightly deeper than `muted` for stronger
  recede without a color shift.
- **Accent (`#8B6914`):** Warm gold. Used **sparingly** — prices, "premium"
  highlights, pull-quotes. A second voice, never a second brand color.
- **Border (`#E5DFD3`):** Warm hairline for card borders and dividers on cream.
  Low-contrast by design; structure should be felt, not drawn.

## Typography

Two families carry the whole system. **Frank Ruhl Libre** — a Hebrew serif —
for headlines, set at weight **900** for editorial gravitas (the canonical
headline weight per CONTEXT.md §5 and BRAND.md §3). **DM Sans** for all body,
labels, navigation and buttons. No more than three visible weights on one
screen.

- **Headlines (`headline-display`, `headline-lg`):** Frank Ruhl Libre 900.
  Large and confident — this is the magazine voice. Line-height stays tight
  (1.2–1.25) so multi-line Hebrew headlines hold together.
- **Sub-headings (`headline-md`):** Frank Ruhl Libre 700 for section titles
  where 900 would shout.
- **Body (`body-lg` / `body-md` / `body-sm`):** DM Sans 400, line-height
  1.5–1.6 for comfortable long-form Hebrew reading. `body-md` is 16px desktop;
  drop to 14px on mobile.
- **Labels (`label-md` / `label-sm`):** DM Sans 500–600 for buttons, chips and
  metadata.

Fallbacks (not tokenized): **Heebo** covers the long tail of Hebrew glyphs and
legacy `font-heebo` components; **Cormorant Garamond** is reserved for Latin
pull-quotes only. Hebrew punctuation must be correct (`״`, `׳`, em-dash `—`).

## Layout

An **8px base spacing scale** governs all rhythm. Allowed steps: 4, 8, 12, 16,
24, 32, 48, 64 — no arbitrary values. Mobile grid gutter is 16px. Card padding
is 16px on mobile, 24px on desktop. Desktop content sits in a fixed max-width
column; mobile is fluid. Whitespace is a feature, not waste — the editorial
feel comes from letting content breathe.

Because the layout is RTL-first, always use **logical** spacing properties
(`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`), never physical `ml-`/`mr-`. See
`.claude/rules/rtl.md` for the full rule and its narrow exceptions.

## Elevation & Depth

Mehamakor is a **flat, tonal** system. Depth comes from the cream-vs-white
tonal step and hairline borders — **not** from shadows. There is **no shadow
lift on hover** (that is a SaaS pattern, off-brand). Cards are white surfaces on
cream with a `border #E5DFD3` hairline; that tonal contrast is the entire
elevation language.

### State management — opacity-on-cream + fg-muted (ADR-019)

This is the load-bearing rule for all component states, and it is why the
palette has no state colors. Per **ADR-019 (`docs/decisions/ADR-019-component-state-tokens.md`, decision §:24)**,
component state treatments use exactly two mechanisms:

1. **De-emphasized foreground** → switch text from `text` to `fg-muted`
   (`#5c584f`). This is the warm muted gray already in the system; it preserves
   editorial warmth without a color shift.
2. **De-emphasized surface** → reduce the opacity of foreground content on the
   existing cream background. Opacity scale: 100% / 70% / 50% / 30%. Never
   introduce a darker or lighter background token for a state.

Concrete applications:

- **Loading skeleton:** cream background, content at 30% opacity on cream. No
  `loading-bg-*` token.
- **Vacation / unavailable:** background stays cream; text = `fg-muted`. The
  vacation banner is **not** amber and **not** slate — it recedes via
  `fg-muted`, it does not recolor.
- **Disabled button:** cream (or primary at 50% opacity if it was a primary
  button); text = `fg-muted`. No `disabled-bg-*` token.
- **Empty state:** content at 50% opacity on cream.

## Shapes

Corners are softly rounded, never pill-shaped on rectangles. Inputs and
buttons use `rounded.sm` (8px); cards use `rounded.lg` (16px) — `rounded.md`
(12px) is the in-between for smaller cards and chips; modals use `rounded.xl`
(20px). **No `rounded-full` on rectangular elements** (BRAND.md §3) — full
rounding is reserved for genuinely circular elements (avatars, icon buttons).

## Components

Components are composed from the tokens above; see the `components` block in the
front matter for the normative token bindings.

- **Buttons:** `button-primary` is forest green (`primary`) with white
  (`surface`) text, 8px radius, `label-md` type. Hover goes **darker**
  (`primary-dark`), never lighter and never with a shadow.
- **Cards (ProducerCard et al.):** white `surface` on cream, `border` hairline,
  16px radius, 24px desktop padding. Captions and metadata use the `muted`
  foreground (`card-caption`). Loading uses `card-skeleton` (cream + `fg-muted`,
  opacity-on-cream) — never a gray placeholder block.
- **Inputs:** white `surface`, `text` foreground, `border` hairline, 8px
  radius. Dividers use the `border` token.
- **Price tags / premium accents:** `accent` gold, used sparingly with
  `label-md`. The save/like ("heart") affordance is **green or gold, never a red
  fill** (BRAND.md §3; the brand has no red token — see Do's and Don'ts).

## Do's and Don'ts

- **Do** keep pure white (`surface`) only on top of the cream page — cards,
  modals, inputs. **Don't** use `#FFFFFF` as a page background.
- **Do** use `primary` as the single brand accent and `accent` gold only for
  prices/premium. **Don't** introduce a second brand color.
- **Do** express state with opacity-on-cream + `fg-muted`. **Don't** add
  state-color tokens.
- **Do** maintain WCAG 2.1 AA contrast — ≥ 4.5:1 body, ≥ 3:1 large text.
  Keyboard-navigable, screen-reader-labelled (IS 5568). **Don't** ship `muted`
  or `fg-muted` text on white where it drops below 4.5:1.
- **Do** use Tailwind tokens (`text-primary`, not `text-[#2e6853]`). **Don't**
  hard-code hex values in JSX.
- **Don't** add gradient orbs, blurred/glass backgrounds, or hover shadow lift —
  all signal "app", the opposite of "magazine" (BRAND.md §3).

### Why we don't have a state-color palette

The deliberate **absence** of `error`, `warning`, and `vacation-slate` tokens is
a decision, not an oversight. Two earlier proposals — a `--slate` token
(`#64748B`, Tailwind slate-500) and per-state background tokens
(`loading-bg-brown`, `vacation-bg-grey`) — were **permanently rejected** by
**ADR-019 (§:40–48)**:

- `--slate` / `#64748B` signals "SaaS dashboard" (Tailwind's default neutral) —
  the exact opposite of Mehamakor's editorial positioning.
- A "neutral palette" tier in DESIGN.md is the camel's nose: once one
  state-shade exists, every component proposes another.
- Fine-grained color-coded state (error vs warning vs info) is a
  category-mismatched need for a magazine.

If a future state genuinely cannot be served by opacity-on-cream + `fg-muted`
(e.g. a destructive-action confirmation), the resolution is a **new ADR that
supersedes ADR-019** — not a token quietly added to `tailwind.config.js`. The
friction is the feature. This rule is already enforced in code: F1 / PR #831
implemented the HeartButton with `text-primary`, not a red token.

## References

- **Tokens → Tailwind:** generated by `@google/design.md export` to
  `frontend/tailwind.tokens.js`. `frontend/tailwind.config.js` is reconciled to
  import it in a separate change (Consolidation Plan Step 18) — until then the
  config may carry extra dev-exploration tokens that this file intentionally
  omits.
- **Brand domain SoT:** `docs/BRAND.md` (positioning, voice, LOCKs, inspiration).
  Editorial inspiration direction lives there (Kinfolk / Natoora / The
  Infatuation / Cherry Bombe). The earlier `gardensweet` / `foraged` references
  are **retired** (Consolidation Plan §B.9 I1).
- **Voice / micro-copy:** `docs/BRAND.md` §4–7 and ADR-014 (audience-targeted
  CTAs, "מגזין" internal-only, brand-name UI vs outbound). Not duplicated here.
- **Color audit baseline:** `.claude/commands/design-review/design-principles.md`
  (design-review checklist; treated as a cross-check, not canonical).
- **Decisions:** ADR-011 (tagline), ADR-013 (iconography — Phosphor only, Lucide
  forbidden), ADR-014 (voice), ADR-019 (component state tokens).
- **Endpoints / data shapes:** `docs/DATA.md` (not a design concern).
- **RTL rules:** `.claude/rules/rtl.md`. **Accessibility law:** IS 5568.
