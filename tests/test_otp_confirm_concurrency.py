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
barrier planted between the token claim and the commit.

WHERE THE SEAM LIVES. It used to wrap `_pending_and_approvable` (MEH-2125
removed that call), then the request session's own `commit`. As of MEH-2162 it
instruments **both `execute` and `commit`** on the session handed out by a
`get_db` override scoped to this one test. No production code is involved on
any of those revisions; what keeps changing is which object carries the seam.

THE RENDEZVOUS (MEH-2162 — this replaced a five-second budget that flaked):

    winner   issues the claim UPDATE → the row lock is now HELD
             → signals `a_at_claim` → later, at commit, WAITS for `b_at_claim`
    main     ASSERTS the winner armed, then starts the second thread
    loser    reaches its own claim UPDATE → signals `b_at_claim` FIRST
             → issues it, and blocks on the winner's row lock
    winner   wakes IMMEDIATELY, commits, releases
    loser    re-evaluates the WHERE against the committed row → 0 rows → 400

ROLES ARE DECIDED BY WHO CLAIMS FIRST, never by which session was created
first, and that distinction is load-bearing rather than pedantic. Measured
23/08 while building this: the request that reaches the claim SECOND issues its
own first `commit` — during dependency resolution, before the handler body runs
— well ahead of the other request's claim. An earlier draft of this fix armed
on "this session's first commit" and therefore armed on a commit that had
nothing to do with the token: main started the second thread believing the
first held the row lock, the second claimed unopposed, and the result was
`[200, 200]`. The claim statement is the only event that means what this test
needs it to mean.

Every wait returns on a signal, not on a clock. The three timeouts are safety
nets paid only when something is genuinely broken.

WHAT WAS WRONG BEFORE, because the previous version of this passage claimed
"neither outcome depends on thread scheduling luck" and that was FALSE in one
direction. A single `_BARRIER_TIMEOUT = 5.0` did two different jobs: it bounded
A's hold, and it bounded how long main waited for A to arm. The arm wait
discarded its return value, so when a loaded runner pushed A past five seconds
main started B anyway and the two ran with NOTHING synchronising them.

That matters because the unsynchronised outcome is `[200, 200]` — B finds
`phone_verified` already true and takes the early return at
`producer_me.py:1413` — which is byte-identical to what the pre-fix bug
produces. The suite could not distinguish a real regression from a busy
machine, and it reported the regression. Measured on 22-23/08: red on a commit
whose Python was identical to a green one, then green on re-run, costing two CI
cycles on PR #3052.

