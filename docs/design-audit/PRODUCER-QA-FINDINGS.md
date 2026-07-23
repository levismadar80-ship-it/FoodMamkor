# Producer QA findings — /producers listing + /[slug] detail (Refs MEH-991)

**Date:** 2026-07-04 · **Surfaces:** `/producers` listing + producer detail (`/[slug]` → `ProducerDetail`) · **Viewport:** 390 px mobile, Hebrew RTL · **Method:** Playwright staged capture on `staging.mehamakor.online` (Vercel protection-bypass header, TLS 1.2 cap), logged-out visitor view + logged-in owner view (MEH-999 test account). **READ-ONLY — zero app-code edits.** Cross-referenced against [`DESIGN-GAP-MATRIX.md`](./../DESIGN-GAP-MATRIX.md) (MEH-991 Chunk 1).

**Tier legend (ADR-016):** GREEN = CC end-to-end · YELLOW = plan + per-chunk · RED = chunk-by-chunk (central files). **Severity:** 0 polish → 4 blocker.

**Screenshots:** [`screenshots/producer-qa/`](./screenshots/producer-qa/).

---

## TL;DR

Sapir's two "top priority" defects (giant Latin **MEHA MEKOR** logo in the card + detail hero) are **NOT a code defect — they are test-data contamination.** The MEH-999 audit account uploaded the brand logo file (`logo/logo.png`, which *is* the Latin "MEHA MEKOR" wordmark) as its cover image; both surfaces correctly render `images[0]` with `object-cover`. The canonical no-image fallbacks are entirely different (card = Leaf + Hebrew "מהמקור"; detail = MEH-815 Tinted Masthead), and a real no-image producer (`tases-ferments`) proves it. Of the remaining 5 observed defects: **3 CONFIRMED** (badge crowding, price bidi, stuck-hover green card), **2 partial/plausible** (verify-banner glyph, events middot orphan — could not reproduce the exact artifact with test data). The independent sweep adds **3 matrix-tracked defects seen live** (CARD-08 badge overflow, BIZ-07 double-chrome, card/detail title-wrap asymmetry).

---

## Defect #1 — root-cause trace (giant Latin MEHA MEKOR logo in hero + card) → **REJECTED as code defect; test-data contamination**

**End-to-end path.** The producer whose hero shows the giant "MEHA MEKOR" is the MEH-999 test account (`בדיקת UX — מטבח הבית של קלוד`, id `53e39dec…`). During the MEH-999 dogfood run, its gallery image was set to the repo dev asset `logo/logo.png` — and that file **is** the Latin "MEHA MEKOR" wordmark (serif "MEHA" + bold "MEKOR" + grocery-bag glyph). Live proof: the detail hero `<img src>` resolves to `res.cloudinary.com/.../mehamakor/79cd766d…png` (an uploaded asset), and `[data-testid="gallery-empty-state"]` is **not** rendered (`gallery empty-state visible? false`). So this is `images[0]`, not a fallback.

- **Card path:** `frontend/components/ProducerCard.jsx:186` — `imgSrc = optimizeCloudinary(producer.images?.[0], {aspectRatio:"4:3"})`; rendered at `:250-257` `<Image src={imgSrc} object-cover>`. When `images` is empty → `:258-268` the **canonical** no-photo state: `<Leaf/>` + `{BRAND_NAME}` where `BRAND_NAME = "מהמקור"` (`lib/constants.js:1`, Hebrew). No Latin string, no logo asset.
- **Detail path:** `ProducerDetail.jsx:105-109` → `<ImageGallery images={producer.images || []}>`; `ImageGallery.jsx:102-109` renders `images[current]` `object-cover`. Empty → `:51-84` the MEH-815 **Tinted Masthead** (green `bg-primary/[0.06]` + recessive gold `מ·ה` monogram `:64-69` + producer-name `<h1>`). No Latin logo.
- **No default-cover injection exists.** `imgSrc` reads only `producer.images?.[0]`; grep for `logo.png` / `default.*cover` in ProducerCard/ImageGallery/ProducerDetail = 0. It is **neither** a hardcoded fallback **nor** a default Cloudinary asset on the account — it is one specific image this test account uploaded.
- **Control:** the real no-image producer `tases-ferments` renders the Tinted Masthead (`gallery empty-state visible? true`, `real-detail-noimg-390.png`), and 5 of 6 listing cards render the Leaf placeholder — only the MEH-999 card shows the logo (`producers-listing-390.png`).

