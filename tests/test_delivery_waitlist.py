"""MEH-2618 — «תודיעו לי כשתגיעו ל{עיר}»: the per-city delivery waitlist.

Covers:
  - POST /producers/{id}/delivery-waitlist — guest signup (no account), the
    idempotent duplicate, validation (email / city), unknown and non-live
    business, and the signed-in path that fills an empty profile city.
  - services.delivery_waitlist.notify_cities — the email fan-out that runs when
    a business adds a city to its delivery areas: only entries whose city
    matches, only once (notified_at), nothing for a non-live business.
  - POST /delivery-waitlist/unsubscribe — the signed token from the email.
  - PUT /producers/me — adding a delivery city schedules the fan-out.
"""

from __future__ import annotations

from conftest import auth_header, make_producer, make_user

from app.models import DeliveryWaitlistEntry
from app.services import delivery_waitlist as svc


def _entries(db, producer_id):
    return (
        db.query(DeliveryWaitlistEntry)
        .filter(DeliveryWaitlistEntry.producer_id == producer_id)
        .order_by(DeliveryWaitlistEntry.created_at)
        .all()
    )


class TestSignup:
    def test_guest_signup_creates_entry(self, client, db):
        p = make_producer(db, delivery_cities=["זכרון יעקב"])
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "Dana@Example.com", "city": " תל אביב-יפו "},
        )
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "added"
        rows = _entries(db, p.id)
        assert len(rows) == 1
        # Stored trimmed + lower-cased email, trimmed display city, and the
        # comparison key the trigger will match on.
        assert rows[0].email == "dana@example.com"
        assert rows[0].city == "תל אביב-יפו"
        assert rows[0].city_key == svc.city_key("תל אביב - יפו")
        assert rows[0].user_id is None
        assert rows[0].notified_at is None

    def test_duplicate_is_idempotent(self, client, db):
        p = make_producer(db)
        body = {"email": "dana@example.com", "city": "חיפה"}
        assert (
            client.post(f"/producers/{p.id}/delivery-waitlist", json=body).status_code
            == 201
        )
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "DANA@example.com", "city": "חיפה "},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "exists"
        assert len(_entries(db, p.id)) == 1

    def test_invalid_email_and_city_422(self, client, db):
        p = make_producer(db)
        assert (
            client.post(
                f"/producers/{p.id}/delivery-waitlist",
                json={"email": "not-an-email", "city": "חיפה"},
            ).status_code
            == 422
        )
        # MEH-555 pattern: a city needs letters, not "???" or digits.
        assert (
            client.post(
                f"/producers/{p.id}/delivery-waitlist",
                json={"email": "a@b.co", "city": "123"},
            ).status_code
            == 422
        )
        assert _entries(db, p.id) == []

    def test_unknown_or_unapproved_business_404(self, client, db):
        pending = make_producer(db, status="pending")
        r = client.post(
            f"/producers/{pending.id}/delivery-waitlist",
            json={"email": "a@b.co", "city": "חיפה"},
        )
        assert r.status_code == 404
        r = client.post(
            "/producers/00000000-0000-0000-0000-000000000000/delivery-waitlist",
            json={"email": "a@b.co", "city": "חיפה"},
        )
        assert r.status_code == 404

    def test_signed_in_links_user_and_fills_empty_profile_city(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="member@example.com")
        user.city = None
        db.commit()
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "member@example.com", "city": "נתניה"},
            headers=auth_header(user),
        )
        assert r.status_code == 201
        row = _entries(db, p.id)[0]
        assert row.user_id == user.id
        db.refresh(user)
        assert user.city == "נתניה"

    def test_signed_in_keeps_existing_profile_city(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="member2@example.com")
        user.city = "כרמיאל"
        db.commit()
        client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "member2@example.com", "city": "נתניה"},
            headers=auth_header(user),
        )
        db.refresh(user)
        assert user.city == "כרמיאל"


