"""
Module:   producer_recipes
Purpose:  Producer-self CRUD + public read for producer-owned recipes
          (MEH-589 chunk 2/4 of the producer-recipes epic).
Touches:  producer_recipes + producer_recipe_products tables; calls
          Claude Haiku via services/producer_recipe_moderation.
Does NOT: handle admin moderation queue — see admin_recipes.py.
          Does not own the schema — see MEH-588 migration f4c8a91e2b07
          and models.py:1053-1142 ProducerRecipe + Table.
Related:  app/routers/experiences.py:1-350 (canonical analog);
          app/routers/admin_recipes.py (admin moderation sibling);
          app/services/producer_recipe_moderation.py (Claude call).
History:  MEH-589 (creation; chunk 1 = MEH-588 schema; chunks 3-4 = UI).
"""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.auth import require_producer, require_verified_producer
from app.database import get_db
from app.services.producer_listing import is_business  # MEH-2459
from app.models import Producer, ProducerRecipe, Product, User
from app.rate_limit import limiter
from app.schemas.schemas import (
    ProducerRecipeCreate,
    ProducerRecipeOut,
    ProducerRecipeUpdate,
)
from app.services import indexnow  # MEH-2852
from app.services.auth_notifications import notify_admin_new_recipe
from app.services.producer_recipe_moderation import validate_producer_recipe

router = APIRouter(tags=["producer-recipes"])


# ---------- Serialization ----------


def _serialize(recipe: ProducerRecipe) -> dict:
    """Pure dict shape — Pydantic ProducerRecipeOut consumes this.
    `product_ids` is filled from the loaded M2M; callers must eager-load
    `ProducerRecipe.products` first via joinedload."""
    return {
        "id": recipe.id,
        "producer_id": recipe.producer_id,
        "title": recipe.title,
        "description": recipe.description,
        "ingredients": recipe.ingredients,
        "instructions": recipe.instructions,
        "prep_time_min": recipe.prep_time_min,
        "cook_time_min": recipe.cook_time_min,
        "servings": recipe.servings,
        "image_url": recipe.image_url,
        "moderation_status": recipe.moderation_status,
        "moderation_notes": recipe.moderation_notes,
        "published": recipe.published,
        "created_at": recipe.created_at,
        "updated_at": recipe.updated_at,
        "product_ids": [p.id for p in (recipe.products or [])],
    }


# ---------- M2M product validation ----------


def _validate_product_ids(
    db: Session, producer_id: UUID, product_ids: list[UUID]
) -> list[Product]:
    """Resolve product_ids → Product rows, raising 422 if any product
    is missing OR belongs to another producer.

    Cross-producer linking would let producer A's recipe surface on
    producer B's catalog page — a privacy + brand leak. This is the
    DB-level safety net for FINDER#6 in the MEH-588 adversarial review.
    """
    if not product_ids:
        return []
    # Deduplicate while preserving caller intent.
    unique_ids = list(dict.fromkeys(product_ids))
    products = db.query(Product).filter(Product.id.in_(unique_ids)).all()
    found_ids = {p.id for p in products}
    missing = [pid for pid in unique_ids if pid not in found_ids]
    if missing:
        raise HTTPException(
            status_code=422,
            # MEH-1943 chunk 2: Hebrew message; the raw UUIDs move to params.
            detail={
                "code": "products_not_found",
                "message": "חלק מהמוצרים לא נמצאו",
                "params": {"product_ids": [str(p) for p in missing]},
            },
        )
    foreign = [p.id for p in products if p.producer_id != producer_id]
    if foreign:
        # 422, not 403 — the body shape is wrong, not the auth.
        raise HTTPException(
            status_code=422,
            detail="כל המוצרים המקושרים חייבים להיות שייכים לעסק שלך",
        )
    return products


# ---------- Producer self — CRUD ----------


