"""
MEH-2910 (MEH-2899 area 6) — PATCH a recipe that belongs to someone else.

Round 3 of the action-map review scored
`PATCH /producers/me/recipes/{id}` at 11 and put it on the top-20 list.
The route is `update_my_recipe`
(`backend/app/routers/producer_recipes.py:250`); its ownership guard is
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

FIVE MORE BREAKS, added after a fresh reviewer demonstrated that the
first version of this file was green against all of them. Each is a
cross-owner write or an unobserved side effect that the earlier,
narrower snapshot let through; all five now red, and the old suite
stays green on every one:

  R13 the refused path reassigns `producer_id` to the caller, then 404
      — ownership theft. The old snapshot read 11 of the row's 15
      columns and `producer_id` was one of the four it skipped, i.e.
      the asset itself. 32 tests passed. Now caught by `_ALL_COLUMNS`.
  R10 the `product_ids` branch moved ahead of the ownership guard, so a
      stranger sending `{"product_ids": []}` wipes the victim's links
      and gets a 404. 32 tests passed, because the hostile payload did
      not send `product_ids` AND the coverage control compared against
      a list that excluded it. Now caught.
  R11 the refused path merely touches the victim's row
      (`flag_modified` + commit), bumping `updated_at`. 5 passed,
      because `updated_at` was outside the snapshot while the docstring
      claimed "every field the route could move". Now caught.
  R12 `_validate_product_ids` loses its owner filter AND a different
      422 branch answers instead. 5 passed, because the cross-owner
      test pinned only the status code — and this path has at least
      three sources of 422. Now caught by asserting the Hebrew detail.
  R6  the refused path queues the admin ping with `add_task`. 5 passed:
      Starlette discards tasks collected on a response it replaces with
      an exception handler's, so a recorder on the function name reds
      only if the route abandons background tasks altogether. Now
      caught by recording the ENQUEUE, which survives the drop.

R6's first fix was itself green against R6: it looked for a task named
`notify_admin_new_recipe`, and that name is patched in the test, so the
recorder saw `<lambda>`. The assertion now says "nothing beyond
`_INFRA_TASKS`" and carries a liveness control, because every request
queues `_release_session` and an empty queue would be a null that reads
like reassurance.
"""

from __future__ import annotations

from uuid import uuid4

import app.routers.producer_recipes as recipes_mod
from sqlalchemy import inspect
from starlette.background import BackgroundTasks

from app.models.models import Producer, ProducerRecipe, Product, User
from app.schemas.schemas import ProducerRecipeUpdate

from conftest import auth_header, make_producer, make_user

# The schema the handler iterates, in full. `product_ids` is a
# relationship rather than a column, so the snapshot reads it separately
# — but it stays in `_WRITABLE`, because the coverage control below has
# to be able to notice if the hostile payload omits it. An earlier
# revision excluded it from the coverage math AND from the payload, and a
# reviewer then demonstrated the hole that left: with the `product_ids`
# branch moved ahead of the ownership guard, a stranger sending
# `{"product_ids": []}` wiped the victim's links and got a 404, and all
# 32 tests passed.
_WRITABLE = tuple(ProducerRecipeUpdate.model_fields)
_COLUMN_FIELDS = tuple(f for f in _WRITABLE if f != "product_ids")
# EVERY mapped column, read off the model rather than listed here. The
# previous revision snapshotted 11 of the 15 columns, and the four it
# omitted included `producer_id` — which IS ownership, i.e. the single
# most valuable thing a PATCH IDOR can move. A reviewer demonstrated it:
# a refused path that reassigns `producer_id` to the caller and then
# raises 404 passed all 32 tests, silently transferring the recipe.
# `updated_at` was missing too, so a refused call that merely touched the
# victim's row left a trace the "byte-identical" claim says cannot exist.
_ALL_COLUMNS = tuple(c.key for c in inspect(ProducerRecipe).mapper.column_attrs)
# Queued by the framework on every request, not by this route:
# `get_db` releases the connection before background tasks run
# (MEH-2886, tests/test_meh2886_db_release.py). Anything else on a
# refused path is the route's own work.
_INFRA_TASKS = {"_release_session"}


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
    """The whole row plus its product links, read fresh from the database.

    Every mapped column, not a chosen subset — `producer_id`, `id` and
    `updated_at` included. See `_ALL_COLUMNS` for the two cross-owner
    writes that the earlier, narrower snapshot let through.
    """
    db.expire_all()
    recipe = db.get(ProducerRecipe, recipe_id)
    assert recipe is not None, "the recipe vanished"
    snap = {f: getattr(recipe, f) for f in _ALL_COLUMNS}
    snap["product_ids"] = sorted(str(p.id) for p in recipe.products)
    return snap


