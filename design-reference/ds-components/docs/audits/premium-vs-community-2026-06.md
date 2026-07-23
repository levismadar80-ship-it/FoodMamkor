# Premium ↔ Community — Brand Calibration Audit

**Ticket:** MEH-537 · Refs MEH-519 (parent epic)
**Branch:** `feature/meh-537-premium-community-audit` (off `staging`)
**Round:** 2 — corrected against live production DOM, fetched 26 Jun 2026
**Scope:** Recommendations only. No brand tokens, logo, hero copy, or production code touched.
**Attachment:** designed HTML version with mobile + desktop mockups → `docs/audits/premium-vs-community-2026-06.html`

> **Thesis (unchanged):** מגזין, לא marketplace. Three words carry every move — **חום (בית) · שייכות · סיפור**.

---

## Confidence calibration

Round 1 was scored **without** live-DOM access (flagged honestly at the time). The orchestrator then fetched the live `mehamakor.co.il` home page (26 Jun 2026). Scores below are reconciled against the real server-rendered strings — **three sections changed (§3, §4, §5)**.

One section stays **provisional**: the founder quote (§4) is **not** in the home server-rendered DOM (lazy/client-mounted), so it is scored on component form only — not confirmed on home.

All producer names/quotes in the mockups (e.g. „מאפיית רותם") are **illustrative placeholders** — this audit has no DB access. Production must bind real producer data and the verified kashrut-authority name.

---

## Phase 1 — Spectrum scores

Scale: **1** = cold premium (faceless, catalog-perfect, claims without people) · **5** = warm community (faces, founder voice, earned trust, a story you can touch). Target ≈ 3.5.

| # | Surface | Score | Verdict | Confidence |
|---|---------|:---:|---------|------------|
| §1 | Hero | **2** | Magazine cover — but a faceless one | High (live-confirmed) |
| §2 | Categories grid | **3** | Boutique — and the craft is real | High (live-confirmed) |
| §3 | Filter row | **3** ↑ | A dietary filter bar — not a promises-wall | High (live evidence) |
| §4 | Sapir's quote | **3\*** | Campaign frame — but not confirmed on home | Provisional |
| §5 | Producer CTA | **4** ↑ | Already warm — leads with belonging + sign-off | High (live evidence) |

**Average: 3.0** (was 2.4 in round 1). \*§4 scored on component form only; absent from the home server DOM. **Projected after the recommendations: ≈ 3.6.**

### §1 — Hero · 2/5 — *magazine cover, or luxury catalog?*
**Magazine cover — but a faceless one.** Live-confirmed: imageless masthead, H1 „אוכל מקומי, במקום אחד", subtitle „ישר מהמקור אלייך. עסקים שכבר בדקנו בשבילך.", search „חיפוש בתי עסק וערים". The subtitle does warm work in words (feminine address „אלייך" + curation „בדקנו בשבילך"), and the FRL-900 typographic restraint reads as a *cover*, not a catalog. But with no producer face, the first thing a skeptical mother sees in her 3-second scan is typography, not a person — facelessness caps it at 2. *Round-1 read confirmed correct; kept.*

### §2 — Categories grid · 3/5 — *market, or boutique?*
**Boutique — and the craft is real.** Live-confirmed 6 numbered categories: בשר עוף ודגים / ירקות פירות ומשקים / חלב וגבינות / לחמים ואפייה / שמנים / טיפוח וסבונים. Hand-drawn single-weight glyphs (ADR-013 tier 2) read curated, not a market aisle — the drawn-by-hand quality is itself warmth. Lands at 3, not higher, because monochrome line-on-cream stays gallery-cool: it doesn't yet carry a person or a place. *Kept.*

### §3 — Filter row · 3/5 ↑ (was 2) — *claims-wall, or honest utility?*
**A dietary filter bar — not the promises-wall I assumed.** **Correction:** the live DOM shows **7 functional filter chips** under „בתי עסק מומלצים": **כשר · אורגני · ללא גלוטן · טבעוני · ללא לקטוז · משלוח · מאומת בלבד**. These are dietary/verification *filters* a shopper toggles, not marketing badges. My round-1 labels (מקומי / מומלץ / טרי יומי / משפחתי) **do not exist** on home — discarded. As a filter bar it's honest functional UX — fairly neutral on the spectrum, with one quiet curation signal in „מאומת בלבד" (verified-only). If the brief's 8-attribute trust strip exists, it lives **elsewhere** (e.g. /about values or producer detail), not on home — I will not score a home claims-wall that isn't there. Earning the one trust chip → see **R-D**.

### §4 — Sapir's quote · 3/5 (provisional) — *personal, or testimonial?*
**Founder voice in a campaign frame — but not confirmed on home.** **Correction:** the quote („כל בית עסק כאן עבר דרכי") is **not in the home server-rendered DOM** — it is lazy/client-mounted, so I cannot confirm it appears on home at all. Scored on component form only: `ParallaxQuote` renders it *centered*, white italic, over an `rgba(46,74,46,.6)` overlay with a Ken Burns push — the grammar of a hero-campaign testimonial, not a personal aside. If/where it mounts, left-set, signed, smaller beside her face would read as a letter (→ R-B). **Held provisional until live placement is confirmed.**

### §5 — Producer CTA · 4/5 ↑ (was 2) — *inviting, or transactional?*
**Already warm — corrected upward.** **Correction:** the live copy does the warm work itself:

> „יש לך עסק? בואו אלינו"
> „מהמקור הוא הבית של בתי עסק מקומיים בישראל. כל עסק כאן נבחר אישית. עמוד מלא, תמונות, סיפור — שלכם. נשמח להכיר."
> button: „הוסיפו את העסק שלך"

That is belonging („הבית של"), curation („נבחר אישית"), story-is-yours („סיפור — שלכם"), and a human sign-off („נשמח להכיר") — an invite, not a qualification gate. It also avoids category enumeration. My round-1 score of 2 ("acquisition tone") was wrong — I hadn't seen the body copy. Held back from 5 only by being text-only (no founder face/hand yet); R-B's signature is the small remaining lift.

---

## Phase 2 — Recommendations

Four low-effort warmth moves, ordered by warmth-per-hour. Each passes an explicit brand-LOCK check. Mockups (mobile 375px + desktop) are in the HTML attachment.

### R-A — Producer faces on cards & producer-detail (NOT the home hero)
- **Warmth token:** real producer photos · aligns Natoora producer-first · per 05-photography-style
- **Effort:** 6–10h · **Risk:** Medium
- **What:** Apply real portraits to the **producer card grid and producer-detail page**. The **home hero stays imageless by ADR-018** (locked Direction A) — this rec does not touch it. Where a producer has a portrait, the card/detail leads with a face; the typographic treatment stays the fallback when there's no photo.
- **Brand-LOCK check:** ✅ Stock farm photos forbidden — real producer faces only (mockups show labelled slots, not invented imagery). ✅ ADR-018 home hero untouched (target is card + detail only). ✅ No shadow-lift / glassmorphism. ✅ System degrades gracefully to the typographic fallback.
- **Verdict:** **Ship.**

### R-B — Sapir's handwriting as a sparing accent (1–2 places)
- **Warmth token:** handwriting digitized · Cherry Bombe founder accountability
- **Effort:** 2–3h · **Risk:** Low
- **What:** Digitize Sapir's signature once as a single-weight SVG; place it in **exactly two** spots — (1) signing the founder quote wherever it mounts (turns a centered testimonial into a letter, §4); (2) beside „נשמח להכיר" on the producer invite. The invite is **already warm in copy (§5 = 4)** — the signature is **not a rescue**, it supplies the one human element the text-only block lacks. **Copy change:** the round-1 mock copy „אם אתם אופים, מבשלים או מגדלים…" is **removed** — it was a partial category list brushing the home-cook anti-pattern. The proposed mock now **preserves the live invite copy verbatim** and adds only the signature. The live invite already avoids enumeration; we keep it that way.
- **Brand-LOCK check:** ✅ Type LOCK — a single illustrative SVG (ADR-013 editorial tier), not a new UI typeface; FRL + DM Sans unchanged. ✅ "Sparing — 1–2 places" honored literally. ✅ Voice ADR-014 — live CTA stays plural/gerund („הוסיפו את העסק שלך", „בואו אלינו"); narrative-"we" („נשמח להכיר") feminine-allowed; owner noun „בית עסק", never „יצרן". ✅ No emoji, no gradient/blur.
- **Verdict:** **Ship.**

### R-C — Founder visit signal „ביקרתי כאן…" (CANDIDATE-NEEDS-JUSTIFICATION)
- **Effort:** 3–4h · **Risk:** Medium
- **LOCK check — accountability, or periodical-stamping?** The LOCK bans time-stamped *periodical* framing („ISSUE 01", „SPRING 2026") that dates the whole publication. A founder-visit line dates **one relationship** ("I, Sapir, stood in this kitchen") — accountability metadata bound to a single producer, not an edition marker. **It clears the LOCK only under constraints:** ① attach to the **producer story, never the masthead/home**; ② phrase as a personal act + **season, never a bare date chip**; ③ **no recency-decay UI** (no "visited 4 months ago" countdown).
- **Proposed copy (producer page):** „ביקרתי כאן בחורף האחרון. טעמתי לפני שהזמנתי." — ספיר
- **Brand-LOCK check:** ✅ Cleared *by constraint* (relationship-level, seasonal, story-scoped, no decay UI). ⚠️ Residual risk — a bare date chip or home placement would re-trip the LOCK; guardrail = season-phrasing + story-scope only. ✅ Voice/noun fine.
- **Verdict:** **Ship — constrained, founder sign-off required.**

### R-D — Earn the „מאומת בלבד" filter chip + a flat paper ground
- **Warmth token:** warmer ambient (flat grain only) · earn the one trust chip, not the diet filters · The Infatuation anti-Yelp
- **Effort:** 2–4h · **Risk:** Low
- **What (rebuilt against the real surface):** The home row is a real **dietary/verification filter bar** — leave it a filter. **„מאומת בלבד" is the one chip that's a trust claim, not a diet**, so give **only that chip** a tap-through explaining what verification means: „כל עסק כאן נבחר אישית. בדקנו לפני שהוספנו — בלי תשלום על מקום ברשימה." Do **not** bolt provenance onto „טבעוני" / „ללא גלוטן" — those are facts the shopper filters by, not things to vouch for. Second move: a single **flat paper-grain** under the cream page — flat only, never gradient/blur/glass.
- **Removed from round 1:** the home date-chip „ספיר בדקה · חורף 26'" — it re-tripped the very time-stamp LOCK R-C is built to honor. Gone.
- **Brand-LOCK check:** ✅ No gradient/blur/glass — single flat grain at the same `#F5F0E8`. ✅ Filters stay filters — explainer touches only „מאומת בלבד". ✅ Phosphor regular, no Lucide/duotone. ✅ No date on home; ADR-019 colors (gold + `--fg-muted`) only.
- **Verdict:** **Ship.**

### Reconciling R-C and R-D — no double date-stamp
These two must not collide. **R-C** puts a founder-visit line on the **producer page** — seasonal, never dated, sign-off-gated. **R-D** explains the „מאומת בלבד" chip at the **filter level** — purely qualitative ("selected personally, checked before listing"), with **no date and no per-visit claim**. The round-1 R-D home date-chip („ספיר בדקה · חורף 26'") is removed because it re-tripped the time-stamp LOCK. **Dates live nowhere on home; the only time signal is R-C's seasonal phrasing, on the producer story, behind Sapir's sign-off.**

---

## Implementation order (separate ticket, Sapir opens after selecting)
1. **R-B** (signature, 2–3h) + **R-D** (chip explainer + grain, 2–4h) — lowest risk, immediate warmth.
2. **R-A** (faces on card/detail) — gated on the photography pipeline.
3. **R-C** (visit line) — last, after Sapir signs off on the constrained form.

Projected spectrum move: **3.0 → ≈ 3.6**, thesis untouched.

---

## Verification (round 2)
1. ✅ `docs/audits/premium-vs-community-2026-06.md` exists in repo (this file).
2. ✅ §3 / §4 / §5 re-scored with live evidence cited; spectrum + projected delta updated (2.4 → 3.0; projected ≈ 3.6).
3. ✅ R-D has no home date-chip and is reconciled with R-C in writing (above).
4. ✅ R-B copy uses generic framing — live invite copy preserved verbatim, no category enumeration.
5. ✅ R-A target component named (producer card / producer-detail), explicitly **not** the home hero.
6. ✅ Producer copy labelled **illustrative placeholder** (no DB access); kashrut-authority name flagged for production binding.

---

## Repo handoff (apply on the implementation branch)
- **CHANGELOG:** `design-audit: premium vs community calibration`
- **PR body** ends with:
  ```
  Refs MEH-519
  Closes MEH-537
  ```

*Inspiration locked: Kinfolk · Natoora · Cherry Bombe · The Infatuation · Smitten Kitchen.*
