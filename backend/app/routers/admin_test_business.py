# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-2952 chunk 4 PR)
"""
Module:   admin_test_business
Purpose:  The admin's «עסק בדיקה — מוסתר מהאתר» switch: marks a business as a
          seeded test row (`producers.is_test`), which hides it from every
          public surface and from every outbound send (MEH-2952 chunks 1–2).
Touches:  producers.is_test; IndexNow (the page URL it leaves or returns to).
Does NOT: Expose `is_test` in any schema. The request field is `hidden`, the
          list answers ids only, and ProducerAdminOut stays free of the
          column (tests/test_meh2952_is_test_guards.py guard 3). Does not
          change status — a hidden approved business is still approved, and
          shows again exactly as it was when the switch is turned off.
Related:  services/producer_listing.py:111 (not_test_producer),
          services/indexnow.py:51 (producer_urls returns [] for a test row,
          so the URL is read BEFORE the flip when hiding).
History:  MEH-2952 chunk 4 (creation).
"""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import Producer, User
from app.services import indexnow

# Admin-only routes: exempt from the MEH-3022 per-route rate limit and cap
# (security.md: «every non-admin write route»), like the rest of /admin.
router = APIRouter(prefix="/admin/test-businesses", tags=["admin-test-business"])


class TestBusinessFlag(BaseModel):
    """`hidden` and not `is_test`: guard 3 keeps the column name out of every
    schema, so no response can ever carry it by accident."""

    model_config = ConfigDict(extra="forbid")
    hidden: bool


class TestBusinessFlagOut(BaseModel):
    producer_id: UUID
    hidden: bool


class TestBusinessIdsOut(BaseModel):
    producer_ids: list[UUID]


@router.get("", response_model=TestBusinessIdsOut)
def list_test_businesses(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> TestBusinessIdsOut:
    """The ids the admin views mark «עסק בדיקה». Ids only, nothing else."""
    rows = (
        db.query(Producer.id)
        .filter(Producer.is_test.is_(True))
        .order_by(Producer.created_at)
        .all()
    )
    return TestBusinessIdsOut(producer_ids=[r[0] for r in rows])


@router.put("/{producer_id}", response_model=TestBusinessFlagOut)
def set_test_business(
    producer_id: UUID,
    data: TestBusinessFlag,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> TestBusinessFlagOut:
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")

    if bool(producer.is_test) != data.hidden:
        # MEH-2952: a test row has no public URL (producer_urls → []), so the
        # page being hidden is read while it is still a real business, and the
        # page coming back is read after. Each is pinged only if it is (or was)
        # actually public — a draft is never announced.
        was_public = indexnow.is_public_owner(producer)
        urls_before = indexnow.producer_urls(producer) if was_public else []
        producer.is_test = data.hidden  # type: ignore[assignment]
        db.commit()
        db.refresh(producer)
        urls_after = (
            indexnow.producer_urls(producer)
            if indexnow.is_public_owner(producer)
            else []
        )
        indexnow.schedule(background_tasks, urls_before + urls_after)

    return TestBusinessFlagOut(producer_id=producer.id, hidden=bool(producer.is_test))
