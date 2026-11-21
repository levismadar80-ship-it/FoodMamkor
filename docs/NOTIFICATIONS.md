# מפת ההודעות — כל מקום שהאתר שולח ממנו הודעה

כל שורה היא פונקציה בשרת ששולחת הודעה: באילו ערוצים (מייל, וואטסאפ, push) ועל מי. הטבלה **נוצרת מהקוד** (MEH-3594) ולא נכתבת ביד: `tests/test_meh3594_notifications_map.py` קורא את האינוונטר של MEH-2952 ואת קריאות ה-push, ונכשל כשהקוד והטבלה לא תואמים.

**כשמוסיפים הודעה חדשה:** שני טסטים יאדימו (האינוונטר של MEH-2952 והמפה). מוסיפים pin, מחדשים את המפה בפקודה שבראש הטסט, ו**קוראים את השורה החדשה**: האם היא מגיעה לקוראת בכל ערוץ שהיא צריכה? הודעה למנהלת בוואטסאפ = תבנית Meta דרך `ping_admin` בלבד (MEH-3589). הודעה ללקוחה בוואטסאפ מחוץ לחלון 24 השעות = תבנית בלבד, לעולם לא `send_text`.

ערוץ אחד הוא לא בהכרח באג: איפוס סיסמה הוא מייל בלבד בכוונה. הטבלה נועדה לכך שההחלטה תהיה גלויה.

<!-- BEGIN GENERATED: tests/test_meh3594_notifications_map.py -->

88 send sites · 85 on a single channel.

