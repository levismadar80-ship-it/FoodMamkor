"""MEH-2141 (MEH-1938 batch B2) — `Producer.city` follows the primary location.

Chunk 4 deleted the dashboard card that was the owner's only editor for
`Producer.city`. The CI reviewer flagged the gap on that PR: an owner who moves
her primary location to another town had no way to correct the city that the
listing filter, the free-text search, `/producers/cities`, the admin search,
`rank_in_city` and two admin emails all read.

Interim derived, not Contract — the column stays and all 14 readers stay live.

The five AC cases, and which class holds each:

  1. create a first (forced-primary) location  -> TestCreate
  2. update the primary's city                 -> TestUpdate
  3. promote another / delete the primary       -> TestPromote, TestDelete
  4. touch a NON-primary location               -> TestNonPrimaryIsInert
  5. delete the LAST location                   -> TestDelete (city keeps value)

Two further classes exist because the AC names them explicitly as things that
must NOT change: TestAdminPrecedence and TestSameCityInvariantUnaffected.
"""

from tests.conftest import auth_header, make_producer, make_user

from app.models.models import Producer


def _producer_user(db, *, name="חוות העיר", city="תל אביב"):
    producer = make_producer(db, name=name, city=city)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _base_location(**overrides):
    payload = {
        "kind": "branch",
        "label": None,
        "city": "חיפה",
        "lat": 32.79,
        "lng": 34.98,
    }
    payload.update(overrides)
    return payload


def _city_of(db, producer_id):
    """Re-read from the DB rather than trusting an in-session instance."""
    db.expire_all()
    return db.query(Producer).filter(Producer.id == producer_id).one().city


class TestCreate:
    def test_the_first_location_sets_the_producer_city(self, client, db):
        """Case 1. The factory seeds «תל אביב»; the location says «חיפה»."""
        user, producer = _producer_user(db, city="תל אביב")

        resp = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["is_primary"] is True
        assert _city_of(db, producer.id) == "חיפה"

    def test_a_created_city_is_stripped(self, client, db):
        """The column feeds `?city=` equality and a GROUP BY, so stray padding
        would silently fork one town into two."""
        user, producer = _producer_user(db)

        client.post(
            "/producers/me/locations",
            json=_base_location(city="  רעננה  "),
            headers=auth_header(user),
        )

        assert _city_of(db, producer.id) == "רעננה"

    def test_an_explicit_new_primary_moves_the_city(self, client, db):
        """Creating a SECOND location with is_primary=true demotes the first,
        so the city must follow the new primary — not stay on the old one."""
        user, producer = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה", label="סניף א"),
            headers=auth_header(user),
        )
        assert _city_of(db, producer.id) == "חיפה"

        resp = client.post(
            "/producers/me/locations",
            json=_base_location(city="באר שבע", is_primary=True),
            headers=auth_header(user),
        )

        assert resp.status_code == 201, resp.text
        assert _city_of(db, producer.id) == "באר שבע"

    def test_a_location_without_a_city_never_nulls_the_column(self, client, db):
        """`ProducerLocation.city` is `str | None` (schemas.py:1090), so this is
        a reachable state. A NULL here drops the business out of `?city=` and
        out of the region picker with no error anywhere."""
        user, producer = _producer_user(db, city="תל אביב")

        resp = client.post(
            "/producers/me/locations",
            json=_base_location(city=None),
            headers=auth_header(user),
        )

        assert resp.status_code == 201, resp.text
        assert _city_of(db, producer.id) == "תל אביב"


