"""
MEH-2905 (MEH-2899 area 4) — the 5-per-minute brute-force limit on login.

Row 5 of the MEH-2892 top-20 action-map gaps, score 13: «429 על login:
אין טסט». `POST /auth/login` carries `@limiter.limit("5/minute")`
(`backend/app/routers/auth.py:1198`, "SECURITY FIX #2: brute-force
protection") and the limiter is keyed per real client IP
(`rate_limit.py:209`, `Limiter(key_func=get_real_client_ip)`).

WHAT WAS ALREADY THERE. `/auth/login` appears 11 times across
`tests/*.py`, once inside a loop: `test_api.py:1694`
(`TestLoginTimingEqualization`) drives it 165 times — and **rotates
`X-Real-IP` on every request specifically so the 5/minute cap is never
reached** (`test_api.py:1660-1663`). So no test had driven the route past
its budget, but not because nobody looped it; because the one loop was
built to stay underneath. `tests/test_rate_limit.py` unit-tests
`resolve_client_ip` and never calls a route (its only `client.` is
`req.client.host` on a mock); `test_meh1979_public_rate_limits.py` covers
the public GET surface, not auth.
(This docstring previously claimed `/auth/login` was "never inside a
loop". That was a grep over ±2 lines of the call site, which cannot see a
call nested inside a local `def measure(...)` — a confident answer that
was an artifact of how it was asked. Corrected from the source.)

THE PROPERTIES, and why each needs its own test:

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
  4. property 3 again, through the OTHER identifying channel — see below.

THE TWO CHANNELS, because picking one and calling it "production" is
wrong. `resolve_client_ip` consults `_edge_client_ip` FIRST
(`rate_limit.py:125-127`), before the `TRUSTED_PROXY` branch at `:130`:

    edge     `X-Edge-Client-IP`, accepted only with a matching
             `X-Edge-Secret` (>= 32 chars, constant-time compare). Stamped
             by our own Vercel middleware on every request whenever
             `EDGE_PROXY_SECRET` is set (`frontend/middleware.js:229-242`),
             so this is the channel a real browser's traffic arrives on,
             and it does not consult `TRUSTED_PROXY` at all.
    real-ip  `X-Real-IP`, honoured only behind `TRUSTED_PROXY`. The
             channel for a caller reaching Railway directly.

Tests 1–3 drive the `real-ip` channel; test 4 drives `edge`. Covering
only `real-ip` would leave the priority channel — the one browser traffic
uses — untested through this route, which is how this file was first
written.

THE CONTROL (test 5). "IP B was not refused" has a second possible cause:
the limiter never engaged for B at all. So the per-IP scenario runs again
with `TRUSTED_PROXY` unset, where `X-Real-IP` must be ignored and both
callers share one bucket. The pair is the evidence; either half alone is
a green with two explanations. It earns its keep twice over: break L4
below is a real spoofing regression, and the control is the only test
here that reds on it.

THE 60-SECOND WINDOW, and why every test times itself. The limiter is a
fixed window over in-memory storage, anchored at the first hit and
expiring on wall time — measured: five misses, `sleep(62)`, and the sixth
request is 401, not 429. A test that straddles the expiry can therefore
pass for the wrong reason: in test 3, if B's request lands in a fresh
window, `from_b != 429` holds even under L3's single global bucket, which
is the one regression that test exists to catch. Loud failure beats a
silent pass, so every test asserts its own elapsed time against
`_WINDOW_MARGIN` and says the run is void if it overran. `serial` keeps
it off a machine busy with xdist neighbours; the window is per process,
so parallel workers do not share a bucket.

SHOWN FAILING (MEH-1619). Five breaks, each reverted after measuring.
L1–L4 are one-line patches, reproducible verbatim from here; L5 is a
SHAPE, not a patch — the budget re-implemented inside the handler and
consulted only on the failure branches — so expect to write it yourself:

  L1  auth.py:1198   @limiter.limit("5/minute") -> "50/minute"
  L2  auth.py:1198   @limiter.limit("5/minute") -> "3/minute"
  L3  rate_limit.py:209
          Limiter(key_func=get_real_client_ip)
       -> Limiter(key_func=lambda request: "global")      # one bucket for all
  L4  rate_limit.py:130
          if _trusted_proxy_enabled():
       -> if True:                                        # trust X-Real-IP always
  L5  auth.py:1198   decorator deleted; a 5-per-60s counter keyed on
      get_real_client_ip(request) spent before each 401 raise only, so a
      correct password is never checked against the budget.

                                      L1   L2   L3   L4   L5
  test_sixth_login...refused          RED  RED   ·    ·    ·
  test_the_limit_counts_failed...     RED  RED   ·    ·   RED
  test_each_ip_has_its_own_budget     RED   ·   RED   ·    ·
  test_the_edge_channel...            RED   ·   RED   ·    ·
  test_control_without_the_trusted... RED   ·    ·   RED  RED

Read down the columns: L3 is caught by the per-IP tests alone, L4 by the
control alone, and L5 reds the misses test while leaving the boundary
test GREEN — which is what makes the misses test more than a restatement
of the boundary. A limiter that counted only failures and waved valid
credentials through would look correct to every other test here.
"""

