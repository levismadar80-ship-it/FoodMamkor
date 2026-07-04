# Phase 5 · Sections 06 + 10 — Port Spec

**Status:** Approved / locked (design-only). Source mockup: `Phase 5 · Sections 06 + 10 (design pass).html`.
**For:** Claude Code port. RTL, feminine Hebrew, Mehamakor tokens only. No new color tokens.

Design tokens referenced (from `colors_and_type.css`): `--primary #2E6853`, `--primary-light #3A7D64`, `--primary-dark #2E4A2E`, `--background #F5F0E8`, `--bg-card #FFFEFB`, `--site-text #1C1A17`, `--site-muted #57524A`, `--accent #8B6914` (gold), `--light #EAF3DE`, `--border #E8E0D0`. Fonts: Frank Ruhl Libre (Hebrew display), DM Sans (body), Cormorant Garamond (Latin/numeral italic accents).

---

## SECTION 06 — Editorial Breath

Editorial pause between the category grid (07) and featured producers (08). A magazine section-divider, never a banner.

### Final copy (LOCKED)
- **Quote:** `תכירי את מי שמאחורי האוכל`
  - Emphasis span (gold): `שמאחורי האוכל`
  - Gloss: "Meet the people behind the food"
  - **No terminal period. No quotation marks.** One idea, sharp.
- **Numeral:** `06` (decorative, gold, Cormorant italic)

### Layout / structure
- Full-width section, `background: --background` (cream). Paper-noise overlay inherited from globals.
- **Center-aligned, single column.** Generous vertical breathing room.
- Vertical stack (top → bottom): numeral `06` → hairline rule → quote.

### Spacing & type
| Element | Desktop | Mobile |
|---|---|---|
| Section padding | `120px 48px` | `72px 24px` |
| Numeral `06` | Cormorant italic 500, 18px, gold, letter-spacing .1em | same |
| Hairline rule | 40×1px, gold @ 55% opacity, margin `22px auto 34px` | margin `18px auto 26px` |
| Quote | Frank Ruhl Libre **500, upright (not italic)**, **54px**/1.28, -.01em, max-width 18ch, centered | **32px**, max-width 14ch |
| Quote emphasis | inline span colored gold `--accent` | same |

### Brand-LOCK (passed)
No `בית / מטבח / ביתי / אוכל אמיתי / מהמטבח של השכן`, no `יצרן`, no "marketplace". Thesis = a *person* behind the food. Covers all business types (no grower-specific verb). Feminine imperative `תכירי`.

---

## SECTION 10 — Meet a Producer · Direction A (split) — LOCKED

A magazine feature on **one** בית עסק (larger/warmer than a ProducerCard, which is the grid unit). Persona: **Michal (farmer)**. `בית עסק`, never `יצרן`.

### Final copy (LOCKED) — Michal
- **Eyebrow:** `היכרות`  (section-type, not a category)
- **Section H2:** `מאחורי הקלעים`
- **Feature headline:** `מיכל מגדלת עגבניות שזוכרות איך הן אמורות לטעום`
  - Gloss: "Michal grows tomatoes that remember how they're meant to taste". No terminal period (display headline).
- **Narrative (body, keeps terminal periods):**
  `בכל בוקר, הרבה לפני שהשוק מתעורר, מיכל כבר בין השורות בחווה הקטנה שלה בעמק. היא מאמינה שעגבנייה צריכה זמן — שמש, סבלנות, ואדמה שמכירים בשמה. מה שנקטף אצלה עם אור ראשון מגיע אלייך כשהוא עדיין חם מהשדה.`
- **Attribution (· middle-dot separator):** `מיכל לוי · חוות שורשים, כפר יחזקאל, עמק יזרעאל`  (name bold)
- **Image caption chip:** `מיכל · חוות שורשים, עמק יזרעאל`
- **CTA primary (profile link):** `להכיר את מיכל`
- **CTA secondary (WhatsApp, relational not transactional):** `לכתוב למיכל`  (with WhatsApp glyph)

