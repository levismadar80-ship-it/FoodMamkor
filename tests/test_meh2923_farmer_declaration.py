"""MEH-2923 — the grower declaration is enforced and recorded by the SERVER.

The client gate (RegisterProducerClient.jsx) blocks «הצטרפו» until the grower
box is ticked, and the chunk-1 E2E showed it holds. But the server only ever
received one combined `declaration_accepted` and stamped it as
DECLARATION_VERSION, so a vegetable/fruit grower was recorded as having signed
a wording that includes a line she may never have seen. These tests pin:

  1. veg/fruit category + no grower flag → 422 (both branches of the route);
  2. with the flag → 200, and the grower declaration is stored on its OWN
     columns, apart from declared_at / declaration_version;
  3. a non-grower category → no grower flag needed, nothing stamped.
"""

from app import constants
from app.constants import DECLARATION_VERSION
from app.models import Producer, User
from tests.conftest import (
    auth_header,
    make_category,
    make_user,
    valid_producer_register_payload,
)


def _base():
    body = valid_producer_register_payload()
    body["phone"] = "0501234567"  # whatsapp is the chosen contact method
    return body


def _veg_payload(db, **over):
    body = _base()
    veg = make_category(db, name="ירקות", emoji="🥬")
    body["category_ids"] = [veg.id]
    body.update(over)
    return body


def _producer_for(db, email):
    db.expire_all()
    user = db.query(User).filter(User.email == email).one()
    return db.get(Producer, user.producer_id)


class TestNewRegistration:
    def test_veg_without_grower_flag_is_rejected(self, client, db):
        resp = client.post("/auth/register/producer", json=_veg_payload(db))
        assert resp.status_code == 422, resp.json()
        assert resp.json()["detail"] == "יש לאשר את הצהרת המגדל כדי להמשיך"
        assert db.query(Producer).count() == 0

    def test_veg_with_grower_flag_is_stored_separately(self, client, db):
        resp = client.post(
            "/auth/register/producer",
            json=_veg_payload(db, farmer_declaration_accepted=True),
        )
        assert resp.status_code in (200, 201), resp.json()
        p = _producer_for(db, "producer@example.com")
        assert p.declaration_version == DECLARATION_VERSION  # unchanged meaning
        assert p.farmer_declared_at is not None
        assert p.farmer_declaration_version == getattr(constants, "FARMER_DECLARATION_VERSION", "<missing>")

    def test_non_grower_category_needs_no_flag_and_stamps_nothing(self, client, db):
        resp = client.post("/auth/register/producer", json=_base())
        assert resp.status_code in (200, 201), resp.json()
        p = _producer_for(db, "producer@example.com")
        assert p.declared_at is not None
        assert p.farmer_declared_at is None
        assert p.farmer_declaration_version is None


class TestUpgradeBranch:
    """Logged-in consumer → producer (also where every OAuth signup lands)."""

    def test_veg_without_grower_flag_is_rejected(self, client, db):
        consumer = make_user(db, email="upgrade@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_veg_payload(db, email="upgrade@example.com"),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 422, resp.json()
        db.refresh(consumer)
        assert consumer.producer_id is None

    def test_veg_with_grower_flag_is_stored_separately(self, client, db):
        consumer = make_user(db, email="upgrade@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_veg_payload(db, email="upgrade@example.com", farmer_declaration_accepted=True),
            headers=auth_header(consumer),
        )
        assert resp.status_code in (200, 201), resp.json()
        p = _producer_for(db, "upgrade@example.com")
        assert p.farmer_declared_at is not None
        assert p.farmer_declaration_version == getattr(constants, "FARMER_DECLARATION_VERSION", "<missing>")
