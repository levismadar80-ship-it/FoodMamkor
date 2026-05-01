from fastapi import APIRouter, Request

from app.database import SessionLocal
from app.models.models import AdminSetting
from app.rate_limit import limiter

router = APIRouter()


@router.get("/holiday-mode")
@limiter.limit("60/minute")
def get_holiday_mode(request: Request):
    """Return holiday-mode state for the frontend banner.

    MEH-247 — reads the same admin_settings keys the /admin/settings page
    writes (`holiday_override_enabled`, `holiday_override_key`), and returns
    the `{enabled, key}` shape the `HolidayBanner` component consumes.
    Prior to this fix the endpoint read different keys and returned a
    `{active, banner_text}` shape, so the banner never lit up.
    """
    # TODO(MEH-407 follow-up): replace SessionLocal() with Depends(get_db).
    # Phase 2.1 (split main.py) preserves the existing connection lifecycle
    # verbatim — switching to Depends is a behavior change, deferred per the
    # no-behavior-change contract on this PR (smell #5 in REFACTOR_PLAN.md).
    db = None
    try:
        db = SessionLocal()
        rows = db.query(AdminSetting).filter(
            AdminSetting.key.in_(["holiday_override_enabled", "holiday_override_key"])
        ).all()
        kv = {r.key: r.value for r in rows}
        return {
            "enabled": (kv.get("holiday_override_enabled") or "false").lower() == "true",
            "key": kv.get("holiday_override_key") or None,
        }
    finally:
        if db is not None:
            db.close()
