from fastapi import APIRouter, Request

from app.config import settings

router = APIRouter()


@router.get("/")
def root():
    return {"message": "מהמקור API - ברוכים הבאים"}


@router.api_route("/health", methods=["GET", "HEAD"])
def health(request: Request):
    db_state = getattr(request.app.state, "db_init_status", "not_scheduled")
    return {"status": "ok", "db_init": db_state}


@router.get("/push-vapid-key")
def get_vapid_public_key():
    """Return the VAPID public key for the frontend push subscription."""
    return {"public_key": settings.vapid_public_key or ""}
