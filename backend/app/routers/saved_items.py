"""MEH-2557 — save recipes, events and experiences to «המועדפים שלי».

Chunk 2/5 of MEH-2555. Businesses keep their own router (favorites.py) and
table; this router owns `saved_items` (MEH-2556) and nothing else.

Visibility is the whole security story here. Every type has ONE existing
definition of "public", and this router calls it instead of re-expressing it
(MEH-1740 precedent: a copied gate drifts and leaks):

- recipe     — published + approved, by a live business. Same filter as the
               public recipe routes (producer_recipes.py `get_public_recipe` +
               `_resolve_producer_by_slug`).
- event      — owner (business or organizer) approved. Same rule the public
               `GET /events/{id}` applies to a stranger (events.py `get_event`).
               Past and cancelled events are still served there by direct
               link, so they stay in the saved list too; the page labels them.
- experience — `_publicly_visible_query` (experiences.py, MEH-1749).

A save of anything not public answers 404 — same as the public read, so the
endpoint cannot be used to probe whether a hidden id exists. A saved item that
later stops being public drops out of GET on its own; its row stays, so it
comes back if the item is reinstated (the MEH-2513 rule for businesses).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    SAVED_ITEM_TYPES,
    Event,
    Experience,
    Producer,
    ProducerRecipe,
    SavedItem,
    User,
)
from app.routers.events import _serialize as serialize_event
from app.routers.experiences import _publicly_visible_query, _serialize_list
from app.schemas.schemas import SavedItemRefOut, SavedItemsOut, SavedItemType
from app.services.producer_listing import is_business

router = APIRouter(prefix="/users/me/saved", tags=["saved"])


def _visible_recipes(db: Session):
    return (
        db.query(ProducerRecipe)
        .options(joinedload(ProducerRecipe.producer))
        .join(Producer, ProducerRecipe.producer_id == Producer.id)
        .filter(
            ProducerRecipe.published.is_(True),
            ProducerRecipe.moderation_status == "approved",
            is_business(),
        )
    )


def _visible_events(db: Session):
    return (
        db.query(Event)
        .options(joinedload(Event.producer))
        .join(Producer, Event.producer_id == Producer.id)
        .filter(Producer.status == "approved")
    )


# type → (its one "public" query, its model). The model gives the id column.
_VISIBLE = {
    "recipe": (_visible_recipes, ProducerRecipe),
    "event": (_visible_events, Event),
    "experience": (_publicly_visible_query, Experience),
}


def _visible_by_ids(db: Session, item_type: str, ids: list[UUID]):
    build, model = _VISIBLE[item_type]
    return build(db).filter(model.id.in_(ids))


@router.get("/ids", response_model=list[SavedItemRefOut])
def get_saved_ids(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Every saved (type, id) of the current user, for the hearts' cache.

    Not filtered by visibility: a heart only ever renders on a page the viewer
    can already see, so an id of a hidden item here reveals nothing new and
    filtering would cost three joins on every page load.
    """
    rows = (
        db.query(SavedItem.item_type, SavedItem.item_id)
        .filter(SavedItem.user_id == user.id)
        .all()
    )
    return [{"item_type": t, "item_id": i} for t, i in rows]


@router.get("", response_model=SavedItemsOut)
def get_saved(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(SavedItem)
        .filter(SavedItem.user_id == user.id)
        .order_by(SavedItem.created_at.desc())
        .all()
    )
    by_type: dict[str, list[SavedItem]] = {t: [] for t in SAVED_ITEM_TYPES}
    for row in rows:
        by_type[row.item_type].append(row)

    def _load(item_type: str) -> dict:
        ids = [r.item_id for r in by_type[item_type]]
        if not ids:
            return {}
        items = _visible_by_ids(db, item_type, ids).all()
        return {item.id: item for item in items}

    recipes = _load("recipe")
    events = _load("event")
    experiences = _load("experience")

    out = {"recipes": [], "events": [], "experiences": []}
    for row in by_type["recipe"]:
        recipe = recipes.get(row.item_id)
        if recipe:
            out["recipes"].append(
                {
                    "id": recipe.id,
                    "title": recipe.title,
                    "description": recipe.description,
                    "image_url": recipe.image_url,
                    "prep_time_min": recipe.prep_time_min,
                    "cook_time_min": recipe.cook_time_min,
                    "producer_name": recipe.producer.name,
                    "producer_slug": recipe.producer.slug,
                    "saved_at": row.created_at,
                }
            )
    for row in by_type["event"]:
        event = events.get(row.item_id)
        if event:
            out["events"].append(
                {**serialize_event(event).model_dump(), "saved_at": row.created_at}
            )
    for row in by_type["experience"]:
        experience = experiences.get(row.item_id)
        if experience:
            out["experiences"].append(
                {
                    **_serialize_list(experience),
                    # The public list shape omits is_active (it only lists
                    # active ones); the saved list keeps a cancelled one, so
                    # the page needs it to label it.
                    "is_active": bool(experience.is_active),
                    "saved_at": row.created_at,
                }
            )
    return out


@router.post("/{item_type}/{item_id}", status_code=201)
def save_item(
    item_type: SavedItemType,
    item_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exists = _visible_by_ids(db, item_type, [item_id]).first()
    if not exists:
        raise HTTPException(status_code=404, detail="הפריט לא נמצא")

    already = (
        db.query(SavedItem.id)
        .filter(
            SavedItem.user_id == user.id,
            SavedItem.item_type == item_type,
            SavedItem.item_id == item_id,
        )
        .first()
    )
    if already:
        return {"detail": "Already saved"}

    try:
        db.add(SavedItem(user_id=user.id, item_type=item_type, item_id=item_id))
        db.commit()
    except IntegrityError:
        # A concurrent request inserted the same row first — idempotent, as in
        # favorites.add_favorite.
        db.rollback()
    return {"detail": "Saved"}


@router.delete("/{item_type}/{item_id}")
def unsave_item(
    item_type: SavedItemType,
    item_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # No visibility check: removing a save of an item that has since been
    # hidden must still work. The user_id filter is the ownership check — a
    # row of another user is never matched, so it is a 404 like a missing one.
    row = (
        db.query(SavedItem)
        .filter(
            SavedItem.user_id == user.id,
            SavedItem.item_type == item_type,
            SavedItem.item_id == item_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="הפריט לא שמור")
    db.delete(row)
    db.commit()
    return {"detail": "Removed"}
