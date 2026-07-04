# PRODUCER-QA-FINDINGS — consolidated producer-surface defect triage

**Date:** 2026-07-04 · **Type:** READ-ONLY discovery audit (zero app-code edits) · **Refs:** MEH-999
**Branch:** `claude/producer-defects-audit-g64u70` (findings doc + screenshots only)
**Baseline:** working tree `HEAD == origin/staging` exactly (`git rev-list --count HEAD ^origin/staging` = 0) — every code verdict below reflects the current staging tree, not un-merged work.

## What this is

One consolidated triage table merging two input streams:

- **Stream A — visual/layout defects** from Sapir's 390px mobile QA of the test producer
  *"בדיקת UX — מטבח הבית של קלוד"* (`/producer/53e39dec-da59-4523-9ce5-3d3c8039e42b`,
  no genuine cover photo).
- **Stream B — the 4 hard blockers** already logged in the MEH-999 dogfood report (04/07).

Each finding is verified against current code with `file:line`, cross-checked against a live 390px
Playwright walk of `/producers` + the test-producer detail (staging, TLS-1.2 cap + Vercel bypass
header), mapped to a `DESIGN-GAP-MATRIX` row or marked NEW, and checked for overlap with parallel
sessions. **No fixes** — Sapir triages each row into a fix ticket.

## Parallel-session overlap check (no overlap found)

- **MEH-1011 / MEH-1023 branches do NOT exist on the remote** (`git ls-remote origin` — the reliable
  negative check per CLAUDE.md "Known Bug Patterns"). Per HANDOFF, MEH-1023 = *admin-users role
  overflow menu* (central **admin** surface) — unrelated to any producer surface. MEH-1011 is not
  referenced anywhere in the tree or remote.
- The only parallel session touching a producer surface is **MEH-1002** (PR #1452 — completeness
  6th field "תיאור קצר"), already reflected in the matrix (COMPL-08 / DASH-06). It does not touch
  any finding below.
- **`already-fixed-by` = none** for every finding. Nothing here was resolved by a parallel session.

---

## Consolidated triage table

Severity: 0 = non-issue · 4 = task-blocking. Tier: GREEN (CC end-to-end) · YELLOW (plan + summary) ·
RED (chunk-by-chunk / central / schema / auth). `already-fixed-by` = none for all rows.

### Group (a) — already-merged-but-visible (deploy-lag vs incomplete-fix vs data)

