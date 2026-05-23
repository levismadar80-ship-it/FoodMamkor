# ADR-010: Pricing model v2.0 — six LOCKs and four hypothesis options

**Status:** Accepted · Supersedes the rejected Subscription Freemium model in pricing-model.md v1.0
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** `Drive/01-Strategy/02-pricing-model.md` v2.0 (2026-05-16, post-adversarial review); Doc-Consolidation-Plan §B.7 G1; MEH-686 Session 2

## Assumptions (verify before merge)
- `Drive/01-Strategy/02-pricing-model.md` v2.0 from 2026-05-16 is the authoritative source; v1.0 (with Subscription Freemium ₪49/₪99) was rejected on the same date via adversarial review and is no longer in force.
- Cohort 1 is licensed Israeli local food businesses; "consumer" refers to readers using `mehamakor.online` / `mehamakor.co.il` to discover producers.
- No active revenue. Mehamakor pre-launch. This ADR locks the **rules**, not the **plan** — the plan triggers on signal, not on date.

## Context

Mehamakor's "magazine, not marketplace" positioning is incompatible with transactional revenue models. Pricing-model.md v1.0 attempted a Subscription Freemium tier (₪49/₪99) and was rejected on 2026-05-16 after adversarial review found it created two-class consumer access — a direct violation of the editorial thesis. v2.0 was rebuilt around six non-negotiable LOCKs and four hypothesis options to be tested signal-by-signal post-launch.

The decision needs an ADR because: (i) the LOCKs must be re-litigation-proof — any future "what if we just took 1% transaction fee" conversation should bounce off this record; (ii) the four options need explicit "all hypothesis, untested" framing so Claude Code sessions don't treat them as roadmap commitments; (iii) the rejected v1.0 model needs explicit superseding so it doesn't resurface from older Drive snapshots.

## Decision

Pricing model v2.0 is the canonical revenue policy. Six rules are LOCKED; four options are exploratory hypotheses tested on signal-based triggers.

### Six LOCKs (re-litigation-proof)

1. No transaction fees, ever — not 1%, not 0.5%, zero.
2. No commissions on transactions — Mehamakor sits outside the transaction.
3. Free registration for producers (`בעלי עסק`). Always.
4. Free use for consumers. Always. No paywall on content.
5. No sale of consumer data — not to third parties, not to advertisers.
6. No display advertising — no banner ads, no promoted listings from industrial brands.

### Four hypothesis options (untested)

- **A. Reader Patronage** — pay-what-you-can ₪25–50/month, suggested. Projected ₪900–15,000/month years 1–3.
- **B. Editorial Sponsorship** — small values-aligned brands. Projected ₪3,000–32,000/month years 1–3. ⚠️ Slippery-slope risk; requires editorial guidelines if pursued.
- **C. Annual Print Guide** — "Best of מהמקור". ₪89–129 per copy. Projected ₪44,000–130,000 gross annually.
- **D. Workshops for producers** — photography / storytelling / outreach. ₪1,500–5,000 per workshop.

### Trigger to act

Signal-based, not time-based. Trigger condition: 5+ producers ask "how do you make money?" per week for 4 consecutive weeks, OR consumers ask "how can I support?" at the same rate. Below this signal, no revenue work happens.

### Explicit rejections (permanent)

- Marketplace commission (any %)
- Subscription Freemium ₪49 / ₪99 (v1.0 model; rejected 2026-05-16)
- Banner ads
- Sponsored content from Tnuva / Strauss / Osem / equivalent industrial brands
- Data sale
- Pay-to-rank in search or category listings

## Consequences

**Positive:** Magazine-not-marketplace thesis structurally protected — the LOCKs make the cheap revenue paths unavailable, so the only paths forward are aligned ones; v1.0 rejection codified so it can't resurface; signal-based trigger prevents pre-mature revenue work eating engineering time.

**Negative:** No revenue runway pre-trigger; sustained zero-revenue period requires founder financial cushion; Option B (sponsorship) introduces editorial-independence risk if pursued without guidelines.

**Mitigations:** Pre-launch overhead is low (Vercel + Railway + Cloudinary free tiers cover early traffic); when Option B's trigger fires, write a separate ADR locking sponsor selection criteria before accepting any sponsor.

## Alternatives considered

- **Subscription Freemium (v1.0).** Rejected 2026-05-16 via adversarial review — two-class consumer access violates "free use for consumers" LOCK and the editorial thesis.
- **Marketplace commission (1–3%).** Rejected — places Mehamakor inside the transaction, which structurally pulls every product decision toward marketplace optimization.
- **VC fundraise to skip revenue.** Rejected — VC unit economics demand marketplace-shape outcomes within 3–5 years; pulls product toward the same anti-pattern via a different door.
- **Foundation/grant funding.** Not rejected, but not pursued — adds reporting overhead without unlocking product space; revisit if signal-based trigger doesn't fire within 18 months post-launch.
