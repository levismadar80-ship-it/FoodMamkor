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
| API routes (actor actions) | 235 | 222 | 7 | 6 | 0 |
| — negative cell of gated routes (401/403) | 170 | 106 | 0 | 64 | 0 |
| Internal routes (allowlisted) | 10 + 4 docs | — | — | — | — |
| Business tools | 51 | 49 | 1 | 1 | 0 |
| Pages — public | 52 | 49 | 0 | 3 | 0 |
| Pages — dashboard | 18 | 15 | 0 | 3 | 0 |
| Pages — admin | 19 | 17 | 0 | 2 | 0 |
| State-machine rows (audit, every non-exempt section) | 45 | 40 | 0 | 4 | 1 |
| Mandatory extra rows (§B.3) | 25 | 22 | 1 | 2 | 0 |

Pages opened by a CI-run Playwright spec: **40 / 89** — the rest are covered only by a Vitest import (which may test no more than the page's metadata).

**GAP cells in total: 85** (route positive 6 · route negative 64 · tools 1 · pages 8 · machine rows 4 · extra rows 2). Not a gate yet — the plan's gate is "no *new* GAP" (a ratchet), later.

## Top gaps by risk

Score: see «Risk score» at the end. Routes whose verdict is not `covered` or whose 401/403 cell is a GAP, plus extra rows that are not `covered`.

| # | Score | Route / row | Actor | Why it is risky | Evidence |
|---|---|---|---|---|---|
| 1 | 13 | [negative] rate limit 429 on login | — | negative row on `POST /auth/login` | GAP |
| 2 | 13 | `POST /admin/producers/{producer_id}/owner-invite/resend` | admin | sends email/WhatsApp, no test, no 401/403 test | pos GAP · neg GAP |
| 3 | 13 | `POST /admin/producers/{producer_id}/owner-invite` | admin | sends email/WhatsApp, no test, no 401/403 test | pos GAP · neg GAP |
| 4 | 12 | `DELETE /admin/producers/{producer_id}/owner-invite` | admin | delete, no test, no 401/403 test | pos GAP · neg GAP |
| 5 | 12 | `DELETE /auth/me` | registered user | delete, auth, sends email/WhatsApp, no 401/403 test | pos `tests/test_account_deletion_cascade.py:40` · neg GAP |
| 6 | 12 | `POST /admin/settings/test/{service}` | admin | site-wide settings, only weak, no 401/403 test | pos weak `tests/test_meh2899_admin_service_test.py:90` (path literal) · neg GAP |
| 7 | 12 | `POST /producers/me/verify-phone` | business/organizer | auth, sends email/WhatsApp, no 401/403 test | pos `tests/test_meh2231_otp_test_numbers.py:102` · neg GAP |
| 8 | 11 | [negative] a rejected business acting (business mutation → 403/409) | — | negative row on `business mutations` | GAP |
| 9 | 11 | `PATCH /producers/me/recipes/{recipe_id}` | business/organizer | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_indexnow.py:723` · neg GAP |
| 10 | 11 | `POST /admin/experiences/{experience_id}/request-changes` | admin | sends email/WhatsApp, public visibility, no 401/403 test | pos `tests/test_experiences.py:905` · neg GAP |
| 11 | 11 | `POST /admin/producers/{producer_id}/story-card` | admin | public visibility, only weak, no 401/403 test | pos weak `tests/test_admin_error_no_leak.py:52` (only error-path calls) · neg GAP |
| 12 | 11 | `POST /admin/recipes/{recipe_id}/request-changes` | admin | sends email/WhatsApp, public visibility, no 401/403 test | pos `tests/test_indexnow.py:534` · neg GAP |
| 13 | 11 | `POST /rescue/orders` | registered user | money-like, sends email/WhatsApp, no 401/403 test | pos `tests/test_meh2679_rescue_utc_times.py:77` · neg GAP |
| 14 | 10 | [time] the 24 h WhatsApp customer-service window | — | time row on `POST /webhook/whatsapp` | weak `tests/test_meh2122_otp_failure_visibility.py:65` (grep, no route call) |
| 15 | 10 | `DELETE /producers/me/products/{product_id}` | business/organizer | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_product_image.py:109` · neg GAP |
| 16 | 10 | `DELETE /producers/me/recipes/{recipe_id}` | business/organizer | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_indexnow.py:756` · neg GAP |
| 17 | 10 | `PATCH /group-buys/{group_buy_id}/status` | registered user | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_group_buys_api.py:1405` · neg GAP |
| 18 | 10 | `POST /producers/me/verify-phone/confirm` | business/organizer | auth, no 401/403 test | pos `tests/test_meh2231_otp_test_numbers.py:113` · neg GAP |
| 19 | 10 | `PUT /admin/settings` | admin | site-wide settings, no 401/403 test | pos `tests/test_admin_settings_persistence.py:14` · neg GAP |
| 20 | 10 | `PUT /reviews/{review_id}/reply` | registered user | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh2381_review_edited_after_hidden.py:174` · neg GAP |
| 21 | 9 | `DELETE /events/{event_id}` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_events_cross_owner.py:99` · neg GAP |
| 22 | 9 | `DELETE /experiences/{experience_id}` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_experiences.py:1040` · neg GAP |
| 23 | 9 | `DELETE /reviews/{review_id}` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh2348_review_hide_sticky.py:84` · neg GAP |
| 24 | 9 | `GET /admin/group-buys` | admin | no test, no 401/403 test | pos GAP · neg GAP |
| 25 | 9 | `GET /admin/users/{user_id}/favorites` | admin | no test, no 401/403 test | pos GAP · neg GAP |
| 26 | 9 | `PATCH /admin/group-buys/{group_buy_id}/status` | admin | sends email/WhatsApp, no 401/403 test | pos `tests/test_group_buys_api.py:1546` · neg GAP |
| 27 | 9 | `POST /auth/logout-all-devices` | registered user | auth, no 401/403 test | pos `tests/test_api.py:4374` · neg GAP |
| 28 | 9 | `POST /producers/me/locations` | business/organizer | sends email/WhatsApp, no 401/403 test | pos `tests/test_meh1938_ch5_strict_followup.py:64` · neg GAP |
| 29 | 9 | `PUT /events/{event_id}` | business/organizer | object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_event_end_time.py:118` · neg GAP |
| 30 | 9 | `PUT /producers/me/products/{product_id}/group` | business/organizer | object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh3055_product_organize.py:71` · neg GAP |

## API routes

Registration order of the app. Actor from the dependency tree: `require_admin` → admin; `require_producer` / `require_verified_producer` → business (organizers are producers with `kind == "organizer"` and pass unless the handler refuses that kind); `get_current_user` → registered user; otherwise anonymous.

| # | Method | Path | Handler | Actor | Positive | Negative (401/403) | E2E | Score |
|---|---|---|---|---|---|---|---|---|
| 1 | POST | `/auth/refresh` | `auth.refresh_token` | anonymous | `tests/test_api.py:4272` | n/a | — | 7 |
| 2 | POST | `/auth/logout` | `auth.logout` | anonymous | `tests/test_api.py:4356` | n/a | — | 7 |
| 3 | POST | `/auth/register` | `auth.register` | anonymous | `tests/test_api.py:38` | n/a | e2e-mock `frontend/e2e/flows/29-register-journey-a.spec.ts:174` | 9 |
| 4 | POST | `/auth/register/producer` | `auth.register_producer` | anonymous (optional auth) | `tests/test_admin_delete_producer.py:46` | n/a | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:41` | 9 |
| 5 | POST | `/auth/google` | `auth.google_auth` | anonymous | `tests/test_email_verified_creation_paths.py:95` | n/a | — | 9 |
| 6 | POST | `/auth/register/producer/oauth` | `auth.register_producer_oauth` | anonymous | `tests/test_email_verified_creation_paths.py:115` | n/a | e2e-mock `frontend/e2e/flows/10-producer-oauth-409.spec.ts:44` | 7 |
| 7 | POST | `/auth/login` | `auth.login` | anonymous | `tests/test_api.py:538` | n/a | e2e-mock `frontend/e2e/flows/30-login-journey-c.spec.ts:238` | 7 |
| 8 | GET | `/auth/me` | `auth.get_me` | registered user | `tests/test_api.py:306` | `tests/test_api.py:562` | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:49` | 5 |
| 9 | POST | `/auth/logout-all-devices` | `auth.logout_all_devices` | registered user | `tests/test_api.py:4374` | GAP | — | 9 |
| 10 | POST | `/auth/apple` | `auth.apple_auth` | anonymous | `tests/test_email_verified_creation_paths.py:102` | n/a | — | 9 |
| 11 | POST | `/auth/check-password` | `auth.check_password` | anonymous | `tests/test_auth.py:289` | n/a | e2e-mock `frontend/e2e/flows/29-register-journey-a.spec.ts:153` | 7 |
| 12 | POST | `/auth/forgot-password` | `auth.forgot_password` | anonymous | `tests/test_forgot_password.py:22` | n/a | e2e-mock `frontend/e2e/flows/30-login-journey-c.spec.ts:496` | 9 |
| 13 | POST | `/auth/reset-password` | `auth.reset_password` | anonymous | `tests/test_api.py:4167` | n/a | — | 7 |
| 14 | GET | `/auth/verify-email` | `auth.verify_email` | anonymous | `tests/test_verify_email.py:37` | n/a | — | 4 |
| 15 | POST | `/auth/resend-verify` | `auth.resend_verify` | registered user | `tests/test_meh2901_resend_verify.py:59` | `tests/test_meh2901_resend_verify.py:106` | — | 9 |
| 16 | DELETE | `/auth/me` | `auth.delete_account` | registered user | `tests/test_account_deletion_cascade.py:40` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:49` | 12 |
| 17 | GET | `/cities` | `cities.list_cities` | anonymous | `tests/test_meh1343_cities_canonical_source.py:23` | n/a | e2e-mock `frontend/e2e/flows/38-register-delivery-axis.spec.ts:39` | 1 |
| 18 | GET | `/producers/me` | `producer_me.get_my_producer` | business/organizer | `tests/test_api.py:3904` | `tests/test_api.py:3913` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:193` | 3 |
| 19 | PUT | `/producers/me` | `producer_me.update_my_producer` | business/organizer | `tests/test_api.py:2973` | GAP | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:193` | 9 |
| 20 | POST | `/producers/me/availability-state` | `producer_me.set_availability_state` | business/organizer | `tests/test_api.py:3334` | `tests/test_expansion_availability.py:192` | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:65` | 5 |
| 21 | GET | `/producers/me/dashboard` | `producer_me.dashboard` | business/organizer | `tests/test_api.py:2658` | `tests/test_expansion_auth_jwt.py:56` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:165` | 3 |
| 22 | GET | `/producers/me/analytics` | `producer_me.producer_analytics` | business/organizer | `tests/test_analytics.py:449` | `tests/test_analytics.py:429` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:182` | 3 |
| 23 | POST | `/producers/me/verify-phone` | `producer_me.send_phone_otp` | business/organizer | `tests/test_meh2231_otp_test_numbers.py:102` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-draft-submit.spec.ts:123` | 12 |
| 24 | POST | `/producers/me/verify-phone/confirm` | `producer_me.confirm_phone_otp` | business/organizer | `tests/test_meh2231_otp_test_numbers.py:113` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-draft-submit.spec.ts:123` | 10 |
| 25 | POST | `/producers/me/kashrut-request` | `producer_me.request_kashrut_badge` | business/organizer | `tests/test_trust_ladder.py:214` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-trust-cards.spec.ts:103` | 7 |
| 26 | GET | `/producers/me/kashrut-requests` | `producer_me.list_kashrut_requests` | business/organizer | `tests/test_api.py:5147` | `tests/test_api.py:5183` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 3 |
| 27 | GET | `/producers/me/review-link` | `producer_me.get_review_invite_link` | business/organizer | `tests/test_reviews.py:931` | `tests/test_reviews.py:921` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:89` | 3 |
| 28 | POST | `/producers/me/request-review` | `producer_me.request_producer_review` | business/organizer | `tests/test_api.py:2231` | `tests/test_api.py:2256` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 7 |
| 29 | POST | `/producers/me/submit-for-review` | `producer_me.submit_for_review` | business/organizer | `tests/test_meh2100_draft_submit.py:196` | `tests/test_meh2100_draft_submit.py:399` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:309` | 7 |
| 30 | POST | `/producers/me/bio/generate` | `producer_me.generate_bio_endpoint` | business/organizer | `tests/test_api.py:2147` | `tests/test_api.py:2157` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:117` | 5 |
| 31 | GET | `/producers/me/products` | `producer_me.list_my_products` | business/organizer | `tests/test_product_image.py:39` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 5 |
| 32 | POST | `/producers/me/products` | `producer_me.create_my_product` | business/organizer | `tests/test_meh2662_product_ingredients_allergens.py:35` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 7 |
| 33 | PUT | `/producers/me/products/{product_id}` | `producer_me.update_my_product` | business/organizer | `tests/test_meh2662_product_ingredients_allergens.py:103` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 9 |
| 34 | DELETE | `/producers/me/products/{product_id}` | `producer_me.delete_my_product` | business/organizer | `tests/test_product_image.py:109` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 10 |
| 35 | GET | `/producers/me/locations` | `producer_me.list_my_locations` | business/organizer | `tests/test_producer_locations_crud.py:69` | `tests/test_producer_locations_crud.py:181` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 3 |
| 36 | POST | `/producers/me/locations` | `producer_me.create_my_location` | business/organizer | `tests/test_meh1938_ch5_strict_followup.py:64` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 9 |
| 37 | PUT | `/producers/me/locations/{location_id}` | `producer_me.update_my_location` | business/organizer | `tests/test_meh1938_ch5_strict_followup.py:221` | `tests/test_producer_locations_crud.py:150` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 9 |
| 38 | DELETE | `/producers/me/locations/{location_id}` | `producer_me.delete_my_location` | business/organizer | `tests/test_meh1938_ch5_strict_followup.py:151` | `tests/test_producer_locations_crud.py:165` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 10 |
| 39 | GET | `/producers/me/product-groups` | `product_organize.list_my_product_groups` | business/organizer | `tests/test_meh3055_product_organize.py:43` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 5 |
| 40 | PUT | `/producers/me/product-groups` | `product_organize.replace_my_product_groups` | business/organizer | `tests/test_meh3055_product_organize.py:50` | `tests/test_meh3055_product_organize.py:160` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 5 |
| 41 | PUT | `/producers/me/product-order` | `product_organize.set_my_product_order` | business/organizer | `tests/test_meh3055_product_organize.py:170` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 7 |
| 42 | PUT | `/producers/me/products/{product_id}/group` | `product_organize.set_my_product_group` | business/organizer | `tests/test_meh3055_product_organize.py:71` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 9 |
| 43 | POST | `/admin/producers/{producer_id}/claim-link` | `producer_claim.create_claim_link` | admin | `tests/test_meh2496_claim_link_sent_at.py:65` | `tests/test_meh2496_claim_link_sent_at.py:117` | — | 8 |
| 44 | POST | `/producer-claim/preview` | `producer_claim.preview_claim` | anonymous (token in request) | `tests/test_producer_claim.py:251` | n/a | — | 7 |
| 45 | POST | `/producer-claim` | `producer_claim.claim_producer` | registered user | `tests/test_producer_claim.py:304` | `tests/test_producer_claim.py:356` | — | 9 |
| 46 | POST | `/admin/producers/{producer_id}/products` | `producer_claim.admin_create_draft_product` | admin | `tests/test_admin_draft_products.py:57` | `tests/test_admin_draft_products.py:83` | — | 5 |
| 47 | DELETE | `/admin/producers/{producer_id}/products/{product_id}` | `producer_claim.admin_delete_draft_product` | admin | `tests/test_admin_draft_products.py:150` | `tests/test_admin_draft_products.py:181` | — | 6 |
| 48 | POST | `/admin/producers/{producer_id}/owner-invite` | `producer_owner_invite.create_owner_invite` | admin | GAP | GAP | — | 13 |
| 49 | POST | `/admin/producers/{producer_id}/owner-invite/resend` | `producer_owner_invite.resend_owner_invite` | admin | GAP | GAP | — | 13 |
| 50 | DELETE | `/admin/producers/{producer_id}/owner-invite` | `producer_owner_invite.cancel_owner_invite` | admin | GAP | GAP | — | 12 |
| 51 | POST | `/auth/owner-invite/email-code` | `producer_owner_invite.send_owner_invite_email_code` | anonymous | `tests/test_producer_owner_invite.py:147` | n/a | — | 9 |
| 52 | POST | `/auth/owner-invite/accept` | `producer_owner_invite.accept_owner_invite` | anonymous | `tests/test_producer_owner_invite.py:157` | n/a | — | 9 |
| 53 | GET | `/auth/owner-invite/{token}` | `producer_owner_invite.get_owner_invite` | anonymous (token in request) | `tests/test_producer_owner_invite.py:363` | n/a | — | 4 |
| 54 | GET | `/producers` | `producers.list_producers` | anonymous | `tests/test_account_deletion_cascade.py:132` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 55 | GET | `/producers/count` | `producers.producers_count` | anonymous | `tests/test_api.py:3617` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 56 | GET | `/producers/cities` | `producers.producers_cities` | anonymous | `tests/test_api.py:3642` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 57 | GET | `/producers/random` | `producers.random_producer` | anonymous | `tests/test_catalog_count_consistency.py:176` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 58 | GET | `/producers/by-slug/{slug}` | `producers.get_producer_by_slug` | anonymous | `tests/test_analytics.py:1155` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 59 | GET | `/producers/{producer_id}` | `producers.get_producer` | anonymous (optional auth) | `tests/test_analytics.py:1144` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 60 | POST | `/producers/{producer_id}/view` | `producers.record_producer_view` | anonymous (optional auth) | `tests/test_analytics.py:126` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 6 |
| 61 | POST | `/producers/{producer_id}/whatsapp-click` | `producers.record_whatsapp_click` | anonymous (optional auth) | `tests/test_analytics.py:236` | n/a | e2e-mock `frontend/e2e/flows/04-whatsapp-click.spec.ts:28` | 6 |
| 62 | POST | `/producers/{producer_id}/contact-click` | `producers.record_contact_click` | anonymous (optional auth) | `tests/test_analytics.py:386` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 6 |
| 63 | POST | `/producers/{producer_id}/delivery-waitlist` | `producers.join_delivery_waitlist` | anonymous (optional auth) | `tests/test_delivery_waitlist.py:36` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 6 |
| 64 | POST | `/delivery-waitlist/host-confirm` | `producers.confirm_delivery_waitlist_host` | anonymous (token in request) | `tests/test_delivery_waitlist.py:319` | n/a | — | 4 |
| 65 | POST | `/delivery-waitlist/unsubscribe` | `producers.unsubscribe_delivery_waitlist` | anonymous (token in request) | `tests/test_delivery_waitlist.py:237` | n/a | — | 4 |
| 66 | POST | `/producers` | `producers.create_producer` | registered user · verified email | `tests/test_api.py:1845` | `tests/test_api.py:1823` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 4 |
| 67 | GET | `/categories` | `producers.list_categories` | anonymous | `tests/test_meh1456_category_is_system.py:70` | n/a | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:27` | 1 |
| 68 | GET | `/producers/{producer_id}/kashrut-cert/{badge_code}` | `producers.get_kashrut_cert` | anonymous | `tests/test_meh1672_kashrut_cert_public.py:98` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 69 | GET | `/organizers` | `organizers.list_organizer_slugs` | anonymous | `tests/test_meh2952_is_test_exclusion.py:322` | n/a | — | 1 |
| 70 | GET | `/organizers/{slug}` | `organizers.get_organizer` | anonymous | `tests/test_meh2952_is_test_exclusion.py:325` | n/a | — | 1 |
| 71 | GET | `/users/me/favorites` | `favorites.get_favorites` | registered user | `tests/test_favorites_badge_parity.py:65` | `tests/test_meh997_e2e_journeys.py:652` | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 2 |
| 72 | POST | `/users/me/favorites/{producer_id}` | `favorites.add_favorite` | registered user | `tests/test_alerts_optin.py:12` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 6 |
| 73 | DELETE | `/users/me/favorites/{producer_id}` | `favorites.remove_favorite` | registered user | `tests/test_meh997_e2e_journeys.py:422` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 7 |
| 74 | GET | `/users/me/saved/ids` | `saved_items.get_saved_ids` | registered user | `tests/test_meh2557_saved_items_api.py:120` | `tests/test_meh2557_saved_items_api.py:95` | e2e-mock `frontend/e2e/flows/30-login-journey-c.spec.ts:235` | 2 |
| 75 | GET | `/users/me/saved` | `saved_items.get_saved` | registered user | `tests/test_meh2557_saved_items_api.py:110` | `tests/test_meh2557_saved_items_api.py:94` | — | 2 |
| 76 | POST | `/users/me/saved/{item_type}/{item_id}` | `saved_items.save_item` | registered user | `tests/test_meh2557_saved_items_api.py:107` | `tests/test_meh2557_saved_items_api.py:96` | — | 4 |
| 77 | DELETE | `/users/me/saved/{item_type}/{item_id}` | `saved_items.unsave_item` | registered user | `tests/test_meh2557_saved_items_api.py:255` | `tests/test_meh2557_saved_items_api.py:97` | — | 5 |
| 78 | GET | `/admin/producers` | `admin.list_producers` | admin | `tests/test_admin_queue_sla_aging.py:124` | `tests/test_meh2495_admin_draft_owner.py:206` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:204` | 3 |
| 79 | POST | `/admin/producers` | `admin.admin_create_producer` | admin | `tests/test_admin_producer_blank_names.py:15` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:204` | 7 |
| 80 | GET | `/admin/license-expiry-reminders` | `admin.license_expiry_reminders` | admin | `tests/test_license_expiry.py:223` | `tests/test_license_expiry.py:328` | — | 3 |
| 81 | PUT | `/admin/producers/{producer_id}` | `admin.admin_update_producer` | admin | `tests/test_admin_approval_transitions.py:528` | GAP | — | 7 |
| 82 | POST | `/admin/producers/{producer_id}/toggle-status` | `admin.toggle_producer_status` | admin | `tests/test_admin_approval_transitions.py:38` | `tests/test_expansion_admin_authz.py:29` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-recipes-kebab.spec.ts:201` | 7 |
| 83 | DELETE | `/admin/producers/{producer_id}` | `admin.admin_delete_producer` | admin | `tests/test_account_deletion_cascade.py:255` | `tests/test_expansion_admin_authz.py:30` (table row) | — | 6 |
| 84 | GET | `/admin/producers/pending` | `admin.pending_producers` | admin | `tests/test_admin_queue_sla_aging.py:226` | GAP | — | 5 |
| 85 | POST | `/admin/producers/{producer_id}/approve` | `admin.approve_producer` | admin | `tests/test_admin_approval_transitions.py:119` | `tests/test_expansion_admin_authz.py:77` | e2e-mock `frontend/e2e/flows/manual/admin-producers-decisions.spec.ts:210` | 9 |
| 86 | GET | `/admin/producers/rejection-presets` | `admin.list_rejection_presets` | admin | `tests/test_meh226_rejection_reason.py:303` | `tests/test_meh226_rejection_reason.py:332` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:202` | 6 |
| 87 | GET | `/admin/producers/{producer_id}` | `admin.admin_get_producer` | admin | `tests/test_license_expiry.py:364` | `tests/test_license_expiry.py:393` | — | 3 |
| 88 | POST | `/admin/producers/{producer_id}/reject` | `admin.reject_producer` | admin | `tests/test_admin_approval_transitions.py:396` | `tests/test_expansion_admin_authz.py:28` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-producers-decisions.spec.ts:216` | 9 |
| 89 | POST | `/admin/producers/{producer_id}/request-changes` | `admin.request_producer_changes` | admin | `tests/test_changes_requested_whatsapp.py:59` | `tests/test_producer_request_changes.py:105` | e2e-mock `frontend/e2e/flows/manual/admin-producers-decisions.spec.ts:217` | 9 |
| 90 | POST | `/admin/producers/{producer_id}/grant-verified` | `admin.grant_verified` | admin | `tests/test_meh_762_verification_stamping.py:34` | `tests/test_meh_762_verification_stamping.py:149` | — | 7 |
| 91 | POST | `/admin/producers/{producer_id}/revoke-verified` | `admin.revoke_verified` | admin | `tests/test_meh_762_verification_stamping.py:118` | `tests/test_meh_762_verification_stamping.py:159` | — | 7 |
| 92 | POST | `/admin/producers/{producer_id}/story-card` | `admin.upload_story_card` | admin | weak `tests/test_admin_error_no_leak.py:52` (only error-path calls) | GAP | — | 11 |
| 93 | GET | `/admin/stats` | `admin.get_stats` | admin | `tests/test_meh2952_is_test_exclusion.py:204` | GAP | — | 5 |
| 94 | POST | `/admin/seed-cities` | `admin.seed_cities` | admin | `tests/test_meh2241_admin_seed_cities.py:55` | GAP | — | 7 |
| 95 | GET | `/admin/users` | `admin_extra.list_users` | admin | `tests/test_api.py:314` | `tests/test_meh2900_admin_role_endpoint.py:155` | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:210` | 3 |
| 96 | PUT | `/admin/users/{user_id}/role` | `admin_extra.update_user_role` | admin | `tests/test_admin_role_orphan_source.py:107` | `tests/test_meh2900_admin_role_endpoint.py:115` | — | 13 |
| 97 | POST | `/admin/users/{user_id}/block` | `admin_extra.block_user` | admin | `tests/test_api.py:1968` | `tests/test_expansion_admin_authz.py:42` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:211` | 13 |
| 98 | DELETE | `/admin/users/{user_id}` | `admin_extra.admin_delete_user` | admin | `tests/test_meh2585_admin_delete_user.py:26` | `tests/test_meh2585_admin_delete_user.py:109` | — | 14 |
| 99 | GET | `/admin/users/{user_id}/favorites` | `admin_extra.user_favorites` | admin | GAP | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 9 |
| 100 | GET | `/admin/categories` | `admin_extra.list_categories_admin` | admin | `tests/test_api.py:1988` | GAP | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:27` | 5 |
| 101 | POST | `/admin/categories` | `admin_extra.create_category` | admin | `tests/test_api.py:1980` | GAP | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:27` | 7 |
| 102 | PUT | `/admin/categories/{category_id}` | `admin_extra.update_category` | admin | `tests/test_admin_category_rename_guard.py:76` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-producers-queue.spec.ts:166` | 7 |
| 103 | DELETE | `/admin/categories/{category_id}` | `admin_extra.delete_category` | admin | `tests/test_api.py:1998` | `tests/test_expansion_admin_authz.py:43` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-producers-queue.spec.ts:166` | 6 |
| 104 | GET | `/admin/pages/{slug}` | `admin_extra.get_static_page` | admin | `tests/test_api.py:2055` | GAP | — | 5 |
| 105 | PUT | `/admin/pages/{slug}` | `admin_extra.update_static_page` | admin | `tests/test_api.py:2058` | GAP | — | 7 |
| 106 | GET | `/admin/analytics` | `admin_extra.get_analytics` | admin | `tests/test_api.py:2046` | GAP | — | 5 |
| 107 | GET | `/admin/settings` | `admin_extra.get_settings` | admin | `tests/test_admin_settings_persistence.py:22` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:206` | 5 |
| 108 | PUT | `/admin/settings` | `admin_extra.update_settings` | admin | `tests/test_admin_settings_persistence.py:14` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:206` | 10 |
| 109 | GET | `/admin/settings/vacation` | `admin_extra.get_vacation_mode` | admin | `tests/test_meh_509_pr2a_vacation.py:27` | `tests/test_meh_509_pr2a_vacation.py:34` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:209` | 3 |
| 110 | POST | `/admin/settings/vacation` | `admin_extra.set_vacation_mode` | admin | `tests/test_meh_509_pr2a_vacation.py:50` | `tests/test_meh_509_pr2a_vacation.py:118` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:209` | 8 |
| 111 | GET | `/admin/producers/{producer_id}/risk-score` | `admin_extra.get_producer_risk_score` | admin | `tests/test_meh_509_pr3_risk_score.py:533` | `tests/test_meh_509_pr3_risk_score.py:570` | — | 3 |
| 112 | POST | `/admin/settings/test/{service}` | `admin_extra.test_service` | admin | weak `tests/test_meh2899_admin_service_test.py:90` (path literal) | GAP | — | 12 |
| 113 | GET | `/admin/dashboard` | `admin_extra.get_dashboard` | admin | `tests/test_analytics.py:820` | `tests/test_analytics.py:970` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:195` | 5 |
| 114 | POST | `/producers/{producer_id}/report` | `reports.report_producer` | registered user | `tests/test_integrity_constraints.py:41` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 8 |
| 115 | GET | `/admin/reports` | `reports.get_flagged_producers` | admin | `tests/test_report_lifecycle.py:31` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:207` | 5 |
| 116 | POST | `/admin/reports/{report_id}/resolve` | `reports.resolve_report` | admin | `tests/test_report_lifecycle.py:67` | `tests/test_report_lifecycle.py:107` | — | 5 |
| 117 | POST | `/admin/reports/{report_id}/dismiss` | `reports.dismiss_report` | admin | `tests/test_report_lifecycle.py:55` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:208` | 7 |
| 118 | POST | `/reports/producer-info` | `report_info.report_producer_info` | anonymous | `tests/test_email_logo.py:124` | n/a | — | 6 |
| 119 | POST | `/upload/image` | `upload.upload_image` | registered user | `tests/test_meh2551_upload_off_event_loop.py:48` | `tests/test_api.py:3089` | e2e-mock `frontend/e2e/flows/manual/dashboard-images-contact.spec.ts:93` | 4 |
| 120 | POST | `/upload/avatar` | `upload.upload_avatar` | registered user | `tests/test_avatar_upload.py:30` | `tests/test_api.py:2806` | — | 4 |
| 121 | POST | `/upload/owner-photo` | `upload.upload_owner_photo` | registered user | `tests/test_api.py:3244` | `tests/test_api.py:3269` | — | 4 |
| 122 | POST | `/upload/kashrut-cert` | `upload.upload_kashrut_cert` | registered user | `tests/test_api.py:5195` | `tests/test_api.py:5265` | e2e-mock `frontend/e2e/flows/manual/dashboard-trust-cards.spec.ts:104` | 4 |
| 123 | GET | `/stats` | `marketing.get_stats` | anonymous | `tests/test_api.py:5086` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:514` | 1 |
| 124 | POST | `/newsletter` | `marketing.subscribe_newsletter` | anonymous | `tests/test_meh2611_newsletter_resend_sync.py:38` | n/a | — | 6 |
| 125 | POST | `/newsletter/unsubscribe` | `marketing.unsubscribe_newsletter` | anonymous (token in request) | `tests/test_meh2611_newsletter_resend_sync.py:53` | n/a | — | 4 |
| 126 | POST | `/contact` | `marketing.submit_contact` | anonymous | `tests/test_api.py:2424` | n/a | — | 6 |
| 127 | GET | `/events` | `events.list_events` | anonymous (optional auth) | `tests/test_event_end_time.py:184` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 1 |
| 128 | GET | `/events/upcoming` | `events.upcoming_events` | anonymous | `tests/test_meh1161_event_producer_gate.py:118` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 1 |
| 129 | GET | `/events/mine` | `events.list_my_events` | business/organizer | `tests/test_events_mine.py:46` | `tests/test_events_mine.py:69` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 3 |
| 130 | GET | `/events/{event_id}` | `events.get_event` | anonymous (optional auth) | `tests/test_event_end_time.py:62` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 1 |
| 131 | POST | `/events` | `events.create_event` | business/organizer · verified email | `tests/test_event_end_time.py:52` | `tests/test_meh997_e2e_journeys.py:657` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 5 |
| 132 | PUT | `/events/{event_id}` | `events.update_event` | business/organizer | `tests/test_event_end_time.py:118` | GAP | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 9 |
| 133 | DELETE | `/events/{event_id}` | `events.delete_event` | registered user | `tests/test_events_cross_owner.py:99` | GAP | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 9 |
| 134 | POST | `/experiences/validate` | `experiences.validate_endpoint` | anonymous | `tests/test_experiences.py:334` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:131` | 4 |
| 135 | GET | `/experiences` | `experiences.list_experiences` | anonymous | `tests/test_experiences.py:489` | n/a | — | 1 |
| 136 | GET | `/experiences/count` | `experiences.count_experiences` | anonymous | `tests/test_experiences.py:372` | n/a | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:253` | 1 |
| 137 | GET | `/experiences/mine` | `experiences.list_my_experiences` | registered user | `tests/test_experiences.py:1060` | `tests/test_experiences.py:1065` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:115` | 2 |
| 138 | GET | `/experiences/{experience_id}` | `experiences.get_experience` | anonymous (optional auth) | `tests/test_experiences.py:692` | n/a | — | 1 |
| 139 | POST | `/experiences` | `experiences.submit_experience` | business/organizer · verified email | `tests/test_experiences.py:161` | `tests/test_experiences.py:138` | — | 7 |
| 140 | PUT | `/experiences/{experience_id}` | `experiences.update_experience` | registered user | `tests/test_experiences.py:933` | GAP | — | 8 |
| 141 | DELETE | `/experiences/{experience_id}` | `experiences.delete_experience` | registered user | `tests/test_experiences.py:1040` | GAP | — | 9 |
| 142 | GET | `/admin/experiences` | `admin_experiences.admin_list_experiences` | admin | `tests/test_experiences.py:824` | `tests/test_experiences.py:810` | — | 3 |
| 143 | POST | `/admin/experiences/{experience_id}/approve` | `admin_experiences.approve_experience` | admin | `tests/test_experiences.py:849` | `tests/test_expansion_admin_authz.py:37` (table row) | — | 9 |
| 144 | POST | `/admin/experiences/{experience_id}/request-changes` | `admin_experiences.request_changes` | admin | `tests/test_experiences.py:905` | GAP | — | 11 |
| 145 | POST | `/admin/experiences/{experience_id}/reject` | `admin_experiences.reject_experience` | admin | `tests/test_experiences.py:878` | `tests/test_expansion_admin_authz.py:38` (table row) | — | 9 |
| 146 | POST | `/events/{event_id}/registrations` | `registrations.register_for_event` | anonymous | `tests/test_meh2763_registrations.py:113` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 8 |
| 147 | POST | `/experiences/{experience_id}/registrations` | `registrations.register_for_experience` | anonymous | `tests/test_meh2763_registrations.py:227` | n/a | — | 8 |
| 148 | GET | `/events/{event_id}/registrations` | `registrations.list_event_registrations` | registered user | `tests/test_meh2763_registrations.py:306` | `tests/test_meh2763_registrations.py:326` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:13` | 2 |
| 149 | GET | `/experiences/{experience_id}/registrations` | `registrations.list_experience_registrations` | registered user | `tests/test_meh2763_registrations.py:334` | GAP | — | 4 |
| 150 | GET | `/registrations/{token}` | `registrations.get_registration` | anonymous (token in request) | `tests/test_meh2763_registrations.py:358` | n/a | — | 4 |
| 151 | POST | `/registrations/{token}/cancel` | `registrations.cancel_registration` | anonymous (token in request) | `tests/test_meh2763_registrations.py:362` | n/a | — | 11 |
| 152 | POST | `/producers/me/recipes` | `producer_recipes.create_my_recipe` | business/organizer · verified email | `tests/test_meh1000_recipe_admin_notification.py:178` | `tests/test_meh997_e2e_journeys.py:649` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 7 |
| 153 | GET | `/producers/me/recipes` | `producer_recipes.list_my_recipes` | business/organizer | `tests/test_meh997_e2e_journeys.py:182` | `tests/test_meh997_e2e_journeys.py:651` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 3 |
| 154 | GET | `/producers/me/recipes/{recipe_id}` | `producer_recipes.get_my_recipe` | business/organizer | weak `tests/test_meh997_e2e_journeys.py:723` (only error-path calls) | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 7 |
| 155 | PATCH | `/producers/me/recipes/{recipe_id}` | `producer_recipes.update_my_recipe` | business/organizer | `tests/test_indexnow.py:723` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 11 |
| 156 | DELETE | `/producers/me/recipes/{recipe_id}` | `producer_recipes.delete_my_recipe` | business/organizer | `tests/test_indexnow.py:756` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 10 |
| 157 | GET | `/producers/{slug}/recipes` | `producer_recipes.list_public_recipes` | anonymous | `tests/test_meh2952_is_test_exclusion.py:432` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 158 | GET | `/producers/{slug}/recipes/{recipe_id}` | `producer_recipes.get_public_recipe` | anonymous | `tests/test_producer_recipes.py:412` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 159 | GET | `/admin/recipes` | `admin_recipes.admin_list_recipes` | admin | `tests/test_meh997_e2e_journeys.py:190` | `tests/test_meh997_e2e_journeys.py:645` | e2e-mock `frontend/e2e/flows/manual/admin-recipes-kebab.spec.ts:166` | 3 |
| 160 | GET | `/admin/recipes/pending` | `admin_recipes.admin_list_pending_recipes` | admin | `tests/test_meh997_e2e_journeys.py:186` | `tests/test_meh997_e2e_journeys.py:646` | — | 3 |
| 161 | POST | `/admin/recipes/{recipe_id}/approve` | `admin_recipes.approve_recipe` | admin | `tests/test_indexnow.py:526` | `tests/test_expansion_admin_authz.py:39` (table row) | — | 9 |
| 162 | POST | `/admin/recipes/{recipe_id}/request-changes` | `admin_recipes.request_recipe_changes` | admin | `tests/test_indexnow.py:534` | GAP | — | 11 |
| 163 | POST | `/admin/recipes/{recipe_id}/reject` | `admin_recipes.reject_recipe` | admin | `tests/test_indexnow.py:534` | `tests/test_expansion_admin_authz.py:40` (table row) | — | 9 |
| 164 | GET | `/producers/{producer_id}/reviews` | `reviews.list_reviews_nested` | anonymous | `tests/test_api.py:2685` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 165 | GET | `/reviews` | `reviews.list_reviews` | anonymous | `tests/test_organizer_kind.py:437` | n/a | — | 1 |
| 166 | POST | `/producers/{producer_id}/reviews` | `reviews.create_review_nested` | registered user | `tests/test_api.py:2710` | `tests/test_api.py:2702` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 8 |
| 167 | DELETE | `/reviews/{review_id}` | `reviews.delete_review` | registered user | `tests/test_meh2348_review_hide_sticky.py:84` | GAP | — | 9 |
| 168 | PUT | `/reviews/{review_id}/reply` | `reviews.set_review_reply` | registered user | `tests/test_meh2381_review_edited_after_hidden.py:174` | GAP | — | 10 |
| 169 | PUT | `/admin/reviews/{review_id}/hide` | `reviews.hide_review` | admin | `tests/test_meh2381_review_edited_after_hidden.py:96` | `tests/test_reviews.py:508` | — | 7 |
| 170 | PUT | `/admin/reviews/{review_id}/unhide` | `reviews.unhide_review` | admin | `tests/test_meh2348_review_hide_sticky.py:92` | `tests/test_meh2348_review_hide_sticky.py:103` | — | 7 |
| 171 | GET | `/admin/reviews` | `reviews.admin_list_reviews` | admin | `tests/test_meh2349_review_ai_flag.py:109` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts:250` | 5 |
| 172 | GET | `/producers/{producer_id}/google-rating` | `google_rating.get_google_rating` | anonymous | `tests/test_google_rating.py:41` | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 1 |
| 173 | GET | `/admin/producers/{producer_id}/google-place-candidates` | `google_rating.get_google_place_candidates` | admin | `tests/test_google_rating.py:173` | `tests/test_google_rating.py:223` | — | 3 |
| 174 | PUT | `/admin/producers/{producer_id}/google-place-id` | `google_rating.put_google_place_id` | admin | `tests/test_meh2582_google_place_partial_put.py:19` | GAP | — | 7 |
| 175 | GET | `/search` | `search.smart_search` | anonymous | `tests/test_meh1176_like_escape.py:88` | n/a | e2e-mock `frontend/e2e/visual/badge-overflow-collision.spec.ts:88` | 1 |
| 176 | GET | `/search/trending` | `search.trending_searches` | anonymous | weak `tests/test_meh1979_public_rate_limits.py:46` (path literal) | n/a | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:524` | 3 |
| 177 | PATCH | `/users/me` | `users_me.update_profile` | registered user | `tests/test_api.py:2790` | GAP | — | 6 |
| 178 | PATCH | `/users/me/password` | `users_me.change_password` | registered user | `tests/test_auth.py:219` | `tests/test_auth.py:174` | — | 7 |
| 179 | GET | `/admin/outreach` | `admin_outreach.list_leads` | admin | `tests/test_business_suggestions.py:513` | `tests/test_outreach_prefill_edge_cases.py:586` | — | 3 |
| 180 | POST | `/admin/outreach` | `admin_outreach.create_lead` | admin | `tests/test_outreach_prefill_edge_cases.py:106` | `tests/test_outreach_prefill_edge_cases.py:588` | — | 5 |
| 181 | PATCH | `/admin/outreach/{lead_id}` | `admin_outreach.update_lead` | admin | `tests/test_outreach_prefill_edge_cases.py:560` | `tests/test_outreach_prefill_edge_cases.py:591` | — | 5 |
| 182 | DELETE | `/admin/outreach/{lead_id}` | `admin_outreach.delete_lead` | admin | `tests/test_outreach_prefill_edge_cases.py:570` | `tests/test_expansion_admin_authz.py:41` (table row) | — | 6 |
| 183 | POST | `/admin/outreach/{lead_id}/prefill-token` | `admin_outreach.mint_prefill_token` | admin | `tests/test_outreach_prefill_edge_cases.py:142` | `tests/test_outreach_prefill_edge_cases.py:594` | — | 8 |
| 184 | POST | `/admin/outreach/{lead_id}/thank-suggester` | `admin_outreach.thank_suggester` | admin | `tests/test_business_suggestions.py:673` | `tests/test_business_suggestions.py:760` | — | 7 |
| 185 | GET | `/admin/outreach/metrics/summary` | `admin_outreach.metrics_summary` | admin | `tests/test_business_suggestions.py:625` | `tests/test_outreach_prefill_edge_cases.py:587` | — | 3 |
| 186 | GET | `/register/producer/prefill/{token}` | `admin_outreach.get_prefill` | anonymous (token in request) | `tests/test_meh1724_prefill_rate_limit.py:64` | n/a | — | 4 |
| 187 | GET | `/admin/whatsapp/failed` | `admin_whatsapp.list_failed_outbound` | admin | `tests/test_meh_771_chunk_c_admin_whatsapp.py:63` | `tests/test_meh_771_chunk_c_admin_whatsapp.py:71` | — | 5 |
| 188 | POST | `/chat` | `chat.chat` | anonymous | weak `tests/test_meh3010_chat_global_cap.py:71` (only error-path calls) | n/a | — | 6 |
| 189 | POST | `/business-suggestions` | `business_suggestions.submit_business_suggestion` | anonymous (optional auth) | `tests/test_business_suggestions.py:58` | n/a | — | 6 |
| 190 | POST | `/category-requests` | `category_requests.submit_category_request` | anonymous (optional auth) | `tests/test_api.py:3674` | n/a | — | 6 |
| 191 | GET | `/admin/category-requests` | `category_requests.list_category_requests` | admin | `tests/test_api.py:3694` | `tests/test_api.py:3727` | — | 3 |
| 192 | PATCH | `/admin/category-requests/{request_id}` | `category_requests.review_category_request` | admin | `tests/test_api.py:3714` | `tests/test_api.py:3742` | — | 5 |
| 193 | POST | `/producers/me/name-change-requests` | `producer_name_requests.request_name_change` | registered user | `tests/test_producer_name_change_requests.py:32` | `tests/test_producer_name_change_requests.py:160` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 4 |
| 194 | GET | `/producers/me/name-change-requests` | `producer_name_requests.list_own_name_change_requests` | registered user | GAP | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:122` | 8 |
| 195 | GET | `/admin/name-change-requests` | `producer_name_requests.list_name_change_requests` | admin | weak `tests/test_producer_name_change_requests.py:194` (only refused calls) | `tests/test_producer_name_change_requests.py:197` | — | 5 |
| 196 | PATCH | `/admin/name-change-requests/{request_id}` | `producer_name_requests.review_name_change_request` | admin | `tests/test_producer_name_change_requests.py:61` | `tests/test_producer_name_change_requests.py:188` | — | 5 |
| 197 | GET | `/group-buys` | `group_buys.list_group_buys` | anonymous | `tests/test_group_buys_api.py:89` | n/a | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:269` | 1 |
| 198 | GET | `/group-buys/{group_buy_id}` | `group_buys.get_group_buy` | anonymous (optional auth) | `tests/test_group_buys_api.py:136` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:359` | 1 |
| 199 | POST | `/group-buys/{group_buy_id}/commit` | `group_buys.commit_to_group_buy` | registered user | `tests/test_group_buys_api.py:243` | `tests/test_group_buys_api.py:600` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:359` | 11 |
| 200 | DELETE | `/group-buys/{group_buy_id}/commit` | `group_buys.cancel_commit` | registered user | `tests/test_group_buys_api.py:249` | `tests/test_meh2943_group_buy_commit_scoping.py:225` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:359` | 10 |
| 201 | POST | `/group-buys` | `group_buys.create_group_buy` | business (organizer refused) · verified email | `tests/test_group_buys_api.py:319` | `tests/test_group_buys_api.py:327` | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:269` | 5 |
| 202 | PATCH | `/group-buys/{group_buy_id}/status` | `group_buys.update_group_buy_status` | registered user | `tests/test_group_buys_api.py:1405` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:359` | 10 |
| 203 | GET | `/admin/group-buys` | `group_buys.admin_list_group_buys` | admin | GAP | GAP | — | 9 |
| 204 | PATCH | `/admin/group-buys/{group_buy_id}/status` | `group_buys.admin_update_status` | admin | `tests/test_group_buys_api.py:1546` | GAP | — | 9 |
| 205 | GET | `/producers/me/group-buys` | `group_buys.list_my_group_buys` | business/organizer | `tests/test_group_buys_api.py:270` | `tests/test_group_buys_api.py:303` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:115` | 3 |
| 206 | GET | `/users/me/favorites/{producer_id}/alerts` | `alerts.get_alert_prefs` | registered user | `tests/test_alerts.py:62` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 4 |
| 207 | PUT | `/users/me/favorites/{producer_id}/alerts` | `alerts.upsert_alert_prefs` | registered user | `tests/test_alerts.py:102` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:62` | 6 |
| 208 | GET | `/admin/kashrut` | `admin_kashrut.list_kashrut_requests` | admin | `tests/test_trust_ladder.py:251` | `tests/test_trust_ladder.py:268` | — | 3 |
| 209 | POST | `/admin/kashrut/{request_id}/approve` | `admin_kashrut.approve_kashrut_request` | admin | `tests/test_meh2518_kashrut_real_expiry.py:45` | `tests/test_expansion_admin_authz.py:34` (table row) | — | 9 |
| 210 | POST | `/admin/kashrut/{request_id}/reject` | `admin_kashrut.reject_kashrut_request` | admin | `tests/test_meh2518_kashrut_real_expiry.py:229` | `tests/test_expansion_admin_authz.py:35` (table row) | — | 9 |
| 211 | POST | `/admin/kashrut/{request_id}/revoke` | `admin_kashrut.revoke_kashrut_badge` | admin | `tests/test_meh2518_kashrut_real_expiry.py:149` | `tests/test_expansion_admin_authz.py:36` (table row) | — | 7 |
| 212 | POST | `/admin/producers/{producer_id}/set-ambassador` | `admin_kashrut.set_ambassador` | admin | `tests/test_trust_ladder.py:327` | `tests/test_expansion_admin_authz.py:31` (table row) | — | 7 |
| 213 | POST | `/admin/kashrut/expiry-reminders` | `admin_kashrut.kashrut_expiry_reminders` | admin | `tests/test_meh1673_kashrut_expiry_reminders.py:70` | `tests/test_meh1673_kashrut_expiry_reminders.py:206` | — | 7 |
| 214 | GET | `/admin/checklist-items` | `admin_checklist.list_checklist_items` | admin | `tests/test_admin_checklist.py:215` | `tests/test_admin_checklist.py:629` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:201` | 3 |
| 215 | PUT | `/admin/checklist-items` | `admin_checklist.save_checklist_items` | admin | `tests/test_admin_checklist.py:61` | `tests/test_admin_checklist.py:614` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:201` | 5 |
| 216 | GET | `/admin/producers/{producer_id}/review-checks` | `admin_checklist.get_review_checks` | admin | `tests/test_admin_checklist.py:265` | `tests/test_admin_checklist.py:615` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:203` | 3 |
| 217 | PUT | `/admin/producers/{producer_id}/review-checks` | `admin_checklist.save_review_checks` | admin | `tests/test_admin_checklist.py:251` | `tests/test_admin_checklist.py:616` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:203` | 5 |
| 226 | GET | `/push-vapid-key` | `system.get_vapid_public_key` | anonymous | weak `tests/test_meh1979_public_rate_limits.py:67` (path literal) | n/a | — | 3 |
| 227 | GET | `/holiday-mode` | `holiday_mode.get_holiday_mode` | anonymous | `tests/test_holiday_mode.py:17` | n/a | — | 1 |
| 230 | POST | `/rescue/offers` | `rescue.create_offer` | business/organizer · flag: rescue, verified email | `tests/test_meh2679_rescue_utc_times.py:66` | `tests/test_rescue_pilot.py:96` | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:270` | 5 |
| 231 | GET | `/rescue/offers` | `rescue.list_offers` | anonymous · flag: rescue | `tests/test_meh2679_rescue_utc_times.py:61` | n/a | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:270` | 1 |
| 232 | POST | `/rescue/offers/{offer_id}/cancel` | `rescue.cancel_offer` | registered user · flag: rescue | `tests/test_meh2738_rescue_business_cancel.py:46` | `tests/test_meh2943_rescue_idor.py:527` | — | 8 |
| 233 | GET | `/rescue/orders/mine` | `rescue.list_my_reservations` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:49` | `tests/test_meh2680_rescue_my_orders.py:35` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:115` | 2 |
| 234 | POST | `/rescue/orders` | `rescue.create_order` | registered user · flag: rescue | `tests/test_meh2679_rescue_utc_times.py:77` | GAP | — | 11 |
| 235 | POST | `/rescue/orders/{order_id}/handed` | `rescue.mark_handed` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:65` | `tests/test_rescue.py:394` | — | 9 |
| 236 | POST | `/rescue/orders/{order_id}/no_show` | `rescue.mark_no_show` | registered user · flag: rescue | `tests/test_meh2943_rescue_idor.py:342` | `tests/test_meh2943_rescue_idor.py:325` | — | 9 |
| 237 | POST | `/rescue/orders/{order_id}/cancel` | `rescue.cancel_order` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:88` | `tests/test_meh2943_rescue_idor.py:178` | — | 11 |
| 238 | POST | `/rescue/orders/{order_id}/review` | `rescue.create_review` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:71` | `tests/test_meh2943_rescue_idor.py:425` | — | 9 |
| 239 | POST | `/admin/rescue/users/{user_id}/clear-block` | `rescue.clear_no_show_block` | admin · flag: rescue | `tests/test_rescue.py:719` | `tests/test_rescue.py:749` | — | 5 |
| 240 | GET | `/admin/rescue/metrics` | `rescue.pilot_metrics` | admin · flag: rescue | `tests/test_meh2703_rescue_donated.py:143` | `tests/test_rescue_pilot.py:317` | — | 3 |
| 241 | GET | `/producers/me/rescue/orders` | `rescue.list_my_orders` | business/organizer · flag: rescue | `tests/test_meh2679_rescue_utc_times.py:84` | `tests/test_rescue_pilot.py:250` | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 3 |
| 242 | GET | `/producers/me/rescue/offers` | `rescue.list_my_offers` | business/organizer · flag: rescue | `tests/test_meh2703_rescue_donated.py:43` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 5 |
| 243 | PUT | `/producers/me/rescue/offers/{offer_id}/donated` | `rescue.set_donated` | business/organizer · flag: rescue | `tests/test_meh2703_rescue_donated.py:82` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 9 |
| 244 | GET | `/producers/me/rescue/typical-items` | `rescue.get_typical_items` | business/organizer · flag: rescue | `tests/test_meh2752_rescue_allergens.py:78` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 5 |
| 245 | PUT | `/producers/me/rescue/typical-items` | `rescue.set_typical_items` | business/organizer · flag: rescue | `tests/test_meh2752_rescue_allergens.py:68` | GAP | e2e-mock `frontend/e2e/flows/manual/home.spec.ts:502` | 7 |

### Internal routes (allowlisted — not actor actions)

| # | Method | Path | Handler | Reason | Test |
|---|---|---|---|---|---|
| 218 | GET | `/health/places` | `health.places_health` | Google Places key probe for a cron / uptime monitor (MEH-2482) | `tests/test_meh2482_health_places.py:33` |
| 219 | HEAD | `/health/liveness` | `health.liveness` | Railway liveness probe — no actor action | `tests/test_health.py:16` |
| 220 | GET | `/health/liveness` | `health.liveness` | Railway liveness probe — no actor action | `tests/test_health.py:10` |
| 221 | HEAD | `/health/readiness` | `health.readiness` | Railway readiness probe — no actor action | weak `tests/test_health.py:25` (path literal) |
| 222 | GET | `/health/readiness` | `health.readiness` | Railway readiness probe — no actor action | `tests/test_health.py:25` |
| 223 | HEAD | `/health` | `health.health_alias` | uptime / Railway probe alias — no actor action | weak `tests/test_health.py:74` (path literal) |
| 224 | GET | `/health` | `health.health_alias` | uptime / Railway probe alias — no actor action | `tests/test_health.py:74` |
| 225 | GET | `/` | `system.root` | service banner (system.root) — no actor action | GAP |
| 228 | GET | `/webhook/whatsapp` | `whatsapp_webhook.webhook_challenge` | Meta webhook — the caller is Meta, HMAC-verified in the handler, not a user | `tests/test_meh_509_pr2c_webhook.py:170` |
| 229 | POST | `/webhook/whatsapp` | `whatsapp_webhook.webhook_receive` | Meta webhook — the caller is Meta, HMAC-verified in the handler, not a user | `tests/test_meh_509_pr2c_webhook.py:247` |
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
| `vacation_mode` | page | live | — | n/a | `frontend/__tests__/ProducerHeaderAlertsReentry.test.jsx:100` | n/a | covered |
| `map_precision` | page | live | — | n/a | `frontend/__tests__/producerPoints.test.js:2` | n/a | covered |
| `multi_locations` | page | live | — | n/a | `frontend/__tests__/LocationFormDisclosure.test.jsx:25` | n/a | covered |
| `draft_claim` | page | live | — | `tests/test_meh2496_claim_link_sent_at.py:65` (5/5 routes in file) | `frontend/__tests__/AdminClaimLink.test.jsx:18` | n/a | covered |
| `ai_writer` | page | live | — | `tests/test_api.py:2138` (imports module) | n/a | n/a | covered |
| `guides` | page | live | — | n/a | `frontend/__tests__/TitlesGuidesCopy.test.jsx:45` | GAP | covered |
| `social_signup` | page | live | — | `tests/test_api.py:4272` (16/16 routes in file) | `frontend/__tests__/AuthPagesAuthedRedirect.test.jsx:4` | n/a | covered |
| `wa_approval` | page | live | — | `tests/test_expansion_whatsapp.py:24` (imports module) | n/a | n/a | covered |
| `onboarding_emails` | page | live | — | `tests/test_meh1965_email_copy_contract.py:81` (imports module) | n/a | n/a | covered |
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
| `events` | return | live | `/producer/dashboard/events` | n/a | `frontend/__tests__/EventsCategoryChipContrast.test.jsx:3` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:287` | covered |
| `experiences` | return | live | `/producer/dashboard/experiences` | n/a | `frontend/__tests__/HubMetadataNoindex.test.js:28` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:245` | covered |
| `recipes` | return | live | `/producer/dashboard/recipes` | weak `tests/test_meh1000_recipe_admin_notification.py:178` (6/7 routes in file) | `frontend/__tests__/RecipeResolverErrorSeparation.test.jsx:42` | GAP | weak (capped by its router) |
| `follower_updates` | return | live | `/producer/dashboard/insights` | n/a | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:613` | covered |
| `waitlist` | return | live | — | `tests/test_delivery_waitlist.py:21` (imports module) | `frontend/__tests__/DeliveryWaitlistForm.test.jsx:70` | n/a | covered |
| `rescue_bags` | return | live | `/producer/dashboard/rescue` | n/a | `frontend/__tests__/RescueBuyerFlow.test.jsx:153` | GAP | covered |
| `verified_badge` | trust | live | — | n/a | `frontend/__tests__/AdminProducersTableTags.test.jsx:22` | n/a | covered |
| `kashrut_verified` | trust | live | — | n/a | `frontend/__tests__/AdminKashrutPage.test.jsx:5` | GAP | covered |
| `editor_pick` | trust | live | — | n/a | `frontend/__tests__/featuredProducer.test.js:2` | n/a | covered |
| `reservist_diet_tags` | trust | live | — | n/a | `frontend/__tests__/ReservistBadgeLine.test.jsx:18` | n/a | covered |
| `reviews_contacted` | trust | live | — | `tests/test_api.py:2685` (8/8 routes in file) | `frontend/__tests__/ReviewsSection.test.jsx:3` | n/a | covered |
| `review_request` | trust | live | — | n/a | `frontend/__tests__/RequestReviewCard.test.jsx:18` | n/a | covered |
| `views` | insights | live | — | `tests/test_api.py:3904` (21/21 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:613` | covered |
| `search_impressions` | insights | live | — | `tests/test_api.py:3904` (21/21 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:613` | covered |
| `contact_clicks` | insights | live | — | `tests/test_api.py:3904` (21/21 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:613` | covered |
| `favorites_rating` | insights | live | — | `tests/test_api.py:3904` (21/21 routes in file) | n/a | n/a | covered |
| `top_cities` | insights | live | — | `tests/test_api.py:3904` (21/21 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:613` | covered |
| `demand_cities` | insights | live | — | n/a | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:613` | covered |
| `drop_point_hosts` | insights | live | — | `tests/test_delivery_waitlist.py:21` (imports module) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:613` | covered |
| `email_alerts` | insights | live | — | `tests/test_meh1613_email_failure_visibility.py:31` (imports module) | n/a | n/a | covered |
| `completeness` | insights | live | — | n/a | `frontend/__tests__/CompletenessFieldsMessages.test.jsx:12` | n/a | covered |

## Pages (`frontend/app/[locale]/**/page.*`)

### Public

| Route | E2E (`goto`) | Unit (import) | Verdict |
|---|---|---|---|
| `/[slug]` | `frontend/e2e/flows/00-producer-fixture-probe-origin.spec.ts:93` | `frontend/__tests__/ProducerGonePage.test.jsx:59` | covered |
| `/[slug]/recipes/[recipe_id]` | GAP | `frontend/__tests__/RecipeResolverErrorSeparation.test.jsx:42` | covered |
| `/about/badges` | GAP | `frontend/__tests__/title-pattern.test.js:139` | covered |
| `/about/for-businesses/guides/business-story` | `frontend/e2e/flows/manual/hebrew-typography.spec.ts:95` | `frontend/__tests__/title-pattern.test.js:180` | covered |
| `/about/for-businesses/guides/customer-messages` | GAP | `frontend/__tests__/title-pattern.test.js:181` | covered |
| `/about/for-businesses/guides` | GAP | `frontend/__tests__/TitlesGuidesCopy.test.jsx:45` | covered |
| `/about/for-businesses/guides/product-photography` | GAP | `frontend/__tests__/title-pattern.test.js:182` | covered |
| `/about/for-businesses` | `frontend/e2e/flows/manual/join.spec.ts:234` | `frontend/__tests__/BusinessFaqClosedOnLoad.test.jsx:36` | covered |
| `/about` | `frontend/e2e/flows/13-static-pages-render.spec.ts:8` | `frontend/__tests__/title-pattern.test.js:135` | covered |
| `/about/process` | `frontend/e2e/flows/manual/hebrew-typography.spec.ts:53` | `frontend/__tests__/title-pattern.test.js:136` | covered |
| `/about/why-local` | GAP | `frontend/__tests__/EditorialPagePhotos.test.jsx:40` | covered |
| `/accessibility` | GAP | `frontend/__tests__/title-pattern.test.js:161` | covered |
| `/business-gone` | GAP | `frontend/__tests__/ProducerGonePage.test.jsx:202` | covered |
| `/claim/[token]` | GAP | GAP | GAP |
| `/claim` | GAP | `frontend/__tests__/title-pattern.test.js:172` | covered |
| `/contact` | GAP | `frontend/__tests__/title-pattern.test.js:162` | covered |
| `/delivery-waitlist/host-confirm` | GAP | `frontend/__tests__/title-pattern.test.js:177` | covered |
| `/delivery-waitlist/unsubscribe` | GAP | `frontend/__tests__/title-pattern.test.js:176` | covered |
| `/dev/components` | GAP | GAP | GAP |
| `/events/[id]` | GAP | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:68` | covered |
| `/events` | `frontend/e2e/flows/08-calendar-view.spec.ts:35` | `frontend/__tests__/HubMetadataNoindex.test.js:27` | covered |
| `/experiences/[id]` | weak `frontend/e2e/flows/manual/auth.spec.ts:540` (only a guest-redirect check) | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:69` | covered |
| `/experiences` | GAP | `frontend/__tests__/HubMetadataNoindex.test.js:28` | covered |
| `/favorites` | `frontend/e2e/flows/08-calendar-view.spec.ts:92` | `frontend/__tests__/title-pattern.test.js:169` | covered |
| `/forgot-password` | `frontend/e2e/flows/30-login-journey-c.spec.ts:516` | `frontend/__tests__/title-pattern.test.js:166` | covered |
| `/group-buys/[id]` | GAP | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:70` | covered |
| `/group-buys` | GAP | `frontend/__tests__/HubMetadataNoindex.test.js:29` | covered |
| `/join` | `frontend/e2e/flows/manual/join.spec.ts:127` | `frontend/__tests__/EditorialPagePhotos.test.jsx:38` | covered |
| `/login` | `frontend/e2e/flows/09-login-console-clean.spec.ts:22` | `frontend/__tests__/title-pattern.test.js:163` | covered |
| `/map` | `frontend/e2e/flows/05-map-navigation.spec.ts:22` | `frontend/__tests__/title-pattern.test.js:134` | covered |
| `/messages` | GAP | `frontend/__tests__/title-pattern.test.js:173` | covered |
| `/newsletter/unsubscribe` | GAP | `frontend/__tests__/title-pattern.test.js:175` | covered |
| `/organizers/[slug]` | GAP | `frontend/__tests__/OrganizerPage.test.jsx:47` | covered |
| `/owner-invite/[token]` | `frontend/e2e/flows/46-owner-invite.spec.ts:292` | GAP | covered |
| `/owner-invite` | GAP | GAP | GAP |
| `/p/[slug]` | GAP | `frontend/__tests__/VanityRedirectKeepsQuery.test.js:16` | covered |
| `/` | `frontend/e2e/flows/01-home-load.spec.ts:5` | GAP | covered |
| `/privacy` | GAP | `frontend/__tests__/title-pattern.test.js:160` | covered |
| `/producer/[id]` | `frontend/e2e/flows/12-axe-a11y.spec.ts:110` | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:71` | covered |
| `/producers/[category]/[region]` | GAP | `frontend/__tests__/RegionLandingPage.test.jsx:60` | covered |
| `/producers/diet/[dietSlug]` | GAP | `frontend/__tests__/DietLandingPage.test.jsx:88` | covered |
| `/producers` | `frontend/e2e/flows/03-view-producer-detail.spec.ts:46` | `frontend/__tests__/title-pattern.test.js:145` | covered |
| `/recommend` | `frontend/e2e/flows/manual/share.spec.ts:93` | `frontend/__tests__/RecommendNoindex.test.js:25` | covered |
| `/register/organizer` | GAP | `frontend/__tests__/RegisterOrganizerMeta.test.js:18` | covered |
| `/register` | `frontend/e2e/flows/09-login-console-clean.spec.ts:140` | `frontend/__tests__/title-pattern.test.js:164` | covered |
| `/register/producer` | `frontend/e2e/flows/10-producer-oauth-409.spec.ts:52` | `frontend/__tests__/RegisterProducerShareMeta.test.js:18` | covered |
| `/registration/[token]` | GAP | `frontend/__tests__/title-pattern.test.js:178` | covered |
| `/rescue` | GAP | `frontend/__tests__/title-pattern.test.js:174` | covered |
| `/reset-password` | `frontend/e2e/flows/11-password-policy.spec.ts:144` | `frontend/__tests__/title-pattern.test.js:167` | covered |
| `/settings` | `frontend/e2e/flows/11-password-policy.spec.ts:202` | `frontend/__tests__/MobileNoOuterCard.test.jsx:34` | covered |
| `/terms` | GAP | `frontend/__tests__/title-pattern.test.js:141` | covered |
| `/verify-email` | GAP | `frontend/__tests__/title-pattern.test.js:168` | covered |

### Dashboard

| Route | E2E (`goto`) | Unit (import) | Verdict |
|---|---|---|---|
| `/producer/dashboard/edit` | `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:175` | `frontend/__tests__/BadgeRequestLine.test.jsx:7` | covered |
| `/producer/dashboard/events/[id]/edit` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:287` | GAP | covered |
| `/producer/dashboard/events/new` | GAP | `frontend/__tests__/EventExperienceAddress.test.jsx:76` | covered |
| `/producer/dashboard/events` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:163` | `frontend/__tests__/ManageEventsPage.test.jsx:48` | covered |
| `/producer/dashboard/experiences/[id]/edit` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:294` | GAP | covered |
| `/producer/dashboard/experiences/new` | GAP | `frontend/__tests__/EventExperienceAddress.test.jsx:121` | covered |
| `/producer/dashboard/experiences` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:245` | `frontend/__tests__/ExperienceSpotsLeft.test.jsx:30` | covered |
| `/producer/dashboard/followers` | GAP | `frontend/__tests__/DashboardInsightsFollowersShare.test.jsx:104` | covered |
| `/producer/dashboard/group-buys` | `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:360` | `frontend/__tests__/DashboardEmptyStateFormExclusive.test.jsx:64` | covered |
| `/producer/dashboard/insights` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:613` | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | covered |
| `/producer/dashboard` | `frontend/e2e/flows/22-register-personas.spec.ts:232` | `frontend/__tests__/Dashboard1025Banner.test.jsx:14` | covered |
| `/producer/dashboard/preview` | GAP | GAP | GAP |
| `/producer/dashboard/qr-card` | GAP | GAP | GAP |
| `/producer/dashboard/recipes/[id]/edit` | GAP | GAP | GAP |
| `/producer/dashboard/recipes` | GAP | `frontend/__tests__/DashboardEmptyStateFormExclusive.test.jsx:65` | covered |
| `/producer/dashboard/rescue/counter-card` | GAP | `frontend/__tests__/RescueCounterCardLink.test.jsx:19` | covered |
| `/producer/dashboard/rescue` | GAP | `frontend/__tests__/RescueCounterCardLink.test.jsx:18` | covered |
| `/producer/dashboard/tools` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:149` | `frontend/__tests__/DashboardSharePlacement.test.jsx:13` | covered |

### Admin

| Route | E2E (`goto`) | Unit (import) | Verdict |
|---|---|---|---|
| `/admin/analytics` | GAP | `frontend/__tests__/AdminNullGuards.test.jsx:141` | covered |
| `/admin/category-requests` | GAP | GAP | GAP |
| `/admin/content` | `frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts:758` | `frontend/__tests__/AdminContentCategoryDelete.test.jsx:3` | covered |
| `/admin/experiences` | GAP | `frontend/__tests__/AdminExperiencesPage.test.jsx:5` | covered |
| `/admin/group-buys` | GAP | `frontend/__tests__/AdminGroupBuysTransitions.test.jsx:13` | covered |
| `/admin/help` | GAP | `frontend/__tests__/AdminHelp.test.jsx:7` | covered |
| `/admin/kashrut` | GAP | `frontend/__tests__/AdminKashrutPage.test.jsx:5` | covered |
| `/admin/name-change-requests` | GAP | GAP | GAP |
| `/admin/outreach` | `frontend/e2e/flows/37-outreach-prefill.spec.ts:327` | `frontend/__tests__/AdminOutreach.test.jsx:3` | covered |
| `/admin` | `frontend/e2e/flows/25-role-reachability.spec.ts:121` | `frontend/__tests__/AdminDashboardStats.test.jsx:3` | covered |
| `/admin/producers/[id]/edit` | `frontend/e2e/flows/46-owner-invite.spec.ts:227` | `frontend/__tests__/AdminClaimLink.test.jsx:19` | covered |
| `/admin/producers/new` | `frontend/e2e/flows/manual/admin-producer-form-licence.spec.ts:420` | GAP | covered |
| `/admin/producers` | `frontend/e2e/flows/33-admin-producers-tab.spec.ts:94` | `frontend/__tests__/AdminApproveWithoutLicense.test.jsx:3` | covered |
| `/admin/recipes` | `frontend/e2e/flows/20-admin-recipes-queue.spec.ts:58` | GAP | covered |
| `/admin/reports` | `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:518` | `frontend/__tests__/AdminReportsPage.test.jsx:3` | covered |
| `/admin/reviews` | `frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts:670` | `frontend/__tests__/AdminReviewDelete.test.jsx:3` | covered |
| `/admin/settings` | `frontend/e2e/flows/30-admin-panel-tabs.spec.ts:153` | GAP | covered |
| `/admin/users` | `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:549` | `frontend/__tests__/AdminUsersDeleteAction.test.jsx:3` | covered |
| `/admin/whatsapp-failures` | GAP | `frontend/__tests__/AdminWhatsappFailuresStuck.test.jsx:12` | covered |

## State machines (`docs/audits/2026-11-implicit-state-machines.md`)

A site `file:line` is mapped to the route whose handler contains it (or reaches it within six helper hops in the same module); the row takes the WORST verdict of the routes it reaches. The audit's line numbers are as of 09/11 — where a file moved since, the row says so (see `ModuleMap.routes_for`).

| § | Transition / write | Site | Routes reached | Verdict | Note |
|---|---|---|---|---|---|
| 1 | ∅ → `draft` | auth.py:571, auth.py:781, producer_queries.py:662, admin.py:657 | `POST /auth/register/producer`, `POST /admin/producers` | `tests/test_admin_delete_producer.py:46` | — |
| 1 | `draft` → `pending` | producer_me.py:1942 | `POST /producers/me/request-review`, `POST /producers/me/submit-for-review` | `tests/test_api.py:2231` | — |
| 1 | `rejected` → `pending` | producer_me.py:1856 | `POST /producers/me/request-review` | `tests/test_api.py:2231` | nearest write handler — audit line may have drifted |
| 1 | `pending`/`rejected` → `approved` | admin.py:199 | `POST /admin/producers/{producer_id}/approve` | `tests/test_admin_approval_transitions.py:119` | — |
| 1 | `pending`/`approved` → `rejected` | admin.py:1457 | `GET /admin/producers/{producer_id}` | `tests/test_license_expiry.py:364` | — |
| 1 | `approved` ⇄ `inactive` | admin.py:1056 | `PUT /admin/producers/{producer_id}` | `tests/test_admin_approval_transitions.py:528` | — |
| 1 | `pending` → `pending` + feedback | — | `POST /admin/producers/{producer_id}/request-changes` | `tests/test_changes_requested_whatsapp.py:59` | — |
| 1 | any → any via admin PUT | admin.py:916 | `PUT /admin/producers/{producer_id}` | `tests/test_admin_approval_transitions.py:528` | — |
| 2 | ∅ → `open` | group_buys.py:396 | `POST /group-buys` | `tests/test_group_buys_api.py:319` | — |
| 2 | `open` → `funded` | group_buys.py:295 | `POST /group-buys/{group_buy_id}/commit` | `tests/test_group_buys_api.py:243` | — |
| 2 | `funded` → `open` | group_buys.py:340 | `DELETE /group-buys/{group_buy_id}/commit` | `tests/test_group_buys_api.py:249` | — |
| 2 | `funded` → `open` | group_buy_delist.py:102 | — | GAP | — |
| 2 | `open`/`funded` → `cancelled`, `funded` → `fulfilled` | group_buys.py:516 | `PATCH /group-buys/{group_buy_id}/status` | `tests/test_group_buys_api.py:1405` | — |
| 2 | `open`/`funded` → `cancelled` | group_buy_delist.py:61 | — | GAP | — |
| 2 | **any → any** | group_buys.py:563 | `PATCH /group-buys/{group_buy_id}/status` | `tests/test_group_buys_api.py:1405` | — |
| 3 | ∅ → `active` (offer) | rescue.py:422 | `POST /rescue/offers` | `tests/test_meh2679_rescue_utc_times.py:66` | — |
| 3 | `active` → `cancelled` (offer) | rescue.py:573 | `POST /rescue/offers/{offer_id}/cancel` | `tests/test_meh2738_rescue_business_cancel.py:46` | — |
| 3 | ∅ → `reserved` (order) | rescue.py:285 | `POST /rescue/orders` | `tests/test_meh2679_rescue_utc_times.py:77` | — |
| 3 | `reserved` → `handed` | rescue.py:901 | `POST /rescue/orders/{order_id}/handed` | `tests/test_meh2680_rescue_my_orders.py:65` | — |
| 3 | `reserved` → `no_show` | rescue.py:939 | `POST /rescue/orders/{order_id}/handed` | `tests/test_meh2680_rescue_my_orders.py:65` | — |
| 3 | `reserved` → `cancelled` (buyer) | rescue.py:989 | `POST /rescue/orders/{order_id}/no_show` | `tests/test_meh2943_rescue_idor.py:342` | — |
| 3 | `reserved` → `cancelled` (bulk, offer pulled) | rescue.py:581 | `POST /rescue/offers/{offer_id}/cancel` | `tests/test_meh2738_rescue_business_cancel.py:46` | — |
| 4 | ∅ → `(pending, verdict, true)` | experiences.py:459 | `POST /experiences` | `tests/test_experiences.py:161` | — |
| 4 | content edit on `approved`/`rejected`/`changes_requested` → `(pending, fresh verdict, is_active unchanged)` | experiences.py:588, experiences.py:622 | `PUT /experiences/{experience_id}` | `tests/test_experiences.py:933` | — |
| 4 | `is_active` flip only | experiences.py:560, experiences.py:567 | `PUT /experiences/{experience_id}` | `tests/test_experiences.py:933` | — |
| 4 | → `approved` | admin_experiences.py:88 | `POST /admin/experiences/{experience_id}/approve` | `tests/test_experiences.py:849` | — |
| 4 | → `changes_requested` | admin_experiences.py:128 | `POST /admin/experiences/{experience_id}/request-changes` | `tests/test_experiences.py:905` | — |
| 4 | → `rejected` | admin_experiences.py:164 | `POST /admin/experiences/{experience_id}/reject` | `tests/test_experiences.py:878` | — |
| 5 | `(pending, published=False)` | producer_recipes.py:157 | `POST /producers/me/recipes` | `tests/test_meh1000_recipe_admin_notification.py:178` | — |
| 5 | `(pending, published=False)` — content edit unpublishes | producer_recipes.py:295 | `PATCH /producers/me/recipes/{recipe_id}` | `tests/test_indexnow.py:723` | — |
| 5 | `(approved, published=True)` | admin_recipes.py:138 | `POST /admin/recipes/{recipe_id}/approve` | `tests/test_indexnow.py:526` | — |
| 5 | `(needs_revision, published=False)` | admin_recipes.py:219 | `POST /admin/recipes/{recipe_id}/request-changes` | `tests/test_indexnow.py:534` | — |
| 5 | `(rejected, published=False)` | admin_recipes.py:254 | `POST /admin/recipes/{recipe_id}/reject` | `tests/test_indexnow.py:534` | — |
| 6 | create / upsert-edit | reviews.py:538 | `POST /producers/{producer_id}/reviews` | `tests/test_api.py:2710` | — |
| 6 | edit via race branch | reviews.py:577 | `DELETE /reviews/{review_id}` | `tests/test_meh2348_review_hide_sticky.py:84` | a DELETE handler for a non-delete transition — audit line may be off |
| 6 | hide | reviews.py:708 | `PUT /admin/reviews/{review_id}/hide` | `tests/test_meh2381_review_edited_after_hidden.py:96` | — |
| 6 | unhide | reviews.py:731 | `PUT /admin/reviews/{review_id}/hide` | `tests/test_meh2381_review_edited_after_hidden.py:96` | — |
| 6 | delete (owner/admin) | reviews.py:581 | `DELETE /reviews/{review_id}` | `tests/test_meh2348_review_hide_sticky.py:84` | — |
| 6 | user account deletion (DB cascade) | user_deletion.py:112 | — | GAP | — |
| 7 | §7 — whole section | whatsapp_webhook.py:588 | `POST /webhook/whatsapp` | `tests/test_meh_509_pr2c_webhook.py:247` | — |
| 8 | §8 — whole section | home_products.py:177, router_registry.py:100, router_registry.py:66, home_products.py:228 … | — | n/a (home_products.py is not mounted) | — |
| 9 | `registrations.status` | registrations.py:375, registrations.py:377, registrations.py:383, registrations.py:226 … | `POST /registrations/{token}/cancel`, `POST /experiences/{experience_id}/registrations`, `PUT /experiences/{experience_id}` | `tests/test_meh2763_registrations.py:362` | nearest function — audit line may have drifted; nearest write handler — audit line may have drifted |
| 9 | `events` | — | — | GAP | — |
| 9 | `users` | admin_extra.py:185, auth.py:627, auth.py:830, producer_claim.py:249 | `PUT /admin/users/{user_id}/role`, `POST /auth/register/producer`, `POST /producer-claim` | `tests/test_admin_role_orphan_source.py:107` | — |
| 9 | not covered by the audit (time box) | admin_kashrut.py:210 | `POST /admin/kashrut/{request_id}/revoke` | `tests/test_meh2518_kashrut_real_expiry.py:149` | — |

## Mandatory extra rows (§B.3)

A row is covered when one test function calls the listed route(s) and matches the row's condition (status in the call window, a word in the test). `weak` = only a grep hit, no route call.

| Kind | Row | Evidence | Note | Score |
|---|---|---|---|---|
| negative | wrong phone OTP code is refused | `tests/test_meh1176_otp_confirm_rate_limit.py:35` | — | 10 |
| negative | expired phone OTP code is refused | `tests/test_trust_ladder.py:182` | — | 10 |
| negative | expired password-reset token is refused | `tests/test_api.py:4193` | — | 9 |
| negative | expired email-verify token is refused | `tests/test_verify_email.py:54` | — | 6 |
| negative | double submit-for-review | `tests/test_meh2899_double_submit.py:181` | — | 9 |
| negative | double join (commit) on a group buy | `tests/test_group_buys_api.py:645` | — | 13 |
| negative | double reserve of a rescue bag | `tests/test_rescue.py:335` | — | 11 |
| negative | cancel a rescue reservation midway | `tests/test_meh2680_rescue_my_orders.py:79` (via helper _reserve) | — | 11 |
| negative | cancel an event/experience registration midway | `tests/test_meh2763_registrations.py:355` | — | 10 |
| negative | a rejected business acting (business mutation → 403/409) | GAP | — | 11 |
| negative | rate limit 429 on login | GAP | — | 13 |
| negative | rate limit 429 on phone OTP | `tests/test_meh1176_otp_confirm_rate_limit.py:35` | — | 12 |
| time | rescue: handover / no-show before the pickup window closed | `tests/test_rescue.py:401` | real clock | 11 |
| time | rescue: reserve inside the window, up to the cutoff | `tests/test_rescue.py:226` | real clock | 11 |
| time | rescue: reserve / list after the window or cutoff | `tests/test_rescue.py:562` | real clock | 3 |
| time | group buy: commit after the deadline passed | `tests/test_group_buys_api.py:628` | real clock | 13 |
| time | ended event / experience: registration refused | `tests/test_meh2763_registrations.py:178` | real clock | 10 |
| time | Friday / holiday mode | `tests/test_holiday_mode.py:17` | real clock | 5 |
| time | special hours on a date (clock frozen) | `tests/test_meh2264_special_hours_b.py:91` | clock frozen | 3 |
| time | the 24 h WhatsApp customer-service window | weak `tests/test_meh2122_otp_failure_visibility.py:65` (grep, no route call) | real clock | 10 |
| time | SLA ageing in the admin queue | `tests/test_admin_queue_sla_aging.py:332` | clock frozen | 7 |
| race | owner and admin move the same group buy (#4250) | `tests/test_group_buys_api.py:1206` (via helper _patch) | sequential interleave only | 11 |
| race | «נמסר» vs cancel on one rescue order (#4249) | `tests/test_meh2738_rescue_business_cancel.py:114` | sequential interleave only | 12 |
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
