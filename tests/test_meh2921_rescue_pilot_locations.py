"""
Module:   test_meh2921_rescue_pilot_locations
Purpose:  The rescue tab learns, before the form, which of the business's
          pickup points are in a pilot town — so «עדיין לא פתוחים ביישוב הזה»
          is said up front instead of after «לפרסם» (MEH-2921 c). Read-only:
          the POST gate in rescue.py is unchanged.
Touches:  GET /producers/me/rescue/pilot-locations.
Related:  backend/app/routers/rescue_pilot.py, rescue.py city_in_pilot.
History:  MEH-2921 (creation).
"""

import pytest
from conftest import auth_header, make_producer, make_user

from app.models.models import ProducerLocation
from app.routers import rescue as rescue_module

URL = "/producers/me/rescue/pilot-locations"


@pytest.fixture
def rescue_on(monkeypatch):
    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
    monkeypatch.setattr(rescue_module, "rescue_cities", lambda: ("חיפה",))


def _loc(db, producer, city):
    loc = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=False,
        city=city,
        address="הנביאים 10",
        lat=32.79,
        lng=34.98,
        location_precision="exact",
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


def _owner(db, producer, email):
    owner = make_user(db, email=email, role="producer")
    owner.producer_id = producer.id
    owner.is_producer = True
    db.commit()
    return owner


def test_lists_only_own_locations_in_a_pilot_town(client, db, rescue_on):
    mine = make_producer(db, name="מאפיית הפיילוט", city="חיפה")
    other = make_producer(db, name="מאפייה אחרת", city="חיפה")
    in_pilot = _loc(db, mine, "חיפה")
    _loc(db, mine, "עכו")
    _loc(db, other, "חיפה")  # another business's point is never listed
    owner = _owner(db, mine, "pilot-owner@example.com")
    r = client.get(URL, headers=auth_header(owner))
    assert r.status_code == 200, r.text
    assert r.json() == {"location_ids": [str(in_pilot.id)]}


def test_none_in_pilot_is_an_empty_list(client, db, rescue_on):
    mine = make_producer(db, name="מאפיית עכו", city="עכו")
    _loc(db, mine, "עכו")
    owner = _owner(db, mine, "akko-owner@example.com")
    r = client.get(URL, headers=auth_header(owner))
    assert r.status_code == 200, r.text
    assert r.json() == {"location_ids": []}


def test_flag_off_is_404(client, db, monkeypatch):
    monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: False)
    mine = make_producer(db, name="מאפייה כבויה", city="חיפה")
    owner = _owner(db, mine, "off-owner@example.com")
    assert client.get(URL, headers=auth_header(owner)).status_code == 404


def test_needs_a_producer(client, db, rescue_on):
    user = make_user(db, email="consumer-pilot@example.com")
    assert client.get(URL, headers=auth_header(user)).status_code == 403


def test_anonymous_is_401(client, db, rescue_on):
    assert client.get(URL).status_code == 401
