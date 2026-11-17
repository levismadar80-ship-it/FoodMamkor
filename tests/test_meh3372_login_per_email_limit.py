"""MEH-3372 — POST /auth/login carries a soft per-email ceiling next to the
per-IP one (rulings 17/11 §א5, option ב): 10 attempts per 15 minutes on one
address, from any number of IPs. No lockout and no state on the account — a
429 that clears by itself.

The per-IP limit is 5/minute, so every request here comes from its own IP
(X-Real-IP behind TRUSTED_PROXY); otherwise the sixth request would be
stopped by the IP bucket and the test would pass for the wrong reason.
"""

import pytest

from tests.conftest import make_user

SAFE_PASSWORD = "Correct-Horse-Battery-9"


@pytest.fixture
def rotating_ip(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    monkeypatch.delenv("EDGE_PROXY_SECRET", raising=False)
    counter = iter(range(1, 250))

    def headers():
        return {"X-Real-IP": f"203.0.113.{next(counter)}"}

    return headers


def _login(client, headers, email, password="wrong-password-123"):
    return client.post(
        "/auth/login",
        json={"email": email, "password": password},
        headers=headers(),
    ).status_code


def test_control_rotating_ips_do_not_trip_the_per_ip_bucket(client, db, rotating_ip):
    """Control: 12 logins, 12 addresses, 12 IPs → none is rate-limited. If this
    fails, the IP rotation is not working and the tests below prove nothing."""
    statuses = [_login(client, rotating_ip, f"nobody{i}@test.com") for i in range(12)]
    assert statuses == [401] * 12


def test_eleventh_attempt_on_one_email_is_429_from_rotating_ips(
    client, db, rotating_ip
):
    make_user(db, email="victim@test.com", password=SAFE_PASSWORD)
    statuses = [_login(client, rotating_ip, "victim@test.com") for _ in range(11)]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


def test_email_case_variants_share_one_bucket(client, db, rotating_ip):
    make_user(db, email="victim@test.com", password=SAFE_PASSWORD)
    variants = ["victim@test.com", "VICTIM@test.com", "Victim@Test.com"]
    statuses = [_login(client, rotating_ip, variants[i % 3]) for i in range(11)]
    assert statuses[10] == 429


def test_display_name_spellings_do_not_open_new_buckets(client, db, rotating_ip):
    """LoginRequest.email is EmailStr, which accepts "A <v@x.com>" and resolves
    it to v@x.com. Keyed on the raw string, each display name was a fresh
    bucket: 23 logins on one account in a row went through (reviewer probe).
    The key follows the parsed address since MEH-3373."""
    make_user(db, email="victim@test.com", password=SAFE_PASSWORD)
    statuses = [
        _login(client, rotating_ip, f"N{i} <victim@test.com>") for i in range(11)
    ]
    assert 422 not in statuses, "control: the schema accepts the display-name form"
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


def test_another_email_is_not_affected(client, db, rotating_ip):
    make_user(db, email="victim@test.com", password=SAFE_PASSWORD)
    make_user(db, email="other@test.com", password=SAFE_PASSWORD)
    for _ in range(11):
        _login(client, rotating_ip, "victim@test.com")
    assert _login(client, rotating_ip, "victim@test.com") == 429
    assert _login(client, rotating_ip, "other@test.com", SAFE_PASSWORD) == 200


def test_no_lockout_state_on_the_account(client, db, rotating_ip):
    """The ceiling lives in the limiter only: once the window is gone (storage
    reset stands in for 15 minutes passing) the right password logs in."""
    from app.rate_limit import limiter

    make_user(db, email="victim@test.com", password=SAFE_PASSWORD)
    for _ in range(11):
        _login(client, rotating_ip, "victim@test.com")
    assert _login(client, rotating_ip, "victim@test.com", SAFE_PASSWORD) == 429
    limiter._storage.reset()
    assert _login(client, rotating_ip, "victim@test.com", SAFE_PASSWORD) == 200
