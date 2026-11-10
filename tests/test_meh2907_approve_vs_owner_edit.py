"""
MEH-2907 (MEH-2899 area 5) — the owner edits while the admin approves.

Row 2 of the MEH-2892 top-20 action-map gaps, score 14: «race: בעל העסק
עורך בזמן שאדמין מאשר. אין טסט שמפעיל את שניהם». Both halves of the
pair are here, because they have OPPOSITE answers:

  * NO LOST UPDATE — the owner's PUT, loaded before the approval and
    committed after it, must not revert the approval. This holds, and the
    test pins WHY it holds.
  * NO APPROVAL OF UNSEEN CONTENT — the approval gates must not pass on
    content the owner has already replaced. This does NOT hold. The
    second test is xfail; see its docstring.

WHY THE PAIR IS DELIBERATELY UNSERIALISED, which is what makes this a
test and not a lock fix. `update_my_producer` takes a transaction-scoped
advisory lock (`_lock_producer_updates`, `producer_me.py`) and that
helper's docstring records the choice of an advisory key over
`with_for_update` precisely so it does NOT block «admin approve
(`admin.py`)». The overlap is designed (MEH-2007).

HOW THE OVERLAP IS MADE DETERMINISTIC. Same shape as
`tests/test_review_ready_ping_concurrency.py`: a barrier at one call that
sits between a handler's producer load and its commit, so neither
outcome depends on thread scheduling luck. One `TestClient` per thread —
`httpx.Client`, which `TestClient` subclasses, is documented as not
thread-safe, and a test built to detect a race is the last place to rest
on an implementation detail. Each test asserts the interleaving it
intended actually happened before it asserts anything about the outcome;
without that, a serialised pair would be scored as a pass.
"""

from __future__ import annotations

import threading

from fastapi.testclient import TestClient

import app.routers.admin as admin_mod
import app.routers.producer_me as pm
import pytest
from app.models.models import Producer

from conftest import auth_header, make_submit_ready_producer, make_user

_BARRIER_TIMEOUT = 5.0
_NEW_DESCRIPTION = "תיאור שבעלת העסק עדכנה בזמן האישור"


def _pending_ready(db):
    """A `pending` producer that passes every approval gate.

    `make_submit_ready_producer` satisfies all three gates
    `_assert_approvable` runs — one photo, a category whose
    `requires_license` is False (so the license gate is not what is under
    test), and `phone_verified`.
    """
    producer, owner = make_submit_ready_producer(db, status="pending")
    admin = make_user(db, role="admin")
    db.commit()
    return producer, owner, admin


def test_owner_put_committed_after_approval_does_not_revert_it(
    client, db, monkeypatch
):
    """The owner's in-flight PUT must not undo the admin's approval.

    The owner's handler loads the producer while it is still `pending` and
    commits after the approval has landed, holding a stale `status` in its
    identity map throughout.

    This passes, and the reason is narrower than "SQLAlchemy only writes
    what changed" — measured with two breaks, both applied after the
    handler's setattr loop:

      M1  `producer.status = "pending"`            -> my test PASSES
      M2  `flag_modified(producer, "status")`      -> my test FAILS

    M1 assigns the value the session already holds, and the flush
    compares against the LOADED value, finds no net change, and omits the
    column. So the guarantee rests on that comparison, not on the absence
    of an assignment: re-stating the stale status is harmless, while
    anything that forces the column into the UPDATE — `flag_modified`, a
    full-row write, a `merge()` of a detached copy — writes `pending`
    over the admin's `approved` and pulls a published business off the
    site, after the admin was told it worked.

    M2 is also what makes this test worth having: under it the 63 tests
    in test_meh2100_draft_submit.py, test_review_ready_ping_concurrency.py
    and test_admin_approval_transitions.py all still pass. Sequentially
    the stale value equals the committed one, so nothing else can see it.
    """
    producer, owner, admin = _pending_ready(db)
    producer_id = producer.id

    owner_loaded = threading.Event()
    approve_done = threading.Event()
    order: list[str] = []
    lock = threading.Lock()
    results: dict[str, int] = {}

    real_snapshot = pm._snapshot_sensitive

    def barriered_snapshot(producer_):
        """Runs just after the owner's producer load, before the mutation.

        Delegates to the real implementation — the timing is the point,
        and faking the return value would change what the PUT writes.
        """
        with lock:
            order.append("owner-loaded")
        owner_loaded.set()
        approve_done.wait(_BARRIER_TIMEOUT)
        return real_snapshot(producer_)

    monkeypatch.setattr(pm, "_snapshot_sensitive", barriered_snapshot)

    def owner_put():
        thread_client = TestClient(client.app)
        results["put"] = thread_client.put(
            "/producers/me",
            json={"description": _NEW_DESCRIPTION},
            headers=auth_header(owner),
        ).status_code

    t = threading.Thread(target=owner_put)
    t.start()
    assert owner_loaded.wait(_BARRIER_TIMEOUT), (
        "the owner PUT never reached the barrier, so nothing overlapped"
    )

    approve_client = TestClient(client.app)
    results["approve"] = approve_client.post(
        f"/admin/producers/{producer_id}/approve", headers=auth_header(admin)
    ).status_code
    with lock:
        order.append("approved")
    approve_done.set()

    t.join(timeout=30)
    assert not t.is_alive(), "the owner PUT thread hung"

    # --- control: the approval really landed inside the owner's request ---
    assert order == ["owner-loaded", "approved"], (
        f"the interleaving under test did not happen: {order} — a serialised "
        "pair would pass the assertions below for no good reason"
    )
    assert results == {"approve": 200, "put": 200}, results

    db.expire_all()
    after = db.get(Producer, producer_id)
    assert after.status == "approved", (
        "the owner's late commit reverted the approval — an approved, "
        "published business silently dropped back to the review queue"
    )
    assert after.description == _NEW_DESCRIPTION, (
        "the owner's edit was lost instead"
    )


