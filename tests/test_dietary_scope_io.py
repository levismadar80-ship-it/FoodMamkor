"""MEH-1508 chunk 2 (Phase A) — business-level dietary scope I/O + validation.

Covers the API half of chunk 2:
  - owner PUT /producers/me persists the four scope fields (round-trip);
  - the chunk-1 validation debt: an out-of-enum value → 422, and an explicit
    null → 422 (the columns are NOT NULL, so a null write would 500 otherwise);
  - the owner write is scoped to the caller's own producer (no cross-write);
  - admin PUT /admin/producers/{id} accepts the four (manual-approval path);
  - all four appear in the public ProducerDetailOut payload.

Pure HTTP/DB tests, no Anthropic/email assertions (fail-open in test config).

REUSES: tests/test_producer_me_delivery_fields.py:20 (_producer_user owner
wiring — make_producer + make_user(role="producer") + user.producer_id link).
"""

from tests.conftest import auth_header, make_producer, make_user


def _producer_user(db):
    producer = make_producer(db, name="חוות סקופ תזונה")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_owner_put_persists_dietary_scope(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "vegan_scope": "all",
            "vegetarian_scope": "some",
            "gluten_free_facility": "dedicated",
            "lactose_free_facility": "shared",
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.vegan_scope == "all"
    assert producer.vegetarian_scope == "some"
    assert producer.gluten_free_facility == "dedicated"
    assert producer.lactose_free_facility == "shared"


def test_owner_put_invalid_scope_value_returns_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"vegan_scope": "mostly"},  # not in {unknown, some, all}
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_owner_put_invalid_facility_value_returns_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"gluten_free_facility": "clean"},  # not in {unknown, shared, dedicated}
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_owner_put_explicit_null_scope_returns_422(client, db):
    # The columns are NOT NULL — an explicit null must be rejected at validation,
    # never reach setattr (which would 500 on the constraint).
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"vegan_scope": None},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_owner_write_is_scoped_to_own_producer(client, db):
    # The owner route only ever writes user.producer_id — a second producer's
    # fields are never reachable from this path (no IDOR surface).
    owner_a, _ = _producer_user(db)
    prod_b = make_producer(db, name="חוות אחרת")

    resp = client.put(
        "/producers/me",
        json={"vegan_scope": "all"},
        headers=auth_header(owner_a),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(prod_b)
    assert prod_b.vegan_scope == "unknown"  # untouched — default


def test_admin_put_accepts_dietary_scope(client, db):
    producer = make_producer(db, name="חוות אדמין סקופ")
    admin = make_user(db, role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"vegan_scope": "all", "gluten_free_facility": "shared"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.vegan_scope == "all"
    assert producer.gluten_free_facility == "shared"


def test_public_detail_exposes_dietary_scope(client, db):
    producer = make_producer(db, name="חוות ציבורית סקופ", status="approved")
    producer.vegan_scope = "all"
    producer.gluten_free_facility = "shared"
    db.commit()

    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # All four fields serialize on the public ProducerDetailOut.
    for key in (
        "vegan_scope",
        "vegetarian_scope",
        "gluten_free_facility",
        "lactose_free_facility",
    ):
        assert key in body, f"{key} missing from public detail payload"
    assert body["vegan_scope"] == "all"
    assert body["gluten_free_facility"] == "shared"
