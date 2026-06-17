# מהמקור — Design Principles & Review Checklist

> Project: **מהמקור (MEHAMAKOR)** — Israeli directory of local food producers.
> Language: **Hebrew**, direction: **RTL**, voice: **feminine** (-י verbs).
> Target: **mobile-first** (users are on phones in markets/kitchens).

This checklist is the single source of truth for `/design-review`. It replaces the
generic SaaS checklist shipped with the workflow.

## I. Core Design Philosophy

- [ ] **Users first.** Every decision serves a home cook, hungry shopper, or small producer — not a PM dashboard user.
- [ ] **Warm, editorial feel.** Think cookbook or farmers-market newsletter, not SaaS admin panel.
- [ ] **Meticulous craft.** Spacing, alignment, and typography are tight. No stray pixels.
- [ ] **Fast on a 3G phone in a market.** Images lazy-load, interactions ≤ 100ms, no layout shift.
- [ ] **Clarity before cleverness.** Labels unambiguous. Hebrew copy natural, never translated-sounding.
- [ ] **Feminine voice.** `הצטרפי`, `גלי`, `חפשי` — never masculine or neutral forms.
- [ ] **Never say "יצרן/ית".** Always `בית עסק` / `בעלת עסק`.
- [ ] **Consistency.** Components, spacing, and colors match across pages.
- [ ] **WCAG 2.1 AA.** Contrast ≥ 4.5:1 body / 3:1 large text. Keyboard-navigable. Screen-reader labels.
- [ ] **Opinionated defaults.** Sensible defaults remove choice fatigue — e.g. sort=newest-first, location=Israel.

## II. Design tokens (locked — do not drift)

### Colors
| Token | Hex | Use |
|---|---|---|
| `primary` | `#2e6853` | Primary CTA, brand accents, links |
| `primary-dark` | `#2E4A2E` | Hover/active for primary |
| `background` | `#F5F0E8` | Page background — warm cream, **never pure white** |
| `surface` | `#FFFFFF` | Cards, modals (only on top of cream bg) |
| `text` | `#1C1A17` | Body copy, headings |
| `muted` | `#6B6860` | Secondary text, helper copy |
| `border` | `#E5DFD3` | Card borders, dividers on cream |
| `accent` | `#8B6914` | Sparingly — highlights, pull-quotes, "premium" tags |
| `success` | `#2e6853` | Reuses primary; available-today badges |
| `warning` | `#B4770A` | Low stock, soft warnings |
| `error` | `#B3261E` | Destructive confirmations, form errors |
| `vacation-slate` | `#64748B` | Vacation/unavailable banner (neutral, NOT amber) |

- [ ] Pure white (`#FFF`) appears **only** on top of cream page bg (cards). Never as page bg.
- [ ] No arbitrary hex values in JSX — use Tailwind tokens mapped in `tailwind.config.js`.

### Typography
| Role | Family | Weight | Size |
|---|---|---|---|
| Heading 1 | Frank Ruhl Libre | 700 | 32–48px |
| Heading 2 | Frank Ruhl Libre | 600 | 24–32px |
| Heading 3 | Frank Ruhl Libre | 600 | 20–24px |
| Body | DM Sans | 400 | 16px (14px mobile) |
| Small / caption | DM Sans | 400 | 13–14px |
| Button / label | DM Sans | 500–600 | 14–16px |

- [ ] Line-height 1.5–1.7 for body, 1.2–1.3 for headings.
- [ ] No more than 3 weights visible on one screen.
- [ ] Hebrew punctuation correct (`״`, `׳`, `—` em-dash for pulled quotes).

### Spacing
- [ ] Base unit **8px**. Allowed: 4, 8, 12, 16, 24, 32, 48, 64.
- [ ] Grid gutter on mobile: 16px. Card padding: 16px mobile / 24px desktop.

### Radii
- [ ] Inputs/buttons: 8px. Cards: 12–16px. Modals: 16–20px. No `rounded-full` on rectangles.

