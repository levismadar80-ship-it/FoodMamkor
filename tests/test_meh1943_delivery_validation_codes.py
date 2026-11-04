"""
MEH-1943 chunk 3 — the two delivery_validation.py 422s carry
`{code, message, params}` (the MEH-1164 / MEH-1940 / chunk-1 shape).

Each case reaches the ROUTER guard, not the Pydantic validator: the payload is
a partial update whose contradiction exists only against the STORED row, which
a schema validator cannot see. So the detail asserted here is the one
services/delivery_validation.py builds, and nothing else.

`message` is the existing Hebrew sentence word for word (transition safety: a
consumer without a resolver still shows the same text it showed before).

Red on staging before this change: `detail` was a bare string, so every
equality below failed. Green after.
"""

from tests.conftest import auth_header, make_producer, make_user

EXCLUDED_DETAIL = {
    "code": "excluded_requires_nationwide",
    "message": "ערים מוחרגות אפשריות רק עם משלוחים לכל הארץ",
    "params": {},
}
NATIONWIDE_DETAIL = {
    "code": "nationwide_requires_delivery",
    "message": '"לכל הארץ" מסומן, אבל "משלוחים" לא. סמנו "משלוחים", או בטלו את "לכל הארץ".',
    "params": {},
}


def _owner(db, email):
    producer = make_producer(db, name="עסק 1943")
    user = make_user(db, email=email, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _admin(db):
    return make_user(db, email="admin-1943c@example.com", role="admin")


def test_owner_excluded_alone_on_non_nationwide_detail(client, db):
    """Stored delivery_nationwide=false; payload carries exclusions only."""
    user, _ = _owner(db, "owner-1943c-a@example.com")
    resp = client.put(
        "/producers/me",
        json={"delivery_excluded_cities": ["אילת"]},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == EXCLUDED_DETAIL


def test_owner_nationwide_off_with_stored_exclusions_detail(client, db):
    """Stored nationwide + exclusions; payload switches nationwide off only."""
    user, producer = _owner(db, "owner-1943c-b@example.com")
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
    assert resp.json()["detail"] == EXCLUDED_DETAIL


def test_owner_nationwide_without_stored_delivery_detail(client, db):
    """Stored offers_delivery=false; payload ticks nationwide only."""
    user, _ = _owner(db, "owner-1943c-c@example.com")
    resp = client.put(
        "/producers/me",
        json={"delivery_nationwide": True},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == NATIONWIDE_DETAIL


def test_admin_delivery_off_with_stored_nationwide_detail(client, db):
    """Admin PUT: stored nationwide+delivery; payload unticks delivery only."""
    admin = _admin(db)
    producer = make_producer(db, name="עסק ארצי 1943")
    producer.offers_delivery = True
    producer.delivery_nationwide = True
    db.commit()
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"offers_delivery": False, "has_physical_location": True},
        headers=auth_header(admin),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == NATIONWIDE_DETAIL
