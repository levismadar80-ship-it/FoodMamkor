# DESIGN-SYSTEM-BRIEF — Mehamakor (מהמקור)

> **Provenance note (read first).** This is a **faithful reconstruction** assembled from the
> project's canonical governance sources — `docs/BRAND.md`, `docs/CONTEXT.md §5`,
> `.claude/commands/design-review/design-principles.md`, and ADR-013 / 014 / 016 / 018 / 019 —
> surfaced via Project Knowledge. It is **not** a byte-exact copy of the repo's
> `DESIGN-SYSTEM-BRIEF.md` (PR #1272), because PK did not return that file's verbatim body and the
> repo is private. It is functionally complete for attaching to Claude Design. If you need the
> exact repo wording, diff this against `DESIGN-SYSTEM-BRIEF.md` on `staging`.

---

## 0 · Purpose

This brief is the **governance companion** the design agent reads alongside synced components.
The synced "Mehamakor DS — Components" project carries the components but **not** the ADR rules
below. Attach this brief to every Claude Design session so brand + RTL fidelity is preserved.

**Mehamakor is a magazine, not a marketplace.** Every visual decision serves three words:
**warmth (בית), belonging, story (סיפור)**. Editorial premium — Kinfolk lineage, not Etsy/Wolt
lineage.

---

## 1 · Brand tokens — LOCKED (do not deviate without explicit approval)

| Token | Value | Notes |
|---|---|---|
| primary | `#2e6853` | deep green |
| primary-dark | `#2E4A2E` | |
| background | `#F5F0E8` | warm cream — **NEVER pure white**, NOT default Opus cream |
| text | `#1C1A17` | (canonical — not `#1a1a1a`) |
| accent gold | `#8B6914` | |
| muted | `#6b6b6b` | `--fg-muted` |

**State colors:** brand-owned warm editorial signals only. Per **ADR-019** — use
**opacity-on-cream + `--fg-muted`**; **no new state-color tokens**, no generic red/green/amber
semantic palette anywhere.

---

## 2 · Typography — LOCKED

- **Hebrew headlines:** **Frank Ruhl Libre** (up to **900** for display headlines).
- **Body:** **DM Sans** (16px desktop / 14px mobile; line-height 1.5–1.7).
- **Latin / numeral italic accents:** **Cormorant** — Latin and numerals only, **never Hebrew**.
- **DO NOT use** Inter, Roboto, system-ui, Arial, Georgia, Fraunces, Playfair (all default Opus/AI picks).
- No more than 3 weights visible on one screen. Headings line-height 1.2–1.3.
- Hebrew punctuation correct (`״`, `׳`, em-dash `—` for pulled quotes).

---

## 3 · RTL correctness — BLOCKER territory

- **Logical properties only:** `ps-*`/`pe-*`, `ms-*`/`me-*`, `start-*`/`end-*`.
  **Never** `pl/pr/ml/mr/left/right` for directional positioning.
- **Documented exceptions only** (`// rtl-ok`): password eye-toggle inside `dir="ltr"` input,
  carousel arrows, the `left-1/2 -translate-x-1/2` centering idiom, map geographic controls.
- Directional icons (arrows, chevrons, back) flip correctly in RTL.
- Numerals / English words inside Hebrew sentences use correct bidi wrapping; phone numbers / URLs
  inside `<bdi>` or `dir="ltr"` span.
- Horizontal rows (chips, galleries) scroll from the **right** first.
- No horizontal scroll on 375px (except intentional chip row).

---

## 4 · Voice & language — LOCKED

- **Feminine Hebrew**, hybrid policy (**ADR-014**): gerund/plural for UI CTAs (`הוסיפו`/`גלו`),
  feminine allowed for brand narrative and brand-"we".
- **"בית עסק"** — **never** "יצרן/יצרנית".
- **"מגזין"** — internal thesis word only; **must not appear in any UI copy**. Surface the
  magazine voice through *what* the copy says (curation, founder accountability, story-led framing),
  not by labeling.
- Real Hebrew copy in mockups — never Lorem Ipsum.

---

## 5 · Icons — ADR-013 (three-tier)

- **Functional UI:** **Phosphor** only — **regular weight** (duotone is too playful, forbidden).
- **Category glyphs:** hand-drawn single-weight SVG (line, no fill).
- **Editorial:** custom illustration.
- **Lucide is FORBIDDEN.** Never use Lucide as-is.

---

## 6 · Layout, spacing, interaction

- **Spacing:** 8px base. Allowed: 4, 8, 12, 16, 24, 32, 48, 64. Mobile gutter 16px; card padding
  16px mobile / 24px desktop.
- **Radii:** inputs/buttons 8px; cards 12–16px; modals 16–20px. No `rounded-full` on rectangles.
- **Shadows:** max 2 levels (`card` subtle, `elevated`). No neon glows, no hard drop-shadows.
- **Tap targets ≥ 44×44px** on mobile. Mobile-first: design at **375px** then grow (414/768/1024/1280).
- **Motion:** transitions 150–300ms ease-in-out. No bouncy/spring (exceptions: Ken Burns hero;
  ADR-023 BottomNav active-indicator single restrained spring). `prefers-reduced-motion` → instant.
- **Hero direction (ADR-018):** Direction A canonical; Direction B campaign-only.

---

## 7 · Inspiration (single curated direction)

PRIORITIZE: **Kinfolk** (typographic restraint, warm cream, whitespace) · **Natoora**
(producer-first storytelling) · **Cherry Bombe** (women-led food editorial, founder accountability)
· **The Infatuation** (review-as-narrative, anti-Yelp) · **Smitten Kitchen** (solo-founder editorial
trust) · **Airbnb listing 2023+** (mobile trust patterns).

RETIRED — do not reference: `gardensweet.com` (mixing it in causes drift).

---

## 8 · Anti-patterns — forbidden, catch in review

- `"שכנות מבשלות"` / `"מהמטבח של השכן"` / `"אוכל ביתי"` — illegal-in-Israel framing, **brand LOCK violation**.
- `"יצרן/יצרנית"` → use `"בית עסק"` / `"בעלת עסק"`.
- `"marketplace"` / `"פלטפורמת מסחר"` — DNA violation.
- `"ISSUE 01"` / `"SPRING 2026"` / timestamped editorial framing — Mehamakor isn't a periodical.
- Stock illustrations (iStock, Freepik) — kill the "curated" signal.
- AI-slop: purple gradients, Inter font, glassmorphism, cookie-cutter image-top/text/button cards,
  default shadcn neutral-gray aesthetic.
- Marketplace/listing aesthetics (Etsy/Wolt).
- **No emoji** in UI / ICU / brand / editorial surfaces (MEH-657 LOCK v2). Allowed only in WhatsApp
  outbound, share strings, email body.

---

## 9 · Audience

Israeli women 28–45, mothers + couples. Mobile-heavy, WhatsApp-native. Skeptical of advertising —
scan for authenticity in 3 seconds.

---

*Truth hierarchy: ADR > .claude/rules > CONTEXT.md > BRAND.md / DESIGN.md > general docs. When this
brief and an ADR disagree, the ADR wins. When a token here and DESIGN.md disagree, DESIGN.md wins.*
