"""
Module:   availability_expiry
Purpose:  Reset every producer stuck on availability_state='full_this_week'
          back to 'accepting_orders' at the Israel-week rollover, so the
          "עמוסה השבוע" banner cannot outlive the week it names (MEH-1828,
          option A — Sapir's 02/08 default: scheduler reset, no schema).
Touches:  DB table `producers` (three columns: availability_state and the
          live legacy pair is_available_today + availability_status).
Does NOT: decide WHEN to run — the CronTrigger in startup.py owns timing
          (Israel Sunday 00:10). It also does not touch on_vacation /
          vacation_until; that flow has its own read-time auto-clear
          (schemas.py, MEH-155) and is deliberately untouched here.
Related:  backend/app/routers/producer_me.py:533 (_state_to_legacy — the
          one owner of the enum↔legacy mapping); backend/app/startup.py
          (job wiring); models.py:214-227 (the three columns).
History:  MEH-1828 (creation).
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

    MEH-1828 Phase 0 finding — the write is THREE columns, not one. The
    legacy pair (is_available_today, availability_status) is still live and
    still read until MEH-1854 Phase 4 drops it (models.py:220). A reset that
    wrote only the enum would leave availability_status='full' behind, and
    every reader still on the legacy pair would keep showing the banner —
    a partial conversion shipping as a finished one (ORDERS §3 item 8).
    """
    # One owner for the enum↔legacy mapping: the router's own helper. A
    # service importing from a router is unusual, and chosen on purpose —
    # a local copy of the triple would be a second owner (workflow.md
    # Smell #1), free to drift until MEH-1854 deletes the original. Lazy
    # import; by the time the scheduler thread calls this, the router
    # module is long loaded.
    from app.routers.producer_me import _state_to_legacy

    is_available_today, availability_status = _state_to_legacy(RESET_STATE)

    try:
        changed = (
            db.query(Producer)
            .filter(Producer.availability_state == EXPIRED_STATE)
            .update(
                {
                    Producer.availability_state: RESET_STATE,
                    Producer.is_available_today: is_available_today,
                    Producer.availability_status: availability_status,
                },
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
