"""
Module:   test_meh2907_approve_vs_owner_edit
Purpose:  The owner edits while the admin approves. Pins that the owner's
          late commit does not revert the approval, and that the approval
          gate judges the row as it stands when the gate runs.
Touches:  producers + producer_locations + products rows via the standard
          test session, plus one short-lived `SessionLocal()` used only to
          read the COMMITTED row from outside the request. Every outbound
          side effect of both handlers is patched (Resend, WhatsApp,
          IndexNow, Cloudinary) — see `_mute_side_effects`.
Does NOT: cover the admin PUT or the import path. It DOES now cover all
          three gates in `_assert_approvable` — photo, category-licence
          and `phone_verified` — which an earlier revision deferred as
          "plausibly affected, not measured". Measured since: one
          `db.refresh(producer)` repairs all three, and a narrowed
          `attribute_names=["images"]` re-opens two of them while the
          photo test stays green. That is why tests 3 and 4 exist.
Related:  backend/app/routers/admin.py::_assert_approvable (the gate),
          ::_persist_approval (already runs the gates twice on its retry
          path, which MEH-2908 names as the precedent for a cheap fix);
          backend/app/routers/producer_me.py::_lock_producer_updates
          (the MEH-2007 decision that leaves this pair unserialised);
          tests/test_review_ready_ping_concurrency.py (the barrier shape).
History:  MEH-2907 (creation); MEH-2908 (the gate finding, carried here
          as an xfail until the `db.refresh` fix landed — test 2 is now
          that fix's regression guard, and tests 3 and 4 pin the other
          two gates it also repairs).

Area 5 of MEH-2899. The action-map report scores this row 14 — «race:
בעל העסק עורך בזמן שאדמין מאשר. אין טסט שמפעיל את שניהם» — the highest
in that batch; the score itself is the report's, quoted not re-derived.

WHY THE PAIR IS UNSERIALISED, which is what makes this a test and not a
lock fix. `update_my_producer` takes a transaction-scoped advisory lock,
and `_lock_producer_updates`' docstring records choosing an advisory key
over `with_for_update` precisely so it does NOT block «admin approve
(`admin.py`)». The overlap is designed (MEH-2007).

THE THREE TESTS, and why the file is split this way:

  1. `test_the_race_really_happens` — the control, NOT xfail. Asserts
     only facts that hold whether or not the gate is fixed: the barrier
     did not time out, and by the time the gate ran an INDEPENDENT
     session already read `images == []`. If this reds, the two tests
     below are measuring nothing and it says so loudly, which an xfail
     test cannot do for itself.
  2. `test_the_gate_judges_the_row_as_it_stands` — xfail(strict), and it
     carries ONE assertion. See its docstring for why a single assertion
     is the whole point.
  3. `test_owner_put_committed_after_approval_does_not_revert_it` — the
     other half of the pair, which passes.

WHAT AN EARLIER REVISION GOT WRONG, recorded because the corrections are
the reason for the shape above. A fresh reviewer measured all three:

  * The `order == [...]` controls were VACUOUS. They recorded one event
    before the barrier wait and one after the other request returned, and
    those are ordered by construction in every scenario — including one
    with no concurrency at all. The return value of the second
    `Event.wait()` was discarded, so a timed-out barrier (a slow runner)
    serialised the pair and every assertion still passed. Both waits are
    now asserted, and the control test reads the committed row instead of
    relying on event ordering.
  * `xfail(strict=True)` COULD NEVER FIRE. The invariant sat below
    `assert results["approve"] == 200`; with the gate fixed, approve
    answers 422, so the test failed at that control and strict xfail
    absorbed it as an expected failure. Measured: a one-line
    `db.refresh(producer)` at the top of `_assert_approvable` still
    reported XFAIL, never XPASS. The marker would have rotted silently
    and swallowed every unrelated breakage with it.
  * The terminal state it asserted — approved with an empty gallery — is
    reachable with NO RACE, so it never discriminated. Test 4 below
    demonstrates that sequentially. The race-specific fact is narrower:
    the gate was asked, and answered from a row that had already changed.

    MEH-2908 has since closed that race (`db.refresh` at the top of
    `_assert_approvable`), so test 2 is now a plain regression guard
    rather than an xfail. It is deliberately NOT rewritten to lean on the
    terminal state: that would make it answerable by a sequential path
    too, and removing the fix would then leave it looking covered.
"""

