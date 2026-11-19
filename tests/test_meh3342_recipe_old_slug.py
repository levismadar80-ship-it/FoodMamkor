"""MEH-3342 finding 3 — a recipe link from before a business was renamed.

`/<old-slug>/recipes/<id>` used to be a hard 404 (the sitemap lists these
URLs). The business page already 301s (MEH-3336); the recipe endpoint now
answers the same `slug_moved` 404, so the page edge can 301 to
`/<new-slug>/recipes/<id>`.

DISCRIMINATION: against the old resolver (plain 404 string) the first test
fails on `detail["code"]`; the unknown-slug test is the control that stops an
"always slug_moved" fix passing.
"""

from app.models.models import ProducerRecipe
from tests.conftest import auth_header, make_producer, make_user


def _rename(client, db, producer, new_slug):
    admin = make_user(db, email="admin-3342@test.com", role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"slug": new_slug},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text


def _recipe(db, producer):
    recipe = ProducerRecipe(
        producer_id=producer.id,
        title="עוגת שמרים",
        ingredients="א" * 20,
        instructions="ב" * 20,
        moderation_status="approved",
        published=True,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


def test_a_recipe_under_the_old_slug_points_at_the_new_one(client, db):
    producer = make_producer(db)
    producer.slug = "old-bakery"
    db.commit()
    recipe = _recipe(db, producer)
    _rename(client, db, producer, "new-bakery")

    live = client.get(f"/producers/new-bakery/recipes/{recipe.id}")
    assert live.status_code == 200

    old = client.get(f"/producers/old-bakery/recipes/{recipe.id}")
    assert old.status_code == 404
    assert old.json()["detail"]["code"] == "slug_moved"
    assert old.json()["detail"]["slug"] == "new-bakery"


def test_an_unknown_business_slug_is_still_a_plain_404(client, db):
    producer = make_producer(db)
    recipe = _recipe(db, producer)
    resp = client.get(f"/producers/never-existed/recipes/{recipe.id}")
    assert resp.status_code == 404
    assert isinstance(resp.json()["detail"], str)
