# MEH-999 — producer dogfood audit, chunk 3 (tasks 7–10 + recipe/event create)

> **As-of the measurement, 2026-08-09T15:38:23Z** (`report.json → measuredAt`).
> Written 2026-08-11 from `frontend/qa-artifacts/MEH-999-chunk3/report.json` and the
> six `.webp` captures beside it. The run happened; **only the write-up was missing**.
> Re-derive before acting — this document is a reading of a two-day-old artifact.

## Honesty boundaries

Unchanged from chunks 1 and 2, and restated because they are load-bearing:

1. **Local stack, not staging.** All URLs in the artifact are `127.0.0.1:3000`.
   `staging.mehamakor.online` answers `302 → vercel.com/sso-api` from a CC sandbox.
   Data, config and the image host all differ from staging.
2. **Chromium emulation is layout evidence, not engine evidence.**
3. **Anything marked JUDGEMENT is CC's opinion, not a user's.**
4. **This chunk carries one more boundary the others did not.** I did not run the
   probe; I am reading its output. Where the JSON is ambiguous I say so rather than
   picking the reading that makes a cleaner finding — two such cases are flagged
   below (`validationErrors: ["מחיקה"]`, `taglineFieldFound: false`).

---

## Chunk 2's explicit open question is now ANSWERED

Chunk 2 ended: *"Either recipes and events are not gated on approval … or they gate
**later** — at submit — which is the dead-end shape the card asks about … **Chunk 3
should click both through to a submit and record what happens.**"*

It did, and the answer is **neither of chunk 2's two options**. There are **three**
distinct postures across three sibling surfaces, and I verified each in code as well
as in the artifact:

| surface | where the gate fires | evidence (artifact) | evidence (code) |
|---|---|---|---|
| **group-buys** | **before the form** — no create control at all, and the page says why | chunk 2: `createAffordances: 0`, moderation copy `review` | `group-buys/page.js:306` `notApproved`; `:394-399` swaps the empty-state to `approval_required_hint` and drops the CTA |
| **events** | **after submit** — 12 inputs, then the wall | `afterSubmitUrl` stays on `/events/new`; `afterSubmitCopy` = «האירוע נוצר בהצלחה / האירוע יוצג לציבור לאחר אישור העסק» | `events/new/page.js:36-38` — `handleSuccess` checks `producerStatus !== "approved"` and sets `createdPending` |
| **recipes** | **no producer-approval gate at all** — per-item moderation instead | `afterSubmitCopy` = «המתכון נשלח לאישור» | `recipes/page.js` has no `producerStatus` check; `:156-171` render `RecipeStatusBadge` + `needs_revision`/`rejected` + `moderation_notes` |

**So the inconsistency runs in both directions, which is why "make them consistent"
is the wrong prescription.** group-buys has the best *pre*-submit behaviour and the
worst post-submit visibility (nothing to track). Recipes has no pre-submit gate and
the best post-submit visibility in the product — a per-item status badge *with the
moderator's notes*, which neither sibling offers. Events are the only surface that is
worse than both siblings at the same time: gate revealed last, and no per-item status
list.

**JUDGEMENT (CC, not a user):** the target state is group-buys' pre-submit honesty
plus recipes' post-submit badge. Events should adopt both. That is friction item **F1**.

---

## Measured — tasks 7–10

### Task 7 — reply to a review

```
affordancesOnOverview : 0
viewPageLinkPresent   : true  → /producer/00d4d3fb-…
replyAffordances      : 3     (all BUTTON «הוספת תגובה»)
replyBoxOpens         : true
afterSubmit           : null
tapsFromOverview      : 3
```

**The reply UI works and is 3 taps from the dashboard overview, none of them labelled
"reply".** The route is overview → «צפייה בדף» → scroll to reviews → «הוספת תגובה».
Code: `ReviewsSection.jsx:112` `ReviewReply`, gated on `isOwner`, `PUT /reviews/{id}/reply`
at `:127`.

**`afterSubmit: null` is an untested step, not a passing one.** The probe opened the
box and stopped; it never submitted. So *"the reply saves"* is **UNVERIFIED here** —
it is asserted by PR #1511 (`61061dd6`, on staging), not by this run. Recorded as
unverified rather than folded into the green, because a `null` that reads like a pass
is the exact shape `.claude/rules/testing.md` warns about.

There **is** a fourth path the probe did not count: the Tools tab carries a reviews
deep-link (`tools/page.js:118-124` → `/producer/{id}#reviews`), added by MEH-1165
precisely to shorten this. `affordancesOnOverview: 0` is true of the *overview* tab
and false of the dashboard as a whole. The measurement is right; the word "overview"
is doing more work than a reader will notice.

### Task 8 — dashboard stats / insights

```
affordancesOnOverview : 1   («תובנות» → /producer/dashboard/insights)
pageHeight            : 2665 px = 3.16 screens
hScroll               : false
```

