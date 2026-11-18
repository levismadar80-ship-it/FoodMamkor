"""
Module:   page_freshness
Purpose:  The monthly "is everything on your page still correct?" email to a
          live business's owner, and the signed link whose «כן, הכול נכון»
          stamps `last_confirmed_at`. Owners are the source of truth for their
          own page (the Yext model); this asks them on a schedule instead of
          waiting for the page to go stale.
Touches:  reads producers + users; writes producers.freshness_email_sent_at
          (claim stamp) and producers.last_confirmed_at (confirm); sends via
          app.services.email.send_email (Resend, fail-open).
Does NOT: hold the scheduler (app.startup's daily tick calls
          send_freshness_emails); expose any HTTP route
          (routers/page_freshness.py); read or store anything from Google.
Related:  backend/app/services/weekly_owner_summary.py (the claim / unclaim /
          per-business fail-isolation shape this copies),
          backend/app/services/draft_preview.py (token shape).
History:  Page freshness (creation, 18/11/2026).
"""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from joserfc import jwt as jose_jwt
from joserfc.errors import JoseError
from joserfc.jwt import JWTClaimsRegistry
from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.auth import _jwt_key
from app.config import settings
from app.models import Producer, User
from app.services.email import send_email

logger = logging.getLogger(__name__)

# One email a month at most, and none while the owner confirmed within it.
FRESHNESS_WINDOW = timedelta(days=30)
# The admin "stale" view: not confirmed for this long.
STALE_AFTER = timedelta(days=60)
# The link in the email stays usable for three weeks.
CONFIRM_TTL = timedelta(days=21)
CONFIRM_SCOPE = "page_freshness_confirm"
CONFIRM_PATH = "/freshness/confirm"
DASHBOARD_PATH = "/producer/dashboard"


def freshness_enabled() -> bool:
    """Off until Sapir turns it on. `config.py` is denied to Claude Code, so
    the field `page_freshness_enabled: bool = False` is added by her from the
    patch in the PR body; until then this reads False rather than raising."""
    return bool(getattr(settings, "page_freshness_enabled", False))


# ---------------------------------------------------------------------------
# Copy — DRAFT, pending Sapir's word-for-word approval (workflow rule 22).
# ---------------------------------------------------------------------------
SUBJECT = "העמוד של {name} במהמקור: הכול עדיין נכון?"
BODY = """\
היי {name},

פעם בחודש אנחנו מוודאים שהעמוד שלך מעודכן, כדי שלקוחות יקבלו מידע נכון. השעות, המשלוחים, המחירים ודרכי הקשר עדיין נכונים?

כן, הכול נכון:
{confirm_url}

רוצה לעדכן:
{dashboard_url}

ספיר שנפ
מייסדת | מהמקור
"""


def build_email(name: str, confirm_url: str, dashboard_url: str) -> tuple[str, str]:
    """(subject, plain body). `str.replace`, not `.format`, on the business
    name: a name with braces must not raise inside the send loop."""
    subject = SUBJECT.replace("{name}", name)
    body = (
        BODY.replace("{name}", name)
        .replace("{confirm_url}", confirm_url)
        .replace("{dashboard_url}", dashboard_url)
    )
    return subject, body


# ---------------------------------------------------------------------------
# The signed confirm link. Its own scope: it cannot claim, preview or log in.
# ---------------------------------------------------------------------------


