"""
Module:   test_meh1938_ch5a_admin_map_points
Purpose:  The two admin map surfaces — `GET /admin/analytics` (heat map) and
          `GET /admin/dashboard` (map_points) — plot every approved business
          at its PRIMARY `producer_locations` row, and never at the
          `Producer.lat/lng` mirror. Those columns are the Contract target of
          MEH-1938: chunk 5a removed every fallback read, chunk 5b drops them.
Does NOT: change the wire shape — `{id, name, lat, lng}` per point is what
          frontend/app/[locale]/admin/analytics/page.js:142-151 renders, and it
          is asserted unchanged here. Does NOT touch `by_city`, which reads
          `Producer.city` (a column that stays, per the Q3 ruling).
Related:  backend/app/routers/admin_extra.py (_primary_location_points) ·
          tests/test_api.py (the two presence-only `"map_points" in body`
          assertions this file sharpens rather than replaces).
History:  MEH-1938 chunk 5a.2 (creation).

Discrimination: against the pre-5a code (columns read directly) the
"plots the ROW, not the column" case reports the column's coordinates and the
"no row → absent" case finds the producer present. Both red, then green.
"""

import pytest

from app.models import ProducerLocation
from tests.conftest import auth_header, make_producer, make_user

# Column mirror vs. row pin, deliberately different so the assertion can tell
# which one a point came from. TLV (the make_producer default) vs. Haifa.
COLUMN_POINT = (32.0853, 34.7818)
ROW_POINT = (32.7940, 34.9896)

SURFACES = ["/admin/analytics", "/admin/dashboard"]


def _admin(db):
    return make_user(db, role="admin")


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


def _points(client, db, surface):
    resp = client.get(surface, headers=auth_header(_admin(db)))
    assert resp.status_code == 200, resp.text
    return resp.json()["map_points"]


@pytest.mark.parametrize("surface", SURFACES)
def test_plots_the_primary_row_not_the_column(client, db, surface):
    """THE DISCRIMINATION CASE. The column says TLV, the primary row says
    Haifa; the point must be Haifa. Against the old code this reads TLV."""
    producer = make_producer(db, name="עסק עם שורה")
    assert (producer.lat, producer.lng) == COLUMN_POINT
    _add_row(db, producer)

    points = _points(client, db, surface)

    mine = [p for p in points if p["id"] == str(producer.id)]
    assert len(mine) == 1
    assert (mine[0]["lat"], mine[0]["lng"]) == ROW_POINT
    assert set(mine[0]) == {"id", "name", "lat", "lng"}, "wire shape must not change"


@pytest.mark.parametrize("surface", SURFACES)
def test_a_producer_with_coordinates_but_no_row_is_absent(client, db, surface):
    """THE OTHER DISCRIMINATION CASE: columns set, zero rows → no point. Against
    the old code this producer is present at its column coordinates.

    The population is empty on every environment (7c1e2a9f4b3d backfilled it,
    P0 read 0 on staging and production), so nothing real drops out — but a
    reader that reached for the columns would put it back, silently."""
    producer = make_producer(db, name="עסק בלי שורה")
    assert (producer.lat, producer.lng) == COLUMN_POINT

    points = _points(client, db, surface)

    assert [p for p in points if p["id"] == str(producer.id)] == []


@pytest.mark.parametrize("surface", SURFACES)
def test_a_non_primary_pickup_row_alone_does_not_plot(client, db, surface):
    """Primary row, not MIN over all rows: a pickup point is not where the
    business IS. Keeps the one-point-per-business shape the admin map renders."""
    producer = make_producer(db, name="רק נקודת איסוף")
    _add_row(db, producer, kind="pickup", is_primary=False)

    points = _points(client, db, surface)

    assert [p for p in points if p["id"] == str(producer.id)] == []


@pytest.mark.parametrize("surface", SURFACES)
def test_a_primary_row_with_a_cleared_pin_does_not_plot(client, db, surface):
    """The admin path mirrors a cleared pin onto the row and KEEPS the row
    (producer_queries.upsert_primary_branch_location). A row with NULL
    coordinates has nothing to plot and must drop out — the same outcome a
    NULL column produced before."""
    producer = make_producer(db, name="סיכה נמחקה")
    db.add(
        ProducerLocation(
            producer_id=producer.id, kind="branch", is_primary=True, city="חיפה"
        )
    )
    db.commit()

    points = _points(client, db, surface)

    assert [p for p in points if p["id"] == str(producer.id)] == []


@pytest.mark.parametrize("surface", SURFACES)
def test_the_status_filter_is_kept(client, db, surface):
    """A pending business with a perfect primary row still does not plot —
    the `status == approved` filter survived the query rewrite."""
    producer = make_producer(db, name="ממתין לאישור", status="pending")
    _add_row(db, producer)

    points = _points(client, db, surface)

    assert [p for p in points if p["id"] == str(producer.id)] == []


def test_control_the_surfaces_do_plot_something(client, db):
    """Every absence assertion above is void if the endpoints return an empty
    list for everyone. One approved business with a primary row must appear
    on both surfaces — asserted as the exact count, on the same fixture."""
    producer = make_producer(db, name="בקרה")
    _add_row(db, producer)

    for surface in SURFACES:
        points = _points(client, db, surface)
        assert [p["id"] for p in points] == [str(producer.id)], surface
