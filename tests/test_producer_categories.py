"""
MEH-1297: producer multi-category ordering + cap + delete-guard.

Three behaviours introduced by MEH-1297:
  1. `producer_categories.position` gives a deterministic order — the
     payload order is the stored order, position 0 = the primary category
     (`Producer.categories` is `order_by=ProducerCategory.position`).
  2. A ≤3 cap enforced at the Pydantic layer on every schema that accepts
     `category_ids` — 4+ categories → 422 with a Hebrew message.
  3. `DELETE /admin/categories/{id}` is guarded — a category still linked to
     producers returns 409 instead of silently orphaning those businesses.

Surfaces exercised:
  - POST /producers               (ProducerCreate — cap + order on create)
  - PUT  /admin/producers/{id}    (ProducerUpdate — order on update)
  - DELETE /admin/categories/{id} (delete-guard 409 / empty 200)
  - /auth/register/producer       (license any-match with 3 categories)
"""

from __future__ import annotations

from app.models.models import Category, Producer, ProducerCategory
from tests.conftest import auth_header, make_category, make_producer, make_user


CAP_MSG = "ניתן לבחור עד 3 קטגוריות לבית עסק"
# MEH-530/743: bakery + honey require a producer license; veggies/oils do not.
BAKERY = "לחמים ואפייה"
HONEY = "דבש"


def _create_payload(category_ids: list[int]) -> dict:
    """Minimal schema-valid ProducerCreate body (name ≥3 letters + categories)."""
    return {"name": "חוות הבדיקה", "category_ids": category_ids}


class TestCategoryCap:
    """MEH-1297 — the ≤3 Pydantic cap on POST /producers."""

    def test_four_categories_422(self, client, db):
        """cap-4 → 422 with the Hebrew message."""
        user = make_user(db)
        cats = [make_category(db, name=f"קטגוריה-{i}", emoji="🥬") for i in range(4)]
        resp = client.post(
            "/producers",
            json=_create_payload([c.id for c in cats]),
            headers=auth_header(user),
        )
        assert resp.status_code == 422, resp.text
        assert CAP_MSG in resp.text

    def test_three_categories_201(self, client, db):
        """3 → 201 (the cap boundary is inclusive)."""
        user = make_user(db)
        cats = [make_category(db, name=f"קטגוריה-{i}", emoji="🥬") for i in range(3)]
        resp = client.post(
            "/producers",
            json=_create_payload([c.id for c in cats]),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text
        assert len(resp.json()["categories"]) == 3


class TestCategoryOrder:
    """MEH-1297 — payload order is preserved as position order."""

    def test_create_preserves_payload_order(self, client, db):
        """Read back returns categories in the order they were sent, not by id."""
        a = make_category(db, name="אלף", emoji="🅰️")
        b = make_category(db, name="בית", emoji="🅱️")
        c = make_category(db, name="גימל", emoji="🇨")
        # Send B, A, C — deliberately NOT ascending id order.
        order = [b.id, a.id, c.id]
        resp = client.post(
            "/producers",
            json=_create_payload(order),
            headers=auth_header(make_user(db)),
        )
        assert resp.status_code == 201, resp.text
        returned = [cat["id"] for cat in resp.json()["categories"]]
        assert returned == order, "categories[0] must be the first selected (primary)"

    def test_create_persists_position_column(self, client, db):
        """The stored position column is a contiguous 0..n-1 in payload order."""
        a = make_category(db, name="אלף", emoji="🅰️")
        b = make_category(db, name="בית", emoji="🅱️")
        order = [b.id, a.id]
        resp = client.post(
            "/producers",
            json=_create_payload(order),
            headers=auth_header(make_user(db)),
        )
        pid = resp.json()["id"]
        rows = (
            db.query(ProducerCategory)
            .filter(ProducerCategory.producer_id == pid)
            .order_by(ProducerCategory.position)
            .all()
        )
        assert [(r.category_id, r.position) for r in rows] == [
            (b.id, 0),
            (a.id, 1),
        ]

    def test_update_reorders(self, client, db):
        """PUT /admin/producers reorders categories deterministically."""
        admin = make_user(db, role="admin")
        a = make_category(db, name="אלף", emoji="🅰️")
        b = make_category(db, name="בית", emoji="🅱️")
        c = make_category(db, name="גימל", emoji="🇨")
        producer = make_producer(db, category=a)
        # New order: C, A, B — C becomes primary.
        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"category_ids": [c.id, a.id, b.id]},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200, resp.text
        returned = [cat["id"] for cat in resp.json()["categories"]]
        assert returned == [c.id, a.id, b.id]

    def test_update_cap_422(self, client, db):
        """PUT with 4 categories → 422 (ProducerUpdate cap)."""
        admin = make_user(db, role="admin")
        cats = [make_category(db, name=f"ק-{i}", emoji="🥬") for i in range(4)]
        producer = make_producer(db, category=cats[0])
        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"category_ids": [c.id for c in cats]},
            headers=auth_header(admin),
        )
        assert resp.status_code == 422, resp.text
        assert CAP_MSG in resp.text


