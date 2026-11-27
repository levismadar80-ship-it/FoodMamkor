"""
MEH-2715 — the buyer's confirmation email for a reserved rescue bag.

Purpose:  One email per reservation with the pickup code, what is paid at the
          counter, the pickup window and address, and the free-cancel cutoff.
          Copy approved word for word by Sapir on 6/11/2026; the design is the
          preview she approved the same day.
Inputs:   Plain strings and ints only. It runs as a BackgroundTask after the
          request's Session is closed, so it never receives an ORM object.
Does NOT: touch the DB, decide whether to send (the route does), or retry.
          `send_email` is fail-open, so a failed send never undoes a
          reservation.
Related:  app/routers/rescue.py::create_order, app/services/auth_emails.py
          (same HTML conventions), app/services/email.py
          MEH-2952: each sender takes `test_cause` (the business or the buyer
          is a seeded test row) and send_email then sends nothing.
History:  MEH-2715 (creation) · MEH-3897 (a prepaid bag: the business's link)
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from html import escape as html_escape

from app.config import settings
from app.services.email import send_email
from app.utils.clock import ISRAEL_TZ
from app.services.email_layout import frame
from app.services.prepay_copy import Prepay, buyer_pay_lines
from app.utils.money import shekels_text


def israel_hhmm(value: datetime) -> str:
    """A naive-UTC column value as HH:MM on the Israel clock."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(ISRAEL_TZ).strftime("%H:%M")


def israel_date(value: datetime) -> date:
    """A naive-UTC column value's calendar day on the Israel clock."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(ISRAEL_TZ).date()


def day_word(day: date, today: date) -> str:
    """MEH-3702: «היום» / «מחר» for a pickup day; "" for any other day (a
    caller that can reach one shows no word rather than a wrong one)."""
    if day == today:
        return "היום"
    if day == today + timedelta(days=1):
        return "מחר"
    return ""


@dataclass(frozen=True)
class ReservationEmail:
    """What the email shows — plain values, read while the Session was open."""

    producer_name: str
    producer_id: str
    pickup_code: str
    total_agorot: int
    pickup_from: str
    pickup_until: str
    address: str
    # None = reserved after the free-cancel cutoff: no cancel line, no button
    # (MEH-2737, approved 6/11).
    cancel_until: str | None
    # MEH-3593: the business's «הוראות איסוף»; None = no line.
    pickup_note: str | None = None
    # MEH-3702: «היום» or «מחר» — the pickup day as the buyer reads it on the
    # day the email is written. `cancel_day` is the same word for the cutoff,
    # empty when the cutoff falls on the day of writing.
    pickup_day: str = "היום"
    cancel_day: str = ""
    # MEH-3897: the business takes the money ahead through its own link; the
    # email carries the link instead of «ומשלמים X ₪» at the counter.
    prepay: Prepay | None = None
    # MEH-3897: the business marked it paid («סמן כשולם»): the reminder stops
    # asking for the money.
    paid: bool = False


def send_reservation_email(
    to: str, m: ReservationEmail, test_cause: bool = False
) -> None:
    subject, body, html_body = render_reservation_email(m)
    send_email(to, subject, body, html=html_body, test_cause=test_cause)


def render_reservation_email(
    m: ReservationEmail, subject: str | None = None
) -> tuple[str, str, str]:
    """Subject, text and HTML of the code email. `subject` is replaced by the
    morning reminder (MEH-3702), which repeats the same card under its own
    title; the confirmation passes nothing."""
    # A name with a line break would break the Subject header; collapse all
    # whitespace runs to one space (the body keeps the same, cleaned name).
    name = " ".join(m.producer_name.split())
    subject = subject or f"שמרנו לכם סל ב{name}"
    cancel_at = (
        f"{m.cancel_day} ב-{m.cancel_until}" if m.cancel_day else (m.cancel_until or "")
    )
    where = f", {m.address}" if m.address else ""
    price = shekels_text(m.total_agorot)
    page_url = f"{settings.frontend_url}/producer/{m.producer_id}"

    cancel_text = (
        f"לא תוכלו להגיע? אפשר לבטל בחינם עד {cancel_at}, "
        f"וככה הסל יגיע למישהו אחר.\n\n"
        f"לבטל את השריון: {page_url}\n\n"
        if m.cancel_until
        else "\n"
    )
    note_text = f"הוראות איסוף: {m.pickup_note}\n" if m.pickup_note else ""
    pay_text = (
        f"הקוד שלכם: {m.pickup_code}. {PAID_LINE}\n"
        if m.paid
        else f"הקוד שלכם: {m.pickup_code}.\n"
        + _prepay_text(m.prepay, m.pickup_code, price)
        + "\n"
        if m.prepay
        else f"הקוד שלכם: {m.pickup_code}. אומרים אותו בקופה ומשלמים {price} ₪.\n"
    )
    body = (
        f"{subject}\n\n"
        f"{pay_text}"
        f"איסוף {m.pickup_day} {m.pickup_from}–{m.pickup_until}{where}.\n"
        f"{note_text}"
        f"{cancel_text}"
        f"צוות מהמקור 🌱"
    )

    # Every value that came from a business or a user is escaped. The code,
    # the times and the price are generated by us, but escaping them costs
    # nothing and keeps the rule simple.
    e = html_escape
    subject_html = e(subject)
    address_html = f"<br>\n                📍&nbsp; {e(m.address)}" if m.address else ""
    if m.pickup_note:
        address_html += f"<br>\n                הוראות איסוף: {e(m.pickup_note)}"
    cancel_html = (
        f"""\
          <tr><td style="padding:14px 22px 0;text-align:right;font-size:14px;color:#5c584f;line-height:1.6;">לא תוכלו להגיע? אפשר לבטל בחינם עד <b style="color:#1c1a17;">{e(cancel_at)}</b>, וככה הסל יגיע למישהו אחר.</td></tr>
          <tr><td style="padding:16px 22px 24px;text-align:center;">
            <a href="{e(page_url)}" style="display:inline-block;background:#ffffff;color:#2e6853;border:2px solid #2e6853;text-decoration:none;font-size:15px;font-weight:bold;padding:11px 28px;border-radius:10px;">לבטל את השריון</a>
          </td></tr>
