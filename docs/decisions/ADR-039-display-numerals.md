# ADR-039: The event price token is Frank Ruhl, upright, bold — Cormorant italic is for times and inline Latin

**Status:** Accepted
**Date:** 2026-11-07
**Deciders:** Smadar Levi
**Source:** MEH-2804 (approved 07/11/2026); narrows the numeral half of MEH-2488
**Amended:** 2026-11-07 — scope narrowed to the price token; the trust-band half was built (#4143), rejected on the phone the same evening, and replaced (see «Amendment» below)

## Context
Two places on the site carry a number that IS the message: the home trust band
(how many businesses, how many categories) and the price token on an event card.
Both were set in Cormorant Garamond italic — the band's numerals gold `text-lg`
with `align-middle` inside an upright Hebrew line, the event price italic
`text-base` beside a «חינם» in the body face at `text-sm`. The number that should
lead read as a footnote, the baseline jumped, and the free state — a selling
point — looked weakest. MEH-2488 had placed "Latin and digits" in Cormorant
through the `.font-english` stack, without distinguishing a display number from
a time of day.

## Decision
A **price token** (event row, event page; free and paid alike) is set in **Frank Ruhl Libre**
(`font-headline-display` — there is no bare `font-headline` token; an
unknown class emits no CSS, MEH-2798), **upright**, **bold/black**, in **`text-primary`**
(the row's own accent where the surface has one, e.g. experiences' gold), sized
as a display step (`text-base` → `md:text-lg`), `dir="ltr"` for the digits,
never `align-middle`.
**Cormorant Garamond italic stays** for times of day (the event row's date-rail
time) and for inline Latin text. It is not used for a number that sits in a
Hebrew line (see the amendment).

## Consequences
**Positive:**
- The number leads: one face, one weight, one colour family with the date-rail
  numeral (`EventEntryRow` day, `font-headline-display font-black`).
- Free and paid prices are one token, so «כניסה חופשית» reads as an offer, not
  as an afterthought.
- No faux italic on Hebrew is possible (Frank Ruhl has no italic; DESIGN.md).

**Negative:**
- Two numeral styles remain on one card (Frank Ruhl price, Cormorant time). That
  is deliberate — a time is metadata, a price is a decision — but it is a rule to
  remember, recorded here.

**Mitigations:**
- `EventEntryRow.test.jsx` and `EventDetailRedesign.test.jsx` pin the price
  token's class set (no `font-english`, no `italic`).

## Alternatives considered
- Keep Cormorant italic, only larger — rejected: the jumping baseline and the
  footnote reading come from the face and the slant, not only the size.
- DM Sans tabular numerals — rejected: it is the body face; a display number in
  the body face does not lead the block it sits in.
- **Trust band as a fact row** (three display-numeral columns, 31 · 18 · 0₪, from
  5 businesses) — built and merged in #4143, **rejected by Sapir on the phone
  the same evening (07/11/2026)**: the numerals were too heavy for a band under
  the hero, the columns left empty height, and «₪» in Frank Ruhl reads close to
  a Hebrew letter. Do not reopen without a new decision.

## Amendment — 2026-11-07, the trust band
The band is the locked sentence «בלי מתווך באמצע · איסוף עצמי או משלוח, ישירות
מבית העסק» at **every** count — it says who you buy from and how the food
reaches you, which holds at any catalog depth. From `TRUST_COUNT_THRESHOLD` (25)
a quiet second line adds «N בתי עסק שהצטרפו עד היום»; below 25 there is no
number at all (MEH-521). The numeral is set in the line's own face, semibold,
`text-primary`, LTR-isolated — Cormorant's default old-style italic figures read
as «ɜı» beside Hebrew (no lowercase for them to match), Sapir 07/11. Pinned by `HomeTrustBandCountGate.test.jsx`,
`e2e/flows/manual/home.spec.ts` and the "home trust band" VRT element shot.
