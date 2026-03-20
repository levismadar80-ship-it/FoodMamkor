from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import Producer, Recipe, User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/producers/pending")
def pending_producers(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(Producer).filter(Producer.status == "pending").all()


@router.post("/producers/{producer_id}/approve")
def approve_producer(producer_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
    producer.status = "approved"
    db.commit()
    return {"detail": "Producer approved"}


@router.post("/producers/{producer_id}/reject")
def reject_producer(producer_id: UUID, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
    producer.status = "rejected"
    db.commit()
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
