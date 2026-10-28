"""
Module:   test_meh2480_city_centroid
Purpose:  A business that gives only a town still obtains a usable, approximate
          map point from the seeded `cities` table — at registration and at
          both owner location write paths — and that point is enough for the
          submission gate. Also pins what must NOT change: explicit coordinates
          win, an unknown town yields nothing, delivery-only stays pinless.
Related:  backend/app/services/city_centroid.py
          backend/app/services/producer_queries.py (create_primary_branch_location)
          backend/app/routers/producer_me.py (create/update location)
          backend/app/services/submission_gate.py (the consumer that must pass)
History:  MEH-2480 (creation) — 28/10/2026 Google Places answered 403 for every
          lookup and «שליחה לבדיקה» was unreachable for every new business.
"""

from app.models import City, Producer, ProducerLocation, User
from app.services.city_centroid import city_centroid
from app.services.submission_gate import MISSING_LOCATION, submission_missing_items
from tests.conftest import auth_header, make_category, make_producer, make_user

SAFE_PASSWORD = "Zx7Yp9Mq2Lr4"
TLV = ("תל אביב-יפו", 32.0853, 34.7818)
HAIFA = ("חיפה", 32.7940, 34.9896)


def _seed_cities(db, *rows):
    for name, lat, lng in rows:
        db.add(City(name_he=name, lat=lat, lng=lng))
    db.commit()


def _register_body(db, **overrides) -> dict:
    cat = make_category(db, name=f"קטגוריה-{overrides.get('email', 'x')}")
    base = {
        "producer_name": "חוות הבדיקה",
        "category_ids": [cat.id],
        "primary_contact_method": "whatsapp",
        "phone": "0501234567",
        "declaration_accepted": True,
        "terms_accepted": True,
    }
    return {**base, **overrides}


def _locations_of(db, producer_id) -> list[ProducerLocation]:
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .all()
    )


def _producer_user(db):
    producer = make_producer(db, name="חוות המיקומים")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


# --- the helper itself -------------------------------------------------------


class TestCityCentroid:
    def test_exact_spelling_resolves(self, db):
        _seed_cities(db, TLV)
        assert city_centroid(db, "תל אביב-יפו") == (TLV[1], TLV[2])

    def test_variant_spelling_resolves_through_city_key(self, db):
        # The MEH-2456 pair: the registration list and the table disagree on
        # the hyphen's spacing. One must find the other.
        _seed_cities(db, TLV)
        assert city_centroid(db, "תל אביב - יפו") == (TLV[1], TLV[2])

    def test_unknown_blank_and_coordless_towns_yield_none(self, db):
        _seed_cities(db, TLV)
        db.add(City(name_he="יישוב בלי מיקום", lat=None, lng=None))
        db.commit()
        assert city_centroid(db, "עיר שלא קיימת") is None
        assert city_centroid(db, "") is None
        assert city_centroid(db, None) is None
        assert city_centroid(db, "יישוב בלי מיקום") is None


# --- registration ------------------------------------------------------------


