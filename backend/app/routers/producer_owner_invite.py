"""
Module:   producer_owner_invite
Purpose:  Owner invite — an admin builds a business's page end to end, after
          written consent from its owner, then hands it over: a one-time link
          on which the owner sets a password and signs the terms and the
          licensing declaration herself. She never fills in the registration
          form.
Touches:  producers (the eleven `owner_invite_*` columns; `declared_at` /
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
    `status == "approved"` or `"inactive"`: handing over a page the admin has
    finished is the entire point, which is why its token is single-use, 7
    days, and revocable — none of which the claim token is.

    What it is NOT, said here because the sentence this replaced claimed it
    was: **bound to one recorded address**. In v3 it is a bearer link. Whoever
    holds it names the address and proves it with a code, which means the
    account is created for whoever holds the LINK, not for whoever the admin
    typed. That is the card's own decision (v3 §13/§14 — most of these
    businesses reach us on Instagram, where we have no address to bind to) and
    its mitigations are listed there: single-use, 7 days, a code to a mailbox
    the holder must actually read, and an admin notification naming the
    address at the moment the account is created. A comment that promised
    binding was worse than the risk, because it is what a later session would
    cite while deciding the code step is optional.
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
    OwnerInviteEmailCodeRequest,
    OwnerInviteCreate,
    OwnerInviteCreatedOut,
    OwnerInvitePublicOut,
    ProducerClaimPreviewOut,
    Token,
)
from app.services import indexnow  # MEH-2852
from app.services.email import send_email
from app.services.farmer_declaration import farmer_declaration_stamp_for_existing
from app.services.auth_notifications import notify_admin_owner_invite_accepted
from app.services.auth_emails import (
    send_owner_invite_code_email,
    send_owner_invite_email,
)
from app.services.password_policy import validate_password

logger = structlog.get_logger(__name__)

# Closed decision 5: seven days. The token grants full control of a LIVE page,
# so this sits at the short end of the accepted range (Auth0 organization
# invitations default to 604800s and cap at 30 days; Slack's 30-day team invite
# grants far less). Resending is one click, which is what makes the short end
# affordable.
INVITE_TTL_DAYS = 7

# Which businesses may be handed over. An invite is a HANDOVER, not an approval
# path — a draft's owner goes through `producer_claim.py` instead.
#
# v3 added `inactive` (hidden), and it is the more interesting of the two: the
# admin builds the page, HIDES it, and it goes live at the moment its owner
# approves it. That matches what the businesses were actually promised —
# «נכנסים, בודקים, מאשרים והדף עולה» — and it is the same shape Google
# Business Profile and DoorDash use (a profile the platform prepared is not
# shown until its owner confirms).
_INVITABLE_STATUSES = frozenset({"approved", "inactive"})
# The status an acceptance PUBLISHES from. One value, not a set: `approved`
# accepts and stays as it is, and nothing else is invitable.
_HIDDEN_STATUS = "inactive"
_LIVE_STATUS = "approved"

# v3: the email code. Ten minutes is long enough to switch to a mail app and
# back and short enough that a code read over someone's shoulder is stale by
# the time it is useful; five attempts makes a 6-digit secret unwalkable while
# still forgiving a typo or two. `secrets.randbelow` over `random` because this
# is a credential.
OWNER_INVITE_CODE_TTL_MINUTES = 10
OWNER_INVITE_CODE_MAX_ATTEMPTS = 5

# ONE message for every way a link can be unusable: never minted, mistyped,
# expired, already accepted, replaced by a resend, cancelled. Telling them apart
# would let anyone holding one link probe the state of others, and the 404 is
# also what an unknown token must answer — so they have to be the same string,
# in the same shape, with the same status.
# tests/test_producer_owner_invite.py::TestNoEnumeration asserts the response
# BYTES are identical across all five live causes, not just the status code.
_LINK_INVALID = "הקישור כבר לא בתוקף. אפשר להשיב למייל ההזמנה ונשלח קישור חדש."

_ALREADY_OWNED = "לעסק הזה כבר יש בעלים."
_BAD_CODE = "הקוד לא תואם. אפשר לנסות שוב או לבקש קוד חדש."
_NO_CODE = "צריך לבקש קוד אימות ולהזין אותו."
_EMAIL_TAKEN = "האימייל הזה כבר רשום במהמקור, ואי אפשר להזמין אותו."
_NOT_APPROVED = "אפשר להזמין בעלים רק לעסק מאושר או מוסתר."
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
    LICENSE_REQUIRED_CATEGORIES. MEH-3137: a business whose grower line is
    already recorded is not asked again (the accept route ignores it then)."""
    if producer.farmer_declared_at is not None:
        return False
    return any(
        c.name in FARMER_DECLARATION_CATEGORIES for c in (producer.categories or [])
    )


