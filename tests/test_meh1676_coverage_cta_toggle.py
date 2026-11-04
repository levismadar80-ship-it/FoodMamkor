"""MEH-1676 — the owner can switch the «לא מגיעים אליך?» CTA off from the dashboard.

`producers.coverage_cta_enabled` exists since MEH-1677 (B1) and the public CTA
already honours it, but `ProducerUpdate` did not accept it, so PUT
/producers/me silently ignored the owner's choice. These pin: the owner can
turn it off and back on, the owner payload reflects it, and an explicit null
(the column is NOT NULL) is a 422, not a 500.
"""

from conftest import auth_header, make_producer, make_user


def _owner(db):
    user = make_user(db, role="producer")
    producer = make_producer(db)
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_owner_turns_the_coverage_cta_off_and_on(client, db):
    user, producer = _owner(db)
    assert producer.coverage_cta_enabled is True
    resp = client.put(
        "/producers/me", json={"coverage_cta_enabled": False}, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.coverage_cta_enabled is False
    assert (
        client.get("/producers/me", headers=auth_header(user)).json()[
            "coverage_cta_enabled"
        ]
        is False
    )
    resp = client.put(
        "/producers/me", json={"coverage_cta_enabled": True}, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.coverage_cta_enabled is True


def test_explicit_null_is_rejected(client, db):
    user, producer = _owner(db)
    resp = client.put(
        "/producers/me", json={"coverage_cta_enabled": None}, headers=auth_header(user)
    )
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.coverage_cta_enabled is True
