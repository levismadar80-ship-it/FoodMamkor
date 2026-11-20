"""MEH-3472 — the admin sorts a business's products (drafts included) into
groups and orders them, through the same service as the owner (MEH-3055).

Every guard test sends a schema-valid body (Regression rule 6), so a 4xx here
is the guard, not pydantic.
"""

import uuid

from app.models import Product
from tests.conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin", email=f"a{uuid.uuid4().hex[:8]}@example.com")


def _owner_of(db, producer):
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user


def _products(db, producer, n, draft=False, prefix="מוצר"):
    rows = [
        Product(producer_id=producer.id, name=f"{prefix} {i}", price_min=10, is_draft=draft)
        for i in range(n)
    ]
    db.add_all(rows)
    db.commit()
    return rows


def _base(pid):
    return f"/admin/producers/{pid}"


def test_every_admin_route_refuses_anonymous_consumer_and_owner(client, db):
    producer = make_producer(db)
    owner = _owner_of(db, producer)
    consumer = make_user(db, role="consumer", email=f"c{uuid.uuid4().hex[:8]}@example.com")
    (p,) = _products(db, producer, 1)
    calls = [
        ("get", f"{_base(producer.id)}/product-groups", None),
        ("put", f"{_base(producer.id)}/product-groups", {"groups": [{"name": "לחמים"}]}),
        ("put", f"{_base(producer.id)}/product-order", {"product_ids": [str(p.id)]}),
        ("put", f"{_base(producer.id)}/products/{p.id}/group", {"group_id": None}),
    ]
    for method, url, body in calls:
        kw = {"json": body} if body is not None else {}
        assert getattr(client, method)(url, **kw).status_code == 401, url
        for who in (consumer, owner):
            r = getattr(client, method)(url, headers=auth_header(who), **kw)
            assert r.status_code == 403, (url, who.role)
    db.refresh(producer)
    assert not producer.product_groups


def test_unknown_business_is_404_in_hebrew(client, db):
    h = auth_header(_admin(db))
    pid = uuid.uuid4()
    for method, url, body in [
        ("get", f"{_base(pid)}/product-groups", None),
        ("put", f"{_base(pid)}/product-groups", {"groups": []}),
        ("put", f"{_base(pid)}/product-order", {"product_ids": []}),
        ("put", f"{_base(pid)}/products/{uuid.uuid4()}/group", {"group_id": None}),
    ]:
        kw = {"json": body} if body is not None else {}
        r = getattr(client, method)(url, headers=h, **kw)
        assert r.status_code == 404, url
        assert r.json()["detail"] == "בית העסק לא נמצא"


def test_admin_groups_are_the_owners_groups(client, db):
    producer = make_producer(db)
    owner = _owner_of(db, producer)
    h = auth_header(_admin(db))
    r = client.put(f"{_base(producer.id)}/product-groups", json={"groups": [{"name": "לחמים"}, {"name": "עוגות"}]}, headers=h)
    assert r.status_code == 200, r.text
    assert [g["name"] for g in r.json()] == ["לחמים", "עוגות"]
    # One store: the owner's dashboard reads exactly what the admin wrote.
    mine = client.get("/producers/me/product-groups", headers=auth_header(owner)).json()
    assert mine == r.json()
    assert client.get(f"{_base(producer.id)}/product-groups", headers=h).json() == mine


