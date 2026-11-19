"""
Module:   test_meh3442_allergen_detail
Purpose:  MEH-3442 — «איזה דגן?» / «איזה אגוז?»: owner free text naming the
          source of gluten / tree nuts (`gluten_detail`, `nuts_detail`).
Touches:  POST/PUT /producers/me/products · POST /admin/producers/{id}/products.
Related:  backend/app/allergens.py detail_if_declared · alembic c9e1a5d3f7b2.
Cells:    detail with its code in «מכיל» / in «עלול להכיל» → stored · detail
          without its code → dropped · PUT that unticks the code (lists only)
          → dropped from the stored row · PUT unset keeps · over 80 → 422 ·
          admin draft drops · approved business edit AI-checked.
"""
from unittest.mock import patch

from app.models.models import Product
from conftest import auth_header, make_producer, make_user
from test_meh2662_product_ingredients_allergens import _create, _owner
from test_meh3261_approved_edit_moderation import MODERATE, NOTIFY, _product
from test_meh3261_approved_edit_moderation import _owner as _approved_owner


def test_details_stored_with_their_codes(client, db):
    user, _ = _owner(db)
    r = _create(client, user, allergens=["gluten"], may_contain=["tree_nuts"], gluten_detail="כוסמין", nuts_detail="שקדים")
    assert r.status_code == 201, r.text
    assert (r.json()["gluten_detail"], r.json()["nuts_detail"]) == ("כוסמין", "שקדים")
    row = db.get(Product, r.json()["id"])
    assert (row.gluten_detail, row.nuts_detail) == ("כוסמין", "שקדים")


def test_detail_without_its_code_is_dropped(client, db):
    user, _ = _owner(db)
    r = _create(client, user, allergens=["milk"], gluten_detail="כוסמין", nuts_detail="שקדים")
    assert r.status_code == 201, r.text
    assert r.json()["gluten_detail"] is None
    assert r.json()["nuts_detail"] is None


def test_put_unticking_the_code_drops_the_stored_detail(client, db):
    user, _ = _owner(db)
    pid = _create(client, user, allergens=["gluten", "tree_nuts"], gluten_detail="כוסמין", nuts_detail="שקדים").json()["id"]
    r = client.put(f"/producers/me/products/{pid}", json={"allergens": ["gluten"]}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["gluten_detail"] == "כוסמין"
    assert r.json()["nuts_detail"] is None
    assert db.get(Product, pid).nuts_detail is None


def test_put_unset_keeps(client, db):
    user, _ = _owner(db)
    pid = _create(client, user, allergens=["gluten"], gluten_detail="כוסמין").json()["id"]
    r = client.put(f"/producers/me/products/{pid}", json={"name": "עוגיות"}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["gluten_detail"] == "כוסמין"


def test_over_80_chars_is_422(client, db):
    user, _ = _owner(db)
    r = _create(client, user, allergens=["gluten"], gluten_detail="א" * 81)
    assert r.status_code == 422, r.text


def test_admin_draft_product_drops_details(client, db):
    draft = make_producer(db, status="draft")
    admin = make_user(db, role="admin")
    r = client.post(
        f"/admin/producers/{draft.id}/products",
        json={"name": "לחם", "price_min": "32", "gluten_detail": "כוסמין"},
        headers=auth_header(admin),
    )
    assert r.status_code == 201, r.text
    assert r.json()["gluten_detail"] is None


def test_approved_business_edit_is_ai_checked(client, db):
    user, _ = _approved_owner(db)
    with patch(MODERATE, return_value="APPROVED"), patch("app.routers.alerts.fire_alerts"):
        pid = _product(client, user, allergens=["gluten"]).json()["id"]
    with patch(MODERATE, return_value="APPROVED") as ai, patch(NOTIFY):
        r = client.put(f"/producers/me/products/{pid}", json={"gluten_detail": "כוסמין"}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    ai.assert_called_once_with({"gluten_detail": "כוסמין"}, "product_content")
