"""
Module:   test_meh3439_product_may_contain
Purpose:  MEH-3439 — products carry an optional, owner-declared «עלול להכיל»
          list (`may_contain`), separate from «מכיל» (`allergens`).
Touches:  POST/PUT /producers/me/products · POST /admin/producers/{id}/products.
Related:  backend/app/allergens.py drop_contained · alembic f1a7c3e9b2d5.
Cells:    may_contain 0 (null / []) · 1 · many (canonical order) · unknown
          code → 422 · overlap with allergens dropped («מכיל» wins) · overlap
          only → NULL · PUT unset keeps / null clears · admin draft drops it.
"""
from app.models.models import Product
from conftest import auth_header, make_producer, make_user
from test_meh2662_product_ingredients_allergens import _create, _owner


def test_not_sent_comes_back_null(client, db):
    user, _ = _owner(db)
    r = _create(client, user)
    assert r.status_code == 201, r.text
    assert r.json()["may_contain"] is None


def test_one_code_is_stored(client, db):
    user, _ = _owner(db)
    r = _create(client, user, may_contain=["tree_nuts"])
    assert r.status_code == 201, r.text
    assert r.json()["may_contain"] == ["tree_nuts"]
    assert db.get(Product, r.json()["id"]).may_contain == ["tree_nuts"]


def test_many_codes_come_back_in_canonical_order(client, db):
    user, _ = _owner(db)
    r = _create(client, user, may_contain=["sesame", "peanuts", "tree_nuts", "sesame"])
    assert r.status_code == 201, r.text
    assert r.json()["may_contain"] == ["tree_nuts", "peanuts", "sesame"]


def test_empty_list_is_stored_as_null(client, db):
    user, _ = _owner(db)
    r = _create(client, user, may_contain=[])
    assert r.status_code == 201, r.text
    assert db.get(Product, r.json()["id"]).may_contain is None


def test_unknown_code_is_422(client, db):
    user, _ = _owner(db)
    r = _create(client, user, may_contain=["pineapple"])
    assert r.status_code == 422, r.text


def test_a_contained_allergen_is_dropped_from_may_contain(client, db):
    user, _ = _owner(db)
    r = _create(client, user, allergens=["milk", "gluten"], may_contain=["milk", "sesame"])
    assert r.status_code == 201, r.text
    assert r.json()["allergens"] == ["gluten", "milk"]
    assert r.json()["may_contain"] == ["sesame"]


def test_overlap_only_becomes_null(client, db):
    user, _ = _owner(db)
    r = _create(client, user, allergens=["milk"], may_contain=["milk"])
    assert r.status_code == 201, r.text
    assert r.json()["may_contain"] is None


def test_put_unset_keeps_and_null_clears(client, db):
    user, _ = _owner(db)
    pid = _create(client, user, may_contain=["tree_nuts"]).json()["id"]
    r = client.put(f"/producers/me/products/{pid}", json={"name": "עוגיות"}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["may_contain"] == ["tree_nuts"]
    r = client.put(
        f"/producers/me/products/{pid}",
        json={"allergens": ["tree_nuts"], "may_contain": ["tree_nuts", "eggs"]},
        headers=auth_header(user),
    )
    assert r.json()["may_contain"] == ["eggs"]
    r = client.put(f"/producers/me/products/{pid}", json={"may_contain": None}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["may_contain"] is None


def test_admin_draft_product_drops_may_contain(client, db):
    draft = make_producer(db, status="draft")
    admin = make_user(db, role="admin")
    r = client.post(
        f"/admin/producers/{draft.id}/products",
        json={"name": "לחם", "price_min": "32", "may_contain": ["sesame"]},
        headers=auth_header(admin),
    )
    assert r.status_code == 201, r.text
    assert r.json()["may_contain"] is None
