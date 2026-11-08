"""
Module:   test_meh2679_rescue_utc_times
Purpose:  Every time a rescue endpoint returns carries its zone, and every
          time it accepts is stored as the same UTC instant whatever offset
          the caller wrote it in.
Related:  backend/app/schemas/rescue.py, frontend/lib/rescue.js (parses these
          with the generated `zod.iso.datetime({offset: true})`, which rejects
          a bare "2026-11-05T16:00:00")
History:  MEH-2679 (creation) — staging 05/11: the first real bag made /rescue
          answer «לא הצלחנו לטעון את הסלים» for every buyer, because the
          naive `DateTime` columns serialised without a zone.
"""

# The fixtures are reused from test_rescue.py; pytest injects them by name, which
# ruff reads as parameters redefining the imports.
# ruff: noqa: F811

import re
from datetime import datetime, timedelta, timezone

from app.utils.clock import utc_now
from tests.conftest import auth_header, make_user
from tests.test_rescue import _offer_payload, _seed_offer, rescue_on, shop  # noqa: F401

# The shape zod.iso.datetime({offset: true}) accepts: a trailing Z or ±hh:mm.
ZONED = re.compile(r"(Z|[+-]\d{2}:\d{2})$")
TIME_KEYS = {
    "pickup_start",
    "pickup_end",
    "cancel_until",
    "created_at",
    "handed_at",
    "cancelled_at",
    "updated_at",
    "block_cleared_at",
}


def _times(obj):
    """Every (key, value) for a time key anywhere in a JSON body."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in TIME_KEYS and v is not None:
                yield k, v
            yield from _times(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _times(v)


def _assert_zoned(body):
    found = list(_times(body))
    assert found, "no time field in the body: the check would pass vacuously"
    bare = [(k, v) for k, v in found if not ZONED.search(v)]
    assert bare == []


class TestResponsesCarryTheirZone:
    def test_public_list(self, client, db, shop, rescue_on):
        _seed_offer(db, shop["location"])
        resp = client.get("/rescue/offers")
        assert resp.status_code == 200 and resp.json(), resp.text
        _assert_zoned(resp.json())

    def test_publish(self, client, db, shop, rescue_on):
        resp = client.post(
            "/rescue/offers",
            json=_offer_payload(shop["location"]),
            headers=auth_header(shop["owner"]),
        )
        assert resp.status_code == 201, resp.text
        _assert_zoned(resp.json())

    def test_reserve_and_owner_list(self, client, db, shop, rescue_on):
        offer = _seed_offer(db, shop["location"])
        buyer = make_user(db, email="buyer2679@example.com", role="consumer")
        resp = client.post(
            "/rescue/orders",
            json={"offer_id": str(offer.id), "qty": 1},
            headers=auth_header(buyer),
        )
        assert resp.status_code in (200, 201), resp.text
        _assert_zoned(resp.json())
        owner_list = client.get(
            "/producers/me/rescue/orders", headers=auth_header(shop["owner"])
        )
        assert owner_list.status_code == 200 and owner_list.json(), owner_list.text
        _assert_zoned(owner_list.json())

    def test_the_zone_is_utc_and_the_instant_is_unchanged(
        self, client, db, shop, rescue_on
    ):
        offer = _seed_offer(db, shop["location"])
        (row,) = client.get("/rescue/offers").json()
        got = datetime.fromisoformat(row["pickup_start"].replace("Z", "+00:00"))
        assert got == offer.pickup_start.replace(tzinfo=timezone.utc)


class TestInputOffsetIsNormalised:
    def test_israel_offset_is_stored_as_the_same_utc_instant(
        self, client, db, shop, rescue_on
    ):
        start_utc = (utc_now() + timedelta(hours=2)).replace(microsecond=0)
        il = timezone(timedelta(hours=2))
        body = _offer_payload(
            shop["location"],
            pickup_start=start_utc.replace(tzinfo=timezone.utc)
            .astimezone(il)
            .isoformat(),
            pickup_end=(start_utc + timedelta(hours=2))
            .replace(tzinfo=timezone.utc)
            .isoformat(),
            cancel_until=(start_utc - timedelta(minutes=30)).isoformat() + "Z",
        )
        resp = client.post(
            "/rescue/offers", json=body, headers=auth_header(shop["owner"])
        )
        assert resp.status_code == 201, resp.text
        got = datetime.fromisoformat(resp.json()["pickup_start"].replace("Z", "+00:00"))
        assert got == start_utc.replace(tzinfo=timezone.utc)
