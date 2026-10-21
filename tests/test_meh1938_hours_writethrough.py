"""MEH-1938 (hours write-through): the admin PUT mirrors `opening_hours` onto the primary row.

Purpose:  Prove that PUT /admin/producers/{id} with `opening_hours` writes BOTH
          the legacy `Producer.opening_hours` column (expand phase — nothing
          regresses) AND the primary `producer_locations` row's `opening_hours`
          — and that a PUT which does not carry the field leaves the row's
          hours exactly as the owner left them.
Touches:  PUT /admin/producers/{id}.
Does NOT: exercise the owner PUT (`producer_me.py` dropped `opening_hours`
          from `_PRODUCER_WRITABLE_FIELDS` under MEH-2142 — that path cannot
          write the column, so there is nothing to mirror), the Excel importer
          (writes no hours), or the seed scripts (`seed_demo_business.py` now
          seeds the primary row with the same hours; a module-level dict, not
          a route, so not covered here). Does NOT remove the read fallback in
          `frontend/lib/hours.js` — that is the contract step, a later PR.
Related:  backend/app/services/producer_queries.py
          (`upsert_primary_branch_location`, `mirror_point` / `mirror_hours`);
          backend/app/routers/admin.py (the gated call after the setattr loop);
          tests/test_meh2059_admin_dual_write.py (the lat/lng half this mirrors);
          backend/scripts/count_hours_gap.py (the gap the write-through stops
          from growing).
History:  MEH-1938 (creation — hours write-through chunk).

Why these assertions and not "a row has hours": a presence-only check passes
identically whether the write-through fired or the fixture happened to carry
the value, so every case below seeds the row with hours that DIFFER from the
payload, pins the row's `id` (an insert-then-delete would pass a count), and
asserts the fields the call must NOT have touched alongside the one it must.
"""

from app.models import Producer, ProducerLocation
from tests.conftest import auth_header, make_producer, make_user

# Deliberately not the string the fixture row carries (OWNER_HOURS), so "the
# row mirrors the edit" cannot be satisfied by the seeded value.
NEW_HOURS = "א'-ה' 08:00-16:00, ו' 08:00-12:00"
OWNER_HOURS = "ב'-ו' 10:00-14:00"
# חדרה — not make_producer's Tel Aviv point (same reason as test_meh2059).
EDITED_POINT = {"city": "חדרה", "lat": 32.4340, "lng": 34.9196}


def _locations(db, producer_id) -> list[ProducerLocation]:
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .all()
    )


def _admin_header(db):
    return auth_header(make_user(db, role="admin"))


def _owner_row(db, producer, *, opening_hours=OWNER_HOURS) -> ProducerLocation:
    """A primary row the OWNER authored in the dashboard — address and hours
    both differ from the business columns, so any re-mirror is observable."""
    row = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city="כתובת של הבעלים",
        address="רחוב שהבעלים הקלידה 3",
        lat=31.7683,
        lng=35.2137,
        opening_hours=opening_hours,
        location_precision="approximate",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _reload(db, producer_id) -> Producer:
    db.expire_all()
    return db.query(Producer).filter(Producer.id == producer_id).first()


class TestHoursAreWrittenToBoth:
    """(a) — the write-through: legacy column AND primary row."""

    def test_hours_only_put_writes_column_and_row_and_nothing_else(self, client, db):
        producer = make_producer(db)
        row = _owner_row(db, producer)
        original_id = row.id

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"opening_hours": NEW_HOURS},
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text
        # The response is the legacy column's reader — expand phase keeps it.
        assert resp.json()["opening_hours"] == NEW_HOURS

        refreshed = _reload(db, producer.id)
        assert refreshed.opening_hours == NEW_HOURS, "legacy column not written"

        rows = _locations(db, producer.id)
        assert len(rows) == 1, f"expected the one owner row, got {len(rows)}"
        assert rows[0].id == original_id, "the row was replaced, not updated"
        assert rows[0].opening_hours == NEW_HOURS, "primary row not written"
        # An hours-only edit mirrors hours and NOTHING else — the owner's
        # address and pin must survive (admin.py gate: the payload, not the
        # resulting values).
        assert rows[0].address == "רחוב שהבעלים הקלידה 3"
        assert rows[0].city == "כתובת של הבעלים"
        assert rows[0].lat == 31.7683
        assert rows[0].location_precision == "approximate"
        assert rows[0].is_primary is True

    def test_hours_put_on_a_producer_with_no_row_creates_one_carrying_them(
        self, client, db
    ):
        """`make_producer` owns no location but has coordinates — the MEH-2056
        gap class. An hours edit must not leave the new row hour-less, or the
        gap the backfill closed for lat/lng reopens for hours."""
        producer = make_producer(db)
        assert _locations(db, producer.id) == []

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"opening_hours": NEW_HOURS},
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text

        rows = _locations(db, producer.id)
        assert len(rows) == 1
        assert rows[0].kind == "branch"
        assert rows[0].is_primary is True
        assert rows[0].opening_hours == NEW_HOURS
        # Born from the business columns, same shape as 7c1e2a9f4b3d's rows.
        assert rows[0].lat == 32.0853
        assert rows[0].lng == 34.7818
        assert _reload(db, producer.id).opening_hours == NEW_HOURS

    def test_hours_and_point_in_one_put_mirror_both_axes(self, client, db):
        producer = make_producer(db)
        row = _owner_row(db, producer)
        original_id = row.id

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={**EDITED_POINT, "opening_hours": NEW_HOURS},
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text

        rows = _locations(db, producer.id)
        assert len(rows) == 1
        db.refresh(rows[0])
        assert rows[0].id == original_id
        assert rows[0].opening_hours == NEW_HOURS
        assert rows[0].lat == EDITED_POINT["lat"]
        assert rows[0].lng == EDITED_POINT["lng"]
        assert rows[0].city == EDITED_POINT["city"]

        refreshed = _reload(db, producer.id)
        assert refreshed.opening_hours == NEW_HOURS
        assert refreshed.lat == EDITED_POINT["lat"]

    def test_explicit_null_clears_both_column_and_row(self, client, db):
        """Mirrors the coordinate-clear ruling (upsert case 3): a cleared
        business value clears the mirror too; the row itself survives."""
        producer = make_producer(db)
        producer.opening_hours = OWNER_HOURS
        db.commit()
        row = _owner_row(db, producer)
        original_id = row.id

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"opening_hours": None},
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text

        assert _reload(db, producer.id).opening_hours is None
        rows = _locations(db, producer.id)
        assert len(rows) == 1, "the row was deleted rather than cleared"
        assert rows[0].id == original_id
        assert rows[0].opening_hours is None
        assert rows[0].address == "רחוב שהבעלים הקלידה 3"

    def test_hours_put_on_a_producer_without_coordinates_keeps_only_the_column(
        self, client, db
    ):
        """The create helper's CONDITION: no coordinates → no row. The legacy
        column still takes the value, so nothing an admin typed is lost."""
        producer = make_producer(db)
        producer.lat = None
        producer.lng = None
        db.commit()

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"opening_hours": NEW_HOURS},
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text
        assert _reload(db, producer.id).opening_hours == NEW_HOURS
        assert _locations(db, producer.id) == []


