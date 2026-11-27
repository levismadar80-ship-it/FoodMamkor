"""
Module:   draft_twins
Purpose:  Find the admin-prepared draft (ownerless, status `draft`) that is the
          same business as one its owner registered herself, and say WHY they
          match, so the admin can move the draft to the owner (MEH-3865).
Touches:  reads producers (identity columns) and users (email, phone,
          producer_id). Writes only the derived `draft_twin` attribute on the
          rows it is handed.
Does NOT: merge anything (routers/admin_draft_merge.py does, on the admin's
          click), tell the owner anything about the draft, or compare
          addresses or map positions (drafts rarely carry one yet).
Related:  services/producer_duplicates.py (phone_key, and the coarser
          «כפילות?» booleans) · services/business_name_key.py ·
          services/admin_producer_reads.py list_producers (caller).
History:  MEH-3865 (creation). Rules approved by Sapir 25/11: one strong
          signal (phone, the owner's login email = the draft's business email,
          Instagram, website domain, Facebook) is enough; a name signal
          (same name, or one name inside the other) counts only in the same
          city; a city or a category alone never matches.
          MEH-3884: the key functions moved to services/business_identity.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Producer, User

# MEH-3884: the keys and the strong reason codes live in business_identity
# (shared with the signup check); re-exported here for existing callers.
from app.services.business_identity import (  # noqa: F401 — re-exports
    EMAIL,
    FACEBOOK,
    INSTAGRAM,
    PHONE,
    WEBSITE,
    email_key,
    facebook_key,
    instagram_key,
    real_phone,
    website_key,
)
from app.services.business_name_key import name_key
from app.services.producer_duplicates import phone_key

# Reason codes of the name rule (the strong ones are imported above).
NAME_CITY = "name_city"
NAME_CONTAINS_CITY = "name_contains_city"

# The businesses a twin can be found for: owned and not yet decided. An
# approved page is live (URL, reviews, customers) and is not merged (MEH-3865).
OWNED_STATUSES = ("draft", "pending")

# A name inside another counts only when the shorter one is a real name:
# «מאפיית ארז» inside «מאפיית ארז וליאת», never «חלה» inside «חלה של שבת».
_MIN_CONTAINED_WORDS = 2


def _name_words(value: str | None) -> list[str]:
    return name_key(value or "").split()


def _contains(longer: list[str], shorter: list[str]) -> bool:
    """`shorter` appears in `longer` as whole consecutive words."""
    n = len(shorter)
    return any(longer[i : i + n] == shorter for i in range(len(longer) - n + 1))


def _name_reason(a: Any, b: Any) -> str | None:
    city_a, city_b = name_key(a.city or ""), name_key(b.city or "")
    if not city_a or city_a != city_b:
        return None
    wa, wb = _name_words(a.name), _name_words(b.name)
    if not wa or not wb:
        return None
    if wa == wb:
        return NAME_CITY
    shorter, longer = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
    if len(shorter) >= _MIN_CONTAINED_WORDS and _contains(longer, shorter):
        return NAME_CONTAINS_CITY
    return None


def _equal(a: str | None, b: str | None) -> bool:
    return a is not None and a == b


def twin_reasons(owned: Any, owner: Any | None, draft: Any) -> list[str]:
    """Why `draft` is the same business as `owned`, strongest first; [] = not.

    `owner` is the account that owns `owned` (its login email and its own
    phone count too). Any object with the Producer / User attribute names
    works, so the rule can be tested without a database.
    """
    reasons: list[str] = []
    draft_phone = real_phone(draft.phone)
    owned_phones = {phone_key(owned.phone), phone_key(getattr(owner, "phone", None))}
    if draft_phone is not None and draft_phone in owned_phones:
        reasons.append(PHONE)
    draft_email = email_key(draft.contact_email)
    owned_emails = {
        email_key(owned.contact_email),
        email_key(getattr(owner, "email", None)),
    }
    if draft_email is not None and draft_email in owned_emails:
        reasons.append(EMAIL)
    if _equal(instagram_key(draft.instagram), instagram_key(owned.instagram)):
        reasons.append(INSTAGRAM)
    if _equal(website_key(draft.website), website_key(owned.website)):
        reasons.append(WEBSITE)
    if _equal(facebook_key(draft.facebook), facebook_key(owned.facebook)):
        reasons.append(FACEBOOK)
    name_reason = _name_reason(owned, draft)
    if name_reason:
        reasons.append(name_reason)
    return reasons


@dataclass
class Twin:
    """One match: the ownerless draft and the business its owner registered."""

    draft_id: UUID
    target_id: UUID
    draft_name: str
    target_name: str
    reasons: list[str] = field(default_factory=list)


_IDENTITY = (
    Producer.id,
    Producer.name,
    Producer.city,
    Producer.phone,
    Producer.contact_email,
    Producer.instagram,
    Producer.website,
    Producer.facebook,
    Producer.status,
    Producer.kind,
    Producer.is_test,
    Producer.created_at,
)


def _ownerless_drafts(db: Session) -> list[Any]:
    owned_ids = db.query(User.producer_id).filter(User.producer_id.isnot(None))
    return (
        db.query(*_IDENTITY)
        .filter(Producer.status == "draft", Producer.id.notin_(owned_ids))
        .order_by(Producer.created_at, Producer.id)
        .all()
    )


def _owned_candidates(db: Session) -> list[tuple[Any, Any]]:
    """(business, its first owner by id) for every owned draft / pending row."""
    rows = (
        db.query(
            *_IDENTITY,
            User.id.label("owner_id"),
            User.email,
            User.phone.label("owner_phone"),
        )
        .join(User, User.producer_id == Producer.id)
        .filter(Producer.status.in_(OWNED_STATUSES))
        .order_by(Producer.id, User.id)
        .all()
    )
    seen: set[UUID] = set()
    out: list[tuple[Any, Any]] = []
    for r in rows:
        if r.id in seen:
            continue
        seen.add(r.id)
        out.append((r, _Owner(email=r.email, phone=r.owner_phone)))
    return out


@dataclass
class _Owner:
    email: str | None
    phone: str | None


def all_twins(db: Session) -> list[Twin]:
    """Every (ownerless draft, owned business) pair that matches. Two queries."""
    drafts = _ownerless_drafts(db)
    if not drafts:
        return []
    twins: list[Twin] = []
    for owned, owner in _owned_candidates(db):
        for d in drafts:  # oldest draft first
            # The merge refuses these (admin_draft_merge KIND_MISMATCH): no tag.
            if (
                d.id == owned.id
                or d.kind != owned.kind
                or bool(d.is_test) != bool(owned.is_test)
            ):
                continue
            reasons = twin_reasons(owned, owner, d)
            if reasons:
                twins.append(Twin(d.id, owned.id, d.name, owned.name, reasons))
    return twins


def twins_for(db: Session, producer_id: UUID) -> list[Twin]:
    """The drafts that match this one owned business (submit-for-review)."""
    return [t for t in all_twins(db) if t.target_id == producer_id]


def attach_draft_twins(db: Session, producers: list[Any]) -> None:
    """Set `draft_twin` on each admin row: the first match it is part of.

    An owned row points at its oldest matching draft; an ownerless draft row
    points at the first business that matches it. Rows with none keep None.
    """
    by_target: dict[UUID, Twin] = {}
    by_draft: dict[UUID, Twin] = {}
    for twin in all_twins(db):
        by_target.setdefault(twin.target_id, twin)
        by_draft.setdefault(twin.draft_id, twin)
    for p in producers:
        t: Twin | None = by_target.get(p.id) or by_draft.get(p.id)
        if t is None:
            p.draft_twin = None
            continue
        p.draft_twin = {
            "draft_id": t.draft_id,
            "target_id": t.target_id,
            "draft_name": t.draft_name,
            "target_name": t.target_name,
            "reasons": t.reasons,
        }
