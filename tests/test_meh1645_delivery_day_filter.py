"""
MEH-1645 — GET /producers?delivery_day= consumer filter.

v1 semantics under test (the ticket's הכרעה): only EXPLICIT delivery_areas
rows with a matching day count — nationwide producers and day-less rows
("בתיאום מראש") are EXCLUDED from day filtering, even though both match the
plain delivery_city filter. With a city, the city and the day must match on
the SAME row (single EXISTS): a producer whose חיפה row is day-less and whose
עכו row is on שישי must NOT match חיפה+שישי.

REUSES: tests/test_delivery_cities_filter.py (approved-producer + delivery
area fixture pattern) · tests/test_meh1644_delivery_day.py (vocabulary pins).
"""
from datetime import datetime

from app.models import DeliveryArea
from tests.conftest import make_producer


def _approved(db, name, *, nationwide=False, areas=()):
    p = make_producer(db, name=name)
    p.status = "approved"
    p.offers_delivery = True
    p.delivery_nationwide = nationwide
    for area in areas:
        db.add(DeliveryArea(producer_id=p.id, **area))
    db.commit()
    return p


def _ids(resp):
    return {row["name"] for row in resp.json()}


def test_day_only_matches_explicit_rows(client, db):
    _approved(db, "שישי בלבד", areas=[{"city": "חיפה", "delivery_day": "שישי"}])
    _approved(db, "שלישי בלבד", areas=[{"city": "חיפה", "delivery_day": "שלישי"}])
    _approved(db, "בלי יום", areas=[{"city": "חיפה"}])
    resp = client.get("/producers", params={"delivery_day": "שישי"})
    assert resp.status_code == 200, resp.text
    names = _ids(resp)
    assert "שישי בלבד" in names
    assert "שלישי בלבד" not in names
    assert "בלי יום" not in names


def test_day_plus_city_same_row_semantics(client, db):
    # City matches on a day-less row, day matches on ANOTHER city's row —
    # must NOT match (the single-EXISTS requirement).
    _approved(
        db,
        "שורות שונות",
        areas=[
            {"city": "חיפה"},  # day-less
            {"city": "עכו", "delivery_day": "שישי"},
        ],
    )
    _approved(
        db,
        "שורה תואמת",
        areas=[{"city": "חיפה", "delivery_day": "שישי", "min_order": 100}],
    )
    resp = client.get(
        "/producers", params={"delivery_city": "חיפה", "delivery_day": "שישי"}
    )
    assert resp.status_code == 200, resp.text
    names = _ids(resp)
    assert names == {"שורה תואמת"}


def test_nationwide_excluded_from_day_filter(client, db):
    _approved(db, "כל הארץ", nationwide=True)
    # Sanity: nationwide DOES match the plain city filter (MEH-1255)…
    plain = client.get("/producers", params={"delivery_city": "חיפה"})
    assert "כל הארץ" in _ids(plain)
    # …but never the day filter (v1: no explicit row = no day promise).
    day_only = client.get("/producers", params={"delivery_day": "שישי"})
    assert "כל הארץ" not in _ids(day_only)
    with_city = client.get(
        "/producers", params={"delivery_city": "חיפה", "delivery_day": "שישי"}
    )
    assert "כל הארץ" not in _ids(with_city)


def test_invalid_day_value_422(client, db):
    for bad in ("friday", "ימי שישי", "יום שישי", "abc"):
        resp = client.get("/producers", params={"delivery_day": bad})
        assert resp.status_code == 422, f"{bad!r}: {resp.status_code}"


def test_day_filter_composes_with_other_filters(client, db):
    p = _approved(db, "מאומת עם יום", areas=[{"city": "חיפה", "delivery_day": "רביעי"}])
    # MEH-766: ?verified matches document-verified producers (verified_at),
    # not the dropped is_verified boolean.
    p.verified_at = datetime.utcnow()
    db.commit()
    _approved(db, "לא מאומת עם יום", areas=[{"city": "חיפה", "delivery_day": "רביעי"}])
    resp = client.get(
        "/producers", params={"delivery_day": "רביעי", "verified": True}
    )
    assert resp.status_code == 200, resp.text
    assert _ids(resp) == {"מאומת עם יום"}
