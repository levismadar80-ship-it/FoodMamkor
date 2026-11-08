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

from datetime import timedelta

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

    def test_concurrent_duplicate_is_exists_not_500(self, client, db, monkeypatch):
        # The check-then-insert race: find_entry sees nothing, the UNIQUE
        # constraint fires on commit. Simulated by making find_entry blind.
        p = make_producer(db)
        body = {"email": "dana@example.com", "city": "חיפה"}
        assert (
            client.post(f"/producers/{p.id}/delivery-waitlist", json=body).status_code
            == 201
        )
        monkeypatch.setattr(
            "app.services.delivery_waitlist.find_entry", lambda *a, **k: None
        )
        r = client.post(f"/producers/{p.id}/delivery-waitlist", json=body)
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

    def test_url_like_city_422(self, client, db):
        # Reviewer #3 on #3908: `city` is echoed into the email subject/body,
        # so a URL-shaped value would put attacker text + a link into mail
        # sent under the platform's name to a third party's address.
        p = make_producer(db)
        # "חיפה\nX" — a control character is the same class (reviewer #5):
        # a newline in `city` is an extra line in the mail body.
        for city in [
            "evil.example/x",
            "http://evil",
            "חיפה@x",
            "www.evil",
            "חיפה\nשורה",
            "חיפה\tx",
        ]:
            r = client.post(
                f"/producers/{p.id}/delivery-waitlist",
                json={"email": "a@b.co", "city": city},
            )
            assert r.status_code == 422, city
        # Real city spellings with punctuation still pass.
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "a@b.co", "city": "יקנעם (מושבה)"},
        )
        assert r.status_code == 201
        assert len(_entries(db, p.id)) == 1

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
        # Pins the defensive branch only: the real send_email never raises
        # (fail-open), so a Resend failure is reported to Sentry, not retried.
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

    def test_other_scope_token_rejected(self, client, db):
        # A newsletter unsubscribe token is signed with the same key; only
        # the scope claim keeps it from deleting a waitlist row.
        from app.routers.marketing import create_unsubscribe_token as newsletter_token

        p = make_producer(db)
        entry = svc.add_entry(db, p, email="x@example.com", city="חיפה", user=None)
        db.commit()
        token = newsletter_token(str(entry.id))
        assert svc.decode_unsubscribe_token(token) is None
        r = client.post("/delivery-waitlist/unsubscribe", json={"token": token})
        assert r.status_code == 400
        assert len(_entries(db, p.id)) == 1

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


# ---------------------------------------------------------------------------
# MEH-2673 — «אשמח לארח נקודת מסירה»: the opt-in host flag on a waitlist row
# and the owner-only list of willing hosts on GET /producers/me/analytics.
# ---------------------------------------------------------------------------


