"""Admin outreach lead management (MEH-22).

Lets admins maintain a list of prospective businesses they're courting,
move each lead through a status pipeline, and mint a single-use prefill
token so the prospect can register with one click.

Q1 of the plan was answered (b) — no Claude web search. Leads are added
manually by the admin. The Claude-search route was scoped out; if added
later it would be a single new POST endpoint here.
"""

import secrets
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.config import settings
from app.database import get_db
from app.models.models import OutreachLead, User
from app.rate_limit import limiter
from app.schemas.schemas import (
    OutreachLeadCreate,
    OutreachLeadOut,
    OutreachLeadUpdate,
    OutreachPrefillResponse,
)
from app.services.email import send_email
from app.utils.clock import utc_now

router = APIRouter(prefix="/admin/outreach", tags=["admin"])

VALID_STATUSES = {"new", "contacted", "replied", "registered", "declined"}
PREFILL_TTL_DAYS = 30

# MEH-2633: the `source` vocabulary, validated on the filter the same way
# VALID_STATUSES is. "claude_search" is NOT listed — it is a future value the
# model comment mentions (models.py:902) and nothing writes it yet, so
# admitting it here would be a filter for rows that cannot exist.
VALID_SOURCES = {"manual", "community"}
# The one spelling of the community source value in this module. The public
# writer has its own (business_suggestions.COMMUNITY_SOURCE) — two routers, no
# import between a require_admin module and a public one.
COMMUNITY_SOURCE = "community"
# The value a row with a NULL source is treated as. `source` is nullable with
# only a Python-side default, so a row written by raw SQL (a seed, a
# migration) can carry NULL — and `source == "manual"` would silently skip it.
DEFAULT_SOURCE = "manual"

# MEH-2633: the status a lead must be in before its suggester can be thanked.
# The promise in the copy is "they joined", so anything earlier would be a
# thank-you for something that has not happened.
THANKABLE_STATUS = "registered"


def _norm(s: str | None) -> str:
    """Trim + lowercase for soft uniqueness checks."""
    return (s or "").strip().lower()


