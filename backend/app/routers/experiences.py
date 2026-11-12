"""
Public + authenticated routes for the experiences (community workshops) feature.

  POST /experiences/validate   — real-time Claude check, no auth, no persistence
  GET  /experiences            — public: only approved + upcoming
  GET  /experiences/count      — public: how many the listing would return
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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, object_session

from app.auth import (
    get_current_user,
    get_current_user_optional,
    require_verified_producer,
)
from app.database import get_db
from app.services.producer_listing import is_business, is_business_row  # MEH-2459
from app.models import Experience, Producer, User
from app.rate_limit import limiter
from app.schemas.schemas import (
    EXPERIENCE_CATEGORIES,
    ExperienceCountOut,
    ExperienceCreate,
    ExperienceDetailOut,
    ExperienceListOut,
    ExperienceUpdate,
    ExperienceValidateRequest,
    ExperienceValidateResult,
)
from app.services import indexnow  # MEH-2852
from app.services.experience_moderation import validate_experience
from app.services.experience_notifications import (
    host_test_cause,
    notify_admin_new_submission,
)
from app.services.registrations import method_problem, registered_counts
from app.utils.clock import israel_today

router = APIRouter(prefix="/experiences", tags=["experiences"])


# ---------- Serialization ----------


def _compute_spots_left(ex: Experience, registered: int = 0) -> int | None:
    # MEH-2763: the host's own tally and the on-site sign-ups share the cap.
    if ex.max_participants is None:
        return None
    return max(0, ex.max_participants - (ex.participants_count or 0) - registered)


def _registered(ex: Experience) -> int:
    session = object_session(ex)
    if session is None:
        return 0
    return registered_counts(session, experience_ids=[ex.id]).get(ex.id, 0)


def _host_phone(db: Session, user_id) -> str | None:
    """The business phone a whatsapp / phone sign-up would reach."""
    user = db.get(User, user_id)
    producer = user.producer if user else None
    return producer.phone if producer else None


def _serialize_host(host: User | None) -> dict | None:
    """MEH-2476: the host + her business when that business is public
    (approved, kind='producer' — the same rule as is_business()). A pending
    business's page 404s for everyone else, so no link is built to it."""
    if host is None:
        return None
    out = {"id": host.id, "name": host.name}
    producer = host.producer
    if is_business_row(producer):  # MEH-2952: test rows too
        out.update(
            producer_id=producer.id,
            producer_slug=producer.slug,
            producer_name=producer.name,
            producer_phone=producer.phone,
        )
    return out


def _serialize_list(ex: Experience, registered: int | None = None) -> dict:
    """Public shape — no private fields (address, moderation context).
    `registered` (MEH-2763) comes from one grouped query on list routes; a
    single-row caller leaves it None and it is counted here."""
    if registered is None:
        registered = _registered(ex)
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
        "min_participants": ex.min_participants,
        "participants_count": ex.participants_count or 0,
        "registered_count": registered,
        "spots_left": _compute_spots_left(ex, registered),
        "registration_method": ex.registration_method or "site_form",
        "registration_url": ex.registration_url,
        "price_per_person": ex.price_per_person,
        "is_recurring": bool(ex.is_recurring),
        "recurring_schedule": ex.recurring_schedule,
        "status": ex.status,
        "host": _serialize_host(ex.host),
        "created_at": ex.created_at,
    }


def _serialize_detail(ex: Experience, registered: int | None = None) -> dict:
    """Detail shape — adds private + moderation fields. Only return
    this to the owner or to an admin."""
    return {
        **_serialize_list(ex, registered),
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
       recipes (``producer_recipes.py:335-345``) were already gated; group
       buys gained the same gate later (``group_buys._public_group_buys``,
       MEH-2484 — before it, only creation required an approved business).

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
        .options(joinedload(Experience.host).joinedload(User.producer))
        .join(User, Experience.host_user_id == User.id)
        .join(Producer, User.producer_id == Producer.id)
        .filter(
            Experience.status == "approved",
            is_business(),  # MEH-2459
        )
    )


