"""MEH-986 chunk 3b — verified-only kosher filter + free-text kosher off public output.

P0 legal (חוק איסור הונאה בכשרות). The `?kosher` filter now matches admin-verified
kashrut (`kashrut_verified_at`), never the free-text `Producer.kosher`; and the
free-text `kosher` field no longer serializes on the public
`ProducerListOut`/`ProducerDetailOut`. It stays on `ProducerAdminOut` /
`ProducerOwnerOut` (admin-internal + owner's own view). The column is unchanged.
"""

from datetime import datetime, timezone

from app.schemas.schemas import (
    ProducerAdminOut,
    ProducerDetailOut,
    ProducerListOut,
    ProducerOwnerOut,
)

from tests.conftest import make_producer


def test_public_output_has_no_kosher_field():
    # (c) MEH-986 ch3b: public list + detail outputs drop free-text kosher.
    assert "kosher" not in ProducerListOut.model_fields
    assert "kosher" not in ProducerDetailOut.model_fields  # inherits ListOut


def test_admin_and_owner_output_keep_kosher():
    # (d) admin-internal + owner's own view re-declare it (else inheritance strips it).
    assert "kosher" in ProducerAdminOut.model_fields
    assert "kosher" in ProducerOwnerOut.model_fields


def test_kosher_filter_returns_verified_producer(client, db):
    # (a) ?kosher=true → verified kashrut (kashrut_verified_at present).
    verified = make_producer(db, name="חוות מאומתת כשרות")
    verified.kashrut_verified_at = datetime.now(timezone.utc)
    db.commit()
    names = {p["name"] for p in client.get("/producers?kosher=true").json()}
    assert "חוות מאומתת כשרות" in names


def test_kosher_filter_excludes_free_text_only_producer(client, db):
    # (b) free-text kosher but NO verification → excluded from ?kosher=true,
    # and correctly returned by ?kosher=false (verified-none branch).
    freetext = make_producer(db, name="חוות כשר טקסט")
    freetext.kosher = "כשר"  # free-text, unverified
    db.commit()
    names_true = {p["name"] for p in client.get("/producers?kosher=true").json()}
    assert "חוות כשר טקסט" not in names_true  # free-text is NOT "verified"
    names_false = {p["name"] for p in client.get("/producers?kosher=false").json()}
    assert "חוות כשר טקסט" in names_false
