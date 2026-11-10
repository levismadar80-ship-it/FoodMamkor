"""
MEH-2910 (MEH-2899 area 6) — PATCH a recipe that belongs to someone else.

Round 3 of the action-map review scored
`PATCH /producers/me/recipes/{id}` at 11 and put it on the top-20 list.
The route is `update_my_recipe`
(`backend/app/routers/producer_recipes.py:246`); its ownership guard is
`if not recipe or recipe.producer_id != user.producer_id: 404`
(`:267-268`).

WHAT WAS ALREADY COVERED, and what was not. `tests/test_producer_recipes.py`
has the cross-owner case for the two neighbouring verbs and for create:

    :216  test_get_one_404_when_not_mine          GET    -> 404
    :345  test_non_owner_gets_404                 DELETE -> 404
    :168  test_cross_producer_products_blocked_422 POST  -> 422

All three `patch(` calls in that file (`:261`, `:288`, `:312`) act on the
owner's OWN recipe. Nothing had ever sent a PATCH for a recipe belonging
to another business.

WHY "404 HAPPENED" IS NOT THE CLAIM. The guard sits before the mutation
loop, so the interesting question is not the status code — it is whether
the victim's row is untouched, whether the refusal leaks the row's
existence, and whether the moderation and notification side effects stay
quiet. A route that mutated and then raised would answer 404 too.

THE SNAPSHOT IS DERIVED, NOT LISTED. `_touchable_snapshot` reads the
field names out of `ProducerRecipeUpdate.model_fields` — the same schema
the handler's `data.model_dump(exclude_unset=True)` iterates — so a new
writable field added to the schema tomorrow is compared by these tests
without anyone remembering to add it here. A hand-written list is the
artifact that asserts coverage and is least likely to be checked
(`.claude/rules/testing.md`).

SIBLING FOUND WHILE WRITING THIS (Bug Protocol §2). The existing DELETE
test at `:345` asserts `status_code == 404` and nothing else, so a route
that deleted the row and *then* raised 404 would pass it. The last test
here adds the survival check. `test_producer_recipes.py` is left
untouched.

SHOWN FAILING (MEH-1619), with what the existing 27-test suite in
`test_producer_recipes.py` does about each break:

  R1  the PATCH guard loses its ownership half:
        `if not recipe or recipe.producer_id != user.producer_id:`
      ->  `if not recipe:`
      MINE: patch-changes-nothing, 404-no-leak     OLD: 27 passed
  R2  the guard still answers 404, but only AFTER the mutation loop and
      the commit — the shape a status-only test cannot see
      MINE: patch-changes-nothing                  OLD: 27 passed
  R3  the refusal names the case: "Recipe belongs to another business"
      for a foreign row, "Recipe not found" for a missing one
      MINE: 404-no-leak                            OLD: 27 passed
  R4  `_validate_product_ids` stops filtering by owner (`foreign = []`)
      MINE: cross-owner-product                    OLD: 1 failed
  R5  DELETE deletes the row and then raises 404
      MINE: delete-row-survives                    OLD: 27 passed

Four of the five are invisible to the existing suite. R4 is the honest
exception: the POST test at `:168` catches it too, so the PATCH test adds
the second call path rather than the first detection.
"""

from __future__ import annotations

from uuid import uuid4

import app.routers.producer_recipes as recipes_mod
from app.models.models import Producer, ProducerRecipe, Product, User
from app.schemas.schemas import ProducerRecipeUpdate

from conftest import auth_header, make_producer, make_user

# The schema the handler iterates. `product_ids` is handled separately
# below because it is a relationship, not a column.
_WRITABLE = tuple(ProducerRecipeUpdate.model_fields)
_COLUMN_FIELDS = tuple(f for f in _WRITABLE if f != "product_ids")
# Written by the content-change branch, not by the payload — and the
# values an attacker would most want to move.
_DERIVED_FIELDS = ("moderation_status", "published", "moderation_notes")


