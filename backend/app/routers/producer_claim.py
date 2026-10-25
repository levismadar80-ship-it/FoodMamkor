"""
Module:   producer_claim
Purpose:  Owner-claim link — an admin prepares a DRAFT business with no owner,
          sends its owner a signed link, and she takes it over with her OWN
          account and her own declaration. Nobody at Mehamakor creates or
          transmits a password.
Touches:  producers (declared_at, declaration_version — read status, locked
          FOR UPDATE on claim), users (producer_id, role, is_producer,
          terms_accepted_at, terms_version — the claimant's row locked FOR
          UPDATE first). Background: WhatsApp welcome to the business phone,
          producer welcome email, risk score.
Does NOT: create accounts (the owner signs up via /auth/* first), publish
          anything (the draft stays "draft" until she presses «שליחה לבדיקה»
          — producer_me.submit_for_review — and the admin approves it), or
          claim a live / imported listing (v1: drafts only).
Related:  backend/app/auth.py create/decode_producer_claim_token ·
          backend/app/routers/auth.py register_producer upgrade_path (the same
          stamps, for a business the owner creates herself) ·
          backend/app/routers/admin.py admin_create_producer (`as_draft`).
History:  MEH-2322 (MEH-2321 chunk A, creation).
"""

from datetime import datetime, timezone
from uuid import UUID

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.auth import (
    create_producer_claim_token,
    decode_producer_claim_token,
    get_current_user,
    require_admin,
)
from app.config import settings
from app.constants import DECLARATION_VERSION, TERMS_VERSION
from app.database import get_db
from app.models import Producer, User
from app.rate_limit import limiter
from app.schemas.schemas import (
    ProducerClaimLinkOut,
    ProducerClaimOut,
    ProducerClaimPreviewOut,
    ProducerClaimRequest,
)
from app.services.auth_emails import send_welcome_email
from app.services.auth_notifications import notify_producer_registered
from app.services.producer_risk import score_producer

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["producer-claim"])

# One message for every way a link can be unusable (bad signature, expired,
# wrong scope, deleted draft). Telling them apart would let anyone probe which
# producer ids exist.
_LINK_INVALID = "הקישור לא תקין או שפג תוקפו. אפשר לבקש מאיתנו קישור חדש."
_ALREADY_CLAIMED = "העמוד הזה כבר שויך לחשבון."

# MEH-2322 residual risks, accepted and written down rather than discovered:
# - The link is a bearer credential: ANY signed-in account that holds it and
#   ticks the two boxes claims the draft, first one wins. What bounds that is
#   draft-only claiming, publication needing the owner's own submit AND a
#   manual admin approval, the real owner seeing a 409 (so a hijack is loud),
#   the 14-day expiry, and the link dying once the draft has an owner.
# - The link travels in URLs: the frontend /claim/<token> path, and the
#   preview's ?token= query, which reaches access logs and the Sentry request
#   context (middleware.py request_info "url"). Readers of both are admins, who
#   can mint a link anyway. The frontend page must keep the path out of
#   analytics (MEH-2324).
# - users.producer_id has no unique index. The claim and register_producer's
#   upgrade path both lock the users row first, so those two are serialised.
#   delete_account does not lock: an account deleted in the same instant it
#   claims can leave the draft stamped and ownerless — inert (an ownerless
#   draft cannot be submitted) and only reachable by the account racing itself.
# - An admin PUT can set any listing's status back to "draft"
#   (admin_update_producer applies the payload as-is), which makes an
#   ownerless live listing claimable. Admin-only; tracked separately.


def _has_owner(db: Session, producer_id: UUID) -> bool:
    return db.query(User.id).filter(User.producer_id == producer_id).first() is not None


def _claimable(db: Session, producer: Producer) -> bool:
    # DO NOT widen to approved / imported listings without a decision — a
    # claim there would hand a stranger holding a leaked link control of a
    # page that is already live (MEH-2321 D2).
    return producer.status == "draft" and not _has_owner(db, producer.id)


@router.post(
    "/admin/producers/{producer_id}/claim-link",
    response_model=ProducerClaimLinkOut,
)
@limiter.limit("30/hour")
def create_claim_link(
    request: Request,
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    if producer.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="אפשר ליצור קישור הזמנה רק לטיוטה שעוד לא נשלחה לבדיקה",
        )
    if _has_owner(db, producer.id):
        raise HTTPException(status_code=409, detail=_ALREADY_CLAIMED)
    token, expires_at = create_producer_claim_token(producer.id)
    logger.info(
        "producer_claim.link_created",
        producer_id=str(producer.id),
        admin_id=str(user.id),
        expires_at=expires_at.isoformat(),
    )
    return ProducerClaimLinkOut(
        url=f"{settings.frontend_url}/claim/{token}", expires_at=expires_at
    )


