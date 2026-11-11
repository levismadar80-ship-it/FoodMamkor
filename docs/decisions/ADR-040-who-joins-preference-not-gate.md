# ADR-040: Making or growing what you sell is a preference, not an entry gate

**Status:** Accepted
**Date:** 2026-11-11
**Deciders:** Sapir Levi
**Source:** MEH-2953 (decision) / MEH-2913 (the pilot round it came out of) / Drive `03-Brand-Hub/07b-language-rules-נספח-מי-מצטרף-v1.5.md`

## Context

Mehamakor's DNA is "magazine, not marketplace" (BRAND.md §1): the reader comes for story, craft and origin. A business that only resells other people's products carries less of that than one that makes or grows what it sells. The question of whether the second kind may register at all had never been decided in writing.

It came up during the simulated pilot round (MEH-2913) — a desk check over 31 real leads plus six walked-through registrations. The leads did not sort cleanly into "makes it" and "resells it": a bakery that also stocks a neighbour's jam, a farm shop with a shelf of someone else's cheese, a delicatessen with one house-made item.

Sapir ruled twice on 11/11/2026, and the second ruling is this ADR. The first (Drive 07b v1.3) was **"only those who make or grow it themselves"**. She corrected it the same day: the site is pre-launch with no businesses on it, so a rule that excludes on day one cannot be calibrated against anything real. v1.3 is marked ARCHIVED in Drive.

The decision is therefore made in the knowledge that it is easy to widen a rule later and hard to narrow one — hence the review point below rather than an open-ended commitment.

## Decision

**Making or growing what you sell is a preference, not a condition of entry.** Each case is decided by Sapir at manual approval, which every business already goes through (BRAND.md §3 LOCK).

Three levels:

| Level | Who | What happens |
|---|---|---|
| 1 | Makes or grows what it sells | The core. First in outreach, first in the editor's pick |
| 2 | Makes or grows its own, and also sells other people's | Joins. Its page should lead with its own products |
| 3 | Sells only other people's: a shop, a delicatessen, a restaurant | Possible, case by case, with Sapir's approval. Not the default and not the target of first outreach |

**The mechanism is the existing manual approval, not a new field.** There is no tier selector on the business, no filter, no badge, and nothing in the registration flow that tells an applicant which level they are. The rule is an internal working tool for the approval decision. The only product change this ADR authorises is one informational item on the admin pre-approval checklist, reading «מייצרים או מגדלים בעצמם» — unticked behaves exactly like every other item there (the existing soft "approve anyway" confirmation), and it gates nothing.

**Review point.** At roughly 50 approved businesses, or when level 3 reaches a quarter of them, whichever comes first: a formal discussion (BRAND.md §3) on whether to split level 3 into its own registration type or close it. The trigger numbers are a prompt to discuss, not an automatic action.

## Relation to other ADRs

**ADR-022 (two-tier licensing) — unchanged by this ADR, in both directions.** Licensing and this preference are independent axes. A licence decides the badge, not entry; and the 22/10/2026 amendment (MEH-2299) lets Sapir approve a business with no licence number case by case, one at a time, logged, with no badge. Nothing here narrows that, and nothing here widens it: a level-1 business still needs its licence for the badge, and a level-3 business is not made more or less licensable by its level. The two decisions meet only at the same desk — Sapir's manual approval — and are recorded separately.

**ADR-016 (risk-tier nomenclature).** The decision itself is Sapir's and is recorded here; the work that carries it is LOW-RISK, since it is one brand-doc section plus one database row in the admin checklist.

**The grower declaration is untouched.** «התוצרת שאציע דרך מהמקור היא תוצרת שגידלתי בחלקתי בלבד» stays as it is in the growing categories, and a business selling other people's fruit and vegetables cannot sign it — so it does not register in those categories without a change to the declaration text, which needs a lawyer. Today that declaration is checked in the registration form only; server-side enforcement and recording are MEH-2923, still open. This ADR does not change the text, the categories, or `DECLARATION_VERSION`.

## Consequences

- `docs/BRAND.md` §10 states the rule and cites this ADR. BRAND.md §8 requires an ADR behind any brand-doc edit; this is it.
- The admin pre-approval checklist gains one informational item. It is a row in `admin_checklist_items`, added through `/admin/settings` rather than by a deploy — the items moved to the database in MEH-1399 and are edited at runtime.
- Outreach (MEH-409) works levels 1 and 2 first. Level 3 is not a target of the first outreach round.
- Nothing is said to applicants. No line in registration tells anyone who the site is "for", because the rule is a tool for the approver, not a message to the applicant.
- A level-3 business that is approved is a normal business afterwards: no marker, no reduced surface, no separate treatment anywhere in the product.

## Alternatives considered

**Only level 1 may register** (Drive 07b v1.3, Sapir's own first position, same day). Rejected by her on reflection: with no businesses on the site yet, there is nothing to calibrate the exclusion against, and it would have turned away the mixed cases the pilot round actually found — the bakery with a neighbour's jam on the shelf.

**A tier field on the business, set at registration.** Rejected: it asks the applicant to classify themselves on a distinction that exists for the approver, invites a wrong answer on a question nobody is checking, and would need a migration, a UI and a maintenance story for a rule that may change at the review point.

**Say it in the registration flow.** Rejected with the first version of the card: a line about who the site is "for" reads as a rejection to the mixed cases this decision exists to admit, and the rule is an internal one.

**Decide it later, at the review point.** Rejected: approvals are happening now, and an unwritten preference applied at one desk is the kind of rule that drifts without anyone noticing it drifted.