def _owner(db, producer, email):
    user = make_user(db, email=email, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user


def _capture_mail(monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.delivery_waitlist.send_email",
        lambda to, subject, body, **kw: sent.append((to, subject, body)),
    )
    return sent


def _token_from(body):
    return body.split("host-confirm?token=")[1].split()[0]


def _signup_and_confirm(client, monkeypatch, producer_id, email, city):
    sent = _capture_mail(monkeypatch)
    client.post(
        f"/producers/{producer_id}/delivery-waitlist",
        json={"email": email, "city": city, "wants_to_host": True},
    )
    r = client.post(
        "/delivery-waitlist/host-confirm", json={"token": _token_from(sent[-1][2])}
    )
    assert r.status_code == 200, r.text


class TestWantsToHost:
    def test_default_is_not_a_host_and_sends_nothing(self, client, db, monkeypatch):
        sent = _capture_mail(monkeypatch)
        p = make_producer(db)
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "dana@example.com", "city": "חיפה"},
        )
        assert r.status_code == 201, r.text
        assert _entries(db, p.id)[0].wants_to_host is False
        assert sent == []

    def test_box_alone_shares_nothing_until_link_clicked(self, client, db, monkeypatch):
        # The anti-impersonation property: ticking the box with someone
        # else's address must not make that address visible to the business.
        sent = _capture_mail(monkeypatch)
        p = make_producer(db, name="סנדרה פירות")
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "dana@example.com", "city": "חדרה", "wants_to_host": True},
        )
        assert r.status_code == 201, r.text
        assert _entries(db, p.id)[0].wants_to_host is False
        assert len(sent) == 1
        to, subject, body = sent[0]
        assert to == "dana@example.com"
        assert "סנדרה פירות" in subject and "חדרה" in subject
        r = client.post(
            "/delivery-waitlist/host-confirm", json={"token": _token_from(body)}
        )
        assert r.status_code == 200
        assert r.json() == {"producer_name": "סנדרה פירות"}
        db.expire_all()
        assert _entries(db, p.id)[0].wants_to_host is True

    def test_confirm_is_idempotent(self, client, db, monkeypatch):
        p = make_producer(db)
        _signup_and_confirm(client, monkeypatch, p.id, "dana@example.com", "חיפה")
        sent = _capture_mail(monkeypatch)
        entry = _entries(db, p.id)[0]
        token = svc.create_host_confirm_token(entry.id)
        assert (
            client.post(
                "/delivery-waitlist/host-confirm", json={"token": token}
            ).status_code
            == 200
        )
        assert sent == []

    def test_unsubscribe_token_cannot_confirm(self, client, db):
        p = make_producer(db)
        entry = svc.add_entry(db, p, email="dana@example.com", city="חיפה", user=None)
        db.commit()
        r = client.post(
            "/delivery-waitlist/host-confirm",
            json={"token": svc.create_unsubscribe_token(entry.id)},
        )
        assert r.status_code == 400
        db.expire_all()
        assert _entries(db, p.id)[0].wants_to_host is False

    def test_confirm_token_cannot_unsubscribe(self, client, db):
        p = make_producer(db)
        entry = svc.add_entry(db, p, email="dana@example.com", city="חיפה", user=None)
        db.commit()
        r = client.post(
            "/delivery-waitlist/unsubscribe",
            json={"token": svc.create_host_confirm_token(entry.id)},
        )
        assert r.status_code == 400
        assert len(_entries(db, p.id)) == 1

    def test_garbage_token_is_400(self, client, db):
        r = client.post("/delivery-waitlist/host-confirm", json={"token": "nope"})
        assert r.status_code == 400

    def test_repeat_signup_with_box_resends_link(self, client, db, monkeypatch):
        sent = _capture_mail(monkeypatch)
        p = make_producer(db)
        url = f"/producers/{p.id}/delivery-waitlist"
        client.post(url, json={"email": "dana@example.com", "city": "חיפה"})
        r = client.post(
            url,
            json={"email": "dana@example.com", "city": "חיפה", "wants_to_host": True},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "exists"
        assert len(sent) == 1
        assert _entries(db, p.id)[0].wants_to_host is False

    def test_repeat_signup_without_box_never_withdraws_consent(
        self, client, db, monkeypatch
    ):
        p = make_producer(db)
        _signup_and_confirm(client, monkeypatch, p.id, "dana@example.com", "חיפה")
        client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "dana@example.com", "city": "חיפה"},
        )
        db.expire_all()
        assert _entries(db, p.id)[0].wants_to_host is True


