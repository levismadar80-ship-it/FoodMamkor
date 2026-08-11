# MEH-999 — Feature-Inspection Matrix

> **As-of 2026-08-11.** 19 rows: **14 producer features** + **5 `/producer/dashboard/tools`
> cards**. Every cell carries `file:line` or an artifact path — **no cell without evidence.**
>
> Where a cell could not be established from the code or the three dogfood artifacts, it
> reads **`unmeasured`** with the reason. `unmeasured` is not `✗`: one means nobody looked,
> the other means it was looked at and is absent. Collapsing them would let a coverage gap
> read as a clean bill.

## Column definitions

| Column | The question |
|---|---|
| **Discoverable** | Can an owner find it without being told? Reached by visible text/affordance, not a testid. |
| **Consistent** | Does it behave like its siblings — same gating posture, same creation model, same vocabulary? |
| **Works E2E** | Did a full create/edit/submit round-trip get **observed**? Asserted-by-PR is not observed. |
| **Wired** | Is it connected to a real backend endpoint (not stubbed / not orphaned)? |
| **Editable-in-context?** | *Airbnb listing-editor lens* — from the surface where it is displayed, can the owner get to the editor (and back)? The repo's own instrument is `ViewOnPageLink` (`cards.jsx:60`). |

Legend: **✓** yes · **✗** no · **~** partial · **unmeasured** = not covered by any chunk.

---

## A · The 14 features