from __future__ import annotations

import threading

import pytest
from fastapi.testclient import TestClient

import app.cloudinary_utils as cloudinary_utils
import app.routers.admin as admin_mod
import app.routers.producer_me as pm
from app.database import SessionLocal
from app.constants import LICENSE_REQUIRED_CATEGORIES
from app.models.models import Category, Producer, ProducerCategory

from conftest import auth_header, make_submit_ready_producer, make_user

# Both barriered requests run a full handler inside this budget. With the
# side effects muted below, a run is ~2 s; 5 s is the pattern file's value
# (`test_review_ready_ping_concurrency.py`) and the same reasoning applies
# — long enough that a slow runner cannot turn a correct pass into a
# flake. Unlike that file, every wait on it is ASSERTED, so an expiry is a
# loud failure rather than a silently serialised pair.
_BARRIER_TIMEOUT = 5.0
_NEW_DESCRIPTION = "תיאור שבעלת העסק עדכנה בזמן האישור"


def _mute_side_effects(monkeypatch) -> None:
    """Patch every outbound call both handlers make inside the window.

    Not hygiene — load-bearing. The approve handler sends through Resend
    and WhatsApp and schedules an IndexNow ping; the owner PUT calls
    Cloudinary to destroy images dropped from the gallery. In this
    sandbox the keys are unset so each short-circuits, which is why an
    unpatched version ran green in ~2 s. On a machine where they ARE set,
    one slow HTTP call eats the barrier budget. `destroy_removed_images`
    is imported inside the handler (`producer_me.py:850`), so it is
    patched at its defining module, not at the router's namespace.
    """
    monkeypatch.setattr(admin_mod, "_send_notification_email", lambda *a, **k: None)
    monkeypatch.setattr(admin_mod, "notify_producer_approved", lambda *a, **k: None)
    monkeypatch.setattr(admin_mod, "_send_whatsapp", lambda *a, **k: None)
    monkeypatch.setattr(admin_mod.indexnow, "schedule", lambda *a, **k: None)
    monkeypatch.setattr(cloudinary_utils, "destroy_removed_images", lambda *a, **k: None)


def _pending_ready(db):
    """A `pending` producer that passes all three approval gates.

    `make_submit_ready_producer` gives one photo and `phone_verified`, and
    names its category `קטגוריה <random hex>`. The licence gate is a NAME
    allowlist — `categories_require_license`
    (`services/license_validation.py`) intersects the categories' names
    with `LICENSE_REQUIRED_CATEGORIES` (`app/constants.py`) — and a random
    name is not in it, so the licence gate is not what these tests move.
    (An earlier revision called this a `requires_license` column. No such
    column exists; `grep -rn requires_license backend/ tests/` matched
    only that docstring.)
    """
    producer, owner = make_submit_ready_producer(db, status="pending")
    admin = make_user(db, role="admin")
    db.commit()
    return producer, owner, admin


def _committed_images(producer_id) -> list:
    """The gallery as a session outside this request sees it, committed."""
    outside = SessionLocal()
    try:
        row = outside.get(Producer, producer_id)
        return list(row.images or []) if row else []
    finally:
        outside.close()


