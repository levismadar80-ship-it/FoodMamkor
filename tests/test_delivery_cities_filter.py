"""
MEH-1487 — GET /producers?delivery_cities= (region fallback OR-list).

The empty-result region fallback fetches with delivery_cities=<region cities>.
delivery_cities ORs the SAME per-city condition as delivery_city
(delivery_areas ∪ nationwide-minus-excluded), so:
  - a producer delivering to ANY city in the list matches
  - a nationwide producer is included unless it excluded that city
  - delivery_city (single) still takes precedence when both are sent

Tests live in tests/ (repo root) per repo convention.
REUSES: tests/test_delivery_exclusion.py (_nationwide helper pattern).
"""
from tests.conftest import make_producer, make_user  # noqa: F401


def _nationwide(db, name, excluded=None):
    producer = make_producer(db, name=name)
    producer.offers_delivery = True
    producer.delivery_nationwide = True
    producer.delivery_excluded_cities = excluded or []
    db.commit()
    return producer


def test_delivery_cities_ors_area_producers(client, db):
    # Delivers to רעננה only (a Sharon city), own city elsewhere.
    make_producer(db, name="משלוח לשרון", city="חיפה", delivery_cities=["רעננה"])
    # Delivers to a city NOT in the requested list.
    make_producer(db, name="משלוח לדרום", city="חיפה", delivery_cities=["אילת"])

    # Region-style OR list (a couple of Sharon cities).
    resp = client.get("/producers?delivery_cities=נתניה&delivery_cities=רעננה")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert "משלוח לשרון" in names
    assert "משלוח לדרום" not in names


def test_delivery_cities_respects_nationwide_exclusion(client, db):
    # Nationwide but excludes נתניה — must NOT match a list of only נתניה.
    _nationwide(db, "כל הארץ חוץ מנתניה", excluded=["נתניה"])

    only_excluded = client.get("/producers?delivery_cities=נתניה")
    assert only_excluded.status_code == 200
    assert "כל הארץ חוץ מנתניה" not in [p["name"] for p in only_excluded.json()]

    # A non-excluded city in the list → the nationwide producer matches.
    with_other = client.get("/producers?delivery_cities=נתניה&delivery_cities=רעננה")
    assert with_other.status_code == 200
    assert "כל הארץ חוץ מנתניה" in [p["name"] for p in with_other.json()]


def test_delivery_city_single_takes_precedence_over_list(client, db):
    make_producer(db, name="רק לרעננה", city="חיפה", delivery_cities=["רעננה"])
    make_producer(db, name="רק לנתניה", city="חיפה", delivery_cities=["נתניה"])

    # delivery_city=רעננה wins; the delivery_cities list is ignored.
    resp = client.get("/producers?delivery_city=רעננה&delivery_cities=נתניה")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert names == ["רק לרעננה"]
