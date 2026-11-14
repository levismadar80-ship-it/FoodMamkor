"""
Module:   business_suggestions
Purpose:  Let a visitor suggest a business that is not on Mehamakor yet, and
          turn that suggestion into an ordinary outreach lead the team works
          by hand. Nothing a visitor sends is ever published.
Touches:  DB table `outreach_leads` (writes); WhatsApp + Resend via
          services.auth_notifications (admin ping, BackgroundTask).
Does NOT: serve or mutate the admin side of the queue — the list, the status
          pipeline, the prefill token and the thank-you send all live in
          routers/admin_outreach.py. It also does NOT create, link or approve
          a Producer: the business still registers itself and passes manual
          approval + the licence check (MEH-2633 scope).
Related:  app/routers/category_requests.py:23 (the public-submit + admin-ping
          shape this follows); app/routers/admin_outreach.py:62 (the soft
          dedupe this reuses); app/schemas/schemas.py BusinessSuggestionCreate.
History:  MEH-2633 (creation, chunk A).
"""

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user_optional
from app.database import get_db
from app.models.models import OutreachLead, User
from app.rate_limit import limiter
from app.schemas.schemas import BusinessSuggestionAck, BusinessSuggestionCreate
from app.services.auth_notifications import notify_admin_new_business_suggestion

router = APIRouter(tags=["business-suggestions"])

# MEH-2633: the source value that marks a lead as community-sourced. The
# column already existed with default "manual" (models.py:902).
COMMUNITY_SOURCE = "community"

# Prefix for the line appended to an existing lead's notes when a second
# person suggests the same business. Hebrew copy per the card's <hebrew_copy>
# (NOT yet approved by Sapir — flagged in the PR).
SECOND_SUGGESTION_PREFIX = "המלצה נוספת"

# Ceiling on the notes column, which is unbounded TEXT. `notes` is the one
# field a public caller can make grow without limit: five suggestions an hour
# against the same lead each append a line, forever. The cap is generous
# enough that no real queue hits it and low enough that the column cannot be
# used as storage. Beyond it the line is dropped — the admin ping still fires,
# so the signal is not lost with it.
NOTES_MAX_LEN = 10_000


def _norm(s: str | None) -> str:
    """Trim + lowercase for the soft uniqueness check.

    REUSES: backend/app/routers/admin_outreach.py:38 — the same normalisation
    the admin create path uses, so a community suggestion and an admin-typed
    lead collide on exactly the same (lower(name), lower(city)) pairs. Copied
    rather than imported to keep this public router free of any dependency on
    a require_admin module.
    """
    return (s or "").strip().lower()


def _find_existing_lead(db: Session, name: str, city: str) -> OutreachLead | None:
    """The soft-uniqueness lookup from admin_outreach.create_lead (:74-79),
    unchanged: case-and-trim insensitive on name AND city, with NULL city
    coalesced to "" so a city-less legacy row still matches a city-less query.
    """
    return (
        db.query(OutreachLead)
        .filter(func.lower(OutreachLead.name) == name)
        .filter(func.lower(func.coalesce(OutreachLead.city, "")) == city)
        .first()
    )


def _append_second_suggestion_note(lead: OutreachLead, reason: str | None) -> None:
    """Record a repeat suggestion on the lead that already exists."""
    line = (
        f"{SECOND_SUGGESTION_PREFIX}: {reason}" if reason else SECOND_SUGGESTION_PREFIX
    )
    merged = f"{lead.notes}\n{line}" if lead.notes else line
    if len(merged) > NOTES_MAX_LEN:
        return
    lead.notes = merged


