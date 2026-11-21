"""
Module:   admin_settings
Purpose:  Read and write the admin toggles kept in `admin_settings`
          (`GET/PUT /admin/settings`, `GET/POST /admin/settings/vacation`).
Touches:  admin_settings table (commits on write).
Does NOT: check the caller is an admin — the router does (`require_admin`).
          The str→bool/date parsing of vacation mode lives in
          app/services/vacation_state.py, not here.
Related:  backend/app/routers/admin_extra.py (the four handlers that call this)
History:  MEH-3538 (moved here unchanged from routers/admin_extra.py)
"""

from datetime import date
from typing import Any, cast

from sqlalchemy.orm import Session

from app.models import AdminSetting
from app.schemas.schemas import VacationModeState
from app.services.vacation_state import read_vacation_state

DEFAULT_SETTINGS = {
    # MEH-1566: `admin_email` + `admin_whatsapp` were removed here — write-only
    # keys with zero readers. Every admin-notification recipient is read from
    # the env-backed settings object (`settings.admin_email` /
    # `settings.admin_whatsapp_to`, backend/app/config.py:85,64), never from
    # this table. Existing rows are left in place and inert, same as below.
    # MEH-1555: `freemium_premium_price` + `freemium_free_image_limit` were
    # removed here — write-only keys with zero readers anywhere in backend or
    # frontend (the /upload/image cap is the hardcoded `>= 3` in
    # routers/upload.py:101, which never consulted the setting). Existing
    # `admin_settings` rows are intentionally left in place: PUT /admin/settings
    # ignores unknown keys, so the orphan rows are inert and no migration runs.
    # MEH-247 — admin-facing holiday + Friday override toggles. Both are
    # persisted server-side so admin A's toggle is visible to admin B on
    # next /admin/settings load. Consumer-side reads happen via the
    # public `GET /holiday-mode` endpoint in main.py (holiday) and
    # `lib/friday-mode.js` on the frontend (Friday — currently localStorage
    # + timezone rule; no public /friday-mode endpoint yet, so the admin
    # toggle reaches only the admin's own browser — MEH-3455).
    "holiday_override_enabled": "false",
    "holiday_override_key": "",
    "friday_mode_override": "false",
    # MEH-509 PR2a: vacation mode. Boolean as string + ISO date as string
    # (matches the existing friday_mode_override pattern). The typed
    # /admin/settings/vacation GET+POST endpoints below wrap the raw
    # str↔bool/date conversion.
    "vacation_mode_active": "false",
    "vacation_return_date": "",
}


def read_settings(db: Session) -> dict[str, Any]:
    """Every known key, the saved value or its default."""
    rows = db.query(AdminSetting).all()
    saved: dict[Any, Any] = {row.key: row.value for row in rows}
    return {key: saved.get(key, default) for key, default in DEFAULT_SETTINGS.items()}


def write_settings(db: Session, data: dict[str, Any]) -> None:
    """Upsert the known keys of `data`; unknown keys are ignored."""
    for key, value in data.items():
        if key not in DEFAULT_SETTINGS:
            continue
        row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
        if row:
            row.value = str(value) if value is not None else None  # type: ignore[assignment]
        else:
            db.add(
                AdminSetting(key=key, value=str(value) if value is not None else None)
            )
    db.commit()


# --- MEH-509 PR2a — vacation mode (typed wrapper over AdminSetting) ---------
# Reads/writes the same `admin_settings` table the generic /admin/settings
# endpoints use (one source of truth, no parallel table). The PR2b watchdog
# will consume `vacation_mode_active` to decide which Meta-approved template
# to send.


def read_vacation_mode(db: Session) -> VacationModeState:
    """Pydantic wrapper over the shared `read_vacation_state` helper
    (MEH-662). All str→bool/date conversion + corrupt-state defense
    lives in `app/services/vacation_state.py`; this wrapper only adapts
    the tuple shape into the typed VacationModeState model the admin
    GET/POST endpoints expose."""
    # REUSES: app/services/vacation_state.py:read_vacation_state — single
    # source of truth for AdminSetting str→bool/date + corrupt-state coerce
    # (MEH-662 dedup).
    active, return_date = read_vacation_state(db)
    return VacationModeState(active=active, return_date=return_date)


def _write_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
    if row:
        row.value = value  # type: ignore[assignment]
    else:
        db.add(AdminSetting(key=key, value=value))


def write_vacation_mode(db: Session, body: VacationModeState) -> VacationModeState:
    """Persist the toggle and return the state as read back."""
    # VacationModeState's model_validator already rejected active+no-date.
    # When deactivating, clear the date so the persisted state can't drift
    # back into "active with stale date" after a future flip.
    if body.active:
        _write_setting(db, "vacation_mode_active", "true")
        _write_setting(
            db,
            "vacation_return_date",
            cast(date, body.return_date).isoformat(),  # validator: active ⇒ date set
        )
    else:
        _write_setting(db, "vacation_mode_active", "false")
        _write_setting(db, "vacation_return_date", "")
    db.commit()
    return read_vacation_mode(db)
