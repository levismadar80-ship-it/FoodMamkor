"""MEH-2051 — a PUT racing an OTP confirm pings the admin exactly once.

This is the third member of a family, and the one nothing covered. The other
two are already closed and each has its own file:

    OTP-vs-OTP    two concurrent confirms claiming ONE token.
                  CLOSED by MEH-1820's conditional UPDATE on the token row;
                  guarded by tests/test_otp_confirm_concurrency.py.
    PUT-vs-PUT    two concurrent PUTs each attaching the first image.
                  CLOSED by MEH-2007's advisory lock in `update_my_producer`;
                  guarded by tests/test_review_ready_ping_concurrency.py.
    OTP-vs-PUT    a PUT and a confirm each computing the SAME approvability
                  snapshot independently. THIS FILE.

The third one was measured, on this branch AND on `origin/staging`, before any
fix existed — so it is a pre-existing hole rather than a regression from either
earlier lock. `tests/test_review_ready_ping_concurrency.py:40-69` names it as
explicitly out of its own scope and asks for exactly this file.

THE MECHANISM, which is why neither existing guard catches it:

    thread A   PUT /producers/me on an UNRELATED field (`description`). Takes
               MEH-2007's advisory lock, loads the producer, and snapshots
               `was_approvable=False` — the producer is still `pending_whatsapp`,
               and `_pending_and_approvable` gates on status == "pending".
    thread B   POST /producers/me/verify-phone/confirm. Pre-fix nothing stops
               it: MEH-2007's lock is taken in `update_my_producer` only, and
               MEH-1820's token row lock is uncontended because there is only
               one confirm in flight. B flips pending_whatsapp → pending,
               commits, and fires the ping. Correctly — this IS the transition.
    thread A   wakes, commits its unrelated description edit, and re-evaluates
               after the commit. `expire_on_commit` is on (the sessionmaker at
               `backend/app/database.py:107` does not disable it), so the
               re-read sees B's committed flip and A fires a SECOND ping for a
               transition it played no part in.

THE BARRIER, and why it is deterministic in both worlds:

    pre-fix    B is never blocked, runs to completion, sets `b_done`, and A
               wakes immediately → TWO pings. Costs nothing.
    post-fix   B blocks on the advisory lock that `confirm_phone_otp` now takes
               and cannot set `b_done`. A's wait expires, A commits and the
               lock releases, B then re-reads the producer under the lock,
               snapshots the FRESH state and fires the one correct ping → ONE
               ping. Costs one bounded `_BARRIER_TIMEOUT`.

Neither outcome depends on thread scheduling luck, which is what makes this a
guard rather than a coin flip.

WHY THE BARRIER KEYS ON THE FIRST CALLER rather than on an endpoint name: both
handlers call `_pending_and_approvable`, and each calls it TWICE (the snapshot,
then the post-commit re-check inside `_maybe_fire_review_ready`). Blocking on
every call would hang the run. Only the first call from the first thread to
arrive is held; every other call delegates straight through.

Touches:  producers + phone_otp_tokens, via the standard test session. No
          Resend/WhatsApp (the ping is collected in-process), no Cloudinary.
Does NOT: cover OTP-vs-OTP or PUT-vs-PUT — see the two files named above. Does
          not assert anything about the 400 the losing confirm returns in the
          OTP-vs-OTP race; that contract belongs to MEH-1820's file and this
          fix deliberately leaves it untouched.
History:  MEH-2051 (creation).
"""

import threading
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

import app.routers.producer_me as pm
from app.models.models import PhoneOtpToken, Producer
from tests.conftest import auth_header, make_category, make_producer, make_user

PING_TARGET = "notify_admin_producer_review_ready"
IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/otp-put.jpg"
CODE = "654321"

# How long thread A holds the barrier open waiting for B. Only ever paid in
# full when the fix is working (B is blocked on the advisory lock and cannot
# signal). Generous enough that a slow CI runner cannot turn a correct pass
# into a flake, short enough not to stall the suite.
_BARRIER_TIMEOUT = 5.0


def _setup(db):
    """A producer whose ONLY missing step is the OTP-driven status flip.

    `pending_whatsapp` + an image means `_is_approvable` is already True while
    `_pending_and_approvable` is still False (it gates on status == "pending"),
    so the false→true edge lands exactly on the confirm. That is the shape in
    which the two handlers disagree.
    """
    cat = make_category(db)
    producer = make_producer(
        db,
        name="חוות המרוץ המקביל",
        status="pending_whatsapp",
        images=[IMAGE],
        category=cat,
    )
    producer.phone = "0501234571"
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    db.add(
        PhoneOtpToken(
            producer_id=producer.id,
            phone=producer.phone,
            code=CODE,
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )
    )
    db.commit()
    return producer, user


