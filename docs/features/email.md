# מיילים והתראות

**מה הם עושים.** כל המיילים היוצאים: אישורי הרשמה, הודעות לבית העסק, תקצירים, ניוזלטר, ומיילי מערכת. ‏**הכול דרך Resend** — ‏Railway חוסם SMTP.

**Routes**
* `frontend/app/[locale]/newsletter/unsubscribe/` · `frontend/app/[locale]/unsubscribe/weekly/`
* `frontend/app/[locale]/delivery-waitlist/unsubscribe/` · `frontend/app/[locale]/delivery-waitlist/host-confirm/`
* `frontend/app/[locale]/freshness/confirm/` — הבדיקה החודשית «הכול עדיין נכון?» ([page-freshness.md](./page-freshness.md))

**קבצים מרכזיים**
* `backend/app/services/email.py` — ‏`send_email()`. נכשל פתוח בלי `RESEND_API_KEY`.
* `backend/app/services/email_outbox.py` — תור המיילים העמיד (MEH-3535): ‏`enqueue_email()` כותב את המייל לטבלה `email_outbox` באותה טרנזקציה של מה שגרם לו (במיילי האישור: דרך `before_commit` של `_persist_approval`), ו-`dispatch_due()` שולח עם ניסיונות חוזרים. כרגע עוברים בו מיילי ההחלטה על בית עסק (אושר / נדחה / חסר פרט) ומיילי ההרשמה לאירוע ולסדנה.
* `backend/app/worker.py` — שירות ה-worker הנפרד ב-Railway (`railway.worker.json`) שמריץ את התור ואת טיק ההזמנות, אחרי `OUTBOX_EXTERNAL_WORKER=true` בשירות האתר.
* `frontend/components/EmailLinkUnsubscribe.jsx` — דף הנחיתה האחד של כל קישור «הסרה» במייל (ניוזלטר, רשימת המתנה, סיכום שבועי): שולח את הטוקן ב-POST בטעינה, «נסו שוב» על 429/5xx/רשת, והטוקן יורד מכתובת הדף (MEH-3464).
* `backend/app/services/registration_emails.py` — המסגרת המשותפת (`_shell`) של כל מייל HTML, ו-`_button`.
* `backend/app/services/email_branding.py` — הלוגו.
* `backend/app/services/rescue_emails.py` · `backend/app/services/rescue_no_show.py` · `backend/app/services/pending_nudge.py`
* `backend/app/services/push.py` — התראות דפדפן.
* `backend/app/services/weekly_owner_summary.py` · `backend/app/routers/producer_me_weekly_summary.py` — הסיכום השבועי לבית העסק. כל מייל נושא `List-Unsubscribe` ו-one-click לפי RFC 8058 (`send_email(..., headers=)`), ובעלת העסק מחזירה או מפסיקה אותו במתג ב«תובנות» (MEH-3212). נשלח רק מ-5 צפיות בשבוע, או פחות כשהייתה לחיצה על וואטסאפ או קשר (`MIN_VIEWS`, `worth_sending`, MEH-3476).
* `backend/app/services/job_heartbeat.py` — ה-heartbeat של משימות הרקע; כשל בשליחה נרשם ב-WARNING ולא נבלע.

**Flags.** `OUTBOX_EXTERNAL_WORKER` — מי מריץ את התור: false (ברירת מחדל) = האתר, true = ה-worker. `WEEKLY_OWNER_SUMMARY_ENABLED` — הסיכום השבועי (כבוי עד שהשדה נוסף ל-`config.py`). בלי `ANTHROPIC_API_KEY` תכונות ה-AI מתדרדרות, שכבת ההזדהות לא.

**טסטים**
* `tests/test_meh0000_email_frame.py` — המסגרת: viewport, פלטה, ריפוד בנייד.
* `tests/test_email_logo.py` · `tests/test_meh2164_newsletter_mobile_width.py` · `tests/test_meh2151_approval_email_cta.py`
* `tests/test_newsletter_unsubscribe.py` · `tests/test_meh2611_newsletter_resend_sync.py` · `tests/test_meh2875_newsletter_kicker.py`
* `tests/test_meh3079_weekly_owner_summary.py` · `tests/test_meh3212_weekly_summary_toggle.py` — הסיכום השבועי, ההסרה, המתג והכותרות.
* `tests/test_meh3350_heartbeat_logging.py`
* `tests/test_meh3535_email_outbox.py` — התור: ניסיון חוזר, ניקוי התוכן, נעילה, ה-worker, ההחלפה בין האתר ל-worker.

**מזהי רישום שזה מכסה.** `email_alerts`, `onboarding_emails`.
