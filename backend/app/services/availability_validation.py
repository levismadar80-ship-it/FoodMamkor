"""
Module:   availability_validation
Purpose:  Server-side guards shared by every availability_state write path
          — value membership, the allowed-transition matrix, and the
          vacation return-date rules (required + not-in-the-past, in
          Israel time).
Touches:  Nothing — pure validation; callers persist.
Does NOT: write the producer row (routers/producer_me.py +
          routers/admin.py do that) and does NOT decide listing exclusion
          (app/services/producer_listing.py).
Related:  app/schemas/schemas.py:370 (AVAILABILITY_STATES),
          app/utils/clock.py (israel_today), routers/producer_me.py:344.
History:  AUD-039/040 (creation) — past vacation_until was accepted and the
          transition matrix was implicit (MEH-214).
"""

from __future__ import annotations

from datetime import date

from app.schemas.schemas import AVAILABILITY_STATES
from app.utils.clock import israel_today

ON_VACATION = "on_vacation"

# Allowed-transition matrix (AUD-039 Phase 0). A producer controls their own
# availability, so every state may move to every other state — the matrix is
# fully permissive BY DESIGN. It is encoded explicitly (rather than assumed)
# so (a) an invalid current_state can never silently pass, and (b) any future
# restriction is a one-line edit here, not a scattered router change. The
# merged mutation suite (test_expansion_availability.py) exercises
# accepting_orders⇄available_today and accepting_orders⇄on_vacation — all of
# which remain allowed.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    state: frozenset(AVAILABILITY_STATES) for state in AVAILABILITY_STATES
}


class AvailabilityValidationError(ValueError):
    """Raised on an invalid availability write. Carries a Hebrew message and
    a `kind` so the router can map it to the right HTTP status (400 for an
    invalid value, 422 for a semantic/return-date violation)."""

    def __init__(self, message: str, *, kind: str):
        super().__init__(message)
        self.kind = kind


def validate_transition(current_state: str | None, new_state: str) -> None:
    """Reject an unknown target state or a disallowed transition.

    `current_state` is `None` for a brand-new producer (any initial state
    is allowed). Raises `AvailabilityValidationError(kind="value")`.
    """
    if new_state not in AVAILABILITY_STATES:
        raise AvailabilityValidationError(
            f"מצב לא תקין. חייב להיות אחד מתוך: {', '.join(AVAILABILITY_STATES)}",
            kind="value",
        )
    if current_state is None:
        return
    if current_state not in ALLOWED_TRANSITIONS:
        # Defensive: a producer row carrying a state outside the enum (legacy
        # drift) — treat as no constraint rather than locking them out.
        return
    if new_state not in ALLOWED_TRANSITIONS[current_state]:
        raise AvailabilityValidationError(
            f"מעבר לא חוקי מ-{current_state} ל-{new_state}",
            kind="value",
        )


def resolve_vacation_until(new_state: str, vacation_until: date | None) -> date | None:
    """Validate + normalize the return date for a write.

    - `on_vacation` requires `vacation_until` and it must not be in the past
      (compared against Israel local date, not the server's UTC date).
    - Any other state clears `vacation_until` to `None`.

    Raises `AvailabilityValidationError(kind="return_date")` on a missing or
    past date.
    """
    if new_state != ON_VACATION:
        return None
    if vacation_until is None:
        raise AvailabilityValidationError("תאריך חזרה לחופשה נדרש", kind="return_date")
    if vacation_until < israel_today():
        raise AvailabilityValidationError(
            "תאריך החזרה לחופשה חייב להיות עתידי", kind="return_date"
        )
    return vacation_until