class TestRegistrationTownOnly:
    def test_town_only_creates_an_approximate_primary_branch(self, client, db):
        _seed_cities(db, TLV)
        consumer = make_user(db, email="townonly@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_register_body(db, email="townonly@example.com", city=TLV[0]),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()

        db.refresh(consumer)
        rows = _locations_of(db, consumer.producer_id)
        assert len(rows) == 1
        loc = rows[0]
        assert loc.kind == "branch"
        assert loc.is_primary is True
        assert loc.location_precision == "approximate"
        assert (loc.lat, loc.lng) == (TLV[1], TLV[2])

        # The producer columns the map and cards still read are filled too.
        producer = db.query(Producer).filter(Producer.id == consumer.producer_id).one()
        assert (producer.lat, producer.lng) == (TLV[1], TLV[2])

    def test_town_only_passes_the_location_requirement(self, client, db):
        # The reason this ticket exists: the gate must stop naming `location`
        # for a town-only business. Other requirements may still be missing.
        _seed_cities(db, TLV)
        consumer = make_user(db, email="gate@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_register_body(db, email="gate@example.com", city=TLV[0]),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()
        db.refresh(consumer)
        producer = db.query(Producer).filter(Producer.id == consumer.producer_id).one()
        assert MISSING_LOCATION not in submission_missing_items(producer)

    def test_geocoded_coordinates_stay_exact_and_untouched(self, client, db):
        _seed_cities(db, TLV)
        consumer = make_user(db, email="exact@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_register_body(
                db, email="exact@example.com", city=TLV[0], lat=32.0700, lng=34.7900
            ),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()
        db.refresh(consumer)
        (loc,) = _locations_of(db, consumer.producer_id)
        assert loc.location_precision == "exact"
        assert (loc.lat, loc.lng) == (32.0700, 34.7900)

    def test_unknown_town_still_creates_no_row(self, client, db):
        # Today's behaviour, preserved: nothing to place it with, nothing placed.
        _seed_cities(db, TLV)
        consumer = make_user(db, email="unknown@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_register_body(db, email="unknown@example.com", city="כפר שאינו בטבלה"),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()
        db.refresh(consumer)
        assert _locations_of(db, consumer.producer_id) == []

    def test_delivery_only_business_gets_no_pin(self, client, db):
        # MEH-213: no physical presence means no point, however well we know
        # the town. Its location signal is the delivery declaration.
        _seed_cities(db, TLV)
        consumer = make_user(db, email="delivery@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_register_body(
                db,
                email="delivery@example.com",
                city=TLV[0],
                has_physical_location=False,
                offers_delivery=True,
                delivery_nationwide=True,
            ),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()
        db.refresh(consumer)
        assert _locations_of(db, consumer.producer_id) == []


# --- owner dashboard ---------------------------------------------------------


class TestOwnerLocationsTownOnly:
    def test_create_with_town_only_is_pinned_approximately(self, client, db):
        _seed_cities(db, HAIFA)
        user, _ = _producer_user(db)
        resp = client.post(
            "/producers/me/locations",
            json={"kind": "branch", "label": None, "city": HAIFA[0]},
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.json()
        body = resp.json()
        assert (body["lat"], body["lng"]) == (HAIFA[1], HAIFA[2])
        assert body["location_precision"] == "approximate"

    def test_create_with_explicit_coordinates_keeps_them(self, client, db):
        _seed_cities(db, HAIFA)
        user, _ = _producer_user(db)
        resp = client.post(
            "/producers/me/locations",
            json={"kind": "branch", "label": None, "city": HAIFA[0], "lat": 32.80, "lng": 34.99},
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.json()
        body = resp.json()
        assert (body["lat"], body["lng"]) == (32.80, 34.99)
        assert body["location_precision"] == "exact"

    def test_update_that_clears_coordinates_falls_back_to_the_town(self, client, db):
        _seed_cities(db, HAIFA, TLV)
        user, _ = _producer_user(db)
        created = client.post(
            "/producers/me/locations",
            json={"kind": "branch", "label": None, "city": HAIFA[0], "lat": 32.80, "lng": 34.99},
            headers=auth_header(user),
        ).json()
        resp = client.put(
            f"/producers/me/locations/{created['id']}",
            json={"city": TLV[0], "lat": None, "lng": None},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.json()
        body = resp.json()
        assert (body["lat"], body["lng"]) == (TLV[1], TLV[2])
        assert body["location_precision"] == "approximate"

    def test_unknown_town_leaves_the_row_as_submitted(self, client, db):
        user, _ = _producer_user(db)
        resp = client.post(
            "/producers/me/locations",
            json={"kind": "branch", "label": None, "city": "כפר שאינו בטבלה"},
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.json()
        body = resp.json()
        assert body["lat"] is None and body["lng"] is None
        assert body["location_precision"] == "exact"
