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
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.email_events import EMAIL_EVENT_TYPES, EmailEvent
from app.models.models import User
from app.rate_limit import limiter
from app.services.email import DEFAULT_KIND, KIND_RE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])

# A Resend event is a few hundred bytes; 64 KB is generous and keeps an
# unsigned flood from making us read and HMAC megabytes.
_MAX_BODY_BYTES = 64 * 1024


def _verify(raw: bytes, request: Request) -> dict[str, Any]:
    """The parsed payload, or 401. The SDK checks the timestamp window
    (5 minutes) and every `v1,` signature in constant time. A signed body
    that is not a JSON object comes back as {} (acknowledged, not stored)."""
    try:
        body = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        logger.warning("[RESEND-WEBHOOK] rejected: body is not UTF-8")
        raise HTTPException(status_code=401, detail="החתימה לא תקינה") from exc
    try:
        payload = resend.Webhooks.verify(
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
    except ValueError as exc:
        logger.warning("[RESEND-WEBHOOK] rejected: %s", str(exc)[:120])
        raise HTTPException(status_code=401, detail="החתימה לא תקינה") from exc
    return dict(payload) if isinstance(payload, dict) else {}


def _obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _kind(tags: Any) -> str:
    """The `kind` tag. Resend reports tags as {name: value}; accept the
    [{name, value}] form we send too, in case the event echoes it."""
    if isinstance(tags, dict):
        value = tags.get("kind")
    elif isinstance(tags, list):
        value = next(
            (_obj(t).get("value") for t in tags if _obj(t).get("name") == "kind"),
            None,
        )
    else:
        value = None
    kind = value if isinstance(value, str) else ""
    return kind if KIND_RE.fullmatch(kind) else DEFAULT_KIND


def _address(data: dict[str, Any]) -> str:
    """The first recipient, bare: "Name <a@b.co.il>" → "a@b.co.il"."""
    recipients = data.get("to")
    first = recipients[0] if isinstance(recipients, list) and recipients else ""
    address = str(first).strip()
    if "<" in address and address.endswith(">"):
        address = address[address.rindex("<") + 1 : -1].strip()
    return address


def _domain(address: str) -> str | None:
    _, at, domain = address.rpartition("@")
    return domain.lower()[:255] if at and domain else None


def _detail(event_type: str, data: dict[str, Any]) -> str | None:
    """Bounce «type/subType», or the suppression type. Never the receiving
    server's message, which can quote the address."""
    if event_type == "email.bounced":
        bounce = _obj(data.get("bounce"))
        parts = [str(bounce.get("type") or ""), str(bounce.get("subType") or "")]
        return "/".join(p for p in parts if p)[:80] or None
    if event_type == "email.suppressed":
        return str(_obj(data.get("suppressed")).get("type") or "")[:80] or None
    return None


def _fields(svix_id: str, payload: dict[str, Any], db: Session) -> dict[str, Any]:
    data = _obj(payload.get("data"))
    address = _address(data)
    user_id = None
    if address:
        # .first(), not .scalar(): users.email is unique case-sensitively, so
        # two accounts can differ only in case (MEH-3839 review).
        match = (
            db.query(User.id).filter(func.lower(User.email) == address.lower()).first()
        )
        user_id = match[0] if match else None
    return {
        "svix_id": svix_id[:64],
        "event_type": payload["type"],
        "kind": _kind(data.get("tags")),
        "user_id": user_id,
        "recipient_domain": _domain(address),
        "resend_email_id": str(data.get("email_id") or "")[:64] or None,
        "detail": _detail(payload["type"], data),
    }


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

    payload = _verify(raw, request)
    if payload.get("type") not in EMAIL_EVENT_TYPES:
        return Response(status_code=200)

    # DO NOT log the payload or the exception text here — both can hold the
    # recipient's address (MEH-3839).
    fields = _fields(request.headers.get("svix-id", ""), payload, db)
    # The same delivery again (Svix retries with the same id) inserts nothing.
    # Only that conflict is skipped: any other database error is a 500, so
    # Svix retries and the event is not lost.
    db.execute(
        pg_insert(EmailEvent)
        .values(**fields)
        .on_conflict_do_nothing(index_elements=["svix_id"])
    )
    db.commit()
    return Response(status_code=200)
