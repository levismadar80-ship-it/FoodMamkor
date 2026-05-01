"""MEH-311 — RecipeIngredient.producer_id must SET NULL when Producer is deleted.

Before MEH-311, `recipe_ingredients.producer_id` was a nullable FK to
`producers.id` with NO ondelete clause. PostgreSQL default = NO ACTION,
so deleting a Producer that any RecipeIngredient referenced raised
`psycopg2.errors.ForeignKeyViolation`. This blocked MEH-249's
DELETE /auth/me cascade if the producer had any recipe ingredients
pointing at her.

After MEH-311, the FK has ON DELETE SET NULL — the recipe survives
with `producer_id=NULL` (attribution dropped, content kept).
"""
from app.models.models import Producer, Recipe, RecipeIngredient
from tests.conftest import auth_header, make_producer, make_user


def _make_recipe_with_ingredient(db, producer):
    """Create a Recipe + RecipeIngredient pointing at the given producer."""
    consumer = make_user(db, role="consumer")
    recipe = Recipe(
        title="עוגיות חמאה",
        description="מהאם של הסבתא",
        steps=["ערבבי", "אפי", "אכלי"],
        submitted_by=consumer.id,
        status="approved",
    )
    db.add(recipe)
    db.flush()
    ingredient = RecipeIngredient(
        recipe_id=recipe.id,
        ingredient_name="חמאה איכותית",
        producer_id=producer.id,
        notes="100 גרם",
    )
    db.add(ingredient)
    db.commit()
    db.refresh(ingredient)
    return recipe, ingredient


def test_recipe_ingredient_set_null_on_producer_delete(client, db):
    """Deleting a Producer SETs NULL on referencing recipe_ingredients;
    recipe survives, ingredient survives, only the FK is cleared."""
    producer = make_producer(db, name="חוות העוגיות")
    recipe, ingredient = _make_recipe_with_ingredient(db, producer)
    recipe_id = recipe.id
    ingredient_id = ingredient.id

    db.delete(producer)
    db.commit()

    # Producer gone
    assert db.query(Producer).filter(Producer.id == producer.id).first() is None
    # Recipe survives
    surviving_recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    assert surviving_recipe is not None
    # Ingredient survives, producer_id cleared
    surviving_ingredient = db.query(RecipeIngredient).filter(
        RecipeIngredient.id == ingredient_id
    ).first()
    assert surviving_ingredient is not None
    assert surviving_ingredient.producer_id is None
    assert surviving_ingredient.ingredient_name == "חמאה איכותית"


def test_delete_account_does_not_fail_on_recipe_ingredient(client, db):
    """Regression for MEH-249 + MEH-311: producer-user deletes her account
    via DELETE /auth/me while a RecipeIngredient still references her
    producer. Without the ondelete=SET NULL fix this raises FK violation
    inside `db.delete(producer)` and the entire account-deletion fails."""
    producer = make_producer(db, name="חוות הסיכון")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()

    # A consumer adds a recipe whose ingredient references this producer.
    _make_recipe_with_ingredient(db, producer)

    producer_id = producer.id
    r = client.delete("/auth/me", headers=auth_header(user))
    assert r.status_code == 200

    # Producer gone, but the recipe + ingredient survive (producer_id=NULL).
    assert db.query(Producer).filter(Producer.id == producer_id).first() is None
    surviving = db.query(RecipeIngredient).filter(
        RecipeIngredient.producer_id == producer_id
    ).count()
    assert surviving == 0  # FK no longer points at her
    # And there's still exactly one ingredient row in the DB (with producer_id=NULL).
    total = db.query(RecipeIngredient).count()
    assert total == 1
