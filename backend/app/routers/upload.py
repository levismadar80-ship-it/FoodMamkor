from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Producer, User

router = APIRouter(prefix="/upload", tags=["upload"])


@router.post("/image")
async def upload_image(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload image to Cloudinary. Enforces free plan limit (3 images)."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Check freemium limit for producers
    if user.role == "producer" and user.producer_id:
        producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
        if producer and producer.plan == "free" and producer.images and len(producer.images) >= 3:
            raise HTTPException(
                status_code=403,
                detail="Free plan allows up to 3 images. Upgrade to premium for unlimited.",
            )

    if not settings.cloudinary_cloud_name:
        # Fallback: return a placeholder when Cloudinary is not configured
        return {"url": f"https://placehold.co/600x400?text={file.filename}"}

    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        contents = await file.read()
        result = cloudinary.uploader.upload(contents, folder="mehamakor")
        return {"url": result["secure_url"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
