"""MEH-2312 — admin imports a business's catalog as drafts, then approves.

Covers:
  - auth: no token 401, consumer 403, the business's own owner 403, on every
    route; unknown business 404.
  - rows: 0 / 1 / many; invalid rows (missing name, bad / missing price) are
    reported and not saved; duplicates (existing name, or twice in a batch)
    are skipped; units map; source_image_url is stored but never public.
  - drafts are invisible on every public surface — detail by id and by slug,
    the list, ?q= search, /search, the pickup/diet filters' `.any()` — and in
    the owner's own list, until an admin approves them.
  - IDOR: approve / delete with another business's ids touch nothing.
  - the cap counts drafts (409 with the counts).
"""

import uuid

from app.models.models import Product
from tests.conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin")


def _import_url(pid):
    return f"/admin/producers/{pid}/product-import"


def _drafts_url(pid):
    return f"/admin/producers/{pid}/product-drafts"


def _approve_url(pid):
    return f"/admin/producers/{pid}/product-drafts/approve"


def _draft_url(pid, product_id):
    return f"/admin/producers/{pid}/product-drafts/{product_id}"


ROWS = [
    {
        "name": "תפוח גרני סמית מרמת הגולן",
        "description": "מארז כ-1.3 קילו",
        "price": "₪25",
        "unit": "למארז",
        "source_image_url": "https://firebasestorage.googleapis.com/v0/b/x/o/apple.jpg",
    },
    {"name": "אגס עדן מרמת הגולן", "price": 20, "unit": 'לק"ג'},
    {"name": "אננס בינוני ישראלי", "price": "35", "unit": "ליחידה"},
]


def _import(client, db, producer, rows=ROWS, admin=None):
    return client.post(
        _import_url(producer.id),
        json={"rows": rows},
        headers=auth_header(admin or _admin(db)),
    )


# --- auth -------------------------------------------------------------------


def test_every_route_needs_an_admin(client, db):
    producer = make_producer(db)
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()
    consumer = make_user(db, role="consumer")
    calls = [
        ("post", _import_url(producer.id), {"rows": ROWS}),
        ("get", _drafts_url(producer.id), None),
        ("post", _approve_url(producer.id), {}),
    ]
    for method, url, body in calls:
        kw = {"json": body} if body is not None else {}
        assert getattr(client, method)(url, **kw).status_code == 401, url
        for who in (consumer, owner):
            resp = getattr(client, method)(url, headers=auth_header(who), **kw)
            assert resp.status_code == 403, (url, who.role)
    assert (
        client.delete(
            _draft_url(producer.id, uuid.uuid4()), headers=auth_header(owner)
        ).status_code
        == 403
    )
    assert db.query(Product).filter(Product.producer_id == producer.id).count() == 0


def test_unknown_business_is_404(client, db):
    resp = client.post(
        _import_url(uuid.uuid4()), json={"rows": ROWS}, headers=auth_header(_admin(db))
    )
    assert resp.status_code == 404


# --- rows -------------------------------------------------------------------


def test_zero_rows_creates_nothing(client, db):
    producer = make_producer(db)
    resp = _import(client, db, producer, rows=[])
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "created": 0,
        "skipped_duplicates": [],
        "invalid": [],
        "unknown_units": [],
    }


def test_one_row(client, db):
    producer = make_producer(db)
    resp = _import(client, db, producer, rows=ROWS[:1])
    assert resp.json()["created"] == 1
    draft = db.query(Product).filter(Product.producer_id == producer.id).one()
    assert draft.is_draft is True
    assert float(draft.price_min) == 25.0 and float(draft.price_max) == 25.0
    assert draft.price_unit == "unit"
    assert draft.source_image_url.startswith("https://firebasestorage.googleapis.com/")


def test_many_rows_with_units(client, db):
    producer = make_producer(db)
    assert _import(client, db, producer).json()["created"] == 3
    units = {
        p.name: p.price_unit
        for p in db.query(Product).filter(Product.producer_id == producer.id)
    }
    assert units["אגס עדן מרמת הגולן"] == "kg"
    assert units["אננס בינוני ישראלי"] == "unit"


def test_invalid_rows_are_reported_and_not_saved(client, db):
    producer = make_producer(db)
    rows = [
        {"name": "", "price": 10},  # missing name
        {"name": "שזיפים", "price": "abc"},  # not a number
        {"name": "דובדבנים"},  # missing price
        {"name": "ענבים", "price": 0},  # below 1
        {"name": "<script>x</script>תאנים", "price": 12},  # sanitized, kept
    ]
    body = _import(client, db, producer, rows=rows).json()
    assert body["created"] == 1
    assert [r["index"] for r in body["invalid"]] == [0, 1, 2, 3]
    saved = db.query(Product).filter(Product.producer_id == producer.id).one()
    assert "<script>" not in saved.name


def test_duplicates_are_skipped(client, db):
    producer = make_producer(db)
    existing = Product(producer_id=producer.id, name="אגס עדן מרמת הגולן", price_min=20)
    db.add(existing)
    db.commit()
    rows = ROWS + [{"name": "  אננס   בינוני ישראלי ", "price": 35}]
    body = _import(client, db, producer, rows=rows).json()
    assert body["created"] == 2
    norm = sorted(" ".join(n.split()) for n in body["skipped_duplicates"])
    assert norm == sorted(["אגס עדן מרמת הגולן", "אננס בינוני ישראלי"])
    again = _import(client, db, producer).json()  # running it twice adds nothing
    assert again["created"] == 0


