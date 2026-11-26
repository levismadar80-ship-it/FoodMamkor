"""MEH-3876 — GET /admin/producers/{id}/experiences: the list behind the
experiences panel on the admin edit page.

Behaviour only (testing.md MEH-3531): each case calls the route and asserts
what came back.
"""

import uuid
from datetime import timedelta

from app.models.models import Experience
from app.utils.clock import israel_today
from conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin", email="admin-3876@example.com")


def _owner_of(db, producer, *, email):
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


def _payload(title: str) -> dict:
    return {
        "title": title,
        "description": "סדנה מעשית של שעתיים: מכינות ריבה מפירות שנקטפו באותו בוקר.",
        "category": "בישול",
        "event_date": (israel_today() + timedelta(days=14)).isoformat(),
        "location_type": "public",
        "city": "גבעת עדה",
        "max_participants": 10,
        "is_recurring": False,
        "owner_consent": True,
    }


def _create(client, admin, producer, title):
    resp = client.post(
        f"/admin/producers/{producer.id}/experiences",
        json=_payload(title),
        headers=auth_header(admin),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _list(client, user, producer_id):
    return client.get(
        f"/admin/producers/{producer_id}/experiences", headers=auth_header(user)
    )


def test_business_with_no_owner_account_lists_nothing(client, db):
    producer = make_producer(db, status="approved")
    resp = _list(client, _admin(db), producer.id)
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_lists_the_business_experiences_newest_first_with_status(client, db):
    producer = make_producer(db, status="approved")
    _owner_of(db, producer, email="owner-3876@example.com")
    admin = _admin(db)
    _create(client, admin, producer, "סדנת ריבות ראשונה")
    _create(client, admin, producer, "סדנת ריבות שנייה")

    resp = _list(client, admin, producer.id)

    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert [r["title"] for r in rows] == ["סדנת ריבות שנייה", "סדנת ריבות ראשונה"]
    # An admin-written experience waits in the normal queue (MEH-3873), and the
    # panel shows that, so the detail shape must carry the status.
    assert {r["status"] for r in rows} == {"pending"}


def test_another_business_experiences_are_not_listed(client, db):
    mine = make_producer(db, status="approved", name="משק שלי")
    other = make_producer(db, status="approved", name="משק אחר")
    _owner_of(db, mine, email="owner-mine-3876@example.com")
    _owner_of(db, other, email="owner-other-3876@example.com")
    admin = _admin(db)
    _create(client, admin, other, "סדנה של עסק אחר")

    resp = _list(client, admin, mine.id)

    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_unknown_business_is_404(client, db):
    resp = _list(client, _admin(db), uuid.uuid4())
    assert resp.status_code == 404


def test_the_business_owner_is_refused(client, db):
    producer = make_producer(db, status="approved")
    owner = _owner_of(db, producer, email="owner-403-3876@example.com")
    resp = _list(client, owner, producer.id)
    assert resp.status_code == 403


def test_every_status_and_a_cancelled_one_are_listed(client, db):
    producer = make_producer(db, status="approved")
    _owner_of(db, producer, email="owner-status-3876@example.com")
    admin = _admin(db)
    ids = [_create(client, admin, producer, f"סדנה מספר {n}")["id"] for n in range(4)]
    rows = {str(r.id): r for r in db.query(Experience).filter(Experience.id.in_(ids)).all()}
    rows[ids[0]].status = "approved"
    rows[ids[1]].status = "rejected"
    rows[ids[2]].status = "changes_requested"
    rows[ids[3]].is_active = False
    db.commit()

    resp = _list(client, admin, producer.id)

    assert resp.status_code == 200, resp.text
    by_id = {r["id"]: r for r in resp.json()}
    assert set(by_id) == set(ids)
    assert by_id[ids[0]]["status"] == "approved"
    assert by_id[ids[1]]["status"] == "rejected"
    assert by_id[ids[2]]["status"] == "changes_requested"
    assert by_id[ids[3]]["is_active"] is False


def test_experiences_of_a_second_account_of_the_business_are_listed(client, db):
    producer = make_producer(db, status="approved")
    _owner_of(db, producer, email="owner-a-3876@example.com")
    second = _owner_of(db, producer, email="owner-b-3876@example.com")
    admin = _admin(db)
    made = _create(client, admin, producer, "סדנה של החשבון הראשון")
    row = db.get(Experience, made["id"])
    row.host_user_id = second.id
    db.commit()

    resp = _list(client, admin, producer.id)

    assert [r["title"] for r in resp.json()] == ["סדנה של החשבון הראשון"]


def test_no_token_is_401(client, db):
    producer = make_producer(db, status="approved")
    resp = client.get(f"/admin/producers/{producer.id}/experiences")
    assert resp.status_code == 401
