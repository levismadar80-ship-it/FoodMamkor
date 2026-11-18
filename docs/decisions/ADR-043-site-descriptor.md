# ADR-043: One sentence describes the site, on every surface that describes it

**Status:** Accepted (amends the surface lists of ADR-011 and ADR-041; the tagline and the canonical sentence keep their wording)
**Date:** 2026-11-18
**Deciders:** Sapir Levi
**Source:** MEH-3424; the research thread «תיאור האתר» of 18/11/2026 and its doc https://claude.ai/artifact/6iSxQbPR8qGUtJ4iSkknN4

## Context
Before this ADR the site described itself in three different sentences, depending on where a reader met it:

- Search results (`<meta name="description">`) showed the canonical sentence «אוכל מבתי עסק מקומיים שבחרנו אישית — קרוב לבית, בלי לחפש שעות.» (ADR-041).
- A shared link (`og:description`, `twitter:description`) showed the ADR-011 tagline «מהמקור — הבית הראשון של העסק שלך. המקום שבו הסיפור מתחיל.». Its first clause speaks to business owners, which is why ChatGPT took it for a directory for businesses (ADR-041).
- The Organization JSON-LD and `llms.txt` showed the canonical sentence.

Sapir explains the site to businesses in yet other words, and asked for one way to say what the site is.

The research, recorded in the doc above:

- A category noun was tested and dropped. «מדריך» was read as "a guide for businesses". «אינדקס» and «אתר שמרכז» did not say who the site is for.
- A short sentence that says who does what was read correctly by blind readers. The readers were AI models, so this is an indication, not proof.
- The site exists because people do not know where to find local food (`.agents/product-marketing-context.md`, «הבעיה שלא יודעים איפה למצוא אותו»). US surveys point the same way: access and convenience come first, trust does not lead. NN/g's advice for a site description is one line that says what the site does.

## Decision
Every surface that describes the site in one line carries this sentence, which Sapir approved word for word on 18/11/2026:

> **במהמקור מוצאים אוכל מבתי עסק מקומיים קרוב לבית, במקום אחד.**

It is `SITE_DESCRIPTION` in `frontend/lib/constants.js`. It is shown in:

- `seo.site.description` and `seo.home.description` in `he.json`, which are the meta description;
- `seo.site.og_description` and `seo.site.twitter_description`, which are the shared-link card;
- the fallback `description`, `openGraph.description` and `twitter.description` in `app/[locale]/layout.js`;
- the Organization JSON-LD `description` (`buildOrganizationNode`, `lib/seo.js`);
- the summary line of `public/llms.txt`;
- the PWA `description` in `public/manifest.json`.

The other two sentences are unchanged and move to surfaces that are not "what is this site":

- The **canonical sentence** stays the home hero subheading and becomes the Organization JSON-LD `slogan`.
- The **ADR-011 tagline** stays on the footer brand line (`nav.footer.brand_tagline`), its one remaining surface.

That the site checks every business before it goes up is **not** part of the descriptor. It is supporting copy where a reader is already deciding whether to contact a business (the business page, `/about`, `/about/process`). That copy needs its own word-for-word approval.

**Not in this ADR:** English. `en.json` keeps its current description until Sapir approves an English sentence. Privacy policy §1 and any outreach templates also wait for their own approved wording. Also left as they are, because they are not a one-line description of the site or need wording of their own:

- page titles (`seo.site.title`, `og_title`, `twitter_title`) and the per-page descriptions of `/about` and `/login`;
- the email footer line «מהמקור — בתי עסק מקומיים, כולם במקום אחד.» (`backend/app/routers/marketing.py`, `backend/app/services/delivery_waitlist.py`);
- the chat assistant's system prompt (`backend/app/routers/chat.py`), which no user sees;
- the share message (`share_msg`) and short promo lines in `he.json`.

## Consequences
**Positive:**
- A search result, a shared link and an AI assistant now say the same thing about the site.
- The sentence speaks to the person looking for food, which is who the public pages are for.

**Negative:**
- The tagline is no longer on the shared-link card.
- The canonical sentence is no longer the meta description, which ADR-041 chose only six days earlier.

**Mitigations:**
- `frontend/__tests__/adr011-tagline.test.js` pins all four he.json keys to `SITE_DESCRIPTION`, pins the sentence itself, and keeps the footer on the ADR-011 tagline.
- `frontend/__tests__/organization-jsonld.test.js` pins the JSON-LD `description` and `slogan` and the `llms.txt` summary line.
- `frontend/__tests__/CanonicalSentenceCopy.test.js` keeps the canonical sentence's wording pinned.

## Alternatives considered
- **Leave the canonical sentence as the description everywhere.** Its strongest case: it is already approved, already on three surfaces, and says "we chose personally", which no other directory can say. Rejected because it leads with trust, while the research says people come to find food, and because its second half («בלי לחפש שעות») describes the pain instead of the site.
- **Lead with "we check".** It is the clearest difference from Google Maps and Facebook groups. Rejected for the main line because it answers a question the reader has not asked yet. It stays as supporting copy.
- **Two sentences (what it is, then "every business is checked").** Rejected because Sapir judged the second sentence not essential (18/11).
