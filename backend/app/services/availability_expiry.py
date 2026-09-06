"""
Module:   availability_expiry
Purpose:  Reset every producer stuck on availability_state='full_this_week'
          back to 'accepting_orders' at the Israel-week rollover, so the
          "עמוסה השבוע" banner cannot outlive the week it names (MEH-1828,
          option A — Sapir's 02/08 default: scheduler reset, no schema).
Touches:  DB table `producers`, ONE column: availability_state. It used to
          write three — MEH-2271 made the legacy pair a derived view, so
          writing them here would be a second authority over one fact.
Does NOT: decide WHEN to run — the CronTrigger in startup.py owns timing
          (Israel Sunday 00:10). It also does not touch on_vacation /
          vacation_until; that flow has its own read-time auto-clear
          (schemas.py, MEH-155) and is deliberately untouched here.
Related:  backend/app/schemas/schemas.py (state_to_legacy — the one owner
          of the enum→legacy mapping, called only by the ProducerListOut
          derivation); backend/app/startup.py (job wiring).
History:  MEH-1828 (creation) · MEH-2271 (MEH-1854 chunk 3a — state-only write).
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models.models import Producer

logger = logging.getLogger(__name__)

# The state this module expires, and the state it restores. Named so the
# query below and the tests read against the same strings.
EXPIRED_STATE = "full_this_week"
RESET_STATE = "accepting_orders"


def reset_expired_full_week(db: Session) -> int:
    """Reset every 'full_this_week' producer to 'accepting_orders'. Returns
    the number of rows changed. Commits on success, rolls back on failure.

    Deliberately UNCONDITIONAL — no weekday check in here. The scheduler
    trigger (Israel Sunday 00:10, startup.py) is the sole owner of "when";
    this function is the sole owner of "what". Splitting it that way keeps
    the function honest to call from a test on any weekday, and means a
    weekday guard can never silently turn a late-fired job into a no-op.

    MEH-1828 Phase 0 found the write was THREE columns, because the legacy
    pair was still read off the row. MEH-2271 (MEH-1854 chunk 3a) inverted
    that: `availability_state` is the only column written anywhere, and
    ProducerListOut derives is_available_today / availability_status from it
    at serialization time. So the one-column write below is now the COMPLETE
    conversion, not the partial one that finding warned about — every reader
    that used to see a stale availability_status='full' now reads a value
    computed from the state this function just reset.

    The import of `_state_to_legacy` from the router is gone with it, which
    also removes the service→router edge MEH-1828 had to justify.
    """
    try:
        changed = (
            db.query(Producer)
            .filter(Producer.availability_state == EXPIRED_STATE)
            .update(
                {Producer.availability_state: RESET_STATE},
                synchronize_session=False,
            )
        )
        db.commit()
        if changed:
            logger.info(
                "[FULL-WEEK-EXPIRY] reset %d producer(s) %s -> %s",
                changed,
                EXPIRED_STATE,
                RESET_STATE,
            )
        return changed
    except Exception:
        # Leave the session usable for whatever runs next — the same
        # invariant _run_followup_job documents (startup.py, MEH-1824).
        db.rollback()
        raise
