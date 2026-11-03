"""MEH-2272 chunk 2 — the untyped producer-me responses stop carrying the
legacy availability pair.

Chunk 1 took ``is_available_today`` / ``availability_status`` off the typed
contract (ProducerListOut and friends). Three dict responses in
routers/producer_me.py still derived them from the enum: the legacy toggle,
the legacy status endpoint and GET /producers/me/dashboard. Nothing in the
frontend reads them (the dashboard reads ``availability_state`` only), so they
go, and ``schemas.state_to_legacy`` goes with its last callers.

Each case asserts the key is ABSENT and that ``availability_state`` is still
there and correct — an absence check alone would also pass on a 500 body or an
empty dict.
"""

from datetime import timedelta

from conftest import auth_header, make_producer, make_user

from app.utils.clock import israel_today

LEGACY = ("is_available_today", "availability_status")


def _owner(db):
    user = make_user(db, role="producer")
    producer = make_producer(db)
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_toggle_response_has_no_legacy_keys(client, db):
    user, _ = _owner(db)
    resp = client.post("/producers/me/availability", headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["availability_state"] == "available_today"
    for key in LEGACY:
        assert key not in body, key


def test_status_response_has_no_legacy_keys(client, db):
    user, _ = _owner(db)
    future = (israel_today() + timedelta(days=7)).isoformat()
    resp = client.post(
        "/producers/me/availability-status",
        json={"status": "vacation", "vacation_until": future},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["availability_state"] == "on_vacation"
    assert body["vacation_until"] == future
    for key in LEGACY:
        assert key not in body, key


def test_dashboard_producer_block_has_no_legacy_keys(client, db):
    user, producer = _owner(db)
    producer.availability_state = "full_this_week"
    db.commit()
    resp = client.get("/producers/me/dashboard", headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    block = resp.json()["producer"]
    assert block["availability_state"] == "full_this_week"
    for key in LEGACY:
        assert key not in block, key


def test_state_to_legacy_is_gone():
    """The helper's last callers were the three responses above."""
    from app.schemas import schemas

    assert not hasattr(schemas, "state_to_legacy")
    assert not hasattr(schemas, "_STATE_TO_LEGACY")
