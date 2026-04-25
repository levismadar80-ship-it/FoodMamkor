"""MEH-313 — recipes.submitted_by ON DELETE CASCADE.

Before MEH-313, `recipes.submitted_by` was a NOT NULL FK to `users.id`
with no ondelete clause. PostgreSQL default = NO ACTION, so deleting a
User who had any Recipe raised psycopg2.errors.ForeignKeyViolation —
DELETE /auth/me failed completely for any user with recipes.

Product decision: CASCADE. Recipes are user-owned content; deleting the
user wipes their recipes. GDPR-friendly, no orphan rows.
"""
import uuid

import pytest

from app.models.models import Recipe, User
from tests.conftest import auth_header, make_user


def _make_recipe(db, user: User) -> Recipe:
    recipe = Recipe(
        title="לחם שאור",
        description="מתכון בסיסי",
        steps=["ערבבי", "התפיחי", "אפי"],
        submitted_by=user.id,
        status="approved",
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


def test_recipes_cascade_on_user_delete(client, db):
    """Deleting a User cascades to their Recipes; no FK violation, rows gone."""
    user = make_user(db, role="consumer")
    recipe = _make_recipe(db, user)
    recipe_id = recipe.id

    db.delete(user)
    db.commit()

    assert db.query(User).filter(User.id == user.id).first() is None
    assert db.query(Recipe).filter(Recipe.id == recipe_id).first() is None


def test_delete_account_with_recipes_succeeds(client, db):
    """Regression for MEH-313: user with recipes calls DELETE /auth/me → 200,
    no ForeignKeyViolation, recipes removed."""
    user = make_user(db, role="consumer")
    _make_recipe(db, user)
    _make_recipe(db, user)

    r = client.delete("/auth/me", headers=auth_header(user))
    assert r.status_code == 200

    assert db.query(User).filter(User.id == user.id).first() is None
    assert db.query(Recipe).filter(Recipe.submitted_by == user.id).count() == 0
