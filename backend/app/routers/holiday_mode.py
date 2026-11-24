from typing import Any
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import AdminSetting
from app.rate_limit import limiter

router = APIRouter()


@router.get("/holiday-mode", response_model=None)
@limiter.limit("60/minute")
def get_holiday_mode(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Return holiday-mode state for the frontend banner.

    MEH-247 — reads the same admin_settings keys the /admin/settings page
    writes (`holiday_override_enabled`, `holiday_override_key`), and returns
    the `{enabled, key}` shape the `HolidayBanner` component consumes.
    Prior to this fix the endpoint read different keys and returned a
    `{active, banner_text}` shape, so the banner never lit up.
    """
    # MEH-3714: session from Depends(get_db), like every other router (was
    # a hand-opened SessionLocal() left over from the MEH-407 main.py split).
    rows = (
        db.query(AdminSetting)
        .filter(
            AdminSetting.key.in_(["holiday_override_enabled", "holiday_override_key"])
        )
        .all()
    )
    kv: dict[Any, Any] = {r.key: r.value for r in rows}
    return {
        "enabled": (kv.get("holiday_override_enabled") or "false").lower() == "true",
        "key": kv.get("holiday_override_key") or None,
    }
