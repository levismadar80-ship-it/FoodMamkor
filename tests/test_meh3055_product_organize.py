"""MEH-3055 — the owner's product order and product groups.

Every write route is owner-scoped: a second business's products and groups
are never reachable. Bodies are schema-valid in every guard test (Regression
rule 6), so a 4xx here is the guard, not pydantic.
"""

import uuid

from app import limits
from app.models import Product
from tests.conftest import auth_header, make_producer, make_user


def _owner(db):
    producer = make_producer(db)
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user, producer


def _products(db, producer, n):
    rows = [Product(producer_id=producer.id, name=f"מוצר {i}", price_min=10) for i in range(n)]
    db.add_all(rows)
    db.commit()
    return rows


def _public(client, producer):
    r = client.get(f"/producers/{producer.id}")
    assert r.status_code == 200, r.text
    return r.json()


# --- groups ------------------------------------------------------------------


def test_groups_start_empty_and_public_payload_says_so(client, db):
    user, producer = _owner(db)
    assert client.get("/producers/me/product-groups", headers=auth_header(user)).json() == []
    assert _public(client, producer)["product_groups"] == []


def test_groups_add_rename_reorder_delete_in_one_list(client, db):
    user, producer = _owner(db)
    h = auth_header(user)
    r = client.put("/producers/me/product-groups", json={"groups": [{"name": "לחמים"}, {"name": "עוגות"}]}, headers=h)
    assert r.status_code == 200, r.text
    breads, cakes = r.json()
    assert breads["name"] == "לחמים" and cakes["name"] == "עוגות"
    assert breads["id"] != cakes["id"]

    # rename + reorder: same ids, new order, new name
    r = client.put(
        "/producers/me/product-groups",
        json={"groups": [{"id": cakes["id"], "name": "עוגות ומאפים"}, {"id": breads["id"], "name": "לחמים"}]},
        headers=h,
    )
    assert [g["name"] for g in r.json()] == ["עוגות ומאפים", "לחמים"]
    assert [g["id"] for g in _public(client, producer)["product_groups"]] == [cakes["id"], breads["id"]]


def test_deleting_a_group_ungroups_its_products_and_keeps_them(client, db):
    user, producer = _owner(db)
    h = auth_header(user)
    (p,) = _products(db, producer, 1)
    g = client.put("/producers/me/product-groups", json={"groups": [{"name": "לחמים"}]}, headers=h).json()[0]
    assert client.put(f"/producers/me/products/{p.id}/group", json={"group_id": g["id"]}, headers=h).status_code == 200
    assert _public(client, producer)["products"][0]["group_id"] == g["id"]

    r = client.put("/producers/me/product-groups", json={"groups": []}, headers=h)
    assert r.status_code == 200
    body = _public(client, producer)
    assert len(body["products"]) == 1
    assert body["products"][0]["group_id"] is None


def test_group_cap_refuses_in_hebrew(client, db):
    user, _ = _owner(db)
    groups = [{"name": f"קבוצה {i}"} for i in range(limits.MAX_PRODUCT_GROUPS + 1)]
    r = client.put("/producers/me/product-groups", json={"groups": groups}, headers=auth_header(user))
    assert r.status_code == 422
    assert "קבוצות מוצרים" in r.text
    ok = client.put("/producers/me/product-groups", json={"groups": groups[:-1]}, headers=auth_header(user))
    assert ok.status_code == 200


def test_group_name_rules(client, db):
    user, _ = _owner(db)
    h = auth_header(user)
    too_long = client.put("/producers/me/product-groups", json={"groups": [{"name": "א" * 41}]}, headers=h)
    assert too_long.status_code == 422 and "40" in too_long.text
    dup = client.put("/producers/me/product-groups", json={"groups": [{"name": "לחם"}, {"name": "לחם"}]}, headers=h)
    assert dup.status_code == 422
    two_letters = client.put("/producers/me/product-groups", json={"groups": [{"name": "תה"}]}, headers=h)
    assert two_letters.status_code == 200


def test_a_group_id_from_another_business_is_refused(client, db):
    me, _ = _owner(db)
    other, _ = _owner(db)
    theirs = client.put("/producers/me/product-groups", json={"groups": [{"name": "שלהם"}]}, headers=auth_header(other)).json()[0]
    r = client.put("/producers/me/product-groups", json={"groups": [{"id": theirs["id"], "name": "גניבה"}]}, headers=auth_header(me))
    assert r.status_code == 404


def test_assigning_a_product_of_another_business_is_404(client, db):
    me, _ = _owner(db)
    other, other_producer = _owner(db)
    (theirs,) = _products(db, other_producer, 1)
    mine_group = client.put("/producers/me/product-groups", json={"groups": [{"name": "שלי"}]}, headers=auth_header(me)).json()[0]
    r = client.put(f"/producers/me/products/{theirs.id}/group", json={"group_id": mine_group["id"]}, headers=auth_header(me))
    assert r.status_code == 404
    db.refresh(theirs)
    assert theirs.group_id is None


def test_assigning_an_unknown_group_is_404(client, db):
    user, producer = _owner(db)
    (p,) = _products(db, producer, 1)
    r = client.put(f"/producers/me/products/{p.id}/group", json={"group_id": str(uuid.uuid4())}, headers=auth_header(user))
    assert r.status_code == 404


def test_consumer_cannot_touch_groups(client, db):
    consumer = make_user(db, email=f"c{uuid.uuid4().hex[:8]}@example.com")
    r = client.put("/producers/me/product-groups", json={"groups": [{"name": "לחם"}]}, headers=auth_header(consumer))
    assert r.status_code in (401, 403)


# --- order -------------------------------------------------------------------


def test_order_is_saved_and_public(client, db):
    user, producer = _owner(db)
    a, b, c = _products(db, producer, 3)
    ids = [str(c.id), str(a.id), str(b.id)]
    r = client.put("/producers/me/product-order", json={"product_ids": ids}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert [p["id"] for p in r.json()] == ids
    pos = {p["id"]: p["position"] for p in _public(client, producer)["products"]}
    assert [pos[i] for i in ids] == [0, 1, 2]


def test_order_must_name_every_product_exactly_once(client, db):
    user, producer = _owner(db)
    a, b = _products(db, producer, 2)
    h = auth_header(user)
    partial = client.put("/producers/me/product-order", json={"product_ids": [str(a.id)]}, headers=h)
    assert partial.status_code == 409
    dup = client.put("/producers/me/product-order", json={"product_ids": [str(a.id), str(a.id)]}, headers=h)
    assert dup.status_code == 409
    db.refresh(a)
    assert a.position is None


def test_order_cannot_include_another_business_product(client, db):
    me, producer = _owner(db)
    _, other_producer = _owner(db)
    (mine,) = _products(db, producer, 1)
    (theirs,) = _products(db, other_producer, 1)
    r = client.put(
        "/producers/me/product-order",
        json={"product_ids": [str(mine.id), str(theirs.id)]},
        headers=auth_header(me),
    )
    assert r.status_code == 409
    db.refresh(theirs)
    assert theirs.position is None


def test_order_list_is_capped_at_the_product_cap(client, db):
    user, _ = _owner(db)
    ids = [str(uuid.uuid4()) for _ in range(limits.MAX_PRODUCTS + 1)]
    r = client.put("/producers/me/product-order", json={"product_ids": ids}, headers=auth_header(user))
    assert r.status_code == 422
