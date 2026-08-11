"""MEH-254 — producers.py GET /producers/{uuid} status filter.

Pending/rejected producers must not be exposed to anonymous or non-owner
callers. Only admins and the producer's owner may fetch by UUID; everyone
else gets a 404 so the UUID can't be used to enumerate queue state.
"""
from tests.conftest import auth_header, make_producer, make_user


def test_anonymous_sees_404_for_pending_producer(client, db):
    producer = make_producer(db, name="Pending Farm", status="pending")
    r = client.get(f"/producers/{producer.id}")
    assert r.status_code == 404


def test_anonymous_sees_404_for_rejected_producer(client, db):
    producer = make_producer(db, name="Rejected Farm", status="rejected")
    r = client.get(f"/producers/{producer.id}")
    assert r.status_code == 404


def test_anonymous_sees_200_for_approved_producer(client, db):
    producer = make_producer(db, name="Approved Farm", status="approved")
    r = client.get(f"/producers/{producer.id}")
    assert r.status_code == 200
    assert r.json()["name"] == "Approved Farm"


def test_admin_sees_pending_producer(client, db):
    producer = make_producer(db, name="Pending Farm", status="pending")
    admin = make_user(db, role="admin")
    r = client.get(f"/producers/{producer.id}", headers=auth_header(admin))
    assert r.status_code == 200
    assert r.json()["status"] == "pending"


def test_owner_sees_own_pending_producer(client, db):
    producer = make_producer(db, name="My Farm", status="pending")
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()
    r = client.get(f"/producers/{producer.id}", headers=auth_header(owner))
    assert r.status_code == 200


def test_non_owner_producer_sees_404_for_others_pending(client, db):
    a = make_producer(db, name="Farm A", status="pending")
    b = make_producer(db, name="Farm B", status="pending")
    user_b = make_user(db, role="producer")
    user_b.producer_id = b.id
    db.commit()
    r = client.get(f"/producers/{a.id}", headers=auth_header(user_b))
    assert r.status_code == 404


def test_consumer_sees_404_for_pending_producer(client, db):
    producer = make_producer(db, name="Pending Farm", status="pending")
    consumer = make_user(db, role="consumer")
    r = client.get(f"/producers/{producer.id}", headers=auth_header(consumer))
    assert r.status_code == 404