def _public_listing_query(db: Session):
    """``_publicly_visible_query`` plus the two filters that define the public
    FEED specifically, as opposed to a directly-linked detail page.

    MEH-1918 extracted this. The two filters below used to sit inline in
    ``list_experiences``, which was fine while the listing was their only
    caller; the nav-visibility count is a second caller, and a count that
    disagrees with the list it advertises is worse than no count at all — the
    nav would promise a page that renders empty.

    Same reasoning, one level down, as the ``DO NOT re-express this predicate
    inline`` note on ``_publicly_visible_query`` above (MEH-1740): one
    definition, two callers.
    """
    return _publicly_visible_query(db).filter(
        # MEH-1883: Israel calendar day — same reasoning as events.py. A UTC
        # "today" drops an experience from the public feed at 21:00 the
        # evening before it happens.
        Experience.event_date >= israel_today(),
        # MEH-1419: a host-cancelled experience drops from the public feed
        # (mirrors events.py:73). It stays visible on GET /experiences/mine.
        Experience.is_active.is_(True),
    )


def _is_public(ex: Experience) -> bool:
    """MEH-2852: ``_publicly_visible_query`` as a predicate on one loaded row —
    the detail page a search engine indexes. ``is_active`` and the date are
    listing-only filters (see that docstring), so they are not part of it."""
    host = ex.host
    return ex.status == "approved" and indexnow.is_public_business(
        host.producer if host else None
    )


# ---------- Public listing ----------


@router.get("", response_model=list[ExperienceListOut])
@limiter.limit("120/minute")
def list_experiences(
    request: Request,
    # MEH-2847: several categories → OR. Repeated ?category=A&category=B, the
    # format /producers uses (MEH-1465); one value is a one-item list, so an
    # old single-value link behaves as before.
    category: list[str] | None = Query(None),
    city: str | None = None,
    # MEH-2602: the business page lists that business's own experiences.
    producer_id: UUID | None = None,
    db: Session = Depends(get_db),
):
    """Only approved + upcoming (event_date >= today), and only from an
    approved business (MEH-1749). Past experiences drop out of the public
    feed automatically."""
    q = _public_listing_query(db)
    if producer_id:
        q = q.filter(Producer.id == producer_id)
    # Blank values are dropped, so a bare ?category= still means "no filter".
    # Each value is checked against EXPERIENCE_CATEGORIES and kept once, which
    # also caps the IN list (MEH-2847). An unknown value is not refused — it
    # matches nothing, as before (an empty IN matches no row).
    given = [c for c in category or [] if c]
    if given:
        known = [c for c in dict.fromkeys(given) if c in EXPERIENCE_CATEGORIES]
        q = q.filter(Experience.category.in_(known))
    if city:
        q = q.filter(func.lower(Experience.city) == city.lower())
    rows = q.order_by(Experience.event_date.asc()).all()
    counts = registered_counts(db, experience_ids=[ex.id for ex in rows])
    return [_serialize_list(ex, counts.get(ex.id, 0)) for ex in rows]


# ---------- Public count (MEH-1918) ----------


# DO NOT move this below the `/{experience_id}` route — FastAPI matches in
# declaration order, so a later `/count` would be swallowed by the catch-all
# and arrive as an experience_id of "count", which then fails UUID parsing.
@router.get("/count", response_model=ExperienceCountOut)
@limiter.limit("60/minute")
def count_experiences(request: Request, db: Session = Depends(get_db)):
    """How many experiences the public feed would show right now.

    Exists so the nav can gate the "חוויות" link on real supply instead of
    linking to a page that may be empty. Public, unauthenticated, and it
    returns a number only — no titles, no ids, nothing that could leak a
    non-public row.

    It counts through ``_public_listing_query``, the SAME query
    ``list_experiences`` returns rows from, so the two can never disagree. A
    ``COUNT`` at the database, not ``len()`` over fetched rows: the caller
    wants a number and the rows would be discarded.
    """
    return ExperienceCountOut(count=_public_listing_query(db).count())


