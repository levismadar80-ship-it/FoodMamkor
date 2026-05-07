from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Recipe, RecipeIngredient, User
from app.rate_limit import limiter
from app.schemas.schemas import RecipeCreate, RecipeOut

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get("", response_model=list[RecipeOut])
def list_recipes(category: int | None = None, db: Session = Depends(get_db)):
    q = (
        db.query(Recipe)
        .options(joinedload(Recipe.ingredients))
        .filter(Recipe.status == "approved")
    )
    if category is not None:
        q = q.filter(Recipe.category_id == category)
    return q.order_by(Recipe.created_at.desc()).all()


@router.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: UUID, db: Session = Depends(get_db)):
    recipe = (
        db.query(Recipe)
        .options(joinedload(Recipe.ingredients))
        .filter(Recipe.id == recipe_id)
        .first()
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.post("", response_model=RecipeOut, status_code=201)
@limiter.limit("10/hour")
def create_recipe(
    request: Request,
    data: RecipeCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipe = Recipe(
        title=data.title,
        description=data.description,
        steps=data.steps,
        category_id=data.category_id,
        submitted_by=user.id,
        status="pending",
    )
    db.add(recipe)
    db.flush()

    for ing in data.ingredients:
        db.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                ingredient_name=ing.ingredient_name,
                producer_id=ing.producer_id,
                notes=ing.notes,
            )
        )

    db.commit()
    db.refresh(recipe)
    return recipe
