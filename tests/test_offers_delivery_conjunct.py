"""
MEH-1848 — the delivery filters must respect `offers_delivery`.

Both predicates in `producer_listing.py` answered "does this business have
delivery SCOPE?" (a delivery_areas row, or the nationwide flag) and never
consulted the owner's own `offers_delivery` declaration. Nothing in the schema
ties the two together: the only relevant CHECK is
`has_physical_location OR offers_delivery` (models.py:388), which says nothing
about delivery_nationwide or about delivery_areas rows.

So a business that turned delivery OFF while stale scope rows or the nationwide
flag remained was still offered to consumers under the משלוח chip and under
city-delivery search — the site contradicting the owner.

WHY EVERY CASE HERE BUILDS ITS OWN PRODUCER: Phase 0 measured the staging seed
and found ZERO producers in the conflicting state. A test leaning on seed-shaped
data would therefore pass identically on the fixed and the broken code and
discriminate nothing — the "green for two reasons" trap. The contradictory row
has to be constructed explicitly, and each case below does.

Discrimination: cases 1-4 all FAIL against the pre-fix predicates, which
returned the conflicted producer. The two control cases pass in both worlds and
are labelled as controls — they guard that the conjunct did not over-filter, and
are not evidence for the change.
"""

from tests.conftest import make_producer

HAS_DELIVERY = {"has_delivery": "true"}
CITY = {"delivery_city": "חיפה"}


def _conflicted(db, name, *, nationwide=False, cities=None):
    """A business holding delivery SCOPE while declaring it does not deliver.

    make_producer sets offers_delivery=True whenever delivery_cities is passed
    (MEH-1848), so the flag is explicitly forced back to False here — this
    module's whole subject is the row the factory now refuses to mint by
    accident.
    """
    producer = make_producer(db, name=name, delivery_cities=cities)
    producer.offers_delivery = False
    producer.delivery_nationwide = nationwide
    db.commit()
    return producer


def _names(resp):
    return [p["name"] for p in resp.json()]


# ── _has_delivery_condition ────────────────────────────────────────────────
def test_has_delivery_excludes_nationwide_when_delivery_is_off(client, db):
    """Nationwide flag set, delivery declared OFF → must not match the chip."""
    _conflicted(db, "ארצי אבל כבוי", nationwide=True)

    resp = client.get("/producers", params=HAS_DELIVERY)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == []
    assert resp.headers["X-Total-Count"] == "0"


def test_has_delivery_excludes_stale_area_rows_when_delivery_is_off(client, db):
    """The other half of the OR: leftover delivery_areas rows with the flag off.

    Covers the same predicate by its second operand — a fix that only guarded
    the nationwide branch would pass the test above and fail this one.
    """
    _conflicted(db, "אזורים ישנים", cities=["חיפה"])

    resp = client.get("/producers", params=HAS_DELIVERY)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == []


# ── _delivery_city_condition ───────────────────────────────────────────────
def test_delivery_city_excludes_nationwide_when_delivery_is_off(client, db):
    """City search must not surface a nationwide business that stopped delivering."""
    _conflicted(db, "ארצי כבוי", nationwide=True)

    resp = client.get("/producers", params=CITY)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == []


def test_delivery_city_excludes_matching_area_row_when_delivery_is_off(client, db):
    """A delivery_areas row for the searched city, with delivery declared off."""
    _conflicted(db, "חיפה כבוי", cities=["חיפה"])

    resp = client.get("/producers", params=CITY)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == []


# ── controls: pass before AND after, so not evidence for the change ────────
def test_control_has_delivery_still_returns_a_delivering_business(client, db):
    """CONTROL — guards against over-filtering, not evidence of the fix."""
    make_producer(db, name="מוסר באמת", delivery_cities=["חיפה"])

    resp = client.get("/producers", params=HAS_DELIVERY)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["מוסר באמת"]


def test_control_delivery_city_still_returns_a_delivering_business(client, db):
    """CONTROL — the city axis keeps working for a coherent producer."""
    make_producer(db, name="מוסר לחיפה", delivery_cities=["חיפה"])

    resp = client.get("/producers", params=CITY)
    assert resp.status_code == 200, resp.text
    assert _names(resp) == ["מוסר לחיפה"]
