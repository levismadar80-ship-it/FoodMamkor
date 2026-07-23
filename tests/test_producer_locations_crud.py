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


def test_delete_primary_promotes_oldest_survivor(client, db):
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
    assert resp.status_code == 204, resp.text

    listing = client.get("/producers/me/locations", headers=auth_header(user)).json()
    assert len(listing) == 1
    assert listing[0]["id"] == survivor["id"]
    assert listing[0]["is_primary"] is True


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