| # | Feature | Discoverable | Consistent | Works E2E | Wired | Editable-in-context? |
|---|---|---|---|---|---|---|
| 1 | **AI bio / description** | ✓ `edit/page.js:816` `description_card.heading`, accordion card | ✓ AI is an assist on one hero field (Shopify-Magic pattern) `cards.jsx:574-575` | ~ generation observed in code path only; no chunk submitted it. Fail-open path exists `cards.jsx:764` (200 `{"bio":""}` when AI down) | ✓ `cards.jsx:713` `DescriptionCard` → producer PUT | ✗ no `ViewOnPageLink` on this card |
| 2 | **Images / gallery** | ✓ `edit/page.js:780` `images.heading` | ✓ standard accordion card | ~ `report.json → editBusinessDetails.fieldLabels[0]` shows the full-gallery guard string («הגלריה מלאה — להוספת תמונה חדשה הסירו קיימת»); no upload round-trip observed | ✓ `cards.jsx:231` `ImagesCard`; Cloudinary confirmed live, **109 images** | ✗ no `ViewOnPageLink` |
| 3 | **Categories** | ✓ `edit/page.js:797` `categories.heading`; «חיפוש קטגוריה» in `fieldLabels` | ✓ | unmeasured — no chunk exercised category save | ✓ `cards.jsx:93` `CategoriesCard` | ✗ no `ViewOnPageLink` |
| 4 | **Location** | ✓ `edit/page.js:1004` `location.heading` | ✓ | unmeasured | ✓ `cards.jsx:476` `LocationCard` | ✗ no `ViewOnPageLink` |
| 5 | **Products / catalog** | ~ **no dedicated screen** — reached via overview empty-state → `/producer/dashboard/edit#profile-products` (chunk 1) | ✓ within the edit page | ~ mount confirmed; no add-product round-trip observed | ✓ `edit/page.js:856` `<ProductsSection embedded>` — the B9 orphan is fixed, PR #1510 `b4cf1f69` on staging | **✓** `edit/page.js:855` `ViewOnPageLink anchor="section-products"` — **1 of only 2 in the file** |
| 6 | **Contact channels** | ✓ `edit/page.js:1149` `contact_channels.heading` | ✓ | unmeasured | ✓ `ContactChannelsCard` | **✓** `edit/page.js:1391` `ViewOnPageLink anchor="section-contact"` — the other of the 2 |
| 7 | **Custom questions (WhatsApp)** | ✓ `edit/page.js:1175` `custom_questions.heading` | ✓ | unmeasured | ✓ `CustomQuestionsCard` (MEH-210 Phase 2) | ✗ no `ViewOnPageLink` |
| 8 | **Kashrut badge** | ✓ `edit/page.js:941` `kashrut.heading`; «סוג הכשרות» + «העלאת צילום» in `fieldLabels` | ✓ verified-only posture matches the label contract (admin-verified evidence) | unmeasured — no request submitted in any chunk | ✓ `cards.jsx:1383` `KashrutCard` | ✗ no `ViewOnPageLink` |
| 9 | **Availability / vacation** | ✓ **best in the product** — 4 chips on the overview, zero taps to find | **✗** vocabulary split: chip «בהפסקה» vs tooltip/badge «חופשה» — `dashboard/page.js:196` vs `:235-237` | **✓** observed: `report.json → vacationMode.dateInputRevealed: 1`, capture `t10-vacation.webp`. B8's 422 loop is fixed (PR #1497 `f4509f8d`) | ✓ `POST /producers/me/availability-state` (`dashboard/page.js:74`) | n/a — edited where it is displayed, which is the ideal this column measures |
| 10 | **Review replies** | ~ 3 taps, none labelled "reply" (`tapsFromOverview: 3`, `affordancesOnOverview: 0`); a 4th path exists at `tools/page.js:118-124` | ✓ | **✗ NOT observed** — `report.json → replyToReview.afterSubmit: null`. The box opens; submit was never exercised. Asserted by PR #1511 (`61061dd6`, on staging), **not** measured | ✓ `ReviewsSection.jsx:127` `PUT /reviews/{id}/reply`. B11 fixed | ✓ inherently — the reply UI lives on the public page where the review shows |
| 11 | **Group buys** | ✓ Tools card `tools/page.js:92` | ~ **the best pre-submit gate, the worst post-submit visibility** — no per-item status list | ✗ unreachable from the seeded (unapproved) account by design — `createAffordances: 0` | ✓ `GET /group-buys` ×4 status queries `group-buys/page.js:277-289` | ✓ list + inline form on one surface |
| 12 | **Events** | ✓ Tools card `tools/page.js:70` + list CTA | **✗ worst of the three** — gate revealed after submit, no per-item status list | **✓** full create observed: `formInputs: 12` → `afterSubmitCopy` «האירוע נוצר בהצלחה / …לאחר אישור העסק», captures `eventCreate-form.webp` + `-after-submit.webp` | ✓ `events/new/page.js` → POST | ~ list + separate `/new` route + `[id]/edit` |
| 13 | **Recipes** | ✓ Tools card `tools/page.js:104` + «+ פרסום מתכון חדש» | ~ **no producer-approval gate at all**, but the **best per-item moderation UI** in the product | **✓** full create observed: `formInputs: 9` → «המתכון נשלח לאישור», captures `recipeCreate-form.webp` + `-after-submit.webp`. ⚠️ `validationErrors: ["מחיקה"]` unexplained — see friction P2 | ✓ `recipes/page.js`; `:156-171` `RecipeStatusBadge` + `moderation_notes` | ✓ inline create + `[id]/edit` on the list surface |
| 14 | **Analytics / insights** | ✓ own tab, `affordancesOnOverview: 1` («תובנות») | ✓ 4 uniform windowed cards | ~ page renders, 3.16 screens, no h-scroll. ⚠️ `צפיות בפרופיל 1/1/1` on a no-traffic producer — **unverified**, friction F7 | ✓ `insights/page.js:113-133` | n/a — read-only surface |

### What the matrix says as a whole

- **`Editable-in-context?` is the weakest column: ✓ on 2 of 12 applicable rows.** Both
  usages of `ViewOnPageLink` are in one file (`edit/page.js:855`, `:1391`) even though the
  component is exported for general use and the public-page anchors exist. This is a
  measured gap against the repo's **own** dashboard-field standard, which asks every field
  for a "where it appears" line. It is friction **F6**, and it is cheap: wiring, not new UI.
- **`Works E2E` is the least trustworthy column, and I have kept that visible.** Only
  4 of 14 rows were actually round-tripped (9, 12, 13, and partially 14). Seven read
  `unmeasured`. A reader skimming for ✗ would conclude the product is fine; the honest
  reading is that most of it was never exercised.
