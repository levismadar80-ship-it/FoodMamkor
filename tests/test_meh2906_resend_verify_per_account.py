"""MEH-2906 — POST /auth/resend-verify is capped per ACCOUNT, not only per IP.

Before: ``@limiter.limit("3/hour")`` keyed on the client IP only. Someone who
signed up with another person's address could log in to the unverified
account and send that inbox 3 verify mails an hour from every IP they own.

After: the IP limit stays, and a second counter keyed on ``user.id`` allows
3 an hour and 10 a day per account, whatever the IP. Two different accounts
behind one IP do not share the per-account counter.
"""
import pytest

from app.services import resend_verify_cap
from conftest import auth_header, make_user

URL = "/auth/resend-verify"


@pytest.fixture
def sent(monkeypatch):
    calls: list[str] = []

    def _record(email, name, token, test_cause=False):
        calls.append(email)
        return True

    monkeypatch.setattr("app.routers.auth._send_verify_email", _record)
    return calls


@pytest.fixture
def trusted_proxy(monkeypatch):
    # X-Real-IP is honoured only behind the trusted proxy (rate_limit.py).
    monkeypatch.setenv("TRUSTED_PROXY", "1")


def _post_from(client, user, ip):
    return client.post(URL, headers={**auth_header(user), "X-Real-IP": ip})


def test_same_account_from_four_ips_is_429_on_the_fourth(client, db, sent, trusted_proxy):
    user = make_user(db, email="rotate2906@example.com", email_verified=False)

    statuses = [
        _post_from(client, user, f"203.0.113.{n}").status_code for n in range(1, 5)
    ]

    assert statuses == [200, 200, 200, 429]
    assert sent == ["rotate2906@example.com"] * 3, "the capped call must not send mail"


def test_the_429_answer_is_hebrew(client, db, sent, trusted_proxy):
    user = make_user(db, email="hebrew2906@example.com", email_verified=False)
    for n in range(1, 4):
        _post_from(client, user, f"198.51.100.{n}")

    resp = _post_from(client, user, "198.51.100.9")

    assert resp.status_code == 429
    assert resp.json()["detail"] == resend_verify_cap.TOO_MANY_DETAIL


def test_two_accounts_behind_one_ip_do_not_block_each_other(client, db, sent, trusted_proxy):
    first = make_user(db, email="first2906@example.com", email_verified=False)
    second = make_user(db, email="second2906@example.com", email_verified=False)

    assert _post_from(client, first, "192.0.2.10").status_code == 200
    assert _post_from(client, first, "192.0.2.11").status_code == 200
    assert _post_from(client, second, "192.0.2.12").status_code == 200
    assert _post_from(client, second, "192.0.2.13").status_code == 200


def test_daily_cap_holds_when_the_hour_window_is_free(client, db, sent, trusted_proxy, monkeypatch):
    # Only the daily counter is left in force: the hourly one is lifted, so
    # this measures the 10/day bucket on its own.
    monkeypatch.setattr(resend_verify_cap, "PER_ACCOUNT_LIMITS", ("10/day",))
    user = make_user(db, email="daily2906@example.com", email_verified=False)

    statuses = [
        _post_from(client, user, f"10.0.{n}.1").status_code for n in range(11)
    ]

    assert statuses == [200] * 10 + [429]
    assert len(sent) == 10


def test_already_verified_account_does_not_spend_the_counter(client, db, sent, trusted_proxy):
    user = make_user(db, email="verified2906@example.com", email_verified=True)

    statuses = [
        _post_from(client, user, f"172.16.0.{n}").status_code for n in range(1, 6)
    ]

    assert statuses == [200] * 5
    assert sent == []
