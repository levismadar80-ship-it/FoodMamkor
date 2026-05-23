# ADR-014: Voice rules — Hebrew Hybrid (UI gerund / brand feminine)

**Status:** Accepted
**Date:** 2026-05-23
**Deciders:** Sapir Levi
**Source:** `Drive/03-Brand-Hub/02-מדריך-מותג.md` v1.1; `MEH-124-v4-content-sync.md` §5; MEH-472 (Q7 Hybrid implementation, Done 2026-05-16); MEH-665 (4-quadrant matrix clarification); PR #682 (MEH-605/606/609) Sapir override precedent; Doc-Consolidation-Plan §B.7 G5; MEH-686 Session 2

## Assumptions (verify before merge)
- Brand Hub `02-מדריך-מותג.md` v1.1 is the canonical voice source.
- The "Hybrid" label distinguishes Mehamakor's policy from pure-feminine ("צרי", "גלי") and pure-gerund ("טעינה", "הוספה") competing approaches that were considered and rejected.
- MEH-657 emoji LOCK v2 is in force and orthogonal to voice — voice rules govern grammatical form, not emoji usage.

## Context

Hebrew has no gender-neutral verb form. Every imperative or address picks masculine, feminine, or plural — there is no "you" that escapes this choice. Three patterns were live in Mehamakor's codebase and copy bank without an arbiter:

1. **Pure feminine** ("גלי", "צרי", "הוסיפי") — warm, on-brand for narrative, but excludes male and non-binary users in UI affordances.
2. **Slash form** ("טוענ/ת", "הוסיפ/י") — gender-inclusive but visually broken in Hebrew typography, signals "form letter" not "magazine".
3. **Gerund / plural** ("טעינה", "הוסיפו") — gender-neutral, works in UI, but flattens voice in narrative surfaces.

PR #682 (MEH-605/606/609) established a Sapir-overrideable Hybrid rule that splits the choice by surface type. Without an ADR, future Claude Code sessions kept proposing pure-feminine or slash-form across all surfaces, producing per-PR re-litigation.

## Decision

Hebrew voice splits by surface category. The split is:

### UI strings — gerund or plural

Buttons, loading states, error messages, empty states, form labels, system feedback.

- ✅ Loading: `"טוענת עסקים טריים..."` (gerund, gender-neutral verb form)
- ✅ Empty state: `"לא מצאנו בינתיים — עדיין 🌱"` (plural "we")
- ✅ Error: `"משהו השתבש, נסי שוב"` — exception: when the message addresses the user directly in a recovery context, feminine is allowed as the "house voice"
- ✅ CTA: `"גלו עסקים"` / `"הוסיפו עסק"` (plural imperative)

### Brand voice — feminine allowed

`/about` narrative, founder-letter copy, story-led editorial content, below-the-fold editorial paragraphs on landing pages.

- ✅ `"גלי את העסקים שמגיעים מהמקור"` (feminine — narrative voice, treated as house voice)
- ✅ Founder letter on `/about`: feminine throughout

### Hero H1 + subtitle — gerund / neutral

Treated as UI hero (high-frequency, high-stakes affordance). Feminine appears in brand voice paragraphs below the fold, not in the hero itself.

### CTA matrix — 4 quadrants (per MEH-665 Q7 Hybrid clarification)

The "UI vs brand voice" split above is necessary but not sufficient for CTAs — CTAs straddle both categories depending on surface. The 4-quadrant matrix from MEH-665:

| Quadrant | Surface examples | Voice form | Example |
|---|---|---|---|
| **1. Functional UI strings** | Loading, errors, form labels, system feedback | Gerund / plural | `"טוענת עסקים"` · `"משהו השתבש"` |
| **2. Imperative CTAs in functional flows** | Hero primary CTA, search-result CTAs, in-app action buttons | Plural imperative | `"גלו עסקים"` · `"הוסיפו עסק"` |
| **3. Brand-voice CTAs in entry surfaces** | Navbar CTA, footer CTA, /about closing CTA | Feminine singular OK | `"הוסיפי עסק"` (navbar) |
| **4. 2nd person brand voice** | `/about` body, founder letter, editorial paragraphs | Feminine | `"גלי"`, `"צרי"` |

**Key clarification:** quadrant 3 is the one MEH-655 navbar exposed. `"הוסיפי עסק"` (feminine singular) in the navbar is **not** a LOCK violation — navbar is a brand entry surface, not a functional flow. The MEH-472 grep canary should distinguish these surfaces; if it triggers on quadrant-3 usage, the canary is over-broad (open follow-up to refine, see MEH-681 area).

### Audience targeting in CTAs — no partial category lists

When a CTA names the audience, do not enumerate a subset of categories. Formulations like `"בעלת עסק, חקלאית או מגדלת"` exclude bakeries, dairies, wineries, chocolatiers — ~75% of the base. Prefer generic business framings (`"בעלת עסק"` / `"בית עסק"` / `"עסק שמייצר אוכל אמיתי"`) and outcome verbs (`"מה שהיא מציעה"` / `"מה שהיא מייצרת"`).

### "מגזין" — internal use only

The word `"מגזין"` describes Mehamakor's editorial thesis internally but must not appear in UI copy. Surface the magazine-tier voice through *what* the copy says (curation signal, producer-page format, founder accountability, story-led framing) rather than *labeling* the product as a magazine. If you reach for `"מגזין"` in a button, headline, or body, restructure the line around the underlying signal instead.

### Forbidden across all surfaces

- ❌ Slash form (`"טוענ/ת"`, `"הוסיפ/י"`) — broken typography signal.
- ❌ Pure masculine ("המשתמש שלך") — defaults to male-as-neutral; off-brand.
- ❌ "יצרן" / "יצרנית" — always `"בית עסק"` / `"בעלת עסק"`.

## Consequences

**Positive:** Closes per-PR re-litigation on voice; aligns with PR #682 precedent so existing surfaces don't need rewrites; keeps UI gender-neutral (inclusive) while preserving the editorial feminine warmth in narrative; the "no partial category lists" rule prevents copy from accidentally excluding majority of producers.

**Negative:** Surface classification (is this UI or brand?) is a judgment call at the boundary — hero subtitle, marketing email subject lines, modal dialogs in narrative flows; some Claude Code sessions will need to ask before classifying.

**Mitigations:** Default ambiguous surfaces to UI rules (gender-neutral) — narrower side of the split is safer than over-applying feminine to a navigation button. Sapir overrides documented per-PR.

## Alternatives considered

- **Pure feminine across all surfaces.** Rejected — excludes male and non-binary users from UI affordances; PR #682 precedent already overrode this on hero copy.
- **Pure gerund across all surfaces.** Rejected — flattens editorial voice; turns founder-letter and /about narrative into UX-team-speak.
- **Slash form ("הוסיפ/י").** Rejected — broken Hebrew typography; signals form-letter / bureaucratic tone; opposite of editorial positioning.
- **Per-surface ad-hoc decisions (status quo).** Rejected — re-litigated every PR; ADR-009 decision-capture rule says lock the split, document the boundary, let Sapir override exceptions.
