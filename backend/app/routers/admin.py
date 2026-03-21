from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.database import get_db
from app.models import Producer, Recipe, User
from app.schemas.schemas import ProducerDetailOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/producers", response_model=list[ProducerDetailOut])
def list_producers(
    status: str = Query("pending", regex="^(pending|approved|rejected)$"),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.status == status)
        .order_by(Producer.created_at.desc())
        .all()
    )


# Keep legacy endpoint for backwards compatibility
@router.get("/producers/pending", response_model=list[ProducerDetailOut])
def pending_producers(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.status == "pending")
        .order_by(Producer.created_at.desc())
        .all()
    )


@router.post("/producers/{producer_id}/approve")
def approve_producer(producer_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
    producer.status = "approved"
    db.commit()

    # Find the producer's user to get their email
    producer_user = db.query(User).filter(User.producer_id == producer.id).first()
    if producer_user:
        _send_approval_email(producer_user.email, producer.name)

    return {"detail": "Producer approved"}


@router.post("/producers/{producer_id}/reject")
def reject_producer(
    producer_id: UUID,
    reason: str = Body("", embed=True),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
    producer.status = "rejected"
    db.commit()

    producer_user = db.query(User).filter(User.producer_id == producer.id).first()
    if producer_user:
        _send_rejection_email(producer_user.email, producer.name, reason)

    return {"detail": "Producer rejected"}


@router.get("/recipes/pending")
def pending_recipes(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(Recipe).filter(Recipe.status == "pending").all()


@router.post("/recipes/{recipe_id}/approve")
def approve_recipe(recipe_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    recipe.status = "approved"
    db.commit()
    return {"detail": "Recipe approved"}


@router.post("/recipes/{recipe_id}/reject")
def reject_recipe(recipe_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    recipe.status = "rejected"
    db.commit()
    return {"detail": "Recipe rejected"}


def _send_approval_email(email: str, producer_name: str):
    """Send approval notification email to producer."""
    import smtplib
    from email.mime.text import MIMEText

    try:
        msg = MIMEText(
            f"שלום,\n\nהעסק שלך \"{producer_name}\" אושר במהמקור!\n"
            f"הפרופיל שלך כעת גלוי לכל המשתמשים באתר.\n\n"
            f"בברכה,\nצוות מהמקור",
            "plain",
            "utf-8",
        )
        msg["Subject"] = f"מהמקור - העסק \"{producer_name}\" אושר!"
        msg["From"] = "noreply@mehamakor.co.il"
        msg["To"] = email

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            # TODO: configure SMTP credentials in environment variables
            # server.login(SMTP_USER, SMTP_PASSWORD)
            # server.send_message(msg)
        print(f"[EMAIL] Approval email would be sent to {email}")
    except Exception as e:
        print(f"[EMAIL] Failed to send approval email to {email}: {e}")


def _send_rejection_email(email: str, producer_name: str, reason: str):
    """Send rejection notification email to producer."""
    import smtplib
    from email.mime.text import MIMEText

    reason_text = f"\nסיבת הדחייה: {reason}" if reason else ""
    try:
        msg = MIMEText(
            f"שלום,\n\nלצערנו הבקשה לרישום העסק \"{producer_name}\" במהמקור לא אושרה.{reason_text}\n\n"
            f"ניתן ליצור קשר איתנו לפרטים נוספים.\n\n"
            f"בברכה,\nצוות מהמקור",
            "plain",
            "utf-8",
        )
        msg["Subject"] = f"מהמקור - עדכון לגבי העסק \"{producer_name}\""
        msg["From"] = "noreply@mehamakor.co.il"
        msg["To"] = email

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            # TODO: configure SMTP credentials in environment variables
            # server.login(SMTP_USER, SMTP_PASSWORD)
            # server.send_message(msg)
        print(f"[EMAIL] Rejection email would be sent to {email}")
    except Exception as e:
        print(f"[EMAIL] Failed to send rejection email to {email}: {e}")
