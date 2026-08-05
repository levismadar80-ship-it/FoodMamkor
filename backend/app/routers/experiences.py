"""
Public + authenticated routes for the experiences (community workshops) feature.

  POST /experiences/validate   — real-time Claude check, no auth, no persistence
  GET  /experiences            — public: only approved + upcoming
  GET  /experiences/mine       — current user's submissions (any status)
  GET  /experiences/{id}       — detail: approved public; owner+admin see any status
  POST /experiences            — submit → Claude pre-mod → pending (or HTTP 400)
  PUT  /experiences/{id}       — owner-only edit, resets status to pending
  DELETE /experiences/{id}     — owner or admin

See docs/MODERATION.md for the shared moderation pattern. Experiences
differ from home_products in that they ALWAYS require admin approval
after the Claude verdict — the admin_experiences router handles that side.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, get_current_user_optional, require_verified_email
from app.database import get_db
from app.models import Experience, Producer, User
from app.rate_limit import limiter
from app.schemas.schemas import (
    ExperienceCreate,
    ExperienceDetailOut,
    ExperienceListOut,
    ExperienceUpdate,
    ExperienceValidateRequest,
    ExperienceValidateResult,
)
from app.services.experience_moderation import validate_experience
from app.services.experience_notifications import notify_admin_new_submission
from app.utils.clock import israel_today

router = APIRouter(prefix="/experiences", tags=["experiences"])


# ---------- Serialization ----------


def _compute_spots_left(ex: Experience) -> int | None:
    if ex.max_participants is None:
        return None
    return max(0, ex.max_participants - (ex.participants_count or 0))


def _serialize_list(ex: Experience) -> dict:
    """Public shape — no private fields (address, moderation context)."""
    return {
        "id": ex.id,
        "title": ex.title,
        "description": ex.description,
        "image_url": ex.image_url,
        "category": ex.category,
        "event_date": ex.event_date,
        "event_time": ex.event_time,
        "duration_minutes": ex.duration_minutes,
        "location_type": ex.location_type,
        "city": ex.city,
        "max_participants": ex.max_participants,
        "participants_count": ex.participants_count or 0,
        "spots_left": _compute_spots_left(ex),
        "price_per_person": ex.price_per_person,
        "is_recurring": bool(ex.is_recurring),
        "recurring_schedule": ex.recurring_schedule,
        "status": ex.status,
        "host": ({"id": ex.host.id, "name": ex.host.name} if ex.host else None),
        "created_at": ex.created_at,
    }


def _serialize_detail(ex: Experience) -> dict:
    """Detail shape — adds private + moderation fields. Only return
    this to the owner or to an admin."""
    return {
        **_serialize_list(ex),
        "address": ex.address,
        "requirements": ex.requirements,
        "lat": ex.lat,
        "lng": ex.lng,
        "is_active": bool(ex.is_active),  # MEH-1419
        "moderation_status": ex.moderation_status,
        "moderation_reason": ex.moderation_reason,
        "moderation_suggestion": ex.moderation_suggestion,
        "admin_feedback": ex.admin_feedback,
        "rejection_reason": ex.rejection_reason,
    }


# ---------- Real-time validate (no auth, no persistence) ----------


@router.post("/validate", response_model=ExperienceValidateResult)
@limiter.limit("30/hour")
def validate_endpoint(
    request: Request,  # required by slowapi per app/rate_limit.py
    data: ExperienceValidateRequest,
):
    """
    Hot-path moderation check used by the submission form while the
    user is still typing. No DB write, no auth — callers are rate-
    limited to 30/hour per IP to cap Anthropic spend.
    """
    result = validate_experience(data.model_dump(mode="json"))
    return ExperienceValidateResult(**result)


# ---------- Public visibility gate (MEH-1749) ----------


def _publicly_visible_query(db: Session):
    """The ONE definition of "this experience is public". Both public read
    paths build on it — the listing below and the detail route's stranger
    branch.

    Two conditions, and the second is what MEH-1749 added:

    1. ``Experience.status == "approved"`` — admin moderation passed.
    2. **The host's business is approved.** LOCK (בעלי עסק מורשים בלבד):
       content reaches the public only from an approved business. Experiences
       were the only surface without this — events (``events.py:167``),
       recipes (``producer_recipes.py:335-345``) and group buys
       (``group_buys.py:252``) were already gated.

    The walk is two hops because an Experience is keyed on a **User**, not a
    Producer: ``Experience.host_user_id`` (``models.py:1051``) →
    ``User.producer`` (``models.py:451``) → ``Producer.status``. Both joins are
    INNER, so a host with no business at all (``producer_id IS NULL``) is
    excluded by the join itself rather than by a second condition.

    DO NOT re-express this predicate inline in a route — MEH-1740 is the
    precedent: the click route grew its own copy of the BOLA gate, the copy
    drifted, and the surface leaked. One definition, two callers.

    Deliberately NOT included here, because both are route-specific and
    predate this gate:
      * ``event_date >= today`` — the listing hides past experiences; the
        detail route still serves them by direct link.
      * ``is_active`` — MEH-1419 drops host-cancelled ones from the feed only.
    """
    return (
        db.query(Experience)
        .options(joinedload(Experience.host))
        .join(User, Experience.host_user_id == User.id)
        .join(Producer, User.producer_id == Producer.id)
        .filter(
            Experience.status == "approved",
            Producer.status == "approved",
        )
    )


# ---------- Public listing ----------


@router.get("", response_model=list[ExperienceListOut])
def list_experiences(
    category: str | None = None,
    city: str | None = None,
    db: Session = Depends(get_db),
):
    """Only approved + upcoming (event_date >= today), and only from an
    approved business (MEH-1749). Past experiences drop out of the public
    feed automatically."""
    q = _publicly_visible_query(db).filter(
        # MEH-1883: Israel calendar day — same reasoning as events.py. A UTC
        # "today" drops an experience from the public feed at 21:00 the
        # evening before it happens.
        Experience.event_date >= israel_today(),
        # MEH-1419: a host-cancelled experience drops from the public feed
        # (mirrors events.py:73). It stays visible on GET /experiences/mine.
        Experience.is_active.is_(True),
    )
    if category:
        q = q.filter(Experience.category == category)
    if city:
        q = q.filter(func.lower(Experience.city) == city.lower())
    rows = q.order_by(Experience.event_date.asc()).all()
    return [_serialize_list(ex) for ex in rows]


# ---------- Owner's submissions ----------


@router.get("/mine", response_model=list[ExperienceDetailOut])
def list_my_experiences(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Experience)
        .options(joinedload(Experience.host))
        .filter(Experience.host_user_id == user.id)
        .order_by(Experience.created_at.desc())
        .all()
    )
    # Owner sees the full detail shape for their own submissions.
    return [_serialize_detail(ex) for ex in rows]


# ---------- Detail ----------


@router.get("/{experience_id}", response_model=ExperienceDetailOut)
def get_experience(
    experience_id: UUID,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    ex = (
        db.query(Experience)
        .options(joinedload(Experience.host))
        .filter(Experience.id == experience_id)
        .first()
    )
    if not ex:
        raise HTTPException(status_code=404, detail="Experience not found")

    is_owner = user and user.id == ex.host_user_id
    is_admin = user and user.role == "admin"

    # Non-approved experiences are invisible to strangers — use 404, not
    # 403, so we don't leak existence of pending submissions.
    #
    # MEH-1749: the same 404 now also covers "the host's business is not
    # approved". The check reuses _publicly_visible_query rather than
    # re-testing ex.host.producer inline, so there is exactly one definition
    # of public visibility (see that helper on why — MEH-1740).
    #
    # This closes the SEO/metadata path too, without a frontend change:
    # experiences/[id]/page.js:14 server-fetches THIS endpoint inside
    # generateMetadata with no auth, and already falls back on a non-ok
    # response — so gating here keeps a pending business's title out of <head>.
    if not (is_owner or is_admin):
        visible = (
            _publicly_visible_query(db).filter(Experience.id == experience_id).first()
        )
        if visible is None:
            raise HTTPException(status_code=404, detail="Experience not found")

    payload = _serialize_detail(ex)

    # Privacy: strangers (on an approved experience) don't see the
    # full street address or the moderation context. Only show those
    # to owner/admin.
    if not (is_owner or is_admin):
        payload["address"] = None
        payload["moderation_status"] = None
        payload["moderation_reason"] = None
        payload["moderation_suggestion"] = None
        payload["admin_feedback"] = None
        payload["rejection_reason"] = None
        # MEH-1417: for a HOME experience the address is a host's
        # residence, so the coords must go too — MEH-1404's MiniMap
        # draws a precise pin from lat/lng and would otherwise leak
        # the exact location the address-hiding above protects.
        # `public` venues keep their pin (the location is the point).
        if ex.location_type == "home":
            payload["lat"] = None
            payload["lng"] = None
    return payload


# ---------- Create ----------


@router.post("", response_model=ExperienceDetailOut, status_code=201)
@limiter.limit("10/hour")
def submit_experience(
    request: Request,  # required by slowapi
    data: ExperienceCreate,
    user: User = Depends(require_verified_email),
    db: Session = Depends(get_db),
):
    """
    Submit a new experience. Flow:
      1. Normalize + hand off to Claude via validate_experience
      2. REJECTED → HTTP 400 (blocked, nothing persisted)
      3. APPROVED / FLAGGED → persist as status=pending, admin will review
      4. moderation_status is stored so admins see Claude's signal
    """
    verdict = validate_experience(data.model_dump(mode="json"))
    if verdict["status"] == "REJECTED":
        raise HTTPException(
            status_code=400,
            detail={
                "error": "experience_rejected",
                "reason": verdict.get("reason") or "התוכן לא מתאים לפלטפורמה",
            },
        )

    ex = Experience(
        title=data.title.strip(),
        description=data.description.strip(),
        image_url=data.image_url,
        category=data.category,
        host_user_id=user.id,
        event_date=data.event_date,
        event_time=data.event_time,
        duration_minutes=data.duration_minutes,
        location_type=data.location_type,
        city=data.city,
        address=data.address,
        lat=data.lat,
        lng=data.lng,
        max_participants=data.max_participants,
        participants_count=0,
        price_per_person=data.price_per_person,
        requirements=data.requirements,
        is_recurring=data.is_recurring,
        recurring_schedule=data.recurring_schedule,
        status="pending",
        moderation_status=verdict["status"],
        moderation_reason=verdict.get("reason"),
        moderation_suggestion=verdict.get("suggestion"),
    )
    db.add(ex)
    db.commit()
    db.refresh(ex)

    # Reload with host relation so _serialize_detail can fill it in.
    ex = (
        db.query(Experience)
        .options(joinedload(Experience.host))
        .filter(Experience.id == ex.id)
        .first()
    )

    # Best-effort admin email. Never blocks the submission — the service
    # fails open on missing RESEND_API_KEY / send errors.
    notify_admin_new_submission(
        title=ex.title,
        host_name=user.name,
        city=ex.city,
        moderation_status=verdict["status"],
    )

    return _serialize_detail(ex)


# ---------- Update ----------


@router.put("/{experience_id}", response_model=ExperienceDetailOut)
def update_experience(
    experience_id: UUID,
    data: ExperienceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ex = db.query(Experience).filter(Experience.id == experience_id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Experience not found")
    if ex.host_user_id != user.id:
        # MEH-1001: 404 (not 403) on cross-owner access so a stranger can't
        # confirm another host's experience exists. Stays owner-only.
        # REUSES events.py update_event (producer_recipes.py:203-206).
        raise HTTPException(status_code=404, detail="Experience not found")

    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(ex, field, value)

    # MEH-1419: a pure cancel/reactivate toggle (is_active only) must NOT
    # re-trigger moderation or reset the experience to `pending` —
    # cancelling is a reversible host action, not a content edit, so a
    # reactivated approved experience returns to the public feed immediately.
    # This intentionally holds for ALL statuses, not just `approved`: a bare
    # is_active flip on a changes_requested/rejected row has no public effect
    # (those never reach the feed) and still must not re-run Claude. Events
    # have no moderation, so their toggle is a plain PUT (events.py:238); the
    # experience toggle needs this guard because content edits below reset.
    content_changed = any(field != "is_active" for field in payload)

    # Any content edit after a negative moderation verdict sends the
    # experience back to `pending` and clears the admin-written feedback so
    # the admin queue shows a fresh card. Claude re-runs on the new content.
    if content_changed and ex.status in ("changes_requested", "rejected", "approved"):
        ex.status = "pending"
        ex.admin_feedback = None
        ex.rejection_reason = None
        verdict = validate_experience(
            {
                "title": ex.title,
                "description": ex.description,
                "category": ex.category,
                "city": ex.city,
                "location_type": ex.location_type,
                "price_per_person": (
                    str(ex.price_per_person) if ex.price_per_person else None
                ),
                "max_participants": ex.max_participants,
            }
        )
        ex.moderation_status = verdict["status"]
        ex.moderation_reason = verdict.get("reason")
        ex.moderation_suggestion = verdict.get("suggestion")

    db.commit()
    db.refresh(ex)

    ex = (
        db.query(Experience)
        .options(joinedload(Experience.host))
        .filter(Experience.id == ex.id)
        .first()
    )
    return _serialize_detail(ex)


# ---------- Delete ----------


@router.delete("/{experience_id}")
def delete_experience(
    experience_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ex = db.query(Experience).filter(Experience.id == experience_id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Experience not found")
    is_owner = ex.host_user_id == user.id
    is_admin = getattr(user, "role", None) == "admin"
    # MEH-1001: a stranger (non-owner, non-admin) gets 404 (not 403) so the
    # experience's existence isn't leaked. Admin-override preserved above.
    if not (is_owner or is_admin):
        raise HTTPException(status_code=404, detail="Experience not found")
    db.delete(ex)
    db.commit()
    return {"detail": "Experience deleted"}
