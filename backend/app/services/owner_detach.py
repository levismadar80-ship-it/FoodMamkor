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
from app.services.email_layout import frame


def send_owner_detached_email(
    email: str,
    first_name: str,
    business: str,
    test_cause: bool = False,
) -> None:
    """Fail-open like every other sender: `send_email` raises nothing."""
    greeting = f"היי {first_name}," if (first_name or "").strip() else "היי,"
    subject = f"החשבון כבר לא מחובר לדף של {business} במהמקור"
    lines = [
        f"רצינו לעדכן שהחשבון במהמקור כבר לא מחובר לדף של {business}.",
        "החשבון עצמו נשאר: אפשר להמשיך להתחבר, והמועדפים והביקורות שמורים.",
        "אם זה נעשה בטעות, אפשר להשיב למייל הזה ונסדר את זה.",
    ]
    body = f"{greeting}\n\n" + "\n\n".join(lines) + "\n\nצוות מהמקור"
    paragraphs = "".join(
        f'<p style="color:#1C1A17;font-size:15px;line-height:1.7;margin:0 0 12px;">'
        f"{html_escape(line)}</p>"
        for line in lines
    )
    html_body = frame(
        html_escape(greeting),
        f"""\
            {paragraphs}
        """,
    )
    send_email(email, subject, body, html=html_body, test_cause=test_cause)
