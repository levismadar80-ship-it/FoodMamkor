"""MEH-759 (ADR-022 gate 2, Chunk B) — producer declaration audit stamping.

Covers the backend half of gate 2:
  - DECLARATION_VERSION constant value (locked + fits VARCHAR(10)).
  - stamp-on-register: declared_at (tz-aware, recent) + declaration_version.
  - the 422 guard when declaration_accepted is False OR absent.
  - NULL columns on non-register creation (admin-create / import path).
  - admin-only Pydantic exposure: declared_at / declaration_version are on
    ProducerAdminOut but NEVER on the public ProducerDetailOut (MEH-530
    privacy-first precedent).

Pure HTTP/DB tests — no Anthropic/email assertions (those layers fail-open
in the test config, same as the existing register tests in test_api.py).
"""
from datetime import datetime, timedelta, timezone

from app.constants import DECLARATION_VERSION
from app.models.models import Producer
from tests.conftest import (
    auth_header,
    make_producer,
    make_user,
    valid_producer_register_payload,
)


def test_declaration_version_constant_value():
    # Locked value + must fit the producers.declaration_version VARCHAR(10).
    assert DECLARATION_VERSION == "2026-06-v1"
    assert len(DECLARATION_VERSION) <= 10


def test_register_stamps_declared_at_and_version(client, db):
    before = datetime.now(timezone.utc)
    payload = valid_producer_register_payload()
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 200, resp.text

    producer = (
        db.query(Producer).filter(Producer.name == payload["producer_name"]).first()
    )
    assert producer is not None
    assert producer.declaration_version == DECLARATION_VERSION
    assert producer.declared_at is not None
    # tz-aware timestamp stamped at/after the pre-request instant (allow skew).
    assert producer.declared_at.tzinfo is not None
    assert producer.declared_at >= before - timedelta(seconds=5)


def test_register_rejects_false_declaration(client):
    payload = valid_producer_register_payload()
    payload["declaration_accepted"] = False
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422


def test_register_rejects_absent_declaration(client):
    payload = valid_producer_register_payload()
    payload.pop("declaration_accepted", None)
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422


def test_no_declaration_leaves_columns_null(db):
    # make_producer mirrors the admin-create / import path: no business-owner
    # declaration is made, so the columns must default NULL — never auto-stamped.
    producer = make_producer(db, name="חוות ללא הצהרה")
    assert producer.declared_at is None
    assert producer.declaration_version is None


def test_public_producer_detail_omits_declaration(client, db):
    producer = make_producer(db, name="חוות ציבורית", status="approved")
    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200
    body = resp.json()
    # Public ProducerDetailOut must NOT leak the audit trail.
    assert "declared_at" not in body
    assert "declaration_version" not in body


def test_admin_producer_list_exposes_declaration(client, db):
    make_producer(db, name="חוות אדמין", status="approved")
    admin = make_user(db, role="admin")
    resp = client.get("/admin/producers", headers=auth_header(admin))
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) >= 1
    # Admin ProducerAdminOut carries the audit fields (NULL here is fine —
    # we assert the keys are present, i.e. the schema exposes them).
    assert "declared_at" in rows[0]
    assert "declaration_version" in rows[0]
