"""MEH-2007 — two overlapping PUTs that both cross the approvability threshold
ping the admin exactly once.

`update_my_producer` snapshots `was_approvable` at the top of the handler and
re-evaluates it after `db.commit()`, firing the review-ready ping on the
false→true edge. Under READ COMMITTED (Postgres' default; nothing in
`backend/app/database.py:104` overrides it) two concurrent PUTs on the same
producer both read `was_approvable=False` before either commits, both see
`True` afterwards, and both fire. Damage is noise — a duplicate admin
notification — the same class MEH-1820 closed at the OTP site.

WHY THIS IS NOT A SEQUENTIAL TEST: running two PUTs back to back proves
nothing. The second one snapshots `was_approvable=True` (the first already
committed the image) and the false→true edge is absent, so it is silent for
reasons that have nothing to do with concurrency. The race needs both requests
*inside* the handler at once, so this file drives two real threads through the
real endpoint and plants a barrier at the one call that sits between the
producer load and the commit.

THE BARRIER, and why it is deterministic in both worlds:

    thread A   loads the producer → reaches _pending_and_approvable
               → signals `a_inside` → waits for `b_inside` (bounded)
    thread B   enters the handler for the same producer

    pre-fix    B loads the producer (A has not committed), reaches
               _pending_and_approvable, signals `b_inside`, A wakes
               immediately → BOTH snapshot False → two commits, TWO pings
    post-fix   B blocks on A's advisory lock, taken BEFORE the producer load,
               and never reaches the barrier. A's wait expires, A commits and
               the lock releases, B then loads the *fresh* row, snapshots
               True, and the edge is absent → ONE ping

So the fixed run costs one bounded wait (`_BARRIER_TIMEOUT`) and the broken run
costs nothing — neither outcome depends on thread scheduling luck.

Touches:  producers table only, via the standard test session. No Cloudinary
          (the destroy step at producer_me.py:490 is post-commit and the
          gallery only grows here), no Resend/WhatsApp (the ping is mocked).
Does NOT: assert anything about `confirm_phone_otp` — that is the sibling site,
          closed by MEH-1820 and covered by tests/test_otp_confirm_concurrency.py.
History:  MEH-2007 (creation).
"""

import threading

from fastapi.testclient import TestClient

import app.routers.producer_me as pm
from app.models.models import Producer
from tests.conftest import auth_header, make_producer, make_user

PING_TARGET = "notify_admin_producer_review_ready"
IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/race.jpg"

# How long thread A holds the barrier open waiting for B. Only ever paid in
# full when the fix is working (B is blocked on the advisory lock and cannot
# signal). Generous enough that a slow CI runner cannot turn a correct pass
# into a flake, short enough not to stall the suite.
_BARRIER_TIMEOUT = 5.0


def _setup(db):
    """A pending producer one image away from being approvable.

    No category, so `categories_require_license` is False and approvability
    hinges on `images` alone (producer_me.py:279-284) — the license half of the
    gate is a different transition and would only add noise here.
    """
    producer = make_producer(db, name="חוות המרוץ הכפול", status="pending", images=[])
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return producer, user


def test_two_concurrent_puts_ping_the_admin_once(client, db, monkeypatch):
    """Both PUTs attach the first image; the admin is pinged exactly once.

    Fails pre-fix with `ping.call_count == 2`.

    THE CONTROL, and why it is `reached` rather than the ping count alone:
    `reached` counts how many threads got as far as `_pending_and_approvable`,
    i.e. past the producer load. If it is not 2, the two requests never
    overlapped in the handler and a `call_count == 1` would be measuring a
    serialized pair — the one world where this test is green for the wrong
    reason. Post-fix both threads still reach it (B after the lock releases),
    so the control holds in both worlds; what changes is only *when*.
    """
    producer, user = _setup(db)
    producer_id = producer.id

    a_inside = threading.Event()
    b_inside = threading.Event()
    reached: list[str] = []
    lock = threading.Lock()
    results: dict[str, int] = {}
    pings: list[tuple] = []

    real_approvable = pm._pending_and_approvable

    def barriered(db_, producer_):
        """Stand-in for _pending_and_approvable that forces the overlap.

        Delegates to the real implementation — the point is the timing, not
        the verdict, and faking the verdict would make the ping assertion
        meaningless.
        """
        with lock:
            reached.append("x")
        if not a_inside.is_set():
            a_inside.set()
            b_inside.wait(_BARRIER_TIMEOUT)
        else:
            b_inside.set()
        return real_approvable(db_, producer_)

    def fake_ping(name, city):
        with lock:
            pings.append((name, city))

    monkeypatch.setattr(pm, "_pending_and_approvable", barriered)
    monkeypatch.setattr(pm, PING_TARGET, fake_ping)

    def put(tag):
        # One TestClient PER THREAD, not the shared fixture. `httpx.Client` —
        # which TestClient subclasses — is documented as not thread-safe, and a
        # test built to detect non-determinism is the last place to rest on an
        # implementation detail. Same app instance, so the wiring is identical.
        thread_client = TestClient(client.app)
        results[tag] = thread_client.put(
            "/producers/me",
            json={"images": [IMAGE]},
            headers=auth_header(user),
        ).status_code

    ta = threading.Thread(target=put, args=("a",))
    tb = threading.Thread(target=put, args=("b",))
    ta.start()
    a_inside.wait(_BARRIER_TIMEOUT)  # let A get inside first
    tb.start()
    ta.join(timeout=30)
    tb.join(timeout=30)

    assert not ta.is_alive() and not tb.is_alive(), "a PUT thread hung"

    # --- control first: if this fails, the verdict below is meaningless -----
    assert len(reached) >= 2, (
        f"only {len(reached)} thread(s) reached _pending_and_approvable, so the "
        "two requests never both entered the handler — this test asserts "
        "nothing about concurrency"
    )
    assert sorted(results.values()) == [200, 200], (
        f"both PUTs must succeed; got {results}"
    )

    # --- the actual contract ------------------------------------------------
    assert len(pings) == 1, (
        f"the review-ready ping fired {len(pings)} times for one false→true "
        "transition — two concurrent PUTs each saw was_approvable=False"
    )

    db.expire_all()
    reread = db.query(Producer).filter(Producer.id == producer_id).first()
    assert reread.images == [IMAGE]
    assert reread.status == "pending"


def test_a_second_put_after_the_first_completes_is_still_silent(client, db):
    """Control — the SEQUENTIAL case must keep its existing behaviour.

    This is the case the race test cannot cover and the one real owners hit (a
    double-tap on a slow connection). It is silent because the second PUT
    snapshots `was_approvable=True`, NOT because of anything this ticket adds.
    Passes in both worlds by design: a fix that made this fire twice, or that
    made the first PUT silent, would be a regression dressed as a concurrency
    fix.
    """
    _, user = _setup(db)

    pings: list[tuple] = []

    with_ping = lambda name, city: pings.append((name, city))  # noqa: E731
    original = pm.notify_admin_producer_review_ready
    pm.notify_admin_producer_review_ready = with_ping
    try:
        first = client.put(
            "/producers/me",
            json={"images": [IMAGE]},
            headers=auth_header(user),
        )
        second = client.put(
            "/producers/me",
            json={"images": [IMAGE]},
            headers=auth_header(user),
        )
    finally:
        pm.notify_admin_producer_review_ready = original

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert len(pings) == 1, f"expected one ping across two sequential PUTs, got {pings}"
