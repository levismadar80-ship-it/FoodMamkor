"""
Module:   business_identity
Purpose:  The one answer to «is this already a business we have?». Compares
          the strong identity signals (phone, email, Instagram, website,
          Facebook) of a business being created against EVERY business in the
          table: any status, with an owner or without (MEH-3884).
Touches:  reads producers (identity columns, both phones, the owner-invite
          email), users (email, phone, producer_id) and producer_staff
          (pending / active invited_email). Writes nothing; queue_identity_alerts queues admin
          emails (Resend, via draft_merge_emails).
Does NOT: compare names or cities (draft_twins adds those for its own,
          narrower rule; a shared name alone is two businesses as often as
          one), block anything, or merge anything (routers/admin_draft_merge.py).
Related:  services/draft_twins.py (imports the keys from here) ·
          services/producer_duplicates.py phone_key ·
          routers/producer_identity_check.py (signup warning) ·
          routers/auth_register_producer.py + routers/producer_me_review.py
          (admin email).
History:  MEH-3865 (the key functions, in draft_twins). MEH-3884 (creation:
          keys moved here; the check covers owned businesses too, after
          Farmerim's staff member opened a second business on 26/11).
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models import Producer, User
from app.models.producer_staff import ProducerStaff
from app.services.producer_duplicates import phone_key

logger = logging.getLogger(__name__)

# Reason codes, strongest first. draft_twins and the admin email use the same.
PHONE = "phone"
EMAIL = "email"
INSTAGRAM = "instagram"
WEBSITE = "website"
FACEBOOK = "facebook"

_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*://")
# A link on a shared host is not a website of its own.
_SHARED_HOSTS = frozenset(
    {
        "instagram.com",
        "facebook.com",
        "fb.com",
        "linktr.ee",
        "wa.me",
        "api.whatsapp.com",
        "tiktok.com",
        "google.com",
        "goo.gl",
        "maps.app.goo.gl",
        "sites.google.com",
        "docs.google.com",
        "forms.gle",
        "bit.ly",
        "tinyurl.com",
        "wa.link",
        "t.me",
        "taplink.cc",
        "linkin.bio",
        "lnk.bio",
        "beacons.ai",
        "youtube.com",
        "youtu.be",
        "vm.tiktok.com",
        "m.facebook.com",
        "wolt.com",
    }
)
# A first path segment that is not an account: a post, a reel, a share link.
_INSTAGRAM_RESERVED = frozenset({"p", "reel", "reels", "tv", "explore", "stories", "s"})
# Facebook paths whose account is in the NEXT segment (or, for profile.php, in ?id=).
_FACEBOOK_NESTED = frozenset({"pages", "groups", "people", "pg"})
_FACEBOOK_RESERVED = frozenset(
    {
        "share",
        "sharer",
        "sharer.php",
        "watch",
        "events",
        "photo",
        "story.php",
        "permalink.php",
    }
)
# A dummy number typed to get past a required field («050-0000000»): at most
# two distinct digits never identifies a business.
_MIN_PHONE_DIGITS_DISTINCT = 3


def instagram_key(value: str | None) -> str | None:
    """`@Erez.Bakery`, `instagram.com/erez.bakery/` and the full URL → `erez.bakery`."""
    v = (value or "").strip().lower()
    v = _SCHEME.sub("", v)
    v = v.split("?", 1)[0].split("#", 1)[0]
    for prefix in ("www.instagram.com/", "instagram.com/", "m.instagram.com/"):
        if v.startswith(prefix):
            v = v[len(prefix) :]
            break
    v = v.strip("/").lstrip("@")
    v = v.split("/", 1)[0]
    if v in _INSTAGRAM_RESERVED:
        return None
    return v or None


def website_key(value: str | None) -> str | None:
    """The host without `www.`: `https://www.Erez.co.il/shop` → `erez.co.il`.

    A link to a shared host (an Instagram, Facebook or Linktree page) is not a
    website of its own and never matches on the host alone.
    """
    v = (value or "").strip().lower()
    v = _SCHEME.sub("", v)
    host = v.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0].split(":", 1)[0]
    host = host.removeprefix("www.")
    if "." not in host or host in _SHARED_HOSTS:
        return None
    return host


def facebook_key(value: str | None) -> str | None:
    """`https://www.facebook.com/ErezBakery/` → `erezbakery`.

    `profile.php?id=1` → `id:1`; `pages/Name/123` → `name`. A share or post
    link names no account and never matches.
    """
    v = (value or "").strip().lower()
    v = _SCHEME.sub("", v)
    for prefix in ("www.facebook.com/", "facebook.com/", "m.facebook.com/", "fb.com/"):
        if v.startswith(prefix):
            v = v[len(prefix) :]
            break
    else:
        return None
    path, _, query = v.partition("?")
    path = path.split("#", 1)[0]
    parts = [p for p in path.split("/") if p]
    if not parts:
        return None
    if parts[0] == "profile.php":
        ids = [q[3:] for q in query.split("&") if q.startswith("id=") and q[3:]]
        return f"id:{ids[0]}" if ids else None
    if parts[0] in _FACEBOOK_NESTED:
        return parts[1] if len(parts) > 1 else None
    if parts[0] in _FACEBOOK_RESERVED:
        return None
    return parts[0]


def email_key(value: str | None) -> str | None:
    v = (value or "").strip().lower()
    return v if "@" in v else None


def real_phone(value: str | None) -> str | None:
    """phone_key, minus a dummy number (fewer than 3 distinct digits)."""
    key = phone_key(value)
    if key is None or len(set(key)) < _MIN_PHONE_DIGITS_DISTINCT:
        return None
    return key


def mask_email(value: str | None) -> str | None:
    """`order@farmerim.com` → `o***@farmerim.com`. The domain stays: it is what
    tells a staff member WHICH account (the shop's own, or a private Gmail)."""
    v = email_key(value)
    if v is None:
        return None
    local, _, domain = v.rpartition("@")
    if not local or not domain:
        return None
    # A 1–2 letter address would be shown whole or nearly so: hide all of it.
    head = local[0] if len(local) > 2 else ""
    return f"{head}***@{domain}"


@dataclass
class Identity:
    """The keys of one business plus its accounts. Sets, so a business with
    two phones (its own and its owner's) matches on either."""

    phones: set[str] = field(default_factory=set)
    # The linked accounts' own phones: never published, so an anonymous
    # caller is not matched on them (rule-5a review, MEH-3884).
    account_phones: set[str] = field(default_factory=set)
    emails: set[str] = field(default_factory=set)
    instagram: str | None = None
    website: str | None = None
    facebook: str | None = None


def identity_of(
    *,
    phones: Iterable[str | None] = (),
    emails: Iterable[str | None] = (),
    instagram: str | None = None,
    website: str | None = None,
    facebook: str | None = None,
) -> Identity:
    return Identity(
        phones={k for k in (real_phone(p) for p in phones) if k},
        emails={k for k in (email_key(e) for e in emails) if k},
        instagram=instagram_key(instagram),
        website=website_key(website),
        facebook=facebook_key(facebook),
    )


def identity_reasons(
    a: Identity, b: Identity, *, account_phones: bool = True
) -> list[str]:
    """Why `a` and `b` are the same business, strongest first; [] = not.

    Symmetric. One strong signal is enough (Sapir 25/11, MEH-3865).
    `account_phones=False` compares only the businesses' own phones.
    """
    reasons: list[str] = []
    pa, pb = set(a.phones), set(b.phones)
    if account_phones:
        pa |= a.account_phones
        pb |= b.account_phones
    if pa & pb:
        reasons.append(PHONE)
    if a.emails & b.emails:
        reasons.append(EMAIL)
    for code, x, y in (
        (INSTAGRAM, a.instagram, b.instagram),
        (WEBSITE, a.website, b.website),
        (FACEBOOK, a.facebook, b.facebook),
    ):
        if x is not None and x == y:
            reasons.append(code)
    return reasons


@dataclass
class IdentityMatch:
    """One existing business that looks like the one being checked."""

    producer_id: UUID
    name: str
    status: str | None
    owner_email: str | None  # the oldest linked account; None = no owner
    reasons: list[str]


def _existing(db: Session) -> dict[UUID, tuple[Any, Identity, str | None]]:
    """Every business with its identity (its own contacts + every linked account)."""
    rows = db.query(
        Producer.id,
        Producer.name,
        Producer.status,
        Producer.is_test,
        Producer.phone,
        Producer.secondary_phone,
        Producer.contact_email,
        Producer.owner_invite_email,
        Producer.instagram,
        Producer.website,
        Producer.facebook,
    ).all()
    out: dict[UUID, tuple[Any, Identity, str | None]] = {}
    for r in rows:
        # Farmerim 26/11: the staff member's phone was the page's SECOND phone,
        # and the owner-invite address is the business's own as much as its
        # contact email is.
        ident = identity_of(
            phones=[r.phone, r.secondary_phone],
            emails=[r.contact_email, r.owner_invite_email],
            instagram=r.instagram,
            website=r.website,
            facebook=r.facebook,
        )
        out[r.id] = (r, ident, None)
    accounts = (
        db.query(User.producer_id, User.email, User.phone)
        .filter(User.producer_id.isnot(None))
        .order_by(User.producer_id, User.created_at, User.id)
        .all()
    )
    for pid, email, phone in accounts:
        entry = out.get(pid)
        if entry is None:
            continue
        r, ident, owner_email = entry
        if (k := real_phone(phone)) is not None:
            ident.account_phones.add(k)
        if (k := email_key(email)) is not None:
            ident.emails.add(k)
        out[pid] = (r, ident, owner_email or email)
    # Staff (pending or active) are the business too: a staff member who signs
    # up on her own is the exact Farmerim case. Not an owner, so not shown as one.
    # A pending invite counts only while it can still be accepted.
    staff = db.query(ProducerStaff.producer_id, ProducerStaff.invited_email).filter(
        or_(
            ProducerStaff.status == "active",
            and_(
                ProducerStaff.status == "pending",
                ProducerStaff.expires_at > datetime.now(timezone.utc),
            ),
        )
    )
    for pid, email in staff.all():
        entry = out.get(pid)
        if entry is not None and (k := email_key(email)) is not None:
            entry[1].emails.add(k)
    return out


def identity_matches(
    db: Session,
    candidate: Identity,
    *,
    exclude_id: UUID | None = None,
    is_test: bool = False,
    account_phones: bool = True,
) -> list[IdentityMatch]:
    """Every business that shares a strong signal with `candidate`.

    The order is strongest reason count, then name, so the answer is stable.
    A test business is compared only with test businesses (MEH-2952), and a
    business never matches itself. `account_phones=False` for an anonymous
    caller: the owners' private phones are not matched on.
    """
    return _match(
        _existing(db), candidate, (exclude_id, is_test), account_phones=account_phones
    )


def _match(
    existing: dict[UUID, tuple[Any, Identity, str | None]],
    candidate: Identity,
    scope: tuple[UUID | None, bool],
    *,
    account_phones: bool = True,
) -> list[IdentityMatch]:
    exclude_id, is_test = scope
    matches: list[IdentityMatch] = []
    for pid, (r, ident, owner_email) in existing.items():
        if pid == exclude_id or bool(r.is_test) != bool(is_test):
            continue
        reasons = identity_reasons(candidate, ident, account_phones=account_phones)
        if reasons:
            matches.append(IdentityMatch(pid, r.name, r.status, owner_email, reasons))
    matches.sort(key=lambda m: (-len(m.reasons), m.name or "", str(m.producer_id)))
    return matches


def matches_for_producer(db: Session, producer_id: UUID) -> list[IdentityMatch]:
    """The other businesses that look like this stored one (its own + its accounts)."""
    existing = _existing(db)
    entry = existing.get(producer_id)
    if entry is None:
        return []
    r, ident, _ = entry
    return _match(existing, ident, (producer_id, bool(r.is_test)))


@dataclass
class AlertContext:
    """When the admin email is sent: `moment` is "signup" or "submit"."""

    moment: str
    test_cause: bool = False
    skip_ids: tuple[UUID, ...] = ()


def queue_identity_alerts(
    db: Session,
    background_tasks: Any,
    producer_id: UUID,
    ctx: AlertContext,
) -> None:
    """After a business was created or sent for review: ONE admin email that
    lists every existing business that looks like it. Never raises — the
    caller's write is already committed, and a failed lookup must not turn it
    into a 500 (the session is rolled back so the caller can keep reading)."""
    # Imported here: the email module pulls settings and the mail sender,
    # which the pure rule above does not need.
    from app.services.draft_merge_emails import notify_admin_identity_matches

    try:
        name = db.query(Producer.name).filter(Producer.id == producer_id).scalar()
        matches = [
            m
            for m in matches_for_producer(db, producer_id)
            if m.producer_id not in ctx.skip_ids
        ]
    except Exception:  # noqa: BLE001 — fire-and-forget, logged with context
        logger.exception("[MEH-3884] identity lookup failed for %s", producer_id)
        db.rollback()
        return
    if matches:
        background_tasks.add_task(
            notify_admin_identity_matches,
            name or "",
            matches,
            ctx.moment,
            test_cause=ctx.test_cause,
        )
