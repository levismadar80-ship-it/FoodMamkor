"""Part 1 of 7 of `tests/test_api.py`: TestAuth.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_api.py` imports these tests, so
their node ids stay `tests/test_api.py::...`. Run them with
`pytest tests/test_api.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import Producer
from app.models.models import User
from conftest import auth_header
from conftest import make_user
from conftest import valid_producer_register_payload
from _test_api__common import _REGISTER_ACK_DETAIL  # noqa: F401
from _test_api__common import _signup_cookie_shape  # noqa: F401

class TestAuth:
    def test_register_new_email_creates_user_and_returns_ack(self, client, db):
        # MEH-328: OWASP-strict anti-enumeration. No access_token in body;
        # the user must verify via email then POST /auth/login. Row creation
        # is verified out-of-band via the DB query below.
        resp = client.post(
            "/auth/register",
            json={"terms_accepted": True, "email": "alice@test.com", "name": "Alice", "password": "Zx7Yp9Mq2Lr4"},
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

    def test_register_records_terms_consent_when_accepted(self, client, db):
        # MEH-1995: the whole point of the column is EVIDENCE, so this asserts
        # the stored consent record — not that a field was added to a schema.
        # An inert implementation (field accepted, never persisted) passes the
        # second kind of test and fails this one.
        from app.constants import TERMS_VERSION
        from app.models.models import User

        resp = client.post(
            "/auth/register",
            json={
                "email": "consent@example.com",
                "name": "Consent",
                "password": "Zx7Yp9Mq2Lr4",
                "terms_accepted": True,
            },
        )
        assert resp.status_code == 200
        created = db.query(User).filter(User.email == "consent@example.com").first()
        assert created is not None
        # Both halves matter: a timestamp alone proves only THAT she agreed,
        # the version proves WHAT she agreed to. Asserting one and not the
        # other would let half the record silently go missing.
        assert created.terms_accepted_at is not None
        assert created.terms_version == TERMS_VERSION

    def test_register_without_terms_flag_is_422(self, client, db):
        # MEH-2080 (supersedes the MEH-1995 case that accepted this body with
        # a 200 and a NULL consent row): the checkbox is mandatory and carries
        # the 18+ self-declaration, so an omitted flag is refused at the
        # schema and no user row is written. Shown failing first: against the
        # MEH-1995 schema this body returns 200 and the row exists.
        from app.models.models import User

        resp = client.post(
            "/auth/register",
            json={
                "email": "noconsent@example.com",
                "name": "NoConsent",
                "password": "Zx7Yp9Mq2Lr4",
            },
        )
        assert resp.status_code == 422, resp.text
        assert db.query(User).filter(User.email == "noconsent@example.com").first() is None

    def test_register_with_terms_false_is_422(self, client, db):
        # MEH-2080: an explicit False is not "no record" — it is a refusal of
        # a mandatory declaration, and it is refused the same way. The
        # validator, not the handler, is what the client-side `required`
        # attribute leans on (MEH-2015 asterisk invariant).
        from app.models.models import User

        resp = client.post(
            "/auth/register",
            json={
                "email": "refused@example.com",
                "name": "Refused",
                "password": "Zx7Yp9Mq2Lr4",
                "terms_accepted": False,
            },
        )
        assert resp.status_code == 422, resp.text
        assert db.query(User).filter(User.email == "refused@example.com").first() is None

    def test_register_producer_records_terms_consent(self, client, db):
        # MEH-1995: the producer password path stamps via a SECOND, hand-copied
        # call site. The consumer tests above cannot see it — delete that site
        # and they stay green — so it needs its own assertion or the stamp is
        # unguarded on half the flows that write it.
        from app.constants import TERMS_VERSION
        from app.models.models import User

        payload = valid_producer_register_payload()
        payload["email"] = "producer_consent@example.com"
        payload["phone"] = "0521234567"  # required for the whatsapp contact method
        payload["terms_accepted"] = True
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 200, resp.text
        created = (
            db.query(User)
            .filter(User.email == "producer_consent@example.com")
            .first()
        )
        assert created is not None
        assert created.terms_accepted_at is not None
        assert created.terms_version == TERMS_VERSION

    def test_register_producer_without_terms_is_422(self, client, db):
        # MEH-2080: the producer path has its own hand-copied schema and its
        # own stamp site (auth.py); the consumer 422 above cannot see it.
        from app.models.models import User

        payload = valid_producer_register_payload()
        payload["email"] = "producer_noterms@example.com"
        payload["phone"] = "0521234567"
        payload.pop("terms_accepted", None)
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 422, resp.text
        assert (
            db.query(User).filter(User.email == "producer_noterms@example.com").first()
            is None
        )

    def test_register_producer_with_terms_false_is_422(self, client, db):
        # MEH-2080: the producer schema shares the validator with the consumer
        # one, but a shared validator is a claim about the code, not a test of
        # it — an explicit False on ProducerRegister is refused the same way.
        from app.models.models import User

        payload = valid_producer_register_payload()
        payload["email"] = "producer_refused@example.com"
        payload["phone"] = "0521234567"
        payload["terms_accepted"] = False
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 422, resp.text
        assert (
            db.query(User).filter(User.email == "producer_refused@example.com").first()
            is None
        )

    def test_register_producer_upgrade_without_terms_is_422(self, client, db):
        # MEH-2080: the upgrade path mutates current_user instead of building
        # a User, and renders the same checkbox — so the same 422 applies, and
        # the account must stay a consumer when the flag is missing.
        from app.models.models import User

        user = make_user(db, email="upgrader_noterms@example.com")
        payload = valid_producer_register_payload()
        payload.pop("email", None)
        payload.pop("password", None)
        payload.pop("name", None)
        payload["phone"] = "0521234567"
        payload.pop("terms_accepted", None)
        resp = client.post(
            "/auth/register/producer",
            json=payload,
            headers=auth_header(user),
        )
        assert resp.status_code == 422, resp.text
        db.expire_all()
        still = db.query(User).filter(User.email == "upgrader_noterms@example.com").first()
        assert still.role == "consumer"  # make_user default; a None role must not pass this
        assert still.terms_accepted_at is None

    def test_register_producer_upgrade_records_terms_consent(self, client, db):
        # MEH-1995 (adversarial review R-1): the MEH-143 upgrade path does NOT
        # construct a User — it mutates current_user — so it fell outside the
        # "enumerate every User(...) site" sweep that produced the other stamps
        # and shipped, briefly, with the consent discarded.
        #
        # This is the sharpest case in the ticket, not an edge: the checkbox is
        # rendered for upgrade users with no isUpgrade condition and HARD-GATES
        # their submit, and the flag rides the shared body object. So the consent
        # provably happened and was transmitted, and NULL would be the database
        # asserting "no record" about it.
        from app.constants import TERMS_VERSION
        from app.models.models import User

        user = make_user(db, email="upgrader@example.com")
        assert user.terms_accepted_at is None  # precondition: nothing recorded

        payload = valid_producer_register_payload()
        payload.pop("email", None)
        payload.pop("password", None)
        payload.pop("name", None)
        payload["phone"] = "0521234567"  # required for the whatsapp contact method
        payload["terms_accepted"] = True
        resp = client.post(
            "/auth/register/producer",
            json=payload,
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        db.expire_all()
        upgraded = db.query(User).filter(User.email == "upgrader@example.com").first()
        assert upgraded.role == "producer"  # the upgrade actually happened
        assert upgraded.terms_accepted_at is not None
        assert upgraded.terms_version == TERMS_VERSION

    def test_producer_upgrade_without_flag_preserves_existing_consent(
        self, client, db
    ):
        # MEH-1995 (CI review): the stamp at auth.py is guarded on the flag
        # precisely so an upgrade CANNOT erase a consent this user already gave
        # at consumer registration. That invariant is asserted in the handler's
        # comment and in the PR body, and until this test nothing checked it —
        # a refactor adding `else: user.terms_accepted_at = None` would keep all
        # five other MEH-1995 tests green while destroying real consent records.
        #
        # Erasure is the worst outcome in the ticket's own terms: it converts
        # evidence we hold into the database asserting "no record" about an
        # acceptance that provably happened. Deletion is worse than never having
        # stamped, because the row is the defence.
        from datetime import datetime, timezone

        from app.constants import TERMS_VERSION
        from app.models.models import User

        earlier = datetime(2026, 1, 15, 9, 30, tzinfo=timezone.utc)
        user = make_user(db, email="preserve@example.com")
        user.terms_accepted_at = earlier
        user.terms_version = TERMS_VERSION
        db.commit()

        payload = valid_producer_register_payload()
        payload.pop("email", None)
        payload.pop("password", None)
        payload.pop("name", None)
        payload["phone"] = "0521234567"
        # MEH-2080: an omitted flag is now refused at the schema (422), so the
        # invariant this test guards has moved one layer out — the refused
        # request must leave the earlier consent exactly as it was. Before
        # MEH-2080 this body returned 200 with the same preservation check.
        payload.pop("terms_accepted", None)

        resp = client.post(
            "/auth/register/producer",
            json=payload,
            headers=auth_header(user),
        )
        assert resp.status_code == 422, resp.text
        db.expire_all()
        still = db.query(User).filter(User.email == "preserve@example.com").first()
        assert still.role == "consumer"  # refused, so no upgrade — and not a vacuous "not producer"
        # The pre-existing consent survives the refusal, unchanged in both columns.
        assert still.terms_accepted_at is not None
        assert still.terms_accepted_at.astimezone(timezone.utc) == earlier
        assert still.terms_version == TERMS_VERSION

    def test_consent_columns_are_exposed_by_no_endpoint(self, client, db):
        # MEH-1995 (CI review): the audit-only exposure contract is the whole
        # privacy posture of this feature, and until this test it was held up by
        # a code comment plus the fact that Pydantic maps only declared fields.
        # Neither is a check. This asserts the property BEHAVIOURALLY — the
        # strings must not appear in the JSON — so a future "ADR-006 R2 parity
        # sweep" that adds them to UserOut or UserAdminOut goes red here instead
        # of quietly publishing a consent timestamp.
        #
        # Deliberately asserts on the raw response TEXT, not on parsed keys: a
        # nested serializer that buried the field one level down would still
        # leak it, and `not in resp.json()` only inspects top-level keys.
        from datetime import datetime, timezone

        from app.constants import TERMS_VERSION

        user = make_user(db, email="exposure@example.com")
        user.terms_accepted_at = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
        user.terms_version = TERMS_VERSION
        db.commit()

        # 1. The user's own profile payload (UserOut).
        me = client.get("/auth/me", headers=auth_header(user))
        assert me.status_code == 200
        assert "terms_accepted_at" not in me.text
        assert "terms_version" not in me.text

        # 2. The admin listing (UserAdminOut) — stricter than the sibling
        #    declared_at/declaration_version pair, which IS admin-visible.
        admin = make_user(db, email="exposure-admin@example.com", role="admin")
        listing = client.get("/admin/users", headers=auth_header(admin))
        assert listing.status_code == 200, listing.text
        assert "exposure@example.com" in listing.text  # the row IS returned…
        assert "terms_accepted_at" not in listing.text  # …without the consent
        assert "terms_version" not in listing.text  # columns on it

    def test_terms_version_fits_the_column(self):
        # MEH-1995 (CI review, Minor): terms_version is VARCHAR(10) and the
        # current value is EXACTLY 10 chars, so the column has zero headroom.
        # A bump to a double-digit revision ("2026-08-v10") is 11 and would be
        # silently truncated or rejected at the DB layer, on the one column
        # whose job is to name WHICH wording was agreed to.
        #
        # Asserted as a test rather than a module-level `assert` because
        # `python -O` strips assert statements, which would make the guard
        # vanish in exactly the optimized builds that run in production.
        from app.constants import TERMS_VERSION

        assert len(TERMS_VERSION) <= 10, (
            f"TERMS_VERSION={TERMS_VERSION!r} is {len(TERMS_VERSION)} chars; "
            "users.terms_version is VARCHAR(10). Widen the column via an "
            "Alembic revision before bumping the version string."
        )

    def test_register_stores_timezone_aware_consent_timestamp(self, client, db):
        # MEH-1995 (adversarial review R-3): the column is DateTime(timezone=True)
        # and naive utc_now() is in use 16 lines from the stamp, so "is not None"
        # would pass just as happily on a naive value. For a column whose whole
        # evidentiary worth is WHICH INSTANT, a silent offset is the failure that
        # matters — a naive datetime lands in a TIMESTAMPTZ interpreted in the
        # session TimeZone, not as UTC. This pins the one property nothing else did.
        from datetime import timedelta
        from app.models.models import User

        resp = client.post(
            "/auth/register",
            json={
                "email": "tzaware@example.com",
                "name": "TZ",
                "password": "Zx7Yp9Mq2Lr4",
                "terms_accepted": True,
            },
        )
        assert resp.status_code == 200
        created = db.query(User).filter(User.email == "tzaware@example.com").first()
        assert created.terms_accepted_at.tzinfo is not None
        assert created.terms_accepted_at.utcoffset() == timedelta(0)

    def test_register_duplicate_email_returns_identical_ack(self, client, db):
        # MEH-328: must NOT 400 (legacy behaviour leaked existence). Same
        # 200 + body as the new-email path. No second user row created.
        make_user(db, email="dup@test.com")
        from app.models.models import User
        before = db.query(User).filter(User.email == "dup@test.com").count()
        resp = client.post(
            "/auth/register",
            json={"terms_accepted": True, "email": "dup@test.com", "name": "x", "password": "Zx7Yp9Mq2Lr4"},
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

        def fake_dup(to, name, provider, test_cause=False):
            captured["to"] = to
            captured["name"] = name
            captured["provider"] = provider

        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email", fake_dup
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email", fake_dup
        )
        # Also stub the verify-mail so a hypothetical regression that
        # treats the existing email as "new" would still not send the
        # wrong notification (would fail captured["provider"] assertion).
        monkeypatch.setattr(
            "app.routers.auth._send_verify_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_verify_email", lambda *a, **kw: None
        )
        resp = client.post(
            "/auth/register",
            json={"terms_accepted": True,
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
            lambda to, name, provider, flow="consumer", test_cause=False: captured.update(
                to=to, name=name, provider=provider, flow=flow
            ),
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email",
            lambda to, name, provider, flow="consumer", test_cause=False: captured.update(
                to=to, name=name, provider=provider, flow=flow
            ),
        )
        resp = client.post(
            "/auth/register",
            json={"terms_accepted": True,
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
            json={"terms_accepted": True,
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
            "app.routers.auth_register_producer._send_verify_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_welcome_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_welcome_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda *a, **kw: None,
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email",
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
        # MEH-1624 gap 1: the apple-collision branch (auth.py:338) was absent
        # from this set, so a divergence unique to Apple would have shipped
        # green. Quad, not triple.
        db.add(
            User(
                email="ident_a@test.com",
                name="AUser",
                apple_id="apple-sub-ident",
                role="consumer",
                email_verified=True,
            )
        )
        db.commit()

        def post(email):
            return client.post(
                "/auth/register",
                json={"terms_accepted": True,
                    "email": email,
                    "name": "Tester",
                    "password": "Zx7Yp9Mq2Lr4",
                },
            )

        r_new = post("ident_new@test.com")
        r_pw = post("ident_pw@test.com")
        r_g = post("ident_g@test.com")
        r_a = post("ident_a@test.com")
        for r in (r_new, r_pw, r_g, r_a):
            assert r.status_code == 200
        # Content (the response body the attacker sees) must be byte-identical.
        assert r_new.content == r_pw.content == r_g.content == r_a.content
        # Defensive: also no Set-Cookie divergence between branches.
        # MEH-3087: every branch now sets ONE signup-marker cookie. Its value
        # is an HMAC that differs per request (also between two new-email
        # replies), so the comparison is on everything but the value: one
        # cookie, same name, same attributes, same value length.
        shapes = [_signup_cookie_shape(r) for r in (r_new, r_pw, r_g, r_a)]
        assert shapes[0] == shapes[1] == shapes[2] == shapes[3]
        assert shapes[0][0] == "signup_marker"

    def test_login_returns_jwt(self, client, db):
        make_user(db, email="bob@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
        resp = client.post(
            "/auth/login",
            json={"email": "bob@test.com", "password": "Zx7Yp9Mq2Lr4"},
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    def test_login_wrong_password(self, client, db):
        make_user(db, email="bob2@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
        resp = client.post(
            "/auth/login",
            json={"email": "bob2@test.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    def test_login_blocked_user_returns_403(self, client, db):
        make_user(db, email="blocked@test.com", password="Zx7Yp9Mq2Lr4", is_blocked=True)  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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

    @property
    def VALID_PRODUCER_REG(self):
        # MEH-1153: derive from the shared helper (it seeds a real category, now
        # required by ProducerRegister) rather than a static dict; a property so
        # the many `{**self.VALID_PRODUCER_REG, ...}` spreads below are unchanged.
        # Pins the email/name/producer_name this suite's assertions look up.
        return valid_producer_register_payload() | {
            "email": "producer@test.com",
            "name": "שרה ישראלית",
            "producer_name": "חוות שרה",
            "phone": "0501234567",
        }

    def _upgrade_reg(self, **overrides):
        # Upgrade-path variant: drop the email/name/password the upgrade flow
        # ignores (it uses the authenticated identity).
        base = valid_producer_register_payload()
        for field in ("email", "name", "password"):
            base.pop(field, None)
        return {**base, "phone": "0521234567", **overrides}

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
        # MEH-2100: registration creates a DRAFT — the business is NOT in the
        # admin queue until she presses "שליחה לבדיקה".
        assert producer.status == "draft"

    # --- MEH-1838 chunk A: delivery-shape fields on registration ---

    def test_register_producer_omits_delivery_fields_defaults_to_physical_only(
        self, client, db
    ):
        """Backward compat: a payload that omits the 4 new fields entirely
        (every existing caller/test) must keep succeeding, landing on the
        same defaults the Producer column defaults already carry."""
        from app.models.models import Producer

        resp = client.post("/auth/register/producer", json=self.VALID_PRODUCER_REG)
        assert resp.status_code == 200
        producer = db.query(Producer).filter(Producer.name == "חוות שרה").first()
        assert producer.has_physical_location is True
        assert producer.offers_delivery is False
        assert producer.delivery_nationwide is False
        assert producer.delivery_areas == []

    def test_register_producer_neither_physical_nor_delivery_422(self, client):
        resp = client.post(
            "/auth/register/producer",
            json={
                **self.VALID_PRODUCER_REG,
                "has_physical_location": False,
                "offers_delivery": False,
            },
        )
        assert resp.status_code == 422

    # A dedicated "explicit physical-only" case was deliberately NOT added
    # here: has_physical_location=True/offers_delivery=False are also the
    # Producer column defaults, so a payload asserting exactly that state is
    # indistinguishable from "the fields don't exist and defaults applied" —
    # proven non-discriminating (still passed with the pre-fix schema/router
    # stashed out). test_register_producer_omits_delivery_fields_defaults_to_physical_only
    # above already covers that state; this class of case is instead proven
    # by the nationwide / city-list / upgrade-path tests below, none of
    # which match a column default.

    def test_register_producer_nationwide_persists_shape(self, client, db):
        from app.models.models import Producer

        resp = client.post(
            "/auth/register/producer",
            json={
                **self.VALID_PRODUCER_REG,
                "has_physical_location": False,
                "offers_delivery": True,
                "delivery_nationwide": True,
            },
        )
        assert resp.status_code == 200
        producer = db.query(Producer).filter(Producer.name == "חוות שרה").first()
        assert producer.has_physical_location is False
        assert producer.offers_delivery is True
        assert producer.delivery_nationwide is True
        # MEH-1838 chunk A / Phase 0: delivery_cities is dead (MEH-903 A) —
        # a nationwide registration correctly leaves it untouched too.
        assert producer.delivery_areas == []

    def test_register_producer_city_list_persists_shape(self, client, db):
        """The flat city list must land as delivery_areas rows — the ONLY
        store producer_listing.py's delivery-city match reads
        (producer_listing.py:258) — not the dead delivery_cities column
        (Phase 0, MEH-903 A)."""
        from app.models.models import Producer

        resp = client.post(
            "/auth/register/producer",
            json={
                **self.VALID_PRODUCER_REG,
                "has_physical_location": False,
                "offers_delivery": True,
                "delivery_nationwide": False,
                "delivery_cities": ["חיפה", "ירושלים"],
            },
        )
        assert resp.status_code == 200
        producer = db.query(Producer).filter(Producer.name == "חוות שרה").first()
        assert producer.offers_delivery is True
        assert producer.delivery_nationwide is False
        # The dead column stays empty — proves the write did NOT go there.
        assert producer.delivery_cities == []
        assert {da.city for da in producer.delivery_areas} == {"חיפה", "ירושלים"}

    def test_register_producer_nationwide_and_city_list_both_set_422(self, client):
        """Mirrors the DB CHECK delivery_nationwide_xor_cities — mutually
        exclusive, blocked client-side before it ever reaches the CHECK."""
        resp = client.post(
            "/auth/register/producer",
            json={
                **self.VALID_PRODUCER_REG,
                "has_physical_location": False,
                "offers_delivery": True,
                "delivery_nationwide": True,
                "delivery_cities": ["חיפה"],
            },
        )
        assert resp.status_code == 422

    def test_register_producer_nationwide_without_offers_delivery_422(self, client):
        """delivery_nationwide=True with offers_delivery left False is the
        MEH-1879 contradiction (models.py:466's producer_nationwide_requires_delivery
        CHECK) — both fields carry defaults, so a payload naming only
        delivery_nationwide would otherwise reach the DB and 500."""
        resp = client.post(
            "/auth/register/producer",
            json={
                **self.VALID_PRODUCER_REG,
                "has_physical_location": True,
                "delivery_nationwide": True,
            },
        )
        assert resp.status_code == 422

    def test_register_producer_upgrade_path_persists_delivery_shape(self, client, db):
        """The upgrade (authenticated) branch is a separate Producer(...)
        constructor from the new-email branch above — both must wire the
        same 4 fields, or an authenticated business owner silently loses
        the shape she just selected."""
        from app.models.models import Producer

        u = make_user(db, email="upgrade_delivery@test.com")
        resp = client.post(
            "/auth/register/producer",
            json=self._upgrade_reg(
                has_physical_location=False,
                offers_delivery=True,
                delivery_nationwide=True,
            ),
            headers=auth_header(u),
        )
        assert resp.status_code == 200
        db.refresh(u)
        producer = db.query(Producer).filter(Producer.id == u.producer_id).first()
        assert producer.has_physical_location is False
        assert producer.offers_delivery is True
        assert producer.delivery_nationwide is True

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
            lambda to, name, provider, flow="consumer", test_cause=False: captured.update(
                to=to, name=name, provider=provider, flow=flow
            ),
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email",
            lambda to, name, provider, flow="consumer", test_cause=False: captured.update(
                to=to, name=name, provider=provider, flow=flow
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
        # MEH-1815: the producer branch must request the producer copy. The
        # consumer variant says only "you already have an account" and never
        # mentions that the entire business payload was discarded, which is
        # the silent data loss this ticket exists to close.
        assert captured.get("flow") == "producer"

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
            lambda to, name, provider, flow="consumer", test_cause=False: captured.update(
                to=to, name=name, provider=provider, flow=flow
            ),
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email",
            lambda to, name, provider, flow="consumer", test_cause=False: captured.update(
                to=to, name=name, provider=provider, flow=flow
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
        assert captured.get("flow") == "producer"  # MEH-1815

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
            "app.routers.auth_register_producer._send_verify_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_welcome_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_welcome_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email",
            lambda *a, **kw: None,
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email",
            lambda *a, **kw: None,
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer.notify_producer_registered", lambda *a, **kw: None
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
        # MEH-1624 gap 1: apple-collision (auth.py:695) joins the set — same
        # reasoning as the /auth/register sibling above.
        db.add(
            User(
                email="prod_ident_a@test.com",
                name="AUser",
                apple_id="apple-sub-prod-ident",
                role="consumer",
                email_verified=True,
            )
        )
        db.commit()

        # MEH-1624: the per-IP cap on auth.py:378 is what forced this — when
        # it was 3/hour the original triple sat exactly ON the ceiling, and a
        # 4th request from one IP returned 429, proving nothing about response
        # bytes. MEH-1635 widened that cap to 10/hour, so the triple no longer
        # brushes it; the IP rotation stays regardless, because it makes this
        # test independent of the per-IP value instead of merely far enough
        # below it. Same technique as
        # TestRegisterPerEmailRateLimit below; the emails are all distinct, so
        # the per-email bucket never accumulates either. Request headers do
        # not affect the response body being compared.
        monkeypatch.setenv("TRUSTED_PROXY", "1")

        def post(email, producer_name, ip):
            return client.post(
                "/auth/register/producer",
                json={
                    **self.VALID_PRODUCER_REG,
                    "email": email,
                    "producer_name": producer_name,
                },
                headers={"X-Real-IP": ip},
            )

        r_new = post("prod_ident_new@test.com", "חוות חדשה", "198.51.100.1")
        r_pw = post("prod_ident_pw@test.com", "חוות פסבורד", "198.51.100.2")
        r_g = post("prod_ident_g@test.com", "חוות גוגל", "198.51.100.3")
        r_a = post("prod_ident_a@test.com", "חוות אפל", "198.51.100.4")
        for r in (r_new, r_pw, r_g, r_a):
            assert r.status_code == 200
        assert r_new.content == r_pw.content == r_g.content == r_a.content
        # MEH-3087: every branch now sets ONE signup-marker cookie. Its value
        # is an HMAC that differs per request (also between two new-email
        # replies), so the comparison is on everything but the value: one
        # cookie, same name, same attributes, same value length.
        shapes = [_signup_cookie_shape(r) for r in (r_new, r_pw, r_g, r_a)]
        assert shapes[0] == shapes[1] == shapes[2] == shapes[3]
        assert shapes[0][0] == "signup_marker"

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
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email",
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
        from app.models.models import User
        user = make_user(db, email="consumer@upgrade.com", role="consumer")
        resp = client.post(
            "/auth/register/producer",
            json=self._upgrade_reg(),
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
        producer = Producer(name="קיים", status="draft")
        db.add(producer)
        db.flush()
        user.producer_id = producer.id
        db.commit()
        resp = client.post(
            "/auth/register/producer",
            json=self._upgrade_reg(),
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
            json=self._upgrade_reg(),
        )
        assert resp.status_code == 422
