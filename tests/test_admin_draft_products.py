"""
Module:   test_admin_draft_products
Purpose:  MEH-2326 (MEH-2321 chunk D) — the admin adds and deletes products on
          an OWNERLESS draft, and on nothing else. One guard per test.
Touches:  POST /admin/producers/{id}/products ·
          DELETE /admin/producers/{id}/products/{product_id}
Related:  backend/app/routers/producer_claim.py (_editable_draft) ·
          tests/test_producer_claim.py (the claim side of the same rule).
"""

import threading
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from conftest import auth_header, make_producer, make_user
from test_producer_claim import _wait_until_a_backend_queues_on_a_lock
from app.models import Producer, Product, User

_DIET_FLAGS = (
    "is_gluten_free",
    "is_vegan",
    "is_vegetarian",
    "is_lactose_free",
    "is_no_added_sugar",
    "is_low_carb",
)


def _url(pid):
    return f"/admin/producers/{pid}/products"


def _payload(**over):
    return {"name": "לחם מחמצת כוסמין", "price_min": "32", **over}


def _draft(db):
    return make_producer(db, status="draft")


def _product(db, producer, name="עוגיות שיבולת שועל"):
    p = Product(producer_id=producer.id, name=name, price_min=Decimal("20"))
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _admin(db):
    return auth_header(make_user(db, role="admin"))


class TestCreate:
    def test_admin_adds_a_product_to_an_ownerless_draft(self, client, db):
        draft = _draft(db)
        r = client.post(_url(draft.id), json=_payload(), headers=_admin(db))
        assert r.status_code == 201, r.text
        assert r.json()["name"] == "לחם מחמצת כוסמין"
        db.expire_all()
        rows = db.query(Product).filter(Product.producer_id == draft.id).all()
        assert [p.name for p in rows] == ["לחם מחמצת כוסמין"]

    def test_draft_that_has_an_owner_is_409_and_nothing_is_written(self, client, db):
        draft = _draft(db)
        owner = make_user(db, role="producer")
        owner.producer_id = draft.id
        db.commit()
        r = client.post(_url(draft.id), json=_payload(), headers=_admin(db))
        assert r.status_code == 409, r.text
        assert db.query(Product).filter(Product.producer_id == draft.id).count() == 0

    def test_listing_that_is_not_a_draft_is_409(self, client, db):
        live = make_producer(db, status="approved")
        r = client.post(_url(live.id), json=_payload(), headers=_admin(db))
        assert r.status_code == 409, r.text
        assert db.query(Product).filter(Product.producer_id == live.id).count() == 0

    def test_non_admin_is_403(self, client, db):
        draft = _draft(db)
        consumer = make_user(db)
        r = client.post(_url(draft.id), json=_payload(), headers=auth_header(consumer))
        assert r.status_code == 403, r.text
        assert db.query(Product).filter(Product.producer_id == draft.id).count() == 0

    def test_anonymous_is_401(self, client, db):
        draft = _draft(db)
        r = client.post(_url(draft.id), json=_payload())
        assert r.status_code == 401, r.text

    def test_unknown_producer_is_404(self, client, db):
        r = client.post(_url(uuid.uuid4()), json=_payload(), headers=_admin(db))
        assert r.status_code == 404, r.text

    def test_diet_flags_are_never_set_by_the_admin(self, client, db):
        """They are the owner's declaration (labels.md: self-declared)."""
        draft = _draft(db)
        r = client.post(
            _url(draft.id),
            json=_payload(**{flag: True for flag in _DIET_FLAGS}),
            headers=_admin(db),
        )
        assert r.status_code == 201, r.text
        db.expire_all()
        row = db.query(Product).filter(Product.producer_id == draft.id).one()
        assert {flag: getattr(row, flag) for flag in _DIET_FLAGS} == {
            flag: False for flag in _DIET_FLAGS
        }

    def test_claim_in_flight_then_admin_add_is_409(self, client, db):
        """The claim holds the producer row (not committed yet) when the admin
        adds a product. Without FOR UPDATE in _editable_draft the admin read
        sees no owner and writes a product onto a page that is already hers."""
        draft = _draft(db)
        owner = make_user(db)
        admin = make_user(db, role="admin")
        # get_current_user's last-active write would commit on its own and
        # hide the race (same reason as in test_producer_claim).
        admin.last_active_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        pid, owner_id, headers = draft.id, owner.id, auth_header(admin)

        held = db.query(Producer).filter(Producer.id == pid).with_for_update().one()
        held.declared_at = datetime.now(timezone.utc)
        db.get(User, owner_id).producer_id = pid
        db.flush()

        out = {}
        worker = threading.Thread(
            target=lambda: out.update(
                r=client.post(_url(pid), json=_payload(), headers=headers)
            )
        )
        worker.start()
        queued = _wait_until_a_backend_queues_on_a_lock()
        db.commit()
        worker.join(timeout=30)
        assert not worker.is_alive(), "the admin request never returned"
        assert queued, "construction void: the admin request never queued on the lock"

        assert out["r"].status_code == 409, out["r"].text
        db.expire_all()
        assert db.query(Product).filter(Product.producer_id == pid).count() == 0