@router.get("", response_model=list[OutreachLeadOut])
def list_leads(
    status: str | None = None,
    city: str | None = None,
    source: str | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List leads, newest first. Optional filters: status, city
    (case-insensitive contains), source (MEH-2633, exact)."""
    q = db.query(OutreachLead)
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="סטטוס לא תקין")
        q = q.filter(OutreachLead.status == status)
    if city:
        q = q.filter(func.lower(OutreachLead.city).contains(city.strip().lower()))
    if source:
        if source not in VALID_SOURCES:
            raise HTTPException(status_code=400, detail="מקור לא תקין")
        # COALESCE, not a bare ==: see DEFAULT_SOURCE above — a NULL-source row
        # IS a manual lead and must come back under ?source=manual.
        q = q.filter(func.coalesce(OutreachLead.source, DEFAULT_SOURCE) == source)
    return q.order_by(OutreachLead.updated_at.desc()).all()


@router.post("", response_model=OutreachLeadOut, status_code=201)
def create_lead(
    data: OutreachLeadCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a lead. Soft-unique on (lower(name), lower(city)) — returns
    409 with the existing lead's id when a duplicate is detected so the
    admin can navigate to it instead of creating a near-duplicate."""
    name_n = _norm(data.name)
    city_n = _norm(data.city)
    if name_n:
        existing = (
            db.query(OutreachLead)
            .filter(func.lower(OutreachLead.name) == name_n)
            .filter(func.lower(func.coalesce(OutreachLead.city, "")) == city_n)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "duplicate_lead",
                    "existing_id": str(existing.id),
                    "message": "ליד עם שם + עיר זה כבר קיים",
                },
            )

    lead = OutreachLead(
        name=data.name.strip(),
        phone=(data.phone or "").strip() or None,
        instagram=(data.instagram or "").strip().lstrip("@") or None,
        website=(data.website or "").strip() or None,
        city=(data.city or "").strip() or None,
        category=(data.category or "").strip() or None,
        notes=data.notes,
        source="manual",
        status="new",
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.patch("/{lead_id}", response_model=OutreachLeadOut)
def update_lead(
    lead_id: UUID,
    data: OutreachLeadUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lead = db.query(OutreachLead).filter(OutreachLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="ליד לא נמצא")

    if data.status is not None:
        if data.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="סטטוס לא תקין")

    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(lead, field, value)

    db.commit()
    db.refresh(lead)
    return lead


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    lead_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    lead = db.query(OutreachLead).filter(OutreachLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="ליד לא נמצא")
    db.delete(lead)
    db.commit()
    return None


@router.post("/{lead_id}/prefill-token", response_model=OutreachLeadOut)
def mint_prefill_token(
    lead_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Generate (or rotate) the prefill token for a lead. Returns the
    full lead so the admin UI can read `prefill_token` directly."""
    lead = db.query(OutreachLead).filter(OutreachLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="ליד לא נמצא")

    # secrets.token_urlsafe(32) → ~43 chars URL-safe base64.
    lead.prefill_token = secrets.token_urlsafe(32)
    lead.prefill_token_expires_at = utc_now() + timedelta(days=PREFILL_TTL_DAYS)
    db.commit()
    db.refresh(lead)
    return lead


# --- MEH-2633: thank the community suggester ---


@router.post("/{lead_id}/thank-suggester", response_model=OutreachLeadOut)
def thank_suggester(
    lead_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Email the person who suggested this business that it has joined.

    Four separate 409s rather than one, each with its own Hebrew detail, so the
    admin UI can say WHY the button is unavailable instead of just greying it
    out — and so a test can tell the four rules apart (a single shared message
    would make any of the four pass a test written for another).

    Idempotent through `suggester_thanked_at`: the second call takes the
    already-thanked branch and sends nothing. The stamp is written AFTER
    send_email returns, but note what that can and cannot promise —
    `send_email` is fail-open by contract (services/email.py:139, returns None
    on every path and raises nothing), so the stamp means "we handed this to
    Resend", never "it was delivered". A swallowed failure is reported to
    Sentry by that module (MEH-1613), which is where a missing thank-you is
    diagnosed from; it is deliberately not re-derived here, because retrying
    on a signal we do not have would send duplicates.
    """
    lead = db.query(OutreachLead).filter(OutreachLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="ליד לא נמצא")

    # Neutral plural voice, no slash forms: docs/BRAND.md:81 lists the slash
    # form ("טוענ/ת") as forbidden across ALL surfaces, and :211 layer 3 puts
    # operational/admin surfaces on fully neutral phrasing. These three details
    # read "הממליצ/ה …" for one iteration; the MEH-2633 copy gate caught them.
    if not lead.suggested_by_email:
        raise HTTPException(status_code=409, detail="אין כתובת אימייל בהמלצה הזו")
    if not lead.suggester_wants_update:
        raise HTTPException(status_code=409, detail="לא ביקשו עדכון על ההמלצה הזו")
    if lead.suggester_thanked_at is not None:
        raise HTTPException(status_code=409, detail="תודה כבר נשלחה")
    if lead.status != THANKABLE_STATUS:
        raise HTTPException(status_code=409, detail="בית העסק עוד לא נרשם")

    # Flatten the name before it goes into a plain-text email body. It is
    # bleached at write time (SanitizedLabelField) but bleach does not touch
    # newlines, and this value can originate from an anonymous public
    # suggestion — so a crafted name could otherwise add its own line to the
    # message the suggester reads.
    safe_name = " ".join((lead.name or "").split())
    # <hebrew_copy> verbatim. NOT yet approved by Sapir — flagged in the PR.
    # `{link}` is the site root: v1 deliberately does not link lead → producer
    # (over_engineering_guard), so there is no business page URL to point at
    # and inventing one would be a dead link.
    send_email(
        lead.suggested_by_email,
        f"{safe_name} כבר במהמקור, בזכותכם",
        f"המלצתם לנו על {safe_name}. פנינו אליהם, והם הצטרפו. "
        f"תודה שעזרתם לנו למצוא עוד מקום טוב. {settings.frontend_url}",
    )

    lead.suggester_thanked_at = utc_now()
    db.commit()
    db.refresh(lead)
    return lead


# --- Aggregate metrics ---


@router.get("/metrics/summary")
def metrics_summary(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Counters for the admin outreach page header.

    Naming maps to the spec wording:
      total      = all leads
      contacted  = פניתי
      replied    = ענו
      registered = נרשמו
      community  = המלצות קהילה (source, not status — MEH-2633)
    """

    # MEH-2553: one GROUP BY instead of a count per status (Sentry N+1
    # MEHAMAKOR-BACKEND-1P). `total` sums every status, as before.
    #
    # MEH-2633 adds `community`, which counts a DIFFERENT axis — source, not
    # status. The obvious way to get it is a second GROUP BY, and that is what
    # this function did for one iteration: it reintroduced the N+1 this very
    # endpoint was fixed for, took the outreach_leads statement count from 1 to
    # 2, and test_meh2553_admin_grouped_counts.py caught it. So BOTH axes come
    # from a single grouped SELECT over (status, source) and are folded in
    # Python. One statement, two roll-ups.
    #
    # DO NOT add another aggregate query here — add a column to this GROUP BY.
    #        The guard asserts exactly one SELECT touching outreach_leads.
    #
    # COALESCE on source for the same reason as the list filter: a NULL-source
    # row is a manual lead (DEFAULT_SOURCE).
    grouped = db.query(
        OutreachLead.status,
        func.coalesce(OutreachLead.source, DEFAULT_SOURCE),
        func.count(OutreachLead.id),
    ).group_by(
        OutreachLead.status,
        func.coalesce(OutreachLead.source, DEFAULT_SOURCE),
    )

    by_status: dict[str | None, int] = {}
    community = 0
    for lead_status, lead_source, count in grouped.all():
        by_status[lead_status] = by_status.get(lead_status, 0) + int(count)
        if lead_source == COMMUNITY_SOURCE:
            community += int(count)

    return {
        "total": int(sum(by_status.values())),
        **{
            s: int(by_status.get(s, 0))
            for s in ("new", "contacted", "replied", "registered", "declined")
        },
        "community": community,
    }


# --- Public prefill lookup ---
# Lives on a separate router so it can be mounted under /register/producer
# without dragging the require_admin dep in.

prefill_router = APIRouter(prefix="/register/producer/prefill", tags=["auth"])


@prefill_router.get("/{token}", response_model=OutreachPrefillResponse)
# MEH-1724 F-4: unauthenticated endpoint returning lead PII (name, phone,
# instagram, website, city). The 256-bit token makes brute force infeasible,
# so this is defence-in-depth, not the primary control — it caps automated
# probing of a PII surface. 30/hour is generous for the real flow (an owner
# opening a prefill link from outreach and refreshing a few times).
@limiter.limit("30/hour")
def get_prefill(request: Request, token: str, db: Session = Depends(get_db)):
    """Public lookup — the token IS the auth. Returns 404 for invalid /
    expired tokens so the registration form just renders empty (no leak).

    `request` is required by slowapi, which reads it via introspection.
    """
    if not token or len(token) < 16:
        raise HTTPException(status_code=404, detail="אסימון לא נמצא")

    lead = db.query(OutreachLead).filter(OutreachLead.prefill_token == token).first()
    if not lead:
        raise HTTPException(status_code=404, detail="אסימון לא נמצא")
    if (
        lead.prefill_token_expires_at is None
        or lead.prefill_token_expires_at < utc_now()
    ):
        raise HTTPException(status_code=404, detail="תוקף האסימון פג")

    return OutreachPrefillResponse(
        name=lead.name,
        phone=lead.phone,
        instagram=lead.instagram,
        website=lead.website,
        city=lead.city,
        category=lead.category,
    )