def _preview(producer: Producer) -> ProducerClaimPreviewOut:
    """What the page will look like, so she approves something she has seen.

    The same five public fields `ProducerClaimPreviewOut` carries for the claim
    page, and every one of them is already on the business's own page — so a
    holder of the link learns nothing they could not read there, once the page
    is live.

    Deliberately built HERE rather than by pointing the page at `/producers/*`:
    a HIDDEN business must not become reachable through a public endpoint
    before its owner accepts, and holding the invite link is the only way to
    see it. `producer_listing` filters on `status == "approved"`, so the public
    route would answer 404 for exactly the case v3 is about.
    """
    return ProducerClaimPreviewOut(
        name=producer.name,
        city=producer.city,
        short_description=producer.short_description,
        image=(producer.images or [None])[0],
        category_names=[c.name for c in producer.categories],
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
    if require_approved and producer.status not in _INVITABLE_STATUSES:
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
    # A new link means a new verification round. Leaving a live code behind
    # would let one sent to the PREVIOUS link's holder be used against this
    # one, which is the whole thing minting a fresh token is meant to stop.
    _clear_code(producer)
    return token, producer.owner_invite_expires_at


def _clear_code(producer: Producer) -> None:
    """Drop the email code and its counter. Always all three together.

    Called on every event that ends the current verification round: a new
    code, a resend, a cancel, an acceptance. Clearing the hash alone would
    leave `owner_invite_code_attempts` to carry into the next code and expire
    it early.
    """
    producer.owner_invite_code_hash = None
    producer.owner_invite_code_expires_at = None
    producer.owner_invite_code_attempts = None


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
    # Only when she gave one: v3 lets the admin mint a link with no address at
    # all, and the owner then types her own on the page, where it is proven
    # with a code. An absent address cannot collide with anything.
    if body.email and _email_taken(db, body.email):
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
    # No address, no mail — and that is the normal case now, not a failure.
    # The admin copies the link and sends it on Instagram or WhatsApp; the
    # response carries it for exactly that.
    if email:
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
    # What makes an invite exist is its TOKEN, not an address — since v3 an
    # invite may legitimately have none. Keying this on the email would make
    # «resend» 404 for exactly the link the admin is most likely to re-copy.
    if not producer.owner_invite_token_hash:
        raise HTTPException(status_code=404, detail=_NO_INVITE)
    # NOT a 409 any more, and the reason is a v3 consequence the first version
    # missed: since the code endpoint, `owner_invite_email` may have been
    # written by WHOEVER HOLDS THE LINK, not by the admin. Refusing to resend
    # on a taken address therefore handed a link holder a way to strand the
    # admin's «שליחה מחדש» button for good — post one registered address and
    # every later resend is a 409 the admin cannot clear from this panel.
    #
    # What happens instead is what v3 already supports: the address is dropped
    # and the new link carries none. The invite stays usable, the owner types
    # her address on the page, and the acceptance meets the same 409 it always
    # would have. A constraint is added (the poisoned address stops being
    # anyone's), not removed. Found by the fresh reviewer on this PR.
    if producer.owner_invite_email and _email_taken(db, producer.owner_invite_email):
        logger.info(
            "owner_invite.resend_dropped_taken_email", producer_id=str(producer.id)
        )
        producer.owner_invite_email = None

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
    if email:
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
    # Including any live verification code: a cancelled invite that left one
    # behind would hand the next invite a code its holder never asked for.
    _clear_code(producer)
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
            Producer.status.in_(_INVITABLE_STATUSES),
        )
        .first()
    )


def _mint_code(producer: Producer) -> str:
    """A fresh 6-digit code. Only its sha256 reaches the row.

    `secrets.randbelow`, not `random`: this is a credential, and `random` is
    seeded predictably. Zero-padded so every code is six characters — a code
    rendered as "42" would be a different, shorter secret, and the page shows
    it in a fixed-width field.

    Stricter than the repo's existing OTP, which stores the code in plaintext
    (`PhoneOtpToken.code`, models.py). The reason to differ here is the blast
    radius: that code verifies a phone on a business its owner already holds;
    this one is the last gate before an account is created on a live page.
    """
    code = f"{secrets.randbelow(1_000_000):06d}"
    producer.owner_invite_code_hash = _hash_token(code)
    producer.owner_invite_code_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=OWNER_INVITE_CODE_TTL_MINUTES
    )
    producer.owner_invite_code_attempts = 0
    return code


