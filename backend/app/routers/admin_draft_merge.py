"""
Module:   admin_draft_merge
Purpose:  Move a draft the admin prepared to the owner who registered the
          same business herself: the draft becomes the page in her account, and
          what she had added moves into it. One page remains.
Touches:  producers (the draft, by services/draft_merge_policy.py; the owner's
          own business: deleted through admin_delete_producer), every child
          table of producers (re-pointed by the same policy), users
          (producer_id of the owner), admin_audit. Background: the owner's
          email.
Does NOT: decide which businesses match (services/draft_twins.py), merge on
          its own (the admin presses the button), or touch an approved page —
          a live page has a public URL, reviews and customers (MEH-3865 scope).
          Which column or row survives is services/draft_merge_policy.py
          (Sapir's rulings, 25/11), not here.
Related:  routers/producer_claim.py claim_producer (the same owner stamps, for
          an owner who used the link) · routers/admin.py admin_delete_producer
          (the delete it reuses) · services/submission_gate.py (whether the
          draft may stay in the review queue).
History:  MEH-3865 (creation; industry: Google merges an unclaimed listing
          into the owner's claimed one, Yelp merges instead of deleting, and a
          person approves every merge).
"""

from uuid import UUID

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.limits import MAX_PRODUCTS
from app.models import Producer, Product, User
from app.rate_limit import limiter
from app.routers.admin import admin_delete_producer
from app.schemas.schemas import DraftMergeOut, DraftMergeRequest
from app.services import admin_audit
from app.services import draft_merge_policy as policy
from app.services.draft_merge_emails import send_owner_draft_merged
from app.services.product_order_guards import refuse_delete_with_open_orders
from app.services.review_conflicts import recompute_after_owner_linked
from app.services.submission_gate import submission_missing_items

logger = structlog.get_logger("mehamakor.admin_draft_merge")

router = APIRouter(prefix="/admin", tags=["admin"])

NOT_A_DRAFT = "אפשר להעביר רק טיוטה שעוד אין לה בעלים"
TARGET_DECIDED = "אפשר להעביר טיוטה רק לעסק שעוד לא אושר"
NO_OWNER = "לעסק הזה אין בעלים, אז אין למי להעביר את הטיוטה"
TOO_MANY_OWNERS = "לעסק הזה יש יותר מחשבון אחד, אז אי אפשר להעביר אליו את הטיוטה"
SAME_ROW = "אי אפשר להעביר טיוטה לעצמה"
KIND_MISMATCH = "הטיוטה והעסק מסוגים שונים, אז אי אפשר להעביר"
TOO_MANY_PRODUCTS = (
    f"אחרי ההעברה יהיו בטיוטה יותר מ-{MAX_PRODUCTS} מוצרים. צריך למחוק כמה לפני"
)