def create_confirm_token(producer_id: UUID, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    payload = {
        "producer_id": str(producer_id),
        "iat": int(now.timestamp()),
        "exp": now + CONFIRM_TTL,
        "scope": CONFIRM_SCOPE,
    }
    token: str = jose_jwt.encode({"alg": settings.algorithm}, payload, _jwt_key())
    return token


def decode_confirm_token(token: str) -> UUID | None:
    """The producer id, or None on ANY failure (signature, expiry, missing
    `exp`, other scope, malformed id). Never raises."""
    try:
        token_obj = jose_jwt.decode(token, _jwt_key(), algorithms=[settings.algorithm])
        JWTClaimsRegistry(exp={"essential": True}).validate(token_obj.claims)
    except (JoseError, ValueError):
        return None
    claims: Any = token_obj.claims
    if claims.get("scope") != CONFIRM_SCOPE:
        return None
    try:
        return UUID(str(claims.get("producer_id")))
    except (TypeError, ValueError):
        return None


def confirm(db: Session, producer_id: UUID, now: datetime | None = None) -> Any:
    """Stamp `last_confirmed_at` on a live business. Returns the row, or None
    when the business is gone or no longer live. Idempotent: a second press
    just moves the stamp."""
    now = now or datetime.now(timezone.utc)
    row: Any = (
        db.query(Producer)
        .filter(Producer.id == producer_id, _is_business())
        .with_for_update()
        .first()
    )
    if row is None:
        return None
    row.last_confirmed_at = now
    db.commit()
    return row


# ---------------------------------------------------------------------------
# The monthly job.
# ---------------------------------------------------------------------------


def _is_business() -> Any:
    """`producer_listing.is_business()`: THE live-business rule (ADR-036).
    Loaded by name for the same mypy reason as weekly_owner_summary."""
    return importlib.import_module("app.services.producer_listing").is_business()


def _owner(db: Session, producer_id: Any) -> Any:
    """The business's earliest account with a verified email, or None."""
    owner: Any = (
        db.query(User)
        .filter(
            User.producer_id == producer_id,
            User.email.isnot(None),
            User.email_verified.is_(True),
            User.is_blocked.isnot(True),
        )
        .order_by(User.created_at.asc())
        .first()
    )
    return owner


def _due(now: datetime) -> Any:
    """SQL: confirmed and emailed neither within the window."""
    cutoff = now - FRESHNESS_WINDOW
    return or_(
        Producer.last_confirmed_at.is_(None), Producer.last_confirmed_at < cutoff
    ) & or_(
        Producer.freshness_email_sent_at.is_(None),
        Producer.freshness_email_sent_at < cutoff,
    )


def stale_clause(now: datetime | None = None) -> Any:
    """SQL for the admin view: a live business, older than STALE_AFTER, whose
    owner has not confirmed within it. Includes ownerless pages, which never
    get the email: those are the ones to call."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - STALE_AFTER
    old = cutoff.astimezone(timezone.utc).replace(tzinfo=None)
    return (
        _is_business()
        & (Producer.created_at < old)
        & or_(Producer.last_confirmed_at.is_(None), Producer.last_confirmed_at < cutoff)
    )


@dataclass(frozen=True)
class _Candidate:
    id: Any
    name: str
    test_business: bool
    sent_at: Any


def _candidates(db: Session, now: datetime) -> list[_Candidate]:
    # created_at is naive UTC; a business younger than a month is not asked.
    young = (now - FRESHNESS_WINDOW).astimezone(timezone.utc).replace(tzinfo=None)
    rows: list[Any] = (
        db.query(
            Producer.id,
            Producer.name,
            Producer.is_test,
            Producer.freshness_email_sent_at,
        )
        .filter(_is_business(), Producer.created_at < young, _due(now))
        .order_by(Producer.id)
        .all()
    )
    return [
        _Candidate(id=r[0], name=r[1] or "", test_business=bool(r[2]), sent_at=r[3])
        for r in rows
    ]


def _claim(db: Session, producer_id: Any, now: datetime) -> bool:
    """Atomically stamp the row for this run; True only for the winner. The
    WHERE re-checks the window inside the UPDATE, so a parallel run gets 0."""
    stmt = (
        update(Producer)
        .where(Producer.id == producer_id, _due(now))
        .values(freshness_email_sent_at=now)
        .returning(Producer.id)
        .execution_options(synchronize_session=False)
    )
    won = db.execute(stmt).first() is not None
    db.commit()
    return won


def _unclaim(db: Session, producer_id: Any, now: datetime, previous: Any) -> None:
    db.execute(
        update(Producer)
        .where(Producer.id == producer_id, Producer.freshness_email_sent_at == now)
        .values(freshness_email_sent_at=previous)
        .execution_options(synchronize_session=False)
    )
    db.commit()


def send_freshness_emails(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Send this month's emails. Fail-isolated per business; never raises for
    one business's failure. A business with no verified owner email is skipped
    and NOT stamped: it shows in the admin stale view instead."""
    counters = {
        "scanned": 0,
        "sent": 0,
        "no_owner": 0,
        "already_claimed": 0,
        "failed": 0,
    }
    if not freshness_enabled():
        return counters
    now = now or datetime.now(timezone.utc)
    base = settings.frontend_url.rstrip("/")
    for cand in _candidates(db, now):
        pid = cand.id
        counters["scanned"] += 1
        claimed = False
        try:
            owner = _owner(db, pid)
            if owner is None:
                counters["no_owner"] += 1
                continue
            owner_email = owner.email
            owner_is_test = bool(owner.is_test)
            if not _claim(db, pid, now):
                counters["already_claimed"] += 1
                continue
            claimed = True
            token = create_confirm_token(pid, now)
            subject, body = build_email(
                cand.name,
                confirm_url=f"{base}{CONFIRM_PATH}?token={token}",
                dashboard_url=f"{base}{DASHBOARD_PATH}",
            )
            # send_email is fail-open and never raises: from here the stamp
            # means "handed to the sender", as in weekly_owner_summary.
            send_email(
                owner_email,
                subject,
                body,
                test_cause=cand.test_business or owner_is_test,
            )
            counters["sent"] += 1
        except Exception:  # noqa: BLE001 — one business never stops the run
            db.rollback()
            counters["failed"] += 1
            logger.warning("[PAGE-FRESHNESS] producer_id=%s failed", pid, exc_info=True)
            if claimed:
                try:
                    _unclaim(db, pid, now, cand.sent_at)
                except Exception:  # noqa: BLE001
                    db.rollback()
                    logger.warning(
                        "[PAGE-FRESHNESS] producer_id=%s claim not undone",
                        pid,
                        exc_info=True,
                    )
    return counters
