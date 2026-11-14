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
