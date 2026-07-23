# Mehamakor Design System · מהמקור

> **מהמקור** — "from the source." The first Israeli directory for authentic local food: small farms, home bakers, artisan cheesemakers, neighborhood cooks who sell directly via WhatsApp. Not a marketplace. Not delivery. A trusted map of real people making real food.

A full design system for production code + throwaway prototypes. Hebrew-first, RTL-native, feminine voice, warm editorial aesthetic.

---

## Sources

This system was built from two primary inputs:

- **Production codebase** (`frontend/`, attached read-only) — Next.js 14 App Router + Tailwind. Color tokens, typography scale, and component patterns here are the source of truth. Key files:
  - `frontend/tailwind.config.js` — color + font tokens
  - `frontend/app/globals.css` — paper-noise bg, Ken Burns, marquee, scroll hints
  - `frontend/app/layout.js` — Google Fonts imports (Frank Ruhl Libre, Cormorant Garamond, DM Sans, Heebo)
  - `frontend/components/{ProducerCard,Header,Footer,BottomNav,CategoryIcons}.jsx`
- **GitHub repo** `levismadar80-ship-it/FoodMamkor` (not imported — code duplicates the local codebase)
- **Uploaded logo references** — `uploads/{logo,logo2,hebrew}.png` (alternate bag-with-bread-and-carrot mark, stored in `assets/` as `logo-brand-mark*`)

The active production logo is the minimal wordmark in `assets/logo.png` — a subtle Hebrew mark in Frank Ruhl Libre + "MEKOR" in DM Sans bold.

---

## Brand at a Glance

| | |
|---|---|
| **Name** | מהמקור (Mehamakor) — "from the source" |
| **Audience** | Israeli women 28–45, mothers, WhatsApp-native, skeptical of ads |
| **Voice** | Warm, direct, knowing — like a trusted friend who already vetted everyone |
| **Grammar** | Hebrew feminine throughout ("את", "שלך", "גלי", "צרי קשר") |
| **Direction** | RTL always. No `left/right`, `ml/mr` — only `start/end`, `ms/me` |
| **Motif** | Warm cream canvas, dark forest green ink, warm gold accent, editorial serif headlines at extreme scale |

---

## Content Fundamentals

### Voice

Warm, direct, feminine. We speak to a 35-year-old Israeli mother who trusts her friends more than ads. She doesn't have time for corporate language.

- **Grammar:** Always feminine second-person. "גלי" not "גלה". "את" / "שלך" never the masculine equivalents.
- **Addressing producers:** "בתי עסק" — never "יצרנים" (too industrial). Never "מוכרים" (too transactional).
- **Preferred vocabulary:** "השכנה שאופה", "החווה בגליל", "ישר מהמקור", "מאומת", "קרוב אלייך"
- **Banned vocabulary:** "פלטפורמה", "חווית משתמש", "סולושן", "קהילה גלובלית" (corporate slop)
- **Punctuation:** No exclamation marks. Periods end thoughts cleanly. Em-dashes ok for rhythm.
- **Emoji:** Never in headlines. Sparingly in microcopy / chips (🌿 ✡️ 🚚 ✅). One per line, max.
- **Casing:** Hebrew has no case. Latin eyebrows (small labels in English) are UPPERCASE with wide tracking.

### Copy specimens (lifted from the codebase, verbatim)

- Hero headline: **אוכל אמיתי, ישר מהמקור אליך**
- Hero subtitle: *Real food, straight from the source* (eyebrow in Latin)
- Primary CTA: **גלי עסקים קרובים** · **הוסיפי את העסק שלך**
- Trust bar: *{N} בתי עסק מאומתים · {N} קטגוריות · מכל רחבי הארץ*
- Founder quote: *"אוכל אמיתי, מאנשים אמיתיים, ממש ליד הבית."* — ספיר, מייסדת מהמקור
- Empty state: *לא מצאנו עסקים באזור הזה — עדיין 🌱*
- WhatsApp default message: *היי! מצאתי אותך במהמקור — {name}*
- Section header: **מהמטבח של השכן** (sub-brand, warmer tone)
- How it works verbs: **גלי · צרי קשר · קבלי** (all feminine imperative)

### The 3-second test

A first-time visitor must understand, in this order:
1. This is a place to find real Israeli food (not delivery, not supermarket)
2. Real, trusted producers exist near me
3. I can WhatsApp them directly, right now

Every hero and landing surface is engineered against this ladder.

---

## Visual Foundations

### Colors

The palette is warm and ink-on-paper. **Never pure white. Never pure black.** All semantic tokens are defined in `colors_and_type.css`.

