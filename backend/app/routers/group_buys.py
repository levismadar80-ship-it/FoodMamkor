"""MEH-52: Group buy endpoints — commit counter + price unlock."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.auth import (
    get_current_user,
    get_current_user_optional,
    require_admin,
    require_producer,
    require_verified_producer,
)
from app.database import get_db
from app.models.models import GroupBuy, GroupBuyCommit, Producer, User
from app.rate_limit import limiter
from app.schemas.schemas import (
    GroupBuyCommitRequest,
    GroupBuyCreate,
    GroupBuyDetail,
    GroupBuyOut,
    GroupBuyStatusOut,
    GroupBuyStatusUpdate,
)
from app.services.group_buy_notifications import (
    send_cancelled_notifications,
    send_funded_notifications,
)
from app.services.producer_listing import is_business
from app.utils.clock import utc_now

router = APIRouter(prefix="/group-buys", tags=["group-buys"])
admin_router = APIRouter(prefix="/admin/group-buys", tags=["admin-group-buys"])
# MEH-2437: the business's own list lives under /producers/me, beside
# /producers/me/recipes, so it needs a router without the /group-buys prefix.
me_router = APIRouter(tags=["group-buys"])


def _enrich(gb: GroupBuy, current_user: User | None = None) -> dict:
    commits_count = len(gb.commits)
    base = {
        "id": gb.id,
        "producer_id": gb.producer_id,
        "producer_name": gb.producer.name if gb.producer else None,
        # MEH-2544: the card / page photo — the business's first image, the
        # same pick as ProducerCard (images[0]). Read-only; a group buy has
        # no image of its own.
        "producer_image_url": (gb.producer.images or [None])[0]
        if gb.producer
        else None,
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
        "fulfillment_note": gb.fulfillment_note,
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


def _public_group_buys(db: Session):
    """The ONE definition of "this group buy is public" (MEH-2484).

    LOCK (בתי עסק מאושרים בלבד): a group buy reaches the public only while its
    business is a live business — ``producer_listing.is_business()``, i.e.
    approved and ``kind='producer'``. Creation already required a verified
    business, but a business rejected or suspended AFTER opening a group buy
    left it in the public list, on its page, and (since MEH-2478) in the
    sitemap with a ``seller.url`` that 404s.

    Three callers: the public list, the detail route's stranger branch and the
    join. DO NOT re-express the predicate inline in a route — same reasoning as
    ``experiences._publicly_visible_query`` (MEH-1749 / MEH-1740): a second
    copy drifts and the surface leaks.
    """
    return (
        db.query(GroupBuy)
        .join(Producer, GroupBuy.producer_id == Producer.id)
        .filter(is_business())
    )


def _is_public(db: Session, group_buy_id: UUID) -> bool:
    return (
        _public_group_buys(db).filter(GroupBuy.id == group_buy_id).first() is not None
    )


@router.get("", response_model=list[GroupBuyOut])
@limiter.limit("120/minute")
def list_group_buys(
    request: Request,
    city: str | None = Query(None),
    status: str = Query("open"),
    db: Session = Depends(get_db),
):
    q = _public_group_buys(db).filter(GroupBuy.status == status)  # MEH-2484
    if status == "open":
        # MEH-2540: nothing closes an open group buy past its deadline (see
        # OWNER_TRANSITIONS), so the «פתוחות» tab listed it next to a join
        # button the commit route then refuses. The list only — its page still
        # resolves for a shared link and says the deadline passed.
        q = q.filter(GroupBuy.deadline >= utc_now())
    if city:
        q = q.filter(GroupBuy.city == city)
    items = q.order_by(GroupBuy.deadline.asc()).all()
    return [_enrich(gb) for gb in items]


@me_router.get("/producers/me/group-buys", response_model=list[GroupBuyOut])
@limiter.limit("120/minute")
def list_my_group_buys(
    request: Request,
    current_user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """MEH-2437: the business's own group buys, every status, newest first.

    Replaces the dashboard's four site-wide GET /group-buys calls that were
    filtered by producer_id in the browser.
    """
    if not current_user.producer_id:
        raise HTTPException(status_code=403, detail="לא נמצא עסק מקושר")
    items = (
        db.query(GroupBuy)
        .options(selectinload(GroupBuy.commits), selectinload(GroupBuy.producer))
        .filter(GroupBuy.producer_id == current_user.producer_id)
        .order_by(GroupBuy.created_at.desc())
        .all()
    )
    return [_enrich(gb) for gb in items]


@router.get("/{group_buy_id}", response_model=GroupBuyDetail)
@limiter.limit("120/minute")
def get_group_buy(
    request: Request,
    group_buy_id: UUID,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    gb = db.query(GroupBuy).filter(GroupBuy.id == group_buy_id).first()
    if not gb:
        raise HTTPException(status_code=404, detail="קבוצת הרכש לא נמצאה")
    # MEH-2484: a stranger gets the SAME 404 when the business is not public,
    # so the row's existence does not leak. Owner and admin still see it.
    is_owner = bool(
        current_user
        and current_user.producer_id
        and current_user.producer_id == gb.producer_id
    )
    is_admin = bool(current_user and current_user.role == "admin")
    if not (is_owner or is_admin) and not _is_public(db, gb.id):
        raise HTTPException(status_code=404, detail="קבוצת הרכש לא נמצאה")
    return _enrich(gb, current_user)


def _maybe_notify_funded(
    gb: GroupBuy, db: Session, background_tasks: BackgroundTasks
) -> None:
    """MEH-1651: latch + queue the open->funded notification pair.

    Guarded by `funded_notified_at IS NULL` — a one-way latch, so the
    funded -> open -> funded flap around `min_participants` notifies exactly
    once. Caller holds the `gb` row lock (MEH-773) and owns the commit; this
    only stamps the marker in the same transaction, so the stamp and the
    threshold crossing can never diverge.

    Recipients are resolved HERE, while the request-scoped Session is open, and
    handed to the background task as plain strings — a background task must
    never touch `db`, which is closed once the response is sent.
    """
    if gb.funded_notified_at is not None:
        return

    # Requires the caller to have flushed the new commit, or the participant
    # who triggered the funding is missing from their own notification.
    participant_emails = [
        email
        for (email,) in db.query(User.email)
        .join(GroupBuyCommit, GroupBuyCommit.user_id == User.id)
        .filter(GroupBuyCommit.group_buy_id == gb.id)
        .all()
    ]
    # .first(), not .scalar(): no DB constraint stops two User rows from
    # sharing a producer_id, and .scalar() raises MultipleResultsFound on a
    # second match — which would 500 the commit itself, since this runs before
    # db.commit(), not inside the background task's try/except. Matches the
    # defensive convention already used for this exact query shape elsewhere
    # (admin.py:522,566,632).
    owner_row = db.query(User.email).filter(User.producer_id == gb.producer_id).first()
    owner_email = owner_row[0] if owner_row else None

    # MEH-1454: naive datetime. sa.DateTime() is naive and this module uses
    # utc_now() throughout — an aware value here breaks comparisons.
    gb.funded_notified_at = utc_now()

    background_tasks.add_task(
        send_funded_notifications,
        owner_email,
        participant_emails,
        gb.title,
        gb.producer.name if gb.producer else "",
        str(gb.id),
        str(gb.producer_id),
    )


@router.post("/{group_buy_id}/commit", status_code=201)
def commit_to_group_buy(
    group_buy_id: UUID,
    data: GroupBuyCommitRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # MEH-773: lock the group_buy row so concurrent commits serialize.
    # Without the lock two requests can both read commits < max_participants
    # and both insert, overshooting capacity (no unique constraint guards it).
    gb = (
        db.query(GroupBuy).filter(GroupBuy.id == group_buy_id).with_for_update().first()
    )
    # MEH-2484: a group buy whose page is 404 cannot be joined via a held link.
    if not gb or not _is_public(db, gb.id):
        raise HTTPException(status_code=404, detail="קבוצת הרכש לא נמצאה")
    if gb.status != "open":
        raise HTTPException(status_code=400, detail="קבוצת הרכש אינה פתוחה להצטרפות")
    if gb.deadline < utc_now():
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

    # MEH-1651: `phone` is no longer collected or written. Nothing ever read
    # the column, and after the funded notification the participant is reached
    # by email anyway. The column itself stays until the post-launch DROP
    # (Expand-Contract, ADR-007 — Sapir-only).
    commit = GroupBuyCommit(
        group_buy_id=group_buy_id,
        user_id=current_user.id,
        quantity=data.quantity,
    )
    db.add(commit)
    # Flush so the just-added commit is visible to the participant-email query
    # in _maybe_notify_funded — without it the joining participant would be
    # missing from the notification that their own join triggered.
    db.flush()

    # Auto-fund when min_participants reached
    new_count = current_count + 1
    if new_count >= gb.min_participants:
        gb.status = "funded"
        _maybe_notify_funded(gb, db, background_tasks)

    db.commit()
    db.refresh(commit)
    return {"detail": "הצטרפת בהצלחה", "status": gb.status, "commits_count": new_count}


@router.delete("/{group_buy_id}/commit", status_code=200)
def cancel_commit(
    group_buy_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # MEH-2436: lock the row like /commit and the owner's status change do.
    # Unlocked, a leave that read "funded" could write "open" over an owner's
    # cancel or fulfil committed in between, reopening a closed group buy.
    gb = (
        db.query(GroupBuy).filter(GroupBuy.id == group_buy_id).with_for_update().first()
    )
    if not gb:
        raise HTTPException(status_code=404, detail="קבוצת הרכש לא נמצאה")
    # MEH-2436: the owner can now close a group buy before its deadline; after
    # that, the list of who took part is a record, not something to edit.
    if gb.status not in ("open", "funded"):
        raise HTTPException(status_code=400, detail="קבוצת הרכש כבר נסגרה")
    if gb.deadline < utc_now():
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
        # DO NOT clear gb.funded_notified_at here (MEH-1651) — the status is
        #        allowed to flap, the notification is not. Clearing it re-arms
        #        the send, so re-crossing the threshold would re-spam every
        #        participant. The latch is deliberately one-way.
    db.commit()
    return {"detail": "ההצטרפות בוטלה"}


@router.post("", status_code=201)
def create_group_buy(
    data: GroupBuyCreate,
    current_user: User = Depends(require_verified_producer),
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
    # MEH-2459: a group buy is selling, and an organizer sells nothing
    # (ADR-036). Same 403 shape as the status gate above; the public
    # GET /group-buys serializes producer_name, so this is the one place an
    # organizer could otherwise surface as a seller.
    if producer.kind != "producer":
        raise HTTPException(
            status_code=403, detail="מארגן שווקים ואירועים לא יכול לפתוח קבוצת רכש"
        )

    if data.price_per_unit_group >= data.price_per_unit_regular:
        raise HTTPException(
            status_code=400, detail="מחיר קבוצתי חייב להיות נמוך מהמחיר הרגיל"
        )
    if data.deadline <= utc_now():
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
        fulfillment_note=data.fulfillment_note,
        status="open",
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return {"id": str(gb.id), "detail": "קבוצת הרכש נוצרה בהצלחה"}


# MEH-2436: what the business may do to its own group buy. Anything not listed
# is a 409 — cancelled and fulfilled are final for the owner; only an admin
# moves a group buy out of them, through PATCH /admin/group-buys/{id}/status.
# "open → cancelled" covers both "cancel" before the deadline and "close" after
# it: the row looks the same either way. Nothing closes an open group buy past
# its deadline automatically.
OWNER_TRANSITIONS = {
    ("open", "cancelled"),
    ("funded", "fulfilled"),
    ("funded", "cancelled"),
}


@router.patch("/{group_buy_id}/status", response_model=GroupBuyStatusOut)
@limiter.limit("30/minute")
def update_group_buy_status(  # noqa: PLR0913 — all 6 args are FastAPI-injected (slowapi request, path id, body, BackgroundTasks, auth dep, db dep); MEH-2449 added the cancel-email hop
    request: Request,
    group_buy_id: UUID,
    data: GroupBuyStatusUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Owner-only. An admin changes status through the admin route, so this
    # table is the one path a business has, and there is no second unchecked
    # one here. Same role and email gates, in the same order, as creating a
    # group buy. Unlike create, a business that is no longer approved may still
    # close what it opened: its participants are better off with that.
    require_verified_producer(require_producer(current_user))

    # Lock the row: a participant joining in the same instant can flip
    # open → funded, and the transition check must see the status it writes over.
    gb = (
        db.query(GroupBuy).filter(GroupBuy.id == group_buy_id).with_for_update().first()
    )
    if not gb:
        raise HTTPException(status_code=404, detail="קבוצת הרכש לא נמצאה")
    # IDOR (security.md): the group buy must belong to the caller's business.
    # A producer user with no business owns nothing.
    if current_user.producer_id is None or gb.producer_id != current_user.producer_id:
        raise HTTPException(status_code=403, detail="אין הרשאה לשנות קבוצת רכש זו")
    # MEH-2489: checked under the row lock, after the ownership check (a
    # stranger learns nothing about the row's state). Same 409 and wording as
    # a refused transition: either way the dashboard reloads and shows the
    # state the server holds. The concrete case: she opened «ביטול» on an open
    # group, a last participant joined meanwhile, and without this the cancel
    # went through on a funded group whose double confirm she never saw.
    if data.expected_status is not None and gb.status != data.expected_status:
        raise HTTPException(
            status_code=409, detail="אי אפשר לשנות את קבוצת הרכש למצב הזה"
        )
    if (gb.status, data.status) not in OWNER_TRANSITIONS:
        raise HTTPException(
            status_code=409, detail="אי אפשר לשנות את קבוצת הרכש למצב הזה"
        )

    # MEH-2435 chunk 4: tell every participant the group was cancelled.
    # Recipients are resolved here, while the session is open; the background
    # task gets plain strings (as in _maybe_notify_funded). Sent once by
    # construction: cancelled is final in OWNER_TRANSITIONS and this check ran
    # under the row lock, so a repeat cancel is a 409 above and never gets here.
    # An admin's cancel (admin route) sends nothing — the wording names the
    # business as the one who cancelled.
    participant_emails: list[str] = []
    if data.status == "cancelled":
        participant_emails = [
            email
            for (email,) in db.query(User.email)
            .join(GroupBuyCommit, GroupBuyCommit.user_id == User.id)
            .filter(GroupBuyCommit.group_buy_id == gb.id)
            # Nothing stops the owner joining her own group; she cancelled it,
            # so she is not told that the business cancelled it.
            .filter(User.id != current_user.id)
            .all()
        ]

    title = gb.title
    producer_name = gb.producer.name if gb.producer else ""

    gb.status = data.status
    db.commit()

    if participant_emails:
        background_tasks.add_task(
            send_cancelled_notifications,
            participant_emails,
            title,
            producer_name,
            str(group_buy_id),
        )
    return {"detail": "סטטוס עודכן", "status": gb.status}


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
