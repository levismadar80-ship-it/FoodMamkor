<!-- GENERATED — do not edit; run python scripts/release/action_map.py --write -->
# Action map

> **GENERATED — do not edit; run `python scripts/release/action_map.py --write`**
> (with `PYTHONPATH=backend:.`, `ENV=test` and a `SECRET_KEY` set). Guarded by
> `tests/test_action_map_complete.py`. Spec: MEH-2892 §B — anchor-plan.md on PR #4284 (card MEH-2894).
>
> **A report, not a gate.** Each cell is `file:line` evidence or `GAP` — a static match, never a
> claim that a test passes. Citations are information: nothing checks them, and they drift as
> tests are edited until the next `--write`. Coverage = a test that calls the route and asserts
> its result; `weak` = named only, or no success asserted. `e2e-mock` (a Playwright `page.route`
> mock — the backend never ran) is shown as information and never counts. The one guard,
> `tests/test_action_map_complete.py`: every backend route and every business tool has a row.

## Summary

| Rows | Count | covered | weak | GAP | n/a |
|---|---|---|---|---|---|
| API routes (actor actions) | 252 | 240 | 7 | 5 | 0 |
| — negative cell of gated routes (401/403) | 182 | 118 | 0 | 64 | 0 |
| Internal routes (allowlisted) | 10 + 4 docs | — | — | — | — |
| Business tools | 51 | 49 | 1 | 1 | 0 |
| Pages — public | 57 | 51 | 0 | 6 | 0 |
| Pages — dashboard | 20 | 17 | 0 | 3 | 0 |
| Pages — admin | 20 | 18 | 0 | 2 | 0 |
| State-machine rows (audit, every non-exempt section) | 45 | 40 | 1 | 3 | 1 |
| Mandatory extra rows (§B.3) | 25 | 23 | 1 | 1 | 0 |