def test_a_put_racing_an_otp_confirm_pings_the_admin_once(client, db, monkeypatch):
    """Exactly one ping across a concurrent PUT and OTP confirm.

    Fails pre-fix with two pings — measured on origin/staging too.
    """
    producer, user = _setup(db)
    producer_id = producer.id

    a_inside = threading.Event()
    b_done = threading.Event()
    lock = threading.Lock()
    state: dict[str, int | None] = {"first_thread": None}
    reached: set[int] = set()
    results: dict[str, int] = {}
    pings: list[tuple] = []

    real_approvable = pm._pending_and_approvable

    def barriered(db_, producer_):
        """Stand-in for _pending_and_approvable that forces the overlap.

        Delegates to the real implementation — the point is the timing, not the
        verdict, and faking the verdict would make the ping assertion
        meaningless.
        """
        tid = threading.get_ident()
        with lock:
            reached.add(tid)
            first_call_of_first_thread = state["first_thread"] is None
            if first_call_of_first_thread:
                state["first_thread"] = tid
        if first_call_of_first_thread:
            a_inside.set()
            b_done.wait(_BARRIER_TIMEOUT)
        return real_approvable(db_, producer_)

    def fake_ping(name, city):
        with lock:
            pings.append((name, city))

    monkeypatch.setattr(pm, "_pending_and_approvable", barriered)
    monkeypatch.setattr(pm, PING_TARGET, fake_ping)

    # One TestClient PER THREAD, not the shared fixture. `httpx.Client` — which
    # TestClient subclasses — is documented as not thread-safe, and a test built
    # to detect non-determinism is the last place to rest on an implementation
    # detail. Same app instance, so the wiring is identical.
    def put_unrelated_field():
        results["put"] = (
            TestClient(client.app)
            .put(
                "/producers/me",
                json={"description": "עדכון שאינו נוגע למיקום או לתמונות"},
                headers=auth_header(user),
            )
            .status_code
        )

    def confirm_otp():
        try:
            results["confirm"] = (
                TestClient(client.app)
                .post(
                    "/producers/me/verify-phone/confirm",
                    json={"code": CODE},
                    headers=auth_header(user),
                )
                .status_code
            )
        finally:
            # Set from INSIDE the thread, never from the main thread after a
            # join: post-fix this request cannot return until A releases the
            # advisory lock, and A does not commit until this event fires or
            # its wait expires. Joining first would deadlock the main thread.
            b_done.set()

    ta = threading.Thread(target=put_unrelated_field)
    tb = threading.Thread(target=confirm_otp)
    ta.start()
    a_inside.wait(_BARRIER_TIMEOUT)  # let the PUT get inside first
    tb.start()
    ta.join(timeout=30)
    tb.join(timeout=30)

    assert not ta.is_alive() and not tb.is_alive(), "a request thread hung"

    # --- controls first: if these fail, the verdict below is meaningless -----
    assert len(reached) == 2, (
        f"{len(reached)} thread(s) reached _pending_and_approvable, expected 2 — "
        "the two requests never both entered the handler, so this test asserts "
        "nothing about concurrency"
    )
    assert results.get("put") == 200, f"the PUT must succeed; got {results}"
    assert results.get("confirm") == 200, f"the confirm must succeed; got {results}"

    # --- the actual contract ------------------------------------------------
    assert len(pings) == 1, (
        f"the review-ready ping fired {len(pings)} times for ONE "
        "pending_whatsapp→pending transition — the PUT and the confirm each "
        f"computed the same false→true edge independently; pings={pings}"
    )

    # The fix must not cost the transition itself: both writes still land.
    db.expire_all()
    reread = db.query(Producer).filter(Producer.id == producer_id).first()
    assert reread.status == "pending", "the OTP confirm's status flip was lost"
    assert reread.phone_verified is True
    assert reread.description == "עדכון שאינו נוגע למיקום או לתמונות", (
        "the PUT's unrelated edit was lost"
    )


def test_a_confirm_after_an_unrelated_put_completes_is_still_one_ping(client, db):
    """Control — the SEQUENTIAL case must keep its existing behaviour.

    This is the case the race test cannot cover and the one real owners hit (a
    save, then the OTP a moment later). It fires exactly one ping because the
    PUT's own snapshot is False and stays False — the producer is still
    `pending_whatsapp` when the PUT commits — and the confirm then owns the
    edge. Passes in both worlds by design: a fix that silenced the confirm, or
    that made the PUT fire, would be a regression dressed as a concurrency fix.
    """
    producer, user = _setup(db)

    pings: list[tuple] = []
    original = pm.notify_admin_producer_review_ready
    pm.notify_admin_producer_review_ready = lambda name, city: pings.append((name, city))
    try:
        put = client.put(
            "/producers/me",
            json={"description": "עדכון רגיל לפני אימות הטלפון"},
            headers=auth_header(user),
        )
        confirm = client.post(
            "/producers/me/verify-phone/confirm",
            json={"code": CODE},
            headers=auth_header(user),
        )
    finally:
        pm.notify_admin_producer_review_ready = original

    assert put.status_code == 200, put.text
    assert confirm.status_code == 200, confirm.text
    assert len(pings) == 1, (
        f"expected one ping across a sequential PUT + confirm, got {pings}"
    )