@router.get("/producer-claim/preview", response_model=ProducerClaimPreviewOut)
@limiter.limit("30/minute")
def preview_claim(
    request: Request,
    token: str = Query(min_length=1, max_length=2048),
    db: Session = Depends(get_db),
):
    producer_id = decode_producer_claim_token(token)
    producer = (
        db.query(Producer).filter(Producer.id == producer_id).first()
        if producer_id
        else None
    )
    if not producer:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)
    if not _claimable(db, producer):
        raise HTTPException(status_code=409, detail=_ALREADY_CLAIMED)
    return ProducerClaimPreviewOut(
        name=producer.name,
        city=producer.city,
        short_description=producer.short_description,
        image=(producer.images or [None])[0],
        # Public on the business page anyway. The claim page needs them for
        # the SAME rule registration applies: an agricultural category adds
        # the grower declaration (RegisterProducerClient FARMER_DECLARATION_*).
        category_names=[c.name for c in producer.categories],
    )


@router.post("/producer-claim", response_model=ProducerClaimOut)
@limiter.limit("10/hour")
def claim_producer(
    request: Request,
    body: ProducerClaimRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # MEH-2322: lock the claimant's row FIRST, and re-read it under the lock.
    # `user` was loaded by get_current_user before any lock, so a second claim
    # by the same account, started before the first one committed, would check
    # a stale producer_id, pass, and overwrite it — leaving the first page
    # stamped with her declaration and owned by nobody. Lock order is always
    # user → producer, so two claims cannot deadlock.
    # DO NOT drop populate_existing() — without it SQLAlchemy hands back the
    # identity-mapped `user` with its stale attributes, and the lock fixes
    # nothing. test_same_account_two_links_in_flight_second_is_409 covers it.
    user = (
        db.query(User)
        .filter(User.id == user.id)
        .with_for_update()
        .first()  # RED CONSTRUCTION (i): populate_existing() dropped
    )
    if user is None:  # deleted between authentication and the lock
        raise HTTPException(status_code=401, detail="משתמש לא נמצא")

    # Who may claim. Same two refusals, same wording family, as the register
    # upgrade path (routers/auth.py register_producer).
    if user.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="מנהלת מערכת לא יכולה לקבל עמוד של בית עסק. היכנסי עם חשבון אחר.",
        )
    if user.producer_id or user.is_producer:
        raise HTTPException(status_code=409, detail="לחשבון הזה כבר יש בית עסק רשום")

    # The declaration and the terms are HERS — stamped from her own clicks,
    # never prepared on her behalf (MEH-2321 D5, ADR-022 gate 2).
    if not body.declaration_accepted:
        raise HTTPException(
            status_code=422, detail="יש לאשר את הצהרת הרישוי כדי להמשיך"
        )
    if not body.terms_accepted:
        raise HTTPException(
            status_code=422, detail="יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך"
        )

    producer_id = decode_producer_claim_token(body.token)
    # FOR UPDATE serialises two claims racing on one link: the second waits,
    # then sees the owner the first one set and gets the 409 (MEH-2321 D3).
    # test_two_accounts_one_link_in_flight_second_is_409 covers it.
    producer = (
        db.query(Producer).filter(Producer.id == producer_id).with_for_update().first()
        if producer_id
        else None
    )
    if not producer:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)
    if not _claimable(db, producer):
        raise HTTPException(status_code=409, detail=_ALREADY_CLAIMED)

    now = datetime.now(timezone.utc)
    producer.declared_at = now
    producer.declaration_version = DECLARATION_VERSION
    user.producer_id = producer.id
    user.role = "producer"
    user.is_producer = True
    user.terms_accepted_at = now
    user.terms_version = TERMS_VERSION
    db.commit()

    # Capture before the session closes — background tasks run after it.
    p_id, p_name, p_phone = producer.id, producer.name, producer.phone
    logger.info("producer_claim.claimed", producer_id=str(p_id), user_id=str(user.id))
    # Same three side effects as a self-registered draft (register_producer
    # upgrade_path). The admin ping stays where it already is: at submit.
    background_tasks.add_task(notify_producer_registered, p_name, p_phone)
    background_tasks.add_task(score_producer, p_id)
    background_tasks.add_task(send_welcome_email, user.email, user.name, "producer")
    return ProducerClaimOut(producer_id=p_id, status=producer.status)
