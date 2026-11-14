from typing import Any
from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/", response_model=None)
def root() -> dict[str, Any]:
    return {"message": "מהמקור API - ברוכים הבאים"}


# /health, /health/liveness, /health/readiness — moved to app/routers/health.py
# (MEH-483: single owner per workflow.md "two parallel mechanisms" rule).


@router.get("/push-vapid-key", response_model=None)
def get_vapid_public_key() -> dict[str, Any]:
    """Return the VAPID public key for the frontend push subscription."""
    return {"public_key": settings.vapid_public_key or ""}