@router.post(
    "/producers/me/recipes",
    response_model=ProducerRecipeOut,
    status_code=201,
)
@limiter.limit("10/hour")
def create_my_recipe(
    request: Request,  # required by slowapi
    data: ProducerRecipeCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_verified_producer),
    db: Session = Depends(get_db),
):
    """Submit a new recipe. Mirrors experiences.py:201-272:
    1. Hand off to Claude Haiku via validate_producer_recipe
    2. REJECTED → HTTP 400 (blocked, nothing persisted)
    3. APPROVED / FLAGGED → persist as moderation_status='pending',
       admin reviews next
    4. The Claude verdict is stored in moderation_notes so admins
       see Claude's signal in the queue
    """
    if not user.producer_id:
        raise HTTPException(status_code=403, detail="לא נמצא עסק מקושר")

    products = _validate_product_ids(db, user.producer_id, data.product_ids)

    verdict = validate_producer_recipe(data.model_dump(mode="json"))
    if verdict["status"] == "REJECTED":
        raise HTTPException(
            status_code=400,
            detail={
                "error": "recipe_rejected",
                "reason": verdict.get("reason") or "התוכן לא מתאים לפלטפורמה",
            },
        )

    # Pre-check passed Claude OR was FLAGGED → still pending for human admin.
    # FLAGGED notes are surfaced in `moderation_notes` so the admin queue card
    # shows Claude's concern alongside the recipe.
    recipe = ProducerRecipe(
        producer_id=user.producer_id,
        title=data.title,
        description=data.description,
        ingredients=data.ingredients,
        instructions=data.instructions,
        prep_time_min=data.prep_time_min,
        cook_time_min=data.cook_time_min,
        servings=data.servings,
        image_url=data.image_url,
        moderation_status="pending",
        moderation_notes=verdict.get("reason"),
        published=False,
    )
    recipe.products = products
    db.add(recipe)
    db.commit()
    db.refresh(recipe)

    # MEH-1000: ping admin that the queue grew. Capture primitives NOW —
    # expire_on_commit + session close would break lazy access inside the
    # background task. REUSES: auth.py:527-535 (registration notify pattern).
    producer_name = (
        db.query(Producer.name).filter(Producer.id == user.producer_id).scalar() or ""
    )
    background_tasks.add_task(notify_admin_new_recipe, producer_name, recipe.title)

    recipe = (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.products))
        .filter(ProducerRecipe.id == recipe.id)
        .first()
    )
    return _serialize(recipe)


@router.get(
    "/producers/me/recipes",
    response_model=list[ProducerRecipeOut],
)
def list_my_recipes(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    if not user.producer_id:
        raise HTTPException(status_code=403, detail="לא נמצא עסק מקושר")
    rows = (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.products))
        .filter(ProducerRecipe.producer_id == user.producer_id)
        .order_by(ProducerRecipe.created_at.desc())
        .all()
    )
    return [_serialize(r) for r in rows]


@router.get(
    "/producers/me/recipes/{recipe_id}",
    response_model=ProducerRecipeOut,
)
def get_my_recipe(
    recipe_id: UUID,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    if not user.producer_id:
        raise HTTPException(status_code=403, detail="לא נמצא עסק מקושר")
    recipe = (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.products))
        .filter(ProducerRecipe.id == recipe_id)
        .first()
    )
    # Use 404 instead of 403 on cross-producer access so existence of
    # another producer's recipe is not leaked (REUSES experiences.py:181).
    if not recipe or recipe.producer_id != user.producer_id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return _serialize(recipe)


def _public_urls(db: Session, recipe: ProducerRecipe) -> list[str]:
    """MEH-2852: the recipe's page URLs while ``get_public_recipe`` below
    serves it (published + approved, under a live business with a slug);
    otherwise none — a draft or a pending edit is never announced."""
    if not (recipe.published and recipe.moderation_status == "approved"):
        return []
    producer = db.query(Producer).filter(Producer.id == recipe.producer_id).first()
    if not indexnow.is_public_business(producer):
        return []
    return indexnow.recipe_urls(producer, recipe.id)


# Content fields that, when changed, force a re-moderation cycle. Pure
# metadata (image_url, prep/cook/servings, product_ids) does NOT trigger
# re-moderation — Claude only reads textual content anyway.
_CONTENT_FIELDS = ("title", "description", "ingredients", "instructions")


