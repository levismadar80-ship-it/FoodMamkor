# State machines

**Last reviewed:** 2026-11-17 · **Owner:** whoever changes a status column or a transition

Every status in the product, who can move it, and where the move is written.
This is the current picture. How each one was found, and the reasoning behind
each fix, is in the audit:
[docs/audits/2026-11-implicit-state-machines.md](./audits/2026-11-implicit-state-machines.md).

Paths are under `backend/app/`. A line number is where the transition is
written on the day of the review; the function name next to it is what to grep
when the line has moved.

## What does not exist

- **Cart.** There is no cart or basket, in the backend or the browser. Customer
  money never passes through the site (ADR-042). The nearest thing is a
  sessionStorage key that carries a group-buy quantity across a login
  (`GroupBuyDetailClient.jsx`, `group_buy_draft_qty_<id>`).
- **Product orders.** The tables and the transition table exist
  (`models/product_orders.py`, `services/product_order_state.py`), but no route
  creates or moves an order, and every route in `routers/product_orders.py`
  answers 404 while `product_orders_enabled` is false. Add the machine here in
  the PR that mounts the first order route.
- **Paid subscription.** `business_billing.state` has five values
  (launch / notice / active / page_only / unpaid) and no code writes it.
  `BILLING_PHASE` is `"launch"`, so every paid tool is open to everyone.

## 1. Account (`users`)

There is no soft-delete: deletion removes the row.

| Field | Values |
|---|---|
| `role` | consumer · producer · admin |
| `is_blocked` | false · true |
| `email_verified` | false · true |
| `token_version`, `password_changed_at` | counters that invalidate older tokens |

| Transition | Who | Where | Guard |
|---|---|---|---|
| → consumer | anyone | `routers/auth.py` `register` | rate limit per IP and per email |
| consumer → producer (with a draft business) | the user | `routers/auth.py` `register_producer`; claim `routers/producer_claim.py`; invite `routers/producer_owner_invite_existing.py` | an admin account is refused |
| role → consumer / admin | admin | `routers/admin_extra.py` `update_user_role` | `producer` is refused; super-admin protected; no self-demotion; → consumer **and → admin** are both refused (409) while `producer_id` is set (MEH-3376): an account with a business is never an admin |
| blocked ⇄ not blocked | admin | `routers/admin_extra.py` `block_user` | no self-block; blocking the only owner of a live business hides it (`hide_business`, MEH-2871) |
| email verified | the user | `routers/auth.py` `verify_email`; OAuth sign-in | token expiry, row lock |
| email changed → unverified | the user | `routers/users_me.py` | current password (MEH-3104); 5 wrong per account per hour, row lock (MEH-3425); OAuth and super-admin refused; other devices signed out (`token_version`) |
| tokens invalidated | the user | logout-all, password change, password reset, email change (MEH-3425) | checked on every request in `auth.py` `get_current_user` |
| deleted | the user / admin | `services/user_deletion.py` `delete_user_and_data` | admins cannot be deleted; re-authentication required |

A blocked user is refused on every request, login and refresh
(`auth.py` `get_current_user`), so a token that is still valid stops working at
once. If she is the only owner of a live business who can still sign in, the
business goes approved → inactive with her (`services/booking_cancellations.py`
`hide_business`, the same path as an admin pause). Unblocking does not put it
back; an admin un-pauses it through the approval gates.

**What deletion does:** records no-show tombstones, recomputes the ratings she
contributed to, removes favorites, reports and her contact trail, withdraws her
group-buy commits (a funded group that drops below its minimum goes back to
open), releases her reserved surprise bags back to stock, and, if she owns a
business, delists it (below) and deletes it. Event sign-ups are keyed by email
and stay until the 30-day purge. Billing rows outlive the business.

## 2. Business approval (`producers.status`)

```
            submit                approve
  draft ───────────▶ pending ───────────────▶ approved ⇄ inactive
                        ▲   │ reject             │  ▲      (pause / un-pause)
              resubmit  │   ▼                    │  │
                        └─ rejected ◀────────────┘  │ reject
```

"Live" is one rule, `is_business()` in `services/producer_listing.py`:
approved, `kind='producer'`, not a test row. Events use `is_live_owner_row`
(approved, not a test row, either kind).

