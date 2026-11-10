# Business dashboard placement — Phase 0 audit (2026-11-10)

> **Read-only.** No code changed. Proposals only — Sapir decides (MEH-2881).
> As-of: `origin/staging` @ `75f34e45d`. File paths are under
> `frontend/app/[locale]/producer/dashboard/` unless stated; "he:" = `frontend/messages/he.json`.
> Method: static read of every page, link and email template; screenshots at
> 390 WebKit from a local production build with a stubbed API (new business
> vs approved + complete); a web study of four comparable products (§6).
> Not verified on staging (sandbox cannot reach it, MEH-2090).

**The rule being tested:** daily → dashboard home · weekly → a tab · one-time
setup → inside «עריכה». Nothing reachable from ≤ 1 place or more than 2 taps
from home. One name per job.

---

## 0. Found on the way — a bug that changes the starting point (MEH-2880)

The home page reads `producer.slug` from `GET /producers/me/dashboard`
(`page.js:402`), but that payload has no `slug`
(`backend/app/routers/producer_me.py:992-1004`; the page's own header says so,
`page.js:93-96`). So, statically, **four things on home never render** for any
owner:

- «לצפייה בעמוד שלך» (`page.js:479`)
- «הלינק שלי» `VanityLinkCard` (`:648`) and the share-locked hint (`:650`)
- `BusinessQrCard` «קוד QR לעמוד שלכם» (`:668-673`; gate `BusinessQrCard.jsx:41`)

…which leaves `/producer/dashboard/qr-card` with **no working inbound link**.
The tests mock a `slug` into the dashboard payload
(`__tests__/Dashboard1DStates.test.jsx:103`,
`e2e/flows/manual/dashboard-vanity-share.spec.ts:19,61`), so test and code are
wrong together. `GET /producers/me` (`profile`, already loaded at `page.js:279`)
does carry `slug` (`ProducerOwnerOut` ← `ProducerDetailOut` ← `ProducerListOut`).
**Not confirmed at runtime** — one production screenshot of an approved owner's
home settles it. The fix is a few lines, but it puts three one-time cards back
on home, which is exactly what §5 proposes to move, so it waits for the
placement decision.

---

## 1. What exists today

### Tab bar (`DashboardLayoutClient.jsx`)

| # | Label (he key) | Route | Line |
|---|---|---|---|
| 1 | סקירה (`nav.overview`) | `/producer/dashboard` | :46 |
| 2 | עריכה (`nav.edit`) | `/edit` | :47 |
| 3 | תובנות (`nav.insights`) | `/insights` | :48 |
| 4 | כלים (`nav.tools`) — also lit on events, experiences, group-buys, recipes, rescue | `/tools` | :52-63 |
| — | «צפייה בדף» (`nav.view_page`), a link not a tab, icon-only at 390 | `/producer/{id}` | :244-257 |

Organizer: סקירה · עריכה · «האירועים שלכם» (`:69-73`). At 390 the four tabs
share the width (no scroll, no overflow, MEH-2429). **No tab lights up on
`/followers` or `/qr-card`.**

### Home card order (`page.js`), as rendered

| # | Card | Shown when | Line |
|---|---|---|---|
| 1 | «שלום {name}» | always | 460-474 |
| 2 | «לצפייה בעמוד שלך» | `producer.slug` — **never** (§0) | 479 |
| 3-7 | Status banners: changes requested · draft submit · pending · rejected · inactive | by status | 496-594 |
| 8 | ProfileCompletenessCard «הפרופיל שלך X% מוכן» | not approved or incomplete | 601 |
| 9 | Holiday hint → `/edit#products` | 14 days before a holiday | 615-640 |
| 10 | «הלינק שלי» (copy + «שתפו») | slug + complete + approved — **never** (§0) | 648 |
| 11 | «קוד QR לעמוד שלכם» → `/qr-card` | same — **never** (§0) | 668 |
| 12 | «ערכת שיתוף» (story card ~480 px tall + review card) | approved | 678 |
| 13 | «מצב נוכחי» availability switch | always (disabled until approved) | 686-783 |
| 14 | KPI strip 7 days / zero «צפיות וקליקים» | analytics loaded | 804-834 |
| 15 | «פעילות אחרונה» | analytics loaded | 839 |

