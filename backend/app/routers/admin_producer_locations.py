# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3333 PR)
"""
Module:   admin_producer_locations
Purpose:  Admin CRUD for one business's locations (branch / pickup /
          market_stand) under /admin/producers/{producer_id}/locations, so an
          admin who builds a page on the owner's behalf can add pickup points
          that show as map pins and in the pickup filter.
Touches:  producer_locations, producers.city (through the primary-row sync).
Does NOT: Hold the invariants. Same-city label, branch-only primary, single
          primary and the city sync live in routers/producer_me_locations.py
          and are imported from there, so the owner and the admin can never
          disagree about what a valid location is. Does not fire the
          "sensitive edit" admin ping — the actor IS the admin.
Related:  routers/producer_me_locations.py:136 (_reject_same_city_without_label),
          :186 (_clear_other_primaries), :193 (_sync_producer_city_from_primary),
          :110 (_fill_centroid_when_unpinned).
History:  MEH-3333 (creation).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.limits import enforce_cap
from app.models import Producer, ProducerLocation, User
from app.rate_limit import limiter
from app.routers.producer_me import (
    ONE_PRIMARY_REQUIRED_DETAIL,
    PRIMARY_MUST_BE_BRANCH_DETAIL,
)

# REUSES: backend/app/routers/producer_me_locations.py — the owner CRUD's
# invariant helpers, imported rather than copied (one owner of each rule).
from app.routers.producer_me_locations import (
    _clear_other_primaries,
    _fill_centroid_when_unpinned,
    _reject_same_city_without_label,
    _sync_producer_city_from_primary,
)
from app.schemas.schemas import (
    ProducerLocationCreate,
    ProducerLocationOwnerOut,
    ProducerLocationUpdate,
)

router = APIRouter(prefix="/admin/producers", tags=["admin-producer-locations"])


def _get_producer(db: Session, producer_id: UUID) -> Producer:
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return producer


def _get_location_of(db: Session, producer_id: UUID, location_id: UUID) -> ProducerLocation:
    # MEH-3333 IDOR: the location must belong to the business in the PATH. A
    # location of another business answers 404 — the pair (producer, location)
    # does not exist — so a mistyped id can never edit the wrong business.
    loc = (
        db.query(ProducerLocation)
        .filter(
            ProducerLocation.id == location_id,
            ProducerLocation.producer_id == producer_id,
        )
        .first()
    )
    if loc is None:
        raise HTTPException(status_code=404, detail="מיקום לא נמצא")
    return loc


@router.get(
    "/{producer_id}/locations", response_model=list[ProducerLocationOwnerOut]
)
def admin_list_locations(
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[ProducerLocation]:
    _get_producer(db, producer_id)
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .order_by(
            ProducerLocation.is_primary.desc(),
            ProducerLocation.created_at.asc(),
        )
        .all()
    )


@router.post(
    "/{producer_id}/locations",
    response_model=ProducerLocationOwnerOut,
    status_code=201,
)
@limiter.limit("120/hour")
def admin_create_location(
    request: Request,
    producer_id: UUID,
    data: ProducerLocationCreate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProducerLocation:
    # REUSES: producer_me_locations.py create_my_location — same order of
    # checks, same 422 details, same first-branch-is-primary rule.
    _get_producer(db, producer_id)
    _reject_same_city_without_label(db, producer_id, data.city, data.label)
    existing_count = (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .count()
    )
    enforce_cap(existing_count, "locations")  # MEH-3022
    loc = ProducerLocation(producer_id=producer_id, **data.model_dump())
    _fill_centroid_when_unpinned(db, loc)
    if loc.is_primary and loc.kind != "branch":
        raise HTTPException(status_code=422, detail=PRIMARY_MUST_BE_BRANCH_DETAIL)
    if existing_count == 0 and loc.kind == "branch":
        loc.is_primary = True  # type: ignore[assignment]
    db.add(loc)
    db.flush()
    if loc.is_primary:
        _clear_other_primaries(db, producer_id, loc.id)  # type: ignore[arg-type]
        _sync_producer_city_from_primary(db, producer_id)
    db.commit()
    db.refresh(loc)
    return loc


@router.put(
    "/{producer_id}/locations/{location_id}",
    response_model=ProducerLocationOwnerOut,
)
@limiter.limit("120/hour")
def admin_update_location(  # noqa: PLR0913 — all 6 args are FastAPI-injected (slowapi request, two path ids, body, auth dep, db dep)
    # REUSES: backend/app/routers/producer_me_locations.py:440 — same waiver, same reason.
    request: Request,
    producer_id: UUID,
    location_id: UUID,
    data: ProducerLocationUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProducerLocation:
    # REUSES: producer_me_locations.py update_my_location.
    loc = _get_location_of(db, producer_id, location_id)
    patch = data.model_dump(exclude_unset=True)
    if "city" in patch or "label" in patch:
        _reject_same_city_without_label(
            db,
            producer_id,
            patch.get("city", loc.city),
            patch.get("label", loc.label),
            exclude_id=loc.id,  # type: ignore[arg-type]
        )
    want_primary = patch.pop("is_primary", None)
    for field, value in patch.items():
        setattr(loc, field, value)
    _fill_centroid_when_unpinned(db, loc)
    if want_primary is True:
        if loc.kind != "branch":
            raise HTTPException(status_code=422, detail=PRIMARY_MUST_BE_BRANCH_DETAIL)
        _clear_other_primaries(db, producer_id, loc.id)  # type: ignore[arg-type]
        loc.is_primary = True  # type: ignore[assignment]
    elif want_primary is False and loc.is_primary:
        raise HTTPException(status_code=422, detail=ONE_PRIMARY_REQUIRED_DETAIL)
    if loc.is_primary and loc.kind != "branch":
        # A kind edit on the primary row would mint a non-branch primary the
        # create/promote paths refuse.
        raise HTTPException(status_code=422, detail=PRIMARY_MUST_BE_BRANCH_DETAIL)
    if want_primary is True or (loc.is_primary and "city" in patch):
        _sync_producer_city_from_primary(db, producer_id)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/{producer_id}/locations/{location_id}", status_code=204)
@limiter.limit("120/hour")
def admin_delete_location(
    request: Request,
    producer_id: UUID,
    location_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    # REUSES: producer_me_locations.py delete_my_location — the primary can
    # only go when it is the last row; otherwise promote another first.
    loc = _get_location_of(db, producer_id, location_id)
    if loc.is_primary:
        others_remain = (
            db.query(ProducerLocation.id)
            .filter(
                ProducerLocation.producer_id == producer_id,
                ProducerLocation.id != loc.id,
            )
            .first()
            is not None
        )
        if others_remain:
            raise HTTPException(status_code=422, detail=ONE_PRIMARY_REQUIRED_DETAIL)
    db.delete(loc)
    db.commit()
