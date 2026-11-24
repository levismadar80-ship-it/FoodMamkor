"""
Module:   test_meh3767_rescue_attention
Purpose:  MEH-3767 — «מה מחכה לטיפול» counts this business's live rescue bags
          (`attention.live_rescue_offers`), which replaced the home's
          always-on rescue card.
Touches:  GET /producers/me/dashboard.
Related:  backend/app/services/owner_attention.py _live_rescue_offers ·
          booking_cancellations._live_offers_query (same "live").
Cells:    0 offers → 0 · 1 live → 1 · many, mixed → only active with pickup
          not over, sold out included · another business's offers are not
          counted.
"""
from datetime import timedelta

from app.models import ProducerLocation, RescueOffer
from app.utils.clock import israel_today, utc_now
from conftest import make_producer
from test_meh2763_registrations import _owner
from test_meh3108_owner_attention import _attention


def _location(db, producer_id):
    loc = ProducerLocation(
        producer_id=producer_id,
        kind="branch",
        is_primary=True,
        city="חיפה",
        address="הנביאים 10",
        lat=32.7940,
        lng=34.9896,
        location_precision="exact",
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


def _offer(db, loc, *, status="active", ends_in_hours=3, qty_left=4):
    now = utc_now()
    db.add(
        RescueOffer(
            producer_location_id=loc.id,
            date=israel_today(),
            qty_total=4,
            qty_left=qty_left,
            price_agorot=1500,
            pickup_start=now + timedelta(hours=ends_in_hours - 2),
            pickup_end=now + timedelta(hours=ends_in_hours),
            cancel_until=now + timedelta(hours=ends_in_hours - 3),
            status=status,
        )
    )
    db.commit()


def test_no_offers_is_zero(client, db):
    owner = _owner(db, email="resc-0@example.com")
    assert _attention(client, owner)["live_rescue_offers"] == 0


def test_one_live_offer_counts(client, db):
    owner = _owner(db, email="resc-1@example.com")
    _offer(db, _location(db, owner.producer_id))
    assert _attention(client, owner)["live_rescue_offers"] == 1


def test_only_live_offers_of_this_business_count(client, db):
    owner = _owner(db, email="resc-n@example.com")
    loc = _location(db, owner.producer_id)
    _offer(db, loc)  # live
    _offer(db, loc, qty_left=0)  # sold out, still has codes to hand over
    _offer(db, loc, status="cancelled")
    _offer(db, loc, ends_in_hours=-1)  # pickup over
    _offer(db, _location(db, make_producer(db).id))  # another business
    assert _attention(client, owner)["live_rescue_offers"] == 2
