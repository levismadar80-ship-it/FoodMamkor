"""MEH-3873 — an admin writes a business's events and experiences, with the
business's consent confirmed on every save.

Behaviour only (testing.md MEH-3531): each case calls the route and asserts
what came back or what is in the database afterwards.
"""

from datetime import date, timedelta

from app.models.admin_ops import AdminAuditLog
from app.models.models import Event, Experience
from app.utils.clock import israel_today
from conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin", email="admin-3873@example.com")


def _owner_of(db, producer, *, email):
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return user


def _event_payload(**overrides) -> dict:
    payload = {
        "title": "קטיף פטל עצמי",
        "event_date": (israel_today() + timedelta(days=10)).isoformat(),
        "category": "קטיף",
        "city": "גבעת עדה",
        "owner_consent": True,
    }
    payload.update(overrides)
    return payload


def _experience_payload(**overrides) -> dict:
    payload = {
        "title": "סדנת ריבות מהשדה",
        "description": "סדנה מעשית של שעתיים: מכינות ריבה מפירות שנקטפו באותו בוקר.",
        "category": "בישול",
        "event_date": (israel_today() + timedelta(days=14)).isoformat(),
        "location_type": "public",
        "city": "גבעת עדה",
        "max_participants": 10,
        "is_recurring": False,
        "owner_consent": True,
    }
    payload.update(overrides)
    return payload


def _audit_rows(db, action_prefix: str):
    return [
        r
        for r in db.query(AdminAuditLog).order_by(AdminAuditLog.created_at).all()
        if r.action.startswith(action_prefix)
    ]


# ---------- events: create ----------


