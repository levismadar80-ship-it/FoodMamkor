"""MEH-1938 chunk 5 follow-up — the owner chooses the primary; the system never guesses.

Three rules, all ruled by Sapir on 02/09, all NEW behaviour rather than
descriptions of what was already here:

  1. Deleting the primary while other locations remain is refused with 422 and
     the SAME message key the demote arm already uses — one invariant, one
     answer. It used to auto-promote the oldest surviving row with no kind
     filter, so deleting a branch could silently make a pickup point the
     business's navigation target.
  2. Deleting the LAST remaining location is allowed and leaves no primary.
  3. Promotion is explicit and BRANCH-ONLY. `market_stand` is excluded together
     with `pickup`: the repo classifies both as the secondary layer, hidden by
     the /map toggle, in four identical call sites (MEH-1412).

Plus the refinement recorded on MEH-1938: a delivery-only business whose only
rows are pickups has NO primary, and that is CORRECT rather than a defect —
`has_physical_location is False` is the owner's explicit MEH-213 declaration
that there is no physical presence to pin.
"""

from tests.conftest import auth_header, make_producer, make_user

from app.models.models import Producer, ProducerLocation
from app.routers.producer_me import ONE_PRIMARY_REQUIRED, PRIMARY_MUST_BE_BRANCH


def _producer_user(db, *, city="תל אביב", has_physical_location=None, **kwargs):
    producer = make_producer(db, city=city, **kwargs)
    # Not a make_producer kwarg — set on the instance. The delivery-only shape
    # is a SHAPE, not one flag: CHECK producer_location_mode (models.py:612)
    # requires `has_physical_location OR offers_delivery`, so the delivery
    # switch has to go on together with it, and lat/lng come off because a
    # business that declares no physical presence has no coordinates (MEH-213).
    if has_physical_location is False:
        producer.has_physical_location = False
        producer.offers_delivery = True
        producer.lat = None
        producer.lng = None
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _location(**overrides):
    payload = {
        "kind": "branch",
        "label": None,
        "city": "חיפה",
        "lat": 32.79,
        "lng": 34.98,
    }
    payload.update(overrides)
    return payload


def _add(client, user, **overrides):
    resp = client.post(
        "/producers/me/locations", json=_location(**overrides), headers=auth_header(user)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _rows(db, producer_id):
    db.expire_all()
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer_id)
        .all()
    )


class TestDeleteThePrimary:
    def test_refused_while_other_locations_remain(self, client, db):
        user, producer = _producer_user(db)
        primary = _add(client, user, label="ראשי")
        _add(client, user, kind="pickup", city="פרדס חנה", label="איסוף")

        resp = client.delete(
            f"/producers/me/locations/{primary['id']}", headers=auth_header(user)
        )

        assert resp.status_code == 422, resp.text
        # The same string the demote arm raises — one invariant, one voice.
        assert resp.json()["detail"] == ONE_PRIMARY_REQUIRED
        assert len(_rows(db, producer.id)) == 2, "a refused delete mutates nothing"

    def test_the_pickup_is_not_promoted(self, client, db):
        """The removed behaviour, pinned by its absence.

        Against the pre-change code this delete returned 204 and the pickup
        came back is_primary=True — the silent nav-target swap the ruling
        forbids.
        """
        user, producer = _producer_user(db)
        primary = _add(client, user)
        _add(client, user, kind="pickup", city="פרדס חנה")

        client.delete(
            f"/producers/me/locations/{primary['id']}", headers=auth_header(user)
        )

        rows = _rows(db, producer.id)
        assert sorted(r.kind for r in rows) == ["branch", "pickup"]
        assert [r.kind for r in rows if r.is_primary] == ["branch"]

    def test_a_non_primary_row_still_deletes(self, client, db):
        """The control. Without it every assertion above would also pass
        against an endpoint that refused every delete outright."""
        user, producer = _producer_user(db)
        _add(client, user)
        pickup = _add(client, user, kind="pickup", city="פרדס חנה")

        resp = client.delete(
            f"/producers/me/locations/{pickup['id']}", headers=auth_header(user)
        )

        assert resp.status_code == 204, resp.text
        assert [r.kind for r in _rows(db, producer.id)] == ["branch"]

    def test_the_last_remaining_location_deletes_and_leaves_no_primary(
        self, client, db
    ):
        user, producer = _producer_user(db)
        only = _add(client, user, city="חיפה")

        resp = client.delete(
            f"/producers/me/locations/{only['id']}", headers=auth_header(user)
        )

        assert resp.status_code == 204, resp.text
        assert _rows(db, producer.id) == []
        # Producer.city KEEPS its last value: 17 readers depend on it and a
        # NULL there is silent, so this path deliberately does not re-derive.
        db.expire_all()
        assert db.query(Producer).filter(Producer.id == producer.id).one().city == "חיפה"


