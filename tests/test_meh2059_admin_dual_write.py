"""MEH-2059 (MEH-1938 chunk 4b): the admin write paths dual-write a primary location.

Purpose:  Prove that BOTH admin paths which write `Producer.lat/lng` — create
          and update — also maintain exactly one `kind='branch'`,
          `is_primary=True` row in `producer_locations`, and that repeating a
          save neither duplicates the row nor breaks the single-primary
          invariant.
Touches:  POST /admin/producers, PUT /admin/producers/{id}.
Does NOT: exercise the Excel importer (`producer_import.py`, deliberately out
          of scope), the dashboard owner CRUD (`producer_locations_crud`), or
          the registration path — `test_meh1939_register_dual_write.py` owns
          that half and this file mirrors its shape.
Related:  backend/app/services/producer_queries.py
          (`upsert_primary_branch_location`, `_demote_other_primaries`);
          backend/app/routers/admin.py (create + update call sites);
          tests/conftest.py (make_user, make_producer, make_category).
History:  MEH-2059 (creation).

Why these assertions and not "a row exists": a presence-only check passes
identically whether the dual-write fired or a row happened to be there
already, so every case below pins the COUNT and the field values, and the
idempotency cases assert the row's `id` is unchanged — an insert-then-delete
implementation would pass a count check and fail this one.
"""

from app.models import Producer, ProducerLocation
from tests.conftest import auth_header, make_category, make_producer, make_user

# חדרה — deliberately different from make_producer's default Tel Aviv point,
# so "the row mirrors the edit" cannot be satisfied by the fixture's values.
EDITED = {"city": "חדרה", "lat": 32.4340, "lng": 34.9196}


def _locations(db, producer_id) -> list[ProducerLocation]:
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .all()
    )


def _primaries(db, producer_id) -> list[ProducerLocation]:
    return [loc for loc in _locations(db, producer_id) if loc.is_primary]


def _admin_header(db):
    return auth_header(make_user(db, role="admin"))


def _create_body(db, **overrides) -> dict:
    cat = make_category(
        db, name=f"קטגוריה-{len(overrides)}-{overrides.get('name', 'x')}"
    )
    base = {
        "name": "חוות הבדיקה של האדמין",
        "city": "תל אביב",
        "lat": 32.0853,
        "lng": 34.7818,
        "category_ids": [cat.id],
        "phone": "0501234567",
    }
    return {**base, **overrides}


