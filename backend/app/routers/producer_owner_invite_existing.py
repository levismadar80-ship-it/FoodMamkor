"""
Module:   producer_owner_invite_existing
Purpose:  Accept an owner invite on an account that ALREADY EXISTS (MEH-3256,
          grill retro D8). Until now `/auth/owner-invite/accept` only created a
          new account, so a business owner who had once signed up as a
          consumer got «האימייל הזה כבר רשום» and no way forward.
Touches:  producers (the invite columns, via the shared `_claim_invite`),
          users (the signed-in row: role, producer_id, is_producer,
          token_version, terms stamp). Background: the code email, the
          admin notification and the business-approved email.
Does NOT: take a password or an address — she is signed in, the account's
          verified address receives the code, and her password is untouched.
          Does not create a users row (that is `/accept`). Does not hand a
          business to an admin account or to an account that already has one.
Related:  backend/app/routers/producer_owner_invite.py (`_live_invite`,
          `_mint_code`, `_verify_email_code`, `_has_owner`, `_claim_invite` —
          reused, never copied) · backend/app/auth.py `require_verified_email`.
History:  MEH-3256 (creation; design by the stronger-model review 14/11:
          authenticated accept instead of a password on the invite page).

ORDER (each refusal is placed where it costs nothing):
  1. a dead link → 404 (a fact about the link the caller holds);
  2. an admin account → 403, an account with a business → 409;
  3. the email code → 422 (one attempt spent). Its conditional UPDATE takes
     the PRODUCER row lock first;
  4. then the user row is locked FOR UPDATE and re-read: step 2 again, plus
     blocked / unverified / a session revoked since auth (token_version), so
     two tabs accepting two invites on one account cannot both win and a
     session revoked mid-request cannot finish. Lock order: producer, then
     user — a future writer touching both must take them in that order;
  5. `_has_owner` → 409, then the shared conditional UPDATE claims the link;
  6. the user becomes the owner, `token_version` is bumped (every older
     session is now a consumer session and must not survive), and a fresh
     session is issued.
"""

from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
)
from sqlalchemy.orm import Session

from app.auth import (
    _EMAIL_UNVERIFIED_DETAIL,
    create_access_token,
    generate_fingerprint,
    hash_fingerprint,
    require_verified_email,
)
from app.constants import TERMS_VERSION
from app.database import get_db
from app.models import User
from app.rate_limit import limiter
from app.routers.admin import _producer_approved_body, _producer_approved_html
from app.services.account_guards import is_super_admin
from app.routers.auth import _set_fingerprint_cookie, _set_refresh_cookie
from app.routers.producer_owner_invite import (
    _ALREADY_OWNED,
    _HIDDEN_STATUS,
    _LINK_INVALID,
    _claim_invite,
    _has_owner,
    _live_invite,
    _mint_code,
    _verify_email_code,
)
from app.schemas.owner_invite_existing import (
    OwnerInviteExistingAccept,
    OwnerInviteExistingCodeRequest,
)
from app.schemas.schemas import Token
from app.services import indexnow
from app.services.auth_emails import send_owner_invite_code_email
from app.services.auth_notifications import notify_admin_owner_invite_accepted
from app.services.email import send_email
from app.services.farmer_declaration import farmer_declaration_stamp_for_existing

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/auth/owner-invite", tags=["auth"])

# Copy approved by the stronger-model review, 14/11 (Sapir's standing rule).
_CODE_SENT = "הקוד בדרך לתיבת המייל של החשבון"
_ADMIN_ACCOUNT = (
    "חשבון ניהול לא יכול להיות בעלים של בית עסק. "
    "אפשר להתחבר עם חשבון אחר ולפתוח שוב את הקישור."
)
_HAS_BUSINESS = (
    "לחשבון הזה כבר יש בית עסק. אפשר להתחבר עם חשבון אחר ולפתוח שוב את הקישור."
)


def _refuse_account(user: User) -> None:
    """An admin never owns a business (the role would be overwritten and the
    admin locked out), and one account holds one business
    (`users.producer_id` is a single FK). Allow-list, not deny-list: only a
    consumer account is turned into an owner, so a role added later is never
    silently overwritten."""
    if user.role == "admin" or is_super_admin(user):
        raise HTTPException(status_code=403, detail=_ADMIN_ACCOUNT)
    if (
        user.producer_id is not None
        or user.is_producer
        or (user.role or "consumer") != "consumer"
    ):
        raise HTTPException(status_code=409, detail=_HAS_BUSINESS)


def _refuse_stale_session(locked: User, seen_version: int) -> None:
    """Re-run, on the LOCKED row, what `get_current_user` checked before the
    code check and the lock wait: an account blocked, unverified or signed
    out everywhere in between must not leave with a fresh owner session."""
    if locked.is_blocked:
        raise HTTPException(status_code=403, detail="חשבון חסום")
    if not locked.email_verified:
        raise HTTPException(status_code=403, detail=_EMAIL_UNVERIFIED_DETAIL)
    if (locked.token_version or 0) != seen_version:
        raise HTTPException(status_code=401, detail="אסימון לא תקין")


