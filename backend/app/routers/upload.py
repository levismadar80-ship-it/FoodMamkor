"""Image upload endpoint.

SECURITY FIX #6 (docs/SECURITY.md): the previous version trusted the client-
submitted `Content-Type` header (forgeable) and used no size limit.
This version:
  1. Enforces MAX_FILE_SIZE before anything else (5 MB)
  2. Validates the file contents by matching magic bytes — the browser's
     declared content-type is not trusted
  3. Uses a UUID for Cloudinary's public_id (not the user-supplied filename)
  4. Tells Cloudinary resource_type="image" which adds a server-side check
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Producer, User
from app.rate_limit import limiter

log = logging.getLogger("app.upload")

router = APIRouter(prefix="/upload", tags=["upload"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB — matches docs/SECURITY.md fix 6


# Magic-byte signatures for the image formats we allow. Much cheaper and
# less dependency-heavy than python-magic (which requires libmagic on the
# host). These covers the three formats the frontend lets users upload.
def _sniff_image_type(header: bytes) -> str | None:
    if len(header) < 12:
        return None
    if header.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "webp"
    if header[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


@router.post("/image")
@limiter.limit("20/hour")
async def upload_image(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload image to Cloudinary. Validates size and real content type.
    Enforces free plan limit (3 images) for producers.
    """
    # Read the whole file once so we can size-check and content-sniff. We cap
    # at MAX_FILE_SIZE + 1 so oversized uploads still fail cheaply without
    # OOM-ing the process.
    contents = await file.read(MAX_FILE_SIZE + 1)
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"תמונה גדולה מדי (מקסימום {MAX_FILE_SIZE // 1024 // 1024}MB)",
        )
    if not contents:
        raise HTTPException(status_code=400, detail="קובץ ריק")

    # SECURITY FIX #6: sniff the real format from magic bytes, don't trust
    # the client-reported content_type.
    detected = _sniff_image_type(contents[:32])
    if detected is None:
        raise HTTPException(
            status_code=400,
            detail="רק תמונות JPG/PNG/WebP/GIF מותרות",
        )

    # Check freemium limit for producers
    if user.role == "producer" and user.producer_id:
        producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
        if (
            producer
            and producer.plan == "free"
            and producer.images
            and len(producer.images) >= 3
        ):
            raise HTTPException(
                status_code=403,
                # MEH-1005: neutral cap copy — no tier promise (MEH-617 undecided), plural per ADR-024.
                detail="אפשר להעלות עד 3 תמונות לפרופיל. כדי להוסיף חדשה — מחקו קודם אחת קיימת.",
            )

    if not settings.cloudinary_cloud_name:
        # Dev fallback: return a local placeholder URL that won't trigger
        # the Next.js remote-image SVG guard.
        return {"url": f"/placeholder-image.png?name={uuid.uuid4().hex[:8]}"}

    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        # SECURITY FIX #6: use a UUID public_id (not file.filename), and
        # resource_type="image" which makes Cloudinary reject non-images
        # server-side as a second layer of defense.
        result = cloudinary.uploader.upload(
            contents,
            folder="mehamakor",
            public_id=uuid.uuid4().hex,
            resource_type="image",
            transformation=[{"width": 1200, "crop": "limit"}],
        )
        return {"url": result["secure_url"]}
    except HTTPException:
        raise
    except Exception as e:
        log.error("Cloudinary upload failed: %s", e)
        raise HTTPException(
            status_code=500, detail="שגיאה בהעלאת התמונה — נסי שוב בעוד רגע"
        )


@router.post("/avatar")
@limiter.limit("10/hour")
async def upload_avatar(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a profile photo to Cloudinary. Same magic-byte validation as
    /upload/image but no freemium gate, smaller crop (400px square), and
    a dedicated avatars/ folder so producer gallery images stay separate.
    Saves avatar_url to users table atomically so the caller needs no
    separate PATCH /users/me call.
    """
    contents = await file.read(MAX_FILE_SIZE + 1)
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"תמונה גדולה מדי (מקסימום {MAX_FILE_SIZE // 1024 // 1024}MB)",
        )
    if not contents:
        raise HTTPException(status_code=400, detail="קובץ ריק")

    detected = _sniff_image_type(contents[:32])
    if detected is None:
        raise HTTPException(
            status_code=400,
            detail="רק תמונות JPG/PNG/WebP/GIF מותרות",
        )

    if not settings.cloudinary_cloud_name:
        url = f"/placeholder-image.png?avatar={uuid.uuid4().hex[:8]}"
        user.avatar_url = url
        db.commit()
        return {"url": url}

    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        # MEH-375: fixed public_id per user with overwrite=True so a
        # re-upload reuses the same Cloudinary slot instead of creating a
        # new asset and orphaning the previous one. PATCH /users/me still
        # needs an explicit destroy hook (chunk F) for the case where the
        # user swaps avatar_url without going through this endpoint.
        result = cloudinary.uploader.upload(
            contents,
            folder="mehamakor/avatars",
            public_id=f"user_{user.id}",
            overwrite=True,
            invalidate=True,
            resource_type="image",
            transformation=[
                {"width": 400, "height": 400, "crop": "fill", "gravity": "face"}
            ],
        )
        url = result["secure_url"]
        user.avatar_url = url
        db.commit()
        return {"url": url}
    except HTTPException:
        raise
    except Exception as e:
        log.error("Cloudinary upload failed: %s", e)
        raise HTTPException(
            status_code=500, detail="שגיאה בהעלאת התמונה — נסי שוב בעוד רגע"
        )
