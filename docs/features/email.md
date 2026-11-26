# מיילים והתראות

**מה הם עושים.** כל המיילים היוצאים: אישורי הרשמה, הודעות לבית העסק, תקצירים, ניוזלטר, ומיילי מערכת. ‏**הכול דרך Resend** — ‏Railway חוסם SMTP.

**Routes**
* `frontend/app/[locale]/newsletter/unsubscribe/` · `frontend/app/[locale]/unsubscribe/weekly/`
* `frontend/app/[locale]/delivery-waitlist/unsubscribe/` · `frontend/app/[locale]/delivery-waitlist/host-confirm/`
* `frontend/app/[locale]/freshness/confirm/` — הבדיקה החודשית «הכול עדיין נכון?» ([page-freshness.md](./page-freshness.md))

**קבצים מרכזיים**
* `backend/app/services/email.py` — ‏`send_email()`. נכשל פתוח בלי `RESEND_API_KEY`. מייל שנשלח בלי html מקבל אוטומטית את המסגרת הממותגת (MEH-3587).
* `backend/app/services/email_outbox.py` — תור המיילים העמיד (MEH-3535): ‏`enqueue_email()` כותב את המייל לטבלה `email_outbox` באותה טרנזקציה של מה שגרם לו (במיילי האישור: דרך `before_commit` של `_persist_approval`), ו-`dispatch_due()` שולח עם ניסיונות חוזרים. כרגע עוברים בו מיילי ההחלטה על בית עסק (אושר / נדחה / חסר פרט) ומיילי ההרשמה לאירוע ולסדנה.
* `backend/app/routers/resend_webhook.py` · `backend/app/models/email_events.py` — מה Resend מדווח על כל מייל (MEH-3839): נמסר, חזר (bounce), סומן כספאם, נחסם, נלחץ. נשמר שורה לכל אירוע בטבלה `email_events`, עם הדומיין של הנמען ומזהה החשבון, בלי הכתובת. ‏`send_email(..., kind=)` מסמן כל מייל בסוג שלו (`weekly_summary`, `onboarding_2`, `order_new_order`…), וכך אפשר לספור לפי סוג מייל. כבוי (503) עד ש-`RESEND_WEBHOOK_SECRET` מוגדר. נמחק אחרי 30 יום.
* `backend/app/worker.py` — שירות ה-worker הנפרד ב-Railway (`railway.worker.json`) שמריץ את התור ואת טיק ההזמנות, אחרי `OUTBOX_EXTERNAL_WORKER=true` בשירות האתר.
* `frontend/components/EmailLinkUnsubscribe.jsx` — דף הנחיתה האחד של כל קישור «הסרה» במייל (ניוזלטר, רשימת המתנה, סיכום שבועי): שולח את הטוקן ב-POST בטעינה, «נסו שוב» על 429/5xx/רשת, והטוקן יורד מכתובת הדף (MEH-3464).
* `backend/app/services/email_layout.py` — **המסגרת האחת של כל מייל** (MEH-3587): לוגו, כרטיס, RTL, כותרת, כפתורים. `send_email` עוטף בה אוטומטית כל מייל שנשלח כטקסט בלבד: שורה «תווית: כתובת» הופכת לכפתור, וגרסת הטקסט יוצאת בלי שינוי. מייל חדש לא צריך לבנות HTML כדי להיראות ממותג.
  מאז MEH-3621 גם כל תבנית שנבנתה ביד (איפוס סיסמה, אימות, ברוכים הבאים, ניוזלטר, סלי הפתעה, הסיכום השבועי, אישור ודחיית עסק, דיווחים, ניתוק בעלים) קוראת ל-`frame()`, ואין בקוד שום `<html>` אחר. שורת הערה קטנה מתחת לכפתור היא `note_row()`, ושורת ביטול מנוי מעל החתימה היא `footer_html`. השומר: `tests/test_email_logo.py` (מסמך HTML אחד בכל ה-backend) ו-`tests/test_meh3621_email_frame_parts.py`.