- **`Consistent` fails exactly where the three creation surfaces meet** (rows 11–13) and
  once on vocabulary (row 9). Nothing else fails it.

---

## B · The 5 `/producer/dashboard/tools` cards

Source of truth: `tools/page.js` — the grid contains exactly five `<Link>` cards.
Verdict column per the brief: **relevant-at-launch?** or **candidate-to-defer**.

| # | Card | Target | Discoverable | Consistent | Works E2E | Wired | Verdict |
|---|---|---|---|---|---|---|---|
| T1 | **ניהול אירועים** `quick_links.manage_events` | `/producer/dashboard/events` `tools/page.js:70` | ✓ | ~ opens the **list**, not create (MEH-1405 deliberate) | ✓ create observed downstream | ✓ | **relevant-at-launch** — events are a live public surface |
| T2 | **ניהול חוויות** `quick_links.manage_experiences` | `/producer/dashboard/experiences` `tools/page.js:79` | ✓ | **unmeasured** | **unmeasured — no chunk touched this route at all** | ✓ route exists (`experiences/page.js`, `[id]/edit/page.js`) | **candidate-to-defer** — the only tools card with **zero** audit coverage. Defer or measure; do not ship it unlooked-at |
| T3 | **קבוצות רכש** `quick_links.group_buys` | `/producer/dashboard/group-buys` `tools/page.js:92` | ✓ | ~ see row 11 | ✗ gated (correctly) for unapproved | ✓ | **relevant-at-launch** — and its gate copy is the pattern the others should copy |
| T4 | **מתכונים** `quick_links.recipes` | `/producer/dashboard/recipes` `tools/page.js:104` | ✓ | ~ see row 13 | ✓ | ✓ | **relevant-at-launch** |
| T5 | **ביקורות** `quick_links.reviews` | `/producer/{id}#reviews` `tools/page.js:118-124` | ✓ | **✗ the only card that leaves the dashboard** — every sibling targets a `/producer/dashboard/*` route; this one deep-links into the **public** page | ✗ reply submit never observed (row 10) | ✓ | **relevant-at-launch, but already flagged in-code as candidate-to-move** — `tools/page.js:115-117` records Sapir's 18/07 verdict; the full object-nav split is MEH-964 Phase 2 |

**T2 is the finding in this half of the matrix.** Four of five tools cards were exercised
by at least one chunk. Experiences was exercised by none — it has a card, a list route and
an edit route, and no evidence behind any of it. That is a coverage gap the audit created,
not a defect the product has, and it is recorded as such.

---

## C · Closeout of the PR #1492 findings

PR #1492 was **closed unmerged** on 2026-07-23 (in the MEH-1518 PR-queue hygiene pass).
Its findings document nevertheless **is on staging** —
`docs/design-audit/PRODUCER-QA-FINDINGS.md` — so the record survived the PR. Verified with
`git ls-tree origin/staging docs/design-audit/`.

**Label mapping.** The PR body used `A*`/`B*`/`S*` labels; the document numbers its
defects `#1`–`#7`. Mapping recovered from the PR body's own grouping section.