Pages opened by a CI-run Playwright spec: **40 / 97** — the rest are covered only by a Vitest import (which may test no more than the page's metadata).

**GAP cells in total: 85** (route positive 5 · route negative 64 · tools 1 · pages 11 · machine rows 3 · extra rows 1). Not a gate yet — the plan's gate is "no *new* GAP" (a ratchet), later.

## Top gaps by risk

Score: see «Risk score» at the end. Routes whose verdict is not `covered` or whose 401/403 cell is a GAP, plus extra rows that are not `covered`.

| # | Score | Route / row | Actor | Why it is risky | Evidence |
|---|---|---|---|---|---|
| 1 | 13 | `POST /admin/producers/{producer_id}/owner-invite/resend` | admin | sends email/WhatsApp, no test, no 401/403 test | pos GAP · neg GAP |
| 2 | 13 | `POST /admin/producers/{producer_id}/owner-invite` | admin | sends email/WhatsApp, no test, no 401/403 test | pos GAP · neg GAP |
| 3 | 12 | `DELETE /admin/producers/{producer_id}/owner-invite` | admin | delete, no test, no 401/403 test | pos GAP · neg GAP |
| 4 | 12 | `POST /admin/settings/test/{service}` | admin | site-wide settings, only weak, no 401/403 test | pos weak `tests/test_meh2899_admin_service_test.py:90` (path literal) · neg GAP |
| 5 | 12 | `POST /producers/me/verify-phone` | business/organizer | auth, sends email/WhatsApp, no 401/403 test | pos `tests/test_meh2122_otp_send_failure.py:35` · neg GAP |
| 6 | 11 | [negative] a rejected business acting (business mutation → 403/409) | — | negative row on `business mutations` | GAP |
| 7 | 11 | `PATCH /producers/me/recipes/{recipe_id}` | business/organizer | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_indexnow.py:724` · neg GAP |
| 8 | 11 | `POST /admin/experiences/{experience_id}/request-changes` | admin | sends email/WhatsApp, public visibility, no 401/403 test | pos `tests/test_experiences.py:905` · neg GAP |
| 9 | 11 | `POST /admin/producers/{producer_id}/story-card` | admin | public visibility, only weak, no 401/403 test | pos weak `tests/test_admin_error_no_leak.py:52` (only error-path calls) · neg GAP |
| 10 | 11 | `POST /admin/recipes/{recipe_id}/request-changes` | admin | sends email/WhatsApp, public visibility, no 401/403 test | pos `tests/test_indexnow.py:535` · neg GAP |
| 11 | 11 | `POST /auth/owner-invite/accept-existing` | registered user | auth, sends email/WhatsApp, no 401/403 test | pos `tests/test_meh3256_owner_invite_existing.py:43` · neg GAP |
| 12 | 11 | `POST /rescue/orders` | registered user | money-like, sends email/WhatsApp, no 401/403 test | pos `tests/test_meh2679_rescue_utc_times.py:77` · neg GAP |
| 13 | 10 | [time] the 24 h WhatsApp customer-service window | — | time row on `POST /webhook/whatsapp` | weak `tests/test_meh2122_otp_failure_visibility.py:66` (grep, no route call) |
| 14 | 10 | `DELETE /producers/me/products/{product_id}` | business/organizer | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_product_image.py:109` · neg GAP |
| 15 | 10 | `DELETE /producers/me/recipes/{recipe_id}` | business/organizer | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_indexnow.py:757` · neg GAP |
| 16 | 10 | `PATCH /group-buys/{group_buy_id}/status` | registered user | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_group_buys_api.py:1454` · neg GAP |
| 17 | 10 | `POST /producers/me/verify-phone/confirm` | business/organizer | auth, no 401/403 test | pos `tests/test_meh2231_otp_test_numbers.py:113` · neg GAP |
| 18 | 10 | `POST /producers/{producer_id}/report` | registered user | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_integrity_constraints.py:41` · neg GAP |
| 19 | 10 | `PUT /admin/settings` | admin | site-wide settings, no 401/403 test | pos `tests/test_admin_settings_persistence.py:14` · neg GAP |
| 20 | 10 | `PUT /reviews/{review_id}/reply` | registered user | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh2381_review_edited_after_hidden.py:174` · neg GAP |
| 21 | 9 | `DELETE /events/{event_id}` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_events_cross_owner.py:99` · neg GAP |
| 22 | 9 | `DELETE /experiences/{experience_id}` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_experiences.py:1040` · neg GAP |
| 23 | 9 | `DELETE /reviews/{review_id}` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh2348_review_hide_sticky.py:84` · neg GAP |
| 24 | 9 | `GET /admin/group-buys` | admin | no test, no 401/403 test | pos GAP · neg GAP |
| 25 | 9 | `GET /admin/users/{user_id}/favorites` | admin | no test, no 401/403 test | pos GAP · neg GAP |
| 26 | 9 | `PATCH /admin/group-buys/{group_buy_id}/status` | admin | sends email/WhatsApp, no 401/403 test | pos `tests/test_group_buys_api.py:1595` · neg GAP |
| 27 | 9 | `POST /admin/producers/{producer_id}/detach-owner` | admin | only weak, no 401/403 test | pos weak `tests/test_meh3256_detach_owner.py:39` (no success asserted) · neg GAP |
| 28 | 9 | `POST /auth/logout-all-devices` | registered user | auth, no 401/403 test | pos `tests/test_api.py:4389` · neg GAP |
| 29 | 9 | `PUT /producers/me/products/{product_id}/group` | business/organizer | object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh3055_product_organize.py:71` · neg GAP |
| 30 | 9 | `PUT /producers/me/products/{product_id}` | business/organizer | object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh2662_product_ingredients_allergens.py:103` · neg GAP |

## API routes

Registration order of the app. Actor from the dependency tree: `require_admin` → admin; `require_producer` / `require_verified_producer` → business (organizers are producers with `kind == "organizer"` and pass unless the handler refuses that kind); `get_current_user` → registered user; otherwise anonymous.

| # | Method | Path | Handler | Actor | Positive | Negative (401/403) | E2E | Score |
|---|---|---|---|---|---|---|---|---|
| 1 | POST | `/auth/refresh` | `auth.refresh_token` | anonymous | `tests/test_api.py:4287` | n/a | — | 7 |
| 2 | POST | `/auth/logout` | `auth.logout` | anonymous | `tests/test_api.py:4371` | n/a | — | 7 |
| 3 | POST | `/auth/register` | `auth.register` | anonymous | `tests/test_api.py:52` | n/a | e2e-mock `frontend/e2e/flows/29-register-journey-a.spec.ts:174` | 9 |
| 4 | POST | `/auth/register/producer` | `auth.register_producer` | anonymous (optional auth) | `tests/test_admin_delete_producer.py:46` | n/a | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:41` | 9 |
| 5 | POST | `/auth/google` | `auth.google_auth` | anonymous | `tests/test_email_verified_creation_paths.py:95` | n/a | — | 9 |
| 6 | POST | `/auth/register/producer/oauth` | `auth.register_producer_oauth` | anonymous | `tests/test_email_verified_creation_paths.py:115` | n/a | e2e-mock `frontend/e2e/flows/10-producer-oauth-409.spec.ts:44` | 7 |
| 7 | POST | `/auth/login` | `auth.login` | anonymous | `tests/test_api.py:552` | n/a | e2e-mock `frontend/e2e/flows/30-login-journey-c.spec.ts:239` | 7 |
| 8 | GET | `/auth/me` | `auth.get_me` | registered user | `tests/test_api.py:320` | `tests/test_api.py:576` | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:49` | 5 |
| 9 | POST | `/auth/logout-all-devices` | `auth.logout_all_devices` | registered user | `tests/test_api.py:4389` | GAP | — | 9 |
| 10 | POST | `/auth/apple` | `auth.apple_auth` | anonymous | `tests/test_email_verified_creation_paths.py:102` | n/a | — | 9 |
| 11 | POST | `/auth/check-password` | `auth.check_password` | anonymous | `tests/test_auth.py:289` | n/a | e2e-mock `frontend/e2e/flows/29-register-journey-a.spec.ts:153` | 7 |
| 12 | POST | `/auth/forgot-password` | `auth.forgot_password` | anonymous | `tests/test_forgot_password.py:22` | n/a | e2e-mock `frontend/e2e/flows/30-login-journey-c.spec.ts:524` | 9 |
| 13 | POST | `/auth/reset-password` | `auth.reset_password` | anonymous | `tests/test_api.py:4182` | n/a | — | 7 |
| 14 | GET | `/auth/verify-email` | `auth.verify_email` | anonymous | `tests/test_meh3095_email_change_reverify.py:70` | n/a | — | 4 |
| 15 | POST | `/auth/resend-verify` | `auth.resend_verify` | registered user | `tests/test_meh2901_resend_verify.py:59` | `tests/test_meh2901_resend_verify.py:106` | — | 9 |
| 16 | POST | `/auth/me/delete` | `auth.delete_account` | registered user | `tests/test_account_deletion_cascade.py:40` | `tests/test_meh3248_account_delete_safeguards.py:47` | — | 9 |
| 17 | GET | `/cities` | `cities.list_cities` | anonymous | `tests/test_meh1343_cities_canonical_source.py:23` | n/a | e2e-mock `frontend/e2e/flows/38-register-delivery-axis.spec.ts:39` | 1 |
| 18 | GET | `/producer-name-check` | `producer_name_check.producer_name_check` | anonymous | `tests/test_meh3086_name_check.py:26` | n/a | e2e-mock `frontend/e2e/flows/manual/admin-producer-form-licence.spec.ts:222` | 1 |
| 19 | GET | `/producers/me` | `producer_me.get_my_producer` | business/organizer | `tests/test_api.py:3919` | `tests/test_api.py:3928` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:193` | 3 |
| 20 | PUT | `/producers/me` | `producer_me.update_my_producer` | business/organizer | `tests/test_api.py:2993` | `tests/test_api.py:3108` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:193` | 7 |
| 21 | POST | `/producers/me/availability-state` | `producer_me.set_availability_state` | business/organizer | `tests/test_api.py:3349` | `tests/test_expansion_availability.py:192` | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:65` | 5 |
| 22 | POST | `/producers/me/availability-confirm` | `producer_me.confirm_availability` | business/organizer | `tests/test_meh2697_availability_confirmed.py:53` | `tests/test_meh2697_availability_confirmed.py:101` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 5 |
| 23 | GET | `/producers/me/dashboard` | `producer_me.dashboard` | business/organizer | `tests/test_api.py:2678` | `tests/test_expansion_auth_jwt.py:56` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:165` | 3 |
| 24 | POST | `/producers/me/bio/generate` | `producer_me.generate_bio_endpoint` | business/organizer | `tests/test_api.py:2167` | `tests/test_api.py:2177` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:117` | 5 |
| 25 | GET | `/producers/me/products` | `producer_me.list_my_products` | business/organizer | `tests/test_product_image.py:39` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 5 |
| 26 | POST | `/producers/me/products` | `producer_me.create_my_product` | business/organizer | `tests/test_meh2662_product_ingredients_allergens.py:35` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 7 |
| 27 | PUT | `/producers/me/products/{product_id}` | `producer_me.update_my_product` | business/organizer | `tests/test_meh2662_product_ingredients_allergens.py:103` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 9 |
| 28 | DELETE | `/producers/me/products/{product_id}` | `producer_me.delete_my_product` | business/organizer | `tests/test_product_image.py:109` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 10 |
| 29 | GET | `/producers/me/analytics` | `producer_me_analytics.producer_analytics` | business/organizer | `tests/test_analytics.py:449` | `tests/test_analytics.py:429` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:182` | 3 |
| 30 | POST | `/producers/me/verify-phone` | `producer_me_review.send_phone_otp` | business/organizer | `tests/test_meh2122_otp_send_failure.py:35` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-draft-submit.spec.ts:123` | 12 |
| 31 | POST | `/producers/me/verify-phone/confirm` | `producer_me_review.confirm_phone_otp` | business/organizer | `tests/test_meh2231_otp_test_numbers.py:113` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-draft-submit.spec.ts:123` | 10 |
| 32 | POST | `/producers/me/kashrut-request` | `producer_me_review.request_kashrut_badge` | business/organizer | `tests/test_trust_ladder.py:214` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-trust-cards.spec.ts:103` | 7 |
| 33 | GET | `/producers/me/kashrut-requests` | `producer_me_review.list_kashrut_requests` | business/organizer | `tests/test_api.py:5162` | `tests/test_api.py:5198` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 3 |
| 34 | GET | `/producers/me/review-link` | `producer_me_review.get_review_invite_link` | business/organizer | `tests/test_reviews.py:931` | `tests/test_reviews.py:921` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:92` | 3 |
| 35 | POST | `/producers/me/request-review` | `producer_me_review.request_producer_review` | business/organizer | `tests/test_api.py:2251` | `tests/test_api.py:2276` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 7 |
| 36 | POST | `/producers/me/submit-for-review` | `producer_me_review.submit_for_review` | business/organizer | `tests/test_meh2100_draft_submit.py:196` | `tests/test_meh2100_draft_submit.py:399` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:309` | 7 |
| 37 | GET | `/producers/me/locations` | `producer_me_locations.list_my_locations` | business/organizer | `tests/test_producer_locations_crud.py:69` | `tests/test_producer_locations_crud.py:181` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 3 |
| 38 | POST | `/producers/me/locations` | `producer_me_locations.create_my_location` | business/organizer | `tests/test_meh1938_ch5_strict_followup.py:64` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 7 |
| 39 | PUT | `/producers/me/locations/{location_id}` | `producer_me_locations.update_my_location` | business/organizer | `tests/test_meh1938_ch5_strict_followup.py:221` | `tests/test_producer_locations_crud.py:150` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 7 |
| 40 | DELETE | `/producers/me/locations/{location_id}` | `producer_me_locations.delete_my_location` | business/organizer | `tests/test_meh1938_ch5_strict_followup.py:151` | `tests/test_producer_locations_crud.py:165` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 8 |
| 41 | GET | `/producers/me/product-groups` | `product_organize.list_my_product_groups` | business/organizer | `tests/test_meh3055_product_organize.py:43` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 5 |
| 42 | PUT | `/producers/me/product-groups` | `product_organize.replace_my_product_groups` | business/organizer | `tests/test_meh3055_product_organize.py:50` | `tests/test_meh3055_product_organize.py:160` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 5 |
| 43 | PUT | `/producers/me/product-order` | `product_organize.set_my_product_order` | business/organizer | `tests/test_meh3055_product_organize.py:170` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 7 |
| 44 | PUT | `/producers/me/products/{product_id}/group` | `product_organize.set_my_product_group` | business/organizer | `tests/test_meh3055_product_organize.py:71` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 9 |
| 45 | GET | `/producers/me/billing/summary` | `billing.my_billing_summary` | business/organizer | `tests/test_meh3181_billing_summary.py:206` | `tests/test_meh3181_billing_summary.py:216` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 3 |
| 46 | GET | `/admin/billing/overview` | `billing.admin_billing_overview` | admin | `tests/test_meh3181_billing_summary.py:266` | `tests/test_meh3181_billing_summary.py:223` | — | 3 |
| 47 | POST | `/admin/producers/{producer_id}/claim-link` | `producer_claim.create_claim_link` | admin | `tests/test_meh2496_claim_link_sent_at.py:65` | `tests/test_meh2496_claim_link_sent_at.py:117` | — | 8 |
| 48 | POST | `/producer-claim/preview` | `producer_claim.preview_claim` | anonymous (token in request) | `tests/test_producer_claim.py:251` | n/a | — | 7 |
| 49 | POST | `/producer-claim/new-link-request` | `producer_claim.request_new_claim_link` | anonymous (token in request) | `tests/test_meh3122_claim_new_link.py:73` | n/a | — | 9 |
| 50 | POST | `/producer-claim` | `producer_claim.claim_producer` | registered user | `tests/test_meh3258_review_conflicts.py:191` | `tests/test_producer_claim.py:356` | — | 9 |
| 51 | POST | `/admin/producers/{producer_id}/products` | `producer_claim.admin_create_draft_product` | admin | `tests/test_admin_draft_products.py:57` | `tests/test_admin_draft_products.py:83` | — | 5 |
| 52 | DELETE | `/admin/producers/{producer_id}/products/{product_id}` | `producer_claim.admin_delete_draft_product` | admin | `tests/test_admin_draft_products.py:150` | `tests/test_admin_draft_products.py:181` | — | 6 |
| 53 | POST | `/admin/producers/{producer_id}/preview-link` | `producer_draft_preview.create_preview_link` | admin | `tests/test_producer_draft_preview.py:86` | `tests/test_producer_draft_preview.py:97` | — | 5 |
| 54 | GET | `/producer-preview/{token}` | `producer_draft_preview.read_draft_preview` | anonymous (token in request) | `tests/test_producer_draft_preview.py:122` | n/a | — | 4 |
| 55 | POST | `/admin/producers/{producer_id}/publish-with-consent` | `producer_draft_preview.publish_draft_with_consent` | admin | `tests/test_producer_draft_preview.py:195` | `tests/test_producer_draft_preview.py:236` | — | 7 |
| 56 | POST | `/admin/producers/{producer_id}/owner-invite` | `producer_owner_invite.create_owner_invite` | admin | GAP | GAP | — | 13 |
| 57 | POST | `/admin/producers/{producer_id}/owner-invite/resend` | `producer_owner_invite.resend_owner_invite` | admin | GAP | GAP | — | 13 |
| 58 | DELETE | `/admin/producers/{producer_id}/owner-invite` | `producer_owner_invite.cancel_owner_invite` | admin | GAP | GAP | — | 12 |
| 59 | POST | `/auth/owner-invite/email-code` | `producer_owner_invite.send_owner_invite_email_code` | anonymous | `tests/test_producer_owner_invite.py:147` | n/a | — | 9 |
| 60 | POST | `/auth/owner-invite/accept` | `producer_owner_invite.accept_owner_invite` | anonymous | `tests/test_producer_owner_invite.py:157` | n/a | — | 9 |
| 61 | GET | `/auth/owner-invite/{token}` | `producer_owner_invite.get_owner_invite` | anonymous (token in request) | `tests/test_producer_owner_invite.py:369` | n/a | — | 4 |
| 62 | POST | `/auth/owner-invite/email-code-existing` | `producer_owner_invite_existing.send_owner_invite_code_existing` | registered user · verified email | `tests/test_meh3256_owner_invite_existing.py:30` | `tests/test_meh3256_owner_invite_existing.py:116` | — | 9 |
| 63 | POST | `/auth/owner-invite/accept-existing` | `producer_owner_invite_existing.accept_owner_invite_existing` | registered user · verified email | `tests/test_meh3256_owner_invite_existing.py:43` | GAP | — | 11 |
| 64 | POST | `/admin/producers/{producer_id}/detach-owner` | `producer_owner_detach.detach_owner` | admin | weak `tests/test_meh3256_detach_owner.py:39` (no success asserted) | GAP | — | 9 |
| 65 | POST | `/page-freshness/confirm` | `page_freshness.confirm_page_freshness` | anonymous | `tests/test_page_freshness.py:149` | n/a | — | 4 |
| 66 | GET | `/producers` | `producers.list_producers` | anonymous | `tests/test_account_deletion_cascade.py:132` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 67 | GET | `/producers/count` | `producers.producers_count` | anonymous | `tests/test_api.py:3632` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 68 | GET | `/producers/cities` | `producers.producers_cities` | anonymous | `tests/test_api.py:3657` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 69 | GET | `/producers/random` | `producers.random_producer` | anonymous | `tests/test_catalog_count_consistency.py:176` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 70 | GET | `/producers/by-slug/{slug}` | `producers.get_producer_by_slug` | anonymous | `tests/test_analytics.py:1155` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 71 | GET | `/producers/{producer_id}` | `producers.get_producer` | anonymous (optional auth) | `tests/test_analytics.py:1144` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 72 | POST | `/producers/{producer_id}/view` | `producers.record_producer_view` | anonymous (optional auth) | `tests/test_analytics.py:126` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 6 |
| 73 | POST | `/producers/{producer_id}/whatsapp-click` | `producers.record_whatsapp_click` | anonymous (optional auth) | `tests/test_analytics.py:236` | n/a | e2e-mock `frontend/e2e/flows/04-whatsapp-click.spec.ts:28` | 6 |
| 74 | POST | `/producers/{producer_id}/contact-click` | `producers.record_contact_click` | anonymous (optional auth) | `tests/test_analytics.py:386` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 6 |
| 75 | POST | `/producers/{producer_id}/delivery-waitlist` | `producers.join_delivery_waitlist` | anonymous (optional auth) | `tests/test_delivery_waitlist.py:36` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 6 |
| 76 | POST | `/delivery-waitlist/host-confirm` | `producers.confirm_delivery_waitlist_host` | anonymous (token in request) | `tests/test_delivery_waitlist.py:319` | n/a | — | 4 |
| 77 | POST | `/delivery-waitlist/unsubscribe` | `producers.unsubscribe_delivery_waitlist` | anonymous (token in request) | `tests/test_delivery_waitlist.py:237` | n/a | — | 4 |
| 78 | POST | `/producers` | `producers.create_producer` | registered user · verified email | `tests/test_api.py:1865` | `tests/test_api.py:1843` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 4 |
| 79 | GET | `/categories` | `producers.list_categories` | anonymous | `tests/test_meh1456_category_is_system.py:70` | n/a | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:27` | 1 |
| 80 | GET | `/producers/{producer_id}/kashrut-cert/{badge_code}` | `producers.get_kashrut_cert` | anonymous | `tests/test_meh1672_kashrut_cert_public.py:98` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 81 | GET | `/organizers` | `organizers.list_organizer_slugs` | anonymous | `tests/test_meh2952_is_test_exclusion.py:322` | n/a | — | 1 |
| 82 | GET | `/organizers/{slug}` | `organizers.get_organizer` | anonymous | `tests/test_meh2952_is_test_exclusion.py:325` | n/a | — | 1 |
| 83 | GET | `/users/me/favorites` | `favorites.get_favorites` | registered user | `tests/test_favorites_badge_parity.py:65` | `tests/test_meh997_e2e_journeys.py:652` | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 2 |
| 84 | POST | `/users/me/favorites/{producer_id}` | `favorites.add_favorite` | registered user | `tests/test_alerts_optin.py:12` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 6 |
| 85 | DELETE | `/users/me/favorites/{producer_id}` | `favorites.remove_favorite` | registered user | `tests/test_meh3222_unfavorite_stops_alerts.py:35` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 7 |
| 86 | GET | `/users/me/saved/ids` | `saved_items.get_saved_ids` | registered user | `tests/test_meh2557_saved_items_api.py:120` | `tests/test_meh2557_saved_items_api.py:95` | e2e-mock `frontend/e2e/flows/30-login-journey-c.spec.ts:236` | 2 |
| 87 | GET | `/users/me/saved` | `saved_items.get_saved` | registered user | `tests/test_meh2557_saved_items_api.py:110` | `tests/test_meh2557_saved_items_api.py:94` | — | 2 |
| 88 | POST | `/users/me/saved/{item_type}/{item_id}` | `saved_items.save_item` | registered user | `tests/test_meh2557_saved_items_api.py:107` | `tests/test_meh2557_saved_items_api.py:96` | — | 4 |
| 89 | DELETE | `/users/me/saved/{item_type}/{item_id}` | `saved_items.unsave_item` | registered user | `tests/test_meh2557_saved_items_api.py:255` | `tests/test_meh2557_saved_items_api.py:97` | — | 5 |
| 90 | GET | `/admin/producers/pending` | `admin_decisions.pending_producers` | admin | `tests/test_admin_queue_sla_aging.py:226` | GAP | — | 5 |
| 91 | POST | `/admin/producers/{producer_id}/approve` | `admin_decisions.approve_producer` | admin | `tests/test_admin_approval_transitions.py:121` | `tests/test_expansion_admin_authz.py:77` | e2e-mock `frontend/e2e/flows/manual/admin-producers-decisions.spec.ts:210` | 9 |
| 92 | GET | `/admin/producers/rejection-presets` | `admin_decisions.list_rejection_presets` | admin | `tests/test_meh226_rejection_reason.py:303` | `tests/test_meh226_rejection_reason.py:332` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:202` | 6 |
| 93 | POST | `/admin/producers/{producer_id}/reject` | `admin_decisions.reject_producer` | admin | `tests/test_admin_approval_transitions.py:398` | `tests/test_expansion_admin_authz.py:28` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-producers-decisions.spec.ts:216` | 9 |
| 94 | POST | `/admin/producers/{producer_id}/request-changes` | `admin_decisions.request_producer_changes` | admin | `tests/test_changes_requested_whatsapp.py:59` | `tests/test_producer_request_changes.py:105` | e2e-mock `frontend/e2e/flows/manual/admin-producers-decisions.spec.ts:217` | 9 |
| 95 | POST | `/admin/producers/{producer_id}/grant-verified` | `admin_decisions.grant_verified` | admin | `tests/test_meh_762_verification_stamping.py:34` | `tests/test_meh_762_verification_stamping.py:149` | — | 7 |
| 96 | POST | `/admin/producers/{producer_id}/revoke-verified` | `admin_decisions.revoke_verified` | admin | `tests/test_meh_762_verification_stamping.py:118` | `tests/test_meh_762_verification_stamping.py:159` | — | 7 |
| 97 | GET | `/admin/producers` | `admin.list_producers` | admin | `tests/test_admin_queue_sla_aging.py:124` | `tests/test_meh2495_admin_draft_owner.py:206` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:204` | 3 |
| 98 | POST | `/admin/producers` | `admin.admin_create_producer` | admin | `tests/test_admin_producer_blank_names.py:15` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:204` | 7 |
| 99 | GET | `/admin/license-expiry-reminders` | `admin.license_expiry_reminders` | admin | `tests/test_license_expiry.py:223` | `tests/test_license_expiry.py:328` | — | 3 |
| 100 | PUT | `/admin/producers/{producer_id}` | `admin.admin_update_producer` | admin | `tests/test_admin_approval_transitions.py:530` | GAP | — | 7 |
| 101 | POST | `/admin/producers/{producer_id}/toggle-status` | `admin.toggle_producer_status` | admin | `tests/test_admin_approval_transitions.py:38` | `tests/test_expansion_admin_authz.py:29` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-recipes-kebab.spec.ts:201` | 7 |
| 102 | DELETE | `/admin/producers/{producer_id}` | `admin.admin_delete_producer` | admin | `tests/test_account_deletion_cascade.py:255` | `tests/test_expansion_admin_authz.py:30` (table row) | — | 6 |
| 103 | GET | `/admin/producers/{producer_id}` | `admin.admin_get_producer` | admin | `tests/test_license_expiry.py:364` | `tests/test_license_expiry.py:393` | — | 3 |
| 104 | POST | `/admin/producers/{producer_id}/story-card` | `admin.upload_story_card` | admin | weak `tests/test_admin_error_no_leak.py:52` (only error-path calls) | GAP | — | 11 |
| 105 | GET | `/admin/stats` | `admin.get_stats` | admin | `tests/test_meh2952_is_test_exclusion.py:204` | GAP | — | 5 |
| 106 | POST | `/admin/seed-cities` | `admin.seed_cities` | admin | `tests/test_meh2241_admin_seed_cities.py:55` | GAP | — | 7 |
| 107 | GET | `/admin/users` | `admin_extra.list_users` | admin | `tests/test_api.py:328` | `tests/test_meh2900_admin_role_endpoint.py:158` | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:210` | 3 |
| 108 | PUT | `/admin/users/{user_id}/role` | `admin_extra.update_user_role` | admin | `tests/test_admin_role_orphan_source.py:107` | `tests/test_meh2900_admin_role_endpoint.py:118` | — | 13 |
| 109 | POST | `/admin/users/{user_id}/block` | `admin_extra.block_user` | admin | `tests/test_api.py:1988` | `tests/test_expansion_admin_authz.py:42` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:211` | 13 |
| 110 | GET | `/admin/audit-log` | `admin_extra.list_audit_log` | admin | `tests/test_meh3306_admin_audit_log.py:371` | `tests/test_meh3306_admin_audit_log.py:368` | — | 3 |
| 111 | DELETE | `/admin/users/{user_id}` | `admin_extra.admin_delete_user` | admin | `tests/test_meh2585_admin_delete_user.py:26` | `tests/test_meh2585_admin_delete_user.py:109` | — | 14 |
| 112 | GET | `/admin/users/{user_id}/favorites` | `admin_extra.user_favorites` | admin | GAP | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 9 |
| 113 | GET | `/admin/categories` | `admin_extra.list_categories_admin` | admin | `tests/test_api.py:2008` | GAP | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:27` | 5 |
| 114 | POST | `/admin/categories` | `admin_extra.create_category` | admin | `tests/test_api.py:2000` | GAP | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:27` | 7 |
| 115 | PUT | `/admin/categories/{category_id}` | `admin_extra.update_category` | admin | `tests/test_admin_category_rename_guard.py:76` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-producers-queue.spec.ts:175` | 7 |
| 116 | DELETE | `/admin/categories/{category_id}` | `admin_extra.delete_category` | admin | `tests/test_api.py:2018` | `tests/test_expansion_admin_authz.py:43` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-producers-queue.spec.ts:175` | 6 |
| 117 | GET | `/admin/pages/{slug}` | `admin_extra.get_static_page` | admin | `tests/test_api.py:2075` | GAP | — | 5 |
| 118 | PUT | `/admin/pages/{slug}` | `admin_extra.update_static_page` | admin | `tests/test_api.py:2078` | GAP | — | 7 |
| 119 | GET | `/admin/analytics` | `admin_extra.get_analytics` | admin | `tests/test_api.py:2066` | GAP | — | 5 |
| 120 | GET | `/admin/settings` | `admin_extra.get_settings` | admin | `tests/test_admin_settings_persistence.py:22` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:206` | 5 |
| 121 | PUT | `/admin/settings` | `admin_extra.update_settings` | admin | `tests/test_admin_settings_persistence.py:14` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:206` | 10 |
| 122 | GET | `/admin/settings/vacation` | `admin_extra.get_vacation_mode` | admin | `tests/test_meh_509_pr2a_vacation.py:27` | `tests/test_meh_509_pr2a_vacation.py:34` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:209` | 3 |
| 123 | POST | `/admin/settings/vacation` | `admin_extra.set_vacation_mode` | admin | `tests/test_meh_509_pr2a_vacation.py:50` | `tests/test_meh_509_pr2a_vacation.py:118` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:209` | 8 |
| 124 | GET | `/admin/producers/{producer_id}/risk-score` | `admin_extra.get_producer_risk_score` | admin | `tests/test_meh_509_pr3_risk_score.py:539` | `tests/test_meh_509_pr3_risk_score.py:576` | — | 3 |
| 125 | POST | `/admin/settings/test/{service}` | `admin_extra.test_service` | admin | weak `tests/test_meh2899_admin_service_test.py:90` (path literal) | GAP | — | 12 |
| 126 | GET | `/admin/dashboard` | `admin_extra.get_dashboard` | admin | `tests/test_analytics.py:820` | `tests/test_analytics.py:970` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:195` | 5 |
| 127 | POST | `/producers/{producer_id}/report` | `reports.report_producer` | registered user | `tests/test_integrity_constraints.py:41` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 10 |
| 128 | GET | `/admin/reports` | `reports.get_flagged_producers` | admin | `tests/test_report_lifecycle.py:31` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:207` | 5 |
| 129 | POST | `/admin/reports/{report_id}/resolve` | `reports.resolve_report` | admin | `tests/test_report_lifecycle.py:67` | `tests/test_report_lifecycle.py:107` | — | 5 |
| 130 | POST | `/admin/reports/{report_id}/dismiss` | `reports.dismiss_report` | admin | `tests/test_report_lifecycle.py:55` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:208` | 7 |
| 131 | POST | `/reports/producer-info` | `report_info.report_producer_info` | anonymous | `tests/test_email_logo.py:125` | n/a | — | 6 |
| 132 | POST | `/upload/image` | `upload.upload_image` | registered user | `tests/test_meh2551_upload_off_event_loop.py:48` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-images-contact.spec.ts:93` | 6 |
| 133 | POST | `/upload/avatar` | `upload.upload_avatar` | registered user | `tests/test_avatar_upload.py:30` | `tests/test_api.py:2826` | — | 4 |
| 134 | POST | `/upload/owner-photo` | `upload.upload_owner_photo` | registered user | `tests/test_api.py:3259` | `tests/test_api.py:3284` | — | 4 |
| 135 | POST | `/upload/kashrut-cert` | `upload.upload_kashrut_cert` | registered user | `tests/test_api.py:5210` | `tests/test_api.py:5276` | e2e-mock `frontend/e2e/flows/manual/dashboard-trust-cards.spec.ts:104` | 4 |
| 136 | GET | `/stats` | `marketing.get_stats` | anonymous | `tests/test_api.py:5101` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:515` | 1 |
| 137 | POST | `/newsletter` | `marketing.subscribe_newsletter` | anonymous | `tests/test_meh2611_newsletter_resend_sync.py:38` | n/a | — | 6 |
| 138 | POST | `/newsletter/unsubscribe` | `marketing.unsubscribe_newsletter` | anonymous (token in request) | `tests/test_meh2611_newsletter_resend_sync.py:53` | n/a | — | 4 |
| 139 | POST | `/weekly-summary/unsubscribe` | `marketing.unsubscribe_weekly_summary` | anonymous (token in request) | `tests/test_meh3079_weekly_owner_summary.py:306` | n/a | — | 4 |
| 140 | POST | `/contact` | `marketing.submit_contact` | anonymous | `tests/test_api.py:2444` | n/a | — | 6 |
| 141 | GET | `/events` | `events.list_events` | anonymous (optional auth) | `tests/test_event_end_time.py:184` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 1 |
| 142 | GET | `/events/upcoming` | `events.upcoming_events` | anonymous | `tests/test_meh1161_event_producer_gate.py:118` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 1 |
| 143 | GET | `/events/mine` | `events.list_my_events` | business/organizer | `tests/test_events_mine.py:46` | `tests/test_events_mine.py:69` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 3 |
| 144 | GET | `/events/{event_id}` | `events.get_event` | anonymous (optional auth) | `tests/test_event_end_time.py:62` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 1 |
| 145 | POST | `/events` | `events.create_event` | business/organizer · verified email | `tests/test_event_end_time.py:52` | `tests/test_meh3180_billing_state.py:349` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 5 |
| 146 | PUT | `/events/{event_id}` | `events.update_event` | business/organizer | `tests/test_event_end_time.py:118` | `tests/test_meh3180_billing_state.py:380` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 7 |
| 147 | DELETE | `/events/{event_id}` | `events.delete_event` | registered user | `tests/test_events_cross_owner.py:99` | GAP | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 9 |
| 148 | POST | `/experiences/validate` | `experiences.validate_endpoint` | anonymous | `tests/test_experiences.py:334` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:134` | 4 |
| 149 | GET | `/experiences` | `experiences.list_experiences` | anonymous | `tests/test_experiences.py:489` | n/a | — | 1 |
| 150 | GET | `/experiences/count` | `experiences.count_experiences` | anonymous | `tests/test_experiences.py:372` | n/a | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:255` | 1 |
| 151 | GET | `/experiences/mine` | `experiences.list_my_experiences` | registered user | `tests/test_experiences.py:1060` | `tests/test_experiences.py:1065` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:118` | 2 |
| 152 | GET | `/experiences/{experience_id}` | `experiences.get_experience` | anonymous (optional auth) | `tests/test_experiences.py:692` | n/a | — | 1 |
| 153 | POST | `/experiences` | `experiences.submit_experience` | business/organizer · verified email | `tests/test_experiences.py:161` | `tests/test_experiences.py:138` | — | 7 |
| 154 | PUT | `/experiences/{experience_id}` | `experiences.update_experience` | registered user | `tests/test_experiences.py:933` | GAP | — | 8 |
| 155 | DELETE | `/experiences/{experience_id}` | `experiences.delete_experience` | registered user | `tests/test_experiences.py:1040` | GAP | — | 9 |
| 156 | GET | `/admin/experiences` | `admin_experiences.admin_list_experiences` | admin | `tests/test_experiences.py:824` | `tests/test_experiences.py:810` | — | 3 |
| 157 | POST | `/admin/experiences/{experience_id}/approve` | `admin_experiences.approve_experience` | admin | `tests/test_experiences.py:849` | `tests/test_expansion_admin_authz.py:37` (table row) | — | 9 |
| 158 | POST | `/admin/experiences/{experience_id}/request-changes` | `admin_experiences.request_changes` | admin | `tests/test_experiences.py:905` | GAP | — | 11 |
| 159 | POST | `/admin/experiences/{experience_id}/reject` | `admin_experiences.reject_experience` | admin | `tests/test_experiences.py:878` | `tests/test_expansion_admin_authz.py:38` (table row) | — | 9 |
| 160 | POST | `/events/{event_id}/registrations` | `registrations.register_for_event` | anonymous | `tests/test_meh2763_registrations.py:113` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 8 |
| 161 | POST | `/experiences/{experience_id}/registrations` | `registrations.register_for_experience` | anonymous | `tests/test_meh2763_registrations.py:227` | n/a | — | 8 |
| 162 | GET | `/events/{event_id}/registrations` | `registrations.list_event_registrations` | registered user | `tests/test_meh2763_registrations.py:306` | `tests/test_meh2763_registrations.py:326` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 2 |
| 163 | GET | `/experiences/{experience_id}/registrations` | `registrations.list_experience_registrations` | registered user | `tests/test_meh2763_registrations.py:334` | GAP | — | 4 |
| 164 | GET | `/registrations/{token}` | `registrations.get_registration` | anonymous (token in request) | `tests/test_meh2763_registrations.py:358` | n/a | — | 4 |
| 165 | POST | `/registrations/{token}/cancel` | `registrations.cancel_registration` | anonymous (token in request) | `tests/test_meh2763_registrations.py:362` | n/a | — | 11 |
| 166 | POST | `/producers/me/recipes` | `producer_recipes.create_my_recipe` | business/organizer · verified email | `tests/test_meh1000_recipe_admin_notification.py:182` | `tests/test_meh997_e2e_journeys.py:649` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 7 |
| 167 | GET | `/producers/me/recipes` | `producer_recipes.list_my_recipes` | business/organizer | `tests/test_meh997_e2e_journeys.py:182` | `tests/test_meh997_e2e_journeys.py:651` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 3 |
| 168 | GET | `/producers/me/recipes/{recipe_id}` | `producer_recipes.get_my_recipe` | business/organizer | weak `tests/test_meh997_e2e_journeys.py:723` (only error-path calls) | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 7 |
| 169 | PATCH | `/producers/me/recipes/{recipe_id}` | `producer_recipes.update_my_recipe` | business/organizer | `tests/test_indexnow.py:724` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 11 |
| 170 | DELETE | `/producers/me/recipes/{recipe_id}` | `producer_recipes.delete_my_recipe` | business/organizer | `tests/test_indexnow.py:757` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 10 |
| 171 | GET | `/producers/{slug}/recipes` | `producer_recipes.list_public_recipes` | anonymous | `tests/test_meh2952_is_test_exclusion.py:432` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 172 | GET | `/producers/{slug}/recipes/{recipe_id}` | `producer_recipes.get_public_recipe` | anonymous | `tests/test_producer_recipes.py:412` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 173 | GET | `/admin/recipes` | `admin_recipes.admin_list_recipes` | admin | `tests/test_meh997_e2e_journeys.py:190` | `tests/test_meh997_e2e_journeys.py:645` | e2e-mock `frontend/e2e/flows/manual/admin-recipes-kebab.spec.ts:166` | 3 |
| 174 | GET | `/admin/recipes/pending` | `admin_recipes.admin_list_pending_recipes` | admin | `tests/test_meh997_e2e_journeys.py:186` | `tests/test_meh997_e2e_journeys.py:646` | — | 3 |
| 175 | POST | `/admin/recipes/{recipe_id}/approve` | `admin_recipes.approve_recipe` | admin | `tests/test_indexnow.py:527` | `tests/test_expansion_admin_authz.py:39` (table row) | — | 9 |
| 176 | POST | `/admin/recipes/{recipe_id}/request-changes` | `admin_recipes.request_recipe_changes` | admin | `tests/test_indexnow.py:535` | GAP | — | 11 |
| 177 | POST | `/admin/recipes/{recipe_id}/reject` | `admin_recipes.reject_recipe` | admin | `tests/test_indexnow.py:535` | `tests/test_expansion_admin_authz.py:40` (table row) | — | 9 |
| 178 | GET | `/producers/{producer_id}/reviews` | `reviews.list_reviews_nested` | anonymous (optional auth) | `tests/test_api.py:2705` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:90` | 1 |
| 179 | GET | `/reviews` | `reviews.list_reviews` | anonymous (optional auth) | `tests/test_meh3258_review_conflicts.py:84` | n/a | — | 1 |
| 180 | POST | `/producers/{producer_id}/reviews` | `reviews.create_review_nested` | registered user | `tests/test_api.py:2730` | `tests/test_api.py:2722` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:90` | 8 |
| 181 | DELETE | `/reviews/{review_id}` | `reviews.delete_review` | registered user | `tests/test_meh2348_review_hide_sticky.py:84` | GAP | — | 9 |
| 182 | PUT | `/reviews/{review_id}/reply` | `reviews.set_review_reply` | registered user | `tests/test_meh2381_review_edited_after_hidden.py:174` | GAP | — | 10 |
| 183 | PUT | `/admin/reviews/{review_id}/hide` | `reviews.hide_review` | admin | `tests/test_meh2381_review_edited_after_hidden.py:96` | `tests/test_reviews.py:508` | — | 7 |
| 184 | PUT | `/admin/reviews/{review_id}/unhide` | `reviews.unhide_review` | admin | `tests/test_meh2348_review_hide_sticky.py:92` | `tests/test_meh2348_review_hide_sticky.py:103` | — | 7 |
| 185 | GET | `/admin/reviews` | `reviews.admin_list_reviews` | admin | `tests/test_meh2349_review_ai_flag.py:109` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts:250` | 5 |
| 186 | GET | `/producers/{producer_id}/google-rating` | `google_rating.get_google_rating` | anonymous | `tests/test_google_rating.py:41` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 1 |
| 187 | GET | `/admin/producers/{producer_id}/google-place-candidates` | `google_rating.get_google_place_candidates` | admin | `tests/test_google_rating.py:173` | `tests/test_google_rating.py:223` | — | 3 |
| 188 | PUT | `/admin/producers/{producer_id}/google-place-id` | `google_rating.put_google_place_id` | admin | `tests/test_meh2582_google_place_partial_put.py:19` | GAP | — | 7 |
| 189 | GET | `/search` | `search.smart_search` | anonymous | `tests/test_meh1176_like_escape.py:88` | n/a | e2e-mock `frontend/e2e/visual/badge-overflow-collision.spec.ts:88` | 1 |
| 190 | PATCH | `/users/me` | `users_me.update_profile` | registered user | `tests/test_api.py:2810` | GAP | — | 8 |
| 191 | PATCH | `/users/me/password` | `users_me.change_password` | registered user | `tests/test_auth.py:219` | `tests/test_auth.py:174` | — | 7 |
| 192 | GET | `/admin/outreach` | `admin_outreach.list_leads` | admin | `tests/test_business_suggestions.py:523` | `tests/test_outreach_prefill_edge_cases.py:557` | — | 3 |
| 193 | POST | `/admin/outreach` | `admin_outreach.create_lead` | admin | `tests/test_outreach_prefill_edge_cases.py:106` | `tests/test_outreach_prefill_edge_cases.py:559` | — | 5 |
| 194 | PATCH | `/admin/outreach/{lead_id}` | `admin_outreach.update_lead` | admin | `tests/test_outreach_prefill_edge_cases.py:531` | `tests/test_outreach_prefill_edge_cases.py:562` | — | 5 |
| 195 | DELETE | `/admin/outreach/{lead_id}` | `admin_outreach.delete_lead` | admin | `tests/test_outreach_prefill_edge_cases.py:541` | `tests/test_expansion_admin_authz.py:41` (table row) | — | 6 |
| 196 | POST | `/admin/outreach/{lead_id}/prefill-token` | `admin_outreach.mint_prefill_token` | admin | `tests/test_outreach_prefill_edge_cases.py:133` | `tests/test_outreach_prefill_edge_cases.py:565` | — | 8 |
| 197 | POST | `/admin/outreach/{lead_id}/thank-suggester` | `admin_outreach.thank_suggester` | admin | `tests/test_business_suggestions.py:692` | `tests/test_business_suggestions.py:813` | — | 7 |
| 198 | GET | `/admin/outreach/metrics/summary` | `admin_outreach.metrics_summary` | admin | `tests/test_business_suggestions.py:635` | `tests/test_outreach_prefill_edge_cases.py:558` | — | 3 |
| 199 | GET | `/register/producer/prefill/{token}` | `admin_outreach.get_prefill` | anonymous (token in request) | `tests/test_meh1724_prefill_rate_limit.py:64` | n/a | — | 4 |
| 200 | GET | `/admin/whatsapp/failed` | `admin_whatsapp.list_failed_outbound` | admin | `tests/test_meh_771_chunk_c_admin_whatsapp.py:63` | `tests/test_meh_771_chunk_c_admin_whatsapp.py:71` | — | 5 |
| 201 | POST | `/chat` | `chat.chat` | anonymous | weak `tests/test_meh3010_chat_global_cap.py:71` (only error-path calls) | n/a | — | 6 |
| 202 | POST | `/business-suggestions` | `business_suggestions.submit_business_suggestion` | anonymous (optional auth) | `tests/test_business_suggestions.py:64` | n/a | — | 6 |
| 203 | POST | `/category-requests` | `category_requests.submit_category_request` | anonymous (optional auth) | `tests/test_api.py:3689` | n/a | — | 6 |
| 204 | GET | `/admin/category-requests` | `category_requests.list_category_requests` | admin | `tests/test_api.py:3709` | `tests/test_api.py:3742` | — | 3 |
| 205 | PATCH | `/admin/category-requests/{request_id}` | `category_requests.review_category_request` | admin | `tests/test_api.py:3729` | `tests/test_api.py:3757` | — | 5 |
| 206 | POST | `/producers/me/name-change-requests` | `producer_name_requests.request_name_change` | registered user | `tests/test_meh3271_prelaunch_security.py:240` | `tests/test_producer_name_change_requests.py:160` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 4 |
| 207 | GET | `/producers/me/name-change-requests` | `producer_name_requests.list_own_name_change_requests` | registered user | `tests/test_meh3271_prelaunch_security.py:248` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 4 |
| 208 | GET | `/admin/name-change-requests` | `producer_name_requests.list_name_change_requests` | admin | weak `tests/test_producer_name_change_requests.py:194` (only refused calls) | `tests/test_producer_name_change_requests.py:197` | — | 5 |
| 209 | PATCH | `/admin/name-change-requests/{request_id}` | `producer_name_requests.review_name_change_request` | admin | `tests/test_producer_name_change_requests.py:61` | `tests/test_meh3271_prelaunch_security.py:254` | — | 5 |
| 210 | GET | `/group-buys` | `group_buys.list_group_buys` | anonymous | `tests/test_group_buys_api.py:89` | n/a | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:271` | 1 |
| 211 | GET | `/group-buys/counts` | `group_buys.count_group_buys_by_status` | anonymous | `tests/test_meh3128_group_buy_counts.py:32` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:359` | 1 |
| 212 | GET | `/group-buys/{group_buy_id}` | `group_buys.get_group_buy` | anonymous (optional auth) | `tests/test_group_buys_api.py:136` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:359` | 1 |
| 213 | POST | `/group-buys/{group_buy_id}/commit` | `group_buys.commit_to_group_buy` | registered user | `tests/test_group_buys_api.py:243` | `tests/test_group_buys_api.py:627` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:359` | 11 |
| 214 | DELETE | `/group-buys/{group_buy_id}/commit` | `group_buys.cancel_commit` | registered user | `tests/test_group_buys_api.py:249` | `tests/test_meh2943_group_buy_commit_scoping.py:225` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:359` | 10 |
| 215 | POST | `/group-buys` | `group_buys.create_group_buy` | business (organizer refused) · verified email | `tests/test_group_buys_api.py:346` | `tests/test_group_buys_api.py:354` | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:271` | 5 |
| 216 | PATCH | `/group-buys/{group_buy_id}/status` | `group_buys.update_group_buy_status` | registered user | `tests/test_group_buys_api.py:1454` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:359` | 10 |
| 217 | GET | `/admin/group-buys` | `group_buys.admin_list_group_buys` | admin | GAP | GAP | — | 9 |
| 218 | PATCH | `/admin/group-buys/{group_buy_id}/status` | `group_buys.admin_update_status` | admin | `tests/test_group_buys_api.py:1595` | GAP | — | 9 |
| 219 | GET | `/producers/me/group-buys` | `group_buys.list_my_group_buys` | business/organizer | `tests/test_group_buys_api.py:270` | `tests/test_group_buys_api.py:303` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:115` | 3 |
| 220 | GET | `/users/me/favorites/{producer_id}/alerts` | `alerts.get_alert_prefs` | registered user | `tests/test_alerts.py:62` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 4 |
| 221 | PUT | `/users/me/favorites/{producer_id}/alerts` | `alerts.upsert_alert_prefs` | registered user | `tests/test_alerts.py:103` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 6 |
| 222 | GET | `/admin/kashrut` | `admin_kashrut.list_kashrut_requests` | admin | `tests/test_trust_ladder.py:251` | `tests/test_trust_ladder.py:268` | — | 3 |
| 223 | POST | `/admin/kashrut/{request_id}/approve` | `admin_kashrut.approve_kashrut_request` | admin | `tests/test_meh2518_kashrut_real_expiry.py:45` | `tests/test_expansion_admin_authz.py:34` (table row) | — | 9 |
| 224 | POST | `/admin/kashrut/{request_id}/reject` | `admin_kashrut.reject_kashrut_request` | admin | `tests/test_meh2518_kashrut_real_expiry.py:229` | `tests/test_expansion_admin_authz.py:35` (table row) | — | 9 |
| 225 | POST | `/admin/kashrut/{request_id}/revoke` | `admin_kashrut.revoke_kashrut_badge` | admin | `tests/test_meh2518_kashrut_real_expiry.py:149` | `tests/test_expansion_admin_authz.py:36` (table row) | — | 7 |
| 226 | POST | `/admin/producers/{producer_id}/set-ambassador` | `admin_kashrut.set_ambassador` | admin | `tests/test_trust_ladder.py:327` | `tests/test_expansion_admin_authz.py:31` (table row) | — | 7 |
| 227 | POST | `/admin/kashrut/expiry-reminders` | `admin_kashrut.kashrut_expiry_reminders` | admin | `tests/test_meh1673_kashrut_expiry_reminders.py:70` | `tests/test_meh1673_kashrut_expiry_reminders.py:206` | — | 7 |
| 228 | GET | `/admin/checklist-items` | `admin_checklist.list_checklist_items` | admin | `tests/test_admin_checklist.py:215` | `tests/test_admin_checklist.py:629` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:201` | 3 |
| 229 | PUT | `/admin/checklist-items` | `admin_checklist.save_checklist_items` | admin | `tests/test_admin_checklist.py:61` | `tests/test_admin_checklist.py:614` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:201` | 5 |
| 230 | GET | `/admin/producers/{producer_id}/review-checks` | `admin_checklist.get_review_checks` | admin | `tests/test_admin_checklist.py:265` | `tests/test_admin_checklist.py:615` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:203` | 3 |
| 231 | PUT | `/admin/producers/{producer_id}/review-checks` | `admin_checklist.save_review_checks` | admin | `tests/test_admin_checklist.py:251` | `tests/test_admin_checklist.py:616` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:203` | 5 |
| 240 | GET | `/push-vapid-key` | `system.get_vapid_public_key` | anonymous | weak `tests/test_meh1979_public_rate_limits.py:66` (path literal) | n/a | — | 3 |
| 241 | GET | `/holiday-mode` | `holiday_mode.get_holiday_mode` | anonymous | `tests/test_holiday_mode.py:17` | n/a | — | 1 |
| 244 | POST | `/rescue/offers` | `rescue.create_offer` | business/organizer · flag: rescue, verified email | `tests/test_meh2679_rescue_utc_times.py:66` | `tests/test_rescue_pilot.py:96` | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:272` | 7 |
| 245 | GET | `/rescue/offers` | `rescue.list_offers` | anonymous · flag: rescue | `tests/test_meh2679_rescue_utc_times.py:61` | n/a | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:272` | 1 |
| 246 | POST | `/rescue/offers/{offer_id}/cancel` | `rescue.cancel_offer` | registered user · flag: rescue | `tests/test_meh2738_rescue_business_cancel.py:46` | `tests/test_meh2943_rescue_idor.py:527` | — | 8 |
| 247 | GET | `/rescue/orders/mine` | `rescue.list_my_reservations` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:49` | `tests/test_meh2680_rescue_my_orders.py:35` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:118` | 2 |
| 248 | POST | `/rescue/orders` | `rescue.create_order` | registered user · flag: rescue, verified email | `tests/test_meh2679_rescue_utc_times.py:77` | GAP | — | 11 |
| 249 | POST | `/rescue/orders/{order_id}/handed` | `rescue.mark_handed` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:65` | `tests/test_rescue.py:394` | — | 11 |
| 250 | POST | `/rescue/orders/{order_id}/no_show` | `rescue.mark_no_show` | registered user · flag: rescue | `tests/test_meh2943_rescue_idor.py:342` | `tests/test_meh2943_rescue_idor.py:325` | — | 9 |
| 251 | POST | `/rescue/orders/{order_id}/cancel` | `rescue.cancel_order` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:88` | `tests/test_meh2943_rescue_idor.py:178` | — | 11 |
| 252 | POST | `/rescue/orders/{order_id}/review` | `rescue.create_review` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:71` | `tests/test_meh2943_rescue_idor.py:425` | — | 9 |
| 253 | POST | `/admin/rescue/users/{user_id}/clear-block` | `rescue.clear_no_show_block` | admin · flag: rescue | `tests/test_meh3225_no_show_tombstones.py:132` | `tests/test_rescue.py:749` | — | 5 |
| 254 | GET | `/admin/rescue/metrics` | `rescue.pilot_metrics` | admin · flag: rescue | `tests/test_meh2703_rescue_donated.py:143` | `tests/test_rescue_pilot.py:317` | — | 3 |
| 255 | GET | `/producers/me/rescue/orders` | `rescue.list_my_orders` | business/organizer · flag: rescue | `tests/test_meh2679_rescue_utc_times.py:84` | `tests/test_rescue_pilot.py:250` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 3 |
| 256 | GET | `/producers/me/rescue/offers` | `rescue.list_my_offers` | business/organizer · flag: rescue | `tests/test_meh2703_rescue_donated.py:43` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 5 |
| 257 | PUT | `/producers/me/rescue/offers/{offer_id}/donated` | `rescue.set_donated` | business/organizer · flag: rescue | `tests/test_meh2703_rescue_donated.py:82` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 9 |
| 258 | GET | `/producers/me/rescue/typical-items` | `rescue.get_typical_items` | business/organizer · flag: rescue | `tests/test_meh2752_rescue_allergens.py:78` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 5 |
| 259 | PUT | `/producers/me/rescue/typical-items` | `rescue.set_typical_items` | business/organizer · flag: rescue | `tests/test_meh2752_rescue_allergens.py:68` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 7 |
| 260 | GET | `/producers/me/order-settings` | `product_orders.get_my_order_settings` | business/organizer | `tests/test_meh3218_product_orders.py:357` | `tests/test_meh3218_product_orders.py:415` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 3 |
| 261 | PUT | `/producers/me/order-settings` | `product_orders.put_my_order_settings` | business/organizer | `tests/test_meh3218_product_orders.py:380` | `tests/test_meh3218_product_orders.py:413` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:503` | 5 |
| 262 | PUT | `/admin/producers/{producer_id}/order-settings/alcohol` | `product_orders.set_alcohol_licensed` | admin | `tests/test_meh3218_product_orders.py:447` | `tests/test_meh3218_product_orders.py:438` | — | 5 |

### Internal routes (allowlisted — not actor actions)

| # | Method | Path | Handler | Reason | Test |
|---|---|---|---|---|---|
| 232 | GET | `/health/places` | `health.places_health` | Google Places key probe for a cron / uptime monitor (MEH-2482) | `tests/test_meh2482_health_places.py:33` |
| 233 | HEAD | `/health/liveness` | `health.liveness` | Railway liveness probe — no actor action | `tests/test_health.py:16` |
| 234 | GET | `/health/liveness` | `health.liveness` | Railway liveness probe — no actor action | `tests/test_health.py:10` |
| 235 | HEAD | `/health/readiness` | `health.readiness` | Railway readiness probe — no actor action | weak `tests/test_health.py:25` (path literal) |
| 236 | GET | `/health/readiness` | `health.readiness` | Railway readiness probe — no actor action | `tests/test_health.py:25` |
| 237 | HEAD | `/health` | `health.health_alias` | uptime / Railway probe alias — no actor action | weak `tests/test_health.py:74` (path literal) |
| 238 | GET | `/health` | `health.health_alias` | uptime / Railway probe alias — no actor action | `tests/test_health.py:74` |
| 239 | GET | `/` | `system.root` | service banner (system.root) — no actor action | GAP |
| 242 | GET | `/webhook/whatsapp` | `whatsapp_webhook.webhook_challenge` | Meta webhook — the caller is Meta, HMAC-verified in the handler, not a user | `tests/test_meh_509_pr2c_webhook.py:170` |
| 243 | POST | `/webhook/whatsapp` | `whatsapp_webhook.webhook_receive` | Meta webhook — the caller is Meta, HMAC-verified in the handler, not a user | `tests/test_meh_509_pr2c_webhook.py:247` |
| — | GET | `/docs` | — | FastAPI-generated Swagger UI | n/a |
| — | GET | `/docs/oauth2-redirect` | — | FastAPI-generated Swagger OAuth redirect | n/a |
| — | GET | `/openapi.json` | — | FastAPI-generated schema | n/a |
| — | GET | `/redoc` | — | FastAPI-generated ReDoc | n/a |

## Business tools (`frontend/lib/business-features.js`)

| Tool | Group | Status | Dashboard | Backend | Unit (import) | E2E page | Verdict |
|---|---|---|---|---|---|---|---|
| `gallery_story` | page | live | — | n/a | `frontend/__tests__/OwnerCard.test.jsx:14` | n/a | covered |
| `product_details` | page | live | — | n/a | `frontend/__tests__/DietDefinitions.test.jsx:31` | n/a | covered |
| `top_product` | page | live | — | n/a | `frontend/__tests__/ProducerHoursSection.test.jsx:53` | n/a | covered |
| `hours` | page | live | — | n/a | `frontend/__tests__/LocationHoursField.test.jsx:15` | n/a | covered |
| `vacation_mode` | page | live | — | n/a | `frontend/__tests__/ProducerHeaderAlertsReentry.test.jsx:101` | n/a | covered |
| `map_precision` | page | live | — | n/a | `frontend/__tests__/producerPoints.test.js:2` | n/a | covered |
| `multi_locations` | page | live | — | n/a | `frontend/__tests__/LocationFormDisclosure.test.jsx:25` | n/a | covered |
| `draft_claim` | page | live | — | `tests/test_meh2496_claim_link_sent_at.py:65` (6/6 routes in file) | `frontend/__tests__/AdminClaimLink.test.jsx:18` | n/a | covered |
| `ai_writer` | page | live | — | `tests/test_api.py:2158` (imports module) | n/a | n/a | covered |
| `guides` | page | live | — | n/a | `frontend/__tests__/TitlesGuidesCopy.test.jsx:47` | GAP | covered |
| `social_signup` | page | live | — | `tests/test_api.py:4287` (16/16 routes in file) | `frontend/__tests__/AuthPagesAuthedRedirect.test.jsx:4` | n/a | covered |
| `wa_approval` | page | live | — | `tests/test_expansion_whatsapp.py:24` (imports module) | n/a | n/a | covered |
| `onboarding_emails` | page | live | — | `tests/test_meh1965_email_copy_contract.py:82` (imports module) | n/a | n/a | covered |
| `vanity_link` | found | live | — | n/a | `frontend/__tests__/Dashboard1025Banner.test.jsx:14` | `frontend/e2e/flows/22-register-personas.spec.ts:232` | covered |
| `discovery` | found | live | — | n/a | `frontend/__tests__/DietLandingPage.test.jsx:88` | GAP | covered |
| `similar_businesses` | found | live | — | n/a | `frontend/__tests__/ProducerHoursSection.test.jsx:53` | n/a | covered |
| `share_cards` | found | live | — | n/a | `frontend/__tests__/ReviewCardLayout.test.jsx:3` | n/a | covered |
| `qr_code` | found | live | `/producer/dashboard/qr-card` | n/a | `frontend/__tests__/BusinessQr.test.js:9` | GAP | covered |
| `structured_data` | found | live | — | n/a | `frontend/__tests__/BusinessQr.test.js:8` | n/a | covered |
| `primary_cta` | contact | live | — | n/a | `frontend/__tests__/ContactCard.test.jsx:69` | n/a | covered |
| `wa_prefill` | contact | live | — | n/a | `frontend/__tests__/ContactCard.test.jsx:69` | n/a | covered |
| `product_wa` | contact | live | — | n/a | `frontend/__tests__/ProductSheet.test.jsx:79` | n/a | covered |
| `faq_answers` | contact | live | — | n/a | `frontend/__tests__/BadgeRequestLine.test.jsx:7` | `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:175` | covered |
| `delivery_areas` | contact | live | — | n/a | `frontend/__tests__/LocationFormDisclosure.test.jsx:25` | n/a | covered |
| `delivery_checker` | contact | live | — | n/a | `frontend/__tests__/CoverageRequestCta.test.jsx:49` | n/a | covered |
| `wa_group` | contact | live | — | n/a | `frontend/__tests__/ContactCard.test.jsx:69` | n/a | covered |
| `nav_buttons` | contact | live | — | n/a | GAP | n/a | GAP |
| `save_share` | contact | live | — | n/a | `frontend/__tests__/EntityRegistryGuard.test.js:85` | n/a | covered |
| `offer` | return | live | — | n/a | `frontend/__tests__/OfferBadge.test.jsx:13` | n/a | covered |
| `group_buys` | return | live | `/producer/dashboard/group-buys` | n/a | `frontend/__tests__/GroupBuyCardFulfillment.test.jsx:10` | `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:360` | covered |
| `events` | return | live | `/producer/dashboard/events` | n/a | `frontend/__tests__/EventsCategoryChipContrast.test.jsx:3` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:290` | covered |
| `experiences` | return | live | `/producer/dashboard/experiences` | n/a | `frontend/__tests__/HubMetadataNoindex.test.js:28` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:248` | covered |
| `recipes` | return | live | `/producer/dashboard/recipes` | weak `tests/test_meh1000_recipe_admin_notification.py:182` (6/7 routes in file) | `frontend/__tests__/RecipeResolverErrorSeparation.test.jsx:42` | GAP | weak (capped by its router) |
| `follower_updates` | return | live | `/producer/dashboard/insights` | n/a | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:622` | covered |
| `waitlist` | return | live | — | `tests/test_delivery_waitlist.py:21` (imports module) | `frontend/__tests__/DeliveryWaitlistForm.test.jsx:71` | n/a | covered |
| `rescue_bags` | return | live | `/producer/dashboard/rescue` | n/a | `frontend/__tests__/RescueBuyerFlow.test.jsx:175` | GAP | covered |
| `verified_badge` | trust | live | — | n/a | `frontend/__tests__/AdminProducersTableTags.test.jsx:22` | n/a | covered |
| `kashrut_verified` | trust | live | — | n/a | `frontend/__tests__/AdminKashrutPage.test.jsx:5` | GAP | covered |
| `editor_pick` | trust | live | — | n/a | `frontend/__tests__/featuredProducer.test.js:2` | n/a | covered |
| `reservist_diet_tags` | trust | live | — | n/a | `frontend/__tests__/ReservistBadgeLine.test.jsx:18` | n/a | covered |
| `reviews_contacted` | trust | live | `/producer/dashboard/reviews` | `tests/test_api.py:2705` (8/8 routes in file) | `frontend/__tests__/ReviewsSection.test.jsx:3` | GAP | covered |
| `review_request` | trust | live | — | n/a | `frontend/__tests__/RequestReviewCard.test.jsx:18` | n/a | covered |
| `views` | insights | live | — | `tests/test_api.py:3919` (10/10 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:622` | covered |
| `search_impressions` | insights | live | — | `tests/test_api.py:3919` (10/10 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:622` | covered |
| `contact_clicks` | insights | live | — | `tests/test_api.py:3919` (10/10 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:622` | covered |
| `favorites_rating` | insights | live | — | `tests/test_api.py:3919` (10/10 routes in file) | n/a | n/a | covered |
| `top_cities` | insights | live | — | `tests/test_api.py:3919` (10/10 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:622` | covered |
| `demand_cities` | insights | live | — | n/a | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:622` | covered |
| `drop_point_hosts` | insights | live | — | `tests/test_delivery_waitlist.py:21` (imports module) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:622` | covered |
| `email_alerts` | insights | live | — | `tests/test_meh1613_email_failure_visibility.py:31` (imports module) | n/a | n/a | covered |
| `completeness` | insights | live | — | n/a | `frontend/__tests__/CompletenessFieldsMessages.test.jsx:12` | n/a | covered |

## Pages (`frontend/app/[locale]/**/page.*`)

### Public

| Route | E2E (`goto`) | Unit (import) | Verdict |
|---|---|---|---|
| `/[slug]` | `frontend/e2e/flows/00-producer-fixture-probe-origin.spec.ts:95` | `frontend/__tests__/ProducerGonePage.test.jsx:59` | covered |
| `/[slug]/recipes/[recipe_id]` | GAP | `frontend/__tests__/RecipeResolverErrorSeparation.test.jsx:42` | covered |
| `/about/badges` | GAP | `frontend/__tests__/title-pattern.test.js:139` | covered |
| `/about/for-businesses/guides/business-story` | `frontend/e2e/flows/manual/hebrew-typography.spec.ts:99` | `frontend/__tests__/title-pattern.test.js:182` | covered |
| `/about/for-businesses/guides/customer-messages` | GAP | `frontend/__tests__/title-pattern.test.js:183` | covered |
| `/about/for-businesses/guides` | GAP | `frontend/__tests__/TitlesGuidesCopy.test.jsx:47` | covered |
| `/about/for-businesses/guides/product-photography` | GAP | `frontend/__tests__/title-pattern.test.js:184` | covered |
| `/about/for-businesses` | `frontend/e2e/flows/manual/join.spec.ts:235` | `frontend/__tests__/BusinessFaqClosedOnLoad.test.jsx:36` | covered |
| `/about` | `frontend/e2e/flows/13-static-pages-render.spec.ts:8` | `frontend/__tests__/title-pattern.test.js:135` | covered |
| `/about/process` | `frontend/e2e/flows/manual/hebrew-typography.spec.ts:57` | `frontend/__tests__/title-pattern.test.js:136` | covered |
| `/about/why-local` | GAP | `frontend/__tests__/EditorialPagePhotos.test.jsx:40` | covered |
| `/accessibility` | GAP | `frontend/__tests__/title-pattern.test.js:161` | covered |
| `/account-deleted` | GAP | GAP | GAP |
| `/business-gone` | GAP | `frontend/__tests__/ProducerGonePage.test.jsx:202` | covered |
| `/claim/[token]` | GAP | GAP | GAP |
| `/claim` | GAP | `frontend/__tests__/title-pattern.test.js:173` | covered |
| `/contact` | GAP | `frontend/__tests__/title-pattern.test.js:162` | covered |
| `/delivery-waitlist/host-confirm` | GAP | `frontend/__tests__/title-pattern.test.js:179` | covered |
| `/delivery-waitlist/unsubscribe` | GAP | `frontend/__tests__/title-pattern.test.js:177` | covered |
| `/dev/components` | GAP | GAP | GAP |
| `/draft-preview/[token]` | GAP | GAP | GAP |
| `/events/[id]` | GAP | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:68` | covered |
| `/events` | `frontend/e2e/flows/08-calendar-view.spec.ts:35` | `frontend/__tests__/HubMetadataNoindex.test.js:27` | covered |
| `/experiences/[id]` | weak `frontend/e2e/flows/manual/auth.spec.ts:541` (only a guest-redirect check) | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:69` | covered |
| `/experiences` | GAP | `frontend/__tests__/HubMetadataNoindex.test.js:28` | covered |
| `/favorites` | `frontend/e2e/flows/08-calendar-view.spec.ts:92` | `frontend/__tests__/title-pattern.test.js:169` | covered |
| `/forgot-password` | `frontend/e2e/flows/30-login-journey-c.spec.ts:544` | `frontend/__tests__/title-pattern.test.js:166` | covered |
| `/freshness/confirm` | GAP | GAP | GAP |
| `/group-buys/[id]` | GAP | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:70` | covered |
| `/group-buys` | GAP | `frontend/__tests__/HubMetadataNoindex.test.js:29` | covered |
| `/join` | `frontend/e2e/flows/manual/join.spec.ts:131` | `frontend/__tests__/EditorialPagePhotos.test.jsx:38` | covered |
| `/join/pricing` | GAP | `frontend/__tests__/PricingPageRescueFlag.test.jsx:32` | covered |
| `/login` | `frontend/e2e/flows/09-login-console-clean.spec.ts:22` | `frontend/__tests__/title-pattern.test.js:163` | covered |
| `/map` | `frontend/e2e/flows/05-map-navigation.spec.ts:22` | `frontend/__tests__/title-pattern.test.js:134` | covered |
| `/messages` | GAP | `frontend/__tests__/title-pattern.test.js:174` | covered |
| `/newsletter/unsubscribe` | GAP | `frontend/__tests__/title-pattern.test.js:176` | covered |
| `/organizers/[slug]` | GAP | `frontend/__tests__/OrganizerPage.test.jsx:50` | covered |
| `/owner-invite/[token]` | `frontend/e2e/flows/46-owner-invite.spec.ts:299` | GAP | covered |
| `/owner-invite` | GAP | GAP | GAP |
| `/p/[slug]` | GAP | `frontend/__tests__/VanityRedirectKeepsQuery.test.js:16` | covered |
| `/` | `frontend/e2e/flows/01-home-load.spec.ts:5` | GAP | covered |
| `/privacy` | GAP | `frontend/__tests__/title-pattern.test.js:160` | covered |
| `/producer/[id]` | `frontend/e2e/flows/12-axe-a11y.spec.ts:110` | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:71` | covered |
| `/producers/[category]/[region]` | GAP | `frontend/__tests__/RegionLandingPage.test.jsx:60` | covered |
| `/producers/diet/[dietSlug]` | GAP | `frontend/__tests__/DietLandingPage.test.jsx:88` | covered |
| `/producers` | `frontend/e2e/flows/03-view-producer-detail.spec.ts:46` | `frontend/__tests__/LaunchHardening.test.jsx:75` | covered |
| `/recommend` | `frontend/e2e/flows/manual/share.spec.ts:117` | `frontend/__tests__/RecommendNoindex.test.js:25` | covered |
| `/register/organizer` | GAP | `frontend/__tests__/RegisterOrganizerMeta.test.js:18` | covered |
| `/register` | `frontend/e2e/flows/09-login-console-clean.spec.ts:140` | `frontend/__tests__/title-pattern.test.js:164` | covered |
| `/register/producer` | `frontend/e2e/flows/10-producer-oauth-409.spec.ts:52` | `frontend/__tests__/RegisterProducerShareMeta.test.js:18` | covered |
| `/registration/[token]` | GAP | `frontend/__tests__/title-pattern.test.js:180` | covered |
| `/rescue` | GAP | `frontend/__tests__/title-pattern.test.js:175` | covered |
| `/reset-password` | `frontend/e2e/flows/11-password-policy.spec.ts:144` | `frontend/__tests__/title-pattern.test.js:167` | covered |
| `/settings` | `frontend/e2e/flows/11-password-policy.spec.ts:202` | `frontend/__tests__/MobileNoOuterCard.test.jsx:36` | covered |
| `/terms` | GAP | `frontend/__tests__/title-pattern.test.js:141` | covered |
| `/unsubscribe/weekly` | GAP | `frontend/__tests__/title-pattern.test.js:178` | covered |
| `/verify-email` | GAP | `frontend/__tests__/title-pattern.test.js:168` | covered |

### Dashboard

| Route | E2E (`goto`) | Unit (import) | Verdict |
|---|---|---|---|
| `/producer/dashboard/edit` | `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:175` | `frontend/__tests__/BadgeRequestLine.test.jsx:7` | covered |
| `/producer/dashboard/events/[id]/edit` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:290` | GAP | covered |
| `/producer/dashboard/events/new` | GAP | `frontend/__tests__/EventExperienceAddress.test.jsx:76` | covered |
| `/producer/dashboard/events` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:166` | `frontend/__tests__/ManageEventsPage.test.jsx:48` | covered |
| `/producer/dashboard/experiences/[id]/edit` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:297` | GAP | covered |
| `/producer/dashboard/experiences/new` | GAP | `frontend/__tests__/EventExperienceAddress.test.jsx:121` | covered |
| `/producer/dashboard/experiences` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:248` | `frontend/__tests__/ExperienceSpotsLeft.test.jsx:30` | covered |
| `/producer/dashboard/followers` | GAP | `frontend/__tests__/DashboardInsightsFollowersShare.test.jsx:104` | covered |
| `/producer/dashboard/group-buys` | `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:360` | `frontend/__tests__/DashboardEmptyStateFormExclusive.test.jsx:64` | covered |
| `/producer/dashboard/insights` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:622` | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | covered |
| `/producer/dashboard` | `frontend/e2e/flows/22-register-personas.spec.ts:232` | `frontend/__tests__/Dashboard1025Banner.test.jsx:14` | covered |
| `/producer/dashboard/preview` | GAP | GAP | GAP |
| `/producer/dashboard/qr-card` | GAP | GAP | GAP |
| `/producer/dashboard/recipes/[id]/edit` | GAP | GAP | GAP |
| `/producer/dashboard/recipes` | GAP | `frontend/__tests__/DashboardEmptyStateFormExclusive.test.jsx:65` | covered |
| `/producer/dashboard/rescue/counter-card` | GAP | `frontend/__tests__/RescueCounterCardLink.test.jsx:19` | covered |
| `/producer/dashboard/rescue` | GAP | `frontend/__tests__/RescueCounterCardLink.test.jsx:18` | covered |
| `/producer/dashboard/reviews` | GAP | `frontend/__tests__/DashboardReviewsPage.test.jsx:9` | covered |
| `/producer/dashboard/tools` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:152` | `frontend/__tests__/DashboardSharePlacement.test.jsx:13` | covered |
| `/producer/dashboard/whats-new` | GAP | `frontend/__tests__/WhatsNew.test.jsx:46` | covered |

### Admin

| Route | E2E (`goto`) | Unit (import) | Verdict |
|---|---|---|---|
| `/admin/analytics` | GAP | `frontend/__tests__/AdminNullGuards.test.jsx:141` | covered |
| `/admin/billing` | GAP | `frontend/__tests__/AdminBillingPage.test.jsx:37` | covered |
| `/admin/category-requests` | GAP | GAP | GAP |
| `/admin/content` | `frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts:800` | `frontend/__tests__/AdminContentCategoryDelete.test.jsx:3` | covered |
| `/admin/experiences` | GAP | `frontend/__tests__/AdminExperiencesPage.test.jsx:5` | covered |
| `/admin/group-buys` | GAP | `frontend/__tests__/AdminGroupBuysTransitions.test.jsx:13` | covered |
| `/admin/help` | GAP | `frontend/__tests__/AdminHelp.test.jsx:7` | covered |
| `/admin/kashrut` | GAP | `frontend/__tests__/AdminKashrutPage.test.jsx:5` | covered |
| `/admin/name-change-requests` | GAP | GAP | GAP |
| `/admin/outreach` | `frontend/e2e/flows/37-outreach-prefill.spec.ts:329` | `frontend/__tests__/AdminOutreach.test.jsx:3` | covered |
| `/admin` | `frontend/e2e/flows/25-role-reachability.spec.ts:123` | `frontend/__tests__/AdminDashboardStats.test.jsx:3` | covered |
| `/admin/producers/[id]/edit` | `frontend/e2e/flows/46-owner-invite.spec.ts:234` | `frontend/__tests__/AdminClaimLink.test.jsx:19` | covered |
| `/admin/producers/new` | `frontend/e2e/flows/manual/admin-producer-form-licence.spec.ts:423` | GAP | covered |
| `/admin/producers` | `frontend/e2e/flows/33-admin-producers-tab.spec.ts:94` | `frontend/__tests__/AdminApproveWithoutLicense.test.jsx:3` | covered |
| `/admin/recipes` | `frontend/e2e/flows/20-admin-recipes-queue.spec.ts:58` | GAP | covered |
| `/admin/reports` | `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:530` | `frontend/__tests__/AdminReportsPage.test.jsx:3` | covered |
| `/admin/reviews` | `frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts:712` | `frontend/__tests__/AdminReviewDelete.test.jsx:3` | covered |
| `/admin/settings` | `frontend/e2e/flows/30-admin-panel-tabs.spec.ts:153` | GAP | covered |
| `/admin/users` | `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:561` | `frontend/__tests__/AdminUsersDeleteAction.test.jsx:3` | covered |
| `/admin/whatsapp-failures` | GAP | `frontend/__tests__/AdminWhatsappFailuresStuck.test.jsx:12` | covered |

## State machines (`docs/audits/2026-11-implicit-state-machines.md`)

A site `file:line` is mapped to the route whose handler contains it (or reaches it within six helper hops in the same module); the row takes the WORST verdict of the routes it reaches. The audit's line numbers are as of 09/11 — where a file moved since, the row says so (see `ModuleMap.routes_for`).

| § | Transition / write | Site | Routes reached | Verdict | Note |
|---|---|---|---|---|---|
| 1 | ∅ → `draft` | auth.py:571, auth.py:781, producer_queries.py:662, admin.py:391 | `POST /auth/register/producer`, `POST /admin/producers` | `tests/test_admin_delete_producer.py:46` | — |
| 1 | `draft` → `pending` | producer_me_review.py:596 | `POST /producers/me/submit-for-review` | `tests/test_meh2100_draft_submit.py:196` | — |
| 1 | `rejected` → `pending` | producer_me_review.py:506 | `POST /producers/me/request-review` | `tests/test_api.py:2251` | — |
| 1 | `pending`/`rejected` → `approved` | admin_decisions.py:146, producer_approval.py:122 | `POST /admin/producers/{producer_id}/approve` | `tests/test_admin_approval_transitions.py:121` | — |
| 1 | `pending`/`approved` → `rejected` | admin_decisions.py:300 | `POST /admin/producers/{producer_id}/reject` | `tests/test_admin_approval_transitions.py:398` | — |
| 1 | `approved` ⇄ `inactive` | admin.py:810 | `POST /admin/producers/{producer_id}/toggle-status` | `tests/test_admin_approval_transitions.py:38` | — |
| 1 | `pending` → `pending` + feedback | — | `POST /admin/producers/{producer_id}/request-changes` | `tests/test_changes_requested_whatsapp.py:59` | — |
| 1 | any → any via admin PUT | admin.py:655 | `PUT /admin/producers/{producer_id}` | `tests/test_admin_approval_transitions.py:530` | — |
| 2 | ∅ → `open` | group_buys.py:396 | `DELETE /group-buys/{group_buy_id}/commit` | `tests/test_group_buys_api.py:249` | a DELETE handler for a non-delete transition — audit line may be off |
| 2 | `open` → `funded` | group_buys.py:295 | `POST /group-buys/{group_buy_id}/commit` | `tests/test_group_buys_api.py:243` | — |
| 2 | `funded` → `open` | group_buys.py:340 | `POST /group-buys/{group_buy_id}/commit` | `tests/test_group_buys_api.py:243` | — |
| 2 | `funded` → `open` | group_buy_delist.py:102 | — | GAP | — |
| 2 | `open`/`funded` → `cancelled`, `funded` → `fulfilled` | group_buys.py:516 | `POST /group-buys` | `tests/test_group_buys_api.py:346` | — |
| 2 | `open`/`funded` → `cancelled` | group_buy_delist.py:61 | — | GAP | — |
| 2 | **any → any** | group_buys.py:563 | `PATCH /group-buys/{group_buy_id}/status`, `PATCH /admin/group-buys/{group_buy_id}/status` | `tests/test_group_buys_api.py:1454` | — |
| 3 | ∅ → `active` (offer) | rescue.py:422 | `POST /rescue/offers` | `tests/test_meh2679_rescue_utc_times.py:66` | — |
| 3 | `active` → `cancelled` (offer) | rescue.py:573 | `POST /rescue/offers/{offer_id}/cancel` | `tests/test_meh2738_rescue_business_cancel.py:46` | nearest write handler — audit line may have drifted |
| 3 | ∅ → `reserved` (order) | rescue.py:285 | `POST /rescue/orders` | `tests/test_meh2679_rescue_utc_times.py:77` | — |
| 3 | `reserved` → `handed` | rescue.py:901 | `POST /rescue/orders` | `tests/test_meh2679_rescue_utc_times.py:77` | — |
| 3 | `reserved` → `no_show` | rescue.py:939 | `POST /rescue/orders/{order_id}/handed` | `tests/test_meh2680_rescue_my_orders.py:65` | — |
| 3 | `reserved` → `cancelled` (buyer) | rescue.py:989 | `POST /rescue/orders/{order_id}/no_show` | `tests/test_meh2943_rescue_idor.py:342` | nearest function — audit line may have drifted |
| 3 | `reserved` → `cancelled` (bulk, offer pulled) | rescue.py:581 | `POST /rescue/offers/{offer_id}/cancel` | `tests/test_meh2738_rescue_business_cancel.py:46` | nearest write handler — audit line may have drifted |
| 4 | ∅ → `(pending, verdict, true)` | experiences.py:459 | `POST /experiences` | `tests/test_experiences.py:161` | — |
| 4 | content edit on `approved`/`rejected`/`changes_requested` → `(pending, fresh verdict, is_active unchanged)` | experiences.py:588, experiences.py:622 | `PUT /experiences/{experience_id}` | `tests/test_experiences.py:933` | — |
| 4 | `is_active` flip only | experiences.py:560, experiences.py:567 | `PUT /experiences/{experience_id}` | `tests/test_experiences.py:933` | — |
| 4 | → `approved` | admin_experiences.py:88 | `POST /admin/experiences/{experience_id}/approve` | `tests/test_experiences.py:849` | — |
| 4 | → `changes_requested` | admin_experiences.py:128 | `POST /admin/experiences/{experience_id}/request-changes` | `tests/test_experiences.py:905` | — |
| 4 | → `rejected` | admin_experiences.py:164 | `POST /admin/experiences/{experience_id}/reject` | `tests/test_experiences.py:878` | — |
| 5 | `(pending, published=False)` | producer_recipes.py:157 | `POST /producers/me/recipes` | `tests/test_meh1000_recipe_admin_notification.py:182` | — |
| 5 | `(pending, published=False)` — content edit unpublishes | producer_recipes.py:295 | `PATCH /producers/me/recipes/{recipe_id}` | `tests/test_indexnow.py:724` | — |
| 5 | `(approved, published=True)` | admin_recipes.py:138 | `POST /admin/recipes/{recipe_id}/approve` | `tests/test_indexnow.py:527` | — |
| 5 | `(needs_revision, published=False)` | admin_recipes.py:219 | `POST /admin/recipes/{recipe_id}/request-changes` | `tests/test_indexnow.py:535` | — |
| 5 | `(rejected, published=False)` | admin_recipes.py:254 | `POST /admin/recipes/{recipe_id}/reject` | `tests/test_indexnow.py:535` | — |
| 6 | create / upsert-edit | reviews.py:538 | `POST /producers/{producer_id}/reviews` | `tests/test_api.py:2730` | — |
| 6 | edit via race branch | reviews.py:577 | `POST /producers/{producer_id}/reviews` | `tests/test_api.py:2730` | — |
| 6 | hide | reviews.py:708 | `PUT /reviews/{review_id}/reply` | `tests/test_meh2381_review_edited_after_hidden.py:174` | — |
| 6 | unhide | reviews.py:731 | `PUT /admin/reviews/{review_id}/hide`, `GET /admin/reviews` | `tests/test_meh2381_review_edited_after_hidden.py:96` | nearest function — audit line may have drifted |
| 6 | delete (owner/admin) | reviews.py:581 | `POST /producers/{producer_id}/reviews` | `tests/test_api.py:2730` | a delete transition reached no DELETE handler — audit line may be off |
| 6 | user account deletion (DB cascade) | user_deletion.py:112 | — | weak `tests/test_meh3252_pii_after_account_delete.py:122` (names delete_user_and_data) | — |
| 7 | §7 — whole section | whatsapp_webhook.py:588 | `POST /webhook/whatsapp` | `tests/test_meh_509_pr2c_webhook.py:247` | — |
| 8 | §8 — whole section | home_products.py:177, router_registry.py:100, router_registry.py:66, home_products.py:228 … | — | n/a (home_products.py is not mounted) | — |
| 9 | `registrations.status` | registrations.py:375, registrations.py:377, registrations.py:383, registrations.py:226 … | `GET /events/{event_id}/registrations`, `GET /experiences/{experience_id}/registrations`, `POST /events/{event_id}/registrations`, `PUT /experiences/{experience_id}`, `POST /registrations/{token}/cancel` | `tests/test_meh2763_registrations.py:306` | nearest function — audit line may have drifted |
| 9 | `events` | — | — | GAP | — |
| 9 | `users` | admin_extra.py:185, auth.py:627, auth.py:830, producer_claim.py:249 | `PUT /admin/users/{user_id}/role`, `POST /auth/register/producer`, `POST /producer-claim/new-link-request` | `tests/test_admin_role_orphan_source.py:107` | nearest write handler — audit line may have drifted |
| 9 | not covered by the audit (time box) | admin_kashrut.py:210 | `POST /admin/kashrut/{request_id}/revoke` | `tests/test_meh2518_kashrut_real_expiry.py:149` | — |

## Mandatory extra rows (§B.3)

A row is covered when one test function calls the listed route(s) and matches the row's condition (status in the call window, a word in the test). `weak` = only a grep hit, no route call.

| Kind | Row | Evidence | Note | Score |
|---|---|---|---|---|
| negative | wrong phone OTP code is refused | `tests/test_meh1176_otp_confirm_rate_limit.py:35` | — | 10 |
| negative | expired phone OTP code is refused | `tests/test_phone_change_reverify.py:73` | — | 10 |
| negative | expired password-reset token is refused | `tests/test_api.py:4208` | — | 9 |
| negative | expired email-verify token is refused | `tests/test_verify_email.py:55` | — | 6 |
| negative | double submit-for-review | `tests/test_meh2899_double_submit.py:181` | — | 9 |
| negative | double join (commit) on a group buy | `tests/test_group_buys_api.py:672` | — | 13 |
| negative | double reserve of a rescue bag | `tests/test_rescue.py:335` | — | 11 |
| negative | cancel a rescue reservation midway | `tests/test_meh2680_rescue_my_orders.py:79` (via helper _reserve) | — | 11 |
| negative | cancel an event/experience registration midway | `tests/test_meh2763_registrations.py:355` | — | 10 |
| negative | a rejected business acting (business mutation → 403/409) | GAP | — | 11 |
| negative | rate limit 429 on login | `tests/test_meh3372_login_per_email_limit.py:146` | — | 9 |
| negative | rate limit 429 on phone OTP | `tests/test_meh1176_otp_confirm_rate_limit.py:35` | — | 12 |
| time | rescue: handover / no-show before the pickup window closed | `tests/test_rescue.py:401` | real clock | 13 |
| time | rescue: reserve inside the window, up to the cutoff | `tests/test_rescue.py:226` | real clock | 11 |
| time | rescue: reserve / list after the window or cutoff | `tests/test_rescue.py:562` | real clock | 3 |
| time | group buy: commit after the deadline passed | `tests/test_group_buys_api.py:655` | real clock | 13 |
| time | ended event / experience: registration refused | `tests/test_meh3288_signup_closes_at_start.py:113` | clock frozen | 10 |
| time | Friday / holiday mode | `tests/test_holiday_mode.py:17` | real clock | 5 |
| time | special hours on a date (clock frozen) | `tests/test_meh2264_special_hours_b.py:91` | clock frozen | 3 |
| time | the 24 h WhatsApp customer-service window | weak `tests/test_meh2122_otp_failure_visibility.py:66` (grep, no route call) | real clock | 10 |
| time | SLA ageing in the admin queue | `tests/test_admin_queue_sla_aging.py:332` | clock frozen | 7 |
| race | owner and admin move the same group buy (#4250) | `tests/test_group_buys_api.py:1255` (via helper _patch) | sequential interleave only | 11 |
| race | «נמסר» vs cancel on one rescue order (#4249) | `tests/test_meh2738_rescue_business_cancel.py:114` | sequential interleave only | 14 |
| race | two customers take the last rescue bag | `tests/test_rescue.py:261` | sequential interleave only | 12 |
| race | the owner edits while the admin approves | `tests/test_meh2907_approve_vs_owner_edit.py:214` | concurrent threads | 10 |

## Risk score

Add up, for a route: its method and actor terms, then every other term that applies — the «Why» column of «Top gaps» names those (method and actor are in the row: «Route» and «Actor»).

| Term | Weight |
|---|---|
| method: POST / PUT / PATCH / DELETE | 3 |
| method: GET / HEAD | 1 |
| actor: admin or business | +2 |
| actor: registered user | +1 |
| anonymous mutation (public write) | +1 |
| DELETE | +1 |
| auth: path has auth / login / register / password / verify / otp / claim / token / reset | +3 |
| money-like mutation: `/group-buys/{id}/commit`, `/rescue/orders…` | +3 |
| sends email/WhatsApp: the handler (or a same-module helper) calls a name imported from a notification service module | +2 |
| object id in path: a non-admin mutation with an `{…}` segment (`/me/…/{id}` included; not `/users/me/favorites/…` or `/users/me/saved/…`) | +2 |
| site-wide settings: a mutation under `/admin/settings` | +3 |
| public visibility: approve / reject / publish / toggle-status / hide / unhide / verified / ambassador / story-card / request-changes / revoke, on a mutation | +2 |
| **privilege change**: a mutation on `/role`, `/block` or `/admin/users/…` — the highest single weight | +8 |
| no test calls the route and asserts its result (GAP) | +4 |
| only `weak` evidence (named, or no success asserted) | +2 |
| a gated route with no 401/403 test | +2 |

A §B.3 extra row: its primary route's terms above (the coverage terms excluded), plus race 3 / time 2 / negative 2, plus 4 if GAP or 2 if weak. The «business mutations» row uses 3 + 2.
