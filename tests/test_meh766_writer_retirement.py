"""MEH-766 chunks 3+5+6 — is_verified fully retired.

ch3 retired every writer; ch5 removed the field from the serialized contract;
ch6 DROPPED the column (revision d4e7a92c81b5). Verification is ONLY via
grant-verified (`verified_at`, MEH-762 / ADR-022). These tests lock the end
state: no input field, no output field, no model attribute, and a stray
`is_verified` in a payload is silently ignored rather than 500ing.
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


def test_model_has_no_is_verified_column():
    # MEH-766 ch6: the column itself is gone (revision d4e7a92c81b5). This is
    # the model-level lock — re-adding the attribute is a test failure, not a
    # silent regression.
    assert not hasattr(Producer, "is_verified")


def test_admin_create_emits_no_is_verified(client, db):
    # MEH-766 ch5/ch6: admin create succeeds and neither serializes the field
    # nor has a column to write (create path fully clean of the legacy axis).
    admin = make_user(db, email="meh766-c3-create@example.com", role="admin")
    veggies = make_category(db, name="ירקות", emoji="🥬")
    resp = client.post(
        "/admin/producers",
        json={"name": "עסק ללא תיוג", "category_ids": [veggies.id]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 201, resp.text
    assert "is_verified" not in resp.json()
    producer = db.query(Producer).filter(Producer.id == resp.json()["id"]).first()
    assert producer is not None  # row created cleanly without the column


def test_admin_create_ignores_is_verified_in_payload(client, db):
    # MEH-766 ch3/ch6: a client posting the retired field is silently ignored
    # (Pydantic drops unknown keys) — no 422, no 500, no write.
    admin = make_user(db, email="meh766-c3-create2@example.com", role="admin")
    veggies = make_category(db, name="ירקות", emoji="🥬")
    resp = client.post(
        "/admin/producers",
        json={"name": "עסק מתחזה", "category_ids": [veggies.id], "is_verified": True},
        headers=auth_header(admin),
    )
    assert resp.status_code == 201, resp.text
    assert "is_verified" not in resp.json()


def test_admin_put_ignores_is_verified_in_payload(client, db):
    # MEH-766 ch3/ch6: the retired field in a PUT payload is ignored while the
    # rest of the update applies (proving the setattr-loop still runs).
    admin = make_user(db, email="meh766-c3-put@example.com", role="admin")
    producer = make_producer(db, name="עסק PUT")

    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"is_verified": True, "name": "עסק PUT מעודכן"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.name == "עסק PUT מעודכן"  # the rest of the update applied
    assert "is_verified" not in resp.json()


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
        # Both halves of the ADR-022 public surface (auto-review on #1578):
        # verification_tier + verified_at (date-granularity, None until granted).
        assert "verification_tier" in item
        assert "verified_at" in item
