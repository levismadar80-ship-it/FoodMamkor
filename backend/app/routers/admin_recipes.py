"""
Module:   admin_recipes
Purpose:  Admin moderation queue + three terminal actions for producer
          recipes (MEH-589 chunk 2/4).
Touches:  producer_recipes table (writes moderation_status, published,
          moderation_notes); favorite_alerts fan-out via fire_alerts
          (MEH-1361 — approve is the single code path that flips a
          recipe publicly visible, so the new_recipe alert fires here).
Does NOT: handle producer-self CRUD — see producer_recipes.py. Does
          not run Claude pre-check — that fires on submit/update in
          producer_recipes.py. Does not notify the ADMIN — that is
          notify_admin_new_recipe on submit (producer_recipes.py).
Related:  app/routers/admin_experiences.py:1-148 (canonical analog);
          app/routers/producer_recipes.py (sibling);
          app/routers/alerts.py fire_alerts (fan-out + MEH-1338 cap).
History:  MEH-589 (creation); MEH-1361 (new_recipe favorite alert).
"""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import require_admin
from app.database import get_db
from app.models import Producer, ProducerRecipe, User
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
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Approve and publish. published=True flips the recipe onto the
    public producer page (and into the partial index from MEH-588).

    MEH-1361: this is the ONLY code path that makes a recipe publicly
    visible (producers can't set `published` — ProducerRecipeUpdate has
    no such field; every other writer only unpublishes), so the
    new_recipe favorite alert fires here, on the false→true `published`
    transition. A re-approve of an already-published recipe is a no-op
    for alerts; an edit→re-approve cycle counts as newly-visible again
    (the MEH-1338 per-(user, producer, channel) 24h cap also dedupes).
    """
    recipe = _load_or_404(db, recipe_id)
    was_published = bool(recipe.published)
    recipe.moderation_status = "approved"
    recipe.moderation_notes = None
    recipe.published = True
    db.commit()
    db.refresh(recipe)

    if not was_published:
        # REUSES: producer_me.py delivery-area call site — lazy import +
        # BackgroundTasks fan-out; fire_alerts is fail-open end to end.
        from app.routers.alerts import AlertContent, fire_alerts

        producer = db.query(Producer).filter(Producer.id == recipe.producer_id).first()
        # The public recipe page is slug-keyed (/{slug}/recipes/{id}); a
        # slug-less producer has no addressable recipe page, so fall back
        # to the producer page rather than emit a dead link.
        url = (
            f"/{producer.slug}/recipes/{recipe.id}"
            if producer and producer.slug
            else f"/producer/{recipe.producer_id}"
        )
        # Copy approved by Sapir 20/07 (singular "לך"; business name gives the
        # notification its context, consistent with the 🚚 delivery template).
        producer_name = producer.name if producer else ""
        body = (
            f"מתכון חדש מ{producer_name} מחכה לך באתר"
            if producer_name
            else "מתכון חדש מחכה לך באתר"
        )
        background_tasks.add_task(
            fire_alerts,
            db,
            recipe.producer_id,
            "new_recipe",
            AlertContent(
                title=f"🍲 מתכון חדש: {recipe.title}",
                body=body,
                url=url,
            ),
        )

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
