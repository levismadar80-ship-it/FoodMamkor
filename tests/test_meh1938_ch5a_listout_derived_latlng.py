"""
Module:   test_meh1938_ch5a_listout_derived_latlng
Purpose:  `ProducerListOut.lat/lng` (and every schema that inherits it —
          Detail, Admin, Owner) are DERIVED from the producer's primary
          `producer_locations` row, never from the `Producer.lat/lng` columns.
          The Q1 ruling (Sapir 01/09): the fields stay in the contract, their
          source changes. Read on every consumer route: the list, detail by id,
          detail by slug, the owner dashboard, the admin form.
Does NOT: change the wire shape (`lat`/`lng` are still float | None), touch
          `locations[]` (asserted unchanged as the control), or drop the
          columns (chunk 5b).
Related:  backend/app/schemas/schemas.py (ProducerListOut._derive_lat_lng_from_primary_location) ·
          backend/app/routers/admin_extra.py (_primary_location_points — the
          same rule for the admin map, 5a.2) · tests/test_meh1938_ch5a_admin_map_points.py.
History:  MEH-1938 chunk 5a.3 (creation).

Discrimination: against the pre-5a.3 schema every route below reports the
COLUMN coordinates (TLV, the make_producer default) for the column-vs-row case,
and reports TLV instead of None for the no-row case. Both red, then green.
"""

import pytest

from app.models import ProducerLocation
from tests.conftest import auth_header, make_producer, make_user

COLUMN_POINT = (32.0853, 34.7818)  # make_producer's default — Tel Aviv
ROW_POINT = (32.7940, 34.9896)  # Haifa, deliberately different


def _add_row(db, producer, *, kind="branch", is_primary=True, point=ROW_POINT):
    lat, lng = point
    db.add(
        ProducerLocation(
            producer_id=producer.id,
            kind=kind,
            is_primary=is_primary,
            city="חיפה",
            lat=lat,
            lng=lng,
            location_precision="exact",
        )
    )
    db.commit()


def _owner(db, producer):
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    # make_producer leaves `slug` NULL and the by-slug route 404s on it.
    producer.slug = f"biz-{producer.id.hex[:8]}"
    db.commit()
    return user


def _read_everywhere(client, db, producer):
    """One producer, read through every route that serializes the family.
    Returns {route: (lat, lng)} so a failure names the route that drifted."""
    owner = _owner(db, producer)
    admin = make_user(db, role="admin")
    out = {}

    listing = client.get("/producers").json()
    mine = [p for p in listing if p["id"] == str(producer.id)]
    assert len(mine) == 1, "the list must contain the fixture exactly once"
    out["GET /producers"] = (mine[0]["lat"], mine[0]["lng"])

    for route in (f"/producers/{producer.id}", f"/producers/by-slug/{producer.slug}"):
        resp = client.get(route)
        assert resp.status_code == 200, (route, resp.text)
        body = resp.json()
        out[f"GET {route}"] = (body["lat"], body["lng"])

    resp = client.get("/producers/me", headers=auth_header(owner))
    assert resp.status_code == 200, resp.text
    out["GET /producers/me"] = (resp.json()["lat"], resp.json()["lng"])

    resp = client.get(f"/admin/producers/{producer.id}", headers=auth_header(admin))
    assert resp.status_code == 200, resp.text
    out["GET /admin/producers/{id}"] = (resp.json()["lat"], resp.json()["lng"])
    return out


def test_every_route_reports_the_primary_row_not_the_column(client, db):
    """THE DISCRIMINATION CASE: column says TLV, primary row says Haifa."""
    producer = make_producer(db, name="עסק עם שורה")
    assert (producer.lat, producer.lng) == COLUMN_POINT
    _add_row(db, producer)

    seen = _read_everywhere(client, db, producer)

    wrong = {route: pt for route, pt in seen.items() if pt != ROW_POINT}
    assert wrong == {}, f"routes still reporting the column: {wrong}"
    assert len(seen) == 5, "the route inventory changed — extend this test"


def test_coordinates_on_the_columns_alone_serialize_as_none(client, db):
    """THE OTHER DISCRIMINATION CASE: columns set, zero rows → None everywhere.
    Nothing real is in this state (7c1e2a9f4b3d emptied it; P0 read 0 on
    staging and production), but a serializer that reached for the columns
    would put such a producer back on the map, silently."""
    producer = make_producer(db, name="עסק בלי שורה")
    assert (producer.lat, producer.lng) == COLUMN_POINT

    seen = _read_everywhere(client, db, producer)

    assert set(seen.values()) == {(None, None)}, seen


def test_a_non_primary_pickup_row_alone_is_not_the_answer(client, db):
    """`is_primary`, not "any row": a pickup point is not where the business is."""
    producer = make_producer(db, name="רק נקודת איסוף")
    _add_row(db, producer, kind="pickup", is_primary=False)

    seen = _read_everywhere(client, db, producer)

    assert set(seen.values()) == {(None, None)}, seen


def test_a_primary_row_with_a_cleared_pin_serializes_as_none(client, db):
    """The admin path clears a pin by NULLing the row's coordinates and keeps
    the row (upsert_primary_branch_location). The derived value must follow
    the row to None — not fall through to the stale column."""
    producer = make_producer(db, name="סיכה נמחקה")
    db.add(
        ProducerLocation(
            producer_id=producer.id, kind="branch", is_primary=True, city="חיפה"
        )
    )
    db.commit()

    seen = _read_everywhere(client, db, producer)

    assert set(seen.values()) == {(None, None)}, seen


def test_control_locations_are_still_serialized_and_the_shape_is_unchanged(client, db):
    """Every None above is void if `locations[]` stopped serializing — the
    derivation reads it. And the fields stay floats: the Q1 ruling changed
    the source, not the contract."""
    producer = make_producer(db, name="בקרה")
    _add_row(db, producer)

    body = client.get(f"/producers/{producer.id}").json()

    assert [
        (loc["lat"], loc["lng"], loc["is_primary"]) for loc in body["locations"]
    ] == [(*ROW_POINT, True)]
    assert isinstance(body["lat"], float) and isinstance(body["lng"], float)


@pytest.mark.parametrize("row_count", [1, 3])
def test_only_the_primary_row_wins_among_many(client, db, row_count):
    """With several rows, the primary one decides — not the first inserted,
    not the nearest, not the last. Parametrised on 1 and 3 so a 'first row'
    implementation cannot pass by accident on the single-row shape."""
    producer = make_producer(db, name="רב-סניפי")
    for i in range(row_count - 1):
        _add_row(db, producer, kind="pickup", is_primary=False, point=(31.0 + i, 35.0))
    _add_row(db, producer)  # the primary, inserted LAST

    body = client.get(f"/producers/{producer.id}").json()

    assert (body["lat"], body["lng"]) == ROW_POINT
    assert len(body["locations"]) == row_count
