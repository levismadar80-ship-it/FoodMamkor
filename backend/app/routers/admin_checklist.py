"""
Module:   admin_checklist
Purpose:  MEH-1399 Phase 2 — the pre-approval review checklist as data. Serves
          the editable item list and records which items an admin ticked for a
          given producer, with who and when.
Touches:  DB tables `admin_checklist_items` and `producer_review_checks`. No
          email, no WhatsApp, no external calls — this router only reads and
          writes those two tables.
Does NOT: gate approval. The soft confirm dialog stays entirely client-side
          (use-review-checklist.js), and the HARD approve gates (photo 422 /
          licence 422) live in routers/admin.py::approve_producer, untouched
          here. A tick is a record that a human looked, never a permission.
Related:  frontend/lib/admin-review-checklist.js (the Phase 1 constant this
          supersedes, now the migration's seed), migration d4a9c31e6f82,
          backend/app/routers/admin.py (the approve flow these describe).
History:  MEH-1399 (creation; Phase 2 of MEH-1396).
"""

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import User
from app.models.models import AdminChecklistItem, Producer, ProducerReviewCheck
from app.rate_limit import limiter
from app.schemas.schemas import (
    AdminChecklistItemOut,
    AdminChecklistItemsIn,
    ProducerReviewCheckOut,
    ProducerReviewChecksIn,
    ProducerReviewChecksOut,
)

router = APIRouter(prefix="/admin", tags=["admin-checklist"])

# Positions are stored spaced out rather than 0,1,2 so a future insert between
# two items does not have to renumber the rest. The migration seeds 10..70 and
# this keeps that convention on every save.
_POSITION_STEP = 10


def _ticked_item_ids(db: Session, producer_id: UUID) -> set[UUID]:
    """The item ids currently ticked for this producer.

    Its own function so a test can make it return a deliberately STALE answer
    and drive the concurrent-write paths in `save_review_checks` without racing
    two real sessions — injecting the end state rather than waiting for it.
    """
    return {
        row.item_id
        for row in db.query(ProducerReviewCheck.item_id).filter(
            ProducerReviewCheck.producer_id == producer_id
        )
    }


