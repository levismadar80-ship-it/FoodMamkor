"""
Module:   producer_owner_invite
Purpose:  Owner invite — an admin builds a business's page end to end, after
          written consent from its owner, then hands it over: a one-time link
          on which the owner sets a password and signs the terms and the
          licensing declaration herself. She never fills in the registration
          form.
Touches:  producers (the eight `owner_invite_*` columns; `declared_at` /
          `declaration_version` stamped at acceptance), users (ONE row, INSERTed
          at acceptance and never before). Background: the existing
          business-approved email, to the new owner.
Does NOT: create a `users` row at invite time (closed decision 2 — that is what
          keeps forgot-password from becoming a way around the declaration
          step), link an EXISTING account to a business (v1: 409 — the fix for
          an owner who already has an account is to edit and approve the draft
          she already started), publish anything (the business is already
          approved — that is the precondition, not the effect), verify a phone
          (`phone_verified` stays false; she can verify from the dashboard), or
          touch the `/claim` flow for DRAFT businesses (routers/producer_claim.py
          — a different precondition and a different mechanism; see below).
Related:  backend/app/routers/producer_claim.py (the DRAFT sibling) ·
          backend/app/routers/auth.py `_set_refresh_cookie` /
          `_set_fingerprint_cookie` / `reset_password` (the session and the
          password policy this reuses) ·
          backend/app/services/auth_emails.py `send_owner_invite_email` ·
          backend/app/services/onboarding_followup.py (reads
          `owner_invite_accepted_at` as the sequence clock).
History:  MEH-2974 (creation).

TWO MECHANISMS, ONE SHAPE — and why that is a decision rather than a
duplication the next session should "clean up".

`producer_claim.py` already hands a business to its owner. It is NOT this, and
the three differences are each load-bearing:

  * Its precondition is `status == "draft"` and its own comment forbids
    widening it ("DO NOT widen to approved / imported listings without a
    decision — a claim there would hand a stranger holding a leaked link
    control of a page that is already live"). THIS flow's precondition is
    `status == "approved"`: handing over a LIVE page is the entire point, which
    is why its token is single-use, 7 days, revocable, and bound to one
    recorded email — none of which the claim token is.
  * It requires the owner to ALREADY HAVE an account and sign in. Here there is
    no account until she accepts; the link is what creates one.
  * Its token is a stateless signed JWT, so it cannot be revoked. This one is a
    random secret whose sha256 lives on the row, so a resend or a cancel kills
    the outstanding link — the control that a live page demands.

Reported as an architectural smell in the PR body (workflow.md Smell #1) rather
than merged, because merging them means giving the draft flow a revocable
stateful token or giving this one a non-revocable one, and both are worse.
"""

import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import structlog
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
)
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    generate_fingerprint,
    hash_fingerprint,
    hash_password,
    require_admin,
)
from app.config import settings
from app.constants import (
    DECLARATION_VERSION,
    FARMER_DECLARATION_CATEGORIES,
    TERMS_VERSION,
)
from app.database import get_db
from app.models import Producer, User
from app.rate_limit import limiter
from app.routers.admin import _producer_approved_body, _producer_approved_html
from app.routers.auth import _set_fingerprint_cookie, _set_refresh_cookie
from app.schemas.schemas import (
    OwnerInviteAccept,
    OwnerInviteCreate,
    OwnerInviteCreatedOut,
    OwnerInvitePublicOut,
    Token,
)
from app.services.email import send_email
from app.services.auth_emails import send_owner_invite_email
from app.services.password_policy import validate_password

logger = structlog.get_logger(__name__)

# Closed decision 5: seven days. The token grants full control of a LIVE page,
# so this sits at the short end of the accepted range (Auth0 organization
# invitations default to 604800s and cap at 30 days; Slack's 30-day team invite
# grants far less). Resending is one click, which is what makes the short end
# affordable.
INVITE_TTL_DAYS = 7