@router.post(
    "/business-suggestions", response_model=BusinessSuggestionAck, status_code=201
)
# MEH-2633: unauthenticated write endpoint. 5/hour matches the sibling public
# submit (category_requests.py:24) and is generous for the real flow — a
# person recommending the handful of businesses they actually know.
@limiter.limit("5/hour")
def submit_business_suggestion(
    request: Request,
    body: BusinessSuggestionCreate,
    background_tasks: BackgroundTasks,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Accept a community suggestion.

    Every path answers the SAME body, `{"ok": true}` (BusinessSuggestionAck):
    a new lead, a duplicate, and a bot caught by the honeypot are
    indistinguishable from outside. That is deliberate — a different status or
    body for the duplicate case would turn this endpoint into an oracle for
    "is this business already in your outreach queue?", which is private
    commercial information about businesses that have not agreed to anything.

    `request` is required by slowapi, which reads it via introspection.
    """
    # Honeypot. The field is hidden from sighted users and from screen readers
    # alike (chunk B), so a value in it means an automated submitter. Answer
    # 201 and store nothing: a 4xx would tell the bot which field tripped it,
    # and a silent accept is what makes the trap reusable. No admin ping
    # either — the point is that nobody is bothered by this traffic.
    if (body.company or "").strip():
        return BusinessSuggestionAck()

    # MEH-2642 (Sapir 14/11, option 2): the suggester address comes ONLY from
    # a signed-in account, and only with the opt-in. A typed
    # `suggester_email` is ignored: it was never verified, so anyone could
    # put a stranger's address on a lead and have our thank-you mail sent
    # there. An anonymous visitor can still recommend, just with no address.
    # The opt-in gate keeps adversarial-review finding 3 (purpose limitation:
    # the notice promises the address is used only for this update, and
    # MEH-2638 would keep it 180 days).
    # The account address counts only once VERIFIED (review M1): sign-up does
    # not verify it and login does not require it, so an unverified account's
    # email is as untrusted as a typed one.
    # DO NOT fall back to body.suggester_email — that is the MEH-2642 hole.
    suggester_email = (
        getattr(user, "email", None)
        if user is not None
        and getattr(user, "email_verified", False)
        and body.wants_update
        else None
    )
    # No address → no update can be sent, so none is recorded as owed.
    wants_update = bool(suggester_email)

    existing = _find_existing_lead(db, _norm(body.name), _norm(body.city))
    if existing is not None:
        _append_second_suggestion_note(existing, body.reason)
        # Keep the FIRST suggester — except where there is none to keep. A
        # lead the admin typed by hand (or one suggested by somebody who left
        # no address) has an empty slot, and leaving it empty means this
        # person can never be thanked when the business joins: exactly the
        # dead-queue failure the card's research section says to avoid. So the
        # slot is filled if and only if it is empty; a real first suggester is
        # never overwritten.
        # `source` is deliberately NOT rewritten to "community" — an
        # admin-created lead stays admin-created, so this lead keeps its
        # provenance and will not appear under ?source=community.
        # `existing.source == COMMUNITY_SOURCE` is the security review's
        # finding 2 (04/11): without it the slot-fill applied to ANY matching
        # lead, including one an admin typed by hand — every such lead has an
        # empty slot. Since the dedupe key is public information about a food
        # business and the match is deliberately loose, an anonymous caller
        # could guess (name, city), attach their own address to a lead they had
        # nothing to do with, and have the thank-you redirected to them.
        # Narrowed to leads this flow created: a community lead whose first
        # suggester left no address can still be filled, which is the case the
        # fill existed for.
        if (
            existing.source == COMMUNITY_SOURCE
            and not existing.suggested_by_email
            and suggester_email
        ):
            existing.suggested_by_email = suggester_email
            # `or`, not a bare assign (adversarial review, finding 1): name and
            # email are each optional, so a first suggestion can leave a name
            # and no email. A later one carrying an email but no name used to
            # overwrite that name with None and lose it. Filling an EMPTY name
            # still works — tested both directions.
            existing.suggested_by_name = (
                body.suggester_name or existing.suggested_by_name
            )
            existing.suggester_wants_update = wants_update
        db.commit()
        background_tasks.add_task(
            notify_admin_new_business_suggestion,
            existing.name,
            existing.city,
            body.suggester_name,
            True,
        )
        return BusinessSuggestionAck()

    lead = OutreachLead(
        name=body.name,
        city=body.city,
        phone=body.phone,
        instagram=body.instagram,
        website=body.website,
        source=COMMUNITY_SOURCE,
        status="new",
        suggested_by_name=body.suggester_name,
        suggested_by_email=suggester_email,
        suggester_wants_update=wants_update,
        suggestion_reason=body.reason,
    )
    db.add(lead)
    db.commit()

    # Capture primitives BEFORE the background task runs — expire_on_commit
    # plus the session closing would break lazy attribute access inside it
    # (same reason as category_requests.py:50-57).
    lead_name = body.name
    lead_city = body.city
    background_tasks.add_task(
        notify_admin_new_business_suggestion,
        lead_name,
        lead_city,
        body.suggester_name,
        False,
    )
    return BusinessSuggestionAck()