from __future__ import annotations

import time
import uuid

import pytest

from conftest import make_user

_IP_A = "203.0.113.10"  # RFC 5737 documentation range
_IP_B = "203.0.113.11"
_RIGHT = "Zx7Yp9Mq2Lr4"  # conftest's make_user default
_WRONG = "Wr0ngPassw0rd!"
_BUDGET = 5  # @limiter.limit("5/minute") on POST /auth/login
# The limiter's window is 60 s from the first hit. Any test that takes
# longer than this straddled it and its verdict is void, so it fails
# loudly instead. Baseline is ~2 s per test; 30 s is a 15x margin that
# still lands well inside the window.
_WINDOW_MARGIN = 30.0
# >= EDGE_SECRET_MIN_LEN (32). A dummy — the real secret never appears in
# a test, a log or a commit.
_EDGE_SECRET = "e" * 40


@pytest.fixture
def trusted_proxy(monkeypatch):
    """Honour `X-Real-IP` — the channel for a direct caller to Railway.

    NOT the channel a browser's traffic arrives on: that is the edge
    header, which has priority and ignores this flag entirely. See "THE
    TWO CHANNELS" above and `test_the_edge_channel_also_buckets_per_ip`.
    """
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    # The edge channel is consulted FIRST, so a secret left in the
    # environment would route these requests down it and the X-Real-IP
    # values below would never be read.
    monkeypatch.delenv("EDGE_PROXY_SECRET", raising=False)


def _login(client, email: str, password: str, ip: str) -> int:
    # REUSES: tests/test_api.py:1663 — X-Real-IP under TRUSTED_PROXY=1 is
    # how that suite steers the limiter's key; there it rotates the value
    # to stay under the cap, here we pin the value to reach it.
    return client.post(
        "/auth/login",
        json={"email": email, "password": password},
        headers={"X-Real-IP": ip},
    ).status_code


def _login_via_edge(client, email: str, password: str, ip: str) -> int:
    return client.post(
        "/auth/login",
        json={"email": email, "password": password},
        headers={"X-Edge-Secret": _EDGE_SECRET, "X-Edge-Client-IP": ip},
    ).status_code


def _account(db):
    """A user with a known-good password. `make_user` commits itself."""
    return make_user(db, email=f"{uuid.uuid4().hex[:8]}@example.com")


def _assert_inside_the_window(started: float) -> None:
    elapsed = time.monotonic() - started
    assert elapsed < _WINDOW_MARGIN, (
        f"this test took {elapsed:.1f}s against a 60s fixed window, so it may "
        "have straddled the window boundary — every rate-limit verdict in this "
        "run is void, not green"
    )


@pytest.mark.serial
def test_sixth_login_from_one_ip_is_refused(client, db, trusted_proxy):
    """The exact boundary: 5 attempts pass the limiter, the 6th does not."""
    user = _account(db)
    started = time.monotonic()

    codes = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET + 1)]

    # The limiter claim, stated as the limiter's own status code so an
    # unrelated change to login's failure code cannot red this with a
    # message about rate limiting.
    assert 429 not in codes[:_BUDGET], (
        f"a request inside the budget was refused by the limiter: {codes}"
    )
    # Separate, so its failure names the real cause.
    assert codes[0] == 401, (
        f"a wrong password should answer 401; login returned {codes[0]} — "
        "login's failure code changed, this is not a rate-limit finding"
    )
    assert codes[_BUDGET] == 429, f"the 6th attempt was not refused: {codes}"
    _assert_inside_the_window(started)


