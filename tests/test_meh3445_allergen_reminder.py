"""
Module:   test_meh3445_allergen_reminder
Purpose:  MEH-3445 — «מה מחכה לך» counts this business's published products
          with no allergen declaration (`attention.products_no_allergens`).
Touches:  GET /producers/me/dashboard.
Related:  backend/app/services/owner_attention.py _products_no_allergens.
Cells:    0 products → 0 · 1 unmarked → 1 · many, mixed → only the unmarked ·
          «עלול להכיל» alone counts as marked · a draft is not counted ·
          another business's products are not counted.
"""
from app.models import Product
from conftest import make_producer
from test_meh2763_registrations import _owner
from test_meh3108_owner_attention import _attention


def _add(db, producer_id, **kw):
    db.add(Product(producer_id=producer_id, name=kw.pop("name", "לחם"), price_min=20, **kw))
    db.commit()


def test_no_products_is_zero(client, db):
    owner = _owner(db, email="alg-0@example.com")
    assert _attention(client, owner)["products_no_allergens"] == 0


def test_one_unmarked_product_counts(client, db):
    owner = _owner(db, email="alg-1@example.com")
    _add(db, owner.producer_id)
    assert _attention(client, owner)["products_no_allergens"] == 1


def test_only_unmarked_published_products_of_this_business_count(client, db):
    owner = _owner(db, email="alg-n@example.com")
    pid = owner.producer_id
    _add(db, pid, name="א")
    _add(db, pid, name="ב")
    _add(db, pid, name="מכיל", allergens=["gluten"])
    _add(db, pid, name="עלול", may_contain=["sesame"])
    _add(db, pid, name="טיוטה", is_draft=True)
    other = make_producer(db)
    _add(db, other.id, name="של אחרת")
    att = _attention(client, owner)
    assert att["products_no_allergens"] == 2
    assert att["products"] == 5