### Shadows
- [ ] At most 2 shadow levels: `card` (subtle) and `elevated` (dropdowns, modals).
- [ ] No neon glows, no hard drop-shadows.

## III. RTL correctness (blocker territory)

- [ ] **Logical properties only.** `ps-*`/`pe-*`, `ms-*`/`me-*`, `start-*`/`end-*`. Never `pl/pr/ml/mr/left/right` except in the documented `// rtl-ok` exceptions (password eye toggle in `dir="ltr"` input, carousel arrows, `left-1/2 -translate-x-1/2` center idiom, map geographic controls).
- [ ] Icons that carry direction (arrows, chevrons, back buttons) flip correctly in RTL.
- [ ] Numerals and English words inside Hebrew sentences use correct bidi wrapping — no broken word order.
- [ ] Phone numbers / URLs rendered inside `<bdi>` or `dir="ltr"` span when mixed with Hebrew.
- [ ] Horizontal scroll (chip rows, galleries) scrolls from the right side first.
- [ ] Form validation messages appear under the correct side of each input.

## IV. Layout & hierarchy

- [ ] Responsive grid. Mobile: single column. Tablet: 2. Desktop: 3–4 max.
- [ ] **Mobile breakpoints:** 375 / 414 / 768 / 1024 / 1280. Test all.
- [ ] Ample white space between sections. Cookbook feel.
- [ ] Clear visual hierarchy: hero → categories → producer grid → CTA.
- [ ] Consistent alignment — no one-off text alignment on individual elements.
- [ ] No horizontal scroll on 375px viewport (except intentional chip row).

## V. Interaction design

- [ ] **Tap targets ≥ 44×44px** on mobile. Header icons, favorite heart, bottom nav, card actions.
- [ ] Visible focus state on every interactive element (not default browser outline — branded ring).
- [ ] Hover states on desktop feel instant (≤ 150ms, ease-out).
- [ ] Transitions 150–300ms with `ease-in-out`. No bouncy/spring animations except for Ken Burns hero.
- [ ] Exception (ADR-023): the BottomNav active-indicator may use ONE restrained spring (≤~10% overshoot, ~200–260ms); prefers-reduced-motion → instant. No other element may spring.
- [ ] Destructive actions (delete account, reject report) require confirmation.
- [ ] Loading states — skeleton for lists, spinner for single-component async actions.
- [ ] Empty states — illustration or emoji + single-sentence feminine copy + primary CTA.
- [ ] Error states — calm tone ("משהו השתבש, נסי שוב"), no scary red walls.
- [ ] Keyboard-operable (Enter/Space activate buttons, Esc closes modals, Tab order logical RTL).

## VI. Component-specific rules

### ProducerCard (`frontend/components/ProducerCard.jsx`)
- [ ] Thumb on the **right side** in RTL (`ps-*` spacing from card edge).
- [ ] Trust strip: **max 2 items.** If verified → ✓ + rating. If not → rating only. Skip `response_time`.
- [ ] No 5-icon footer (removed April 2026 per HANDOFF).
- [ ] Placeholder: category emoji + producer initials, bg `#EAF3DE`, never a stock leaf icon.
- [ ] Heart/favorite button: ≥ 44×44px tap target, positioned top-end corner.
- [ ] Title in Frank Ruhl Libre; meta in DM Sans 13px.

### MapProducerCard (`frontend/components/MapProducerCard.jsx`)
- [ ] WhatsApp button green (primary brand), with white icon. Show only if `phone` present.
- [ ] Share button gray outlined (avoids green conflict with primary WA CTA).
- [ ] Distance shown in km with one decimal — never raw meters.
- [ ] Compact layout fits inside bottom sheet without scrolling at 375px.