@pytest.mark.serial
def test_the_limit_counts_failed_attempts_not_just_successful_ones(
    client, db, trusted_proxy
):
    """Wrong guesses burn the budget — otherwise this is not brute-force
    protection.

    The 6th call carries the CORRECT password. A limiter consulted only on
    the failure branches would hand back a 200 and a token here, and the
    five wrong guesses before it would have cost the attacker nothing.
    """
    user = _account(db)
    started = time.monotonic()

    spent = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET)]
    assert 429 not in spent, f"the budget was exhausted early: {spent}"

    with_right_password = _login(client, user.email, _RIGHT, _IP_A)

    assert with_right_password == 429, (
        "a correct credential was served after five failed guesses — the "
        "limiter is not counting misses, so guessing is unbounded"
    )
    _assert_inside_the_window(started)


@pytest.mark.serial
def test_each_ip_has_its_own_budget(client, db, trusted_proxy):
    """One attacker must not be able to lock everyone else out.

    Pairs with the control below: without it, "B was not refused" is also
    what a limiter that never engaged would look like.
    """
    user = _account(db)
    started = time.monotonic()
    exhaust = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET + 1)]
    assert exhaust[-1] == 429, f"IP A's budget was not exhausted: {exhaust}"

    from_b = _login(client, user.email, _RIGHT, _IP_B)

    assert from_b != 429, (
        "a second IP was refused on its FIRST request — one caller spending "
        "five requests denies login to every other visitor"
    )
    assert from_b == 200, (
        f"IP B should have logged in successfully, got {from_b} — if this is "
        "not 429 then login's success code changed, not the limiter"
    )
    # Before the margin check, because a rolled-over window would make
    # `from_b != 429` pass under a single global bucket too.
    _assert_inside_the_window(started)


@pytest.mark.serial
def test_the_edge_channel_also_buckets_per_ip(client, db, monkeypatch):
    """The same separation through the channel browser traffic uses.

    `X-Edge-Client-IP` + a matching `X-Edge-Secret` is resolved BEFORE the
    `TRUSTED_PROXY` branch (`rate_limit.py:125-127`), so `TRUSTED_PROXY`
    is deliberately left unset here: if the edge channel were not wired to
    the limiter's key, both callers would fall through to the shared TCP
    peer and B would be refused.
    """
    monkeypatch.delenv("TRUSTED_PROXY", raising=False)
    monkeypatch.setenv("EDGE_PROXY_SECRET", _EDGE_SECRET)
    user = _account(db)
    started = time.monotonic()

    exhaust = [
        _login_via_edge(client, user.email, _WRONG, _IP_A)
        for _ in range(_BUDGET + 1)
    ]
    assert exhaust[-1] == 429, (
        f"the edge channel never reached the budget: {exhaust} — the limiter "
        "is not keyed on X-Edge-Client-IP at all"
    )

    from_b = _login_via_edge(client, user.email, _RIGHT, _IP_B)

    assert from_b != 429, (
        "a second visitor was refused on her FIRST request through the edge "
        "channel — one caller denies login to every other browser visitor"
    )
    _assert_inside_the_window(started)


@pytest.mark.serial
def test_control_without_the_trusted_proxy_both_ips_share_one_bucket(
    client, db, monkeypatch
):
    """Control for the per-IP tests — the separation came from the header.

    With `TRUSTED_PROXY` unset, `X-Real-IP` and `X-Forwarded-For` are
    client-controlled and deliberately ignored (`rate_limit.py:130`), so
    the same two IPs key on the same TCP peer and IP B IS refused. If B
    were served here, the per-IP tests above would not be evidence of
    header-driven separation — both halves would be measuring a limiter
    that does not engage.

    NOT a general "all headers are ignored" control, and the file no
    longer claims one: `X-Edge-Client-IP` is still honoured with
    `TRUSTED_PROXY` unset whenever `EDGE_PROXY_SECRET` is configured —
    measured. Hence the explicit `delenv` below, and hence test 4.
    """
    monkeypatch.delenv("TRUSTED_PROXY", raising=False)
    monkeypatch.delenv("EDGE_PROXY_SECRET", raising=False)
    user = _account(db)
    started = time.monotonic()
    exhaust = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET + 1)]
    assert exhaust[-1] == 429, f"the budget was not exhausted: {exhaust}"

    from_b = _login(client, user.email, _RIGHT, _IP_B)

    assert from_b == 429, (
        f"IP B was served ({from_b}) with TRUSTED_PROXY unset. Either "
        "X-Real-IP is being honoured without the trusted-proxy gate (a "
        "spoofable per-request budget), or the budget is not consulted for a "
        "valid credential. Both make the per-IP tests above non-evidence."
    )
    _assert_inside_the_window(started)
