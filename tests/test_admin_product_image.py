"""MEH-3456 — the admin uploads / replaces a product photo of any business.

Covers POST /upload/product-image/{product_id}:
  - no token 401, consumer 403, the business's own owner 403 (she has her own
    flow through PUT /producers/me/products/{id}).
  - same validation as the owner's upload: non-image 400, empty 400, > 5MB 400.
  - unknown product 404.
  - admin success writes the PATH product only, on a live page and on an
    ownerless draft page; a replacement destroys the old image after commit.
  - the change leaves one row in the admin audit log, targeting the product.
"""

import io
import uuid
from decimal import Decimal

from app.models import Product
from app.models.admin_ops import AdminAuditLog
from app.routers.upload import MAX_FILE_SIZE
from tests.conftest import auth_header, make_producer, make_user

FAKE_JPG = b"\xff\xd8\xff" + b"\x00" * 100


def _jpg(body: bytes = FAKE_JPG):
    return {"file": ("p.jpg", io.BytesIO(body), "image/jpeg")}


def _url(product_id):
    return f"/upload/product-image/{product_id}"


def _product(db, producer, name="שזיף", image_url=None):
    p = Product(
        producer_id=producer.id, name=name, price_min=Decimal("20"), image_url=image_url
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _admin(db):
    return make_user(db, role="admin")


# --- who may call it ----------------------------------------------------------


def test_requires_a_token(client, db):
    p = _product(db, make_producer(db))
    assert client.post(_url(p.id), files=_jpg()).status_code == 401


def test_consumer_is_403_and_nothing_changes(client, db):
    p = _product(db, make_producer(db))
    consumer = make_user(db, role="consumer")
    resp = client.post(_url(p.id), files=_jpg(), headers=auth_header(consumer))
    assert resp.status_code == 403
    db.refresh(p)
    assert p.image_url is None


def test_owner_is_403_even_for_her_own_product(client, db):
    producer = make_producer(db)
    p = _product(db, producer)
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()
    resp = client.post(_url(p.id), files=_jpg(), headers=auth_header(owner))
    assert resp.status_code == 403
    db.refresh(p)
    assert p.image_url is None


# --- same validation as the owner's upload ------------------------------------


def test_non_image_is_400(client, db):
    p = _product(db, make_producer(db))
    resp = client.post(
        _url(p.id),
        files={"file": ("x.jpg", io.BytesIO(b"<svg></svg>" * 10), "image/jpeg")},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 400
    assert "JPG" in resp.json()["detail"]
    db.refresh(p)
    assert p.image_url is None


def test_empty_file_is_400(client, db):
    p = _product(db, make_producer(db))
    resp = client.post(_url(p.id), files=_jpg(b""), headers=auth_header(_admin(db)))
    assert resp.status_code == 400


def test_oversized_file_is_400(client, db):
    p = _product(db, make_producer(db))
    big = FAKE_JPG + b"\x00" * MAX_FILE_SIZE
    resp = client.post(_url(p.id), files=_jpg(big), headers=auth_header(_admin(db)))
    assert resp.status_code == 400
    assert "גדולה מדי" in resp.json()["detail"]


def test_unknown_product_is_404(client, db):
    resp = client.post(
        _url(uuid.uuid4()), files=_jpg(), headers=auth_header(_admin(db))
    )
    assert resp.status_code == 404


# --- behaviour ----------------------------------------------------------------


def test_admin_sets_the_image_on_a_live_page_product_only(client, db):
    producer = make_producer(db, status="approved")
    target = _product(db, producer, name="אפרסק")
    other = _product(db, producer, name="נקטרינה")
    resp = client.post(_url(target.id), files=_jpg(), headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    url = resp.json()["url"]
    assert url
    db.refresh(target)
    db.refresh(other)
    assert target.image_url == url
    assert other.image_url is None


def test_admin_sets_the_image_on_an_ownerless_draft_page(client, db):
    producer = make_producer(db, status="draft")
    p = _product(db, producer)
    resp = client.post(_url(p.id), files=_jpg(), headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    db.refresh(p)
    assert p.image_url == resp.json()["url"]


def test_the_public_page_shows_the_new_image(client, db):
    producer = make_producer(db, status="approved")
    p = _product(db, producer)
    url = client.post(_url(p.id), files=_jpg(), headers=auth_header(_admin(db))).json()[
        "url"
    ]
    detail = client.get(f"/producers/{producer.id}").json()
    assert [x["image_url"] for x in detail["products"] if x["id"] == str(p.id)] == [url]


def test_replacing_destroys_the_old_image(client, db, monkeypatch):
    import app.cloudinary_utils as cu

    destroyed = []
    monkeypatch.setattr(
        cu, "destroy_image", lambda url, **kw: destroyed.append((url, kw)) or True
    )
    old = "https://res.cloudinary.com/demo/image/upload/mehamakor/u/x/old.jpg"
    p = _product(db, make_producer(db), image_url=old)
    resp = client.post(_url(p.id), files=_jpg(), headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    db.refresh(p)
    assert p.image_url != old
    # db= is what lets destroy_image skip an asset another row still uses
    # (MEH-3247 part 1, covered by that helper's own tests).
    assert [u for u, _ in destroyed] == [old]
    assert destroyed[0][1].get("db") is not None


def test_the_upload_leaves_one_admin_audit_row_on_the_product(client, db):
    admin = _admin(db)
    p = _product(db, make_producer(db))
    assert (
        client.post(_url(p.id), files=_jpg(), headers=auth_header(admin)).status_code
        == 200
    )
    db.expire_all()
    rows = db.query(AdminAuditLog).all()
    assert len(rows) == 1
    assert rows[0].actor_id == admin.id
    assert rows[0].action == "POST /upload/product-image/{product_id}"
    assert (rows[0].target_type, rows[0].target_id) == ("product", str(p.id))
