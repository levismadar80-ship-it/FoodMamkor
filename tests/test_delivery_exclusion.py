"""
MEH-1255 Chunk B — delivery-exclusion mode ("משלוחים לכל הארץ חוץ מ:").

Covers the four acceptance cases plus the partial-update effective-state
guard and the admin write path:
  - owner PUT nationwide + excluded list -> persists
  - excluded without nationwide (explicit)  -> 422 (schema validator)
  - excluded alone while stored nationwide=false -> 422 (router guard —
    would otherwise hit the DB CHECK as a 500)
  - nationwide switched off while a stored exclusion list exists -> 422
  - GET /producers?delivery_city=X excludes a nationwide producer that
    excluded X, and returns it for a non-excluded city
  - area-based filtering unchanged (regression twin of
    tests/test_api.py::test_filter_by_delivery_city)

Tests live in tests/ (repo root) per repo convention — the ticket's
backend/tests/ path does not exist.

REUSES: tests/test_producer_me_delivery_fields.py (_producer_user
owner-wiring + location-mode payload pattern).
"""

from tests.conftest import auth_header, make_producer, make_user


def _producer_user(db, **kwargs):
    producer = make_producer(db, **kwargs)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _nationwide(db, name, excluded=None):
    producer = make_producer(db, name=name)
    producer.offers_delivery = True
    producer.delivery_nationwide = True
    producer.delivery_excluded_cities = excluded or []
    db.commit()
    return producer


def test_owner_put_persists_nationwide_with_exclusions(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "offers_delivery": True,
            "delivery_nationwide": True,
            "delivery_area_cities": [],
            "delivery_excluded_cities": ["אילת", "ערד"],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.delivery_nationwide is True
    assert producer.delivery_excluded_cities == ["אילת", "ערד"]


def test_excluded_without_nationwide_is_422(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={
            "offers_delivery": True,
            "delivery_nationwide": False,
            "delivery_excluded_cities": ["אילת"],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_excluded_alone_on_non_nationwide_producer_is_422(client, db):
    # Stored delivery_nationwide is false (default); the payload doesn't
    # mention it, so only the router's effective-state guard can catch this
    # before the DB CHECK turns it into a 500.
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"delivery_excluded_cities": ["אילת"]},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_nationwide_off_with_stored_exclusions_is_422(client, db):
    user, producer = _producer_user(db)
    producer.offers_delivery = True
    producer.delivery_nationwide = True
    producer.delivery_excluded_cities = ["אילת"]
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"delivery_nationwide": False},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_filter_excludes_nationwide_producer_for_excluded_city(client, db):
    _nationwide(db, "כל הארץ חוץ מאילת", excluded=["אילת"])

    resp = client.get("/producers", params={"delivery_city": "אילת"})
    assert resp.status_code == 200
    assert [p["name"] for p in resp.json()] == []


def test_filter_returns_nationwide_producer_for_non_excluded_city(client, db):
    _nationwide(db, "כל הארץ חוץ מאילת", excluded=["אילת"])

    resp = client.get("/producers", params={"delivery_city": "חיפה"})
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert names == ["כל הארץ חוץ מאילת"]

    body = resp.json()[0]
    assert body["delivery_excluded_cities"] == ["אילת"]


def test_filter_area_based_unchanged_and_composes_with_nationwide(client, db):
    make_producer(db, name="משלוחי חיפה", delivery_cities=["חיפה"])
    _nationwide(db, "ארצי בלי החרגות")

    resp = client.get("/producers", params={"delivery_city": "חיפה"})
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert names == {"משלוחי חיפה", "ארצי בלי החרגות"}

    resp = client.get("/producers", params={"delivery_city": "תל אביב"})
    names = {p["name"] for p in resp.json()}
    assert names == {"ארצי בלי החרגות"}


def test_admin_put_persists_exclusions(client, db):
    admin = make_user(db, role="admin")
    producer = make_producer(db, name="עסק לניהול")

    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={
            "offers_delivery": True,
            "delivery_nationwide": True,
            "delivery_area_cities": [],
            "delivery_excluded_cities": ["אילת"],
        },
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.delivery_excluded_cities == ["אילת"]


def _admin_create_payload(**overrides):
    payload = {
        "name": "עסק ארצי חדש",
        "description": "תיאור לעסק החדש",
        "city": "תל אביב",
        "category_ids": [],
        "has_physical_location": False,
        "offers_delivery": True,
        "delivery_nationwide": True,
        "delivery_area_cities": [],
    }
    payload.update(overrides)
    return payload


def test_admin_create_persists_exclusions(client, db):
    admin = make_user(db, role="admin")
    resp = client.post(
        "/admin/producers",
        json=_admin_create_payload(delivery_excluded_cities=["אילת"]),
        headers=auth_header(admin),
    )
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["delivery_excluded_cities"] == ["אילת"]


def test_admin_create_excluded_without_nationwide_is_422(client, db):
    admin = make_user(db, role="admin")
    resp = client.post(
        "/admin/producers",
        json=_admin_create_payload(
            has_physical_location=True,
            delivery_nationwide=False,
            delivery_excluded_cities=["אילת"],
        ),
        headers=auth_header(admin),
    )
    assert resp.status_code == 422, resp.text
