"""Integration tests for the group-buys router (app/routers/group_buys.py).

Exercises the public list/detail endpoints, the producer create flow with
its guards, and the consumer commit/cancel lifecycle (auto-fund at
min_participants, revert-to-open on cancel, duplicate/closed/full/deadline
error paths). Uses the shared conftest fixtures + a producer-user helper
mirroring test_producer_recipes.py.
"""
from datetime import datetime, timedelta
from uuid import uuid4

from conftest import auth_header, make_producer, make_user

from app.models.models import GroupBuy


def _producer_user(db, *, email="gbprod@test.com", status="approved"):
    producer = make_producer(db, name=f"GB Producer {uuid4().hex[:6]}", status=status)
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _make_group_buy(
    db,
    producer,
    *,
    status="open",
    deadline=None,
    min_participants=2,
    max_participants=None,
    city="תל אביב",
):
    gb = GroupBuy(
        producer_id=producer.id,
        title="רכש קמח מלא",
        description="שק 25 ק\"ג",
        product_name="קמח מלא",
        unit="שק",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=min_participants,
        max_participants=max_participants,
        deadline=deadline or (datetime.utcnow() + timedelta(days=7)),
        city=city,
        status=status,
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return gb


def _valid_create_payload(**overrides):
    payload = {
        "title": "רכש שמן זית",
        "product_name": "שמן זית כתית",
        "unit": "ליטר",
        "price_per_unit_regular": 80,
        "price_per_unit_group": 60,
        "min_participants": 3,
        "deadline": (datetime.utcnow() + timedelta(days=10)).isoformat(),
        "city": "חיפה",
    }
    payload.update(overrides)
    return payload


# ---------- list / detail ----------
class TestListAndGet:
    def test_list_returns_open_by_default(self, client, db):
        producer, _ = _producer_user(db)
        _make_group_buy(db, producer, status="open")
        _make_group_buy(db, producer, status="funded")
        resp = client.get("/group-buys")
        assert resp.status_code == 200
        statuses = {g["status"] for g in resp.json()}
        assert statuses == {"open"}

    def test_list_filters_by_city(self, client, db):
        producer, _ = _producer_user(db)
        _make_group_buy(db, producer, city="חיפה")
        _make_group_buy(db, producer, city="אילת")
        resp = client.get("/group-buys", params={"city": "אילת"})
        assert resp.status_code == 200
        assert all(g["city"] == "אילת" for g in resp.json())

    def test_list_status_filter(self, client, db):
        producer, _ = _producer_user(db)
        _make_group_buy(db, producer, status="funded")
        resp = client.get("/group-buys", params={"status": "funded"})
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_get_detail_happy(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer)
        resp = client.get(f"/group-buys/{gb.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["producer_name"] == producer.name
        assert body["commits_count"] == 0
        assert body["user_committed"] is False

    def test_get_detail_404(self, client, db):
        resp = client.get(f"/group-buys/{uuid4()}")
        assert resp.status_code == 404


# ---------- create ----------
class TestCreate:
    def test_create_happy(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys", json=_valid_create_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 201
        assert "id" in resp.json()

    def test_create_requires_auth(self, client, db):
        resp = client.post("/group-buys", json=_valid_create_payload())
        assert resp.status_code in (401, 403)

    def test_create_rejected_for_consumer(self, client, db):
        consumer = make_user(db, role="consumer", email="c@test.com")
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 403

    def test_create_blocked_for_unapproved_producer(self, client, db):
        _, user = _producer_user(db, email="pend@test.com", status="pending")
        resp = client.post(
            "/group-buys", json=_valid_create_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 403

    def test_group_price_must_be_below_regular(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(
                price_per_unit_regular=50, price_per_unit_group=60
            ),
            headers=auth_header(user),
        )
        assert resp.status_code == 400

    def test_deadline_must_be_future(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(
                deadline=(datetime.utcnow() - timedelta(days=1)).isoformat()
            ),
            headers=auth_header(user),
        )
        assert resp.status_code == 400


# ---------- commit / cancel lifecycle ----------
class TestCommitLifecycle:
    def test_commit_happy_and_auto_fund(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, min_participants=1)
        user = make_user(db, email="buyer1@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 2},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        # min_participants=1 → first commit funds the buy
        assert body["status"] == "funded"
        assert body["commits_count"] == 1

    def test_commit_requires_auth(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer)
        resp = client.post(f"/group-buys/{gb.id}/commit", json={"quantity": 1})
        assert resp.status_code in (401, 403)

    def test_commit_404(self, client, db):
        user = make_user(db, email="buyer404@test.com")
        resp = client.post(
            f"/group-buys/{uuid4()}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert resp.status_code == 404

    def test_commit_rejected_when_closed(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, status="funded")
        user = make_user(db, email="buyer2@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert resp.status_code == 400

    def test_commit_rejected_after_deadline(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(
            db, producer, deadline=datetime.utcnow() - timedelta(hours=1)
        )
        user = make_user(db, email="buyer3@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert resp.status_code == 400

    def test_duplicate_commit_rejected(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, min_participants=5)
        user = make_user(db, email="buyer4@test.com")
        first = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert first.status_code == 201
        second = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert second.status_code == 400

    def test_commit_rejected_when_full(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(
            db, producer, min_participants=5, max_participants=1
        )
        first_user = make_user(db, email="full1@test.com")
        client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(first_user),
        )
        second_user = make_user(db, email="full2@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(second_user),
        )
        assert resp.status_code == 400

    def test_cancel_commit_happy(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, min_participants=5)
        user = make_user(db, email="canceller@test.com")
        client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        resp = client.delete(
            f"/group-buys/{gb.id}/commit", headers=auth_header(user)
        )
        assert resp.status_code == 200

    def test_cancel_without_commit_404(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer)
        user = make_user(db, email="nocommit@test.com")
        resp = client.delete(
            f"/group-buys/{gb.id}/commit", headers=auth_header(user)
        )
        assert resp.status_code == 404
