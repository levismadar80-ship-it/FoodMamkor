# Impeccable design audit — public reader surfaces (2026-07)

**Date:** 2026-07-09 · **Branch:** `feature/meh-xxxx-impeccable-design-pass` (read-only audit — zero production code changes) · **Refs:** MEH-991 (parity-matrix lane; this audit is the *impeccable-lens* complement, not a parity re-run).
**Context:** root `.impeccable.md` refreshed against the docs SoT in commit 1 of this PR; every lens below was applied with the brand LOCKs as overrides (light-mode-only, fixed-px type tokens, no state-color tokens per ADR-019, flat/no-shadow, Phosphor-only per ADR-013 — decisions, not findings).
**Lenses:** audit · critique · harden · typeset · quieter · optimize (`.claude/skills/*/SKILL.md` checklists applied against actual component code, mobile-first / 375px).
**Method:** 4 read-only surface sweeps (home+nav and about/for-businesses/register via subagents; map+producer-detail and recipes+events via a targeted inline pass after the subagent budget was exhausted mid-run — the map/producer pass is intentionally lighter since that surface is the most densely covered by the existing parity matrix). Every row carries file:line evidence verified against the working tree at audit time.
**Dup-check inputs:** `docs/DESIGN-GAP-MATRIX.md` (249 rows) + open tickets MEH-1047, MEH-815, MEH-970, MEH-1035, MEH-991, MEH-972, MEH-999. Note: **MEH-1035 (CARD-18 Latin distance units) merged Done on 2026-07-09 (PR #1514)** — distance-format findings are excluded as shipped.
**Exclusions (in-flight, audit-skipped):** producer hero/gallery/masthead block (MEH-1047 + MEH-815) · /map location-onboarding + permission flow (MEH-970) · /register/producer wizard (MEH-132/MEH-994) · producer dashboard (MEH-964) · /join (MEH-995).
**Severity language** per `docs/BUG_SEVERITY.md`: high ≈ SEV-2 (lock violation or AA/usability break on a primary flow) · med ≈ SEV-3 (quality/consistency, few users or non-blocking) · low ≈ SEV-4 (cosmetic).
**Dup-check column:** `NEW` = not covered by the matrix or an open ticket · `DUP <row/ticket>` = already tracked, no re-spec here.

---

## Surface: Homepage `/` + nav chrome (Header / BottomNav / Footer)

| ID | Surface | file:line | Finding | Sev | Lens | Dup-check |
|---|---|---|---|---|---|---|
| IMP-01 | / | `frontend/messages/he.json:431` + `frontend/app/[locale]/home/HomeProducersGrid.jsx:50-53` | `home.producers.map_link` = "הצג במפה" — ציווי זכר יחיד ב-UI chrome, הפרת נעילת הקול ADR-014/024 (chrome = gerund/רבים: "הצגה במפה"). חריגה בודדת בזרימה ראשית שסריקות MEH-472/756 פספסו | high | critique | NEW |
| IMP-02 | / | `frontend/app/[locale]/home/HomeHero.jsx:148,157` · `HomeStaticBlocks.jsx:146,262` · `HomeProducersGrid.jsx:155,165` | שלוש גיאומטריות כפתור בעמוד אחד: hero CTA = `rounded-full` (pill על מלבן — אסור בנעילת הרדיוסים; buttons = sm 8px), featured = `rounded-[8px]` (נכון), load-more/empty = `rounded-[16px]`. סחף מערכתי בזרימה הראשית | high | audit | NEW |
| IMP-03 | / | `frontend/components/HeroSearch.jsx:340-393,231-233` | שורות recent/trending הן `<li>` עם `onMouseDown` בלבד — בלי `role`/כפתור; ענף המקלדת (:173) משרת רק autocomplete, חיצים לא עובדים במצב ריק; `aria-controls="hero-search-listbox"` + `aria-expanded` מצביעים על node שלא קיים ב-dropdown הריק. חיפוש = flow ראשי, שבור ל-AT | high | audit | NEW |
| IMP-04 | / | `frontend/app/[locale]/home/HomeHero.jsx:67-77` | תמונת ה-LCP היא CSS `background-image` — אין preload/fetchpriority/srcset; asset 1920w נטען גם ב-375px | med | optimize | DUP HOME-07 |
| IMP-05 | / | `frontend/app/[locale]/home/UpcomingEventsPreview.jsx:49-52` + `HomeStaticBlocks.jsx:35-41` | תמונות אירוע/נצפו-לאחרונה עוקפות את `lib/cloudinary` (URL גולמי, בלי f_auto/q_auto/lazy) — בניגוד לכלל frontend.md; `HomeFeaturedProducer:88` עושה נכון | med | optimize | NEW |
| IMP-06 | / | `frontend/app/[locale]/home/UpcomingEventsPreview.jsx:63` | `₪{price}` — ספרה+מטבע ללא בידוד `dir="ltr"`/`.numeric` (קונבנציית MEH-1031) | med | harden | NEW |
| IMP-07 | / | `frontend/app/[locale]/home/HomeCategoryGrid.jsx:38` · `HomeStaticBlocks.jsx:124,179,214` · `HeroSearch.jsx:404` | tracking 0.14–0.18em + uppercase על eyebrows בעברית — בדיוק הדפוס ש-MEH-867 הסיר מה-Footer ("letter-spacing harms RTL legibility", `Footer.jsx:129-131`). סתירה לתקדים פנימי | med | typeset | NEW (תקדים MEH-867; משיק HOME-17) |
| IMP-08 | / | `frontend/app/[locale]/page.js:201` · `HomeCategoryGrid.jsx:42` · `HomeProducersGrid.jsx:47` · `HomeStaticBlocks.jsx:20,132,182,219,246` | כל H2 בבית נקבע ב-`style={{fontSize:"clamp(...)"}}` inline — 6+ סקאלות fluid אד-הוק שעוקפות את טוקני ה-headline הקבועים; טבלת ה-token-drift במטריצה כבר הזהירה ש"silent per-frame clamp() re-creation in JSX = drift" | med | typeset | NEW (מופע קונקרטי של אזהרת המטריצה §Token drift) |
| IMP-09 | nav | `frontend/components/Header.jsx:473` · `Footer.jsx:192` · `BottomNav.jsx:184` | צבעי state גולמיים ב-chrome: logout `text-red-700`, שגיאת ניוזלטר `text-red-200`, ותווית BottomNav ב-hex קשיח `#4b4841` (תוקן-AA אבל שייך לקובץ הטוקנים) — משפחת ADR-019 | med | audit | NEW (אח של GAP follow-up #12 — AvailabilityBadge) |
| IMP-10 | / | `frontend/components/HeroSearch.jsx:259,337` · `HomeProducersGrid.jsx:165` · `HomeHero.jsx:125` | `bg-white` במקום טוקן `surface` + צללים אפורים-קרים גנריים (`shadow-lg/xl`) במקום צל-המנוחה הירקרק המוסכם; load-more עם `border-2` — הגבול הרועש בעמוד | med | audit/quieter | NEW |
| IMP-11 | / | `frontend/app/[locale]/home/UpcomingEventsPreview.jsx:43-46` · `HomeStaticBlocks.jsx:28-31` · `HomeProducersGrid.jsx:50` | קישורי כרטיסים (אירועים, נצפו-לאחרונה, "הצג במפה") בלי שום `focus-visible` — נגד ההתחייבות "ring על כל אלמנט אינטראקטיבי" | med | audit | NEW (אח של CARD-23) |
| IMP-12 | nav | `frontend/components/BottomNav.jsx:177-180` | מצב compact (בגלילה) מוריד את יעדי המגע מ-44px ל-`min-h-[40px]` — מתחת לרף על הרכיב הכי תדיר בנייד (מתועד כ-tunable MEH-1014) | med | audit | NEW |
| IMP-13 | / | `frontend/app/[locale]/page.js:201-203` · `UpcomingEventsPreview.jsx:33-35` · `HomeProducersGrid.jsx:50-52` | אייקונים 14-16px דבוקים לכותרות FRL של 26-40px — פער סקאלה שקורא כרעש דקורטיבי מעל הרג'יסטר המגזיני (אף כותרת סקשן אחרת לא נושאת אייקון) | low | quieter/critique | NEW |

**Verdict:** העמוד מחזיק את הרג'יסטר המערכתי ברובו (banner יחיד, סקשנים שמסתירים את עצמם, בידוד bidi נכון ברצועת האמון) — הסיכון הוא לא רכיב בודד אלא הצטברות של one-offs "מתועדים מקומית": שלוש גיאומטריות כפתור, שש סקאלות clamp, eyebrows עם tracking, ולבנים/אדומים מחוץ לטוקנים. שני השברים האמיתיים בזרימה ראשית: הצעות החיפוש mouse-only וציווי-זכר בקישור המפה.

## Surface: /map + business page (excl. hero/gallery — MEH-1047/815; excl. location flow — MEH-970)

Lighter targeted pass (see Method). Most parity-class issues here are already matrix rows — recorded as DUP without re-spec.

| ID | Surface | file:line | Finding | Sev | Lens | Dup-check |
|---|---|---|---|---|---|---|
| IMP-14 | business page | `frontend/components/ReviewsSection.jsx:125,370` | שגיאות טופס ביקורת ב-`text-red-600` גולמי — אותה משפחת red-מחוץ-ל-ADR-019 כמו IMP-09/19/26; על קרם text-sm זה גם AA-שולי | med | audit | NEW (מצטרף לאשכול error-styling; משיק LOGIN-06) |
| IMP-15 | /map | `frontend/components/MapProducerCard.jsx:201` | CTA קשר icon-only בקוטר 28px (`w-7 h-7`) + ירוק-WhatsApp — מתחת ל-44px ונגד נעילת "brand green only" | — | audit | DUP MAP-13 + BIZ-11 (פסיקת ספיר תלויה) |
| IMP-16 | /map | `frontend/components/MapBottomSheet.jsx:78` | ידית ה-sheet ב-hex גולמי `#D4C5A9` (מתועד בקוד כ"לא מטוקנן") | low | audit | DUP MAP-11 (+GAP follow-up #12 token-additions) |
| IMP-17 | business page | `frontend/app/[locale]/producer/[id]/components/StickyContactBar.jsx:34` | `bg-white` גולמי במקום טוקן על הבר הדביק | low | audit | DUP BIZ-21 (visual-language row) |
| IMP-18 | business page | `frontend/app/[locale]/producer/[id]/components/ProducerHeader.jsx:44` | H1 = `font-headline-lg text-4xl font-bold` — משקל 700 על טוקן שנעול ל-FRL 900 + גודל אד-הוק; חלק מהאשכול המערכתי IMP-32 | med | typeset | DUP BIZ-02 (36px נפסק ב-MEH-815; **המשקל** 700-מול-900 לא נפסק שם — נכנס ל-IMP-32) |

**Observed-fixed (matrix stale):** `ReviewsSection.jsx:34,61` כבר נושא את הזהב המתוקן `#896714` ואת `#e5dfd3` — שורות ה-Group-1 של המטריצה על הקובץ הזה כבר בוצעו (SVG color props — פטור canvas/SVG). `OpeningHours.jsx:28` מתעד ש"סגור" עבר ל-fg-muted (BIZ-15 נסגר חלקית).

**Verdict:** פערי המפה המהותיים כבר ממופים במטריצה (MAP-02..23) — הפאס הזה לא מצא class חדש מעבר לאשכול ה-red של טפסי הביקורות. עמוד העסק נקי יחסית מחוץ לפערים הידועים.

## Surface: /about + /about/for-businesses + /register (consumer)

| ID | Surface | file:line | Finding | Sev | Lens | Dup-check |
|---|---|---|---|---|---|---|
| IMP-19 | /register | `frontend/app/[locale]/register/RegisterClient.jsx:306,333,373` | הודעות שגיאה `text-red-500` בגודל text-xs על קרם — ניגודיות ≈3.3:1, **נכשל AA על flow קריטי**; `border-red-400` על שדה שגוי ≈2.4:1 (<3:1 ל-UI). red גולמי מחוץ למנגנוני ADR-019 — משותף ל-/login | high | audit | NEW (משיק LOGIN-06 — "never red" lock; register לא מכוסה שם) |
| IMP-20 | /about/for-businesses | `frontend/app/[locale]/about/for-businesses/page.js:112` | Eyebrow ב-`text-accent` זהב בגודל text-xs — `AboutClient.jsx:78-80` מתעד במפורש שזהב נכשל 4.5:1 בגודל הזה ולכן ה-eyebrow הקנוני עבר ל-fg-muted; העמוד הזה נשאר מאחור | med | audit | NEW |
| IMP-21 | /about/for-businesses | `frontend/app/[locale]/about/for-businesses/page.js:123-127,176-181` | שני ה-CTA הראשיים הם `<a href="/register/producer">` גולמיים: אין focus-visible ring, ועקיפת ה-Link של next-intl מאבדת את קידומת ה-locale (משתמש /en מקבל route ברירת-מחדל + full reload) | med | audit/harden | NEW |
| IMP-22 | /register | `frontend/app/[locale]/register/RegisterClient.jsx:296,323` | שדות טופס עם `border` חשוף (gray-200 קר, אין `borderColor` דיפולטי בקונפיג) ובלי רקע — הנעילה קובעת inputs = `surface` לבן על קרם; טופס הקשר ב-/about עושה נכון (`AboutClient.jsx:370`) | med | typeset/audit | NEW |
| IMP-23 | /about/for-businesses | `frontend/app/[locale]/about/for-businesses/page.js:147-150` | טוגל אקורדיון = גליף טקסט "+" מסתובב 45° — ADR-013 קובע Phosphor בלבד ל-UI פונקציונלי; האקורדיון המקביל ב-/about משתמש ב-CaretDown (`AboutClient.jsx:270`) | med | audit | NEW |
| IMP-24 | /about | `frontend/app/[locale]/about/AboutClient.jsx:307,322,341` | אייקון "קדימה" = `ArrowLeft` קשיח — נכון ב-RTL, הפוך ב-locale האנגלי (העמוד מלוקאלז); הקונבנציה בריפו היא Arrow + `rtl:rotate-180` | med | harden | NEW |
| IMP-25 | /about | `frontend/app/[locale]/about/AboutClient.jsx:226` | `rounded-3xl` (24px) — מחוץ לסקאלת הרדיוסים הנעולה (sm8/md12/lg16/xl20); דולף ערך Tailwind דיפולטי | med | typeset | NEW |
| IMP-26 | /about | `frontend/app/[locale]/about/AboutClient.jsx:431` | שגיאת טופס קשר `text-red-600` על קרם ≈4.25:1 ב-text-sm — AA-שולי; אותה משפחת red כמו IMP-19 | med | audit | NEW (אשכול IMP-19) |
| IMP-27 | /about | `frontend/app/[locale]/about/AboutClient.jsx:302-308` | רצועת ה-testimonials מפנה ל-`/contact` בעוד העמוד עצמו מסתיים בטופס קשר (:347-438) — שני מסלולי קשר מתחרים; עדיף עוגן פנימי | med | critique | DUP ABOUT-10 |
| IMP-28 | /about | `frontend/app/[locale]/about/AboutClient.jsx:82,95,107,188,207,239` | גדלים אד-הוק (`text-[13px]…[34px]` + clamps) כמעט בכל צומת טקסט — הטוקנים קיימים ולא בשימוש; אותה מחלה כמו IMP-08 | med | typeset | NEW (אשכול IMP-08) |
| IMP-29 | /about + for-businesses | `AboutClient.jsx:95,106` · `for-businesses/page.js:152,164` | `text-text/90` — de-emphasis דרך opacity-on-text במקום muted/fg-muted (עקרון 5); לא בעיית AA, עקביות בלבד | low | typeset | NEW |
| IMP-30 | /about/for-businesses | `frontend/app/[locale]/about/for-businesses/page.js:141,124,178` | `bg-white` במקום `bg-surface` + `px-[22px]` spacing שרירותי על CTA | low | quieter/typeset | NEW |

**Verdict:** /about חזק (live-region, אקורדיון תקין, grain מאופק) עם פערי עקביות; /about/for-businesses הוא המשטח הכי פחות מלוטש מהשלושה — קדם-מערכת (זהב קטן, "+", `<a>` גולמי); /register עובד טוב פונקציונלית אבל צבע השגיאה שלו הוא ה-high היחיד — בדיוק איפה שמשתמשת הכי צריכה לקרוא.

## Surface: recipes (producer-page section + detail) + events (list + detail)

Note: אין route רשימת-מתכונים עצמאי — "רשימה" = סקשן `#recipes` בעמוד העסק (`ProducerSections.jsx:211-219`), והדף הציבורי היחיד הוא `/[slug]/recipes/[recipe_id]`.

| ID | Surface | file:line | Finding | Sev | Lens | Dup-check |
|---|---|---|---|---|---|---|
| IMP-31 | recipe detail | `frontend/components/public/RecipeDetail.jsx:69-74` | תמונת ה-hero משתמשת ב-`recipe.image_url` גולמי — עוקף את `lib/cloudinary` (בלי f_auto/q_auto/crop); `RecipeCard.jsx:35` באותו feature עושה נכון | med | optimize | NEW |
| IMP-32 | cross-surface | `RecipeDetail.jsx:79` · `EventsClient.jsx:244` · `EventDetailClient.jsx:98` (+ `ProducerHeader.jsx:44` — IMP-18) | סחף משקל מערכתי: `font-bold` (700) מוצמד לטוקני `font-headline-display/-lg` שנעולים ל-FRL **900**, לרוב עם גודל אד-הוק (`text-3xl/4xl/5xl`) שדורס את גודל הטוקן — קול הכותרות המגזיני מאבד את המשקל הקנוני בכל המשטחים המשניים | med | typeset | NEW |
| IMP-33 | recipe detail | `frontend/components/public/RecipeDetail.jsx:44-63` | breadcrumb ידני עם מפרידי `">"` ליטרליים — מצביעים "קדימה" LTR בתוך זרימת RTL, בעוד `EventDetailClient.jsx:85` משתמש ברכיב `Breadcrumb` המשותף; שני דפוסי breadcrumb לאותו job | med | harden/typeset | NEW |
| IMP-34 | event detail | `frontend/app/[locale]/events/[id]/EventDetailClient.jsx:75-81` | hero = div `bg-cover` עם `event.image_url` גולמי — בלי next/image, בלי Cloudinary optimize, בלי dimensions (LCP + CLS על תמונות אירוע כבדות) | med | optimize | NEW |
| IMP-35 | events | `EventDetailClient.jsx:143,150,157` · `EventsClient.jsx:483,492` | כל ה-CTA = `rounded-full` על כפתורים מלבניים — הפרת נעילת הרדיוסים (buttons = sm 8px); מצטרף לאשכול IMP-02 | med | audit | NEW (אשכול IMP-02) |
| IMP-36 | event detail | `frontend/app/[locale]/events/[id]/EventDetailClient.jsx:120` | `₪{price}` ללא בידוד `.numeric`/`dir="ltr"` — אותה משפחה כמו IMP-06 (תקדים MEH-1031) | med | harden | NEW (אשכול IMP-06) |
| IMP-37 | events | `EventDetailClient.jsx:94` · `EventsClient.jsx:442` | צ'יפ קטגוריה `rounded-full` — נגד קונבנציית MEH-764 (צ'יפים = rounded-md, site-wide) שכבר יושמה בצ'יפים אחרים של אותו עמוד | low | audit | NEW (משיק EVENT-05) |
| IMP-38 | recipes (non-public path) | `frontend/components/RecipeStatusBadge.jsx:21-24` | פלטת state גולמית (gray/red/orange) + `bg-[#EAF3DE]` קשיח — לא מרונדר בנתיב הציבורי (dashboard/admin בלבד) | — | audit | DUP BADGE-13 |
| IMP-39 | recipe detail | `frontend/components/public/RecipeDetail.jsx:157,112,123,137` | `bg-white` במקום surface + `text-text/85-/90` opacity-de-emphasis; קישורי breadcrumb/חזרה בלי focus-visible | low | typeset/audit | NEW (אשכולות IMP-29 + IMP-11) |
| IMP-40 | recipe card | `frontend/components/public/RecipeCard.jsx:70-72` | eyebrow "מתכון" ליטרל קשיח (מתועד — MEH-366 mid-flight) + uppercase/tracking על עברית (אשכול IMP-07) | low | harden/typeset | NEW (מגודר ע"י MEH-366) |

**Verdict:** RecipeCard הוא המשטח הנקי ביותר באודיט (טוקנים, Phosphor, logical props, focus-visible, line-clamp — exemplar). RecipeDetail ו-EventDetailClient מפגרים דור אחד מאחורי מערכת-העיצוב — hand-rolled breadcrumb, pills, תמונות גולמיות — כנראה כי נבנו לפני גל ה-Assembly v2 ולא עברו את הפורט שהכרטיסים קיבלו.

---

## Summary — top-10 NEW findings (ranked)

1. **IMP-03** — HeroSearch suggestions mouse-only + phantom `aria-controls` (high, primary flow, AT-broken).
2. **IMP-19** — /register error text fails AA (~3.3:1) on the critical registration flow (high; shared root with /login LOGIN-06).
3. **IMP-01** — "הצג במפה" masculine imperative in home chrome (high, ADR-014/024 voice LOCK).
4. **IMP-02 + IMP-35** — button-radius lock broken across home + events (3 geometries on one page; `rounded-full` on rectangular CTAs in 5 files).
5. **IMP-09 + IMP-14 + IMP-26** — raw red state colors in nav chrome + review/contact forms (ADR-019 family; needs one error-styling ruling, then a mechanical sweep).
6. **IMP-32 (+IMP-18)** — FRL 900 headline-weight lock silently downgraded to 700 across secondary surfaces.
7. **IMP-05 + IMP-31 + IMP-34** — Cloudinary-helper bypass on images in 4 files (perf + consistency; frontend.md rule).
8. **IMP-21** — for-businesses CTAs lose the locale prefix + have no focus ring (routing + a11y on the business-acquisition path).
9. **IMP-11 (+IMP-39)** — focus-visible gaps on interactive cards/links beyond ProducerCard (CARD-23's sibling class).
10. **IMP-07 / IMP-08 (+IMP-28)** — tracked-Hebrew eyebrows against the MEH-867 precedent + inline `clamp()` H2 scales bypassing the fixed-px tokens (one typography-discipline decision unlocks both).

## Suggested fix-ticket chunking (per cluster, rule-27 duplicate-check before opening)

| # | Ticket scope | Covers | Tier (ADR-016) | Gate |
|---|---|---|---|---|
| T1 | Error-state styling ruling + sweep (red → ADR-019-compliant treatment, AA-passing) | IMP-19, 26, 14, 09 (+ LOGIN-06 context) | YELLOW | ruling first: "never red" lock vs current convention — needs Sapir; may need ADR superseding ADR-019 if a color is wanted |
| T2 | Button-geometry normalization to `rounded-sm` tokens | IMP-02, 35 | GREEN | one-line ruling: which geometry wins (tokens say 8px) |
| T3 | HeroSearch keyboard + ARIA repair | IMP-03 | YELLOW | standalone; central-adjacent component |
| T4 | Image-pipeline sweep — route all URLs through `lib/cloudinary`, hero divs → next/image where feasible | IMP-05, 31, 34 (HOME-07 stays in its matrix lane) | GREEN | none |
| T5 | Typography discipline — kill `font-bold`-on-headline-tokens + ad-hoc sizes/inline clamps; decide fixed-vs-fluid once | IMP-08, 18, 25, 28, 32, 39 | YELLOW | decision: fluid H2s = new fontSize token additions per matrix §Token drift, not inline styles |
| T6 | Copy micro-fix "הצג במפה" → neutral | IMP-01 | GREEN | rule-22 copy gate (Sapir approves the string) |
| T7 | /about/for-businesses polish (eyebrow token, Phosphor caret, Link + focus ring) | IMP-20, 21, 23, 30 | GREEN | none |
| T8 | Focus-visible sweep on card links | IMP-11, 39(links) | GREEN | none |
| T9 | Bidi ₪ isolation (MEH-1031 idiom) | IMP-06, 36 | GREEN | none |
| T10 | Tracked-eyebrow ruling (keep or apply MEH-867 sitewide) | IMP-07, 40(tracking) | GREEN after ruling | Sapir decision |

Not re-specced: IMP-04/15/16/17/27/38 are DUP — already tracked in DESIGN-GAP-MATRIX rows (HOME-07, MAP-11/13, BIZ-11/21, ABOUT-10, BADGE-13) or gated on existing rulings.

**Matrix-staleness note for MEH-991:** the Group-1 stale-gold rows for `ReviewsSection.jsx` are done in code (`#896714` at :34,:61) and `OpeningHours.jsx` "closed" is now fg-muted — the matrix checklist can tick those off.
