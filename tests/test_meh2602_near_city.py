"""
MEH-2602 — ?near_city=: the map's «סננו לפי עיר».

The map used to send delivery_city, so a business sitting IN the searched city
was hidden unless it also listed that city as a delivery area (staging sweep
29/10: a bakery in בנימינה-גבעת עדה missing from a search for its own city,
while a dairy from elsewhere that delivers there was shown). Sapir's ruling
(30/10): show the businesses located in the city too, and put them first.

Behaviour through the public endpoint only (ADR-032 §3.6). Every test seeds a
business that must be EXCLUDED, so an inert filter cannot pass.

DISCRIMINATION: before this change `near_city` was not a parameter — FastAPI
drops it, the filter is inert, and the far-away business leaks into every
result; the ordering test also fails because nothing put the located business
first. Measured against the pre-2602 tree: 5 failed.
"""

from datetime import datetime, timedelta, timezone

from app.models import ProducerLocation

from tests.conftest import make_producer

CITY = "בנימינה-גבעת עדה"


def _names(resp):
    return [p["name"] for p in resp.json()]


def _seed(db):
    now = datetime.now(timezone.utc)
    # Oldest row: under the default created_at DESC sort it would come LAST.
    local = make_producer(db, name="מאפייה בעיר", city=CITY)
    local.created_at = now - timedelta(days=3)
    deliverer = make_producer(
        db, name="מחלבה שמשלחת", city="חדרה", delivery_cities=[CITY]
    )
    deliverer.created_at = now - timedelta(days=1)
    make_producer(db, name="עסק רחוק", city="אילת")
    db.commit()
    return local, deliverer


def test_located_business_is_returned(client, db):
    _seed(db)
    resp = client.get("/producers", params={"near_city": CITY})
    assert resp.status_code == 200, resp.text
    assert "מאפייה בעיר" in _names(resp)
    assert "עסק רחוק" not in _names(resp)


def test_delivering_business_is_still_returned(client, db):
    _seed(db)
    resp = client.get("/producers", params={"near_city": CITY})
    assert sorted(_names(resp)) == ["מאפייה בעיר", "מחלבה שמשלחת"]
    assert resp.headers["X-Total-Count"] == "2"


def test_located_business_comes_first(client, db):
    _seed(db)
    resp = client.get("/producers", params={"near_city": CITY})
    assert _names(resp) == ["מאפייה בעיר", "מחלבה שמשלחת"]


def test_a_location_row_in_the_city_counts_as_located(client, db):
    _seed(db)
    stall = make_producer(db, name="דוכן בשוק", city="תל אביב")
    # Older than the deliverer, so only the located-first key can put it ahead.
    stall.created_at = datetime.now(timezone.utc) - timedelta(days=5)
    db.add(
        ProducerLocation(
            producer_id=stall.id,
            kind="market_stand",
            city=CITY,
            label="דוכן",
            lat=32.52,
            lng=34.95,
        )
    )
    db.commit()
    resp = client.get("/producers", params={"near_city": CITY})
    names = _names(resp)
    assert "דוכן בשוק" in names
    # Located (via the row) sorts ahead of the delivery-only business.
    assert names.index("דוכן בשוק") < names.index("מחלבה שמשלחת")


def test_city_match_is_case_and_space_tolerant(client, db):
    make_producer(db, name="Farm", city="Haifa")
    make_producer(db, name="Elsewhere", city="Eilat")
    resp = client.get("/producers", params={"near_city": "  haifa "})
    assert _names(resp) == ["Farm"]


def test_control_delivery_city_keeps_its_strict_meaning(client, db):
    """Control: the other callers' delivery_city still means 'delivers to'."""
    _seed(db)
    resp = client.get("/producers", params={"delivery_city": CITY})
    assert _names(resp) == ["מחלבה שמשלחת"]


def test_a_deliverer_with_no_city_sorts_with_the_other_deliverers(client, db):
    """A NULL Producer.city made the located-first key NULL (not FALSE), and
    Postgres sorts NULL last — so a newer city-less deliverer fell behind an
    older one instead of following the chosen sort inside its group."""
    local, deliverer = _seed(db)
    nocity = make_producer(db, name="משלוחים בלבד", city=None, delivery_cities=[CITY])
    nocity.created_at = datetime.now(timezone.utc)
    db.commit()
    resp = client.get("/producers", params={"near_city": CITY})
    assert _names(resp) == ["מאפייה בעיר", "משלוחים בלבד", "מחלבה שמשלחת"]
