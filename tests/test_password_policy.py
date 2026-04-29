"""MEH-305 — Tests for password_policy service.

Async functions are driven via asyncio.run() to avoid adding pytest-asyncio
as a dep just for this PR (existing tests are all sync; pyproject.toml lists
only pytest + pytest-timeout).
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services import password_policy
from app.services.password_policy import PolicyResult, validate_password

# Sentinel known to be in deny_list_10k.txt (verified at PR time).
DENY_LIST_SENTINEL = "unbelievable"
# 12-char string deliberately shaped to avoid common patterns and not in the
# 10k deny list. Re-verify if the deny list is ever refreshed.
SAFE_PASSWORD = "Zx7Yp9Mq2Lr4"


def _run(coro):
    return asyncio.run(coro)


def _mock_hibp_response(text: str, status_code: int = 200) -> MagicMock:
    """Build an async-context-manager mock for httpx.AsyncClient.

    Mirrors the `async with httpx.AsyncClient(...) as client: client.get(...)`
    shape used inside _check_hibp.
    """
    response = MagicMock()
    response.status_code = status_code
    response.text = text
    client = MagicMock()
    client.get = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=None)
    return cm


class TestPasswordPolicyService:
    def test_too_short_returns_failure(self):
        # 11 chars — under MIN_LENGTH=12.
        with patch.object(password_policy, "_check_hibp", new=AsyncMock(return_value=False)):
            result = _run(validate_password("a" * 11))
        assert isinstance(result, PolicyResult)
        assert result.ok is False
        assert "too_short" in result.failures

    def test_minimum_length_passes(self):
        # Exactly 12 chars, not in deny list, HIBP mocked clean.
        with patch.object(password_policy, "_check_hibp", new=AsyncMock(return_value=False)):
            result = _run(validate_password(SAFE_PASSWORD))
        assert result.ok is True
        assert result.failures == []

    def test_deny_list_blocks_common(self):
        # Sentinel is in the local deny-list; HIBP must NOT be called
        # (deny-list short-circuits) — patching it would mask a real bug
        # if that contract changes.
        with patch.object(password_policy, "_check_hibp", new=AsyncMock(return_value=False)) as m:
            result = _run(validate_password(DENY_LIST_SENTINEL))
        assert "too_common" in result.failures
        assert result.ok is False
        m.assert_not_called()

    def test_hibp_blocks_known_breach(self):
        # Candidate not in deny-list; HIBP returns a row whose suffix matches
        # the SHA-1 of SAFE_PASSWORD with count > 0.
        import hashlib

        sha1 = hashlib.sha1(SAFE_PASSWORD.encode()).hexdigest().upper()
        suffix = sha1[5:]
        body = f"{suffix}:42\nDEADBEEFDEADBEEF:1\n"
        with patch.object(
            password_policy.httpx,
            "AsyncClient",
            return_value=_mock_hibp_response(body, status_code=200),
        ):
            result = _run(validate_password(SAFE_PASSWORD))
        assert "too_common" in result.failures
        assert result.ok is False

    def test_hibp_timeout_fails_open(self):
        client = MagicMock()
        client.get = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
        cm = MagicMock()
        cm.__aenter__ = AsyncMock(return_value=client)
        cm.__aexit__ = AsyncMock(return_value=None)
        with patch.object(password_policy.httpx, "AsyncClient", return_value=cm):
            result = _run(validate_password(SAFE_PASSWORD))
        # Fail-open — timeout produces no failure.
        assert result.ok is True
        assert "too_common" not in result.failures

    def test_hibp_5xx_fails_open(self):
        with patch.object(
            password_policy.httpx,
            "AsyncClient",
            return_value=_mock_hibp_response("", status_code=503),
        ):
            result = _run(validate_password(SAFE_PASSWORD))
        assert result.ok is True
        assert "too_common" not in result.failures

    def test_reuse_block_when_same(self):
        from passlib.context import CryptContext

        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        current_hash = ctx.hash(SAFE_PASSWORD)
        with patch.object(password_policy, "_check_hibp", new=AsyncMock(return_value=False)):
            result = _run(validate_password(SAFE_PASSWORD, current_hash=current_hash))
        assert "same_as_current" in result.failures
        assert result.ok is False

    def test_reuse_allowed_when_different(self):
        from passlib.context import CryptContext

        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        current_hash = ctx.hash("AnotherPwd99X")  # different from SAFE_PASSWORD
        with patch.object(password_policy, "_check_hibp", new=AsyncMock(return_value=False)):
            result = _run(validate_password(SAFE_PASSWORD, current_hash=current_hash))
        assert "same_as_current" not in result.failures
        assert result.ok is True

    def test_concurrent_failures(self):
        # Short (<12) AND in deny list AND same as current_hash → 3 failures.
        from passlib.context import CryptContext

        # Use a deny-listed entry that is also <12 chars to stack short+common.
        short_common = "password"  # 8 chars, in deny list
        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        current_hash = ctx.hash(short_common)
        with patch.object(password_policy, "_check_hibp", new=AsyncMock(return_value=False)):
            result = _run(
                validate_password(short_common, current_hash=current_hash)
            )
        assert "too_short" in result.failures
        assert "too_common" in result.failures
        assert "same_as_current" in result.failures
        assert result.ok is False


# ============================================================================
# MEH-305 — JWT iat issuance + password_changed_at validation tests.
#
# These exercise auth.py (access-token decode) and routers/auth.py (refresh
# rotation) at the unit level — no DB, no TestClient. Mock User + Session.
# ============================================================================


class _FakeUser:
    """Minimal stand-in for app.models.User for get_current_user / refresh."""

    def __init__(self, *, id, password_changed_at=None, token_version=1):
        from uuid import UUID

        self.id = id if isinstance(id, UUID) else UUID(str(id))
        self.password_changed_at = password_changed_at
        self.token_version = token_version
        self.is_blocked = False
        self.last_active_at = None


class _FakeQuery:
    def __init__(self, user):
        self._user = user

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._user


class _FakeSession:
    def __init__(self, user):
        self._user = user

    def query(self, _model):
        return _FakeQuery(self._user)

    # _maybe_bump_last_active calls db.add / commit; no-op for the test.
    def add(self, _obj):
        pass

    def commit(self):
        pass


def _decode(token):
    """Minimal joserfc decode mirroring auth._jwt_key()."""
    from joserfc import jwt as _jwt
    from joserfc.jwk import OctKey

    from app.config import settings

    return _jwt.decode(token, OctKey.import_key(settings.secret_key.encode()),
                       algorithms=[settings.algorithm]).claims


def _make_request(fingerprint_cookie=None):
    """Stand-in for fastapi.Request — only `.cookies.get()` is touched
    by get_current_user when the userFingerprint claim is absent.
    """
    cookies = {} if fingerprint_cookie is None else {"__Secure-Fgp": fingerprint_cookie}
    request = MagicMock()
    request.cookies = cookies
    return request


class TestJWTIatClaim:
    def test_access_token_includes_iat(self):
        from uuid import uuid4

        from app.auth import create_access_token

        before = int(__import__("time").time())
        token = create_access_token(uuid4(), token_version=1)
        claims = _decode(token)
        after = int(__import__("time").time())

        assert "iat" in claims
        assert isinstance(claims["iat"], int)
        # iat must be within [before, after] — proves issuance time is real.
        assert before <= claims["iat"] <= after

    def test_refresh_token_includes_iat(self):
        from uuid import uuid4

        from app.auth import create_refresh_token

        before = int(__import__("time").time())
        token = create_refresh_token(uuid4(), token_version=1)
        claims = _decode(token)
        after = int(__import__("time").time())

        assert "iat" in claims
        assert isinstance(claims["iat"], int)
        assert before <= claims["iat"] <= after


class TestJWTPasswordChangedAtCheck:
    def _build_access_token_with_iat(self, user_id, iat_override):
        """Manually encode an access token with a chosen iat. Bypasses
        create_access_token to exercise the validation side independently
        of issuance.
        """
        from datetime import datetime, timedelta
        from joserfc import jwt as _jwt
        from joserfc.jwk import OctKey

        from app.config import settings

        payload = {
            "sub": str(user_id),
            "exp": datetime.utcnow() + timedelta(minutes=30),
            "iat": iat_override,
            "tv": 1,
            "scope": "access",
        }
        return _jwt.encode(
            {"alg": settings.algorithm},
            payload,
            OctKey.import_key(settings.secret_key.encode()),
        )

    def _build_refresh_token_with_iat(self, user_id, iat_override):
        from datetime import datetime, timedelta
        from joserfc import jwt as _jwt
        from joserfc.jwk import OctKey

        from app.config import settings

        payload = {
            "sub": str(user_id),
            "exp": datetime.utcnow() + timedelta(days=14),
            "iat": iat_override,
            "tv": 1,
            "scope": "refresh",
        }
        return _jwt.encode(
            {"alg": settings.algorithm},
            payload,
            OctKey.import_key(settings.secret_key.encode()),
        )

    def test_token_iat_before_password_change_rejected(self):
        from datetime import datetime, timezone
        from uuid import uuid4

        from fastapi import HTTPException

        from app.auth import get_current_user

        user_id = uuid4()
        # Password changed at "now"; token iat is 1 hour earlier.
        pwd_changed = datetime.now(timezone.utc)
        iat = int(pwd_changed.timestamp()) - 3600
        user = _FakeUser(id=user_id, password_changed_at=pwd_changed)
        token = self._build_access_token_with_iat(user_id, iat)
        db = _FakeSession(user)

        with pytest.raises(HTTPException) as excinfo:
            get_current_user(request=_make_request(), token=token, db=db)
        assert excinfo.value.status_code == 401
        assert excinfo.value.detail == "session_invalidated_by_password_change"

    def test_token_iat_after_password_change_accepted(self):
        from datetime import datetime, timezone
        from uuid import uuid4

        from app.auth import get_current_user

        user_id = uuid4()
        # Realistic scenario: user changed password 2h ago, the current
        # token was issued 1h ago (i.e. AFTER the change). joserfc rejects
        # tokens whose iat is in the future, so iat must be <= now.
        import time

        now_ts = int(time.time())
        pwd_changed = datetime.fromtimestamp(now_ts - 7200, tz=timezone.utc)
        iat = now_ts - 3600  # 1h ago, 1h AFTER pwd_changed
        user = _FakeUser(id=user_id, password_changed_at=pwd_changed)
        token = self._build_access_token_with_iat(user_id, iat)
        db = _FakeSession(user)

        result = get_current_user(request=_make_request(), token=token, db=db)
        assert result is user

    def test_password_changed_at_null_skips_check(self):
        from uuid import uuid4

        from app.auth import get_current_user

        user_id = uuid4()
        # Pre-MEH-305 user — never rotated password.
        user = _FakeUser(id=user_id, password_changed_at=None)
        # iat from the past — would reject if check ran, but should be skipped.
        iat = int(__import__("time").time()) - 86400
        token = self._build_access_token_with_iat(user_id, iat)
        db = _FakeSession(user)

        result = get_current_user(request=_make_request(), token=token, db=db)
        assert result is user

    def test_token_without_iat_skips_check(self):
        """Legacy compat: tokens issued before MEH-305 deploy have no iat."""
        from datetime import datetime, timedelta, timezone
        from uuid import uuid4

        from joserfc import jwt as _jwt
        from joserfc.jwk import OctKey

        from app.auth import get_current_user
        from app.config import settings

        user_id = uuid4()
        pwd_changed = datetime.now(timezone.utc)  # would normally trigger reject
        user = _FakeUser(id=user_id, password_changed_at=pwd_changed)
        # Token deliberately missing iat claim.
        payload = {
            "sub": str(user_id),
            "exp": datetime.utcnow() + timedelta(minutes=30),
            "tv": 1,
            "scope": "access",
        }
        token = _jwt.encode(
            {"alg": settings.algorithm},
            payload,
            OctKey.import_key(settings.secret_key.encode()),
        )
        db = _FakeSession(user)

        result = get_current_user(request=_make_request(), token=token, db=db)
        assert result is user

    def test_iat_int_vs_changed_at_float_no_race(self):
        """Regression: bug_001 — production datetime.now(tz) has microseconds.

        iat (int) compared to password_changed_at.timestamp() (float) must
        use int() coercion to avoid a 1-second false-rejection window
        right after a password change. Without int() at validation:
            iat (int N) < pwd_changed.timestamp() (float N.123456) → True
        causes the first post-change request from a token issued in the
        same second to receive an unconditional 401.

        Test scenario is deterministic: pwd_changed is a real datetime
        with microseconds; iat is set to the int floor of its timestamp.
        Pre-fix: 401. Post-fix: accepted.
        """
        from datetime import datetime, timezone
        from uuid import uuid4

        from app.auth import get_current_user

        user_id = uuid4()
        # Real datetime.now(tz) — explicitly NOT constructed from int seconds.
        pwd_changed = datetime.now(timezone.utc)
        # Note: pwd_changed.microsecond is non-zero in production
        # (datetime.now() returns microsecond-precise values). The
        # int() coercion in auth.py:171 normalizes both sides to whole
        # seconds, so iat == int(pwd_ts) — token must be accepted.
        user = _FakeUser(id=user_id, password_changed_at=pwd_changed)
        # iat = int floor of pwd_changed.timestamp() — same int second,
        # but float .timestamp() has non-zero microseconds.
        iat = int(pwd_changed.timestamp())
        token = self._build_access_token_with_iat(user_id, iat)
        db = _FakeSession(user)

        result = get_current_user(request=_make_request(), token=token, db=db)
        assert result is user, (
            "Token issued at the same int-second as password_changed_at must "
            "not be rejected — int(timestamp()) coercion required at validation."
        )

    def test_refresh_token_iat_before_password_change_rejected(self):
        """Amendment 2(d) — refresh-side parallel enforcement.

        The refresh_token endpoint is wrapped by @limiter.limit (slowapi),
        which requires a real starlette.requests.Request. Bypass via
        __wrapped__ to test the inner handler logic in isolation.
        """
        from datetime import datetime, timezone
        from uuid import uuid4

        from fastapi import HTTPException

        from app.routers.auth import refresh_token as refresh_endpoint

        # slowapi's decorator preserves the original function via __wrapped__
        # (functools.wraps) — invoke that to skip rate-limit IP extraction.
        inner_handler = getattr(refresh_endpoint, "__wrapped__", None)
        assert inner_handler is not None, (
            "slowapi decorator did not expose __wrapped__; "
            "this test bypasses rate limiting via __wrapped__. "
            "If slowapi changes, refactor to a TestClient-based test."
        )

        user_id = uuid4()
        pwd_changed = datetime.now(timezone.utc)
        iat = int(pwd_changed.timestamp()) - 3600
        user = _FakeUser(id=user_id, password_changed_at=pwd_changed)
        token = self._build_refresh_token_with_iat(user_id, iat)
        db = _FakeSession(user)

        request = MagicMock()
        request.cookies = {"refresh_token": token}
        response = MagicMock()

        with pytest.raises(HTTPException) as excinfo:
            inner_handler(request=request, response=response, db=db)
        assert excinfo.value.status_code == 401
        assert excinfo.value.detail == "session_invalidated_by_password_change"