class TestDelete:
    def test_admin_deletes_a_product_of_an_ownerless_draft(self, client, db):
        draft = _draft(db)
        prod_id = _product(db, draft).id
        r = client.delete(f"{_url(draft.id)}/{prod_id}", headers=_admin(db))
        assert r.status_code == 204, r.text
        db.expire_all()
        assert db.get(Product, prod_id) is None

    def test_product_of_another_business_is_404_and_survives(self, client, db):
        draft = _draft(db)
        other = _draft(db)
        theirs = _product(db, other)
        r = client.delete(f"{_url(draft.id)}/{theirs.id}", headers=_admin(db))
        assert r.status_code == 404, r.text
        db.expire_all()
        assert db.get(Product, theirs.id) is not None

    def test_claimed_draft_is_409_and_the_product_survives(self, client, db):
        draft = _draft(db)
        prod = _product(db, draft)
        owner = make_user(db, role="producer")
        owner.producer_id = draft.id
        db.commit()
        r = client.delete(f"{_url(draft.id)}/{prod.id}", headers=_admin(db))
        assert r.status_code == 409, r.text
        db.expire_all()
        assert db.get(Product, prod.id) is not None

    def test_non_admin_is_403_and_the_product_survives(self, client, db):
        draft = _draft(db)
        prod = _product(db, draft)
        r = client.delete(
            f"{_url(draft.id)}/{prod.id}", headers=auth_header(make_user(db))
        )
        assert r.status_code == 403, r.text
        db.expire_all()
        assert db.get(Product, prod.id) is not None

    def test_listing_that_is_not_a_draft_is_409_and_the_product_survives(
        self, client, db
    ):
        live = make_producer(db, status="approved")
        prod = _product(db, live)
        r = client.delete(f"{_url(live.id)}/{prod.id}", headers=_admin(db))
        assert r.status_code == 409, r.text
        db.expire_all()
        assert db.get(Product, prod.id) is not None

    def test_unknown_producer_is_404(self, client, db):
        r = client.delete(f"{_url(uuid.uuid4())}/{uuid.uuid4()}", headers=_admin(db))
        assert r.status_code == 404, r.text

    def test_anonymous_is_401_and_the_product_survives(self, client, db):
        draft = _draft(db)
        prod = _product(db, draft)
        r = client.delete(f"{_url(draft.id)}/{prod.id}")
        assert r.status_code == 401, r.text
        db.expire_all()
        assert db.get(Product, prod.id) is not None

    def test_the_image_is_destroyed_once_after_the_delete(
        self, client, db, monkeypatch
    ):
        import app.cloudinary_utils as cu

        calls = []
        monkeypatch.setattr(cu, "destroy_image", lambda url, **kw: calls.append(url))
        draft = _draft(db)
        prod = _product(db, draft)
        prod.image_url = "https://res.cloudinary.com/demo/image/upload/v1/p.jpg"
        db.commit()
        r = client.delete(f"{_url(draft.id)}/{prod.id}", headers=_admin(db))
        assert r.status_code == 204, r.text
        assert calls == ["https://res.cloudinary.com/demo/image/upload/v1/p.jpg"]