### Swap copy — Hadar (bakery), same structure
- Headline: `הדר מתחילה ללוש כשבחוץ עוד חושך`
- Narrative: `ארבע לפנות בוקר, ורמת השרון עוד ישנה. הדר כבר מקמחת את השיש, מקפלת בצק מחמצת שתפח כל הלילה. בשבע, כשאת יוצאת מהבית, הכיכרות שלה כבר פושרות על המדף.`
- Attribution: `הדר כהן · מאפיית בוקר, רמת השרון`
- CTAs: `להכיר את הדר` / `לכתוב להדר`

### Layout / structure (zones)
Section → container → header (eyebrow + H2) → **2-col split**: figure | body.
- **Reading order (RTL): image leads (start/right), text follows (end/left).**
- Section `background: --bg-card` (warm #FFFEFB) to lift the feature off the cream page.

```
┌ hp-container (max 1280px) ─────────────────────────────┐
│  היכרות  (eyebrow, gold)                                │
│  מאחורי הקלעים  (H2)                                     │
│                                                         │
│  ┌─ figure (5fr) ─┐   ┌─ body (6fr) ─────────────────┐  │
│  │  image-slot    │   │  headline (Frank Ruhl 700)   │  │
│  │  4:5 portrait  │   │  narrative (DM Sans, ≤46ch)  │  │
│  │  [caption chip │   │  attribution (· separator)   │  │
│  │   bottom-start]│   │  [להכיר את מיכל] [לכתוב…]     │  │
│  └────────────────┘   └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Spacing & type
| Element | Desktop | Mobile |
|---|---|---|
| Section padding | `96px 0` | `56px 0` |
| Container | max 1280px, padding `0 64px` | padding `0 24px` |
| Header margin-bottom | 44px | 28px |
| Eyebrow | DM Sans 500, 11px, .18em, UPPERCASE feel, gold, with 32×1px gold rule before it | same |
| H2 | Frank Ruhl 700, 52px/1.1 | 34px |
| Split grid | `grid-template-columns: 5fr 6fr; gap: 64px; align-items: center` | `1fr; gap: 26px` |
| Image slot | aspect **4:5 portrait**, radius 16px, height ~600px | height ~440px |
| Caption chip | absolute bottom-start (14px), `rgba(31,74,56,.88)` bg, `#EAF3DE` text, pill, blur(4px), 11px | same |
| Body stack gap | 22px | — |
| Headline | Frank Ruhl 700, 38px/1.14, -.01em | 28px |
| Narrative | DM Sans 400, 17px/1.8, `--site-muted`, max-width 46ch, `text-wrap: pretty` | 15.5px |
| Attribution | DM Sans 500, 13px, `--site-muted`; name bold `--site-text` | same |
| Actions row | flex, gap 14px, margin-top 4px | margin-top 2px |

### CTA placement & style
- Bottom of the body column, after attribution. Flex row, `gap: 14px`, wraps on mobile. Min touch target 44px.
- **Primary** `להכיר את מיכל`: solid `--primary`, white text, `border-radius: full`, hover → `--primary-light`. Routes to the business profile.
- **Secondary** `לכתוב למיכל`: ghost (transparent, `--border` 1px, `--primary` text), WhatsApp glyph 18px before label, hover → solid `--primary` + white. Opens WhatsApp.

### Brand-LOCK (passed)
Framed as a `בית עסק` feature, never `יצרן`. Persona Michal (Dana/Yael retired). Relational WhatsApp CTA `לכתוב` (not `הזמיני/קני`). Eyebrow `היכרות` is a section-type, so a multi-category business stays correct.

---

## Port notes
- RTL everywhere: use `start/end`, `ms/me` — never `left/right`, `ml/mr`.
- Image: golden-hour, warm. Slot ratio 4:5 (Direction A). Caption chip overlays bottom-start.
- Gold `--accent` must read as a real accent here (numeral 06, rule, quote emphasis, eyebrow) — not only on prices.
- Mockup is desktop+mobile only; tablet can interpolate the same grid (collapse to 1col below ~720px).