@public_router.post("/email-code")
# 5/hour, **per IP and only per IP** — `rate_limit.limiter` is keyed on
# `get_real_client_ip` and this route does not override `key_func`.
#
# Said plainly because the first version of this comment claimed a per-token
# cap that does not exist (fresh-reviewer finding on this PR), and a wrong
# comment about a limit is worse than none: it is the sentence someone cites
# when deciding the abuse is already bounded. It is not. One link can cause
# more than five mails to addresses of the holder's choosing by rotating
# source IPs. A real per-token cap needs a counter on the row — the column is
# not in this card's schema, so it is a follow-up, named in the PR body.
@limiter.limit("5/hour")
def send_owner_invite_email_code(
    request: Request,
    body: OwnerInviteEmailCodeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Send a verification code to the address she typed.

    THE RESPONSE IS THE SAME WHATEVER HAPPENS — same status, same bytes —
    for an address that is free, one that already belongs to an account, and
    one whose send fails. The reason is specific: this endpoint takes an
    arbitrary address from anyone holding the link, so a different answer for
    "already registered" would turn it into an account-existence oracle for
    any address an attacker cares to try.

    What DOES differ is invisible from here: a registered address is not
    mailed and no code is stored, so the acceptance it would lead to fails at
    the 409 it was always going to fail at.

    An invalid link still 404s — that is a fact about the LINK, which the
    caller already holds, not about any address.
    """
    producer = _live_invite(db, body.token)
    if producer is None:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)

    ack = {"detail": "אם הכתובת תקינה, הקוד בדרך"}
    # The address is recorded either way: the page shows it back, and an
    # acceptance must match what was recorded.
    producer.owner_invite_email = body.email

    # A CODE IS MINTED EITHER WAY, and for a taken address it is simply never
    # sent. That looks like waste and is the opposite — it is what keeps the
    # uniform answer uniform PAST THIS ENDPOINT.
    #
    # The first version cleared the code for a taken address, which made this
    # response identical and the NEXT one different: `/accept` answers
    # `_BAD_CODE` when a code exists and the guess is wrong, and `_NO_CODE`
    # when none exists at all. So anyone holding one link could ask about any
    # address here, then read the answer off `/accept` — exactly the
    # account-existence oracle this endpoint's shape exists to deny, moved one
    # request to the right. Found by the fresh reviewer on this PR.
    #
    # With a code stored, a taken address and a free one both answer
    # `_BAD_CODE` to a wrong guess and `_NO_CODE` once the attempts run out.
    # The stored hash is unusable by anyone: it is never mailed, and a
    # correct-by-chance guess still meets the 409 at the email check.
    code = _mint_code(producer)
    if _email_taken(db, body.email):
        db.commit()
        logger.info(
            "owner_invite.code_skipped_taken_email", producer_id=str(producer.id)
        )
        return ack

    # Read before the commit expires the instance — the same note every other
    # writer in this module carries.
    business, test_cause = producer.name, bool(producer.is_test)
    p_id = producer.id
    db.commit()

    # producer_id only. Never the code, never the address.
    logger.info("owner_invite.code_sent", producer_id=str(p_id))
    background_tasks.add_task(
        send_owner_invite_code_email,
        body.email,
        business,
        code,
        test_cause=test_cause,
    )
    return ack


def _verify_email_code(
    db: Session, producer: Producer, email: str, code: str, now: datetime
) -> None:
    """v3: the address is proven to be READABLE, not proven to be hers.

    What this does establish: whoever is accepting controls the mailbox she
    named, because the code only exists there. What it does NOT establish, and
    an earlier version of this docstring implied it did: that she is the
    person the admin recorded at create time. The link is a bearer credential
    and the address on the row is whatever its holder last asked a code for
    (card v3 §13/§14). Comparing the body against the ROW is still the right
    comparison — it is what stops a code obtained for one address being spent
    on another within one session — but it binds the code to the address, not
    the invite to a person.

    The attempts counter is the only write a failed accept makes — the card's
    «בלי קוד תקף: אפס כתיבות מלבד המונה». Nothing here touches the token, the
    status, or `users`.
    """
    stored_hash = producer.owner_invite_code_hash
    expires = producer.owner_invite_code_expires_at
    attempts = producer.owner_invite_code_attempts or 0
    if (
        not stored_hash
        or expires is None
        or expires <= now
        or attempts >= OWNER_INVITE_CODE_MAX_ATTEMPTS
    ):
        # No code, expired, or walked to the cap — all one answer on purpose.
        # Distinguishing them tells a guesser which of the three states it is
        # in, and she needs the same next step in every case: ask for a code.
        raise HTTPException(status_code=422, detail=_NO_CODE)

    # The attempt is SPENT IN THE DATABASE BEFORE the comparison, by one
    # conditional UPDATE. The checks above read an unlocked row, so N parallel
    # requests would all see `attempts < MAX` and all get a comparison — the
    # cap would bound rounds, not guesses. Here the row decides: the UPDATE
    # only matches while the counter is under the cap and the code is live,
    # so at most MAX requests ever reach `compare_digest`, however many arrive
    # together. A correct guess spends an attempt too; the accept that follows
    # clears the code and the counter with it. Found by the fresh reviewer on
    # this PR (round 2).
    spent = (
        db.query(Producer)
        .filter(
            Producer.id == producer.id,
            Producer.owner_invite_code_hash.isnot(None),
            Producer.owner_invite_code_expires_at > now,
            func.coalesce(Producer.owner_invite_code_attempts, 0)
            < OWNER_INVITE_CODE_MAX_ATTEMPTS,
        )
        .update(
            {
                Producer.owner_invite_code_attempts: func.coalesce(
                    Producer.owner_invite_code_attempts, 0
                )
                + 1
            },
            synchronize_session=False,
        )
    )
    if spent == 0:
        producer_id = producer.id
        db.rollback()
        # Two reasons the row refused: the code ran out, or a concurrent
        # accept finished while this request waited on its row lock — and
        # then the link itself is spent. The second keeps the answer a used
        # link always gets (404), not "ask for a code" on a link that can no
        # longer take one.
        still_live = (
            db.query(Producer.id)
            .filter(
                Producer.id == producer_id,
                Producer.owner_invite_token_hash.isnot(None),
                Producer.owner_invite_accepted_at.is_(None),
            )
            .first()
        )
        if still_live is None:
            raise HTTPException(status_code=404, detail=_LINK_INVALID)
        raise HTTPException(status_code=422, detail=_NO_CODE)

    # Counted as an attempt either way, deliberately: trying addresses against
    # a live code is the same guessing this counter exists to bound.
    #
    # `compare_digest`, not `==`: both sides are hex digests of the same
    # length, so a byte-by-byte comparison is a timing oracle on a six-digit
    # secret — small enough for that to matter.
    if email != (producer.owner_invite_email or "").strip().lower() or (
        not secrets.compare_digest(_hash_token(code), stored_hash)
    ):
        # The spent attempt is the only write a failed accept makes.
        db.commit()
        raise HTTPException(status_code=422, detail=_BAD_CODE)


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
      3. The EMAIL CODE (v3), 422. She proves the address before anything
         else is spent on it, and a wrong guess costs one of five attempts —
         the counter is the only write a failed accept makes.
      4. The email-taken and has-owner checks, 409, BEFORE the claim — so the
         common race answers without having touched anything.
      5. The claim: ONE conditional UPDATE (MEH-1820), never SELECT-then-set.
      6. The INSERT, the publish if the business was hidden, then one commit.

    Steps 4 and 6 still race each other, and the backstop is NARROWER than it
    looks: the unique index on `users.email` is case-SENSITIVE, while
    `_email_taken` compares lowercased. So it catches an exact-case collision —
    rolling the whole transaction back, claim included, which is what keeps the
    409 free of writes and the link usable — and does NOT catch one that
    differs only in case. That gap is `users.email` having no case-insensitive
    index, which is repo-wide (`auth.py` looks accounts up with a raw `==`
    everywhere) and belongs to its own card; it is recorded here rather than
    half-fixed in one endpoint. Its blast radius is bounded: the racer's
    account does not own the business, only the invitee's does.

    The window itself is as small as it can be made — bcrypt moved above the
    check, so the only thing left between them is the UPDATE.
    """
    # Read before the claim so the failure modes above cost nothing, and so a
    # dead token's 404 is reached by the same path whatever the body contained.
    producer = _live_invite(db, body.token)
    if producer is None:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)
    # MEH-3137: the grower line is a consent, checked with the other consents —
    # before the code is spent, so a 422 leaves both the link and the code live.
    farmer_stamp = farmer_declaration_stamp_for_existing(
        db, producer, [c.id for c in producer.categories], body.farmer_declaration_accepted
    )

    invited_name = producer.owner_invite_name

    now = datetime.now(timezone.utc)
    _verify_email_code(db, producer, body.email, body.code, now)
    invited_email = body.email

    # MEH-306 / MEH-457: the full policy (deny-list + HIBP) is async and bcrypt
    # blocks, so both are awaited off the event loop exactly as reset_password
    # and register do.
    result = await validate_password(body.password)
    if not result.ok:
        raise HTTPException(status_code=422, detail={"failures": result.failures})

    # bcrypt BEFORE the uniqueness check, not after. It costs 200-400 ms, and
    # anything between the check and the INSERT is window — the first version
    # had the whole hash sitting in it. `register_producer` computes its hash
    # before its own existence lookup too (auth.py), for the neighbouring
    # reason that the two branches must take the same time.
    pwd_hash = await asyncio.to_thread(hash_password, body.password)

    if _email_taken(db, invited_email):
        raise HTTPException(status_code=409, detail=_EMAIL_TAKEN)

    # The invite is for a business with no owner, and `_load_invitable` refuses
    # one that has an owner at create / resend / cancel time. This is the same
    # check at ACCEPT time, which is what `producer_claim._claimable` does and
    # what this endpoint was missing. It is not exploitable today — no route
    # attaches an owner to an APPROVED row — but `users.producer_id` has no
    # unique index (producer_claim.py records that), so the invariant has no
    # backstop in the database. The day an ownership-transfer or merge tool
    # exists, this is the line that stops it minting a second owner.
    if _has_owner(db, producer.id):
        raise HTTPException(status_code=409, detail=_ALREADY_OWNED)

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
            Producer.status.in_(_INVITABLE_STATUSES),
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
                # MEH-3137: {} unless a grower category needed the line.
                **{getattr(Producer, k): v for k, v in farmer_stamp.items()},
                # v3: the page goes live in the SAME statement that claims the
                # token. Set unconditionally rather than only when the row
                # read `inactive`: both invitable statuses END at `approved`,
                # so writing the end state needs no read to be still true —
                # which is the whole point of doing it here and not after a
                # second SELECT.
                Producer.status: _LIVE_STATUS,
                # The code is spent with the token. Nothing may be accepted
                # twice, and a code left behind would outlive the invite it
                # belonged to.
                Producer.owner_invite_code_hash: None,
                Producer.owner_invite_code_expires_at: None,
                Producer.owner_invite_code_attempts: None,
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
        # v3: this rests on THE CODE, and on nothing else. It used to rest on
        # «she opened a link only this address received», which stopped being
        # true the moment an invite could travel on WhatsApp with no address
        # on it at all. The sentence is replaced rather than softened,
        # because the old one reads as an independent reason to trust the
        # address — i.e. as a reason the code step could be dropped as
        # friction. It cannot: remove the gate above and this flag is a lie.
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
    # Whether this acceptance PUBLISHED the page, read before the UPDATE's
    # end state can be refreshed into the session. Only a real transition
    # announces: an already-approved business's URL did not change, and
    # pinging it would claim a change that did not happen.
    published = producer.status == _HIDDEN_STATUS
    # Computed here for the same reason the three lines above are: after the
    # commit this row is expired, and `producer_urls` reads slug, kind and
    # is_test. It returns [] by itself for a test row (MEH-2952).
    p_urls = indexnow.producer_urls(producer)

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
    logger.info(
        "owner_invite.accepted",
        producer_id=str(p_id),
        user_id=str(user.id),
        published=published,
    )

    # MEH-2852: the page became public in this request, so the search engines
    # are told. After the commit, never before — a ping for a transaction that
    # then rolled back announces a page that is still hidden.
    if published:
        indexnow.schedule(background_tasks, p_urls)

    # The admin started this loop and nothing else closes it for her.
    background_tasks.add_task(
        notify_admin_owner_invite_accepted,
        p_name,
        user.email,
        published,
        test_cause=p_test,
    )

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
    # No email check any more: since v3 a live invite may legitimately carry
    # none, and `email=None` is what tells the page to render an empty,
    # editable field instead of a read-only address.
    if producer is None:
        raise HTTPException(status_code=404, detail=_LINK_INVALID)
    return OwnerInvitePublicOut(
        producer_name=producer.name,
        email=producer.owner_invite_email,
        requires_farmer_declaration=_requires_farmer_declaration(producer),
        # Accepting PUBLISHES a hidden business, and the page's button says so.
        will_publish=producer.status == _HIDDEN_STATUS,
        preview=_preview(producer),
    )
