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
  - legacy is_verified is left untouched (decoupling = Chunk 4);
  - no auto-stamp on the admin-create/import path (make_producer).

Pure HTTP/DB tests, mirroring tests/test_producer_declaration.py.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

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


def test_grant_revoke_leave_is_verified_untouched(client, db):
    # make_producer sets is_verified=True; Chunk 2 must not touch the legacy
    # axis (decoupling is Chunk 4). Both grant and revoke leave it as-is.
    producer = make_producer(db, name="חוות is_verified")
    assert producer.is_verified is True
    hdr = _admin_header(db)
    client.post(
        f"/admin/producers/{producer.id}/grant-verified",
        json={"doc_type": "license"},
        headers=hdr,
    )
    db.refresh(producer)
    assert producer.is_verified is True
    client.post(f"/admin/producers/{producer.id}/revoke-verified", headers=hdr)
    db.refresh(producer)
    assert producer.is_verified is True