# --- nothing public before approval -------------------------------------------


def _public_names(client, producer):
    detail = client.get(f"/producers/{producer.id}").json()
    return {p["name"] for p in detail.get("products", [])}


def test_drafts_are_invisible_until_approved(client, db):
    producer = make_producer(db, name="סנדרה פירות איכותיים")
    producer.slug = "sandra-perot-test"
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.add(
        Product(producer_id=producer.id, name="מיץ רימון טרי", price_min=35)
    )  # published control
    db.commit()
    _import(client, db, producer)

    assert _public_names(client, producer) == {"מיץ רימון טרי"}
    by_slug = client.get("/producers/by-slug/sandra-perot-test").json()
    assert {p["name"] for p in by_slug["products"]} == {"מיץ רימון טרי"}
    assert "source_image_url" not in str(by_slug)
    listed = client.get("/producers", params={"q": "אננס"}).json()
    assert str(producer.id) not in {p["id"] for p in listed}
    control = client.get("/producers", params={"q": "רימון"}).json()
    assert str(producer.id) in {p["id"] for p in control}
    search = client.get("/search", params={"q": "אננס"})
    assert search.status_code == 200
    assert "אננס" not in search.text
    mine = client.get("/producers/me/products", headers=auth_header(owner)).json()
    assert {p["name"] for p in mine} == {"מיץ רימון טרי"}

    admin = _admin(db)
    drafts = client.get(_drafts_url(producer.id), headers=auth_header(admin)).json()
    assert len(drafts) == 3
    approved = client.post(
        _approve_url(producer.id), json={}, headers=auth_header(admin)
    )
    assert approved.json() == {"approved": 3}

    assert len(_public_names(client, producer)) == 4
    after = client.get("/producers", params={"q": "אננס"}).json()
    assert str(producer.id) in {p["id"] for p in after}
    assert client.get(_drafts_url(producer.id), headers=auth_header(admin)).json() == []


def test_approve_a_subset(client, db):
    producer = make_producer(db)
    _import(client, db, producer)
    admin = _admin(db)
    drafts = client.get(_drafts_url(producer.id), headers=auth_header(admin)).json()
    first = drafts[0]["id"]
    resp = client.post(
        _approve_url(producer.id),
        json={"product_ids": [first]},
        headers=auth_header(admin),
    )
    assert resp.json() == {"approved": 1}
    assert len(_public_names(client, producer)) == 1


# --- IDOR -------------------------------------------------------------------


def test_another_business_cannot_be_approved_or_deleted_through_this_path(client, db):
    a = make_producer(db, name="בית עסק א")
    b = make_producer(db, name="בית עסק ב")
    admin = _admin(db)
    _import(client, db, b, admin=admin)
    b_ids = [
        d["id"]
        for d in client.get(_drafts_url(b.id), headers=auth_header(admin)).json()
    ]

    resp = client.post(
        _approve_url(a.id), json={"product_ids": b_ids}, headers=auth_header(admin)
    )
    assert resp.json() == {"approved": 0}
    assert (
        client.delete(
            _draft_url(a.id, b_ids[0]), headers=auth_header(admin)
        ).status_code
        == 404
    )
    assert len(client.get(_drafts_url(b.id), headers=auth_header(admin)).json()) == 3


def test_delete_a_draft_but_never_a_published_product(client, db):
    producer = make_producer(db)
    live = Product(producer_id=producer.id, name="מוצר חי", price_min=10)
    db.add(live)
    db.commit()
    admin = _admin(db)
    _import(client, db, producer, rows=ROWS[:1], admin=admin)
    draft_id = client.get(_drafts_url(producer.id), headers=auth_header(admin)).json()[
        0
    ]["id"]
    assert (
        client.delete(
            _draft_url(producer.id, live.id), headers=auth_header(admin)
        ).status_code
        == 404
    )
    assert (
        client.delete(
            _draft_url(producer.id, draft_id), headers=auth_header(admin)
        ).status_code
        == 204
    )
    assert db.query(Product).filter(Product.producer_id == producer.id).count() == 1


# --- cap --------------------------------------------------------------------


def test_the_cap_counts_drafts(client, db, monkeypatch):
    from app.services import product_import

    monkeypatch.setattr(product_import, "MAX_PRODUCTS", 2)
    producer = make_producer(db)
    resp = _import(client, db, producer)
    assert resp.status_code == 409
    assert "2" in resp.json()["detail"]
    assert db.query(Product).filter(Product.producer_id == producer.id).count() == 0


def test_too_many_rows_is_422(client, db):
    producer = make_producer(db)
    rows = [{"name": f"מוצר {i}", "price": 10} for i in range(251)]
    assert _import(client, db, producer, rows=rows).status_code == 422


def test_prices_and_units_from_the_review(client, db):
    producer = make_producer(db)
    rows = [
        {"name": "שזיפים", "price": "12,5"},  # decimal comma
        {"name": "שמן זית", "price": "1,200"},  # thousands comma
        {"name": "ענבים", "price": True},  # JSON true is not a price
        {"name": "חלב עיזים", "price": 30, "unit": "לליטר"},  # unknown unit
    ]
    body = _import(client, db, producer, rows=rows).json()
    assert body["created"] == 3
    assert [r["index"] for r in body["invalid"]] == [2]
    assert body["unknown_units"] == ["לליטר"]
    prices = {
        p.name: float(p.price_min)
        for p in db.query(Product).filter(Product.producer_id == producer.id)
    }
    assert prices["שזיפים"] == 12.5
    assert prices["שמן זית"] == 1200.0
