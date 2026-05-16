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