The comment at `page.js:440-446` says an approved business should see
**availability first** ("the daily action of a live business"); the code renders
it **after** the share cards. At 390, an approved owner scrolls past the
~480 px story canvas to reach the pause switch (screenshot: approved home is
2,576 px tall; the switch starts at ~1,870 px).

---

## 2. Per page

T = taps from home at 390 · Fit = does its place match its frequency.

| Page | Job · how often | Inbound links | T | Orphan? | Fit | New business sees |
|---|---|---|---|---|---|---|
| **home** | status, pause, this week's numbers · daily | tab; header menu «לוח הבקרה שלי» (`nav-registry.js:271`); login landing; registration/claim/verify; ~10 emails | 0 | — | yes | two near-identical zero cards («עוד אין צפיות או קליקים — שתפו…», `:824`; «כאן יופיעו קליקים וצפיות…», `:907`), neither with a share button; switch disabled «אפשר לעדכן זמינות ברגע שהעסק יאושר» |
| **edit** (hub) | profile setup · one-time (+ products/prices occasionally) | tab; 7 CTAs (completeness, banners, holiday, insights, public OwnerEditBar…); email `content_notifications.py:98` | 1 hub · **3 to a card** (tab → group → accordion, `openKey` null at `edit/page.js:258`); deep links open a card | no | yes | 5 groups «X מתוך Y הושלמו» + gold next-step dot |
| **insights** | numbers · weekly | tab only | 1 | no (tab) | yes | «העמוד עדיין לא פורסם» + link to edit; zeros; «אין נתונים עדיין» |
| **tools** | launcher · weekly | tab; back-links from 5 tool pages | 1 | no | yes | tiles always shown; pending → «ייפתח אחרי אישור העסק» on group-buys/rescue; **a draft gets no lock line**; reviews tiles hidden until approved |
| events | events + sign-ups · weekly (daily near an event) | tools `:123`; organizer tab; draft banner; public /events «add_event» | 2 (org: 1) | no | partly — sign-up emails (`registrations.py:203,273,396`) land on **home**, which shows no sign-ups | «עדיין אין אירועים» + «אירוע חדש»; a fetch error looks the same as empty (`:41`) |
| events/new · [id]/edit | create / edit | events list | 3 | edit: 1 entry | yes | form |
| experiences | workshops + sign-ups · weekly | tools `:132` | 2 | no | partly (same email issue) | «עדיין אין חוויות»; error = empty |
| experiences/new · [id]/edit | create / edit | list; public /events; redirect `next.config.js:197-205` | 3 | edit: 1 entry | yes | form |
| group-buys | group buys · weekly | **tools `:143` only** | 2 | near-orphan | yes | «צרו קבוצה ראשונה»; pre-approval: no CTA |
| recipes · [id]/edit | recipes · rare | tools `:168`; emails `content_notifications.py:50,63` | 2 / 3 | no | yes | «עדיין לא פרסמת מתכונים» + sample row; error = empty |
| **rescue** | today's leftover bags, hand-over code · **daily** (when the pilot flag is on) | **tools `:156` only**, behind `NEXT_PUBLIC_RESCUE_BAGS_ENABLED` | 2 | near-orphan | **no** — a daily job two taps behind «כלים» | «אין עדיין הזמנות להיום.» |
| rescue/counter-card | print the A5 till card · one-time | rescue `:28` only | 3 | **yes** (1 entry, 3 taps) | yes (one-time) | static |
| **followers** | how many saved the business + a share link · weekly | **none inside the dashboard.** Only the public page's owner-only empty reviews state (`ReviewsSection.jsx:571`), whose CTA says «לשיתוף העמוד» but opens «שמרו במועדפים» | ∞ (2 + scroll via the public page, only at 0 reviews) | **orphan** | no | «עוד אף אחד לא שמר — וזה בסדר» + «העתיקו קישור לשיתוף»; error shows as 0 |
| **qr-card** | print the A6 QR card · one-time | `BusinessQrCard.jsx:128` only — which never renders (§0) | ∞ | **unreachable** | partly | redirects to home when not eligible |

## 3. Home / tools / insights / edit cards