def _run_the_race(client, db, monkeypatch, *, prepare=None, mutate=None) -> dict:
    """Admin reaches the gate; something changes the row; gate then runs.

    `prepare(db, producer)` runs before the approval starts, for a setup
    the default producer does not have (a licence-required category).
    `mutate(producer_id)` runs INSIDE the window and must COMMIT from its
    own session; the default is the owner clearing her gallery through
    the real PUT. Parameterised so the licence and phone gates are
    measured by the same mechanism rather than a second copy of it.
    """
    _mute_side_effects(monkeypatch)
    producer, owner, admin = _pending_ready(db)
    if prepare is not None:
        prepare(db, producer)
        db.commit()
    producer_id = producer.id

    admin_inside = threading.Event()
    owner_done = threading.Event()
    seen: dict = {"waited": None}
    results: dict = {}
    real_gate = admin_mod._assert_approvable

    def barriered_gate(db_, producer_, overrides, admin_id):
        admin_inside.set()
        # ASSERTED by the caller via seen["waited"] — a discarded wait is
        # what let an earlier revision score a serialised pair as a pass.
        seen["waited"] = owner_done.wait(_BARRIER_TIMEOUT)
        seen["committed_view"] = _committed_images(producer_.id)
        try:
            return real_gate(db_, producer_, overrides, admin_id)
        finally:
            # What the gate ACTUALLY read — captured after it ran, so a
            # re-read performed inside it is visible here. Captured
            # before, this was blind to exactly the fix it is meant to
            # detect: the measurement reported a stale view even with a
            # `db.refresh` in place, and the strict xfail still could not
            # fire. `finally`, because the fixed gate raises 422.
            seen["gate_view"] = list(producer_.images or [])

    monkeypatch.setattr(admin_mod, "_assert_approvable", barriered_gate)

    def approve():
        results["approve"] = TestClient(client.app).post(
            f"/admin/producers/{producer_id}/approve", headers=auth_header(admin)
        ).status_code

    t = threading.Thread(target=approve)
    t.start()
    assert admin_inside.wait(_BARRIER_TIMEOUT), "approve never reached its gates"

    if mutate is None:
        results["put"] = TestClient(client.app).put(
            "/producers/me", json={"images": []}, headers=auth_header(owner)
        ).status_code
    else:
        mutate(producer_id)
        results["put"] = 200
    owner_done.set()

    t.join(timeout=30)
    assert not t.is_alive(), "the approve thread hung"

    db.expire_all()
    after = db.get(Producer, producer_id)
    return {
        "results": results,
        "seen": seen,
        "final_status": after.status,
        "final_images": list(after.images or []),
        "producer_id": producer_id,
    }


@pytest.mark.serial
def test_the_race_really_happens(client, db, monkeypatch):
    """Control. Only facts that hold whether or not the gate is fixed.

    This is NOT xfail, deliberately: it is the one test that can say out
    loud "the scenario did not happen", which the xfail test below cannot
    do for itself.
    """
    run = _run_the_race(client, db, monkeypatch)

    assert run["seen"]["waited"] is True, (
        "the gate's wait timed out, so the two requests serialised and "
        "nothing below measures concurrency"
    )
    assert run["results"].get("put") == 200, (
        f"the owner's PUT did not succeed: {run['results']} — "
        "ProducerUpdate validates image-URL shape only, never "
        "non-emptiness, so an empty gallery should be accepted"
    )
    assert run["seen"]["committed_view"] == [], (
        "the owner's clear was not committed by the time the gate ran: "
        f"{run['seen']['committed_view']}"
    )
    # Both worlds: today the gate passes (200), fixed it refuses (422).
    assert run["results"].get("approve") in (200, 422), (
        f"approve answered {run['results'].get('approve')}, which is neither "
        "the gate passing nor the gate refusing — something else broke"
    )


@pytest.mark.serial
def test_the_gate_judges_the_row_as_it_stands(client, db, monkeypatch):
    """ONE assertion, and that is the point.

    THIS IS THE REGRESSION GUARD FOR MEH-2908. It carried
    `xfail(strict=True)` until the fix landed — `db.refresh(producer)` at
    the top of `_assert_approvable` (`admin.py`). Remove that line and
    this test goes red, which is the whole reason it is phrased as the
    gate's own view rather than as the terminal state.

    One assertion, deliberately, and that stays load-bearing now the
    marker is gone. While it was an xfail, any assertion above the
    invariant — a status code, a control — turned the fixed world into a
    failure at that line, which strict xfail absorbs as expected, so the
    marker could never fire. (Measured: it reported XFAIL, not XPASS,
    against a simulated fix.) The mechanism therefore lives in
    `test_the_race_really_happens`, and this test must stay answerable
    only by what the gate read.

    The marker did fire when the real fix landed — `[XPASS(strict)]` —
    which is how the card closed instead of the marker rotting.
    """
    run = _run_the_race(client, db, monkeypatch)

    # The two controls that `xfail(strict=True)` used to stand in for.
    # Measured by a reviewer: with the owner's PUT forced to 401 — or on a
    # slow runner where the 5s barrier expires — BOTH sides of the
    # assertion below equal the original photo and it passes without any
    # race having happened. While the marker was there that vacuous pass
    # became XPASS(strict) and failed loudly; removing it took the alarm
    # away, so the controls move in. They were previously left out because
    # strict xfail absorbed every assertion above the invariant; that
    # mechanism is gone, so they are free.
    assert run["seen"]["waited"] is True, (
        "the gate's wait timed out, so the two requests serialised and the "
        "assertion below is about a run in which nothing raced"
    )
    assert run["seen"]["committed_view"] == [], (
        "the gallery was not cleared inside the window "
        f"({run['seen']['committed_view']}), so the gate had nothing stale "
        "to judge and the assertion below passes either way"
    )

    assert run["seen"]["gate_view"] == run["seen"]["committed_view"], (
        "the approval gate judged content that was already replaced: it read "
        f"{run['seen']['gate_view']} while the committed row held "
        f"{run['seen']['committed_view']}"
    )