# ---------- Owner's submissions ----------


@router.get("/mine", response_model=list[ExperienceDetailOut])
def list_my_experiences(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Experience)
        .options(joinedload(Experience.host).joinedload(User.producer))
        .filter(Experience.host_user_id == user.id)
        .order_by(Experience.created_at.desc())
        .all()
    )
    # Owner sees the full detail shape for their own submissions.
    counts = registered_counts(db, experience_ids=[ex.id for ex in rows])
    return [_serialize_detail(ex, counts.get(ex.id, 0)) for ex in rows]


# ---------- Detail ----------


@router.get("/{experience_id}", response_model=ExperienceDetailOut)
@limiter.limit("120/minute")
def get_experience(
    request: Request,
    experience_id: UUID,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    ex = (
        db.query(Experience)
        .options(joinedload(Experience.host).joinedload(User.producer))
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
    # MEH-2246: producer role + verified email, the same gate as POST /events
    # (events.py). Since MEH-1749 only an approved business's experience ever
    # reaches the public read paths, so a consumer submission could only ever
    # sit in the admin queue — the gate moves to the write side to match.
    user: User = Depends(require_verified_producer),
    db: Session = Depends(get_db),
):
    """
    Submit a new experience. Flow:
      1. Normalize + hand off to Claude via validate_experience
      2. REJECTED → HTTP 400 (blocked, nothing persisted)
      3. APPROVED / FLAGGED → persist as status=pending, admin will review
      4. moderation_status is stored so admins see Claude's signal
    """
    if _min_above_max(data.min_participants, data.max_participants):
        raise HTTPException(status_code=422, detail=_MIN_ABOVE_MAX_DETAIL)
    # MEH-2763: the method's prerequisite (mobile / phone / URL).
    problem = method_problem(
        data.registration_method,
        phone=_host_phone(db, user.id),
        registration_url=data.registration_url,
    )
    if problem:
        raise HTTPException(status_code=422, detail=problem)

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
        min_participants=data.min_participants,
        participants_count=0,
        price_per_person=data.price_per_person,
        requirements=data.requirements,
        is_recurring=data.is_recurring,
        recurring_schedule=data.recurring_schedule,
        registration_method=data.registration_method,
        registration_url=data.registration_url,
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
        .options(joinedload(Experience.host).joinedload(User.producer))
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
        test_cause=host_test_cause(ex.host),  # MEH-2952
    )

    return _serialize_detail(ex)


# ---------- Update ----------

# MEH-2665: min_participants is a number the host sets, like the count — it
# must not send an approved experience back to moderation.
# MEH-2763: how visitors sign up is bookkeeping too; registration_url is NOT
# here — a new outbound link is content and goes back through moderation.
_NON_CONTENT_FIELDS = frozenset(
    {"is_active", "participants_count", "min_participants", "registration_method"}
)

# MEH-2665: the form blocks it first; this is the write-boundary twin.
_MIN_ABOVE_MAX_DETAIL = "המינימום לא יכול להיות גדול מהמקסימום"


def _min_above_max(min_p: int | None, max_p: int | None) -> bool:
    return min_p is not None and max_p is not None and min_p > max_p


def _check_method_edit(db: Session, ex: Experience, payload: dict) -> None:
    """MEH-2763: validate «איך נרשמים?» on an edit — only when the edit
    touches the method or its URL, so a stored pair that no longer holds
    (the business phone changed since) never blocks an unrelated edit.
    Mutates `payload`: an explicit null method means "unchanged"."""
    if "registration_method" in payload and payload["registration_method"] is None:
        payload.pop("registration_method")  # NOT NULL column
    # A form re-sends both fields on every save; a value equal to the stored
    # one is not a change (every legacy experience was backfilled to whatsapp).
    if (
        payload.get("registration_method", ex.registration_method)
        == ex.registration_method
        and payload.get("registration_url", ex.registration_url) == ex.registration_url
    ):
        return
    problem = method_problem(
        payload.get("registration_method") or ex.registration_method,
        phone=_host_phone(db, ex.host_user_id),
        registration_url=payload.get("registration_url", ex.registration_url),
    )
    if problem:
        raise HTTPException(status_code=422, detail=problem)