def test_admin_assigns_a_draft_and_a_published_product(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    (pub,) = _products(db, producer, 1)
    (draft,) = _products(db, producer, 1, draft=True, prefix="טיוטה")
    g = client.put(f"{_base(producer.id)}/product-groups", json={"groups": [{"name": "לחמים"}]}, headers=h).json()[0]
    for p in (pub, draft):
        r = client.put(f"{_base(producer.id)}/products/{p.id}/group", json={"group_id": g["id"]}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["group_id"] == g["id"]
    db.refresh(draft)
    assert draft.group_id == g["id"] and draft.is_draft is True


def test_owner_still_cannot_assign_a_draft(client, db):
    producer = make_producer(db)
    owner = _owner_of(db, producer)
    (draft,) = _products(db, producer, 1, draft=True)
    r = client.put(f"/producers/me/products/{draft.id}/group", json={"group_id": None}, headers=auth_header(owner))
    assert r.status_code == 404


def test_another_business_product_is_404_and_untouched(client, db):
    mine, other = make_producer(db), make_producer(db)
    h = auth_header(_admin(db))
    (foreign,) = _products(db, other, 1)
    g = client.put(f"{_base(mine.id)}/product-groups", json={"groups": [{"name": "לחמים"}]}, headers=h).json()[0]
    r = client.put(f"{_base(mine.id)}/products/{foreign.id}/group", json={"group_id": g["id"]}, headers=h)
    assert r.status_code == 404
    db.refresh(foreign)
    assert foreign.group_id is None
    r = client.put(f"{_base(mine.id)}/product-order", json={"product_ids": [str(foreign.id)]}, headers=h)
    assert r.status_code == 409


def test_unknown_group_is_404(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    (p,) = _products(db, producer, 1)
    r = client.put(f"{_base(producer.id)}/products/{p.id}/group", json={"group_id": str(uuid.uuid4())}, headers=h)
    assert r.status_code == 404
    assert r.json()["detail"] == "הקבוצה לא נמצאה"


def test_admin_order_covers_published_and_drafts_exactly(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    pubs = _products(db, producer, 2)
    drafts = _products(db, producer, 2, draft=True, prefix="טיוטה")
    every = [drafts[1], pubs[0], drafts[0], pubs[1]]
    # Published only is a partial set for the admin → 409.
    r = client.put(f"{_base(producer.id)}/product-order", json={"product_ids": [str(p.id) for p in pubs]}, headers=h)
    assert r.status_code == 409
    r = client.put(f"{_base(producer.id)}/product-order", json={"product_ids": [str(p.id) for p in every]}, headers=h)
    assert r.status_code == 200, r.text
    assert [x["id"] for x in r.json()] == [str(p.id) for p in every]
    for pos, p in enumerate(every):
        db.refresh(p)
        assert p.position == pos
    # Duplicates are refused too.
    ids = [str(p.id) for p in every]
    r = client.put(f"{_base(producer.id)}/product-order", json={"product_ids": ids[:-1] + ids[:1]}, headers=h)
    assert r.status_code == 409


def test_owner_order_stays_published_only(client, db):
    producer = make_producer(db)
    owner = _owner_of(db, producer)
    pubs = _products(db, producer, 2)
    _products(db, producer, 1, draft=True, prefix="טיוטה")
    r = client.put("/producers/me/product-order", json={"product_ids": [str(p.id) for p in reversed(pubs)]}, headers=auth_header(owner))
    assert r.status_code == 200, r.text


def test_deleting_a_group_ungroups_drafts_too(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    (draft,) = _products(db, producer, 1, draft=True)
    g = client.put(f"{_base(producer.id)}/product-groups", json={"groups": [{"name": "לחמים"}]}, headers=h).json()[0]
    r = client.put(f"{_base(producer.id)}/products/{draft.id}/group", json={"group_id": g["id"]}, headers=h)
    assert r.status_code == 200, r.text
    db.refresh(draft)
    assert draft.group_id == g["id"]  # grouped first, or the next line proves nothing
    assert client.put(f"{_base(producer.id)}/product-groups", json={"groups": []}, headers=h).status_code == 200
    db.refresh(draft)
    assert draft.group_id is None


def test_draft_list_carries_group_and_position(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    (draft,) = _products(db, producer, 1, draft=True)
    g = client.put(f"{_base(producer.id)}/product-groups", json={"groups": [{"name": "לחמים"}]}, headers=h).json()[0]
    client.put(f"{_base(producer.id)}/products/{draft.id}/group", json={"group_id": g["id"]}, headers=h)
    client.put(f"{_base(producer.id)}/product-order", json={"product_ids": [str(draft.id)]}, headers=h)
    (row,) = client.get(f"{_base(producer.id)}/product-drafts", headers=h).json()
    assert row["group_id"] == g["id"]
    assert row["position"] == 0


def test_owner_reorder_moves_drafts_after_published(client, db):
    # Rule-5a review: one `position` column serves both scopes. The admin
    # numbers drafts in among published rows; the owner's reorder of
    # published rows must push drafts after them, not leave them colliding.
    producer = make_producer(db)
    admin_h = auth_header(_admin(db))
    pub = _products(db, producer, 2)
    (draft,) = _products(db, producer, 1, draft=True)
    order = [str(draft.id), str(pub[0].id), str(pub[1].id)]
    assert client.put(f"{_base(producer.id)}/product-order", json={"product_ids": order}, headers=admin_h).status_code == 200
    db.refresh(draft)
    assert draft.position == 0
    owner_h = auth_header(_owner_of(db, producer))
    r = client.put("/producers/me/product-order", json={"product_ids": [str(pub[1].id), str(pub[0].id)]}, headers=owner_h)
    assert r.status_code == 200, r.text
    db.refresh(draft)
    assert draft.position == 2
