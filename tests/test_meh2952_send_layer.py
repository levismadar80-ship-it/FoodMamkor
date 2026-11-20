"""MEH-2952 — no email or WhatsApp reaches anyone when the send was caused by
a test business or a test user (`producers.is_test` / `users.is_test`).

Decided by the product owner (option «a»): no allowlist, no new env var —
staging and production alike drop the send and log it. The mechanism is one
keyword on the three send-layer functions:

    send_email(..., test_cause=False)
    send_text(to, body, test_cause=False)
    send_template(to, template, test_cause=False)

`test_cause=True` returns before any other check and before any transport
call. Every caller that sends *because of* a business or a user computes the
flag from the row it already holds; callers caused by neither (newsletter,
contact form, outreach thank-you, business suggestions, the WhatsApp watchdog
and opt-out, the unwired rating dispatcher) pass nothing.

What this file proves, in order:

1. The send layer itself: a flagged send never reaches Resend / Graph; an
   unflagged control does (so the recorder is live, not silent).
2. The production-profile guard the product owner asked for: production
   settings, WhatsApp configured, and `OTP_TEST_NUMBERS` / `OTP_TEST_CODE`
   set to values that INCLUDE the recipient — a send caused by a test
   business is still impossible, at the send layer and through two real
   routes (admin approve, the owner's OTP request).
3. One behaviour test per caller group (admin-notified, owner, consumer,
   own-auth): a test row sends nothing, an ordinary row sends.
4. The inventory guard: every send-layer call under backend/app is pinned to
   a group, and every non-«none» call passes a NON-constant `test_cause=`.
   A new, removed or unflagged site turns it red. The classifier ships with
   a self-test on synthetic source and a case anchored to a real repo file.

Transport is recorded at the lowest level the app reaches: the Resend client
returned by `configure_resend`, and `httpx.post` inside services/whatsapp.py
(only Graph `/messages` URLs — IndexNow also uses httpx.post).
"""

from __future__ import annotations

# MEH-3540: this file was split mechanically into the modules imported
# below, so each one can be read whole. pytest collects the imported
# tests here, so every node id is unchanged. DO NOT rename this file —
# the Stop hook, DoD rules and CI reference it by path.
from _test_meh2952_send_layer__common import (  # noqa: F401 — fixtures register where imported
    transport,
    production,
    digest_gates,
)
from _test_meh2952_send_layer__p01 import (  # noqa: F401
    test_send_email_with_test_cause_never_reaches_resend,
    test_send_email_control_without_test_cause_does_reach_resend,
    test_send_email_test_cause_is_checked_before_every_other_check,
    test_whatsapp_with_test_cause_never_posts,
    test_whatsapp_control_without_test_cause_does_post,
    test_production_profile_send_layer_refuses_a_test_caused_whatsapp,
    test_production_profile_admin_approve_of_a_test_business_sends_nothing,
    test_production_profile_admin_approve_of_an_ordinary_business_sends,
    test_production_profile_otp_for_a_test_business_on_the_test_list_sends_nothing,
    test_production_profile_otp_control_for_an_ordinary_business_sends,
    test_group_admin_notified_submit_for_review,
    test_group_owner_recipe_approval,
    test_group_consumer_reviewer_hears_the_reply,
    test_group_own_auth_forgot_password,
    test_group_own_auth_account_deletion_reads_the_flag_before_the_row_goes,
    test_test_consumer_reviewing_a_real_business_sends_no_owner_mail,
    test_test_owner_replying_on_a_real_business_sends_no_reviewer_mail,
    test_a_test_row_notifier_logs_nothing_at_warning_or_above,
    test_control_the_same_notifier_does_log_loud_when_it_really_fails,
    test_rescue_digest_excludes_a_test_business,
    test_kashrut_reminders_skip_a_test_business_and_count_no_failure,
    test_inventory_classifier_self_test_on_synthetic_source,
    test_inventory_classifier_anchored_to_a_real_repo_file,
    test_inventory_every_send_site_is_pinned_and_flagged,
    test_inventory_every_wrapper_call_passes_the_flag,
)
