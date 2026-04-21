"""
MEH-99 — Smart search tests.

Covers:
- /producers?q= matches producer name
- /producers?q= matches producer city
- /producers?q= matches category name (cross-field)
- /producers?q= matches product name (cross-field)
- /producers?q= does NOT return unapproved producers
- /producers?q= relevance ordering (exact name first)
- Zero-result queries are logged to search_queries table
- /search?q= autocomplete still works (regression)
"""
import uuid

import pytest
from sqlalchemy import text

from app.models.models import Product
from conftest import auth_header, make_category, make_producer, make_user


class TestProducerSearch:
    def test_matches_producer_name(self, client, db):
        make_producer(db, name="חווה אורגנית", city="חיפה")
        make_producer(db, name="מחלבת הגליל", city="נהריה")

        resp = client.get("/producers?q=חווה")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "חווה אורגנית" in names
        assert "מחלבת הגליל" not in names

    def test_matches_producer_city(self, client, db):
        make_producer(db, name="עסק בירושלים", city="ירושלים")
        make_producer(db, name="עסק בתל אביב", city="תל אביב")

        resp = client.get("/producers?q=ירושלים")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "עסק בירושלים" in names
        assert "עסק בתל אביב" not in names

    def test_matches_category_name(self, client, db):
        cat = make_category(db, name="גבינות עיזים")
        make_producer(db, name="חוות הגדי", city="מצפה רמון", category=cat)
        make_producer(db, name="מאפיית השחר", city="תל אביב")

        resp = client.get("/producers?q=גבינות")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "חוות הגדי" in names
        assert "מאפיית השחר" not in names

    def test_matches_product_name(self, client, db):
        producer = make_producer(db, name="חקלאי הצפון", city="קריית שמונה")
        product = Product(
            id=uuid.uuid4(),
            producer_id=producer.id,
            name="שמן זית כתית מעולה",
            description="",
        )
        db.add(product)
        db.commit()

        make_producer(db, name="עסק ללא שמן", city="באר שבע")

        resp = client.get("/producers?q=שמן")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "חקלאי הצפון" in names
        assert "עסק ללא שמן" not in names

    def test_does_not_return_pending_producers(self, client, db):
        make_producer(db, name="עסק ממתין", city="ראשון לציון", status="pending")

        resp = client.get("/producers?q=ממתין")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_case_insensitive(self, client, db):
        make_producer(db, name="לחמי שאור", city="חדרה")

        resp = client.get("/producers?q=לחמי")
        assert resp.status_code == 200
        assert any(p["name"] == "לחמי שאור" for p in resp.json())

    def test_exact_name_returned_first(self, client, db):
        make_producer(db, name="דבש הרי יהודה", city="בית שמש")
        make_producer(db, name="דבש", city="נס ציונה")

        resp = client.get("/producers?q=דבש")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) >= 2
        assert results[0]["name"] == "דבש"

    def test_empty_query_returns_all(self, client, db):
        make_producer(db, name="עסק א")
        make_producer(db, name="עסק ב")

        resp = client.get("/producers?q=")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_zero_result_logged_to_search_queries(self, client, db):
        resp = client.get("/producers?q=מילה_שלא_קיימת_בכלל_12345")
        assert resp.status_code == 200
        assert resp.json() == []

        rows = db.execute(
            text("SELECT query FROM search_queries WHERE query = :q"),
            {"q": "מילה_שלא_קיימת_בכלל_12345"},
        ).fetchall()
        assert len(rows) == 1

    def test_x_total_count_header(self, client, db):
        make_producer(db, name="ירק טרי א")
        make_producer(db, name="ירק טרי ב")

        resp = client.get("/producers?q=ירק")
        assert resp.status_code == 200
        assert resp.headers.get("x-total-count") == "2"


class TestSmartSearchAutocomplete:
    """Regression: /search?q= autocomplete still returns grouped results."""

    def test_returns_producers_and_categories(self, client, db):
        cat = make_category(db, name="בשר טרי")
        make_producer(db, name="בשר מהחווה", city="מודיעין")

        resp = client.get("/search?q=בשר")
        assert resp.status_code == 200
        body = resp.json()
        assert "producers" in body
        assert "categories" in body
        assert any(p["name"] == "בשר מהחווה" for p in body["producers"])
        assert any(c["name"] == "בשר טרי" for c in body["categories"])

    def test_empty_query_returns_empty(self, client):
        resp = client.get("/search?q=")
        assert resp.status_code == 200
        body = resp.json()
        assert body["producers"] == []
        assert body["categories"] == []
