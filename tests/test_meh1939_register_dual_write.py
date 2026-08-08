"""MEH-1939 (MEH-1938 chunk 1): registration dual-writes a primary branch location.

Purpose:  Prove that EVERY path which creates a producer from a signup payload
          also creates exactly one `producer_locations` row — kind='branch',
          is_primary=True — and that a payload with no coordinates creates
          none. The `Producer.city/lat/lng` columns keep being written
          unchanged; this is Expand, not replacement.
Touches:  POST /auth/register/producer (both branches) and POST /producers.
Does NOT: exercise the backfill for existing producers (chunk 2), the removal
          of the haversine COALESCE (chunk 5), or any schema change — this
          ticket adds no migration.
Related:  backend/app/services/producer_queries.py
          (create_primary_branch_location, the single implementation the three
          call sites share); backend/app/routers/auth.py (:510 upgrade branch,
          :625 new-email branch); tests/conftest.py (make_user, make_category,
          auth_header).
History:  MEH-1939 (creation).

Why a new file rather than an existing one: no file owns "registration writes
a location row". `test_producer_locations.py` scopes itself to the ORM data
layer and says so ("Does NOT: exercise serialization / routers"),
`test_producer_locations_crud.py` owns the dashboard CRUD router, and the
registration files own auth/validation concerns. The repo's dominant
convention is one file per ticket (53 `test_meh<NNNN>_*.py` files), which this
follows.
"""

from app.models import Producer, ProducerLocation, User
from tests.conftest import auth_header, make_category, make_user

SAFE_PASSWORD = "Zx7Yp9Mq2Lr4"

# זכרון יעקב — the town the register flow's own example uses.
GEOCODED = {"city": "זכרון יעקב", "address": "דרך שרה 5", "lat": 32.5731, "lng": 34.9512}


def _body(db, **overrides) -> dict:
    """A ProducerRegister payload that passes validation.

    Category is seeded per call (non-license-required) so the handler's
    MEH-1153 "≥1 category" guard is satisfied without pulling in the license
    branch. Mirrors `_upgrade_body` in test_admin_producer_lockout.py.
    """
    cat = make_category(db, name=f"קטגוריה-{overrides.get('email', 'x')}")
    base = {
        "producer_name": "חוות הבדיקה",
        "category_ids": [cat.id],
        "primary_contact_method": "whatsapp",
        "phone": "0501234567",
        "declaration_accepted": True,
    }
    return {**base, **overrides}


def _locations_of(db, producer_id) -> list[ProducerLocation]:
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .all()
    )