@pytest.mark.xfail(
    strict=True,
    reason=(
        "MEH-2908: the approval gates read the producer from the admin "
        "session's identity map, loaded before the owner's commit, so a "
        "photo removed inside the window is still what the gate judges. "
        "Fixing it means a re-read under a lock in admin.py, which is the "
        "blast radius MEH-2007 deliberately kept the advisory lock out of — "
        "not a small fix, so it is its own card."
    ),
)
def test_approval_cannot_pass_on_content_the_owner_already_replaced(
    client, db, monkeypatch
):
    """The photo gate must not pass on an image that is already gone.

    Sequence, forced by a barrier inside `_assert_approvable` — i.e.
    after the approve handler has loaded the producer row and before its
    gates run:

        admin   enters approve, loads the producer (1 image), reaches
                _assert_approvable, signals, waits
        owner   PUT /producers/me {"images": []} — runs to completion and
                COMMITS. `ProducerUpdate._validate_images` checks URL
                shape only (`_image_url_list_validator`), never
                non-emptiness, so an empty gallery is an accepted payload
                and the PUT answers 200.
        admin   wakes. `_assert_approvable` reads `producer.images` from
                its OWN session, populated by the load before the owner's
                commit, and sees the stale image. The gate passes.
                status := approved, commit.

    The admin's UPDATE does not put the image back: SQLAlchemy writes
    only the attributes changed in the admin's session, and `images` was
    never assigned there.

    The invariant asserted is MEH-799's, in its own words — "a business
    never goes public without at least one photo". `strict=True` so that
    the day this starts passing, the xfail itself fails and the card gets
    closed instead of the marker rotting.
    """
    producer, owner, admin = _pending_ready(db)
    producer_id = producer.id

    admin_inside = threading.Event()
    owner_done = threading.Event()
    order: list[str] = []
    lock = threading.Lock()
    results: dict[str, int] = {}

    real_gate = admin_mod._assert_approvable

    def barriered_gate(db_, producer_, overrides, admin_id):
        """Forces the overlap, then runs the REAL gate.

        Delegating matters: faking the verdict would make the assertion
        below a statement about this stub rather than about the gate.
        """
        with lock:
            order.append("gate-reached")
        admin_inside.set()
        owner_done.wait(_BARRIER_TIMEOUT)
        return real_gate(db_, producer_, overrides, admin_id)

    monkeypatch.setattr(admin_mod, "_assert_approvable", barriered_gate)

    def approve():
        thread_client = TestClient(client.app)
        results["approve"] = thread_client.post(
            f"/admin/producers/{producer_id}/approve", headers=auth_header(admin)
        ).status_code

    t = threading.Thread(target=approve)
    t.start()
    assert admin_inside.wait(_BARRIER_TIMEOUT), (
        "the approve handler never reached its gates"
    )

    owner_client = TestClient(client.app)
    results["put"] = owner_client.put(
        "/producers/me", json={"images": []}, headers=auth_header(owner)
    ).status_code
    with lock:
        order.append("images-cleared")
    owner_done.set()

    t.join(timeout=30)
    assert not t.is_alive(), "the approve thread hung"

    # --- controls: both must hold or the verdict below means nothing ------
    assert order == ["gate-reached", "images-cleared"], (
        f"the owner's clear did not land inside the admin's open request: {order}"
    )
    assert results["put"] == 200, (
        f"the owner's PUT was rejected ({results['put']}), so the gate was "
        "never asked to judge replaced content and this test proves nothing"
    )
    assert results["approve"] == 200, (
        f"approve returned {results['approve']}, not 200 — the gate did NOT "
        "pass, so there is no unseen-content approval to assert about"
    )

    db.expire_all()
    after = db.get(Producer, producer_id)
    assert after.status == "approved", (
        f"status is {after.status!r}, so nothing was published"
    )

    # --- the invariant ----------------------------------------------------
    assert after.images, (
        "a business is live with an empty gallery: the approval gate "
        "(MEH-799, 'a business never goes public without at least one "
        "photo') passed on an image the owner had already removed"
    )
