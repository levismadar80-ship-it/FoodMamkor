# MEH-999 — producer dogfood audit, chunk 1 (tasks 1–3)

> **As-of 2026-08-09T10:38Z.** Every number below is **measured** by
> `frontend/scripts/qa-meh999-walkthrough.mjs` and
> `frontend/scripts/qa-meh999-s1-probe.mjs`, not estimated. Re-derive before acting.

## Honesty boundaries — read before the numbers

1. **Local stack, not staging.** `staging.mehamakor.online` answers
   `302 → vercel.com/sso-api` from a CC sandbox (re-verified today), so the card's
   prescribed target is a credential gate (ORDERS §1.2 gate 2), whose instruction is
   to route around and say so — never to simulate. Data, config and the image host
   all differ from staging. **These numbers describe layout and flow, not staging's
   content.**
2. **Chromium emulation is layout evidence, not engine evidence.** Nothing here says
   anything about iOS Safari's `dvh`, safe-area insets, or touch behaviour.
3. **Convenience judgements are CC's opinion, not a user's.** Below, anything marked
   **JUDGEMENT** is exactly that. The measured columns are separate on purpose.

---

## The measurement that would have become a false finding

The instrument reported, for `/register/producer`:

```
inputs: 1 · requiredFieldsVisibleWithoutScroll: 0 · submitButtonAt: 1425px (1.69 screens)
```

Read as a form, that is a damning result: no fields above the fold and a submit two
screens down. **It is not a form.** The screenshot shows an *intro* page — «תנו לעסק
שלכם בית», «10 דקות בלי עמלות», a «מה כדאי להכין» preparation checklist, «מה קורה
אחרי», and a CTA into the actual flow. The single `input` is the **header search
box**, and `button[type=submit]` at 1425px is the **footer newsletter signup**.

So the metric measured a page whose job is not data entry, and every number in that
row is real but answers a question nobody asked. **Recorded because opening the
screenshot is the only thing that caught it** — the JSON alone was confident and
wrong, which is the class this repo keeps paying for.

**Consequence for the rest of the audit:** the form is behind the CTA. Tasks that
measure "fields above the fold" must first assert they are *on* the form, not on its
landing page.

---

## Measured — tasks 1–3

| | measured | note |
|---|---|---|
| `/register/producer` load | **1186 ms** | intro page, see above |
| page height | 1807 px = **2.14 screens** at 844 | |
| horizontal scroll | **none** (390 = 390) | measured off `scrollWidth`, not eyeballed |
| **login → submit** | **1 tap** | |
| dashboard overview | **3.24 screens** | the owner's landing surface |
| overview → edit | **1 tap**, reachable by visible text «עריכה» | found by role+name, not a testid — a testid would prove nothing about discoverability |
| edit page | 59 inputs · 64 buttons · 2.14 screens | first input at **0 px** (top) |
| add-product affordance on overview | **1** — «מוצר ראשון בקטלוג / עדיין חסר» → `/producer/dashboard/edit#profile-products` | product creation routes through the edit page anchor, not a dedicated screen |

**JUDGEMENT (CC, not a user):** one tap from overview to edit and a first field at
the very top are good. The 3.24-screen overview before reaching the edit tab is the
candidate friction, and 59 inputs on one edit surface is worth a second look at how
much is collapsed vs. present — neither is a defect on this evidence.

---

## S1 — the cookie banner. Two parts settled, one explicitly NOT.

**Settled 1 — the "mid-page banner" in fullPage captures is a CAPTURE ARTIFACT.**
The banner is `position: fixed` (`z-index: 1100`), and a fullPage screenshot renders
a fixed element at its scroll offset. The previous session flagged this as an open
question rather than resolving it either way; it is now answered with geometry.

**Settled 2 — it DOES occlude page content.** Measured at 390×844 on
`/register/producer`:

```
banner: top 672, bottom 764, height 92   (viewport 844)
topmost element at that point : P «אנחנו משתמשים בעוגיות…»
element beneath the banner    : DIV «לפני שמתחילים / מה כדאי להכין / כתובת אימייל…»
```

So the banner covers the **preparation checklist** — the block whose entire job is
telling a first-time owner what to have ready. Visible in
`s1-banner-viewport.png`: the CTA «איך מתחיל התהליך עובד ←» is clipped at the
banner's top edge.

**NOT settled — whether it overlaps the BottomNav, which is S1's actual claim.**
The probe reports `overlapsBottomNav: false`, and **that result must not be used.**
Its `document.querySelector("nav")` matched the **header** nav (`top 16, bottom 74`),
not the bottom navigation. The probe answered a question about the wrong element, and
a `false` from it is not evidence of no overlap.

Fixing the selector is a one-line change and the next chunk should do it. Reported
this way rather than quietly shipping the `false`, because a wrong negative in an
audit doc becomes someone's closed ticket.

---

## A latent fragility found by accident, worth a line

`/login` has **two** `button[type="submit"]`: the login button
(`data-testid="login-submit"`) and the **footer newsletter signup**
(`aria-label="להירשם"`).

`qa-meh999-capture.mjs` targets the loose `button[type="submit"]` via
`page.click()`, which is **non-strict** and silently takes the first DOM match. It
works today only because the login button happens to come first. `locator.click()`
is strict and raised it immediately, which is how this surfaced.

Not a product bug and not breaking anything now — but a DOM-order change would
silently retarget the login click to a newsletter signup, and the capture would go on
producing plausible screenshots of a logged-out page. The walkthrough script pins the
testid; the capture script still uses the loose selector.

---

## Still open in this chunk

- Tasks 4–10 (recipe, group buy, event, review reply, stats, edit details, vacation).
- The 14-row Feature-Inspection Matrix and the top-10 friction list.
- #1492's A4 / A6 / S2 and the A1/A2/A7 asset question — untouched.
- S1's BottomNav half, per the correction above.
