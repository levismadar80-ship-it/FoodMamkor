"""
Module:   producer_draft_preview
Purpose:  The two steps between "the admin built a draft page for a business"
          and "the page is live because its owner said yes" (MEH-3377):
          a read-only preview link the owner can open with no account, and
          «פרסום בהסכמה» — the admin publishes the draft, recording the
          owner's written consent.
Touches:  producers (read for the preview; status, owner_invite_consent_note
          and the approval columns on publish). No new column.
Does NOT: send anything to the business (the admin sends the link and the
          follow-up herself), create an account or an owner (the owner-invite
          panel does that once the page is live), publish on an inbound
          message (a person presses the button — manual approval), or change
          what POST /admin/producers/{id}/approve answers for a draft: that
          stays 409, see below.
Related:  routers/producer_claim.py (the claim link for the same draft) ·
          routers/producer_owner_invite.py (the hand-over after publish; the
          consent note written here is the column it records too) ·
          routers/admin_decisions.py approve_producer (the 409 on a draft) ·
          services/producer_approval.py (the gates and the approval writes).
History:  MEH-3377 (creation).

WHY A SECOND WAY OUT OF `draft`, when approve_producer says there is "no
legitimate reason to approve something that was never submitted" (MEH-2121).

That sentence is about a draft somebody OWNS: she has the button and has not
pressed it. A draft the admin built for a business that has no account has no
one to press it, and until now the only way to publish it after the business
said yes was to delete it and create the page again as approved
(admin_create_producer without `as_draft`) — the same outcome, by hand, with
no gate run and no record of the consent. This route is that outcome with
three constraints the delete-and-recreate path never had: the draft must be
ownerless, the photo and licence gates run, and a consent note is required
and stored. approve_producer is untouched.
"""

from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import require_admin
from app.config import settings
from app.database import get_db
from app.models import Producer, User
from app.rate_limit import limiter
from app.routers.producers import _servable_kashrut_certs
from app.schemas.registration import (
    DraftConsentPublishIn,
    DraftConsentPublishOut,
    DraftPreviewLinkOut,
)
from app.schemas.schemas import KashrutCertRef, ProducerDetailOut
from app.services import indexnow
from app.services.draft_preview import (
    create_draft_preview_token,
    decode_draft_preview_token,
)
from app.services.producer_approval import (
    ApprovalOverrides,
    _apply_approval_state,
    _assert_approvable,
    _persist_approval,
)
from app.services.producer_queries import (
    attach_badge_fields,
    attach_favorites_count,
    attach_rescue_saving,
)

logger = structlog.get_logger("producer_draft_preview")

router = APIRouter(tags=["producer-draft-preview"])

_NOT_FOUND = "בית העסק לא נמצא"
# One body for every refusal of the public read, so the link tells a stranger
# nothing about why it stopped working (expired, published, deleted, claimed).
_LINK_INVALID = "הקישור לא תקף או שפג תוקפו"
_NOT_OWNERLESS_DRAFT = "אפשר רק לטיוטה שעוד אין לה בעלים"
_FOREIGN_SCREENSHOT = "צילום המסך חייב להיות תמונה שהועלתה דרך האתר"


def _has_owner(db: Session, producer_id: UUID) -> bool:
    return db.query(User.id).filter(User.producer_id == producer_id).first() is not None


def _ownerless_draft(db: Session, producer: Producer) -> bool:
    # A draft with an owner is hers: she sees it in her dashboard preview and
    # she is the one who submits it. Neither route here is for that row.
    # `kind` mirrors the live page's own gate (producers.get_producer): an
    # organizer row has no business page, so it has no preview of one and is
    # not published as one.
    if producer.status != "draft" or producer.kind != "producer":
        return False
    return not _has_owner(db, producer.id)  # type: ignore[arg-type]


