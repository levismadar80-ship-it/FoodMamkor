"""
Module:   test_favorites_badge_parity
Purpose:  MEH-1660 — GET /users/me/favorites must serialise the same badge
          enrichment fields as GET /producers. Before the fix, favorites
          skipped attach_badge_fields/attach_favorites_counts, so /favorites
          cards silently lost every badge + the heart count.
Does NOT: cover POST /producers registration response (documented sibling,
          out of scope per MEH-1660).
Related:  backend/app/routers/favorites.py (get_favorites),
          backend/app/services/producer_queries.py:118 (attach_badge_fields),
          backend/app/services/producer_listing.py:476-479 (the idiom).
History:  MEH-1660 (creation).
"""

from __future__ import annotations

from app.models.models import Product
from tests.conftest import auth_header, make_producer, make_user

# The full enrichment field set computed by attach_badge_fields +
# attach_favorites_counts. Any endpoint serialising ProducerListOut must
# return identical values for these — that is the parity contract.
ENRICHMENT_FIELDS = [
    "days_since_created",
    "has_producer_license",
    "has_gluten_free_products",
    "has_vegan_products",
    "has_vegetarian_products",
    "has_lactose_free_products",
    "delivery_count",
    "favorites_count",
]


def _make_enriched_producer(db):
    """Producer that earns badges: license + gluten-free product + delivery."""
    producer = make_producer(db, name="חוות הפריטי", delivery_cities=["תל אביב"])
    producer.producer_license_number = "12345"
    db.add(
        Product(
            producer_id=producer.id,
            name="לחם כוסמין",
            is_gluten_free=True,
        )
    )
    db.commit()
    db.refresh(producer)
    return producer


def _favorite(client, db, producer):
    user = make_user(db)
    r = client.post(f"/users/me/favorites/{producer.id}", headers=auth_header(user))
    assert r.status_code == 201
    return user


def test_favorites_payload_carries_badge_enrichment(client, db):
    """(a) MEH-1660 — the nested producer on /favorites must carry the
    computed badge fields, not schema defaults."""
    producer = _make_enriched_producer(db)
    user = _favorite(client, db, producer)

    r = client.get("/users/me/favorites", headers=auth_header(user))
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    p = rows[0]["producer"]

    # created_at defaults to utcnow in the fixture → 0 days, and it must be
    # a real int — None means attach_badge_fields never ran.
    assert isinstance(p["days_since_created"], int)
    assert p["days_since_created"] == 0
    assert p["has_producer_license"] is True
    assert p["has_gluten_free_products"] is True
    assert p["has_vegan_products"] is False
    assert p["delivery_count"] == 1
    assert p["favorites_count"] >= 1


def test_favorites_and_producers_grid_enrichment_parity(client, db):
    """(b) parity guard — GET /producers and GET /users/me/favorites must
    return IDENTICAL values for the whole enrichment field set. Catches the
    next card-serialising endpoint that forgets attach_badge_fields."""
    producer = _make_enriched_producer(db)
    user = _favorite(client, db, producer)

    grid = client.get("/producers")
    assert grid.status_code == 200
    grid_row = next(row for row in grid.json() if row["id"] == str(producer.id))

    favs = client.get("/users/me/favorites", headers=auth_header(user))
    assert favs.status_code == 200
    fav_row = favs.json()[0]["producer"]

    for field in ENRICHMENT_FIELDS:
        assert fav_row[field] == grid_row[field], (
            f"enrichment parity broken on '{field}': "
            f"favorites={fav_row[field]!r} vs producers={grid_row[field]!r}"
        )
    # Guard the guard: the comparison must not pass vacuously on defaults —
    # this producer genuinely earns non-default values.
    assert grid_row["has_producer_license"] is True
    assert grid_row["favorites_count"] >= 1
