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
  background-alt: "#EDE4D2"
  surface: "#FFFFFF"
  text: "#1C1A17"
  muted: "#6B6860"
  fg-muted: "#5c584f"
  accent: "#896714"
  gold-deep: "#7A5A10"
  honey: "#C8821E"
  gold-on-dark: "#E7C88A"
  border: "#E5DFD3"
  green-50: "#EAF3DE"
  green-100: "#C8DCB3"
  green-300: "#6FA284"
  green-500: "#2E6853"
  green-700: "#2E4A2E"
  green-900: "#143228"
  surface-card: "#FFFEFB"
  surface-floating: "#FFFEFB"
  action-primary: "#2E6853"
  action-primary-hover: "#2E4A2E"
  state-selected: "#2E4A2E"
  error: "#B3261E"
  error-on-dark: "#FCA5A5"
typography:
  headline-display:
    fontFamily: '"Frank Ruhl Libre", "David Libre", Georgia, serif'
    fontSize: 48px
    fontWeight: 900
    lineHeight: 1.2
  headline-lg:
    fontFamily: '"Frank Ruhl Libre", "David Libre", Georgia, serif'
    fontSize: 32px
    fontWeight: 900
    lineHeight: 1.25
  headline-md:
    fontFamily: '"Frank Ruhl Libre", "David Libre", Georgia, serif'
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.3
  body-lg:
    fontFamily: '"DM Sans", "Heebo", sans-serif'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: '"DM Sans", "Heebo", sans-serif'
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: '"DM Sans", "Heebo", sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: '"DM Sans", "Heebo", sans-serif'
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  label-sm:
    fontFamily: '"DM Sans", "Heebo", sans-serif'
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
  "5xl": 96px
  "6xl": 128px
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
> `frontend/tailwind.tokens.json` (see References). Truth Hierarchy: ADRs win
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

The palette is deliberately small: **one brand green** — expressed as a
systematic 6-stop tint scale (`green-50`…`green-900`) for badges, hovers and
depth, **not** as multiple brand colors — plus one warm gold accent, a cream
background, and a tight set of neutrals. There is **no state-color palette**
(no red/amber/slate) — see *Elevation & Depth* for how state is expressed
instead, and *Do's and Don'ts* for why.

- **Primary (`#2e6853`):** Deep forest green. The single brand accent —
  primary CTAs, the logo, links, "available today" affordances. Also serves
  the `success` role; we do not maintain a separate success green.
- **Primary-dark (`#2E4A2E`):** Hover/active state for primary, hero overlays,
  footer ground. Darker, never brighter — the brand greens go deeper on
  interaction, they don't light up.
- **Background (`#F5F0E8`):** Warm cream. The universal page surface. **Never
  pure white as a page background** — pure white reads as "app", cream reads as
  "magazine". This is a hard brand LOCK (BRAND.md §3).
- **Background-alt (`#EDE4D2`):** A subtle warm step down from `background`, for
  **editorial tonal separation** — alternating adjacent section blocks by tone
  instead of by horizontal rules (e.g. the `/about` Benefits + Values pair, MEH-135).
  This is a *layout/surface* token, **not** a per-state background — the ADR-019
  prohibition on darker/lighter background tokens applies to component *states*
  (selected/loading/vacation), which still use opacity on cream. Both tones keep
  AA: `text`/`fg-muted` pass ≥ 4.5:1 on `background-alt` as well as `background`.
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
- **Accent (`#896714`):** Warm gold (darkened from `#8B6914` for WCAG AA
  small-text on cream — MEH-917). Used **sparingly** — prices, "premium"
  highlights, pull-quotes. A second voice, never a second brand color.