"""
        if m.cancel_until
        else """\
          <tr><td style="padding:0 0 24px;"></td></tr>
"""
    )
    pay_html = (
        f"""\
            <div style="font-size:15px;color:#1c1a17;margin:12px 0 0;line-height:1.6;">{e(PAID_LINE)}</div>"""
        if m.paid
        else _prepay_html(m.prepay, m.pickup_code, price)
        if m.prepay
        else f"""\
            <div style="font-size:15px;color:#1c1a17;margin:12px 0 0;line-height:1.6;">אומרים אותו בקופה ומשלמים <b style="color:#2e6853;">{e(price)}&nbsp;₪</b>.</div>"""
    )
    html_body = frame(
        subject_html,
        "",
        f"""\
          <tr><td style="padding:22px 22px 6px;text-align:center;">
            <div style="font-size:14px;color:#5c584f;margin:0 0 8px;">הקוד שלכם:</div>
            <div style="display:inline-block;background:#eaf3de;border:2px dashed #2e6853;border-radius:12px;padding:10px 22px;font-family:Georgia,'Times New Roman',serif;font-size:44px;font-weight:bold;letter-spacing:10px;color:#1c1a17;direction:ltr;">{e(m.pickup_code)}</div>
{pay_html}
          </td></tr>
          <tr><td style="padding:16px 22px 4px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid #e5dfd3;border-radius:10px;">
              <tr><td style="padding:12px 14px;text-align:right;font-size:15px;color:#1c1a17;line-height:1.7;">
                🕗&nbsp; איסוף {e(m.pickup_day)} {e(m.pickup_from)}–{e(m.pickup_until)}{address_html}
              </td></tr>
            </table>
          </td></tr>
{cancel_html}
""",
    )
    return subject, body, html_body


# The bag page's «paid_confirmed» (messages/he.json), then the counter step.
PAID_LINE = "בית העסק אישר שהתשלום התקבל, ובקופה רק אומרים את הקוד."


def _prepay_text(p: Prepay, code: str, price: str) -> str:
    ask, via_line, counter = buyer_pay_lines(p, code, price)
    return f"{ask} לתשלום: {p.link}\n{via_line}\n{counter}"


def _prepay_html(p: Prepay, code: str, price: str) -> str:
    """MEH-3897: the ask, a «לתשלום» button to the business's link, where it
    goes, the code-in-the-note line, then what happens at the counter."""
    e = html_escape
    ask, via_line, counter = buyer_pay_lines(p, code, price)
    return f"""\
            <div style="font-size:15px;color:#1c1a17;margin:12px 0 0;line-height:1.6;">{e(ask)}</div>
            <div style="margin:12px 0 0;"><a href="{e(p.link)}" style="display:inline-block;background:#2e6853;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:11px 28px;border-radius:10px;">לתשלום</a></div>
            <div style="font-size:13px;color:#5c584f;margin:8px 0 0;line-height:1.6;">{e(via_line)}</div>
            <div style="font-size:15px;color:#1c1a17;margin:10px 0 0;line-height:1.6;">{e(counter)}</div>"""


def send_cancel_email(to: str, producer_name: str, test_cause: bool = False) -> None:
    """MEH-2737 — the buyer cancelled; confirm it. Copy approved word for word
    by Sapir on 6/11 (text 4). No code in it: the code is no longer valid."""
    name = " ".join(producer_name.split())
    subject = f"השריון ב{name} בוטל"
    line1 = f"ביטלנו את השריון שלכם לסל ב{name}. הקוד כבר לא בתוקף ואין צורך להגיע."
    line2 = "תודה שביטלתם בזמן, ככה הסל יגיע למישהו אחר."
    body = f"{line1}\n{line2}\n\nצוות מהמקור 🌱"

    e = html_escape
    html_body = frame(
        e(subject),
        "",
        f"""\
          <tr><td style="padding:20px 22px 24px;text-align:right;font-size:15px;color:#1c1a17;line-height:1.7;">{e(line1)}<br>{e(line2)}</td></tr>
