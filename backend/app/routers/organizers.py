"""
Module:   organizers
Purpose:  The public face of a markets / events organizer (kind='organizer',
          ADR-036): its page (/organizers/{slug}) and the slug list the
          sitemap reads. An organizer is never a business, so nothing here
          goes through the business routes or is_business().
Touches:  producers (read), events (read).
Does NOT: list organizers as businesses (producer_listing.is_business() keeps
          them out of every business surface), write anything, or expose
          the street address (owner/admin only, MEH-829 precedent).
Related:  backend/app/routers/events.py (_serialize — the EventOut shape the
          page's event list reuses), backend/app/routers/producers.py
          (by-slug — the business twin this deliberately does not share).
History:  MEH-2461 (creation).
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Event, Producer
from app.rate_limit import limiter
from app.routers.events import _serialize as serialize_event
from app.schemas.schemas import OrganizerPublicOut, OrganizerSlugOut
from app.utils.clock import israel_today

router = APIRouter(tags=["organizers"])

# REUSES: backend/app/routers/producers.py:91 — same edge policy as the public
# catalog: an approved organizer page is public, static-ish content.
_PUBLIC_CACHE = "public, s-maxage=30, stale-while-revalidate=30"


def _public_organizer_query(db: Session):
    """The one rule for "this organizer is public": approved AND
    kind='organizer'. The mirror image of is_business()."""
    return db.query(Producer).filter(
        Producer.status == "approved", Producer.kind == "organizer"
    )


@router.get("/organizers", response_model=list[OrganizerSlugOut])
@limiter.limit("60/minute")
def list_organizer_slugs(
    request: Request, response: Response, db: Session = Depends(get_db)
):
    """Slugs of every public organizer — the sitemap's source for
    /organizers/{slug} (MEH-2461: organizer pages are public, so they are
    listed; never under /producers)."""
    response.headers["Cache-Control"] = _PUBLIC_CACHE
    rows = (
        _public_organizer_query(db)
        .filter(Producer.slug.isnot(None))
        .order_by(Producer.name)
        .all()
    )
    return [OrganizerSlugOut(slug=p.slug, name=p.name) for p in rows]


@router.get("/organizers/{slug}", response_model=OrganizerPublicOut)
@limiter.limit("60/minute")
def get_organizer(
    slug: str, request: Request, response: Response, db: Session = Depends(get_db)
):
    """An approved organizer's page: profile + its upcoming events.

    404 for a business slug, a pending organizer and an unknown slug alike —
    the business has its own page, and a pending row is not consented-to-public
    (MEH-254). Upcoming = active and dated today-or-later in Israel, soonest
    first; past events are not listed."""
    organizer = _public_organizer_query(db).filter(Producer.slug == slug).first()
    if organizer is None:
        raise HTTPException(status_code=404, detail="מארגן לא נמצא")
    events = (
        db.query(Event)
        .options(joinedload(Event.producer))
        .filter(
            Event.producer_id == organizer.id,
            Event.is_active.is_(True),
            Event.event_date >= israel_today(),
        )
        .order_by(Event.event_date.asc(), Event.event_time.asc())
        .all()
    )
    response.headers["Cache-Control"] = _PUBLIC_CACHE
    return OrganizerPublicOut(
        id=organizer.id,
        name=organizer.name,
        slug=organizer.slug,
        description=organizer.description,
        short_description=organizer.short_description,
        city=organizer.city,
        images=organizer.images or [],
        phone=organizer.phone,
        instagram=organizer.instagram,
        website=organizer.website,
        facebook=organizer.facebook,
        upcoming_events=[serialize_event(ev) for ev in events],
    )
