"""
MEH-2763 — the three emails of the on-site sign-up form.

Purpose:  1. to the visitor: her sign-up was taken, with date, time, place,
             who hosts it and the «ביטול ההרשמה» link;
          2. to the owner: a new sign-up, with name, phone, email and
             «נשארו N מקומות» when the item has a cap;
          3. to the owner: a sign-up was cancelled.
          Subjects and the cancel-link label approved word for word by Sapir
          on 6/11/2026 (research artifact, section «גרסה גנרית», items 10–12).
Inputs:   Plain strings and ints only. Runs as a BackgroundTask after the
          request's Session is closed, so it never receives an ORM object.
Does NOT: touch the DB, decide whether to send (the router does), or retry.
          `send_email` is fail-open, so a failed send never undoes a sign-up.
          No copy here says what the owner WILL do (ADR-031).
Related:  app/routers/registrations.py, app/services/rescue_emails.py (same
          HTML shell), app/services/email.py
          MEH-2952: each sender takes `test_cause` (the business/host the
          sign-up is for is a test row) and send_email then sends nothing.
History:  MEH-2763 (creation)
"""

from __future__ import annotations

from dataclasses import dataclass
from html import escape as html_escape

from app.services.email import send_email
from app.services.email_branding import email_logo_html


def _one_line(value: str) -> str:
    """Collapse whitespace so a typed line break can't split a header."""
    return " ".join((value or "").split())


def _shell(heading: str, rows_html: str, button_html: str = "") -> str:
    """The rescue_emails.py card, without its code box."""
    return f"""\
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0E8;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F5F0E8;padding:24px 12px;direction:rtl;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;margin:0 auto;">
      <tr><td style="text-align:right;padding:0 4px 14px;">{email_logo_html()}</td></tr>
      <tr><td style="background:#ffffff;border-radius:14px;border:1px solid #e5dfd3;overflow:hidden;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="background:#2e6853;color:#ffffff;padding:18px 22px;text-align:right;font-size:19px;font-weight:bold;line-height:1.4;">{heading}</td></tr>
          <tr><td style="padding:18px 22px 6px;text-align:right;font-size:15px;color:#1c1a17;line-height:1.8;">{rows_html}</td></tr>
          {button_html}
        </table>
      </td></tr>
      <tr><td style="text-align:center;padding:14px 4px 0;font-size:12px;color:#8a8478;">צוות מהמקור</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""


def _button(url: str, label: str) -> str:
    e = html_escape
    return (
        '<tr><td style="padding:16px 22px 24px;text-align:center;">'
        f'<a href="{e(url)}" style="display:inline-block;background:#ffffff;color:#2e6853;'
        "border:2px solid #2e6853;text-decoration:none;font-size:15px;font-weight:bold;"
        f'padding:11px 28px;border-radius:10px;">{e(label)}</a></td></tr>'
    )


@dataclass(frozen=True)
class VisitorEmail:
    """What the visitor's confirmation shows — read while the Session was open."""

    title: str
    date_text: str  # e.g. "14.11.2026"
    time_text: str  # "10:00" or ""
    place: str  # city, plus the address only for a public venue
    host_name: str
    item_url: str
    cancel_url: str


def send_visitor_confirmation(
    to: str, m: VisitorEmail, test_cause: bool = False
) -> None:
    title = _one_line(m.title)
    subject = f'ההרשמה ל-"{title}" נקלטה'
    when = m.date_text + (f", {m.time_text}" if m.time_text else "")
    lines = [
        ("מתי", when),
        ("איפה", m.place),
        ("בית העסק", m.host_name),
    ]
    lines = [(k, v) for k, v in lines if v]

    body = (
        f"{subject}\n\n"
        + "\n".join(f"{k}: {v}" for k, v in lines)
        + f"\n\nלפרטים: {m.item_url}\n"
        f"ביטול ההרשמה: {m.cancel_url}\n\n"
        "צוות מהמקור"
    )

    e = html_escape
    rows_html = "<br>\n".join(f"<b>{e(k)}:</b> {e(v)}" for k, v in lines)
    rows_html += (
        f'<br>\n<a href="{e(m.item_url)}" style="color:#2e6853;">{e(title)}</a>'
    )
    html = _shell(e(subject), rows_html, _button(m.cancel_url, "ביטול ההרשמה"))
    send_email(to, subject, body, html=html, test_cause=test_cause)


@dataclass(frozen=True)
class OwnerNewEmail:
    title: str
    name: str
    phone: str
    email: str
    spots_left: int | None  # None = no cap → the line is left out
    manage_url: str


def send_owner_new_registration(
    to: str, m: OwnerNewEmail, test_cause: bool = False
) -> None:
    title = _one_line(m.title)
    subject = f'הרשמה חדשה ל-"{title}"'
    lines = [("שם", m.name), ("טלפון", m.phone), ("אימייל", m.email)]
    spots = f"נשארו {m.spots_left} מקומות" if m.spots_left is not None else ""

    body = (
        f"{subject}\n\n"
        + "\n".join(f"{k}: {v}" for k, v in lines)
        + (f"\n{spots}" if spots else "")
        + f"\n\n{m.manage_url}\n\nצוות מהמקור"
    )

    e = html_escape
    rows_html = "<br>\n".join(f"<b>{e(k)}:</b> {e(v)}" for k, v in lines)
    if spots:
        rows_html += f"<br>\n<b>{e(spots)}</b>"
    html = _shell(e(subject), rows_html, _button(m.manage_url, title))
    send_email(to, subject, body, html=html, test_cause=test_cause)


@dataclass(frozen=True)
class OwnerCancelEmail:
    title: str
    name: str
    manage_url: str


def send_owner_cancellation(
    to: str, m: OwnerCancelEmail, test_cause: bool = False
) -> None:
    title = _one_line(m.title)
    subject = f'ביטול הרשמה ל-"{title}"'
    body = f"{subject}\n\nשם: {m.name}\n\n{m.manage_url}\n\nצוות מהמקור"
    e = html_escape
    html = _shell(e(subject), f"<b>שם:</b> {e(m.name)}", _button(m.manage_url, title))
    send_email(to, subject, body, html=html, test_cause=test_cause)