@router.post(
    "/admin/producers/{producer_id}/preview-link",
    response_model=DraftPreviewLinkOut,
)
@limiter.limit("30/hour")
def create_preview_link(
    request: Request,
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DraftPreviewLinkOut:
    """Mint a 14-day read-only link to the draft's full page. Stateless: no
    write, and a new link does not cancel an earlier one. Every link dies
    when the draft is published, claimed or deleted (the read checks the row).
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if not _ownerless_draft(db, producer):
        raise HTTPException(status_code=409, detail=_NOT_OWNERLESS_DRAFT)
    token, expires_at = create_draft_preview_token(producer.id)  # type: ignore[arg-type]
    # Ids only — never the token (the log stream is not a place for a link
    # that shows an unpublished page).
    logger.info(
        "draft_preview.link_created",
        producer_id=str(producer_id),
        admin_id=str(user.id),
        expires_at=expires_at.isoformat(),
    )
    return DraftPreviewLinkOut(
        url=f"{settings.frontend_url}/draft-preview/{token}", expires_at=expires_at
    )


@router.get("/producer-preview/{token}", response_model=ProducerDetailOut)
@limiter.limit("60/minute")
def read_draft_preview(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
) -> ProducerDetailOut:
    """The draft's page payload, for whoever holds the link.

    The same `ProducerDetailOut` the public page serves once the business is
    live, so the holder sees nothing the page will not show everyone after she
    says yes. Refused with one 404 unless the row is still an ownerless draft.
    """
    # 2048 mirrors ProducerClaimRequest.token: far above a real token, and it
    # stops a huge path segment from reaching the decoder.
    producer_id = decode_draft_preview_token(token) if len(token) <= 2048 else None
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
            selectinload(Producer.locations),
            selectinload(Producer.offers),
        )
        .filter(Producer.id == producer_id)
        .first()
        if producer_id
        else None
    )
    if not producer or not _ownerless_draft(db, producer):
        raise HTTPException(status_code=404, detail=_LINK_INVALID)

    # REUSES: routers/producers.py get_producer — the same hydration, in the
    # same order, so the preview and the live page cannot drift apart.
    attach_badge_fields(producer)
    attach_favorites_count(producer, db)
    attach_rescue_saving([producer], db)
    result = ProducerDetailOut.model_validate(producer)
    result.report_count = 0
    result.kashrut_certs = [
        KashrutCertRef(badge_code=c.badge_code)
        for c in _servable_kashrut_certs(db, producer)
    ]
    return result


@router.post(
    "/admin/producers/{producer_id}/publish-with-consent",
    response_model=DraftConsentPublishOut,
)
@limiter.limit("30/hour")
def publish_draft_with_consent(  # noqa: PLR0913 — seven FastAPI-injected parameters (slowapi's request, path id, body, BackgroundTasks, one override flag, auth dep, db dep), same local-noqa shape as admin_decisions.approve_producer
    request: Request,
    producer_id: UUID,
    body: DraftConsentPublishIn,
    background_tasks: BackgroundTasks,
    # The same flag, default and audit log as approve_producer's (MEH-971).
    # Sapir, 17/11: a business with no licence number may go live; it simply
    # never gets the «מאומת» badge, which only grant-verified gives.
    allow_without_license: bool = Query(default=False),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # FOR UPDATE: serialises with a claim committing on the same draft
    # (claim_producer locks this row), so "ownerless" is still true when we
    # write. Producers-only lock, like create_claim_link — no cycle.
    # The schema proved it is a Cloudinary image URL; this pins it to OUR
    # account, which only the running config knows. Unset in dev and tests.
    cloud = settings.cloudinary_cloud_name
    shot = body.consent_screenshot_url
    if shot and cloud and not shot.startswith(f"https://res.cloudinary.com/{cloud}/"):
        raise HTTPException(status_code=422, detail=_FOREIGN_SCREENSHOT)

    producer = (
        db.query(Producer).filter(Producer.id == producer_id).with_for_update().first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if not _ownerless_draft(db, producer):
        raise HTTPException(status_code=409, detail=_NOT_OWNERLESS_DRAFT)

    # The photo and licence gates run as they do on approve. The phone gate is
    # overridden, and logged by _assert_approvable: an ownerless page has no
    # one who could verify the number, exactly as a business the admin creates
    # live (admin_create_producer) has none. She can verify from her dashboard
    # after the owner invite.
    overrides = ApprovalOverrides(
        without_license=allow_without_license, unverified_phone=True
    )
    _assert_approvable(db, producer, overrides, user.id)  # type: ignore[arg-type]
    _apply_approval_state(producer)
    # The audit record, in the column the owner invite also writes: one
    # business, one statement of what its owner agreed to and where.
    producer.owner_invite_consent_note = body.consent_note  # type: ignore[assignment]
    producer.consent_screenshot_url = body.consent_screenshot_url  # type: ignore[assignment]
    admin_id = user.id
    producer = _persist_approval(db, producer_id, producer, overrides, admin_id)  # type: ignore[arg-type]
    if (
        producer.owner_invite_consent_note != body.consent_note
        or producer.consent_screenshot_url != body.consent_screenshot_url
    ):
        # _persist_approval's slug-collision retry re-reads the row and
        # re-applies only the approval columns; put the record back.
        producer.owner_invite_consent_note = body.consent_note  # type: ignore[assignment]
        producer.consent_screenshot_url = body.consent_screenshot_url  # type: ignore[assignment]
        db.commit()

    logger.info(
        "draft_preview.published_with_consent",
        producer_id=str(producer_id),
        admin_id=str(admin_id),
        without_license=allow_without_license,
        has_screenshot=body.consent_screenshot_url is not None,
    )
    indexnow.schedule_public_producer(background_tasks, producer)
    return {
        "producer_id": producer.id,
        "status": producer.status,
        "slug": producer.slug,
    }
