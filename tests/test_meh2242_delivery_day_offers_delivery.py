"""
MEH-2242 — the delivery-DAY filter must respect `offers_delivery`, exactly as
the delivery-CITY filter does since MEH-1848.

MEH-1848 established the principle in `producer_listing.py` — "scope alone is
not a delivery promise" — and conjoined `offers_delivery` on the city predicate
and on the has-delivery chip. `_delivery_day_condition` was written under
MEH-1645 with the same shape (an EXISTS over delivery_areas rows) and never
received the conjunct, so `?delivery_days=<day>` surfaced a business whose
owner had switched delivery OFF while stale day rows stayed behind — the very
row the city filter beside it already hid.

WHY EVERY CASE BUILDS ITS OWN PRODUCER: same reason as
tests/test_offers_delivery_conjunct.py — the seed carries no producer in the
conflicting state, so seed-shaped data would pass identically on the fixed and
the broken predicate and discriminate nothing. The contradictory row is
constructed explicitly here.

Discrimination (measured, see the PR body): the two `*_excludes_delivery_off`
cases FAIL against the pre-fix predicate, which returned the conflicted
producer. The control cases pass in both worlds and are labelled as controls —
they guard that the conjunct neither over-filters a delivering business nor
touches the MEH-1645 nationwide / day-less semantics.

REUSES: tests/test_meh1645_delivery_day_filter.py (approved producer + explicit
DeliveryArea rows) · tests/test_offers_delivery_conjunct.py (forcing the flag
back to False after the factory).
"""

from app.models import DeliveryArea
from tests.conftest import make_producer


def _approved(db, name, *, offers_delivery, nationwide=False, areas=()):
    """An approved business with explicit delivery_areas rows and an
    explicit `offers_delivery` — the factory sets the flag from
    `delivery_cities`, so it is forced here on purpose (MEH-1848)."""
    p = make_producer(db, name=name)
    p.status = "approved"
    p.offers_delivery = offers_delivery
    p.delivery_nationwide = nationwide
    for area in areas:
        db.add(DeliveryArea(producer_id=p.id, **area))
    db.commit()
    return p


def _names(resp):
    assert resp.status_code == 200, resp.text
    return {row["name"] for row in resp.json()}


TUESDAY_HAIFA = {"city": "חיפה", "delivery_day": "שלישי"}


# ── the defect ──────────────────────────────────────────────────────────────
def test_day_filter_excludes_delivery_off(client, db):
    """FAILS before the fix: the day row matched regardless of the flag."""
    _approved(db, "משלוחים כבויים", offers_delivery=False, areas=[TUESDAY_HAIFA])
    _approved(db, "משלוחים דולקים", offers_delivery=True, areas=[TUESDAY_HAIFA])

    names = _names(client.get("/producers", params={"delivery_days": "שלישי"}))

    assert "משלוחים דולקים" in names, "control — a delivering business still matches"
    assert "משלוחים כבויים" not in names


def test_day_plus_city_excludes_delivery_off(client, db):
    """FAILS before the fix: with a city the combined predicate REPLACES
    _delivery_city_condition (producer_listing.py, the delivery_days branch),
    so the city's own conjunct no longer protected this path."""
    _approved(db, "כבויים חיפה", offers_delivery=False, areas=[TUESDAY_HAIFA])
    _approved(db, "דולקים חיפה", offers_delivery=True, areas=[TUESDAY_HAIFA])

    names = _names(
        client.get(
            "/producers",
            params={"delivery_city": "חיפה", "delivery_days": "שלישי"},
        )
    )

    assert names == {"דולקים חיפה"}


# ── controls — pass before AND after; not evidence for the change ──────────
def test_control_city_filter_alone_already_hid_the_row(client, db):
    """CONTROL: MEH-1848's city conjunct is the behaviour this ticket copies."""
    _approved(db, "כבויים בעיר", offers_delivery=False, areas=[TUESDAY_HAIFA])
    _approved(db, "דולקים בעיר", offers_delivery=True, areas=[TUESDAY_HAIFA])

    names = _names(client.get("/producers", params={"delivery_city": "חיפה"}))

    assert names == {"דולקים בעיר"}


def test_control_meh1645_semantics_unchanged(client, db):
    """CONTROL: nationwide and day-less rows stay OUT of day filtering even
    with delivery ON (MEH-1645 v1 literal semantics) — the conjunct narrows,
    it never widens."""
    _approved(db, "ארצי בלי שורות", offers_delivery=True, nationwide=True)
    _approved(db, "שורה בלי יום", offers_delivery=True, areas=[{"city": "חיפה"}])
    _approved(db, "שורה עם יום", offers_delivery=True, areas=[TUESDAY_HAIFA])

    names = _names(client.get("/producers", params={"delivery_days": "שלישי"}))

    assert names == {"שורה עם יום"}