def _commit_from_outside(producer_id, **columns):
    """Change the committed row from a session of its own, inside the window.

    The gallery case uses the owner's real PUT; the licence number and
    `phone_verified` have no owner route that can reach them mid-approval,
    so these two write directly. The point under test is the GATE's view
    of a row that changed, not how it changed.
    """
    outside = SessionLocal()
    try:
        row = outside.get(Producer, producer_id)
        for key, value in columns.items():
            setattr(row, key, value)
        outside.commit()
    finally:
        outside.close()


@pytest.mark.serial
def test_the_licence_gate_judges_the_row_as_it_stands(client, db, monkeypatch):
    """The second of the three gates, and it was not pinned before.

    MEH-2908's fix is `db.refresh(producer)`, which reloads the whole row
    — so it repairs all three gates in `_assert_approvable`, not just the
    photo one. Only the photo gate had a test, and a reviewer measured
    what that costs: `db.refresh(producer, attribute_names=["images"])`
    is the obvious save-a-round-trip edit, and under it a business with a
    licence-required category is approved with its licence number
    cleared inside the window while the whole suite stays green.

    So this pins the licence gate (MEH-971) by the same mechanism.
    """
    def prepare(db_, producer):
        producer.producer_license_number = "12-34567"
        for link in db_.query(ProducerCategory).filter(
            ProducerCategory.producer_id == producer.id
        ):
            db_.get(Category, link.category_id).name = LICENSE_REQUIRED_CATEGORIES[0]

    run = _run_the_race(
        client,
        db,
        monkeypatch,
        prepare=prepare,
        mutate=lambda pid: _commit_from_outside(pid, producer_license_number=None),
    )

    assert run["seen"]["waited"] is True, "the gate's wait timed out"
    assert run["results"].get("approve") == 422, (
        "the licence gate passed on a licence number that was already "
        f"cleared: approve answered {run['results'].get('approve')}"
    )
    assert run["final_status"] == "pending", (
        f"the business went live as {run['final_status']!r} with no licence "
        "number, in a category that requires one"
    )


@pytest.mark.serial
def test_the_phone_gate_judges_the_row_as_it_stands(client, db, monkeypatch):
    """The third gate (MEH-2121), pinned for the same reason as the second.

    An unverified WhatsApp number means the only CTA on the published
    page may go nowhere — which is the argument MEH-2121 makes for having
    the gate at all.
    """
    run = _run_the_race(
        client,
        db,
        monkeypatch,
        mutate=lambda pid: _commit_from_outside(pid, phone_verified=False),
    )

    assert run["seen"]["waited"] is True, "the gate's wait timed out"
    assert run["results"].get("approve") == 422, (
        "the phone gate passed on a verification that was already revoked: "
        f"approve answered {run['results'].get('approve')}"
    )
    assert run["final_status"] == "pending", (
        f"the business went live as {run['final_status']!r} with an "
        "unverified WhatsApp number"
    )


