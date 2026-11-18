"""MEH-3333 — admin CRUD for a business's locations.

Covers:
  - auth: no token 401, consumer 403, producer (even the OWNER) 403, admin 200.
  - IDOR: a location of business B addressed under business A's path is 404
    and untouched; an unknown business is 404.
  - The owner rules hold for the admin too: branch-only primary (422),
    single primary, sole primary cannot be demoted or deleted while others
    remain, same-city needs a label (422).
  - Invalid input: bad kind / out-of-range coordinates → 422.
  - The public surfaces see an admin-added pickup point: detail `locations`
    and the `pickup_points` filter.
  - Owner endpoints unchanged: the owner still lists the admin-added row.
"""

import uuid

from tests.conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin")


def _owner_of(db, producer):
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user


def _pickup(**overrides):
    payload = {
        "kind": "pickup",
        "label": "חרובים 14 ג׳",
        "city": "פרדס חנה-כרכור",
        "address": "חרובים 14",
        "lat": 32.47,
        "lng": 34.97,
        "opening_hours": "שלישי 16:00-19:00",
    }
    payload.update(overrides)
    return payload


def _branch(**overrides):
    payload = {"kind": "branch", "city": "פרדס חנה-כרכור", "lat": 32.47, "lng": 34.97}
    payload.update(overrides)
    return payload


def _list_url(producer_id):
    return f"/admin/producers/{producer_id}/locations"


def _item_url(producer_id, location_id):
    return f"/admin/producers/{producer_id}/locations/{location_id}"


# --- auth -------------------------------------------------------------------


def test_no_token_is_401(client, db):
    producer = make_producer(db)
    assert client.get(_list_url(producer.id)).status_code == 401
    assert client.post(_list_url(producer.id), json=_pickup()).status_code == 401


def test_consumer_is_403(client, db):
    producer = make_producer(db)
    consumer = make_user(db, role="consumer")
    h = auth_header(consumer)
    assert client.get(_list_url(producer.id), headers=h).status_code == 403
    assert (
        client.post(_list_url(producer.id), json=_pickup(), headers=h).status_code
        == 403
    )


def test_owner_cannot_use_the_admin_route_even_for_her_own_business(client, db):
    producer = make_producer(db)
    owner = _owner_of(db, producer)
    h = auth_header(owner)
    assert (
        client.post(_list_url(producer.id), json=_pickup(), headers=h).status_code
        == 403
    )
    assert client.get(_list_url(producer.id), headers=h).status_code == 403


def test_non_admin_cannot_edit_or_delete_an_existing_location(client, db):
    producer = make_producer(db)
    admin = _admin(db)
    loc = client.post(
        _list_url(producer.id), json=_pickup(), headers=auth_header(admin)
    ).json()
    owner = _owner_of(db, producer)
    h = auth_header(owner)
    assert (
        client.put(
            _item_url(producer.id, loc["id"]), json={"label": "חדש מאוד"}, headers=h
        ).status_code
        == 403
    )
    assert (
        client.delete(_item_url(producer.id, loc["id"]), headers=h).status_code == 403
    )


# --- happy path + public surfaces ---------------------------------------------


