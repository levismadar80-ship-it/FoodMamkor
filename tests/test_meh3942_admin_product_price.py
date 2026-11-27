"""MEH-3942 — the admin clears or sets a product's price on any business,
including an approved one with no owner account (Sapir 27/11: «סנדרה»).

Every guard test sends a schema-valid body (Regression rule 6), so a 4xx here
is the guard, not pydantic.
"""

import uuid

from app.models import Product
from tests.conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin", email=f"a{uuid.uuid4().hex[:8]}@example.com")


def _product(db, producer, price=20):
    row = Product(
        producer_id=producer.id,
        name="אגס עדן",
        price_min=price,
        price_max=price,
        price_unit="kg",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _url(producer_id, product_id):
    return f"/admin/producers/{producer_id}/products/{product_id}/price"


CLEAR = {"price_min": None, "price_max": None}


def test_admin_clears_the_price_of_an_approved_business_product(client, db):
    producer = make_producer(db, status="approved")
    product = _product(db, producer)
    r = client.put(
        _url(producer.id, product.id), json=CLEAR, headers=auth_header(_admin(db))
    )
    assert r.status_code == 200, r.text
    assert r.json()["price_min"] is None and r.json()["price_max"] is None
    db.refresh(product)
    assert product.price_min is None and product.price_max is None
    # Nothing else on the row moved.
    assert product.name == "אגס עדן" and product.price_unit == "kg"


def test_admin_sets_a_price(client, db):
    producer = make_producer(db, status="approved")
    product = _product(db, producer)
    body = {"price_min": 30, "price_max": 30, "price_unit": "unit"}
    r = client.put(
        _url(producer.id, product.id), json=body, headers=auth_header(_admin(db))
    )
    assert r.status_code == 200, r.text
    db.refresh(product)
    assert float(product.price_min) == 30 and product.price_unit == "unit"


def test_refuses_anonymous_consumer_and_owner(client, db):
    producer = make_producer(db, status="approved")
    product = _product(db, producer)
    owner = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    owner.producer_id = producer.id
    owner.is_producer = True
    consumer = make_user(
        db, role="consumer", email=f"c{uuid.uuid4().hex[:8]}@example.com"
    )
    db.commit()
    url = _url(producer.id, product.id)
    assert client.put(url, json=CLEAR).status_code == 401
    for who in (consumer, owner):
        assert client.put(url, json=CLEAR, headers=auth_header(who)).status_code == 403
    db.refresh(product)
    assert float(product.price_min) == 20


def test_product_of_another_business_is_404(client, db):
    mine = make_producer(db, status="approved")
    other = make_producer(db, name="עסק אחר", status="approved")
    product = _product(db, other)
    r = client.put(
        _url(mine.id, product.id), json=CLEAR, headers=auth_header(_admin(db))
    )
    assert r.status_code == 404
    db.refresh(product)
    assert float(product.price_min) == 20


def test_max_without_min_is_refused(client, db):
    producer = make_producer(db, status="approved")
    product = _product(db, producer)
    r = client.put(
        _url(producer.id, product.id),
        json={"price_min": None, "price_max": 20},
        headers=auth_header(_admin(db)),
    )
    assert r.status_code == 422
    db.refresh(product)
    assert float(product.price_min) == 20


def test_max_below_min_is_refused(client, db):
    producer = make_producer(db, status="approved")
    product = _product(db, producer)
    r = client.put(
        _url(producer.id, product.id),
        json={"price_min": 30, "price_max": 20},
        headers=auth_header(_admin(db)),
    )
    assert r.status_code == 422
    db.refresh(product)
    assert float(product.price_min) == 20


def test_null_unit_is_refused_and_omitted_unit_is_kept(client, db):
    producer = make_producer(db, status="approved")
    product = _product(db, producer)
    admin = _admin(db)
    r = client.put(
        _url(producer.id, product.id),
        json={**CLEAR, "price_unit": None},
        headers=auth_header(admin),
    )
    assert r.status_code == 422
    db.refresh(product)
    assert float(product.price_min) == 20 and product.price_unit == "kg"
