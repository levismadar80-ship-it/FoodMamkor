"""
Tests for MEH-213: Business location types + cities autocomplete.

Coverage:
- GET /cities?q= returns prefix-matched results
- PUT /admin/producers/:id rejects both-false location mode → 422
- PUT /admin/producers/:id rejects nationwide + cities together → 422
- GET /producers with lat/lng/radius_km excludes delivery-only producers
"""
import pytest

from app.models.models import City, Producer
from conftest import auth_header, make_producer, make_user


@pytest.fixture
def admin(db):
    return make_user(db, role="admin")


# ---------- GET /cities ----------

class TestCitiesEndpoint:
    def test_returns_prefix_matches(self, client, db):
        db.add(City(name_he="תל אביב"))
        db.add(City(name_he="תל מונד"))
        db.add(City(name_he="חיפה"))
        db.commit()

        resp = client.get("/cities?q=תל")
        assert resp.status_code == 200
        cities = resp.json()
        assert "תל אביב" in cities
        assert "תל מונד" in cities
        assert "חיפה" not in cities

    def test_no_query_returns_up_to_20(self, client, db):
        for i in range(25):
            db.add(City(name_he=f"עיר{i:02d}"))
        db.commit()

        resp = client.get("/cities")
        assert resp.status_code == 200
        assert len(resp.json()) <= 20

    def test_empty_result_for_unknown_prefix(self, client, db):
        db.add(City(name_he="חיפה"))
        db.commit()

        resp = client.get("/cities?q=אבגדה")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------- Validation: both booleans false ----------

class TestLocationModeValidation:
    def _base_payload(self):
        return {
            "name": "מאפייה גדולה",
            "city": "חיפה",
            "has_physical_location": False,
            "offers_delivery": False,
        }

    def test_both_false_rejected_on_create(self, client, db, admin):
        resp = client.post(
            "/admin/producers",
            json=self._base_payload(),
            headers=auth_header(admin),
        )
        assert resp.status_code == 422

    def test_both_false_rejected_on_update(self, client, db, admin):
        p = make_producer(db)
        resp = client.put(
            f"/admin/producers/{p.id}",
            json={"has_physical_location": False, "offers_delivery": False},
            headers=auth_header(admin),
        )
        assert resp.status_code == 422

    def test_delivery_only_accepted(self, client, db, admin):
        payload = {
            "name": "שליח בלבד",
            "city": "תל אביב",
            "has_physical_location": False,
            "offers_delivery": True,
            "delivery_nationwide": True,
        }
        resp = client.post("/admin/producers", json=payload, headers=auth_header(admin))
        assert resp.status_code == 201
        body = resp.json()
        assert body["has_physical_location"] is False
        assert body["offers_delivery"] is True


# ---------- Validation: nationwide XOR cities ----------

class TestNationwideXorCities:
    def test_nationwide_and_cities_rejected_on_update(self, client, db, admin):
        p = make_producer(db)
        resp = client.put(
            f"/admin/producers/{p.id}",
            json={
                "offers_delivery": True,
                "delivery_nationwide": True,
                "delivery_cities": ["תל אביב", "חיפה"],
            },
            headers=auth_header(admin),
        )
        assert resp.status_code == 422

    def test_nationwide_only_accepted(self, client, db, admin):
        p = make_producer(db)
        resp = client.put(
            f"/admin/producers/{p.id}",
            json={"offers_delivery": True, "delivery_nationwide": True, "delivery_cities": []},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        assert resp.json()["delivery_nationwide"] is True

    def test_city_list_only_accepted(self, client, db, admin):
        p = make_producer(db)
        resp = client.put(
            f"/admin/producers/{p.id}",
            json={
                "offers_delivery": True,
                "delivery_nationwide": False,
                "delivery_cities": ["ירושלים"],
            },
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        assert "ירושלים" in resp.json()["delivery_cities"]


# ---------- Geo-search excludes delivery-only ----------

class TestGeoSearchExcludesDeliveryOnly:
    def _make_delivery_only(self, db):
        p = Producer(
            name="משלוחים בלבד",
            description="",
            city="תל אביב",
            lat=32.0853,
            lng=34.7818,
            status="approved",
            is_verified=True,
            has_physical_location=False,
            offers_delivery=True,
            delivery_nationwide=True,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p

    def test_delivery_only_excluded_from_geo_results(self, client, db):
        physical = make_producer(db, name="חנות פיזית", city="תל אביב")
        delivery = self._make_delivery_only(db)

        # Search at the same coords — both producers sit at (32.0853, 34.7818).
        resp = client.get(
            "/producers",
            params={"lat": 32.0853, "lng": 34.7818, "radius_km": 10},
        )
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()["producers"]]
        assert physical.id in ids, "Physical producer should appear in geo results"
        assert delivery.id not in ids, "Delivery-only producer must be excluded from geo results"

    def test_delivery_only_appears_in_non_geo_list(self, client, db):
        self._make_delivery_only(db)

        resp = client.get("/producers")
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()["producers"]]
        # Delivery-only should be visible in the regular non-geo listing.
        assert len(ids) > 0
