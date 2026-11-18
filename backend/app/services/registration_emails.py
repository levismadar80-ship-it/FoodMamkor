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
      <tr><td style="text-align:center;padding:14px 4px 0;font-size:12px;color:#5C584F;">צוות מהמקור</td></tr>
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


# ---------- MEH-3227 (D1): the visitor's sign-up was cancelled or moved ----------
# Copy approved by Sapir on 14/11/2026 (copy doc «קופי לאישור — ביטולים
# והודעות ללקוחות», «מאשרת הכל»). Gender-neutral (ADR-037).


@dataclass(frozen=True)
class RegistrantEmail:
    """One visitor whose sign-up changed — read while the Session was open."""

    title: str
    date_text: str
    time_text: str
    place: str
    host_name: str
    cancel_url: str  # used only by the «moved» email


def _on(date_text: str, prefix: str) -> str:
    """« ב-<date>» — or nothing for a recurring item, whose stored date is its
    long-past first occasion (MEH-2871). Removes words, adds none."""
    return f" {prefix}{date_text}" if date_text else ""


def send_registrant_delisted(
    to: str, m: RegistrantEmail, test_cause: bool = False
) -> None:
    """The site took the business off, so its sign-ups were cancelled."""
    title = _one_line(m.title)
    host = _one_line(m.host_name)
    subject = f'ההרשמה ל-"{title}" בוטלה'
    lines = [
        f"בית העסק {host} כבר לא מופיע במהמקור, ולכן ההרשמה שלכם "
        f'ל-"{title}"{_on(m.date_text, "ב-")} בוטלה.',
        "אם סיכמתם משהו ישירות מול בית העסק, אפשר להמשיך מולו כרגיל.",
    ]
    _send_lines(to, subject, lines, test_cause=test_cause)


def send_registrant_cancelled(
    to: str, m: RegistrantEmail, test_cause: bool = False
) -> None:
    """The business cancelled or deleted the event, so the sign-up went with it."""
    title = _one_line(m.title)
    host = _one_line(m.host_name)
    subject = f'"{title}" בוטל'
    lines = [
        f'{host} ביטל את "{title}"{_on(m.date_text, "שתוכנן ל-")}, ולכן ההרשמה שלכם '
        "בוטלה. אין צורך להגיע.",
        f"לשאלות אפשר לפנות ישירות ל{host}.",
    ]
    _send_lines(to, subject, lines, test_cause=test_cause)


def send_registrant_moved(
    to: str, m: RegistrantEmail, test_cause: bool = False
) -> None:
    """The business moved the date or time; the sign-up stays."""
    title = _one_line(m.title)
    host = _one_line(m.host_name)
    subject = f'המועד של "{title}" השתנה'
    when = m.date_text + (f", {m.time_text}" if m.time_text else "")
    rows = [("מתי", when), ("איפה", m.place)]
    rows = [(k, v) for k, v in rows if v]
    intro = f'{host} שינה את המועד של "{title}".'
    outro = "ההרשמה שלכם נשארת בתוקף. אם המועד החדש לא מתאים, אפשר לבטל כאן:"
    body = (
        f"{subject}\n\n{intro}\n"
        + "\n".join(f"{k}: {v}" for k, v in rows)
        + f"\n\n{outro}\nביטול ההרשמה: {m.cancel_url}\n\nצוות מהמקור"
    )
    e = html_escape
    rows_html = f"{e(intro)}<br>\n" + "<br>\n".join(
        f"<b>{e(k)}:</b> {e(v)}" for k, v in rows
    )
    rows_html += f"<br><br>\n{e(outro)}"
    html = _shell(e(subject), rows_html, _button(m.cancel_url, "ביטול ההרשמה"))
    send_email(to, subject, body, html=html, test_cause=test_cause)


def send_registration_reminder(
    to: str, m: RegistrantEmail, test_cause: bool = False
) -> None:
    """MEH-3312: the evening before, a reminder with the time, the place and
    the cancel link, so a place that will not be used can go to someone."""
    title = _one_line(m.title)
    host = _one_line(m.host_name)
    subject = f'תזכורת: "{title}" מחר'
    when = m.date_text + (f", {m.time_text}" if m.time_text else "")
    rows = [("מתי", when), ("איפה", m.place), ("בית העסק", host)]
    rows = [(k, v) for k, v in rows if v]
    intro = f'מחכים לכם מחר ב"{title}".'
    outro = "לא תוכלו להגיע? כדאי לבטל, כדי שהמקום יתפנה למישהו אחר:"
    body = (
        f"{subject}\n\n{intro}\n"
        + "\n".join(f"{k}: {v}" for k, v in rows)
        + f"\n\n{outro}\nביטול ההרשמה: {m.cancel_url}\n\nצוות מהמקור"
    )
    e = html_escape
    rows_html = f"{e(intro)}<br>\n" + "<br>\n".join(
        f"<b>{e(k)}:</b> {e(v)}" for k, v in rows
    )
    rows_html += f"<br><br>\n{e(outro)}"
    html = _shell(e(subject), rows_html, _button(m.cancel_url, "ביטול ההרשמה"))
    send_email(to, subject, body, html=html, test_cause=test_cause)


