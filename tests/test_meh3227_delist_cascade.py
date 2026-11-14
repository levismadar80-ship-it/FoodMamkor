"""
Module:   test_meh3227_delist_cascade
Purpose:  MEH-3227 (D1 of the 14/11 grill retro). When the site takes a
          business off — suspend, reject a live one, admin delete, owner
          deletes her account — its live rescue-bag reservations and the
          sign-ups to its upcoming events / experiences are cancelled and each
          holder mailed once; on suspend / admin delete the owner is mailed.
          When the business cancels, deletes or moves one event or experience,
          its registrants are told (cancel / delete cancel the sign-up, a move
          keeps it).
Touches:  Postgres test DB via TestClient; every sender patched where
          booking_cancellations looks it up.
Related:  backend/app/services/booking_cancellations.py
History:  MEH-3227 (creation)
"""

from datetime import timedelta

import pytest

from app.models.models import (
    Event,
    Experience,
    Producer,
    ProducerLocation,
    Registration,
    RescueOffer,
    RescueOrder,
)
from app.utils.clock import israel_today, utc_now
from conftest import auth_header, make_producer, make_user

SENDERS = (
    "send_delisted_cancel_email",
    "send_registrant_delisted",
    "send_registrant_cancelled",
    "send_registrant_moved",
    "send_owner_delisted",
)


@pytest.fixture
def sent(monkeypatch):
    """Every email booking_cancellations queued, as (sender, to, payload, kw)."""
    import app.services.booking_cancellations as bc

    calls: list[tuple] = []
    for name in SENDERS:
        monkeypatch.setattr(
            bc,
            name,
            lambda to, payload, _n=name, **kw: calls.append((_n, to, payload, kw)),
        )
    return calls


def _kinds(sent):
    return sorted((name, to) for name, to, _, _ in sent)


# ---------- seed helpers ----------


def _business(db, status="approved"):
    producer = make_producer(db, name="מאפיית הגליל", status=status, city="חיפה")
    owner = make_user(
        db,
        role="producer",
        email=f"owner-{producer.id}@example.com",
        email_verified=True,
    )
    owner.producer_id = producer.id
    owner.is_producer = True
    db.commit()
    db.refresh(owner)
    return producer, owner


def _bag(db, producer, buyers, **over):
    loc = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city="חיפה",
        address="הנביאים 10",
        lat=32.79,
        lng=34.98,
        location_precision="exact",
    )
    db.add(loc)
    db.commit()
    now = utc_now()
    offer = RescueOffer(
        producer_location_id=loc.id,
        date=israel_today(),
        qty_total=4,
        qty_left=4 - len(buyers),
        price_agorot=1500,
        pickup_start=over.get("pickup_start", now + timedelta(hours=1)),
        pickup_end=over.get("pickup_end", now + timedelta(hours=3)),
        cancel_until=now + timedelta(minutes=30),
        status=over.get("status", "active"),
    )
    db.add(offer)
    db.commit()
    for i, email in enumerate(buyers):
        buyer = make_user(db, email=email)
        db.add(
            RescueOrder(
                offer_id=offer.id, user_id=buyer.id, qty=1, pickup_code=f"{i:04d}"
            )
        )
    db.commit()
    return offer