| From → to | Who | Where | Guard |
|---|---|---|---|
| → draft | owner registers | `routers/auth.py` | — |
| → approved | admin creates | `routers/admin.py` | pre-approved unless `as_draft` |
| draft → pending | owner | `routers/producer_me_review.py` `submit_for_review` | draft only; `submission_missing_items` |
| draft → approved | admin, for an ownerless draft whose owner agreed in writing | `routers/producer_draft_preview.py` `publish_draft_with_consent` | ownerless draft only; consent note required; `_assert_approvable` (phone gate overridden, licence only with `allow_without_license`) |
| rejected → pending | owner | `routers/producer_me_review.py` `request_producer_review` | row lock; resubmission cap |
| non-draft → approved | admin | `routers/admin_decisions.py` → `services/producer_approval.py` | `_assert_approvable` |
| non-draft → rejected | admin | `routers/admin_decisions.py` `reject_producer` | if it was approved: `delist_business` |
| approved ⇄ inactive | admin | `routers/admin.py` `toggle_status` | un-pause re-runs the approval gates; pause calls `hide_business` → `delist_business` |
| approved → inactive | admin blocks the only owner | `routers/admin_extra.py` `block_user` → `hide_business` | a co-owner who can sign in keeps it up |
| any → (status via plain edit) | — | refused in `routers/admin.py` | — |
| deleted | admin / owner's account deletion | `routers/admin.py`, `services/user_deletion.py` | `delist_business` first |

**Leaving the live state always goes through `delist_business`**
(`services/booking_cancellations.py`): it cancels the business's active surprise
bags, upcoming sign-ups and group buys, mails each holder, and voids the
billing-ledger rows for what it cancelled. A new path out of `approved` must
call it; `tests/test_meh3227_delist_cascade.py` is the test to extend.

## 3. Event, workshop, sign-up

**Event** (`models/events.py`): `is_active` only. "Past" is derived from the
date. No moderation.

