# PRODUCER-QA-FINDINGS — consolidated producer-surface defect triage (Refs MEH-999)

**Date:** 2026-07-04 · **Run:** Claude Code, read-only discovery. **Zero app-code edits.**
**Inputs consolidated:** (A) Sapir's mobile visual-QA screenshots of the test producer
`בדיקת UX — מטבח הבית של קלוד` (id `53e39dec-da59-4523-9ce5-3d3c8039e42b`); (B) the 4 hard
blockers logged in the MEH-999 dogfood comment (posted 04/07 09:31).
**Baseline:** `origin/staging` @ `315d9d8`. **Live check:** Playwright 390px against
`staging.mehamakor.online` (Vercel bypass headers, TLS 1.2 per rules), 04/07.
Screenshots: [`screenshots/producer-qa/`](./screenshots/producer-qa/).

**Parallel-session cross-check (verified, no overlap on the blockers):**
- **MEH-1011** (Done — PR #1465 backend/migration + #1483 admin UI): admin **request-changes**
  flow. Fixes the *admin-approve* dead-end 422, **not** the producer-facing PUT-license 422
  (blocker #10) — different endpoint (`admin.py` vs `producer_me.py:176`). No overlap.
- **MEH-1017** (Done, SHIPPED 04/07): edit-tab self-service editors — **categories / images /
  location**. Does **not** add a product editor (blocker #9 still open) and does not touch the
  vacation, license-gate, or review-reply surfaces.
- **MEH-1023** (#1486): admin *users* overflow menu — unrelated to producer surfaces.
- **MEH-1025** (Backlog): producer-dashboard `requested_changes` banner — closes the MEH-1011
  loop on the producer side; context only, not one of the 11 findings.

---

## TOP-PRIORITY ROOT-CAUSE — the giant Latin "MEHA MEKOR" hero (findings A1/A2/A7)

**Trace, end to end:**
1. Detail hero routes imageless profiles to the **MEH-815 Tinted Masthead** —
   `frontend/components/ImageGallery.jsx:51-84` renders `bg-primary/[0.06]` + gold **Hebrew**
   `מ·ה` monogram + `<h1>{producerName}</h1>` **only when `images.length === 0`**
   (`ProducerDetail.jsx:104` passes `producer.images || []`).
2. The test producer **has an image** — live DOM: `producer.images[0]` =
   `res.cloudinary.com/dfzpscjks/image/upload/.../mehamakor/79cd766d534f4d3e96c8d8e8cb49441a.png`
   (389×255). `hasEmptyState` probe = **false**; the page `<h1>` is the normal
   `ProducerHeader.jsx:41` 36px name. So the **normal cover path renders**, not the masthead.
3. **The "MEHA MEKOR" Latin serif is baked into the uploaded PNG pixels** — a brand-placeholder
   graphic (bag glyph + `MEHA` thin serif + `MEKOR` bold-green serif on pale green). It is
   **not** produced by any component, font fallback, or code path.

**Verdict on the three hypotheses in the brief:**
- ❌ **Not deploy-lag / stale build** — reproduced live on `315d9d8` today.
- ❌ **Not a hardcoded divergent fallback** — the code fallback (ImageGallery empty-state) is the
  correct Hebrew masthead; it simply never fires because an image exists.
- ✅ **It is an uploaded "default account asset"** — a placeholder graphic sitting in the test
  producer's `images[]`. **One-off, not systemic:** there is no default-cover seeding on producer
  create (grep clean), `frontend/public/placeholder-image.png` does not exist, and the
  `79cd766d…png` is a manually-uploaded Cloudinary asset — it is not auto-assigned to any
  no-photo producer.

**Consequence:** this is a **data/asset fix, not an app-code defect.** Remove the placeholder
image → the producer correctly falls back to the MEH-815 Hebrew masthead (the intended
"cream + Hebrew wordmark" idiom). **A7's green-tinted listing card is the identical asset**
(pale-green baked into the PNG), not a hover / selected / featured state (see A7).

---

## Consolidated triage table

Severity 0–4 (4 = hardest blocker). Tier per ADR-016 (GREEN = CC end-to-end · YELLOW = plan+chunks
· RED = auth/central/schema chunk-by-chunk). "Matrix" = DESIGN-GAP-MATRIX row, else NEW.

### Group (a) — already-merged-but-visible / deploy-lag-vs-stale (re-check on fresh deploy)

| # | Finding | Src | file:line | Verdict | Matrix/NEW | Sev | Tier | Fix direction | Fixed-by |
|---|---|---|---|---|---|---|---|---|---|
| A5 | `אירועים קרובים` card — orphan lone "." on its own line | A | `ProducerSections.jsx:126-127` | **REJECTED on live** | NEW | 1 | GREEN | Live event line renders clean: `שבת, 25 ביולי · 17:00 · תל אביב-יפו` — no orphan period. Code uses conditional `·` middot, no bare-`.` path. Stale screenshot **or** a null-field data edge on an older render — re-check against Sapir's exact screenshot. | — |

### Group (b) — matrix-tracked, not yet swept

| # | Finding | Src | file:line | Verdict | Matrix/NEW | Sev | Tier | Fix direction | Fixed-by |
|---|---|---|---|---|---|---|---|---|---|
| A3 | Detail H1: badges (`חדש` / `מוצהר` / `פתוח להזמנות`) crowd the title, no breathing room | A | `ProducerHeader.jsx:36-64` | **CONFIRMED** | BIZ-02-adj / NEW | 2 | YELLOW | One `flex items-center flex-wrap gap-2 mb-2` row holds h1 + `BadgeRow` + `TrustBadge` + review chip + premium chip. Split the name into its own row; move badge/meta to a second row with top margin. | — |
| A6 | Card price (`מ-35₪/יח'`) lacks unicode-bidi isolation → RTL-flip risk | A | `ProducerCard.jsx:377-380` | **CONFIRMED (code)** | CARD-18 family | 2 | RED (central) | `priceLabel` span has **no** `dir`/`bdi` (distance at `:345` has `dir="ltr"`). Wrap in `<bdi>` / isolate the numeric+₪ run while keeping the Hebrew `מ-` prefix LTR-neutral. Verify visually on `מ-70₪/שק״ג` too. | — |

### Group (c) — NEW (asset/data, functional blockers, and unverified)

| # | Finding | Src | file:line | Verdict | Matrix/NEW | Sev | Tier | Fix direction | Fixed-by |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Giant Latin `MEHA MEKOR` serif fills the hero (card + `/[slug]`) | A | Cloudinary `…79cd766d…png` (data); `ImageGallery.jsx:51-84` (correct fallback, doesn't fire) | **CONFIRMED — asset** | NEW (data) | 2 | GREEN (data) | **Not code.** Replace the test producer's placeholder cover with real food photos, or remove `images[]` → correct MEH-815 Hebrew masthead appears. If this graphic recurs on other accounts, it's manual re-uploads, not seeding. | — |
| A2 | `MEHA MEKOR` Latin serif as primary visual — brand violation (Latin = accent only) | A | same PNG asset | **CONFIRMED — asset** | NEW (data) | 2 | GREEN (data) | Latin serif is inside the uploaded PNG, not a component. Same fix as A1; if a branded "no-photo" placeholder graphic is ever wanted, it must use the Hebrew wordmark idiom, not Latin. | — |
| A7 | Green-tinted card (listing top-right) — featured? selected? stuck-hover? | A | same PNG asset; `ProducerCard.jsx:238` | **CONFIRMED — asset (state-bug REJECTED)** | NEW (data) | 1 | GREEN (data) | **Not** featured/hover/selected. No featured concept exists on the card; `active` (green ring `:238`) is passed **only** by `MapCardList.jsx:65`, never on `/producers` (`ProducersClient.jsx:403`). The tint is the pale-green baked into the same placeholder PNG. Same fix as A1. | — |
| A4 | Email-verify banner: `שלחו שוב` spacing + start-edge glyph clip | A | `VerifyBanner.jsx:50-66` | **UNVERIFIED (needs authed capture)** | NEW | 1 | GREEN | Code shows `flex items-center justify-center gap-3 flex-wrap px-4`; no structural clip. Banner is auth-gated (mounts site-wide `layout.js:221` but self-hides unless authed+unverified) — could not reproduce headless. Re-capture at 390px logged-in as the pending producer; if it's a wrap artifact, adjust `gap`/`px`. | — |
| B8 | Vacation mode impossible — 422 loop | B | `dashboard/page.js:124-151,353` + `producer_me.py:384` | **CONFIRMED still live** | NEW (MEH-999) | 4 | RED | Radio click fires immediate `POST /availability-state` with no date → 422 → catch refetch reverts optimistic `on_vacation` → date input (renders only when state==`on_vacation`, `:353`) vanishes. Render the date input on button focus/pending and POST only once a date exists (or default `vacation_until` +7d). | — |
| B9 | No UI path to add a product — `ProductsSection` orphaned | B | `settings/page.jsx:814` (defined); render count **0** | **CONFIRMED still live** | NEW (MEH-999) | 4 | YELLOW | `<ProductsSection>` never mounted anywhere (grep 0). MEH-1017 added category/image/location editors but **not** products. Mount it in `BusinessTab` or add a "מוצרים" card to the Edit tab. | — |
| B10 | Profile-save 422 while license-pending | B | `producer_me.py:176` | **CONFIRMED still live** | NEW (MEH-999) | 3 | RED | `PUT /producers/me` calls `ensure_license_for_categories(…, effective_license)` with **no `license_pending` bypass** → 422 on any save for a license-pending producer. **Distinct from MEH-1011** (that fixed the admin-approve 422). Mirror the register-flow `license_pending` bypass here. | — |
| B11 | Cannot reply to a review — feature absent | B | `reviews.py` (no endpoint); `models.py:806` (`ProducerReview`, no reply field) | **CONFIRMED still live** | NEW (MEH-999) | 3 | YELLOW | No producer-reply anywhere: reviews router has only GET/POST-consumer/DELETE/admin; model has no reply column; `ReviewsSection.jsx` uses `isOwner` only for the empty-state. Needs schema + endpoint + UI → file as a **v2.1 feature**, not a one-liner fix. | — |

### Independent-sweep extras (beyond the 11)

| # | Finding | file:line | Verdict | Sev | Note |
|---|---|---|---|---|---|
| S1 | Cookie banner overlaps the BottomNav pill at 390px | `CookieBanner.jsx:68` (z-1100) over `BottomNav` (z-1000) | CONFIRMED (visible in `01`/`02`) | 1 | Matches the MEH-999 below-top-10 note; first bottom-nav tap of a session hits the banner. |
| S2 | Listing card for the test producer also shows the placeholder cover (not real photos) | same `79cd766d…png` | CONFIRMED | 1 | Folds into A1 — the same asset on the card surface. |

---

## Counts per group

- **(a) deploy-lag / stale:** 1 (A5)
- **(b) matrix-tracked-not-swept:** 2 (A3, A6)
- **(c) NEW:** 8 — asset/data 3 (A1, A2, A7), unverified 1 (A4), functional blockers 4 (B8–B11)
- **Independent-sweep extras:** 2 (S1, S2)

**Confirmed still-open blockers (sev ≥ 3):** 4 → B8 (sev 4), B9 (sev 4), B10 (sev 3), B11 (sev 3).
**Confirmed visible-but-not-code (asset/data):** A1, A2, A7 → single data fix (replace/remove the
placeholder cover). **Rejected as reported:** A5 (not on live), A7-as-state-bug.

## Confidence notes
- **file:line evidence** given for every CONFIRMED code finding.
- **A4** — I could not reproduce (auth-gated banner, headless); code shows no structural clip →
  flagged for an authed 390px re-capture.
- **A5** — clean on live; deploy-lag vs stale-screenshot indistinguishable without Sapir's exact
  frame → flagged for re-check.
- **A6** — the missing bidi isolation is objectively true in code; whether a *visible* flip occurs
  depends on the exact `price_range` string (JUDGMENT — verify on the two live examples).

**STOP — read-only run.** Sapir triages these into fix tickets. No app code was changed.
