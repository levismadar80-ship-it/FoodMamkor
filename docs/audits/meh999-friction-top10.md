# MEH-999 — unified friction top 10 (chunks 1–3)

> **As-of 2026-08-11.** Ranked across all three dogfood chunks. Severity × frequency,
> most costly first. Every row carries `file:line` and a one-line fix direction.
>
> **Scope caveat that applies to every row:** all three chunks measured a **local
> stack**, not staging, in **Chromium emulation**. These are layout-and-flow findings.
> Nothing here says anything about iOS Safari, and nothing here describes staging's
> data. Re-derive before shipping any fix.

## How the ranking works

**Severity** 0 polish → 4 blocker. **Frequency** = how many owners hit it: `all` (every
owner, every time), `most` (every owner using that feature), `some` (conditional).
The ordering is the product, not either column alone — F3 outranks a severity-3 item
because every single owner meets it before they meet anything else.

---

## The ten

| # | Finding | Sev × Freq | file:line | One-line fix |
|---|---|---|---|---|
| **F1** | **Events reveal the approval gate only after a 12-input form.** The owner invests the whole form, submits, and *then* learns it will not be public until the business is approved. group-buys gates before the form and says why; events gates last. | 3 × most | `events/new/page.js:36-38` (`handleSuccess` → `createdPending`) vs `group-buys/page.js:306,394-399` | Move the check to render time: when `producerStatus !== "approved"`, show group-buys' `approval_required_hint` above the form instead of after submit. |
| **F2** | **Three sibling surfaces, three different approval postures** — gate-before (group-buys), gate-after (events), no-gate + per-item moderation (recipes). Same dashboard, same producer, same moment. | 3 × most | `group-buys/page.js:306` · `events/new/page.js:37` · `recipes/page.js:156-171` | Pick one contract: pre-submit gate **and** per-item status badge. Recipes already has the badge half; group-buys already has the gate half. |
| **F3** | **The cookie banner occludes the "מה כדאי להכין" preparation checklist on `/register/producer`** — the one block whose job is telling a first-time owner what to have ready. Measured: banner `top 672 → bottom 764` in an 844 viewport, sitting on top of that DIV. | 2 × all | banner `z-1100` fixed; occlusion measured in chunk 1, capture `MEH-999-chunk1/s1-banner-viewport.webp` | Add bottom padding to the register intro equal to the banner height while it is up, or dismiss-on-scroll. |
| **F4** | **One availability state, two names on one screen.** The chip the owner taps says «בהפסקה»; the tooltip and the public badge say «חופשה». | 2 × most | `dashboard/page.js:196` (`availability.tooltip_line_vacation`) vs the chip label at `:235-237` | Pick one string in `he.json` + `en.json` twin. The label-scope contract already governs this class. |
| **F5** | **Two sibling objects, two creation models** — recipes create **inline** on the list page, events create on a **dedicated route**. Nothing signals which to expect. | 1 × most | `recipes/page.js:100` (inline `mode="create"`) vs `events/new/page.js` (route) | Choose one per the object-nav split; if both stay, make the list-page CTA visually distinct (opens-here vs navigates-away). |
| **F6** | **Only 2 of ~12 edit cards link back to where the field appears publicly.** The repo's own dashboard-field standard asks every field for a "where it appears" line; `ViewOnPageLink` exists and is mounted on products and contact only. | 2 × most | `edit/page.js:855` + `:1391` are the only two usages; component at `cards.jsx:60` | Mount `ViewOnPageLink` on the remaining cards — the component and the anchors already exist, so this is per-card wiring, not new UI. |
| **F7** | **`צפיות בפרופיל` reads `1 / 1 / 1` on a producer with no traffic** — most likely the owner's own visit counted. **UNVERIFIED.** If real, the owner's first impression of analytics is a number that is not. | 3 × all **if confirmed** | `insights/page.js:113-133`; artifact `MEH-999-chunk3/report.json → dashboardStats.emptyStateText` | First: **verify**. Load the dashboard twice as the owner and re-read. Only then decide whether to exclude owner sessions. |
| **F8** | **Reply-to-review is 3 taps and none of them says "reply."** Route is overview → «צפייה בדף» → scroll → «הוספת תגובה». A 4th path exists (Tools tab deep link) that the probe did not count. | 2 × some | `ReviewsSection.jsx:112` (`ReviewReply`), `:127` PUT; deep link `tools/page.js:118-124` | Surface pending-reply reviews on the overview with a direct affordance — the deep link proves the destination already works. |
| **F9** | **The moderation expectation is never stated on the form, only after submit** — on both recipes and events (`moderationCopyOnForm: null` for both). | 2 × most | `MEH-999-chunk3/report.json → recipeCreate/eventCreate.moderationCopyOnForm` | One line above the submit button on both forms. Copy already exists in the post-submit panels — reuse it. |
| **F10** | **The register landing page is not a form, and every "fields above the fold" metric on it is meaningless.** Measured `inputs: 1` (header search) and `submitButtonAt: 1425px` (footer newsletter). A damning-looking row that answers a question nobody asked. | 1 × all (as a **measurement** hazard) | chunk 1, `/register/producer` intro page; the real form is behind the CTA | Not a product fix — a **harness** fix. Any future probe must assert it is on the form before measuring form ergonomics. |