class TestNotify:
    def _capture(self, monkeypatch):
        sent = []
        monkeypatch.setattr(
            "app.services.delivery_waitlist.send_email",
            lambda to, subject, body, **kw: sent.append((to, subject, body)),
        )
        return sent

    def test_only_matching_city_once(self, db, monkeypatch):
        sent = self._capture(monkeypatch)
        p = make_producer(db, name="מאפיית השדה")
        svc.add_entry(db, p, email="tlv@example.com", city="תל אביב-יפו", user=None)
        svc.add_entry(db, p, email="hfa@example.com", city="חיפה", user=None)
        db.commit()

        # The business adds "תל אביב - יפו" (spacing differs — city_key equal).
        svc.notify_cities(db, p.id, ["תל אביב - יפו"])
        assert [s[0] for s in sent] == ["tlv@example.com"]
        subject, body = sent[0][1], sent[0][2]
        assert "מאפיית השדה" in subject
        assert "תל אביב-יפו" in body  # her own spelling, not the business's
        assert f"/producer/{p.id}" in body
        assert "delivery-waitlist/unsubscribe?token=" in body

        tlv = [e for e in _entries(db, p.id) if e.email == "tlv@example.com"][0]
        hfa = [e for e in _entries(db, p.id) if e.email == "hfa@example.com"][0]
        assert tlv.notified_at is not None
        assert hfa.notified_at is None

        # Second add of the same city → nobody is mailed twice.
        svc.notify_cities(db, p.id, ["תל אביב-יפו"])
        assert len(sent) == 1

    def test_non_live_business_sends_nothing(self, db, monkeypatch):
        sent = self._capture(monkeypatch)
        p = make_producer(db, status="pending")
        svc.add_entry(db, p, email="x@example.com", city="חיפה", user=None)
        db.commit()
        svc.notify_cities(db, p.id, ["חיפה"])
        assert sent == []
        assert _entries(db, p.id)[0].notified_at is None

    def test_send_failure_does_not_mark_notified(self, db, monkeypatch):
        def _boom(*a, **k):
            raise RuntimeError("resend down")

        monkeypatch.setattr("app.services.delivery_waitlist.send_email", _boom)
        p = make_producer(db)
        svc.add_entry(db, p, email="x@example.com", city="חיפה", user=None)
        db.commit()
        svc.notify_cities(db, p.id, ["חיפה"])  # must not raise
        assert _entries(db, p.id)[0].notified_at is None


class TestUnsubscribe:
    def test_token_removes_entry(self, client, db):
        p = make_producer(db)
        entry = svc.add_entry(db, p, email="x@example.com", city="חיפה", user=None)
        db.commit()
        token = svc.create_unsubscribe_token(entry.id)
        r = client.post("/delivery-waitlist/unsubscribe", json={"token": token})
        assert r.status_code == 200
        assert _entries(db, p.id) == []
        # Idempotent: the same link a second time is still a calm 200.
        assert (
            client.post(
                "/delivery-waitlist/unsubscribe", json={"token": token}
            ).status_code
            == 200
        )

    def test_bad_token_400(self, client, db):
        r = client.post("/delivery-waitlist/unsubscribe", json={"token": "nope"})
        assert r.status_code == 400


class TestTrigger:
    def test_put_producers_me_new_city_schedules_notify(self, client, db, monkeypatch):
        calls = []
        monkeypatch.setattr(
            "app.services.delivery_waitlist.notify_cities",
            lambda db_, producer_id, cities: calls.append((producer_id, list(cities))),
        )
        p = make_producer(db, delivery_cities=["זכרון יעקב"], phone_verified=True)
        owner = make_user(db, email="owner@example.com", role="producer")
        owner.producer_id = p.id
        db.commit()
        r = client.put(
            "/producers/me",
            json={"delivery_area_cities": ["זכרון יעקב", "תל אביב-יפו"]},
            headers=auth_header(owner),
        )
        assert r.status_code == 200, r.text
        assert calls == [(p.id, ["תל אביב-יפו"])]
