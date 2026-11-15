"""MEH-3219 B5 — a vacation whose return date has passed stops hiding the business.

`ProducerResponse` already reports an expired vacation as «מקבל הזמנות»
(schemas.py, MEH-155 / MEH-1883), but the catalog's default-hide rule
(`catalog_default_availability_condition`, producer_listing.py) read only
`availability_state`, so a business whose owner never came back to flip the
switch stayed off the map, the listing, the counter and the cities list
forever. Nothing in the product clears the column on the return date.

Each test compares an expired vacation against an active one on the same
endpoint, so a rule that simply stopped hiding vacations would go red on the
active half and a rule that ignored the date would go red on the expired half.
"""

from datetime import timedelta

from app.services.availability_validation import ON_VACATION
from app.utils.clock import israel_today
from tests.conftest import make_producer


def _on_vacation(db, producer, days_from_today):
    producer.availability_state = ON_VACATION
    producer.vacation_until = israel_today() + timedelta(days=days_from_today)
    db.commit()
    return producer


def _setup(db):
    _on_vacation(db, make_producer(db, name="חזרה אתמול", city="חיפה"), -1)
    _on_vacation(db, make_producer(db, name="חוזרת מחר", city="עכו"), 1)


def test_listing_shows_business_whose_vacation_ended(client, db):
    _setup(db)
    resp = client.get("/producers")
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert "חזרה אתמול" in names
    assert "חוזרת מחר" not in names
    assert resp.headers["x-total-count"] == "1"


def test_count_includes_business_whose_vacation_ended(client, db):
    _setup(db)
    assert client.get("/producers/count").json()["count"] == 1


def test_cities_include_business_whose_vacation_ended(client, db):
    _setup(db)
    body = client.get("/producers/cities").json()
    cities = {c["city"] if isinstance(c, dict) else c for c in body}
    assert "חיפה" in cities
    assert "עכו" not in cities


def test_return_day_itself_still_hidden(client, db):
    """`vacation_until` is the last day away (`<` in schemas.py), so on that
    day the business is still on vacation."""
    _on_vacation(db, make_producer(db, name="חוזרת היום"), 0)
    names = {p["name"] for p in client.get("/producers").json()}
    assert "חוזרת היום" not in names


def test_stats_count_business_whose_vacation_ended(client, db):
    """The home page's «כמה בתי עסק באתר» number (marketing.py /stats)."""
    _setup(db)
    assert client.get("/stats").json()["producers_count"] == 1


def test_random_never_picks_an_active_vacation(client, db):
    """«הפתיעו אותי» draws only from what the catalog shows: with the active
    vacation hidden, the one business it can land on is the one back from
    vacation."""
    _setup(db)
    back = {client.get("/producers/random").json()["id"] for _ in range(8)}
    assert len(back) == 1
    from app.models.models import Producer

    assert db.get(Producer, back.pop()).name == "חזרה אתמול"