class TestAdminCreatesEvent:
    def test_business_with_no_owner_account_gets_the_event(self, client, db):
        # The משק פורר case: built in the admin, nobody has signed in yet.
        producer = make_producer(db, name="משק לבדיקה", status="approved")
        admin = _admin(db)

        resp = client.post(
            f"/admin/producers/{producer.id}/events",
            json=_event_payload(),
            headers=auth_header(admin),
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["producer_id"] == str(producer.id)
        rows = db.query(Event).filter(Event.producer_id == producer.id).all()
        assert [r.title for r in rows] == ["קטיף פטל עצמי"]

    def test_consent_is_recorded_on_the_audit_row(self, client, db):
        producer = make_producer(db, status="approved")
        admin = _admin(db)

        resp = client.post(
            f"/admin/producers/{producer.id}/events",
            json=_event_payload(),
            headers=auth_header(admin),
        )

        assert resp.status_code == 201, resp.text
        rows = _audit_rows(db, "POST /admin/producers/{producer_id}/events")
        assert len(rows) == 1
        assert rows[0].actor_id == admin.id
        assert rows[0].target_id == str(producer.id)
        assert rows[0].details == {"after": {"owner_consent": True}}

    def test_without_consent_nothing_is_saved(self, client, db):
        producer = make_producer(db, status="approved")
        admin = _admin(db)
        payload = _event_payload()
        del payload["owner_consent"]

        resp = client.post(
            f"/admin/producers/{producer.id}/events",
            json=payload,
            headers=auth_header(admin),
        )

        assert resp.status_code == 422
        assert db.query(Event).count() == 0

    def test_consent_false_is_refused(self, client, db):
        producer = make_producer(db, status="approved")
        admin = _admin(db)

        resp = client.post(
            f"/admin/producers/{producer.id}/events",
            json=_event_payload(owner_consent=False),
            headers=auth_header(admin),
        )

        assert resp.status_code == 422
        assert db.query(Event).count() == 0

    def test_owner_rules_still_apply(self, client, db):
        # The shared path: a past date is refused for the admin exactly as
        # for the owner (MEH-3224).
        producer = make_producer(db, status="approved")
        admin = _admin(db)

        resp = client.post(
            f"/admin/producers/{producer.id}/events",
            json=_event_payload(event_date=(israel_today() - timedelta(days=1)).isoformat()),
            headers=auth_header(admin),
        )

        assert resp.status_code in (400, 422)
        assert db.query(Event).count() == 0

    def test_unknown_category_refused(self, client, db):
        producer = make_producer(db, status="approved")
        admin = _admin(db)

        resp = client.post(
            f"/admin/producers/{producer.id}/events",
            json=_event_payload(category="סדנה"),
            headers=auth_header(admin),
        )

        assert resp.status_code == 400
        assert db.query(Event).count() == 0

    def test_unknown_business_is_404(self, client, db):
        admin = _admin(db)
        resp = client.post(
            "/admin/producers/00000000-0000-0000-0000-000000000000/events",
            json=_event_payload(),
            headers=auth_header(admin),
        )
        assert resp.status_code == 404

    def test_the_owner_cannot_use_the_admin_route(self, client, db):
        producer = make_producer(db, status="approved")
        owner = _owner_of(db, producer, email="owner-3873@example.com")

        resp = client.post(
            f"/admin/producers/{producer.id}/events",
            json=_event_payload(),
            headers=auth_header(owner),
        )

        assert resp.status_code == 403
        assert db.query(Event).count() == 0

    def test_a_consumer_cannot_use_the_admin_route(self, client, db):
        producer = make_producer(db, status="approved")
        consumer = make_user(db, role="consumer", email="c-3873@example.com")

        resp = client.post(
            f"/admin/producers/{producer.id}/events",
            json=_event_payload(),
            headers=auth_header(consumer),
        )

        assert resp.status_code == 403


# ---------- events: edit + list ----------


def _event(db, producer_id, *, title="יום שוק", days=7, is_active=True):
    ev = Event(
        producer_id=producer_id,
        title=title,
        event_date=israel_today() + timedelta(days=days),
        category="שוק",
        city="גבעת עדה",
        is_active=is_active,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


class TestAdminEditsEvent:
    def test_renewing_the_date_with_consent(self, client, db):
        producer = make_producer(db, status="approved")
        ev = _event(db, producer.id)
        admin = _admin(db)
        new_date = (israel_today() + timedelta(days=30)).isoformat()

        resp = client.put(
            f"/admin/events/{ev.id}",
            json={"event_date": new_date, "owner_consent": True},
            headers=auth_header(admin),
        )

        assert resp.status_code == 200, resp.text
        db.refresh(ev)
        assert ev.event_date.isoformat() == new_date
        # Only what was sent changed.
        assert ev.title == "יום שוק"
        rows = _audit_rows(db, "PUT /admin/events/{event_id}")
        assert [r.details for r in rows] == [{"after": {"owner_consent": True}}]

    def test_edit_without_consent_changes_nothing(self, client, db):
        producer = make_producer(db, status="approved")
        ev = _event(db, producer.id)
        admin = _admin(db)

        resp = client.put(
            f"/admin/events/{ev.id}",
            json={"title": "כותרת חדשה"},
            headers=auth_header(admin),
        )

        assert resp.status_code == 422
        db.refresh(ev)
        assert ev.title == "יום שוק"

    def test_another_owner_cannot_edit_through_the_admin_route(self, client, db):
        producer = make_producer(db, status="approved")
        other = make_producer(db, name="עסק אחר", status="approved")
        stranger = _owner_of(db, other, email="stranger-3873@example.com")
        ev = _event(db, producer.id)

        resp = client.put(
            f"/admin/events/{ev.id}",
            json={"title": "נפרץ", "owner_consent": True},
            headers=auth_header(stranger),
        )

        assert resp.status_code == 403
        db.refresh(ev)
        assert ev.title == "יום שוק"

    def test_unknown_event_is_404(self, client, db):
        admin = _admin(db)
        resp = client.put(
            "/admin/events/00000000-0000-0000-0000-000000000000",
            json={"title": "כותרת חדשה", "owner_consent": True},
            headers=auth_header(admin),
        )
        assert resp.status_code == 404


class TestAdminListsBusinessEvents:
    def test_zero_events(self, client, db):
        producer = make_producer(db, status="approved")
        resp = client.get(
            f"/admin/producers/{producer.id}/events", headers=auth_header(_admin(db))
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_one_event(self, client, db):
        producer = make_producer(db, status="approved")
        _event(db, producer.id, title="רק אחד")
        resp = client.get(
            f"/admin/producers/{producer.id}/events", headers=auth_header(_admin(db))
        )
        assert [e["title"] for e in resp.json()] == ["רק אחד"]

    def test_many_events_include_past_and_cancelled_newest_first(self, client, db):
        producer = make_producer(db, status="approved")
        other = make_producer(db, name="עסק אחר", status="approved")
        _event(db, producer.id, title="עבר", days=-20)
        _event(db, producer.id, title="מבוטל", days=5, is_active=False)
        _event(db, producer.id, title="בקרוב", days=40)
        _event(db, other.id, title="של עסק אחר")

        resp = client.get(
            f"/admin/producers/{producer.id}/events", headers=auth_header(_admin(db))
        )

        assert [e["title"] for e in resp.json()] == ["בקרוב", "מבוטל", "עבר"]

    def test_owner_cannot_read_the_admin_list(self, client, db):
        producer = make_producer(db, status="approved")
        owner = _owner_of(db, producer, email="owner-list-3873@example.com")
        resp = client.get(
            f"/admin/producers/{producer.id}/events", headers=auth_header(owner)
        )
        assert resp.status_code == 403


# ---------- experiences ----------


class TestAdminExperiences:
    def test_created_for_the_owner_account_and_already_approved(self, client, db):
        producer = make_producer(db, status="approved")
        owner = _owner_of(db, producer, email="host-3873@example.com")
        admin = _admin(db)

        resp = client.post(
            f"/admin/producers/{producer.id}/experiences",
            json=_experience_payload(),
            headers=auth_header(admin),
        )

        assert resp.status_code == 201, resp.text
        ex = db.query(Experience).one()
        assert ex.host_user_id == owner.id
        # The admin writing it is the review: it does not wait in her queue.
        assert ex.status == "approved"
        rows = _audit_rows(db, "POST /admin/producers/{producer_id}/experiences")
        assert [r.details for r in rows] == [{"after": {"owner_consent": True}}]

    def test_business_with_no_owner_account_gets_409(self, client, db):
        producer = make_producer(db, status="approved")
        resp = client.post(
            f"/admin/producers/{producer.id}/experiences",
            json=_experience_payload(),
            headers=auth_header(_admin(db)),
        )
        assert resp.status_code == 409
        assert "אירוע" in resp.json()["detail"]
        assert db.query(Experience).count() == 0

    def test_without_consent_nothing_is_saved(self, client, db):
        producer = make_producer(db, status="approved")
        _owner_of(db, producer, email="host2-3873@example.com")
        payload = _experience_payload()
        del payload["owner_consent"]

        resp = client.post(
            f"/admin/producers/{producer.id}/experiences",
            json=payload,
            headers=auth_header(_admin(db)),
        )

        assert resp.status_code == 422
        assert db.query(Experience).count() == 0

    def test_admin_edit_keeps_it_approved(self, client, db):
        producer = make_producer(db, status="approved")
        owner = _owner_of(db, producer, email="host3-3873@example.com")
        ex = Experience(
            title="סדנת ריבות מהשדה",
            description="סדנה מעשית של שעתיים: מכינות ריבה מפירות שנקטפו באותו בוקר.",
            host_user_id=owner.id,
            event_date=israel_today() + timedelta(days=14),
            location_type="public",
            city="גבעת עדה",
            status="approved",
        )
        db.add(ex)
        db.commit()

        resp = client.put(
            f"/admin/experiences/{ex.id}",
            json={"title": "סדנת ריבות וחמוצים", "owner_consent": True},
            headers=auth_header(_admin(db)),
        )

        assert resp.status_code == 200, resp.text
        db.refresh(ex)
        assert ex.title == "סדנת ריבות וחמוצים"
        assert ex.status == "approved"

    def test_owner_content_edit_still_goes_back_to_review(self, client, db):
        # Control for the admin case above: the owner's own path is unchanged.
        producer = make_producer(db, status="approved")
        owner = _owner_of(db, producer, email="host4-3873@example.com")
        ex = Experience(
            title="סדנת ריבות מהשדה",
            description="סדנה מעשית של שעתיים: מכינות ריבה מפירות שנקטפו באותו בוקר.",
            host_user_id=owner.id,
            event_date=israel_today() + timedelta(days=14),
            location_type="public",
            city="גבעת עדה",
            status="approved",
        )
        db.add(ex)
        db.commit()

        resp = client.put(
            f"/experiences/{ex.id}",
            json={"title": "סדנת ריבות וחמוצים"},
            headers=auth_header(owner),
        )

        assert resp.status_code == 200, resp.text
        db.refresh(ex)
        assert ex.status == "pending"


def test_owner_create_route_unchanged(client, db):
    """Control: the owner's POST /events still creates for her own business."""
    producer = make_producer(db, status="approved")
    owner = _owner_of(db, producer, email="owner-ctl-3873@example.com")
    payload = _event_payload()
    del payload["owner_consent"]
    payload["event_date"] = date(2099, 1, 1).isoformat()

    resp = client.post("/events", json=payload, headers=auth_header(owner))

    assert resp.status_code == 201, resp.text
    assert resp.json()["producer_id"] == str(producer.id)
