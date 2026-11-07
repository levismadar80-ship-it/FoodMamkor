# ADR-039: Display numerals are Frank Ruhl, upright, bold, primary — Cormorant italic is for times and inline Latin

**Status:** Accepted
**Date:** 2026-11-07
**Deciders:** Smadar Levi
**Source:** MEH-2804 (approved 07/11/2026); narrows the numeral half of MEH-2488

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
A **display numeral** — a stat counter (the trust band) or a price token (event
row, event page; free and paid alike) — is set in **Frank Ruhl Libre**
(`font-headline`), **upright**, **bold/black**, in **`text-primary`**
(the row's own accent where the surface has one, e.g. experiences' gold), sized
as a display step (band `text-4xl` → `md:text-5xl`; price `text-base` →
`md:text-lg`), `dir="ltr"` for the digits, never `align-middle`.
**Cormorant Garamond italic stays** for times of day (the event row's date-rail
time) and for inline Latin text. It is not used for a number that is the point
of its block.

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
- `HomeTrustBandCountGate.test.jsx` and `EventEntryRow.test.jsx` pin the class
  sets (no `font-english`, no `italic` on these tokens); the trust band has a VRT
  element shot with `/stats` mocked.

## Alternatives considered
- Keep Cormorant italic, only larger — rejected: the jumping baseline and the
  footnote reading come from the face and the slant, not only the size.
- DM Sans tabular numerals — rejected: it is the body face; a display number in
  the body face does not lead the block it sits in.
