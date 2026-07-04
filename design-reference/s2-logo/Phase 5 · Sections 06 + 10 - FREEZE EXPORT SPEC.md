# FREEZE + EXPORT — Sections 06 + 10 · mehamakor.online

**Status:** frozen. Approved design. Spec for Claude Code port into `page.js`. No re-design, no new options.
**Token names below are the canonical `--*` from `colors_and_type.css` (your `docs/DESIGN.md` mirrors these). Px in parens for reference only — port to the token.**

---

## ⚠ 4 RECONCILE-BEFORE-PORT flags (your restated brief vs. what was frozen)

1. **Eyebrow typo (06? 10).** Your paste reads `היקרות` (= "preciousness"). The frozen + approved word is **`היכרות`** ("introduction / meeting"). Spec below uses `היכרות`. Confirm.
2. **CTA hierarchy is now INVERTED vs. the approved mockup.** Approved mockup: primary = `להכיר את מיכל` (filled green, → profile), secondary = `לכתוב למיכל` (ghost, → WhatsApp). Your freeze brief makes **`לכתוב למיכל` the primary** (filled) and `להכיר את מיכל` secondary. Spec below follows your **new** order. This is a deliberate change — confirm it's intended.
3. **Page position contradiction.** Your item 8 says "06 between CategoryGrid(07) and featured(08)". The **v2 assembly flow map** (source of truth) places 06 at slot **between Stats(05) and Category grid(07)** — i.e. *before* the grid, not between grid and featured. See §8. Pick one before port; it's a 1-line placement but it matters.
4. **`--bg-card` is pure white (`#ffffff`).** Approved mockup put §10 on off-white `#FFFEFB`. Your brand-lock says *never pure white*. **Do not map §10's bg to `var(--bg-card)`** — keep it on `--background` (cream). See §7.

Also noted: brand-lock says **Phosphor regular weight** (overrides the DS duotone default) — WhatsApp glyph below is regular weight. And **no glassmorphism** — the approved caption chip's `backdrop-blur` is dropped (solid pill). See §10.4.

---

# SECTION 06 — Editorial Breath

### 1 · ZONES
Single centered column, identical order mobile + desktop:
```
[ numeral 06 ]
[ hairline rule ]
[ pull-quote ]
```
No image, no CTA. Full-bleed cream. This is the page's negative-space "breath."

### 2 · SPACING
| Slot | Token | (px) |
|---|---|---|
| Section padding-block | `--space-20` desktop / `--space-12` mobile | (80 / 48) |
| Section padding-inline | `--space-12` desktop / `--space-6` mobile | (48 / 24) |
| numeral → rule | `--space-2` | (8) |
| rule → quote | `--space-8` top of quote | (32) |

> **One intentional non-token:** approved mockup used **120px / 72px** padding-block for extra editorial breath. If exact visual fidelity is required, that's the single deliberate magic number; otherwise `--space-20 / --space-12` is the tokenized floor.

### 3 · TYPE
| Element | Family / weight | Size mob → desk | Color | LH | Tracking |
|---|---|---|---|---|---|
| Numeral `06` | `--font-english` (Cormorant) **600 italic** | 18px (both) | `--accent` | 1 | — |
| Pull-quote | `--font-headline` (Frank Ruhl) **500, upright** | 32px → 54px (≈`--fs-h2`) | `--site-text`; emphasis span `שמאחורי האוכל` → `--accent` | 1.28 | `--tracking-h2` (-.01em) |

> Quote weight **500** is intentional (softer pull-quote) vs. the DS headline default 700/900. Max-width ≈ 14ch mobile / 18ch desktop, centered.

### 6 · ACCENT (gold)
Gold `--accent` appears **three** ways here: (a) the editorial **numeral 06** (Cormorant italic), (b) the **hairline rule** — 40×1px, `--accent` @ 55% opacity, and (c) the **emphasis word** `שמאחורי האוכל` inside the quote. Eyebrow "06" treatment = numeral only (no Latin label, no "SECTION").

### 7 · BACKGROUND
`--background` (cream). Inherits page paper-noise. No card, no border, no shadow.

### Copy (VERBATIM — no period)
- Quote: **`תכירי את מי שמאחורי האוכל`**  (emphasis span: `שמאחורי האוכל`)
- Numeral: `06`

---

# SECTION 10 — Meet a Producer · Direction A (split) — CONFIRMED

### 1 · ZONES
**Desktop:** 2-col split, `grid-template-columns: 5fr 6fr`.
- RTL reading order → **image on the START (right) side**, text block on the END (left).
**Mobile (stacked, < 768px):** single column, order top→bottom:
```
[ eyebrow ] [ H2 ]
[ image-slot (4:5) + caption ]
[ headline ]
[ narrative ]
[ attribution ]
[ CTA row ]
```
Header (eyebrow + H2) spans full width above the split on both.

### 2 · SPACING
| Slot | Token | (px) |
|---|---|---|
| Section padding-block | `--space-20` / `--space-12` mob | (80 / 48) |
| Container | `--container-max` (1280), padding-inline `--space-16` / `--space-6` mob | (64 / 24) |
| Header → split | `--space-12` / `--space-8` mob | (48 / 32) |
| Split column gap | `--space-16` desktop · `--space-6` stacked | (64 / 24) |
| Body internal vertical rhythm (between zones) | `--space-6` | (24) |
| CTA row gap | `--space-4` | (16) |
| eyebrow rule → label | `--space-3` | (12) |

