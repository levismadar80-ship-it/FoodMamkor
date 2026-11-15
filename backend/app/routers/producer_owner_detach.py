"""
Module:   producer_owner_detach
Purpose:  Admin «ניתוק בעלים» — unlink a business from its current owner's
          account so the business can be handed to a new owner (a sale, a
          change of who runs it). v1 keeps one login per business; this is the
          transfer path, together with the ordinary owner invite.
Touches:  users (the owner row: role, producer_id, is_producer,
          token_version), producers (`owner_invite_accepted_at` cleared).
          Background: services/owner_detach.send_owner_detached_email.
Does NOT: delete the account (she keeps her favourites and reviews), touch the
          business's content or status (it stays live), or invite the new
          owner (routers/producer_owner_invite.py — the row is invitable again
          once this returns).
Related:  routers/producer_owner_invite.py `_load_invitable` (the refusals this
          lifts: `_has_owner`, `owner_invite_accepted_at`) ·
          services/onboarding_followup.py (reads the owner by producer_id, so a
          detached owner gets no more onboarding mail).
History:  MEH-3256 (grill retro D9, creation).
"""

from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import Producer, User
from app.rate_limit import limiter
from app.services.owner_detach import send_owner_detached_email

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/admin/producers", tags=["admin"])

_NOT_FOUND = "בית העסק לא נמצא"
_NO_OWNER = "לבית העסק הזה אין בעלים מחוברים"
_STALE = "הבעלים של בית העסק השתנו מאז שהדף נטען. כדאי לרענן ולנסות שוב."
_NAME_MISMATCH = "השם שהוקלד לא תואם לשם בית העסק"
_ADMIN_TARGET = "אי אפשר לנתק חשבון של מנהלת מערכת"


class OwnerDetachIn(BaseModel):
    # The business name, typed. The same friction GitHub puts on deleting a
    # repository: an action that removes someone's access is not one click.
    confirm_name: str = Field(..., min_length=1, max_length=200)
    # The owner the admin SAW. If the row changed hands since the page loaded,
    # the action refuses instead of detaching someone she did not mean.
    expected_owner_user_id: UUID


def _first_name(full_name: str | None) -> str:
    parts = (full_name or "").strip().split()
    return parts[0] if parts else ""


@router.post("/{producer_id}/detach-owner", response_model=None)
@limiter.limit("10/hour")
def detach_owner(  # noqa: PLR0913 — six FastAPI-injected parameters, none droppable
    request: Request,
    producer_id: UUID,
    body: OwnerDetachIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # Lock order users → producers, the claim route's order
    # (producer_claim.claim), so the two cannot deadlock.
    owner = (
        db.query(User)
        .filter(User.producer_id == producer_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    producer = (
        db.query(Producer).filter(Producer.id == producer_id).with_for_update().first()
    )
    if producer is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if owner is None:
        raise HTTPException(status_code=404, detail=_NO_OWNER)
    if owner.id != body.expected_owner_user_id:
        raise HTTPException(status_code=409, detail=_STALE)
    if body.confirm_name.strip() != (producer.name or "").strip():
        raise HTTPException(status_code=422, detail=_NAME_MISMATCH)
    # DO NOT detach an admin — demoting her to consumer would lock her out of
    # /admin. An admin linked to a business is fixed by hand, not by this.
    if owner.role == "admin":
        raise HTTPException(status_code=403, detail=_ADMIN_TARGET)

    owner.producer_id = None  # type: ignore[assignment]
    owner.role = "consumer"  # type: ignore[assignment]
    owner.is_producer = False  # type: ignore[assignment]
    # Retires every access AND refresh token she holds (auth._check_token_version).
    owner.token_version = (owner.token_version or 1) + 1  # type: ignore[assignment]
    # The invite's "already handed over" stamp; cleared so the row is
    # invitable again and the next owner's onboarding clock starts on her day.
    producer.owner_invite_accepted_at = None  # type: ignore[assignment]

    email, name, business = owner.email, owner.name, producer.name
    test_cause = bool(producer.is_test or owner.is_test)
    owner_id = owner.id
    db.commit()

    # Ids only — never the address (same rule as owner_invite.created).
    logger.info(
        "owner.detached",
        producer_id=str(producer_id),
        former_owner_id=str(owner_id),
        admin_id=str(user.id),
    )
    if email:
        background_tasks.add_task(
            send_owner_detached_email,
            email,  # type: ignore[arg-type]
            _first_name(name),  # type: ignore[arg-type]
            business,  # type: ignore[arg-type]
            test_cause=test_cause,
        )
    return {"ok": True}
