"""
Email senders for the auth flows.

All four functions wrap app.services.email.send_email with a complete
RTL Hebrew text body + matching HTML body. No security logic, no DB
writes — pure body construction + send. Lifted verbatim from
backend/app/routers/auth.py during the MEH-440 refactor.

`gen_referral_code` lives here because every registration path that
creates a User row uses it together with one of the email senders
below, so they share imports and call-site context.
"""

import logging
import uuid
from html import escape as html_escape

from app.config import settings
from app.services.email import send_email

logger = logging.getLogger(__name__)


def gen_referral_code() -> str:
    return uuid.uuid4().hex[:8]


def send_reset_email(email: str, name: str, reset_link: str) -> None:
    # MEH-440-followup: escape name in HTML body. Plain-text body keeps
    # raw name (text rendering doesn't interpret markup).
    name_html = html_escape(name or "")
    body = (
        f"שלום {name},\n\n"
        f"קיבלנו בקשה לאיפוס הסיסמה שלך במהמקור.\n\n"
        f"לחצי על הקישור הבא לאיפוס הסיסמה (תוקף: שעה אחת):\n"
        f"{reset_link}\n\n"
        f"אם לא ביקשת לאפס את הסיסמה, אפשר להתעלם ממייל זה — החשבון שלך בטוח.\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )
    html_body = f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="40" cellspacing="0" style="background:#ffffff;border-radius:12px;text-align:right;direction:rtl;max-width:560px;">
          <tr>
            <td style="text-align:right;direction:rtl;">
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">שלום {name_html},</h1>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 24px;">קיבלנו בקשה לאיפוס הסיסמה שלך במהמקור.<br>לחצי על הכפתור לאיפוס הסיסמה (תוקף: שעה אחת):</p>
              <div style="text-align:center;margin:0 0 28px;">
                <a href="{reset_link}"
                   style="display:inline-block;background:#2e6853;color:#ffffff;text-decoration:none;
                          font-size:15px;font-weight:bold;padding:14px 36px;border-radius:10px;">
                  איפוס סיסמה
                </a>
              </div>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 24px;">אם לא ביקשת לאפס את הסיסמה, אפשר להתעלם ממייל זה — החשבון שלך בטוח.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;">
              <p style="color:#999;font-size:11px;word-break:break-all;margin:0;">
                אם הכפתור לא עובד, העתיקי את הקישור לדפדפן:<br>
                <a href="{reset_link}" style="color:#2e6853;">{reset_link}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    send_email(email, "מהמקור - איפוס סיסמה", body, html=html_body)


def send_verify_email(email: str, name: str, token: str) -> bool:
    """Send email-verification link via Resend. Returns True when attempted with valid config."""
    if not settings.resend_api_key:
        logger.error(
            "[EMAIL] verify email SKIPPED for '%s' — missing: RESEND_API_KEY", email
        )
        return False
    verify_url = f"{settings.frontend_url}/verify-email?token={token}"
    # MEH-440-followup: escape name in HTML body (plain text unchanged).
    name_html = html_escape(name or "")
    body = (
        f"שלום {name},\n\n"
        f"לאימות כתובת האימייל שלך לחצי על הקישור הבא:\n\n"
        f"{verify_url}\n\n"
        f"הקישור תקף ל-24 שעות.\n\n"
        f"אם לא נרשמת למהמקור, אפשר להתעלם מהמייל הזה.\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )
    html_body = f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="40" cellspacing="0" style="background:#ffffff;border-radius:12px;text-align:right;direction:rtl;max-width:560px;">
          <tr>
            <td style="text-align:right;direction:rtl;">
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">שלום {name_html},</h1>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 24px;">לאימות כתובת האימייל שלך, לחצי על הכפתור:</p>
              <div style="text-align:center;margin:0 0 28px;">
                <a href="{verify_url}"
                   style="display:inline-block;background:#2e6853;color:#ffffff;text-decoration:none;
                          font-size:15px;font-weight:bold;padding:14px 36px;border-radius:10px;">
                  אמתי את האימייל שלך
                </a>
              </div>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 8px;">הקישור תקף ל-24 שעות.</p>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 24px;">אם לא נרשמת למהמקור, אפשר להתעלם מהמייל הזה.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;">
              <p style="color:#999;font-size:11px;word-break:break-all;margin:0;">
                אם הכפתור לא עובד, העתיקי את הקישור לדפדפן:<br>
                <a href="{verify_url}" style="color:#2e6853;">{verify_url}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    send_email(email, "מהמקור - אמתי את האימייל שלך", body, html=html_body)
    return True


def send_welcome_email(email: str, name: str, role: str = "consumer") -> bool:
    if not settings.resend_api_key:
        logger.error(
            "[EMAIL] welcome email SKIPPED for '%s' — missing: RESEND_API_KEY", email
        )
        return False
    consumer_body = (
        f"שלום {name},\n\n"
        f"ברוכה הבאה למהמקור! 🌿\n\n"
        f"עכשיו את יכולה לגלות בתי עסק מקומיים, כולם במקום אחד —\n"
        f"כל האוכל האמיתי, במקום אחד.\n\n"
        f"מה הלאה?\n"
        f"  • גלי בתי עסק לפי עיר או קטגוריה: {settings.frontend_url}\n"
        f"  • פתחי את המפה: {settings.frontend_url}/map\n"
        f"  • שמרי עסקים מועדפים\n\n"
        f"אם יש שאלות — פשוט תגיבי למייל הזה.\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )
    producer_body = (
        f"שלום {name},\n\n"
        f"ברוכה הבאה למהמקור! 🌿\n\n"
        f"העסק שלך ממתין כרגע לאישור אדמין — אנחנו בודקים כל עסק חדש כדי לוודא\n"
        f"שהוא מתאים לקריטריונים שלנו (ייצור מקומי, חומרי גלם מזוהים, ללא מעובד).\n\n"
        f"אחרי האישור תקבלי מייל עם הקישור לעסק שלך,\n"
        f"ותוכלי לפרסם אירועים, לעדכן מוצרים ולעקוב אחרי מועדפים.\n\n"
        f"לדשבורד: {settings.frontend_url}/producer/dashboard\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )
    body = producer_body if role == "producer" else consumer_body
    send_email(email, "ברוכה הבאה למהמקור 🌿", body)
    return True


def send_duplicate_attempt_email(email: str, name: str, provider: str) -> None:
    """MEH-328: notify an existing account that someone tried to register
    with their email. Triggered from the anti-enumeration branch in
    POST /auth/register where the response body is identical to the
    happy path; this email is the only out-of-band signal the legitimate
    owner receives. `provider` selects body copy:
      - "password" → "את כבר רשומה אצלנו עם סיסמה"
      - "google"/"apple" → "את כבר רשומה אצלנו דרך {Google|Apple}"
    Fail-open via send_email (no Resend key → silent skip).
    """
    login_url = f"{settings.frontend_url}/login"
    subject = "ניסיון רישום במהמקור — את כבר רשומה"
    if provider == "password":
        body = (
            f"היי {name},\n"
            f"מישהו ניסה להירשם למהמקור עם הכתובת שלך.\n"
            f"את כבר רשומה אצלנו עם סיסמה — אם זו את, היכנסי כאן:\n"
            f"{login_url}\n\n"
            f"אם זה לא את — סיסמתך לא נחשפה ולא דרושה פעולה.\n"
            f"בברכה,\n"
            f"צוות מהמקור"
        )
    else:
        provider_label = "Google" if provider == "google" else "Apple"
        body = (
            f"היי {name},\n"
            f"מישהו ניסה להירשם למהמקור עם הכתובת שלך.\n"
            f"את כבר רשומה אצלנו דרך {provider_label} — אם זו את, היכנסי כאן:\n"
            f"{login_url}\n\n"
            f"אם זה לא את — חשבונך לא נפגע ולא דרושה פעולה.\n"
            f"בברכה,\n"
            f"צוות מהמקור"
        )
    send_email(email, subject, body)


def send_deletion_email(email: str, name: str) -> None:
    body = (
        f"שלום {name},\n\n"
        f"החשבון שלך במהמקור נמחק בהצלחה.\n"
        f"כל הנתונים שלך, כולל מועדפים, מוצרים ודירוגים, נמחקו לצמיתות.\n\n"
        f"אם לא ביקשת למחוק את החשבון, צור איתנו קשר מיידית.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(email, "מהמקור - החשבון שלך נמחק", body)