### Header / BottomNav
- [ ] Persistent across pages except `/map` full-screen.
- [ ] BottomNav: 4–5 items max, active state uses primary color + filled icon.
- [ ] BottomNav pill surface = frosted 'warm glass' (`.nav-pill-glass`, added in implementation; extends MEH-732 pill-glass): translucent cream + backdrop-blur + opaque surface-floating (#FFFEFB) fallback; backdrop-filter never animated.
- [ ] Header: brand wordmark on start side; profile/search on end side.
- [ ] Both icons 24px, tap target 44×44px.

### Map (`/map`)
- [ ] Z-index tokens: tiles 0 → markers 400 → tooltips 500 → bottom-sheet 600 → legend 800 → controls 1000 → chat 9999 → cookie 9998. **Bottom sheets always below controls.**
- [ ] Cluster markers styled with brand colors, not Leaflet default blue.
- [ ] Locate button on map uses physical positioning (`// rtl-ok`) — geographic, not directional.
- [ ] Pins readable at 375px; tap target ≥ 44px including halo.

### Producer detail (`/producer/[id]`)
- [ ] Sidebar WhatsApp CTA is canonical on desktop. Sticky bottom bar is mobile-only. **Never render both at the same breakpoint.**
- [ ] Gallery: horizontal scroll RTL-correct, swipe-able, images `f_auto,q_auto` via Cloudinary.
- [ ] Sidebar: no `צרי קשר` header — primary CTA speaks for itself.
- [ ] Vacation banner: slate (`#64748B`), **not amber**.

### /neighbor (home cooks)
- [ ] Same card pattern as producers but differentiated with subtle accent color or icon.
- [ ] Moderation status visible to the owner only, never leaked to consumer view.
- [ ] Empty state explains how to list a home product.

## VII. Hebrew copy quality

- [ ] Feminine verbs throughout (`הצטרפי`, `גלי`, `חפשי`, `עקבי`).
- [ ] Never `יצרן/ית`. Always `בית עסק` / `בעלת עסק`.
- [ ] No translated-English phrasing. Natural Hebrew only.
- [ ] Micro-copy table in `docs/DESIGN.md` is locked — do not invent new phrasings for existing actions.
- [ ] Numbers: use Hebrew conventions (`₪25`, not `$25`, commas `1,000`).

## VIII. Accessibility

- [ ] Every `<img>` has meaningful `alt`. Decorative images use `alt=""`.
- [ ] Icon buttons have `aria-label` in Hebrew.
- [ ] Form inputs have `<label>` (or `aria-label` + visible title).
- [ ] Color is never the only signal (icons accompany status colors).
- [ ] Focus rings visible on cream background — may need `focus:ring-2 focus:ring-primary`.
- [ ] Contrast ≥ 4.5:1 body; measure `muted #6B6860` on `background #F5F0E8` → pass.

## IX. Robustness

- [ ] Long producer names (40+ chars) don't break card layout.
- [ ] Missing image → placeholder, never broken icon.
- [ ] No phone → hide WA button, don't render dead `tel:` link.
- [ ] 0 results → empty state with CTA to clear filters, not blank screen.
- [ ] Form validation errors inline (not only toast), clearly associated with the field.

## X. Code health

- [ ] Components reused, not duplicated (e.g. `ChipScrollRow`, `ProducerCard`).
- [ ] Tokens used, not magic numbers (`text-primary`, not `text-[#2e6853]`).
- [ ] No unused imports / dead props.
- [ ] Follows App Router conventions (`page.js`, `layout.js`, colocation of components).

## XI. Triage matrix (for review output)

| Severity | Marker | Meaning |
|---|---|---|
| 🔴 Critical | Blocker | Accessibility violation, RTL break, unusable on mobile, brand-token drift |
| 🟡 Medium | High-priority | Fix before merge — inconsistency, unclear copy, missing state |
| 🟢 Low | Nit | Polish / nitpick, can follow up later |

## XII. Review output format

```markdown
### Design Review Summary
[one-paragraph overall assessment — what works well, overall tone]

### 🔴 Critical
- [Component / file:line] — problem + impact

### 🟡 Medium
- [Component / file:line] — problem + impact

### 🟢 Low (Nits)
- [Component / file:line] — nit
```

Each finding must include the file path and, where possible, the line number.
Describe the **problem and its impact**, not the technical fix.
