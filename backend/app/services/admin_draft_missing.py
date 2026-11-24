"""
Module:   admin_draft_missing
Purpose:  For a draft its owner has claimed («נקלט, בהשלמה»), say what is
          still missing before she can send it for review, so the admin's
          follow-up call is about one thing (MEH-3409).
Touches:  events (one COUNT … GROUP BY for organizer drafts only); users (one
          read of the owners' email_verified for business drafts, MEH-3660).
Does NOT: decide what is required — submission_gate.submission_missing_items
          is the one definition; this only feeds it batched facts.
Related:  routers/admin.py list route (services/admin_producer_reads.attach_has_owner runs first),
          services/pending_nudge.py (the same list, in the reminder emails).
History:  MEH-3409 (creation); MEH-3660 (batched owner email read).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Event, User
from app.services.submission_gate import submission_missing_items
from app.utils.clock import israel_today


def attach_draft_missing(db: Session, producers: Sequence[Any]) -> None:
    """Set `draft_missing` on every claimed draft in `producers`.

    Must run after `services/admin_producer_reads.py::attach_has_owner`: an unclaimed draft is waiting for its
    owner, not for content, so it keeps None (the row shows nothing). The
    business checks read collections the list route already eager-loads;
    organizer drafts need their upcoming events, counted here in ONE query so
    the list's query count does not grow with the number of rows.
    """
    claimed = [
        p
        for p in producers
        if p.status == "draft" and getattr(p, "has_owner", None) is True
    ]
    if not claimed:
        return
    organizer_ids = [
        p.id for p in claimed if getattr(p, "kind", "producer") == "organizer"
    ]
    counts: dict[Any, int] = {}
    if organizer_ids:
        rows = (
            db.query(Event.producer_id, func.count(Event.id))
            .filter(
                Event.producer_id.in_(organizer_ids),
                Event.is_active.is_(True),
                Event.event_date >= israel_today(),
            )
            .group_by(Event.producer_id)
            .all()
        )
        counts = {pid: int(n) for pid, n in rows}
    # MEH-3660: the owner's email confirmation, for every business draft in
    # ONE query — same reason as the events count above.
    business_ids = [p.id for p in claimed if p.id not in organizer_ids]
    verified: set[Any] = set()
    if business_ids:
        verified = {
            pid
            for (pid,) in db.query(User.producer_id)
            .filter(User.producer_id.in_(business_ids), User.email_verified.is_(True))
            .all()
        }
    for p in claimed:
        if p.id in organizer_ids:
            p.draft_missing = submission_missing_items(
                p, upcoming_events=counts.get(p.id, 0)
            )
        else:
            p.draft_missing = submission_missing_items(
                p, email_verified=p.id in verified
            )