class TestPickupHostsOnAnalytics:
    def _hosts(self, client, user):
        r = client.get("/producers/me/analytics", headers=auth_header(user))
        assert r.status_code == 200, r.text
        return r.json()["pickup_hosts"]

    def test_zero_hosts_is_empty_list(self, client, db, monkeypatch):
        p = make_producer(db)
        owner = _owner(db, p, "owner-h0@test.com")
        _capture_mail(monkeypatch)
        # A plain signup is demand, not a host; a ticked but UNCONFIRMED
        # signup is not a host either. Neither may leak its email.
        url = f"/producers/{p.id}/delivery-waitlist"
        client.post(url, json={"email": "plain@example.com", "city": "חיפה"})
        client.post(
            url,
            json={
                "email": "unconfirmed@example.com",
                "city": "חיפה",
                "wants_to_host": True,
            },
        )
        assert self._hosts(client, owner) == []

    def test_one_host(self, client, db, monkeypatch):
        p = make_producer(db)
        owner = _owner(db, p, "owner-h1@test.com")
        _signup_and_confirm(client, monkeypatch, p.id, "host@example.com", "חדרה")
        assert self._hosts(client, owner) == [
            {"email": "host@example.com", "city": "חדרה"}
        ]

    def test_many_hosts_and_only_own_business(self, client, db, monkeypatch):
        p = make_producer(db)
        other = make_producer(db, name="עסק אחר")
        owner = _owner(db, p, "owner-hn@test.com")
        _signup_and_confirm(client, monkeypatch, p.id, "a@example.com", "חדרה")
        _signup_and_confirm(client, monkeypatch, p.id, "b@example.com", "בנימינה")
        # Same flow for ANOTHER business: consent was given to that business
        # only, so it must not reach this owner.
        _signup_and_confirm(client, monkeypatch, other.id, "c@example.com", "חדרה")
        hosts = self._hosts(client, owner)
        assert sorted(h["email"] for h in hosts) == ["a@example.com", "b@example.com"]

    def test_newest_confirmation_first_not_newest_signup(self, client, db, monkeypatch):
        # A late click on an old signup is the newest news for the owner.
        p = make_producer(db)
        owner = _owner(db, p, "owner-ord@test.com")
        sent = _capture_mail(monkeypatch)
        for email in ("old@example.com", "new@example.com"):
            client.post(
                f"/producers/{p.id}/delivery-waitlist",
                json={"email": email, "city": "חדרה", "wants_to_host": True},
            )
        tokens = {to: _token_from(body) for to, _subj, body in sent}
        for email in ("new@example.com", "old@example.com"):
            r = client.post(
                "/delivery-waitlist/host-confirm", json={"token": tokens[email]}
            )
            assert r.status_code == 200, r.text
        assert [h["email"] for h in self._hosts(client, owner)] == [
            "old@example.com",
            "new@example.com",
        ]


