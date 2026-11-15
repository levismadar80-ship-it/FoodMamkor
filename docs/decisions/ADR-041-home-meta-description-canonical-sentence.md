# ADR-041: The Hebrew meta description carries the canonical sentence, not the tagline

**Status:** Accepted (amends the surface list of ADR-011; the tagline itself is unchanged)
**Date:** 2026-11-12
**Deciders:** Sapir Levi
**Source:** MEH-2968; the ChatGPT check of 12/11/2026 in the project thread «לגרום ל-ChatGPT למצוא את האתר»

## Context
ADR-011 locked the tagline «מהמקור — הבית הראשון של העסק שלך. המקום שבו הסיפור מתחיל.» and listed the meta description among the surfaces that show it. On 12/11/2026 ChatGPT, asked about the site, quoted that meta description as the site's own self-description and called Mehamakor a "business directory". Search engines and AI assistants read `<meta name="description">` as what the page is about. Clause 1 of the tagline is a promise to business owners (ADR-011 § Structural reading), so it describes the site wrongly for someone looking for food.

## Decision
The Hebrew `<meta name="description">` (`seo.site.description`, and `seo.home.description`) shows the canonical sentence that Sapir already approved word for word (MEH-2192, MEH-2313; `CANONICAL_SENTENCE` in `frontend/lib/constants.js`):

> אוכל מבתי עסק מקומיים שבחרנו אישית — קרוב לבית, בלי לחפש שעות.

The tagline stays on the footer (`nav.footer.brand_tagline`), `og:description` and `twitter:description`, which ADR-011 also lists. The tagline's wording does not change, so ADR-011's modification protocol does not apply. This ADR changes only where it appears.

English is unchanged: `seo.site.description` in `en.json` already describes the site to readers.

## Consequences
**Positive:**
- Search engines and AI assistants get a description of what the site offers, in a sentence that the Organization JSON-LD and `llms.txt` already use. The machine-facing surfaces now say one thing.

**Negative:**
- The tagline appears on one fewer surface.

**Mitigations:**
- `frontend/__tests__/adr011-tagline.test.js` pins both meta-description keys to `CANONICAL_SENTENCE` and keeps the remaining tagline surfaces pinned to ADR-011.

## Alternatives considered
- Keep the tagline as the meta description. Rejected because ChatGPT's reading on 12/11 is the evidence that it describes the site wrongly.
- Write a new description sentence. Rejected because it would be new copy needing word-for-word approval, and an approved sentence already exists.
