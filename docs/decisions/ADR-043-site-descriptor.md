# ADR-043: Each brand sentence has one job — the descriptor for machines, the brand sentence for shared links, the tagline for businesses

**Status:** Accepted (amends the surface lists of ADR-011 and ADR-041; the tagline and the canonical sentence keep their wording)
**Date:** 2026-11-18
**Deciders:** Sapir Levi
**Source:** MEH-3424; the research thread «תיאור האתר» of 18/11/2026 and its doc https://claude.ai/artifact/6iSxQbPR8qGUtJ4iSkknN4

## Context
Before this ADR the same surface type said different things depending on which file set it, and nothing decided which sentence belonged where:

- Search results (`<meta name="description">`) showed the canonical sentence «אוכל מבתי עסק מקומיים שבחרנו אישית — קרוב לבית, בלי לחפש שעות.» (ADR-041).
- A shared link (`og:description`, `twitter:description`) showed the ADR-011 tagline «מהמקור — הבית הראשון של העסק שלך. המקום שבו הסיפור מתחיל.». Its first clause speaks to business owners, so a consumer who got the link from a friend read a promise meant for someone else. ChatGPT also took it for the site's self-description (ADR-041).
- The Organization JSON-LD and `llms.txt` showed the canonical sentence; the PWA manifest had a fourth sentence.

Sapir asked for one way to say what the site is. On seeing the first version (one sentence everywhere) she said she likes the variety and the sentences, and asked whether uniformity is really needed or whether it can be arranged more cleverly.

What the research says:

- **Machines need one answer.** Search engines and AI assistants build one picture of an entity from every place that describes it; matching descriptions across the site, its structured data and its profiles is the common advice for being described correctly (entity/AEO guides, e.g. [MarTech](https://martech.org/how-to-strengthen-your-brand-story-to-improve-aeo-visibility/), [Acadia](https://acadia.io/why-ai-describes-your-brand-wrong)). These are practitioner sources, not Google documentation.
- **People can get different words.** Practitioners write `og:description` separately when the share copy should be punchier than the search snippet, as long as the two never contradict ([LinkGraph](https://www.linkgraph.com/?p=18001), [Moz Q&A](https://mozdev.nodebb.com/community/q/topic/43706/og-description-vs-name-description)).
- **Messaging frameworks give each line a layer:** a plain statement of what it is, a value line, a tagline for recall ([Fabrik](https://fabrikbrands.com/insights/verbal-identity/brand-messaging-hierarchy), [Crayon](https://www.crayon.co/blog/messaging-hierarchy)). Every layer must trace back to the same idea.
- The descriptor wording itself: blind-reader tests (AI readers, an indication only) and `.agents/product-marketing-context.md` («הבעיה שלא יודעים איפה למצוא אותו») led to a line that leads with finding.

## Decision
Uniformity where a machine reads, variety where a person reads. Three sentences, each with one job and one owner:

| Sentence | Job | Surfaces | Owner |
|---|---|---|---|
| **«במהמקור מוצאים אוכל מבתי עסק מקומיים קרוב לבית, במקום אחד.»** (approved word for word by Sapir, 18/11/2026) | What the site is, for search engines and AI | `seo.site.description`, `seo.home.description`, the layout fallback `description`, the Organization JSON-LD `description`, the `llms.txt` summary, the PWA manifest `description` | `SITE_DESCRIPTION`, `frontend/lib/constants.js` |
| **«אוכל מבתי עסק מקומיים שבחרנו אישית — קרוב לבית, בלי לחפש שעות.»** | The promise to someone looking for food | the home hero subheading, the shared-link card (`seo.site.og_description`, `seo.site.twitter_description`, the layout fallback og/twitter), the Organization JSON-LD `slogan` | `CANONICAL_SENTENCE`, same file |
| **«מהמקור — הבית הראשון של העסק שלך. המקום שבו הסיפור מתחיל.»** | The promise to a business owner | the footer brand line; the sentence to use when presenting the site to a business | `nav.footer.brand_tagline` (ADR-011) |

A page with its own share copy (`/join`, `/about` and others) keeps it; the table sets the site-wide defaults.

**Amendment, 18/11/2026 (Sapir approved the wording Claude chose, message of 20:47Z):**
- English follows the same three roles: descriptor «Mehamakor is where you find food from local businesses near you, all in one place.» on `seo.site.description` / `seo.home.description`; the share card carries the approved English hero subheading.
- Privacy policy §1 now reads «"מהמקור" … הוא אתר שבו מוצאים אוכל ומוצרי טיפוח טבעיים מבתי עסק מקומיים בישראל, ופונים אליהם ישירות.» (natural-care products stay, because the site lists them).
- The email footer is «מהמקור — אוכל מבתי עסק מקומיים קרוב לבית, במקום אחד.» (`backend/app/routers/marketing.py`, `backend/app/services/delivery_waitlist.py`).

**Still not in this ADR:** outreach templates, page titles, the per-page descriptions of `/about` and `/login`, the chat system prompt (`backend/app/routers/chat.py`), and the share message (`share_msg`).

## Consequences
**Positive:**
- Google, AI assistants and the installed app give one answer to "what is this site".
- A person who receives a link reads the warm promise, written for them, instead of a line for business owners.
- Each sentence has a stated job, so the next copy edit knows which one to touch.

**Negative:**
- Three sentences to keep, not one. A search snippet and a shared link still read differently (on purpose).
- The tagline is no longer on the shared-link card.

**Mitigations:**
- `frontend/__tests__/adr011-tagline.test.js` pins the meta-description keys to `SITE_DESCRIPTION`, the og/twitter keys to `CANONICAL_SENTENCE`, and the footer to the tagline.
- `frontend/__tests__/organization-jsonld.test.js` pins the JSON-LD `description` and `slogan`, the `llms.txt` summary, the layout fallback and the manifest.
- `frontend/__tests__/CanonicalSentenceCopy.test.js` keeps the canonical sentence's wording pinned.

## Alternatives considered
- **One sentence everywhere** (this ADR's first version). For it: the simplest rule, and a search result and a shared link always match. Against: it throws away two approved sentences Sapir likes, and a shared link is read by a person, where a promise does more than a definition.
- **Leave it as it was.** For it: nothing to change, and every sentence was already approved. Against: no rule said which sentence goes where, so a shared link spoke to business owners and the machine-facing surfaces could drift apart.
- **Lead with "we check".** It is the clearest difference from Google Maps and Facebook groups. Rejected for the descriptor because it answers a question the reader has not asked yet; it lives on in the brand sentence («שבחרנו אישית»).