# The business must already be live. An invite is a HANDOVER, not an approval
# path — a draft's owner goes through `producer_claim.py` instead.
_INVITABLE_STATUS = "approved"

# ONE message for every way a link can be unusable: never minted, mistyped,
# expired, already accepted, replaced by a resend, cancelled. Telling them apart
# would let anyone holding one link probe the state of others, and the 404 is
# also what an unknown token must answer — so they have to be the same string,
# in the same shape, with the same status.
# tests/test_producer_owner_invite.py::TestNoEnumeration asserts the response
# BYTES are identical across all five live causes, not just the status code.
_LINK_INVALID = "הקישור כבר לא בתוקף. אפשר להשיב למייל ההזמנה ונשלח קישור חדש."

_ALREADY_OWNED = "לעסק הזה כבר יש בעלים."
_EMAIL_TAKEN = "האימייל הזה כבר רשום במהמקור, ואי אפשר להזמין אותו."
_NOT_APPROVED = "אפשר להזמין בעלים רק לעסק מאושר."
_NO_INVITE = "אין הזמנה פתוחה לעסק הזה."
_ALREADY_ACCEPTED = "ההזמנה כבר התקבלה."
_NOT_FOUND = "בית העסק לא נמצא"


def _hash_token(token: str) -> str:
    """sha256 hex of the raw token — the ONLY form that reaches the database.

    Plain sha256, not bcrypt/argon2: this is a 256-bit random secret, not a
    human-chosen password, so there is nothing to brute-force and no reason to
    pay a work factor on the hot lookup path. The same reasoning the repo
    already applies to `users.reset_token`, with the hash added.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _invite_url(token: str) -> str:
    return f"{settings.frontend_url}/owner-invite/{token}"


def _has_owner(db: Session, producer_id: UUID) -> bool:
    """Same predicate as producer_claim._has_owner and admin._attach_has_owner:
    at least one account points at this business."""
    return db.query(User.id).filter(User.producer_id == producer_id).first() is not None


def _email_taken(db: Session, email: str) -> bool:
    """Case-insensitive, because `users.email` is stored as typed.

    v1 refuses rather than linking: an owner who already has an account is an
    owner who already started something, and the right answer is to finish THAT
    (edit and approve her draft), not to mint her a second business.
    """
    return (
        db.query(User.id)
        .filter(func.lower(User.email) == email.strip().lower())
        .first()
        is not None
    )


def _requires_farmer_declaration(producer: Producer) -> bool:
    """Reads the categories already loaded on the row — no extra query, the
    same membership-by-name test `license_pending` makes over
    LICENSE_REQUIRED_CATEGORIES."""
    return any(
        c.name in FARMER_DECLARATION_CATEGORIES for c in (producer.categories or [])
    )


def _load_invitable(
    db: Session, producer_id: UUID, *, require_approved: bool = True
) -> Producer:
    """The refusals the admin endpoints here share, in one place.

    FOR UPDATE, for the same reason `producer_claim.create_claim_link` takes it:
    these routes WRITE, and an acceptance committing between the owner check
    and our commit would otherwise let a mint overwrite the token of an invite
    that has just been used. Lock order is producers-only here — this module
    never locks `users`, so it cannot form a cycle with the claim route (which
    takes users then producers).

    `require_approved=False` is for CANCEL only, and it is not a loosening.
    The status gate exists so an invite is never SENT for a page that is not
    live; applying it to cancel too meant that suspending a business locked its
    outstanding invite in place — the admin could not revoke the link, and
    re-approving the business silently revived it. Withdrawing a credential is
    the one action that must never be gated on the state of the thing it
    protects. Found in review, not in production.
    """
    producer = (
        db.query(Producer).filter(Producer.id == producer_id).with_for_update().first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if require_approved and producer.status != _INVITABLE_STATUS:
        raise HTTPException(status_code=409, detail=_NOT_APPROVED)
    if _has_owner(db, producer.id):
        raise HTTPException(status_code=409, detail=_ALREADY_OWNED)
    if producer.owner_invite_accepted_at is not None:
        # Belt and braces with the check above: an accepted invite normally
        # implies an owner, but the two are separate columns and an admin who
        # deleted the account would otherwise be able to mint a second invite
        # on a row that still reads as handed over.
        raise HTTPException(status_code=409, detail=_ALREADY_ACCEPTED)
    return producer


def _mint(producer: Producer, admin_id: UUID) -> tuple[str, datetime]:
    """Replace whatever token the row held with a fresh one.

    Replacement IS revocation — the previous link's hash is gone, so it can
    never match again. That is why resend needs no separate "revoke" step and
    why there is no invite history: one business, one live link.
    """
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    producer.owner_invite_token_hash = _hash_token(token)
    producer.owner_invite_sent_at = now
    producer.owner_invite_expires_at = now + timedelta(days=INVITE_TTL_DAYS)
    producer.owner_invite_created_by = admin_id
    return token, producer.owner_invite_expires_at


def _first_name(full_name: str | None) -> str:
    parts = (full_name or "").strip().split()
    return parts[0] if parts else ""


# ---------------------------------------------------------------------------
# admin
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/admin/producers", tags=["admin"])


@router.post("/{producer_id}/owner-invite", response_model=OwnerInviteCreatedOut)
# 10/hour: the real flow is a handful of invites a week, by one person, by
# hand. The cap is here because this endpoint SENDS MAIL to an address chosen
# in the request body — an admin account doing that in a loop is either a
# mistake or a compromised session, and either way Resend's reputation is the
# thing being spent.
@limiter.limit("10/hour")
def create_owner_invite(  # noqa: PLR0913 — six FastAPI-injected parameters, none droppable
    # `request` is slowapi's (read by introspection), `producer_id` is the
    # path, `body` the payload, `background_tasks` sends the invite off the
    # response path, `user` is the admin whose id becomes the audit record,
    # `db` the session. The repo's alternative to a noqa here is a per-file
    # ignore in pyproject.toml, which is a denied file and would also silence
    # the rule for every future handler in this module. Same local-noqa shape
    # as `services/email.py::send_email`.
    request: Request,
    producer_id: UUID,
    body: OwnerInviteCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Invite (or re-invite) the owner of an approved business.

    A second call REPLACES the first invite, token and all — that is how an
    admin corrects a typo in the address without a separate revoke step.
    """
    producer = _load_invitable(db, producer_id)
    if _email_taken(db, body.email):
        raise HTTPException(status_code=409, detail=_EMAIL_TAKEN)

    producer.owner_invite_email = body.email
    producer.owner_invite_name = body.name
    producer.owner_invite_consent_note = body.consent_note
    token, expires_at = _mint(producer, user.id)
    # Read every value the response and the email need BEFORE the commit: it
    # expires every instance in the session, and an attribute read afterwards
    # costs a re-SELECT (the same note `producer_claim.create_claim_link`
    # carries for `admin_id`).
    sent_at = producer.owner_invite_sent_at
    email, name, business = body.email, body.name, producer.name
    test_cause = bool(producer.is_test)
    db.commit()

    # producer_id and admin_id ONLY. Never the token, never the full address —
    # structlog ships these to the platform's log stream, which is not a place
    # a credential or an invitee's email belongs (card <constraints>).
    logger.info(
        "owner_invite.created",
        producer_id=str(producer_id),
        admin_id=str(user.id),
        expires_at=expires_at.isoformat(),
    )
    background_tasks.add_task(
        send_owner_invite_email,
        email,
        _first_name(name),
        business,
        _invite_url(token),
        test_cause=test_cause,
    )
    return OwnerInviteCreatedOut(
        invite_url=_invite_url(token),
        email=email,
        name=name,
        sent_at=sent_at,
        expires_at=expires_at,
    )


