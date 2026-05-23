# ADR-018: Hero direction hierarchy — Direction A canonical, Direction B secondary

**Status:** Accepted
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** MEH-656 CONTENT SYNC v4.2 change #1; MEH-686 Session 3 (post-Session-2 verification, scope-expanded from MEH-656 closure)

## Assumptions (verify before merge)
- MEH-656 will be Canceled after Session 3 commits (its 6 changes distribute across ADRs 013, 014, 018, 019 + BRAND.md housekeeping).
- "Direction A" and "Direction B" labels come from the design exploration phase that preceded MEH-656; if internal naming has drifted (e.g. "primary/alternate" or "v1/v2"), the labels here should be aligned during commit to whatever the canvas/Figma calls them.
- Mobile italic tail behavior is documented in MEH-656 as a wrap-line treatment; this ADR locks the rule, not the pixel-level CSS (which lives in DESIGN.md / component code).

## Context

Mehamakor's homepage hero went through multiple parallel directions during the 4-session design reset (MEH-636/637/638/639). Two stabilized as candidates:

- **Direction A** — magazine-style canonical hero. Editorial voice, image-as-feature, narrative subtitle. Default for all surfaces and seasons.
- **Direction B** — secondary hero variant. More CTA-forward, denser information density, suited for campaign moments (e.g. holiday landings, partner co-marketing, time-bounded editorial features).

Without an ADR, the hierarchy stayed implicit. Several risks accumulated: (i) Direction B kept being proposed as the "fresh take" each new design session (re-litigation), (ii) campaign-time pressure favored B because it converts harder, eroding the magazine thesis, (iii) the mobile italic wrap-line — a typographic detail that distinguishes A from B — kept getting dropped in mobile views without a documented owner.

## Decision

**Direction A is the canonical hero.** Direction B is the secondary, permitted only for campaign-bounded uses with explicit Sapir approval per campaign.

### Direction A — canonical rules

- Editorial composition: image-as-feature, narrative subtitle, generous whitespace (8px baseline grid per MEH-656).
- Subtitle uses MEH-620 winner copy (`"ישר מהמקור אלייך. עסקים שכבר בדקנו בשבילך."`), not the brand tagline (which lives in footer, meta, OG — see ADR-011).
- Voice form per ADR-014: hero H1 + subtitle = gerund / plural (treated as UI hero affordance).
- Mobile (≤375px): the wrap-line italic tail (Cormorant) is mandatory — it's the typographic signature that distinguishes A from a generic SaaS hero. If italic falls back on a device, the hero degrades to plain DM Sans — acceptable, not preferred.

### Direction B — secondary, three preconditions

Direction B may be used only when **all three** conditions hold:

1. The use is campaign-bounded (start date + end date documented).
2. Sapir approval is recorded in the campaign's Linear issue (per-instance, not blanket).
3. The campaign-end date triggers automatic reversion to Direction A — no Direction-B drift into steady state.

### Anti-patterns (forbidden)

- ❌ A/B testing A vs B on landing page — they serve different purposes; testing them as if they were variants destroys the hierarchy.
- ❌ Direction B as the homepage default for "freshness" — that's how magazine becomes marketplace.
- ❌ Dropping the mobile italic wrap-line "to simplify" — the italic is the load-bearing brand signal at the 375px width where most Israeli mobile traffic lands.

## Consequences

**Positive:** Closes re-litigation on hero direction across future design sessions; the 3-precondition gate for Direction B prevents drift; the mobile italic wrap-line gets an explicit owner (this ADR) so it stops being silently removed; aligns hero with the broader magazine-not-marketplace thesis.

**Negative:** Campaign moments that genuinely benefit from B-style density (e.g. Hanukkah gift guide, Tu B'Shvat producer spotlight) require a per-campaign approval cycle, adding ~10 minutes of friction per launch. The 3-precondition record is a paper trail that didn't exist before.

**Mitigations:** Sapir approval recording lives in the campaign's existing Linear issue (no new tracking surface); approval is a single comment, not a separate process.

## Alternatives considered

- **Direction B as canonical, A as fallback.** Rejected — B's higher CTA density optimizes for marketplace metrics; making it default would pull every subsequent hero iteration toward conversion-optimization framing.
- **No hierarchy, both equally available.** Rejected — that's the status quo that produced the re-litigation pattern this ADR closes.
- **Direction A canonical with no B at all.** Rejected — campaign moments genuinely need a denser variant; banning B entirely would push campaign work into ad-hoc one-offs, which is worse than a gated alternative.
- **Mobile italic wrap-line as DESIGN.md token only.** Rejected — the typographic rule is brand-load-bearing, not just a token; it belongs in an ADR with the LOCK semantics, with DESIGN.md providing the implementation spec.
