# מהמקור · Logo System v1 (launch)

**Project:** מהמקור (mehamakor.co.il)
**Linear:** MEH-637 · closed
**Version:** v3.3 · final · approved for merge · May 22 2026
**Path:** `Drive/03-Brand-Hub/v1-launch-logo/`

חבילת ה-logo המלאה לקראת ה-launch. כל הקבצים ב-`frontend/public/`
מוכנים ל-Next.js production. המסמך הזה אומר איזה קובץ לבחור,
מתי לא לגעת, ואיך לא לשבור את המערכת.

> *"אוכל טוב לא שומרים לעצמנו"*

---

## 1 · Asset Index

| File | Use when | Format | Notes |
|---|---|---|---|
| `logo.svg` | Default · cream/white surfaces | SVG · color | Master. All other assets derive from this. |
| `logo-mono.svg` | Single-ink print, fax, 1-bit reproduction | SVG · mono | Each seed = distinct opacity step so all five remain legible. |
| `logo-inverted.svg` | Brand-green surfaces (`#2E6853`, `#1F4A3A`) | SVG · color | Green petal swapped to cream so it stays visible against brand-green ground. |
| `logo-on-warm-dark.svg` | Warm-dark UI (`#1A1614`, WhatsApp dark, system dark) | SVG · cream | Cream petals on warm dark. Not pure black, not brand green. |
| `logo-horizontal-he.svg` | Email signatures, navbar, header (HE) | SVG · lockup | Mark right, wordmark + tagline left (RTL flow). |
| `logo-horizontal-en.svg` | Email signatures, navbar, header (EN) | SVG · lockup | Mark left, wordmark + tagline right (LTR flow). |
| `logo-vertical-he.svg` | Square / centered surfaces (HE) | SVG · lockup | Mark top, wordmark centered below, tagline at bottom. |
| `logo-vertical-en.svg` | Square / centered surfaces (EN) | SVG · lockup | Same structure, English. |
| `favicon.ico` | Browser tab (multi-resolution 16+32+48) | ICO | Pack of 3 sizes. Place at site root. |
| `favicon-16x16.png` | Specific 16px references | PNG · transparent | Mark only — no room for wordmark. |
| `favicon-32x32.png` | Specific 32px references | PNG · transparent | Mark only. |
| `favicon-48x48.png` | Windows taskbar | PNG · transparent | Mark only. |
| `apple-touch-icon.png` | iOS home screen (180×180) | PNG · cream bg | Mark + Hebrew wordmark below. |
| `android-chrome-192x192.png` | Android home screen | PNG · cream bg | Mark + Hebrew wordmark. |
| `android-chrome-512x512.png` | PWA install icon, splash | PNG · cream bg | Mark dominant + larger wordmark. |
| `og-image.png` | Open Graph · HE share | PNG · 1200×630 | Vertical lockup, hairline footer, URL. |
| `og-image-en.png` | Open Graph · EN share | PNG · 1200×630 | Vertical lockup, EN wordmark in Caveat. |

**16 production assets · 1 ICO container.**

---

## 2 · The mark

חמישה גרגירי רימון, מסובבים ב-36° / 108° / 180° / 252° / 324°.
כל גרגיר נושא צבע אחר של אדמת ישראל. מטאפורה ל-mehamakor:
ריבוי בעלוֹת עסק קטנות — חקלאית, אופה, גבנת, יוצרת, מגדלת —
יחד מקום אחד.

**Path canonical (identical across all 5 rotations):**
```
M 0,-44 C 10,-44 13,-32 11,-20 C 9,-12 5,-8 0,-6
       C -5,-8 -9,-12 -11,-20 C -13,-32 -10,-44 0,-44 Z
```

**Highlight ellipse (one per petal, inside the rotation group):**
```
<ellipse cx="-3" cy="-32" rx="2.5" ry="6" fill="..." opacity="..."/>
```

| Rotation | Petal fill | Highlight | Reading |
|---|---|---|---|
| 36° | `#2E6853` green | `#7BAA90` @ 0.50 | Glossy lift |
| 108° | `#C8632E` orange | `#EAA378` @ 0.50 | Warm catch |
| 180° | `#C99846` gold | `#E8C788` @ 0.50 | Honey catch |
| 252° | `#D9C8B0` cream | `#1F4A3A` @ 0.20 | Inverted dark dot |
| 324° | `#5A8F73` green-light | `#A3C7B3` @ 0.50 | Soft lift |

---

## 3 · Clear-space rules

**Minimum padding around full lockup = 0.5 × mark width on all sides.**

```
┌─────────────────────────────────────┐
│         ½ × markWidth               │
│   ┌─────────────────────────────┐   │
│ ½ │                             │ ½ │
│   │         LOGO LOCKUP         │   │
│ × │                             │ × │
│   │                             │   │
│   └─────────────────────────────┘   │
│         ½ × markWidth               │
└─────────────────────────────────────┘
```

For an 80px-wide mark → 40px clear-space on every side.
לא להניח טקסט, כפתורים, או elements אחרים בתוך הזון הזה.

---

## 4 · Minimum size rules

| Use case | Min size | Source asset |
|---|---|---|
| Mark only on screen | 16 px | `favicon-16x16.png` |
| Mark only in print | 6 mm | `logo.svg` |
| Horizontal lockup on screen | 120 px wide | `logo-horizontal-*.svg` |
| Horizontal lockup in print | 35 mm wide | `logo-horizontal-*.svg` |
| Vertical lockup on screen | 80 px wide | `logo-vertical-*.svg` |
| App icon on home screen | 60 × 60 (FIX 5 spec) | `apple-touch-icon.png` |

