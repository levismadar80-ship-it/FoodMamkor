"""
Module:   test_meh2924_optional_price
Purpose:  A product can be saved without a price (15 of 31 pilot leads sell
          at a seasonal or by-weight price). No migration: the column was
          already nullable; only ProductCreate required it. «מחיר משתנה לפי
          עונה» is derived on the frontend from price_min IS NULL.
Touches:  POST /producers/me/products, products.price_min.
Related:  backend/app/schemas/catalog.py (ProductCreate).
History:  MEH-2924 (creation).
"""

import uuid

from app.models.models import Product, User
from conftest import auth_header, make_producer

URL = "/producers/me/products"


def _owner(db):
    producer = make_producer(db)
    user = User(
        email=f"p{uuid.uuid4().hex[:8]}@example.com",
        name="Producer User",
        password_hash="hash",
        role="producer",
        is_producer=True,
        producer_id=producer.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_no_price_is_201_and_stored_null(client, db):
    user = _owner(db)
    r = client.post(URL, json={"name": "תפוזי עונה"}, headers=auth_header(user))
    assert r.status_code == 201, r.text
    assert r.json()["price_min"] is None
    assert db.query(Product).one().price_min is None


def test_explicit_null_price_is_201(client, db):
    user = _owner(db)
    r = client.post(
        URL, json={"name": "תפוזי עונה", "price_min": None}, headers=auth_header(user)
    )
    assert r.status_code == 201, r.text


def test_max_without_min_is_still_422(client, db):
    """A range needs its lower end: «עד 40» alone is not a price."""
    user = _owner(db)
    r = client.post(
        URL, json={"name": "תפוזי עונה", "price_max": 40}, headers=auth_header(user)
    )
    assert r.status_code == 422, r.text
    assert db.query(Product).count() == 0


def test_a_price_still_has_its_floor(client, db):
    user = _owner(db)
    r = client.post(
        URL, json={"name": "תפוזי עונה", "price_min": 0}, headers=auth_header(user)
    )
    assert r.status_code == 422, r.text


def _product(db, user, **price):
    p = Product(producer_id=user.producer_id, name="עגבניות", **price)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_update_max_only_on_a_priceless_product_is_422(client, db):
    """The schema sees only the fields sent; the route checks the row as it
    will be stored, so «עד» cannot be added to a product with no «מ-»."""
    user = _owner(db)
    p = _product(db, user)
    r = client.put(f"{URL}/{p.id}", json={"price_max": 40}, headers=auth_header(user))
    assert r.status_code == 422, r.text
    db.refresh(p)
    assert p.price_max is None


def test_update_clearing_min_under_a_max_is_422(client, db):
    user = _owner(db)
    p = _product(db, user, price_min=20, price_max=40)
    r = client.put(f"{URL}/{p.id}", json={"price_min": None}, headers=auth_header(user))
    assert r.status_code == 422, r.text
    db.refresh(p)
    assert p.price_min == 20


def test_update_clearing_both_is_200(client, db):
    user = _owner(db)
    p = _product(db, user, price_min=20, price_max=40)
    r = client.put(
        f"{URL}/{p.id}",
        json={"price_min": None, "price_max": None},
        headers=auth_header(user),
    )
    assert r.status_code == 200, r.text
    assert r.json()["price_min"] is None and r.json()["price_max"] is None


def test_update_max_below_stored_min_is_422(client, db):
    user = _owner(db)
    p = _product(db, user, price_min=30)
    r = client.put(f"{URL}/{p.id}", json={"price_max": 10}, headers=auth_header(user))
    assert r.status_code == 422, r.text
