"""
Module:   admin_recipes
Purpose:  Admin moderation queue + three terminal actions for producer
          recipes (MEH-589 chunk 2/4).
Touches:  producer_recipes table only (writes moderation_status,
          published, moderation_notes).
Does NOT: handle producer-self CRUD — see producer_recipes.py. Does
          not run Claude pre-check — that fires on submit/update in
          producer_recipes.py.
Related:  app/routers/admin_experiences.py:1-148 (canonical analog);
          app/routers/producer_recipes.py (sibling).
History:  MEH-589 (creation).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.database import get_db
from app.models import ProducerRecipe, User
from app.routers.producer_recipes import _serialize
from app.schemas.schemas import (
    ProducerRecipeModerationAction,
    ProducerRecipeOut,
)

router = APIRouter(prefix="/admin/recipes", tags=["admin-recipes"])


# ---------- List ----------


@router.get("", response_model=list[ProducerRecipeOut])
def admin_list_recipes(
    moderation_status: str | None = Query(
        None,
        pattern="^(pending|approved|rejected|needs_revision|all)$",
    ),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """REUSES: admin_experiences.py:37-50 — same status filter shape.
    Default (no filter) returns all moderation states; `all` is the
    explicit equivalent. Newest first so fresh submissions are at the
    top of the admin queue."""
    q = db.query(ProducerRecipe).options(joinedload(ProducerRecipe.products))
    if moderation_status and moderation_status != "all":
        q = q.filter(ProducerRecipe.moderation_status == moderation_status)
    rows = q.order_by(ProducerRecipe.created_at.desc()).all()
    return [_serialize(r) for r in rows]


# Convenience: pending-only queue, the admin's default landing list.
@router.get("/pending", response_model=list[ProducerRecipeOut])
def admin_list_pending_recipes(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.products))
        .filter(ProducerRecipe.moderation_status == "pending")
        .order_by(ProducerRecipe.created_at.asc())
        .all()
    )
    return [_serialize(r) for r in rows]


def _load_or_404(db: Session, recipe_id: UUID) -> ProducerRecipe:
    recipe = (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.products))
        .filter(ProducerRecipe.id == recipe_id)
        .first()
    )
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


# ---------- Approve ----------


@router.post(
    "/{recipe_id}/approve",
    response_model=ProducerRecipeOut,
)
def approve_recipe(
    recipe_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Approve and publish. published=True flips the recipe onto the
    public producer page (and into the partial index from MEH-588).
    """
    recipe = _load_or_404(db, recipe_id)
    recipe.moderation_status = "approved"
    recipe.moderation_notes = None
    recipe.published = True
    db.commit()
    db.refresh(recipe)
    recipe = _load_or_404(db, recipe.id)
    return _serialize(recipe)


# ---------- Request changes ----------


@router.post(
    "/{recipe_id}/request-changes",
    response_model=ProducerRecipeOut,
)
def request_recipe_changes(
    recipe_id: UUID,
    action: ProducerRecipeModerationAction,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """REUSES: admin_experiences.py:90-118 — `feedback` is required for
    request-changes (admins must tell the producer what to fix)."""
    if not action.feedback:
        raise HTTPException(status_code=400, detail="feedback is required")

    recipe = _load_or_404(db, recipe_id)
    recipe.moderation_status = "needs_revision"
    recipe.moderation_notes = action.feedback
    recipe.published = False
    db.commit()
    db.refresh(recipe)
    recipe = _load_or_404(db, recipe.id)
    return _serialize(recipe)


# ---------- Reject ----------


@router.post(
    "/{recipe_id}/reject",
    response_model=ProducerRecipeOut,
)
def reject_recipe(
    recipe_id: UUID,
    action: ProducerRecipeModerationAction,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Reject is terminal — the producer can still submit a new recipe,
    but this one is closed. `feedback` becomes moderation_notes (may be
    empty if the admin doesn't want to give a reason)."""
    recipe = _load_or_404(db, recipe_id)
    recipe.moderation_status = "rejected"
    recipe.moderation_notes = action.feedback or ""
    recipe.published = False
    db.commit()
    db.refresh(recipe)
    recipe = _load_or_404(db, recipe.id)
    return _serialize(recipe)
