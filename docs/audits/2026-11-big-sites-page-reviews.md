# «ללמוד מהאתרים הגדולים» — מרשם דפים

Workflow rule 37b ([.claude/rules/workflow.md](../../.claude/rules/workflow.md)):
every new page under `frontend/app/[locale]/` gets this full review before
code (smaller UI changes get the light check in the PR body, same rule).
This file says which pages have had it, where the decision lives, and what is
still open. As of 14/11/2026, 20:40Z (MEH-3110). Linear is the live status; this is
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
| Hub tabs | `/events`, `/rescue`, `/group-buys`, `/experiences` | Shorter head, first item ~120px higher (MEH-3113, PR #4469) · «היום / מחר / סוף השבוע» chips (MEH-3118, PR #4474) · empty-state line + «לבתי העסק» on rescue and group buys, and a follower alert for rescue bags (MEH-3117, PR #4472). Post-launch: MEH-3111 |
| Login and register | `/login`, `/register`, `/forgot-password`, `/reset-password` | No pre-launch gap. A line above login when arriving from favorites (MEH-3120, PR #4475) |
| Category and diet landing | `/producers/[category]/[region]`, `/producers/diet/[dietSlug]` | No pre-launch gap; post-launch in MEH-3111 |
| Favorites | `/favorites` | A type with nothing saved gets no tab (MEH-3174, PR #4534). Checked signed in on staging. Post-launch: undo on unfavorite |
| Messages, settings | `/messages`, `/settings` | Checked signed in on staging, no pre-launch gap. Post-launch: self-serve email change, one alerts screen (MEH-3116) |
| Recipe | `/[slug]/recipes/[recipe_id]` | Servings scaler (MEH-3121, PR #4477) |
| Organizer | `/organizers/[slug]` | No pre-launch gap; post-launch in MEH-3116 |
| About family, contact, recommend | `/about/**`, `/contact`, `/recommend` | `/about/process` matrix as compact rows (MEH-3114, PR #4470); the rest post-launch in MEH-3116 |
| Transition pages | `/claim/**`, `/owner-invite/**`, `/registration/[token]`, `/verify-email`, `/business-gone`, `/newsletter/unsubscribe`, `/delivery-waitlist/**`, `/register/organizer` | «שלחו לי קישור חדש» on a claim link that no longer works (MEH-3122, PR #4481). Verify-email already has resend. No other gap |
| Account deleted | `/account-deleted` | MEH-3248. Airbnb ([help 240](https://www.airbnb.com/help/article/240)) and Etsy ([help 115015693707](https://help.etsy.com/hc/articles/115015693707)) say a deleted account cannot be reopened, and ask for the password before account changes; the page says the same (deleted, confirmation by email, no undo) and the delete asks for the password or a fresh Google/Apple sign-in ([Userflow on deletion UX](https://medium.com/userflow/user-friendly-ways-to-handle-account-deletion-3290133169c9)). One button home, noindex. No pre-launch gap. Screenshots `qa-artifacts/MEH-3248/` |
| Newsletter confirm | `/newsletter/confirm` | MEH-3300 (D13). Same shape as Mailchimp's double opt-in ([help: about double opt-in](https://mailchimp.com/help/about-double-opt-in/)): the email holds one button, the page confirms and says so. One difference on purpose: the page confirms only on a button click, because mail scanners open links. noindex. No pre-launch gap |
| Order status (buyer) | `/order/[id]` | MEH-3216 stage 5a. Shopify's order status page is the model: one page per order behind a private link, the status first, then pickup details and instructions ([Order status page](https://help.shopify.com/en/manual/orders/status-tracking), [Pickup in store](https://help.shopify.com/en/manual/fulfillment/setup/delivery-methods/pickup-in-store)); the Shop app adds a code staff check at the counter ([Shop: pickup orders](https://help.shop.app/el/shop/delivery-tracking/pickup-orders)). Ours: one approved headline per status, the hand-over line with the business's public address, a large pickup code, what to pay (no payment on the site), cancel until the cutoff, and the proposal's two buttons. noindex, no-referrer, token after `#`. Post-launch: a calendar file, a map link. Screenshots `qa-artifacts/MEH-3216/status-*` |

## Not yet reviewed

None as of 14/11/2026: every route outside the out-of-scope list has a row
above. A new page gets its row in the PR that adds it (rule 37b).

**Out of scope:** `/terms`, `/privacy`, `/accessibility` (legal text) ·
`/admin/**` (Sapir only) · `/dev/components`.
