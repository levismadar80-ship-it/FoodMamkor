from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}


# /health, /health/liveness, /health/readiness — moved to app/routers/health.py
# (MEH-483: single owner per workflow.md "two parallel mechanisms" rule).


@router.get("/push-vapid-key")
def get_vapid_public_key():
    """Return the VAPID public key for the frontend push subscription."""
    return {"public_key": settings.vapid_public_key or ""}


# MEH-500 — TEMPORARY verify endpoint for staging Sentry dashboard receipt.
# DELETE after Smadar confirms the event arrives in the Sentry dashboard
# with request_id / route / method / environment / release tags +
# request_info context. Tracked under MEH-500 DoD step 4.
@router.get("/verify-sentry-meh500", include_in_schema=False)
async def verify_sentry():
    raise RuntimeError("[MEH-500] Sentry verification — delete after confirm")
