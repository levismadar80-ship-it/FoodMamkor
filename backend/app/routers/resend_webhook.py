"""
Module:   resend_webhook
Purpose:  Receive Resend's signed delivery events (delivered, bounced,
          complained, suppressed, failed, clicked) and keep one row each, so a
          business owner whose address bounces is visible instead of silently
          missing her orders, and each kind of email can be measured.
Touches:  PostgreSQL email_events (INSERT only) and users (one read, to match
          the recipient to an account).
Does NOT: send email (app/services/email.py), suppress addresses (Resend keeps
          its own list and reports it as email.suppressed), or show the
          numbers (the admin screen is a follow-up of MEH-3839).
Related:  app/models/email_events.py (EMAIL_EVENT_TYPES, the row),
          app/services/email.py `_kind_tag` (the tag read back here),
          resend.Webhooks.verify (the SDK's Svix check — same algorithm as
          https://docs.svix.com/receiving/verifying-payloads/how-manual),
          app/routers/whatsapp_webhook.py (the same order: raw body, verify,
          then parse).
History:  MEH-3839 (creation)
"""

from __future__ import annotations

import logging
from typing import Any

import resend
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.email_events import EMAIL_EVENT_TYPES, EmailEvent
from app.models.models import User
from app.rate_limit import limiter
from app.services.email import DEFAULT_KIND, _KIND_RE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])

# A Resend event is a few hundred bytes; 64 KB is generous and keeps an
# unsigned flood from making us read and HMAC megabytes.
_MAX_BODY_BYTES = 64 * 1024


def _verify(body: str, request: Request) -> dict[str, Any]:
    """The parsed payload, or 401. The SDK checks the timestamp window
    (5 minutes) and every `v1,` signature in constant time."""
    try:
        return dict(
            resend.Webhooks.verify(
                {
                    "payload": body,
                    "headers": {
                        "id": request.headers.get("svix-id", ""),
                        "timestamp": request.headers.get("svix-timestamp", ""),
                        "signature": request.headers.get("svix-signature", ""),
                    },
                    "webhook_secret": settings.resend_webhook_secret,
                }
            )
        )
    except ValueError as exc:
        logger.warning("[RESEND-WEBHOOK] rejected: %s", str(exc)[:120])
        raise HTTPException(status_code=401, detail="החתימה לא תקינה") from exc


def _domain(address: str) -> str | None:
    _, at, domain = address.rpartition("@")
    return domain.lower()[:255] if at and domain else None


def _detail(event_type: str, data: dict[str, Any]) -> str | None:
    """Bounce «type/subType», or a suppression / failure type. Never the
    receiving server's message, which can quote the address."""
    if event_type == "email.bounced":
        bounce = data.get("bounce") or {}
        parts = [str(bounce.get("type") or ""), str(bounce.get("subType") or "")]
        return "/".join(p for p in parts if p)[:80] or None
    if event_type == "email.suppressed":
        return str((data.get("suppressed") or {}).get("type") or "")[:80] or None
    return None


def _row(svix_id: str, payload: dict[str, Any], db: Session) -> EmailEvent:
    data = payload.get("data") or {}
    recipients = data.get("to") or []
    address = str(recipients[0]).strip() if recipients else ""
    kind = str((data.get("tags") or {}).get("kind") or "")
    user_id = None
    if address:
        user_id = (
            db.query(User.id).filter(func.lower(User.email) == address.lower()).scalar()
        )
    return EmailEvent(
        svix_id=svix_id[:64],
        event_type=payload["type"],
        kind=kind if _KIND_RE.fullmatch(kind) else DEFAULT_KIND,
        user_id=user_id,
        recipient_domain=_domain(address),
        resend_email_id=str(data.get("email_id") or "")[:64] or None,
        detail=_detail(payload["type"], data),
    )


@router.post("/resend")
# Same reasoning as /webhook/whatsapp: the caller is Resend (via Svix), which
# retries on non-2xx, so the real gate is the signature, not the counter.
@limiter.limit("300/minute")
async def resend_events(request: Request, db: Session = Depends(get_db)) -> Response:
    if not settings.resend_webhook_secret:
        # Off until the secret is set. 503, not 200: Resend keeps retrying,
        # so events sent before the secret lands are not lost.
        raise HTTPException(status_code=503, detail="קליטת האירועים כבויה")

    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > _MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="הבקשה גדולה מדי")
    raw = await request.body()
    if len(raw) > _MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="הבקשה גדולה מדי")

    payload = _verify(raw.decode("utf-8", "replace"), request)
    if payload.get("type") not in EMAIL_EVENT_TYPES:
        return Response(status_code=200)

    db.add(_row(request.headers.get("svix-id", ""), payload, db))
    try:
        db.commit()
    except IntegrityError:
        # The same delivery again (Svix retries with the same id).
        db.rollback()
    return Response(status_code=200)
