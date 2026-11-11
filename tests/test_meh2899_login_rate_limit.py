"""
Module:   test_meh2899_login_rate_limit
Purpose:  Drive POST /auth/login past its 5-per-minute budget through BOTH
          identifying channels, and pin that the refusal is per-caller
          rather than global and counts failed attempts.
Touches:  The process-global slowapi limiter (reset per test by conftest's
          autouse `_reset_rate_limiter`); TRUSTED_PROXY and
          EDGE_PROXY_SECRET, both via monkeypatch; the users table.
Does NOT: test the edge channel's AUTHENTICATION. Whether
          `X-Edge-Client-IP` is accepted without a matching secret is
          `tests/test_meh2298_edge_client_ip.py` (four spoofing controls,
          `resolve_client_ip` in isolation). Measured: deleting that gate
          leaves every test HERE green and reds four tests THERE. This
          file assumes the gate and tests the bucketing.
Related:  backend/app/routers/auth.py:1198 (the decorator);
          backend/app/rate_limit.py:209 (the key function);
          tests/test_api.py:1694-1702 (the other /auth/login loop).
History:  MEH-2905 (creation); round 1 added the edge-channel test and the
          window discipline; round 2 replaced a wall-clock margin with a
          direct re-check of the limiter's state.

MEH-2905 (MEH-2899 area 4) — the 5-per-minute brute-force limit on login.

Row 5 of the MEH-2892 top-20 action-map gaps, score 13: «429 על login:
אין טסט». `POST /auth/login` carries `@limiter.limit("5/minute")`
(`backend/app/routers/auth.py:1198`, "SECURITY FIX #2: brute-force
protection") and the limiter is keyed per real client IP
(`rate_limit.py:209`, `Limiter(key_func=get_real_client_ip)`).

WHAT WAS ALREADY THERE. `/auth/login` appears 11 times across
`tests/*.py`, once inside a loop:
`test_api.py:1702`, inside `TestLoginTimingEqualization`'s local
`measure()` (the `for` is at `:1694`), which drives it 165 times — and **rotates
`X-Real-IP` on every request specifically so the 5/minute cap is never
reached** (`test_api.py:1660-1663`). So no test had driven the route past
its budget, but not because nobody looped it; because the one loop was
built to stay underneath. `tests/test_rate_limit.py` unit-tests
`resolve_client_ip` and never calls a route (its only `client.` is
`req.client.host` on a mock); `test_meh1979_public_rate_limits.py` covers
the public surface — mostly GET, plus one POST at `:140-143` — and
not auth.
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
(`rate_limit.py:126`), before the `TRUSTED_PROXY` branch at `:130`:

    edge     `X-Edge-Client-IP`, accepted only with a matching
             `X-Edge-Secret` (>= 32 chars, constant-time compare). Stamped
             by our own Vercel middleware on every `/api/*` request —
             which is every call a browser makes to this backend — when
             `EDGE_PROXY_SECRET` is set and the visitor IP is known
             (`frontend/middleware.js:229-242`, `:248`, matcher `:344`).
             It does not consult `TRUSTED_PROXY` at all. That
             `EDGE_PROXY_SECRET` is in fact set on the deployed
             environments is an as-of from `docs/CHANGELOG.md:918`
             (10/2026); no CC session can re-derive it (MEH-2090).
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

THE 60-SECOND WINDOW, and how the two tests that need it are protected.
The limiter is a fixed window over in-memory storage, anchored at the
FIRST hit and expiring on wall time — measured: five misses, `sleep(62)`,
and the sixth request is 401, not 429.

Straddling that expiry is harmless in tests 1, 2 and 5: it turns the
refusal they assert into a 401 or a 200, so they fail loudly on their own
verdict. It is NOT harmless in tests 3 and 4, where a rolled-over window
makes `from_b != 429` hold even under L3's single global bucket — the one
regression those tests exist to catch, passing silently.

So tests 3 and 4 do not time themselves. They ask the limiter directly:
after B is served, A is probed once more and must STILL be refused. If
A's window had rolled over, A would be served too and the test reds. That
is a measurement of the state the premise depends on, rather than a
wall-clock proxy for it — and unlike an elapsed-time bound it cannot be
defeated by a slow runner, nor misfire on one. (An earlier revision used
`elapsed < 30s`. It was dropped: in tests 1, 2 and 5 it sat after an
assertion that already failed first, and in CI, where both pytest
invocations pass `--timeout=60`, a real straddle is killed before it can
happen, so the only band the bound could fire in was one where no
straddle had occurred — a false red carrying a message about a void run.)

NOT `serial`, and that is a correction. These five carried
`@pytest.mark.serial` until the wall-clock bound above was removed —
the marker's registered purpose (`conftest.py:171-175`) is "asserts on
measured wall-clock timing", which they no longer do. Keeping it put five
bcrypt-heavy login tests into the same serial pass as
`test_api.py`'s `TestLoginTimingEqualization`, which measures bcrypt
timing PARITY against a 20 ms threshold and is already
`flaky(reruns=2)` for the "quieter machine" reason. That pass went red in
CI on this branch (`p95 spread 98.9ms`) and needed a rerun locally;
removing the marker removes the interference. The tests are safe in the
parallel pass: each xdist worker is its own process with its own
in-memory limiter and its own database (conftest, MEH-1911), so no bucket
is ever shared, and a straddle under parallel load is caught loudly by
the re-probe rather than passing silently.

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

                                      L1   L2   L3   L4   L5  STALE
  test_sixth_login...refused          RED  RED   ·    ·    ·    ·
  test_the_limit_counts_failed...     RED  RED  RED   ·   RED  RED
  test_each_ip_has_its_own_budget     RED   ·   RED   ·    ·   RED
  test_the_edge_channel...            RED   ·   RED   ·    ·   RED
  test_control_without_the_trusted... RED   ·    ·   RED  RED   ·

L5 must be measured ONE TEST PER PROCESS. The counter it introduces is
module-level, so in a single-process run of the whole file it leaks
between tests and the column changes. The other four columns do not care.

STALE is not a source break: it is `make_user`'s default password changed
(`conftest.py:296`), the one-line drift `_RIGHT` is exposed to. It is in
the table because the misses test used to survive it — `with_right_password
== 429` is satisfied by a wrong password just as well, so under STALE the
test degenerated into a copy of the boundary test, and under STALE+L5 both
of L5's designated catchers passed. The premise is now asserted (a
successful login from _IP_B before the budget is spent) and STALE reds it.

Read down the columns: L4 is caught by the control alone, and L5 reds the
misses test while leaving the boundary test GREEN — which is what makes
the misses test more than a restatement of the boundary. A limiter that
counted only failures and waved valid credentials through would look
correct to every other test here. L3 reds the two per-IP tests and, since
the premise login spends a slot of the single global bucket, the misses
test as well.
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
    # REUSES: tests/test_api.py:1696-1699 (under the TRUSTED_PROXY=1 of
    # `:1663`) — X-Real-IP is how that suite steers the limiter's key.
    # There it rotates the value to stay under the cap; here we pin it to
    # reach it.
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


def test_sixth_login_from_one_ip_is_refused(client, db, trusted_proxy):
    """The exact boundary: 5 attempts pass the limiter, the 6th does not."""
    user = _account(db)

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

    # Premise, asserted rather than assumed: _RIGHT really does
    # authenticate. From _IP_B, whose budget is its own, so this costs
    # _IP_A nothing. Without it the verdict below is satisfied by a WRONG
    # password too — a 429 from a spent bucket looks identical either way
    # — and the whole test degenerates into a copy of the boundary test
    # the moment `make_user`'s default password drifts (conftest.py:296).
    assert _login(client, user.email, _RIGHT, _IP_B) == 200, (
        "_RIGHT does not authenticate, so this test cannot tell a limiter "
        "that waves valid credentials through from one that refuses them"
    )

    spent = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET)]
    assert 429 not in spent, f"the budget was exhausted early: {spent}"

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
    user = _account(db)
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
    # The premise, measured instead of timed: A's window was still open
    # when B was served. A rolled-over window would serve A too, and
    # `from_b != 429` above would then hold even under one global bucket.
    assert _login(client, user.email, _WRONG, _IP_A) == 429, (
        "IP A is no longer refused, so its 60s window rolled over during "
        "this test — B being served proves nothing about per-IP buckets"
    )


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

    exhaust = [
        _login_via_edge(client, user.email, _WRONG, _IP_A)
        for _ in range(_BUDGET + 1)
    ]
    # Only that the budget on this route is 5 through this channel. It is
    # NOT evidence the limiter reads X-Edge-Client-IP: if the header were
    # ignored, all six calls would fall through to the shared TestClient
    # peer and the sixth would be 429 anyway. The keying claim belongs to
    # `from_b` below, which is the assertion that can see it.
    assert exhaust[-1] == 429, (
        f"the budget was not reached through the edge channel: {exhaust}"
    )

    from_b = _login_via_edge(client, user.email, _RIGHT, _IP_B)

    assert from_b != 429, (
        "a second visitor was refused on her FIRST request — either the "
        "limiter does not read X-Edge-Client-IP (both callers fell through "
        "to the shared peer) or one caller denies login to every other "
        "browser visitor"
    )
    assert from_b == 200, (
        f"the second visitor got {from_b}, not 200 — if that is not 429 "
        "then login's success code changed, not the limiter"
    )
    # Same premise check as test 3: A's window was still open.
    assert _login_via_edge(client, user.email, _WRONG, _IP_A) == 429, (
        "IP A is no longer refused, so its 60s window rolled over during "
        "this test — B being served proves nothing about per-visitor buckets"
    )


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
    exhaust = [_login(client, user.email, _WRONG, _IP_A) for _ in range(_BUDGET + 1)]
    assert exhaust[-1] == 429, f"the budget was not exhausted: {exhaust}"

    from_b = _login(client, user.email, _RIGHT, _IP_B)

    assert from_b == 429, (
        f"IP B was served ({from_b}) with TRUSTED_PROXY unset. Either "
        "X-Real-IP is being honoured without the trusted-proxy gate (a "
        "spoofable per-request budget), or the budget is not consulted for a "
        "valid credential. Both make the per-IP tests above non-evidence."
    )