@router.patch(
    "/producers/me/recipes/{recipe_id}",
    response_model=ProducerRecipeOut,
)
@limiter.limit("10/hour")
def update_my_recipe(  # noqa: PLR0913 — all 6 args are FastAPI-injected (slowapi request, path id, body, BackgroundTasks, auth dep, db dep); MEH-1000 added the notify hop
    request: Request,  # required by slowapi
    recipe_id: UUID,
    data: ProducerRecipeUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    if not user.producer_id:
        raise HTTPException(status_code=403, detail="לא נמצא עסק מקושר")

    recipe = (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.products))
        .filter(ProducerRecipe.id == recipe_id)
        .first()
    )
    if not recipe or recipe.producer_id != user.producer_id:
        raise HTTPException(status_code=404, detail="Recipe not found")

    payload = data.model_dump(exclude_unset=True)
    # MEH-1000: remember where the recipe stood BEFORE this edit — a
    # content change below always resets to "pending", and the admin ping
    # should fire only when the recipe (re-)ENTERS the queue (e.g.
    # needs_revision → pending resubmit), not on every edit of an
    # already-pending card.
    prev_status = recipe.moderation_status
    # MEH-2852: read BEFORE the edit — a content edit unpublishes the recipe.
    urls_before = _public_urls(db, recipe)
    content_changed = False

    for field, value in payload.items():
        if field == "product_ids":
            # None means "no change"; an explicit empty list clears links.
            if value is not None:
                recipe.products = _validate_product_ids(db, user.producer_id, value)
            continue
        if field in _CONTENT_FIELDS and value != getattr(recipe, field):
            content_changed = True
        setattr(recipe, field, value)

    if content_changed:
        # Re-moderate and reset the publish flag. The admin queue gets
        # a fresh card; existing published state is dropped because the
        # content the admin previously saw is no longer current.
        recipe.published = False
        recipe.moderation_status = "pending"
        verdict = validate_producer_recipe(
            {
                "title": recipe.title,
                "description": recipe.description,
                "ingredients": recipe.ingredients,
                "instructions": recipe.instructions,
            }
        )
        if verdict["status"] == "REJECTED":
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "recipe_rejected",
                    "reason": verdict.get("reason") or "התוכן לא מתאים לפלטפורמה",
                },
            )
        recipe.moderation_notes = verdict.get("reason")

    db.commit()
    db.refresh(recipe)

    if content_changed and prev_status != "pending":
        # MEH-1000: resubmit-after-needs_revision (or an edit to an already
        # approved/rejected recipe) puts a fresh card in the admin queue —
        # same fire-and-forget ping as create.
        producer_name = (
            db.query(Producer.name).filter(Producer.id == user.producer_id).scalar()
            or ""
        )
        background_tasks.add_task(notify_admin_new_recipe, producer_name, recipe.title)

    recipe = (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.products))
        .filter(ProducerRecipe.id == recipe.id)
        .first()
    )
    # MEH-2852: queued after the admin email — background tasks run in
    # order, so the ping's 5s timeout never holds the email. The page
    # changed (metadata edit) or went away (content edit → unpublished).
    indexnow.schedule(background_tasks, urls_before + _public_urls(db, recipe))
    return _serialize(recipe)


@router.delete("/producers/me/recipes/{recipe_id}")
def delete_my_recipe(
    recipe_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    if not user.producer_id:
        raise HTTPException(status_code=403, detail="לא נמצא עסק מקושר")
    recipe = db.query(ProducerRecipe).filter(ProducerRecipe.id == recipe_id).first()
    if not recipe or recipe.producer_id != user.producer_id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    removed_urls = _public_urls(db, recipe)  # MEH-2852: before the row goes
    db.delete(recipe)
    db.commit()
    indexnow.schedule(background_tasks, removed_urls)
    return {"detail": "Recipe deleted"}


# ---------- Public read (no auth) ----------


def _resolve_producer_by_slug(db: Session, slug: str) -> Producer:
    """REUSES: producers.py:143 — slug + status='approved' filter.
    404 instead of 403 to avoid leaking pending/rejected producers."""
    producer = (
        db.query(Producer)
        .filter(Producer.slug == slug, is_business())  # MEH-2459
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
    return producer


@router.get(
    "/producers/{slug}/recipes",
    response_model=list[ProducerRecipeOut],
)
@limiter.limit("120/minute")
def list_public_recipes(
    request: Request,
    slug: str,
    db: Session = Depends(get_db),
):
    """Only published + approved recipes for an approved producer.
    Matches the partial index on (published, moderation_status) WHERE
    published=true from migration f4c8a91e2b07.
    """
    producer = _resolve_producer_by_slug(db, slug)
    rows = (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.products))
        .filter(
            ProducerRecipe.producer_id == producer.id,
            ProducerRecipe.published.is_(True),
            ProducerRecipe.moderation_status == "approved",
        )
        .order_by(ProducerRecipe.created_at.desc())
        .all()
    )
    return [_serialize(r) for r in rows]


@router.get(
    "/producers/{slug}/recipes/{recipe_id}",
    response_model=ProducerRecipeOut,
)
@limiter.limit("120/minute")
def get_public_recipe(
    request: Request,
    slug: str,
    recipe_id: UUID,
    db: Session = Depends(get_db),
):
    producer = _resolve_producer_by_slug(db, slug)
    recipe = (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.products))
        .filter(
            ProducerRecipe.id == recipe_id,
            ProducerRecipe.producer_id == producer.id,
            ProducerRecipe.published.is_(True),
            ProducerRecipe.moderation_status == "approved",
        )
        .first()
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return _serialize(recipe)
