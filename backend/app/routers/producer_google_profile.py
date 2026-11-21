"""
Module:   producer_google_profile
Purpose:  The owner's «הפרופיל שלכם בגוגל» tool (MEH-3641): see whether her
          business is linked to its Google profile, search for it, link or
          unlink it, and check that Google shows the same name, phone and
          website as her page here.
Touches:  producers.google_place_id (the only Google datum stored);
          Google Places API (New) through services/google_profile.py;
          the admin's sensitive-edit email (MEH-2073) on a link change.
Does NOT: store or cache any other Google value (ToS §3.2.3(b)). The admin's
          own search and write are in routers/google_rating.py; the public
          rating line is there too.
Related:  services/google_profile.py · routers/producer_me.py:240
          (_fire_sensitive_edit, reused) · schemas/google_profile.py
History:  MEH-3641 (creation)
"""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.config import settings
from app.database import get_db
from app.models import Producer, User
from app.rate_limit import limiter
from app.schemas.google_profile import (
    GoogleProfileCandidate,
    GoogleProfileCandidatesOut,
    GoogleProfileCheckOut,
    GoogleProfileRow,
    GoogleProfileStatusOut,
)
from app.schemas.producer_out import GooglePlaceIdIn, GooglePlaceIdOut
from app.services import google_profile as gp

# REUSES: routers/producer_me.py:240 — the approved-only gate and the
# fail-open background ping, so this path cannot drift from the profile PUT.
from app.routers.producer_me import _fire_sensitive_edit

router = APIRouter(prefix="/producers/me/google-profile", tags=["producer-management"])

UNAVAILABLE = "החיבור לגוגל לא זמין כרגע. נסו שוב מאוחר יותר."
NOT_HERS = (
    "השם והטלפון בפרופיל הזה בגוגל שונים מאלה של בית העסק. "
    "בחרו את הפרופיל של העסק, או עדכנו קודם את השם או הטלפון בעמוד העסק."
)
NOT_LINKED = "עוד לא חיברתם פרופיל בגוגל."
TAKEN = (
    "הפרופיל הזה בגוגל כבר מחובר לבית עסק אחר במהמקור. אם הוא שלכם, כתבו לנו ונבדוק."
)
# The main site, always counted as «ours» for the website row.
_SITE_HOSTS = ("mehamakor.co.il",)


def _my_producer(user: User, db: Session) -> Producer:
    producer = (
        db.query(Producer)
        .filter(Producer.id == user.producer_id, Producer.kind == "producer")
        .first()
    )
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return producer


def _phones(producer: Producer) -> list[str | None]:
    return [producer.phone, producer.secondary_phone]  # type: ignore[list-item]


def _page_paths(producer: Producer) -> list[str]:
    """Her page here: the slug route and the id route (lib/producer-path.js)."""
    paths = [f"/producer/{producer.id}"]
    if producer.slug:
        paths.append(f"/{producer.slug}")
    return paths


def _page_hosts() -> list[str]:
    host = (urlparse(settings.frontend_url).hostname or "").lower().removeprefix("www.")
    return sorted({h for h in (host, *_SITE_HOSTS) if h})


@router.get("", response_model=GoogleProfileStatusOut)
def get_google_profile(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> GoogleProfileStatusOut:
    producer = _my_producer(user, db)
    return GoogleProfileStatusOut(
        available=gp.available(),
        google_place_id=producer.google_place_id,
    )


@router.get("/candidates", response_model=GoogleProfileCandidatesOut)
@limiter.limit("10/hour")
def search_google_profile(
    request: Request,  # required by slowapi
    # Her own wording, when the business is listed under another name.
    q: str | None = Query(None, max_length=120),
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> GoogleProfileCandidatesOut:
    producer = _my_producer(user, db)
    typed = (q or "").strip()
    query = typed or " ".join(str(p) for p in (producer.name, producer.city) if p)
    db.close()  # MEH-2886: no pooled connection held across the Google call
    found = gp.search_candidates(query)
    if found is None:
        raise HTTPException(status_code=503, detail=UNAVAILABLE)
    return GoogleProfileCandidatesOut(
        candidates=[GoogleProfileCandidate(**c) for c in found]
    )


@router.put("", response_model=GooglePlaceIdOut)
@limiter.limit("10/hour")
def put_google_profile(
    request: Request,  # required by slowapi
    body: GooglePlaceIdIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> GooglePlaceIdOut:
    """Link (a place_id) or unlink (null). A link is accepted only when the
    Google name or phone matches the business: 409 otherwise, 503 when Google
    cannot be asked. Unlinking always works."""
    producer = _my_producer(user, db)
    new_id = body.google_place_id
    if new_id is not None and new_id != producer.google_place_id:
        name, phones = producer.name, _phones(producer)
        # MEH-2886: no pooled connection held across the Google call; the
        # same session reopens for the reads and the write below.
        db.close()
        details = gp.fetch_details(new_id)
        if details is None:
            raise HTTPException(status_code=503, detail=UNAVAILABLE)
        if not gp.is_her_profile(details, name, phones):  # type: ignore[arg-type]
            raise HTTPException(status_code=409, detail=NOT_HERS)
        producer = _my_producer(user, db)
        # One profile, one business: otherwise a second business could show
        # the first one's Google rating (fresh review of MEH-3641).
        taken = (
            db.query(Producer.id)
            .filter(Producer.google_place_id == new_id, Producer.id != producer.id)
            .first()
        )
        if taken is not None:
            raise HTTPException(status_code=409, detail=TAKEN)
    changed = new_id != producer.google_place_id
    producer.google_place_id = new_id  # type: ignore[assignment]
    db.commit()
    if changed:
        _fire_sensitive_edit(background_tasks, producer, ["google_place_id"], user)
    return GooglePlaceIdOut(google_place_id=new_id)


@router.get("/check", response_model=GoogleProfileCheckOut)
@limiter.limit("10/hour")
def check_google_profile(
    request: Request,  # required by slowapi
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> GoogleProfileCheckOut:
    """Live comparison. Nothing from Google is stored."""
    producer = _my_producer(user, db)
    place_id = producer.google_place_id
    if not place_id:
        raise HTTPException(status_code=404, detail=NOT_LINKED)
    name, phones = producer.name, _phones(producer)
    website, hours = producer.website, producer.opening_hours
    page_paths = _page_paths(producer)
    db.close()  # MEH-2886: no pooled connection held across the Google call
    details = gp.fetch_details(place_id)  # type: ignore[arg-type]
    if details is None:
        raise HTTPException(status_code=503, detail=UNAVAILABLE)
    verdicts = gp.compare(
        details,
        name=name,  # type: ignore[arg-type]
        phones=phones,
        website=website,  # type: ignore[arg-type]
        page=(_page_hosts(), page_paths),
    )
    ours_phone = next((p for p in phones if p), None)
    rows = [
        GoogleProfileRow(
            field="name", ours=name, google=details.name, verdict=verdicts["name"]
        ),
        GoogleProfileRow(
            field="phone",
            ours=ours_phone,
            google=details.phone,
            verdict=verdicts["phone"],
        ),
        GoogleProfileRow(
            field="website",
            ours=website,
            google=details.website,
            verdict=verdicts["website"],
        ),
    ]
    return GoogleProfileCheckOut(
        rows=rows, hours_ours=hours, hours_google=details.hours
    )