* `backend/app/services/registration_emails.py` — `_shell` (עכשיו קורא ל-`frame` של email_layout) ו-`_button`.
* `backend/app/services/email_branding.py` — הלוגו. תמונות במייל נטענות תמיד מ-mehamakor.co.il, בכל סביבה: ה-staging נעול בהגנת Vercel ושרתי התמונות של Gmail/Outlook לא מגיעים אליו (MEH-3583). קישורים במייל ממשיכים ללכת אחרי FRONTEND_URL. שם גם `email_signoff_html()`: החתימה «צוות מהמקור» עם סמל הפרח, שהמסגרת שמה בתחתית כל מייל (MEH-3594). ל-`<img>` של הסמל יש `alt="·"`: כל תמונה במייל צריכה alt לא ריק, והשרת לא שולח אימוג'י. הלוגו עצמו (`frontend/public/email-logo.png`) הוא תג מעוגל בצבע השמנת עם פינות שקופות (MEH-3916): Gmail במצב כהה צובע מחדש רקעים אבל לא תמונות, אז רקע לבן אטום היה מלבן לבן על מסך כהה. המסגרת גם מבקשת `color-scheme: light only`, ש-Apple Mail ו-Outlook מכבדים ו-Gmail לא. השומר: `tests/test_email_logo.py`.
* `backend/app/services/rescue_emails.py` · `backend/app/services/rescue_no_show.py` · `backend/app/services/pending_nudge.py`
* `backend/app/services/push.py` — התראות דפדפן.
* `backend/app/services/weekly_owner_summary.py` · `backend/app/routers/producer_me_weekly_summary.py` — הסיכום השבועי לבית העסק. כל מייל נושא `List-Unsubscribe` ו-one-click לפי RFC 8058 (`send_email(..., headers=)`), ובעלת העסק מחזירה או מפסיקה אותו במתג ב«תובנות» (MEH-3212). נשלח רק מ-5 צפיות בשבוע, או פחות כשהייתה לחיצה על וואטסאפ או קשר (`MIN_VIEWS`, `worth_sending`, MEH-3476).
* `backend/app/services/job_heartbeat.py` — ה-heartbeat של משימות הרקע; כשל בשליחה נרשם ב-WARNING ולא נבלע.

**Flags.** `RESEND_WEBHOOK_SECRET` — הסוד של ה-webhook ב-Resend; בלעדיו `/webhook/resend` עונה 503. `OUTBOX_EXTERNAL_WORKER` — מי מריץ את התור: false (ברירת מחדל) = האתר, true = ה-worker. `WEEKLY_OWNER_SUMMARY_ENABLED` — הסיכום השבועי (כבוי עד שהשדה נוסף ל-`config.py`). בלי `ANTHROPIC_API_KEY` תכונות ה-AI מתדרדרות, שכבת ההזדהות לא.

**טסטים**
* `tests/test_meh0000_email_frame.py` — המסגרת: viewport, פלטה, ריפוד בנייד.
* `tests/test_meh3587_email_layout.py` · `tests/test_meh3621_email_frame_parts.py` · `tests/test_email_logo.py` · `tests/test_meh2164_newsletter_mobile_width.py` · `tests/test_meh2151_approval_email_cta.py`
* `tests/test_meh3591_missing_emails.py` — «הסיסמה בחשבון שונתה» ואישור הצטרפות לקבוצה (MEH-3591).
* `tests/test_newsletter_unsubscribe.py` · `tests/test_meh2611_newsletter_resend_sync.py` · `tests/test_meh2875_newsletter_kicker.py`
* `tests/test_meh3079_weekly_owner_summary.py` · `tests/test_meh3212_weekly_summary_toggle.py` — הסיכום השבועי, ההסרה, המתג והכותרות.
* `tests/test_meh3350_heartbeat_logging.py`
* `tests/test_meh3839_resend_events.py` — אירועי Resend: חתימה, כפילות, בלי כתובת, תיוג הסוג, מחיקה אחרי 30 יום.
* `tests/test_meh3535_email_outbox.py` — התור: ניסיון חוזר, ניקוי התוכן, נעילה, ה-worker, ההחלפה בין האתר ל-worker.

**מזהי רישום שזה מכסה.** `email_alerts`, `onboarding_emails`.
