# מיילים והתראות

**מה הם עושים.** כל המיילים היוצאים: אישורי הרשמה, הודעות לבית העסק, תקצירים, ניוזלטר, ומיילי מערכת. ‏**הכול דרך Resend** — ‏Railway חוסם SMTP.

**Routes**
* `frontend/app/[locale]/newsletter/unsubscribe/` · `frontend/app/[locale]/unsubscribe/weekly/`
* `frontend/app/[locale]/delivery-waitlist/unsubscribe/` · `frontend/app/[locale]/delivery-waitlist/host-confirm/`

**קבצים מרכזיים**
* `backend/app/services/email.py` — ‏`send_email()`. נכשל פתוח בלי `RESEND_API_KEY`.
* `backend/app/services/registration_emails.py` — המסגרת המשותפת (`_shell`) של כל מייל HTML, ו-`_button`.
* `backend/app/services/email_branding.py` — הלוגו.
* `backend/app/services/rescue_emails.py` · `backend/app/services/rescue_no_show.py` · `backend/app/services/pending_nudge.py`
* `backend/app/services/push.py` — התראות דפדפן.
* `backend/app/services/job_heartbeat.py` — ה-heartbeat של משימות הרקע; כשל בשליחה נרשם ב-WARNING ולא נבלע.

**Flags.** אין. בלי `ANTHROPIC_API_KEY` תכונות ה-AI מתדרדרות, שכבת ההזדהות לא.

**טסטים**
* `tests/test_meh0000_email_frame.py` — המסגרת: viewport, פלטה, ריפוד בנייד.
* `tests/test_email_logo.py` · `tests/test_meh2164_newsletter_mobile_width.py` · `tests/test_meh2151_approval_email_cta.py`
* `tests/test_newsletter_unsubscribe.py` · `tests/test_meh2611_newsletter_resend_sync.py` · `tests/test_meh2875_newsletter_kicker.py`
* `tests/test_meh3350_heartbeat_logging.py`

**מזהי רישום שזה מכסה.** `email_alerts`, `onboarding_emails`.