class TestUpdate:
    def test_editing_the_primary_city_syncs(self, client, db):
        """Case 2 — the whole reason this ticket exists."""
        user, producer = _producer_user(db)
        loc = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        ).json()

        resp = client.put(
            f"/producers/me/locations/{loc['id']}",
            json={"city": "נהריה"},
            headers=auth_header(user),
        )

        assert resp.status_code == 200, resp.text
        assert _city_of(db, producer.id) == "נהריה"

    def test_editing_a_non_city_field_on_the_primary_leaves_the_column(
        self, client, db
    ):
        """A phone edit is not a statement about where the business is.

        This is the discriminating case for the `"city" in patch` gate: an
        implementation that re-derived on every primary update would pass every
        other test in this file and fail only this one.
        """
        user, producer = _producer_user(db)
        loc = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        ).json()
        # Move the column out from under the location, the way an admin would.
        db.query(Producer).filter(Producer.id == producer.id).one().city = "אילת"
        db.commit()

        resp = client.put(
            f"/producers/me/locations/{loc['id']}",
            json={"phone": "0521234567"},
            headers=auth_header(user),
        )

        assert resp.status_code == 200, resp.text
        assert _city_of(db, producer.id) == "אילת"

    def test_clearing_the_primary_city_never_nulls_the_column(self, client, db):
        user, producer = _producer_user(db)
        loc = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        ).json()
        assert _city_of(db, producer.id) == "חיפה"

        resp = client.put(
            f"/producers/me/locations/{loc['id']}",
            json={"city": None},
            headers=auth_header(user),
        )

        assert resp.status_code == 200, resp.text
        assert _city_of(db, producer.id) == "חיפה", "the last known city must survive"


class TestPromote:
    def test_promoting_a_sibling_moves_the_city(self, client, db):
        """Case 3, the is_primary half.

        The sibling is a BRANCH. It was a pickup until the MEH-1938 follow-up
        (Sapir, 02/09) made promotion branch-only — a pickup here now answers
        422 and the case would be testing the refusal instead of the property.
        The property under test is unchanged: the city follows the new primary.
        """
        user, producer = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        )
        second = client.post(
            "/producers/me/locations",
            json=_base_location(city="אשדוד", label="סניף אשדוד"),
            headers=auth_header(user),
        ).json()
        assert _city_of(db, producer.id) == "חיפה"

        resp = client.put(
            f"/producers/me/locations/{second['id']}",
            json={"is_primary": True},
            headers=auth_header(user),
        )

        assert resp.status_code == 200, resp.text
        assert _city_of(db, producer.id) == "אשדוד"

    def test_demoting_the_sole_primary_is_still_rejected(self, client, db):
        """Pre-existing 422 must survive — and the column must not move on a
        request that was refused."""
        user, producer = _producer_user(db)
        loc = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        ).json()

        resp = client.put(
            f"/producers/me/locations/{loc['id']}",
            json={"is_primary": False},
            headers=auth_header(user),
        )

        assert resp.status_code == 422, resp.text
        assert _city_of(db, producer.id) == "חיפה"


class TestDelete:
    def test_deleting_the_primary_is_refused_so_the_city_cannot_move(
        self, client, db
    ):
        """Case 3, the delete half — INVERTED by ruling (Sapir, 02/09).

        This test used to assert that deleting the primary promoted the oldest
        survivor and the city followed it. That auto-promotion is gone: the
        system does not guess which location becomes primary, the owner
        chooses. So the delete is refused with the same 422 and message key as
        the demote arm, and the city column cannot move because nothing
        happened.

        The write-through property this file exists for is unaffected and is
        still covered — by TestPromote above, on an explicit promotion.
        """
        user, producer = _producer_user(db)
        first = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        ).json()
        client.post(
            "/producers/me/locations",
            json=_base_location(city="אשדוד", kind="pickup"),
            headers=auth_header(user),
        )
        assert _city_of(db, producer.id) == "חיפה"

        resp = client.delete(
            f"/producers/me/locations/{first['id']}", headers=auth_header(user)
        )

        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == "חובה מיקום ראשי אחד"
        assert _city_of(db, producer.id) == "חיפה"

    def test_deleting_the_LAST_location_keeps_the_last_city(self, client, db):
        """Case 5. Fourteen readers have no equivalent in `producer_locations`,
        so a NULL here is a silent disappearance, not a neutral 'unknown'."""
        user, producer = _producer_user(db, city="תל אביב")
        loc = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        ).json()
        assert _city_of(db, producer.id) == "חיפה"

        resp = client.delete(
            f"/producers/me/locations/{loc['id']}", headers=auth_header(user)
        )

        assert resp.status_code == 204, resp.text
        assert _city_of(db, producer.id) == "חיפה"
        assert _city_of(db, producer.id) is not None

    def test_deleting_a_non_primary_leaves_the_column(self, client, db):
        user, producer = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        )
        second = client.post(
            "/producers/me/locations",
            json=_base_location(city="אשדוד", kind="pickup"),
            headers=auth_header(user),
        ).json()
        db.query(Producer).filter(Producer.id == producer.id).one().city = "אילת"
        db.commit()

        client.delete(
            f"/producers/me/locations/{second['id']}", headers=auth_header(user)
        )

        assert _city_of(db, producer.id) == "אילת"


