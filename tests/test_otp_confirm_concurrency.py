"""MEH-1820 — two overlapping confirms of one OTP token claim it exactly once.

`confirm_phone_otp` used to read `used == False` and assign `used = True` as
two separate statements. Under READ COMMITTED (Postgres' default) two requests
could both find the same token before either committed, and both would run a
status transition (`pending_whatsapp → pending`, removed in MEH-2124) and fire
the "ready for review" admin ping. Damage is noise rather than data — a
duplicate admin notification — but the missing atomicity guarded the status
transition too, so the fix closes a class rather than a symptom.

MEH-2124 note: neither of those two effects survives. The transition is gone
with its status, and `_maybe_fire_review_ready` can no longer fire from this
handler (see the note in `confirm_phone_otp`). What this file still guards is
the property that outlives both — EXACTLY ONE caller may claim a token — and
that is asserted directly on the two response codes, never on the ping.

WHY THIS TEST IS NOT A SEQUENTIAL ONE, which is the part the card warns about:
running two confirms back to back proves nothing, because the second is caught
by the `phone_verified` early-return at `producer_me.py:1153` and returns 200
with "כבר מאומת" without ever reaching the token query. The race needs the two
requests to be *inside* the handler at the same time, so this file drives two
real threads through the real endpoint and forces the interleaving with a
barrier planted at the one point that sits between the token claim and the
commit.

THE BARRIER, and why it is deterministic in both worlds:

    thread A   claims the token → reaches _pending_and_approvable
               → signals `a_inside` → waits for `b_inside` (bounded)
    thread B   enters the handler and tries to claim the same token

    pre-fix    B's SELECT sees used=False (A has not committed), B reaches
               _pending_and_approvable, signals `b_inside`, A wakes
               immediately → BOTH proceed → two 200s, two pings
    post-fix   B blocks on A's row lock inside the conditional UPDATE and
               never reaches the barrier. A's wait expires, A commits and
               releases the lock, B's UPDATE matches zero rows → 400

So the fixed run costs one bounded wait (`_BARRIER_TIMEOUT`) and the broken run
costs nothing — and neither outcome depends on thread scheduling luck, which is
what makes this a guard rather than a coin flip.
"""

import threading
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient

import app.routers.producer_me as pm
from app.models.models import PhoneOtpToken
from tests.conftest import auth_header, make_category, make_producer, make_user

PING_TARGET = "app.routers.producer_me.notify_admin_producer_review_ready"
APPROVABLE_TARGET = "app.routers.producer_me._pending_and_approvable"

IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/otp.jpg"
CODE = "123456"

# How long thread A holds the barrier open waiting for B. Only ever paid in
# full when the fix is working (B is blocked on the row lock and cannot
# signal). Generous enough that a slow CI runner cannot turn a correct pass
# into a flake, short enough not to stall the suite.
_BARRIER_TIMEOUT = 5.0


def _setup(db):
    """A producer in the queue with a photo — the shape the ping used to fire on.

    The status here was `pending_whatsapp`, removed in MEH-2124; it is
    `pending` now. The fixture is kept rich (category + image) rather than
    minimised because the barrier below is planted on `_pending_and_approvable`, which walks the
    categories to answer the licence question. A bare producer would still
    exercise the token claim, but it would stop exercising that walk.
    """
    cat = make_category(db)
    producer = make_producer(
        db, name="חוות המרוץ", status="pending", images=[IMAGE], category=cat
    )
    producer.phone = "0501234570"
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


