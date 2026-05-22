"""
Module:   vacation_state
Purpose:  Single source of truth for the AdminSetting-backed vacation
          mode state. Returns a `tuple[bool, date | None]` that both the
          admin-facing typed wrapper and the after-hours watchdog consume.
Touches:  PostgreSQL admin_settings (SELECT only) — never writes.
Does NOT: write the AdminSetting rows — that's app/routers/admin_extra.py
          via the typed POST /admin/settings/vacation endpoint. Does NOT
          decide template routing for the watchdog — that's
          app/services/auto_reply_watchdog.py:_decide_template.
Related:  app/routers/admin_extra.py:402 (_read_vacation_state Pydantic
          wrapper), app/services/auto_reply_watchdog.py (tuple consumer).
History:  MEH-662 (creation; deduplicates two parallel implementations
          surfaced by PR2b adversarial review finding A40).
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models import AdminSetting


def read_vacation_state(db: Session) -> tuple[bool, date | None]:
    """Single source of truth for AdminSetting-backed vacation state.

    Returns `(active, return_date)`. Corrupt persisted state — invalid
    ISO date OR `active="true"` + empty `return_date` — coerces to
    `(False, None)` rather than raising. PR2a's
    `admin_extra._read_vacation_state` wraps this into a Pydantic
    `VacationModeState`; PR2b's watchdog consumes the tuple directly.

    Behavior matrix:
      vacation_mode_active=≠"true"          → (False, None)
      "true" + empty/missing return_date    → (False, None)  (corrupt-state coerce)
      "true" + valid ISO date               → (True, parsed_date)
      "true" + invalid ISO                  → (False, None)  (corrupt-state coerce)
    """
    rows = {
        r.key: r.value
        for r in db.query(AdminSetting).filter(
            AdminSetting.key.in_(["vacation_mode_active", "vacation_return_date"])
        )
    }
    active = (rows.get("vacation_mode_active") or "false").lower() == "true"
    return_date_raw = rows.get("vacation_return_date") or ""
    if not active:
        return (False, None)
    if not return_date_raw:
        return (False, None)
    try:
        return (True, date.fromisoformat(return_date_raw))
    except ValueError:
        return (False, None)
