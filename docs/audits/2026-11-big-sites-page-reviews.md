# «ללמוד מהאתרים הגדולים» — מרשם דפים

Workflow rule 37b ([.claude/rules/workflow.md](../../.claude/rules/workflow.md)):
every new page under `frontend/app/[locale]/` gets this full review before
code (smaller UI changes get the light check in the PR body, same rule).
This file says which pages have had it, where the decision lives, and what is
still open. As of 14/11/2026 (MEH-3110). Linear is the live status; this is
the index.

## Method

1. Screenshots at 375 + 1440 (staging with the protection-bypass headers of
   [testing.md](../../.claude/rules/testing.md), or a local production build).
2. Compare with the big sites that fit the page type — Airbnb, Wolt, Etsy,
   Yelp, Google Maps, Eventbrite — cite sources.
3. Each gap: a real rendered mock, the px it moves, the cost.
4. Recommendation per gap, "leave as is" included.
5. Pre-launch vs post-launch; post-launch items go to Linear.
6. Sapir picks; code after. Mock copy is draft until approved word for word.

## Done

| Page | Route | Outcome |
|---|---|---|
| Home | `/` | Categories one row on desktop (MEH-3061, PR #4424) |
| Map | `/map` | One chip row on phone (MEH-3062), names beside pins (MEH-3066) |
| Business page | `/p/[slug]`, `/[slug]`, `/producer/[id]` | MEH-3032, MEH-3033, MEH-3035, MEH-1337, MEH-3053 |
| All businesses | `/producers` | Phone filter row (MEH-3075, PR #4435) |
| Business signup | `/join`, `/register/producer` | Post-launch ideas in MEH-3080 |
| Business dashboard | `/producer/dashboard/**` | MEH-3106, MEH-3107, MEH-3108; post-launch MEH-3079 |
| Event page | `/events/[id]` | Own thread (14/11) |

## Not yet reviewed (14/11) — in order of user impact

**Wave 1 — high traffic:** `/events` · `/rescue` · `/group-buys` + `/group-buys/[id]` ·
`/experiences` + `/experiences/[id]` · `/login`, `/register`, `/forgot-password`,
`/reset-password` · `/producers/[category]/[region]`, `/producers/diet/[dietSlug]`.

**Wave 2 — signed-in users:** `/favorites` · `/messages` · `/settings` ·
`/organizers/[slug]` · `/[slug]/recipes/[recipe_id]`.

**Wave 3 — content and trust:** `/about` and its sub-pages (`badges`, `process`,
`why-local`, `for-businesses`, three guides) · `/contact` · `/recommend`.

**Wave 4 — short transition pages (quick check):** `/claim`, `/claim/[token]`,
`/owner-invite/**`, `/registration/[token]`, `/verify-email`, `/business-gone`,
`/newsletter/unsubscribe`, `/delivery-waitlist/**`, `/register/organizer`.

**Out of scope:** `/terms`, `/privacy`, `/accessibility` (legal text) ·
`/admin/**` (Sapir only) · `/dev/components`.
