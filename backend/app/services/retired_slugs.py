"""MEH-2528 — tombstones for public business URLs (`retired_slugs`).

A slug that was ever public stays out of circulation after its business is
deleted or renamed, so an old link can never lead to a different business.
The model docstring (`RetiredSlug`, models.py) has the why; this module is
the only writer and the only reader.

Who calls it:
  - `retire_slug(..., "deleted")`  — admin_delete_producer (routers/admin.py)
    and delete_account (auth.py), before `db.delete(producer)`.
  - `retire_slug(..., "renamed")`  — admin_update_producer, when the slug
    changes.
  - `is_retired`                    — `_ensure_unique_slug` (routers/admin.py),
    the single choke point every producer slug passes through.
  - `reclaim`                       — admin_update_producer, when a business
    goes back to a slug it retired itself.
  - `is_gone`                       — GET /producers/by-slug (MEH-2534), to
    answer 410 instead of 404 for the URL of a deleted business.

A new writer of `producers.slug` MUST take its value from
`_ensure_unique_slug`: that call is the only place a tombstone is honoured,
so a slug assigned around it can still land on a retired URL.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.models import Producer


# A draft was never on the site, so its slug never appeared in a link — and
# reserving it would only push a re-created business onto `-2`. Every other
# status is reserved, on purpose: reserving too much costs a suffix, reserving
# too little hands a live link to another business.
_NEVER_PUBLIC_STATUSES = frozenset({"draft"})


def retire_slug(db: "Session", producer: "Producer", reason: str) -> None:
    """Record `producer.slug` as retired. No-op without a slug or for a draft.

    `reason="deleted"` stores no owner: the row is about to be deleted in the
    same transaction, and the FK would be nulled by ON DELETE SET NULL anyway.
    `reason="renamed"` keeps the owner, so a later redirect can follow it.
    An existing tombstone for the slug is overwritten — the latest event wins.
    """
    from app.models.models import RetiredSlug

    if reason not in ("deleted", "renamed"):
        raise ValueError(f"unknown retire reason: {reason!r}")
    if not producer.slug or producer.status in _NEVER_PUBLIC_STATUSES:
        return
    owner_id = producer.id if reason == "renamed" else None
    row = db.get(RetiredSlug, producer.slug)
    if row is None:
        db.add(RetiredSlug(slug=producer.slug, producer_id=owner_id, reason=reason))
    else:
        row.producer_id = owner_id
        row.reason = reason
    db.flush()


def is_retired(db: "Session", slug: str, owner_id: UUID | None = None) -> bool:
    """True when `slug` is reserved against `owner_id`.

    A business may return to a slug it retired itself (`owner_id` matches the
    tombstone's producer), so that tombstone does not count against it.
    """
    from app.models.models import RetiredSlug

    row = db.get(RetiredSlug, slug)
    if row is None:
        return False
    return owner_id is None or row.producer_id != owner_id


def reclaim(db: "Session", slug: str, owner_id: UUID) -> None:
    """Drop the tombstone a business left on `slug`, now that it uses it again."""
    from app.models.models import RetiredSlug

    row = db.get(RetiredSlug, slug)
    if row is not None and row.producer_id == owner_id:
        db.delete(row)
        db.flush()


def is_gone(db: "Session", slug: str) -> bool:
    """MEH-2534 — True when `slug` was the URL of a business that was deleted.

    Only an ownerless tombstone counts: a renamed slug whose business still
    exists is not "gone" (it moved), and stays a plain 404 until a redirect
    is built. Callers ask this only after the live lookup missed.
    """
    from app.models.models import RetiredSlug

    row = db.get(RetiredSlug, slug)
    return row is not None and row.producer_id is None