**Verdict:** CONFIRMED test-data contamination, not a rendering bug. **Matrix:** CARD-03 + BIZ-23 already describe the correct fallbacks — **no gap**. **Action:** QA hygiene — re-upload a real photo (or clear `images`) on the MEH-999 account; do **not** open a code fix ticket. Sev 0 (code).

## Defect #2 — "MEHA MEKOR" Latin serif as a primary visual → **REJECTED (same root cause)**

Same uploaded logo image as #1. The only Latin brand string in code is `BRAND_NAME_LATIN = "Mehamakor"` (`lib/constants.js:7`) — one word, used **only** as page metadata for non-Hebrew locale (`producers/page.jsx:50`), never rendered as a headline visual. No component renders "MEHA MEKOR" text. Sev 0 (code). No matrix gap.

---

## Observed defects 3–7 (verified)

| # | Observed defect | Verdict | file:line | Matrix | Sev | Tier |
|---|---|---|---|---|---|---|
| 3 | Detail badges (חדש / מוצהר / פתוח להזמנות) crowd the H1 | **CONFIRMED** | `ProducerHeader.jsx:36` H1 shares `flex items-center flex-wrap gap-2` with BadgeRow+TrustBadge+reviews+premium+favorites+AvailabilityBadge (no `limit` on detail) | **BADGE-06** (+ BIZ-02 masthead register) | 2 | YELLOW |
| 4 | Verify-banner "שלחו שוב" spacing + glyph clip at start edge | **PARTIAL** | `VerifyBanner.jsx:50-51` amber band `justify-center gap-3 flex-wrap`; msg glyph `EnvelopeSimple` at `gap-1` | BADGE-14 (no-frame) | 1 | YELLOW |
| 5 | "אירועים קרובים" card lone "." orphan | **PLAUSIBLE — not reproduced** | `ProducerSections.jsx:126-127` ` · ${timeStr}` / ` · ${ev.city}` middot concat | NEW | 1 | GREEN |
| 6 | Card price "מ-35₪/יח'" bidi flip | **CONFIRMED (no isolation)** | `ProducerCard.jsx:378` price span has no `dir`/`.numeric` — unlike rating `:320 dir="ltr"` + distance `:345 dir="ltr"` | CARD-18-adjacent (matrix flags distance, not price) | 2 | YELLOW |
| 7 | Green-tinted card top-right of listing | **CONFIRMED — stuck `:hover`, NOT featured/selected** | `ProducersClient.jsx:403-408` renders card with **no** `active`/`onClick`; `ProducerCard.jsx:238` `hover:border-primary` | NEW (touch `:hover`-stick); related CARD-21 | 2 | GREEN |

**#3 detail.** Live badge chips on the MEH-999 detail: `חדש` (new), `מוצהר` (declared trust tier), `פתוח להזמנות` (availability) — all **real** (not test data). The observed "מוצר" is a misread of "מוצהר" (declared). BADGE-06 spec = "hero: full chip alone, 16 px from name"; code = multi-pill strip inline with the name at `gap-2` (8 px).

**#6 detail.** All 6 live cards return `dir=null` on the price; DOM logical order is `מ-₪35/יח׳` (₪ before digits) which reorders against Sapir's observed visual `מ-35₪/יח'`. The rating and distance siblings in the same card already isolate with `dir="ltr"` — the price is the un-isolated outlier. (Values are seed data via `producer_import.py:238`; the isolation gap is the code defect, independent of the stored string.)

**#7 detail.** At rest all card borders = `rgb(229,223,211)` (border token). After `hover`/`pointerover` the first card border = `rgb(46,104,83)` (primary green). `/producers` never sets `active`, so there is **no** featured or selected state and **no** label to add — the green is the hover state persisting after a tap on a touch screen (mobile `:hover`-stick). Fix direction: neutralize hover on `(hover: none)` pointers.

