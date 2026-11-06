"""MEH-2752 — per-business allergens on the surprise bag.

THE DISTINCTION THIS FILE EXISTS FOR is NULL vs []:
  NULL = the business filled nothing → the card says so and tells the buyer
         to ask before pickup.
  []   = "this bag contains none of the 14 major allergens" — a food-safety
         CLAIM. Nobody made it, so it must never reach the database.
Every test below is about keeping those two apart. A single `or []` anywhere
on the write path collapses them, and the card would then silently promise
something no business said.

Before this ticket the card showed ONE fixed sentence to everyone
(«ייתכנו גלוטן, חלב, אגוזים ושומשום»), which warned about allergens that may
not be in the bag and stayed silent about ones that are.
"""

from datetime import timedelta

import pytest
from conftest import auth_header, make_producer, make_user

from app.allergens import ALLERGEN_CODES
from app.models.models import ProducerLocation, RescueOffer, RescueTypicalItems
from app.routers import rescue as rescue_module
from app.utils.clock import israel_today, utc_now


@pytest.fixture
def rescue_on(monkeypatch):
    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
    monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))
    return True


@pytest.fixture
def shop(db):
    producer = make_producer(db, name="מאפיית האלרגנים", city="חיפה")
    owner = make_user(db, email="allergen-owner@example.com", role="producer")
    owner.producer_id = producer.id
    owner.is_producer = True
    location = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city="חיפה",
        address="הנביאים 10",
        lat=32.7940,
        lng=34.9896,
        location_precision="exact",
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    return {"producer": producer, "owner": owner, "location": location}


def _row(db, producer_id):
    return (
        db.query(RescueTypicalItems)
        .filter(RescueTypicalItems.producer_id == producer_id)
        .first()
    )


class TestDeclaringAllergens:
    def test_a_filled_declaration_round_trips(self, client, db, shop, rescue_on):
        headers = auth_header(shop["owner"])
        r = client.put(
            "/producers/me/rescue/typical-items",
            json={"items": ["לחם"], "allergens": ["sesame", "gluten"]},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        # Canonical order, not input order: gluten precedes sesame in
        # ALLERGEN_CODES, and one order keeps the bag and the product sheet
        # reading the same way.
        assert r.json()["allergens"] == ["gluten", "sesame"]
        assert client.get("/producers/me/rescue/typical-items", headers=headers).json()[
            "allergens"
        ] == ["gluten", "sesame"]

    def test_nothing_declared_is_NULL_not_an_empty_list(
        self, client, db, shop, rescue_on
    ):
        headers = auth_header(shop["owner"])
        client.put(
            "/producers/me/rescue/typical-items",
            json={"items": ["לחם"]},
            headers=headers,
        )
        assert (
            client.get("/producers/me/rescue/typical-items", headers=headers).json()[
                "allergens"
            ]
            is None
        )
        # At the DATABASE, not just in the response — an [] stored here would
        # be read by any future consumer as "declared none".
        assert _row(db, shop["producer"].id).allergens is None

    def test_an_explicit_empty_list_is_stored_as_NULL(
        self, client, db, shop, rescue_on
    ):
        """The case a careless `or []` would get wrong.

        Sending [] is the UI's state for "the owner ticked nothing". It must
        land as NULL, because [] would mean "contains none of the 14" — a
        claim about food that the owner did not make by ticking nothing.
        """
        headers = auth_header(shop["owner"])
        r = client.put(
            "/producers/me/rescue/typical-items",
            json={"items": ["לחם"], "allergens": []},
            headers=headers,
        )
        assert r.status_code == 200
        assert r.json()["allergens"] is None
        assert _row(db, shop["producer"].id).allergens is None

    def test_clearing_a_previous_declaration_sets_NULL(
        self, client, db, shop, rescue_on
    ):
        headers = auth_header(shop["owner"])
        client.put(
            "/producers/me/rescue/typical-items",
            json={"items": [], "allergens": ["milk"]},
            headers=headers,
        )
        assert _row(db, shop["producer"].id).allergens == ["milk"]  # control
        client.put(
            "/producers/me/rescue/typical-items",
            json={"items": [], "allergens": []},
            headers=headers,
        )
        db.expire_all()
        assert _row(db, shop["producer"].id).allergens is None

    def test_an_unknown_code_is_refused_with_422_not_dropped(
        self, client, db, shop, rescue_on
    ):
        """Silently dropping a typo would leave the owner believing she
        declared an allergen she did not."""
        r = client.put(
            "/producers/me/rescue/typical-items",
            json={"items": [], "allergens": ["gluten", "peanutz"]},
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 422
        assert "peanutz" in r.text
        # Nothing was written — not even the valid half.
        assert _row(db, shop["producer"].id) is None

    def test_every_code_in_the_shared_list_is_accepted(
        self, client, db, shop, rescue_on
    ):
        """Control for the test above: the 422 is about the unknown code, not
        about the field rejecting everything."""
        r = client.put(
            "/producers/me/rescue/typical-items",
            json={"items": [], "allergens": list(ALLERGEN_CODES)},
            headers=auth_header(shop["owner"]),
        )
        assert r.status_code == 200
        assert r.json()["allergens"] == list(ALLERGEN_CODES)

    def test_duplicates_collapse(self, client, db, shop, rescue_on):
        r = client.put(
            "/producers/me/rescue/typical-items",
            json={"items": [], "allergens": ["milk", "milk", "gluten"]},
            headers=auth_header(shop["owner"]),
        )
        assert r.json()["allergens"] == ["gluten", "milk"]


class TestThePublicBag:
    def _offer(self, db, location):
        now = utc_now()
        offer = RescueOffer(
            producer_location_id=location.id,
            date=israel_today(),
            qty_total=3,
            qty_left=3,
            price_agorot=1500,
            pickup_start=now + timedelta(hours=1),
            pickup_end=now + timedelta(hours=3),
            cancel_until=now + timedelta(minutes=30),
            status="active",
        )
        db.add(offer)
        db.commit()
        return offer

    def test_the_declaration_reaches_the_public_card(self, client, db, shop, rescue_on):
        db.add(
            RescueTypicalItems(
                producer_id=shop["producer"].id,
                items=["לחם"],
                allergens=["gluten", "sesame"],
            )
        )
        db.commit()
        self._offer(db, shop["location"])
        row = client.get("/rescue/offers").json()[0]
        assert row["allergens"] == ["gluten", "sesame"]
        assert row["typical_items"] == ["לחם"]

    def test_an_undeclared_bag_sends_null_not_an_empty_list(
        self, client, db, shop, rescue_on
    ):
        """The card branches on this exact value, so it must survive the wire
        as null rather than arriving as []."""
        db.add(RescueTypicalItems(producer_id=shop["producer"].id, items=["לחם"]))
        db.commit()
        self._offer(db, shop["location"])
        row = client.get("/rescue/offers").json()[0]
        assert row["allergens"] is None

    def test_a_business_with_no_typical_items_row_at_all_also_sends_null(
        self, client, db, shop, rescue_on
    ):
        self._offer(db, shop["location"])
        row = client.get("/rescue/offers").json()[0]
        assert row["allergens"] is None
        assert row["typical_items"] == []
