"""MEH-1343 Chunk A: the cities TABLE is the canonical /cities source.

Seeded env (any City rows): table ∪ live producer/delivery cities, static
list suppressed. Unseeded env: MEH-1349 static fallback (covered by
tests/test_meh1349_cities_canonical.py — unchanged behavior).
"""

from tests.conftest import make_producer


def _seed_official(db, names):
    from app.models.models import City

    for n in names:
        db.add(City(name_he=n))
    db.commit()


def test_seeded_table_serves_small_localities(client, db):
    """The audit's missing localities appear once the table is seeded."""
    _seed_official(db, ["פוריידיס", "ג'סר א-זרקא", "בית חנניה", "ירושלים"])

    r = client.get("/cities", params={"q": "פור"})
    assert r.status_code == 200
    assert "פוריידיס" in r.json()


def test_seeded_table_suppresses_static_fallback(client, db):
    """On a seeded env the static list no longer leaks into results —
    a prefix that matches static-only names returns nothing."""
    _seed_official(db, ["פוריידיס"])

    r = client.get("/cities", params={"q": "תל"})  # static has תל אביב-יפו etc.
    assert r.status_code == 200
    assert r.json() == []


def test_live_producer_city_included_when_seeded(client, db):
    """A pre-normalization free-text producer city outside the official
    dataset still surfaces (round-trippable until Chunk B)."""
    _seed_official(db, ["ירושלים"])
    make_producer(db, name="חוות הבדיקה", city="כפר הבדיקות", status="approved")

    r = client.get("/cities", params={"q": "כפר הבדיקות"})
    assert r.status_code == 200
    assert "כפר הבדיקות" in r.json()


def test_pending_producer_city_excluded(client, db):
    """Only APPROVED producers contribute live cities."""
    _seed_official(db, ["ירושלים"])
    make_producer(db, name="חוות ממתינה", city="כפר ממתין", status="pending")

    r = client.get("/cities", params={"q": "כפר ממתין"})
    assert r.status_code == 200
    assert "כפר ממתין" not in r.json()


def test_delivery_city_included_and_deduped(client, db):
    """Delivery-area cities union in; overlap with the table dedups."""
    _seed_official(db, ["עכו"])
    make_producer(
        db,
        name="חוות משלוחים",
        city="עכו",
        status="approved",
        delivery_cities=["עכו", "כפר יאסיף"],
    )

    r = client.get("/cities", params={"q": "עכו"})
    assert r.status_code == 200
    names = r.json()
    assert names.count("עכו") == 1

    r2 = client.get("/cities", params={"q": "כפר יאסיף"})
    assert "כפר יאסיף" in r2.json()
