"""MEH-1421 (MEH-1388 chunk 4a): owner-scoped producer_locations CRUD.

Covers the sensitive permission + invariant logic that drove the Opus upgrade:
  - IDOR: a cross-owner location id is a 403 (not 404); a non-producer role is
    403'd by require_producer; a genuinely missing id is 404.
  - Single-primary: first create forced primary; setting one primary clears the
    others; the sole primary cannot be demoted directly; deleting the primary
    promotes the oldest survivor.
  - Same-city label rule (422) + coordinate bounds (422).

Pattern mirrors tests/test_producer_me_delivery_fields.py (make_producer +
make_user(role="producer") + user.producer_id link).
"""

from tests.conftest import auth_header, make_producer, make_user


def _producer_user(db, *, name="חוות המיקומים"):
    producer = make_producer(db, name=name)
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


# --- single-primary invariant ------------------------------------------------


def test_create_first_location_is_forced_primary(client, db):
    user, _ = _producer_user(db)
    resp = client.post(
        "/producers/me/locations",
        json=_base_location(is_primary=False),
        headers=auth_header(user),
    )
    assert resp.status_code == 201, resp.text
    # First location is always primary even when is_primary=false was sent.
    assert resp.json()["is_primary"] is True


def test_second_primary_clears_the_first(client, db):
    user, _ = _producer_user(db)
    first = client.post(
        "/producers/me/locations",
        json=_base_location(city="חיפה", label="סניף א"),
        headers=auth_header(user),
    ).json()
    second = client.post(
        "/producers/me/locations",
        json=_base_location(city="תל אביב", is_primary=True),
        headers=auth_header(user),
    )
    assert second.status_code == 201, second.text
    assert second.json()["is_primary"] is True

    # The originally-primary first location must have been cleared.
    listing = client.get("/producers/me/locations", headers=auth_header(user)).json()
    by_id = {loc["id"]: loc for loc in listing}
    assert by_id[first["id"]]["is_primary"] is False
    assert sum(1 for loc in listing if loc["is_primary"]) == 1