The lesson worth keeping is not "raise the timeout". It is that a fixed time
budget standing in for a synchronization point converts a guard into a coin
flip, and prints the same failure either way.
"""

import itertools
import threading
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.database import SessionLocal, get_db
from app.models.models import PhoneOtpToken
from tests.conftest import auth_header, make_category, make_producer, make_user

PING_TARGET = "app.routers.producer_me.notify_admin_producer_review_ready"

IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/otp.jpg"
CODE = "123456"

# MEH-2162: these are SAFETY NETS, not the mechanism. Both are paid only when
# something is genuinely broken; on a healthy run every wait below returns the
# instant the other thread signals, so the test does not get slower on a fast
# machine or less correct on a slow one.
#
# They used to be ONE five-second budget doing both jobs, and that was the
# whole flake — see the module docstring.
_ARM_TIMEOUT = 60.0  # main waits for A to reach its commit
_CLAIM_TIMEOUT = 60.0  # A waits for B to reach the claim statement
_JOIN_TIMEOUT = 60.0  # main waits for both threads to finish


def _is_token_claim(stmt) -> bool:
    """True for the conditional UPDATE that claims the OTP token.

    `Query.update()` routes through `Session.execute`, so the claim reaches the
    wrapper as an `Update` construct against `phone_otp_tokens`. Matching on the
    TABLE (not on a substring of the compiled SQL) keeps this from breaking when
    the WHERE clause is edited.

    A detector that silently matches nothing would put this suite straight back
    where it started — B would never signal, A would wait out `_CLAIM_TIMEOUT`,
    and the run would look like a slow pass or an unexplained failure. So the
    test asserts, after the join, that it actually fired.
    """
    table = getattr(stmt, "table", None)
    return getattr(table, "name", None) == PhoneOtpToken.__tablename__


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

    WHY THE PING ASSERTION IS ZERO. MEH-2124 removed the status flip, which
    made the ping unreachable from here — `was_approvable` and the post-commit
    re-read evaluated the same predicate over an unchanged row, so
    `not X and X` was False for every input. That was MEASURED (the run
    reported "fired 0 times") before the assertion was changed. MEH-2125 then
    removed the snapshot and the call outright, so it is now zero by
    construction rather than by arithmetic.

    The `== 0` form is deliberate over deleting the line: it is what goes red
    if a future change re-introduces the review-ready machinery here, which is
    the regression the removal creates room for.
    """
    producer, user = _setup(db)

    a_at_claim = threading.Event()  # the winner has claimed and holds the row lock
    b_at_claim = threading.Event()  # B is about to issue its claim UPDATE
    results: dict[str, int] = {}
    claim_seq = itertools.count()
    seq_lock = threading.Lock()

    def barriered_get_db():
        """Yield a session instrumented so the two requests MEET at the claim.

        MEH-2162 — what changed and why. The old seam was A's `commit` waiting
        a fixed five seconds for B. That is a *time budget standing in for a
        synchronization point*, and when the budget expired the two requests
        simply ran unsynchronized — producing `[200, 200]`, which is also the
        pre-fix bug's signature. Now each side signals the other:

            A (first session)   claims the token — the row lock is now HELD —
                                and sets `a_at_claim` at that statement, not at
                                its commit; later, AT commit, WAITS for
                                `b_at_claim`
            B (second session)  reaches its claim UPDATE, sets `b_at_claim`,
                                then issues it — and blocks on A's row lock
            A                   wakes IMMEDIATELY (not on a timeout), commits,
                                releases the lock
            B                   re-evaluates the WHERE, matches zero rows, 400

        So the fixed run is now *faster* as well as deterministic: A no longer
        pays a five-second wait on every green run, it pays microseconds.

        The wraps are on the INSTANCE, never on `Session.commit`/`execute`, so
        they are scoped to the requests this override serves and cannot leak
        into the shared `db` fixture or any other test.

        Which session is A and which is B is decided by ARRIVAL ORDER under a
        lock, not by inspecting the request — the main thread starts A and
        waits for it to arm before starting B, so arrival order is the thing
        the test actually controls.
        """
        session = SessionLocal()
        real_commit = session.commit
        real_execute = session.execute
        # Role is decided by WHO CLAIMS FIRST, not by which session was created
        # first, and that distinction is the whole fix. Measured 23/08: the
        # request that reaches the claim second issues its FIRST `commit`
        # (during dependency resolution, before the handler body) well ahead of
        # the other request's claim. Keying the barrier on "this session's first
        # commit" therefore armed on a commit that had nothing to do with the
        # token, main started B believing A held the row lock, and B claimed
        # unopposed. The claim statement is the only event that means what the
        # test needs it to mean.
        role = {"is_claimer": False}
        armed = {"commit": True}

        def barriered_commit(*a, **kw):
            # Only the claim-winner blocks, and only once. A second commit
            # inside the window would otherwise re-enter the barrier and
            # deadlock the run rather than fail it — and a hang is the least
            # informative outcome a concurrency test can produce.
            if role["is_claimer"] and armed["commit"]:
                armed["commit"] = False
                # If the loser never arrives this returns False and the winner
                # commits anyway; the control after the join reports it, so a
                # stall surfaces as a named failure rather than a hang.
                b_at_claim.wait(_CLAIM_TIMEOUT)
            return real_commit(*a, **kw)

        def barriered_execute(stmt, *a, **kw):
            if not _is_token_claim(stmt):
                return real_execute(stmt, *a, **kw)
            with seq_lock:
                first_to_claim = next(claim_seq) == 0
            if first_to_claim:
                role["is_claimer"] = True
                result = real_execute(stmt, *a, **kw)
                # Signal AFTER the statement returns: only then is the row lock
                # actually held, which is the state main is waiting to observe.
                a_at_claim.set()
                return result
            # Signal BEFORE calling through: this call blocks on the winner's
            # row lock, so a signal placed after it would never be sent — which
            # is precisely why the barrier cannot live on the loser's far side.
            b_at_claim.set()
            return real_execute(stmt, *a, **kw)

        session.commit = barriered_commit
        session.execute = barriered_execute
        try:
            yield session
        finally:
            session.close()

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

    client.app.dependency_overrides[get_db] = barriered_get_db
    try:
        with patch(PING_TARGET) as ping:
            ta = threading.Thread(target=confirm, args=("a",))
            tb = threading.Thread(target=confirm, args=("b",))
            ta.start()
            # MEH-2162: ASSERT the arm instead of discarding it. This line used
            # to be a bare `wait(...)` whose False return was ignored, so a slow
            # runner silently started B with nothing synchronised — and an
            # unsynchronised run yields `[200, 200]` through the
            # `phone_verified` early-return (producer_me.py:1413), which is the
            # SAME value the pre-fix bug produces. The suite could not tell a
            # regression from a busy machine, and reported the regression.
            armed = a_at_claim.wait(_ARM_TIMEOUT)
            assert armed, (
                "thread A never reached its claim — the two requests were "
                "never synchronised, so this run cannot distinguish the fix "
                "from the bug. This is NOT evidence the claim is broken."
            )
            tb.start()
            ta.join(timeout=_JOIN_TIMEOUT)
            tb.join(timeout=_JOIN_TIMEOUT)
    finally:
        # Restore even on failure — a leaked override would hand every later
        # test in the session a barriered commit.
        client.app.dependency_overrides.pop(get_db, None)

    assert not ta.is_alive() and not tb.is_alive(), "a confirm thread hung"

    # CONTROL, and it has to come before the outcome assertion: if the claim
    # detector matched nothing, B never signalled, A waited out `_CLAIM_TIMEOUT`
    # and the two requests serialised themselves. That can still produce a
    # green `[200, 400]` by luck — a pass that proves nothing about the
    # rendezvous. Requiring the signal makes the mechanism itself falsifiable.
    assert b_at_claim.is_set(), (
        "thread B never signalled at the claim statement — `_is_token_claim` "
        "matched nothing, so the rendezvous did not happen and every "
        "assertion below is about an accidental ordering, not the guard"
    )

    codes = sorted(results.values())
    assert codes == [200, 400], f"expected one winner and one loser, got {codes}"
    assert ping.call_count == 0, (
        f"the review-ready ping fired {ping.call_count} times — this handler "
        "cannot fire it at all since MEH-2125 removed the call, so any fire "
        "means the review-ready machinery was re-introduced here"
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
