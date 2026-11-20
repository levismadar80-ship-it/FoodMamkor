"""MEH-3478 part 1 — a menu's headings become product groups on publish.

The reader already returns each row's `section` (menu_reader.py); before
this, publish dropped it. Bodies are schema-valid (regression rule 6).
"""

from app import limits
from app.models import Producer, Product
from tests.test_meh3430_menu_import import _owner, _row
from tests.conftest import auth_header

URL = "/producers/me/menu-import/publish"


def _groups(db, producer):
    db.expire_all()
    p = db.query(Producer).filter(Producer.id == producer.id).one()
    return [g["name"] for g in (p.product_groups or [])]


def _group_of(db, producer, name):
    p = db.query(Producer).filter(Producer.id == producer.id).one()
    by_id = {g["id"]: g["name"] for g in (p.product_groups or [])}
    prod = db.query(Product).filter(Product.producer_id == producer.id, Product.name == name).one()
    return by_id.get(prod.group_id)


def test_headings_become_groups_in_menu_order_and_products_land_in_them(client, db):
    user, producer = _owner(db)
    body = {"products": [
        _row("חלה", section="לחמים"),
        _row("עוגת גבינה", section="עוגות"),
        _row("בגט", section="  לחמים "),
        _row("מיץ"),
    ]}
    r = client.post(URL, json=body, headers=auth_header(user))
    assert r.status_code == 201, r.text
    assert _groups(db, producer) == ["לחמים", "עוגות"]
    assert _group_of(db, producer, "חלה") == "לחמים"
    assert _group_of(db, producer, "בגט") == "לחמים"
    assert _group_of(db, producer, "עוגת גבינה") == "עוגות"
    assert _group_of(db, producer, "מיץ") is None


def test_a_heading_matching_an_existing_group_reuses_it(client, db):
    user, producer = _owner(db)
    producer.product_groups = [{"id": "g-old", "name": "לחמים"}]
    db.commit()
    r = client.post(URL, json={"products": [_row("חלה", section="לחמים")]}, headers=auth_header(user))
    assert r.status_code == 201, r.text
    assert _groups(db, producer) == ["לחמים"]
    assert db.query(Product).filter(Product.name == "חלה").one().group_id == "g-old"


def test_a_heading_the_owner_could_not_type_leaves_the_product_ungrouped(client, db):
    user, producer = _owner(db)
    body = {"products": [_row("חלה", section="א" * 41), _row("בגט", section="   ")]}
    r = client.post(URL, json=body, headers=auth_header(user))
    assert r.status_code == 201, r.text
    assert _groups(db, producer) == []
    assert {p.group_id for p in db.query(Product).filter(Product.producer_id == producer.id)} == {None}


def test_headings_past_the_group_cap_leave_those_products_ungrouped_not_refused(client, db, monkeypatch):
    monkeypatch.setattr(limits, "MAX_PRODUCT_GROUPS", 2)
    from app.routers import menu_import as route
    monkeypatch.setattr(route, "MAX_PRODUCT_GROUPS", 2, raising=False)
    user, producer = _owner(db)
    producer.product_groups = [{"id": "g-old", "name": "ישנה"}]
    db.commit()
    body = {"products": [_row("חלה", section="לחמים"), _row("עוגה", section="עוגות"), _row("בגט", section="לחמים")]}
    r = client.post(URL, json=body, headers=auth_header(user))
    assert r.status_code == 201, r.text
    assert _groups(db, producer) == ["ישנה", "לחמים"]
    assert _group_of(db, producer, "בגט") == "לחמים"
    assert _group_of(db, producer, "עוגה") is None


def test_a_skipped_duplicate_adds_no_group(client, db):
    user, producer = _owner(db)
    db.add(Product(producer_id=producer.id, name="חלה", price_min=20))
    db.commit()
    r = client.post(URL, json={"products": [_row("חלה", section="לחמים")]}, headers=auth_header(user))
    assert r.status_code == 201, r.text
    assert _groups(db, producer) == []