class TestHoursUntouchedWhenNotSent:
    """(b) — the gate is the PAYLOAD. A PUT without `opening_hours` must not
    reach the row's hours, whatever else it edits."""

    def test_name_only_put_leaves_the_row_hours_alone(self, client, db):
        producer = make_producer(db)
        producer.opening_hours = NEW_HOURS  # business column differs from the row
        db.commit()
        row = _owner_row(db, producer, opening_hours=OWNER_HOURS)
        original_id = row.id

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"name": "שם חדש לגמרי"},
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text

        rows = _locations(db, producer.id)
        assert len(rows) == 1
        db.refresh(rows[0])
        assert rows[0].id == original_id
        # Would read NEW_HOURS if the mirror fired without the field in the
        # payload — the two values differ on purpose.
        assert rows[0].opening_hours == OWNER_HOURS
        assert rows[0].address == "רחוב שהבעלים הקלידה 3"
        assert _reload(db, producer.id).opening_hours == NEW_HOURS

    def test_point_only_put_mirrors_the_point_but_not_the_hours(self, client, db):
        """The pre-existing lat/lng mirror must not start dragging hours along:
        `mirror_hours` is off unless the field is in the payload."""
        producer = make_producer(db)
        producer.opening_hours = NEW_HOURS
        db.commit()
        row = _owner_row(db, producer, opening_hours=OWNER_HOURS)
        original_id = row.id

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json=EDITED_POINT,
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text

        rows = _locations(db, producer.id)
        assert len(rows) == 1
        db.refresh(rows[0])
        assert rows[0].id == original_id
        assert rows[0].lat == EDITED_POINT["lat"]
        assert rows[0].city == EDITED_POINT["city"]
        assert rows[0].opening_hours == OWNER_HOURS, "point edit overwrote owner hours"

    def test_empty_body_put_touches_nothing(self, client, db):
        """`exclude_unset=True` with no fields → no mirror call at all."""
        producer = make_producer(db)
        row = _owner_row(db, producer, opening_hours=OWNER_HOURS)
        original_id = row.id

        resp = client.put(
            f"/admin/producers/{producer.id}", json={}, headers=_admin_header(db)
        )
        assert resp.status_code == 200, resp.text

        rows = _locations(db, producer.id)
        assert len(rows) == 1
        db.refresh(rows[0])
        assert rows[0].id == original_id
        assert rows[0].opening_hours == OWNER_HOURS


class TestGuard:
    """The write-through sits behind `require_admin` — a non-admin reaches
    neither column. Schema-valid payload on purpose (regression rule 6): a
    422 would prove nothing about the guard."""

    def test_non_admin_is_refused_and_neither_store_changes(self, client, db):
        producer = make_producer(db)
        producer.opening_hours = OWNER_HOURS
        db.commit()
        row = _owner_row(db, producer, opening_hours=OWNER_HOURS)

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"opening_hours": NEW_HOURS},
            headers=auth_header(make_user(db, role="producer")),
        )
        assert resp.status_code == 403, resp.text

        assert _reload(db, producer.id).opening_hours == OWNER_HOURS
        db.refresh(row)
        assert row.opening_hours == OWNER_HOURS
