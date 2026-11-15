"""
Module:   owner_detach
Purpose:  The one mail of the admin «ניתוק בעלים» action: tells the former
          owner that her account is no longer linked to the business and that
          the account itself stays.
Touches:  Resend (via services/email.send_email).
Does NOT: change any row (routers/producer_owner_detach.py does), or invite the
          new owner (that is the ordinary owner invite,
          routers/producer_owner_invite.py).
Related:  services/auth_emails.py `send_owner_invite_email` (same layout and
          signature block).
History:  MEH-3256 (grill retro D9, creation).
"""

from html import escape as html_escape

from app.services.email import send_email
from app.services.email_branding import email_logo_html


def send_owner_detached_email(
    email: str,
    first_name: str,
    business: str,
    test_cause: bool = False,
) -> None:
    """Fail-open like every other sender: `send_email` raises nothing."""
    greeting = f"היי {first_name}," if (first_name or "").strip() else "היי,"
    subject = f"החשבון שלך כבר לא מחובר לדף של {business} במהמקור"
    lines = [
        f"רצינו לעדכן שהחשבון שלך במהמקור כבר לא מחובר לדף של {business}.",
        "החשבון עצמו נשאר: אפשר להמשיך להתחבר, והמועדפים והביקורות שלך שמורים.",
        "אם זה נעשה בטעות, אפשר להשיב למייל הזה ונסדר את זה.",
    ]
    body = f"{greeting}\n\n" + "\n\n".join(lines) + "\n\nספיר שנפ\nמייסדת | מהמקור"
    paragraphs = "".join(
        f'<p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 12px;">'
        f"{html_escape(line)}</p>"
        for line in lines
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
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">{html_escape(greeting)}</h1>
              {paragraphs}
              <p style="color:#3a3a3a;font-size:14px;line-height:1.6;margin:12px 0 0;">ספיר שנפ<br>מייסדת | מהמקור</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    send_email(email, subject, body, html=html_body, test_cause=test_cause)