| Finding | Was | Verdict now | Evidence |
|---|---|---|---|
| **A1 / A2 / A7** — the Cloudinary placeholder asset (giant Latin «MEHA MEKOR» in hero + card) | REJECTED as code defect; test-data contamination. Action: clear or replace the MEH-999 account's cover | **STILL OPEN** (the asset half). The asset is **still live**: `mehamakor/79cd766d534f4d3e96c8d8e8cb49441a`, 826×542 PNG, 20,809 B, `status: active`, uploaded 2026-07-04 — confirmed via Cloudinary Admin API 2026-08-11. The QA-hygiene action was never done. **The code half stays REFUTED** — `ProducerCard.jsx:306-308` still renders the canonical Leaf + `BRAND_NAME` placeholder when `images` is empty | ⚠️ **Partly unverified:** the asset existing does not prove the *producer record still references it*. That needs the DB or an authed API read, which the CC sandbox cannot reach. Stated as: asset present, linkage unconfirmed |
| **A4** — verify-banner glyph/spacing at the start edge | PARTIAL — not clearly clipped; needs the exact device | **STILL OPEN, unchanged** | `VerifyBanner.jsx:63-64` — still `justify-center gap-3 flex-wrap` with the `EnvelopeSimple` at `gap-1`. The 04/07 citation read `:50-51`; that is **line drift, not a change** — the code is the same. Still needs a device capture, still cannot be closed from here |
| **A6** — card price «מ-35₪/יח'» bidi flip, no `dir` isolation | CONFIRMED, sev 2 | **REFUTED — by deletion, not by fix** | The price was **removed from discovery cards entirely** under MEH-1210: `ProducerCard.jsx:585-587` *"price removed from discovery cards ('מגזין, לא marketplace') — exact prices are a marketplace signal; they stay at product level inside /producer"*. The un-isolated element no longer exists on that surface. **The class is not closed** — the sibling isolations survive (`:376`, `:493` `dir="ltr"`), so any future price re-added to a card must carry `dir` |
| **S2** — listing placeholder cover | independent-sweep item | **REFUTED / working as designed** | `ProducerCard.jsx:306-308` renders `<Leaf>` + `{BRAND_NAME}` (Hebrew «מהמקור», `lib/constants.js:1`) when there is no image. This is the canonical fallback the doc's own control (`tases-ferments`) demonstrated |
| **B8** vacation 422 loop | blocker, sev 3–4 | **CONFIRMED FIXED** | PR #1497 → `f4509f8d`, `git merge-base --is-ancestor` → **on staging**. Behaviour observed: `report.json → vacationMode.dateInputRevealed: 1` |
| **B9** orphaned `ProductsSection` | blocker | **CONFIRMED FIXED** | PR #1510 → `b4cf1f69`, **on staging**. Mounted at `edit/page.js:856` |
| **B10** license-pending PUT 422 | blocker | **CONFIRMED FIXED** | PR #1512 → `5c3d92d4`, **on staging** (grandfathers held categories in the PUT license gate) |
| **B11** no review-reply | blocker | **CONFIRMED FIXED (shipped), NOT observed end-to-end** | PR #1511 → `61061dd6`, **on staging**; UI at `ReviewsSection.jsx:112`, `PUT /reviews/{id}/reply` at `:127`. But `report.json → replyToReview.afterSubmit: null` — the round-trip was never exercised. **Shipped ≠ observed**, and the two are recorded separately |

**All four blockers are merged to staging.** Three of the four `A`/`S` items resolve
(two refuted, one refuted-by-deletion); **A4 and the A1/A2/A7 asset remain open**, and
neither is closeable from a CC sandbox — A4 needs a device, the asset needs an authed
data read.

---

## D · Cloudinary state, measured while verifying A1/A2/A7

Recorded here because it was measured in service of this matrix and is load-bearing for
the media-backup work. **Cloudinary Admin API responded 2026-08-11** — the account is
**not** disabled, it is **over quota**.

```
plan            : Free
credits         : 111.4 used / 25 limit  →  445.6%
bandwidth       : 119,097,014,346 B (119 GB)  =  110.92 credits   ← 99.6% of the overage
storage         :     300,974,178 B (301 MB)  =   0.28 credits
resources       : 113   (109 image + 4 video)
derived         : 198
```

Two things follow, and both matter:

1. **The overage is bandwidth, not storage.** Storage is 0.25% of the bill. Any remedy
   aimed at deleting files to get under quota is aimed at the wrong number.
2. **4 of the 113 resources are Cloudinary's own demo videos** — `samples/dance-2`,
   `samples/cld-sample-video`, `samples/elephants`, `samples/sea-turtle`, **125 MB
   combined = 42% of all storage**, uploaded 2026-04-08 with the account. They are not
   Mehamakor content. Deleting them is Sapir's call, not CC's.