| Token | Hex | Role |
|---|---|---|
| `--primary` | `#2e6853` | Dark forest green. CTAs, links, logo. |
| `--primary-light` | `#3a7d64` | Hover for primary. |
| `--primary-dark` | `#2E4A2E` | Hero overlays, footer. |
| `--secondary` | `#4cb08b` | Mid green. Highlights, "available today" chip. |
| `--background` | `#F5F0E8` | Warm cream canvas. Replaces white everywhere. |
| `--site-text` | `#1C1A17` | Warm black body copy. |
| `--site-muted` | `#5c584f` | Warm gray — de-emphasized text. |
| `--accent` | `#8B6914` | Warm gold. Prices (in Cormorant italic), small accents. |
| `--accent-warm` | `#E8823A` | Warm orange. "new", "premium" badges **only**. |
| `--light` | `#EAF3DE` | Pale green. Badges, card backgrounds. |
| `--border` | `#e8e0d0` | Warm border. Always 0.5–1px, never 2px+. |

**Originality rule:** Gold (`#8B6914`) must appear as a real accent — section numerals, pull-quote marks, step numbers — not only on prices.

### Typography

Hebrew typography is the visual hero. If a Hebrew heading is > 24px it **must** be Frank Ruhl Libre. DM Sans is never used for large Hebrew.

- **Hebrew headlines** — Frank Ruhl Libre, weights 400 / 700 / 900
- **Latin accents** — Cormorant Garamond, weights 400 / 600, italic common
- **Body** — DM Sans 400 / 500 / 600 with Heebo as Hebrew fallback

Scale (from `colors_and_type.css`):

| Token | Font | Size | LH | Tracking |
|---|---|---|---|---|
| H1 hero | Frank Ruhl 900 | `clamp(42px, 6vw, 84px)` | 0.95 | -0.02em |
| H2 section | Frank Ruhl 700 | `clamp(32px, 4vw, 52px)` | 1.1 | -0.01em |
| H3 card | Frank Ruhl 700 | 20–24px | 1.25 | 0 |
| Body | DM Sans 400 | 16px | 1.7 | 0 |
| Small | DM Sans 500 | 13px | 1.5 | 0 |
| Eyebrow (Latin) | DM Sans 500 | 11px | — | 0.15em, UPPERCASE |
| Price | Cormorant italic 500 | 15px | — | 0 |

### Spacing, radii, borders

- **Sections:** 80px desktop / 48px mobile (`.section-y` utility)
- **Container max:** 1280px
- **Card gap:** 24px desktop / 16px mobile
- **Micro scale:** 4, 8, 12, 16, 24, 32, 48, 64, 80
- **Radii:** `sm 8px` (inputs, chips), `md 16px` (default card), `lg 24px` (hero / feature), `full 9999px` (pills, heart, WhatsApp button)
- **Borders:** always 1px, `--border` (`#e8e0d0`), never 2px+. Focus rings are the single exception.

### Backgrounds

Warm cream with a **paper-noise SVG overlay** at 3% opacity — inlined as data-URI (see `globals.css`). This gives the whole site an organic "printed on recycled paper" feel without a network request.

Imagery is warm-leaning — golden-hour food photography, never desaturated, never cold. A single generic stock photo ("hands holding vegetables") is forbidden.

### Motion

| Element | Easing | Duration |
|---|---|---|
| Fade-in on scroll | `ease-out` | 800ms |
| Hover card | `ease-out` | 300ms, -translate-y-0.5, shadow `0 8px 32px rgba(46,104,83,0.12)` |
| Ken Burns hero bg | `ease-in-out alternate` | 20–25s |
| Marquee hype bar | `linear` | 25s infinite |
| Animated counters | custom | 1.5s |
| Scroll hint | `cubic-bezier(0.25,1,0.5,1)` | 2.4s |

**No bounce easing. No scroll-jacking. No autoplay video.** All motion respects `prefers-reduced-motion`.

### Hover + press states

- Links: `text-primary` on hover, no underline (unless inline in body copy)
- Cards: lift 2px, shadow grows to `0 8px 32px rgba(46,104,83,0.12)`, image zoom 1.05
- Primary buttons: bg shifts to `--primary-light`, no shadow change
- Ghost buttons: solid fill on hover (primary bg + white text)
- Press (:active): no visible shrink; filter: `brightness(0.97)`

### Shadows + elevation

One shadow token, used sparingly:
- `--shadow-card`: `0 8px 32px rgba(46,104,83,0.12)` — hover only
- `--shadow-scroll-header`: `0 2px 20px rgba(46,104,83,0.06)` — header on scroll
- Otherwise: flat. We sit on cream paper, not float above it.

### Transparency + blur

- Header after 60px scroll: `bg-background/85` + `backdrop-blur-md`
- Hero image overlays: `rgba(46,74,46,0.88)` at bottom, fading up
- "Near me" glass button: `bg-white/15` + `backdrop-blur-sm`

