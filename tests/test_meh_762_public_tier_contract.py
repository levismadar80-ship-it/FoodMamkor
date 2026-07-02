"""MEH-762 (ADR-022 public tier contract, Chunk 3) — verification_tier
resolver + public exposure on ProducerListOut / ProducerDetailOut.

Locked semantics (D2/D3):
  - verified_at is not None        → "verified"
  - elif NO category is in LICENSE_REQUIRED_CATEGORIES → "declared"
  - else (license-required + unverified) → None (no badge, no negative label)
One license-required category is enough to exclude "declared".

Privacy (locked table): verification_tier public · verified_at public at
DATE granularity only (no time leak) · verification_doc_type public ·
declared_at / declaration_version / producer_license_number stay admin-only.

Pure HTTP/DB tests, mirroring tests/test_producer_declaration.py.
"""
from datetime import datetime, timezone

import pytest

from app.models.models import ProducerCategory
from tests.conftest import make_category, make_producer


def _verify(db, producer, *, doc_type="license", when=None):
    producer.verified_at = when or datetime.now(timezone.utc)
    producer.verification_doc_type = doc_type
    db.commit()
    db.refresh(producer)


def _add_category(db, producer, name):
    cat = make_category(db, name=name)
    db.add(ProducerCategory(producer_id=producer.id, category_id=cat.id))
    db.commit()


def test_verified_tier_when_verified_at_set(client, db):
    # verified_at present → "verified" even though the category is exempt.
    cat = make_category(db, name="ירקות")
    producer = make_producer(db, name="חוות מאומתת", category=cat)
    _verify(db, producer, doc_type="license")
    body = client.get(f"/producers/{producer.id}").json()
    assert body["verification_tier"] == "verified"
    assert body["verification_doc_type"] == "license"


def test_declared_tier_when_all_categories_exempt(client, db):
    cat = make_category(db, name="ירקות")  # not in LICENSE_REQUIRED_CATEGORIES
    producer = make_producer(db, name="חוות מוצהרת", category=cat)
    body = client.get(f"/producers/{producer.id}").json()
    assert body["verification_tier"] == "declared"
    assert body["verified_at"] is None
    assert body["verification_doc_type"] is None


def test_none_tier_license_required_unverified(client, db):
    # D3: license-required + unverified → None (no badge, NOT a negative label).
    cat = make_category(db, name="בשר")
    producer = make_producer(db, name="חוות חובה", category=cat)
    body = client.get(f"/producers/{producer.id}").json()
    assert body["verification_tier"] is None


def test_multi_category_one_license_required_excludes_declared(client, db):
    exempt = make_category(db, name="ירקות")
    producer = make_producer(db, name="חוות מעורבת", category=exempt)
    _add_category(db, producer, "דבש")  # license-required → excludes "declared"
    body = client.get(f"/producers/{producer.id}").json()
    assert body["verification_tier"] is None


def test_verified_overrides_license_required_mix(client, db):
    exempt = make_category(db, name="ירקות")
    producer = make_producer(db, name="חוות מעורבת מאומתת", category=exempt)
    _add_category(db, producer, "בשר")
    _verify(db, producer, doc_type="exemption")
    body = client.get(f"/producers/{producer.id}").json()
    assert body["verification_tier"] == "verified"


def test_verified_at_is_date_only_no_time_leak(client, db):
    cat = make_category(db, name="ירקות")
    producer = make_producer(db, name="חוות תאריך", category=cat)
    _verify(
        db,
        producer,
        doc_type="license",
        when=datetime(2026, 6, 6, 14, 37, 12, tzinfo=timezone.utc),
    )
    body = client.get(f"/producers/{producer.id}").json()
    # Exactly YYYY-MM-DD — no "T"/time/offset component may leak.
    assert body["verified_at"] == "2026-06-06"
    assert "T" not in body["verified_at"]
    assert ":" not in body["verified_at"]


def test_public_payload_omits_admin_only_fields(client, db):
    cat = make_category(db, name="בשר")
    producer = make_producer(db, name="חוות פרטיות", category=cat)
    producer.producer_license_number = "1234567"
    _verify(db, producer, doc_type="license")
    body = client.get(f"/producers/{producer.id}").json()
    # MEH-530 / MEH-759 privacy: never on the public contract.
    assert "declared_at" not in body
    assert "declaration_version" not in body
    assert "producer_license_number" not in body
    # ...but the public verification fields ARE present.
    assert "verification_tier" in body
    assert "verified_at" in body
    assert "verification_doc_type" in body


@pytest.mark.parametrize("doc_type", ["license", "exemption", "cosmetics"])
def test_each_doc_type_round_trips_public(client, db, doc_type):
    cat = make_category(db, name="ירקות")
    producer = make_producer(db, name=f"חוות {doc_type}", category=cat)
    _verify(db, producer, doc_type=doc_type)
    body = client.get(f"/producers/{producer.id}").json()
    assert body["verification_doc_type"] == doc_type
    assert body["verification_tier"] == "verified"