class TestCategoryDeleteGuard:
    """MEH-1297 — DELETE /admin/categories/{id} guard."""

    def test_delete_linked_category_409(self, client, db):
        """A category with ≥1 producer → 409, not a silent orphan."""
        admin = make_user(db, role="admin")
        cat = make_category(db, name="ירקות", emoji="🥬")
        make_producer(db, category=cat)
        resp = client.delete(
            f"/admin/categories/{cat.id}",
            headers=auth_header(admin),
        )
        assert resp.status_code == 409, resp.text
        assert "לא ניתן למחוק" in resp.text
        assert "1" in resp.text  # the linked-producer count
        # The guard must NOT have deleted the row — verify it still exists.
        db.expire_all()
        assert db.query(Category).filter(Category.id == cat.id).first() is not None

    def test_delete_unlinked_category_200(self, client, db):
        """A category with no producers deletes cleanly."""
        admin = make_user(db, role="admin")
        cat = make_category(db, name="קטגוריה יתומה", emoji="🥬")
        resp = client.delete(
            f"/admin/categories/{cat.id}",
            headers=auth_header(admin),
        )
        assert resp.status_code == 200, resp.text


class TestLicenseWithThreeCategories:
    """MEH-1297 — license any-match still fires with the full 3-category set."""

    def _register_payload(self, category_ids, *, license_number=None) -> dict:
        payload = {
            "email": "trio@example.com",
            "name": "יצרנית",
            "password": "Zx7Yp9Mq2Lr4",
            "producer_name": "עסק שלישייה",
            "phone": "0501234567",
            "category_ids": category_ids,
            "primary_contact_method": "whatsapp",
            "declaration_accepted": True,
        }
        if license_number is not None:
            payload["producer_license_number"] = license_number
        return payload

    def test_three_categories_one_licensed_no_license_422(self, client, db):
        """3 categories, one license-required, no license → 422 (any-match)."""
        veggies = make_category(db, name="ירקות", emoji="🥬")
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        honey = make_category(db, name=HONEY, emoji="🍯")
        resp = client.post(
            "/auth/register/producer",
            json=self._register_payload([veggies.id, bakery.id, honey.id]),
        )
        assert resp.status_code == 422, resp.text

    def test_three_categories_with_license_200(self, client, db):
        """Same trio with a license → registration succeeds."""
        veggies = make_category(db, name="ירקות", emoji="🥬")
        bakery = make_category(db, name=BAKERY, emoji="🍞")
        honey = make_category(db, name=HONEY, emoji="🍯")
        resp = client.post(
            "/auth/register/producer",
            json=self._register_payload(
                [veggies.id, bakery.id, honey.id], license_number="1234567"
            ),
        )
        assert resp.status_code == 200, resp.text
        # Primary (position 0) is the first selected — veggies.
        producer = db.query(Producer).filter(Producer.name == "עסק שלישייה").first()
        assert producer is not None
        assert producer.categories[0].id == veggies.id
