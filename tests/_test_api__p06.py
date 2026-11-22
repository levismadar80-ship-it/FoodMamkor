"""Part 6 of 7 of `tests/test_api.py`: TestRefreshTokenFlow, TestFingerprintCookie, TestSanitizationIntegration, TestAppleTokenVerification, TestHomeProductsKillSwitch, TestBOLA, TestPublicStats.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_api.py` imports these tests, so
their node ids stay `tests/test_api.py::...`. Run them with
`pytest tests/test_api.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import ContactMessage
from app.models.models import Producer
from app.models.models import User
from app.utils.clock import utc_now
from conftest import auth_header
from conftest import make_producer
from conftest import make_user
from conftest import valid_producer_register_payload
import pytest

# ---------- MEH-326: JWT Refresh Token flow ----------

class TestRefreshTokenFlow:
    """Regression tests for the HttpOnly refresh-token cookie flow.

    _reset_rate_limiter and _clean_tables are autouse — each test
    gets a fresh DB and a clean slowapi counter.
    """

    def _login(self, client, email, password="Zx7Yp9Mq2Lr4"):  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        make_user(db, email="t1@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        from joserfc import jwt as jose_jwt
        from joserfc.jwk import OctKey
        from joserfc.jwt import JWTClaimsRegistry
        from app.config import settings

        make_user(db, email="t2@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        make_user(db, email="t5@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        make_user(db, email="t6@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        from datetime import timedelta
        from joserfc import jwt as jose_jwt
        from joserfc.jwk import OctKey
        from app.config import settings

        user = make_user(db, email="t8@test.com")
        # Craft token with only sub/exp/tv — no scope claim (pre-MEH-326 shape)
        expire = utc_now() + timedelta(hours=24)
        payload = {"sub": str(user.id), "exp": expire, "tv": user.token_version}
        key = OctKey.import_key(settings.secret_key.encode())
        old_token = jose_jwt.encode({"alg": settings.algorithm}, payload, key)

        res = client.get("/auth/me", headers={"Authorization": f"Bearer {old_token}"})
        assert res.status_code == 200
        assert res.json()["email"] == "t8@test.com"

    def test_logout_clears_refresh_cookie(self, client, db):
        make_user(db, email="t9@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        make_user(db, email="t10@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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

    def _login(self, client, email, password="Zx7Yp9Mq2Lr4"):  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        make_user(db, email="fp1@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
            json={"terms_accepted": True, "email": "fp2@test.com", "name": "FP Test", "password": "Zx7Yp9Mq2Lr4"},
        )
        assert res.status_code == 200
        assert self._fp_cookie_header(res) is None

    def test_authenticated_request_valid_fingerprint_passes(self, client, db):
        make_user(db, email="fp3@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        make_user(db, email="fp4@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        from datetime import timedelta
        from joserfc import jwt as jose_jwt
        from joserfc.jwk import OctKey
        from app.config import settings

        user = make_user(db, email="fp5@test.com")
        expire = utc_now() + timedelta(minutes=15)
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
        make_user(db, email="fp6@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        make_user(db, email="fp7@test.com", password="Zx7Yp9Mq2Lr4")  # guard-ok: test-fixture password, moved verbatim from tests/test_api.py (MEH-3540)
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
        payload = valid_producer_register_payload() | {
            "email": "xss-producer@test.com",
            "name": "ניסוי",
            "producer_name": "חוות הסקריפט",
            "description": "<script>alert(1)</script>טקסט נקי",
            "phone": "0501234567",
        }
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code == 200, resp.text
        row = db.query(Producer).filter(Producer.name == "חוות הסקריפט").first()
        assert row is not None
        assert "<script>" not in (row.description or "")
        assert "</script>" not in (row.description or "")
        assert "טקסט נקי" in (row.description or "")

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

class TestHomeProductsKillSwitch:
    """MEH-1406: the home-products feature is unmounted (router not included,
    admin endpoints removed). These POSITIVE assertions prove the public +
    admin surfaces 404 — they encode the ticket's core acceptance criterion
    ("all /home-products* endpoints return 404") as a runnable guard, and will
    fail loudly if the router is ever re-mounted WITHOUT also un-skipping the
    BOLA / sanitization tests below (silent-guard-loss guard).
    """

    def test_public_home_products_list_is_404(self, client):
        assert client.get("/home-products").status_code == 404

    def test_public_home_product_create_is_404(self, client, db):
        # A verified-email user previously could POST here (the write hole
        # MEH-1406 closed). The route no longer exists → 404 regardless of auth.
        user = make_user(db, email="killswitch@example.com")
        resp = client.post(
            "/home-products",
            json={"title": "עוגה", "description": "טעימה", "price": "25"},
            headers=auth_header(user),
        )
        assert resp.status_code == 404

    def test_admin_home_products_flagged_is_404(self, client, db):
        admin = make_user(db, email="ks-admin@example.com", role="admin")
        resp = client.get("/admin/home-products/flagged", headers=auth_header(admin))
        assert resp.status_code == 404

    def test_admin_home_products_hidden_is_404(self, client, db):
        admin = make_user(db, email="ks-admin2@example.com", role="admin")
        resp = client.get("/admin/home-products/hidden", headers=auth_header(admin))
        assert resp.status_code == 404


class TestBOLA:
    """Regression suite for MEH-386 — Broken Object Level Authorization.

    Two confirmed findings:
      1. GET /home-products/{id} exposed hidden/deactivated listings to public
         (feature removed, MEH-796 — its tests went with it).
      2. POST /category-requests accepted spoofed producer_id from anonymous callers.
    """

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