class TestPromotionIsBranchOnly:
    def test_a_pickup_cannot_be_promoted(self, client, db):
        user, producer = _producer_user(db)
        _add(client, user)
        pickup = _add(client, user, kind="pickup", city="פרדס חנה")

        resp = client.put(
            f"/producers/me/locations/{pickup['id']}",
            json={"is_primary": True},
            headers=auth_header(user),
        )

        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == PRIMARY_MUST_BE_BRANCH
        assert [r.kind for r in _rows(db, producer.id) if r.is_primary] == ["branch"]

    def test_a_market_stand_cannot_be_promoted_either(self, client, db):
        """The case the first version of the ruling would have allowed.

        `market_stand` is grouped with `pickup` as the secondary layer in four
        identical call sites (MEH-1412), so promoting one would produce a
        primary whose own marker vanishes under the /map layer toggle.
        """
        user, producer = _producer_user(db)
        _add(client, user)
        stand = _add(client, user, kind="market_stand", city="פרדס חנה")

        resp = client.put(
            f"/producers/me/locations/{stand['id']}",
            json={"is_primary": True},
            headers=auth_header(user),
        )

        assert resp.status_code == 422, resp.text
        assert [r.kind for r in _rows(db, producer.id) if r.is_primary] == ["branch"]

    def test_promoting_a_branch_still_works(self, client, db):
        """The control for the guard: the sanctioned path is untouched, and the
        previous primary is demoted."""
        user, producer = _producer_user(db)
        first = _add(client, user, label="סניף א")
        second = _add(client, user, city="באר שבע", label="סניף ב")

        resp = client.put(
            f"/producers/me/locations/{second['id']}",
            json={"is_primary": True},
            headers=auth_header(user),
        )

        assert resp.status_code == 200, resp.text
        by_id = {str(r.id): r for r in _rows(db, producer.id)}
        assert by_id[second["id"]].is_primary is True
        assert by_id[first["id"]].is_primary is False


class TestCreateEnforcesBranchOnlyToo:
    """The create path is where the staging pickup-primary actually came from.

    Branch-only enforced only on update would be text in the code with a hole
    beside it — and the seed defect was not an outlier, it exercised behaviour
    the API had all along.

    Two cases, deliberately different (Sapir, 02/09).
    """

    def test_an_explicit_primary_on_a_pickup_is_refused(self, client, db):
        """Case 1. She asked for something the model forbids: say so.

        `is_primary` defaults to False on the create schema
        (schemas.py:1202), so True can only have come from the body.
        """
        user, producer = _producer_user(db)
        _add(client, user)

        resp = client.post(
            "/producers/me/locations",
            json=_location(kind="pickup", city="פרדס חנה", is_primary=True),
            headers=auth_header(user),
        )

        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == PRIMARY_MUST_BE_BRANCH
        assert [r.kind for r in _rows(db, producer.id) if r.is_primary] == ["branch"]

    def test_an_explicit_primary_on_a_market_stand_is_refused(self, client, db):
        user, producer = _producer_user(db)
        _add(client, user)

        resp = client.post(
            "/producers/me/locations",
            json=_location(kind="market_stand", city="פרדס חנה", is_primary=True),
            headers=auth_header(user),
        )

        assert resp.status_code == 422, resp.text
        assert [r.kind for r in _rows(db, producer.id) if r.is_primary] == ["branch"]

    def test_a_first_pickup_is_created_but_not_force_primary(self, client, db):
        """Case 2. Silent and correct, NOT a refusal.

        The distinction is the whole point: refusing here would block a valid
        business shape (delivery-only with one pickup point, MEH-213), while
        force-primarying it mints exactly the row branch-only forbids.
        """
        user, producer = _producer_user(db)

        resp = client.post(
            "/producers/me/locations",
            json=_location(kind="pickup", city="בנימינה", label="איסוף"),
            headers=auth_header(user),
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["is_primary"] is False
        rows = _rows(db, producer.id)
        assert [r.kind for r in rows] == ["pickup"]
        assert [r for r in rows if r.is_primary] == []

    def test_a_first_branch_is_still_force_primary(self, client, db):
        """The control. Without it the two assertions above would also pass
        against a create path that force-primaried NOTHING."""
        user, producer = _producer_user(db)

        resp = client.post(
            "/producers/me/locations",
            json=_location(city="חיפה"),
            headers=auth_header(user),
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["is_primary"] is True
        assert [r.kind for r in _rows(db, producer.id) if r.is_primary] == ["branch"]


class TestDeliveryOnlyHasNoPrimaryAndThatIsCorrect:
    """The refinement (Sapir, 02/09): "no primary" is two classes, not one.

    `has_physical_location is False` is the owner's explicit MEH-213
    declaration that there is nothing to pin. Pinning her pickup point would
    tell a visitor "the business is here", which is false. This is the shape
    `seed_demo_business.DELIVERY_ONLY_LOCATION` seeds, and the one row the
    pre-follow-up count found on staging (prod: 0) — a seed defect, since
    fixed, not owner data.
    """

    def test_a_pickup_only_delivery_business_has_no_primary(self, client, db):
        user, producer = _producer_user(db, has_physical_location=False)

        pickup = _add(client, user, kind="pickup", city="בנימינה", label="איסוף")

        rows = _rows(db, producer.id)
        assert [r.kind for r in rows] == ["pickup"]
        assert rows[0].is_primary is False, (
            "the first row is force-primary only for a business that claims a "
            "physical presence; a delivery-only business must stay unpinned"
        )
        assert pickup["is_primary"] is False

    def test_and_she_cannot_promote_it(self, client, db):
        """Belt and braces: the branch-only rule already refuses this, so a
        delivery-only owner cannot route around the above by promoting."""
        user, _ = _producer_user(db, has_physical_location=False)
        pickup = _add(client, user, kind="pickup", city="בנימינה")

        resp = client.put(
            f"/producers/me/locations/{pickup['id']}",
            json={"is_primary": True},
            headers=auth_header(user),
        )

        assert resp.status_code == 422, resp.text
