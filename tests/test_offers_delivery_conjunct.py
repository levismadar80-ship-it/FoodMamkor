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

import pytest
from sqlalchemy.exc import IntegrityError

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
def test_nationwide_with_delivery_off_is_now_unconstructible(db):
    """SUPERSEDED BY MEH-1849 — the nationwide half is no longer a query concern.

    This was `test_has_delivery_excludes_nationwide_when_delivery_is_off`: it
    built a nationwide business with delivery declared OFF and asserted the
    chip did not return it. MEH-1849 added CHECK
    `producer_nationwide_requires_delivery`, so that row can no longer be
    written at all and the old fixture raises IntegrityError before reaching
    the endpoint.

    The test is kept, inverted, rather than deleted. Deleting it would leave no
    record that this state was once reachable, and the assertion it makes now
    is strictly stronger: not "the query hides the contradiction" but "the
    contradiction cannot exist". The query-side conjunct in
    `_has_delivery_condition` stays as defence in depth — it is simply no
    longer independently exercisable through a constructible fixture, because
    every fixture that would exercise it is now rejected by the database.

    The AREAS half below is untouched and still constructs its row: a CHECK
    cannot span tables, so "delivery_areas rows + offers_delivery=false"
    remains query-enforced only. That is the case still worth guarding, and it
    is the reason this module survives.

    Full DB-layer coverage: tests/test_nationwide_requires_delivery.py.
    """
    with pytest.raises(IntegrityError) as exc:
        _conflicted(db, "ארצי אבל כבוי", nationwide=True)

    assert "producer_nationwide_requires_delivery" in str(exc.value)
    db.rollback()


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
# The city-axis twin of the nationwide case, `test_delivery_city_excludes_
# nationwide_when_delivery_is_off`, was removed under MEH-1849 for the same
# reason as its has_delivery sibling above: its fixture is now rejected by
# CHECK producer_nationwide_requires_delivery, so it asserted a state the
# database no longer permits. One inverted test (above) records that, rather
# than two identical IntegrityError assertions. The city axis keeps its
# constructible case — the delivery_areas one, immediately below.


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
