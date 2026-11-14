"""
Module:   review_reports
Purpose:  «דיווח על ביקורת» (MEH-3260) — build the admin email for a visitor's
          report on one review, and drop a repeat of the same report.
Touches:  Resend (via the caller's send_email). In-process memory only.
Does NOT: persist anything or act on the review — the admin reads the email
          and hides/deletes on /admin/reviews. The route lives in
          routers/report_info.py next to the wrong-info report.
Related:  routers/report_info.py (POST /reports/review), routers/reviews.py
          (hide/delete), schemas/schemas.py ReviewReportCreate.
History:  MEH-3260 (creation).
"""

from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass
from html import escape as html_escape
from threading import Lock

from app.services.email_branding import email_logo_html

# The reason labels the reporter saw (messages he.json reviews.report.*).
REASON_LABELS: dict[str, str] = {
    "fake": "נראית מזויפת או לא מבוססת על ניסיון אמיתי",
    "abusive": "פוגענית או בוטה",
    "personal": "חושפת פרטים אישיים",
    "irrelevant": "לא קשורה לבית העסק הזה, או ספאם",
    "other": "סיבה אחרת",
}

REPORTER_LABELS: dict[str, str] = {
    "guest": "אורחת",
    "user": "משתמשת רשומה",
    "owner": "בעלת העסק",
}

# A repeat of the same report (same IP, same review) within this window sends
# no second email. Bounded so it cannot grow without limit (MEH-3022).
REPEAT_WINDOW_SECONDS = 24 * 60 * 60
_MAX_KEYS = 5000
_seen: OrderedDict[tuple[str, str], float] = OrderedDict()
_lock = Lock()


def is_repeat(ip: str, review_id: str, now: float | None = None) -> bool:
    """True when this IP already reported this review inside the window.
    Records the report otherwise. Single replica (MEH-1319), so in-process
    memory is the whole picture; a restart forgets, which only costs one
    extra email."""
    now = time.time() if now is None else now
    key = (ip, review_id)
    with _lock:
        last = _seen.get(key)
        if last is not None and now - last < REPEAT_WINDOW_SECONDS:
            return True
        _seen[key] = now
        _seen.move_to_end(key)
        while len(_seen) > _MAX_KEYS:
            _seen.popitem(last=False)
        return False


def reset_for_tests() -> None:
    with _lock:
        _seen.clear()


@dataclass(frozen=True)
class ReviewReportMail:
    business: str
    slug: str
    reason: str
    reporter: str
    reporter_email: str | None
    details: str | None
    review_author: str
    review_stars: int
    review_body: str
    admin_url: str
    review_id: str = ""


def build_email(m: ReviewReportMail) -> tuple[str, str, str]:
    """Return (subject, text, html) for the admin."""
    # A business name is free text: never let a line break reach a header.
    business_line = " ".join(m.business.split())
    subject = f"מהמקור - דיווח על ביקורת: {business_line}"
    reason_label = REASON_LABELS[m.reason]
    reporter_label = REPORTER_LABELS[m.reporter]
    reply_line = (
        f"מייל לחזרה: {m.reporter_email}" if m.reporter_email else "לא צוין מייל לחזרה"
    )
    text = (
        "דיווח על ביקורת בעמוד בית עסק.\n\n"
        f"בית עסק: {m.business}\n"
        f"מזהה: {m.slug}\n"
        f"סיבה: {reason_label}\n"
        f"מי דיווחה: {reporter_label}\n"
        f"{reply_line}\n\n"
        f"פרטים: {m.details or '—'}\n\n"
        f"הביקורת ({m.review_stars}★, {m.review_author}):\n{m.review_body or '—'}\n"
        f"מזהה ביקורת: {m.review_id or '—'}\n\n"
        f"לטיפול: {m.admin_url}"
    )

    def p(content: str, size: int = 15, color: str = "#3a3a3a") -> str:
        return (
            f'<p style="color:{color};font-size:{size}px;line-height:1.7;'
            f'margin:0 0 8px;">{content}</p>'
        )

    reply_html = (
        f'מייל לחזרה: <a href="mailto:{html_escape(m.reporter_email)}" '
        f'style="color:#2e6853;">{html_escape(m.reporter_email)}</a>'
        if m.reporter_email
        else "לא צוין מייל לחזרה"
    )
    body_html = html_escape(m.review_body or "—").replace("\n", "<br>")
    details_html = html_escape(m.details or "—").replace("\n", "<br>")
    html = f"""\
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
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">דיווח על ביקורת</h1>
              {p(f"בית עסק: <strong>{html_escape(m.business)}</strong>")}
              {p(f"מזהה: {html_escape(m.slug)}", 13, "#666")}
              {p(f"סיבה: <strong>{html_escape(reason_label)}</strong>")}
              {p(f"מי דיווחה: {html_escape(reporter_label)}", 13, "#666")}
              {p(reply_html, 13, "#666")}
              {p(f"פרטים: {details_html}")}
              <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
              {p(f"הביקורת ({m.review_stars}★, {html_escape(m.review_author)}):", 13, "#666")}
              {p(body_html)}
              {p(f"מזהה ביקורת: {html_escape(m.review_id or '—')}", 12, "#888")}
              {p(f'<a href="{html_escape(m.admin_url)}" style="color:#2e6853;">לטיפול במסך הביקורות</a>')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return subject, text, html