---

## Two entries that are NOT product findings, kept visible on purpose

Both would have become tickets if the artifact had been written up carelessly, and
both are exactly the class this repo keeps paying for.

**P1 — `taglineFieldFound: false` is a probe defect.** The same `fieldLabels` array
that reports the tagline missing **contains** `"משפט תדמית"`. The field is at
`cards.jsx:713`, mounted at `edit/page.js:816`. One sentence from becoming "the
tagline field is missing", and the fix would have been prescribed for a field that
was never absent.

**P2 — `validationErrors: ["מחיקה"]` is unexplained, not resolved.** «מחיקה» is
*delete*, not a validation message. The plausible reading — the probe's error selector
matched a delete button behind the form — is **unproven**, and it ships as an open
observation rather than as a harness artifact. "That's my capture script" is the most
comfortable hypothesis available and the one the Bug Protocol forbids dropping it on.

---

## What is NOT in this list, and why

- **S1 as originally worded («באנר cookies מעל BottomNav») does not reproduce** —
  measured 8 px clearance, banner `bottom 764` vs nav `top 772`. It was **closed** in
  chunk 1, and the real defect found in its place is F3 above. Not re-listed as open.
- **The four PR #1492 blockers (B8–B11) are all fixed and on staging** — see the
  closeout section of the feature matrix. Not friction any more.
- **Experiences** carries a Tools card but appears in no chunk's measurements. It is a
  **coverage gap**, not a finding — listed in the matrix as unmeasured rather than
  given a friction rank it has not earned.

---

## ⛔ Ticket creation is BLOCKED — the five sev-2+ tickets are drafted below instead

**Measured 2026-08-11.** `save_issue` against the Mehamakor team returns:

```
invalid_request — "You've exceeded the free issue limit for this workspace.
Please upgrade or contact sales@linear.app for a free trial."  (status 400)
```

This is a **workspace billing limit**, not a permissions problem and not specific to
these tickets — no new Linear issue can be created by anyone until the plan is raised.
Deliverable 5 of the MEH-999 closeout ("every severity-2+ finding → Linear ticket,
template 07") therefore **could not be completed as specified**.

**What was done instead of dropping it:** the ticket bodies live here, in template-07
shape, ready to paste. Nothing is lost; it is one copy-paste per ticket once the limit
lifts. **Duplicate search was run first and is recorded per ticket**, so the dedupe work
does not need repeating.

**This is Sapir's to unblock.** Raising a Linear plan is a billing decision.

> **Why F1, F2 and F9 are one ticket and not three:** all three prescribe edits to the
> same three files. Three tickets would produce three PRs on one diff, which rule 18
> forbids. Folded deliberately, not for convenience.

### Ticket 1 of 5 — sev 3 — the gating contract (F1 + F2 + F9)

- **Title:** 🚧 שלושה משטחי יצירה, שלוש עמדות אישור שונות — אירועים חושפים את הגייט רק אחרי טופס של 12 שדות (MEH-999 F1/F2/F9)
- **Priority:** High · **Model:** Sonnet 4.6 · **Effort:** medium
- **Dedupe:** searched `אישור עסק אירועים טופס גייט approval gate events`. Nearest is
  the events list/edit/cancel backlog card (`create-only היום`) — **different scope**
  (management CRUD, not the approval gate). No duplicate.
- **What:** three sibling surfaces gate three different ways. group-buys gates *before*
  the form and explains why; events gates *after* submit; recipes has no producer gate
  but the best per-item moderation UI. Events is worse than both siblings at once.
  Neither surface states the moderation expectation on the form (`moderationCopyOnForm:
  null` for both).
- **Where:** `events/new/page.js:36-38` · `group-buys/page.js:306,394-399` ·
  `recipes/page.js:156-171` · artifact `MEH-999-chunk3/report.json`
- **Fix:** move the events gate to render time using group-buys' `approval_required_hint`;
  add form-level moderation copy to both forms (reuse the post-submit strings); give
  group-buys a per-item status list matching `RecipeStatusBadge`.
- **Explicitly NOT in scope:** do not remove group-buys' pre-submit gate (it is the
  reference), and do not add a producer-approval gate to recipes — the ticket is about
  **disclosure**, not about adding restrictions.
- **DoD:** the approval hint is visible on `events/new` before any input is filled,
  proven by a test **shown failing first** (MEH-1619); `he.json` + `en.json` twins.

### Ticket 2 of 5 — sev 2 — cookie banner occludes the register prep checklist (F3)