class TestHostConfirmAbuseGuards:
    def test_resend_is_capped_by_cooldown(self, client, db, monkeypatch):
        # A stranger re-submitting the form with someone's address gets at
        # most one confirmation mail into that inbox per cooldown window.
        sent = _capture_mail(monkeypatch)
        p = make_producer(db)
        body = {"email": "dana@example.com", "city": "חיפה", "wants_to_host": True}
        for _ in range(3):
            client.post(f"/producers/{p.id}/delivery-waitlist", json=body)
        assert len(sent) == 1

    def test_resend_after_cooldown(self, client, db, monkeypatch):
        sent = _capture_mail(monkeypatch)
        p = make_producer(db)
        body = {"email": "dana@example.com", "city": "חיפה", "wants_to_host": True}
        client.post(f"/producers/{p.id}/delivery-waitlist", json=body)
        entry = _entries(db, p.id)[0]
        entry.host_confirm_sent_at = entry.host_confirm_sent_at - (
            svc.HOST_CONFIRM_RESEND_COOLDOWN + timedelta(minutes=1)
        )
        db.commit()
        client.post(f"/producers/{p.id}/delivery-waitlist", json=body)
        assert len(sent) == 2

    def test_expired_link_is_410_not_400(self, client, db):
        # Expired is told apart from garbage so the page can offer a new link.
        p = make_producer(db)
        entry = svc.add_entry(db, p, email="dana@example.com", city="חיפה", user=None)
        db.commit()
        token = svc._encode(entry.id, svc._HOST_CONFIRM_SCOPE, timedelta(seconds=-1))
        r = client.post("/delivery-waitlist/host-confirm", json={"token": token})
        assert r.status_code == 410
        db.expire_all()
        assert _entries(db, p.id)[0].wants_to_host is False

    def test_confirm_after_unsubscribe_is_400(self, client, db):
        p = make_producer(db)
        entry = svc.add_entry(db, p, email="dana@example.com", city="חיפה", user=None)
        db.commit()
        confirm = svc.create_host_confirm_token(entry.id)
        unsub = svc.create_unsubscribe_token(entry.id)
        assert (
            client.post(
                "/delivery-waitlist/unsubscribe", json={"token": unsub}
            ).status_code
            == 200
        )
        r = client.post("/delivery-waitlist/host-confirm", json={"token": confirm})
        assert r.status_code == 400

    def test_second_business_within_window_gets_its_own_mail(
        self, client, db, monkeypatch
    ):
        # Each link confirms ONE entry, so a visitor who ticks the box for two
        # businesses (or two cities) in one day must get two mails — the
        # cooldown is per entry, not per address.
        sent = _capture_mail(monkeypatch)
        p1 = make_producer(db)
        p2 = make_producer(db, name="עסק שני")
        r1 = client.post(
            f"/producers/{p1.id}/delivery-waitlist",
            json={"email": "dana@example.com", "city": "חיפה", "wants_to_host": True},
        )
        r2 = client.post(
            f"/producers/{p2.id}/delivery-waitlist",
            json={"email": "dana@example.com", "city": "חיפה", "wants_to_host": True},
        )
        assert (r1.json()["host_confirm"], r2.json()["host_confirm"]) == (
            "sent",
            "sent",
        )
        assert len(sent) == 2
        assert "עסק שני" in sent[1][1]
        # Each mail's link confirms the entry it was sent for, and only it.
        client.post(
            "/delivery-waitlist/host-confirm", json={"token": _token_from(sent[1][2])}
        )
        db.expire_all()
        assert _entries(db, p1.id)[0].wants_to_host is False
        assert _entries(db, p2.id)[0].wants_to_host is True

    def test_address_cap_across_cities_and_businesses(self, client, db, monkeypatch):
        # One row per (business, city, email): without a per-address cap a
        # stranger could mail the same inbox once per combination.
        sent = _capture_mail(monkeypatch)
        p1 = make_producer(db)
        p2 = make_producer(db, name="עסק שני")
        combos = [(p1.id, "חיפה"), (p1.id, "חדרה"), (p2.id, "חיפה"), (p2.id, "חדרה")]
        assert len(combos) == svc.HOST_CONFIRM_ADDRESS_CAP + 1
        statuses = [
            client.post(
                f"/producers/{pid}/delivery-waitlist",
                json={"email": "dana@example.com", "city": city, "wants_to_host": True},
            ).json()["host_confirm"]
            for pid, city in combos
        ]
        # The 4th is told the truth — nothing was sent for it — not «check
        # your inbox», which is what already_sent means.
        assert statuses == ["sent"] * svc.HOST_CONFIRM_ADDRESS_CAP + ["limit_reached"]
        assert len(sent) == svc.HOST_CONFIRM_ADDRESS_CAP

    def test_double_tap_with_box_is_exists_not_500(self, client, db, monkeypatch):
        # Two first-time POSTs for the same row in flight: both pass
        # find_entry, the second trips the unique constraint. Simulated by
        # blinding find_entry for the second call; the INSERT must fail
        # inside the handled block, not out of the claim's statements.
        sent = _capture_mail(monkeypatch)
        p = make_producer(db)
        body = {"email": "dana@example.com", "city": "חיפה", "wants_to_host": True}
        assert client.post(
            f"/producers/{p.id}/delivery-waitlist", json=body
        ).json() == {
            "status": "added",
            "host_confirm": "sent",
        }
        monkeypatch.setattr(
            "app.routers.producers.delivery_waitlist.find_entry",
            lambda *a, **k: None,
        )
        r = client.post(f"/producers/{p.id}/delivery-waitlist", json=body)
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "exists", "host_confirm": None}
        assert len(sent) == 1
        assert len(_entries(db, p.id)) == 1

    def test_expired_link_mails_a_fresh_one(self, client, db, monkeypatch):
        # The 410 is not a dead end: the expired token still names the entry,
        # so a new link goes to the same address (once per cooldown window).
        sent = _capture_mail(monkeypatch)
        p = make_producer(db)
        entry = svc.add_entry(db, p, email="dana@example.com", city="חיפה", user=None)
        db.commit()
        stale = svc._encode(entry.id, svc._HOST_CONFIRM_SCOPE, timedelta(seconds=-1))
        r = client.post("/delivery-waitlist/host-confirm", json={"token": stale})
        assert r.status_code == 410
        assert r.json()["resent"] is True
        assert len(sent) == 1
        # The fresh link works; the stale one still does not.
        r = client.post("/delivery-waitlist/host-confirm", json={"token": stale})
        assert (r.status_code, r.json()["resent"]) == (410, False)
        assert len(sent) == 1
        fresh = _token_from(sent[0][2])
        assert (
            client.post(
                "/delivery-waitlist/host-confirm", json={"token": fresh}
            ).status_code
            == 200
        )
        db.expire_all()
        assert _entries(db, p.id)[0].wants_to_host is True

    def test_expired_link_for_confirmed_entry_is_idempotent_200(
        self, client, db, monkeypatch
    ):
        # Re-opening the old mail after 7 days, already confirmed: the
        # consent is on record, so 200 like any repeat click — no error
        # page, no new mail.
        p = make_producer(db)
        _signup_and_confirm(client, monkeypatch, p.id, "dana@example.com", "חיפה")
        sent = _capture_mail(monkeypatch)
        entry = _entries(db, p.id)[0]
        stale = svc._encode(entry.id, svc._HOST_CONFIRM_SCOPE, timedelta(seconds=-1))
        r = client.post("/delivery-waitlist/host-confirm", json={"token": stale})
        assert (r.status_code, r.json()) == (200, {"producer_name": p.name})
        assert sent == []

    def test_non_numeric_exp_is_invalid_not_expired(self, db):
        p = make_producer(db)
        entry = svc.add_entry(db, p, email="dana@example.com", city="חיפה", user=None)
        db.commit()
        from joserfc import jwt as jose_jwt

        for bad_exp in (True, "soon"):
            token = jose_jwt.encode(
                {"alg": svc.settings.algorithm},
                {
                    "sub": str(entry.id),
                    "scope": svc._HOST_CONFIRM_SCOPE,
                    "exp": bad_exp,
                },
                svc._key(),
            )
            assert svc.inspect_host_confirm_token(token) == (None, "invalid")


