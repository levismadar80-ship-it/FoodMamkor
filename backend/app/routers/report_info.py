"""
Module:   report_info
Purpose:  "מצאתן טעות בפרטים?" — let a visitor report wrong info on a
          producer page. v1 emails the admin; no DB row, no auth (MEH-1443).
Touches:  Resend (admin notification email). Reads producers by slug/id.
Does NOT: persist reports — that is the DB-backed abuse-report flow in
          routers/reports.py (Report table + admin queue). This router is
          fire-and-forget email only.
Related:  routers/reports.py:24 (abuse report, DB-persisted, auth'd),
          services/auth_emails.py:40-73 (RTL email skeleton mirrored here),
          schemas/schemas.py ProducerInfoReportCreate.
History:  MEH-1443 (creation). v1.1 (MEH-1426) will add type=review on the
          same endpoint once the reviews gate lands.
"""

from html import escape as html_escape
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Producer
from app.rate_limit import limiter
from app.schemas.schemas import ProducerInfoReportCreate
from app.services.email import send_email

router = APIRouter(tags=["reports"])


def _resolve_producer(db: Session, identifier: str) -> Producer | None:
    """Match a custom slug first; fall back to the UUID id path so producers
    without a slug (reported via /producer/<uuid>) still resolve."""
    producer = db.query(Producer).filter(Producer.slug == identifier).first()
    if producer:
        return producer
    try:
        pid = UUID(identifier)
    except (ValueError, AttributeError):
        return None
    return db.query(Producer).filter(Producer.id == pid).first()


@router.post("/reports/producer-info", status_code=204)
@limiter.limit("5/day")
def report_producer_info(
    request: Request,  # first param — slowapi reads it via introspection
    data: ProducerInfoReportCreate,
    db: Session = Depends(get_db),
) -> Response:
    """Email the admin about wrong info on a producer page. Returns 204."""
    producer = _resolve_producer(db, data.producer_slug)
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-653 idiom: public-facing recipient falls back to admin_email.
    recipient = settings.contact_email or settings.admin_email

    reply_line = (
        f"מייל לחזרה: {data.reporter_email}"
        if data.reporter_email
        else "לא צוין מייל לחזרה"
    )
    subject = f"מהמקור - דיווח על פרטים שגויים: {producer.name}"
    text_body = (
        "דיווח על מידע שגוי בעמוד בית עסק.\n\n"
        f"בית עסק: {producer.name}\n"
        f"מזהה: {data.producer_slug}\n"
        f"{reply_line}\n\n"
        "ההודעה:\n"
        f"{data.message}"
    )

    # MEH-1401: RTL HTML template so the mail renders right in Gmail. Message
    # is HTML-escaped (untrusted visitor input); newlines → <br>.
    name_html = html_escape(producer.name or "")
    slug_html = html_escape(data.producer_slug)
    message_html = html_escape(data.message).replace("\n", "<br>")
    reply_html = (
        f'מייל לחזרה: <a href="mailto:{html_escape(data.reporter_email)}" '
        f'style="color:#2e6853;">{html_escape(data.reporter_email)}</a>'
        if data.reporter_email
        else "לא צוין מייל לחזרה"
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
              <h1 style="font-size:20px;color:#1C1A17;margin:0 0 12px;">דיווח על פרטים שגויים</h1>
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0 0 8px;">בית עסק: <strong>{name_html}</strong></p>
              <p style="color:#666;font-size:13px;line-height:1.7;margin:0 0 4px;">מזהה: {slug_html}</p>
              <p style="color:#666;font-size:13px;line-height:1.7;margin:0 0 20px;">{reply_html}</p>
              <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px;">
              <p style="color:#3a3a3a;font-size:15px;line-height:1.7;margin:0;">{message_html}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    send_email(recipient, subject, text_body, html=html_body)
    return Response(status_code=204)
