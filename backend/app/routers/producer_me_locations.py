"""
Module:    producer_me_locations
Purpose:   The owner's branches and sale points under
           /producers/me/locations: list, add, edit, delete, set primary.
Does NOT:  Geocode or validate delivery areas (services/delivery_validation.py)
           or touch the profile fields (routers/producer_me.py).
Split out of producer_me.py (MEH-3266); the code is moved verbatim.
"""

from typing import Any
from uuid import UUID
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.limits import enforce_cap
from app.auth import require_producer
from app.database import get_db
from app.services.city_centroid import city_centroid  # MEH-2480
from app.rate_limit import limiter
from app.models import Producer, ProducerLocation, User
import logging
from app.schemas.schemas import (
    ProducerLocationCreate,
    ProducerLocationOwnerOut,
    ProducerLocationUpdate,
)
from app.routers.producer_me import (
    ONE_PRIMARY_REQUIRED_DETAIL,
    PRIMARY_MUST_BE_BRANCH_DETAIL,
    _fire_sensitive_edit,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/producers/me", tags=["producer-management"])


# ============================================================================
# MEH-1421 (MEH-1388 chunk 4a): producer_locations owner CRUD.
# Owner-scoped physical presence points (branch / pickup / market_stand),
# mirroring the products CRUD shape above (list/create/update/delete).
#
# IDOR: `require_producer` gates the ROLE (403 for a non-producer, auth.py:268);
# a location id that exists but belongs to ANOTHER producer raises 403 via
# `_get_owned_location` — the security.md ownership invariant. This
# INTENTIONALLY differs from the products 404-on-not-owned (producer_me.py:1108):
# the MEH-1421 AC + IDOR test require a 403. There is NO admin override — an
# admin has role != "producer" and is 403'd by require_producer upstream, so
# admin location management is out of 4a scope (admin surface = the read-only
# dedup signal, not mutation).
#
# Two cross-row invariants live here (not the schema — they need the session):
#   1. Single-primary: a producer has exactly one primary location while ≥1
#      exists. First create is forced primary; setting one primary clears the
#      others; deleting the primary promotes the oldest survivor.
#   2. Same-city label: a location whose city already exists for the producer
#      must carry a non-empty label (map tooltip disambiguation, epic rule).
# ============================================================================


def _get_owned_location(
    db: Session, producer_id: UUID, location_id: UUID
) -> ProducerLocation:
    # MEH-1421 IDOR: look up by id ALONE, then check ownership so a cross-owner
    # id is a 403 (not a 404). A genuinely missing id is a 404.
    # REUSES: .claude/rules/security.md — owner_id == current_user.id else 403.
    loc = db.query(ProducerLocation).filter(ProducerLocation.id == location_id).first()
    if loc is None:
        raise HTTPException(status_code=404, detail="מיקום לא נמצא")
    if loc.producer_id != producer_id:
        raise HTTPException(status_code=403, detail="אין הרשאה למיקום זה")
    return loc


SAME_CITY_NEEDS_LABEL_CODE = "location_same_city_needs_label"

# Transition-safety string ONLY. Any client that still reads a bare-string
# `detail` falls back to this; the rendered copy comes from messages/he.json
# keyed on the code above. Deliberately generic — it carries no label examples,
# because inventing one ("הדוכן בשוק") hands the owner a KIND name for a form
# that already has a kind selector, and duplicates the label field's own
# placeholder two centimetres away.
SAME_CITY_NEEDS_LABEL_MESSAGE = "כשיש שני מיקומים באותו יישוב יש להוסיף שם מזהה"


def _same_city_label_error_detail(
    city: str | None,
    existing_kind: str | None = None,
    existing_label: str | None = None,
    existing_count: int = 1,
) -> dict[str, object]:
    # MEH-1940: `{code, message, params}` rather than a Hebrew sentence.
    # REUSES: backend/app/auth.py:374-382 (_EMAIL_UNVERIFIED_DETAIL, MEH-1164) —
    # same shape, same reason: the client matches on a stable, locale-independent
    # `code` and renders its own copy, and `message` stays for transition safety.
    #
    # `params` describes the location she ALREADY has, so the frontend can name
    # it instead of inventing an example. NO Hebrew kind name is produced here:
    # `existing_kind` is the raw enum ("branch" / "pickup" / "market_stand") and
    # the translation lives in settings.locations.kind.* in he.json + en.json.
    return {
        "code": SAME_CITY_NEEDS_LABEL_CODE,
        "message": SAME_CITY_NEEDS_LABEL_MESSAGE,
        "params": {
            # The city the OWNER typed, not the stored row's: the compare is
            # case-insensitive, so the stored value can differ in case/spacing
            # from what she is looking at in the form.
            "city": city.strip() if city and city.strip() else None,
            "existing_kind": existing_kind,
            "existing_label": existing_label,
            "existing_count": existing_count,
        },
    }


def _fill_centroid_when_unpinned(db: Session, loc: ProducerLocation) -> None:
    """MEH-2480: a location saved with a town but no coordinates gets the
    town's seeded centre, stamped `approximate`.

    Before this, such a row was created with lat/lng NULL — invisible to the
    map, to "near me", and to `submission_gate._has_location`, so the owner
    saw «מיקום או אזורי משלוח» stay red with a saved location on screen. The
    only way through was the address search, which on 28/10/2026 was a 403 for
    everyone. Explicit coordinates (address search, manual entry) are never
    touched: the fill runs only when BOTH are missing. An unknown town leaves
    the row exactly as submitted.
    """
    if loc.lat is not None and loc.lng is not None:
        return
    centroid = city_centroid(db, loc.city)
    if centroid is None:
        return
    loc.lat, loc.lng = centroid
    loc.location_precision = "approximate"


def _reject_same_city_without_label(
    db: Session,
    producer_id: UUID,
    city: str | None,
    label: str | None,
    exclude_id: UUID | None = None,
) -> None:
    # MEH-1421: a 2nd location in a city the producer already uses MUST carry a
    # label so the map tooltip + dashboard can tell the points apart. Python-side
    # compare (a producer has few locations) keeps it DB-agnostic (sqlite tests
    # + Postgres prod).
    if not city or not city.strip():
        return
    if label and label.strip():
        return
    target = city.strip().lower()
    rows = (
        db.query(
            ProducerLocation.id,
            ProducerLocation.city,
            ProducerLocation.kind,
            ProducerLocation.label,
        )
        .filter(ProducerLocation.producer_id == producer_id)
        .all()
    )
    # MEH-1940: collect ALL colliding rows rather than raising on the first.
    # The message describes what she already has, and "2 מיקומים" versus naming
    # a single one is a different sentence — which needs the count, so the loop
    # can no longer short-circuit. The invariant is unchanged: a non-empty list
    # blocks, exactly as the first match did.
    clashes = [
        row
        for row in rows
        if (exclude_id is None or row.id != exclude_id)
        and row.city
        and row.city.strip().lower() == target
    ]
    if not clashes:
        return
    first = clashes[0]
    raise HTTPException(
        status_code=422,
        detail=_same_city_label_error_detail(
            city,
            existing_kind=first.kind,
            existing_label=first.label,
            existing_count=len(clashes),
        ),
    )


def _clear_other_primaries(db: Session, producer_id: UUID, keep_id: UUID) -> None:
    db.query(ProducerLocation).filter(
        ProducerLocation.producer_id == producer_id,
        ProducerLocation.id != keep_id,
    ).update({ProducerLocation.is_primary: False})


def _sync_producer_city_from_primary(db: Session, producer_id: UUID) -> None:
    """MEH-2141 (MEH-1938 batch B2) — write `Producer.city` through from the
    primary location, in the caller's open transaction.

    ## Why this exists

    Chunk 4 deleted the dashboard's "מיקום על המפה" card, which was the owner's
    only editor for `Producer.city`. The CI reviewer flagged the gap on that
    PR: an owner who moves her primary location to another town now has no way
    to correct the city that the listing filter, the free-text search, the
    `/producers/cities` aggregation, the admin search, `rank_in_city` and the
    two admin notification emails all read. Fourteen readers, and none of them
    has an equivalent in `producer_locations` — which is why the column stays
    and is written THROUGH rather than dropped.

    Interim derived, NOT Contract. Chunk 5 is what makes `city` fully derived,
    and it is blocked on the release card. Nothing here removes a column,
    changes a schema, or touches `lat`/`lng`.

    ## Two things it deliberately does NOT do

    **It never writes NULL.** If there is no primary row, or the primary row
    carries no city, the column keeps its last value. A NULL here is not a
    neutral "unknown" — it drops the business out of `?city=` filtering and
    out of the region picker, and it renders as a blank line in the admin
    emails. `ProducerLocation.city` is `str | None` (schemas.py:1090), so this
    is a reachable state, not a theoretical one.

    **It is not called on every mutation.** The callers below invoke it only
    when the operation changed WHICH row is primary, or changed the primary
    row's own city. That precision is what keeps admin authority intact —
    see the precedence note below.

    ## Precedence: admin wins, and nothing here contests it

    `admin.py` writes `Producer.city` directly (the create path's explicit
    `city=data.city`, and the PUT's `setattr` loop over `ProducerUpdate`).
    That write is NOT wrapped, NOT mirrored and NOT reverted by this function.
    The two paths coexist because they are triggered by different events: an
    admin edit sets the column and no owner location changed, so this function
    never runs; an owner moves her primary location and this function sets the
    column from that row. The one ordering that overwrites an admin value is
    an owner moving her primary AFTER the admin edit — which is the correct
    outcome, because at that point the owner's own primary location is the
    fresher statement of where the business is.

    # DO NOT call this from a non-primary mutation. Doing so would re-derive
    # the column on an edit that says nothing about it, and would silently
    # revert an admin's `city` the next time an owner edited an unrelated
    # pickup point's phone number.
    """
    # `SessionLocal` is built with autoflush=False (database.py:107), so a
    # promotion the caller has only assigned on the ORM instance
    # (`loc.is_primary = True`, `replacement.is_primary = True`) is NOT visible
    # to the query below until it is flushed. Without this line the query finds
    # NO primary at all — the previous one was demoted by a bulk UPDATE that
    # did hit the database, the new one is still pending in the session — and
    # the function returns early, leaving the city on the OLD location.
    #
    # That is not a hypothesis: the promote and delete-primary tests failed
    # exactly this way before this flush was added, and they are the two that
    # would have shipped the bug.
    #
    # Flushing here rather than at each call site keeps the helper correct
    # regardless of what the caller has or has not flushed. The caller still
    # owns the COMMIT.
    db.flush()

    primary = (
        db.query(ProducerLocation)
        .filter(
            ProducerLocation.producer_id == producer_id,
            ProducerLocation.is_primary.is_(True),
        )
        .order_by(ProducerLocation.created_at.asc())
        .first()
    )
    if primary is None:
        return
    if not primary.city or not primary.city.strip():
        return
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        return
    producer.city = primary.city.strip()


def _has_primary_location(db: Session, producer_id: UUID) -> bool:
    return (
        db.query(ProducerLocation.id)
        .filter(
            ProducerLocation.producer_id == producer_id,
            ProducerLocation.is_primary.is_(True),
        )
        .first()
        is not None
    )


def _snapshot_location_signal(db: Session, producer_id: UUID) -> dict[str, Any]:
    """MEH-2073 chunk 2 — read what the admin ping compares against, BEFORE the
    handler mutates anything.

    Same idiom as `_snapshot_sensitive` on the owner PUT: plain values, not ORM
    references, so the comparison survives the `db.commit()` that expires every
    instance in the session.

    Two entries, because the locations CRUD carries two admin-visible events
    that the PUT path never could:

    - `city` — since MEH-2141 (batch B2) `Producer.city` follows the primary
      location row, so the owner's real city editor is this CRUD and not the
      PUT. `city` left SENSITIVE_FIELDS with its PUT write path under MEH-1938
      chunk 5a ruling A; this is where the ping it used to fire now lives.
    - `has_primary` — deleting the LAST location is allowed and leaves the
      business approved with no primary row: no pin on the map and nothing to
      submit. Sapir's ruling (02/09 evening) makes that visible rather than
      blocked, which is exactly this card's notification-only posture.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        return {}
    return {
        "city": producer.city,
        "has_primary": _has_primary_location(db, producer_id),
    }


def _maybe_fire_location_signal(
    background_tasks: BackgroundTasks,
    db: Session,
    producer_id: UUID,
    before: dict[str, Any],
) -> None:
    """MEH-2073 chunk 2: one ping per request, AFTER the commit, listing the
    location-side changes that actually happened.

    Compares the persisted city rather than "did this request carry a city":
    LocationsEditor posts the whole row on every save, so a resubmitted
    identical city must not ping. Same distinction between signal and noise the
    chunk-1 no-op case pins down.

    `has_primary` is only ever reported in the true -> false direction. Gaining
    a primary is the normal course of registration and of adding a first
    location, and says nothing an admin needs to act on.

    Fail-open and notification-only, unchanged from chunk 1: the task is
    `_sensitive_edit_task`, which swallows and logs, so nothing here can turn
    a saved location into an error the owner cannot act on.
    """
    if not before:
        return
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        return
    changed: list[str] = []
    if before.get("city") != producer.city:
        changed.append("city")
    if before.get("has_primary") and not _has_primary_location(db, producer_id):
        changed.append("primary_location_removed")
    _fire_sensitive_edit(background_tasks, producer, changed)


@router.get("/locations", response_model=list[ProducerLocationOwnerOut])
def list_my_locations(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> list[ProducerLocationOwnerOut] | list[ProducerLocation]:
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == user.producer_id)
        .order_by(
            ProducerLocation.is_primary.desc(),
            ProducerLocation.created_at.asc(),
        )
        .all()
    )


@router.post("/locations", response_model=ProducerLocationOwnerOut, status_code=201)
@limiter.limit("60/hour")
def create_my_location(
    request: Request,
    data: ProducerLocationCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> ProducerLocationOwnerOut | ProducerLocation:
    # MEH-2073 chunk 2: snapshot before any mutation — adding a location that
    # becomes primary re-derives Producer.city, which is an identity change the
    # admin hears about when the business is already approved.
    signal_before = _snapshot_location_signal(db, user.producer_id)  # type: ignore[arg-type]
    _reject_same_city_without_label(db, user.producer_id, data.city, data.label)  # type: ignore[arg-type]
    existing_count = (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == user.producer_id)
        .count()
    )
    enforce_cap(existing_count, "locations")  # MEH-3022
    loc = ProducerLocation(producer_id=user.producer_id, **data.model_dump())
    _fill_centroid_when_unpinned(db, loc)

    # MEH-1938 follow-up (Sapir, 02/09) — branch-only primaries are enforced
    # HERE too, not only on the update path. A rule that the create path can
    # mint around is text in the code with a hole beside it, and this endpoint
    # is where the pickup-primary on staging actually came from: the seed was
    # not an outlier, it exercised behaviour the API had all along.
    #
    # The two cases are deliberately different, and must not be collapsed:
    #
    #   1. An EXPLICIT is_primary=true on a non-branch is refused. The schema
    #      defaults it to False (schemas.py:1202), so True here can only have
    #      come from the body — she asked for something the model forbids and
    #      is told so.
    #   2. A first location that happens to be a non-branch is CREATED, just
    #      not force-primary. Silent and correct: this is the delivery-only
    #      owner adding her only pickup point, and per MEH-213 she legitimately
    #      has no pin at all. Refusing her would block a valid business shape.
    if loc.is_primary and loc.kind != "branch":
        raise HTTPException(status_code=422, detail=PRIMARY_MUST_BE_BRANCH_DETAIL)

    # Single-primary: the first BRANCH is primary; an explicit is_primary=true
    # on a later one clears the existing primary. A producer whose only rows
    # are pickups / market stands therefore has no primary — see case 2 above.
    if existing_count == 0 and loc.kind == "branch":
        loc.is_primary = True  # type: ignore[assignment]
    db.add(loc)
    db.flush()  # assign loc.id before clearing siblings
    if loc.is_primary:
        _clear_other_primaries(db, user.producer_id, loc.id)  # type: ignore[arg-type]
        # MEH-2141: the primary changed (first location, or an explicit
        # is_primary=true that just demoted the previous one), so the city the
        # 14 readers see is re-derived from it. Gated on `is_primary` rather
        # than run unconditionally: adding a SECOND, non-primary pickup point
        # says nothing about where the business is.
        _sync_producer_city_from_primary(db, user.producer_id)  # type: ignore[arg-type]
    db.commit()
    db.refresh(loc)
    _maybe_fire_location_signal(background_tasks, db, user.producer_id, signal_before)  # type: ignore[arg-type]
    return loc


@router.put("/locations/{location_id}", response_model=ProducerLocationOwnerOut)
@limiter.limit("60/hour")
def update_my_location(  # noqa: PLR0913 — all 6 args are FastAPI-injected (slowapi request, path id, body, BackgroundTasks, auth dep, db dep); MEH-2073 chunk 2 added the notify hop
    # REUSES: backend/app/routers/producer_recipes.py:231 — same handler
    # shape, same waiver, same reason (a DI signature is not complexity).
    request: Request,
    location_id: UUID,
    data: ProducerLocationUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> ProducerLocationOwnerOut | ProducerLocation:
    # MEH-2073 chunk 2 — see create_my_location above. Both the promote path
    # and a city edit on the row that is already primary move Producer.city.
    signal_before = _snapshot_location_signal(db, user.producer_id)  # type: ignore[arg-type]
    loc = _get_owned_location(db, user.producer_id, location_id)  # type: ignore[arg-type]
    patch = data.model_dump(exclude_unset=True)
    # Same-city check ONLY when this update actually touches city or label —
    # otherwise a pure is_primary toggle would re-validate an already-valid row
    # and falsely 422 a label-less FIRST location whose city a labeled sibling
    # legitimately shares (adversarial-review-errors finding).
    if "city" in patch or "label" in patch:
        new_city = patch.get("city", loc.city)
        new_label = patch.get("label", loc.label)
        _reject_same_city_without_label(
            db,
            user.producer_id,  # type: ignore[arg-type]
            new_city,
            new_label,
            exclude_id=loc.id,  # type: ignore[arg-type]
        )

    want_primary = patch.pop("is_primary", None)
    for field, value in patch.items():
        setattr(loc, field, value)
    _fill_centroid_when_unpinned(db, loc)

    if want_primary is True:
        # MEH-1938 follow-up (Sapir, 02/09): promotion is BRANCH-ONLY, and this
        # is a NEW constraint rather than a description of what was here. A
        # primary answers "where is the business" — the navigation target and
        # the pin. `market_stand` is excluded along with `pickup` because the
        # repo already classifies both as the SECONDARY layer, hidden by the
        # /map toggle, in four identical call sites (MEH-1412:
        # producerPoints.js:28, MiniMap.jsx:70, MapComponent.jsx:375,
        # DeliveryBlock.jsx:468). A primary whose own marker disappears under a
        # layer toggle is a third answer to a question that must have one.
        if loc.kind != "branch":
            raise HTTPException(status_code=422, detail=PRIMARY_MUST_BE_BRANCH_DETAIL)
        _clear_other_primaries(db, user.producer_id, loc.id)  # type: ignore[arg-type]
        loc.is_primary = True  # type: ignore[assignment]
    elif want_primary is False and loc.is_primary:
        # Can't directly demote the sole primary (that would leave zero) — the
        # owner promotes another location instead (which clears this one).
        raise HTTPException(status_code=422, detail=ONE_PRIMARY_REQUIRED_DETAIL)

    # MEH-2141: re-derive `Producer.city` on exactly two events — this row was
    # just PROMOTED to primary (the primary's identity changed), or this row is
    # ALREADY primary and the patch carried a city (the primary's city changed).
    #
    # Read `loc.is_primary` AFTER the block above, not the pre-patch value: a
    # promotion sets it two lines up, and the demotion arm raises rather than
    # falling through. Every other edit — a phone on the primary, anything at
    # all on a non-primary row — leaves the column alone, which is what keeps
    # an admin-set city from being reverted by an unrelated owner edit.
    if want_primary is True or (loc.is_primary and "city" in patch):
        _sync_producer_city_from_primary(db, user.producer_id)  # type: ignore[arg-type]

    db.commit()
    db.refresh(loc)
    _maybe_fire_location_signal(background_tasks, db, user.producer_id, signal_before)  # type: ignore[arg-type]
    return loc


@router.delete("/locations/{location_id}", status_code=204)
@limiter.limit("60/hour")  # MEH-3022
def delete_my_location(
    request: Request,  # required by slowapi (MEH-3022)
    location_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> None:
    # MEH-2073 chunk 2: deleting the last remaining row is ALLOWED and leaves
    # the business approved with no primary location — no pin on the map, and
    # nothing to submit. Snapshot here so the post-commit check can see the
    # true -> false edge on `has_primary` (Sapir's ruling, 02/09 evening).
    signal_before = _snapshot_location_signal(db, user.producer_id)  # type: ignore[arg-type]
    loc = _get_owned_location(db, user.producer_id, location_id)  # type: ignore[arg-type]

    # MEH-1938 follow-up (Sapir, 02/09): the system does not guess which
    # location becomes primary — the OWNER chooses. This used to promote the
    # oldest surviving row automatically, with no kind filter, so deleting a
    # branch could silently make a pickup point the business's navigation
    # target. Industry precedent for refusing instead: Shopify will not let you
    # deactivate the default location (change the default first), and Google
    # Business does the same for the primary address.
    #
    # 422 and not 409, deliberately: this is the SAME invariant as the demote
    # arm above, seen from the other side, so it answers with the same status
    # and the same message key. Two codes for one violation would itself be a
    # third answer.
    if loc.is_primary:
        others_remain = (
            db.query(ProducerLocation.id)
            .filter(
                ProducerLocation.producer_id == user.producer_id,
                ProducerLocation.id != loc.id,
            )
            .first()
            is not None
        )
        if others_remain:
            raise HTTPException(status_code=422, detail=ONE_PRIMARY_REQUIRED_DETAIL)

    # Deleting the LAST remaining location is allowed and leaves no primary.
    # The business stays approved but is unpinned and cannot submit — STRICT
    # makes that visible rather than papering over it. `Producer.city` KEEPS
    # its last value rather than going NULL: the 17 readers depend on it, and
    # _sync_producer_city_from_primary declines on no-primary anyway, so it is
    # deliberately not called here.
    #
    # The admin ping for this event IS built — MEH-2073 chunk 2 landed on
    # staging while this branch was open, and its snapshot/fire pair now
    # brackets this handler. Note what the refusal above means for it: a
    # rejected delete promotes nothing and moves no city, so it must ping
    # nothing either. That is asserted, not assumed.
    db.delete(loc)
    db.commit()
    _maybe_fire_location_signal(background_tasks, db, user.producer_id, signal_before)  # type: ignore[arg-type]