class TestAdminCreate:
    """POST /admin/producers — admin.py:382-460, the sixth create-from-payload."""

    def test_create_with_coordinates_writes_one_primary_branch_row(self, client, db):
        resp = client.post(
            "/admin/producers", json=_create_body(db), headers=_admin_header(db)
        )
        assert resp.status_code == 201, resp.text
        pid = resp.json()["id"]

        rows = _locations(db, pid)
        assert len(rows) == 1, f"expected exactly one location row, got {len(rows)}"
        loc = rows[0]
        # The full field contract MEH-1939 established, asserted field by field
        # rather than "a row exists" — a wrong `kind` would make this producer
        # invisible to the branch query while still counting as "has locations".
        assert loc.kind == "branch"
        assert loc.is_primary is True
        assert loc.location_precision == "exact"
        assert loc.city == "תל אביב"
        assert loc.lat == 32.0853
        assert loc.lng == 34.7818

    def test_create_without_coordinates_writes_no_row(self, client, db):
        """The CONDITION, not an edge case (producer_queries.py:367-372).

        A coordinate-less row is invisible to the geo query but still counts as
        "this producer has locations" for anything measuring the collection.
        """
        body = _create_body(db, name="עסק בלי נקודה", lat=None, lng=None)
        resp = client.post("/admin/producers", json=body, headers=_admin_header(db))
        assert resp.status_code == 201, resp.text

        assert _locations(db, resp.json()["id"]) == []

    def test_create_branch_row_does_not_flip_the_pickup_badge(self, client, db):
        """MEH-2060 guard: `offers_pickup` keys on kind in (pickup, market_stand).

        A branch row must not masquerade as a pickup point. This asserts the
        serialized answer, not the helper's internals.
        """
        resp = client.post(
            "/admin/producers", json=_create_body(db), headers=_admin_header(db)
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["pickup_points"] is False


class TestAdminUpdate:
    """PUT /admin/producers/{id} — admin.py bulk setattr loop + the upsert."""

    def test_update_creates_the_row_when_the_producer_has_none(self, client, db):
        """`make_producer` builds the row directly, so it owns no location —
        which is exactly the MEH-2056 gap this ticket closes."""
        producer = make_producer(db)
        assert _locations(db, producer.id) == []

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json=EDITED,
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text

        rows = _locations(db, producer.id)
        assert len(rows) == 1
        assert rows[0].kind == "branch"
        assert rows[0].is_primary is True
        assert rows[0].lat == EDITED["lat"]
        assert rows[0].lng == EDITED["lng"]
        assert rows[0].city == EDITED["city"]

    def test_update_twice_is_idempotent_and_keeps_the_same_row(self, client, db):
        """The idempotency requirement, pinned by row IDENTITY not just count.

        An implementation that deleted and re-inserted would keep the count at
        one and still fail here — which is the point.
        """
        producer = make_producer(db)
        headers = _admin_header(db)

        first = client.put(
            f"/admin/producers/{producer.id}", json=EDITED, headers=headers
        )
        assert first.status_code == 200, first.text
        rows_after_first = _locations(db, producer.id)
        assert len(rows_after_first) == 1
        original_id = rows_after_first[0].id

        second = client.put(
            f"/admin/producers/{producer.id}", json=EDITED, headers=headers
        )
        assert second.status_code == 200, second.text

        rows_after_second = _locations(db, producer.id)
        assert len(rows_after_second) == 1, "a repeated save created a second row"
        assert rows_after_second[0].id == original_id, (
            "the row was replaced rather than updated in place"
        )

    def test_update_moves_the_existing_row_rather_than_adding_one(self, client, db):
        producer = make_producer(db)
        client.put(
            f"/admin/producers/{producer.id}",
            json={"lat": 32.0853, "lng": 34.7818, "city": "תל אביב"},
            headers=_admin_header(db),
        )
        before = _locations(db, producer.id)
        assert len(before) == 1
        original_id = before[0].id

        resp = client.put(
            f"/admin/producers/{producer.id}", json=EDITED, headers=_admin_header(db)
        )
        assert resp.status_code == 200, resp.text

        rows = _locations(db, producer.id)
        assert len(rows) == 1
        db.refresh(rows[0])
        assert rows[0].id == original_id
        assert rows[0].lat == EDITED["lat"]
        assert rows[0].city == EDITED["city"]

    def test_clearing_coordinates_clears_the_mirror_and_keeps_the_row(self, client, db):
        """The null case, decided in this PR and documented on the helper.

        The row survives (it carries owner-authored label / opening_hours /
        phone), its coordinates go NULL so nothing points at a stale fix.
        """
        producer = make_producer(db)
        client.put(
            f"/admin/producers/{producer.id}", json=EDITED, headers=_admin_header(db)
        )
        rows = _locations(db, producer.id)
        assert len(rows) == 1
        original_id = rows[0].id
        # Owner-authored data the admin's coordinate edit must not destroy.
        rows[0].label = "הסניף הראשי"
        rows[0].opening_hours = "א׳-ה׳ 09:00-17:00"
        db.commit()

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"lat": None, "lng": None},
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text

        rows = _locations(db, producer.id)
        assert len(rows) == 1, "the row was deleted rather than cleared"
        db.refresh(rows[0])
        assert rows[0].id == original_id
        assert rows[0].lat is None
        assert rows[0].lng is None
        assert rows[0].is_primary is True
        assert rows[0].label == "הסניף הראשי"
        assert rows[0].opening_hours == "א׳-ה׳ 09:00-17:00"

    def test_update_not_touching_coordinates_leaves_locations_alone(self, client, db):
        """The gate is the PAYLOAD, not the resulting values.

        An admin editing only the name must not re-mirror `Producer.address`
        over a row the owner authored in the dashboard.
        """
        producer = make_producer(db)
        owner_row = ProducerLocation(
            producer_id=producer.id,
            kind="branch",
            is_primary=True,
            city="כתובת של הבעלים",
            address="רחוב שהבעלים הקלידה 3",
            lat=31.7683,
            lng=35.2137,
            location_precision="approximate",
        )
        db.add(owner_row)
        db.commit()

        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"name": "שם חדש לגמרי"},
            headers=_admin_header(db),
        )
        assert resp.status_code == 200, resp.text

        rows = _locations(db, producer.id)
        assert len(rows) == 1
        db.refresh(rows[0])
        assert rows[0].address == "רחוב שהבעלים הקלידה 3"
        assert rows[0].lat == 31.7683
        assert rows[0].location_precision == "approximate"

    def test_existing_precision_is_preserved_on_a_coordinate_edit(self, client, db):
        """An admin moving a pin is not a statement about precision."""
        producer = make_producer(db)
        db.add(
            ProducerLocation(
                producer_id=producer.id,
                kind="branch",
                is_primary=True,
                lat=31.7683,
                lng=35.2137,
                location_precision="approximate",
            )
        )
        db.commit()

        resp = client.put(
            f"/admin/producers/{producer.id}", json=EDITED, headers=_admin_header(db)
        )
        assert resp.status_code == 200, resp.text

        rows = _primaries(db, producer.id)
        assert len(rows) == 1
        db.refresh(rows[0])
        assert rows[0].location_precision == "approximate"
        assert rows[0].lat == EDITED["lat"]


