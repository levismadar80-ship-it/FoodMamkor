"""MEH-3586 — `GET /rescue/offers/{id}`, the surprise bag's own page.

The list (`GET /rescue/offers`) drops every bag that cannot be reserved. The
page must not: a buyer who opens a shared link to a bag that just sold out
should read «אזל», not «לא נמצא». So this endpoint answers four states, and
404s only for what the list would never show at all (another day's bag, a
test business, a town outside the pilot, a missing id).

Clock basis: same as tests/test_rescue.py — the offer date is seeded through
`israel_today()` (pinned by `rescue_on`), the pickup span with `utc_now()`.
"""

import uuid
from datetime import timedelta

from conftest import make_producer
from test_rescue import _seed_offer, rescue_on, shop  # noqa: F401 — fixtures

# ruff: noqa: F811 — the fixtures imported above are test parameters by name.

from app.models.models import ProducerLocation, RescueTypicalItems
from app.routers import rescue as rescue_module
from app.utils.clock import utc_now


def _get(client, offer_id):
    return client.get(f"/rescue/offers/{offer_id}")


def test_an_available_bag_answers_with_the_page_fields(client, db, rescue_on, shop):
    shop["producer"].avg_rating = 4.6
    shop["producer"].reviews_count = 12
    db.add(
        RescueTypicalItems(
            producer_id=shop["producer"].id,
            items=["לחם", "מאפים"],
            allergens=["gluten"],
        )
    )
    db.commit()
    offer = _seed_offer(db, shop["location"], qty_total=4, qty_left=3)

    res = _get(client, offer.id)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["state"] == "available"
    assert body["qty_left"] == 3
    assert body["typical_items"] == ["לחם", "מאפים"]
    assert body["allergens"] == ["gluten"]
    assert body["lat"] == shop["location"].lat
    assert body["lng"] == shop["location"].lng
    assert body["producer"]["avg_rating"] == 4.6
    assert body["producer"]["reviews_count"] == 12
    assert body["producer"]["location_address"] == "הנביאים 10"


def test_nothing_declared_stays_null_not_an_empty_list(client, db, rescue_on, shop):
    # MEH-2752: «not declared» and «declared none» are different answers.
    offer = _seed_offer(db, shop["location"])
    body = _get(client, offer.id).json()
    assert body["allergens"] is None
    assert body["typical_items"] == []
    assert body["producer"]["avg_rating"] is None
    assert body["producer"]["reviews_count"] == 0


def test_a_sold_out_bag_still_answers_and_says_so(client, db, rescue_on, shop):
    offer = _seed_offer(db, shop["location"], qty_total=2, qty_left=0)
    res = _get(client, offer.id)
    assert res.status_code == 200
    assert res.json()["state"] == "sold_out"
    # …while the public list leaves it out, which is why the page needs this.
    assert [r["id"] for r in client.get("/rescue/offers").json()] == []


def test_a_bag_the_business_cancelled_says_cancelled_even_with_stock(
    client, db, rescue_on, shop
):
    offer = _seed_offer(db, shop["location"], status="cancelled")
    assert _get(client, offer.id).json()["state"] == "cancelled"


def test_a_bag_whose_reservations_closed_says_ended(client, db, rescue_on, shop):
    now = utc_now()
    # Inside the last 15 minutes of the window: reserve would refuse it.
    offer = _seed_offer(
        db,
        shop["location"],
        pickup_start=now - timedelta(hours=2),
        pickup_end=now + timedelta(minutes=10),
        cancel_until=now - timedelta(hours=3),
    )
    assert _get(client, offer.id).json()["state"] == "ended"


def test_yesterdays_bag_is_not_found(client, db, rescue_on, shop, monkeypatch):
    offer = _seed_offer(db, shop["location"])
    # `rescue_on` pinned today in both places; move only the route a day on.
    today = rescue_module.israel_today()
    monkeypatch.setattr(
        rescue_module, "israel_today", lambda: today + timedelta(days=1)
    )
    assert _get(client, offer.id).status_code == 404


def test_a_town_outside_the_pilot_is_not_found(
    client, db, rescue_on, shop, monkeypatch
):
    offer = _seed_offer(db, shop["location"])
    monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("עכו",))
    assert _get(client, offer.id).status_code == 404


def test_a_test_business_is_not_found(client, db, rescue_on, shop):
    shop["producer"].is_test = True
    db.commit()
    offer = _seed_offer(db, shop["location"])
    assert _get(client, offer.id).status_code == 404


def test_an_unapproved_business_is_not_found(client, db, rescue_on):
    producer = make_producer(db, name="ממתין", city="חיפה")
    producer.status = "pending"
    location = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city="חיפה",
        address="הרצל 1",
        lat=32.8,
        lng=35.0,
        location_precision="exact",
    )
    db.add(location)
    db.commit()
    offer = _seed_offer(db, location)
    assert _get(client, offer.id).status_code == 404


def test_an_unknown_id_is_404_with_hebrew_detail(client, rescue_on):
    res = _get(client, uuid.uuid4())
    assert res.status_code == 404
    assert res.json()["detail"] == "הסל הזה לא נמצא"


def test_the_route_is_404_while_the_pilot_is_off(client, db, shop, monkeypatch):
    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: False)
    offer = _seed_offer(db, shop["location"])
    assert _get(client, offer.id).status_code == 404