# The payload an attacker would send: every writable field at once,
# `product_ids` included (see `_WRITABLE`).
def _hostile_payload() -> dict:
    return {
        "product_ids": [],
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
    # Gate on something the product cannot quietly move to zero: if the
    # import above ever resolved to a schema with no fields, an empty
    # `_WRITABLE` would make the set difference empty and this control
    # would report coverage of nothing.
    assert len(_WRITABLE) >= 8, (
        f"ProducerRecipeUpdate exposes only {len(_WRITABLE)} fields "
        f"({_WRITABLE}) — the schema moved and this control is measuring "
        "an empty set"
    )
    missing = set(_WRITABLE) - set(_hostile_payload())
    assert not missing, (
        f"ProducerRecipeUpdate has writable fields the hostile payload does "
        f"not send: {sorted(missing)} — every 'unchanged' assertion in this "
        "module is void for those fields. `product_ids` in particular is a "
        "SEPARATE branch in the mutation loop, so a guard defect confined to "
        "it is invisible to a payload that omits it."
    )


def test_patch_someone_elses_recipe_404_and_changes_nothing(client, db, monkeypatch):
    """The whole point: 404, and the victim's row is byte-identical."""
    producer_a, _owner_a = _business(db, email=f"a-{uuid4().hex[:6]}@example.com")
    _producer_b, owner_b = _business(db, email=f"b-{uuid4().hex[:6]}@example.com")
    recipe = _victim_recipe(db, producer_a)
    recipe_id = recipe.id

    moderation_calls: list = []
    pings: list = []
    # MEH-1000's ping reaches the wire only through
    # `background_tasks.add_task`, and Starlette DISCARDS tasks collected
    # on a response it then replaces with an exception handler's. So a
    # recorder on the function name reds only if the route abandons
    # background tasks and calls it synchronously — the opposite of the
    # design under test. Measured by a reviewer: `add_task(...)` on the
    # refused path left all five tests green. `queued` therefore records
    # the ENQUEUE, which survives the drop, and `pings` records a
    # synchronous call. The two shapes together are the claim.
    queued: list = []
    real_add_task = BackgroundTasks.add_task


    def recording_add_task(self, func, *args, **kwargs):
        queued.append(getattr(func, "__name__", repr(func)))
        return real_add_task(self, func, *args, **kwargs)

    monkeypatch.setattr(BackgroundTasks, "add_task", recording_add_task)
    monkeypatch.setattr(
        recipes_mod,
        "validate_producer_recipe",
        lambda payload: moderation_calls.append(payload)
        # A distinctive reason, so `moderation_notes` actually moves if the
        # content branch runs. `None` over the victim's `None` was a cell
        # that could not discriminate.
        or {"status": "APPROVED", "reason": "נבדק על ידי הטסט"},
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
    assert pings == [], (
        "the refused PATCH called the admin notification synchronously"
    )
    # NOTHING queued, rather than "no task named X": the recorder sees
    # whatever object the route passes, and the admin ping is patched
    # above, so a name match would be looking for `<lambda>`. That is the
    # mistake the first version of this assertion made — it stayed green
    # against the very break it was added for. The refused path raises
    # before any `add_task`, so the queue must be empty.
    # The recorder's own liveness, which is what stops the next
    # assertion being vacuous: every request queues `_release_session`,
    # so an empty list means the patch is not landing and "nothing was
    # queued" would be a null that reads like reassurance.
    assert queued, (
        "the add_task recorder captured nothing at all, not even "
        "get_db's _release_session — the patch is not landing and the "
        "queue assertion below means nothing"
    )
    assert set(queued) <= _INFRA_TASKS, (
        f"the refused PATCH queued work of its own: {queued} — Starlette "
        "drops it before it runs, so nothing reaches the admin today, but "
        "the route is doing work about another business's recipe on a path "
        "that refused the request"
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
    # The REASON, not just the code. This path has at least three sources
    # of 422 — Pydantic body validation, `products_not_found`, and the
    # ownership refusal — so a bare status assertion is green in a world
    # where the owner filter is gone and a different branch answers.
    # Measured by a reviewer: `foreign = []` plus a `missing` computation
    # that fires instead left this test passing.
    assert resp.json()["detail"] == (
        "כל המוצרים המקושרים חייבים להיות שייכים לעסק שלך"
    ), resp.text
    after = _touchable_snapshot(db, recipe_id)
    assert after == before, (
        "the rejected PATCH still moved the recipe: "
        f"{ {k: (before[k], after[k]) for k in before if before[k] != after[k]} }"
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