def _account_email(user: User) -> str:
    return (user.email or "").strip().lower()


@router.post("/email-code-existing", response_model=None)
# 5/hour per IP, the same cap as `/email-code`.
@limiter.limit("5/hour")
def send_owner_invite_code_existing(
    request: Request,
    body: OwnerInviteExistingCodeRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_verified_email),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Mail a code to the signed-in account's own address. The address is
    not an input, so there is no existence oracle to keep closed here."""
    producer = _live_invite(db, body.token)
    if producer is None:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)
    _refuse_account(user)

    email = _account_email(user)
    # The row records the address the code went to; `_verify_email_code`
    # compares against it, so a code minted for one account cannot be spent
    # by another account holding the same link.
    producer.owner_invite_email = email  # type: ignore[assignment]
    code = _mint_code(producer)
    business, test_cause, p_id = producer.name, bool(producer.is_test), producer.id
    db.commit()

    logger.info("owner_invite.existing_code_sent", producer_id=str(p_id))
    background_tasks.add_task(
        send_owner_invite_code_email,
        email,
        business,  # type: ignore[arg-type]
        code,
        test_cause=test_cause,
    )
    return {"detail": _CODE_SENT}


@router.post("/accept-existing", response_model=Token)
# 10 per 15 minutes, the same cap as `/accept`.
@limiter.limit("10/15 minutes")
def accept_owner_invite_existing(  # noqa: PLR0913 — FastAPI-injected parameters
    request: Request,
    response: Response,
    body: OwnerInviteExistingAccept,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_verified_email),
    db: Session = Depends(get_db),
) -> Token:
    producer = _live_invite(db, body.token)
    if producer is None:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)
    _refuse_account(user)
    # MEH-3137: the same grower-line gate as `/accept`, checked before the
    # code is spent so a 422 leaves both the link and the code live.
    farmer_stamp = farmer_declaration_stamp_for_existing(
        db,
        producer,
        [c.id for c in producer.categories],
        body.farmer_declaration_accepted,
    )

    # Captured now: `populate_existing` below refreshes this same object.
    seen_version = int(user.token_version or 0)
    now = datetime.now(timezone.utc)
    _verify_email_code(db, producer, _account_email(user), body.code, now)

    # The code check above already holds the PRODUCER row (its attempts
    # UPDATE); the account is locked second. Two tabs accepting two
    # different invites on this one account serialise here, and the second
    # re-reads producer_id below.
    locked = (
        db.query(User)
        .filter(User.id == user.id)
        .with_for_update()
        .populate_existing()
        .one()
    )
    _refuse_stale_session(locked, seen_version)
    _refuse_account(locked)

    if _has_owner(db, producer.id):  # type: ignore[arg-type]
        raise HTTPException(status_code=409, detail=_ALREADY_OWNED)

    published = bool(producer.status == _HIDDEN_STATUS)
    p_id, p_name, p_slug = producer.id, producer.name, producer.slug
    p_test = bool(producer.is_test or locked.is_test)
    p_urls = indexnow.producer_urls(producer)

    if not _claim_invite(db, producer.id, body.token, now, farmer_stamp):  # type: ignore[arg-type]
        db.rollback()
        raise HTTPException(status_code=404, detail=_LINK_INVALID)

    locked.role = "producer"  # type: ignore[assignment]
    locked.producer_id = p_id
    locked.is_producer = True  # type: ignore[assignment]
    # Every session issued before this moment is a consumer session; the
    # bump retires them, and the one below is the only producer session.
    locked.token_version = (locked.token_version or 0) + 1  # type: ignore[assignment]
    locked.terms_accepted_at = now  # type: ignore[assignment]
    locked.terms_version = TERMS_VERSION  # type: ignore[assignment]
    u_id, u_email, u_version = locked.id, locked.email, locked.token_version
    db.commit()

    logger.info(
        "owner_invite.accepted_existing",
        producer_id=str(p_id),
        user_id=str(u_id),
        published=published,
    )
    if published:
        indexnow.schedule(background_tasks, p_urls)
    background_tasks.add_task(
        notify_admin_owner_invite_accepted,
        p_name,  # type: ignore[arg-type]
        u_email,  # type: ignore[arg-type]
        published,
        test_cause=p_test,
    )
    background_tasks.add_task(
        send_email,
        u_email,  # type: ignore[arg-type]
        "ברוכים הבאים למהמקור",
        _producer_approved_body(p_name, p_slug),  # type: ignore[arg-type]
        html=_producer_approved_html(p_name, p_slug),  # type: ignore[arg-type]
        test_cause=p_test,
    )

    db.refresh(locked)
    fp = generate_fingerprint()
    _set_refresh_cookie(response, locked)
    _set_fingerprint_cookie(response, fp)
    return Token(
        access_token=create_access_token(
            u_id,  # type: ignore[arg-type]
            u_version,  # type: ignore[arg-type]
            fingerprint_hash=hash_fingerprint(fp),
        )
    )
