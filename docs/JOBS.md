# מפת המשימות המתוזמנות

כל מה שרץ לבד, בלי שמישהי לחצה על משהו: המשימות שהשרת מריץ (APScheduler,
בתוך תהליך ה-backend) והתזמונים של GitHub Actions.

**הטבלאות למטה נוצרות מהקוד ולא נכתבות ביד.** ‏`tests/test_meh3599_jobs_map.py`
קורא את כל קריאות `add_job` ב-`backend/app` ואת כל שורות ה-`cron:`
ב-`.github/workflows/`, ונכשל כשהמפה והקוד נפרדים. לחידוש:

```
UPDATE_JOBS_MAP=1 pytest tests/test_meh3599_jobs_map.py
```

איך לקרוא את הטבלה:

* **תזמון** — ביטוי cron עם אזור הזמן שלו, או מרווח קבוע. שעה ב-UTC זזה
  מול שעון ישראל פעמיים בשנה; שעה ב-`Asia/Jerusalem` לא.
* **נרשמת רק אם** — התנאי בקוד שבלעדיו המשימה לא נרשמת בכלל (דגל של
  פיצ'ר, בדרך כלל). «תמיד» = אין תנאי במקום הרישום. תנאי שנבדק בתוך
  המשימה עצמה, בזמן הריצה, לא מופיע כאן. שם שיובא ממודול אחר מופיע עם
  המקום שבו הוא מוגדר, כי השם לבדו לא תמיד אומר מה נבדק (למשל `_enabled`
  של `job_heartbeat` פירושו «רק ב-production»).
* **Sentry heartbeat** — שם המוניטור ב-Sentry Crons. משימה בלי heartbeat
  לא מתריעה כשהיא מפספסת ריצה.
* המשימות בשרת חיות בזיכרון של תהליך אחד. הפעלה מחדש של השרת מאפסת את
  המרווחים, ואין רישום של ריצה שהתפספסה בזמן שהשרת היה למטה.

משימה אחת יכולה לעשות כמה דברים: ה-tick היומי של `_run_followup_job` שולח גם
את מייל רעננות הדף החודשי ואת סיכום הדפים הישנים לאדמין. המפה מונה רישומים
במתזמן, לא כל פעולה שרצה בתוכם.

הפרטים על כל משימה (למה השעה הזאת, מה קורה בכישלון) נמצאים בהערות ליד
הרישום שלה, בקובץ שבעמודה «נרשמת ב».

<!-- BEGIN GENERATED: jobs-map (tests/test_meh3599_jobs_map.py) -->
17 server jobs · 9 GitHub Actions schedules.

### משימות בשרת (APScheduler)

| id | פונקציה | תזמון | נרשמת רק אם | Sentry heartbeat | נרשמת ב | מה היא עושה |
|---|---|---|---|---|---|---|
| `meh_2283_analytics_rollup_daily` | `_run_analytics_rollup_job` | cron `30 1 * * *` (UTC) | תמיד | analytics-rollup-daily | backend/app/startup.py · register_scheduler_jobs | MEH-2079 chunk B2 (MEH-2283): daily APScheduler tick that rolls every pending Israel day of raw producer analytics into producer_analytics_daily — [watermark + 1 .. yesterday], never today, never a day that already has a row. |
| `meh_2303_retention_purge_daily` | `_run_retention_purge_job` | cron `30 2 * * *` (UTC) | תמיד | retention-purge-daily | backend/app/startup.py · register_scheduler_jobs | MEH-2079 chunk C (MEH-2303): daily purge of raw analytics rows past the 90-day window that the roll-up already owns, and alert_log rows past 30 days. |
| `meh_2756_rescue_codes_digest` | `_run_rescue_digest_job` | כל 5 minutes | `settings.rescue_bags_enabled and _digest_enabled()` (app.config.settings, app.services.rescue_digest.digest_enabled) | rescue-codes-digest | backend/app/startup.py · register_scheduler_jobs | MEH-2756: 5-min tick that sends each due rescue offer's pickup codes to the business at pickup_start. |
| `meh_3079_weekly_owner_summary` | `_run_weekly_owner_summary_job` | cron `0 8 * * sun` (Asia/Jerusalem) | `summary_enabled()` (app.services.weekly_owner_summary.summary_enabled) | weekly-owner-summary | backend/app/startup.py · _register_weekly_owner_summary | The scheduled Sunday run (MEH-3079); the catch-up calls _send_weekly_owner_summary directly with the missed fire time. |
| `meh_3079_weekly_owner_summary_catchup` | `_send_weekly_owner_summary` | פעם אחת, אחרי עליית השרת | `summary_enabled()` (app.services.weekly_owner_summary.summary_enabled) and `catchup_due(now)` (app.services.weekly_owner_summary.catchup_due) | — | backend/app/startup.py · _register_weekly_owner_summary | MEH-3079: Sunday-morning weekly summary email to business owners. |
| `meh_3147_admin_pending_reminder_daily` | `_run_admin_pending_reminder_job` | cron `0 5 * * *` (UTC) | תמיד | admin-pending-reminder-daily | backend/app/startup.py · register_scheduler_jobs | MEH-3147: morning email to the admin listing businesses waiting for approval 2+ business days. |
| `meh_3287_group_buy_expiry_daily` | `_run_group_buy_expiry_job` | cron `0 6 * * *` (UTC) | תמיד | group-buy-expiry-daily | backend/app/startup.py · register_scheduler_jobs | MEH-3287: close open group buys whose deadline passed below their minimum, and mail the participants. |
| `meh_3296_product_orders` | `_run_product_order_jobs` | כל 2 minutes | `product_orders_enabled()` (app.routers.product_orders.product_orders_enabled) | product-orders-tick | backend/app/startup.py · _register_product_order_job | MEH-3296: one 2-minute tick for on-site orders — expire the requests nobody answered, then send the messages that are due. |
| `meh_3312_registration_reminder_daily` | `_run_registration_reminder_job` | cron `0 17 * * *` (Asia/Jerusalem) | תמיד | registration-reminder-daily | backend/app/startup.py · register_scheduler_jobs | MEH-3312: the evening-before reminder to on-site registrants. |
| `meh_3332_job_staleness_check` | `_run_job_staleness_check` | כל 30 minutes | `_enabled()` (app.services.job_heartbeat._enabled) | — | backend/app/startup.py · _register_job_staleness_check | MEH-3332: every 30 minutes, report to Sentry (ops_alert, MEH-3705; email to the admin when Sentry is off) a registered @heartbeat job with no recent success. |
| `meh_3413_billing_start_signal_monthly` | `_run_billing_start_signal_job` | cron `0 5 1-3 * *` (UTC) | תמיד | billing-start-signal-monthly | backend/app/startup.py · register_scheduler_jobs | MEH-3413: early in the month, email the admin when the month that just ended reached the billing-start signal. |
| `meh_3535_email_outbox` | `_run_email_outbox_job` | כל 1 minutes | `not (settings.outbox_external_worker)` (app.config.settings) | email-outbox-tick | backend/app/startup.py · _register_outbox_jobs | MEH-3535: send the queued emails that are due (services/email_outbox). |
| `meh_3610_group_buy_pickup_reminder_daily` | `_run_group_buy_pickup_reminder_job` | cron `0 17 * * *` (Asia/Jerusalem) | תמיד | group-buy-pickup-reminder-daily | backend/app/startup.py · register_scheduler_jobs | MEH-3610: mail each participant of a funded group before its pickup. |
| `meh_3630_staging_weekly_reset` | `run` | cron `0 23 * * sat` (UTC) | `enabled()` | — | backend/app/services/staging_reset_job.py · register | One weekly wipe + re-seed of the staging DB, staging only (MEH-3630). |
| `meh_3702_rescue_morning_reminder` | `_run_rescue_morning_reminder_job` | cron `0 8 * * *` (Asia/Jerusalem) | `settings.rescue_bags_enabled` (app.config.settings) | rescue-morning-reminder-daily | backend/app/startup.py · register_scheduler_jobs | MEH-3702: queue today's reminder emails. |
| `meh_509_pr2b_after_hours_watchdog` | `_run_watchdog_job` | כל 5 minutes | `settings.watchdog_enabled` (app.config.settings) | auto-reply-watchdog | backend/app/startup.py · register_scheduler_jobs | MEH-509 PR2b: 5-min after-hours watchdog tick. |
| `meh_539_onboarding_followups_daily` | `_run_followup_job` | cron `0 10 * * *` (UTC) | תמיד | onboarding-followups-daily | backend/app/startup.py · register_scheduler_jobs | MEH-539: daily APScheduler tick. |

### תזמונים ב-GitHub Actions (UTC)

| קובץ | workflow | cron | הערה בקובץ |
|---|---|---|---|
| `backup-restore-verify.yml` | Backup restore drill | `0 4 * * 1` | — |
| `dependency-audit.yml` | Dependency Audit | `0 3 * * 1` | — |
| `e2e.yml` | E2E Tests | `30 1 * * *` | nightly Chromium suite on staging (both modes); WebKit too when public |
| `e2e.yml` | E2E Tests | `30 2 * * 0` | PRIVATE MODE only: WebKit shadow run, weekly (Sunday) |
| `placeholder-search-cron.yml` | Placeholder search rot | `0 5 * * 0` | — |
| `post-deploy-checks.yml` | Post-deploy checks | `17 3 * * 0` | — |
| `pr-reconcile.yml` | PR reconcile (Linear) | `0 6 * * 0` | Sunday 06:00 UTC |
| `stale.yml` | Stale PR sweep | `0 6 * * *` | daily 06:00 UTC |
| `uptime.yml` | Uptime probe | `*/30 * * * *` | — |
<!-- END GENERATED -->