@router.put("/{experience_id}", response_model=ExperienceDetailOut)
def update_experience(
    experience_id: UUID,
    data: ExperienceUpdate,
    background_tasks: BackgroundTasks,
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

    # MEH-2852: read BEFORE the edit — a content edit resets an approved
    # experience to pending, which takes its public page down.
    was_public = _is_public(ex)
    payload = data.model_dump(exclude_unset=True)
    # Only an edit that touches min or max is checked, so a stored pair that
    # is somehow already inverted never blocks an unrelated edit.
    touches_range = "min_participants" in payload or "max_participants" in payload
    new_min = payload.get("min_participants", ex.min_participants)
    new_max = payload.get("max_participants", ex.max_participants)
    if touches_range and _min_above_max(new_min, new_max):
        raise HTTPException(status_code=422, detail=_MIN_ABOVE_MAX_DETAIL)
    _check_method_edit(db, ex, payload)
    for field, value in payload.items():
        setattr(ex, field, value)

    # MEH-2663: the sign-up tally is a counter, never NULL, and never above
    # the cap — the dashboard clamps, and a direct PUT is clamped the same way.
    if "participants_count" in payload or "max_participants" in payload:
        if ex.participants_count is None:
            ex.participants_count = 0
        if (
            ex.max_participants is not None
            and ex.participants_count > ex.max_participants
        ):
            ex.participants_count = ex.max_participants

    # MEH-1419: a pure cancel/reactivate toggle (is_active only) must NOT
    # re-trigger moderation or reset the experience to `pending` —
    # cancelling is a reversible host action, not a content edit, so a
    # reactivated approved experience returns to the public feed immediately.
    # This intentionally holds for ALL statuses, not just `approved`: a bare
    # is_active flip on a changes_requested/rejected row has no public effect
    # (those never reach the feed) and still must not re-run Claude. Events
    # have no moderation, so their toggle is a plain PUT (events.py:238); the
    # experience toggle needs this guard because content edits below reset.
    # MEH-2663: participants_count is the host's own sign-up tally (sign-up
    # is on WhatsApp) — bookkeeping like is_active, not content to moderate.
    content_changed = any(field not in _NON_CONTENT_FIELDS for field in payload)

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
                "registration_url": ex.registration_url,
            }
        )
        ex.moderation_status = verdict["status"]
        ex.moderation_reason = verdict.get("reason")
        ex.moderation_suggestion = verdict.get("suggestion")

    db.commit()
    db.refresh(ex)

    ex = (
        db.query(Experience)
        .options(joinedload(Experience.host).joinedload(User.producer))
        .filter(Experience.id == ex.id)
        .first()
    )
    # MEH-2852: the public page changed (cancel/reactivate, a tally) or went
    # away (content edit → pending). A never-public draft is not announced.
    if was_public or _is_public(ex):
        indexnow.schedule(background_tasks, indexnow.experience_urls(ex.id))
    return _serialize_detail(ex)


# ---------- Delete ----------


@router.delete("/{experience_id}")
def delete_experience(
    experience_id: UUID,
    background_tasks: BackgroundTasks,
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
    # MEH-2852: only a page that was public has anything to take down.
    removed_urls = indexnow.experience_urls(ex.id) if _is_public(ex) else []
    db.delete(ex)
    db.commit()
    indexnow.schedule(background_tasks, removed_urls)
    return {"detail": "Experience deleted"}