def _lock(db: Session, producer_id: UUID) -> Producer:
    producer = (
        db.query(Producer).filter(Producer.id == producer_id).with_for_update().first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return producer


def _owners(db: Session, producer_id: UUID) -> list[User]:
    return (
        db.query(User)
        .filter(User.producer_id == producer_id)
        .order_by(User.id)
        .with_for_update()
        .populate_existing()
        .all()
    )


def _check(db: Session, draft: Producer, target: Producer) -> User:
    """Every refusal, before the first write. Returns the owner."""
    if draft.id == target.id:
        raise HTTPException(status_code=409, detail=SAME_ROW)
    if draft.status != "draft" or _owners(db, draft.id):  # type: ignore[arg-type]
        raise HTTPException(status_code=409, detail=NOT_A_DRAFT)
    if target.status not in ("draft", "pending"):
        raise HTTPException(status_code=409, detail=TARGET_DECIDED)
    # A test account never takes a real business, nor an organiser a producer.
    if draft.kind != target.kind or bool(draft.is_test) != bool(target.is_test):
        raise HTTPException(status_code=409, detail=KIND_MISMATCH)
    owners = _owners(db, target.id)  # type: ignore[arg-type]
    if not owners:
        raise HTTPException(status_code=409, detail=NO_OWNER)
    if len(owners) > 1:
        raise HTTPException(status_code=409, detail=TOO_MANY_OWNERS)
    refuse_delete_with_open_orders(
        db, target.id
    )  # MEH-3262 — the delete would refuse too
    count = (
        db.query(Product.id)
        .filter(Product.producer_id.in_([draft.id, target.id]))
        .count()
    ) - len(policy.duplicate_draft_products(db, draft, target))
    if count > MAX_PRODUCTS:
        raise HTTPException(status_code=409, detail=TOO_MANY_PRODUCTS)
    return owners[0]


def _status_after(draft: Producer, target: Producer) -> None:
    """Sent for review stays sent — if the merged page passes the same gate."""
    if target.status == "pending" and not submission_missing_items(draft):
        draft.status = "pending"  # type: ignore[assignment]
        draft.submitted_for_review_at = target.submitted_for_review_at


@router.post("/producers/{draft_id}/merge-owner", response_model=DraftMergeOut)
@limiter.limit("30/hour")
def merge_draft_into_owner(  # noqa: PLR0913 — request + path + body + three FastAPI deps
    request: Request,
    draft_id: UUID,
    body: DraftMergeRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DraftMergeOut:
    # Lock order: both producers in id order, then users. Two merges of the
    # same pair in opposite directions then wait instead of deadlocking.
    # claim_producer locks user → producer for ONE producer; a claim of this
    # draft waits on the draft lock, then sees an owner and is refused (409).
    if draft_id == body.target_producer_id:
        raise HTTPException(status_code=409, detail=SAME_ROW)
    first, second = sorted((draft_id, body.target_producer_id), key=str)
    locked = {first: _lock(db, first), second: _lock(db, second)}
    draft, target = locked[draft_id], locked[body.target_producer_id]
    owner = _check(db, draft, target)
    before_status = str(target.status)

    delivery = policy.her_delivery(db, target)
    pickup = policy.her_pickup(db, target)
    policy.copy_fields(draft, target, her_delivery=delivery, her_pickup=pickup)
    owner.producer_id = draft.id
    db.flush()
    moved = policy.move_rows(db, draft, target, delivery=delivery, pickup=pickup)
    # The bulk updates bypassed the session: reload, so the delete below sees
    # an emptied owner's row and its cascade cannot reach a moved row.
    db.expire_all()
    draft = db.query(Producer).filter(Producer.id == draft_id).one()
    target = db.query(Producer).filter(Producer.id == body.target_producer_id).one()
    _status_after(draft, target)
    db.flush()

    p_name = str(draft.name)
    p_status = str(draft.status)
    owner = db.query(User).filter(User.producer_id == draft.id).one()
    owner_id, owner_email, owner_name = owner.id, owner.email, owner.name
    p_test = bool(draft.is_test or target.is_test or owner.is_test)
    # Commits the merge together with the delete (one transaction).
    admin_delete_producer(body.target_producer_id, background_tasks, user, db)
    # After the delete, which notes its own before/after on the same request.
    # Ids are not kept by the audit log (admin_audit._reduced); the path
    # carries the draft's, structlog below carries hers.
    admin_audit.note(
        user,
        before={"status": before_status},
        after={"status": p_status, "products_moved": moved},
    )
    recompute_after_owner_linked(db, owner_id)
    logger.info(
        "admin_draft_merge.merged",
        draft_id=str(draft_id),
        target_id=str(body.target_producer_id),
        products_moved=moved,
    )
    background_tasks.add_task(
        send_owner_draft_merged,
        owner_email,  # type: ignore[arg-type]
        owner_name,  # type: ignore[arg-type]
        p_name,
        test_cause=p_test,
    )
    return DraftMergeOut(producer_id=draft_id, status=p_status, products_moved=moved)