class TestSinglePrimaryInvariant:
    """There is NO database constraint behind this — see `_demote_other_primaries`.

    `producer_locations` has no partial unique index on `is_primary`, so the
    invariant is only as good as its writers. These pin that this writer
    upholds it.
    """

    def test_a_pre_existing_second_primary_is_demoted(self, client, db):
        producer = make_producer(db)
        for city in ("ראשונה", "שנייה"):
            db.add(
                ProducerLocation(
                    producer_id=producer.id,
                    kind="branch",
                    is_primary=True,
                    city=city,
                    lat=31.7683,
                    lng=35.2137,
                )
            )
        db.commit()
        assert len(_primaries(db, producer.id)) == 2, "fixture did not set up the clash"

        resp = client.put(
            f"/admin/producers/{producer.id}", json=EDITED, headers=_admin_header(db)
        )
        assert resp.status_code == 200, resp.text

        db.expire_all()
        primaries = _primaries(db, producer.id)
        assert len(primaries) == 1, (
            f"single-primary invariant violated: {len(primaries)} primaries"
        )
        # Both rows survive — demotion, not deletion.
        assert len(_locations(db, producer.id)) == 2
        assert primaries[0].lat == EDITED["lat"]

    def test_a_non_primary_pickup_row_is_never_promoted_or_overwritten(
        self, client, db
    ):
        """The upsert must find the PRIMARY row, not merely the first row."""
        producer = make_producer(db)
        pickup = ProducerLocation(
            producer_id=producer.id,
            kind="pickup",
            is_primary=False,
            city="נקודת איסוף",
            lat=31.7683,
            lng=35.2137,
        )
        db.add(pickup)
        db.commit()
        pickup_id = pickup.id

        resp = client.put(
            f"/admin/producers/{producer.id}", json=EDITED, headers=_admin_header(db)
        )
        assert resp.status_code == 200, resp.text

        db.expire_all()
        rows = _locations(db, producer.id)
        assert len(rows) == 2, "the pickup row should be untouched and a branch added"
        untouched = next(r for r in rows if r.id == pickup_id)
        assert untouched.kind == "pickup"
        assert untouched.is_primary is False
        assert untouched.city == "נקודת איסוף"
        assert untouched.lat == 31.7683

        primaries = _primaries(db, producer.id)
        assert len(primaries) == 1
        assert primaries[0].kind == "branch"


class TestProducerColumnsStillWritten:
    """Expand, not replacement — chunk 5 has not happened.

    If this ever fails, someone dropped the columns without doing chunk 5, and
    the admin UI (which still edits them) is broken.
    """

    def test_the_producer_columns_keep_their_values(self, client, db):
        producer = make_producer(db)
        resp = client.put(
            f"/admin/producers/{producer.id}", json=EDITED, headers=_admin_header(db)
        )
        assert resp.status_code == 200, resp.text

        refreshed = db.query(Producer).filter(Producer.id == producer.id).first()
        assert refreshed.lat == EDITED["lat"]
        assert refreshed.lng == EDITED["lng"]
        assert refreshed.city == EDITED["city"]
