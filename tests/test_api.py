"""
API tests for מהמקור backend.

Coverage:
- Auth: register, login (success/wrong password/blocked user), /auth/me
- Producers: list, filter by delivery_city, filter by category, get by id
- Admin: 401/403 for non-admins, approve flow, dashboard, users, categories,
  settings, analytics, page editing
- Contact: POST /contact — DB save, validation, email sending, fail-open
"""
import pytest
from app.models.models import AdminSetting, ContactClick, ContactMessage, Producer, ProducerReview, ProducerWhatsAppClick, StaticPage
from conftest import auth_header, make_category, make_producer, make_user, valid_review_payload


# ---------- Auth ----------

_REGISTER_ACK_DETAIL = (
    "אם האימייל פנוי, נשלחה אלייך הודעת אימות. אנא בדקי את תיבת הדואר."
)


class TestAuth:
    def test_register_new_email_creates_user_and_returns_ack(self, client, db):
        # MEH-328: OWASP-strict anti-enumeration. No access_token in body;
        # the user must verify via email then POST /auth/login. Row creation
        # is verified out-of-band via the DB query below.
        resp = client.post(
            "/auth/register",
            json={"email": "alice@test.com", "name": "Alice", "password": "Zx7Yp9Mq2Lr4"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body == {"detail": _REGISTER_ACK_DETAIL}
        assert "access_token" not in body
        # User row was actually created (only signal the legitimate caller
        # has is the verify email they receive).
        from app.models.models import User
        created = db.query(User).filter(User.email == "alice@test.com").first()
        assert created is not None
        assert created.password_hash  # password actually hashed + stored
        assert created.email_verified is False
        assert created.email_verify_token

    def test_register_duplicate_email_returns_identical_ack(self, client, db):
        # MEH-328: must NOT 400 (legacy behaviour leaked existence). Same
        # 200 + body as the new-email path. No second user row created.
        make_user(db, email="dup@test.com")
        from app.models.models import User
        before = db.query(User).filter(User.email == "dup@test.com").count()
        resp = client.post(
            "/auth/register",
            json={"email": "dup@test.com", "name": "x", "password": "Zx7Yp9Mq2Lr4"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        after = db.query(User).filter(User.email == "dup@test.com").count()
        assert after == before == 1

    def test_register_existing_password_user_dispatches_dup_email(
        self, client, db, monkeypatch
    ):
        make_user(db, email="dup_pw@test.com", name="Dana")
        captured = {}

        def fake_dup(to, name, provider):
            captured["to"] = to
            captured["name"] = name
            captured["provider"] = provider

        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email", fake_dup
        )
        # Also stub the verify-mail so a hypothetical regression that
        # treats the existing email as "new" would still not send the
        # wrong notification (would fail captured["provider"] assertion).
        monkeypatch.setattr(
            "app.routers.auth._send_verify_email", lambda *a, **kw: None
        )
        resp = client.post(
            "/auth/register",
            json={
                "email": "dup_pw@test.com",
                "name": "AttackerName",
                "password": "Zx7Yp9Mq2Lr4",
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        assert captured.get("to") == "dup_pw@test.com"
        # Body uses the EXISTING user's name, not the attacker-supplied one.
        assert captured.get("name") == "Dana"
        assert captured.get("provider") == "password"

    def test_register_existing_google_user_dispatches_dup_email(
        self, client, db, monkeypatch
    ):
        # Existing Google-only account: no password_hash, has google_id.
        from app.models.models import User
        u = User(
            email="dup_g@test.com",
            name="Galya",
            google_id="google-sub-123",
            role="consumer",
            email_verified=True,
        )
        db.add(u)
        db.commit()

        captured = {}
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda to, name, provider: captured.update(
                to=to, name=name, provider=provider
            ),
        )
        resp = client.post(
            "/auth/register",
            json={
                "email": "dup_g@test.com",
                "name": "Attacker",
                "password": "Zx7Yp9Mq2Lr4",
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        assert captured.get("provider") == "google"
        assert captured.get("name") == "Galya"

    def test_register_no_longer_returns_access_token(self, client):
        # MEH-328: no auto-login. Caller must verify via email then login.
        resp = client.post(
            "/auth/register",
            json={
                "email": "noauto@test.com",
                "name": "NoAuto",
                "password": "Zx7Yp9Mq2Lr4",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" not in body
        assert "token_type" not in body
        # And neither refresh_token nor __Secure-Fgp cookies are set.
        cookies = resp.headers.get_list("set-cookie")
        assert not any(c.startswith("refresh_token=") for c in cookies)
        assert not any(c.startswith("__Secure-Fgp=") for c in cookies)

    def test_register_three_branches_have_identical_response_bytes(
        self, client, db, monkeypatch
    ):
        # MEH-328 core invariant: an attacker comparing raw response bytes
        # across (new / password-collision / oauth-collision) cannot
        # distinguish branches. Stub the email senders so background tasks
        # don't fire and influence the response.
        monkeypatch.setattr(
            "app.routers.auth._send_verify_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_welcome_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda *a, **kw: None,
        )
        # Seed an existing password-user and an existing google-user.
        make_user(db, email="ident_pw@test.com")
        from app.models.models import User
        db.add(
            User(
                email="ident_g@test.com",
                name="GUser",
                google_id="google-sub-ident",
                role="consumer",
                email_verified=True,
            )
        )
        db.commit()

        def post(email):
            return client.post(
                "/auth/register",
                json={
                    "email": email,
                    "name": "Tester",
                    "password": "Zx7Yp9Mq2Lr4",
                },
            )

        r_new = post("ident_new@test.com")
        r_pw = post("ident_pw@test.com")
        r_g = post("ident_g@test.com")
        for r in (r_new, r_pw, r_g):
            assert r.status_code == 200
        # Content (the response body the attacker sees) must be byte-identical.
        assert r_new.content == r_pw.content == r_g.content
        # Defensive: also no Set-Cookie divergence between branches.
        assert (
            r_new.headers.get_list("set-cookie")
            == r_pw.headers.get_list("set-cookie")
            == r_g.headers.get_list("set-cookie")
            == []
        )

    def test_login_returns_jwt(self, client, db):
        make_user(db, email="bob@test.com", password="Zx7Yp9Mq2Lr4")
        resp = client.post(
            "/auth/login",
            json={"email": "bob@test.com", "password": "Zx7Yp9Mq2Lr4"},
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    def test_login_wrong_password(self, client, db):
        make_user(db, email="bob2@test.com", password="Zx7Yp9Mq2Lr4")
        resp = client.post(
            "/auth/login",
            json={"email": "bob2@test.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    def test_login_blocked_user_returns_403(self, client, db):
        make_user(db, email="blocked@test.com", password="Zx7Yp9Mq2Lr4", is_blocked=True)
        resp = client.post(
            "/auth/login",
            json={"email": "blocked@test.com", "password": "Zx7Yp9Mq2Lr4"},
        )
        assert resp.status_code == 403

    def test_me_requires_token(self, client):
        assert client.get("/auth/me").status_code == 401

    def test_me_returns_current_user(self, client, db):
        u = make_user(db, email="me@test.com")
        resp = client.get("/auth/me", headers=auth_header(u))
        assert resp.status_code == 200
        assert resp.json()["email"] == "me@test.com"

    # --- Producer registration (MEH-144 regression tests) ---

    VALID_PRODUCER_REG = {
        "email": "producer@test.com",
        "name": "שרה ישראלית",
        "password": "Zx7Yp9Mq2Lr4",
        "producer_name": "חוות שרה",
        "phone": "0501234567",
        "category_ids": [],
        "primary_contact_method": "whatsapp",
    }

    def test_register_producer_new_email_returns_ack(self, client, db):
        """MEH-328 Chunk B: non-upgrade signup → 200 + generic ack (no
        access_token), user + producer rows created. Renamed from
        test_register_producer_succeeds_returns_token under MEH-328."""
        resp = client.post("/auth/register/producer", json=self.VALID_PRODUCER_REG)
        assert resp.status_code == 200
        body = resp.json()
        assert body == {"detail": _REGISTER_ACK_DETAIL}
        assert "access_token" not in body
        assert "whatsapp_sent" not in body
        from app.models.models import User, Producer
        user = db.query(User).filter(User.email == "producer@test.com").first()
        assert user is not None
        assert user.role == "producer"
        assert user.is_producer is True  # MEH-143: durable flag set on new registration too
        producer = db.query(Producer).filter(Producer.name == "חוות שרה").first()
        assert producer is not None
        assert producer.status == "pending_whatsapp"

    def test_register_producer_duplicate_email_returns_identical_ack(self, client, db):
        """MEH-328 Chunk B: existing email must NOT 409 (legacy leaked
        existence). Returns the same RegisterAck as the new-email path,
        no new user row, no new producer row."""
        make_user(db, email="producer@test.com")
        from app.models.models import User, Producer
        users_before = db.query(User).filter(User.email == "producer@test.com").count()
        producers_before = db.query(Producer).count()
        resp = client.post("/auth/register/producer", json=self.VALID_PRODUCER_REG)
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        assert (
            db.query(User).filter(User.email == "producer@test.com").count()
            == users_before
            == 1
        )
        assert db.query(Producer).count() == producers_before

    def test_register_producer_email_failure_still_succeeds(self, client, db, monkeypatch):
        """Email delivery failure must never block the 200 response
        (fire-and-forget). Same invariant as before MEH-328 — only the
        body shape changes from token to ack."""
        from unittest.mock import patch
        from app import config
        # Activate resend so send_email attempts a real send, then simulate Resend
        # being down. The exception is caught INSIDE send_email's try/except so
        # the background task completes without raising — registration must still
        # return 200.
        monkeypatch.setattr(config.settings, "resend_api_key", "re_test_key")
        with patch("resend.Emails.send", side_effect=Exception("Resend down")):
            resp = client.post("/auth/register/producer", json={
                **self.VALID_PRODUCER_REG,
                "email": "producer2@test.com",
                "producer_name": "חוות שרה 2",
            })
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}

    def test_register_producer_existing_password_dispatches_dup_email(
        self, client, db, monkeypatch
    ):
        """MEH-328 Chunk B: collision against a password-user surfaces
        via send_duplicate_attempt_email(provider="password"). Body uses
        the EXISTING user's name, not the attacker-supplied one."""
        make_user(db, email="producer_pw@test.com", name="Dana")
        captured = {}
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda to, name, provider: captured.update(
                to=to, name=name, provider=provider
            ),
        )
        resp = client.post(
            "/auth/register/producer",
            json={**self.VALID_PRODUCER_REG, "email": "producer_pw@test.com"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        assert captured.get("to") == "producer_pw@test.com"
        assert captured.get("name") == "Dana"
        assert captured.get("provider") == "password"

    def test_register_producer_existing_google_dispatches_dup_email(
        self, client, db, monkeypatch
    ):
        """MEH-328 Chunk B: collision against a google-only user surfaces
        via send_duplicate_attempt_email(provider="google")."""
        from app.models.models import User
        u = User(
            email="producer_g@test.com",
            name="Galya",
            google_id="google-sub-producer",
            role="consumer",
            email_verified=True,
        )
        db.add(u)
        db.commit()
        captured = {}
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda to, name, provider: captured.update(
                to=to, name=name, provider=provider
            ),
        )
        resp = client.post(
            "/auth/register/producer",
            json={**self.VALID_PRODUCER_REG, "email": "producer_g@test.com"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        assert captured.get("provider") == "google"
        assert captured.get("name") == "Galya"

    def test_register_producer_no_longer_returns_token_on_signup(self, client):
        """MEH-328 Chunk B: non-upgrade signup body has no token / no
        whatsapp_sent / no refresh-token cookie / no __Secure-Fgp cookie."""
        resp = client.post(
            "/auth/register/producer",
            json={
                **self.VALID_PRODUCER_REG,
                "email": "noauto_producer@test.com",
                "producer_name": "חוות חדשה",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" not in body
        assert "token_type" not in body
        assert "whatsapp_sent" not in body
        cookies = resp.headers.get_list("set-cookie")
        assert not any(c.startswith("refresh_token=") for c in cookies)
        assert not any(c.startswith("__Secure-Fgp=") for c in cookies)

    def test_register_producer_three_branches_identical_response_bytes(
        self, client, db, monkeypatch
    ):
        """MEH-328 Chunk B: an attacker comparing raw response bytes
        across (new / password-collision / google-collision) cannot
        distinguish branches. Stub the email senders so background tasks
        don't influence the response."""
        monkeypatch.setattr(
            "app.routers.auth._send_verify_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_welcome_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda *a, **kw: None,
        )
        monkeypatch.setattr(
            "app.routers.auth.notify_admin_new_producer", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth.notify_producer_registered", lambda *a, **kw: None
        )
        make_user(db, email="prod_ident_pw@test.com")
        from app.models.models import User
        db.add(
            User(
                email="prod_ident_g@test.com",
                name="GUser",
                google_id="google-sub-prod-ident",
                role="consumer",
                email_verified=True,
            )
        )
        db.commit()

        def post(email, producer_name):
            return client.post(
                "/auth/register/producer",
                json={
                    **self.VALID_PRODUCER_REG,
                    "email": email,
                    "producer_name": producer_name,
                },
            )

        r_new = post("prod_ident_new@test.com", "חוות חדשה")
        r_pw = post("prod_ident_pw@test.com", "חוות פסבורד")
        r_g = post("prod_ident_g@test.com", "חוות גוגל")
        for r in (r_new, r_pw, r_g):
            assert r.status_code == 200
        assert r_new.content == r_pw.content == r_g.content
        assert (
            r_new.headers.get_list("set-cookie")
            == r_pw.headers.get_list("set-cookie")
            == r_g.headers.get_list("set-cookie")
            == []
        )

    def test_register_producer_collision_creates_no_producer_row(
        self, client, db, monkeypatch
    ):
        """MEH-328 Chunk B core invariant: the collision branch must NOT
        create a Producer / ProducerCategory / DeliveryArea row. Mirror
        of the side-effect-symmetry acceptance criterion."""
        from app.models.models import (
            DeliveryArea,
            Producer,
            ProducerCategory,
            User,
        )
        make_user(db, email="prod_collision@test.com")
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda *a, **kw: None,
        )
        producers_before = db.query(Producer).count()
        cats_before = db.query(ProducerCategory).count()
        areas_before = db.query(DeliveryArea).count()
        users_before = db.query(User).count()
        resp = client.post(
            "/auth/register/producer",
            json={
                **self.VALID_PRODUCER_REG,
                "email": "prod_collision@test.com",
                "producer_name": "חוות שלא נוצרת",
                "delivery_areas": [
                    {"city": "תל אביב", "min_order": 100, "delivery_day": "ראשון"}
                ],
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        assert db.query(Producer).count() == producers_before
        assert db.query(ProducerCategory).count() == cats_before
        assert db.query(DeliveryArea).count() == areas_before
        assert db.query(User).count() == users_before

    # --- MEH-143: role-upgrade (existing consumer adds a producer) ---

    def test_logged_in_user_can_upgrade_to_producer(self, client, db):
        """Authenticated consumer → POST without email/name/password → 200 + producer created."""
        from app.models.models import User, Producer
        user = make_user(db, email="consumer@upgrade.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json={
                "producer_name": "חוות השדרוג",
                "phone": "0521234567",
                "category_ids": [],
                "primary_contact_method": "whatsapp",
            },
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"]
        db.expire_all()
        upgraded = db.query(User).filter(User.id == user.id).first()
        assert upgraded.role == "producer"
        assert upgraded.is_producer is True
        assert upgraded.producer_id is not None

    def test_upgrade_twice_returns_409(self, client, db):
        """A user who already has a producer cannot register another."""
        user = make_user(db, email="already@producer.com", role="producer")
        # Give the user a linked producer
        from app.models.models import Producer
        producer = Producer(name="קיים", status="pending_whatsapp")
        db.add(producer)
        db.flush()
        user.producer_id = producer.id
        db.commit()
        resp = client.post(
            "/auth/register/producer",
            json={
                "producer_name": "חוות שנייה",
                "phone": "0521234567",
                "category_ids": [],
                "primary_contact_method": "whatsapp",
            },
            headers=auth_header(user),
        )
        assert resp.status_code == 409

    def test_email_exists_endpoint_removed(self, client):
        """MEH-328 Chunk C: /auth/email-exists was a dedicated 30/min
        enumeration oracle (returned {exists: bool} for any email). It
        defeated the anti-enum refactor in Chunks A+B, so it's deleted
        entirely. This test pins the deletion — a future refactor that
        silently re-adds the endpoint fails CI here. Frontend onBlur
        caller in register/producer/page.js is removed in Chunk D."""
        resp = client.get("/auth/email-exists?email=test@example.com")
        assert resp.status_code == 404

    def test_anonymous_registration_still_requires_account_fields(self, client):
        """Unauthenticated POST without email/name/password → 422."""
        resp = client.post(
            "/auth/register/producer",
            json={
                "producer_name": "חוות אנונימית",
                "phone": "0521234567",
                "category_ids": [],
                "primary_contact_method": "whatsapp",
            },
        )
        assert resp.status_code == 422


class TestRegisterPerEmailRateLimit:
    """MEH-624 — per-email cap stacked on top of per-IP cap on both
    /auth/register and /auth/register/producer. Closes the gap MEH-328
    left open: without a per-email key, a botnet rotating IPs could spam
    the OWASP duplicate-attempt email at a single victim. Mirrors the
    /forgot-password dual-key pattern from MEH-191 (TestForgotPasswordRateLimits
    in tests/test_auth.py).
    """

    def test_register_per_email_rate_limit_blocks_after_5_attempts(
        self, client, monkeypatch
    ):
        """Per-IP=10/hour (loose) + per-email=5/15min (tight). Six requests
        with the same email from a single test IP — per-IP bucket stays
        at 6 of 10, per-email bucket trips on the 6th request.
        """
        # Stub email side-effects so we exercise only the limiter chain.
        monkeypatch.setattr(
            "app.routers.auth._send_verify_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda *a, **kw: None,
        )
        payload = {
            "email": "rl_victim_register@test.com",
            "name": "Victim",
            "password": "Zx7Yp9Mq2Lr4",
        }
        statuses = [
            client.post("/auth/register", json=payload).status_code
            for _ in range(6)
        ]
        assert statuses[:5] == [200] * 5
        assert statuses[5] == 429

    def test_register_producer_per_email_rate_limit_blocks_after_5_attempts(
        self, client, monkeypatch
    ):
        """Per-IP=3/hour (tight) + per-email=5/15min. Per-IP would trip
        first from a single client, so this test rotates IPs via X-Real-IP
        (TRUSTED_PROXY=1 to honor the header in get_real_client_ip).
        Each request hits a fresh per-IP bucket; only per-email accumulates.
        Sixth request from a 6th distinct IP, same email → 429.
        """
        monkeypatch.setenv("TRUSTED_PROXY", "1")
        monkeypatch.setattr(
            "app.routers.auth._send_verify_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda *a, **kw: None,
        )
        monkeypatch.setattr(
            "app.routers.auth.notify_admin_new_producer",
            lambda *a, **kw: None,
        )
        monkeypatch.setattr(
            "app.routers.auth.notify_producer_registered",
            lambda *a, **kw: None,
        )
        payload = {
            "email": "rl_victim_producer@test.com",
            "name": "שרה",
            "password": "Zx7Yp9Mq2Lr4",
            "producer_name": "חוות שרה",
            "phone": "0501234567",
            "category_ids": [],
            "primary_contact_method": "whatsapp",
        }
        statuses = [
            client.post(
                "/auth/register/producer",
                json=payload,
                headers={"X-Real-IP": f"203.0.113.{i}"},
            ).status_code
            for i in range(6)
        ]
        assert statuses[:5] == [200] * 5
        assert statuses[5] == 429


# ---------- Producers ----------

class TestProducers:
    def test_list_producers_returns_only_approved(self, client, db):
        make_producer(db, name="Approved One", status="approved")
        make_producer(db, name="Pending One", status="pending")
        resp = client.get("/producers")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Approved One" in names
        assert "Pending One" not in names

    def test_filter_by_delivery_city(self, client, db):
        make_producer(db, name="TLV Delivery", delivery_cities=["תל אביב"])
        make_producer(db, name="Haifa Delivery", delivery_cities=["חיפה"])
        resp = client.get("/producers", params={"delivery_city": "תל אביב"})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert names == ["TLV Delivery"]

    def test_filter_by_category(self, client, db):
        cat = make_category(db, name="ירקות")
        other = make_category(db, name="בשר")
        make_producer(db, name="Veg", category=cat)
        make_producer(db, name="Meat", category=other)
        resp = client.get("/producers", params={"category": cat.id})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert names == ["Veg"]

    def test_get_producer_by_id(self, client, db):
        p = make_producer(db, name="Detail")
        resp = client.get(f"/producers/{p.id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Detail"

    def test_get_unknown_producer_404(self, client):
        resp = client.get("/producers/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    # ----- POST /producers auth -----
    #
    # docs/DATA.md has always documented POST /producers as auth-required
    # (it lives under the "producer dashboard" flow), but the handler
    # historically had no auth dependency — anyone could create a pending
    # producer row with no audit trail. Fixed in feature/fix-producers-post-auth.
    #
    # The public signup flow lives at POST /auth/register/producer and is
    # untouched; POST /producers is a secondary backend helper that should
    # only be callable by an authenticated user.

    VALID_PRODUCER_PAYLOAD = {
        "name": "חוות הבדיקה",
        "description": "test producer",
        "city": "תל אביב",
        "lat": 32.0853,
        "lng": 34.7818,
        "phone": "0501234567",
        "instagram": None,
        "website": None,
        "category_ids": [],
        "delivery_areas": [],
    }

    def test_post_producers_requires_auth(self, client):
        """No Authorization header → 401. Protects against anonymous
        creation of pending producers (was a silent security gap)."""
        resp = client.post("/producers", json=self.VALID_PRODUCER_PAYLOAD)
        assert resp.status_code == 401

    def test_post_producers_rejects_invalid_token(self, client):
        """Garbage token → 401, not 500."""
        resp = client.post(
            "/producers",
            json=self.VALID_PRODUCER_PAYLOAD,
            headers={"Authorization": "Bearer not-a-real-jwt"},
        )
        assert resp.status_code == 401

    def test_post_producers_with_auth_creates_pending_producer(self, client, db):
        """Authenticated user → 201, producer created with status=pending
        (pre-existing behavior, now gated behind auth)."""
        user = make_user(db, email="creator@test.com")
        resp = client.post(
            "/producers",
            json=self.VALID_PRODUCER_PAYLOAD,
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "חוות הבדיקה"
        assert body["status"] == "pending"
        # DB row exists
        row = db.query(Producer).filter(Producer.name == "חוות הבדיקה").first()
        assert row is not None
        assert row.status == "pending"

    def test_post_producers_with_blocked_user_fails(self, client, db):
        """A blocked user should not be able to create producers — the
        get_current_user dep raises 403 for blocked accounts."""
        blocked = make_user(db, email="blocked@test.com", is_blocked=True)
        resp = client.post(
            "/producers",
            json=self.VALID_PRODUCER_PAYLOAD,
            headers=auth_header(blocked),
        )
        assert resp.status_code in (401, 403)


# ---------- Admin guard ----------

class TestAdminGuard:
    def test_unauthenticated_admin_returns_401(self, client):
        # FastAPI returns 401 for missing token, not 403
        assert client.get("/admin/dashboard").status_code == 401

    def test_consumer_cannot_access_admin(self, client, db):
        u = make_user(db, role="consumer")
        resp = client.get("/admin/dashboard", headers=auth_header(u))
        assert resp.status_code == 403

    def test_producer_cannot_access_admin(self, client, db):
        u = make_user(db, role="producer")
        resp = client.get("/admin/dashboard", headers=auth_header(u))
        assert resp.status_code == 403


# ---------- Admin functionality ----------

class TestAdminFlows:
    def test_approve_pending_producer(self, client, db):
        admin = make_user(db, role="admin")
        p = make_producer(db, status="pending")
        resp = client.post(
            f"/admin/producers/{p.id}/approve", headers=auth_header(admin)
        )
        assert resp.status_code == 200
        db.refresh(p)
        assert p.status == "approved"

    def test_dashboard_returns_stats(self, client, db):
        admin = make_user(db, role="admin")
        make_producer(db, status="approved")
        make_producer(db, status="pending")
        make_user(db, email="c1@t.com")
        resp = client.get("/admin/dashboard", headers=auth_header(admin))
        assert resp.status_code == 200
        body = resp.json()
        assert "stats" in body
        assert body["stats"]["total_producers"] >= 2
        assert body["stats"]["pending_producers"] >= 1
        assert "monthly_producers" in body
        assert "map_points" in body

    def test_users_list_with_search(self, client, db):
        admin = make_user(db, role="admin", email="admin@t.com")
        make_user(db, email="findme@t.com", name="Findable")
        resp = client.get(
            "/admin/users",
            params={"search": "findme"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        emails = [u["email"] for u in resp.json()]
        assert "findme@t.com" in emails

    def test_change_user_role(self, client, db):
        admin = make_user(db, role="admin")
        target = make_user(db, role="consumer")
        resp = client.put(
            f"/admin/users/{target.id}/role",
            json={"role": "admin"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        db.refresh(target)
        assert target.role == "admin"

    def test_block_user(self, client, db):
        admin = make_user(db, role="admin")
        target = make_user(db, role="consumer")
        resp = client.post(
            f"/admin/users/{target.id}/block",
            json={"is_blocked": True},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        db.refresh(target)
        assert target.is_blocked is True

    def test_categories_crud(self, client, db):
        admin = make_user(db, role="admin")
        # Create
        resp = client.post(
            "/admin/categories",
            json={"name": "חדש", "emoji": "✨"},
            headers=auth_header(admin),
        )
        assert resp.status_code in (200, 201)
        cat_id = resp.json()["id"]
        # List
        resp = client.get("/admin/categories", headers=auth_header(admin))
        assert any(c["id"] == cat_id for c in resp.json())
        # Update
        resp = client.put(
            f"/admin/categories/{cat_id}",
            json={"name": "ערוך", "emoji": "🔥"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        # Delete
        resp = client.delete(
            f"/admin/categories/{cat_id}", headers=auth_header(admin)
        )
        assert resp.status_code == 200

    def test_settings_get_and_update(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.get("/admin/settings", headers=auth_header(admin))
        assert resp.status_code == 200
        defaults = resp.json()
        assert "admin_email" in defaults

        resp = client.put(
            "/admin/settings",
            json={"admin_email": "boss@mehamakor.co.il"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        # Persisted
        row = db.query(AdminSetting).filter(AdminSetting.key == "admin_email").first()
        assert row is not None
        assert row.value == "boss@mehamakor.co.il"

    def test_analytics_endpoint(self, client, db):
        admin = make_user(db, role="admin")
        make_producer(db)
        resp = client.get("/admin/analytics", headers=auth_header(admin))
        assert resp.status_code == 200
        body = resp.json()
        for key in ("monthly", "by_category", "by_city", "top_producers", "map_points"):
            assert key in body

    def test_static_page_editor(self, client, db):
        admin = make_user(db, role="admin")
        # First GET auto-creates blank page
        resp = client.get("/admin/pages/about", headers=auth_header(admin))
        assert resp.status_code == 200
        # Update body
        resp = client.put(
            "/admin/pages/about",
            json={"title": "החזון שלנו", "body": "אוכל אמיתי"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        page = db.query(StaticPage).filter(StaticPage.slug == "about").first()
        assert page.title == "החזון שלנו"
        assert page.body == "אוכל אמיתי"


# ---------- MEH-56: WhatsApp onboarding + bio ----------

class TestMeh56WhatsAppOnboarding:
    """Registration produces pending_whatsapp status; admin sees it as pending."""

    def test_register_producer_sets_pending_whatsapp(self, client, db, monkeypatch):
        # Stub out Twilio and email so no network calls
        import app.routers.auth as auth_mod
        monkeypatch.setattr(auth_mod, "notify_admin_new_producer", lambda *a, **k: None)
        monkeypatch.setattr(auth_mod, "notify_producer_registered", lambda *a, **k: None)
        monkeypatch.setattr(auth_mod, "_send_welcome_email", lambda *a, **k: None)

        resp = client.post("/auth/register/producer", json={
            "email": "farm56@test.com",
            "name": "Farmer",
            "password": "Zx7Yp9Mq2Lr4",
            "producer_name": "חוות הבדיקה",
            "phone": "0501234567",
            "category_ids": [],
            "primary_contact_method": "whatsapp",
        })
        assert resp.status_code == 200
        from app.models.models import Producer
        p = db.query(Producer).filter(Producer.name == "חוות הבדיקה").first()
        assert p is not None
        assert p.status == "pending_whatsapp"

    def test_admin_pending_endpoint_includes_pending_whatsapp(self, client, db):
        make_producer(db, name="Classic Pending", status="pending")
        make_producer(db, name="WA Pending", status="pending_whatsapp")
        from conftest import make_user
        admin = make_user(db, email="admin56@test.com", role="admin")
        resp = client.get("/admin/producers/pending", headers=auth_header(admin))
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Classic Pending" in names
        assert "WA Pending" in names

    def test_admin_list_pending_filter_includes_pending_whatsapp(self, client, db):
        make_producer(db, name="WA2", status="pending_whatsapp")
        admin = make_user(db, email="admin56b@test.com", role="admin")
        resp = client.get("/admin/producers", params={"status": "pending"}, headers=auth_header(admin))
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "WA2" in names


class TestMeh56BioGenerator:
    """POST /producers/me/bio/generate — fail-open when no API key."""

    def test_bio_generate_returns_empty_without_api_key(self, client, db, monkeypatch):
        from app import config
        monkeypatch.setattr(config.settings, "anthropic_api_key", "")
        # Also reset the cached client in bio_generator
        import app.services.bio_generator as bg
        bg._client = None

        from conftest import make_user, auth_header
        from app.models.models import Producer
        p = make_producer(db, name="ביו חוות")
        user = make_user(db, email="biouser@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        resp = client.post(
            "/producers/me/bio/generate",
            json={"source": "organic farm in the Galilee"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["bio"] == ""

    def test_bio_generate_requires_auth(self, client):
        resp = client.post("/producers/me/bio/generate", json={"source": "test"})
        assert resp.status_code == 401

    def test_bio_generate_rejects_empty_source(self, client, db):
        from conftest import make_user
        from app.models.models import Producer
        p = make_producer(db, name="ביו2")
        user = make_user(db, email="biouser2@test.com", role="producer")
        user.producer_id = p.id
        db.commit()
        resp = client.post(
            "/producers/me/bio/generate",
            json={"source": ""},
            headers=auth_header(user),
        )
        assert resp.status_code == 422


# ---------- Contact ----------

class TestContact:
    """POST /contact — public contact form.

    Required by Israeli consumer protection law (the "legal compliance"
    PR added the frontend /contact page; this backend endpoint is its
    counterpart).

    Contract:
    - Anonymous (no auth).
    - Validates {name, email, message} via Pydantic.
    - Persists to contact_messages table (source of truth).
    - Sends an email to CONTACT_EMAIL (falls back to ADMIN_EMAIL).
    - Fail-open: returns 200 even if SMTP is unconfigured or raises,
      because the DB row is the source of truth and the admin can
      always read messages from the DB directly.
    """

    VALID_PAYLOAD = {
        "name": "רות כהן",
        "email": "ruth@example.com",
        "message": "היי, יש לכן אפשרות להוסיף יצרן חדש?",
    }

    # ----- DB persistence -----

    def test_submit_contact_saves_to_db(self, client, db):
        resp = client.post("/contact", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        row = db.query(ContactMessage).first()
        assert row is not None
        assert row.name == "רות כהן"
        assert row.email == "ruth@example.com"
        assert row.message == "היי, יש לכן אפשרות להוסיף יצרן חדש?"

    def test_submit_contact_trims_and_lowercases_email(self, client, db):
        resp = client.post(
            "/contact",
            json={
                "name": "  רות כהן  ",
                "email": "Ruth@Example.COM",
                "message": "  שלום  ",
            },
        )
        assert resp.status_code == 200
        row = db.query(ContactMessage).first()
        assert row.name == "רות כהן"
        assert row.email == "ruth@example.com"
        assert row.message == "שלום"

    # ----- Validation -----

    def test_submit_contact_missing_name_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        del payload["name"]
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_missing_email_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        del payload["email"]
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_missing_message_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        del payload["message"]
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_invalid_email_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        payload["email"] = "not-an-email"
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_empty_name_fails(self, client):
        payload = dict(self.VALID_PAYLOAD)
        payload["name"] = ""
        resp = client.post("/contact", json=payload)
        assert resp.status_code == 422

    def test_submit_contact_no_auth_required(self, client, db):
        # Explicit: no Authorization header
        resp = client.post("/contact", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        assert db.query(ContactMessage).count() == 1

    # ----- Email delivery (Resend) -----

    def test_submit_contact_sends_email_to_contact_email(
        self, client, db, monkeypatch
    ):
        """When CONTACT_EMAIL is set, email routes to it with correct body."""
        from app import config
        from unittest.mock import patch

        monkeypatch.setattr(config.settings, "resend_api_key", "re_test_key")
        monkeypatch.setattr(
            config.settings, "contact_email", "contactmehamakor.online@gmail.com"
        )

        with patch("app.routers.marketing.send_email") as mock_send:
            resp = client.post("/contact", json=self.VALID_PAYLOAD)

        assert resp.status_code == 200
        mock_send.assert_called_once()
        to, subject, body = mock_send.call_args[0]
        assert to == "contactmehamakor.online@gmail.com"
        assert "רות כהן" in body
        assert "ruth@example.com" in body
        assert "להוסיף יצרן חדש" in body
        assert db.query(ContactMessage).count() == 1

    def test_submit_contact_falls_back_to_admin_email(
        self, client, db, monkeypatch
    ):
        """If CONTACT_EMAIL is empty but ADMIN_EMAIL is set, email routes to ADMIN_EMAIL."""
        from app import config
        from unittest.mock import patch

        monkeypatch.setattr(config.settings, "resend_api_key", "re_test_key")
        monkeypatch.setattr(config.settings, "contact_email", "")
        monkeypatch.setattr(config.settings, "admin_email", "levismadar80@gmail.com")

        with patch("app.routers.marketing.send_email") as mock_send:
            resp = client.post("/contact", json=self.VALID_PAYLOAD)

        assert resp.status_code == 200
        to, *_ = mock_send.call_args[0]
        assert to == "levismadar80@gmail.com"

    # ----- Fail-open -----

    def test_submit_contact_fail_open_when_no_recipient(
        self, client, db, monkeypatch
    ):
        """No recipient configured → 200, DB row still saved, no crash."""
        from app import config

        monkeypatch.setattr(config.settings, "contact_email", "")
        monkeypatch.setattr(config.settings, "admin_email", "")

        resp = client.post("/contact", json=self.VALID_PAYLOAD)
        assert resp.status_code == 200
        assert db.query(ContactMessage).count() == 1

    def test_submit_contact_fail_open_on_send_error(
        self, client, db, monkeypatch
    ):
        """Resend API raises → 200, DB row still saved (fail-open inside send_email)."""
        from app import config
        from unittest.mock import patch

        monkeypatch.setattr(config.settings, "resend_api_key", "re_test_key")
        monkeypatch.setattr(
            config.settings, "contact_email", "contactmehamakor.online@gmail.com"
        )

        with patch("resend.Emails.send", side_effect=Exception("network error")):
            resp = client.post("/contact", json=self.VALID_PAYLOAD)

        assert resp.status_code == 200
        assert db.query(ContactMessage).count() == 1


# ---------- WhatsApp Click Tracking ----------

class TestWhatsAppClickTracking:
    """POST /producers/{id}/whatsapp-click — anonymous + optional-auth tracking.

    Verifies:
    - Anonymous click records a row with user_id=None
    - Authenticated click records a row with the correct user_id
    - Unknown producer returns 404
    - Dashboard endpoint counts the last-7d clicks correctly
    """

    def test_anonymous_click_records_row(self, client, db):
        p = make_producer(db)
        resp = client.post(f"/producers/{p.id}/whatsapp-click")
        assert resp.status_code == 200
        row = db.query(ProducerWhatsAppClick).first()
        assert row is not None
        assert row.producer_id == p.id
        assert row.user_id is None

    def test_authenticated_click_records_user_id(self, client, db):
        p = make_producer(db)
        user = make_user(db, email="clicker@test.com")
        resp = client.post(
            f"/producers/{p.id}/whatsapp-click",
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        row = db.query(ProducerWhatsAppClick).first()
        assert row is not None
        assert row.user_id == user.id

    def test_unknown_producer_returns_404(self, client):
        resp = client.post(
            "/producers/00000000-0000-0000-0000-000000000000/whatsapp-click"
        )
        assert resp.status_code == 404

    def test_dashboard_counts_weekly_clicks(self, client, db):
        """whatsapp_clicks_week reflects rows recorded in the last 7 days."""
        p = make_producer(db)
        user = make_user(db, email="prod@test.com", role="producer")
        user.producer_id = p.id
        db.commit()

        # Record 3 clicks
        for _ in range(3):
            client.post(f"/producers/{p.id}/whatsapp-click")

        resp = client.get("/producers/me/dashboard", headers=auth_header(user))
        assert resp.status_code == 200
        assert resp.json()["whatsapp_clicks_week"] == 3


# ---------- Producer Reviews ----------

class TestProducerReviews:
    """POST /producers/{id}/reviews — WhatsApp gate, moderation, pagination.

    Gate rule: first-time reviewer must have a ProducerWhatsAppClick row
    with user_id matching the caller. Existing reviewers (updating) bypass
    the gate.
    """

    def _make_click(self, db, producer, user):
        """Helper: insert a whatsapp click row for a user+producer pair."""
        click = ProducerWhatsAppClick(
            producer_id=producer.id,
            user_id=user.id,
        )
        db.add(click)
        db.commit()
        return click

    def test_get_reviews_empty(self, client, db):
        p = make_producer(db)
        resp = client.get(f"/producers/{p.id}/reviews")
        assert resp.status_code == 200
        body = resp.json()
        assert body["reviews"] == []
        assert body["total"] == 0
        assert body["page"] == 1
        assert body["pages"] == 1

    def test_post_review_requires_whatsapp_click(self, client, db):
        """No prior WhatsApp click → 403."""
        p = make_producer(db)
        user = make_user(db, email="norclick@test.com")
        resp = client.post(
            f"/producers/{p.id}/reviews",
            json={"stars": 5, "body": "מוצר טוב מאוד, ממליצה בחום!"},
            headers=auth_header(user),
        )
        assert resp.status_code == 403

    def test_post_review_allowed_after_whatsapp_click(self, client, db):
        """User who clicked WhatsApp → 201, review stored."""
        p = make_producer(db)
        user = make_user(db, email="clicker@test.com")
        self._make_click(db, p, user)

        resp = client.post(
            f"/producers/{p.id}/reviews",
            json={"stars": 4, "title": "טעים מאוד", "body": "המוצר ברמה גבוהה"},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        assert resp.json()["stars"] == 4

        review = db.query(ProducerReview).first()
        assert review is not None
        assert review.user_id == user.id

    def test_post_review_update_bypasses_gate(self, client, db):
        """User updating an existing review doesn't need a new click."""
        p = make_producer(db)
        user = make_user(db, email="updater@test.com")
        # Create a review directly in DB (as if they had clicked before)
        db.add(ProducerReview(
            producer_id=p.id,
            user_id=user.id,
            stars=3,
            body="OK",
        ))
        db.commit()

        # No click row but can still update existing review
        resp = client.post(
            f"/producers/{p.id}/reviews",
            json={"stars": 5, "title": "עדכון", "body": "עכשיו יותר טוב"},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        assert resp.json()["stars"] == 5

    def test_get_reviews_pagination(self, client, db):
        """12 reviews → 2 pages; page 1 returns 10, page 2 returns 2."""
        p = make_producer(db)
        for i in range(12):
            u = make_user(db, email=f"rev{i}@test.com")
            db.add(ProducerReview(producer_id=p.id, user_id=u.id, stars=5))
        db.commit()

        p1 = client.get(f"/producers/{p.id}/reviews", params={"page": 1}).json()
        assert len(p1["reviews"]) == 10
        assert p1["total"] == 12
        assert p1["pages"] == 2

        p2 = client.get(f"/producers/{p.id}/reviews", params={"page": 2}).json()
        assert len(p2["reviews"]) == 2

    def test_avg_rating_updated_after_review(self, client, db):
        """Producer avg_rating is recomputed after each review."""
        p = make_producer(db)
        for stars, email in [(4, "r1@test.com"), (2, "r2@test.com")]:
            u = make_user(db, email=email)
            db.add(ProducerReview(producer_id=p.id, user_id=u.id, stars=stars))
        db.commit()

        from app.routers.reviews import _recompute_producer_rating
        from app.database import SessionLocal
        with SessionLocal() as s:
            _recompute_producer_rating(p.id, s)

        db.expire(p)
        db.refresh(p)
        assert abs(p.avg_rating - 3.0) < 0.01
        assert p.reviews_count == 2

    def test_post_review_requires_auth(self, client, db):
        p = make_producer(db)
        resp = client.post(f"/producers/{p.id}/reviews", json=valid_review_payload())
        assert resp.status_code == 401


# ---------- Avatar upload ----------

class TestAvatarUpload:
    def test_patch_profile_saves_avatar_url(self, client, db):
        """PATCH /users/me with avatar_url persists it and returns it in UserOut."""
        user = make_user(db, email="avatar@test.com")
        resp = client.patch(
            "/users/me",
            json={"avatar_url": "https://res.cloudinary.com/test/image/upload/avatars/abc.jpg"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["avatar_url"] == "https://res.cloudinary.com/test/image/upload/avatars/abc.jpg"

    def test_upload_avatar_requires_auth(self, client, db):
        """POST /upload/avatar without JWT → 401."""
        import io
        fake_jpg = b"\xff\xd8\xff" + b"\x00" * 100
        resp = client.post(
            "/upload/avatar",
            files={"file": ("photo.jpg", io.BytesIO(fake_jpg), "image/jpeg")},
        )
        assert resp.status_code == 401


# ---------- MEH-148: Reserved slug protection ----------

class TestReservedSlugs:
    """Producer slugs must not collide with app routes (MEH-148)."""

    def test_admin_create_with_explicit_reserved_slug_returns_400(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.post(
            "/admin/producers",
            json={
                "name": "חנות נהדרת",
                "slug": "about",
                "city": "תל אביב",
            },
            headers=auth_header(admin),
        )
        assert resp.status_code == 400
        assert "שמור" in resp.json()["detail"]

    def test_admin_create_reserved_slug_variants(self, client, db):
        admin = make_user(db, role="admin")
        for reserved in ("map", "admin", "login", "search", "favorites", "api"):
            resp = client.post(
                "/admin/producers",
                json={"name": "עסק", "slug": reserved, "city": "חיפה"},
                headers=auth_header(admin),
            )
            assert resp.status_code == 400, f"Expected 400 for slug '{reserved}'"

    def test_admin_create_with_reserved_name_auto_suffixes_slug(self, client, db):
        """When name auto-generates a reserved slug, the slug should be suffixed."""
        admin = make_user(db, role="admin")
        # Name "about" → slug "about" is reserved → should become "about-2"
        resp = client.post(
            "/admin/producers",
            json={"name": "about", "city": "ירושלים"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["slug"] not in ("about",), "Reserved slug was assigned unchanged"
        assert body["slug"].startswith("about-")

    def test_admin_update_with_reserved_slug_returns_400(self, client, db):
        admin = make_user(db, role="admin")
        producer = make_producer(db)
        resp = client.put(
            f"/admin/producers/{producer.id}",
            json={"slug": "map"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 400
        assert "שמור" in resp.json()["detail"]

    def test_producer_me_update_with_reserved_slug_returns_400(self, client, db):
        """A producer user cannot set their own slug to a reserved word."""
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()
        resp = client.put(
            "/producers/me",
            json={"slug": "admin"},
            headers=auth_header(user),
        )
        assert resp.status_code == 400
        assert "שמור" in resp.json()["detail"]

    def test_non_reserved_slug_is_accepted(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.post(
            "/admin/producers",
            json={"name": "חוות האגס", "slug": "chavat-ha-egas", "city": "כפר סבא"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 201
        assert resp.json()["slug"] == "chavat-ha-egas"

    def test_reserved_slug_set_contains_key_routes(self, client, db):
        """Smoke-test the RESERVED_SLUGS constant itself."""
        from app.slug_utils import RESERVED_SLUGS
        for route in ("about", "map", "login", "admin", "search", "api"):
            assert route in RESERVED_SLUGS


# ---------- MEH-146: double-submit idempotency ----------

class TestDoubleSubmitIdempotency:
    """MEH-146 — duplicate POST on favorites and reviews must return 200, not 500."""

    def test_favorite_double_submit_is_idempotent(self, client, db):
        user = make_user(db, email="fav_double@test.com")
        producer = make_producer(db)
        headers = auth_header(user)

        r1 = client.post(f"/users/me/favorites/{producer.id}", headers=headers)
        assert r1.status_code in (200, 201)

        r2 = client.post(f"/users/me/favorites/{producer.id}", headers=headers)
        assert r2.status_code in (200, 201), f"Second POST returned {r2.status_code}: {r2.text}"

    def test_review_double_submit_is_idempotent(self, client, db):
        user = make_user(db, email="rev_double@test.com")
        producer = make_producer(db)
        headers = auth_header(user)

        # Satisfy the WhatsApp-click gate
        from app.models.models import ProducerWhatsAppClick
        click = ProducerWhatsAppClick(producer_id=producer.id, user_id=user.id)
        db.add(click)
        db.commit()

        payload = {"stars": 4, "body": "מוצר מאוד טרי ואיכותי, ממליצה!"}
        r1 = client.post(f"/producers/{producer.id}/reviews", json=payload, headers=headers)
        assert r1.status_code in (200, 201)

        r2 = client.post(f"/producers/{producer.id}/reviews", json=payload, headers=headers)
        assert r2.status_code in (200, 201), f"Second POST returned {r2.status_code}: {r2.text}"


# ---------- MEH-153: Cloudinary Hebrew error messages ----------

class TestCloudinaryHebrewErrors:
    """Upload error responses must be Hebrew (MEH-153)."""

    def test_freemium_limit_returns_hebrew(self, client, db):
        """A producer on free plan with 3+ images gets a Hebrew 403."""
        import io

        user = make_user(db, role="producer", email="upload_limit@test.com")
        producer = make_producer(db)
        user.producer_id = producer.id
        producer.plan = "free"
        # images is ARRAY(Text) on Producer; set 3 URLs to hit the limit
        producer.images = [
            "https://res.cloudinary.com/test/img/0.jpg",
            "https://res.cloudinary.com/test/img/1.jpg",
            "https://res.cloudinary.com/test/img/2.jpg",
        ]
        db.commit()

        fake_jpg = b"\xff\xd8\xff" + b"\x00" * 100
        resp = client.post(
            "/upload/image",
            files={"file": ("photo.jpg", io.BytesIO(fake_jpg), "image/jpeg")},
            headers=auth_header(user),
        )
        assert resp.status_code == 403
        detail = resp.json()["detail"]
        assert "חינם" in detail or "חינמי" in detail, f"Expected Hebrew, got: {detail}"
        assert "Free plan" not in detail, "English error leaked to user"

    def test_oversized_image_returns_hebrew(self, client, db):
        """Files over 5 MB return a Hebrew 400 error."""
        import io
        user = make_user(db, email="upload_size@test.com")
        big_content = b"\xff\xd8\xff" + b"\x00" * (5 * 1024 * 1024 + 1)
        resp = client.post(
            "/upload/image",
            files={"file": ("big.jpg", io.BytesIO(big_content), "image/jpeg")},
            headers=auth_header(user),
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "MB" in detail
        assert "Upload failed" not in detail

    def test_invalid_file_type_returns_hebrew(self, client, db):
        """Non-image binary returns a Hebrew 400 error."""
        import io
        user = make_user(db, email="upload_type@test.com")
        fake_pdf = b"%PDF-1.4 not an image"
        resp = client.post(
            "/upload/image",
            files={"file": ("doc.pdf", io.BytesIO(fake_pdf), "application/pdf")},
            headers=auth_header(user),
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "JPG" in detail or "PNG" in detail or "תמונות" in detail
        assert "Upload failed" not in detail


# ---------- MEH-155: Vacation badge auto-clear after return_date ----------

class TestVacationBadgeClear:
    """vacation_until field auto-clears expired vacation at serialization time (MEH-155)."""

    def test_set_vacation_with_future_date(self, client, db):
        """POST availability-status with vacation + future vacation_until persists both."""
        from datetime import date, timedelta
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()

        future = (date.today() + timedelta(days=7)).isoformat()
        resp = client.post(
            "/producers/me/availability-status",
            json={"status": "vacation", "vacation_until": future},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_status"] == "vacation"
        assert body["vacation_until"] == future

    def test_expired_vacation_clears_in_api_response(self, client, db):
        """A producer with vacation_until in the past should appear as 'available' in GET /producers."""
        from datetime import date, timedelta
        producer = make_producer(db)
        producer.availability_status = "vacation"
        producer.vacation_until = date.today() - timedelta(days=1)
        db.commit()

        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_status"] == "available", (
            f"Expected 'available' for expired vacation, got '{body['availability_status']}'"
        )
        assert body.get("vacation_until") is None

    def test_active_vacation_stays_in_api_response(self, client, db):
        """A producer with vacation_until in the future stays as 'vacation'."""
        from datetime import date, timedelta
        producer = make_producer(db)
        producer.availability_status = "vacation"
        producer.vacation_until = date.today() + timedelta(days=3)
        db.commit()

        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_status"] == "vacation"

    def test_switching_away_from_vacation_clears_date(self, client, db):
        """Setting status to 'available' must clear vacation_until."""
        from datetime import date, timedelta
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        producer.availability_status = "vacation"
        producer.vacation_until = date.today() + timedelta(days=5)
        db.commit()

        resp = client.post(
            "/producers/me/availability-status",
            json={"status": "available"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["vacation_until"] is None


# ---------- MEH-291: availability_state consolidation (Phase 2) ----------

class TestAvailabilityState:
    """4-value enum that consolidates is_available_today + availability_status.

    Phase 2 ships:
      - new POST /producers/me/availability-state endpoint
      - dual-write mirror in legacy POST /availability + /availability-status
      - extended auto-clear when vacation_until is past
      - optional ?availability_state= filter on /producers list
    Old columns preserved during 7-day overlap; Phase 4 drops them.
    """

    @staticmethod
    def _setup(db):
        from app.models import User
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()
        db.refresh(user)
        # Re-fetch User so callers see producer_id wired
        return db.query(User).filter(User.id == user.id).first(), producer

    def test_new_endpoint_sets_accepting_orders(self, client, db):
        user, producer = self._setup(db)
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "accepting_orders"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["availability_state"] == "accepting_orders"
        db.refresh(producer)
        assert producer.availability_state == "accepting_orders"

    def test_new_endpoint_sets_available_today(self, client, db):
        user, producer = self._setup(db)
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "available_today"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["availability_state"] == "available_today"
        db.refresh(producer)
        assert producer.availability_state == "available_today"
        # Dual-write to legacy columns.
        assert producer.is_available_today is True
        assert producer.availability_status == "available"

    def test_new_endpoint_sets_full_this_week(self, client, db):
        user, producer = self._setup(db)
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "full_this_week"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["availability_state"] == "full_this_week"
        db.refresh(producer)
        assert producer.availability_status == "full"
        assert producer.is_available_today is False

    def test_new_endpoint_on_vacation_requires_vacation_until(self, client, db):
        user, _ = self._setup(db)
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "on_vacation"},
            headers=auth_header(user),
        )
        assert resp.status_code == 422
        assert "תאריך חזרה לחופשה נדרש" in resp.text

    def test_new_endpoint_on_vacation_with_date_dual_writes(self, client, db):
        from datetime import date, timedelta
        user, producer = self._setup(db)
        future = (date.today() + timedelta(days=10)).isoformat()
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "on_vacation", "vacation_until": future},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["availability_state"] == "on_vacation"
        assert body["vacation_until"] == future
        db.refresh(producer)
        assert producer.availability_state == "on_vacation"
        assert producer.availability_status == "vacation"
        assert producer.is_available_today is False
        assert producer.vacation_until.isoformat() == future

    def test_old_toggle_mirrors_to_state(self, client, db):
        user, producer = self._setup(db)
        # Start: is_available_today=False, availability_status='available'
        # Toggle once → True → state='available_today'.
        resp = client.post("/producers/me/availability", headers=auth_header(user))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["is_available_today"] is True
        assert body["availability_state"] == "available_today"
        db.refresh(producer)
        assert producer.availability_state == "available_today"
        # Toggle again → False → state='accepting_orders'.
        resp = client.post("/producers/me/availability", headers=auth_header(user))
        assert resp.json()["availability_state"] == "accepting_orders"

    def test_old_status_mirrors_full_to_full_this_week(self, client, db):
        user, producer = self._setup(db)
        resp = client.post(
            "/producers/me/availability-status",
            json={"status": "full"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["availability_state"] == "full_this_week"
        db.refresh(producer)
        assert producer.availability_state == "full_this_week"

    def test_auto_clear_past_vacation_normalizes_both_fields(self, client, db):
        from datetime import date, timedelta
        producer = make_producer(db)
        producer.availability_status = "vacation"
        producer.availability_state = "on_vacation"
        producer.vacation_until = date.today() - timedelta(days=2)
        db.commit()

        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["availability_status"] == "available"
        assert body["availability_state"] == "accepting_orders"
        assert body.get("vacation_until") is None

    def test_vacation_until_preserved_through_state_round_trip(self, client, db):
        from datetime import date, timedelta
        user, producer = self._setup(db)
        future = (date.today() + timedelta(days=14)).isoformat()
        # Set on_vacation with a date.
        client.post(
            "/producers/me/availability-state",
            json={"state": "on_vacation", "vacation_until": future},
            headers=auth_header(user),
        )
        # Switch back to accepting → vacation_until cleared.
        resp = client.post(
            "/producers/me/availability-state",
            json={"state": "accepting_orders"},
            headers=auth_header(user),
        )
        assert resp.json()["vacation_until"] is None
        db.refresh(producer)
        assert producer.vacation_until is None

    def test_filter_by_availability_state(self, client, db):
        # Two approved producers: one available_today, one accepting_orders.
        p1 = make_producer(db, name="Alpha", status="approved")
        p1.availability_state = "available_today"
        p2 = make_producer(db, name="Beta", status="approved")
        p2.availability_state = "accepting_orders"
        db.commit()

        resp = client.get("/producers?availability_state=available_today")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Alpha" in names
        assert "Beta" not in names

    def test_legacy_is_available_today_filter_still_works(self, client, db):
        p1 = make_producer(db, name="Gamma", status="approved")
        p1.is_available_today = True
        p2 = make_producer(db, name="Delta", status="approved")
        p2.is_available_today = False
        db.commit()

        resp = client.get("/producers?is_available_today=true")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Gamma" in names
        assert "Delta" not in names


class TestMojibakeDetection:
    """MEH-154 — Excel import rejects mojibake'd Hebrew (UTF-8 decoded as Latin-1)."""

    # Helpers — raw rows as openpyxl would deliver them (cells already extracted).
    # Columns: name, contact, phone, instagram, website, wa_group, _unused, city, cat, ...
    def _good_row(self, name="חוות הגליל"):
        return [name, "שרה כהן", "0521234567", None, None, None, None, "חיפה", "בשר", None,
                None, None, None, "תיאור", None, None, None, None, None, None, None, None, None]

    def _mojibake_row(self, name="×©×××"):
        # × (U+00D7) is the Latin-1 misread of the UTF-8 lead byte 0xD7 for Hebrew.
        return [name, None, "0521111111", None, None, None, None, "×××", None, None,
                None, None, None, None, None, None, None, None, None, None, None, None, None]

    def test_good_hebrew_passes_parse(self):
        from app.services.producer_import import parse_row
        result = parse_row(self._good_row(), row_number=2)
        assert not result.mojibake
        assert not any("קידוד" in e for e in result.errors)

    def test_mojibake_name_flagged(self):
        from app.services.producer_import import parse_row
        # U+00D7 in the name should be detected as mojibake.
        result = parse_row(self._mojibake_row(name="ס×××ø"), row_number=2)
        assert result.mojibake
        assert any("קידוד לא תקין" in e for e in result.errors)

    def test_mojibake_in_city_field_flagged(self):
        from app.services.producer_import import parse_row
        row = self._good_row()
        row[7] = "×××"  # city column with mojibake
        result = parse_row(row, row_number=2)
        assert result.mojibake

    def test_import_rows_batch_rejected_on_mojibake(self, db):
        from app.services.producer_import import import_rows
        rows = [self._good_row(), self._mojibake_row(name="ס××ø")]
        result = import_rows(db, rows, dry_run=False)
        assert result.get("batch_rejected") is True
        assert result["imported"] == 0
        assert "קידוד לא תקין" in result["batch_error"]

    def test_import_rows_clean_batch_succeeds(self, db):
        from app.services.producer_import import import_rows
        rows = [self._good_row(name="מאפיית הדר")]
        result = import_rows(db, rows, dry_run=True)
        assert result.get("batch_rejected") is None
        assert result["imported"] == 1


class TestProducersCount:
    """MEH-159 — GET /producers/count returns fresh total for pagination."""

    def test_count_endpoint_returns_json(self, client, db):
        resp = client.get("/producers/count")
        assert resp.status_code == 200
        body = resp.json()
        assert "count" in body
        assert isinstance(body["count"], int)

    def test_count_reflects_approved_producers(self, client, db):
        before = client.get("/producers/count").json()["count"]
        p = make_producer(db, status="approved")
        after = client.get("/producers/count").json()["count"]
        assert after == before + 1

    def test_pending_producer_excluded_from_count(self, client, db):
        before = client.get("/producers/count").json()["count"]
        make_producer(db, status="pending")
        after = client.get("/producers/count").json()["count"]
        assert after == before  # pending not counted


class TestCategoryRequests:
    """MEH-141 — category request flow: submit + admin review."""

    def test_submit_category_request_returns_201(self, client, db):
        resp = client.post(
            "/category-requests",
            json={"requested_name": "משקאות מותססים", "examples": "קומבוצ'ה"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["requested_name"] == "משקאות מותססים"
        assert body["status"] == "pending"

    def test_submit_empty_name_rejected(self, client, db):
        resp = client.post(
            "/category-requests",
            json={"requested_name": "", "examples": None},
        )
        assert resp.status_code == 422

    def test_admin_list_category_requests_grouped(self, client, db):
        admin = make_user(db, role="admin")
        client.post("/category-requests", json={"requested_name": "תבלינים"})
        client.post("/category-requests", json={"requested_name": "תבלינים"})
        resp = client.get("/admin/category-requests", headers=auth_header(admin))
        assert resp.status_code == 200
        groups = resp.json()
        names = [g["requested_name"] for g in groups]
        assert "תבלינים" in names
        # find the group and verify count >= 2
        group = next((g for g in groups if g["requested_name"] == "תבלינים"), None)
        assert group is not None
        assert group["count"] >= 2

    def test_admin_patch_status(self, client, db):
        admin = make_user(db, role="admin")
        # Submit a request
        create_resp = client.post(
            "/category-requests",
            json={"requested_name": "קמח כוסמין", "examples": "לחם כוסמין"},
        )
        assert create_resp.status_code == 201
        req_id = create_resp.json()["id"]
        # Admin approves
        resp = client.patch(
            f"/admin/category-requests/{req_id}",
            json={"status": "approved", "admin_notes": "נוסיף בגרסה הבאה"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "approved"
        assert body["admin_notes"] == "נוסיף בגרסה הבאה"

    def test_non_admin_cannot_list_requests(self, client, db):
        consumer = make_user(db, role="consumer")
        resp = client.get("/admin/category-requests", headers=auth_header(consumer))
        assert resp.status_code == 403

    def test_non_admin_cannot_patch_request(self, client, db):
        consumer = make_user(db, role="consumer")
        create_resp = client.post(
            "/category-requests",
            json={"requested_name": "צמחי מרפא"},
        )
        assert create_resp.status_code == 201
        req_id = create_resp.json()["id"]
        resp = client.patch(
            f"/admin/category-requests/{req_id}",
            json={"status": "approved"},
            headers=auth_header(consumer),
        )
        assert resp.status_code == 403

    def test_admin_notes_preserved_on_status_reset(self, client, db):
        admin = make_user(db, role="admin")
        create_resp = client.post(
            "/category-requests",
            json={"requested_name": "שמנים קרים"},
        )
        req_id = create_resp.json()["id"]
        # Approve with notes
        client.patch(
            f"/admin/category-requests/{req_id}",
            json={"status": "approved", "admin_notes": "נבחן בגרסה הבאה"},
            headers=auth_header(admin),
        )
        # Reset to pending (no notes sent) — notes must survive
        resp = client.patch(
            f"/admin/category-requests/{req_id}",
            json={"status": "pending"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        assert resp.json()["admin_notes"] == "נבחן בגרסה הבאה"


class TestFavoritesCount:
    """MEH-106 — favorites_count in /producers response."""

    def test_producers_list_includes_favorites_count(self, client, db):
        make_producer(db, status="approved")
        resp = client.get("/producers")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert "favorites_count" in data[0]
        assert isinstance(data[0]["favorites_count"], int)

    def test_favorites_count_reflects_saved_producers(self, client, db):
        p = make_producer(db, status="approved")
        # count before any favorites
        before = client.get(f"/producers/{p.id}").json().get("favorites_count", 0)
        # add a favorite
        u = make_user(db)
        from app.models.models import Favorite
        fav = Favorite(user_id=u.id, producer_id=p.id)
        db.add(fav)
        db.commit()
        after = client.get(f"/producers/{p.id}").json().get("favorites_count", 0)
        assert after == before + 1

    def test_favorites_count_zero_when_no_saves(self, client, db):
        p = make_producer(db, status="approved")
        data = client.get(f"/producers/{p.id}").json()
        assert data["favorites_count"] == 0


class TestSimilarProducersExclude:
    def test_exclude_param_omits_producer(self, client, db):
        """GET /producers?exclude=<id> must not return that producer."""
        p1 = make_producer(db, name="Exclude Me", status="approved")
        make_producer(db, name="Keep Me", status="approved")
        resp = client.get(f"/producers?exclude={p1.id}")
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()]
        assert str(p1.id) not in ids

    def test_exclude_param_absent_returns_all(self, client, db):
        """Without exclude, both producers are returned."""
        p1 = make_producer(db, name="Both A", status="approved")
        p2 = make_producer(db, name="Both B", status="approved")
        resp = client.get("/producers")
        assert resp.status_code == 200
        ids = [p["id"] for p in resp.json()]
        assert str(p1.id) in ids
        assert str(p2.id) in ids


class TestContactClickTracking:
    """MEH-82: POST /producers/{id}/contact-click and analytics integration."""

    def test_anonymous_click_returns_204(self, client, db):
        p = make_producer(db, status="approved")
        resp = client.post(f"/producers/{p.id}/contact-click", json={"method": "phone"})
        assert resp.status_code == 204

    def test_authenticated_click_attributed_to_user(self, client, db):
        p = make_producer(db, status="approved")
        u = make_user(db)
        resp = client.post(
            f"/producers/{p.id}/contact-click",
            json={"method": "instagram"},
            headers=auth_header(u),
        )
        assert resp.status_code == 204
        row = db.query(ContactClick).filter(ContactClick.producer_id == p.id).first()
        assert row is not None
        assert row.user_id == u.id
        assert row.method == "instagram"

    def test_all_valid_methods_accepted(self, client, db):
        p = make_producer(db, status="approved")
        for method in ("phone", "instagram", "website", "email"):
            resp = client.post(f"/producers/{p.id}/contact-click", json={"method": method})
            assert resp.status_code == 204, f"method={method} returned {resp.status_code}"

    def test_invalid_method_returns_422(self, client, db):
        p = make_producer(db, status="approved")
        resp = client.post(f"/producers/{p.id}/contact-click", json={"method": "fax"})
        assert resp.status_code == 422

    def test_unknown_producer_returns_404(self, client, db):
        import uuid
        resp = client.post(
            f"/producers/{uuid.uuid4()}/contact-click",
            json={"method": "phone"},
        )
        assert resp.status_code == 404

    def test_click_row_has_ip_hash(self, client, db):
        p = make_producer(db, status="approved")
        client.post(f"/producers/{p.id}/contact-click", json={"method": "website"})
        row = db.query(ContactClick).filter(ContactClick.producer_id == p.id).first()
        assert row is not None
        # ip_hash may be None in test (testclient passes no real IP) — just verify column exists
        assert hasattr(row, "ip_hash")

    def test_analytics_includes_contact_clicks(self, client, db):
        """GET /producers/me/analytics returns contact_clicks windowed dict."""
        u = make_user(db, role="producer")
        p = make_producer(db, status="approved")
        u.producer_id = p.id
        db.commit()
        db.refresh(u)

        # Record a click
        client.post(
            f"/producers/{p.id}/contact-click",
            json={"method": "email"},
            headers=auth_header(u),
        )

        resp = client.get("/producers/me/analytics", headers=auth_header(u))
        assert resp.status_code == 200
        data = resp.json()
        assert "contact_clicks" in data
        cc = data["contact_clicks"]
        assert "last_7d" in cc and "last_30d" in cc and "total" in cc
        assert cc["total"] >= 1


class TestGetProducersMeRouteOrder:
    """MEH-300 regression — GET /producers/me must not be shadowed by
    GET /producers/{producer_id} due to router registration order."""

    def test_authenticated_producer_returns_200(self, client, db):
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()

        resp = client.get("/producers/me", headers=auth_header(user))

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["id"] == str(producer.id)
        assert body["name"] == producer.name

    def test_no_auth_returns_401(self, client, db):
        resp = client.get("/producers/me")
        assert resp.status_code == 401

    def test_consumer_returns_403(self, client, db):
        user = make_user(db, role="consumer")
        resp = client.get("/producers/me", headers=auth_header(user))
        assert resp.status_code == 403

    def test_uuid_route_not_broken(self, client, db):
        """Ensure GET /producers/{uuid} still resolves after reorder."""
        producer = make_producer(db)
        resp = client.get(f"/producers/{producer.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(producer.id)

    def test_get_me_after_registration(self, client, db):
        """MEH-321 regression — GET /producers/me must return 200 immediately
        after a brand-new producer registration (Pydantic schema mismatch fix)."""
        # MEH-321 regression: GET /producers/me returns 200 with valid Pydantic
        # shape for a producer in pending_whatsapp state.
        #
        # NOTE: Post-MEH-328 (anti-enum refactor removed access_token from
        # /auth/register/producer non-upgrade response), this test no longer
        # exercises the original register-flow code path. The Pydantic
        # null-field serialization invariant is now covered narrowly via a
        # seeded producer that mirrors the register-flow NULL shape
        # (description / lat / lng / instagram / website / city / contact_email
        # all None). test_get_me_with_null_created_at_returns_200 (below)
        # covers the null created_at case separately. If a new MEH-321-class
        # regression surfaces post-launch, file a Linear and restore via a
        # full HTTP register flow (which after Chunk D/E will give us a
        # verified login path that still returns a token).
        #
        # make_producer fixture is bypassed because its signature
        # (conftest.py:151-159) forces description="Test producer" + non-null
        # lat/lng, which would mask the NULL-field shape this test guards.
        # is_verified is left at the SQLAlchemy column default (False) rather
        # than the fixture's True, matching the register-flow handler which
        # does not set the column.
        from app.models.models import Producer
        producer = Producer(
            name="חוות מה-321",
            description=None,
            city=None,
            lat=None,
            lng=None,
            phone="0501234567",
            instagram=None,
            website=None,
            primary_contact_method="whatsapp",
            contact_email=None,
            status="pending_whatsapp",
        )
        db.add(producer)
        db.flush()
        user = make_user(db, email="meh321@example.com", role="producer")
        user.producer_id = producer.id
        user.is_producer = True
        db.commit()

        resp = client.get("/producers/me", headers=auth_header(user))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "חוות מה-321"
        assert body["status"] == "pending_whatsapp"

    def test_get_me_with_null_created_at_returns_200(self, client, db):
        """MEH-321: created_at is nullable=True in DB — NULL must not crash serialization."""
        from sqlalchemy import text as sa_text
        user = make_user(db, role="producer")
        producer = make_producer(db)
        user.producer_id = producer.id
        db.commit()
        db.execute(sa_text("UPDATE producers SET created_at = NULL WHERE id = :pid"), {"pid": str(producer.id)})
        db.commit()

        resp = client.get("/producers/me", headers=auth_header(user))
        assert resp.status_code == 200, resp.text
        assert resp.json()["created_at"] is None


class TestUploadGoogleAvatarOrNone:
    """MEH-299 — _upload_google_avatar_or_none helper unit tests.

    Login must never be blocked regardless of Cloudinary / network state.
    """

    def test_none_input_returns_none(self):
        from app.routers.auth import _upload_google_avatar_or_none
        assert _upload_google_avatar_or_none(None) is None

    def test_empty_string_returns_none(self):
        from app.routers.auth import _upload_google_avatar_or_none
        assert _upload_google_avatar_or_none("") is None

    def test_no_cloudinary_config_returns_url_unchanged(self, monkeypatch):
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        monkeypatch.setattr(settings, "cloudinary_cloud_name", None)
        url = "https://lh3.googleusercontent.com/photo.jpg"
        assert _upload_google_avatar_or_none(url) == url

    @staticmethod
    def _fake_stream_cm(chunks):
        """Build a context-manager-compatible mock for httpx.stream.

        MEH-440-followup switched the avatar uploader from httpx.get
        (full buffer) to httpx.stream (chunked + early-abort). Tests
        mock the streaming response with a tiny stand-in that yields
        the requested chunks from iter_bytes(...).
        """
        from unittest.mock import MagicMock
        resp = MagicMock()
        resp.raise_for_status.return_value = None
        resp.iter_bytes.return_value = iter(chunks)
        cm = MagicMock()
        cm.__enter__.return_value = resp
        cm.__exit__.return_value = False
        return cm

    def test_httpx_error_is_fail_open(self, monkeypatch):
        from unittest.mock import patch
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
        monkeypatch.setattr(settings, "cloudinary_api_key", "key")
        monkeypatch.setattr(settings, "cloudinary_api_secret", "secret")
        with patch("httpx.stream", side_effect=Exception("network error")):
            result = _upload_google_avatar_or_none("https://lh3.googleusercontent.com/photo.jpg")
        assert result is None

    def test_cloudinary_error_is_fail_open(self, monkeypatch):
        from unittest.mock import patch
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
        monkeypatch.setattr(settings, "cloudinary_api_key", "key")
        monkeypatch.setattr(settings, "cloudinary_api_secret", "secret")
        cm = self._fake_stream_cm([b"\xff\xd8\xff" + b"\x00" * 100])
        with patch("httpx.stream", return_value=cm):
            with patch("cloudinary.uploader.upload", side_effect=Exception("Cloudinary down")):
                with patch("cloudinary.config"):
                    result = _upload_google_avatar_or_none("https://lh3.googleusercontent.com/photo.jpg")
        assert result is None

    def test_success_returns_cloudinary_url(self, monkeypatch):
        from unittest.mock import patch
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
        monkeypatch.setattr(settings, "cloudinary_api_key", "key")
        monkeypatch.setattr(settings, "cloudinary_api_secret", "secret")
        cm = self._fake_stream_cm([b"\xff\xd8\xff" + b"\x00" * 100])
        expected = "https://res.cloudinary.com/test-cloud/image/upload/mehamakor/avatars/abc.jpg"
        with patch("httpx.stream", return_value=cm):
            with patch("cloudinary.config"):
                with patch("cloudinary.uploader.upload", return_value={"secure_url": expected}):
                    result = _upload_google_avatar_or_none("https://lh3.googleusercontent.com/photo.jpg")
        assert result == expected

    def test_avatar_aborts_oversized_stream(self, monkeypatch):
        """MEH-440-followup: streaming download aborts as soon as the
        cumulative chunk size exceeds MAX_AVATAR_BYTES. Cloudinary
        upload must NOT be reached, and the result must be None."""
        from unittest.mock import patch
        from app.routers.auth import _upload_google_avatar_or_none
        from app.config import settings
        from app.services.oauth_verifiers import MAX_AVATAR_BYTES
        monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
        monkeypatch.setattr(settings, "cloudinary_api_key", "key")
        monkeypatch.setattr(settings, "cloudinary_api_secret", "secret")
        # Build chunks that exceed MAX_AVATAR_BYTES (1 MB). Two chunks
        # of 600 KiB each = 1.2 MB total — second chunk trips the cap.
        big = b"\x00" * (600 * 1024)
        cm = self._fake_stream_cm([big, big])
        upload_called = {"n": 0}

        def _upload_should_not_run(*_a, **_kw):
            upload_called["n"] += 1
            return {"secure_url": "should-not-reach"}

        with patch("httpx.stream", return_value=cm):
            with patch("cloudinary.config"):
                with patch("cloudinary.uploader.upload", side_effect=_upload_should_not_run):
                    result = _upload_google_avatar_or_none("https://lh3.googleusercontent.com/photo.jpg")
        assert result is None, f"oversized stream must short-circuit (cap = {MAX_AVATAR_BYTES})"
        assert upload_called["n"] == 0, "Cloudinary upload must not run after size-cap abort"


class TestAuthEmailHtmlEscape:
    """MEH-440-followup: name interpolation in HTML email bodies must
    be html-escaped so a hostile registered name can't inject markup
    into the rendered email. Plain-text body keeps the raw name (text
    rendering doesn't interpret markup)."""

    def test_email_escapes_html_in_name(self, monkeypatch):
        captured = {}

        def fake_send(email, subject, body, html=None):
            captured["body"] = body
            captured["html"] = html

        monkeypatch.setattr("app.services.auth_emails.send_email", fake_send)
        # MEH-301: send_verify_email now pre-flights resend_api_key; patch it
        # so the early-return guard doesn't short-circuit before send_email.
        from app.services import auth_emails as _ae
        monkeypatch.setattr(_ae.settings, "resend_api_key", "test-key")

        from app.services.auth_emails import send_verify_email
        hostile = "<script>alert(1)</script>"
        send_verify_email("u@example.com", hostile, "tok123")

        # Plain-text body keeps the raw name.
        assert hostile in captured["body"], "plain text must keep raw name"
        # HTML body has the escaped form, never the raw markup.
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in captured["html"], \
            "HTML body must contain the escaped name"
        assert hostile not in captured["html"], \
            "HTML body must not contain the unescaped name"


class TestResetPasswordFlow:
    """MEH-304 / MEH-191: end-to-end reset-password tests (gap closed)."""

    def test_happy_path(self, client, db):
        import secrets
        from datetime import datetime, timedelta
        user = make_user(db, password="OldPass1!")
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = datetime.utcnow() + timedelta(hours=1)
        db.commit()

        res = client.post("/auth/reset-password", json={"token": token, "new_password": "NewPass1!Long"})
        assert res.status_code == 200
        db.refresh(user)
        assert user.reset_token is None

        # old password must no longer work
        login_old = client.post("/auth/login", json={"email": user.email, "password": "OldPass1!"})
        assert login_old.status_code == 401

        # new password must work
        login_new = client.post("/auth/login", json={"email": user.email, "password": "NewPass1!Long"})
        assert login_new.status_code == 200

    def test_unknown_token_returns_404(self, client, db):
        res = client.post("/auth/reset-password", json={"token": "nonexistent_token_abc", "new_password": "NewPass1!Long"})
        assert res.status_code == 404

    def test_expired_token_returns_410(self, client, db):
        import secrets
        from datetime import datetime, timedelta
        user = make_user(db)
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()

        res = client.post("/auth/reset-password", json={"token": token, "new_password": "NewPass1!Long"})
        assert res.status_code == 410

    def test_invalid_body_returns_422(self, client, db):
        res = client.post("/auth/reset-password", json={"token": "abc"})
        assert res.status_code == 422

    def test_short_password_returns_422(self, client, db):
        import secrets
        from datetime import datetime, timedelta
        user = make_user(db)
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        res = client.post("/auth/reset-password", json={"token": token, "new_password": "short"})
        assert res.status_code == 422


# ---------- MEH-326: JWT Refresh Token flow ----------

class TestRefreshTokenFlow:
    """Regression tests for the HttpOnly refresh-token cookie flow.

    _reset_rate_limiter and _clean_tables are autouse — each test
    gets a fresh DB and a clean slowapi counter.
    """

    def _login(self, client, email, password="Zx7Yp9Mq2Lr4"):
        return client.post("/auth/login", json={"email": email, "password": password})

    def _refresh_cookies(self, response):
        """Extract all Set-Cookie header values from a response.

        httpx's Headers.items() joins multiple Set-Cookie values into a
        single comma-separated string, breaking startswith() filters on
        any cookie after the first. get_list() returns each individually.
        """
        return response.headers.get_list("set-cookie")

    def _fp_value(self, response):
        """Extract the raw __Secure-Fgp value from a Set-Cookie header.

        httpx (Starlette TestClient) does not forward Secure cookies over
        http://testserver — must be passed explicitly on subsequent requests.
        Mirror of TestFingerprintCookie._fp_value; kept here so this class
        is self-contained.
        """
        for v in self._refresh_cookies(response):
            if v.startswith("__Secure-Fgp="):
                return v.split("=", 1)[1].split(";")[0].strip()
        return None

    def test_login_sets_refresh_cookie(self, client, db):
        make_user(db, email="t1@test.com", password="Zx7Yp9Mq2Lr4")
        res = self._login(client, "t1@test.com")
        assert res.status_code == 200
        cookies = self._refresh_cookies(res)
        refresh = next((c for c in cookies if c.startswith("refresh_token=")), None)
        assert refresh is not None, "No refresh_token Set-Cookie header"
        low = refresh.lower()
        assert "httponly" in low
        assert "secure" in low
        assert "samesite=lax" in low
        assert "path=/api/auth" in low
        # 14 days = 1 209 600 seconds
        assert "max-age=1209600" in low

    def test_refresh_returns_new_access_token(self, client, db):
        from datetime import datetime, timedelta
        from joserfc import jwt as jose_jwt
        from joserfc.jwk import OctKey
        from joserfc.jwt import JWTClaimsRegistry
        from app.config import settings

        make_user(db, email="t2@test.com", password="Zx7Yp9Mq2Lr4")
        login_res = self._login(client, "t2@test.com")
        refresh_cookie = login_res.cookies.get("refresh_token")
        assert refresh_cookie, "Login did not return a refresh_token cookie"

        res = client.post("/auth/refresh", cookies={"refresh_token": refresh_cookie})
        assert res.status_code == 200
        access_token = res.json().get("access_token")
        assert access_token

        # Verify the returned token carries scope=access
        key = OctKey.import_key(settings.secret_key.encode())
        token_obj = jose_jwt.decode(access_token, key, algorithms=[settings.algorithm])
        JWTClaimsRegistry().validate(token_obj.claims)
        assert token_obj.claims.get("scope") == "access"

    def test_refresh_without_cookie_returns_401(self, client):
        res = client.post("/auth/refresh")
        assert res.status_code == 401

    def test_refresh_rejects_access_token_in_cookie(self, client, db):
        from app.auth import create_access_token
        user = make_user(db, email="t4@test.com")
        access_token = create_access_token(user.id, user.token_version)
        res = client.post("/auth/refresh", cookies={"refresh_token": access_token})
        assert res.status_code == 401

    def test_refresh_rejects_after_token_version_bump(self, client, db):
        make_user(db, email="t5@test.com", password="Zx7Yp9Mq2Lr4")
        login_res = self._login(client, "t5@test.com")
        refresh_cookie = login_res.cookies.get("refresh_token")

        # Fetch the user and bump token_version directly
        from app.models.models import User
        user = db.query(User).filter(User.email == "t5@test.com").first()
        user.token_version = (user.token_version or 1) + 1
        db.commit()

        res = client.post("/auth/refresh", cookies={"refresh_token": refresh_cookie})
        assert res.status_code == 401

    def test_refresh_rejects_blocked_user(self, client, db):
        make_user(db, email="t6@test.com", password="Zx7Yp9Mq2Lr4")
        login_res = self._login(client, "t6@test.com")
        refresh_cookie = login_res.cookies.get("refresh_token")

        from app.models.models import User
        user = db.query(User).filter(User.email == "t6@test.com").first()
        user.is_blocked = True
        db.commit()

        res = client.post("/auth/refresh", cookies={"refresh_token": refresh_cookie})
        assert res.status_code == 403

    def test_refresh_rate_limited(self, client):
        # _reset_rate_limiter autouse fixture resets the counter before this test.
        # /auth/refresh limit: 30/minute. Call it 30 times (all 401 — no cookie),
        # then verify the 31st is 429.
        for _ in range(30):
            client.post("/auth/refresh")
        res = client.post("/auth/refresh")
        assert res.status_code == 429

    def test_old_24h_access_token_still_validates(self, client, db):
        """BACKWARD COMPAT GUARD — pre-MEH-326 tokens had no scope claim.

        get_current_user must fail-open on absent scope (treat as access)
        so existing 24h sessions don't get invalidated by the deploy.
        """
        from datetime import datetime, timedelta
        from joserfc import jwt as jose_jwt
        from joserfc.jwk import OctKey
        from app.config import settings

        user = make_user(db, email="t8@test.com")
        # Craft token with only sub/exp/tv — no scope claim (pre-MEH-326 shape)
        expire = datetime.utcnow() + timedelta(hours=24)
        payload = {"sub": str(user.id), "exp": expire, "tv": user.token_version}
        key = OctKey.import_key(settings.secret_key.encode())
        old_token = jose_jwt.encode({"alg": settings.algorithm}, payload, key)

        res = client.get("/auth/me", headers={"Authorization": f"Bearer {old_token}"})
        assert res.status_code == 200
        assert res.json()["email"] == "t8@test.com"

    def test_logout_clears_refresh_cookie(self, client, db):
        make_user(db, email="t9@test.com", password="Zx7Yp9Mq2Lr4")
        self._login(client, "t9@test.com")  # sets cookie in client session

        res = client.post("/auth/logout")
        assert res.status_code == 204

        cookies = self._refresh_cookies(res)
        refresh = next((c for c in cookies if "refresh_token" in c), None)
        assert refresh is not None, "No Set-Cookie header for refresh_token on logout"
        low = refresh.lower()
        # Defensive: accept Max-Age=0 OR an expires in the past
        assert "max-age=0" in low or "expires=" in low

    def test_logout_all_devices_rotates_refresh_cookie(self, client, db):
        make_user(db, email="t10@test.com", password="Zx7Yp9Mq2Lr4")
        login_res = self._login(client, "t10@test.com")
        old_refresh = login_res.cookies.get("refresh_token")
        access_token = login_res.json()["access_token"]
        fp_value = self._fp_value(login_res)
        assert fp_value is not None, "Login did not return __Secure-Fgp cookie"

        res = client.post(
            "/auth/logout-all-devices",
            headers={"Authorization": f"Bearer {access_token}"},
            cookies={"__Secure-Fgp": fp_value},
        )
        assert res.status_code == 200
        new_refresh = res.cookies.get("refresh_token")
        assert new_refresh is not None, "logout-all-devices did not set a new refresh cookie"
        assert new_refresh != old_refresh, "refresh cookie was not rotated"

        # Old cookie must now be rejected (token_version was bumped).
        # Fresh client: the session `client` already stored new_refresh from
        # the logout-all-devices response. Passing old_refresh via cookies=
        # on top would send both cookies with the same name — non-deterministic.
        # A new TestClient(app) has no stored cookies, so only old_refresh travels.
        from fastapi.testclient import TestClient
        from app.main import app as _app
        fresh_client = TestClient(_app)
        res2 = fresh_client.post("/auth/refresh", cookies={"refresh_token": old_refresh})
        assert res2.status_code == 401


class TestFingerprintCookie:
    """MEH-327: OWASP JWT token-sidejacking fingerprint defence.

    Covers: cookie set on login/register, valid fingerprint accepted,
    wrong fingerprint rejected (core security invariant), pre-MEH-327
    tokens fail-open, logout clears the cookie.
    """

    def _login(self, client, email, password="Zx7Yp9Mq2Lr4"):
        return client.post("/auth/login", json={"email": email, "password": password})

    def _all_set_cookies(self, response):
        # httpx's Headers.items() joins multiple Set-Cookie values into one
        # comma-separated string; get_list() returns them individually.
        return response.headers.get_list("set-cookie")

    def _fp_cookie_header(self, response):
        cookies = self._all_set_cookies(response)
        return next((c for c in cookies if c.startswith("__Secure-Fgp=")), None)

    def _fp_value(self, response):
        """Extract the raw fingerprint value from the Set-Cookie header."""
        header = self._fp_cookie_header(response)
        if header is None:
            return None
        return header.split("=", 1)[1].split(";")[0].strip()

    def test_login_sets_fingerprint_cookie(self, client, db):
        make_user(db, email="fp1@test.com", password="Zx7Yp9Mq2Lr4")
        res = self._login(client, "fp1@test.com")
        assert res.status_code == 200
        fp_hdr = self._fp_cookie_header(res)
        assert fp_hdr is not None, "No __Secure-Fgp Set-Cookie header on login"
        low = fp_hdr.lower()
        assert "httponly" in low
        assert "secure" in low
        assert "samesite=lax" in low
        assert "path=/" in low
        # 14 days = 1 209 600 seconds — must match refresh cookie TTL
        assert "max-age=1209600" in low

    def test_register_no_longer_sets_fingerprint_cookie(self, client):
        # MEH-328: /auth/register no longer issues an access token (OWASP
        # anti-enumeration — user must verify via email then login), so
        # there is nothing to bind a fingerprint to. The cookie is set on
        # /auth/login + /auth/refresh + /auth/logout-all-devices instead.
        # Identical-bytes invariant in TestAuth depends on this being absent.
        res = client.post(
            "/auth/register",
            json={"email": "fp2@test.com", "name": "FP Test", "password": "Zx7Yp9Mq2Lr4"},
        )
        assert res.status_code == 200
        assert self._fp_cookie_header(res) is None

    def test_authenticated_request_valid_fingerprint_passes(self, client, db):
        make_user(db, email="fp3@test.com", password="Zx7Yp9Mq2Lr4")
        login_res = self._login(client, "fp3@test.com")
        access_token = login_res.json()["access_token"]
        fp = self._fp_value(login_res)
        assert fp is not None, "Login did not return __Secure-Fgp cookie"

        res = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
            cookies={"__Secure-Fgp": fp},
        )
        assert res.status_code == 200
        assert res.json()["email"] == "fp3@test.com"

    def test_authenticated_request_wrong_fingerprint_rejected(self, client, db):
        """Core security invariant: a stolen access token cannot be replayed
        without also stealing the HttpOnly __Secure-Fgp cookie.
        """
        make_user(db, email="fp4@test.com", password="Zx7Yp9Mq2Lr4")
        login_res = self._login(client, "fp4@test.com")
        access_token = login_res.json()["access_token"]

        # Fresh client — empty cookie jar — so only the wrong fp is sent.
        from fastapi.testclient import TestClient
        from app.main import app as _app
        attack_client = TestClient(_app)
        res = attack_client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
            cookies={"__Secure-Fgp": "a" * 100},  # valid length, wrong value
        )
        assert res.status_code == 401

    def test_token_without_fingerprint_claim_fails_open(self, client, db):
        """Backward-compat guard: pre-MEH-327 tokens (no userFingerprint
        claim) must still pass even with no fp cookie present.

        Fail-open window: max 15 min (access token TTL). After expiry the
        next login issues a fingerprinted token and the guard is active.
        """
        from datetime import datetime, timedelta
        from joserfc import jwt as jose_jwt
        from joserfc.jwk import OctKey
        from app.config import settings

        user = make_user(db, email="fp5@test.com")
        expire = datetime.utcnow() + timedelta(minutes=15)
        payload = {
            "sub": str(user.id),
            "exp": expire,
            "tv": user.token_version,
            "scope": "access",
        }
        key = OctKey.import_key(settings.secret_key.encode())
        old_token = jose_jwt.encode({"alg": settings.algorithm}, payload, key)

        # No fp cookie — fail-open should pass
        res = client.get("/auth/me", headers={"Authorization": f"Bearer {old_token}"})
        assert res.status_code == 200
        assert res.json()["email"] == "fp5@test.com"

    def test_logout_clears_fingerprint_cookie(self, client, db):
        make_user(db, email="fp6@test.com", password="Zx7Yp9Mq2Lr4")
        self._login(client, "fp6@test.com")

        res = client.post("/auth/logout")
        assert res.status_code == 204

        cookies = self._all_set_cookies(res)
        fp_hdr = next((c for c in cookies if "__Secure-Fgp" in c), None)
        assert fp_hdr is not None, "No Set-Cookie header for __Secure-Fgp on logout"
        low = fp_hdr.lower()
        assert "max-age=0" in low or "expires=" in low

    def test_get_current_user_optional_with_invalid_fingerprint_returns_none(
        self, client, db
    ):
        """Token has userFingerprint claim but cookie is wrong →
        get_current_user_optional must return None (not 401).

        Documents the swallow-to-None behaviour of get_current_user_optional
        (auth.py:228-234): all non-403 HTTPExceptions are caught and
        return None, so a fingerprint-mismatch 401 never bubbles to the caller.
        """
        make_user(db, email="fp7@test.com", password="Zx7Yp9Mq2Lr4")
        login_res = self._login(client, "fp7@test.com")
        access_token = login_res.json()["access_token"]

        from fastapi.testclient import TestClient
        from app.main import app as _app

        attack_client = TestClient(_app)
        res = attack_client.get(
            "/producers",
            headers={"Authorization": f"Bearer {access_token}"},
            cookies={"__Secure-Fgp": "a" * 100},
        )
        assert res.status_code == 200  # viewer=None, request proceeds anonymously


# ============================================================
# MEH-329 — XSS sanitization sweep (integration tests)
# ============================================================


class TestSanitizationIntegration:
    """End-to-end checks that @field_validator sanitizers actually
    strip HTML before the row hits the DB. Unit-level coverage is in
    tests/test_sanitization.py; these tests lock the wire-to-row path
    for the three highest-risk surfaces.
    """

    def test_producer_description_sanitized(self, client, db):
        from app.models.models import Producer
        payload = {
            "email": "xss-producer@test.com",
            "name": "ניסוי",
            "password": "Zx7Yp9Mq2Lr4",
            "producer_name": "חוות הסקריפט",
            "description": "<script>alert(1)</script>טקסט נקי",
            "phone": "0501234567",
            "category_ids": [],
            "primary_contact_method": "whatsapp",
        }
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 200, resp.text
        row = db.query(Producer).filter(Producer.name == "חוות הסקריפט").first()
        assert row is not None
        assert "<script>" not in (row.description or "")
        assert "</script>" not in (row.description or "")
        assert "טקסט נקי" in (row.description or "")

    def test_home_product_description_sanitized(self, client, db, monkeypatch):
        from app.models.models import HomeProduct
        # Bypass AI moderation (no ANTHROPIC_API_KEY in CI).
        monkeypatch.setattr(
            "app.routers.home_products.validate_home_product",
            lambda data: {"status": "APPROVED", "reason": None, "suggestion": None},
        )
        user = make_user(db, email="xss-hp@test.com")
        resp = client.post(
            "/home-products",
            json={
                "title": "עוגה ביתית",
                "description": "<img src=x onerror=alert(1)>טעימה ביותר",
                "price": "30",
            },
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text
        row = db.query(HomeProduct).filter(HomeProduct.user_id == user.id).first()
        assert row is not None
        assert "<img" not in (row.description or "")
        assert "onerror" not in (row.description or "")
        assert "טעימה ביותר" in (row.description or "")

    def test_contact_message_sanitized(self, client, db):
        resp = client.post(
            "/contact",
            json={
                "name": "רות",
                "email": "ruth-xss@example.com",
                "message": "<script>alert(1)</script>שאלה רגילה על פלטפורמה",
            },
        )
        assert resp.status_code == 200, resp.text
        row = db.query(ContactMessage).filter(
            ContactMessage.email == "ruth-xss@example.com"
        ).first()
        assert row is not None
        assert "<script>" not in row.message
        assert "</script>" not in row.message
        assert "שאלה רגילה על פלטפורמה" in row.message


class TestAppleTokenVerification:
    """MEH-337 + MEH-440-followup. Apple OAuth verification + JWKS cache.

    Apple OAuth (routers/auth.py:_verify_apple_token, lines 944-975) is
    the ONLY pyjwt code path in the backend — primary auth uses joserfc.
    These tests lock the _verify_apple_token WRAPPER behavior; functional
    verification of pyjwt internals is delegated to pyjwt's upstream test
    suite + manual Apple OAuth smoke on Vercel preview.
    """

    APPLE_JWK = {
        "kid": "test-kid",
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "n": "placeholder-modulus-not-real",
        "e": "AQAB",
    }
    # All call sites MUST monkeypatch
    # pyjwt.algorithms.RSAAlgorithm.from_jwk; placeholder "n" will
    # not parse as a real RSA modulus.

    @pytest.fixture(autouse=True)
    def _reset_apple_jwks_cache(self):
        """MEH-440-followup: clear the module-level JWKS cache between
        tests so order-dependent state doesn't leak across cases."""
        from app.services.oauth_verifiers import _APPLE_JWKS_CACHE
        _APPLE_JWKS_CACHE["keys"] = None
        _APPLE_JWKS_CACHE["fetched_at"] = None
        yield
        _APPLE_JWKS_CACHE["keys"] = None
        _APPLE_JWKS_CACHE["fetched_at"] = None

    def _setup_mocks(self, monkeypatch, *, decoded_payload=None, decode_exc=None, jwks=None, header=None):
        from app import config
        import jwt as pyjwt
        import requests as req_mod

        monkeypatch.setattr(config.settings, "apple_client_id", "test.client.id")

        class _FakeResp:
            def __init__(self, payload):
                self._p = payload

            def raise_for_status(self):
                pass

            def json(self):
                return self._p

        keys_payload = jwks if jwks is not None else [self.APPLE_JWK]
        monkeypatch.setattr(req_mod, "get", lambda url, **kw: _FakeResp({"keys": keys_payload}))
        monkeypatch.setattr(
            pyjwt,
            "get_unverified_header",
            lambda token: header if header is not None else {"kid": "test-kid"},
        )
        monkeypatch.setattr(
            pyjwt.algorithms.RSAAlgorithm,
            "from_jwk",
            lambda *a, **kw: object(),
        )
        if decode_exc is not None:
            def _decode(*a, **kw):
                raise decode_exc
        else:
            payload = decoded_payload or {"sub": "user-123", "email": "u@apple.com"}

            def _decode(*a, **kw):
                return payload
        monkeypatch.setattr(pyjwt, "decode", _decode)

    def test_returns_payload_on_valid_token(self, monkeypatch):
        from app.routers.auth import _verify_apple_token

        self._setup_mocks(
            monkeypatch,
            decoded_payload={"sub": "u1", "email": "u@apple.com"},
        )
        result = _verify_apple_token("dummy.token.value")
        assert result == {"sub": "u1", "email": "u@apple.com"}

    def test_returns_none_when_apple_client_id_unset(self, monkeypatch):
        from app import config
        from app.routers.auth import _verify_apple_token

        monkeypatch.setattr(config.settings, "apple_client_id", "")
        result = _verify_apple_token("dummy.token.value")
        assert result is None

    def test_returns_none_on_invalid_signature(self, monkeypatch):
        from app.routers.auth import _verify_apple_token

        self._setup_mocks(monkeypatch, decode_exc=Exception("invalid signature"))
        result = _verify_apple_token("dummy.token.value")
        assert result is None

    def test_returns_none_on_unknown_kid(self, monkeypatch):
        from app.routers.auth import _verify_apple_token

        self._setup_mocks(
            monkeypatch,
            jwks=[{**self.APPLE_JWK, "kid": "OTHER"}],
            header={"kid": "test-kid"},
        )
        result = _verify_apple_token("dummy.token.value")
        assert result is None

    def test_returns_none_on_http_error(self, monkeypatch):
        """raise_for_status on 4xx/5xx → fail-open None (MEH-368)."""
        import requests as req_mod
        from app import config
        from app.routers.auth import _verify_apple_token

        monkeypatch.setattr(config.settings, "apple_client_id", "test.client.id")

        class _ErrorResp:
            def raise_for_status(self):
                raise req_mod.exceptions.HTTPError("503 Service Unavailable")

            def json(self):
                raise AssertionError("json() must not be called after raise_for_status")

        monkeypatch.setattr(req_mod, "get", lambda url, **kw: _ErrorResp())
        result = _verify_apple_token("dummy.token.value")
        assert result is None

    def test_returns_none_on_missing_keys_field(self, monkeypatch):
        """'keys' absent from JWKS body → None guard fires (MEH-368)."""
        import requests as req_mod
        from app import config
        from app.routers.auth import _verify_apple_token

        monkeypatch.setattr(config.settings, "apple_client_id", "test.client.id")

        class _BadKeysResp:
            def raise_for_status(self): pass
            def json(self): return {}

        monkeypatch.setattr(req_mod, "get", lambda url, **kw: _BadKeysResp())
        assert _verify_apple_token("dummy.token.value") is None

    def test_returns_none_on_empty_keys_list(self, monkeypatch):
        """Empty 'keys' list in JWKS body → None guard fires (MEH-368)."""
        import requests as req_mod
        from app import config
        from app.routers.auth import _verify_apple_token

        monkeypatch.setattr(config.settings, "apple_client_id", "test.client.id")

        class _BadKeysResp:
            def raise_for_status(self): pass
            def json(self): return {"keys": []}

        monkeypatch.setattr(req_mod, "get", lambda url, **kw: _BadKeysResp())
        assert _verify_apple_token("dummy.token.value") is None

    def test_requests_get_called_with_timeout(self, monkeypatch):
        """requests.get receives timeout=8 (MEH-368)."""
        import requests as req_mod
        from app.routers.auth import _verify_apple_token

        # _setup_mocks patches req_mod.get; capture its result then wrap it
        self._setup_mocks(monkeypatch)
        original_fake = req_mod.get
        captured = {}

        def _capturing_get(url, **kw):
            captured["timeout"] = kw.get("timeout")
            return original_fake(url, **kw)

        monkeypatch.setattr(req_mod, "get", _capturing_get)
        _verify_apple_token("dummy.token.value")
        assert captured.get("timeout") == 8

    def test_apple_jwks_cache_reuses_within_ttl(self, monkeypatch):
        """MEH-440-followup: a second verify within the TTL window must
        not re-fetch — the cached keys are reused."""
        import requests as req_mod
        from app.routers.auth import _verify_apple_token

        self._setup_mocks(monkeypatch)
        call_count = {"n": 0}
        original_fake = req_mod.get

        def _counting_get(url, **kw):
            call_count["n"] += 1
            return original_fake(url, **kw)

        monkeypatch.setattr(req_mod, "get", _counting_get)
        _verify_apple_token("dummy.token.value")
        _verify_apple_token("dummy.token.value")
        assert call_count["n"] == 1, "cache should serve the second call"

    def test_apple_jwks_cache_refetches_after_ttl(self, monkeypatch):
        """MEH-440-followup: once the TTL has elapsed, the next verify
        must re-fetch the JWKS."""
        import requests as req_mod
        from app.routers.auth import _verify_apple_token
        from app.services import oauth_verifiers

        self._setup_mocks(monkeypatch)
        call_count = {"n": 0}
        original_fake = req_mod.get

        def _counting_get(url, **kw):
            call_count["n"] += 1
            return original_fake(url, **kw)

        monkeypatch.setattr(req_mod, "get", _counting_get)

        # Drive time forward by patching time.time to return a value
        # past the TTL window between the two calls.
        fake_now = [1_000.0]

        def _fake_time():
            return fake_now[0]

        monkeypatch.setattr(oauth_verifiers.time, "time", _fake_time)

        _verify_apple_token("dummy.token.value")
        # Advance > TTL (3600s)
        fake_now[0] += oauth_verifiers._APPLE_JWKS_TTL_SECONDS + 1
        _verify_apple_token("dummy.token.value")
        assert call_count["n"] == 2, "cache must expire after TTL"

    def test_apple_jwks_kid_miss_refetches_once(self, monkeypatch):
        """MEH-468-followup: when the cache is fresh but the token's kid
        is missing (Apple rotated keys mid-TTL), force exactly one
        refetch and verify successfully against the new keyset."""
        import time as time_mod
        import requests as req_mod
        import jwt as pyjwt
        from app import config
        from app.services import oauth_verifiers
        from app.routers.auth import _verify_apple_token

        monkeypatch.setattr(config.settings, "apple_client_id", "test.client.id")

        # Pre-populate cache with the OLD kid; cache is fresh.
        old_jwk = {**self.APPLE_JWK, "kid": "OLD-KID"}
        new_jwk = {**self.APPLE_JWK, "kid": "NEW-KID"}
        oauth_verifiers._APPLE_JWKS_CACHE["keys"] = [old_jwk]
        oauth_verifiers._APPLE_JWKS_CACHE["fetched_at"] = time_mod.time()

        # The (only) refetch returns the new keyset.
        fetch_count = {"n": 0}

        class _FakeResp:
            def raise_for_status(self):
                pass

            def json(self):
                return {"keys": [new_jwk]}

        def _counting_get(url, **kw):
            fetch_count["n"] += 1
            return _FakeResp()

        monkeypatch.setattr(req_mod, "get", _counting_get)
        monkeypatch.setattr(
            pyjwt, "get_unverified_header", lambda token: {"kid": "NEW-KID"}
        )
        monkeypatch.setattr(
            pyjwt.algorithms.RSAAlgorithm, "from_jwk", lambda *a, **kw: object()
        )
        monkeypatch.setattr(
            pyjwt, "decode", lambda *a, **kw: {"sub": "u1", "email": "u@apple.com"}
        )

        result = _verify_apple_token("dummy.token.value")
        assert fetch_count["n"] == 1, "kid miss must trigger exactly one refetch"
        assert result == {"sub": "u1", "email": "u@apple.com"}

    def test_apple_jwks_negative_cache_during_outage(self, monkeypatch):
        """MEH-468-followup: when fetch fails with no cache, negative-cache
        the failure so subsequent calls within the TTL window return None
        without re-attempting the network — Apple stays unhammered."""
        import requests as req_mod
        from app import config
        from app.routers.auth import _verify_apple_token

        monkeypatch.setattr(config.settings, "apple_client_id", "test.client.id")

        fetch_count = {"n": 0}

        def _failing_get(url, **kw):
            fetch_count["n"] += 1
            raise req_mod.exceptions.ConnectionError("apple offline")

        monkeypatch.setattr(req_mod, "get", _failing_get)

        # Three calls, all within the TTL window (real time barely moves).
        assert _verify_apple_token("dummy.token.value") is None
        assert _verify_apple_token("dummy.token.value") is None
        assert _verify_apple_token("dummy.token.value") is None
        assert fetch_count["n"] == 1, "outage must be negative-cached"


# ---------------------------------------------------------------------------
# MEH-386: BOLA regression tests
# ---------------------------------------------------------------------------

class TestBOLA:
    """Regression suite for MEH-386 — Broken Object Level Authorization.

    Two confirmed findings:
      1. GET /home-products/{id} exposed hidden/deactivated listings to public.
      2. POST /category-requests accepted spoofed producer_id from anonymous callers.
    """

    def test_hidden_home_product_returns_404_to_anonymous(self, client, db, monkeypatch):
        """A product auto-hidden (is_hidden=True) must 404 for anonymous callers."""
        from app.models.models import HomeProduct
        monkeypatch.setattr(
            "app.routers.home_products.validate_home_product",
            lambda data: {"status": "APPROVED", "reason": None, "suggestion": None},
        )
        user = make_user(db, email="bola-hidden@test.com")
        create = client.post(
            "/home-products",
            json={"title": "עוגה", "description": "טעימה", "price": "25"},
            headers=auth_header(user),
        )
        assert create.status_code == 201
        pid = create.json()["id"]

        # Simulate auto-hide (3 negative ratings sets is_hidden=True)
        hp = db.query(HomeProduct).filter(HomeProduct.id == pid).first()
        hp.is_hidden = True
        db.commit()

        # Anonymous fetch → 404 (not 200)
        resp = client.get(f"/home-products/{pid}")
        assert resp.status_code == 404

    def test_hidden_home_product_visible_to_owner(self, client, db, monkeypatch):
        """Owner of a hidden listing can still view it."""
        from app.models.models import HomeProduct
        monkeypatch.setattr(
            "app.routers.home_products.validate_home_product",
            lambda data: {"status": "APPROVED", "reason": None, "suggestion": None},
        )
        user = make_user(db, email="bola-owner@test.com")
        create = client.post(
            "/home-products",
            json={"title": "גבינה", "description": "טרייה", "price": "40"},
            headers=auth_header(user),
        )
        assert create.status_code == 201
        pid = create.json()["id"]

        hp = db.query(HomeProduct).filter(HomeProduct.id == pid).first()
        hp.is_hidden = True
        db.commit()

        # Owner fetch → 200
        resp = client.get(f"/home-products/{pid}", headers=auth_header(user))
        assert resp.status_code == 200

    def test_deactivated_home_product_returns_404_to_anonymous(self, client, db, monkeypatch):
        """A deactivated listing (is_active=False) must 404 for anonymous callers."""
        from app.models.models import HomeProduct
        monkeypatch.setattr(
            "app.routers.home_products.validate_home_product",
            lambda data: {"status": "APPROVED", "reason": None, "suggestion": None},
        )
        user = make_user(db, email="bola-inactive@test.com")
        create = client.post(
            "/home-products",
            json={"title": "לחם", "description": "מחמצת", "price": "35"},
            headers=auth_header(user),
        )
        assert create.status_code == 201
        pid = create.json()["id"]

        # Soft-delete via DELETE endpoint
        client.delete(f"/home-products/{pid}", headers=auth_header(user))

        # Anonymous fetch → 404
        resp = client.get(f"/home-products/{pid}")
        assert resp.status_code == 404

    def test_category_request_producer_id_not_spoofable_anonymous(self, client, db):
        """An anonymous caller cannot spoof a producer_id on a category request."""
        import uuid as uuid_mod
        fake_id = str(uuid_mod.uuid4())
        resp = client.post(
            "/category-requests",
            json={"requested_name": "קפה מיוחד", "producer_id": fake_id},
        )
        assert resp.status_code == 201
        # producer_id must be None — the spoofed value is discarded
        assert resp.json()["producer_id"] is None

    def test_category_request_uses_authenticated_producer_id(self, client, db):
        """An authenticated producer's own producer_id is used, not one from the body."""
        import uuid as uuid_mod
        from app.models.models import Producer as ProducerModel
        producer = make_producer(db, name="בית קפה בודהה")
        user = make_user(db, email="bola-producer@test.com")
        user.producer_id = producer.id
        db.commit()

        fake_id = str(uuid_mod.uuid4())
        resp = client.post(
            "/category-requests",
            json={"requested_name": "קפה מיוחד", "producer_id": fake_id},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        # Must use authenticated user's producer_id, not the spoofed one
        assert body["producer_id"] == str(producer.id)
        assert body["producer_id"] != fake_id


class TestPublicStats:
    """GET /stats — public social-proof counter (MEH-521).

    Contract:
    - Anonymous (no auth).
    - Returns producers_count (approved only) and categories_count.
    - Returns 0 counts when no approved producers exist — never raises.
    """

    def test_stats_returns_200(self, client):
        resp = client.get("/stats")
        assert resp.status_code == 200

    def test_stats_schema(self, client):
        body = client.get("/stats").json()
        assert "producers_count" in body
        assert "categories_count" in body
        assert isinstance(body["producers_count"], int)
        assert isinstance(body["categories_count"], int)

    def test_stats_returns_zero_when_no_approved_producers(self, client, db):
        """MEH-521: endpoint must return 0 gracefully, not raise."""
        # No producers created → approved count is 0
        resp = client.get("/stats")
        assert resp.status_code == 200
        body = resp.json()
        assert body["producers_count"] == 0

    def test_stats_counts_only_approved_producers(self, client, db):
        """Pending producers must not inflate the counter."""
        make_producer(db, name="ממתין לאישור", status="pending")
        resp = client.get("/stats")
        body = resp.json()
        assert body["producers_count"] == 0
