# 🧾 Design Inventory — code truth per surface

> **Governance rule: this file is updated in the same PR that changes a
> surface listed here — a standalone doc that rots is the anti-pattern**
> (`.claude/rules/workflow.md` § Smell #2). If a PR adds/removes a
> component, endpoint, or payload field on a listed surface, the same PR
> updates the matching section and its "last verified" date.

Consumed by the mandatory `<code_truth>` block in
[docs/templates/01-claude-design.md](../docs/templates/01-claude-design.md)
(v2.1, MEH-1004). Purpose: Claude Design invents capabilities when it has no
code truth (incident 2026-07-03 — notifications bell with no backend,
"images editor" designed against a stale gap list, checklist field not in
the heuristic; MEH-964 / MEH-1002). Every design session pulls the relevant
surface sheet from here into `<code_truth>` — after re-verifying it is not
stale.

**Verification bar:** every claim below carries a `file:line` citation
against `staging`. A claim without a citation is a guess — do not design
against it. Scope: one surface bootstrapped (producer dashboard); new
surfaces are added by the PR that first designs against them, per the
governance rule above.

---

## Surface: producer dashboard (`/producer/dashboard`)

_Last verified: 2026-07-03 against `origin/staging` (MEH-1004 Phase 0)._

### Components (existing)

| Component | Where (file:line) | Notes |
|---|---|---|
| Tab nav shell — Overview / Edit / Insights / Tools | `frontend/app/[locale]/producer/dashboard/layout.js:33-38` | UX-level auth gate at `:48-55`; real enforcement is `require_producer` server-side |
| Overview page (greeting, status banners, holiday hint) | `frontend/app/[locale]/producer/dashboard/page.js:77` | status banners: pending / rejected / pending_whatsapp (`:224-272`) |
| VanityLinkCard (copy + WhatsApp share of `/p/<slug>`) | `frontend/app/[locale]/producer/dashboard/page.js:19-59` | rendered only when `producer.slug` is set (`:299-301`) |
| Availability card — 4-state radiogroup | `frontend/app/[locale]/producer/dashboard/page.js:307-379` | states: accepting_orders / available_today / full_this_week / on_vacation; vacation return-date input (`:352-378`) |
| ProfileCompletenessCard | `frontend/components/ProfileCompletenessCard.jsx:11` | renders `producerCompleteness()` — **6 fields**: city, coords, delivery, contact, category, image (`frontend/lib/producer-completeness.js:14-21`). **No "description" field yet — MEH-1002 open** |
| PhoneVerifyCard (WhatsApp OTP) | `frontend/components/PhoneVerifyCard.jsx:13` | wires POST `/producers/me/verify-phone` + `/confirm` |
| OverviewStatsHero — 4-KPI strip + conversion line | `frontend/app/[locale]/producer/dashboard/page.js:419-480` | KPIs (RTL order): whatsapp_leads / contact_clicks / rating / views, uniform last-7d window; "business of the week" eligibility badge (`:466-477`) |
| Edit tab — categories editor (chunk A) | `frontend/app/[locale]/producer/dashboard/edit/page.js` (PR #1436) | |
| Edit tab — gallery images editor (chunk B) | `frontend/app/[locale]/producer/dashboard/edit/page.js:432` (PR #1440) | multi-file upload via POST `/upload/image`; saves `images[]` via PUT `/producers/me` |
| Edit tab — location/coords editor (chunk C) | `frontend/app/[locale]/producer/dashboard/edit/page.js` (PR #1446) | |

Additional dashboard routes outside the 4-tab nav: `recipes/`, `group-buys/`,
`events/new/`, `followers/`, `insights/` (deep analytics), `tools/` (quick
links).

### Data fields (verified payloads)

**GET `/producers/me`** (`backend/app/routers/producer_me.py:61-77`) →
`ProducerOwnerOut`: full owner record incl. `categories`, `products`,
`delivery_areas` (joinedload `:67-71`). Writable via PUT `/producers/me`
(`:115`): the `_PRODUCER_WRITABLE_FIELDS` set (`:128-159`) — incl. `images`,
`slug`, `custom_questions`, contact channels.

**GET `/producers/me/dashboard`** (`producer_me.py:406-456`) — minimal
summary:

- `producer.{id, name, is_available_today, availability_status, availability_state, vacation_until, status, plan}` (`:438-453`)
- `favorites_count` (`:418-423`) · `whatsapp_clicks_week` (`:428-436`)

**GET `/producers/me/analytics`** (`producer_me.py:488-705`) — rich
analytics:

- `profile_views` / `search_appearances` / `whatsapp_clicks` / `contact_clicks` — each `{last_7d, last_30d, total}` (`:523-530`)
- `follower_count` + `new_followers_this_week` (`:533-548`) — **counts only, no follower identities**
- `average_rating` + `total_reviews` — cached aggregate on the producer row (`:550-553`)
- `home_products_count` (`:556-564`)
- `views_by_day` — 30-entry zero-filled daily series (`:566-587`)
- `top_cities` — top-5 aggregated `{city, count}` (`:589-604`)
- `rank_in_city` (`:606-631`) · `conversion_rate` — whatsapp/views ×100, 30d (`:633-638`)
- `profile_strength` — 0–100 from 5 signals: images, description ≥50 chars, delivery area, reviews, phone_verified (`:640-662`). Note: this backend score **does** weigh description; the frontend completeness card does **not** (MEH-1002)
- `weekly_trend` — categorical `up`/`down`/`stable` only (`:664-687`)

### Backend capabilities (verified)

- Availability state machine: POST `/producers/me/availability-state` with transition validation (`producer_me.py:361-403`); legacy `/availability` + `/availability-status` during MEH-291 overlap (`:280`, `:315`)
- Phone verification via WhatsApp OTP (`producer_me.py:729-803`)
- Kashrut badge request (`producer_me.py:811-850`)
- AI bio generator, fail-open (`producer_me.py:858-872`)
- Product CRUD (`producer_me.py:879-977`)

### NOT available — do NOT design features on this list

- **Producer notifications system** (bell / inbox / in-app feed) — no
  backend. The alerts router serves **consumer-side** favorite alerts at
  `/users/me/favorites` (`backend/app/routers/alerts.py:37`, model
  `FavoriteAlert` at `backend/app/models/models.py:488`); nothing notifies
  producers in-app.
- **Per-event / per-view viewer identity in analytics** — no per-view rows,
  viewer names, or event-level breakdowns. The payload is aggregates only:
  `top_cities` top-5 counts (`producer_me.py:589-604`), `views_by_day`
  daily counts (`:566-587`). Followers: count only, no names (`:533-548`;
  `dashboard/followers/page.js` reads `/producers/me/analytics` +
  `/producers/me` only).
- **Per-KPI numeric deltas** — no prior-period counts per metric; only the
  categorical `weekly_trend` for views (`producer_me.py:664-687`).
  Documented as a deliberate data-reality constraint in the
  OverviewStatsHero header (`dashboard/page.js:406-417`).

> **Correction vs the MEH-1004 ticket text:** "self-serve gallery editor"
> was listed as NOT-available at incident time; it has since shipped
> (PR #1440, Edit tab chunk B) and is listed above as **available**.
> Verified per the ticket's own Phase 0 rule — no claims taken on faith.
