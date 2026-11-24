"""
Module:   producer_staff
Purpose:  A business invites up to 5 people by email to handle its orders;
          the invited person signs in with their own account and accepts;
          the owner removes them, or they leave.
Touches:  producer_staff (every write), producers (row lock while counting),
          users (row lock at accept). Background: the invite email (Resend).
Does NOT: decide what a staff member may do (services/order_access.py), put
          anything on the staff member's `users` row, or tell the inviter
          whether the address has an account: the invite answer is the same
          either way.
Related:  services/order_access.py · services/staff_emails.py ·
          models/producer_staff.py · routers/producer_owner_invite.py
          `_hash_token` (the same sha256-of-a-random-secret shape) and
          routers/producer_owner_invite_existing.py (signed-in accept, the
          conditional UPDATE whose row count is the lock).
History:  MEH-3526 (creation).
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import structlog
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
)
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_producer, require_verified_email
from app.config import settings
from app.database import get_db
from app.limits import MAX_STAFF, enforce_cap
from app.models.models import Producer, User
from app.models.producer_staff import ProducerStaff
from app.rate_limit import limiter
from app.routers.producer_owner_invite import _hash_token
from app.routers.product_orders import NO_BUSINESS_DETAIL
from app.schemas.producer_staff import (
    StaffAcceptIn,
    StaffInviteIn,
    StaffListOut,
    StaffMemberOut,
    StaffOfOut,
)
from app.services.account_guards import is_super_admin
from app.services.order_access import _business_has_owner, active_staff_row
from app.services.staff_emails import send_staff_invite_email

logger = structlog.get_logger(__name__)

owner_router = APIRouter(prefix="/producers/me/staff", tags=["producer-staff"])
invite_router = APIRouter(prefix="/staff-invites", tags=["producer-staff"])
member_router = APIRouter(prefix="/users/me/staff-membership", tags=["producer-staff"])

INVITE_TTL = timedelta(days=7)
_LIVE = ("pending", "active")

_OWN_ADDRESS = "זו הכתובת של החשבון שלך. אפשר להזמין כתובת של מישהו אחר."
_ALREADY_STAFF = "הכתובת הזאת כבר בצוות של בית העסק."
_NOT_FOUND = "לא מצאנו את העובד הזה בצוות."
_LINK_INVALID = "הקישור לא תקף. אפשר לבקש מבית העסק לשלוח הזמנה חדשה."
_WRONG_ADDRESS = (
    "ההזמנה נשלחה לכתובת מייל אחרת. אפשר להתחבר עם החשבון של הכתובת "
    "שקיבלה את המייל ולפתוח שוב את הקישור."
)
_ADMIN_ACCOUNT = "חשבון ניהול לא יכול להצטרף לצוות של בית עסק."
_HAS_BUSINESS = "לחשבון הזה יש בית עסק משלו, ולכן אי אפשר לצרף אותו כעובד."
_STAFF_ELSEWHERE = (
    "החשבון הזה כבר מטפל בהזמנות של בית עסק אחר. אפשר לעזוב שם קודם, בהגדרות החשבון."
)
_NO_OWNER = "לבית העסק הזה אין כרגע בעלים, ולכן אי אפשר להצטרף."
_NOT_STAFF = "החשבון הזה לא בצוות של אף בית עסק."


def _staff_now() -> datetime:
    return datetime.now(timezone.utc)


def _owner_producer_id(user: User) -> Any:
    if not user.producer_id:
        raise HTTPException(status_code=404, detail=NO_BUSINESS_DETAIL)
    return user.producer_id


def _expired(row: ProducerStaff, now: datetime) -> bool:
    return row.status == "pending" and row.expires_at <= now  # type: ignore[return-value]


def _member_out(row: ProducerStaff, now: datetime) -> StaffMemberOut:
    return StaffMemberOut(
        id=row.id,
        email=row.invited_email,
        status=row.status,
        expired=_expired(row, now),
        created_at=row.created_at,
        accepted_at=row.accepted_at,
    )


def _live_rows(db: Session, producer_id: Any) -> list[ProducerStaff]:
    return (
        db.query(ProducerStaff)
        .filter(
            ProducerStaff.producer_id == producer_id,
            ProducerStaff.status.in_(_LIVE),
        )
        .order_by(ProducerStaff.created_at.asc())
        .all()
    )


def _counted(rows: list[ProducerStaff], now: datetime) -> int:
    """Active members and invites still inside their 7 days (card: cap 5,
    pending included). An expired invite stops counting, so an owner whose
    invites lapsed is never locked out of inviting."""
    return sum(1 for row in rows if not _expired(row, now))


def _mint_staff_token(row: ProducerStaff, now: datetime) -> str:
    """A fresh secret replaces the old one, so a resend kills the earlier link."""
    token = secrets.token_urlsafe(32)
    row.token_hash = _hash_token(token)  # type: ignore[assignment]
    row.expires_at = now + INVITE_TTL  # type: ignore[assignment]
    return token


@owner_router.get("", response_model=StaffListOut)
@limiter.limit("60/minute")
def list_staff(
    request: Request,
    response: Response,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> StaffListOut:
    producer_id = _owner_producer_id(user)
    now = _staff_now()
    response.headers["Cache-Control"] = "no-store"
    rows = _live_rows(db, producer_id)
    return StaffListOut(staff=[_member_out(r, now) for r in rows], max_staff=MAX_STAFF)


@owner_router.post("", response_model=StaffMemberOut)
@limiter.limit("10/hour")
def invite_staff(  # noqa: PLR0913 — FastAPI-injected parameters
    request: Request,
    response: Response,
    body: StaffInviteIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> StaffMemberOut:
    """Invite an address, or send a pending invite again with a new link.

    The answer never depends on whether the address has an account here.
    """
    producer_id = _owner_producer_id(user)
    email = str(body.email).strip().lower()
    if email == (user.email or "").strip().lower():
        raise HTTPException(status_code=409, detail=_OWN_ADDRESS)
    # The business row lock serialises two invites racing past the cap.
    producer = (
        db.query(Producer).filter(Producer.id == producer_id).with_for_update().one()
    )
    now = _staff_now()
    rows = _live_rows(db, producer_id)
    row = next((r for r in rows if r.invited_email.lower() == email), None)
    if row is not None and row.status == "active":
        raise HTTPException(status_code=409, detail=_ALREADY_STAFF)
    if row is None:
        enforce_cap(_counted(rows, now), "staff")
        row = ProducerStaff(
            producer_id=producer_id,
            invited_email=email,
            role="orders",
            status="pending",
            invited_by=user.id,
            created_at=now,
        )
        db.add(row)
    elif _expired(row, now):
        # Sending a lapsed invite again makes it count again.
        enforce_cap(_counted(rows, now), "staff")
    token = _mint_staff_token(row, now)
    business, test_cause = producer.name, bool(producer.is_test)
    db.commit()
    db.refresh(row)
    logger.info("producer_staff.invited", producer_id=str(producer_id))
    background_tasks.add_task(
        send_staff_invite_email,
        email,
        business,  # type: ignore[arg-type]
        f"{settings.frontend_url}/staff-invite/{token}",
        test_cause=test_cause,
    )
    response.headers["Cache-Control"] = "no-store"
    return _member_out(row, now)


@owner_router.delete("/{staff_id}", status_code=204, response_model=None)
@limiter.limit("30/hour")
def remove_staff(
    request: Request,
    staff_id: UUID,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Response:
    """Withdraw an invite or remove a member. Their next request is refused."""
    producer_id = _owner_producer_id(user)
    row = (
        db.query(ProducerStaff)
        .filter(
            ProducerStaff.id == staff_id,
            ProducerStaff.producer_id == producer_id,
            ProducerStaff.status.in_(_LIVE),
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if row.status == "pending":
        # A withdrawn invite leaves nothing behind: kept as `revoked`, an
        # invite-then-withdraw loop would add rows without bound (MEH-3022).
        db.delete(row)
    else:
        _revoke(row)
    db.commit()
    logger.info("producer_staff.removed", producer_id=str(producer_id))
    return Response(status_code=204)


def _revoke(row: ProducerStaff) -> None:
    row.status = "revoked"  # type: ignore[assignment]
    row.token_hash = None  # type: ignore[assignment]
    row.revoked_at = _staff_now()  # type: ignore[assignment]


def _refuse_staff_account(db: Session, user: User) -> None:
    """Allow-list, like the owner invite: only a plain consumer account joins."""
    if user.role == "admin" or is_super_admin(user):
        raise HTTPException(status_code=403, detail=_ADMIN_ACCOUNT)
    if (
        user.producer_id is not None
        or user.is_producer
        or (user.role or "consumer") != "consumer"
    ):
        raise HTTPException(status_code=409, detail=_HAS_BUSINESS)
    if active_staff_row(db, user.id) is not None:
        raise HTTPException(status_code=409, detail=_STAFF_ELSEWHERE)


def _live_staff_invite(db: Session, token: str, now: datetime) -> ProducerStaff | None:
    return (
        db.query(ProducerStaff)
        .filter(
            ProducerStaff.token_hash == _hash_token(token),
            ProducerStaff.status == "pending",
            ProducerStaff.expires_at > now,
        )
        .first()
    )


@invite_router.post("/accept", response_model=StaffOfOut)
@limiter.limit("10/hour")
def accept_staff_invite(
    request: Request,
    body: StaffAcceptIn,
    user: User = Depends(require_verified_email),
    db: Session = Depends(get_db),
) -> StaffOfOut:
    """Join a business's order staff. Single use: the conditional UPDATE's
    row count is the lock, so of two simultaneous accepts exactly one wins."""
    now = _staff_now()
    row = _live_staff_invite(db, body.token, now)
    if row is None:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)
    if row.invited_email.lower() != (user.email or "").strip().lower():
        raise HTTPException(status_code=403, detail=_WRONG_ADDRESS)
    # Lock the account so one person cannot accept two invites at once.
    locked = (
        db.query(User)
        .filter(User.id == user.id)
        .with_for_update()
        .populate_existing()
        .one()
    )
    _refuse_staff_account(db, locked)
    producer_id = row.producer_id
    if not _business_has_owner(db, producer_id):
        raise HTTPException(status_code=409, detail=_NO_OWNER)
    claim = (
        update(ProducerStaff)
        .where(
            ProducerStaff.id == row.id,
            ProducerStaff.status == "pending",
            ProducerStaff.token_hash == _hash_token(body.token),
            ProducerStaff.expires_at > now,
        )
        .values(status="active", user_id=locked.id, token_hash=None, accepted_at=now)
    )
    try:
        won = db.execute(claim).rowcount  # type: ignore[attr-defined]
        if won != 1:
            db.rollback()
            raise HTTPException(status_code=404, detail=_LINK_INVALID)
        db.commit()
    except IntegrityError as exc:  # an active row for this account appeared meanwhile
        db.rollback()
        raise HTTPException(status_code=409, detail=_STAFF_ELSEWHERE) from exc
    name = db.query(Producer.name).filter(Producer.id == producer_id).scalar()
    logger.info("producer_staff.accepted", producer_id=str(producer_id))
    return StaffOfOut(producer_id=producer_id, name=name or "")


@member_router.delete("", status_code=204, response_model=None)
@limiter.limit("10/hour")
def leave_staff(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """The staff member leaves. Their access ends with this request."""
    row = (
        db.query(ProducerStaff)
        .filter(ProducerStaff.user_id == user.id, ProducerStaff.status == "active")
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail=_NOT_STAFF)
    _revoke(row)
    db.commit()
    return Response(status_code=204)
