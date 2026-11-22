"""Part 2 of 7 of `tests/test_api.py`: TestRegisterPerEmailRateLimit, TestRegistrationCoverageGaps, TestRegisterProducerContactMethodPresence, TestRegisterProducerRequiredFieldsNonUpgrade, TestRegisterPerIpRateLimit, TestLoginTimingEqualization.

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
import pytest
from _test_api__common import _REGISTER_ACK_DETAIL  # noqa: F401

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
        payload = {
            "email": "rl_victim_register@test.com",
            "name": "Victim",
            "password": "Zx7Yp9Mq2Lr4",
            "terms_accepted": True,  # MEH-2080
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
        """Per-IP=10/hour (auth.py:378) + per-email=5/15min (auth.py:379).

        This test rotates IPs via X-Real-IP (TRUSTED_PROXY=1 to honor the
        header in get_real_client_ip) so each request hits a fresh per-IP
        bucket and only per-email accumulates. Sixth request from a 6th
        distinct IP, same email → 429, and the 429 can only have come from
        the per-email half.

        The rotation was originally required: under the old 3/hour per-IP cap
        (MEH-1635 widened it to 10/hour) a single client tripped per-IP first
        and the test could not tell the two limiters apart. At 10/hour six
        requests no longer reach the per-IP ceiling, so rotation is no longer
        strictly necessary — it is kept because it pins the per-EMAIL cap
        independently of whatever the per-IP value happens to be.
        """
        monkeypatch.setenv("TRUSTED_PROXY", "1")
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
            "app.routers.auth_register_producer.notify_producer_registered",
            lambda *a, **kw: None,
        )
        payload = valid_producer_register_payload() | {
            "email": "rl_victim_producer@test.com",
            "name": "שרה",
            "producer_name": "חוות שרה",
            "phone": "0501234567",
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


class TestRegistrationCoverageGaps:
    """MEH-1624 — the pins the 27/07 registration-coverage audit found missing.

    Tests-only batch; every gap below was reachable production behaviour with
    nothing asserting it. Gap numbers match the audit matrix / issue section 2.
    """

    def _producer_reg(self, **overrides):
        return valid_producer_register_payload() | {
            "email": "gap@example.com",
            "name": "שרה",
            "producer_name": "חוות הפערים",
            "phone": "0501234567",
            **overrides,
        }

    # --- gap 1: apple-collision duplicate-attempt dispatch ---------------

    def test_register_existing_apple_user_dispatches_dup_email(
        self, client, db, monkeypatch
    ):
        """auth.py:338 — the apple arm of the provider ladder. Google and
        password were pinned; Apple was not, so a wrong provider label (or a
        missing dispatch) on this arm shipped green."""
        db.add(
            User(
                email="dup_a@test.com",
                name="Avigail",
                apple_id="apple-sub-dup",
                role="consumer",
                email_verified=True,
            )
        )
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
                "email": "dup_a@test.com",
                "name": "Attacker",
                "password": "Zx7Yp9Mq2Lr4",
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        assert captured.get("provider") == "apple"
        # Body uses the EXISTING user's name, never the attacker-supplied one.
        assert captured.get("name") == "Avigail"

    def test_register_producer_existing_apple_dispatches_dup_email(
        self, client, db, monkeypatch
    ):
        """auth.py:695 — same ladder on the producer endpoint."""
        db.add(
            User(
                email="dup_pa@test.com",
                name="Avigail",
                apple_id="apple-sub-dup-prod",
                role="consumer",
                email_verified=True,
            )
        )
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
            json=self._producer_reg(email="dup_pa@test.com"),
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        assert captured.get("provider") == "apple"
        assert captured.get("name") == "Avigail"
        assert captured.get("flow") == "producer"  # MEH-1815

    # --- gap 6: the provider=None defensive arm --------------------------

    def test_register_collision_with_no_auth_method_sends_nothing(
        self, client, db, monkeypatch
    ):
        """auth.py:340-348 — a row with no password_hash / google_id /
        apple_id. The handler logs and swallows; the response must stay
        byte-identical and NO duplicate-attempt email may go out (there is no
        provider to name in it)."""
        from unittest.mock import Mock

        db.add(
            User(
                email="noauth@test.com",
                name="NoAuth",
                role="consumer",
                email_verified=True,
            )
        )
        db.commit()
        dup = Mock()
        monkeypatch.setattr("app.routers.auth._send_duplicate_attempt_email", dup)
        monkeypatch.setattr("app.routers.auth_register_producer._send_duplicate_attempt_email", dup)
        resp = client.post(
            "/auth/register",
            json={"terms_accepted": True,
                "email": "noauth@test.com",
                "name": "Attacker",
                "password": "Zx7Yp9Mq2Lr4",
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        dup.assert_not_called()
        # And the swallow must not have created a second row.
        assert db.query(User).filter(User.email == "noauth@test.com").count() == 1

    def test_register_producer_collision_with_no_auth_method_sends_nothing(
        self, client, db, monkeypatch
    ):
        """auth.py:697-702 — producer-side twin of the arm above."""
        from unittest.mock import Mock

        db.add(
            User(
                email="noauth_p@test.com",
                name="NoAuth",
                role="consumer",
                email_verified=True,
            )
        )
        db.commit()
        dup = Mock()
        monkeypatch.setattr("app.routers.auth._send_duplicate_attempt_email", dup)
        monkeypatch.setattr("app.routers.auth_register_producer._send_duplicate_attempt_email", dup)
        resp = client.post(
            "/auth/register/producer",
            json=self._producer_reg(email="noauth_p@test.com"),
        )
        assert resp.status_code == 200
        assert resp.json() == {"detail": _REGISTER_ACK_DETAIL}
        dup.assert_not_called()

    # --- gap 7: no verification email on a collision ---------------------

    def test_register_collision_sends_no_verification_email(
        self, client, db, monkeypatch
    ):
        """Absence pin. The existing collision tests STUB _send_verify_email
        but never assert it stayed unused — a regression that treated the
        existing email as new would have leaked a verification token to an
        address the attacker does not control."""
        from unittest.mock import Mock

        make_user(db, email="novertify@test.com", name="Dana")
        verify = Mock()
        monkeypatch.setattr("app.routers.auth._send_verify_email", verify)
        monkeypatch.setattr("app.routers.auth_register_producer._send_verify_email", verify)
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email", lambda *a, **kw: None
        )
        resp = client.post(
            "/auth/register",
            json={"terms_accepted": True,
                "email": "novertify@test.com",
                "name": "Attacker",
                "password": "Zx7Yp9Mq2Lr4",
            },
        )
        assert resp.status_code == 200
        verify.assert_not_called()

    def test_register_producer_collision_sends_no_verification_email(
        self, client, db, monkeypatch
    ):
        """Producer-side twin of the absence pin above."""
        from unittest.mock import Mock

        make_user(db, email="novertify_p@test.com", name="Dana")
        verify = Mock()
        monkeypatch.setattr("app.routers.auth._send_verify_email", verify)
        monkeypatch.setattr("app.routers.auth_register_producer._send_verify_email", verify)
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email", lambda *a, **kw: None
        )
        resp = client.post(
            "/auth/register/producer",
            json=self._producer_reg(email="novertify_p@test.com"),
        )
        assert resp.status_code == 200
        verify.assert_not_called()

    # --- gap 8: score_producer dispatch ----------------------------------

    def test_register_producer_dispatches_score_producer(
        self, client, db, monkeypatch
    ):
        """auth.py:680. The service has thorough unit coverage but nothing
        asserted the register handler actually schedules it — deleting the
        add_task line would have kept the whole suite green."""
        from unittest.mock import Mock

        from app.models.models import Producer

        score = Mock()
        monkeypatch.setattr("app.routers.auth_register_producer.score_producer", score)
        resp = client.post(
            "/auth/register/producer",
            json=self._producer_reg(email="scored@example.com"),
        )
        assert resp.status_code == 200
        producer = db.query(Producer).filter(Producer.name == "חוות הפערים").one()
        score.assert_called_once_with(producer.id)

    def test_upgrade_dispatches_score_producer(self, client, db, monkeypatch):
        """auth.py:552 — the upgrade path schedules it too."""
        from unittest.mock import Mock

        from app.models.models import Producer

        user = make_user(db, email="upgrade_score@example.com", role="consumer")
        score = Mock()
        monkeypatch.setattr("app.routers.auth_register_producer.score_producer", score)
        payload = valid_producer_register_payload()
        for field in ("email", "name", "password"):
            payload.pop(field, None)
        resp = client.post(
            "/auth/register/producer",
            json=payload | {"producer_name": "חוות שדרוג", "phone": "0521234567"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        producer = db.query(Producer).filter(Producer.name == "חוות שדרוג").one()
        score.assert_called_once_with(producer.id)

    def test_register_producer_collision_does_not_dispatch_score_producer(
        self, client, db, monkeypatch
    ):
        """Absence half of gap 8 — the collision branch must stay
        side-effect-symmetric (no producer row exists to score)."""
        from unittest.mock import Mock

        make_user(db, email="noscore@test.com")
        score = Mock()
        monkeypatch.setattr("app.routers.auth_register_producer.score_producer", score)
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email", lambda *a, **kw: None
        )
        resp = client.post(
            "/auth/register/producer",
            json=self._producer_reg(email="noscore@test.com"),
        )
        assert resp.status_code == 200
        score.assert_not_called()

    # --- gap 9: welcome-email dispatch, both role variants ---------------

    def test_register_consumer_dispatches_consumer_welcome(
        self, client, monkeypatch
    ):
        """auth.py:326-328 — the role argument is what selects the template,
        so it is the part worth pinning."""
        from unittest.mock import Mock

        welcome = Mock()
        monkeypatch.setattr("app.routers.auth._send_welcome_email", welcome)
        monkeypatch.setattr("app.routers.auth_register_producer._send_welcome_email", welcome)
        monkeypatch.setattr(
            "app.routers.auth._send_verify_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_verify_email", lambda *a, **kw: None
        )
        resp = client.post(
            "/auth/register",
            json={"terms_accepted": True,
                "email": "welcome_c@example.com",
                "name": "צרכנית",
                "password": "Zx7Yp9Mq2Lr4",
            },
        )
        assert resp.status_code == 200
        welcome.assert_called_once_with(
            "welcome_c@example.com", "צרכנית", "consumer", test_cause=False
        )

    def test_register_producer_dispatches_producer_welcome(
        self, client, monkeypatch
    ):
        """auth.py:684-686 — the "producer" variant. A copy-paste that left
        "consumer" here would have sent producers the wrong onboarding mail
        with nothing failing."""
        from unittest.mock import Mock

        welcome = Mock()
        monkeypatch.setattr("app.routers.auth._send_welcome_email", welcome)
        monkeypatch.setattr("app.routers.auth_register_producer._send_welcome_email", welcome)
        monkeypatch.setattr(
            "app.routers.auth._send_verify_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_verify_email", lambda *a, **kw: None
        )
        resp = client.post(
            "/auth/register/producer",
            json=self._producer_reg(email="welcome_p@example.com", name="יצרנית"),
        )
        assert resp.status_code == 200
        welcome.assert_called_once_with(
            "welcome_p@example.com", "יצרנית", "producer", test_cause=False
        )

    def test_register_collision_dispatches_no_welcome(
        self, client, db, monkeypatch
    ):
        """Absence half of gap 9."""
        from unittest.mock import Mock

        make_user(db, email="nowelcome@test.com")
        welcome = Mock()
        monkeypatch.setattr("app.routers.auth._send_welcome_email", welcome)
        monkeypatch.setattr("app.routers.auth_register_producer._send_welcome_email", welcome)
        monkeypatch.setattr(
            "app.routers.auth._send_duplicate_attempt_email", lambda *a, **kw: None
        )
        monkeypatch.setattr(
            "app.routers.auth_register_producer._send_duplicate_attempt_email", lambda *a, **kw: None
        )
        resp = client.post(
            "/auth/register",
            json={"terms_accepted": True,
                "email": "nowelcome@test.com",
                "name": "Attacker",
                "password": "Zx7Yp9Mq2Lr4",
            },
        )
        assert resp.status_code == 200
        welcome.assert_not_called()


class TestRegisterProducerContactMethodPresence:
    """MEH-1624 gap 3 — auth.py:415-433.

    whatsapp/phone (missing phone) was pinned; the website / instagram /
    contact_email arms were not, so any of the three could have stopped
    422-ing and a producer would land with a primary contact channel that
    has no value behind it.
    """

    def _payload(self, **overrides):
        base = valid_producer_register_payload() | {
            "email": "cm@example.com",
            "name": "שרה",
            "producer_name": "חוות הקשר",
        }
        base.pop("phone", None)
        return base | overrides

    def test_website_method_without_website_is_422(self, client):
        resp = client.post(
            "/auth/register/producer",
            json=self._payload(primary_contact_method="website"),
        )
        assert resp.status_code == 422
        assert "אתר" in str(resp.json()["detail"])

    def test_instagram_method_without_instagram_is_422(self, client):
        resp = client.post(
            "/auth/register/producer",
            json=self._payload(primary_contact_method="instagram"),
        )
        assert resp.status_code == 422
        assert "אינסטגרם" in str(resp.json()["detail"])

    def test_email_method_without_contact_email_is_422(self, client):
        resp = client.post(
            "/auth/register/producer",
            json=self._payload(primary_contact_method="email"),
        )
        assert resp.status_code == 422
        assert "מייל ליצירת קשר" in str(resp.json()["detail"])

    def test_website_method_with_website_succeeds(self, client):
        """Control: the guard rejects absence, not the method itself."""
        resp = client.post(
            "/auth/register/producer",
            json=self._payload(
                primary_contact_method="website",
                website="https://example.com",
            ),
        )
        assert resp.status_code == 200, resp.text


class TestRegisterProducerRequiredFieldsNonUpgrade:
    """MEH-1624 gap 5 — auth.py:577-581.

    email/name/password are Optional on ProducerRegister (the MEH-143 upgrade
    path sends none of them), so the anonymous path's requirement lives in the
    handler alone and nothing asserted it.
    """

    def _payload(self, **overrides):
        return valid_producer_register_payload() | {
            "email": "req@example.com",
            "name": "שרה",
            "producer_name": "חוות החובה",
            "phone": "0501234567",
            **overrides,
        }

    @pytest.mark.parametrize("missing", ["email", "name", "password"])
    def test_missing_account_field_is_422(self, client, missing):
        resp = client.post(
            "/auth/register/producer", json=self._payload(**{missing: None})
        )
        assert resp.status_code == 422
        assert "שדות חובה" in str(resp.json()["detail"])


class TestRegisterPerIpRateLimit:
    """MEH-1624 gap 4 — the per-IP halves of the dual-key limiters
    (auth.py:262 register = 10/hour, auth.py:378 producer = 10/hour since
    MEH-1635; it was 3/hour when this class was written).

    The MEH-624 tests pin only the per-EMAIL half. These rotate the email so
    the per-email bucket never saturates, leaving per-IP as the only limiter
    that can trip. TRUSTED_PROXY is deliberately NOT set, so X-Real-IP is
    ignored and every request shares the TestClient's single source IP —
    the same technique as TestForgotPasswordRateLimits in test_auth.py.
    """

    def _stub_side_effects(self, monkeypatch):
        from importlib import import_module

        for target in (
            "_send_verify_email",
            "_send_welcome_email",
            "_send_duplicate_attempt_email",
            "notify_producer_registered",
            "score_producer",
        ):
            # MEH-3293: business registration lives in its own module; a name
            # it shares with auth.py is stubbed in both, a moved one only there.
            owners = [
                m for m in ("auth", "auth_register_producer")
                if hasattr(import_module(f"app.routers.{m}"), target)
            ]
            assert owners, f"{target} is in neither auth router module"
            for module in owners:
                monkeypatch.setattr(
                    f"app.routers.{module}.{target}", lambda *a, **kw: None
                )

    def test_register_per_ip_limit_trips_on_11th(self, client, monkeypatch):
        self._stub_side_effects(monkeypatch)
        statuses = [
            client.post(
                "/auth/register",
                json={"terms_accepted": True,
                    "email": f"perip{i}@example.com",
                    "name": "Tester",
                    "password": "Zx7Yp9Mq2Lr4",
                },
            ).status_code
            for i in range(11)
        ]
        assert statuses[:10] == [200] * 10
        assert statuses[10] == 429

    def test_register_producer_per_ip_limit_trips_on_11th(
        self, client, monkeypatch
    ):
        # MEH-1635: widened 3/hour -> 10/hour (auth.py:378). Keying
        # registration abuse on IP punished shared-IP users (CGNAT), and the
        # allowance was further eaten by the MEH-1627 refresh-retry
        # double-count and by resubmits after a 422. The per-EMAIL cap is
        # unchanged and remains the primary anti-spam key.
        self._stub_side_effects(monkeypatch)
        base = valid_producer_register_payload() | {
            "name": "שרה",
            "phone": "0501234567",
        }
        statuses = [
            client.post(
                "/auth/register/producer",
                json=base
                | {
                    "email": f"peripp{i}@example.com",
                    "producer_name": f"חוות מספר {i}",
                },
            ).status_code
            for i in range(11)
        ]
        assert statuses[:10] == [200] * 10
        assert statuses[10] == 429


class TestLoginTimingEqualization:
    """MEH-626 — /login's three failure branches (wrong-email,
    OAuth-only user, wrong-password) must take indistinguishable
    time so an attacker cannot enumerate users via timing diff.

    Methodology:
        - TRUSTED_PROXY=1 + rotating X-Real-IP per iteration so the
          per-IP 5/min rate limit on /login does not short-circuit
          any iteration (55 requests per branch would otherwise trip it).
        - 5 warmup iterations (discarded) + 50 measured iterations per
          branch. Warmup absorbs first-call passlib/bcrypt module-init
          variance.
        - The three branches are interleaved, one request each per round
          (MEH-3031), so runner noise lands on all of them alike.
        - Median latency per branch (MEH-3031; was p95).
        - Assertion: max(median) - min(median) < 20ms across the 3 branches.

    Flakiness mitigation (MEH-647):
        On slow or contended CI runners, bcrypt timing variance may
        exceed 20ms even with the fix in place. The @pytest.mark.flaky
        decorator from pytest-rerunfailures gives the test 2 reruns
        with a 1s delay before declaring failure. If it still fails
        after 2 reruns: (1) verify on a quieter machine, (2) investigate
        the timing-equalization invariant — do NOT silently raise the
        20ms threshold — that hides regressions.
    """

    # MEH-1911: `serial` keeps this out of the parallel `-n auto` pass.
    # The docstring above says a contended runner invalidates the
    # measurement and that the 20ms threshold must NOT be raised to
    # compensate. Running under xdist makes the runner contended by
    # construction — measured 3/3 failures at `-n auto` on 4 cores, p95
    # spread 526ms (oauth_only=875ms vs wrong_email=349ms), all three
    # `flaky` reruns included. So it runs in its own serial pass instead,
    # which is the "quieter machine" the docstring asks for; the
    # invariant and the threshold are untouched.
    @pytest.mark.serial
    @pytest.mark.flaky(reruns=2, reruns_delay=1)
    def test_login_timing_equivalence_across_failure_modes(
        self, client, db, monkeypatch
    ):
        import statistics
        import time
        import uuid

        # Bypass slowapi's 5/min per-IP cap on /login by rotating
        # X-Real-IP per request. TRUSTED_PROXY=1 makes get_real_client_ip
        # honor the header (rate_limit.py:52-53).
        monkeypatch.setenv("TRUSTED_PROXY", "1")

        # Branch 2 fixture — OAuth-only user (password_hash=None).
        # make_user always sets a hash, so insert directly.
        oauth_only_user = User(
            email="oauth-only-victim@example.com",
            name="OAuth User",
            password_hash=None,
            role="consumer",
            email_verified=True,
        )
        db.add(oauth_only_user)
        db.commit()

        # Branch 3 fixture — user with a valid password; test will
        # submit wrong passwords.
        make_user(
            db,
            email="wrong-pw-victim@example.com",
            password="Zx7Yp9Mq2Lr4",  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
        )

        WARMUP = 5
        N = 50
        from app.rate_limit import limiter

        # MEH-3031: the three branches are measured INTERLEAVED, one
        # request of each per round, not as three back-to-back blocks. In
        # blocks, a slow patch of a shared CI runner (a neighbour job, a
        # GC, a thermal dip) lands on whichever branch runs during it and
        # shows up as a spread between branches — measured on staging:
        # 27.8ms with all three p95s within 205-232ms. Interleaved, that
        # noise is spread over all three branches alike, so the spread
        # measures the code again. The 20ms threshold is unchanged; it
        # still goes red when a branch skips its bcrypt (shown failing on
        # the PR by removing the sentinel verify from the wrong-email
        # branch).
        branches = {
            # Branch 1 — wrong-email. Each iteration uses a unique
            # nonexistent address so no DB-cache effects.
            "wrong_email": (
                1,
                lambda i: f"nx-{uuid.uuid4().hex[:8]}@example.com",
                lambda i: "anyPassword123!",
            ),
            # Branch 2 — OAuth-only (same row each iter, password ignored
            # at the OAuth-only short-circuit).
            "oauth_only": (
                2,
                lambda i: "oauth-only-victim@example.com",
                lambda i: "anyPassword123!",
            ),
            # Branch 3 — wrong-password (same row, fresh wrong password
            # per iter to avoid any caching).
            "wrong_password": (
                3,
                lambda i: "wrong-pw-victim@example.com",
                lambda i: f"wrongPw-{i}-Zz!",
            ),
        }
        times: dict[str, list[float]] = {name: [] for name in branches}
        for i in range(WARMUP + N):
            # Rotate which branch goes first each round, so a within-round
            # order effect (a warm connection, a cache) cannot favour one
            # branch every time.
            order = list(branches.items())
            order = order[i % 3 :] + order[: i % 3]
            for name, (branch_id, email_for, password_for) in order:
                payload = {"email": email_for(i), "password": password_for(i)}
                headers = {
                    "X-Real-IP": (
                        f"10.{branch_id}.{(i >> 8) & 0xFF}.{i & 0xFF}"
                    )
                }
                # MEH-3372: branches 2 and 3 hit ONE address 60 times, and
                # login now stops an address at 10 per 15 minutes. Clear the
                # counters outside the timed region so every iteration
                # measures the 401 path, which is this test's subject.
                limiter._storage.reset()
                start = time.perf_counter()
                resp = client.post("/auth/login", json=payload, headers=headers)
                elapsed = time.perf_counter() - start
                assert resp.status_code == 401, (
                    f"branch {branch_id} iter {i}: "
                    f"expected 401, got {resp.status_code}"
                )
                if i >= WARMUP:
                    times[name].append(elapsed)
        assert {len(t) for t in times.values()} == {N}

        # MEH-3031: compare MEDIANS, not p95s. With N=50 the p95 is the
        # third-slowest sample, so two scheduler stalls on one branch move
        # it by tens of ms. A timing attacker averages many requests, so
        # the median is the statistic the attack actually exploits — and a
        # skipped bcrypt moves every sample, so it moves the median by the
        # full hash cost (~200ms here), ten times the threshold.
        def median(name: str) -> float:
            return statistics.median(times[name])

        median_wrong_email = median("wrong_email")
        median_oauth_only = median("oauth_only")
        median_wrong_password = median("wrong_password")

        medians = {
            "wrong_email": median_wrong_email,
            "oauth_only": median_oauth_only,
            "wrong_password": median_wrong_password,
        }
        spread = max(medians.values()) - min(medians.values())
        assert spread < 0.020, (
            f"median spread {spread * 1000:.1f}ms exceeds 20ms threshold. "
            f"per-branch median (ms): "
            f"wrong_email={median_wrong_email * 1000:.1f}, "
            f"oauth_only={median_oauth_only * 1000:.1f}, "
            f"wrong_password={median_wrong_password * 1000:.1f}"
        )
