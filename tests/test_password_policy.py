"""MEH-305 — Tests for password_policy service.

Async functions are driven via asyncio.run() to avoid adding pytest-asyncio
as a dep just for this PR (existing tests are all sync; pyproject.toml lists
only pytest + pytest-timeout).
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

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
