"""MEH-762 (ADR-022 public tier contract, Chunk 2) — admin tier-1 "מאומת"
verification stamping.

Covers the grant/revoke admin endpoints that record the OUTCOME of the
(manual, off-platform) document review:
  - grant stamps verified_at (tz-aware, recent) + verification_doc_type;
  - the grant response serializes verified_at as ISO-8601;
  - each doc_type value accepted; an invalid value 422s (Literal guard);
  - re-grant overwrites verified_at + doc_type (legit correction path);
  - revoke clears both to NULL; revoke is idempotent on an unverified row;
  - permission guard: non-admin 403 (schema-valid body), missing 404;
  - grant/revoke round-trip verified_at with no legacy column (ch6 drop);
  - no auto-stamp on the admin-create/import path (make_producer).

Pure HTTP/DB tests, mirroring tests/test_producer_declaration.py.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.models import Producer

from tests.conftest import auth_header, make_producer, make_user


def _admin_header(db):
    return auth_header(make_user(db, role="admin"))


def test_grant_stamps_verified_at_and_doc_type(client, db):
    producer = make_producer(db, name="חוות אימות")
    before = datetime.now(timezone.utc)
    resp = client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": "license"},
        headers=_admin_header(db),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.verification_doc_type == "license"
    assert producer.verified_at is not None
    # tz-aware, stamped at/after the pre-request instant (allow clock skew).
    assert producer.verified_at.tzinfo is not None
    assert producer.verified_at >= before - timedelta(seconds=5)


def test_grant_response_serializes_verified_at_iso(client, db):
    producer = make_producer(db, name="חוות ISO")
    resp = client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": "exemption"},
        headers=_admin_header(db),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["verification_doc_type"] == "exemption"
    # ISO-8601 string that round-trips through fromisoformat without error.
    assert isinstance(body["verified_at"], str)
    datetime.fromisoformat(body["verified_at"])


@pytest.mark.parametrize("doc_type", ["license", "exemption", "cosmetics"])
def test_grant_accepts_each_doc_type(client, db, doc_type):
    producer = make_producer(db, name=f"חוות {doc_type}")
    resp = client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": doc_type},
        headers=_admin_header(db),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.verification_doc_type == doc_type


def test_grant_rejects_invalid_doc_type(client, db):
    producer = make_producer(db, name="חוות לא חוקית")
    resp = client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": "passport"},
        headers=_admin_header(db),
    )
    assert resp.status_code == 422


def test_regrant_overwrites_verified_at_and_doc_type(client, db):
    producer = make_producer(db, name="חוות תיקון")
    hdr = _admin_header(db)
    first = client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": "license"},
        headers=hdr,
    )
    assert first.status_code == 200, first.text
    db.refresh(producer)
    first_at = producer.verified_at
    assert producer.verification_doc_type == "license"
    # Re-grant with a different doc_type → both fields overwritten.
    second = client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": "exemption"},
        headers=hdr,
    )
    assert second.status_code == 200, second.text
    db.refresh(producer)
    assert producer.verification_doc_type == "exemption"
    assert producer.verified_at >= first_at


def test_revoke_clears_both(client, db):
    producer = make_producer(db, name="חוות ביטול")
    hdr = _admin_header(db)
    client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": "license"},
        headers=hdr,
    )
    resp = client.post(
        f"/admin/producers/{producer.id}/revoke-verified", headers=hdr
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.verified_at is None
    assert producer.verification_doc_type is None


def test_revoke_is_idempotent_on_unverified(client, db):
    producer = make_producer(db, name="חוות לא מאומתת")
    resp = client.post(
        f"/admin/producers/{producer.id}/revoke-verified",
        headers=_admin_header(db),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.verified_at is None
    assert producer.verification_doc_type is None


def test_grant_requires_admin(client, db):
    # Schema-valid body so a 403 proves the permission guard, not a 422
    # (regression rule 6).
    producer = make_producer(db, name="חוות הרשאה")
    consumer = make_user(db, role="consumer")
    resp = client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": "license"},
        headers=auth_header(consumer),
    )
    assert resp.status_code == 403


def test_revoke_requires_admin(client, db):
    producer = make_producer(db, name="חוות הרשאה 2")
    consumer = make_user(db, role="consumer")
    resp = client.post(
        f"/admin/producers/{producer.id}/revoke-verified",
        headers=auth_header(consumer),
    )
    assert resp.status_code == 403


def test_grant_404_on_missing_producer(client, db):
    resp = client.post(
        f"/admin/producers/{uuid.uuid4()}/grant-verified",
        json={"doc_type": "license"},
        headers=_admin_header(db),
    )
    assert resp.status_code == 404


def test_grant_revoke_work_without_legacy_column(client, db):
    # MEH-766 ch6: the legacy is_verified column is DROPPED — this test was
    # the ch2-era "grant/revoke leave is_verified untouched" decoupling proof.
    # What remains to lock: the model has no such attribute, and grant/revoke
    # still round-trip verified_at cleanly without it.
    producer = make_producer(db, name="חוות ללא עמודה")
    assert not hasattr(Producer, "is_verified")
    hdr = _admin_header(db)
    resp = client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": "license"},
        headers=hdr,
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.verified_at is not None
    resp = client.post(f"/admin/producers/{producer.id}/revoke-verified", headers=hdr)
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.verified_at is None