App icons: wordmark must stay legible at home-screen size (~60×60 on small phones).
מבחן: לרוב המשתמשים העברים מהמקור = ה-brand reading. בלי הטקסט,
ה-mark לבדו = abstract flower. לכן wordmark נכלל ב-180/192/512.

---

## 5 · Dark mode coverage

ה-brand surfaces כוללים WhatsApp dark mode + iOS system dark mode +
email dark themes. שלוש variants לכיסוי מלא:

| Background | Use file | Why |
|---|---|---|
| Cream / white / light | `logo.svg` | Default color version |
| Brand green `#2E6853` / `#1F4A3A` | `logo-inverted.svg` | Green petal swapped to cream so it doesn't disappear into bg |
| Warm dark `#1A1614` (WhatsApp dark, generic dark UI) | `logo-on-warm-dark.svg` | Cream petals, opacity-stepped for legibility |

**אסור** להשתמש ב-`logo.svg` על רקע ירוק — הגרעין הירוק נעלם.
**אסור** להשתמש ב-`logo-on-warm-dark.svg` על רקע שחור טהור — שטוח.

---

## 6 · Typography system

שתי שכבות, שני תפקידים:

| Layer | Role | HE | EN |
|---|---|---|---|
| Wordmark | Identity | **Suez One 400** (slab serif Hebrew) | **Caveat 600** (handwritten script) |
| Tagline | Body voice | **Frank Ruhl Libre 400** | **Cormorant Garamond italic 400** |
| URL / kicker | Meta | Cormorant Garamond italic | DM Sans 500 |

**Google Fonts imports (production):**
```html
<!-- Suez One requires explicit text= subset for Hebrew -->
<link href="https://fonts.googleapis.com/css2?family=Suez+One&text=%D7%9E%D7%94%D7%9E%D7%A7%D7%95%D7%A8&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Frank+Ruhl+Libre:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,400;1,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

> **Open follow-up:** self-host Suez One Hebrew subset → eliminate `&text=` workaround.
> Tracked in MEH-451 sub-issue.

---

## 7 · Color tokens

```css
:root {
  /* Brand */
  --green:        #2E6853;
  --green-light:  #5A8F73;
  --green-dark:   #1F4A3A;
  --orange:       #C8632E;
  --gold:         #C99846;
  --cream-deep:   #D9C8B0;

  /* Surfaces */
  --bg:           #F5F0E8;  /* page cream */
  --warm-dark:    #1A1614;  /* dark-mode surface, NOT pure black */
  --ink:          #1C1A17;  /* primary text */
  --muted:        #5c584f;  /* tagline / secondary */
  --gold-text:    #8B6914;  /* kicker / URL */

  /* Mark highlights (per-petal) */
  --hl-green:        #7BAA90;
  --hl-orange:       #EAA378;
  --hl-gold:         #E8C788;
  --hl-cream-dark:   #1F4A3A;  /* dark dot on cream petal */
  --hl-green-light:  #A3C7B3;

  /* Rule / hairline */
  --rule:         #C99846;
}
```

---

## 8 · DO NOT

✗ אל תשני את צבעי הגרעינים.
✗ אל תשני את צורת הגרעין (path canonical — 5 paths זהים, rotation בלבד מבדילה).
✗ אל תשני את מספר הגרעינים (5 — לא 4, לא 6).
✗ אל תוסיפי outline / stroke סביב הגרעינים.
✗ אל תוסיפי gradient — הקומפוזיציה חייבת להישאר flat color.
✗ אל תוסיפי drop-shadow — ה-mark לא צריך depth מלאכותית.
✗ אל תסובבי את הקומפוזיציה כולה (היא ב-36° offset מסיבה).
✗ אל תפרידי את ה-mark מה-wordmark בלוקאפ.
✗ אל תשני את ה-tagline ("אוכל טוב לא שומרים לעצמנו" — locked).
✗ אל תוסיפי Latin eyebrow מעל wordmark עברי
   (לא `MEHAMAKOR · FROM THE SOURCE` ולא וריאציה).
✗ אל תשתמשי ב-`logo.svg` רגיל על רקע ירוק — השתמשי ב-inverted.
✗ אל תקראי לזה "marketplace", "directory", "אוכל ביתי", "ישר מ".
   זה **מקום של שייכות**.

---

## 9 · Changelog

| Version | Date | Change |
|---|---|---|
| v3.3 | 22 May 2026 | HE wordmark → Suez One 400 (was Frank Ruhl 900). Typography layered: wordmark = identity, tagline = body voice. |
| v3.2 | 22 May 2026 | Petal paths normalized (44 path replacements). `logo-inverted.svg` rebuilt with cream green petal. Favicons direct-rendered. EN wordmark → Caveat 600. |
| v3.1 | 22 May 2026 | Latin eyebrow removed from OG HE. PNGs re-rendered native. OG images created (HE + EN). |
| v3.0 | 22 May 2026 | Ellipse highlights restored per source SVG. URL `mehamakor.online` → `mehamakor.co.il`. OG mark rotations fixed to 36° offset. |
| v2 | 21 May 2026 | First production-asset batch. Rotation 36° applied per FIX 2. |
| v1 | 21 May 2026 | Initial logo concept locked (claude.ai iterative session). |

---

*Brand Hub · v1 launch · MEH-637 closed · 22 May 2026*
