# ADR-022: Two-tier licensing model — מאומת / מוצהר

**Status:** Accepted
**Date:** 2026-06-05
**Deciders:** Smadar Levi
**Source:** MEH-742 / docs/legal/2026-06-lawyer-brief-licensing-tiers.md + נספח א' (PRs #931, #934) / template-05 research 2026-06-05

## Context
The "Licensed businesses only" DNA LOCK (MEH-528 option B) filtered ~30% of potential
registrants, including legally exempt categories (item 4.6ו plant-based <5t/day, farm
own-produce, soaps under the cosmetics regime, candles) that cannot present a license
that does not exist.

## Decision
Two-tier model replaces the blanket license requirement:
- **Tier 1 "מאומת"** — licensing/exemption document submitted and reviewed; gold badge
  + tooltip stating what was checked and when. Badge is free, forever.
- **Tier 2 "מוצהר"** — binding declaration of lawful operation; no document, no badge.
  Never negatively labeled; badge absence is affirmatively explained in consumer copy
  (what IS checked for everyone: identity/story/conversation; why a badge may be
  absent: exempt category).
- **Outside the model** — food production lacking a legally required license stays
  excluded. Home-cook LOCK unchanged. Manual approval for every business unchanged.
- Consumer-facing tier language is מאומת / מוצהר only; "מורשה/מורשים" is
  legal-internal (terms, declaration text) — consumers don't parse regulatory status.

## Consequences
**Positive:** legally exempt businesses can join; badge value peaks exactly at our
stage — new market, sellers without established reputations (Elfenbein/Fisman/McManus,
NBER w20074). Yelp Verified License precedent: +24% engagement (2019 experiment),
+10% calls/clicks 30d.
**Negative:** relative-perception effect on tier 2 is inherent (Saeedi et al., AEJ
Micro 2023); declaration wording is load-bearing for the good-faith defense.
**Mitigations:** affirmative tier-2 explanation copy (gate 1) · lawyer brief Q1–Q5
pending counsel · נספח א' defines tier-2 eligibility per category · audit columns
declared_at / declaration_version (gate 2).

## Alternatives considered
- Blanket license requirement (option B) — rejected: certification acts as entry
  barrier; unjustly excludes exempt categories.
- Open listing without binding declaration — rejected: no good-faith defense.
- Paid badge (Yelp model) — rejected: "monetizing trust" criticism; conflicts ADR-010.