| # | Finding | Src | file:line | Verdict | Matrix row / NEW | Sev | Tier | Fix direction |
|---|---|---|---|---|---|---|---|---|
| 1 | Giant Latin **"MEHA MEKOR"** serif fills the hero (card **and** `/[slug]` banner) on the no-cover test producer | A | code fallback: `ProducerCard.jsx:258-268` + `ImageGallery.jsx:51-84` (both Hebrew-only, correct); Latin comes from account image data | **CONFIRMED (visual) / root-cause = DATA, not code** | NEW (data artifact; code = CARD-03 / BIZ-23 already GREEN) | 3 | **DATA** (no code tier) | See root-cause box below. Verify the account's `images[]` / cover origin in DB/admin; if a *default/placeholder* cover with Latin branding is served to producers, replace it with a Hebrew asset; if a one-off test upload, it is a data artifact (no code bug). |
| 2 | "MEHA MEKOR" Latin serif as **primary visual** = brand violation (Latin = accent only) | A | serif is expected: `tailwind.tokens.json:33-35` + `globals.css:159-161` (FRL). No Latin string in card/hero code. | **REJECTED (code)** — same root as #1 (data) | NEW (dup of #1) | 3 | DATA | Resolve via #1's data check. The serif rendering is correct; the *text content* is a Latin image asset, not code copy. |
| 7 | Green-tinted card in `/producers` grid (top-right) — hover / selected / featured? | A | grid passes no `active`/`onClick`: `ProducersClient.jsx:401-409`; only green states are `hover:border-primary` + `group-hover:text-primary` (`ProducerCard.jsx:238,311`) | **REJECTED** — no featured/selected/green-bg state exists | NEW (dup of #1) | 0 | — | Not a state bug. The "green tint" **is the #1 cover-image graphic** (green bg + Latin wordmark) of the same test card. No label because there is no featured feature. (Optional: gate `hover:` behind `@media (hover:hover)` to kill stuck-hover border on touch.) |

**Root-cause box — defect #1 (TOP PRIORITY), traced end to end:**

1. **Code fallback is Hebrew-only and correct.** No-photo `ProducerCard` renders cream `bg-background` +
   `<Leaf size={60}>` + `BRAND_NAME` = `"מהמקור"` (`ProducerCard.jsx:258-268`, `lib/constants.js:1`).
   The detail hero imageless branch (`ImageGallery.jsx:51-84`) renders cream + 6% green tint + the
   producer's own **Hebrew** name in `<h1>` + a recessive **"מ·ה"** Hebrew monogram; `ProducerHeader.jsx:40`
   omits its own h1 when imageless (MEH-815). Grep for `MEHA MEKOR`/`MEHAMAKOR` across the card + hero
   components = **zero hits**. Latin `"Mehamakor"` lives only in SEO constants (`lib/constants.js:7`),
   `logo-*-en.svg`, and `og-image.png` — none imported by the card or hero.
2. **Deploy-lag is RULED OUT by live cross-check.** On the same live staging deploy, producer
   `tases-ferments` (also no cover) renders the **correct Hebrew "מ·יה" tinted-masthead monogram**
   (screenshot `detail-tases-ferments--390.png`). If the live bundle were stale, that producer would
   show the wrong fallback too. It does not → the deployed fallback code is current and correct.
3. **Therefore the cause is DATA.** The test producer's detail DOM loads real Cloudinary images
   (`res.cloudinary.com/.../mehamakor/79c…` — probed live), and the hero visually shows the Latin
   graphic (bag icon + two-tone serif "MEHA MEKOR", `detail-test-producer-hero--390.png`). The asset is
   **not** in the repo and **not** seeded in code (`grep 1783153683|79c|62bac5de` across repo = 0), so it
   is account-level image data routed through the *image* branch, not the fallback.
4. **What I cannot determine from the sandbox** (Railway/DB egress blocked): whether that Latin graphic
   is a **seeded/default placeholder cover** assigned to producers, or a **one-off upload** by the
   dogfood tester. That single fact decides "product bug" vs "test-data artifact" — Sapir should check
   the account's cover origin in admin/DB. **Confidence:** code path — certain; deploy-lag — ruled out;
   default-vs-upload — unknown, needs data check.

### Group (b) — matrix-tracked, not previously swept (confirmed live-visible)

| # | Finding | Src | file:line | Verdict | Matrix row / NEW | Sev | Tier | Fix direction |
|---|---|---|---|---|---|---|---|---|
| 3 | Detail H1: trust badges (חדש / מוצהר / פתוח להזמנות …) crowd the title, no breathing room | A | `ProducerHeader.jsx:36` (`flex items-center flex-wrap gap-2 mb-2`), h1 `:41-44`, then BadgeRow/TrustBadge/review/premium/AvailabilityBadge all siblings in the same row | **CONFIRMED** | BADGE-06 / BIZ-02 adjacent (spacing not previously itemized) → effectively NEW | 2 | YELLOW | Give the H1 its own line (`basis-full`/`w-full`) or add `mt`/separation before the badge cluster. Symmetric `gap-*` → no RTL issue. |
| 6 | Card price "מ-35₪/יח'" — missing unicode-bidi isolation (RTL flip risk) | A | `ProducerCard.jsx:377-380` — price span has **no** `dir="ltr"`, no `.numeric`, no LRI/PDI, unlike the rating span at `:318` (`dir="ltr"`) | **CONFIRMED** | CARD-18 family (Latin-numeral bidi) — NEW sibling | 1 | GREEN | Add `dir="ltr"` or `className="… numeric"` to the price span (mirror `:318`; `.numeric` = `unicode-bidi: isolate`, `globals.css:126-128`). |

### Group (c) — NEW (not in the matrix; surfaced by this audit)

| # | Finding | Src | file:line | Verdict | Matrix row / NEW | Sev | Tier | Fix direction |
|---|---|---|---|---|---|---|---|---|
| 4 | Email-verify banner: "שלחו שוב" spacing + start-edge glyph clip | A | `VerifyBanner.jsx:50-61` — resend is a padding-less bare text link; separation only via parent `gap-3`. **No clip mechanism in code** (no overflow-hidden / negative margin / absolute icon) | **PARTIAL** — spacing real; clip is a render artifact, not a code bug (owner-dashboard-only; not reproducible on public surfaces) | NEW (BADGE-14 lists VerifyBanner, no frame) | 1 | GREEN | Give the button explicit `px`/min-height + `shrink-0` on the `EnvelopeSimple` icon. Re-shoot on the owner dashboard to confirm the glyph clip. |
| 5 | "אירועים קרובים" card shows an orphan lone "." on its own line | A | `ProducerSections.jsx:95-158` — meta line `:126-127` uses " · " middots, **no trailing period**; no lone-"." JSX anywhere in the `producer/[id]` tree | **REJECTED (code)** — orphan "." is DATA (a `whitespace-pre-line` description line = "." at `:80-82`, or an event `title`/`city` value) | NEW (producer-detail events card ≠ `/events` matrix surface) | 1 | DATA | Inspect the test producer's `description` + event fields; strip/validate lone-punctuation input (cf. MEH-555 free-text char-class validator). No code render bug. |
| 8 | **Vacation mode impossible to enable** — 422 loop | B | FE `producer/dashboard/page.js:353-378` + `:124-151`; BE `services/availability_validation.py:83-86` (via `producer_me.py:384,388`) | **CONFIRMED — STILL LIVE** | NEW (MEH-999 #1; matrix DASH-09 notes the state, not the loop) | 4 | RED (central dashboard + producer state machine) | Render the return-date input whenever the vacation button is focused/pending (not only after state flips), and POST only once a date is present — or default `vacation_until` to +7d. Optimistic revert currently hides the field before it can be filled. |
| 9 | **No UI path to add a product** — `ProductsSection` orphaned | B | defined `settings/page.jsx:814` (full CRUD, POST `:892`) but **`<ProductsSection` mount count = 0** across `frontend/`; `BusinessTab` `:754-811` shows only banners + edit-profile link | **CONFIRMED — STILL LIVE** | NEW (MEH-999 #2) | 4 | YELLOW | Mount `<ProductsSection />` in `BusinessTab` (or add a "מוצרים" card to the dashboard Edit tab). Component is orphaned, not deleted. |
| 10 | **Profile-save bricks while license-pending** — 422 | B | BE `producer_me.py:176` calls `ensure_license_for_categories` **unconditionally** on PUT `/producers/me`; register flow bypasses it (`auth.py:458-461` `if not data.license_pending`) | **CONFIRMED — STILL LIVE** | NEW (MEH-999 #3) | 3 | RED (auth/license gate, backend) | Mirror the register `license_pending` bypass on `PUT /producers/me` — skip the license gate while the producer row is still `license_pending`. |
| 11 | **Reply-to-review absent** — no endpoint/model/UI | B | no reply route in `reviews.py` (routes: 144/175/198/311/336/352); no reply field on `ProducerReview` (`models.py:806-834`); `ReviewsSection.jsx:300` uses `isOwner` only to swap the empty-state | **CONFIRMED — STILL LIVE** | NEW (MEH-999 #5) | 3 | RED (schema + endpoint + UI = v2.1 feature) | Out of scope for a one-liner: needs Alembic column + endpoint + UI. File as a v2.1 feature, not a fix. |

### Independent-sweep extras (beyond the 11 named)

| # | Finding | Src | file:line | Verdict | Matrix row / NEW | Sev | Tier | Fix direction |
|---|---|---|---|---|---|---|---|---|
| S1 | Cookie banner overlaps the `/producers` card grid mid-page on mobile (green bar sits over cards + BottomNav) | sweep | `CookieBanner.jsx:68` `z-[1100]` > BottomNav `z-[1000]` | **CONFIRMED (live)** | NEW (matches MEH-999 below-top-10 "cookie banner intercepts first nav tap") | 1 | YELLOW | Reserve bottom inset / raise BottomNav above the banner, or dismiss-on-scroll. Visible in `producers-listing--390.png`. |
| S2 | The Latin "MEHA MEKOR" graphic also renders as the **event-card thumbnail** on the test producer detail (`אירועים קרובים` row) | sweep | same asset as #1 (`ImageGallery`/event `image_url`) | **CONFIRMED (live)** — same DATA root as #1 | NEW (dup root of #1) | 1 | DATA | Resolves with #1's data fix — the test account's uploaded images are the Latin graphic. |

---

## Counts per group

| Group | Rows | CONFIRMED | REJECTED | PARTIAL |
|---|---|---|---|---|
| (a) already-merged-but-visible | 3 (#1, #2, #7) | 1 (visual) | 2 | 0 |
| (b) matrix-tracked-not-swept | 2 (#3, #6) | 2 | 0 | 0 |
| (c) NEW | 6 (#4, #5, #8, #9, #10, #11) | 4 | 1 | 1 |
| independent-sweep extras | 2 (S1, S2) | 2 | 0 | 0 |
| **Total** | **13** | **9** | **3** | **1** |

**Stream B result:** all 4 MEH-999 blockers (#8–#11) **CONFIRMED STILL LIVE** at current line numbers,
no parallel fix. **Stream A result:** of 7 visual defects — #3 + #6 are real code defects; #1/#2/#7 trace
to a single **data** cause (a Latin-wordmark cover asset on the test account, not a code fallback bug —
deploy-lag ruled out live); #4 is a render/spacing artifact (partial); #5 is data (lone-"." input).

## Severity-ranked fix order (Sapir's ticket queue)

1. **#8 vacation 422 loop** (sev 4, RED) — first-timer cannot go on vacation at all.
2. **#9 no add-product UI** (sev 4, YELLOW) — orphaned component; one mount fixes it.
3. **#1 Latin cover** (sev 3, DATA) — decide default-asset-vs-upload; if a Latin default cover exists, kill it.
4. **#10 profile-save brick** (sev 3, RED) — license-pending producers can't edit.
5. **#11 review-reply** (sev 3, RED) — v2.1 feature (schema+endpoint+UI).
6. **#3 H1/badge crowding** (sev 2, YELLOW), **#6 price bidi** (sev 1, GREEN), **#4 verify-banner spacing** (sev 1, GREEN), **S1 cookie overlap** (sev 1, YELLOW), **#5 lone-"." data** (sev 1, DATA).
7. Non-issues: **#7** (no featured state), **#2** (serif is correct), **S2** (data dup of #1).

## Screenshot evidence — `docs/design-audit/screenshots/producer-qa/`

Live staging (`staging.mehamakor.online`), 390px mobile, TLS-1.2 cap + Vercel bypass header, reduced motion.

| File | Shows |
|---|---|
| `producers-listing--390.png` | Full `/producers` grid — test card Latin cover (#1/#7), cookie overlap (S1), prices (#6) |
| `detail-test-producer-hero--390.png` | Test-producer hero — Latin "MEHA MEKOR" graphic close-up (#1/#2) |
| `detail-test-producer-full--390.png` | Full test-producer detail — badge crowding (#3), events-card thumbnail (S2) |
| `detail-tases-ferments--390.png` | Control: a no-cover producer rendering the **correct** Hebrew "מ·יה" monogram (deploy-lag ruled out) |

## STOP

Discovery only — no fixes. Sapir triages the table above into fix tickets (one per row), scoped and
tiered as noted. Blockers #8–#11 are the MEH-999 hard blockers, re-confirmed live on 04/07.
