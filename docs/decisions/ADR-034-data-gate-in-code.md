# ADR-034: A data gate lives in the code as a render threshold, not in Linear as a waiting card

**Status:** Accepted
**Date:** 2026-09-04
**Deciders:** Smadar Levi
**Source:** MEH-2227 ADDENDUM-4 (04/09, T12 item 1) · MEH-2250 · the 55-card sweep of what was "left outside"

> **On the number.** ADDENDUM-4 and ADDENDUM-5 both name this decision "ADR-031".
> That number is occupied — `ADR-031-outbound-contact-unobservable.md`, Accepted
> 2026-07-28 (MEH-1652) — as are 032 and 033. Writing to 031 would have
> overwritten an unrelated standing decision, so this is ADR-034. A mechanical
> renumber; the principle below is ADDENDUM-4's, unchanged.

## Context

A sweep of 55 backlog cards found a recurring shape: a module was designed, specified,
and then parked because *the catalog is too small for it to look right yet*. The gate
lived in Linear — as a `post-launch` label, or a prose trigger like "when we have
enough businesses".

That gate has two defects. It has **no owner**: nobody is watching the count, so the
card is revisited when someone happens to re-read the backlog, not when the condition
is met. And it has **no definition**: "enough" is not a number, so two readers of the
same card disagree about whether it has fired. The measured consequence is a backlog
where the reason a card is not being built is indistinguishable from the reason nobody
has looked at it.

Large directories do not work this way. They build the module with a **render
threshold** and let it appear on its own when the number crosses it.

## Decision

**The data gate moves from Linear into the code, as a render threshold.**

A module gated on catalog size is **built now**, carrying a `min_count` of N. It renders
only when the live count reaches N, and until then it is simply absent from the page —
no placeholder, no empty state, no announcement.

What stays in Linear is only what a threshold cannot supply: a card needing **human
content** (an editorial guide, a written profile) or **statistical data**
(personalization that needs a behavioural corpus). Those are not waiting on a count;
they are waiting on someone to write or measure something.

Every card in this class carries the same contract:

- **`render only when count ≥ N`**, with N stated on the card and named in the code —
  never an inline magic number.
- **A test on both sides of the threshold**: at N-1 the module is absent, at N it is
  present. One side alone is not a test — a presence-only assertion passes identically
  whether the gate works or the case was never constructed (`.claude/rules/testing.md`).
- **Zero new hex** — tokens only.
- **Zero new user-facing Hebrew copy** without the rule-22 approval gate.

## Consequences

**Positive:**
- The module exists before the data does, so the work is done once, at design time,
  rather than rediscovered months later from a stale card.
- It appears without anyone remembering to flip anything. The trigger is the product's
  own state, which is the only trigger that cannot be forgotten.
- "Not enough data" stops being a backlog status. A card is either built-and-gated, or
  genuinely blocked on content or measurement — and those two are now distinguishable.
- The threshold is a number in a diff, so changing it is reviewable. "When we have
  enough" was not.

**Negative:**
- A gated module ships **dark**: its rendering path runs in production for the first
  time on the day the count crosses N, with no user having seen it before.
- A threshold nobody revisits is a silent feature flag. N=3 chosen for a 10-business
  catalog may be wrong at 200, and nothing surfaces that.
- Each gate needs a count, and a count is a query. Several gates on one page can mean
  several queries.

**Mitigations:**
- The both-sides test is what makes the dark path non-dark: the N case is exercised on
  every CI run, against the real component, before any user reaches it. This is the
  mitigation the ADR actually rests on — it is not optional, and a card that ships with
  only the N-1 half has not met this contract.
- N is a named constant next to the module and a line on the card, so a future reader
  can find every threshold by grep and re-derive whether it still makes sense.
- Prefer a count the page already has over a new query. Where a gate needs its own
  count, say so on the card.

## Alternatives considered

- **Keep the gate in Linear (the status quo)** — rejected. It produced the 55-card
  sweep this ADR comes from: cards indistinguishable from abandoned ones, with triggers
  no mechanism reads.
- **Ship the module ungated, with an empty state** — rejected. On a directory whose
  whole proposition is "there are businesses here", an empty module reads as a broken
  site, and the first cohort is exactly who sees it.
- **A feature flag per module** — rejected. A flag is a switch a human must remember to
  flip, which is the same failure one layer down, with an extra config surface. The
  threshold reads the product's own state instead.
- **A single global "we have enough data now" switch** — rejected. Thresholds are
  per-module and not comparable: a region chip needs 2, a ratings histogram needs 20,
  a programmatic SEO page needs 5 *on that page*. One switch would fire all of them on
  whichever card's condition happened to be met first.
