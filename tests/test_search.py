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

    @pytest.mark.skip(reason="product-name search not implemented on GET /producers — tracked in MEH-394")
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


class TestSearchMatchesDeliveryCity:
    """MEH-1488 — q= also matches a business's delivery_areas.city, so a
    producer that DELIVERS to the searched city surfaces even when its own
    Producer.city differs."""

    def test_matches_delivery_city_when_own_city_differs(self, client, db):
        make_producer(
            db, name="מאפיית הבוקר", city="חיפה", delivery_cities=["אשדוד"]
        )
        make_producer(db, name="עסק ללא כיסוי", city="נהריה")

        resp = client.get("/producers?q=אשדוד")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "מאפיית הבוקר" in names
        assert "עסק ללא כיסוי" not in names


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


def _make_cheese_fixture(db):
    """MEH-1664 shared fixture: one Tel-Aviv cheese business + one Haifa
    bakery that shares none of its terms.

    Producer:    מחלבת השרון (תל אביב), category "גבינות עיזים"
    Products:    "גבינת עיזים"  — the smichut form the query rules must reach
                 "מארז מתנה" / desc "כולל יוגורט כבשים טרי" — description-only
    Control:     מאפיית הבוקר (חיפה) — matches "חיפה" and nothing else.
    """
    cat = make_category(db, name="גבינות עיזים")
    producer = make_producer(
        db, name="מחלבת השרון", city="תל אביב", category=cat
    )
    db.add(
        Product(
            id=uuid.uuid4(),
            producer_id=producer.id,
            name="גבינת עיזים",
            description="",
        )
    )
    db.add(
        Product(
            id=uuid.uuid4(),
            producer_id=producer.id,
            name="מארז מתנה",
            description="כולל יוגורט כבשים טרי",
        )
    )
    control = make_producer(db, name="מאפיית הבוקר", city="חיפה")
    db.commit()
    return producer, control


class TestHebrewTokenSearch:
    """MEH-1664 — per-token matching: AND across tokens, OR across
    (variant x field). Replaces single-substring ILIKE on both search paths.
    """

    def test_1_smichut_product_found_by_feminine_singular(self, client, db):
        """"גבינה עיזים" finds the product "גבינת עיזים".

        Neither word is a substring of the stored name in that form — the
        ה-stem takes "גבינה" to "גבינ", which is. Pre-MEH-1664 this returned
        nothing, because "גבינה עיזים" as one literal is not in the row.
        """
        _make_cheese_fixture(db)

        resp = client.get("/search", params={"q": "גבינה עיזים"})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()["products"]]
        assert "גבינת עיזים" in names
        assert "מארז מתנה" not in names

    def test_2_reversed_word_order_finds_the_same_product(self, client, db):
        """"עיזים גבינת" — reversed — finds it too. Word order is free
        because the tokens are AND-ed independently, not matched as a run."""
        _make_cheese_fixture(db)

        resp = client.get("/search", params={"q": "עיזים גבינת"})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()["products"]]
        assert "גבינת עיזים" in names

    def test_3_definite_article_finds_producer_on_producers_path(self, client, db):
        """"הגבינה" on /producers?q= — prefix strip + stem, applied on the
        listing path for the first time (MEH-252 only ever touched /search)."""
        _make_cheese_fixture(db)

        resp = client.get("/producers", params={"q": "הגבינה"})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "מחלבת השרון" in names
        assert "מאפיית הבוקר" not in names

    def test_4_plural_query_finds_producer(self, client, db):
        """"גבינות" finds the business through its category "גבינות עיזים".

        Honest scope note: this passes on the literal variant, not the stem —
        the ה/ת rule takes "גבינות" to "גבינו", which does NOT reach the
        product's "גבינת". Plural->singular is the documented uncovered
        direction (see test_hebrew_search.py
        ::test_plural_to_singular_is_not_covered). What this test does lock is
        that a plural query still resolves across the category source under
        the new AND semantics.
        """
        _make_cheese_fixture(db)

        resp = client.get("/producers", params={"q": "גבינות"})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "מחלבת השרון" in names
        assert "מאפיית הבוקר" not in names

    def test_5_negative_and_across_tokens(self, client, db):
        """AND proof: "גבינה חיפה" returns ZERO producers.

        The cheese business matches "גבינה" but is in תל אביב; the Haifa
        bakery matches "חיפה" but sells no cheese. Under the old OR-shaped
        single-substring behaviour a widened query could surface either one —
        under AND, neither qualifies. This is the test that would fail if a
        future change ORs the tokens.
        """
        _make_cheese_fixture(db)

        resp = client.get("/producers", params={"q": "גבינה חיפה"})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_6_like_metacharacters_are_escaped(self, client, db):
        """% and _ stay literal (MEH-1176) — 200, and no match-everything.

        A bare "%" must not behave as a wildcard now that it flows through
        the variant expansion; both endpoints escape every variant.
        """
        _make_cheese_fixture(db)

        for wildcard in ("%", "_", "%%", "a_b"):
            resp = client.get("/producers", params={"q": wildcard})
            assert resp.status_code == 200, wildcard
            assert resp.json() == [], wildcard

            resp = client.get("/search", params={"q": wildcard})
            assert resp.status_code == 200, wildcard
            body = resp.json()
            assert body["producers"] == [], wildcard
            assert body["products"] == [], wildcard
            assert body["cities"] == [], wildcard
            assert body["categories"] == [], wildcard

    def test_7_product_description_only_match_surfaces_producer(self, client, db):
        """"יוגורט" appears ONLY in a product description.

        Pre-MEH-1664 the /producers has_product EXISTS covered Product.name
        alone, so this producer was reachable from /search but not from
        /producers?q= — the path-unification half of the ticket.
        """
        _make_cheese_fixture(db)

        resp = client.get("/producers", params={"q": "יוגורט"})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "מחלבת השרון" in names
        assert "מאפיית הבוקר" not in names


class TestSearchDoSProtection:
    """MEH-145 — search query max_length=200 prevents DoS via oversized input."""

    def test_producers_q_over_limit_returns_422(self, client):
        long_q = "א" * 201
        resp = client.get(f"/producers?q={long_q}")
        assert resp.status_code == 422

    def test_producers_q_at_limit_is_accepted(self, client):
        long_q = "א" * 200
        resp = client.get(f"/producers?q={long_q}")
        assert resp.status_code == 200

    def test_search_autocomplete_over_limit_returns_422(self, client):
        long_q = "א" * 201
        resp = client.get(f"/search?q={long_q}")
        assert resp.status_code == 422

    def test_search_autocomplete_at_limit_is_accepted(self, client):
        long_q = "א" * 200
        resp = client.get(f"/search?q={long_q}")
        assert resp.status_code == 200
