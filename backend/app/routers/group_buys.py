"""MEH-52: Group buy endpoints — commit counter + price unlock."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user,
    get_current_user_optional,
    require_admin,
    require_producer,
)
from app.database import get_db
from app.models.models import GroupBuy, GroupBuyCommit, Producer, User
from app.schemas.schemas import (
    GroupBuyCommitRequest,
    GroupBuyCreate,
    GroupBuyDetail,
    GroupBuyOut,
)

router = APIRouter(prefix="/group-buys", tags=["group-buys"])
admin_router = APIRouter(prefix="/admin/group-buys", tags=["admin-group-buys"])


def _enrich(gb: GroupBuy, current_user: User | None = None) -> dict:
    commits_count = len(gb.commits)
    base = {
        "id": gb.id,
        "producer_id": gb.producer_id,
        "producer_name": gb.producer.name if gb.producer else None,
        "title": gb.title,
        "description": gb.description,
        "product_name": gb.product_name,
        "unit": gb.unit,
        "price_per_unit_regular": gb.price_per_unit_regular,
        "price_per_unit_group": gb.price_per_unit_group,
        "min_participants": gb.min_participants,
        "max_participants": gb.max_participants,
        "deadline": gb.deadline,
        "city": gb.city,
        "status": gb.status,
        "commits_count": commits_count,
        "created_at": gb.created_at,
    }
    if current_user:
        commit = next((c for c in gb.commits if c.user_id == current_user.id), None)
        base["user_committed"] = commit is not None
        base["user_commit"] = commit
    else:
        base["user_committed"] = False
        base["user_commit"] = None
    return base


@router.get("", response_model=list[GroupBuyOut])
def list_group_buys(
    city: str | None = Query(None),
    status: str = Query("open"),
    db: Session = Depends(get_db),
):
    q = db.query(GroupBuy).filter(GroupBuy.status == status)
    if city:
        q = q.filter(GroupBuy.city == city)
    items = q.order_by(GroupBuy.deadline.asc()).all()
    return [_enrich(gb) for gb in items]


@router.get("/{group_buy_id}", response_model=GroupBuyDetail)
def get_group_buy(
    group_buy_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    gb = db.query(GroupBuy).filter(GroupBuy.id == group_buy_id).first()
    if not gb:
        raise HTTPException(status_code=404, detail="קבוצת הרכש לא נמצאה")
    return _enrich(gb, current_user)


@router.post("/{group_buy_id}/commit", status_code=201)
def commit_to_group_buy(
    group_buy_id: UUID,
    data: GroupBuyCommitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # MEH-773: lock the group_buy row so concurrent commits serialize.
    # Without the lock two requests can both read commits < max_participants
    # and both insert, overshooting capacity (no unique constraint guards it).
    gb = (
        db.query(GroupBuy)
        .filter(GroupBuy.id == group_buy_id)
        .with_for_update()
        .first()
    )
    if not gb:
        raise HTTPException(status_code=404, detail="קבוצת הרכש לא נמצאה")
    if gb.status != "open":
        raise HTTPException(status_code=400, detail="קבוצת הרכש אינה פתוחה להצטרפות")
    if gb.deadline < datetime.utcnow():
        raise HTTPException(status_code=400, detail="המועד האחרון חלף")

    # MEH-773: fresh count under the lock — gb.commits is a cached
    # relationship and can be stale within the serialized critical section.
    current_count = (
        db.query(func.count(GroupBuyCommit.id))
        .filter(GroupBuyCommit.group_buy_id == group_buy_id)
        .scalar()
    )
    if gb.max_participants and current_count >= gb.max_participants:
        raise HTTPException(status_code=400, detail="קבוצת הרכש מלאה")

    existing = (
        db.query(GroupBuyCommit)
        .filter(
            GroupBuyCommit.group_buy_id == group_buy_id,
            GroupBuyCommit.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="כבר הצטרפת לקבוצת רכש זו")

    commit = GroupBuyCommit(
        group_buy_id=group_buy_id,
        user_id=current_user.id,
        quantity=data.quantity,
        phone=data.phone or current_user.phone,
    )
    db.add(commit)

    # Auto-fund when min_participants reached
    new_count = current_count + 1
    if new_count >= gb.min_participants:
        gb.status = "funded"

    db.commit()
    db.refresh(commit)
    return {"detail": "הצטרפת בהצלחה", "status": gb.status, "commits_count": new_count}


@router.delete("/{group_buy_id}/commit", status_code=200)
def cancel_commit(
    group_buy_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    gb = db.query(GroupBuy).filter(GroupBuy.id == group_buy_id).first()
    if not gb:
        raise HTTPException(status_code=404, detail="קבוצת הרכש לא נמצאה")
    if gb.deadline < datetime.utcnow():
        raise HTTPException(status_code=400, detail="לא ניתן לבטל לאחר המועד האחרון")

    commit = (
        db.query(GroupBuyCommit)
        .filter(
            GroupBuyCommit.group_buy_id == group_buy_id,
            GroupBuyCommit.user_id == current_user.id,
        )
        .first()
    )
    if not commit:
        raise HTTPException(status_code=404, detail="לא נמצאה הצטרפות")

    db.delete(commit)
    db.refresh(gb)
    # Revert to open if we drop below min_participants
    remaining = len(gb.commits) - 1
    if gb.status == "funded" and remaining < gb.min_participants:
        gb.status = "open"
    db.commit()
    return {"detail": "ההצטרפות בוטלה"}


@router.post("", status_code=201)
def create_group_buy(
    data: GroupBuyCreate,
    current_user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    producer = (
        db.query(Producer).filter(Producer.id == current_user.producer_id).first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בעל עסק לא נמצא")
    if producer.status != "approved":
        raise HTTPException(
            status_code=403, detail="רק בעלי עסק מאושרים יכולים לפתוח קבוצת רכש"
        )

    if data.price_per_unit_group >= data.price_per_unit_regular:
        raise HTTPException(
            status_code=400, detail="מחיר קבוצתי חייב להיות נמוך מהמחיר הרגיל"
        )
    if data.deadline <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="המועד האחרון חייב להיות בעתיד")

    gb = GroupBuy(
        producer_id=producer.id,
        title=data.title,
        description=data.description,
        product_name=data.product_name,
        unit=data.unit,
        price_per_unit_regular=data.price_per_unit_regular,
        price_per_unit_group=data.price_per_unit_group,
        min_participants=data.min_participants,
        max_participants=data.max_participants,
        deadline=data.deadline,
        city=data.city or producer.city,
        status="open",
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return {"id": str(gb.id), "detail": "קבוצת הרכש נוצרה בהצלחה"}


@admin_router.get("", response_model=list[GroupBuyDetail])
def admin_list_group_buys(
    status: str | None = Query(None),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(GroupBuy)
    if status:
        q = q.filter(GroupBuy.status == status)
    items = q.order_by(GroupBuy.created_at.desc()).all()
    return [_enrich(gb) for gb in items]


@admin_router.patch("/{group_buy_id}/status")
def admin_update_status(
    group_buy_id: UUID,
    status: str,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    allowed = {"open", "funded", "cancelled", "fulfilled"}
    if status not in allowed:
        raise HTTPException(
            status_code=400, detail=f"סטטוס לא תקין. אפשרויות: {allowed}"
        )
    gb = db.query(GroupBuy).filter(GroupBuy.id == group_buy_id).first()
    if not gb:
        raise HTTPException(status_code=404, detail="קבוצת הרכש לא נמצאה")
    gb.status = status
    db.commit()
    return {"detail": "סטטוס עודכן", "status": gb.status}