| Card | Job · how often | Where · T | Fit |
|---|---|---|---|
| KPI strip (`page.js:957-999`) | last 7 days · daily glance | home · 0 | yes |
| «פעילות אחרונה» (`:886-955`) | new WhatsApp clicks · daily | home · 0 | yes — but its CTA opens a bare `https://wa.me/` (`:941`) |
| «מצב נוכחי» / «בהפסקה» (`:686-783`) | pause / vacation · occasional–daily | home, **below** the share cards | partly (order) |
| «הלינק שלי» · QR · «ערכת שיתוף» (`:648-678`) | share / print · one-time–occasional | home, **above** the daily switch | **no** |
| ProfileCompletenessCard (`:601`) | setup checklist · setup only | home · 0 | yes, but see duplicate 1 |
| tools «ביקורות» (`tools :183`) | reply to reviews · weekly | tools · 2, opens the **public** `/producer/{id}#reviews` | partly (MEH-1416) |
| tools «בקשו ביקורת מלקוחה» (`:197`) | get a review link · recurring | tools · 1 | partly |
| insights cards + charts (`insights :180-295`) | weekly | insights · 1 | yes |
| edit groups: העסק · מוצרים ומחירים · מיקום, משלוחים ושעות · קשר · רישיון וכשרות | one-time setup | edit · 2-3 | yes |

## 4. Duplicates — one job, several names

1. **Setup checklist, twice on a new business's home.** «השלימו את הפרופיל כדי לשלוח לבדיקה» (draft-submit banner, 5 required items) and «הפרופיל שלך 0% מוכן» (completeness card, 6 items) stack one above the other with the same items in different words (screenshot `new-home`).
2. **"See my page" — five labels, three URL shapes:** «צפייה בדף» (`nav.view_page`, `/producer/{id}`), «לצפייה בעמוד שלך» (`states.view_public`, `/{slug}`, never renders), «הפרופיל שלי» (header menu, `/producer/{id}`), «צפייה בסקשן בדף שלך» (per edit card, `#section-*`), tools «ביקורות» (`#reviews`).
3. **Share my link — six places:** «הלינק שלי» / «העתיקו לינק» / «שתפו» (home, never renders) · followers «העתיקו קישור לשיתוף» · insights «שתפו את העמוד» (navigates to `/{slug}` instead of sharing, `insights :257`) · public reviews «לשיתוף העמוד» (→ followers) · home zero state «שתפו את העמוד שלכם כדי להתחיל» (no button) · plus the QR card and «ערכת שיתוף».
4. **"Saved by" count — twice:** the followers page and the insights card are both «שמרו במועדפים», same number. The dashboard payload's `favorites_count` (`producer_me.py:1005`) is unused.
5. **This week's numbers — three times:** home KPI strip (7 days), insights at «7 ימים» (same four numbers, different labels: «צפיות» vs «צפיות בפרופיל», «דירוג» vs «דירוג ממוצע»), and «פעילות אחרונה». The comment at `page.js:796-799` says they are "never duplicated".
6. **Reviews — three entry points:** tools «ביקורות», tools «בקשו ביקורת מלקוחה», the share kit's review card (its empty state links back to tools).
7. **«עריכה» vs «עריכת העסק»** (tab vs hub title), and seven different CTAs into /edit.

## 5. Proposals — ranked

Proposals only. Nothing moved. Order = impact on the owner's daily use.

