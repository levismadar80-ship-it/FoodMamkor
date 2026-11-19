"""
Module:   test_meh3444_product_storage
Purpose:  MEH-3444 — products carry an optional, owner-declared «אחסון ותוקף»
          free text (`storage_info`).
Touches:  POST/PUT /producers/me/products · POST /admin/producers/{id}/products.
Related:  alembic b4d8e2f6a1c3 · frontend/components/public/ProductSheet.jsx.
Cells:    not sent → null · text stored · blank → null · markup bleached ·
          over 300 chars → 422 · PUT unset keeps / null clears · admin draft
          drops it · public producer detail carries it.
"""
from app.models.models import Product
from conftest import auth_header, make_producer, make_user
from test_meh2662_product_ingredients_allergens import _create, _owner

STORAGE = "בקירור, עד 10 ימים מיום הקנייה"


def test_not_sent_comes_back_null(client, db):
    user, _ = _owner(db)
    r = _create(client, user)
    assert r.status_code == 201, r.text
    assert r.json()["storage_info"] is None


def test_text_is_stored(client, db):
    user, _ = _owner(db)
    r = _create(client, user, storage_info=STORAGE)
    assert r.status_code == 201, r.text
    assert r.json()["storage_info"] == STORAGE
    assert db.get(Product, r.json()["id"]).storage_info == STORAGE


def test_blank_is_stored_as_null(client, db):
    user, _ = _owner(db)
    r = _create(client, user, storage_info="   ")
    assert r.status_code == 201, r.text
    assert db.get(Product, r.json()["id"]).storage_info is None


def test_markup_is_bleached(client, db):
    user, _ = _owner(db)
    r = _create(client, user, storage_info="<script>x()</script>בקירור")
    assert r.status_code == 201, r.text
    assert "<script>" not in (r.json()["storage_info"] or "")
    assert "בקירור" in r.json()["storage_info"]


def test_over_300_chars_is_422(client, db):
    user, _ = _owner(db)
    r = _create(client, user, storage_info="א" * 301)
    assert r.status_code == 422, r.text


def test_put_unset_keeps_and_null_clears(client, db):
    user, _ = _owner(db)
    pid = _create(client, user, storage_info=STORAGE).json()["id"]
    r = client.put(f"/producers/me/products/{pid}", json={"name": "עוגיות"}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["storage_info"] == STORAGE
    r = client.put(f"/producers/me/products/{pid}", json={"storage_info": None}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["storage_info"] is None
    assert db.get(Product, pid).storage_info is None


def test_admin_draft_product_drops_storage_info(client, db):
    draft = make_producer(db, status="draft")
    admin = make_user(db, role="admin")
    r = client.post(
        f"/admin/producers/{draft.id}/products",
        json={"name": "לחם", "price_min": "32", "storage_info": STORAGE},
        headers=auth_header(admin),
    )
    assert r.status_code == 201, r.text
    assert r.json()["storage_info"] is None


def test_public_detail_carries_storage_info(client, db):
    user, producer = _owner(db)
    _create(client, user, storage_info=STORAGE)
    r = client.get(f"/producers/{producer.id}")
    assert r.status_code == 200, r.text
    assert [p["storage_info"] for p in r.json()["products"]] == [STORAGE]
