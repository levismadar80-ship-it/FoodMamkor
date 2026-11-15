"""
Email senders for the auth flows.

All four functions wrap app.services.email.send_email with a complete
RTL Hebrew text body + matching HTML body. No security logic, no DB
writes — pure body construction + send. Lifted verbatim from
backend/app/routers/auth.py during the MEH-440 refactor.

MEH-2952: each sender takes `test_cause` — True when the account the email is
about (`users.is_test`, or for a producer welcome its business's
`producers.is_test`) is a seeded test row — and passes it to send_email,
which then sends nothing.
"""

import logging
from html import escape as html_escape

from app.config import settings
from app.services.email import send_email
from app.services.email_branding import email_logo_html

logger = logging.getLogger(__name__)


def send_reset_email(
    email: str, name: str, reset_link: str, test_cause: bool = False
) -> None:
    # MEH-440-followup: escape name in HTML body. Plain-text body keeps
    # raw name (text rendering doesn't interpret markup).
    name_html = html_escape(name or "")
    body = (
        f"שלום {name},\n\n"
        f"קיבלנו בקשה לאיפוס הסיסמה שלך במהמקור.\n\n"
        f"לאיפוס הסיסמה יש ללחוץ על הקישור הבא (תוקף: שעה אחת):\n"
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
        <table width="100%" cellpadding="40" cellspacing="0" style="background:#ffffff;border-radius:12px;text-align:right;direction:rtl;max-width:560px;margin:0 auto;">
          <tr>
            <td style="text-align:right;direction:rtl;">
              {email_logo_html()}
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">שלום {name_html},</h1>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 24px;">קיבלנו בקשה לאיפוס הסיסמה שלך במהמקור.<br>לאיפוס הסיסמה יש ללחוץ על הכפתור (תוקף: שעה אחת):</p>
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
                אם הכפתור לא עובד, אפשר להעתיק את הקישור לדפדפן:<br>
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
    send_email(
        email,
        "מהמקור - איפוס סיסמה",
        body,
        html=html_body,
        test_cause=test_cause,
    )


def send_verify_email(
    email: str, name: str, token: str, test_cause: bool = False
) -> bool:
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
        f"לאימות כתובת האימייל שלך יש ללחוץ על הקישור הבא:\n\n"
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
        <table width="100%" cellpadding="40" cellspacing="0" style="background:#ffffff;border-radius:12px;text-align:right;direction:rtl;max-width:560px;margin:0 auto;">
          <tr>
            <td style="text-align:right;direction:rtl;">
              {email_logo_html()}
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">שלום {name_html},</h1>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 24px;">לאימות כתובת האימייל שלך יש ללחוץ על הכפתור:</p>
              <div style="text-align:center;margin:0 0 28px;">
                <a href="{verify_url}"
                   style="display:inline-block;background:#2e6853;color:#ffffff;text-decoration:none;
                          font-size:15px;font-weight:bold;padding:14px 36px;border-radius:10px;">
                  אימות האימייל
                </a>
              </div>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 8px;">הקישור תקף ל-24 שעות.</p>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 24px;">אם לא נרשמת למהמקור, אפשר להתעלם מהמייל הזה.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;">
              <p style="color:#999;font-size:11px;word-break:break-all;margin:0;">
                אם הכפתור לא עובד, אפשר להעתיק את הקישור לדפדפן:<br>
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
    send_email(
        email,
        "מהמקור - אימות האימייל שלך",
        body,
        html=html_body,
        test_cause=test_cause,
    )
    return True


def send_welcome_email(
    email: str, name: str, role: str = "consumer", test_cause: bool = False
) -> bool:
    if not settings.resend_api_key:
        logger.error(
            "[EMAIL] welcome email SKIPPED for '%s' — missing: RESEND_API_KEY", email
        )
        return False
    # MEH-1401: greet by FIRST NAME only (name is usually the full registered
    # name, often English) + escape it in the HTML body (plain text keeps raw,
    # per the :31 reset-email precedent). Guarded for an empty/whitespace name.
    first_name = ((name or "").split() or [""])[0]
    first_name_html = html_escape(first_name)

    # MEH-1401 locked this copy; Sapir re-approved it in neutral form 04/11/2026.
    consumer_body = (
        f"שלום {first_name},\n\n"
        f"ברוכים הבאים למהמקור! 🌿\n\n"
        f"מהמקור מרכז בתי עסק מקומיים לאוכל אמיתי — כל אחד נבחר ואושר אישית.\n\n"
        f"מה עכשיו?\n"
        f"• לגלות בתי עסק לפי עיר או קטגוריה\n"
        f"• לפתוח את המפה ולראות מה יש בסביבה: {settings.frontend_url}/map\n"
        f"• לשמור מועדפים כדי לא לאבד אותם\n\n"
        f"יש שאלה? אפשר פשוט להשיב למייל הזה.\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )
    producer_body = (
        f"שלום {first_name},\n\n"
        f"ברוכים הבאים למהמקור! 🌿\n\n"
        f"העסק שלך ממתין כרגע לאישור אדמין — אנחנו בודקים כל עסק חדש כדי לוודא\n"
        f"שהוא מתאים לקריטריונים שלנו (ייצור מקומי, חומרי גלם מזוהים, ללא מעובד).\n\n"
        f"אחרי האישור יגיע מייל עם הקישור לעסק שלך,\n"
        f"ואפשר יהיה לפרסם אירועים, לעדכן מוצרים ולעקוב אחרי מועדפים.\n\n"
        f"לדשבורד: {settings.frontend_url}/producer/dashboard\n\n"
        f"בברכה,\nצוות מהמקור 🌱"
    )

    # MEH-1401: HTML bodies mirror the reset-password RTL template (:41-73)
    # so Gmail renders Hebrew with correct BiDi. Inlined per the two existing
    # templates — no shared helper (over-engineering guard).
    consumer_html = f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="40" cellspacing="0" style="background:#ffffff;border-radius:12px;text-align:right;direction:rtl;max-width:560px;margin:0 auto;">
          <tr>
            <td style="text-align:right;direction:rtl;">
              {email_logo_html()}
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">שלום {first_name_html},</h1>
              <p style="color:#1C1A17;font-size:16px;font-weight:bold;line-height:1.7;margin:0 0 16px;">ברוכים הבאים למהמקור! 🌿</p>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 20px;">מהמקור מרכז בתי עסק מקומיים לאוכל אמיתי — כל אחד נבחר ואושר אישית.</p>
              <p style="color:#1C1A17;font-size:15px;font-weight:bold;margin:0 0 8px;">מה עכשיו?</p>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.9;margin:0 0 24px;">
                • לגלות בתי עסק לפי עיר או קטגוריה<br>
                • לפתוח את המפה ולראות מה יש בסביבה: <a href="{settings.frontend_url}/map" style="color:#2e6853;">{settings.frontend_url}/map</a><br>
                • לשמור מועדפים כדי לא לאבד אותם
              </p>
              <div style="text-align:center;margin:0 0 28px;">
                <a href="{settings.frontend_url}"
                   style="display:inline-block;background:#2e6853;color:#ffffff;text-decoration:none;
                          font-size:15px;font-weight:bold;padding:14px 36px;border-radius:10px;">
                  גלו בתי עסק
                </a>
              </div>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 16px;">יש שאלה? אפשר פשוט להשיב למייל הזה.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;">
              <p style="color:#999;font-size:13px;line-height:1.6;margin:0;">בברכה,<br>צוות מהמקור 🌱</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    producer_html = f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="40" cellspacing="0" style="background:#ffffff;border-radius:12px;text-align:right;direction:rtl;max-width:560px;margin:0 auto;">
          <tr>
            <td style="text-align:right;direction:rtl;">
              {email_logo_html()}
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">שלום {first_name_html},</h1>
              <p style="color:#1C1A17;font-size:16px;font-weight:bold;line-height:1.7;margin:0 0 16px;">ברוכים הבאים למהמקור! 🌿</p>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 16px;">העסק שלך ממתין כרגע לאישור אדמין — אנחנו בודקים כל עסק חדש כדי לוודא שהוא מתאים לקריטריונים שלנו (ייצור מקומי, חומרי גלם מזוהים, ללא מעובד).</p>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 24px;">אחרי האישור יגיע מייל עם הקישור לעסק שלך, ואפשר יהיה לפרסם אירועים, לעדכן מוצרים ולעקוב אחרי מועדפים.</p>
              <div style="text-align:center;margin:0 0 28px;">
                <a href="{settings.frontend_url}/producer/dashboard"
                   style="display:inline-block;background:#2e6853;color:#ffffff;text-decoration:none;
                          font-size:15px;font-weight:bold;padding:14px 36px;border-radius:10px;">
                  ללוח הבקרה
                </a>
              </div>
              <p style="color:#999;font-size:13px;line-height:1.6;margin:0;">בברכה,<br>צוות מהמקור 🌱</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    if role == "producer":
        body, html_body = producer_body, producer_html
    else:
        body, html_body = consumer_body, consumer_html
    send_email(
        email,
        "ברוכים הבאים למהמקור 🌿",
        body,
        html=html_body,
        test_cause=test_cause,
    )
    return True


# MEH-1815: the frontend route the producer duplicate-attempt email points at.
# Named rather than inlined so a route rename has something to grep for — an
# email already in someone's inbox cannot be corrected after the fact.
_PRODUCER_REGISTER_PATH = "/register/producer"


def send_duplicate_attempt_email(
    email: str,
    name: str,
    provider: str,
    flow: str = "consumer",
    test_cause: bool = False,
) -> None:
    """MEH-328: notify an existing account that someone tried to register
    with their email. Triggered from the anti-enumeration branch in
    POST /auth/register where the response body is identical to the
    happy path; this email is the only out-of-band signal the legitimate
    owner receives. `provider` selects body copy:
      - "password" → "כבר יש לך חשבון אצלנו עם סיסמה"
      - "google"/"apple" → "כבר יש לך חשבון אצלנו דרך {Google|Apple}"

    MEH-1815: `flow` selects which registration surface was attempted.
    The producer collision branch discards the entire Producer payload
    (categories, delivery areas, the lot) with no DB write, so the
    consumer copy — which says only "you already have an account" — left
    the owner believing her business was registered. The producer variant
    states plainly that the details were NOT saved and points at the exact
    next step. This is the out-of-band channel MEH-328 explicitly reserves
    for it; the response bytes are untouched.
    Fail-open via send_email (no Resend key → silent skip).
    """
    login_url = f"{settings.frontend_url}/login"
    if flow == "producer":
        # Frontend route, embedded in an email body. Named so a rename has a
        # grep surface here — already-sent mail cannot be fixed retroactively.
        producer_register_path = _PRODUCER_REGISTER_PATH
        if provider == "password":
            identity = (
                "כבר יש לך חשבון אצלנו עם סיסמה. אם זה היה ניסיון שלך, חשוב לדעת: "
                "פרטי העסק שמולאו בטופס לא נשמרו."
            )
            closing = "אם זה לא היה ניסיון שלך — הסיסמה לא נחשפה ולא דרושה פעולה."
        else:
            provider_label = "Google" if provider == "google" else "Apple"
            identity = (
                f"כבר יש לך חשבון אצלנו דרך {provider_label}. אם זה היה ניסיון שלך, חשוב לדעת: "
                f"פרטי העסק שמולאו בטופס לא נשמרו."
            )
            closing = "אם זה לא היה ניסיון שלך — החשבון לא נפגע ולא דרושה פעולה."
        body = (
            f"היי {name},\n"
            f"מישהו ניסה לרשום בית עסק במהמקור עם הכתובת שלך.\n"
            f"{identity}\n"
            f"כדי לרשום את העסק, צריך להיכנס לחשבון ולמלא את הטופס — "
            f"הפרטים ששמרנו בדפדפן ימתינו לך:\n"
            f"{login_url}?redirect={producer_register_path}\n\n"
            f"{closing}\n"
            f"בברכה,\n"
            f"צוות מהמקור"
        )
        send_email(
            email,
            "ניסיון רישום עסק במהמקור — יש לך כבר חשבון",
            body,
            test_cause=test_cause,
        )
        return
    subject = "ניסיון רישום במהמקור — יש לך כבר חשבון"
    if provider == "password":
        body = (
            f"היי {name},\n"
            f"מישהו ניסה להירשם למהמקור עם הכתובת שלך.\n"
            f"כבר יש לך חשבון אצלנו עם סיסמה. אם זה היה ניסיון שלך, אפשר להיכנס כאן:\n"
            f"{login_url}\n\n"
            f"אם זה לא היה ניסיון שלך — הסיסמה לא נחשפה ולא דרושה פעולה.\n"
            f"בברכה,\n"
            f"צוות מהמקור"
        )
    else:
        provider_label = "Google" if provider == "google" else "Apple"
        body = (
            f"היי {name},\n"
            f"מישהו ניסה להירשם למהמקור עם הכתובת שלך.\n"
            f"כבר יש לך חשבון אצלנו דרך {provider_label}. אם זה היה ניסיון שלך, אפשר להיכנס כאן:\n"
            f"{login_url}\n\n"
            f"אם זה לא היה ניסיון שלך — החשבון לא נפגע ולא דרושה פעולה.\n"
            f"בברכה,\n"
            f"צוות מהמקור"
        )
    send_email(email, subject, body, test_cause=test_cause)


def send_deletion_email(email: str, name: str, test_cause: bool = False) -> None:
    body = (
        f"שלום {name},\n\n"
        f"החשבון שלך במהמקור נמחק בהצלחה.\n"
        f"כל הנתונים שלך, כולל מועדפים, מוצרים ודירוגים, נמחקו לצמיתות.\n\n"
        # Neutral plural (Sapir, 04/11/2026): every reader-facing imperative in
        # this module is plural or infinitive, never feminine or masculine
        # singular. Was "צור" (MEH-1965), then "צרי".
        f"אם לא ביקשת למחוק את החשבון, צרו איתנו קשר מיידית.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(email, "מהמקור - החשבון שלך נמחק", body, test_cause=test_cause)


# ---------------------------------------------------------------------------
# MEH-2974 — owner invite for a business an admin built end to end
# ---------------------------------------------------------------------------

# The one place the privacy-policy address is built for this email. Sapir's
# copy ends with «איך אנחנו שומרים על המידע: {privacy_url}», and MEH-2208
# (תיקון 13) is the open card for covering invitee PII in the policy itself —
# the link is this feature's half of that, so it must never silently drop.
_PRIVACY_PATH = "/privacy"


def send_owner_invite_email(
    email: str,
    first_name: str,
    business: str,
    link: str,
    test_cause: bool = False,
) -> None:
    """The invite Sapir sends after building a business's page herself.

    Copy is LOCKED (MEH-2974 <hebrew_copy> v3, approved 12/11 under the layer-3
    voice of docs/BRAND.md §לשון פנייה: fully neutral, addressed by name, no
    slash forms). It is reproduced verbatim in both parts — do not "improve" a
    word here without a new approval.

    `first_name` may legitimately be empty (an admin who recorded only a
    business contact), and the greeting degrades to «היי,» rather than
    rendering «היי ,» — the same fallback shape as
    `onboarding_followup._greeting`.

    Fail-open like every other sender: `send_email` returns None on every path
    and raises nothing, so a Resend outage cannot turn an invite into a 500
    after the token has already been stored. The admin still holds the link in
    the response and can send it by WhatsApp, which is the whole reason the
    response carries it.
    """
    greeting = f"היי {first_name}," if (first_name or "").strip() else "היי,"
    privacy_url = f"{settings.frontend_url}{_PRIVACY_PATH}"
    subject = f"הדף של {business} במהמקור מוכן, נשאר רק לאשר"
    body = (
        f"{greeting}\n\n"
        f"כמו שסיכמנו, הכנתי את הדף של {business} במהמקור.\n\n"
        f"נשאר צעד אחד: לבדוק את הדף, לקבוע סיסמה ולאשר את התקנון ואת הצהרת "
        f"הרישוי. אחרי האישור הדף באוויר, ואפשר לנהל אותו ישירות.\n\n"
        f"[בדיקה ואישור הדף]\n"
        f"{link}\n\n"
        f"הקישור תקף ל-7 ימים ונועד לשימוש אישי.\n\n"
        f"המייל הגיע בטעות, או שהדף כבר לא רלוונטי? אפשר להשיב למייל הזה והדף יוסר.\n\n"
        f"איך אנחנו שומרים על המידע: {privacy_url}\n\n"
        f"ספיר שנפ\n"
        f"מייסדת | מהמקור"
    )
    # MEH-440-followup: escape anything that reaches the HTML part. `business`
    # is an admin-entered business name and `first_name` an admin-entered
    # person name — both bleached at the API boundary, but this template
    # interpolates into raw markup, so the escape is the layer that belongs
    # here. The plain-text part keeps the raw values (text rendering
    # interprets no markup).
    greeting_html = html_escape(greeting)
    business_html = html_escape(business)
    html_body = f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="40" cellspacing="0" style="background:#ffffff;border-radius:12px;text-align:right;direction:rtl;max-width:560px;margin:0 auto;">
          <tr>
            <td style="text-align:right;direction:rtl;">
              {email_logo_html()}
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">{greeting_html}</h1>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 12px;">כמו שסיכמנו, הכנתי את הדף של {business_html} במהמקור.</p>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 24px;">נשאר צעד אחד: לבדוק את הדף, לקבוע סיסמה ולאשר את התקנון ואת הצהרת הרישוי. אחרי האישור הדף באוויר, ואפשר לנהל אותו ישירות.</p>
              <div style="text-align:center;margin:0 0 28px;">
                <a href="{link}"
                   style="display:inline-block;background:#2e6853;color:#ffffff;text-decoration:none;
                          font-size:15px;font-weight:bold;padding:14px 36px;border-radius:10px;">
                  בדיקה ואישור הדף
                </a>
              </div>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 12px;">הקישור תקף ל-7 ימים ונועד לשימוש אישי.</p>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 24px;">המייל הגיע בטעות, או שהדף כבר לא רלוונטי? אפשר להשיב למייל הזה והדף יוסר.</p>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 24px;">איך אנחנו שומרים על המידע: <a href="{privacy_url}" style="color:#2e6853;">{privacy_url}</a></p>
              <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;">
              <p style="color:#999;font-size:11px;word-break:break-all;margin:0 0 16px;">
                אם הכפתור לא עובד, אפשר להעתיק את הקישור לדפדפן:<br>
                <a href="{link}" style="color:#2e6853;">{link}</a>
              </p>
              <p style="color:#3a3a3a;font-size:14px;line-height:1.6;margin:0;">ספיר שנפ<br>מייסדת | מהמקור</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    send_email(email, subject, body, html=html_body, test_cause=test_cause)


def send_owner_invite_code_email(
    email: str,
    business: str,
    code: str,
    test_cause: bool = False,
) -> None:
    """The 6-digit code that proves the address typed on the acceptance page.

    v3 of the card made the invite link work with NO email on it — most
    businesses reach us on Instagram or WhatsApp — so the owner types her
    address on the page, and this is what turns a typed string into a proven
    one before any account exists.

    Deliberately short and unsigned: no name, no link, no privacy paragraph,
    no «ספיר שנפ» signature. It can be sent to an address nobody has verified
    yet, including one entered by mistake, so it says as little as possible
    about who is inviting whom. Copy is LOCKED (<hebrew_copy> v3).

    The code is passed in, never generated here — `producer_owner_invite.py`
    mints it, keeps only its sha256, and this function is the one place the
    raw value is allowed to exist besides that response path.
    """
    business_html = html_escape(business)
    code_html = html_escape(code)
    subject = f"קוד האימות לדף של {business} במהמקור"
    body = (
        f"קוד האימות: {code}\n\n"
        f"הקוד תקף ל-10 דקות ומשמש לאישור הדף של {business} במהמקור.\n\n"
        f"המייל הגיע בטעות? אפשר להתעלם ממנו.\n\n"
        f"מהמקור"
    )
    html_body = f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="40" cellspacing="0" style="background:#ffffff;border-radius:12px;text-align:right;direction:rtl;max-width:560px;margin:0 auto;">
          <tr>
            <td style="text-align:right;direction:rtl;">
              {email_logo_html()}
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 12px;">קוד האימות:</p>
              <p style="font-size:30px;font-weight:bold;letter-spacing:6px;color:#1C1A17;margin:0 0 24px;" dir="ltr">{code_html}</p>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 12px;">הקוד תקף ל-10 דקות ומשמש לאישור הדף של {business_html} במהמקור.</p>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0;">המייל הגיע בטעות? אפשר להתעלם ממנו.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    send_email(email, subject, body, html=html_body, test_cause=test_cause)