| קובץ (`backend/app/`) | פונקציה | ערוצים | על מי |
|---|---|---|---|
| `routers/admin_decisions.py` | `_queue_approved_email` | מייל | בעלת העסק |
| `routers/admin_decisions.py` | `reject_producer` | מייל | בעלת העסק |
| `routers/admin_decisions.py` | `request_producer_changes` | מייל | בעלת העסק |
| `routers/admin_kashrut.py` | `kashrut_expiry_reminders` | וואטסאפ | בעלת העסק |
| `routers/admin_outreach.py` | `thank_suggester` | מייל | בלי שורת עסק |
| `routers/alerts.py` | `_fan_out_alerts` | push | לקוחה |
| `routers/marketing.py` | `_send_contact_email` | מייל | בלי שורת עסק |
| `routers/marketing.py` | `_send_newsletter_confirm` | מייל | בלי שורת עסק |
| `routers/marketing.py` | `_send_newsletter_welcome` | מייל | בלי שורת עסק |
| `routers/producer_owner_invite.py` | `accept_owner_invite` | מייל | בעלת העסק |
| `routers/producer_owner_invite_existing.py` | `accept_owner_invite_existing` | מייל | בעלת העסק |
| `routers/report_info.py` | `report_producer_info` | מייל | בית עסק / מנהלת |
| `routers/report_info.py` | `report_review` | מייל | בית עסק / מנהלת |
| `routers/whatsapp_webhook.py` | `_maybe_process_optout` | וואטסאפ | בלי שורת עסק |
| `services/admin_pending_reminder.py` | `send_admin_pending_reminder` | מייל | בלי שורת עסק |
| `services/approved_edit_moderation.py` | `notify_admin_content_edit` | מייל | בעלת העסק |
| `services/auth_emails.py` | `send_deletion_email` | מייל | משתמשת (חשבון) |
| `services/auth_emails.py` | `send_duplicate_attempt_email` | מייל | משתמשת (חשבון) |
| `services/auth_emails.py` | `send_email_changed_notice` | מייל | משתמשת (חשבון) |
| `services/auth_emails.py` | `send_owner_invite_code_email` | מייל | בית עסק / מנהלת |
| `services/auth_emails.py` | `send_owner_invite_email` | מייל | בית עסק / מנהלת |
| `services/auth_emails.py` | `send_password_changed_notice` | מייל | משתמשת (חשבון) |
| `services/auth_emails.py` | `send_reset_email` | מייל | משתמשת (חשבון) |
| `services/auth_emails.py` | `send_verify_email` | מייל | משתמשת (חשבון) |
| `services/auth_emails.py` | `send_welcome_email` | מייל | משתמשת (חשבון) |
| `services/auth_notifications.py` | `notify_admin_claim_link_requested` | מייל | בית עסק / מנהלת |
| `services/auth_notifications.py` | `notify_admin_draft_claimed` | מייל | בית עסק / מנהלת |
| `services/auth_notifications.py` | `notify_admin_new_business_suggestion` | מייל | בלי שורת עסק |
| `services/auth_notifications.py` | `notify_admin_new_category_request` | מייל | בית עסק / מנהלת |
| `services/auth_notifications.py` | `notify_admin_new_producer` | מייל + וואטסאפ | בית עסק / מנהלת |
| `services/auth_notifications.py` | `notify_admin_new_recipe` | מייל | בית עסק / מנהלת |
| `services/auth_notifications.py` | `notify_admin_owner_invite_accepted` | מייל | בית עסק / מנהלת |
| `services/auth_notifications.py` | `notify_admin_producer_resubmit` | מייל + וואטסאפ | בית עסק / מנהלת |
| `services/auth_notifications.py` | `notify_admin_producer_review_ready` | מייל + וואטסאפ | בית עסק / מנהלת |
| `services/auth_notifications.py` | `notify_admin_producer_sensitive_edit` | מייל | בית עסק / מנהלת |
| `services/auth_notifications.py` | `notify_producer_approved` | וואטסאפ | בעלת העסק |
| `services/auth_notifications.py` | `notify_producer_changes_requested` | וואטסאפ | בעלת העסק |
| `services/auth_notifications.py` | `notify_producer_registered` | וואטסאפ | בעלת העסק |
| `services/auto_reply_watchdog.py` | `run_watchdog` | וואטסאפ | בלי שורת עסק |
| `services/billing_start_signal.py` | `send_billing_start_signal` | מייל | בלי שורת עסק |
| `services/booking_cancellations.py` | `send_owner_delisted` | מייל | בעלת העסק |
| `services/content_notifications.py` | `notify_kashrut_approved` | מייל | בעלת העסק |
| `services/content_notifications.py` | `notify_kashrut_rejected` | מייל | בעלת העסק |
| `services/content_notifications.py` | `notify_owner_new_review` | מייל | בעלת העסק |
| `services/content_notifications.py` | `notify_recipe_approved` | מייל | בעלת העסק |
| `services/content_notifications.py` | `notify_recipe_changes_requested` | מייל | בעלת העסק |
| `services/content_notifications.py` | `notify_recipe_rejected` | מייל | בעלת העסק |
| `services/content_notifications.py` | `notify_reviewer_reply` | מייל | לקוחה |
| `services/delivery_waitlist.py` | `_notify_cities` | מייל | לקוחה |
| `services/delivery_waitlist.py` | `send_host_confirmation` | מייל | לקוחה |
| `services/email_outbox.py` | `_handle` | מייל | בלי שורת עסק |
| `services/experience_notifications.py` | `notify_admin_new_submission` | מייל | בית עסק / מנהלת |
| `services/experience_notifications.py` | `notify_host_approved` | מייל | בעלת העסק |
| `services/experience_notifications.py` | `notify_host_changes_requested` | מייל | בעלת העסק |
| `services/experience_notifications.py` | `notify_host_rejected` | מייל | בעלת העסק |
| `services/group_buy_goal_flap.py` | `send_below_goal_emails` | מייל | לקוחה |
| `services/group_buy_notifications.py` | `notify_participant_cancelled` | מייל | לקוחה |
| `services/group_buy_notifications.py` | `notify_participant_cancelled_delisted` | מייל | לקוחה |
| `services/group_buy_notifications.py` | `notify_participant_expired` | מייל | לקוחה |
| `services/group_buy_notifications.py` | `notify_participant_funded` | מייל | לקוחה |
| `services/group_buy_notifications.py` | `notify_participant_joined` | מייל | לקוחה |
| `services/group_buy_notifications.py` | `notify_producer_funded` | מייל | בעלת העסק |
| `services/job_staleness.py` | `_alert` | מייל | בלי שורת עסק |
| `services/onboarding_followup.py` | `send_due_followups` | מייל | בעלת העסק |
| `services/owner_detach.py` | `send_owner_detached_email` | מייל | בעלת העסק |
| `services/page_freshness.py` | `send_freshness_emails` | מייל | בעלת העסק |
| `services/page_freshness_digest.py` | `send_stale_digest` | מייל | בלי שורת עסק |
| `services/pending_nudge.py` | `send_pending_nudges` | מייל | בעלת העסק |
| `services/product_order_outbox.py` | `_mail.send` | מייל | בעלת העסק |
| `services/product_order_outbox.py` | `_wa.send` | וואטסאפ | בית עסק / מנהלת |
| `services/rating_dispatcher.py` | `_default_sender` | וואטסאפ | בלי שורת עסק |
| `services/registration_emails.py` | `_send_lines` | מייל | לקוחה |
| `services/registration_emails.py` | `send_owner_cancellation` | מייל | בעלת העסק |
| `services/registration_emails.py` | `send_owner_new_registration` | מייל | בעלת העסק |
| `services/registration_emails.py` | `send_registrant_moved` | מייל | לקוחה |
| `services/registration_emails.py` | `send_registration_reminder` | מייל | לקוחה |
| `services/registration_emails.py` | `send_visitor_confirmation` | מייל | לקוחה |
| `services/registration_emails.py` | `send_waitlist_confirmation` | מייל | לקוחה |
| `services/registration_emails.py` | `send_waitlist_offer` | מייל | לקוחה |
| `services/report_notifications.py` | `notify_admin_new_report` | מייל | בית עסק / מנהלת |
| `services/rescue_business_emails.py` | `send_business_reservation_email` | מייל | בעלת העסק |
| `services/rescue_digest.py` | `_digest_one` | וואטסאפ | בעלת העסק |
| `services/rescue_emails.py` | `_send_bag_cancelled` | מייל | לקוחה |
| `services/rescue_emails.py` | `send_cancel_email` | מייל | לקוחה |
| `services/rescue_emails.py` | `send_reservation_email` | מייל | לקוחה |
| `services/rescue_no_show.py` | `send_no_show_email` | מייל | לקוחה |
| `services/submission_confirmation.py` | `send_submission_confirmation` | מייל | בעלת העסק |
| `services/weekly_owner_summary.py` | `send_weekly_summaries` | מייל | בעלת העסק |

<!-- END GENERATED -->
