"""
Module:   test_meh2662_product_ingredients_allergens
Purpose:  MEH-2662 chunk 1 — products carry optional, owner-declared
          `ingredients` (free text) and `allergens` (closed code list).
Touches:  POST/PUT /producers/me/products · POST /admin/producers/{id}/products
          · GET /producers/{id} (ProductOut).
Related:  backend/app/allergens.py · alembic b3e9f2a71c45.
Cells:    allergens 0 (null / []) · 1 · many (dedupe + canonical order) ·
          unknown code → 422; ingredients empty / filled; PUT unset vs null.
"""
import uuid

from app.allergens import ALLERGEN_CODES
from app.models.models import Product, User
from conftest import auth_header, make_producer, make_user


def _owner(db):
    producer = make_producer(db)
    user = User(
        email=f"p{uuid.uuid4().hex[:8]}@test.com",
        name="Producer User",
        password_hash="hash",
        role="producer",
        is_producer=True,
        producer_id=producer.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, producer


def _create(client, user, **extra):
    return client.post(
        "/producers/me/products",
        json={"name": "לחם מחמצת כוסמין", "price_min": 32, **extra},
        headers=auth_header(user),
    )


def test_the_closed_list_has_the_14_labelling_allergens():
    assert len(ALLERGEN_CODES) == 14
    assert len(set(ALLERGEN_CODES)) == 14


def test_neither_field_sent_both_come_back_null(client, db):
    user, _ = _owner(db)
    r = _create(client, user)
    assert r.status_code == 201, r.text
    assert r.json()["ingredients"] is None
    assert r.json()["allergens"] is None


def test_one_allergen_and_ingredients_are_stored(client, db):
    user, _ = _owner(db)
    r = _create(client, user, ingredients="קמח כוסמין מלא, מים, מחמצת, מלח", allergens=["gluten"])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ingredients"] == "קמח כוסמין מלא, מים, מחמצת, מלח"
    assert body["allergens"] == ["gluten"]
    db.expire_all()
    row = db.query(Product).filter(Product.id == body["id"]).one()
    assert row.allergens == ["gluten"]


def test_many_allergens_are_deduped_into_canonical_order(client, db):
    user, _ = _owner(db)
    r = _create(client, user, allergens=["sesame", "gluten", "sesame", "milk"])
    assert r.status_code == 201, r.text
    assert r.json()["allergens"] == ["gluten", "milk", "sesame"]


def test_empty_allergen_list_and_blank_ingredients_are_stored_as_null(client, db):
    # [] must not become a stored "contains no allergens" claim, and a blank
    # ingredients box must not become a non-NULL empty string.
    user, _ = _owner(db)
    r = _create(client, user, ingredients="   ", allergens=[])
    assert r.status_code == 201, r.text
    db.expire_all()
    row = db.query(Product).filter(Product.id == r.json()["id"]).one()
    assert row.allergens is None
    assert row.ingredients is None


def test_oversized_allergen_list_is_422_before_membership_check(client, db):
    user, producer = _owner(db)
    r = _create(client, user, allergens=["gluten"] * 51)
    assert r.status_code == 422, r.text
    assert db.query(Product).filter(Product.producer_id == producer.id).count() == 0


def test_unknown_allergen_code_is_422_and_nothing_is_written(client, db):
    user, producer = _owner(db)
    r = _create(client, user, allergens=["gluten", "pineapple"])
    assert r.status_code == 422, r.text
    assert db.query(Product).filter(Product.producer_id == producer.id).count() == 0


def test_put_without_the_fields_keeps_them_and_explicit_null_clears(client, db):
    user, _ = _owner(db)
    pid = _create(client, user, ingredients="חלב עיזים, מלח", allergens=["milk"]).json()["id"]
    r = client.put(f"/producers/me/products/{pid}", json={"name": "גבינת עיזים"}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["allergens"] == ["milk"]
    assert r.json()["ingredients"] == "חלב עיזים, מלח"
    r = client.put(
        f"/producers/me/products/{pid}",
        json={"allergens": None, "ingredients": None},
        headers=auth_header(user),
    )
    assert r.status_code == 200, r.text
    assert r.json()["allergens"] is None
    assert r.json()["ingredients"] is None


def test_admin_draft_product_drops_the_owner_declared_fields(client, db):
    draft = make_producer(db, status="draft")
    admin = make_user(db, role="admin")
    r = client.post(
        f"/admin/producers/{draft.id}/products",
        json={"name": "לחם", "price_min": "32", "ingredients": "קמח", "allergens": ["gluten"]},
        headers=auth_header(admin),
    )
    assert r.status_code == 201, r.text
    assert r.json()["ingredients"] is None
    assert r.json()["allergens"] is None
