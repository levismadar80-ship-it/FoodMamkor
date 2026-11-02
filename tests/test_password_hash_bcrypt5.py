"""MEH-2220 — password hashing survives the passlib → bcrypt-direct move.

The two FIXTURE hashes below were generated on 2026-11-02 with the stack
production ran until this change: passlib 1.7.4 + bcrypt 4.3.0, via
``app.auth.hash_password`` (rounds=12). They are the "existing user rows":
whatever the hashing module becomes, they must keep verifying.

The long fixture is 90 UTF-8 bytes. passlib + bcrypt 4 silently hashed only
its first 72 bytes; bcrypt 5 raises ValueError for >72 bytes instead. The
ruling on the card (option א) keeps the silent truncation, so the 72-byte
twin of a long password verifies too — that is today's behaviour, preserved.
"""

import pytest

from app.auth import hash_password, verify_password
from app.services.password_policy import _check_reuse_sync

EXAMPLE_SHORT_PASSWORD = "Zx7Yp9Mq2Lr4"
# 39 Hebrew letters (2 bytes each) + 12 ASCII = 90 UTF-8 bytes.
EXAMPLE_LONG_HEBREW_PASSWORD = "סיסמהארוכהמאודשלמשתמשותיקבמהמקורעםמילים" + "Zx7Yp9Mq2Lr4"

# Generated with passlib 1.7.4 + bcrypt 4.3.0 (pre-MEH-2220 stack).
FIXTURE_HASH_SHORT = "$2b$12$nm99jwJ6ZB5u8.gO.zyrCeQADONLXF2AA2qrZCRbjwJVTj2YqKLvm"
FIXTURE_HASH_LONG_HEBREW = (
    "$2b$12$q3g6xq9yuSEnSNGlq5LrzeydJnhFBXhFi4/uP9Td.x9Okas19cmf2"
)


def _first_72_bytes_twin(password: str) -> str:
    """Same first 72 UTF-8 bytes as ``password``, different tail."""
    head = password.encode("utf-8")[:72].decode("utf-8")
    assert len(head.encode("utf-8")) == 72  # cut lands on a char boundary
    return head + "-different-tail"


def test_long_fixture_is_really_over_72_bytes():
    assert len(EXAMPLE_LONG_HEBREW_PASSWORD.encode("utf-8")) == 90


class TestLegacyFixtureHashesStillVerify:
    def test_short_password_fixture_verifies(self):
        assert verify_password(EXAMPLE_SHORT_PASSWORD, FIXTURE_HASH_SHORT) is True

    def test_long_hebrew_password_fixture_verifies(self):
        assert verify_password(EXAMPLE_LONG_HEBREW_PASSWORD, FIXTURE_HASH_LONG_HEBREW) is True

    def test_long_hebrew_fixture_verifies_for_72_byte_twin(self):
        twin = _first_72_bytes_twin(EXAMPLE_LONG_HEBREW_PASSWORD)
        assert verify_password(twin, FIXTURE_HASH_LONG_HEBREW) is True

    def test_wrong_password_fails_against_fixtures(self):
        assert verify_password("Zx7Yp9Mq2Lr5", FIXTURE_HASH_SHORT) is False
        assert verify_password(EXAMPLE_SHORT_PASSWORD, FIXTURE_HASH_LONG_HEBREW) is False

    def test_reuse_check_verifies_long_fixture(self):
        # password_policy has its own verify path (MEH-2220 found two).
        assert _check_reuse_sync(EXAMPLE_LONG_HEBREW_PASSWORD, FIXTURE_HASH_LONG_HEBREW)


class TestNewHashes:
    def test_rounds_stay_12(self):
        # MEH-648: cost factor pinned at 12.
        assert hash_password(EXAMPLE_SHORT_PASSWORD).startswith("$2b$12$")

    def test_long_hebrew_password_hashes_and_verifies(self):
        hashed = hash_password(EXAMPLE_LONG_HEBREW_PASSWORD)
        assert verify_password(EXAMPLE_LONG_HEBREW_PASSWORD, hashed) is True

    def test_72_byte_twin_verifies_new_long_hash(self):
        hashed = hash_password(EXAMPLE_LONG_HEBREW_PASSWORD)
        twin = _first_72_bytes_twin(EXAMPLE_LONG_HEBREW_PASSWORD)
        assert verify_password(twin, hashed) is True

    def test_wrong_password_fails(self):
        hashed = hash_password(EXAMPLE_LONG_HEBREW_PASSWORD)
        assert verify_password("סיסמה-אחרת-לגמרי-123", hashed) is False

    def test_garbage_hash_raises_value_error(self):
        # passlib raised UnknownHashError (a ValueError); keep the class.
        with pytest.raises(ValueError):
            verify_password(EXAMPLE_SHORT_PASSWORD, "not-a-hash")