@pytest.mark.serial
def test_owner_put_committed_after_approval_does_not_revert_it(
    client, db, monkeypatch
):
    """The owner's in-flight PUT must not undo the admin's approval.

    The owner's handler loads the producer while it is still `pending`
    and commits after the approval has landed, holding a stale `status`
    throughout.

    WHY IT HOLDS, stated precisely, because an earlier revision had the
    mechanism wrong. SQLAlchemy's `_collect_update_commands` intersects
    the mapped columns with `state.committed_state`: a column NEVER
    ASSIGNED in a session is absent from that dict and is excluded before
    any value comparison runs. That — the absence of an assignment — is
    what protects this path, since `status` is not in
    `_PRODUCER_WRITABLE_FIELDS` and no owner route writes it. The
    equality check that follows is a second line of defence, and it is
    what break M1 below exercises.

    Measured, both breaks after the handler's setattr loop:

      M1  `producer.status = "pending"`           -> PASSES
      M2  `flag_modified(producer, "status")`     -> FAILS

    M1 re-states the loaded value, so the equality check drops the
    column. M2 forces it into the UPDATE and `pending` is written over
    the admin's `approved`, pulling a published business off the site
    after the admin was told it worked. Under M2 the 63 tests in
    test_meh2100_draft_submit.py, test_review_ready_ping_concurrency.py
    and test_admin_approval_transitions.py all still pass, because
    sequentially the stale value equals the committed one.

    M2 is a discrimination check, not a prediction: `flag_modified` is
    not a line anyone would plausibly add here. The realistic vectors for
    the same effect are a `merge()` of a detached copy or a full-row
    write, and those are what this test is really standing in front of.
    """
    _mute_side_effects(monkeypatch)
    producer, owner, admin = _pending_ready(db)
    producer_id = producer.id

    owner_loaded = threading.Event()
    approve_done = threading.Event()
    waited: dict = {}
    results: dict = {}
    real_snapshot = pm._snapshot_sensitive

    def barriered_snapshot(producer_):
        """Runs just after the owner's load, before the mutation."""
        owner_loaded.set()
        waited["ok"] = approve_done.wait(_BARRIER_TIMEOUT)
        return real_snapshot(producer_)

    monkeypatch.setattr(pm, "_snapshot_sensitive", barriered_snapshot)

    def owner_put():
        results["put"] = TestClient(client.app).put(
            "/producers/me",
            json={"description": _NEW_DESCRIPTION},
            headers=auth_header(owner),
        ).status_code

    t = threading.Thread(target=owner_put)
    t.start()
    assert owner_loaded.wait(_BARRIER_TIMEOUT), "the owner PUT never reached the barrier"

    results["approve"] = TestClient(client.app).post(
        f"/admin/producers/{producer_id}/approve", headers=auth_header(admin)
    ).status_code
    approve_done.set()

    t.join(timeout=30)
    assert not t.is_alive(), "the owner PUT thread hung"

    # --- control: the PUT really was still open when the approval landed --
    assert waited.get("ok") is True, (
        "the owner PUT's wait timed out, so it committed before the approval "
        "and this test measured nothing about the race"
    )
    assert results == {"approve": 200, "put": 200}, results

    db.expire_all()
    after = db.get(Producer, producer_id)
    assert after.status == "approved", (
        "the owner's late commit reverted the approval — an approved, "
        "published business silently dropped back to the review queue"
    )
    assert after.description == _NEW_DESCRIPTION, "the owner's edit was lost instead"


def test_an_approved_business_can_empty_its_gallery_with_no_race(client, db, monkeypatch):
    """The sequential companion, and why the xfail above is phrased as it is.

    Measured: an already-approved business PUTs `{"images": []}`, gets
    200, and ends `approved` with an empty gallery — no concurrency
    involved. So "published with no photo" does NOT discriminate the
    race, which is why the xfail above asserts the gate's own view
    instead of the terminal state.

    This is not obviously a defect: `admin.py` states the MEH-799 gate
    "lives at the moment of approval", and the gallery has a real owner
    editor. It is recorded on MEH-2911 for Sapir to rule on, and asserted
    here so the current behaviour is pinned either way — if it is ever
    gated, this test reds and names the decision.
    """
    _mute_side_effects(monkeypatch)
    producer, owner = make_submit_ready_producer(db, status="approved")
    db.commit()
    producer_id = producer.id
    assert producer.images, "setup: the business starts with a photo"

    resp = client.put("/producers/me", json={"images": []}, headers=auth_header(owner))

    assert resp.status_code == 200, resp.text
    db.expire_all()
    after = db.get(Producer, producer_id)
    assert after.status == "approved"
    assert after.images == [], (
        "an approved business can no longer empty its gallery — if that is "
        "deliberate, MEH-2911 shipped and this test records the change"
    )
