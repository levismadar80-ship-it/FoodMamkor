# ADR-042: Revenue model v3 — published prices, results-gated billing, booking commissions allowed

**Status:** Accepted
**Date:** 2026-11-14
**Deciders:** Sapir
**Source:** MEH-3163 / plan doc «מהמקור: תוכנית רווחיות ותמחור» (14/11/2026) / supersedes parts of ADR-010, ADR-027, ADR-030

## Context

ADR-010, ADR-027 and ADR-030 locked "no transaction fees, no commissions" and allowed a paid tools tier only after 30 active businesses plus demand interviews. Since then the site gained tools that produce a countable result for a business: event registration, rescue bags, group buys. On 14/11/2026 Sapir decided the site must be able to become profitable from those results, and that the fee lock goes. The site is pre-launch with no real businesses, so no promise already made to a business is broken by changing it now.

## Decision

1. **The base page of a business stays free.** Editorial page, photos, contact details, map and search presence. Unchanged from ADR-027 §1.
2. **Prices are published from day one; nothing is charged during launch.** The price list ([docs/PRICING.md](../PRICING.md)) is shown to a business before it joins, so later billing is the end of a stated free period and not a change of terms.
3. **Billing starts per business, not per date.** A business is charged only after it crossed a results threshold through the site, and after 60 days' written notice. The threshold lives in PRICING.md.
4. **Commissions on bookings are allowed.** Paid event registration, a collected rescue bag, and a future purchase made through the site may carry a commission. Free events carry none. This removes LOCK 1 and LOCK 2 of ADR-010 and §2 and §4 of ADR-027.
5. **The commission is billed to the business once a month.** In this phase the customer's money does not pass through Mehamakor. Prepayment, checkout, or splitting a payment needs a new ADR and a legal check first (Payment Services Law 2023).
6. **One tools subscription, plus usage packs.** A subscriber pays no commission. WhatsApp message packs are sold separately because each message costs money. A new business gets all tools for a trial period with no credit card.
7. **Money never buys ranking, exposure, editorial choice, badges or verification — labelled or not.** No display ads, no sale of data, free for readers. Unchanged from ADR-030 §1 and §4 and ADR-010 LOCKs 3–6. "Magazine, not marketplace" stays the brand test.
8. **Numbers are not locked.** Prices, rates, the threshold and the trial length live in PRICING.md and change with Sapir's approval, without a new ADR. Changing points 1–7 needs one.

## Amendment 14/11/2026 (MEH-3197, Sapir delegated the decisions)

- Point 6 is superseded by the price model of the same day: a subscriber pays a **reduced** commission, not none (numbers in PRICING.md).
- **Launch joiners.** A business that joined during the launch period pays the subscriber's rates without a subscription for a fixed number of months from its first billed month. Practice elsewhere: a founding rate that is lower and time-limited (first sellers at a lower commission, a discount locked for a period), not a permanent exemption.
  - *Amended 18/11/2026 (MEH-3420, Sapir approved the copy):* framed as the reduced-commission subscription given free for those months, with no track to choose; a written notice precedes the end, then the business chooses. The money is unchanged. Reason: "the subscriber's rate without a subscription" left the paid subscription with no purpose for launch joiners in that window.
- **Disputing a count.** Each charge is preceded by a summary; a business has a fixed window to report a counted booking that did not take place, and it is checked before the charge. Delivery platforms give merchants 14 to 30 days for the same.
- **Bookings taken off the site.** No enforcement and no penalty. The commission applies only to bookings recorded in the site's tools; direct contact stays free. Platforms that police this (bans for steering users away) do it where they hold the payment; this site does not, and repeat in-person custom is where policing works worst.
- **Changing the price list.** Written notice before a change takes effect (the EU platform-to-business rule sets 15 days as a floor; this site gives more).
- **Later the same day (Sapir approved the research doc).** The results threshold is an **amount** of paid bookings in a month, not a count (a count let a few large orders pay nothing while many small ones crossed). The trial in point 6 is a period **without commission** for a business that joins after the launch period, with no credit card. A change to the price list is announced 60 days ahead and a yearly subscription keeps its price until it renews. A business that picks no track keeps the page; paid tools close to new bookings and existing bookings are honoured. Numbers in PRICING.md.
- The terms of use carry these promises (section «מחירים ותשלום לבתי עסק»), with the numbers read from the price list.

## Consequences

**Positive:**
- Income is tied to results the business can see in its own dashboard.
- Recruitment can state the terms honestly from the first conversation.

**Negative:**
- The recruitment line «חינם, בלי עמלות» is no longer true and must be replaced before real businesses join. Surfaces: `/join`, `/about/for-businesses`, the chat line «אין דמי מנוי» (`chat.py`), `docs/COPY_BANK.md`, `docs/outreach/objection-handlers.md`, terms of use. New copy needs Sapir's word-for-word approval (workflow rule 22); none is changed in this PR.
- ADR-030 §5 allowed «לעולם» only for the zero-transaction-fee promise. That promise is gone, so «לעולם» is allowed nowhere in pricing copy.
- Billing needs per-business result counts the business can verify, a payment provider, and receipts. None exists yet.

**Mitigations:**
- Nothing is charged until the threshold, so the missing billing infrastructure blocks no launch.
- The ADR-027/030 trigger (30 active businesses + MEH-617 interviews) no longer gates the *right* to charge; the interviews still set the numbers.
- Tax and legal points (exempt-dealer ceiling, receipts, whether monthly billing of a commission stays outside payment-services licensing) were researched from public sources, not confirmed by a professional. They are tracked in the follow-up card and must be confirmed before the first charge.

## Alternatives considered

- **Keep the lock, subscription only** — rejected by Sapir: at realistic conversion it covers costs but does not make the site profitable.
- **Free with no published price, charge later** — rejected: introducing a price later reads as a change of terms and is the pattern that cost other directories their trust.
- **Charge from day one with a trial** — rejected: there are no readers yet, so a business would pay before the site can show it a result.
- **Collect customer payments and keep a share** — deferred: it makes Mehamakor a payment intermediary, with licensing and tax consequences that need a lawyer.