def test_cannot_demote_the_sole_primary(client, db):
    user, _ = _producer_user(db)
    loc = client.post(
        "/producers/me/locations",
        json=_base_location(),
        headers=auth_header(user),
    ).json()
    resp = client.put(
        f"/producers/me/locations/{loc['id']}",
        json={"is_primary": False},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_delete_primary_is_refused_while_a_survivor_remains(client, db):
    """INVERTED by ruling (Sapir, 02/09) — was
    `test_delete_primary_promotes_oldest_survivor`.

    Deleting the primary used to promote the oldest surviving row, with no
    kind filter, so deleting a branch could silently make a pickup point the
    business's navigation target. The system no longer guesses: the owner
    promotes another location first, and until she does the delete is refused
    with the same 422 and message key as the demote arm.

    Nothing is mutated by the refusal — both rows survive, and the primary is
    still the primary.
    """
    user, _ = _producer_user(db)
    primary = client.post(
        "/producers/me/locations",
        json=_base_location(city="חיפה", label="ראשי"),
        headers=auth_header(user),
    ).json()
    survivor = client.post(
        "/producers/me/locations",
        json=_base_location(city="תל אביב", label="משני"),
        headers=auth_header(user),
    ).json()
    assert primary["is_primary"] is True
    assert survivor["is_primary"] is False

    resp = client.delete(
        f"/producers/me/locations/{primary['id']}",
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    # MEH-1943: the 422 is {code, message, params}; the sentence is unchanged.
    assert resp.json()["detail"]["code"] == "one_primary_required"
    assert resp.json()["detail"]["message"] == "חובה מיקום ראשי אחד"

    listing = client.get("/producers/me/locations", headers=auth_header(user)).json()
    assert len(listing) == 2, "a refused delete removes nothing"
    by_id = {row["id"]: row for row in listing}
    assert by_id[primary["id"]]["is_primary"] is True
    assert by_id[survivor["id"]]["is_primary"] is False


# --- IDOR --------------------------------------------------------------------


def test_cross_owner_put_is_403(client, db):
    owner, _ = _producer_user(db, name="בעלים א")
    other, _ = _producer_user(db, name="בעלים ב")
    loc = client.post(
        "/producers/me/locations",
        json=_base_location(),
        headers=auth_header(owner),
    ).json()
    # Producer B tries to edit producer A's location → 403 (exists, not owned).
    resp = client.put(
        f"/producers/me/locations/{loc['id']}",
        json={"label": "חטיפה"},
        headers=auth_header(other),
    )
    assert resp.status_code == 403, resp.text


def test_cross_owner_delete_is_403(client, db):
    owner, _ = _producer_user(db, name="בעלים א")
    other, _ = _producer_user(db, name="בעלים ב")
    loc = client.post(
        "/producers/me/locations",
        json=_base_location(),
        headers=auth_header(owner),
    ).json()
    resp = client.delete(
        f"/producers/me/locations/{loc['id']}",
        headers=auth_header(other),
    )
    assert resp.status_code == 403, resp.text


def test_missing_location_is_404(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me/locations/00000000-0000-0000-0000-000000000000",
        json={"label": "חדש"},
        headers=auth_header(user),
    )
    assert resp.status_code == 404, resp.text


def test_non_producer_role_is_403(client, db):
    consumer = make_user(db, role="consumer")
    resp = client.get("/producers/me/locations", headers=auth_header(consumer))
    assert resp.status_code == 403, resp.text


# --- validators --------------------------------------------------------------


def test_same_city_second_location_requires_label(client, db):
    user, _ = _producer_user(db)
    client.post(
        "/producers/me/locations",
        json=_base_location(city="חיפה", label="סניף א"),
        headers=auth_header(user),
    )
    # Second location in the same city with NO label → 422.
    no_label = client.post(
        "/producers/me/locations",
        json=_base_location(city="חיפה", label=None),
        headers=auth_header(user),
    )
    assert no_label.status_code == 422, no_label.text

    # Same city WITH a label → allowed.
    with_label = client.post(
        "/producers/me/locations",
        json=_base_location(city="חיפה", label="סניף ב"),
        headers=auth_header(user),
    )
    assert with_label.status_code == 201, with_label.text


def test_primary_toggle_does_not_retrigger_same_city_rule(client, db):
    # Regression (adversarial-review-errors): a pure is_primary toggle on a
    # label-less FIRST location must NOT be rejected just because a labeled
    # sibling shares its city — the same-city rule only applies when the update
    # actually changes city/label.
    user, _ = _producer_user(db)
    first = client.post(  # first in חיפה, no label → allowed, primary
        "/producers/me/locations",
        json=_base_location(city="חיפה", label=None),
        headers=auth_header(user),
    ).json()
    client.post(  # second in חיפה WITH a label → allowed
        "/producers/me/locations",
        json=_base_location(city="חיפה", label="סניף ב", is_primary=True),
        headers=auth_header(user),
    )
    # Toggle the label-less first location back to primary — must succeed.
    resp = client.put(
        f"/producers/me/locations/{first['id']}",
        json={"is_primary": True},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_primary"] is True


def test_coordinate_out_of_bounds_is_422(client, db):
    user, _ = _producer_user(db)
    resp = client.post(
        "/producers/me/locations",
        json=_base_location(lat=200.0, lng=34.98),
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_invalid_kind_is_422(client, db):
    user, _ = _producer_user(db)
    resp = client.post(
        "/producers/me/locations",
        json=_base_location(kind="warehouse"),
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


# --- MEH-3342 findings 1 + 2 (16/11 review leftovers) ------------------------
#
# Finding 1: the branch-only rule on a primary was enforced only on PROMOTION
# (`want_primary is True`), so `PUT {"kind": "pickup"}` on a row that is
# ALREADY primary returned 200 and left a primary that is not a branch — the
# third answer to "where is the business" that MEH-1938's note says must have
# one. The owner dashboard offers that exact edit (LocationsEditor.jsx's kind
# picker), so it is reachable without hand-writing an API call.
#
# Finding 2: `kind` and `location_precision` are NOT NULL columns
# (models/catalog.py:231, :244) whose update schema accepts null, and the
# handler applies the patch with `exclude_unset=True` — so an explicit null IS
# "supplied", reaches `setattr`, and becomes an IntegrityError and a 500.
# `location_precision` is the sibling the card did not name; the Bug Protocol's
# grep-for-siblings step found it in the same model. `is_primary` is NOT NULL
# too but is `pop`ped from the patch, so an explicit null there reads as
# "unsupplied" and is a no-op, not a 500 — left as it is, deliberately.


def _primary_of(client, user):
    rows = client.get("/producers/me/locations", headers=auth_header(user)).json()
    return next(r for r in rows if r["is_primary"])


def test_primary_cannot_be_turned_into_a_pickup_point(client, db):
    """Finding 1 — the invariant has to hold on EDIT, not only on promotion."""
    user, _ = _producer_user(db)
    client.post(
        "/producers/me/locations", json=_base_location(), headers=auth_header(user)
    )
    primary = _primary_of(client, user)

    resp = client.put(
        f"/producers/me/locations/{primary['id']}",
        json={"kind": "pickup"},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    # The row is untouched — a rejected edit must not half-apply.
    assert _primary_of(client, user)["kind"] == "branch"


def test_primary_cannot_be_turned_into_a_market_stand(client, db):
    """The other secondary-layer kind, for the same reason (MEH-1938)."""
    user, _ = _producer_user(db)
    client.post(
        "/producers/me/locations", json=_base_location(), headers=auth_header(user)
    )
    primary = _primary_of(client, user)

    resp = client.put(
        f"/producers/me/locations/{primary['id']}",
        json={"kind": "market_stand"},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_a_non_primary_location_may_still_become_a_pickup_point(client, db):
    """CONTROL — the fix must not forbid the ordinary edit. Without this a
    blanket «kind must be branch» would pass both tests above while breaking
    the feature the kind picker exists for."""
    user, _ = _producer_user(db)
    client.post(
        "/producers/me/locations", json=_base_location(), headers=auth_header(user)
    )
    second = client.post(
        "/producers/me/locations",
        json=_base_location(city="עכו", label="סניף עכו", is_primary=False),
        headers=auth_header(user),
    )
    assert second.status_code == 201, second.text

    resp = client.put(
        f"/producers/me/locations/{second.json()['id']}",
        json={"kind": "pickup"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["kind"] == "pickup"


def test_the_primary_may_still_be_edited_and_re_set_to_branch(client, db):
    """CONTROL — an edit that keeps the invariant is still a 200."""
    user, _ = _producer_user(db)
    client.post(
        "/producers/me/locations", json=_base_location(), headers=auth_header(user)
    )
    primary = _primary_of(client, user)

    resp = client.put(
        f"/producers/me/locations/{primary['id']}",
        json={"kind": "branch", "phone": "050-1234567"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["kind"] == "branch"


def test_explicit_null_kind_is_422_not_500(client, db):
    """Finding 2 — a NOT NULL column must refuse null at the schema, not at the
    database. A 500 here is an unhandled IntegrityError."""
    user, _ = _producer_user(db)
    client.post(
        "/producers/me/locations", json=_base_location(), headers=auth_header(user)
    )
    primary = _primary_of(client, user)

    resp = client.put(
        f"/producers/me/locations/{primary['id']}",
        json={"kind": None},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_explicit_null_location_precision_is_422_not_500(client, db):
    """Finding 2's sibling, found by the grep the Bug Protocol asks for:
    `location_precision` is NOT NULL too and had the same hole."""
    user, _ = _producer_user(db)
    client.post(
        "/producers/me/locations", json=_base_location(), headers=auth_header(user)
    )
    primary = _primary_of(client, user)

    resp = client.put(
        f"/producers/me/locations/{primary['id']}",
        json={"location_precision": None},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_omitting_kind_entirely_is_still_a_partial_update(client, db):
    """CONTROL — rejecting an explicit null must not break «unsupplied means
    leave it alone», which is the whole contract of this endpoint (MEH-1421).
    A validator declared with `validate_default=True` would fail this."""
    user, _ = _producer_user(db)
    client.post(
        "/producers/me/locations", json=_base_location(), headers=auth_header(user)
    )
    primary = _primary_of(client, user)

    resp = client.put(
        f"/producers/me/locations/{primary['id']}",
        json={"city": "נהריה"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["kind"] == "branch"
    assert resp.json()["location_precision"] == "exact"