- **Title:** 🍪 באנר העוגיות מכסה את «מה כדאי להכין» ב-/register/producer — הבלוק היחיד שמסביר לבעלת עסק חדשה מה להביא
- **Priority:** Normal · **Model:** Sonnet 4.6 · **Effort:** low
- **Dedupe:** searched `cookie banner עוגיות באנר הרשמה חסימה occlusion`. Nearest is the
  banner's hardcoded 80px nav offset card — **Done, and a different geometry problem**
  (banner↔nav). This one is banner↔page-content on one route. No duplicate.
- **Where:** measured in chunk 1 — banner `top 672 → bottom 764` in an 844 viewport,
  fixed `z-1100`, sitting on the preparation-checklist DIV. Capture:
  `qa-artifacts/MEH-999-chunk1/s1-banner-viewport.webp` (the CTA «איך מתחיל התהליך
  עובד ←» is clipped at the banner's top edge).
- **Fix:** bottom padding on the register intro equal to the banner height while it is
  up, or dismiss-on-scroll.
- **Note for whoever takes it:** S1's *original* wording («באנר cookies מעל BottomNav»)
  does **not** reproduce — 8 px clearance, measured. Do not re-open that; this is the
  different, real defect found in its place.

### Ticket 3 of 5 — sev 2 — one availability state, two names (F4)

- **Title:** 🏷️ «בהפסקה» או «חופשה»? צ'יפ אחד ו-tooltip אחד על אותו מסך אומרים שני דברים
- **Priority:** Normal · **Model:** Sonnet 4.6 · **Effort:** low
- **Dedupe:** searched `חופשה בהפסקה availability vacation vocabulary`. Hits are about
  expiry, timezone and enum migration — none about the **label**. No duplicate.
- **Where:** chip label `dashboard/page.js:235-237` vs tooltip/badge
  `dashboard/page.js:196` (`availability.tooltip_line_vacation`). Probe recorded it
  explicitly: `report.json → vacationMode.vocabularyNote: "chip=בהפסקה, tooltip/badge=חופשה"`.
- **Fix:** pick one string in `he.json`, add the `en.json` twin. The label-scope contract
  already governs this class.

### Ticket 4 of 5 — sev 2 — only 2 of ~12 edit cards link back to the public surface (F6)

- **Title:** 🔗 `ViewOnPageLink` מותקן על 2 כרטיסי עריכה מתוך ~12 — הסטנדרט של הריפו דורש "איפה זה מופיע" לכל שדה
- **Priority:** Normal · **Model:** Sonnet 4.6 · **Effort:** medium
- **Dedupe:** searched `תובנות insights ... owner` and the dashboard-field threads.
  Nearest is the "10 writable fields with no editor in the dashboard" card — **Done, and
  the inverse problem** (fields with no editor; this is editors with no link back). Related,
  not duplicate. Link them.
- **Where:** the component is exported at `cards.jsx:60` and used exactly twice —
  `edit/page.js:855` (`anchor="section-products"`) and `:1391` (`anchor="section-contact"`).
- **Fix:** mount it on the remaining cards. The component and the public-page anchors both
  already exist, so this is per-card wiring, not new UI.
- **Why it matters:** this is a gap against the repo's **own** documented dashboard-field
  standard, which asks every field for a "where it appears" line.

### Ticket 5 of 5 — sev 3 **if confirmed** — VERIFY FIRST, do not fix yet (F7)

- **Title:** 🔍 [verify-first] «צפיות בפרופיל» מראה 1/1/1 לעסק ללא תנועה — האם צפיות הבעלים נספרות?
- **Priority:** High · **Model:** Sonnet 4.6 · **Effort:** low (verification), then re-scope
- **Dedupe:** searched `תובנות insights צפיות בפרופיל self view analytics owner`. The
  analytics-enhancements card is a **feature** backlog item, unrelated. No duplicate.
- **Where:** `insights/page.js:113-133`; artifact
  `MEH-999-chunk3/report.json → dashboardStats.emptyStateText` shows `1 / 1 / 1`.
- **⚠️ The first step is verification, not a fix.** This is **UNVERIFIED**. The `1/1/1`
  is consistent with the owner's own visit being counted, and consistent with other
  explanations. Load the dashboard twice as the owner and re-read before deciding
  anything.
- **If confirmed:** every owner's first impression of their analytics is a number that
  is not real — on the one surface whose whole job is being trustworthy. That is what
  makes it sev 3.
- **If refuted:** close it and say so. A withdrawn finding is evidence the probe was
  checked; a silent one is not.

### Not filed as tickets, and why

- **A4** (verify-banner glyph) — still open, but needs the **exact device** that showed
  the clipping. Cannot be reproduced or specified from a CC sandbox. Sapir's.
- **A1/A2/A7 asset** — the Cloudinary placeholder is still live (confirmed 11/08), but
  whether the producer record still references it needs an authed data read the sandbox
  cannot perform. QA hygiene, Sapir's.
- **F5, F10** — severity 1. Below the sev-2 threshold this deliverable sets. F10 is a
  **harness** rule, not a product fix, and is recorded in the matrix rather than filed.