### 3 · TYPE
| Element | Family / weight | Size mob → desk | Color | LH | Tracking |
|---|---|---|---|---|---|
| Eyebrow `היכרות` | `--font-body` **500** | `--fs-micro` (11) | `--accent` | — | `--tracking-eyebrow` (.15em) |
| H2 `מאחורי הקלעים` | `--font-headline` **700** | `--fs-h2` (clamp 32→52) | `--site-text` | `--lh-tight` (1.1) | `--tracking-h2` |
| Feature headline | `--font-headline` **700** | 28px → 38px | `--site-text` | 1.14 | `--tracking-h2` |
| Narrative | `--font-body` **400** | `--fs-body` (16) | `--fg-muted` | `--lh-body` (1.7) | 0 |
| Attribution | `--font-body` **500**; name 700 | `--fs-small` (13) | `--fg-muted`; name `--site-text` | `--lh-small` | 0 |
| Caption chip | `--font-body` **500** | `--fs-micro` (11) | `--light` on `--primary-dark` | — | .05em |

> Headline 28→38 sits between `--fs-h3` (24) and `--fs-h2`; port as `clamp(28px, 3vw, 38px)`. Narrative max-width 46ch, `text-wrap: pretty`.

### 4 · IMAGE-SLOT
- **Aspect ratio:** 4:5 portrait.
- **Treatment:** **framed** (not full-bleed). `border-radius: --radius-md` (16px — matches approved mockup; DS "feature" token is `--radius-lg`/24px if you want more curve — approved value is 16). `object-fit: cover`.
- **Cloudinary:** `c_fill, g_auto, ar_4:5, f_auto, q_auto` (+ `e_improve` optional). Golden-hour warm; never desaturated.
- **Placeholder color:** `--light` (pale green) fill while loading — no generic grey skeleton.
- **Position:** desktop = START/right column; mobile = directly under the header.
- **Caption chip:** absolute, **bottom + inline-start (14px / `--space-3`)**, pill `--radius-full`, bg `--primary-dark`, text `--light`, **no blur** (glassmorphism removed). Content: `מיכל · חוות שורשים · עמק יזרעאל`.

### 5 · CTA (per your new hierarchy)
RTL order (reads start→end): **[ primary ] [ secondary ]**, flex row, gap `--space-4`, wraps on mobile. Both `min-height: 44px`, `--radius-full` (pill).
| | Label | Visual | Target |
|---|---|---|---|
| **Primary** | `לכתוב למיכל` | filled `--primary`, text `#fff`, hover `--primary-light`. Phosphor **WhatsApp, regular weight** glyph 18px before label. | `https://wa.me/<phone>?text=<prefilled>` |
| **Secondary** | `להכיר את מיכל` | ghost — transparent, 1px `--border`→ or `--primary` border, text `--primary`; hover fills `--primary` + `#fff` | `/producers/[slug]` |

> Primary stays **`--primary` editorial green**, *not* `#25D366` WhatsApp-brand green — keeps the "magazine, not marketplace" tone. (DS `.btn-whatsapp` exists but is intentionally not used here.)

### 7 · BACKGROUND + breakpoint
- Section bg: **`--background` (cream)** — same paper stock as the page. **Do not use `--bg-card`** (pure white, violates the rule). If lift is wanted, separate from neighbors with a 1px `--border` top hairline, never a white fill.
- **Stacks to single column at `< 768px`** (DS tablet breakpoint). At ≥768px it's the 5fr/6fr split.

### Copy — Michal (VERBATIM)
- Eyebrow: `היכרות`   ·   H2: `מאחורי הקלעים`
- Headline (no period): `מיכל מגדלת עגבניות שזוכרות איך הן אמורות לטעום`
- Narrative (prose, keeps periods): `בכל בוקר, הרבה לפני שהשוק מתעורר, מיכל כבר בין השורות בחווה הקטנה שלה בעמק. היא מאמינה שעגבנייה צריכה זמן — שמש, סבלנות, ואדמה שמכירים בשמה. מה שנקטף אצלה עם אור ראשון מגיע אלייך כשהוא עדיין חם מהשדה.`
- Attribution (middle-dot): `מיכל לוי · חוות שורשים · עמק יזרעאל`
- CTA primary: `לכתוב למיכל`  ·  CTA secondary: `להכיר את מיכל`
- Term: **`בית עסק`** — never `יצרן`.

### Copy — Hadar (bakery) · alternate swap, same structure
- Eyebrow: `היכרות`   ·   H2: `מאחורי הקלעים`
- Headline (no period): `הדר מתחילה ללוש כשבחוץ עוד חושך`
- Narrative: `ארבע לפנות בוקר, ורמת השרון עוד ישנה. הדר כבר מקמחת את השיש, מקפלת בצק מחמצת שתפח כל הלילה. בשבע, כשאת יוצאת מהבית, הכיכרות שלה כבר פושרות על המדף.`
- Attribution: `הדר כהן · מאפיית בוקר · רמת השרון`
- Caption chip: `הדר · מאפיית בוקר · רמת השרון`
- CTA primary: `לכתוב להדר`  ·  CTA secondary: `להכיר את הדר`

---

## 8 · PAGE POSITION (per v2 assembly flow map — source of truth)
Linear DOM order around these surfaces:
```
05 Stats counter
06 Editorial Breath      ← NEW · renders BETWEEN Stats(05) and Category grid(07)
07 Category grid
08 Featured Producers
09 Main producers grid
10 Meet a Producer       ← NEW · renders BETWEEN Main grid(09) and Upcoming events(11)
11 Upcoming events
```
- **06** = immediately *before* the Category grid (between Stats 05 and Grid 07). **⚠ This contradicts the "between grid and featured" phrasing in your brief — reconcile (flag 3).**
- **10** = after Featured Producers (08), separated by the Main producers grid (09); sits directly before Upcoming events (11).

---
*Frozen. No code, no JSX, no auto-handoff — this document is the entire deliverable.*