def _event(db, producer, days=7, **kw):
    ev = Event(
        producer_id=producer.id,
        title=kw.pop("title", "יום פתוח במאפייה"),
        event_date=israel_today() + timedelta(days=days),
        category="שוק",
        city="חדרה",
        is_active=True,
        registration_method="site_form",
        **kw,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def _experience(db, host, days=7, **kw):
    ex = Experience(
        title="סדנת בישול טבעוני",
        description="סדנה מעשית לבישול טבעוני ביתי עם ירקות העונה",
        host_user_id=host.id,
        event_date=israel_today() + timedelta(days=days),
        location_type="home",
        city="בנימינה",
        status="approved",
        is_active=True,
        participants_count=0,
        registration_method="site_form",
        **kw,
    )
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


def _signup(db, item, email):
    reg = Registration(
        event_id=item.id if isinstance(item, Event) else None,
        experience_id=item.id if isinstance(item, Experience) else None,
        name="דנה כהן",
        phone="0527654321",
        email=email,
        cancel_token=f"tok-{email}",
        status="registered",
    )
    db.add(reg)
    db.commit()
    return reg


def _statuses(db, model, ids):
    db.expire_all()
    return sorted(db.query(model.status).filter(model.id.in_(ids)).all())


def _admin(db):
    return make_user(db, role="admin", email="admin@example.com")


# ---------- 1. the site takes a business off ----------


class TestSuspend:
    def test_nothing_booked_mails_only_the_owner(self, client, db, sent):
        producer, owner = _business(db)
        r = client.post(
            f"/admin/producers/{producer.id}/toggle-status",
            headers=auth_header(_admin(db)),
        )
        assert r.status_code == 200, r.text
        assert _kinds(sent) == [("send_owner_delisted", owner.email)]
        assert sent[0][3]["cancelled_any"] is False
        assert sent[0][3]["deleted"] is False

    def test_bags_and_signups_are_cancelled_and_each_holder_mailed(
        self, client, db, sent
    ):
        producer, owner = _business(db)
        offer = _bag(db, producer, ["b1@example.com", "b2@example.com"])
        ev = _event(db, producer)
        ex = _experience(db, owner)
        r1 = _signup(db, ev, "e1@example.com")
        r2 = _signup(db, ex, "x1@example.com")

        r = client.post(
            f"/admin/producers/{producer.id}/toggle-status",
            headers=auth_header(_admin(db)),
        )
        assert r.status_code == 200, r.text

        db.expire_all()
        assert db.get(RescueOffer, offer.id).status == "cancelled"
        orders = db.query(RescueOrder).filter_by(offer_id=offer.id).all()
        assert [o.status for o in orders] == ["cancelled", "cancelled"]
        assert _statuses(db, Registration, [r1.id, r2.id]) == [
            ("cancelled",),
            ("cancelled",),
        ]
        assert _kinds(sent) == [
            ("send_delisted_cancel_email", "b1@example.com"),
            ("send_delisted_cancel_email", "b2@example.com"),
            ("send_owner_delisted", owner.email),
            ("send_registrant_delisted", "e1@example.com"),
            ("send_registrant_delisted", "x1@example.com"),
        ]
        owner_kw = [kw for n, _, _, kw in sent if n == "send_owner_delisted"][0]
        assert owner_kw["cancelled_any"] is True

    def test_past_and_ended_bookings_and_other_businesses_are_left(
        self, client, db, sent
    ):
        producer, owner = _business(db)
        other, _ = _business(db)
        now = utc_now()
        ended = _bag(
            db,
            producer,
            ["late@example.com"],
            pickup_start=now - timedelta(hours=3),
            pickup_end=now - timedelta(hours=1),
        )
        past = _event(db, producer, days=-2)
        theirs = _event(db, other)
        _signup(db, past, "past@example.com")
        _signup(db, theirs, "theirs@example.com")

        client.post(
            f"/admin/producers/{producer.id}/toggle-status",
            headers=auth_header(_admin(db)),
        )
        db.expire_all()
        assert db.get(RescueOffer, ended.id).status == "active"
        assert _kinds(sent) == [("send_owner_delisted", owner.email)]

    def test_unpausing_cancels_nothing(self, client, db, sent):
        producer, _ = _business(db, status="inactive")
        ev = _event(db, producer)
        reg = _signup(db, ev, "e1@example.com")
        client.post(
            f"/admin/producers/{producer.id}/toggle-status",
            headers=auth_header(_admin(db)),
        )
        assert _statuses(db, Registration, [reg.id]) == [("registered",)]
        assert not [s for s in sent if s[0] != "send_owner_delisted"]


class TestRejectLive:
    def test_signups_cancelled_and_no_second_owner_mail(self, client, db, sent):
        producer, _ = _business(db)
        ev = _event(db, producer)
        reg = _signup(db, ev, "e1@example.com")
        r = client.post(
            f"/admin/producers/{producer.id}/reject",
            json={},
            headers=auth_header(_admin(db)),
        )
        assert r.status_code == 200, r.text
        assert _statuses(db, Registration, [reg.id]) == [("cancelled",)]
        # the rejection email already tells the owner
        assert _kinds(sent) == [("send_registrant_delisted", "e1@example.com")]


class TestAdminDelete:
    def test_holders_mailed_before_the_cascade_and_owner_told_deleted(
        self, client, db, sent
    ):
        producer, owner = _business(db)
        owner_email = owner.email
        _bag(db, producer, ["b1@example.com"])
        _signup(db, _event(db, producer), "e1@example.com")

        pid = producer.id
        r = client.delete(f"/admin/producers/{pid}", headers=auth_header(_admin(db)))
        assert r.status_code == 200, r.text
        assert db.query(Producer).filter_by(id=pid).count() == 0
        assert _kinds(sent) == [
            ("send_delisted_cancel_email", "b1@example.com"),
            ("send_owner_delisted", owner_email),
            ("send_registrant_delisted", "e1@example.com"),
        ]
        owner_kw = [kw for n, _, _, kw in sent if n == "send_owner_delisted"][0]
        assert owner_kw["deleted"] is True


class TestOwnerDeletesAccount:
    def test_holders_mailed_and_no_owner_mail(self, client, db, sent):
        producer, owner = _business(db)
        _bag(db, producer, ["b1@example.com"])
        _signup(db, _event(db, producer), "e1@example.com")

        r = client.delete("/auth/me", headers=auth_header(owner))
        assert r.status_code == 200, r.text
        assert _kinds(sent) == [
            ("send_delisted_cancel_email", "b1@example.com"),
            ("send_registrant_delisted", "e1@example.com"),
        ]


# ---------- 2. the business changes one event or experience ----------


class TestEventChanges:
    def test_cancelling_an_event_cancels_its_signups(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        a = _signup(db, ev, "a@example.com")
        b = _signup(db, ev, "b@example.com")
        r = client.put(
            f"/events/{ev.id}", json={"is_active": False}, headers=auth_header(owner)
        )
        assert r.status_code == 200, r.text
        assert _statuses(db, Registration, [a.id, b.id]) == [
            ("cancelled",),
            ("cancelled",),
        ]
        assert _kinds(sent) == [
            ("send_registrant_cancelled", "a@example.com"),
            ("send_registrant_cancelled", "b@example.com"),
        ]
        assert sent[0][2].host_name == "מאפיית הגליל"

    def test_deleting_an_event_mails_its_registrants(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        _signup(db, ev, "a@example.com")
        r = client.delete(f"/events/{ev.id}", headers=auth_header(owner))
        assert r.status_code == 200, r.text
        assert _kinds(sent) == [("send_registrant_cancelled", "a@example.com")]

    def test_moving_an_event_keeps_signups_and_sends_the_new_date(
        self, client, db, sent
    ):
        producer, owner = _business(db)
        ev = _event(db, producer)
        reg = _signup(db, ev, "a@example.com")
        new_date = israel_today() + timedelta(days=10)
        r = client.put(
            f"/events/{ev.id}",
            json={"event_date": new_date.isoformat()},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert _statuses(db, Registration, [reg.id]) == [("registered",)]
        assert _kinds(sent) == [("send_registrant_moved", "a@example.com")]
        message = sent[0][2]
        assert message.date_text == new_date.strftime("%d.%m.%Y")
        assert message.cancel_url.endswith("/registration/tok-a@example.com")

    def test_an_edit_that_keeps_the_date_sends_nothing(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        _signup(db, ev, "a@example.com")
        r = client.put(
            f"/events/{ev.id}",
            json={"title": "יום פתוח — עדכון", "event_date": ev.event_date.isoformat()},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert sent == []

    def test_a_cancelled_registration_is_not_mailed_again(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer)
        gone = _signup(db, ev, "gone@example.com")
        gone.status = "cancelled"
        db.commit()
        client.put(
            f"/events/{ev.id}", json={"is_active": False}, headers=auth_header(owner)
        )
        assert sent == []


class TestExperienceChanges:
    def test_cancelling_an_experience_cancels_its_signups(self, client, db, sent):
        _, owner = _business(db)
        ex = _experience(db, owner)
        reg = _signup(db, ex, "a@example.com")
        r = client.put(
            f"/experiences/{ex.id}",
            json={"is_active": False},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert _statuses(db, Registration, [reg.id]) == [("cancelled",)]
        assert _kinds(sent) == [("send_registrant_cancelled", "a@example.com")]
        # a home address stays private — the city only
        assert sent[0][2].place == "בנימינה"

    def test_deleting_an_experience_mails_its_registrants(self, client, db, sent):
        _, owner = _business(db)
        ex = _experience(db, owner)
        _signup(db, ex, "a@example.com")
        r = client.delete(f"/experiences/{ex.id}", headers=auth_header(owner))
        assert r.status_code == 200, r.text
        assert _kinds(sent) == [("send_registrant_cancelled", "a@example.com")]

    def test_moving_an_experience_sends_the_new_date(
        self, client, db, sent, monkeypatch
    ):
        import app.routers.experiences as ex_router

        verdict = {"status": "APPROVED", "reason": None, "suggestion": None}
        monkeypatch.setattr(ex_router, "validate_experience", lambda _: verdict)
        _, owner = _business(db)
        ex = _experience(db, owner)
        _signup(db, ex, "a@example.com")
        new_date = israel_today() + timedelta(days=12)
        r = client.put(
            f"/experiences/{ex.id}",
            json={"event_date": new_date.isoformat()},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert _kinds(sent) == [("send_registrant_moved", "a@example.com")]
        assert sent[0][2].date_text == new_date.strftime("%d.%m.%Y")


# ---------- the copy itself (approved 14/11) ----------


class TestCopy:
    def test_owner_suspend_mail(self, monkeypatch):
        from app.services import booking_cancellations as bc

        out = []
        monkeypatch.setattr(bc, "send_email", lambda *a, **k: out.append(a))
        bc.send_owner_delisted(
            "o@example.com", "מאפיית הגליל", deleted=False, cancelled_any=True
        )
        to, subject, body = out[0]
        assert subject == "מהמקור — הדף של מאפיית הגליל הוסתר מהאתר"
        assert "וכרגע הוא לא מופיע בחיפוש, במפה וברשימות." in body
        assert "והלקוחות קיבלו על כך מייל." in body
        assert body.rstrip().endswith("צוות מהמקור")

    def test_owner_delete_mail_without_bookings(self, monkeypatch):
        from app.services import booking_cancellations as bc

        out = []
        monkeypatch.setattr(bc, "send_email", lambda *a, **k: out.append(a))
        bc.send_owner_delisted(
            "o@example.com", "מאפיית הגליל", deleted=True, cancelled_any=False
        )
        _, subject, body = out[0]
        assert subject == "מהמקור — הדף של מאפיית הגליל הוסר"
        assert "החשבון שלכם נשאר פעיל." in body
        assert "בוטלו" not in body

    def test_bag_delisted_mail(self, monkeypatch):
        from app.services import rescue_emails

        out = []
        monkeypatch.setattr(
            rescue_emails,
            "send_email",
            lambda to, subject, body, **k: out.append((subject, body)),
        )
        rescue_emails.send_delisted_cancel_email("b@example.com", "מאפיית הגליל")
        subject, body = out[0]
        assert subject == "הסל במאפיית הגליל בוטל"
        assert "כבר לא מופיע במהמקור, ולכן השריון שלכם לסל בוטל." in body


class TestReviewCells:
    """Cells the fresh review named (MEH-3227)."""

    def test_two_orders_one_buyer_get_one_mail(self, client, db, sent):
        producer, owner = _business(db)
        offer = _bag(db, producer, ["twice@example.com"])
        buyer_id = db.query(RescueOrder).filter_by(offer_id=offer.id).one().user_id
        db.add(
            RescueOrder(offer_id=offer.id, user_id=buyer_id, qty=1, pickup_code="9999")
        )
        db.commit()
        client.post(
            f"/admin/producers/{producer.id}/toggle-status",
            headers=auth_header(_admin(db)),
        )
        assert _kinds(sent) == [
            ("send_delisted_cancel_email", "twice@example.com"),
            ("send_owner_delisted", owner.email),
        ]
        db.expire_all()
        statuses = {
            o.status for o in db.query(RescueOrder).filter_by(offer_id=offer.id)
        }
        assert statuses == {"cancelled"}

    def test_many_registrants_on_a_deleted_experience_each_get_one(
        self, client, db, sent
    ):
        _, owner = _business(db)
        ex = _experience(db, owner)
        for e in ("a@example.com", "b@example.com", "c@example.com"):
            _signup(db, ex, e)
        client.delete(f"/experiences/{ex.id}", headers=auth_header(owner))
        assert [to for _, to, _, _ in sorted(sent, key=lambda c: c[1])] == [
            "a@example.com",
            "b@example.com",
            "c@example.com",
        ]

    def test_a_recurring_experience_with_a_past_first_date_counts(
        self, client, db, sent
    ):
        producer, owner = _business(db)
        ex = _experience(db, owner, days=-10, is_recurring=True)
        reg = _signup(db, ex, "weekly@example.com")
        client.post(
            f"/admin/producers/{producer.id}/toggle-status",
            headers=auth_header(_admin(db)),
        )
        assert _statuses(db, Registration, [reg.id]) == [("cancelled",)]
        assert ("send_registrant_delisted", "weekly@example.com") in _kinds(sent)

    def test_a_test_business_marks_every_mail_as_test(self, client, db, sent):
        producer, owner = _business(db)
        producer.is_test = True
        db.commit()
        _bag(db, producer, ["b1@example.com"])
        _signup(db, _event(db, producer), "e1@example.com")
        client.post(
            f"/admin/producers/{producer.id}/toggle-status",
            headers=auth_header(_admin(db)),
        )
        assert len(sent) == 3
        assert all(kw.get("test_cause") is True for _, _, _, kw in sent)

    def test_moving_a_past_event_forward_mails_nobody(self, client, db, sent):
        producer, owner = _business(db)
        ev = _event(db, producer, days=-3)
        _signup(db, ev, "old@example.com")
        r = client.put(
            f"/events/{ev.id}",
            json={"event_date": (israel_today() + timedelta(days=5)).isoformat()},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert sent == []