def send_registrant_method_changed(
    to: str, m: RegistrantEmail, test_cause: bool = False
) -> None:
    """MEH-3310: the business stopped taking sign-ups on the site; hers stays."""
    title = _one_line(m.title)
    host = _one_line(m.host_name)
    subject = f'עדכון על ההרשמה ל"{title}"'
    lines = [
        f'ההרשמות ל"{title}" אצל {host} כבר לא נעשות דרך מהמקור.',
        "ההרשמה שלכם נשארת בתוקף, ובית העסק רואה אותה ברשימת הנרשמים.",
        f"לשאלות אפשר לפנות ישירות ל{host}. אם כבר לא מתאים לכם, אפשר לבטל כאן: {m.cancel_url}",
    ]
    _send_lines(to, subject, lines, test_cause=test_cause)


def _send_lines(to: str, subject: str, lines: list[str], *, test_cause: bool) -> None:
    body = f"{subject}\n\n" + "\n".join(lines) + "\n\nצוות מהמקור"
    e = html_escape
    html = _shell(e(subject), "<br>\n".join(e(x) for x in lines))
    send_email(to, subject, body, html=html, test_cause=test_cause)


# ---------- MEH-3314: the waitlist ----------


def _rows(m: VisitorEmail | RegistrantEmail) -> list[tuple[str, str]]:
    when = m.date_text + (f", {m.time_text}" if m.time_text else "")
    rows = [("מתי", when), ("איפה", m.place), ("בית העסק", m.host_name)]
    return [(k, v) for k, v in rows if v]


def send_waitlist_confirmation(
    to: str, m: VisitorEmail, test_cause: bool = False
) -> None:
    """She joined the waitlist of a full item. The link takes her off it."""
    title = _one_line(m.title)
    subject = f'נכנסתם לרשימת ההמתנה ל-"{title}"'
    rows = _rows(m)
    note = (
        "כרגע אין מקומות. אם יתפנה מקום, נשלח אימייל לראשונים ברשימה עם קישור להרשמה."
    )
    body = (
        f"{subject}\n\n"
        + "\n".join(f"{k}: {v}" for k, v in rows)
        + f"\n\n{note}\n\nלפרטים: {m.item_url}\n"
        f"יציאה מרשימת ההמתנה: {m.cancel_url}\n\nצוות מהמקור"
    )
    e = html_escape
    rows_html = "<br>\n".join(f"<b>{e(k)}:</b> {e(v)}" for k, v in rows)
    rows_html += f"<br><br>\n{e(note)}"
    html = _shell(e(subject), rows_html, _button(m.cancel_url, "יציאה מרשימת ההמתנה"))
    send_email(to, subject, body, html=html, test_cause=test_cause)


def send_waitlist_offer(
    to: str, m: RegistrantEmail, item_url: str, test_cause: bool = False
) -> None:
    """A sign-up was cancelled and she is first on the waitlist. The spot is
    not held: the page is open to everyone, so the email says so."""
    title = _one_line(m.title)
    host = _one_line(m.host_name)
    subject = f'התפנה מקום ב-"{title}"'
    rows = [(k, v) for k, v in _rows(m) if k != "בית העסק"]
    intro = f'התפנה מקום ב-"{title}" אצל {host}.'
    note = "המקום פתוח לכל מי שנכנס לדף, ולכן כדאי להירשם בהקדם."
    outro = "כבר לא מתאים? אפשר לצאת מרשימת ההמתנה:"
    body = (
        f"{subject}\n\n{intro}\n"
        + "\n".join(f"{k}: {v}" for k, v in rows)
        + f"\n\n{note}\nלהרשמה: {item_url}\n\n"
        f"{outro}\n{m.cancel_url}\n\nצוות מהמקור"
    )
    e = html_escape
    rows_html = f"{e(intro)}<br>\n" + "<br>\n".join(
        f"<b>{e(k)}:</b> {e(v)}" for k, v in rows
    )
    rows_html += (
        f"<br><br>\n{e(note)}<br><br>\n{e(outro)} "
        f'<a href="{e(m.cancel_url)}" style="color:#2e6853;">יציאה מרשימת ההמתנה</a>'
    )
    html = _shell(e(subject), rows_html, _button(item_url, "להרשמה"))
    send_email(to, subject, body, html=html, test_cause=test_cause)
