"""
Module:   test_meh2669_city_centroid_bundled
Purpose:  The town-centre fallback (MEH-2480) works on a database whose
          `cities` rows carry no coordinates — which is every real one: the
          data.gov.il seed has none. The bundled app/data/city_coordinates.json
          fills the gap; a row that does carry coordinates still wins; places
          whose geocode was wrong are absent rather than pinned elsewhere.
Related:  backend/app/services/city_centroid.py
          backend/app/data/city_coordinates.json
          tests/test_meh2480_city_centroid.py (the DB-row behaviour, unchanged)
History:  MEH-2669 (creation) — staging 05/11: city_centroid returned None for
          every town, so a location saved without a Google suggestion had no
          point and «שליחה לבדיקה» stayed locked.
"""

import json
from collections import defaultdict
from pathlib import Path

from app.models import Producer, ProducerLocation
from app.models.models import City
from app.services.city_centroid import city_centroid
from app.services.submission_gate import MISSING_LOCATION, submission_missing_items
from tests.conftest import auth_header, make_category, make_user

DATA = (
    Path(__file__).resolve().parent.parent
    / "backend"
    / "app"
    / "data"
    / "city_coordinates.json"
)


def _near(point, lat, lng, tol=0.05):
    assert point is not None, "expected a centroid, got None"
    assert abs(point[0] - lat) < tol and abs(point[1] - lng) < tol, point


class TestBundledFallback:
    def test_town_with_no_row_resolves_from_the_file(self, db):
        assert db.query(City).count() == 0
        _near(city_centroid(db, "זכרון יעקב"), 32.571, 34.953)
        _near(city_centroid(db, "חיפה"), 32.819, 34.998)

    def test_variant_spelling_reaches_the_file_through_city_key(self, db):
        # The file spells «תל אביב - יפו»; the site's chips spell «תל אביב-יפו».
        _near(city_centroid(db, "תל אביב-יפו"), 32.085, 34.782)

    def test_row_without_coordinates_falls_through_to_the_file(self, db):
        # The production shape: the row exists, lat/lng are NULL.
        db.add(City(name_he="בנימינה-גבעת עדה", lat=None, lng=None))
        db.commit()
        _near(city_centroid(db, "בנימינה-גבעת עדה"), 32.520, 34.944)

    def test_a_row_with_coordinates_still_wins(self, db):
        db.add(City(name_he="חיפה", lat=1.5, lng=2.5))
        db.commit()
        assert city_centroid(db, "חיפה") == (1.5, 2.5)

    def test_unknown_town_is_still_none(self, db):
        assert city_centroid(db, "כפר שאינו בשום רשימה") is None

    def test_failed_geocodes_are_absent_not_misplaced(self, db):
        # Dropped at import: «עטרת» geocoded to Los Angeles, «אדורה» was one of
        # 85 settlements stacked on a single Negev point. No pin beats a wrong one.
        assert city_centroid(db, "עטרת") is None
        assert city_centroid(db, "אדורה") is None


class TestBundledFileShape:
    def test_every_entry_is_inside_israel(self):
        cities = json.loads(DATA.read_text(encoding="utf-8"))["cities"]
        assert len(cities) > 1000
        outside = {
            n: v
            for n, v in cities.items()
            if not (29.4 < v[0] < 33.4 and 34.2 < v[1] < 35.95)
        }
        assert outside == {}

    def test_no_two_different_places_share_a_point(self):
        # The signature of a failed geocode. Same-place pairs (איחוד/מאוחד…)
        # are the only allowed sharing; they differ only in a parenthetical
        # or one letter, so a shared first word is required.
        cities = json.loads(DATA.read_text(encoding="utf-8"))["cities"]
        groups = defaultdict(list)
        for name, v in cities.items():
            groups[tuple(v)].append(name)
        shared = [g for g in groups.values() if len(g) > 1]
        assert all(len(g) == 2 for g in shared), shared
        assert all(g[0].split()[0][:3] == g[1].split()[0][:3] for g in shared), shared


class TestRegistrationWithoutSeededCoordinates:
    def test_town_only_registration_is_pinned_and_passes_the_gate(self, client, db):
        db.add(City(name_he="זכרון יעקב", lat=None, lng=None))
        db.commit()
        cat = make_category(db, name="קטגוריה-2669")
        consumer = make_user(db, email="meh2669@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json={
                "producer_name": "משק בלי כתובת",
                "category_ids": [cat.id],
                "primary_contact_method": "whatsapp",
                "phone": "0501234567",
                "declaration_accepted": True,
                "terms_accepted": True,
                "email": "meh2669@example.com",
                "city": "זכרון יעקב",
            },
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()
        db.refresh(consumer)
        (loc,) = (
            db.query(ProducerLocation)
            .filter(ProducerLocation.producer_id == consumer.producer_id)
            .all()
        )
        assert loc.location_precision == "approximate"
        _near((loc.lat, loc.lng), 32.571, 34.953)
        producer = db.query(Producer).filter(Producer.id == consumer.producer_id).one()
        assert MISSING_LOCATION not in submission_missing_items(producer)