Four windowed metric cards — profile views, search impressions, WhatsApp clicks,
non-WhatsApp contact clicks — each `7 ימים / ב-30 הימים האחרונים / סה״כ`
(`insights/page.js:113-133`).

**One number in the capture deserves a second look: `צפיות בפרופיל` reads `1 / 1 / 1`
on a producer with no traffic.** The most likely explanation is that the owner's own
visit was counted. I did **not** verify this — it needs a second load and a re-read,
which this artifact cannot provide. **Stated as an open question, not a finding**
(friction item F7). If self-views are counted, every owner's first impression of their
own analytics is a number that is not real, on the one surface whose entire job is
being trustworthy.

### Task 9 — edit business details

```
url          : /producer/dashboard/edit
pageHeight   : 1798 px = 2.13 screens
hScroll      : false
fieldLabels  : 20 captured
taglineFieldFound : false
```

**`taglineFieldFound: false` is a PROBE DEFECT, not a product finding** — and it is
the most instructive line in the artifact. The very same `fieldLabels` array contains
`"משפט תדמית"`, which *is* the tagline field (`cards.jsx:713` `DescriptionCard`,
mounted at `edit/page.js:816`). The probe's detector looked for something else and
returned a confident `false` about a field sitting in its own output.

Had this been written up on the day, "the tagline field is missing from the edit page"
was one sentence away from becoming a ticket, and the ticket would have become a
prescribed fix for a field that was never absent. That is the MEH-1771 → MEH-1792
chain exactly. **Reported as a probe defect with the contradicting evidence quoted,
per the Bug Protocol's rule that an unverified diagnosis is labelled unverified out
loud.**

### Task 10 — vacation / availability

```
affordancesOnOverview : 4   («פתוח להזמנות» «זמין היום» «עמוס השבוע» «בהפסקה»)
vocabularyNote        : chip=בהפסקה, tooltip/badge=חופשה
dateInputRevealed     : 1
visibleCopy           : null
```

The 4-value availability enum (`dashboard/page.js:235-237`) is one tap on the overview,
and selecting «בהפסקה» reveals a return-date input — the fix from PR #1497 (`f4509f8d`,
on staging) working as intended.

**The finding is the vocabulary split, and the probe caught it explicitly.** The chip
the owner taps says **בהפסקה**; the tooltip and the public badge say **חופשה**
(`dashboard/page.js:196` `availability.tooltip_line_vacation`). One state, two names,
on the same screen. Friction item F4.

`visibleCopy: null` means the probe captured no explanatory copy at the moment of
reveal — consistent with `dateInputRevealed: 1` firing before any copy renders, but
**not proof that no copy exists**. Read `t10-vacation.webp` before acting on it.

### Recipe create

```
createControlPresent : true     formInputs : 9
formUrl              : /producer/dashboard/recipes   (inline, not a route)
moderationCopyOnForm : null
afterSubmitCopy      : «המתכון נשלח לאישור»
validationErrors     : ["מחיקה"]
```

Creation succeeds and the moderation expectation is stated — **but only after submit**
(`moderationCopyOnForm: null`). The owner learns the recipe needs approval at the end
of a 9-input form, never at the start.

**`validationErrors: ["מחיקה"]` is an unexplained observation and I am not resolving
it.** «מחיקה» means *delete*; it is not a validation message. The obvious reading is
that the probe's error selector matched a delete button in the list rendered behind
the form. That reading is **plausible and unproven** — I did not run the probe and
cannot re-run it against the same build. Per the Bug Protocol, it ships as an
unexplained observation rather than as a resolved harness artifact, because
"that's my capture script" is the most comfortable hypothesis available and the one
this repo has already been burned by.

### Event create

```
createControlPresent : true     formInputs : 12
formUrl              : /producer/dashboard/events/new   (a real route)
moderationCopyOnForm : null
afterSubmitCopy      : «האירוע נוצר בהצלחה / האירוע יוצג לציבור לאחר אישור העסק /
                        חזרה לניהול העסק»
validationErrors     : []
```

Same shape as recipes, one form-length worse: **12 inputs before the gate is
mentioned.** The success panel is well written — it separates "created" from "will be
shown publicly after approval" and offers a way back. It is simply in the wrong place.

**Note the surface asymmetry, which is a discoverability finding in itself:** recipes
create **inline on the list page**, events create **on a dedicated route**. Two
sibling objects in the same dashboard, two different creation models. Neither is
wrong; the pair is inconsistent (friction item F5).

---

## What this chunk did NOT cover

Stated so the next reader does not mistake this document's scope for the audit's:

- **No submit on the review reply** — `afterSubmit: null`. The end-to-end reply is
  asserted by PR #1511, not measured here.
- **No group-buy create** — the seeded producer is unapproved and the control is
  correctly absent, so the happy path is unreachable from this account.
- **No experiences surface** at all (`/producer/dashboard/experiences`), despite it
  carrying a Tools card. It is not in the artifact.
- **No iOS Safari.** Boundary 2.
- **The `1 / 1 / 1` self-view question and the `["מחיקה"]` anomaly are open**, not
  resolved.