**Workshop / experience:** `status` (pending · approved · rejected ·
changes_requested), `moderation_status` (the model's verdict, shown to the
admin, never decisive), `is_active` (the host's own cancel). A content edit of
an approved workshop sends it back to pending. Public = approved, active, host
business live, and a future date (a recurring workshop stays open after its
first date).

**Sign-up** (`registrations`): registered · cancelled. No waitlist, no
no-show. A host cannot set fewer places than the active sign-ups (422,
`services/registrations.py` `refuse_too_few_places`, MEH-2871).

| Transition | Who | Where | Guard |
|---|---|---|---|
| → registered | anyone (no account) | `routers/registrations.py` | item row locked; owner live; item active and not past; capacity; a repeat email is a silent success |
| registered → cancelled | the holder of the emailed link | `routers/registrations.py` `cancel_registration` | row lock; ledger voided when the item is still upcoming |
| registered → cancelled | host cancels or deletes the item | `services/booking_cancellations.py` `cancel_item_signups` | items dated today or later, and every recurring workshop (MEH-2871); ledger voided |
| registered → cancelled | the business leaves the live state | `services/booking_cancellations.py` `delist_business` | same |
| purged | scheduler | `services/retention_purge.py` | 30 days after the date |

## 4. Surprise bags (`rescue_offers` × `rescue_orders`)

The explicit one, and the model to copy: both columns have CHECK constraints
and every transition re-reads the row under a lock.

- Offer: active · cancelled, with `qty_left ≥ 0`.
- Order: reserved → handed · no_show · cancelled. All three are terminal.

| Transition | Who | Where | Guard |
|---|---|---|---|
| → reserved | buyer with a verified email | `routers/rescue.py` `create_order` | offer locked; business live; offer active, today, inside the window; per-buyer cap; stock |
| reserved → handed | the business / admin | `routers/rescue.py` | lock + re-read; ledger row counted |
| reserved → no_show | the business | `routers/rescue.py` | after the pickup window ends |
| reserved → cancelled | buyer | `routers/rescue.py` | before `cancel_until`; stock returned |
| reserved → cancelled | the business cancels the offer, or leaves the live state | `routers/rescue.py`, `delist_business` | holders are mailed |
| reserved → cancelled | the buyer deletes her account | `services/user_deletion.py` | stock returned |

## 5. Group buy (`group_buys.status`)

open → funded → fulfilled, and open / funded → cancelled. Fulfilled and
cancelled are terminal. Owner and admin share one transition table
(`routers/group_buys.py` `OWNER_TRANSITIONS`). A commit is a row: it exists or
it does not.

| Transition | Who | Where | Guard |
|---|---|---|---|
| join | logged-in user | `routers/group_buys.py` | row lock; public; open; before the deadline; capacity; one commit per user |
| leave | the user | `routers/group_buys.py` | open or funded; before the deadline |
| open → funded → open | automatic, on join / leave / account deletion | `routers/group_buys.py`, `services/group_buy_delist.py` | minimum reached / lost |
| → fulfilled, → cancelled | owner / admin | `routers/group_buys.py` | transition table; cancel mails the participants |

An **open** group buy that passes its deadline below its minimum is not closed
by anything today; only the open tab filters by deadline. Open PR #4625 adds
the job that closes those. A **funded** group buy past its deadline stays
funded on purpose: the owner fulfils or cancels it.

## 6. Smaller machines

| Thing | States | Written by |
|---|---|---|
| Recipe | `published` × `moderation_status` | owner, admin (`routers/producer_recipes.py`, `routers/admin_recipes.py`) |
| Review | visible · hidden, plus the business's rating aggregate; the owner reply carries its own AI verdict APPROVED · FLAGGED, cleared with the reply by `PUT /admin/reviews/{id}/clear-reply` (MEH-3259) | author, owner reply, admin (`routers/reviews.py`) |
| WhatsApp message (`outbound_messages`) | accepted → sent → delivered / failed; a stuck `accepted` counts as undelivered | webhook (`routers/whatsapp_webhook.py`, `services/whatsapp.py`) |
| Newsletter | subscribed (row) · gone | form, signed unsubscribe link (`routers/marketing.py`) |
| Weekly summary to owners | on · opted out (one way, by link) | `routers/marketing.py` |
| Favorite alerts | per favorite: which alerts, WhatsApp opt-in | `routers/alerts.py`; removing the favorite removes them |
| Billing ledger (`billable_events`) | counted · voided | `services/billing_ledger.py`, on sign-up, handover, group-buy fulfilment; voided when the booking is cancelled |

## Every status column

`tests/test_state_machines_doc_sync.py` reads the models and fails when a
status column is missing from this table, or a row names a column that no
longer exists. A new status column therefore lands with its row here, and a
section above when it has transitions worth drawing.

| Column | Section |
|---|---|
| `producers.status` | 2 |
| `producers.availability_status` | legacy column, replaced by the availability enum and waiting for its drop migration |
| `experiences.status` | 3 |
| `experiences.moderation_status` | 3 |
| `registrations.status` | 3 |
| `rescue_offers.status` | 4 |
| `rescue_orders.status` | 4 |
| `group_buys.status` | 5 |
| `producer_recipes.moderation_status` | 6 |
| `producer_reviews.ai_moderation_status` | 6 |
| `producer_reviews.reply_ai_moderation_status` | 6 |
| `outbound_messages.status` | 6 |
| `billable_events.status` | 6 |
| `business_billing.state` | "What does not exist" (no writer) |
| `product_orders.status` | "What does not exist" (no route yet) |
| `product_orders.payment_status` | "What does not exist" (no route yet) |
| `product_order_events.from_status` | log of `product_orders.status` |
| `product_order_events.to_status` | log of `product_orders.status` |
| `home_products.moderation_status` | router not mounted (audit §8) |
| `category_requests.status` | pending → approved / rejected, admin only (`routers/category_requests.py`) |
| `kashrut_badge_requests.status` | pending → approved / rejected, approved → revoked, admin only (`routers/admin_kashrut.py`) |
| `producer_name_change_requests.status` | pending → approved / rejected, admin only (`routers/producer_name_requests.py`) |
| `reports.status` | open → resolved / dismissed, admin only (`routers/reports.py`) |
| `outreach_leads.status` | admin's own pipeline label (`routers/admin_outreach.py`) |

## Combinations that are still open

Each needs a decision or new copy, so none was fixed in code. Four more were
closed on Sapir's decision of 18/11 (MEH-2871): blocking the only owner,
changing an owner's role, fewer places than sign-ups, and a recurring workshop
past its first date — `tests/test_meh2871_open_combinations.py`.

| Combination | What happens today | What is needed |
|---|---|---|
| Sign-up on the day, after the start time | Accepted (the gate is by date). | Open PR #4624. |
| Rating recompute runs in a second, unlocked commit | Two reviews at once can leave the aggregate one behind until the next write. | Post-launch (audit §6.1). |
