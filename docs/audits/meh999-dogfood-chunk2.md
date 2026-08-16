# MEH-999 — producer dogfood audit, chunk 2

> **As-of 2026-08-09T11:2xZ.** Measured on a local stack, not staging. Re-derive.

## Honesty boundaries

Unchanged from chunk 1 and restated because they are load-bearing, not boilerplate:
**local stack rather than staging** (`302 → vercel.com/sso-api` is a credential gate,
ORDERS §1.2 gate 2); **Chromium emulation is layout evidence, not engine evidence**;
**convenience calls are CC's JUDGEMENT**, kept apart from measured numbers.

---

## The finding of this chunk is a METHOD failure, and it invalidates measurements silently

Chunk 2's first run died on `page.fill('input[type="password"]')` — timeout, no
password field. The obvious reading is a product change. It is not.

**Measured on `/login`:**

```
inputs on page              : 1   — and it is `footer-newsletter-email`
buttons                     : 8
bodyChars                   : 530
console                     : ChunkLoadError: Failed to load chunk
                              /_next/static/chunks/3gs9a5oa-bapm.js
network                     : 500  /_next/static/chunks/3gs9a5oa-bapm.js
                              (served as text/plain → "Refused to execute script")
```

**The login form was never rendered because hydration was dead.** The server-rendered
shell (header, footer, footer-newsletter input) arrived fine; every client-rendered
component — including the entire login form — did not.

### The cause, and it is a trap specific to this workflow

`next start` serves the prebuilt `.next` directory. **Merging `origin/staging`
mid-session changed `frontend/` source** (PR #2711 touched `LoginClient.jsx`,
`RegisterClient.jsx`, `PasswordInput.jsx`) while the server kept running against the
**previous build**. The served HTML and the on-disk chunks stopped agreeing, one
chunk 500'd, and hydration died.

**Sequence that produces it — all three steps are normal:**

1. `npm run build` && `next start` (healthy)
2. `git merge origin/staging` — required by rule 25 before any push
3. keep measuring — now against a degraded page

### Why this is dangerous rather than merely annoying

A dead-hydration page **still screenshots**. It still returns HTTP 200. It still has a
plausible `bodyChars` count. Had chunk 2 measured a route without a client-rendered
form, every number would have looked reasonable and been taken on a broken page —
and "fields above the fold: 0" would have been reported as a **finding** rather than
as a broken harness.

This is precisely why `qa-meh999-capture.mjs` carries a hydration-health count, and
it is the same failure that produced a false all-clear on the MEH-1227 axe run. **The
instrument caught it here only because the login form's absence made the script
throw.** A quieter surface would have passed silently.

### What to do about it — for whoever runs chunk 3

**After any `git merge origin/staging`, rebuild and restart `next start` before
measuring anything.** The runbook step is not optional and its absence has no visible
symptom:

```
npm run build          # from frontend/
# restart next start
```

**And check hydration health before trusting any number**, not only when a script
throws: a page whose client components are missing reports `buttons` and `bodyChars`
that look ordinary in isolation. Compare against a known-good count for that route.

---

## Measured — tasks 4–6, taken AFTER the rebuild

All three re-measured on a healthy build (hydration confirmed by the login form
existing at all — it is client-rendered, so a successful login is itself the health
check).

| surface | screens | h-scroll | buttons | create affordances | moderation copy |
|---|---|---|---|---|---|
| **recipes** | 2.14 | none | 11 | **1** — «+ פרסום מתכון חדש» | **none** |
| **group-buys** | 2.00 | none | 11 | **0** | `review` |
| **events** | 2.01 | none | 10 | **2** — «אירוע חדש» → `/events/new`, «אירועים» → `/events` | **none** |

### `createAffordances: 0` on group-buys is CORRECT, and the screenshot proves it

The instinct is "the create button is undiscoverable". It isn't there at all, by
design. The empty state reads:

> **קבוצות רכש = מחיר סיטונאי ללקוחות שלך**
> פתיחת קבוצת רכש תתאפשר **לאחר אישור העסק**

The seeded producer is **unapproved**, so the feature is gated — and the page *says
so*. That sentence is also the source of the `review` moderation hit, so the probe
and the screenshot agree.

**JUDGEMENT (CC, not a user):** this is the good pattern. The surface explains the
gate rather than hiding the control or failing on submit.

### The finding: the three surfaces do NOT agree with each other

Same producer, same unapproved state, same moment:

- **group-buys** — no create control, and explains why.
- **recipes** — offers «+ פרסום מתכון חדש» with **no moderation copy anywhere**.
- **events** — offers «אירוע חדש» with **no moderation copy anywhere**.

Either recipes and events are not gated on approval (so the gating is inconsistent),
or they gate **later** — at submit — which is the dead-end shape the card asks about:
the owner invests in a form and meets the wall at the end instead of the start.

**Explicitly UNVERIFIED:** I did not click through and submit on recipes or events, so
which of the two it is remains open. Stated as a measured *difference between
surfaces*, not as a defect, because the evidence supports the first and not yet the
second. **Chunk 3 should click both through to a submit and record what happens.**

### A caveat that limits the moderation-copy row, and it is not small

The producer has **no recipes and no events**, so those lists render empty states.
**An empty list cannot display pending-item copy — there is nothing pending.** So
"moderation copy: none" here is *not* evidence that a pending recipe is unlabelled,
which is the card's actual question (MEH-593 fold: *"מצב «מתכון ממתין» ברור לבעלת
העסק"*).

Answering that needs a recipe that exists and is awaiting moderation. Chunk 3.

---

## Fixed here: the timing waits the reviewer flagged on chunk 1

Chunk 1 used `waitForTimeout(2000)` and `waitForTimeout(2500)`. The CI reviewer's
point was that a timing wait makes a script **wrong rather than erroring** — it
proceeds against a half-settled page and reports confident numbers about the wrong
DOM.

Chunk 2 contains **no `waitForTimeout`**. Every wait is a condition:

- `page.waitForURL((u) => !/\/login/.test(u))` — the login redirect, asserted rather
  than slept through
- `waitForLoadState("domcontentloaded")` then `networkidle`

Both fail loudly instead of silently proceeding. Worth noting the irony: **the
condition-based wait is what surfaced the hydration failure.** A `waitForTimeout`
would have slept, filled the newsletter field, clicked, and carried on measuring a
logged-out session.