Glass is an ingredient, not the meal. Never frost an entire panel.

### The signature gestures

Every surface commits to **at least one** of these recurring motifs so a visitor who's seen ten food sites this week still knows they're on Mehamakor:

1. **Hebrew serif at extreme scale** (84px+) used as visual art, not just heading
2. **Editorial numeral** — `01 · 02 · 03` in Cormorant italic gold, as a magazine device
3. **Handwritten flourish** — a small ink-brush check, signature, or leaf drawn in irregular SVG
4. **Hand-cut paper edge** — subtle torn-paper border-bottom on featured cards (vs clean 16px corners)
5. **Asymmetric grids** — at least one section per page breaks the symmetry (1 wide card + 2 small)
6. **Generous negative space** — one section per page is 60%+ empty cream canvas
7. **Warm gold accent** — `#8B6914` must appear as more than just prices

---

## Iconography

Icons come from **two complementary systems** — both already installed in the codebase:

1. **Phosphor React** (`@phosphor-icons/react`) — UI icons. Always `weight="duotone"` for warmth (never `"regular"`), size 18–24px in-line, size 36–56px in empty states. Active bottom-nav tabs use `weight="fill"`.
   - Used for: Leaf, Seal, Cow, Heart, House, MapTrifold, CalendarBlank, CookingPot, Crosshair, List, X, InstagramLogo, Phone
   - CDN fallback for prototypes: `https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css` (or individual SVG sprites)

2. **Hand-drawn category icons** — custom SVG line-art in `assets/CategoryIcons.jsx`. 6 category glyphs (meat, veg, dairy, bread, oil, soap) with loose, imperfect strokes at `strokeWidth=1.5`. Style inspired by gardensweet.com and Graza — warmer and more unique than a lib.

3. **WhatsApp, Phone, Instagram** — inline SVGs in `ProducerCard.jsx`. These brand glyphs are copied directly and tinted `--primary` on cream, white on green.

### Emoji usage

Used **sparingly and only in microcopy** — chips, empty states, short labels. Never in H1/H2. Never more than one per short phrase.

Approved set: 🌿 (organic) · 🥩 (meat) · 🧀 (dairy) · 🍞 (bread) · 🫒 (oil) · ✡️ (kosher) · 🚚 (delivery) · ✅ (verified) · 🗺️ (map) · 📅 (events) · 🌱 (empty state, new)

### Unicode characters

Em-dash `—` is used for section breaks and as a brand rhythm device (e.g. "ישר מהמקור — אלייך"). Middle-dot `·` separates meta-info in card subtitles. Both are intentional and part of the editorial feel.

### Logo + Brand Marks

Active production logo: `assets/logo.png` — horizontal wordmark, minimal, Frank Ruhl Libre + DM Sans.

Alternate brand marks (`assets/logo-brand-mark*.png`): illustrated shopping-bag mark with bread loaf and carrot poking out. Provided as reference — not currently used in production but kept here as a lockup option.

---

## Index — what's in this folder

```
README.md                   ← you are here. Brand, voice, visuals, iconography.
SKILL.md                    ← Agent-invocable entry point for prototyping.
colors_and_type.css         ← Canonical CSS variables. Import this first.
assets/
  logo.png                  ← Active horizontal wordmark (production)
  logo-footer.png           ← White-on-green footer lockup
  logo-brand-mark.png       ← Illustrated bag mark (reference)
  logo-brand-mark-2.png     ← Alternate illustrated mark
  logo-hebrew-reference.png ← Full wordmark + tagline reference
  icon-192.png              ← PWA icon
  icon-512.png              ← PWA icon
  apple-touch-icon.png      ← iOS home-screen icon
  og-image.jpg              ← Social share image
  CategoryIcons.jsx         ← Hand-drawn SVG category glyph set
source/                     ← Reference copies of production components (read-only)
preview/                    ← HTML cards registered in the Design System tab
ui_kits/
  website/                  ← Desktop + mobile website UI kit (interactive)
```

---

## Engineering rules (non-negotiable)

- **RTL everywhere.** `<html dir="rtl">`. No `left-*/right-*/ml-*/mr-*` — only `start-*/end-*/ms-*/me-*`.
- **Feminine Hebrew grammar.** All user-facing copy.
- **Touch targets ≥ 44×44px.** Mobile-first — 390px minimum viewport.
- **WCAG AA minimum.** Semantic HTML, `aria-label` on every icon button, visible focus ring (`ring-2 ring-primary/40`).
- **No heavy 3D, no scroll-jacking, no autoplay video.**
- **No new color tokens.** Use the ones above. Extend semantically, not chromatically.