""",
    )
    send_email(to, subject, body, html=html_body, test_cause=test_cause)


def _send_bag_cancelled(to: str, name: str, line1: str, test_cause: bool) -> None:
    """The «הסל ב… בוטל» card: one reason line, then the link to today's bags."""
    subject = f"הסל ב{name} בוטל"
    line2 = "מצטערים. אולי יש סל אחר באזור:"
    link_text = "לסלים של היום"
    list_url = f"{settings.frontend_url}/rescue"
    body = f"{line1}\n\n{line2} {link_text}\n{list_url}\n\nצוות מהמקור 🌱"

    e = html_escape
    html_body = frame(
        e(subject),
        "",
        f"""\
          <tr><td style="padding:20px 22px 8px;text-align:right;font-size:15px;color:#1c1a17;line-height:1.7;">{e(line1)}</td></tr>
          <tr><td style="padding:8px 22px 24px;text-align:right;font-size:15px;color:#1c1a17;line-height:1.7;">{e(line2)} <a href="{e(list_url)}" style="color:#2e6853;font-weight:bold;">{e(link_text)}</a></td></tr>
""",
    )
    send_email(to, subject, body, html=html_body, test_cause=test_cause)


def send_business_cancel_email(
    to: str, producer_name: str, test_cause: bool = False, tomorrow: bool = False
) -> None:
    """MEH-2738 — the business cancelled today's bag, so the buyer's
    reservation went with it. Copy approved word for word by Sapir on 6/11
    (text 7). Links to today's bags elsewhere; no code, nothing to pay."""
    name = " ".join(producer_name.split())
    # MEH-3702: tomorrow's bag says «מחר» (copy approved 24/11).
    day = "מחר" if tomorrow else "היום"
    line1 = (
        f"בית העסק {name} ביטל את סל ההפתעה של {day}, ולכן גם השריון שלכם בוטל. "
        "אין צורך להגיע ואין מה לשלם."
    )
    _send_bag_cancelled(to, name, line1, test_cause=test_cause)


def send_delisted_cancel_email(
    to: str, producer_name: str, test_cause: bool = False
) -> None:
    """MEH-3227 (D1) — the SITE took the business off (suspended, rejected,
    deleted), so its live bags went with it. «בית העסק ביטל» would be false
    here, so the reason line says the business is no longer listed — and no
    more (the group-buy precedent, MEH-2498). Copy approved by Sapir 14/11."""
    name = " ".join(producer_name.split())
    line1 = (
        f"בית העסק {name} כבר לא מופיע במהמקור, ולכן השריון שלכם לסל בוטל. "
        "אין צורך להגיע ואין מה לשלם."
    )
    _send_bag_cancelled(to, name, line1, test_cause=test_cause)