| # | Rank | Proposal | Why | Belongs to |
|---|---|---|---|---|
| 1 | **fix** | Read `slug` from `profile` so the link, QR and "view page" render (§0) | today they never show; `/qr-card` is unreachable | MEH-2880 |
| 2 | **move** | Approved business: «מצב נוכחי» switch right under the greeting (and «סלי היום» there too when the rescue flag is on) | daily action; the code's own comment says so (`:440-446`); Toast / Shopify / Wolt open on today's state (§6) | this card |
| 3 | **merge** | New business: one setup checklist instead of two (keep the completeness card's meter + the submit button in one card) | same items twice at the top of the first screen she ever sees; Shopify: one setup guide, ≤ 5 steps, progress meter, gone when done | this card |
| 4 | **move** | Share block: keep one compact «הלינק שלי» row (copy + «שתפו») on home; move the QR card and «ערכת שיתוף» (story + review cards) into one «שיתוף» hub card in «כלים», with `/qr-card` under it | one-time/occasional jobs above the daily switch; none of the four products puts QR or posters on home (§6) | this card (tab name → MEH-1416) |
| 5 | **merge** | One "this week" card on home (the KPI strip) with «לכל הנתונים ←» to insights; drop «פעילות אחרונה» or fold it into the strip; one zero state with a «שתפו» button | three views of the same numbers; two zero states with no action; Shopify: home = quick stats + one action | this card |
| 6 | **merge** | `/followers` into the insights «שמרו במועדפים» card (count + share) and retire the page (redirect to insights) | orphan; the same number already lives in insights | this card |
| 7 | **move** | Rescue: when the flag is on, a «סלי היום» card on home (count + «לניהול ←»); the tool stays in «כלים» | daily job two taps deep | this card (flag still off in prod) |
| 8 | **rename** | One label for "see my page": «צפייה בדף» everywhere (nav, home, header menu); per-section links keep «צפייה בסקשן» | five names for one job | this card (copy → Sapir) |
| 9 | **fix** | Insights «שתפו את העמוד» shares (same action as «הלינק שלי») instead of navigating | a share button that opens the page | this card |
| 10 | **fix** | Sign-up emails (`registrations.py:203,273,396`) link to `/events` / `/experiences`, not home | the email says "new sign-up"; home shows none | this card |
| 11 | **fix** | Kashrut email (`content_notifications.py:98`) deep-links `/edit#kashrut` | lands on the hub, 2 more taps | this card |
| 12 | leave → MEH-1416 | «כלים» → «תוכן» and hub cards for events / experiences / group-buys / recipes; reviews get an inline reply surface instead of the public page | already decided there (21/07) | MEH-1416 |
| 13 | leave | Edit hub: 3 taps to a card | one-time job; deep links from every CTA already open the card | — |
| 14 | leave | group-buys, recipes, experiences, events in «כלים» | weekly / rare — a tab is right | MEH-1416 for the shell |
| 15 | leave | rescue/counter-card under rescue | one-time print, reached from where it is used | — |

**What belongs to MEH-1416 and what doesn't.** MEH-1416 owns the *tab
structure*: the «כלים» → «תוכן» rename, hub cards for the content tools, and
reviews' inline reply. It does **not** cover home's card order, the duplicate
checklists, the share block, the KPI duplicates, followers, rescue on home, the
"see my page" labels or the email deep links (#1-#11) — those can ship before
launch without touching the tab shell. #4 depends on MEH-1416 only for the name
of the tab the share hub lands in.

## 6. How four comparable products place the same jobs

Sourced from official help centres via search summaries (WebFetch to these hosts
is blocked by the repo's MEH-397 allowlist, so pages were not read in full;
most are undated; Wolt pages vary by market).

| Job | Toast | Shopify | Wolt Merchant | Google Business Profile |
|---|---|---|---|---|
| Today's orders / state | **home** (Toast Now: today's sales, orders) [T2] | **home** (tasks, order next steps — not dismissible) [S1] | separate tablet app [W4]; portal home = snapshot [W1] | — |
| Insights | home snapshot; full in Reports [T1][T3] | home metrics; full in Analytics [S1] | home snapshot; Business Insights [W1][W5] | «Performance» from the profile [G2] |
| Edit profile | secondary (Restaurant info) [T4] | — | secondary (Business details) [W6] | secondary («Edit profile») [G1][G7] |
| Share / QR / posters | secondary (Restaurant info → QR; marketing) [T4][T5] | per discount / Shopcodes app [S2][S3] | contact Wolt [W8] | under «Get more reviews», desktop only [G4] |
| Customers / reviews | secondary [T6] | Customers page [S4] | **home** recent reviews [W9] | «Read reviews» [G3] |
| Offers / events | secondary [T7] | Discounts [S2] | Campaigns; nudges in notifications [W2][W10] | Posts → Offer / Event [G5] |
| Surplus food | not found | not found | not found | not found |
| Setup progress | **home** checklist [T8] | **home** setup guide [S1][S5] | not found | «Profile Strength», after verification [G6] |

Takeaways:

1. **Home = today + what needs attention.** All three with a home screen open on a live state; none opens on one-time tools.
2. **Profile editing is never on home** — always one tap away in a secondary menu.
3. **Share / QR / print materials are never on home** in any of the four.
4. **Setup sits on home until done, then disappears** — one checklist with a meter, auto-completed steps, ≤ 5 steps (Shopify's published rules [S7][S8][S10]).
5. **Promotions are secondary**, nudged onto home as dismissible suggestions.
6. Shopify's published guidance: home "should provide merchants with quick statistics, status updates, or information that's immediately actionable" [S6]; empty states name the cause and give one action [S9].

Sources: [S1] help.shopify.com/en/manual/shopify-admin/shopify-home · [S2] help.shopify.com/en/manual/discounts/managing-discounts · [S3] help.shopify.com/en/manual/promoting-marketing/create-marketing/shopcode · [S4] help.shopify.com/en/manual/customers · [S5] help.shopify.com/en/manual/intro-to-shopify/initial-setup/setup-getting-started · [S6] shopify.dev/docs/apps/design/user-experience/app-home-page · [S7] shopify.dev/docs/api/app-home/latest/patterns/compositions/setup-guide · [S8] shopify.dev/docs/apps/design/user-experience/onboarding · [S9] shopify.dev/docs/api/app-home/latest/patterns/compositions/empty-state · [S10] shopify.dev/docs/apps/launch/built-for-shopify/requirements · [T1] support.toasttab.com/en/article/Reporting-Best-Practices-Reports-to-Use-After-Your-First-Day-on-Toast · [T2] support.toasttab.com/en/article/Get-Started-with-the-Toast-Now-App · [T3] support.toasttab.com/en/article/How-to-Use-the-Toast-Reporting-Dashboard · [T4] support.toasttab.com/en/article/Generating-QR-Codes-for-Menus-and-Online-Ordering · [T5] support.toasttab.com/en/article/Creating-Marketing-Materials-for-Your-Restaurant · [T6] support.toasttab.com/en/article/Access-Your-Guest-Data-with-the-Guest-Report · [T7] support.toasttab.com/en/article/Getting-Started-Launching-Your-First-Email-Marketing-Campaign · [T8] support.toasttab.com/en/article/Completing-Your-Toast-Business-Setup-Tasks · [W1] merchant.wolt.com/en/mlt/blog/explore-your-new-merchant-portal · [W2] merchant.wolt.com/en/lva/learning-center/personalized-growth-recommendations · [W4] explore.wolt.com/en/geo/merchant/learning-center/manage-wolt-orders · [W5] merchant.wolt.com/en/hun/solution/analytics · [W6] merchant.wolt.com/en/grc/learning-center/set-venue-opening-hours · [W8] merchant.wolt.com/en/ltu/learning-center/get-the-most-out-of-storefront · [W9] merchant.wolt.com/en/deu/learning-center/how-to-improve-your-venue-rating-on-wolt · [W10] merchant.wolt.com/en/hun/learning-center/marketing-campaigns-use-ads-promos · [G1] support.google.com/business/answer/3039617 · [G2] support.google.com/business/answer/9918094 · [G3] support.google.com/business/answer/3474050 · [G4] support.google.com/business/answer/16816815 · [G5] support.google.com/business/answer/7342169 · [G6] support.google.com/business/answer/15691556 · [G7] support.google.com/business/answer/7039811

## 7. Registry today (`frontend/lib/business-features.js`)

- Entries that map to a dashboard surface: home `vanity_link`, `qr_code`, `share_cards`, `completeness`, `vacation_mode` (codeRef is the public header, not the home switch) · edit `map_precision`, `multi_locations`, `faq_answers`, `delivery_areas`, `offer`, `hours`, `ai_writer` · events `events` · group-buys `group_buys` · followers `follower_updates` (label promises an update to followers; the page only shows a count + copy link) · insights `views`, `search_impressions`, `contact_clicks`, `top_cities`, `demand_cities`, `drop_point_hosts`, `favorites_rating` · tools `review_request`, `reviews_contacted` · recipes `recipes` · rescue `rescue_bags`.
- **Dashboard pages with no entry:** experiences (no id at all), qr-card (only via `qr_code`), rescue/counter-card, the tools and insights hubs, home's KPI strip and «פעילות אחרונה».
- `__tests__/BusinessFeaturesRegistry.test.js` catches a removed codeRef file only — not an added tool that was never listed, and not a codeRef that still exists but no longer does what the label says.

## 8. After the decision (not started)

A template-06 card with the «מיקום» block, then:
- a `dashboard` field per tool in `business-features.js` (home group + entry href);
- a test that goes red when a page under `/producer/dashboard` has no entry, an entry's page has no inbound link, or a page is more than 2 taps from home;
- a rule in `.claude/rules`: any PR touching `/producer/dashboard` carries the «מיקום» block in its card, and the fresh reviewer checks it against what was built.

Screenshots behind §1-§4 (local build, stubbed API, 390 WebKit) are in the
session scratchpad, not committed; one production screenshot of an approved
owner's home is the open verification for §0.
