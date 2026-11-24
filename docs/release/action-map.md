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
| API routes (actor actions) | 341 | 326 | 10 | 5 | 0 |
| — negative cell of gated routes (401/403) | 256 | 173 | 0 | 83 | 0 |
| Internal routes (allowlisted) | 10 + 4 docs | — | — | — | — |
| Business tools | 54 | 51 | 1 | 2 | 0 |
| Pages — public | 62 | 52 | 0 | 10 | 0 |
| Pages — dashboard | 25 | 22 | 0 | 3 | 0 |
| Pages — admin | 22 | 19 | 0 | 3 | 0 |
| State-machine rows (audit, every non-exempt section) | 45 | 38 | 1 | 6 | 0 |
| Mandatory extra rows (§B.3) | 25 | 23 | 1 | 1 | 0 |

Pages opened by a CI-run Playwright spec: **43 / 109** — the rest are covered only by a Vitest import (which may test no more than the page's metadata).

**GAP cells in total: 113** (route positive 5 · route negative 83 · tools 2 · pages 16 · machine rows 6 · extra rows 1). Not a gate yet — the plan's gate is "no *new* GAP" (a ratchet), later.

## Top gaps by risk

Score: see «Risk score» at the end. Routes whose verdict is not `covered` or whose 401/403 cell is a GAP, plus extra rows that are not `covered`.

| # | Score | Route / row | Actor | Why it is risky | Evidence |
|---|---|---|---|---|---|
| 1 | 13 | `POST /admin/producers/{producer_id}/owner-invite/resend` | admin | sends email/WhatsApp, no test, no 401/403 test | pos GAP · neg GAP |
| 2 | 13 | `POST /admin/producers/{producer_id}/owner-invite` | admin | sends email/WhatsApp, no test, no 401/403 test | pos GAP · neg GAP |
| 3 | 12 | `DELETE /admin/producers/{producer_id}/owner-invite` | admin | delete, no test, no 401/403 test | pos GAP · neg GAP |
| 4 | 12 | `POST /admin/settings/test/{service}` | admin | site-wide settings, only weak, no 401/403 test | pos weak `tests/test_meh2899_admin_service_test.py:90` (path literal) · neg GAP |
| 5 | 12 | `POST /auth/passkey/step-up/options` | admin | auth, only weak, no 401/403 test | pos weak `tests/test_meh3305_admin_passkeys_routes.py:282` (no success asserted) · neg GAP |
| 6 | 12 | `POST /producers/me/verify-phone` | business/organizer | auth, sends email/WhatsApp, no 401/403 test | pos `tests/_test_meh2952_send_layer__p01.py:181` · neg GAP |
| 7 | 11 | [negative] a rejected business acting (business mutation → 403/409) | — | negative row on `business mutations` | GAP |
| 8 | 11 | `PATCH /group-buys/{group_buy_id}/commit` | registered user | money-like, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh3592_group_buy_capacity.py:126` · neg GAP |
| 9 | 11 | `PATCH /producers/me/recipes/{recipe_id}` | business/organizer | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_indexnow.py:729` · neg GAP |
| 10 | 11 | `POST /admin/experiences/{experience_id}/request-changes` | admin | sends email/WhatsApp, public visibility, no 401/403 test | pos `tests/_test_experiences__p01.py:791` · neg GAP |
| 11 | 11 | `POST /admin/producers/{producer_id}/story-card` | admin | public visibility, only weak, no 401/403 test | pos weak `tests/test_admin_error_no_leak.py:52` (only error-path calls) · neg GAP |
| 12 | 11 | `POST /admin/recipes/{recipe_id}/request-changes` | admin | sends email/WhatsApp, public visibility, no 401/403 test | pos `tests/test_indexnow.py:540` · neg GAP |
| 13 | 11 | `POST /auth/owner-invite/accept-existing` | registered user | auth, sends email/WhatsApp, no 401/403 test | pos `tests/test_meh3256_owner_invite_existing.py:43` · neg GAP |
| 14 | 11 | `POST /auth/owner-invite/accept` | anonymous | public write, auth, sends email/WhatsApp, only weak | pos weak `tests/_test_producer_owner_invite__common.py:117` (no success asserted) · neg n/a |
| 15 | 11 | `POST /rescue/orders` | registered user | money-like, sends email/WhatsApp, no 401/403 test | pos `tests/test_meh2679_rescue_utc_times.py:77` · neg GAP |
| 16 | 10 | [time] the 24 h WhatsApp customer-service window | — | time row on `POST /webhook/whatsapp` | weak `tests/test_meh2122_otp_failure_visibility.py:66` (grep, no route call) |
| 17 | 10 | `DELETE /producers/me/products/{product_id}` | business/organizer | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_product_image.py:109` · neg GAP |
| 18 | 10 | `DELETE /producers/me/recipes/{recipe_id}` | business/organizer | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_indexnow.py:762` · neg GAP |
| 19 | 10 | `PATCH /group-buys/{group_buy_id}/status` | registered user | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/_test_group_buys_api__p02.py:555` · neg GAP |
| 20 | 10 | `POST /producers/me/verify-phone/confirm` | business/organizer | auth, no 401/403 test | pos `tests/test_meh2231_otp_test_numbers.py:113` · neg GAP |
| 21 | 10 | `POST /producers/{producer_id}/report` | registered user | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_integrity_constraints.py:41` · neg GAP |
| 22 | 10 | `PUT /admin/settings` | admin | site-wide settings, no 401/403 test | pos `tests/_test_api__p03.py:298` · neg GAP |
| 23 | 10 | `PUT /reviews/{review_id}/reply` | registered user | sends email/WhatsApp, object id in path (IDOR-shaped), no 401/403 test | pos `tests/_test_meh2952_send_layer__p01.py:269` · neg GAP |
| 24 | 9 | `DELETE /events/{event_id}` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_events_cross_owner.py:99` · neg GAP |
| 25 | 9 | `DELETE /experiences/{experience_id}` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/_test_experiences__p02.py:81` · neg GAP |
| 26 | 9 | `DELETE /group-buys/{group_buy_id}/waitlist` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh3592_group_buy_capacity.py:219` · neg GAP |
| 27 | 9 | `DELETE /reviews/{review_id}` | registered user | delete, object id in path (IDOR-shaped), no 401/403 test | pos `tests/test_meh2348_review_hide_sticky.py:84` · neg GAP |
| 28 | 9 | `GET /admin/group-buys` | admin | no test, no 401/403 test | pos GAP · neg GAP |
| 29 | 9 | `GET /admin/users/{user_id}/favorites` | admin | no test, no 401/403 test | pos GAP · neg GAP |
| 30 | 9 | `PATCH /admin/group-buys/{group_buy_id}/status` | admin | sends email/WhatsApp, no 401/403 test | pos `tests/_test_group_buys_api__p02.py:696` · neg GAP |

## API routes

Registration order of the app. Actor from the dependency tree: `require_admin` → admin; `require_producer` / `require_verified_producer` → business (organizers are producers with `kind == "organizer"` and pass unless the handler refuses that kind); `get_current_user` → registered user; otherwise anonymous.

| # | Method | Path | Handler | Actor | Positive | Negative (401/403) | E2E | Score |
|---|---|---|---|---|---|---|---|---|
| 1 | POST | `/auth/refresh` | `auth.refresh_token` | anonymous | `tests/_test_api__p06.py:79` | n/a | — | 7 |
| 2 | POST | `/auth/logout` | `auth.logout` | anonymous | `tests/_test_api__p06.py:163` | n/a | — | 7 |
| 3 | POST | `/auth/register` | `auth.register` | anonymous | `tests/_test_api__p01.py:22` | n/a | e2e-mock `frontend/e2e/flows/29-register-journey-a.spec.ts:174` | 9 |
| 4 | POST | `/auth/google` | `auth.google_auth` | anonymous | `tests/test_email_verified_creation_paths.py:111` | n/a | — | 9 |
| 5 | POST | `/auth/login` | `auth.login` | anonymous | `tests/_test_api__p01.py:544` | n/a | e2e-mock `frontend/e2e/flows/30-login-journey-c.spec.ts:239` | 7 |
| 6 | GET | `/auth/me` | `auth.get_me` | registered user | `tests/_test_api__p01.py:290` | `tests/_test_api__p01.py:568` | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:50` | 5 |
| 7 | POST | `/auth/logout-all-devices` | `auth.logout_all_devices` | registered user | `tests/_test_api__p06.py:181` | GAP | — | 9 |
| 8 | POST | `/auth/apple` | `auth.apple_auth` | anonymous | `tests/test_email_verified_creation_paths.py:118` | n/a | — | 9 |
| 9 | POST | `/auth/check-password` | `auth.check_password` | anonymous | `tests/test_auth.py:289` | n/a | e2e-mock `frontend/e2e/flows/29-register-journey-a.spec.ts:153` | 7 |
| 10 | POST | `/auth/forgot-password` | `auth.forgot_password` | anonymous | `tests/_test_meh2952_send_layer__p01.py:285` | n/a | e2e-mock `frontend/e2e/flows/30-login-journey-c.spec.ts:535` | 9 |
| 11 | POST | `/auth/reset-password` | `auth.reset_password` | anonymous | `tests/_test_api__p05.py:724` | n/a | — | 9 |
| 12 | GET | `/auth/verify-email` | `auth.verify_email` | anonymous | `tests/test_meh3095_email_change_reverify.py:70` | n/a | — | 4 |
| 13 | POST | `/auth/resend-verify` | `auth.resend_verify` | registered user | `tests/test_meh2901_resend_verify.py:60` | `tests/test_meh2901_resend_verify.py:107` | e2e-mock `frontend/e2e/flows/manual/dashboard-draft-submit.spec.ts:244` | 9 |
| 14 | POST | `/auth/me/delete` | `auth.delete_account` | registered user | `tests/_test_meh2952_send_layer__p01.py:300` | `tests/test_meh3248_account_delete_safeguards.py:47` | — | 9 |
| 15 | POST | `/auth/register/producer` | `auth_register_producer.register_producer` | anonymous (optional auth) | `tests/_test_api__p01.py:115` | n/a | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:42` | 9 |
| 16 | POST | `/auth/register/producer/oauth` | `auth_register_producer.register_producer_oauth` | anonymous | `tests/test_email_verified_creation_paths.py:131` | n/a | e2e-mock `frontend/e2e/flows/10-producer-oauth-409.spec.ts:31` | 7 |
| 17 | GET | `/auth/passkey` | `admin_passkey.list_passkeys` | admin | `tests/test_meh3305_admin_passkeys_routes.py:370` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:190` | 8 |
| 18 | POST | `/auth/passkey/step-up/options` | `admin_passkey.step_up_options` | admin | weak `tests/test_meh3305_admin_passkeys_routes.py:282` (no success asserted) | GAP | — | 12 |
| 19 | POST | `/auth/passkey/register/options` | `admin_passkey.register_options` | admin | `tests/test_meh3305_admin_passkeys_routes.py:176` | `tests/test_meh3305_admin_passkeys_routes.py:249` | — | 8 |
| 20 | POST | `/auth/passkey/register/verify` | `admin_passkey.register_verify` | admin | `tests/test_meh3305_admin_passkeys_routes.py:181` | `tests/test_meh3305_admin_passkeys_routes.py:578` | — | 8 |
| 21 | POST | `/auth/passkey/{passkey_id}/delete` | `admin_passkey.delete_passkey` | admin | `tests/test_meh3305_admin_passkeys_routes.py:393` | `tests/test_meh3305_admin_passkeys_routes.py:390` | — | 8 |
| 22 | POST | `/auth/passkey/recovery-codes` | `admin_passkey.regenerate_codes` | admin | `tests/test_meh3305_admin_passkeys_routes.py:532` | `tests/test_meh3305_admin_passkeys_routes.py:542` | — | 8 |
| 23 | POST | `/auth/passkey/login/verify` | `admin_passkey.login_verify` | anonymous | `tests/test_meh3305_admin_passkeys_routes.py:231` | n/a | — | 7 |
| 24 | POST | `/auth/passkey/login/recovery` | `admin_passkey.login_recovery` | anonymous | `tests/test_meh3305_admin_passkeys_routes.py:347` | n/a | — | 7 |
| 25 | GET | `/cities` | `cities.list_cities` | anonymous | `tests/test_meh1343_cities_canonical_source.py:23` | n/a | e2e-mock `frontend/e2e/flows/38-register-delivery-axis.spec.ts:40` | 1 |
| 26 | GET | `/producer-name-check` | `producer_name_check.producer_name_check` | anonymous | `tests/test_meh3086_name_check.py:26` | n/a | e2e-mock `frontend/e2e/flows/manual/admin-producer-form-licence.spec.ts:222` | 1 |
| 27 | GET | `/producers/me` | `producer_me.get_my_producer` | business/organizer | `tests/_test_api__p05.py:461` | `tests/_test_api__p05.py:470` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:210` | 3 |
| 28 | PUT | `/producers/me` | `producer_me.update_my_producer` | business/organizer | `tests/_test_api__p04.py:383` | `tests/_test_api__p04.py:498` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:210` | 7 |
| 29 | POST | `/producers/me/availability-state` | `producer_me.set_availability_state` | business/organizer | `tests/_test_api__p04.py:739` | `tests/test_expansion_availability.py:192` | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:85` | 5 |
| 30 | POST | `/producers/me/availability-confirm` | `producer_me.confirm_availability` | business/organizer | `tests/test_meh2697_availability_confirmed.py:53` | `tests/test_meh2697_availability_confirmed.py:101` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 31 | GET | `/producers/me/dashboard` | `producer_me.dashboard` | business/organizer | `tests/_test_api__p04.py:68` | `tests/test_expansion_auth_jwt.py:56` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:182` | 3 |
| 32 | POST | `/producers/me/bio/generate` | `producer_me.generate_bio_endpoint` | business/organizer | `tests/_test_api__p03.py:419` | `tests/_test_api__p03.py:429` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:134` | 5 |
| 33 | GET | `/producers/me/products` | `producer_me.list_my_products` | business/organizer | `tests/test_admin_product_import.py:197` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 5 |
| 34 | POST | `/producers/me/products` | `producer_me.create_my_product` | business/organizer | `tests/test_meh2662_product_ingredients_allergens.py:35` | `tests/test_meh3247_own_uploads_only.py:201` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 5 |
| 35 | PUT | `/producers/me/products/{product_id}` | `producer_me.update_my_product` | business/organizer | `tests/test_meh2662_product_ingredients_allergens.py:105` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 9 |
| 36 | DELETE | `/producers/me/products/{product_id}` | `producer_me.delete_my_product` | business/organizer | `tests/test_product_image.py:109` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 10 |
| 37 | GET | `/producers/me/analytics` | `producer_me_analytics.producer_analytics` | business/organizer | `tests/_test_api__p05.py:442` | `tests/test_analytics.py:430` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:199` | 3 |
| 38 | POST | `/producers/me/verify-phone` | `producer_me_review.send_phone_otp` | business/organizer | `tests/_test_meh2952_send_layer__p01.py:181` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-draft-submit.spec.ts:147` | 12 |
| 39 | POST | `/producers/me/verify-phone/confirm` | `producer_me_review.confirm_phone_otp` | business/organizer | `tests/test_meh2231_otp_test_numbers.py:113` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-draft-submit.spec.ts:147` | 10 |
| 40 | POST | `/producers/me/kashrut-request` | `producer_me_review.request_kashrut_badge` | business/organizer | `tests/test_trust_ladder.py:214` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-trust-cards.spec.ts:114` | 7 |
| 41 | GET | `/producers/me/kashrut-requests` | `producer_me_review.list_kashrut_requests` | business/organizer | `tests/_test_api__p07.py:48` | `tests/_test_api__p07.py:84` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 3 |
| 42 | GET | `/producers/me/review-link` | `producer_me_review.get_review_invite_link` | business/organizer | `tests/test_reviews.py:931` | `tests/test_reviews.py:921` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:103` | 3 |
| 43 | POST | `/producers/me/request-review` | `producer_me_review.request_producer_review` | business/organizer | `tests/_test_api__p03.py:503` | `tests/_test_api__p03.py:528` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 7 |
| 44 | POST | `/producers/me/submit-for-review` | `producer_me_review.submit_for_review` | business/organizer | `tests/_test_meh2952_send_layer__p01.py:216` | `tests/test_meh2100_draft_submit.py:405` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:329` | 7 |
| 45 | GET | `/producers/me/locations` | `producer_me_locations.list_my_locations` | business/organizer | `tests/test_admin_locations.py:164` | `tests/test_producer_locations_crud.py:181` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 3 |
| 46 | POST | `/producers/me/locations` | `producer_me_locations.create_my_location` | business/organizer | `tests/test_meh1938_ch5_strict_followup.py:64` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 7 |
| 47 | PUT | `/producers/me/locations/{location_id}` | `producer_me_locations.update_my_location` | business/organizer | `tests/test_meh1938_ch5_strict_followup.py:221` | `tests/test_producer_locations_crud.py:150` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 7 |
| 48 | DELETE | `/producers/me/locations/{location_id}` | `producer_me_locations.delete_my_location` | business/organizer | `tests/test_meh1938_ch5_strict_followup.py:151` | `tests/test_producer_locations_crud.py:165` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 8 |
| 49 | GET | `/producers/me/weekly-summary` | `producer_me_weekly_summary.get_weekly_summary_setting` | business/organizer | `tests/test_meh3212_weekly_summary_toggle.py:47` | `tests/test_meh3212_weekly_summary_toggle.py:90` | e2e-mock `frontend/e2e/flows/manual/dashboard-shell.spec.ts:254` | 3 |
| 50 | PATCH | `/producers/me/weekly-summary` | `producer_me_weekly_summary.set_weekly_summary_setting` | business/organizer | `tests/test_meh3212_weekly_summary_toggle.py:57` | `tests/test_meh3212_weekly_summary_toggle.py:89` | e2e-mock `frontend/e2e/flows/manual/dashboard-shell.spec.ts:254` | 5 |
| 51 | POST | `/producers/me/menu-import/read` | `menu_import.read_my_menu` | business/organizer | `tests/test_meh3430_menu_import.py:57` | `tests/test_meh3430_menu_import.py:108` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 52 | POST | `/producers/me/menu-import/publish` | `menu_import.publish_my_menu` | business/organizer | `tests/test_meh3430_menu_import.py:123` | `tests/test_meh3430_menu_import.py:281` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 7 |
| 53 | POST | `/producers/me/product-description/suggest` | `product_describe.suggest_my_product_description` | business/organizer | `tests/test_meh3479_product_description.py:42` | `tests/test_meh3479_product_description.py:60` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 54 | POST | `/admin/producers/{producer_id}/product-description/suggest` | `product_describe.admin_suggest_product_description` | admin | `tests/test_meh3479_product_description.py:137` | `tests/test_meh3479_product_description.py:135` | — | 5 |
| 55 | POST | `/reviews/{review_id}/reply/suggest` | `review_reply_suggest.suggest_review_reply` | registered user | `tests/test_meh3480_review_reply_suggest.py:45` | `tests/test_meh3480_review_reply_suggest.py:65` | — | 6 |
| 56 | POST | `/producers/me/page-fill/read` | `page_fill.read_my_page_text` | business/organizer | `tests/test_meh3483_page_fill.py:242` | `tests/test_meh3483_page_fill.py:259` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 57 | POST | `/admin/producers/{producer_id}/page-fill/read` | `page_fill.admin_read_page_text` | admin | `tests/test_meh3483_page_fill.py:280` | `tests/test_meh3483_page_fill.py:298` | — | 5 |
| 58 | POST | `/producers/me/ai-fill/{form}` | `form_fill.fill_my_form` | business/organizer | `tests/test_meh3740_form_fill.py:175` | `tests/test_meh3740_form_fill.py:239` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 7 |
| 59 | GET | `/producers/me/google-profile` | `producer_google_profile.get_google_profile` | business/organizer | `tests/test_meh3641_owner_google_profile.py:91` | `tests/test_meh3641_owner_google_profile.py:111` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 3 |
| 60 | GET | `/producers/me/google-profile/candidates` | `producer_google_profile.search_google_profile` | business/organizer | `tests/test_meh3641_owner_google_profile.py:135` | `tests/test_meh3641_owner_google_profile.py:116` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 3 |
| 61 | PUT | `/producers/me/google-profile` | `producer_google_profile.put_google_profile` | business/organizer | `tests/test_meh3641_owner_google_profile.py:165` | `tests/test_meh3641_owner_google_profile.py:110` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 62 | GET | `/producers/me/google-profile/check` | `producer_google_profile.check_google_profile` | business/organizer | `tests/test_meh3641_owner_google_profile.py:329` | `tests/test_meh3641_owner_google_profile.py:117` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 3 |
| 63 | GET | `/producers/me/product-groups` | `product_organize.list_my_product_groups` | business/organizer | `tests/test_admin_product_organize.py:85` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 64 | PUT | `/producers/me/product-groups` | `product_organize.replace_my_product_groups` | business/organizer | `tests/test_meh3055_product_organize.py:50` | `tests/test_meh3055_product_organize.py:160` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 65 | PUT | `/producers/me/product-order` | `product_organize.set_my_product_order` | business/organizer | `tests/test_admin_product_organize.py:160` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 7 |
| 66 | PUT | `/producers/me/products/{product_id}/group` | `product_organize.set_my_product_group` | business/organizer | `tests/test_meh3055_product_organize.py:71` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 9 |
| 67 | PUT | `/producers/me/product-groups/assign` | `product_organize.move_products_between_groups` | business/organizer | `tests/test_meh3477_group_moves_and_suggest.py:47` | `tests/test_meh3477_group_moves_and_suggest.py:103` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 68 | POST | `/producers/me/product-groups/suggest` | `product_organize.suggest_product_groups` | business/organizer | `tests/test_meh3477_group_moves_and_suggest.py:125` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 7 |
| 69 | GET | `/producers/me/billing/summary` | `billing.my_billing_summary` | business/organizer | `tests/test_meh3181_billing_summary.py:206` | `tests/test_meh3181_billing_summary.py:216` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:13` | 3 |
| 70 | GET | `/admin/billing/overview` | `billing.admin_billing_overview` | admin | `tests/test_meh3181_billing_summary.py:266` | `tests/test_meh3181_billing_summary.py:223` | — | 3 |
| 71 | POST | `/admin/producers/{producer_id}/claim-link` | `producer_claim.create_claim_link` | admin | `tests/test_meh2496_claim_link_sent_at.py:65` | `tests/test_meh2496_claim_link_sent_at.py:117` | — | 8 |
| 72 | POST | `/producer-claim/preview` | `producer_claim.preview_claim` | anonymous (token in request) | `tests/test_producer_claim.py:258` | n/a | — | 7 |
| 73 | POST | `/producer-claim/new-link-request` | `producer_claim.request_new_claim_link` | anonymous (token in request) | `tests/test_meh3122_claim_new_link.py:73` | n/a | — | 9 |
| 74 | POST | `/producer-claim` | `producer_claim.claim_producer` | registered user | `tests/test_meh3258_review_conflicts.py:191` | `tests/test_producer_claim.py:363` | — | 9 |
| 75 | POST | `/admin/producers/{producer_id}/products` | `producer_claim.admin_create_draft_product` | admin | `tests/test_admin_draft_products.py:57` | `tests/test_admin_draft_products.py:83` | — | 5 |
| 76 | DELETE | `/admin/producers/{producer_id}/products/{product_id}` | `producer_claim.admin_delete_draft_product` | admin | `tests/test_admin_draft_products.py:150` | `tests/test_admin_draft_products.py:181` | — | 6 |
| 77 | POST | `/admin/producers/{producer_id}/preview-link` | `producer_draft_preview.create_preview_link` | admin | `tests/test_producer_draft_preview.py:86` | `tests/test_producer_draft_preview.py:97` | — | 5 |
| 78 | GET | `/producer-preview/{token}` | `producer_draft_preview.read_draft_preview` | anonymous (token in request) | `tests/test_producer_draft_preview.py:122` | n/a | — | 4 |
| 79 | POST | `/admin/producers/{producer_id}/publish-with-consent` | `producer_draft_preview.publish_draft_with_consent` | admin | `tests/test_producer_draft_preview.py:195` | `tests/test_producer_draft_preview.py:236` | — | 7 |
| 80 | POST | `/admin/producers/{producer_id}/owner-invite` | `producer_owner_invite.create_owner_invite` | admin | GAP | GAP | — | 13 |
| 81 | POST | `/admin/producers/{producer_id}/owner-invite/resend` | `producer_owner_invite.resend_owner_invite` | admin | GAP | GAP | — | 13 |
| 82 | DELETE | `/admin/producers/{producer_id}/owner-invite` | `producer_owner_invite.cancel_owner_invite` | admin | GAP | GAP | — | 12 |
| 83 | POST | `/auth/owner-invite/email-code` | `producer_owner_invite.send_owner_invite_email_code` | anonymous | `tests/_test_producer_owner_invite__common.py:107` | n/a | — | 9 |
| 84 | POST | `/auth/owner-invite/accept` | `producer_owner_invite.accept_owner_invite` | anonymous | weak `tests/_test_producer_owner_invite__common.py:117` (no success asserted) | n/a | — | 11 |
| 85 | GET | `/auth/owner-invite/{token}` | `producer_owner_invite.get_owner_invite` | anonymous (token in request) | weak `tests/_test_producer_owner_invite__p03.py:310` (path literal) | n/a | — | 6 |
| 86 | POST | `/auth/owner-invite/email-code-existing` | `producer_owner_invite_existing.send_owner_invite_code_existing` | registered user · verified email | `tests/test_meh3256_owner_invite_existing.py:30` | `tests/test_meh3256_owner_invite_existing.py:116` | — | 9 |
| 87 | POST | `/auth/owner-invite/accept-existing` | `producer_owner_invite_existing.accept_owner_invite_existing` | registered user · verified email | `tests/test_meh3256_owner_invite_existing.py:43` | GAP | — | 11 |
| 88 | POST | `/admin/producers/{producer_id}/detach-owner` | `producer_owner_detach.detach_owner` | admin | weak `tests/test_meh3256_detach_owner.py:39` (no success asserted) | GAP | — | 9 |
| 89 | POST | `/weekly-summary/unsubscribe/one-click` | `producer_me_weekly_summary.one_click_unsubscribe` | anonymous (token in request) | `tests/test_meh3212_weekly_summary_toggle.py:110` | n/a | — | 4 |
| 90 | GET | `/weekly-summary/unsubscribe/one-click` | `producer_me_weekly_summary.one_click_landing` | anonymous (token in request) | `tests/test_meh3212_weekly_summary_toggle.py:121` | n/a | — | 1 |
| 91 | POST | `/page-freshness/confirm` | `page_freshness.confirm_page_freshness` | anonymous | `tests/test_page_freshness.py:149` | n/a | — | 4 |
| 92 | GET | `/producers` | `producers.list_producers` | anonymous | `tests/_test_api__p03.py:27` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 93 | GET | `/producers/count` | `producers.producers_count` | anonymous | `tests/_test_api__p05.py:208` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 94 | GET | `/producers/random` | `producers.random_producer` | anonymous | `tests/test_catalog_count_consistency.py:119` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 95 | GET | `/producers/by-slug/{slug}` | `producers.get_producer_by_slug` | anonymous | `tests/test_admin_product_import.py:187` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 96 | GET | `/producers/{producer_id}` | `producers.get_producer` | anonymous (optional auth) | `tests/_test_api__p03.py:53` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 97 | POST | `/producers/{producer_id}/view` | `producers.record_producer_view` | anonymous (optional auth) | `tests/test_analytics.py:126` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 6 |
| 98 | POST | `/producers/{producer_id}/whatsapp-click` | `producers.record_whatsapp_click` | anonymous (optional auth) | `tests/_test_api__p04.py:32` | n/a | e2e-mock `frontend/e2e/flows/04-whatsapp-click.spec.ts:29` | 6 |
| 99 | POST | `/producers/{producer_id}/contact-click` | `producers.record_contact_click` | anonymous (optional auth) | `tests/_test_api__p05.py:381` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 6 |
| 100 | POST | `/producers/{producer_id}/delivery-waitlist` | `producers.join_delivery_waitlist` | anonymous (optional auth) | `tests/test_delivery_waitlist.py:36` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 6 |
| 101 | POST | `/delivery-waitlist/host-confirm` | `producers.confirm_delivery_waitlist_host` | anonymous (token in request) | `tests/test_delivery_waitlist.py:319` | n/a | — | 4 |
| 102 | POST | `/delivery-waitlist/unsubscribe` | `producers.unsubscribe_delivery_waitlist` | anonymous (token in request) | `tests/test_delivery_waitlist.py:237` | n/a | — | 4 |
| 103 | POST | `/producers` | `producers.create_producer` | registered user · verified email | `tests/_test_api__p03.py:115` | `tests/_test_api__p03.py:93` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 4 |
| 104 | GET | `/categories` | `producers.list_categories` | anonymous | `tests/test_meh1456_category_is_system.py:70` | n/a | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:28` | 1 |
| 105 | GET | `/producers/{producer_id}/kashrut-cert/{badge_code}` | `producers.get_kashrut_cert` | anonymous | `tests/test_meh1672_kashrut_cert_public.py:98` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 106 | GET | `/organizers` | `organizers.list_organizer_slugs` | anonymous | `tests/test_meh2952_is_test_exclusion.py:351` | n/a | — | 1 |
| 107 | GET | `/organizers/{slug}` | `organizers.get_organizer` | anonymous | `tests/test_meh2952_is_test_exclusion.py:354` | n/a | — | 1 |
| 108 | GET | `/users/me/favorites` | `favorites.get_favorites` | registered user | `tests/test_favorites_badge_parity.py:65` | `tests/test_meh997_e2e_journeys.py:654` | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:63` | 2 |
| 109 | POST | `/users/me/favorites/{producer_id}` | `favorites.add_favorite` | registered user | `tests/_test_api__p04.py:447` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:63` | 6 |
| 110 | DELETE | `/users/me/favorites/{producer_id}` | `favorites.remove_favorite` | registered user | `tests/test_meh3222_unfavorite_stops_alerts.py:35` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:63` | 7 |
| 111 | GET | `/users/me/saved/ids` | `saved_items.get_saved_ids` | registered user | `tests/test_meh2557_saved_items_api.py:120` | `tests/test_meh2557_saved_items_api.py:95` | e2e-mock `frontend/e2e/flows/30-login-journey-c.spec.ts:236` | 2 |
| 112 | GET | `/users/me/saved` | `saved_items.get_saved` | registered user | `tests/test_meh2557_saved_items_api.py:110` | `tests/test_meh2557_saved_items_api.py:94` | — | 2 |
| 113 | POST | `/users/me/saved/{item_type}/{item_id}` | `saved_items.save_item` | registered user | `tests/test_meh2557_saved_items_api.py:107` | `tests/test_meh2557_saved_items_api.py:96` | — | 4 |
| 114 | DELETE | `/users/me/saved/{item_type}/{item_id}` | `saved_items.unsave_item` | registered user | `tests/test_meh2557_saved_items_api.py:255` | `tests/test_meh2557_saved_items_api.py:97` | — | 5 |
| 115 | GET | `/admin/producers/pending` | `admin_decisions.pending_producers` | admin | `tests/_test_api__p03.py:386` | GAP | — | 5 |
| 116 | POST | `/admin/producers/{producer_id}/approve` | `admin_decisions.approve_producer` | admin | `tests/_test_api__p03.py:190` | `tests/test_expansion_admin_authz.py:76` | e2e-mock `frontend/e2e/flows/manual/admin-producers-decisions.spec.ts:213` | 9 |
| 117 | GET | `/admin/producers/rejection-presets` | `admin_decisions.list_rejection_presets` | admin | `tests/test_meh226_rejection_reason.py:303` | `tests/test_meh226_rejection_reason.py:332` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:214` | 6 |
| 118 | POST | `/admin/producers/{producer_id}/reject` | `admin_decisions.reject_producer` | admin | `tests/_test_producer_owner_invite__p03.py:116` | `tests/test_expansion_admin_authz.py:28` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-producers-decisions.spec.ts:219` | 9 |
| 119 | POST | `/admin/producers/{producer_id}/request-changes` | `admin_decisions.request_producer_changes` | admin | `tests/test_changes_requested_whatsapp.py:59` | `tests/test_producer_request_changes.py:105` | e2e-mock `frontend/e2e/flows/manual/admin-producers-decisions.spec.ts:220` | 9 |
| 120 | POST | `/admin/producers/{producer_id}/grant-verified` | `admin_decisions.grant_verified` | admin | `tests/test_meh_762_verification_stamping.py:34` | `tests/test_meh_762_verification_stamping.py:149` | — | 7 |
| 121 | POST | `/admin/producers/{producer_id}/revoke-verified` | `admin_decisions.revoke_verified` | admin | `tests/test_meh_762_verification_stamping.py:118` | `tests/test_meh_762_verification_stamping.py:159` | — | 7 |
| 122 | GET | `/admin/producers` | `admin.list_producers` | admin | `tests/_test_api__p03.py:396` | `tests/test_meh2495_admin_draft_owner.py:211` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:216` | 3 |
| 123 | POST | `/admin/producers` | `admin.admin_create_producer` | admin | `tests/_test_api__p04.py:292` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:216` | 7 |
| 124 | GET | `/admin/license-expiry-reminders` | `admin.license_expiry_reminders` | admin | `tests/test_license_expiry.py:223` | `tests/test_license_expiry.py:328` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:195` | 3 |
| 125 | PUT | `/admin/producers/{producer_id}` | `admin.admin_update_producer` | admin | `tests/test_admin_approval_transitions.py:524` | `tests/test_meh3475_admin_delivery_payment.py:156` | — | 5 |
| 126 | POST | `/admin/producers/{producer_id}/toggle-status` | `admin.toggle_producer_status` | admin | `tests/_test_producer_owner_invite__p03.py:54` | `tests/test_expansion_admin_authz.py:29` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-recipes-kebab.spec.ts:207` | 7 |
| 127 | DELETE | `/admin/producers/{producer_id}` | `admin.admin_delete_producer` | admin | `tests/_test_producer_owner_invite__p03.py:605` | `tests/test_expansion_admin_authz.py:30` (table row) | — | 6 |
| 128 | GET | `/admin/producers/{producer_id}` | `admin.admin_get_producer` | admin | `tests/_test_producer_owner_invite__p03.py:486` | `tests/test_license_expiry.py:393` | — | 3 |
| 129 | POST | `/admin/producers/{producer_id}/story-card` | `admin.upload_story_card` | admin | weak `tests/test_admin_error_no_leak.py:52` (only error-path calls) | GAP | — | 11 |
| 130 | GET | `/admin/stats` | `admin.get_stats` | admin | `tests/test_meh2952_is_test_exclusion.py:200` | GAP | — | 5 |
| 131 | POST | `/admin/seed-cities` | `admin.seed_cities` | admin | `tests/test_meh2241_admin_seed_cities.py:55` | GAP | — | 7 |
| 132 | GET | `/admin/producers/{producer_id}/product-groups` | `admin_product_organize.admin_list_product_groups` | admin | `tests/test_admin_product_organize.py:87` | `tests/test_admin_product_organize.py:47` (table row) | — | 3 |
| 133 | PUT | `/admin/producers/{producer_id}/product-groups` | `admin_product_organize.admin_replace_product_groups` | admin | `tests/test_admin_product_organize.py:81` | `tests/test_admin_product_organize.py:48` (table row) | — | 5 |
| 134 | PUT | `/admin/producers/{producer_id}/product-order` | `admin_product_organize.admin_set_product_order` | admin | `tests/test_admin_product_organize.py:143` | `tests/test_admin_product_organize.py:49` (table row) | — | 5 |
| 135 | PUT | `/admin/producers/{producer_id}/products/{product_id}/group` | `admin_product_organize.admin_set_product_group` | admin | `tests/test_admin_product_organize.py:97` | `tests/test_admin_product_organize.py:50` (table row) | — | 5 |
| 136 | PUT | `/admin/producers/{producer_id}/product-groups/assign` | `admin_product_organize.admin_move_products_between_groups` | admin | `tests/test_meh3477_group_moves_and_suggest.py:93` | `tests/test_meh3477_group_moves_and_suggest.py:104` | — | 5 |
| 137 | POST | `/admin/producers/{producer_id}/product-groups/suggest` | `admin_product_organize.admin_suggest_product_groups` | admin | `tests/test_meh3477_group_moves_and_suggest.py:165` | GAP | — | 7 |
| 138 | GET | `/admin/test-businesses` | `admin_test_business.list_test_businesses` | admin | `tests/test_meh2952_test_business_toggle.py:103` | `tests/test_meh2952_test_business_toggle.py:74` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:188` | 3 |
| 139 | PUT | `/admin/test-businesses/{producer_id}` | `admin_test_business.set_test_business` | admin | `tests/test_meh2952_test_business_toggle.py:45` | `tests/test_meh2952_test_business_toggle.py:67` | — | 5 |
| 140 | POST | `/auth/google/code` | `auth_google_code.google_code` | anonymous | `tests/test_meh3690_google_code_exchange.py:67` | n/a | — | 7 |
| 141 | GET | `/admin/users` | `admin_extra.list_users` | admin | `tests/_test_api__p01.py:298` | `tests/test_meh2900_admin_role_endpoint.py:158` | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:236` | 3 |
| 142 | PUT | `/admin/users/{user_id}/role` | `admin_extra.update_user_role` | admin | `tests/_test_api__p03.py:226` | `tests/test_meh2900_admin_role_endpoint.py:118` | — | 13 |
| 143 | POST | `/admin/users/{user_id}/block` | `admin_extra.block_user` | admin | `tests/_test_api__p03.py:238` | `tests/test_expansion_admin_authz.py:41` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:239` | 13 |
| 144 | GET | `/admin/users/{user_id}/block-impact` | `admin_extra.block_impact` | admin | `tests/test_meh3375_block_impact.py:31` | `tests/test_meh3375_block_impact.py:183` | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:238` | 3 |
| 145 | GET | `/admin/audit-log` | `admin_extra.list_audit_log` | admin | `tests/test_meh3306_admin_audit_log.py:371` | `tests/test_meh3306_admin_audit_log.py:368` | — | 3 |
| 146 | DELETE | `/admin/users/{user_id}` | `admin_extra.admin_delete_user` | admin | `tests/test_meh2585_admin_delete_user.py:26` | `tests/test_meh2585_admin_delete_user.py:109` | — | 14 |
| 147 | GET | `/admin/users/{user_id}/favorites` | `admin_extra.user_favorites` | admin | GAP | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:63` | 9 |
| 148 | GET | `/admin/categories` | `admin_extra.list_categories_admin` | admin | `tests/_test_api__p03.py:258` | GAP | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:28` | 5 |
| 149 | POST | `/admin/categories` | `admin_extra.create_category` | admin | `tests/_test_api__p03.py:250` | GAP | e2e-mock `frontend/e2e/flows/18-producer-register-wizard.spec.ts:28` | 7 |
| 150 | PUT | `/admin/categories/{category_id}` | `admin_extra.update_category` | admin | `tests/_test_api__p03.py:261` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-producers-queue.spec.ts:178` | 7 |
| 151 | DELETE | `/admin/categories/{category_id}` | `admin_extra.delete_category` | admin | `tests/_test_api__p03.py:268` | `tests/test_expansion_admin_authz.py:42` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-producers-queue.spec.ts:178` | 6 |
| 152 | GET | `/admin/pages/{slug}` | `admin_extra.get_static_page` | admin | `tests/_test_api__p03.py:325` | GAP | — | 5 |
| 153 | PUT | `/admin/pages/{slug}` | `admin_extra.update_static_page` | admin | `tests/_test_api__p03.py:328` | GAP | — | 7 |
| 154 | GET | `/admin/analytics` | `admin_extra.get_analytics` | admin | `tests/_test_api__p03.py:316` | GAP | — | 5 |
| 155 | GET | `/admin/settings` | `admin_extra.get_settings` | admin | `tests/_test_api__p03.py:290` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:218` | 5 |
| 156 | PUT | `/admin/settings` | `admin_extra.update_settings` | admin | `tests/_test_api__p03.py:298` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:218` | 10 |
| 157 | GET | `/admin/settings/vacation` | `admin_extra.get_vacation_mode` | admin | `tests/test_meh_509_pr2a_vacation.py:27` | `tests/test_meh_509_pr2a_vacation.py:34` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:221` | 3 |
| 158 | POST | `/admin/settings/vacation` | `admin_extra.set_vacation_mode` | admin | `tests/test_meh_509_pr2a_vacation.py:50` | `tests/test_meh_509_pr2a_vacation.py:118` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:221` | 8 |
| 159 | POST | `/admin/settings/test/{service}` | `admin_extra.test_service` | admin | weak `tests/test_meh2899_admin_service_test.py:90` (path literal) | GAP | — | 12 |
| 160 | GET | `/admin/dashboard` | `admin_extra.get_dashboard` | admin | `tests/_test_api__p03.py:202` | `tests/_test_api__p03.py:164` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:207` | 3 |
| 161 | POST | `/producers/{producer_id}/report` | `reports.report_producer` | registered user | `tests/test_integrity_constraints.py:41` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 10 |
| 162 | GET | `/admin/reports` | `reports.get_flagged_producers` | admin | `tests/test_report_lifecycle.py:31` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:233` | 5 |
| 163 | POST | `/admin/reports/{report_id}/resolve` | `reports.resolve_report` | admin | `tests/test_report_lifecycle.py:82` | `tests/test_report_lifecycle.py:122` | — | 5 |
| 164 | POST | `/admin/reports/{report_id}/dismiss` | `reports.dismiss_report` | admin | `tests/test_report_lifecycle.py:70` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:234` | 7 |
| 165 | POST | `/reports/producer-info` | `report_info.report_producer_info` | anonymous | `tests/test_email_logo.py:126` | n/a | — | 6 |
| 166 | POST | `/reports/review` | `report_info.report_review` | anonymous (optional auth) | `tests/test_meh3260_report_review.py:50` | n/a | — | 6 |
| 167 | POST | `/upload/image` | `upload.upload_image` | registered user | `tests/test_meh2551_upload_off_event_loop.py:48` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-images-contact.spec.ts:110` | 6 |
| 168 | POST | `/upload/avatar` | `upload.upload_avatar` | registered user | `tests/test_avatar_upload.py:30` | `tests/_test_api__p04.py:216` | — | 4 |
| 169 | POST | `/upload/owner-photo` | `upload.upload_owner_photo` | registered user | `tests/_test_api__p04.py:649` | `tests/_test_api__p04.py:674` | — | 4 |
| 170 | POST | `/upload/owner-photo/{producer_id}` | `upload.admin_upload_owner_photo` | admin | `tests/test_admin_owner_story.py:68` | `tests/test_admin_owner_story.py:37` | — | 5 |
| 171 | POST | `/upload/kashrut-cert` | `upload.upload_kashrut_cert` | registered user | `tests/_test_api__p07.py:96` | `tests/_test_api__p07.py:162` | e2e-mock `frontend/e2e/flows/manual/dashboard-trust-cards.spec.ts:115` | 4 |
| 172 | POST | `/upload/product-image/{product_id}` | `upload.admin_upload_product_image` | admin | `tests/test_admin_product_image.py:120` | `tests/test_admin_product_image.py:52` | — | 5 |
| 173 | GET | `/stats` | `marketing.get_stats` | anonymous | `tests/_test_api__p06.py:795` | n/a | — | 1 |
| 174 | POST | `/newsletter` | `marketing.subscribe_newsletter` | anonymous | `tests/test_meh2611_newsletter_resend_sync.py:42` | n/a | — | 6 |
| 175 | POST | `/newsletter/confirm` | `marketing.confirm_newsletter` | anonymous | `tests/test_meh2611_newsletter_resend_sync.py:46` | n/a | — | 6 |
| 176 | POST | `/newsletter/unsubscribe` | `marketing.unsubscribe_newsletter` | anonymous (token in request) | `tests/test_meh2611_newsletter_resend_sync.py:61` | n/a | — | 4 |
| 177 | POST | `/weekly-summary/unsubscribe` | `marketing.unsubscribe_weekly_summary` | anonymous (token in request) | `tests/test_meh3079_weekly_owner_summary.py:343` | n/a | — | 4 |
| 178 | POST | `/contact` | `marketing.submit_contact` | anonymous | `tests/_test_api__p03.py:696` | n/a | — | 6 |
| 179 | GET | `/events` | `events.list_events` | anonymous (optional auth) | `tests/_test_experiences__p02.py:518` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:18` | 1 |
| 180 | GET | `/events/upcoming` | `events.upcoming_events` | anonymous | `tests/test_meh1161_event_producer_gate.py:118` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:18` | 1 |
| 181 | GET | `/events/mine` | `events.list_my_events` | business/organizer | `tests/test_events_mine.py:46` | `tests/test_events_mine.py:69` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:18` | 3 |
| 182 | GET | `/events/{event_id}` | `events.get_event` | anonymous (optional auth) | `tests/test_event_end_time.py:62` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:18` | 1 |
| 183 | POST | `/events` | `events.create_event` | business/organizer · verified email | `tests/test_event_end_time.py:52` | `tests/test_meh3180_billing_state.py:349` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:18` | 5 |
| 184 | PUT | `/events/{event_id}` | `events.update_event` | business/organizer | `tests/test_event_end_time.py:118` | `tests/test_meh3180_billing_state.py:380` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:18` | 7 |
| 185 | DELETE | `/events/{event_id}` | `events.delete_event` | registered user | `tests/test_events_cross_owner.py:99` | GAP | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:18` | 9 |
| 186 | POST | `/experiences/validate` | `experiences.validate_endpoint` | anonymous | `tests/_test_experiences__p01.py:220` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:145` | 4 |
| 187 | GET | `/experiences` | `experiences.list_experiences` | anonymous | `tests/_test_experiences__p01.py:375` | n/a | — | 1 |
| 188 | GET | `/experiences/count` | `experiences.count_experiences` | anonymous | `tests/_test_experiences__p01.py:258` | n/a | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:254` | 1 |
| 189 | GET | `/experiences/mine` | `experiences.list_my_experiences` | registered user | `tests/_test_experiences__p02.py:101` | `tests/_test_experiences__p02.py:106` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:129` | 2 |
| 190 | GET | `/experiences/{experience_id}` | `experiences.get_experience` | anonymous (optional auth) | `tests/_test_experiences__p01.py:578` | n/a | — | 1 |
| 191 | POST | `/experiences` | `experiences.submit_experience` | business/organizer · verified email | `tests/_test_experiences__p01.py:47` | `tests/_test_experiences__p01.py:24` | — | 7 |
| 192 | PUT | `/experiences/{experience_id}` | `experiences.update_experience` | registered user | `tests/_test_experiences__p01.py:819` | GAP | — | 8 |
| 193 | DELETE | `/experiences/{experience_id}` | `experiences.delete_experience` | registered user | `tests/_test_experiences__p02.py:81` | GAP | — | 9 |
| 194 | GET | `/admin/experiences` | `admin_experiences.admin_list_experiences` | admin | `tests/_test_experiences__p01.py:710` | `tests/_test_experiences__p01.py:696` | — | 3 |
| 195 | POST | `/admin/experiences/{experience_id}/approve` | `admin_experiences.approve_experience` | admin | `tests/_test_experiences__p01.py:735` | `tests/test_expansion_admin_authz.py:36` (table row) | — | 9 |
| 196 | POST | `/admin/experiences/{experience_id}/request-changes` | `admin_experiences.request_changes` | admin | `tests/_test_experiences__p01.py:791` | GAP | — | 11 |
| 197 | POST | `/admin/experiences/{experience_id}/reject` | `admin_experiences.reject_experience` | admin | `tests/_test_experiences__p01.py:764` | `tests/test_expansion_admin_authz.py:37` (table row) | — | 9 |
| 198 | POST | `/events/{event_id}/registrations` | `registrations.register_for_event` | anonymous | `tests/test_meh2763_registrations.py:116` | n/a | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:18` | 8 |
| 199 | POST | `/experiences/{experience_id}/registrations` | `registrations.register_for_experience` | anonymous | `tests/test_meh2763_registrations.py:230` | n/a | — | 8 |
| 200 | GET | `/events/{event_id}/registrations` | `registrations.list_event_registrations` | registered user | `tests/test_meh2763_registrations.py:309` | `tests/test_meh2763_registrations.py:329` | e2e-mock `frontend/e2e/flows/08-calendar-view.spec.ts:18` | 2 |
| 201 | GET | `/experiences/{experience_id}/registrations` | `registrations.list_experience_registrations` | registered user | `tests/test_meh2763_registrations.py:337` | GAP | — | 4 |
| 202 | PATCH | `/registrations/{registration_id}/attendance` | `registrations.set_registration_attendance` | registered user | `tests/test_meh3315_party_size_attendance.py:85` | `tests/test_meh3315_party_size_attendance.py:128` | — | 6 |
| 203 | GET | `/registrations/{token}` | `registrations.get_registration` | anonymous (token in request) | `tests/test_meh2763_registrations.py:361` | n/a | — | 4 |
| 204 | POST | `/registrations/{token}/cancel` | `registrations.cancel_registration` | anonymous (token in request) | `tests/test_meh2763_registrations.py:365` | n/a | — | 11 |
| 205 | POST | `/producers/me/recipes` | `producer_recipes.create_my_recipe` | business/organizer · verified email | `tests/test_meh1000_recipe_admin_notification.py:153` | `tests/test_meh997_e2e_journeys.py:651` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 7 |
| 206 | GET | `/producers/me/recipes` | `producer_recipes.list_my_recipes` | business/organizer | `tests/test_meh997_e2e_journeys.py:182` | `tests/test_meh997_e2e_journeys.py:653` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 3 |
| 207 | GET | `/producers/me/recipes/{recipe_id}` | `producer_recipes.get_my_recipe` | business/organizer | weak `tests/test_meh997_e2e_journeys.py:725` (only error-path calls) | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 7 |
| 208 | PATCH | `/producers/me/recipes/{recipe_id}` | `producer_recipes.update_my_recipe` | business/organizer | `tests/test_indexnow.py:729` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 11 |
| 209 | DELETE | `/producers/me/recipes/{recipe_id}` | `producer_recipes.delete_my_recipe` | business/organizer | `tests/test_indexnow.py:762` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 10 |
| 210 | GET | `/producers/{slug}/recipes` | `producer_recipes.list_public_recipes` | anonymous | `tests/test_meh2952_is_test_exclusion.py:461` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 211 | GET | `/producers/{slug}/recipes/{recipe_id}` | `producer_recipes.get_public_recipe` | anonymous | `tests/test_meh3342_recipe_old_slug.py:49` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 212 | GET | `/admin/recipes` | `admin_recipes.admin_list_recipes` | admin | `tests/test_meh997_e2e_journeys.py:190` | `tests/test_meh997_e2e_journeys.py:647` | e2e-mock `frontend/e2e/flows/manual/admin-recipes-kebab.spec.ts:172` | 3 |
| 213 | GET | `/admin/recipes/pending` | `admin_recipes.admin_list_pending_recipes` | admin | `tests/test_meh997_e2e_journeys.py:186` | `tests/test_meh997_e2e_journeys.py:648` | — | 3 |
| 214 | POST | `/admin/recipes/{recipe_id}/approve` | `admin_recipes.approve_recipe` | admin | `tests/_test_meh2952_send_layer__p01.py:245` | `tests/test_expansion_admin_authz.py:38` (table row) | — | 9 |
| 215 | POST | `/admin/recipes/{recipe_id}/request-changes` | `admin_recipes.request_recipe_changes` | admin | `tests/test_indexnow.py:540` | GAP | — | 11 |
| 216 | POST | `/admin/recipes/{recipe_id}/reject` | `admin_recipes.reject_recipe` | admin | `tests/test_indexnow.py:540` | `tests/test_expansion_admin_authz.py:39` (table row) | — | 9 |
| 217 | GET | `/admin/producers/{producer_id}/locations` | `admin_producer_locations.admin_list_locations` | admin | `tests/test_admin_locations.py:142` | `tests/test_admin_locations.py:65` | — | 3 |
| 218 | POST | `/admin/producers/{producer_id}/locations` | `admin_producer_locations.admin_create_location` | admin | `tests/test_admin_locations.py:94` | `tests/test_admin_locations.py:66` | — | 5 |
| 219 | PUT | `/admin/producers/{producer_id}/locations/{location_id}` | `admin_producer_locations.admin_update_location` | admin | `tests/test_admin_locations.py:146` | `tests/test_admin_locations.py:103` | — | 5 |
| 220 | DELETE | `/admin/producers/{producer_id}/locations/{location_id}` | `admin_producer_locations.admin_delete_location` | admin | `tests/test_admin_locations.py:155` | `tests/test_admin_locations.py:106` | — | 6 |
| 221 | POST | `/admin/producers/{producer_id}/product-import` | `admin_product_import.admin_import_products` | admin | `tests/test_admin_product_import.py:56` | `tests/test_admin_product_import.py:73` (table row) | — | 5 |
| 222 | GET | `/admin/producers/{producer_id}/product-drafts` | `admin_product_import.admin_list_product_drafts` | admin | `tests/test_admin_product_import.py:201` | `tests/test_admin_product_import.py:74` (table row) | — | 3 |
| 223 | POST | `/admin/producers/{producer_id}/product-drafts/approve` | `admin_product_import.admin_approve_product_drafts` | admin | `tests/test_admin_product_import.py:203` | `tests/test_admin_product_import.py:75` (table row) | — | 7 |
| 224 | DELETE | `/admin/producers/{producer_id}/product-drafts/{product_id}` | `admin_product_import.admin_delete_product_draft` | admin | `tests/test_admin_product_import.py:272` | `tests/test_admin_product_import.py:87` | — | 6 |
| 225 | GET | `/producers/{producer_id}/reviews` | `reviews.list_reviews_nested` | anonymous (optional auth) | `tests/_test_api__p04.py:95` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:101` | 1 |
| 226 | GET | `/reviews` | `reviews.list_reviews` | anonymous (optional auth) | `tests/test_meh3258_review_conflicts.py:84` | n/a | — | 1 |
| 227 | POST | `/producers/{producer_id}/reviews` | `reviews.create_review_nested` | registered user | `tests/_test_api__p04.py:120` | `tests/_test_api__p04.py:112` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:101` | 8 |
| 228 | DELETE | `/reviews/{review_id}` | `reviews.delete_review` | registered user | `tests/test_meh2348_review_hide_sticky.py:84` | GAP | — | 9 |
| 229 | PUT | `/reviews/{review_id}/reply` | `reviews.set_review_reply` | registered user | `tests/_test_meh2952_send_layer__p01.py:269` | GAP | — | 10 |
| 230 | PUT | `/admin/reviews/{review_id}/hide` | `reviews.hide_review` | admin | `tests/test_meh2381_review_edited_after_hidden.py:96` | `tests/test_reviews.py:508` | — | 7 |
| 231 | PUT | `/admin/reviews/{review_id}/unhide` | `reviews.unhide_review` | admin | `tests/test_meh2348_review_hide_sticky.py:92` | `tests/test_meh2348_review_hide_sticky.py:103` | — | 7 |
| 232 | PUT | `/admin/reviews/{review_id}/clear-reply` | `reviews.clear_review_reply` | admin | `tests/test_meh3259_owner_reply_moderation.py:142` | `tests/test_meh3259_owner_reply_moderation.py:161` | — | 5 |
| 233 | GET | `/admin/reviews` | `reviews.admin_list_reviews` | admin | `tests/test_meh2349_review_ai_flag.py:109` | GAP | e2e-mock `frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts:255` | 5 |
| 234 | GET | `/producers/{producer_id}/google-rating` | `google_rating.get_google_rating` | anonymous | `tests/test_google_rating.py:41` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 235 | GET | `/admin/producers/{producer_id}/google-place-candidates` | `google_rating.get_google_place_candidates` | admin | `tests/test_google_rating.py:173` | `tests/test_google_rating.py:223` | — | 3 |
| 236 | PUT | `/admin/producers/{producer_id}/google-place-id` | `google_rating.put_google_place_id` | admin | `tests/test_meh2582_google_place_partial_put.py:19` | GAP | — | 7 |
| 237 | GET | `/search` | `search.smart_search` | anonymous | `tests/test_admin_product_import.py:194` | n/a | e2e-mock `frontend/e2e/visual/badge-overflow-collision.spec.ts:88` | 1 |
| 238 | PATCH | `/users/me` | `users_me.update_profile` | registered user | `tests/_test_api__p04.py:200` | `tests/test_meh3247_own_uploads_only.py:213` | — | 6 |
| 239 | PATCH | `/users/me/password` | `users_me.change_password` | registered user | `tests/test_auth.py:219` | `tests/test_auth.py:174` | — | 9 |
| 240 | POST | `/users/me/verify-phone` | `users_me.send_user_phone_otp` | registered user | `tests/test_meh3302_user_phone_verify.py:62` | GAP | — | 9 |
| 241 | POST | `/users/me/verify-phone/confirm` | `users_me.confirm_user_phone_otp` | registered user | `tests/test_meh3302_user_phone_verify.py:67` | GAP | — | 9 |
| 242 | GET | `/admin/outreach` | `admin_outreach.list_leads` | admin | `tests/test_business_suggestions.py:518` | `tests/test_outreach_prefill_edge_cases.py:572` | — | 3 |
| 243 | POST | `/admin/outreach` | `admin_outreach.create_lead` | admin | `tests/test_outreach_prefill_edge_cases.py:107` | `tests/test_outreach_prefill_edge_cases.py:575` | — | 5 |
| 244 | PATCH | `/admin/outreach/{lead_id}` | `admin_outreach.update_lead` | admin | `tests/test_outreach_prefill_edge_cases.py:541` | `tests/test_outreach_prefill_edge_cases.py:581` | — | 5 |
| 245 | DELETE | `/admin/outreach/{lead_id}` | `admin_outreach.delete_lead` | admin | `tests/test_outreach_prefill_edge_cases.py:554` | `tests/test_expansion_admin_authz.py:40` (table row) | — | 6 |
| 246 | POST | `/admin/outreach/{lead_id}/prefill-token` | `admin_outreach.mint_prefill_token` | admin | `tests/test_outreach_prefill_edge_cases.py:137` | `tests/test_outreach_prefill_edge_cases.py:585` | — | 8 |
| 247 | POST | `/admin/outreach/{lead_id}/thank-suggester` | `admin_outreach.thank_suggester` | admin | `tests/test_business_suggestions.py:687` | `tests/test_business_suggestions.py:808` | — | 7 |
| 248 | GET | `/admin/outreach/metrics/summary` | `admin_outreach.metrics_summary` | admin | `tests/test_business_suggestions.py:630` | `tests/test_outreach_prefill_edge_cases.py:573` | — | 3 |
| 249 | GET | `/register/producer/prefill/{token}` | `admin_outreach.get_prefill` | anonymous (token in request) | `tests/test_meh1724_prefill_rate_limit.py:64` | n/a | — | 4 |
| 250 | GET | `/admin/whatsapp/failed` | `admin_whatsapp.list_failed_outbound` | admin | `tests/test_meh3402_blocked_capture.py:137` | `tests/test_meh_771_chunk_c_admin_whatsapp.py:71` | — | 5 |
| 251 | GET | `/admin/whatsapp/blocked` | `admin_whatsapp.list_blocked_outbound` | admin | `tests/test_meh3402_blocked_capture.py:70` | `tests/test_meh3402_blocked_capture.py:145` | — | 5 |
| 252 | POST | `/chat` | `chat.chat` | anonymous | weak `tests/test_meh3010_chat_global_cap.py:71` (only error-path calls) | n/a | — | 6 |
| 253 | POST | `/business-suggestions` | `business_suggestions.submit_business_suggestion` | anonymous (optional auth) | `tests/test_business_suggestions.py:64` | n/a | — | 6 |
| 254 | POST | `/category-requests` | `category_requests.submit_category_request` | anonymous (optional auth) | `tests/_test_api__p05.py:231` | n/a | — | 6 |
| 255 | GET | `/admin/category-requests` | `category_requests.list_category_requests` | admin | `tests/_test_api__p05.py:251` | `tests/_test_api__p05.py:284` | — | 3 |
| 256 | PATCH | `/admin/category-requests/{request_id}` | `category_requests.review_category_request` | admin | `tests/_test_api__p05.py:271` | `tests/_test_api__p05.py:299` | — | 5 |
| 257 | POST | `/producers/me/name-change-requests` | `producer_name_requests.request_name_change` | registered user | `tests/test_meh3271_prelaunch_security.py:240` | `tests/test_producer_name_change_requests.py:160` | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 4 |
| 258 | GET | `/producers/me/name-change-requests` | `producer_name_requests.list_own_name_change_requests` | registered user | `tests/test_meh3271_prelaunch_security.py:248` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 4 |
| 259 | GET | `/admin/name-change-requests` | `producer_name_requests.list_name_change_requests` | admin | weak `tests/test_producer_name_change_requests.py:194` (only refused calls) | `tests/test_producer_name_change_requests.py:197` | — | 5 |
| 260 | PATCH | `/admin/name-change-requests/{request_id}` | `producer_name_requests.review_name_change_request` | admin | `tests/test_producer_name_change_requests.py:61` | `tests/test_meh3271_prelaunch_security.py:254` | — | 5 |
| 261 | GET | `/group-buys` | `group_buys.list_group_buys` | anonymous | `tests/_test_group_buys_api__p01.py:36` | n/a | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:270` | 1 |
| 262 | GET | `/group-buys/counts` | `group_buys.count_group_buys_by_status` | anonymous | `tests/test_meh3128_group_buy_counts.py:32` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 1 |
| 263 | GET | `/group-buys/{group_buy_id}` | `group_buys.get_group_buy` | anonymous (optional auth) | `tests/_test_group_buys_api__p01.py:83` | n/a | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 1 |
| 264 | POST | `/group-buys/{group_buy_id}/commit` | `group_buys.commit_to_group_buy` | registered user | `tests/_test_group_buys_api__p01.py:190` | `tests/_test_group_buys_api__p01.py:574` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 11 |
| 265 | DELETE | `/group-buys/{group_buy_id}/commit` | `group_buys.cancel_commit` | registered user | `tests/_test_group_buys_api__p01.py:196` | `tests/test_meh2943_group_buy_commit_scoping.py:225` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 10 |
| 266 | POST | `/group-buys` | `group_buys.create_group_buy` | business (organizer refused) · verified email | `tests/_test_group_buys_api__p01.py:293` | `tests/_test_group_buys_api__p01.py:301` | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:270` | 5 |
| 267 | PATCH | `/group-buys/{group_buy_id}/status` | `group_buys.update_group_buy_status` | registered user | `tests/_test_group_buys_api__p02.py:555` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 10 |
| 268 | GET | `/admin/group-buys` | `group_buys.admin_list_group_buys` | admin | GAP | GAP | — | 9 |
| 269 | PATCH | `/admin/group-buys/{group_buy_id}/status` | `group_buys.admin_update_status` | admin | `tests/_test_group_buys_api__p02.py:696` | GAP | — | 9 |
| 270 | GET | `/producers/me/group-buys` | `group_buys.list_my_group_buys` | business/organizer | `tests/_test_group_buys_api__p01.py:217` | `tests/_test_group_buys_api__p01.py:250` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:132` | 3 |
| 271 | GET | `/users/me/favorites/{producer_id}/alerts` | `alerts.get_alert_prefs` | registered user | `tests/test_alerts.py:62` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:63` | 4 |
| 272 | PUT | `/users/me/favorites/{producer_id}/alerts` | `alerts.upsert_alert_prefs` | registered user | `tests/test_alerts.py:103` | GAP | e2e-mock `frontend/e2e/flows/28-register-success-state.spec.ts:63` | 6 |
| 273 | GET | `/admin/kashrut` | `admin_kashrut.list_kashrut_requests` | admin | `tests/test_trust_ladder.py:251` | `tests/test_trust_ladder.py:268` | — | 3 |
| 274 | POST | `/admin/kashrut/{request_id}/approve` | `admin_kashrut.approve_kashrut_request` | admin | `tests/test_meh2518_kashrut_real_expiry.py:45` | `tests/test_expansion_admin_authz.py:33` (table row) | — | 9 |
| 275 | POST | `/admin/kashrut/{request_id}/reject` | `admin_kashrut.reject_kashrut_request` | admin | `tests/test_meh2518_kashrut_real_expiry.py:229` | `tests/test_expansion_admin_authz.py:34` (table row) | — | 9 |
| 276 | POST | `/admin/kashrut/{request_id}/revoke` | `admin_kashrut.revoke_kashrut_badge` | admin | `tests/test_meh2518_kashrut_real_expiry.py:149` | `tests/test_expansion_admin_authz.py:35` (table row) | — | 7 |
| 277 | POST | `/admin/kashrut/expiry-reminders` | `admin_kashrut.kashrut_expiry_reminders` | admin | `tests/_test_meh2952_send_layer__p01.py:417` | `tests/test_meh1673_kashrut_expiry_reminders.py:206` | — | 7 |
| 278 | GET | `/admin/checklist-items` | `admin_checklist.list_checklist_items` | admin | `tests/test_admin_checklist.py:215` | `tests/test_admin_checklist.py:629` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:213` | 3 |
| 279 | PUT | `/admin/checklist-items` | `admin_checklist.save_checklist_items` | admin | `tests/test_admin_checklist.py:61` | `tests/test_admin_checklist.py:614` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:213` | 5 |
| 280 | GET | `/admin/producers/{producer_id}/review-checks` | `admin_checklist.get_review_checks` | admin | `tests/test_admin_checklist.py:265` | `tests/test_admin_checklist.py:615` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:215` | 3 |
| 281 | PUT | `/admin/producers/{producer_id}/review-checks` | `admin_checklist.save_review_checks` | admin | `tests/test_admin_checklist.py:251` | `tests/test_admin_checklist.py:616` (table row) | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:215` | 5 |
| 283 | GET | `/health/ai` | `health.ai_health` | anonymous | `tests/test_ai_health_probe.py:141` | n/a | — | 1 |
| 291 | GET | `/push-vapid-key` | `system.get_vapid_public_key` | anonymous | weak `tests/test_meh1979_public_rate_limits.py:66` (path literal) | n/a | — | 3 |
| 292 | GET | `/holiday-mode` | `holiday_mode.get_holiday_mode` | anonymous | `tests/test_holiday_mode.py:17` | n/a | — | 1 |
| 295 | POST | `/rescue/offers` | `rescue.create_offer` | business/organizer · flag: rescue, verified email | `tests/test_meh2679_rescue_utc_times.py:66` | `tests/test_rescue_pilot.py:96` | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:271` | 7 |
| 296 | GET | `/rescue/offers` | `rescue.list_offers` | anonymous · flag: rescue | `tests/test_meh2679_rescue_utc_times.py:61` | n/a | e2e-mock `frontend/e2e/flows/37-outreach-prefill.spec.ts:271` | 1 |
| 297 | GET | `/rescue/offers/{offer_id}` | `rescue.get_offer` | anonymous · flag: rescue | `tests/test_meh3586_rescue_offer_detail.py:27` | n/a | — | 1 |
| 298 | POST | `/rescue/offers/{offer_id}/cancel` | `rescue.cancel_offer` | registered user · flag: rescue | `tests/test_meh2738_rescue_business_cancel.py:46` | `tests/test_meh2943_rescue_idor.py:527` | — | 8 |
| 299 | GET | `/rescue/orders/mine` | `rescue.list_my_reservations` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:49` | `tests/test_meh2680_rescue_my_orders.py:35` | e2e-mock `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:129` | 2 |
| 300 | GET | `/rescue/orders/history` | `rescue.list_my_reservation_history` | registered user · flag: rescue | `tests/test_meh3698_rescue_history.py:44` | `tests/test_meh3698_rescue_history.py:36` | — | 2 |
| 301 | POST | `/rescue/orders` | `rescue.create_order` | registered user · flag: rescue, verified email | `tests/test_meh2679_rescue_utc_times.py:77` | GAP | — | 11 |
| 302 | POST | `/rescue/orders/{order_id}/handed` | `rescue.mark_handed` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:65` | `tests/test_rescue.py:404` | — | 9 |
| 303 | POST | `/rescue/orders/{order_id}/no_show` | `rescue.mark_no_show` | registered user · flag: rescue | `tests/test_rescue.py:444` | `tests/test_rescue.py:442` | — | 9 |
| 304 | POST | `/rescue/orders/{order_id}/no-show` | `rescue.mark_no_show` | registered user · flag: rescue | `tests/test_meh2943_rescue_idor.py:342` | `tests/test_meh2943_rescue_idor.py:325` | — | 9 |
| 305 | POST | `/rescue/orders/{order_id}/cancel` | `rescue.cancel_order` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:88` | `tests/test_meh2943_rescue_idor.py:178` | — | 11 |
| 306 | POST | `/rescue/orders/{order_id}/review` | `rescue.create_review` | registered user · flag: rescue | `tests/test_meh2680_rescue_my_orders.py:71` | `tests/test_meh2943_rescue_idor.py:425` | — | 9 |
| 307 | POST | `/admin/rescue/users/{user_id}/clear-block` | `rescue.clear_no_show_block` | admin · flag: rescue | `tests/test_meh3225_no_show_tombstones.py:132` | `tests/test_rescue.py:782` | — | 5 |
| 308 | GET | `/admin/rescue/metrics` | `rescue.pilot_metrics` | admin · flag: rescue | `tests/test_meh2703_rescue_donated.py:143` | `tests/test_rescue_pilot.py:317` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:196` | 3 |
| 309 | GET | `/producers/me/rescue/orders` | `rescue.list_my_orders` | business/organizer · flag: rescue | `tests/test_meh2679_rescue_utc_times.py:84` | `tests/test_rescue_pilot.py:250` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 3 |
| 310 | GET | `/producers/me/rescue/offers` | `rescue.list_my_offers` | business/organizer · flag: rescue | `tests/test_meh2703_rescue_donated.py:43` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 311 | PUT | `/producers/me/rescue/offers/{offer_id}/donated` | `rescue.set_donated` | business/organizer · flag: rescue | `tests/test_meh2703_rescue_donated.py:82` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 9 |
| 312 | GET | `/producers/me/rescue/typical-items` | `rescue.get_typical_items` | business/organizer · flag: rescue | `tests/test_meh2752_rescue_allergens.py:78` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 313 | PUT | `/producers/me/rescue/typical-items` | `rescue.set_typical_items` | business/organizer · flag: rescue | `tests/test_meh2752_rescue_allergens.py:68` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 7 |
| 314 | GET | `/producers/me/rescue/pilot-locations` | `rescue_pilot.my_pilot_locations` | business/organizer | `tests/test_meh2921_rescue_pilot_locations.py:59` | `tests/test_meh2921_rescue_pilot_locations.py:82` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 3 |
| 315 | GET | `/producers/me/order-settings` | `product_orders.get_my_order_settings` | business/organizer | `tests/test_meh3216_business_id.py:67` | `tests/test_meh3218_product_orders.py:424` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:8` | 3 |
| 316 | PUT | `/producers/me/order-settings` | `product_orders.put_my_order_settings` | business/organizer | `tests/test_meh3216_business_id.py:25` | `tests/test_meh3218_product_orders.py:422` | e2e-mock `frontend/e2e/flows/34-draft-submit-review.spec.ts:8` | 5 |
| 317 | GET | `/admin/producers/{producer_id}/order-settings` | `product_orders.get_order_settings_as_admin` | admin | `tests/test_meh3218_product_orders.py:562` | `tests/test_meh3218_product_orders.py:590` | e2e-mock `frontend/e2e/flows/manual/admin-producer-form-licence.spec.ts:240` | 3 |
| 318 | PUT | `/admin/producers/{producer_id}/order-settings/alcohol` | `product_orders.set_alcohol_licensed` | admin | `tests/test_meh3218_product_orders.py:456` | `tests/test_meh3218_product_orders.py:447` | — | 5 |
| 319 | GET | `/producers/me/order-windows` | `product_order_offer.get_my_order_windows` | business/organizer | `tests/test_meh3262_order_windows.py:310` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 5 |
| 320 | PUT | `/producers/me/order-windows` | `product_order_offer.put_my_order_windows` | business/organizer | `tests/test_meh3262_order_windows.py:304` | GAP | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 7 |
| 321 | GET | `/producers/me/products/ordering` | `product_order_offer.get_my_products_ordering` | business/organizer | `tests/test_meh3262_order_windows.py:532` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 5 |
| 322 | PUT | `/producers/me/products/{product_id}/ordering` | `product_order_offer.put_product_ordering` | business/organizer | `tests/test_meh2936_product_unit.py:204` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:133` | 9 |
| 323 | GET | `/producers/me/order-menu/preview` | `product_order_offer.get_my_order_menu_preview` | business/organizer | `tests/test_meh3746_order_menu_preview.py:61` | `tests/test_meh3746_order_menu_preview.py:113` | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 3 |
| 324 | GET | `/producers/{producer_id}/order-menu` | `product_order_offer.get_order_menu` | anonymous | `tests/test_meh2312_drafts_not_orderable.py:36` | n/a | e2e-mock `frontend/e2e/flows/manual/producers.spec.ts:336` | 1 |
| 325 | PUT | `/products/{product_id}/variants` | `product_variants.put_product_variants` | registered user | `tests/test_meh3617_product_variants.py:258` | GAP | — | 8 |
| 326 | POST | `/product-orders/phone-code` | `product_order_buyer.send_order_phone_code` | anonymous | `tests/_test_meh3263_order_route__common.py:136` | n/a | — | 6 |
| 327 | POST | `/product-orders` | `product_order_buyer.send_order` | anonymous (optional auth) | `tests/_test_meh3263_order_route__p01.py:327` | n/a | — | 4 |
| 328 | POST | `/product-orders/quote` | `product_order_buyer.quote_order_route` | anonymous | `tests/test_meh3216_order_quote.py:27` | n/a | — | 4 |
| 329 | POST | `/product-orders/status` | `product_order_buyer.read_order_status` | anonymous (optional auth) | `tests/_test_meh3263_order_route__p01.py:710` | n/a | — | 4 |
| 330 | POST | `/product-orders/status/cancel` | `product_order_buyer.cancel_own_order` | anonymous (optional auth) | `tests/_test_meh3263_order_route__p01.py:856` | n/a | — | 4 |
| 331 | POST | `/product-orders/status/accept-change` | `product_order_buyer.accept_proposed_change` | anonymous (optional auth) | `tests/_test_meh3263_order_route__p02.py:65` | n/a | — | 4 |
| 332 | GET | `/users/me/product-orders` | `product_order_buyer.list_own_orders` | registered user | `tests/_test_meh3263_order_route__p01.py:370` | `tests/_test_meh3263_order_route__p01.py:375` | — | 2 |
| 333 | GET | `/producers/me/product-orders` | `product_order_business.list_business_orders` | business/organizer | `tests/_test_meh3263_order_route__p01.py:887` | `tests/_test_meh3263_order_route__p01.py:897` | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:19` | 3 |
| 334 | GET | `/producers/me/product-orders/customers` | `product_order_business.list_business_customers` | business/organizer | `tests/test_meh3561_order_customers.py:35` | `tests/test_meh3561_order_customers.py:126` | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:19` | 3 |
| 335 | POST | `/producers/me/product-orders/{order_id}/confirm` | `product_order_business.confirm_order` | business/organizer | `tests/_test_meh3263_order_route__p01.py:932` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:19` | 9 |
| 336 | POST | `/producers/me/product-orders/{order_id}/propose-change` | `product_order_business.propose_order_change` | business/organizer | `tests/_test_meh3263_order_route__p01.py:647` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:19` | 9 |
| 337 | POST | `/producers/me/product-orders/{order_id}/handed` | `product_order_business.hand_order_over` | business/organizer | `tests/_test_meh3263_order_route__p02.py:110` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:19` | 9 |
| 338 | POST | `/producers/me/product-orders/{order_id}/no-show` | `product_order_business.report_no_show` | business/organizer | `tests/_test_meh3263_order_route__p02.py:131` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:19` | 9 |
| 339 | POST | `/producers/me/product-orders/{order_id}/decline` | `product_order_business.decline_order` | business/organizer | `tests/test_meh3296_order_notifications.py:221` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:19` | 9 |
| 340 | POST | `/producers/me/product-orders/{order_id}/ready` | `product_order_business.ready_order` | business/organizer | `tests/_test_meh3263_order_route__p02.py:101` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:19` | 9 |
| 341 | POST | `/producers/me/product-orders/{order_id}/cancel` | `product_order_business.cancel_order` | business/organizer | `tests/_test_meh3263_order_route__p02.py:145` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-availability.spec.ts:19` | 9 |
| 342 | PATCH | `/group-buys/{group_buy_id}/commit` | `group_buy_capacity.update_commit` | registered user | `tests/test_meh3592_group_buy_capacity.py:126` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 11 |
| 343 | POST | `/group-buys/{group_buy_id}/waitlist` | `group_buy_capacity.join_waitlist` | registered user | `tests/test_meh3592_group_buy_capacity.py:177` | `tests/test_meh3691_no_self_buying.py:108` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 6 |
| 344 | DELETE | `/group-buys/{group_buy_id}/waitlist` | `group_buy_capacity.leave_waitlist` | registered user | `tests/test_meh3592_group_buy_capacity.py:219` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 9 |
| 345 | PATCH | `/group-buys/{group_buy_id}/settings` | `group_buy_capacity.update_group_buy_settings` | registered user | `tests/test_meh3592_group_buy_capacity.py:85` | `tests/test_meh3592_group_buy_capacity.py:113` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 8 |
| 346 | GET | `/users/me/group-buys` | `group_buy_mine.list_own_group_buys` | registered user | `tests/test_meh3609_my_group_buys.py:23` | `tests/test_meh3609_my_group_buys.py:18` | — | 2 |
| 347 | GET | `/producers/me/group-buys/{group_buy_id}/pickups` | `group_buy_pickup.list_pickups` | registered user | `tests/test_meh3735_group_buy_no_show.py:92` | `tests/test_meh3735_group_buy_no_show.py:109` | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:132` | 2 |
| 348 | POST | `/group-buys/{group_buy_id}/commits/{commit_id}/handed` | `group_buy_pickup.mark_group_buy_handed` | registered user | `tests/test_meh3735_group_buy_no_show.py:132` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 8 |
| 349 | POST | `/group-buys/{group_buy_id}/commits/{commit_id}/no-show` | `group_buy_pickup.mark_group_buy_no_show` | registered user | `tests/test_meh3735_group_buy_no_show.py:67` | GAP | e2e-mock `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:382` | 8 |
| 350 | POST | `/admin/group-buys/users/{user_id}/clear-block` | `group_buy_pickup.clear_group_buy_block` | admin | `tests/test_meh3735_group_buy_no_show.py:233` | `tests/test_meh3735_group_buy_no_show.py:232` | — | 5 |
| 351 | GET | `/users/me/orders/any` | `my_orders_any.has_any_orders` | registered user | `tests/test_meh3698_orders_any.py:35` | `tests/test_meh3698_orders_any.py:60` | e2e-mock `frontend/e2e/flows/manual/admin-dashboard-analytics.spec.ts:198` | 2 |

### Internal routes (allowlisted — not actor actions)

| # | Method | Path | Handler | Reason | Test |
|---|---|---|---|---|---|
| 282 | GET | `/health/places` | `health.places_health` | Google Places key probe for a cron / uptime monitor (MEH-2482) | `tests/test_meh2482_health_places.py:33` |
| 284 | HEAD | `/health/liveness` | `health.liveness` | Railway liveness probe — no actor action | `tests/test_health.py:16` |
| 285 | GET | `/health/liveness` | `health.liveness` | Railway liveness probe — no actor action | `tests/test_health.py:10` |
| 286 | HEAD | `/health/readiness` | `health.readiness` | Railway readiness probe — no actor action | weak `tests/test_health.py:25` (path literal) |
| 287 | GET | `/health/readiness` | `health.readiness` | Railway readiness probe — no actor action | `tests/test_health.py:25` |
| 288 | HEAD | `/health` | `health.health_alias` | uptime / Railway probe alias — no actor action | weak `tests/_test_producer_owner_invite__p03.py:340` (path literal) |
| 289 | GET | `/health` | `health.health_alias` | uptime / Railway probe alias — no actor action | `tests/test_health.py:74` |
| 290 | GET | `/` | `system.root` | service banner (system.root) — no actor action | GAP |
| 293 | GET | `/webhook/whatsapp` | `whatsapp_webhook.webhook_challenge` | Meta webhook — the caller is Meta, HMAC-verified in the handler, not a user | `tests/test_meh_509_pr2c_webhook.py:170` |
| 294 | POST | `/webhook/whatsapp` | `whatsapp_webhook.webhook_receive` | Meta webhook — the caller is Meta, HMAC-verified in the handler, not a user | `tests/test_meh_509_pr2c_webhook.py:247` |
| — | GET | `/docs` | — | FastAPI-generated Swagger UI | n/a |
| — | GET | `/docs/oauth2-redirect` | — | FastAPI-generated Swagger OAuth redirect | n/a |
| — | GET | `/openapi.json` | — | FastAPI-generated schema | n/a |
| — | GET | `/redoc` | — | FastAPI-generated ReDoc | n/a |

## Business tools (`frontend/lib/business-features.js`)

| Tool | Group | Status | Dashboard | Backend | Unit (import) | E2E page | Verdict |
|---|---|---|---|---|---|---|---|
| `gallery_story` | page | live | — | n/a | `frontend/__tests__/OwnerCard.test.jsx:14` | n/a | covered |
| `page_fill` | page | live | — | n/a | `frontend/__tests__/PageFill.test.jsx:14` | n/a | covered |
| `product_details` | page | live | — | n/a | `frontend/__tests__/DietDefinitions.test.jsx:31` | n/a | covered |
| `top_product` | page | live | — | n/a | `frontend/__tests__/OrderCartRows.test.jsx:78` | n/a | covered |
| `hours` | page | live | — | n/a | `frontend/__tests__/LocationHoursField.test.jsx:15` | n/a | covered |
| `vacation_mode` | page | live | — | n/a | `frontend/__tests__/ProducerHeaderAlertsReentry.test.jsx:101` | n/a | covered |
| `map_precision` | page | live | — | n/a | `frontend/__tests__/producerPoints.test.js:2` | n/a | covered |
| `multi_locations` | page | live | — | n/a | `frontend/__tests__/LocationFormDisclosure.test.jsx:25` | n/a | covered |
| `draft_claim` | page | live | — | `tests/test_meh2496_claim_link_sent_at.py:65` (6/6 routes in file) | `frontend/__tests__/AdminClaimLink.test.jsx:18` | n/a | covered |
| `ai_writer` | page | live | — | `tests/_test_api__p03.py:410` (imports module) | weak `frontend/__tests__/ButtonPrimitiveGuard.test.js:43` (names the file) | n/a | covered |
| `guides` | page | live | — | n/a | `frontend/__tests__/TitlesGuidesCopy.test.jsx:47` | GAP | covered |
| `social_signup` | page | live | — | `tests/_test_api__p06.py:79` (14/14 routes in file) | `frontend/__tests__/AuthPagesAuthedRedirect.test.jsx:4` | n/a | covered |
| `wa_approval` | page | live | — | `tests/_test_meh2952_send_layer__common.py:31` (imports module) | n/a | n/a | covered |
| `onboarding_emails` | page | live | — | `tests/test_meh1965_email_copy_contract.py:82` (imports module) | n/a | n/a | covered |
| `vanity_link` | found | live | — | n/a | GAP | n/a | GAP |
| `discovery` | found | live | — | n/a | `frontend/__tests__/DietLandingPage.test.jsx:88` | GAP | covered |
| `similar_businesses` | found | live | — | n/a | `frontend/__tests__/OrderCartRows.test.jsx:78` | n/a | covered |
| `share_cards` | found | live | — | n/a | `frontend/__tests__/ReviewCardLayout.test.jsx:3` | n/a | covered |
| `qr_code` | found | live | `/producer/dashboard/share` | n/a | `frontend/__tests__/BusinessQr.test.js:9` | `frontend/e2e/flows/manual/dashboard-vanity-share.spec.ts:100` | covered |
| `google_profile` | found | live | `/producer/dashboard/google-profile` | `tests/test_meh3641_owner_google_profile.py:91` (4/4 routes in file) | `frontend/__tests__/GoogleProfileTool.test.jsx:11` | GAP | covered |
| `structured_data` | found | live | — | n/a | `frontend/__tests__/BusinessQr.test.js:8` | n/a | covered |
| `primary_cta` | contact | live | — | n/a | `frontend/__tests__/ContactCard.test.jsx:72` | n/a | covered |
| `wa_prefill` | contact | live | — | n/a | `frontend/__tests__/ContactCard.test.jsx:72` | n/a | covered |
| `product_wa` | contact | live | — | n/a | `frontend/__tests__/ProducerSectionsProducts.test.jsx:105` | n/a | covered |
| `faq_answers` | contact | live | — | n/a | `frontend/__tests__/BadgeRequestLine.test.jsx:7` | `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:186` | covered |
| `delivery_areas` | contact | live | — | n/a | `frontend/__tests__/LocationFormDisclosure.test.jsx:25` | n/a | covered |
| `delivery_checker` | contact | live | — | n/a | `frontend/__tests__/CoverageRequestCta.test.jsx:49` | n/a | covered |
| `product_orders` | contact | live | — | `tests/_test_meh3263_order_route__common.py:136` (7/7 routes in file) | `frontend/__tests__/OrderMenuPreview.test.jsx:12` | n/a | covered |
| `wa_group` | contact | live | — | n/a | `frontend/__tests__/ContactCard.test.jsx:72` | n/a | covered |
| `nav_buttons` | contact | live | — | n/a | GAP | n/a | GAP |
| `save_share` | contact | live | — | n/a | `frontend/__tests__/EntityRegistryGuard.test.js:85` | n/a | covered |
| `offer` | return | live | `/producer/dashboard/offer` | n/a | `frontend/__tests__/OfferBadge.test.jsx:13` | `frontend/e2e/flows/manual/dashboard-offer-groupbuy.spec.ts:119` | covered |
| `group_buys` | return | live | `/producer/dashboard/group-buys` | n/a | `frontend/__tests__/GroupBuyCardFulfillment.test.jsx:10` | `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:383` | covered |
| `events` | return | live | `/producer/dashboard/events` | n/a | `frontend/__tests__/EventsCategoryChipContrast.test.jsx:3` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:303` | covered |
| `experiences` | return | live | `/producer/dashboard/experiences` | n/a | `frontend/__tests__/HubMetadataNoindex.test.js:28` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:261` | covered |
| `recipes` | return | live | `/producer/dashboard/recipes` | weak `tests/test_meh1000_recipe_admin_notification.py:153` (6/7 routes in file) | `frontend/__tests__/RecipeResolverErrorSeparation.test.jsx:42` | GAP | weak (capped by its router) |
| `follower_updates` | return | live | `/producer/dashboard/insights` | n/a | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:634` | covered |
| `waitlist` | return | live | — | `tests/test_delivery_waitlist.py:21` (imports module) | `frontend/__tests__/DeliveryWaitlistForm.test.jsx:71` | n/a | covered |
| `rescue_bags` | return | live | `/producer/dashboard/rescue` | n/a | `frontend/__tests__/OfferCardOneOwnerGuard.test.jsx:41` | GAP | covered |
| `verified_badge` | trust | live | — | n/a | `frontend/__tests__/AdminProducersTableTags.test.jsx:22` | n/a | covered |
| `kashrut_verified` | trust | live | — | n/a | `frontend/__tests__/AdminKashrutPage.test.jsx:5` | GAP | covered |
| `editor_pick` | trust | live | — | n/a | `frontend/__tests__/featuredProducer.test.js:2` | n/a | covered |
| `reservist_diet_tags` | trust | live | — | n/a | `frontend/__tests__/ReservistBadgeLine.test.jsx:18` | n/a | covered |
| `reviews_contacted` | trust | live | `/producer/dashboard/reviews` | `tests/_test_api__p04.py:95` (9/9 routes in file) | `frontend/__tests__/ReviewReplySuggest.test.jsx:11` | GAP | covered |
| `review_request` | trust | live | — | n/a | `frontend/__tests__/RequestReviewCard.test.jsx:18` | n/a | covered |
| `views` | insights | live | — | `tests/_test_api__p05.py:461` (10/10 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:634` | covered |
| `search_impressions` | insights | live | — | `tests/_test_api__p05.py:461` (10/10 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:634` | covered |
| `contact_clicks` | insights | live | — | `tests/_test_api__p05.py:461` (10/10 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:634` | covered |
| `favorites_rating` | insights | live | — | `tests/_test_api__p05.py:461` (10/10 routes in file) | n/a | n/a | covered |
| `top_cities` | insights | live | — | `tests/_test_api__p05.py:461` (10/10 routes in file) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:634` | covered |
| `demand_cities` | insights | live | — | n/a | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:634` | covered |
| `drop_point_hosts` | insights | live | — | `tests/test_delivery_waitlist.py:21` (imports module) | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:634` | covered |
| `email_alerts` | insights | live | — | `tests/_test_meh2952_send_layer__common.py:29` (imports module) | n/a | n/a | covered |
| `completeness` | insights | live | — | n/a | `frontend/__tests__/CompletenessFieldsMessages.test.jsx:12` | n/a | covered |

## Pages (`frontend/app/[locale]/**/page.*`)

### Public

| Route | E2E (`goto`) | Unit (import) | Verdict |
|---|---|---|---|
| `/events` | `frontend/e2e/flows/08-calendar-view.spec.ts:40` | `frontend/__tests__/HubMetadataNoindex.test.js:27` | covered |
| `/experiences` | GAP | `frontend/__tests__/HubMetadataNoindex.test.js:28` | covered |
| `/[slug]` | `frontend/e2e/flows/00-producer-fixture-probe-origin.spec.ts:111` | `frontend/__tests__/BusinessPageUntranslatedMeta.test.js:37` | covered |
| `/[slug]/recipes/[recipe_id]` | GAP | `frontend/__tests__/RecipeResolverErrorSeparation.test.jsx:42` | covered |
| `/about/badges` | GAP | `frontend/__tests__/title-pattern.test.js:139` | covered |
| `/about/for-businesses/guides/business-story` | GAP | `frontend/__tests__/title-pattern.test.js:182` | covered |
| `/about/for-businesses/guides/customer-messages` | GAP | `frontend/__tests__/title-pattern.test.js:183` | covered |
| `/about/for-businesses/guides` | GAP | `frontend/__tests__/TitlesGuidesCopy.test.jsx:47` | covered |
| `/about/for-businesses/guides/product-photography` | `frontend/e2e/flows/manual/hebrew-typography.spec.ts:102` | `frontend/__tests__/title-pattern.test.js:184` | covered |
| `/about/for-businesses` | `frontend/e2e/flows/manual/join.spec.ts:235` | `frontend/__tests__/BusinessFaqClosedOnLoad.test.jsx:36` | covered |
| `/about` | `frontend/e2e/flows/13-static-pages-render.spec.ts:8` | `frontend/__tests__/title-pattern.test.js:135` | covered |
| `/about/process` | `frontend/e2e/flows/manual/hebrew-typography.spec.ts:57` | `frontend/__tests__/title-pattern.test.js:136` | covered |
| `/about/why-local` | GAP | `frontend/__tests__/EditorialPagePhotos.test.jsx:42` | covered |
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
| `/experiences/[id]` | weak `frontend/e2e/flows/manual/auth.spec.ts:544` (only a guest-redirect check) | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:69` | covered |
| `/favorites` | `frontend/e2e/flows/08-calendar-view.spec.ts:97` | `frontend/__tests__/title-pattern.test.js:169` | covered |
| `/forgot-password` | `frontend/e2e/flows/30-login-journey-c.spec.ts:555` | `frontend/__tests__/title-pattern.test.js:166` | covered |
| `/freshness/confirm` | GAP | GAP | GAP |
| `/group-buys/[id]` | GAP | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:70` | covered |
| `/group-buys` | `frontend/e2e/flows/46-hub-tab-switch.spec.ts:180` | `frontend/__tests__/HubMetadataNoindex.test.js:29` | covered |
| `/join` | `frontend/e2e/flows/manual/join.spec.ts:131` | `frontend/__tests__/EditorialPagePhotos.test.jsx:40` | covered |
| `/join/pricing` | GAP | `frontend/__tests__/PricingPageRescueFlag.test.jsx:32` | covered |
| `/login` | `frontend/e2e/flows/09-login-console-clean.spec.ts:27` | `frontend/__tests__/title-pattern.test.js:163` | covered |
| `/map` | `frontend/e2e/flows/05-map-navigation.spec.ts:22` | `frontend/__tests__/title-pattern.test.js:134` | covered |
| `/messages` | GAP | `frontend/__tests__/title-pattern.test.js:174` | covered |
| `/my-group-buys` | GAP | GAP | GAP |
| `/my-orders` | GAP | GAP | GAP |
| `/newsletter/confirm` | GAP | GAP | GAP |
| `/newsletter/unsubscribe` | GAP | `frontend/__tests__/title-pattern.test.js:176` | covered |
| `/order/[id]` | GAP | `frontend/__tests__/OrderStatusPage.test.jsx:19` | covered |
| `/organizers/[slug]` | GAP | `frontend/__tests__/OrganizerPage.test.jsx:50` | covered |
| `/owner-invite/[token]` | `frontend/e2e/flows/46-owner-invite.spec.ts:323` | GAP | covered |
| `/owner-invite` | GAP | GAP | GAP |
| `/p/[slug]` | GAP | `frontend/__tests__/VanityRedirectKeepsQuery.test.js:16` | covered |
| `/` | `frontend/e2e/flows/01-home-load.spec.ts:5` | GAP | covered |
| `/privacy` | GAP | `frontend/__tests__/title-pattern.test.js:160` | covered |
| `/producer/[id]` | `frontend/e2e/flows/12-axe-a11y.spec.ts:112` | `frontend/__tests__/EntityResolverErrorSeparation.test.jsx:71` | covered |
| `/producers/[category]/[region]` | GAP | `frontend/__tests__/RegionLandingPage.test.jsx:67` | covered |
| `/producers/diet/[dietSlug]` | GAP | `frontend/__tests__/DietLandingPage.test.jsx:88` | covered |
| `/producers` | `frontend/e2e/flows/03-view-producer-detail.spec.ts:46` | `frontend/__tests__/LaunchHardening.test.jsx:75` | covered |
| `/recommend` | `frontend/e2e/flows/manual/share.spec.ts:117` | `frontend/__tests__/RecommendNoindex.test.js:25` | covered |
| `/register/organizer` | GAP | `frontend/__tests__/RegisterOrganizerMeta.test.js:18` | covered |
| `/register` | `frontend/e2e/flows/09-login-console-clean.spec.ts:146` | `frontend/__tests__/title-pattern.test.js:164` | covered |
| `/register/producer` | `frontend/e2e/flows/10-producer-oauth-409.spec.ts:39` | `frontend/__tests__/RegisterProducerShareMeta.test.js:18` | covered |
| `/registration/[token]` | GAP | `frontend/__tests__/title-pattern.test.js:180` | covered |
| `/rescue/[offerId]` | GAP | GAP | GAP |
| `/rescue` | GAP | `frontend/__tests__/title-pattern.test.js:175` | covered |
| `/reset-password` | `frontend/e2e/flows/11-password-policy.spec.ts:144` | `frontend/__tests__/title-pattern.test.js:167` | covered |
| `/settings` | `frontend/e2e/flows/11-password-policy.spec.ts:202` | `frontend/__tests__/MobileNoOuterCard.test.jsx:36` | covered |
| `/terms` | GAP | `frontend/__tests__/title-pattern.test.js:141` | covered |
| `/unsubscribe/weekly` | GAP | `frontend/__tests__/title-pattern.test.js:178` | covered |
| `/verify-email` | GAP | `frontend/__tests__/title-pattern.test.js:168` | covered |

### Dashboard

| Route | E2E (`goto`) | Unit (import) | Verdict |
|---|---|---|---|
| `/producer/dashboard/edit` | `frontend/e2e/flows/manual/dashboard-delivery.spec.ts:186` | `frontend/__tests__/BadgeRequestLine.test.jsx:7` | covered |
| `/producer/dashboard/events/[id]/edit` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:303` | GAP | covered |
| `/producer/dashboard/events/new` | GAP | `frontend/__tests__/EventExperienceAddress.test.jsx:76` | covered |
| `/producer/dashboard/events` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:179` | `frontend/__tests__/ManageEventsPage.test.jsx:48` | covered |
| `/producer/dashboard/experiences/[id]/edit` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:310` | GAP | covered |
| `/producer/dashboard/experiences/new` | GAP | `frontend/__tests__/EventExperienceAddress.test.jsx:121` | covered |
| `/producer/dashboard/experiences` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:261` | `frontend/__tests__/ExperienceSpotsLeft.test.jsx:30` | covered |
| `/producer/dashboard/followers` | GAP | `frontend/__tests__/DashboardInsightsFollowersShare.test.jsx:104` | covered |
| `/producer/dashboard/google-profile` | GAP | `frontend/__tests__/GoogleProfilePageBackLink.test.jsx:14` | covered |
| `/producer/dashboard/group-buys` | `frontend/e2e/flows/manual/dashboard-edit-cards.spec.ts:383` | `frontend/__tests__/DashboardEmptyStateFormExclusive.test.jsx:64` | covered |
| `/producer/dashboard/insights` | `frontend/e2e/flows/manual/dashboard-shell.spec.ts:634` | `frontend/__tests__/DashboardInsightsFollowersCopy.test.jsx:24` | covered |
| `/producer/dashboard/offer` | `frontend/e2e/flows/manual/dashboard-offer-groupbuy.spec.ts:119` | `frontend/__tests__/DashboardOfferPage.test.jsx:12` | covered |
| `/producer/dashboard/orders` | GAP | `frontend/__tests__/OrderSetupAiFill.test.jsx:42` | covered |
| `/producer/dashboard/orders/preview` | GAP | GAP | GAP |
| `/producer/dashboard` | `frontend/e2e/flows/22-register-personas.spec.ts:216` | `frontend/__tests__/Dashboard1025Banner.test.jsx:14` | covered |
| `/producer/dashboard/preview` | GAP | GAP | GAP |
| `/producer/dashboard/qr-card` | GAP | `frontend/__tests__/PrintKit.test.jsx:47` | covered |
| `/producer/dashboard/recipes/[id]/edit` | GAP | GAP | GAP |
| `/producer/dashboard/recipes` | GAP | `frontend/__tests__/DashboardEmptyStateFormExclusive.test.jsx:65` | covered |
| `/producer/dashboard/rescue/counter-card` | GAP | `frontend/__tests__/RescueCounterCardLink.test.jsx:19` | covered |
| `/producer/dashboard/rescue` | GAP | `frontend/__tests__/RescueCounterCardLink.test.jsx:18` | covered |
| `/producer/dashboard/reviews` | GAP | `frontend/__tests__/DashboardReviewsPage.test.jsx:10` | covered |
| `/producer/dashboard/share` | `frontend/e2e/flows/manual/dashboard-vanity-share.spec.ts:100` | `frontend/__tests__/DashboardSharePlacement.test.jsx:16` | covered |
| `/producer/dashboard/tools` | `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts:163` | `frontend/__tests__/DashboardOfferPage.test.jsx:11` | covered |
| `/producer/dashboard/whats-new` | GAP | `frontend/__tests__/WhatsNew.test.jsx:46` | covered |

### Admin

| Route | E2E (`goto`) | Unit (import) | Verdict |
|---|---|---|---|
| `/admin/analytics` | GAP | `frontend/__tests__/AdminNullGuards.test.jsx:139` | covered |
| `/admin/audit-log` | GAP | `frontend/__tests__/AdminAuditLogPage.test.jsx:16` | covered |
| `/admin/billing` | GAP | `frontend/__tests__/AdminBillingPage.test.jsx:37` | covered |
| `/admin/category-requests` | GAP | GAP | GAP |
| `/admin/content` | `frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts:859` | `frontend/__tests__/AdminContentCategoryDelete.test.jsx:3` | covered |
| `/admin/copy` | GAP | GAP | GAP |
| `/admin/experiences` | GAP | `frontend/__tests__/AdminExperiencesPage.test.jsx:5` | covered |
| `/admin/group-buys` | GAP | `frontend/__tests__/AdminGroupBuysTransitions.test.jsx:13` | covered |
| `/admin/help` | GAP | `frontend/__tests__/AdminHelp.test.jsx:7` | covered |
| `/admin/kashrut` | GAP | `frontend/__tests__/AdminKashrutPage.test.jsx:5` | covered |
| `/admin/name-change-requests` | GAP | GAP | GAP |
| `/admin/outreach` | `frontend/e2e/flows/37-outreach-prefill.spec.ts:328` | `frontend/__tests__/AdminOutreach.test.jsx:3` | covered |
| `/admin` | `frontend/e2e/flows/25-role-reachability.spec.ts:130` | `frontend/__tests__/AdminDashboardStats.test.jsx:3` | covered |
| `/admin/producers/[id]/edit` | `frontend/e2e/flows/46-owner-invite.spec.ts:259` | `frontend/__tests__/AdminClaimLink.test.jsx:19` | covered |
| `/admin/producers/new` | `frontend/e2e/flows/manual/admin-producer-form-licence.spec.ts:291` | GAP | covered |
| `/admin/producers` | `frontend/e2e/flows/33-admin-producers-tab.spec.ts:94` | `frontend/__tests__/AdminApproveWithoutLicense.test.jsx:3` | covered |
| `/admin/recipes` | `frontend/e2e/flows/20-admin-recipes-queue.spec.ts:58` | GAP | covered |
| `/admin/reports` | `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:558` | `frontend/__tests__/AdminReportsPage.test.jsx:3` | covered |
| `/admin/reviews` | `frontend/e2e/flows/manual/admin-users-reviews-categories.spec.ts:771` | `frontend/__tests__/AdminReviewDelete.test.jsx:3` | covered |
| `/admin/settings` | `frontend/e2e/flows/30-admin-panel-tabs.spec.ts:143` | GAP | covered |
| `/admin/users` | `frontend/e2e/flows/manual/admin-settings-licence-actions.spec.ts:589` | `frontend/__tests__/AdminUsersDeleteAction.test.jsx:3` | covered |
| `/admin/whatsapp-failures` | GAP | `frontend/__tests__/AdminWhatsappFailuresStuck.test.jsx:12` | covered |

## State machines (`docs/audits/2026-11-implicit-state-machines.md`)

A site `file:line` is mapped to the route whose handler contains it (or reaches it within six helper hops in the same module); the row takes the WORST verdict of the routes it reaches. The audit's line numbers are as of 09/11 — where a file moved since, the row says so (see `ModuleMap.routes_for`).

| § | Transition / write | Site | Routes reached | Verdict | Note |
|---|---|---|---|---|---|
| 1 | ∅ → `draft` | auth.py:571, auth.py:781, producer_queries.py:662, admin.py:391 | `POST /auth/login`, `POST /auth/forgot-password`, `PUT /admin/producers/{producer_id}` | `tests/_test_api__p01.py:544` | — |
| 1 | `draft` → `pending` | producer_me_review.py:596 | `POST /producers/me/submit-for-review` | `tests/_test_meh2952_send_layer__p01.py:216` | — |
| 1 | `rejected` → `pending` | producer_me_review.py:506 | `POST /producers/me/request-review` | `tests/_test_api__p03.py:503` | — |
| 1 | `pending`/`rejected` → `approved` | admin_decisions.py:146, producer_approval.py:122 | `POST /admin/producers/{producer_id}/approve` | `tests/_test_api__p03.py:190` | — |
| 1 | `pending`/`approved` → `rejected` | admin_decisions.py:300 | `POST /admin/producers/{producer_id}/reject` | `tests/_test_producer_owner_invite__p03.py:116` | — |
| 1 | `approved` ⇄ `inactive` | admin.py:810 | `DELETE /admin/producers/{producer_id}` | `tests/_test_producer_owner_invite__p03.py:605` | a DELETE handler for a non-delete transition — audit line may be off |
| 1 | `pending` → `pending` + feedback | — | `POST /admin/producers/{producer_id}/request-changes` | `tests/test_changes_requested_whatsapp.py:59` | — |
| 1 | any → any via admin PUT | admin.py:655 | `POST /admin/producers/{producer_id}/toggle-status` | `tests/_test_producer_owner_invite__p03.py:54` | — |
| 2 | ∅ → `open` | group_buys.py:396 | `POST /group-buys/{group_buy_id}/commit` | `tests/_test_group_buys_api__p01.py:190` | — |
| 2 | `open` → `funded` | group_buys.py:295 | `POST /group-buys/{group_buy_id}/commit` | `tests/_test_group_buys_api__p01.py:190` | — |
| 2 | `funded` → `open` | group_buys.py:340 | `POST /group-buys/{group_buy_id}/commit` | `tests/_test_group_buys_api__p01.py:190` | — |
| 2 | `funded` → `open` | group_buy_delist.py:102 | — | GAP | — |
| 2 | `open`/`funded` → `cancelled`, `funded` → `fulfilled` | group_buys.py:516 | `DELETE /group-buys/{group_buy_id}/commit` | `tests/_test_group_buys_api__p01.py:196` | — |
| 2 | `open`/`funded` → `cancelled` | group_buy_delist.py:61 | — | GAP | — |
| 2 | **any → any** | group_buys.py:563 | `POST /group-buys` | `tests/_test_group_buys_api__p01.py:293` | — |
| 3 | ∅ → `active` (offer) | rescue.py:422 | `GET /rescue/orders/mine` | `tests/test_meh2680_rescue_my_orders.py:49` | — |
| 3 | `active` → `cancelled` (offer) | rescue.py:573 | `POST /rescue/orders` | `tests/test_meh2679_rescue_utc_times.py:77` | — |
| 3 | ∅ → `reserved` (order) | rescue.py:285 | `POST /rescue/offers` | `tests/test_meh2679_rescue_utc_times.py:66` | — |
| 3 | `reserved` → `handed` | rescue.py:901 | — | GAP | — |
| 3 | `reserved` → `no_show` | rescue.py:939 | — | GAP | — |
| 3 | `reserved` → `cancelled` (buyer) | rescue.py:989 | — | GAP | — |
| 3 | `reserved` → `cancelled` (bulk, offer pulled) | rescue.py:581 | `POST /rescue/orders/{order_id}/handed` | `tests/test_meh2680_rescue_my_orders.py:65` | — |
| 4 | ∅ → `(pending, verdict, true)` | experiences.py:459 | `POST /experiences` | `tests/_test_experiences__p01.py:47` | — |
| 4 | content edit on `approved`/`rejected`/`changes_requested` → `(pending, fresh verdict, is_active unchanged)` | experiences.py:588, experiences.py:622 | `PUT /experiences/{experience_id}` | `tests/_test_experiences__p01.py:819` | — |
| 4 | `is_active` flip only | experiences.py:560, experiences.py:567 | `POST /experiences` | `tests/_test_experiences__p01.py:47` | nearest function — audit line may have drifted |
| 4 | → `approved` | admin_experiences.py:88 | `POST /admin/experiences/{experience_id}/approve` | `tests/_test_experiences__p01.py:735` | — |
| 4 | → `changes_requested` | admin_experiences.py:128 | `POST /admin/experiences/{experience_id}/request-changes` | `tests/_test_experiences__p01.py:791` | — |
| 4 | → `rejected` | admin_experiences.py:164 | `POST /admin/experiences/{experience_id}/reject` | `tests/_test_experiences__p01.py:764` | — |
| 5 | `(pending, published=False)` | producer_recipes.py:157 | `POST /producers/me/recipes` | `tests/test_meh1000_recipe_admin_notification.py:153` | — |
| 5 | `(pending, published=False)` — content edit unpublishes | producer_recipes.py:295 | `PATCH /producers/me/recipes/{recipe_id}` | `tests/test_indexnow.py:729` | — |
| 5 | `(approved, published=True)` | admin_recipes.py:138 | `POST /admin/recipes/{recipe_id}/approve` | `tests/_test_meh2952_send_layer__p01.py:245` | — |
| 5 | `(needs_revision, published=False)` | admin_recipes.py:219 | `POST /admin/recipes/{recipe_id}/request-changes` | `tests/test_indexnow.py:540` | — |
| 5 | `(rejected, published=False)` | admin_recipes.py:254 | `POST /admin/recipes/{recipe_id}/reject` | `tests/test_indexnow.py:540` | — |
| 6 | create / upsert-edit | reviews.py:538 | `POST /producers/{producer_id}/reviews` | `tests/_test_api__p04.py:120` | — |
| 6 | edit via race branch | reviews.py:577 | `POST /producers/{producer_id}/reviews` | `tests/_test_api__p04.py:120` | — |
| 6 | hide | reviews.py:708 | `POST /producers/{producer_id}/reviews` | `tests/_test_api__p04.py:120` | — |
| 6 | unhide | reviews.py:731 | `PUT /reviews/{review_id}/reply` | `tests/_test_meh2952_send_layer__p01.py:269` | — |
| 6 | delete (owner/admin) | reviews.py:581 | `POST /producers/{producer_id}/reviews` | `tests/_test_api__p04.py:120` | a delete transition reached no DELETE handler — audit line may be off |
| 6 | user account deletion (DB cascade) | user_deletion.py:112 | — | weak `tests/test_meh3252_pii_after_account_delete.py:122` (names delete_user_and_data) | — |
| 7 | §7 — whole section | whatsapp_webhook.py:588 | `POST /webhook/whatsapp` | `tests/test_meh_509_pr2c_webhook.py:247` | — |
| 8 | §8 — whole section | home_products.py:177, router_registry.py:100, router_registry.py:66, home_products.py:228 … | `PUT /experiences/{experience_id}`, `PATCH /producers/me/recipes/{recipe_id}`, `POST /admin/users/{user_id}/block`, `GET /admin/users` | `tests/_test_experiences__p01.py:819` | a delete transition reached no DELETE handler — audit line may be off; nearest write handler — audit line may have drifted |
| 9 | `registrations.status` | registrations.py:375, registrations.py:377, registrations.py:383, registrations.py:226 … | `POST /events/{event_id}/registrations`, `POST /experiences/{experience_id}/registrations`, `POST /experiences`, `POST /registrations/{token}/cancel` | `tests/test_meh2763_registrations.py:116` | nearest function — audit line may have drifted |
| 9 | `events` | — | — | GAP | — |
| 9 | `users` | admin_extra.py:185, auth.py:627, auth.py:830, producer_claim.py:249 | `PUT /admin/users/{user_id}/role`, `POST /auth/logout-all-devices`, `POST /auth/reset-password`, `POST /producer-claim/new-link-request` | `tests/_test_api__p03.py:226` | nearest write handler — audit line may have drifted |
| 9 | not covered by the audit (time box) | admin_kashrut.py:210 | `POST /admin/kashrut/{request_id}/revoke` | `tests/test_meh2518_kashrut_real_expiry.py:149` | — |

## Mandatory extra rows (§B.3)

A row is covered when one test function calls the listed route(s) and matches the row's condition (status in the call window, a word in the test). `weak` = only a grep hit, no route call.

| Kind | Row | Evidence | Note | Score |
|---|---|---|---|---|
| negative | wrong phone OTP code is refused | `tests/test_meh1176_otp_confirm_rate_limit.py:35` | — | 10 |
| negative | expired phone OTP code is refused | `tests/test_phone_change_reverify.py:73` | — | 10 |
| negative | expired password-reset token is refused | `tests/_test_api__p05.py:750` | — | 11 |
| negative | expired email-verify token is refused | `tests/test_verify_email.py:55` | — | 6 |
| negative | double submit-for-review | `tests/test_meh2899_double_submit.py:181` | — | 9 |
| negative | double join (commit) on a group buy | `tests/_test_group_buys_api__p01.py:620` | — | 13 |
| negative | double reserve of a rescue bag | `tests/test_rescue.py:345` | — | 11 |
| negative | cancel a rescue reservation midway | `tests/test_meh2680_rescue_my_orders.py:79` (via helper _reserve) | — | 11 |
| negative | cancel an event/experience registration midway | `tests/test_meh2763_registrations.py:358` | — | 10 |
| negative | a rejected business acting (business mutation → 403/409) | GAP | — | 11 |
| negative | rate limit 429 on login | `tests/test_meh3372_login_per_email_limit.py:146` | — | 9 |
| negative | rate limit 429 on phone OTP | `tests/test_meh1176_otp_confirm_rate_limit.py:35` | — | 12 |
| time | rescue: handover / no-show before the pickup window closed | `tests/test_rescue.py:411` | clock frozen | 11 |
| time | rescue: reserve inside the window, up to the cutoff | `tests/test_rescue.py:236` | clock frozen | 11 |
| time | rescue: reserve / list after the window or cutoff | `tests/test_rescue.py:595` | clock frozen | 3 |
| time | group buy: commit after the deadline passed | `tests/_test_group_buys_api__p01.py:603` | real clock | 13 |
| time | ended event / experience: registration refused | `tests/test_meh3288_signup_closes_at_start.py:116` | clock frozen | 10 |
| time | Friday / holiday mode | `tests/test_holiday_mode.py:17` | real clock | 5 |
| time | special hours on a date (clock frozen) | `tests/test_meh2264_special_hours_b.py:91` | clock frozen | 3 |
| time | the 24 h WhatsApp customer-service window | weak `tests/test_meh2122_otp_failure_visibility.py:66` (grep, no route call) | real clock | 10 |
| time | SLA ageing in the admin queue | `tests/test_admin_queue_sla_aging.py:332` | clock frozen | 5 |
| race | owner and admin move the same group buy (#4250) | `tests/_test_group_buys_api__p02.py:355` (via helper _patch) | sequential interleave only | 11 |
| race | «נמסר» vs cancel on one rescue order (#4249) | `tests/test_meh2738_rescue_business_cancel.py:114` | sequential interleave only | 12 |
| race | two customers take the last rescue bag | `tests/test_rescue.py:271` | sequential interleave only | 12 |
| race | the owner edits while the admin approves | `tests/test_meh2907_approve_vs_owner_edit.py:219` | concurrent threads | 10 |

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