**#4 detail.** At 390 px the envelope glyph sits tight (`gap-1`) against the message but is **not** clearly clipped; the banner is single-line and centered. Marked PARTIAL — the clipping is likely width/device-specific; Sapir to confirm the exact device that showed it.

**#5 detail.** With full date+time+city the meta line renders inline as `שבת, 25 ביולי · 17:00 · תל אביב-יפו` (`meh999-events-section-390.png`) — **no** orphaned dot. The ` · ` concat pattern can strand a middot on wrap when a segment is empty/very long; I could not reproduce the lone "." with this data. Needs the exact triggering event (likely a missing time or city leaving a dangling separator).

---

## Independent sweep — defects beyond the 7

| Finding | Verdict | file:line | Matrix | Sev | Tier |
|---|---|---|---|---|---|
| Card image stacks **3–4 badges** (חדש + verified seal + עסק מאומת + "+2") — max-2 cap violated | CONFIRMED live | `ProducerCard.jsx:276-296` (BadgeRow limit=2 + TrustBadge + delivery chip + overflow) | **CARD-08** | 2 | YELLOW |
| Detail has **breadcrumb (3-level incl. self) + separate "→ חזרה" back button** (double chrome) | CONFIRMED live | `ProducerDetail.jsx:84-102` | **BIZ-07** | 1 | RED (central) |
| Card title wraps to **2 lines** (`line-clamp-2`) while detail H1 stays **1 line** | CONFIRMED (deliberate density delta) | card `ProducerCard.jsx:311` vs detail `ProducerHeader.jsx:41` | note (CARD-14/BIZ-02 adjacent) | 0–1 | note |
| Card shows "עסק מאומת" (verified) chip while a producer's own detail shows "מוצהר" (declared) — possible verified/declared **semantics mismatch** card↔detail | NEEDS SAPIR (MEH-742 gate) | BadgeRow surface variants | BADGE-10 / MEH-742 | — | YELLOW (audit-only) |

---

## Deploy-lag vs incomplete-fix buckets (per acceptance criteria)

- **(a) already-merged-but-still-visible:** none. No observed defect corresponds to a shipped fix that failed to take — #1/#2 are data, the rest are unfixed.
- **(b) matrix-tracked, not yet swept:** #3 (BADGE-06), #6 (CARD-18 family), CARD-08, BIZ-07. These are known gaps awaiting the MEH-991 Chunk-2 sweep — this run confirms them live at 390 px.
- **(c) genuinely NEW (not in matrix):** #5 (events middot orphan), #7 (touch `:hover`-stick green card), and the price-specific bidi gap in #6 (matrix CARD-18 flags *distance* isolation only, not price). #4 maps loosely to BADGE-14 (no-frame VerifyBanner).
- **test-data (neither):** #1 + #2 — MEH-999 account cover = brand logo. QA hygiene, not a ticket.

---

## Screenshot index

| File | Shows |
|---|---|
| `producers-listing-390.png` | listing; only MEH-999 card shows the logo, 5 real cards show Leaf placeholder; badge stacks; prices |
| `producers-card-hover-390.png` | first card after hover → green border (defect #7) |
| `meh999-detail-hero-390.png` | uploaded logo filling the hero (defect #1); badge crowding (#3); verify-banner (#4) |
| `meh999-detail-full-390.png` | full MEH-999 detail |
| `meh999-events-section-390.png` | "אירועים קרובים" event meta line (defect #5 — no orphan with full data) |
| `verify-banner-390.png` | email-verify amber band (defect #4) |
| `real-detail-noimg-390.png` | **control** — real no-image producer shows the Tinted Masthead, NOT the Latin logo (proves #1 is data) |
| `real-detail-withimg-390.png` | MEH-999 detail via public list |

---

*STOP — Sapir triages into fix tickets. Sev-2 code items to consider: BADGE-06 (#3), price bidi isolation (#6), touch-hover neutralize (#7), CARD-08 overflow cap. #1/#2 = clear the test account's cover image. Central-file items (BIZ-07) need chunked review.*