def _business(db, *, email: str) -> tuple[Producer, User]:
    producer = make_producer(db, name=f"עסק {uuid4().hex[:6]}")
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _victim_recipe(db, producer: Producer) -> ProducerRecipe:
    """An approved, published recipe with a linked product.

    Approved + published so an unpublish is visible, and linked so a
    cleared relationship is visible too.
    """
    product = Product(producer_id=producer.id, name="קמח כוסמין", price_range="₪20")
    db.add(product)
    db.flush()
    recipe = ProducerRecipe(
        producer_id=producer.id,
        title="לחם הכוסמין של א׳",
        description="המתכון של בעלת העסק הראשונה",
        ingredients="א" * 40,
        instructions="ב" * 40,
        prep_time_min=25,
        cook_time_min=40,
        servings=6,
        image_url="https://res.cloudinary.com/demo/image/upload/victim.jpg",
        moderation_status="approved",
        published=True,
        moderation_notes=None,
    )
    recipe.products = [product]
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


def _touchable_snapshot(db, recipe_id) -> dict:
    """Every field the route could move, read fresh from the database."""
    db.expire_all()
    recipe = db.get(ProducerRecipe, recipe_id)
    assert recipe is not None, "the recipe vanished"
    snap = {f: getattr(recipe, f) for f in _COLUMN_FIELDS + _DERIVED_FIELDS}
    snap["product_ids"] = sorted(str(p.id) for p in recipe.products)
    return snap


# The payload an attacker would send: every writable column at once.
def _hostile_payload() -> dict:
    return {
        "title": "נחטף",
        "description": "נחטף",
        "ingredients": "ג" * 40,
        "instructions": "ד" * 40,
        "prep_time_min": 1,
        "cook_time_min": 1,
        "servings": 1,
        "image_url": "https://res.cloudinary.com/demo/image/upload/attacker.jpg",
    }


def test_the_hostile_payload_touches_every_writable_column(client, db):
    """Control: the payload below really does cover the schema.

    If a field were missing from `_hostile_payload`, the "nothing
    changed" assertions would be silent about it — green because nothing
    was sent, not because the guard held. This fails the moment the
    schema grows a writable column the payload does not carry.
    """
    missing = set(_COLUMN_FIELDS) - set(_hostile_payload())
    assert not missing, (
        f"ProducerRecipeUpdate has writable columns the hostile payload does "
        f"not send: {sorted(missing)} — every 'unchanged' assertion in this "
        "module is void for those fields"
    )


def test_patch_someone_elses_recipe_404_and_changes_nothing(client, db, monkeypatch):
    """The whole point: 404, and the victim's row is byte-identical."""
    producer_a, _owner_a = _business(db, email=f"a-{uuid4().hex[:6]}@example.com")
    _producer_b, owner_b = _business(db, email=f"b-{uuid4().hex[:6]}@example.com")
    recipe = _victim_recipe(db, producer_a)
    recipe_id = recipe.id

    moderation_calls: list = []
    pings: list = []
    monkeypatch.setattr(
        recipes_mod,
        "validate_producer_recipe",
        lambda payload: moderation_calls.append(payload)
        or {"status": "APPROVED", "reason": None},
    )
    monkeypatch.setattr(
        recipes_mod,
        "notify_admin_new_recipe",
        lambda *args, **kwargs: pings.append(args),
    )

    before = _touchable_snapshot(db, recipe_id)

    resp = client.patch(
        f"/producers/me/recipes/{recipe_id}",
        json=_hostile_payload(),
        headers=auth_header(owner_b),
    )

    assert resp.status_code == 404, resp.text

    after = _touchable_snapshot(db, recipe_id)
    assert after == before, (
        "a business edited another business's recipe through the API: "
        f"{ {k: (before[k], after[k]) for k in before if before[k] != after[k]} }"
    )
    # The side effects of a real edit, which a 404 must not pay for.
    assert moderation_calls == [], (
        "the refused PATCH sent another business's content to the moderator"
    )
    assert pings == [], "the refused PATCH queued an admin notification"
    assert after["published"] is True, (
        "the victim's recipe was unpublished by a stranger's PATCH"
    )


