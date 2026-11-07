"""MEH-2790 — ``GET /producers?cities=a&cities=b``.

The category x region landing pages need "businesses in this region", and a
region is 7 to 18 towns while ``city`` takes exactly one. This is the list
form: OR over ``_located_in_city_condition`` — the business IS there, by its
own city OR by any of its location rows — AND-ed with everything else.

DISCRIMINATION — each case fails against a plausible wrong implementation:
  * ``test_ors_across_cities`` — an AND would return nothing, since no
    business is in two towns at once.
  * ``test_location_row_counts`` — a filter on ``Producer.city`` alone (the
    cheap reading) misses the market-stall business entirely. This is the
    case that separates this filter from the ``city`` one, and it is also why
    ``GET /producers/cities`` cannot be used to pre-count these pages: it
    groups by ``Producer.city`` and never sees the stall.
  * ``test_combines_with_category`` — an OR against category would widen the
    result instead of narrowing it.
  * ``test_total_count_header_matches`` — a filter applied to the row query
    but not the count query is the MEH-23 trap; the header would over-report
    and the landing-page gate reads that header.
  * ``test_over_the_cap_is_422`` — a silent truncation would under-count a
    region and 404 a page that should exist.
  * ``test_absent_param_is_unchanged`` — the regression guard.
"""

from __future__ import annotations

from app.models import ProducerLocation
from app.services.producer_listing import MAX_CITIES_PER_QUERY
from tests.conftest import make_category, make_producer

HAIFA = "חיפה"
KRAYOT = "קריית ביאליק"
TEL_AVIV = "תל אביב"


def _names(client, params):
    res = client.get("/producers", params=params)
    assert res.status_code == 200, res.text
    return res, [p["name"] for p in res.json()]


class TestCitiesFilter:
    def test_ors_across_cities(self, db, client):
        make_producer(db, name="מאפייה בחיפה", city=HAIFA)
        make_producer(db, name="מאפייה בקריות", city=KRAYOT)
        make_producer(db, name="מאפייה בתל אביב", city=TEL_AVIV)
        db.commit()

        _res, names = _names(client, [("cities", HAIFA), ("cities", KRAYOT)])

        assert sorted(names) == sorted(["מאפייה בחיפה", "מאפייה בקריות"]), (
            "an AND would have returned nothing — no business is in two towns"
        )

    def test_location_row_counts(self, db, client):
        """The case that separates `cities` from `city`."""
        stall = make_producer(db, name="דוכן בשוק", city=TEL_AVIV)
        db.add(
            ProducerLocation(
                producer_id=stall.id,
                kind="market_stand",
                city=HAIFA,
                lat=32.794,
                lng=34.989,
                is_primary=False,
            )
        )
        db.commit()

        _res, names = _names(client, [("cities", HAIFA)])
        assert "דוכן בשוק" in names, (
            "a business whose stall is in the city belongs on that city's page; "
            "filtering on Producer.city alone would miss it"
        )

        # ...and the narrow `city` filter does NOT see it. This asymmetry is
        # the whole reason GET /producers/cities cannot pre-count these pages.
        _res2, narrow = _names(client, {"city": HAIFA})
        assert "דוכן בשוק" not in narrow

    def test_combines_with_category(self, db, client):
        bread = make_category(db, name="לחמים ואפייה")
        other = make_category(db, name="גבינות")
        make_producer(db, name="לחם בחיפה", city=HAIFA, category=bread)
        make_producer(db, name="גבינה בחיפה", city=HAIFA, category=other)
        make_producer(db, name="לחם בתל אביב", city=TEL_AVIV, category=bread)
        db.commit()

        _res, names = _names(
            client, [("cities", HAIFA), ("category", str(bread.id))]
        )
        assert names == ["לחם בחיפה"], (
            "category must AND with cities, not widen it"
        )

    def test_total_count_header_matches(self, db, client):
        for i in range(3):
            make_producer(db, name=f"עסק {i}", city=HAIFA)
        make_producer(db, name="רחוק", city=TEL_AVIV)
        db.commit()

        res, names = _names(client, [("cities", HAIFA), ("limit", "1")])
        assert len(names) == 1, "limit still applies"
        assert res.headers["X-Total-Count"] == "3", (
            "the landing-page gate reads this header; a filter applied to the "
            "rows but not the count would over-report and open a page that "
            "does not have the businesses it claims"
        )

    def test_over_the_cap_is_422(self, db, client):
        too_many = [("cities", f"עיר {i}") for i in range(MAX_CITIES_PER_QUERY + 1)]
        res = client.get("/producers", params=too_many)
        assert res.status_code == 422, (
            "silently truncating would under-count a region and 404 a page "
            "that should exist"
        )

    def test_at_the_cap_is_accepted(self, db, client):
        make_producer(db, name="בדיוק בגבול", city=HAIFA)
        db.commit()
        at_cap = [("cities", f"עיר {i}") for i in range(MAX_CITIES_PER_QUERY - 1)]
        at_cap.append(("cities", HAIFA))
        res = client.get("/producers", params=at_cap)
        assert res.status_code == 200
        assert [p["name"] for p in res.json()] == ["בדיוק בגבול"]

    def test_absent_param_is_unchanged(self, db, client):
        make_producer(db, name="א", city=HAIFA)
        make_producer(db, name="ב", city=TEL_AVIV)
        db.commit()

        _res, without = _names(client, {})
        assert sorted(without) == ["א", "ב"], (
            "no cities param must leave the listing byte-identical"
        )

    def test_blank_entries_are_ignored(self, db, client):
        make_producer(db, name="בחיפה", city=HAIFA)
        db.commit()
        _res, names = _names(client, [("cities", ""), ("cities", HAIFA)])
        assert names == ["בחיפה"]