class TestNonPrimaryIsInert:
    """Case 4, given its own class because it is the boundary that protects
    admin authority. Each test moves `Producer.city` away from the primary's
    city first, so an over-eager re-derive is VISIBLE rather than a no-op
    assignment of the same string."""

    def test_creating_a_non_primary_location_leaves_the_column(self, client, db):
        user, producer = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        )
        db.query(Producer).filter(Producer.id == producer.id).one().city = "אילת"
        db.commit()

        resp = client.post(
            "/producers/me/locations",
            json=_base_location(city="אשדוד", kind="pickup"),
            headers=auth_header(user),
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["is_primary"] is False
        assert _city_of(db, producer.id) == "אילת"

    def test_editing_a_non_primary_city_leaves_the_column(self, client, db):
        user, producer = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        )
        second = client.post(
            "/producers/me/locations",
            json=_base_location(city="אשדוד", kind="pickup"),
            headers=auth_header(user),
        ).json()
        db.query(Producer).filter(Producer.id == producer.id).one().city = "אילת"
        db.commit()

        resp = client.put(
            f"/producers/me/locations/{second['id']}",
            json={"city": "רחובות"},
            headers=auth_header(user),
        )

        assert resp.status_code == 200, resp.text
        assert _city_of(db, producer.id) == "אילת", (
            "editing a non-primary location must never re-derive the column"
        )


class TestAdminPrecedence:
    """The AC requires admin's direct write to be untouched. Asserted as
    behaviour — that an admin value survives an unrelated owner edit — rather
    than by reading `admin.py`, which this PR does not change."""

    def test_an_admin_set_city_survives_an_unrelated_owner_edit(self, client, db):
        user, producer = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        )
        db.query(Producer).filter(Producer.id == producer.id).one().city = "ירושלים"
        db.commit()

        second = client.post(
            "/producers/me/locations",
            json=_base_location(city="אשדוד", kind="pickup"),
            headers=auth_header(user),
        ).json()
        client.put(
            f"/producers/me/locations/{second['id']}",
            json={"phone": "0521234567"},
            headers=auth_header(user),
        )

        assert _city_of(db, producer.id) == "ירושלים"

    def test_the_owner_moving_her_primary_DOES_override_it(self, client, db):
        """The one ordering that beats an admin value, asserted so the trade is
        recorded as intended rather than discovered later.

        At the moment an owner moves her own primary location, that row is the
        fresher statement of where the business is.
        """
        user, producer = _producer_user(db)
        loc = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        ).json()
        db.query(Producer).filter(Producer.id == producer.id).one().city = "ירושלים"
        db.commit()

        client.put(
            f"/producers/me/locations/{loc['id']}",
            json={"city": "נהריה"},
            headers=auth_header(user),
        )

        assert _city_of(db, producer.id) == "נהריה"


class TestSameCityInvariantUnaffected:
    """`_reject_same_city_without_label` must behave exactly as before — the AC
    says to assert this, not assume it."""

    def test_a_second_location_in_the_same_city_still_422s_without_a_label(
        self, client, db
    ):
        user, producer = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        )

        resp = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה", label=None, kind="pickup"),
            headers=auth_header(user),
        )

        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"]["code"] == "location_same_city_needs_label"
        # A refused request must not have moved the column either.
        assert _city_of(db, producer.id) == "חיפה"

    def test_the_same_city_with_a_label_is_accepted_and_stays_non_primary(
        self, client, db
    ):
        user, producer = _producer_user(db)
        client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה"),
            headers=auth_header(user),
        )

        resp = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה", label="הדוכן", kind="pickup"),
            headers=auth_header(user),
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["is_primary"] is False
        assert _city_of(db, producer.id) == "חיפה"

    def test_the_first_location_is_never_blocked_by_the_rule(self, client, db):
        """A producer's FIRST location has no sibling, so it must be creatable
        without a label even though the write-through now runs on that path."""
        user, producer = _producer_user(db)

        resp = client.post(
            "/producers/me/locations",
            json=_base_location(city="חיפה", label=None),
            headers=auth_header(user),
        )

        assert resp.status_code == 201, resp.text
        assert _city_of(db, producer.id) == "חיפה"