def test_two_concurrent_confirms_claim_the_token_once(client, db):
    """Exactly one 200 and exactly one 400. Fails pre-fix with two 200s.

    MEH-2124 — WHY THE PING ASSERTION INVERTED. This used to also require
    exactly one ping, and pre-fix it saw two. It now requires ZERO, and that is
    a statement about the handler rather than a weakened test: with the status
    flip removed, `was_approvable` and the post-commit re-read evaluate the
    SAME predicate over an unchanged row, so `_maybe_fire_review_ready`'s
    `not X and X` is False for every input. Measured before the assertion was
    changed — the run reported "fired 0 times", which is the analytic result.

    The `== 0` form is deliberate over deleting the line: it is what would go
    red if a future change re-introduced a status transition here, which is the
    regression the removal creates room for.
    """
    producer, user = _setup(db)

    a_inside = threading.Event()
    b_inside = threading.Event()
    real_approvable = None
    results: dict[str, int] = {}

    def barriered(db_, producer_):
        """Stand-in for _pending_and_approvable that forces the overlap.

        Delegates to the real implementation — the point is the timing, not
        the verdict, and faking the verdict would make the ping assertion
        meaningless.
        """
        if not a_inside.is_set():
            a_inside.set()
            b_inside.wait(_BARRIER_TIMEOUT)
        else:
            b_inside.set()
        return real_approvable(db_, producer_)

    def confirm(tag):
        # One TestClient PER THREAD, not the shared fixture. `httpx.Client`
        # — which TestClient subclasses — is documented as not thread-safe.
        # Two threads calling `.post()` on one instance happens to work today
        # under CPython, but that is an implementation detail rather than an
        # API contract, and a test built to detect non-determinism is the last
        # place to rest on one. Each request already gets its own anyio portal
        # (the fixture never enters `with client:`), so the concurrency is
        # real either way — this removes the shared *object*, not the shared
        # event loop. Same app instance, so dependency wiring is identical.
        thread_client = TestClient(client.app)
        results[tag] = thread_client.post(
            "/producers/me/verify-phone/confirm",
            json={"code": CODE},
            headers=auth_header(user),
        ).status_code

    real_approvable = pm._pending_and_approvable

    with patch(PING_TARGET) as ping, patch(APPROVABLE_TARGET, side_effect=barriered):
        ta = threading.Thread(target=confirm, args=("a",))
        tb = threading.Thread(target=confirm, args=("b",))
        ta.start()
        a_inside.wait(_BARRIER_TIMEOUT)  # let A get inside first
        tb.start()
        ta.join(timeout=30)
        tb.join(timeout=30)

    assert not ta.is_alive() and not tb.is_alive(), "a confirm thread hung"

    codes = sorted(results.values())
    assert codes == [200, 400], f"expected one winner and one loser, got {codes}"
    assert ping.call_count == 0, (
        f"the review-ready ping fired {ping.call_count} times — this handler "
        "has had no approvability edge to fire on since MEH-2124 removed the "
        "status flip, so any fire means a transition was re-introduced"
    )

    db.expire_all()
    db.refresh(producer)
    assert producer.status == "pending"
    assert producer.phone_verified is True

    tokens = db.query(PhoneOtpToken).filter_by(producer_id=producer.id).all()
    assert len(tokens) == 1
    assert tokens[0].used is True


def test_a_second_confirm_after_the_first_completes_is_still_idempotent(client, db):
    """Control — the SEQUENTIAL case must keep its existing behaviour.

    This is the case the race test cannot cover and the one real users hit
    (a double-tap on a slow connection). It is caught by the `phone_verified`
    early-return, NOT by the new atomic claim, and it returns 200 with the
    "already verified" message rather than a 400. Passes in both worlds by
    design: a fix that turned this into a 400 would be a user-visible
    regression dressed as a concurrency fix.

    The ping count is 0 rather than 1 since MEH-2124 — see the race test above.
    """
    producer, user = _setup(db)

    with patch(PING_TARGET) as ping:
        first = client.post(
            "/producers/me/verify-phone/confirm",
            json={"code": CODE},
            headers=auth_header(user),
        )
        second = client.post(
            "/producers/me/verify-phone/confirm",
            json={"code": CODE},
            headers=auth_header(user),
        )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["detail"] == "הטלפון כבר מאומת"
    assert ping.call_count == 0


def test_a_wrong_code_still_returns_the_same_400(client, db):
    """Control — the loser of a race and a wrong code are the same response.

    Pins that the fix did not introduce a new status code or Hebrew string for
    the lost-race path, which the card explicitly forbids.
    """
    _, user = _setup(db)

    resp = client.post(
        "/producers/me/verify-phone/confirm",
        json={"code": "000000"},
        headers=auth_header(user),
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "קוד שגוי או פג תוקף"
