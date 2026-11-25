"""
Module:   staff_emails
Purpose:  The email a business sends to invite someone to handle its orders.
Touches:  Resend, through services/email.send_email (fail-open).
Does NOT: mint or store the link (routers/producer_staff.py), or say whether
          the address has an account: the same email goes to every address.
Related:  services/email_layout.py (the frame), services/auth_emails.py
          `send_owner_invite_email` (same layout).
History:  MEH-3526 (creation; copy under Sapir's approval of 20/11, «מאשרת
          את כל המלל שתחליט»).
"""

from html import escape as html_escape

from app.services.email import send_email
from app.services.email_layout import button, frame, note_row


def _subject(business: str) -> str:
    return f"הזמנה לטפל בהזמנות של {business} במהמקור"


def _body(business: str, link: str) -> str:
    return (
        "שלום,\n\n"
        f"{business} מזמינים אתכם לעזור בטיפול בהזמנות שמגיעות דרך מהמקור.\n\n"
        f"אחרי האישור אפשר להיכנס עם החשבון שלכם, לראות את ההזמנות של {business} "
        "ולעדכן אותן. אין גישה לשאר ההגדרות של בית העסק.\n\n"
        "[לאישור ההזמנה]\n"
        f"{link}\n\n"
        "הקישור תקף ל-7 ימים ועובד רק עם חשבון בכתובת המייל הזאת. "
        "אין עדיין חשבון? אפשר להירשם עם הכתובת הזאת ואז לפתוח שוב את הקישור.\n\n"
        "לא מכירים את בית העסק? אפשר להתעלם מהמייל.\n\n"
        "צוות מהמקור"
    )


def _html(business: str, link: str) -> str:
    """The branded frame of email_layout (MEH-3587/3621), same copy as _body."""
    b = html_escape(business)
    href = html_escape(link, quote=True)
    para = 'style="color:#1C1A17;font-size:15px;line-height:1.7;margin:0 0 12px;"'
    small = 'style="color:#5C584F;font-size:13px;line-height:1.6;margin:0 0 12px;"'
    return frame(
        "שלום,",
        f"<p {para}>{b} מזמינים אתכם לעזור בטיפול בהזמנות שמגיעות דרך מהמקור.</p>"
        f"<p {para}>אחרי האישור אפשר להיכנס עם החשבון שלכם, לראות את ההזמנות של {b} ולעדכן אותן. אין גישה לשאר ההגדרות של בית העסק.</p>",
        button(link, "לאישור ההזמנה")
        + note_row(
            f"<p {small}>הקישור תקף ל-7 ימים ועובד רק עם חשבון בכתובת המייל הזאת. אין עדיין חשבון? אפשר להירשם עם הכתובת הזאת ואז לפתוח שוב את הקישור.</p>"
            f"<p {small}>לא מכירים את בית העסק? אפשר להתעלם מהמייל.</p>"
            '<hr style="border:none;border-top:1px solid #E5DFD3;margin:0 0 16px;">'
            '<p style="color:#6B6860;font-size:11px;word-break:break-all;margin:0 0 16px;">'
            f'אם הכפתור לא עובד, אפשר להעתיק את הקישור לדפדפן:<br><a href="{href}" style="color:#2e6853;">{href}</a></p>'
        ),
    )


def send_staff_invite_email(
    email: str, business: str, link: str, test_cause: bool = False
) -> None:
    send_email(
        email,
        _subject(business),
        _body(business, link),
        html=_html(business, link),
        test_cause=test_cause,
    )
