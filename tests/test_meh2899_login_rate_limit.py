"""
MEH-2905 (MEH-2899 area 4) — the 5-per-minute brute-force limit on login.

Row 5 of the action map's top-20 riskiest gaps, score 13: «429 על login:
אין טסט». `POST /auth/login` carries `@limiter.limit("5/minute")`
(`backend/app/routers/auth.py:1198`, "SECURITY FIX #2: brute-force
protection") and the limiter is keyed per real client IP
(`rate_limit.py:209`, `Limiter(key_func=get_real_client_ip)`).

Measured before writing this: `/auth/login` appears 11 times across
`tests/*.py` and never inside a loop, so no test had ever driven the route
past its budget. `tests/test_rate_limit.py` unit-tests `resolve_client_ip`
in isolation and never calls a route; `test_meh1979_public_rate_limits.py`
covers the public GET surface, not auth.

THE THREE PROPERTIES, and why each needs its own test:

  1. the boundary — 5 pass, the 6th is refused. "A 429 happened" is not
     the claim; the exact edge is, because that is what a decorator
     edited to 50/minute would break.
  2. failed attempts count. This is the whole point of the limit: if only
     successful logins burned budget, an attacker's wrong guesses would
     be unbounded and the decorator would be decoration. Asserted by
     spending the budget on WRONG passwords and then presenting the
     RIGHT one — a correct credential must still be refused.
  3. the bucket is per IP, not global. A global bucket would let one
     attacker lock every other visitor out of logging in — a
     denial-of-service with five requests.

HOW TWO IPs ARE SIMULATED. With `TRUSTED_PROXY` unset the headers are
client-controlled and deliberately ignored (`rate_limit.py:130`), so every
TestClient request keys on the same TCP peer and two IPs are not
expressible. The tests therefore set `TRUSTED_PROXY=1` — which is how
staging and production run — and vary `X-Real-IP`, the header Railway's
edge overwrites on ingress. `_trusted_proxy_enabled()` reads the
environment on every call (`rate_limit.py:87`), so `monkeypatch.setenv` is
enough and nothing needs reimporting.

THE CONTROL FOR TEST 3. "IP B was not refused" has a second possible
cause: the limiter never engaged for B at all. So the same scenario runs
twice — once with the trusted proxy ON (separate buckets) and once with it
OFF (one shared bucket, B refused). The pair is the evidence; either half
alone is a green with two explanations. It turned out to earn its keep
twice over: break L4 below is a real spoofing regression, and the control
is the ONLY test in this file that reds on it.

SHOWN FAILING (MEH-1619). Five breaks, each reverted after measuring. The
bodies are here so the matrix can be re-derived from this file rather than
taken on trust:

  L1  auth.py:1198   @limiter.limit("5/minute") -> "50/minute"
  L2  auth.py:1198   @limiter.limit("5/minute") -> "3/minute"
  L3  rate_limit.py:209
          Limiter(key_func=get_real_client_ip)
       -> Limiter(key_func=lambda request: "global")      # one bucket for all
  L4  rate_limit.py:130
          if _trusted_proxy_enabled():
       -> if True:                                        # trust X-Real-IP always
  L5  auth.py:1198   decorator deleted; the budget re-implemented INSIDE the
      handler so that it is consulted only when the credential is wrong —
      i.e. "a correct password is always let through".

                                      L1   L2   L3   L4   L5
  test_sixth_login...refused          RED  RED   ·    ·    ·
  test_the_limit_counts_failed...     RED  RED   ·    ·   RED
  test_each_ip_has_its_own_budget     RED   ·   RED   ·    ·
  test_control_without_the_trusted... RED   ·    ·   RED  RED

Read down the columns: L3 is caught by the per-IP test alone, L4 by the
control alone, and L5 reds the misses test while leaving the boundary test
GREEN — which is what makes the misses test more than a restatement of the
boundary. A limiter that counted only failures and waved valid credentials
through would look correct to every other test here.
"""

from __future__ import annotations

import uuid

import pytest

from conftest import make_user

_IP_A = "203.0.113.10"  # RFC 5737 documentation range
_IP_B = "203.0.113.11"
_RIGHT = "Zx7Yp9Mq2Lr4"  # conftest's make_user default
_WRONG = "Wr0ngPassw0rd!"
_BUDGET = 5  # @limiter.limit("5/minute") on POST /auth/login


@pytest.fixture
def trusted_proxy(monkeypatch):
    """Run the limiter the way staging and production run it."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")


def _login(client, email: str, password: str, ip: str) -> int:
    return client.post(
        "/auth/login",
        json={"email": email, "password": password},
        headers={"X-Real-IP": ip},
    ).status_code


def _owner(db):
    user = make_user(db, email=f"{uuid.uuid4().hex[:8]}@example.com")
    db.commit()
    return user


def test_sixth_login_from_one_ip_is_refused(client, db, trusted_proxy):
    """The exact boundary: 5 attempts pass the limiter, the 6th does not."""
    user = _owner(db)

    codes = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET + 1)]

    assert codes[:_BUDGET] == [401] * _BUDGET, (
        f"a request inside the budget was refused by the limiter: {codes}"
    )
    assert codes[_BUDGET] == 429, f"the 6th attempt was not refused: {codes}"


def test_the_limit_counts_failed_attempts_not_just_successful_ones(
    client, db, trusted_proxy
):
    """Wrong guesses burn the budget — otherwise this is not brute-force
    protection.

    The 6th call carries the CORRECT password. A limiter that counted only
    successful logins would hand back a 200 and a token here, and the five
    wrong guesses before it would have cost the attacker nothing.
    """
    user = _owner(db)

    spent = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET)]
    assert spent == [401] * _BUDGET, f"setup did not spend the budget on misses: {spent}"

    with_right_password = _login(client, user.email, _RIGHT, _IP_A)

    assert with_right_password == 429, (
        "a correct credential was served after five failed guesses — the "
        "limiter is not counting misses, so guessing is unbounded"
    )


def test_each_ip_has_its_own_budget(client, db, trusted_proxy):
    """One attacker must not be able to lock everyone else out.

    Pairs with the control below: without it, "B was not refused" is also
    what a limiter that never engaged would look like.
    """
    user = _owner(db)
    exhaust = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET + 1)]
    assert exhaust[-1] == 429, f"IP A's budget was not exhausted: {exhaust}"

    from_b = _login(client, user.email, _RIGHT, _IP_B)

    assert from_b != 429, (
        "a second IP was refused on its FIRST request — one caller spending "
        "five requests denies login to every other visitor"
    )
    assert from_b == 200, f"IP B should have logged in successfully, got {from_b}"


def test_control_without_the_trusted_proxy_both_ips_share_one_bucket(
    client, db, monkeypatch
):
    """Control for the test above — the separation came from X-Real-IP.

    `TRUSTED_PROXY` unset is the documented "headers are client-controlled,
    ignore them" path. The same two IPs then key on the same TCP peer, so
    IP B IS refused. If this test ever goes green with a 401/200 for B, the
    test above proves nothing: both halves would be measuring a limiter
    that does not engage.
    """
    monkeypatch.delenv("TRUSTED_PROXY", raising=False)
    user = _owner(db)
    exhaust = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET + 1)]
    assert exhaust[-1] == 429, f"the budget was not exhausted: {exhaust}"

    from_b = _login(client, user.email, _RIGHT, _IP_B)

    assert from_b == 429, (
        "with TRUSTED_PROXY unset, X-Real-IP must be ignored and both "
        f"callers must share one bucket; got {from_b} — so the per-IP test "
        "above is not evidence of header-driven separation"
    )