class TestUpgradeBranch:
    """POST /auth/register/producer with a logged-in consumer (auth.py:510).

    This is also the branch every OAuth signup lands on:
    `/auth/register/producer/oauth` creates a consumer and a token only, never
    a Producer (its own docstring, auth.py:865-871), so the Google/Apple
    journey finishes here as an already-authenticated user. Testing this
    branch IS the coverage for the OAuth route.
    """

    def test_creates_one_primary_branch_location(self, client, db):
        consumer = make_user(db, email="upgrade@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_body(db, email="upgrade@example.com", **GEOCODED),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()

        db.refresh(consumer)
        rows = _locations_of(db, consumer.producer_id)
        assert len(rows) == 1
        loc = rows[0]
        assert loc.kind == "branch"
        assert loc.is_primary is True
        assert loc.location_precision == "exact"
        assert loc.city == GEOCODED["city"]
        assert loc.address == GEOCODED["address"]
        assert loc.lat == GEOCODED["lat"]
        assert loc.lng == GEOCODED["lng"]

    def test_producer_columns_are_written_exactly_as_before(self, client, db):
        # The dual-write must not disturb the columns it runs beside — this is
        # Expand, and a regression here would be silent until chunk 5.
        consumer = make_user(db, email="cols@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_body(db, email="cols@example.com", **GEOCODED),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()

        db.refresh(consumer)
        producer = db.query(Producer).filter(Producer.id == consumer.producer_id).one()
        assert producer.city == GEOCODED["city"]
        assert producer.address == GEOCODED["address"]
        assert producer.lat == GEOCODED["lat"]
        assert producer.lng == GEOCODED["lng"]


class TestNewEmailBranch:
    """POST /auth/register/producer anonymously (auth.py:625) — password signup."""

    def test_creates_one_primary_branch_location(self, client, db):
        email = "newemail@example.com"
        resp = client.post(
            "/auth/register/producer",
            json=_body(db, email=email, name="יצרנית", password=SAFE_PASSWORD, **GEOCODED),
        )
        assert resp.status_code == 200, resp.json()

        user = db.query(User).filter(User.email == email).one()
        rows = _locations_of(db, user.producer_id)
        assert len(rows) == 1
        assert rows[0].kind == "branch"
        assert rows[0].is_primary is True
        assert rows[0].lat == GEOCODED["lat"]


class TestNoCoordinatesNoRow:
    """A row without coordinates is invisible to the map but still counts as
    "this producer has locations" — so it must not be created at all. This is
    the delivery-only business (MEH-213), which legitimately has no point.
    """

    def test_upgrade_without_coordinates_creates_no_row(self, client, db):
        consumer = make_user(db, email="nocoords@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_body(db, email="nocoords@example.com", city="תל אביב"),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()

        db.refresh(consumer)
        assert _locations_of(db, consumer.producer_id) == []

    def test_partial_coordinates_create_no_row(self, client, db):
        # lat without lng is not half a point — it is no point. The guard is
        # `lat is None or lng is None`, and this pins the `or`: a version
        # using `and` would write a row carrying a NULL coordinate.
        consumer = make_user(db, email="partial@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_body(db, email="partial@example.com", city="חיפה", lat=32.79),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()

        db.refresh(consumer)
        assert _locations_of(db, consumer.producer_id) == []


class TestPostProducersEndpoint:
    """POST /producers — the third writer, via create_producer_with_relations.

    Not the public signup flow (its docstring at producers.py:449-452 says so
    explicitly), but it builds a producer from the same shape of payload, and
    leaving it out would open the very gap this ticket closes.
    """

    def test_creates_one_primary_branch_location(self, client, db):
        user = make_user(db, email="poster@example.com", role="consumer")
        user.email_verified = True
        db.commit()
        cat = make_category(db, name="קטגוריה-post-producers")

        resp = client.post(
            "/producers",
            json={
                "name": "עסק דרך POST",
                "category_ids": [cat.id],
                "city": GEOCODED["city"],
                "lat": GEOCODED["lat"],
                "lng": GEOCODED["lng"],
            },
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.json()

        producer_id = resp.json()["id"]
        rows = _locations_of(db, producer_id)
        assert len(rows) == 1
        assert rows[0].kind == "branch"
        assert rows[0].is_primary is True
        # ProducerCreate carries no `address` field (schemas.py:1324-1338), so
        # this is the one caller with nothing to put there.
        assert rows[0].address is None


class TestSameCityLabelInvariant:
    """`_reject_same_city_without_label` (producer_me.py:1412) forces a label
    on a SECOND location in a city the producer already uses.

    The ticket asked for this to be verified rather than assumed, and it turns
    out to cut both ways — see the second test, which is a real behaviour
    change this ticket introduces.
    """

    def test_registration_itself_does_not_trip_the_invariant(self, client, db):
        # The registration row is the producer's first, so there is no sibling
        # for it to collide with. It carries no label and must still be created.
        consumer = make_user(db, email="firstrow@example.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=_body(db, email="firstrow@example.com", **GEOCODED),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 200, resp.json()

        db.refresh(consumer)
        rows = _locations_of(db, consumer.producer_id)
        assert len(rows) == 1
        assert rows[0].label is None

    def test_a_later_unlabelled_location_in_the_same_city_now_422s(self, client, db):
        # BEHAVIOUR CHANGE, pinned deliberately. Before this ticket a freshly
        # registered producer had zero location rows, so her first dashboard
        # location never collided. Now the registration row occupies her town,
        # and adding a second one there without a label hits the invariant.
        # That is the invariant working as designed (MEH-1421: two points in
        # one city must be tellable apart on the map) — but it is new friction
        # that did not exist yesterday, so it is recorded here rather than
        # discovered later.
        consumer = make_user(db, email="secondrow@example.com", role="consumer")
        reg = client.post(
            "/auth/register/producer",
            json=_body(db, email="secondrow@example.com", **GEOCODED),
            headers=auth_header(consumer),
        )
        assert reg.status_code == 200, reg.json()
        db.refresh(consumer)

        resp = client.post(
            "/producers/me/locations",
            json={
                "kind": "pickup",
                "city": GEOCODED["city"],
                "lat": 32.58,
                "lng": 34.95,
                "location_precision": "exact",
            },
            headers=auth_header(consumer),
        )
        assert resp.status_code == 422, resp.json()
        assert "תווית" in resp.json()["detail"]

        # …and it succeeds the moment a label distinguishes the two.
        labelled = client.post(
            "/producers/me/locations",
            json={
                "kind": "pickup",
                "label": "נקודת איסוף בשוק",
                "city": GEOCODED["city"],
                "lat": 32.58,
                "lng": 34.95,
                "location_precision": "exact",
            },
            headers=auth_header(consumer),
        )
        assert labelled.status_code in (200, 201), labelled.json()
        assert len(_locations_of(db, consumer.producer_id)) == 2
