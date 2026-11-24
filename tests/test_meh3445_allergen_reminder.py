"""
Module:   test_meh3445_allergen_reminder
Purpose:  MEH-3445 — «מה מחכה לטיפול» counts this business's published products
          with no allergen declaration (`attention.products_no_allergens`).
Touches:  GET /producers/me/dashboard.
Related:  backend/app/services/owner_attention.py _products_no_allergens.
Cells:    0 products → 0 · 1 unmarked → 1 · many, mixed → only the unmarked ·
          «עלול להכיל» alone counts as marked · a draft is not counted ·
          another business's products are not counted · «אין אלרגנים» stored,
          returned, beaten by any code (create and PUT), dropped on admin
          drafts, and not counted.
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


# «אין במוצר אלרגנים מהרשימה» — an explicit declaration, not a gap.


def test_declared_none_is_not_counted(client, db):
    owner = _owner(db, email="alg-none@example.com")
    _add(db, owner.producer_id, name="דבש", no_allergens=True)
    _add(db, owner.producer_id, name="לחם")
    assert _attention(client, owner)["products_no_allergens"] == 1


def test_none_is_stored_and_returned(client, db):
    from conftest import auth_header
    from test_meh2662_product_ingredients_allergens import _create
    from test_meh2662_product_ingredients_allergens import _owner as _plain_owner

    user, _ = _plain_owner(db)
    r = _create(client, user, no_allergens=True)
    assert r.status_code == 201, r.text
    assert r.json()["no_allergens"] is True
    assert db.get(Product, r.json()["id"]).no_allergens is True
    pid = r.json()["id"]
    # Unsent stays put; null means false.
    r = client.put(f"/producers/me/products/{pid}", json={"name": "דבש פרחי בר"}, headers=auth_header(user))
    assert r.json()["no_allergens"] is True
    r = client.put(f"/producers/me/products/{pid}", json={"no_allergens": None}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["no_allergens"] is False


def test_a_code_beats_none_on_create(client, db):
    from test_meh2662_product_ingredients_allergens import _create
    from test_meh2662_product_ingredients_allergens import _owner as _plain_owner

    user, _ = _plain_owner(db)
    r = _create(client, user, no_allergens=True, may_contain=["sesame"])
    assert r.status_code == 201, r.text
    assert r.json()["no_allergens"] is False


def test_a_code_put_later_clears_stored_none(client, db):
    # The schema sees only the body; the router checks the stored row.
    from conftest import auth_header
    from test_meh2662_product_ingredients_allergens import _create
    from test_meh2662_product_ingredients_allergens import _owner as _plain_owner

    user, _ = _plain_owner(db)
    pid = _create(client, user, no_allergens=True).json()["id"]
    r = client.put(f"/producers/me/products/{pid}", json={"allergens": ["milk"]}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["no_allergens"] is False
    assert db.get(Product, pid).no_allergens is False
    # And "none" sent while a code is stored does not stick either.
    r = client.put(f"/producers/me/products/{pid}", json={"no_allergens": True}, headers=auth_header(user))
    assert r.json()["no_allergens"] is False


def test_admin_draft_product_drops_none(client, db):
    from conftest import auth_header, make_user

    draft = make_producer(db, status="draft")
    admin = make_user(db, role="admin")
    r = client.post(
        f"/admin/producers/{draft.id}/products",
        json={"name": "דבש", "price_min": "40", "no_allergens": True},
        headers=auth_header(admin),
    )
    assert r.status_code == 201, r.text
    assert r.json()["no_allergens"] is False


def test_edit_form_body_declares_none_over_stored_codes(client, db):
    # The edit form sends both lists null with no_allergens true in one PUT.
    from conftest import auth_header
    from test_meh2662_product_ingredients_allergens import _create
    from test_meh2662_product_ingredients_allergens import _owner as _plain_owner

    user, _ = _plain_owner(db)
    pid = _create(client, user, allergens=["gluten"], may_contain=["sesame"]).json()["id"]
    r = client.put(
        f"/producers/me/products/{pid}",
        json={"no_allergens": True, "allergens": None, "may_contain": None},
        headers=auth_header(user),
    )
    assert r.status_code == 200, r.text
    assert (r.json()["no_allergens"], r.json()["allergens"], r.json()["may_contain"]) == (True, None, None)