@router.post("/{producer_id}/owner-invite/resend", response_model=OwnerInviteCreatedOut)
@limiter.limit("10/hour")
def resend_owner_invite(
    request: Request,
    producer_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Mint a new token for the invite already on the row and send it again.

    Takes no body on purpose: resending to a DIFFERENT address is a different
    act with a different consent, and it goes through create — which records a
    fresh `consent_note` for it.
    """
    producer = _load_invitable(db, producer_id)
    if not producer.owner_invite_email:
        raise HTTPException(status_code=404, detail=_NO_INVITE)
    # Re-checked, not assumed from the create: the address may have been
    # registered in the days since, and resending then would mint a link whose
    # acceptance is guaranteed to 409.
    if _email_taken(db, producer.owner_invite_email):
        raise HTTPException(status_code=409, detail=_EMAIL_TAKEN)

    token, expires_at = _mint(producer, user.id)
    sent_at = producer.owner_invite_sent_at
    email, name, business = (
        producer.owner_invite_email,
        producer.owner_invite_name,
        producer.name,
    )
    test_cause = bool(producer.is_test)
    db.commit()

    logger.info(
        "owner_invite.resent",
        producer_id=str(producer_id),
        admin_id=str(user.id),
        expires_at=expires_at.isoformat(),
    )
    background_tasks.add_task(
        send_owner_invite_email,
        email,
        _first_name(name),
        business,
        _invite_url(token),
        test_cause=test_cause,
    )
    return OwnerInviteCreatedOut(
        invite_url=_invite_url(token),
        email=email,
        name=name or "",
        sent_at=sent_at,
        expires_at=expires_at,
    )


@router.delete("/{producer_id}/owner-invite")
@limiter.limit("30/hour")
def cancel_owner_invite(
    request: Request,
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Withdraw an invite that has not been accepted.

    Clears the PII too, not only the token. The address and the name belong to
    someone who is not a user of the site and now never will be through this
    link, so the row should stop holding them (MEH-2208's תיקון 13 class).
    `owner_invite_created_by` and the consent note are kept: they are the audit
    record of an invite that WAS sent, and deleting that is the one thing a
    cancel must not do.

    Deliberately NOT gated on `status == "approved"` — see `_load_invitable`.
    """
    producer = _load_invitable(db, producer_id, require_approved=False)
    if not producer.owner_invite_token_hash:
        raise HTTPException(status_code=404, detail=_NO_INVITE)

    producer.owner_invite_token_hash = None
    producer.owner_invite_expires_at = None
    producer.owner_invite_sent_at = None
    producer.owner_invite_email = None
    producer.owner_invite_name = None
    db.commit()
    logger.info(
        "owner_invite.cancelled",
        producer_id=str(producer_id),
        admin_id=str(user.id),
    )
    return {"detail": "ההזמנה בוטלה"}


# ---------------------------------------------------------------------------
# public — the token IS the auth
# ---------------------------------------------------------------------------
# A separate router so these two can live under /auth without dragging
# `require_admin` in. Same split, same reason, as admin_outreach's
# `prefill_router`.

public_router = APIRouter(prefix="/auth/owner-invite", tags=["auth"])


def _live_invite(db: Session, token: str) -> Producer | None:
    """The row this token is currently the live link for, or None.

    Matching is on the HASH — the raw token is never compared to a stored
    string, because no raw token is stored. Every condition that can make a
    link dead is in the one WHERE clause, so the caller has a single 404 to
    raise and cannot accidentally grow a second, distinguishable refusal.
    """
    if not token or len(token) < 16:
        return None
    return (
        db.query(Producer)
        .filter(
            Producer.owner_invite_token_hash == _hash_token(token),
            Producer.owner_invite_accepted_at.is_(None),
            Producer.owner_invite_expires_at > datetime.now(timezone.utc),
            Producer.status == _INVITABLE_STATUS,
        )
        .first()
    )


@public_router.post("/accept", response_model=Token)
# 10 per 15 minutes, matching `reset_password` — the other unauthenticated
# endpoint that consumes a single-use token and sets a password. The token
# carries 256 bits, so this is defence in depth against automated probing of
# the surface, not the primary control.
@limiter.limit("10/15 minutes")
async def accept_owner_invite(
    request: Request,
    response: Response,
    body: OwnerInviteAccept,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Set a password, sign both consents, and walk into the dashboard.

    ORDER MATTERS, and each step is placed where it is for a reason:

      1. The two consent booleans are schema-level 422s (OwnerInviteAccept).
         They are statements about the BODY and say nothing about which
         business the token names, so they leak nothing and they run before any
         read — the same classification register_producer gives its own
         body-shape guards.
      2. The password policy, also 422, also before any write.
      3. The email-taken check, 409, BEFORE the claim — so the common race
         answers without having touched anything.
      4. The claim: ONE conditional UPDATE (MEH-1820), never SELECT-then-set.
      5. The INSERT, then a single commit.

    Steps 3 and 5 still race each other — an account can be created for this
    address in the microseconds between them — and that is caught by the unique
    index on `users.email`, whose IntegrityError rolls the WHOLE transaction
    back, claim included. So the 409 leaves zero writes either way, and the
    invite link stays live for a second attempt.
    """
    # Read before the claim so the failure modes above cost nothing, and so a
    # dead token's 404 is reached by the same path whatever the body contained.
    producer = _live_invite(db, body.token)
    if producer is None:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)

    invited_email = producer.owner_invite_email
    invited_name = producer.owner_invite_name
    if not invited_email:
        # A row with a live token but no address cannot happen through any
        # route here (create writes both, cancel clears both). If it ever does,
        # it is not a link anyone may accept.
        raise HTTPException(status_code=404, detail=_LINK_INVALID)

    # MEH-306 / MEH-457: the full policy (deny-list + HIBP) is async and bcrypt
    # blocks, so both are awaited off the event loop exactly as reset_password
    # and register do.
    result = await validate_password(body.password)
    if not result.ok:
        raise HTTPException(status_code=422, detail={"failures": result.failures})

    if _email_taken(db, invited_email):
        raise HTTPException(status_code=409, detail=_EMAIL_TAKEN)

    pwd_hash = await asyncio.to_thread(hash_password, body.password)
    now = datetime.now(timezone.utc)

    # MEH-1820: the claim is a CONDITIONAL UPDATE and the affected-row count IS
    # the lock. Under READ COMMITTED a second request that started before this
    # one committed blocks on the row lock, re-evaluates the WHERE against the
    # committed row, finds `owner_invite_accepted_at` already set, and matches
    # zero rows. Exactly one caller can win, per token.
    #
    # Chosen over SELECT … FOR UPDATE for the two reasons MEH-1820 records: it
    # is one statement rather than a lock-then-mutate pair, so there is no
    # window between them to reason about; and `with_for_update()` is a silent
    # no-op on backends that ignore it, which would make the guard disappear
    # with no test going red.
    #
    # The WHERE repeats every condition `_live_invite` tested. That is not
    # belt-and-braces — the read above is NOT under a lock, so its answer is
    # already stale by the time we get here, and this clause is the only one
    # whose verdict counts.
    claimed = (
        db.query(Producer)
        .filter(
            Producer.id == producer.id,
            Producer.owner_invite_token_hash == _hash_token(body.token),
            Producer.owner_invite_accepted_at.is_(None),
            Producer.owner_invite_expires_at > now,
            Producer.status == _INVITABLE_STATUS,
        )
        .update(
            {
                # The token dies here, in the same statement that claims it.
                Producer.owner_invite_token_hash: None,
                Producer.owner_invite_accepted_at: now,
                # MEH-759 (ADR-022 gate 2): the licensing declaration is HERS,
                # stamped from her own click. An admin created this page and
                # deliberately did NOT sign this (admin_create_producer leaves
                # both NULL) — this is the moment it becomes signed.
                Producer.declared_at: now,
                Producer.declaration_version: DECLARATION_VERSION,
            },
            synchronize_session=False,
        )
    )
    if not claimed:
        db.rollback()
        raise HTTPException(status_code=404, detail=_LINK_INVALID)

    user = User(
        email=invited_email,
        name=invited_name or invited_email,
        password_hash=pwd_hash,
        # MEH-457: the iat anchor, so tokens issued before a future password
        # change can be invalidated.
        password_changed_at=now,
        role="producer",
        producer_id=producer.id,
        is_producer=True,
        # She proved control of this address by opening a link only it
        # received — which is exactly what the verification email asks for, so
        # asking again would be theatre.
        email_verified=True,
        # MEH-1995 / MEH-2080: the ToS consent, a DIFFERENT record from the
        # licensing declaration stamped on the producer row above. Two
        # consents, two records, deliberately.
        terms_accepted_at=now,
        terms_version=TERMS_VERSION,
    )
    # Read every value the background task and the log line need BEFORE the
    # commit. `db.commit()` expires every instance in the session, so a read
    # afterwards re-SELECTs — which costs a query, and raises
    # ObjectDeletedError (a 500, after the account has already been created) if
    # the row went away in between. Same note `create_owner_invite` carries,
    # and the same one `producer_claim.create_claim_link` carries for its
    # `admin_id`.
    p_id, p_name, p_slug = producer.id, producer.name, producer.slug
    p_is_test = bool(producer.is_test)

    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # The narrow race step 3 cannot close: `users.email` is unique, and the
        # rollback undoes the claim too, so the link survives for a retry.
        db.rollback()
        logger.info("owner_invite.email_race", producer_id=str(p_id))
        raise HTTPException(status_code=409, detail=_EMAIL_TAKEN) from None

    db.refresh(user)
    p_test = bool(p_is_test or user.is_test)
    logger.info("owner_invite.accepted", producer_id=str(p_id), user_id=str(user.id))

    # The business is already approved, so the one email that is TRUE for her
    # is the one every other approved business's owner got — the same builders
    # admin.approve_producer uses, byte for byte, reached by import rather than
    # by a copy (there is no cycle: routers/admin.py imports no router).
    # Deliberately NOT sent: the welcome mail (it tells a new business to go
    # finish its profile — hers is finished and live) and the WhatsApp
    # template (one parameter, no buttons, and nothing here to say).
    background_tasks.add_task(
        send_email,
        user.email,
        "ברוכים הבאים למהמקור",
        _producer_approved_body(p_name, p_slug),
        html=_producer_approved_html(p_name, p_slug),
        test_cause=p_test,
    )

    # The same session login issues, so she lands in the dashboard signed in
    # rather than at a login form she has no muscle memory for.
    fp = generate_fingerprint()
    _set_refresh_cookie(response, user)
    _set_fingerprint_cookie(response, fp)
    return Token(
        access_token=create_access_token(
            user.id, user.token_version, fingerprint_hash=hash_fingerprint(fp)
        )
    )


@public_router.get("/{token}", response_model=OwnerInvitePublicOut)
# 30/hour, the same cap `admin_outreach.get_prefill` carries for the same
# shape: an unauthenticated endpoint that returns a little PII to whoever holds
# a long random token. Generous for the real flow (opening the link and
# refreshing a few times), tight enough to cap automated probing.
@limiter.limit("30/hour")
def get_owner_invite(request: Request, token: str, db: Session = Depends(get_db)):
    """What the acceptance page renders before she has typed anything.

    `request` is required by slowapi, which reads it by introspection.
    """
    producer = _live_invite(db, token)
    if producer is None or not producer.owner_invite_email:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)
    return OwnerInvitePublicOut(
        producer_name=producer.name,
        email=producer.owner_invite_email,
        requires_farmer_declaration=_requires_farmer_declaration(producer),
    )
