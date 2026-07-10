"""MEH-766 chunk 3 — is_verified writers retired.

After this chunk no admin write path sets `is_verified`; the column stays at
its SQLAlchemy default (False) until the ch6 DROP. Verification is ONLY via
grant-verified (which sets `verified_at`, a separate axis — MEH-762). These
tests assert the retirement at both the schema level (the field is gone from
the admin input models) and the integration level (admin create + PUT can no
longer write the column).
"""

from app.models.models import Producer
from app.schemas.schemas import ProducerAdminCreate, ProducerUpdate

from tests.conftest import auth_header, make_category, make_producer, make_user


def test_admin_input_schemas_have_no_is_verified_field():
    # MEH-766 ch3: removing the field is what stops the writes — admin create
    # reads ProducerAdminCreate fields; the admin PUT setattr-loop applies
    # ProducerUpdate fields. No field → no write. (Pure-unit; no DB needed.)
    assert "is_verified" not in ProducerAdminCreate.model_fields
    assert "is_verified" not in ProducerUpdate.model_fields


def test_admin_create_leaves_is_verified_false(client, db):
    # MEH-766 ch3: admin create no longer sets is_verified → column default False.
    admin = make_user(db, email="meh766-c3-create@example.com", role="admin")
    veggies = make_category(db, name="ירקות", emoji="🥬")
    resp = client.post(
        "/admin/producers",
        json={"name": "עסק ללא תיוג", "category_ids": [veggies.id]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 201, resp.text
    # MEH-766 ch5: is_verified is no longer part of the serialized contract.
    assert "is_verified" not in resp.json()
    producer = db.query(Producer).filter(Producer.id == resp.json()["id"]).first()
    assert producer.is_verified is False  # the DB row itself (column drops ch6)


def test_admin_create_ignores_is_verified_in_payload(client, db):
    # MEH-766 ch3: even if a client posts is_verified=True, the field is gone
    # from ProducerAdminCreate → silently ignored; producer stays False.
    admin = make_user(db, email="meh766-c3-create2@example.com", role="admin")
    veggies = make_category(db, name="ירקות", emoji="🥬")
    resp = client.post(
        "/admin/producers",
        json={"name": "עסק מתחזה", "category_ids": [veggies.id], "is_verified": True},
        headers=auth_header(admin),
    )
    assert resp.status_code == 201, resp.text
    # MEH-766 ch5: field absent from output; the DB row proves the ignore.
    assert "is_verified" not in resp.json()
    producer = db.query(Producer).filter(Producer.id == resp.json()["id"]).first()
    assert producer.is_verified is False


def test_admin_put_cannot_set_is_verified(client, db):
    # MEH-766 ch3: is_verified removed from ProducerUpdate → the admin PUT
    # setattr-loop can't write it. Start False, PUT is_verified=True → stays False
    # (the rest of the PUT still applies, proving the loop runs).
    admin = make_user(db, email="meh766-c3-put@example.com", role="admin")
    producer = make_producer(db, name="עסק PUT")  # make_producer sets is_verified=True
    producer.is_verified = False
    db.commit()

    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"is_verified": True, "name": "עסק PUT מעודכן"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.is_verified is False  # writer retired — the PUT could not set it
    assert producer.name == "עסק PUT מעודכן"  # but the rest of the update applied


def test_public_list_output_has_no_is_verified(client, db):
    # MEH-766 ch5 (Contract): the public producers list no longer serializes
    # the legacy boolean — verification_tier/verified_at are the only public
    # verification surface (ADR-022). Locks the contract so ch6's DROP can't
    # surprise a consumer.
    producer = make_producer(db, name="עסק חוזה ציבורי")
    producer.status = "approved"
    db.commit()
    resp = client.get("/producers")
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert items, "expected the approved producer in the public list"
    for item in items:
        assert "is_verified" not in item
        assert "verification_tier" in item