@router.get("/checklist-items", response_model=list[AdminChecklistItemOut])
@limiter.limit("60/minute")
def list_checklist_items(
    request: Request,
    include_inactive: bool = False,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """The checklist, ordered.

    `include_inactive` defaults to **False** because the review flow — the
    high-traffic caller — must never show a retired item to an admin working a
    business. The settings screen passes `true`, since editing a list you
    cannot see all of is not editing.
    """
    query = db.query(AdminChecklistItem)
    if not include_inactive:
        query = query.filter(AdminChecklistItem.active.is_(True))
    return query.order_by(AdminChecklistItem.position.asc()).all()


@router.put("/checklist-items", response_model=list[AdminChecklistItemOut])
@limiter.limit("30/minute")
def save_checklist_items(
    request: Request,
    data: AdminChecklistItemsIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Replace the list: add, edit, reorder and retire in one request.

    ## Order comes from the array index, not from the client

    `position` is assigned as `index * 10` here rather than accepted from the
    payload. A client-supplied position lets two items claim the same slot and
    makes the rendered order depend on a tiebreak nobody specified; the array
    the admin actually sees IS the order, so it is the input.

    ## There is no delete, and that is enforced below the router

    An item absent from the payload is left ALONE, not removed. Retirement is
    `active: false`. This is not politeness toward the data: the FK from
    `producer_review_checks.item_id` is ON DELETE RESTRICT, so deleting a
    ticked item raises at the database — a delete endpoint could only ever
    500 on exactly the items with history worth keeping.

    That does mean a mis-typed item can be created and then only deactivated,
    never removed. Accepted deliberately: an audit trail whose subjects can be
    erased is not an audit trail, and the cost is one greyed-out row.

    ## Unknown ids are rejected, not silently created

    An `id` that does not exist is a 404, not an insert. A stale tab saving
    against items another admin retired should be told, not have its old rows
    quietly resurrected under new ids.
    """
    existing = {item.id: item for item in db.query(AdminChecklistItem).all()}
    result: list[AdminChecklistItem] = []

    for index, payload in enumerate(data.items):
        position = index * _POSITION_STEP
        if payload.id is None:
            item = AdminChecklistItem(
                position=position,
                label=payload.label,
                hint=payload.hint,
                active=payload.active,
            )
            db.add(item)
        else:
            item = existing.get(payload.id)
            if item is None:
                raise HTTPException(status_code=404, detail="סעיף לא נמצא")
            item.position = position
            item.label = payload.label
            item.hint = payload.hint
            item.active = payload.active
        result.append(item)

    db.commit()
    # Re-read the WHOLE table rather than returning `result`, which holds only
    # the rows this request submitted. A second admin who added an item between
    # this page's load and this save is otherwise absent from the response, so
    # the saving admin's list silently loses a row that exists in the database —
    # the same check-then-act window the tick endpoint below closes, on the
    # read side instead of the write side. Costs one query; removes a state in
    # which the UI is confidently wrong.
    return (
        db.query(AdminChecklistItem).order_by(AdminChecklistItem.position.asc()).all()
    )


@router.get(
    "/producers/{producer_id}/review-checks", response_model=ProducerReviewChecksOut
)
@limiter.limit("60/minute")
def get_review_checks(
    request: Request,
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """The ticks recorded for one producer.

    404s on an unknown producer rather than returning an empty list: "this
    business has no ticks" and "this business does not exist" are different
    facts, and an empty list for the second would let the review flow render a
    clean checklist for a producer that is gone.
    """
    if not db.query(Producer.id).filter(Producer.id == producer_id).first():
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    rows = (
        db.query(ProducerReviewCheck)
        .filter(ProducerReviewCheck.producer_id == producer_id)
        .all()
    )
    # checked_by is ON DELETE SET NULL, so a deleted admin leaves a real row
    # with a null actor. Rendering "—" for that is correct; dropping the row
    # would destroy the record that the check happened at all.
    user_ids = {row.checked_by for row in rows if row.checked_by}
    names = {}
    if user_ids:
        names = {
            uid: name
            for uid, name in db.query(User.id, User.name)
            .filter(User.id.in_(user_ids))
            .all()
        }

    return ProducerReviewChecksOut(
        producer_id=producer_id,
        checks=[
            ProducerReviewCheckOut(
                item_id=row.item_id,
                label_snapshot=row.label_snapshot,
                checked_by_name=names.get(row.checked_by),
                checked_at=row.checked_at,
            )
            for row in rows
        ],
    )


@router.put(
    "/producers/{producer_id}/review-checks", response_model=ProducerReviewChecksOut
)
@limiter.limit("60/minute")
def save_review_checks(
    request: Request,
    producer_id: UUID,
    data: ProducerReviewChecksIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Record the ticked set for a producer. Idempotent.

    ## Set semantics, and why not a diff

    What arrives IS the state afterwards: ids present are ticked, ids absent
    have their rows deleted. A diff API ("tick this one") requires the client
    to know what it previously sent, which is exactly the assumption that
    breaks with two admin tabs open on the same business.

    ## `label_snapshot` is written HERE, at tick time

    Not read back from the item at display time. That is the entire mechanism
    of the audit trail — an admin editing an item's wording next month must not
    retroactively change what a past admin attested to. The FK still says which
    item; the snapshot says what it said.

    ## Re-ticking does not restamp

    An item already ticked is left untouched — `checked_by` / `checked_at` keep
    the FIRST attestation. Re-saving an unchanged checklist (which the UI does
    on every autosave) would otherwise rewrite the audit trail to the most
    recent page load, which is the opposite of what it is for.

    ## Inactive items are still accepted

    Deliberately: an admin may be mid-review when another retires an item, and
    rejecting her save would lose the work over a race she cannot see. The
    review flow will stop OFFERING the item on the next load.
    """
    if not db.query(Producer.id).filter(Producer.id == producer_id).first():
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    wanted = set(data.item_ids)
    if wanted:
        found = {
            item.id: item
            for item in db.query(AdminChecklistItem)
            .filter(AdminChecklistItem.id.in_(wanted))
            .all()
        }
        missing = wanted - set(found)
        if missing:
            raise HTTPException(status_code=404, detail="סעיף לא נמצא")
    else:
        found = {}

    current = _ticked_item_ids(db, producer_id)

    # Both halves below are written as set-based statements rather than ORM
    # add/delete, and that is a concurrency decision, not a style one. Two
    # admins reviewing the same business is the ordinary case here, and the
    # read above is a check-then-act: whatever it saw can be stale by the time
    # the write lands.
    #
    #   * insert -> ON CONFLICT DO NOTHING. A racing session that already
    #     inserted the same (producer, item) trips the unique constraint, which
    #     as a plain INSERT is an unhandled IntegrityError, i.e. a 500 on a
    #     request whose desired end state had ALREADY been reached. Skipping is
    #     also exactly the "re-ticking does not restamp" rule in the docstring:
    #     the first attestation stands.
    #   * delete -> one bulk DELETE ... WHERE. An ORM delete of a row a racing
    #     session already removed raises StaleDataError ("expected to delete 1
    #     row(s); 0 were matched"); a WHERE that matches nothing is a no-op.
    #
    # Neither needs a retry, so there is no loop that can fail a second time.
    stale = current - wanted
    if stale:
        db.query(ProducerReviewCheck).filter(
            ProducerReviewCheck.producer_id == producer_id,
            ProducerReviewCheck.item_id.in_(stale),
        ).delete(synchronize_session=False)

    fresh = wanted - current
    if fresh:
        db.execute(
            pg_insert(ProducerReviewCheck.__table__)
            .values(
                [
                    {
                        # Explicit: a Python-side column default is not reliably
                        # applied to every row of a multi-VALUES core insert.
                        "id": uuid4(),
                        "producer_id": producer_id,
                        "item_id": item_id,
                        # Snapshot at tick time — see the docstring.
                        "label_snapshot": found[item_id].label,
                        "checked_by": user.id,
                    }
                    for item_id in fresh
                ]
            )
            .on_conflict_do_nothing(
                constraint="uq_producer_review_checks_producer_item"
            )
        )

    db.commit()
    return get_review_checks(request=request, producer_id=producer_id, user=user, db=db)