def test_the_404_does_not_say_whether_the_recipe_exists(client, db):
    """Someone else's recipe and a recipe that does not exist look alike.

    Status AND body. A different message for the two cases turns the
    route into an existence oracle: an attacker enumerating ids learns
    which ones are real without ever being allowed to read them.
    """
    producer_a, _owner_a = _business(db, email=f"a-{uuid4().hex[:6]}@example.com")
    _producer_b, owner_b = _business(db, email=f"b-{uuid4().hex[:6]}@example.com")
    recipe = _victim_recipe(db, producer_a)

    someone_elses = client.patch(
        f"/producers/me/recipes/{recipe.id}",
        json={"servings": 2},
        headers=auth_header(owner_b),
    )
    never_existed = client.patch(
        f"/producers/me/recipes/{uuid4()}",
        json={"servings": 2},
        headers=auth_header(owner_b),
    )

    assert someone_elses.status_code == never_existed.status_code == 404
    assert someone_elses.json() == never_existed.json(), (
        "the refusal differs between an existing recipe and a missing one, so "
        f"the route confirms which ids are real: {someone_elses.json()} vs "
        f"{never_existed.json()}"
    )


def test_patch_cannot_link_another_businesss_product(client, db, monkeypatch):
    """`product_ids` is the second ownership surface on this route.

    `POST` has this covered (`test_producer_recipes.py:168`); the PATCH
    path through `_validate_product_ids` did not. The recipe here belongs
    to B — only the product is A's — so this is about the link, not about
    the recipe guard tested above.
    """
    producer_a, _owner_a = _business(db, email=f"a-{uuid4().hex[:6]}@example.com")
    producer_b, owner_b = _business(db, email=f"b-{uuid4().hex[:6]}@example.com")
    foreign = Product(producer_id=producer_a.id, name="מוצר של א׳", price_range="₪20")
    db.add(foreign)
    db.commit()
    own_recipe = _victim_recipe(db, producer_b)
    recipe_id = own_recipe.id

    before = _touchable_snapshot(db, recipe_id)

    resp = client.patch(
        f"/producers/me/recipes/{recipe_id}",
        json={"product_ids": [str(foreign.id)]},
        headers=auth_header(owner_b),
    )

    assert resp.status_code == 422, resp.text
    after = _touchable_snapshot(db, recipe_id)
    assert after == before, (
        "the rejected PATCH still moved the recipe: "
        f"{ {k: (before[k], after[k]) for k in before if before[k] != after[k]} }"
    )
    assert after["product_ids"] == before["product_ids"], (
        "another business's product was linked to this recipe"
    )


def test_delete_someone_elses_recipe_404_and_the_row_survives(client, db):
    """Sibling of the PATCH guard, and the half the existing test omits.

    `test_producer_recipes.py:345` asserts the 404 alone, so a route that
    deleted the row and then raised would pass it. This asserts the row
    is still there, still owned by A, and still published.
    """
    producer_a, _owner_a = _business(db, email=f"a-{uuid4().hex[:6]}@example.com")
    _producer_b, owner_b = _business(db, email=f"b-{uuid4().hex[:6]}@example.com")
    recipe = _victim_recipe(db, producer_a)
    recipe_id = recipe.id

    resp = client.delete(
        f"/producers/me/recipes/{recipe_id}", headers=auth_header(owner_b)
    )

    assert resp.status_code == 404, resp.text
    db.expire_all()
    survivor = db.get(ProducerRecipe, recipe_id)
    assert survivor is not None, (
        "a business deleted another business's recipe and got a 404 for it"
    )
    assert survivor.producer_id == producer_a.id
    assert survivor.published is True