- **Gold-on-dark (`#E7C88A`):** The gold voice for **dark green surfaces only**
  (`green-900` sheets/footers), where `accent` fails contrast (≈1.6:1 on
  `green-900`'s family). Same role as `accent`, lighter expression — numerals,
  small glyph accents on dark panels (MEH-730; first consumer: the account
  sheet). Never use it on cream/white — there it's the drift, `accent` is the
  token.
- **Border (`#E5DFD3`):** Warm hairline for card borders and dividers on cream.
  Low-contrast by design; structure should be felt, not drawn.
- **Green scale (`green-50` … `green-900`):** A 6-stop tint scale of the one
  brand green for systematic reference — `green-50 #EAF3DE` (badge / light
  surfaces; the legacy `light`), `green-100 #C8DCB3`, `green-300 #6FA284`
  (subtle highlight), `green-500 #2E6853` (= `primary`, brand identity),
  `green-700 #2E4A2E` (= `primary-dark`, the CTA hover/active target),
  `green-900 #143228` (deep emphasis, footer ground). This is a shading system,
  **not** a second brand color — the hover rule above still holds: brand greens
  go **deeper** on interaction (`primary` → `primary-dark` / `green-700`), never
  lighter.

### Raw palette shades are not tokens

Tailwind's stock palettes (`red-*`, `gray-*`, `amber-*`, …) are **not** tokens.
Use the semantic name: `text-error`, `bg-surface`, `border-border`,
`text-fg-muted`, `text-muted`. `green-*` is the one exception — it **is** a token
(the 6-stop scale above) and is exempt. An ESLint selector warns on the rest
(MEH-1629, `warn`: the ~170 historical hits are debt, not a build failure). If a
raw shade is genuinely required, mark it `// token-ok` + `eslint-disable-next-line`.

### Address/city fields must use the canonical component

A hand-rolled `<input>` for an address or city, instead of `<AddressSearch>` /
`<CitySearch>`, has shipped two production bugs: a hand-typed city silently fell
outside the map's city filter (MEH-1455), and a hand-typed address saved with no
lat/lng — the pin never appeared (MEH-1766). Same mechanism as the palette rule
above (MEH-1767, `no-restricted-syntax`, `warn`): a raw `input`/`textarea` whose
literal `id`/`name`/`placeholder`/`aria-label` names "city"/"address"/"עיר"/
"כתובת" is flagged; `<CitySearch id="…">` / `<AddressSearch id="…">` never match
(component tag names aren't lowercase). Doesn't see through an i18n key
(`placeholder={t("city")}`) — same gap `no-literal-string` already has. Legitimate
exception (e.g. an admin raw-coordinates override)? Mark it `// address-field-ok`
+ `eslint-disable-next-line`.

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

**Hebrew fallback policy (body & label families).** DM Sans covers Latin only
(no Hebrew Unicode block, U+0590–05FF), so every `body-*` and `label-*` token
ships the stack `"DM Sans", "Heebo", sans-serif` — DM Sans renders Latin, **Heebo
catches Hebrew glyphs**, generic `sans-serif` is the last resort. Heebo here is a
**tokenized** fallback layer, not optional (restored in MEH-712 after the
DESIGN.md token transform briefly dropped it). The document root
(`globals.css` `body`) carries the same stack as a safety net.

**Cormorant Garamond** is reserved for Latin pull-quotes only (not tokenized).
Hebrew punctuation must be correct (`״`, `׳`, em-dash `—`).

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
  - **Hover (shipped spec — LOCKED):** name → `text-primary` · border →
    `border-primary` · image scale 1.02. **NO gold underline** — the
    `after:bg-accent` underline is a **nav-only** active indicator, deliberately
    not on the card (Sapir, v4). The v4 mock showed it on name-hover; it was
    intentionally not shipped. A future re-port must not reintroduce it.
- **Inputs:** white `surface`, `text` foreground, `border` hairline, 8px
  radius. Dividers use the `border` token.
- **Price tags / premium accents:** `accent` gold, used sparingly with
  `label-md`. The save/like ("heart") affordance is **green or gold, never a red
  fill** (BRAND.md §3; the brand has no red token — see Do's and Don'ts).
- **Map near-me pill (`NearMePill`, MEH-970):** quiet floating pill on mobile
  `/map` — `Crosshair` glyph (`primary`) + "קרוב אליי" label, `surface` on a
  pill (rounded-full) with hairline `border` + `shadow-md`. It is the **single**
  mobile near-me control (the old icon-only crosshair was removed). Sits at the
  `z-[1000]` map-controls tier, below the cookie banner (`z-[1100]`) and chat FAB
  (`z-[9999]`); positioned `bottom-[16vh]` to clear the `PEEK=14vh` bottom sheet.
  RTL logical props only (`start-4`).
- **Producer hero gallery (`ImageGallery`, MEH-1047 — imaged state):** editorial
  grid adaptation of the Airbnb listing pattern. **Desktop (md+):** hero cell at
  **inline-start** (~62%) + a tall stacked secondary column, `gap-2` (8px),
  `rounded-xl` (12px), `border-accent/30` gold hairline, `max-h ~460px`. Densities:
  **4+** = hero + `images[1]`/`images[2]` with a single **"כל התמונות (N)"** gold
  (`accent`) pill on the bottom stacked cell (N = total, `Images` Phosphor glyph);
  **3** = same grid; **2** = hero + one tall companion (no pill); **1** = the
  full-width banner (unchanged). **Mobile (375px):** single swipeable image +
  counter chip (1/N, `.numeric`-isolated, top-end) + a thin **gold progress bar**
  (`accent` fill, replaces dots); tap opens the lightbox. **FavoriteButton** stays
  pinned **top-start** (`start-3`) as a single shared overlay across both layouts.
  First image is eager (`priority`); the rest are lazy. Imageless state = the
  Tinted Masthead (MEH-815, unchanged). RTL logical props only.
- **Producer detail — Quiet Direction v3 (MEH-1334, PR #1936 — ADOPTED; supersedes
  the stale sub-details in the surrounding pre-1334 blocks where they conflict):**
  the `/producer/[id]` editorial refresh. **Header = 4 groups:** [name + single
  ✓מאומתת seal] · [one-liner] · [rating ★ gold + underlined count, or **"חדש"**
  at zero reviews — a rating-slot fallback, not a badge] · [meta line
  city · category · **status** + one quiet kosher line]. The page's ONLY order
  status is colored text in the meta line — open=`primary`,
  "לא מקבל הזמנות כרגע"=`muted`, "בחופשה · חוזרים ב־{תאריך}"=**`gold-deep`
  #7a5a10** (5.61:1 on cream, AA; the vacation banner was removed — the status
  owns the return date, "one home per fact"). Dropped from the header: premium
  chip, favorites count, TrustBadge, secondary-category chips,
  grass_fed/delivery chips, contact_name line (→ OwnerCard). **Quiet actions**
  שמירה·מעקב·שיתוף(lg+) beside the title (borderless icon+label, ≥44px);
  guests see them and get the login prompt; the intended action auto-completes
  after sign-in with scroll restore (`lib/pending-action.js`). **Mobile hero
  overlay = share** (`lg:hidden`; the heart's one home is the actions row);
  desktop hero clean. **Verified popover** (hero seal): locked dateless copy +
  link to `/about#verification`; mobile = bottom sheet with focus trap
  (`ui/Popover` `sheetOnMobile`). **Contact card:** one CTA + quick answers
  (3 visible + "עוד שאלות", MEH-1302 behavior intact) + circular hairline icon
  row; desktop phone tap reveals the number inline (dir=ltr pill, no dialing).
  **Location = one "הגעה ומיקום" section:** city-only address (MEH-829),
  collapsed neutral hours "היום · 9:00–17:00" (no green, no "פתוח", ranges
  `dir="ltr"`, expand → weekly table with font-weight-only today), Waze/Google
  **brand SVGs** (not mirrored, not recolored) on the standard deep links.
  **OwnerCard "מאחורי העסק":** data-gated — compact (single-letter avatar at
  inline-start + name + city) is the live variant; bio/photo variants dormant
  until MEH-1335; hidden entirely without contact_name.
- **Producer trust strip (`ProducerHeader` + `ReviewExcerpt`, MEH-1048):** social
  proof beside the h1. A `green-50`/`accent` pill **`★ 4.8 · N ביקורות`** (Phosphor
  `Star`) links to the reviews section (`<a href="#reviews">` → `id="reviews"
  scroll-mt-24`); the rating decimal is `dir="ltr"` + `.numeric` (RTL flip guard).
  Below the tagline, one **review excerpt** (`Quotes` glyph in `accent`, italic
  `fg-muted`, `line-clamp-2`, ≤120 chars + `…`) — the most-recent review with text,
  also linking to `#reviews`. **Zero reviews → the whole strip is absent** (no
  "0 ביקורות"); a producer with only rating-only reviews shows the pill but no
  excerpt. Numerals stay Latin + bidi-isolated. RTL logical props only.
- **Producer section tab bar (`ProducerDetail`, MEH-1168 P2 — ADOPTED):** the
  **mobile-only** (`md:hidden`) section nav on `/producer/[id]` — a sticky row of
  four tabs (about · products · delivery · reviews) with Phosphor icons
  (`Info`/`Package`/`Truck`/`ChatCircleText`, fill weight when active); the active
  tab is marked by `border-b-2 border-primary text-primary`. It sticks at
  `top-[82px]`, **below** the global header (82px, `z-[1050]`) so it stays visible
  page-long — at `top-0` it was occluded behind the header once scrolled into a
  deep section. Tapping a tab smooth-scrolls the section clear of both the header
  and the bar (`useTabScroll`). RTL logical props only.

## Action hierarchy

**Exactly one primary-styled action per viewport; new page actions enter as
tertiary by default and may be promoted only by explicit design decision.**

A "primary-styled action" is the filled/green CTA (`button-primary`,
`btn-whatsapp`) — the dominant call to action. On any screen, at any scroll
position, only one may be visible at a time; competing primaries flatten the
hierarchy and read as clutter. When a page grows a new action (an order button
in a section, a share affordance, a nav-out link), it enters as a **tertiary**
treatment (neutral outline / quiet link) unless a specific design decision
promotes it. Established on the producer detail page (MEH-1146): the single
primary is the contact card's CTA; the sticky bar mirrors it (never co-visible);
the delivery section's WhatsApp order button is tertiary; follow + share are
tertiary. Verified per-viewport, not just per-section.

### Chrome budget — at most one top + one bottom sticky layer (MEH-1202)

On any mobile viewport, at most **one** sticky top layer and **one** fixed
bottom layer may be visible at once. Stacked chrome eats the reading area and
reads as a rendering bug (the ghost-strip class). Rules:

- **Top:** the global `Header` pill is the top layer. A page-level sticky
  element (e.g. the `/producer` section tab bar) attaches directly *below* it
  and the two read as one unit — never a second free-floating top bar.
- **Bottom:** `StickyContactBar` and `BottomNav` must not co-stack. On
  `/producer/[id]` mobile the contact bar is the sole bottom layer and
  `BottomNav` is gated off by route (`isProducerDetail`, `lib/producer-route.js`).
- **Never hardcode a stacked-chrome offset in px/vh.** A sticky layer that sits
  below another measures the layer above at runtime. `Header` publishes its
  live height as the `--chrome-top` CSS var (ResizeObserver); downstream sticky
  chrome offsets off `var(--chrome-top, …)`, never a frozen `top-[82px]`.

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

**One documented exception (ADR-026):** `error` (`#B3261E`, AA on cream) + its
on-dark pair `error-on-dark` (`#FCA5A5`, for `green-900` surfaces) are the sole
state-color tokens, added for form/validation error text that failed AA as raw
Tailwind reds. This is the "new ADR supersedes ADR-019" path in action — error
only; `warning`/`info`/`success` remain un-tokenized (success = `primary`).

## S4 design tokens (MEH-136)

The S4 homepage assembly (MEH-639) consumes a small set of **additive** tokens.
Authoring is split by what the `@google/design.md` exporter can carry — it emits
only 6-digit-hex colors, spacing, and type; it silently drops `cubic-bezier`,
`ms` durations, `rgba`, and `transparent`.

**In the token pipeline (front matter → `tailwind.tokens.json`):**

- `surface-card` / `surface-floating` (`#FFFEFB`) — a faint warm-white one tonal
  step above pure `surface` (`#FFFFFF`), for cards and floating elements. Fits
  the flat, shadowless elevation language above.
- Semantic action aliases: `action-primary` (= `primary` `#2e6853`) and
  `action-primary-hover` (= `primary-dark` `#2E4A2E`). **No new green** — the
  hover **reuses the existing palette dark per ADR-019**. The S4 exploration's
  `#1F4C3C` was rejected to avoid a third green; `green-700` (`#2E4A2E`) is
  unchanged. This keeps the documented "hover goes darker (`primary-dark`)"
  rule intact while giving S4 a role-named alias to bind to.
- Semantic selected-state alias: `state-selected` (= `primary-dark` `#2E4A2E`).
  The single "selected/active" affordance across the design system — map markers
  (selected pin border, MEH-763) and filter chips (active chip). **No new green**
  — selection reuses the existing palette dark per ADR-019, same precedent as
  `action-primary-hover`. Components bind to this role name so a future tweak to
  the selected colour is one token edit, not a grep across `/map`.

  > **🔓 LOCK-deviation — MEH-1181-A (Sapir 22/07): the MEH-764 `state-selected`
  > solid-fill is amended for CATEGORY chips only.** "Direction A" — a selected
  > category chip carries its category's colour as a *ring + faint wash*, not a
  > solid fill, so the chip↔pin colour link (MEH-1452 glyph tint) stays legible
  > when the chip is active. Precise selected-state per surface:
  >
  > - **CATEGORY chips** (all `ChipScrollRow variant="category"` surfaces —
  >   `/map`, `/producers`, `/events`, and future — MEH-1465), selected:
  >   A chip with no registry colour (`chip.iconColor` absent, e.g. `/events` or
  >   an admin category with no `CATEGORY_STYLES` row) falls back to
  >   `--cat-ring` = the DEFAULT category green (`primary` `#2e6853`).
  >   - `background: color-mix(in srgb, var(--cat-ring) 12%, #fff);`
  >   - `border: 1.5px solid var(--cat-ring);`
  >   - `color: var(--text)` (`#1a1a1a`) — **never** the category colour as text
  >     (keeps the label at ≥4.5:1; the ring/glyph carry the colour, the label
  >     stays neutral).
  >   - `font-weight: 600;`
  >   - `--cat-ring:` the category's registry tint = `textColor ?? color`
  >     (`lib/category-registry.js` `CATEGORY_STYLES`). Every value clears WCAG
  >     1.4.11 ≥3:1 on **both** white and cream `#F5F0E8` (MEH-1181 audit).
  > - **ATTRIBUTE / toggle chips, `FilterSheet`, `CategoryTag`, and every OTHER
  >   chip surface:** UNCHANGED — solid `state-selected`/primary fill, white
  >   text. The deviation is scoped to category chips; nothing else moves.
  > - **"כל" reset chip:** when nothing is selected (baseline) it is the solid
  >   primary fill (the current active-"all" look); when ≥1 category is selected
  >   it drops to a **ghost** — `background: #fff`, `border: 1px solid
  >   var(--line)`, `color: var(--muted)` — so the coloured selection reads as
  >   the active state and "כל" reads as the escape.
  > - **Tag-strip rule:** removable tags represent **attributes only**. A
  >   category *selection* is shown by its chip ring, never mirrored as a
  >   removable tag; the category's exit affordance is the "כל" chip.
  >   `clearAll()` / "נקו הכל" clears **both** categories and attributes.
  >
  > Scope note: this is the DESIGN SoT delta only. The component wiring (radio →
  > multi-select ring rendering) lands with the MEH-1465 multi-select chunks; a
  > single-select ring is the interim shape until then.
- Spacing `5xl` (96px) / `6xl` (128px) — editorial section rhythm above `4xl`.
- Headline fallback: every Frank Ruhl Libre stack
  (`headline-display`/`-lg`/`-md`) degrades to `"David Libre", Georgia, serif`.

**In the CSS utility layer (`frontend/app/globals.css`):**

The exporter cannot represent these, so they live as utility classes — a
utility layer, **not** a parallel `:root` token authority (MEH-686 removed
`:root` vars):

- Motion: `.duration-fast|base|slow` (180/420/640ms) + `.ease-quart`
  (`cubic-bezier(.25,1,.5,1)` — the same curve already used by `.scroll-hint`).
- `.focus-ring` — a 2px `rgba(46,104,83,0.40)` ring that tokenizes the existing
  inline `ring-primary/40` idiom.
- `.action-ghost` / `.action-ghost-on-dark` — transparent button whose
  border/text come from `text` (or `background` on dark surfaces).

No component is restyled in MEH-136; consumption is MEH-639 / MEH-602.

## Interactive sizing minimums

Interactive elements — anything a user reads to act on or taps — carry two
floors, one for legibility and one for reach. Brand-doc precedes code: this
section is the authority; a component that drifts below a floor is a bug, not
a style choice.

**Type floor (legibility).** Interactive text is **≥ 14px**; the **default is
16px** for primary interactive text — nav links and `md`/`lg` buttons. 14px is
the absolute minimum for secondary/compact controls (`sm` buttons, dense
metadata actions); nothing interactive renders below it. Sub-14px type is
reserved for the documented non-interactive or exception cases below.

**Tap-target floor (reach).** Every tappable control has a hit area of
**≥ 44 × 44px** (WCAG 2.5.5 Target Size (Enhanced); Apple HIG 44pt). When the
visible control is smaller than 44px, the target is enlarged with
`min-h-[44px] min-w-[44px]` plus `flex items-center justify-center` so the
glyph stays centered inside the padded hit area — the `HeroSearch` submit
button and `BadgeRow` (MEH-813) outer-button hit-area are the canonical
patterns.

**Documented exceptions.** These are deliberate and stay below a floor for a
recorded reason — do not "fix" them:

- **BottomNav labels — 10.5px.** iOS tab-bar convention; the label is a caption
  under an icon, and the *tab itself* is ≥ 44px, so the reach floor is met even
  though the caption text is below the type floor.
- **`.leaflet-control-attribution` — 10px.** Third-party map attribution locked
  at 10px per MEH-919; it is legally-required fine print, not a primary control.
- **Inline body-text links.** Links that flow inside a paragraph inherit the
  body text size and are exempt from the standalone tap-target floor
  (WCAG 2.5.8 Target Size (Minimum) inline exception) — enlarging them would
  break the line box.

## Required-field marking (MEH-2015)

**The rule: an asterisk is an enforced gate, always.** A field showing `*`
must block submission on both sides (client `validate*Form` + Pydantic
required). A genuinely optional field never shows an asterisk — it carries
`common.optional_suffix` (`(אופציונלי)`) when naming its optionality helps.
No third state exists; a marker that does not gate is the bug this section
exists to prevent (precedents: MEH-951's visual-only city marker, and the
three unenforced starred fields MEH-2013/2015 closed).

**The mechanism: the JSX `required` prop, never the i18n string.** `ui/Input`
(and the local `Field` primitives in EventForm/ExperienceForm, plus
`CitySearch`) render the marker from `required` and set `aria-required` on
the control. The asterisk is **never baked into a label value** in
`he.json`/`en.json` — two mechanisms firing together is what put
`קטגוריה * *` on screen, and it happened AGAIN mid-review when a consumer
kept its literal span beside the new `required` prop (RecipeForm). The
label prop therefore never contains a literal `*`. Marker colour:
**`text-error`** — the semantic token, per the token linter; MEH-2015
converged the previous `text-red-500`/`text-red-700` mix onto it. The
marker span is `aria-hidden` — screen readers hear "required" once via
the native `required`/`aria-required`, not "star". Guard:
`frontend/__tests__/RequiredMarkerParity.test.jsx`, including a source
scan for literal asterisks inside `label={...}` props.

Placeholders are exempt (a string attribute has no JSX layer); a placeholder
showing `*` documents the expectation without being a label mechanism.

**One transitional exception, named so this section does not overclaim:** the
producer-register city marker is still visual-only (MEH-951) pending the
MEH-2015 chunk-B verdict — the field shows the marker and gates nothing. It
is the last surviving instance of the bug this rule bans, kept deliberately
until the enforcement decision, and its audit-table row says so.

## References

- **Tokens → Tailwind:** generated by `@google/design.md export` to
  `frontend/tailwind.tokens.json`. `frontend/tailwind.config.js` is reconciled to
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
- **External benchmarks:** `docs/design/BENCHMARKS.md` (5-site precedent + rationale;
  reference only — this file wins on any conflict).
- **Decisions:** ADR-011 (tagline), ADR-013 (iconography — Phosphor only, Lucide
  forbidden), ADR-014 (voice), ADR-019 (component state tokens).
- **Endpoints / data shapes:** `docs/DATA.md` (not a design concern).
- **RTL rules:** `.claude/rules/rtl.md`. **Accessibility law:** IS 5568.
