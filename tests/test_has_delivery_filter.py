"""
MEH-1836 — the ?has_delivery=true chip must match every business that
actually delivers, not only those with explicit delivery_areas rows.

The bug: `producer_listing.py` filtered on a bare
`Producer.delivery_areas.any()`. Under the XOR data model
(models.py:392 `delivery_nationwide_xor_cities`) a nationwide business holds
ZERO delivery_areas rows, so `.any()` was false for exactly the businesses
that deliver furthest — they vanished from the משלוח chip with no error.

These assert BEHAVIOUR through the public endpoint (which producers come back
for a given DB state), not that a particular predicate was written — ADR-032
§3.6. An inert "fix" cannot pass them.

Discrimination: against the pre-fix `delivery_areas.any()` the nationwide
cases below return an empty list, so
test_nationwide_only_matches / test_nationwide_with_exclusions_still_matches /
test_count_header_agrees_for_nationwide fail on it. The areas-only and
neither cases pass both before and after — they are the regression control,
and are labelled as such rather than counted as evidence for the change.

REUSES: tests/test_delivery_exclusion.py (_nationwide helper shape,
make_producer(delivery_cities=...) area-row factory).
"""

from tests.conftest import make_producer

PARAMS = {"has_delivery": "true"}


def _nationwide(db, name, excluded=None, delivery_cities=None):
    """A business that delivers nationwide. Holds delivery_areas rows only
    when delivery_cities is passed (the 'both' case)."""
    producer = make_producer(db, name=name, delivery_cities=delivery_cities)
    producer.offers_delivery = True
    producer.delivery_nationwide = True
    producer.delivery_excluded_cities = excluded or []
    db.commit()
    return producer


def _names(resp):
    return [p["name"] for p in resp.json()]


def test_nationwide_only_matches(client, db):
    """The bug case: nationwide, zero delivery_areas rows."""
    _nationwide(db, "ארצי בלי שורות")

    resp = client.get("/producers", params=PARAMS)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["ארצי בלי שורות"]


def test_areas_only_still_matches(client, db):
    """Regression control — passes before AND after the fix."""
    make_producer(db, name="משלוחי חיפה", delivery_cities=["חיפה"])

    resp = client.get("/producers", params=PARAMS)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["משלוחי חיפה"]


def test_neither_is_excluded(client, db):
    """Regression control — a pickup-only business must stay out."""
    make_producer(db, name="איסוף עצמי בלבד")

    resp = client.get("/producers", params=PARAMS)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == []


def test_both_nationwide_and_areas_yields_one_row(client, db):
    """Two OR-ed EXISTS/flag predicates, never a JOIN — so a business
    satisfying both must not fan out into duplicate rows."""
    _nationwide(db, "ארצי וגם אזורים", delivery_cities=["חיפה", "עכו"])

    resp = client.get("/producers", params=PARAMS)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["ארצי וגם אזורים"]
    assert resp.headers["X-Total-Count"] == "1"


def test_nationwide_with_exclusions_still_matches(client, db):
    """has_delivery asks 'delivers at all', not 'delivers to city X' — a
    non-empty exclusion list does not make a nationwide business stop
    delivering, so it still matches (unlike ?delivery_city=<excluded>)."""
    _nationwide(db, "ארצי חוץ מאילת", excluded=["אילת"])

    resp = client.get("/producers", params=PARAMS)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["ארצי חוץ מאילת"]


def test_count_header_agrees_for_nationwide(client, db):
    """count_q must carry the identical condition — a page that shows three
    businesses while the header says one is the drift this guards."""
    _nationwide(db, "ארצי א")
    _nationwide(db, "ארצי ב")
    make_producer(db, name="משלוחי חיפה", delivery_cities=["חיפה"])
    make_producer(db, name="איסוף עצמי בלבד")

    resp = client.get("/producers", params=PARAMS)
    assert resp.status_code == 200, resp.text
    assert set(_names(resp)) == {"ארצי א", "ארצי ב", "משלוחי חיפה"}
    assert resp.headers["X-Total-Count"] == "3"