def test_admin_adds_a_pickup_point_and_the_public_page_shows_it(client, db):
    producer = make_producer(db, city="פרדס חנה-כרכור")
    admin = _admin(db)
    resp = client.post(
        _list_url(producer.id), json=_pickup(), headers=auth_header(admin)
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kind"] == "pickup"
    # A pickup is never forced primary, even as the first row.
    assert body["is_primary"] is False

    detail = client.get(f"/producers/{producer.id}")
    assert detail.status_code == 200, detail.text
    kinds = [(loc["kind"], loc["label"]) for loc in detail.json()["locations"]]
    assert ("pickup", "חרובים 14 ג׳") in kinds

    listing = client.get("/producers", params={"pickup_points": "true"})
    assert listing.status_code == 200, listing.text
    payload = listing.json()
    items = payload["items"] if isinstance(payload, dict) else payload
    assert str(producer.id) in {p["id"] for p in items}


def test_admin_list_edit_delete_round_trip(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    loc = client.post(_list_url(producer.id), json=_pickup(), headers=h).json()

    listed = client.get(_list_url(producer.id), headers=h)
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [loc["id"]]

    edited = client.put(
        _item_url(producer.id, loc["id"]),
        json={"opening_hours": "רביעי 10:00-13:00"},
        headers=h,
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["opening_hours"] == "רביעי 10:00-13:00"

    assert (
        client.delete(_item_url(producer.id, loc["id"]), headers=h).status_code == 204
    )
    assert client.get(_list_url(producer.id), headers=h).json() == []


def test_owner_endpoint_still_lists_an_admin_added_row(client, db):
    producer = make_producer(db)
    client.post(_list_url(producer.id), json=_pickup(), headers=auth_header(_admin(db)))
    owner = _owner_of(db, producer)
    rows = client.get("/producers/me/locations", headers=auth_header(owner))
    assert rows.status_code == 200
    assert [r["kind"] for r in rows.json()] == ["pickup"]


# --- IDOR -------------------------------------------------------------------


def test_location_of_another_business_is_404_and_untouched(client, db):
    a = make_producer(db, name="בית עסק א")
    b = make_producer(db, name="בית עסק ב")
    h = auth_header(_admin(db))
    b_loc = client.post(_list_url(b.id), json=_pickup(), headers=h).json()

    put = client.put(
        _item_url(a.id, b_loc["id"]), json={"label": "נחטף בטעות"}, headers=h
    )
    assert put.status_code == 404
    assert client.delete(_item_url(a.id, b_loc["id"]), headers=h).status_code == 404

    still = client.get(_list_url(b.id), headers=h).json()
    assert [(r["id"], r["label"]) for r in still] == [(b_loc["id"], "חרובים 14 ג׳")]


def test_unknown_business_is_404(client, db):
    h = auth_header(_admin(db))
    missing = uuid.uuid4()
    assert client.get(_list_url(missing), headers=h).status_code == 404
    assert client.post(_list_url(missing), json=_pickup(), headers=h).status_code == 404


# --- the owner invariants hold for the admin ----------------------------------


def test_admin_cannot_create_a_non_branch_primary(client, db):
    producer = make_producer(db)
    resp = client.post(
        _list_url(producer.id),
        json=_pickup(is_primary=True),
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 422


def test_admin_cannot_promote_a_pickup_or_turn_the_primary_into_one(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    branch = client.post(_list_url(producer.id), json=_branch(), headers=h).json()
    assert branch["is_primary"] is True
    pickup = client.post(
        _list_url(producer.id), json=_pickup(city="זכרון יעקב"), headers=h
    ).json()

    assert (
        client.put(
            _item_url(producer.id, pickup["id"]), json={"is_primary": True}, headers=h
        ).status_code
        == 422
    )
    assert (
        client.put(
            _item_url(producer.id, branch["id"]), json={"kind": "pickup"}, headers=h
        ).status_code
        == 422
    )
    rows = {r["id"]: r for r in client.get(_list_url(producer.id), headers=h).json()}
    assert (
        rows[branch["id"]]["kind"] == "branch"
        and rows[branch["id"]]["is_primary"] is True
    )


def test_single_primary_and_city_sync(client, db):
    producer = make_producer(db, city="תל אביב")
    h = auth_header(_admin(db))
    first = client.post(
        _list_url(producer.id), json=_branch(city="תל אביב"), headers=h
    ).json()
    second = client.post(
        _list_url(producer.id),
        json=_branch(city="פרדס חנה-כרכור", is_primary=True),
        headers=h,
    )
    assert second.status_code == 201, second.text
    rows = {r["id"]: r for r in client.get(_list_url(producer.id), headers=h).json()}
    assert rows[first["id"]]["is_primary"] is False
    assert sum(1 for r in rows.values() if r["is_primary"]) == 1
    db.expire_all()
    db.refresh(producer)
    assert producer.city == "פרדס חנה-כרכור"


def test_sole_primary_cannot_be_demoted_or_deleted_while_others_remain(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    branch = client.post(_list_url(producer.id), json=_branch(), headers=h).json()
    client.post(_list_url(producer.id), json=_pickup(city="זכרון יעקב"), headers=h)
    assert (
        client.put(
            _item_url(producer.id, branch["id"]), json={"is_primary": False}, headers=h
        ).status_code
        == 422
    )
    assert (
        client.delete(_item_url(producer.id, branch["id"]), headers=h).status_code
        == 422
    )


def test_same_city_second_location_needs_a_label(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    client.post(_list_url(producer.id), json=_pickup(), headers=h)
    resp = client.post(_list_url(producer.id), json=_pickup(label=None), headers=h)
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "location_same_city_needs_label"
    ok = client.post(
        _list_url(producer.id), json=_pickup(label="חרובים 14 ד׳"), headers=h
    )
    assert ok.status_code == 201, ok.text


# --- invalid input ----------------------------------------------------------


def test_invalid_kind_and_coordinates_are_422(client, db):
    producer = make_producer(db)
    h = auth_header(_admin(db))
    assert (
        client.post(
            _list_url(producer.id), json=_pickup(kind="warehouse"), headers=h
        ).status_code
        == 422
    )
    assert (
        client.post(
            _list_url(producer.id), json=_pickup(lat=999), headers=h
        ).status_code
        == 422
    )
    assert client.get(_list_url(producer.id), headers=h).json() == []