class TestHostConfirmStatus:
    """The form must never say «we sent you a mail» when nothing was sent."""

    def test_new_row_with_box_says_sent(self, client, db, monkeypatch):
        _capture_mail(monkeypatch)
        p = make_producer(db)
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "dana@example.com", "city": "חיפה", "wants_to_host": True},
        )
        assert r.json() == {"status": "added", "host_confirm": "sent"}

    def test_without_box_has_no_host_status(self, client, db):
        p = make_producer(db)
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "dana@example.com", "city": "חיפה"},
        )
        assert r.json() == {"status": "added", "host_confirm": None}

    def test_inside_cooldown_says_already_sent(self, client, db, monkeypatch):
        _capture_mail(monkeypatch)
        p = make_producer(db)
        body = {"email": "dana@example.com", "city": "חיפה", "wants_to_host": True}
        client.post(f"/producers/{p.id}/delivery-waitlist", json=body)
        # Same row again → exists + already_sent.
        r = client.post(f"/producers/{p.id}/delivery-waitlist", json=body)
        assert r.json() == {"status": "exists", "host_confirm": "already_sent"}
        # A NEW row for the same address (other city) is its own entry with
        # its own link → added + sent.
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist", json={**body, "city": "חדרה"}
        )
        assert r.json() == {"status": "added", "host_confirm": "sent"}

    def test_confirmed_row_says_confirmed(self, client, db, monkeypatch):
        p = make_producer(db)
        _signup_and_confirm(client, monkeypatch, p.id, "dana@example.com", "חיפה")
        sent = _capture_mail(monkeypatch)
        r = client.post(
            f"/producers/{p.id}/delivery-waitlist",
            json={"email": "dana@example.com", "city": "חיפה", "wants_to_host": True},
        )
        assert r.json() == {"status": "exists", "host_confirm": "confirmed"}
        assert sent == []

    def test_confirm_stamps_consent_time(self, client, db, monkeypatch):
        p = make_producer(db)
        entry = svc.add_entry(db, p, email="dana@example.com", city="חיפה", user=None)
        db.commit()
        assert entry.host_confirmed_at is None
        token = svc.create_host_confirm_token(entry.id)
        assert (
            client.post(
                "/delivery-waitlist/host-confirm", json={"token": token}
            ).status_code
            == 200
        )
        db.expire_all()
        assert _entries(db, p.id)[0].host_confirmed_at is not None
