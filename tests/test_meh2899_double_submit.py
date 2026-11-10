"""
MEH-2904 (MEH-2899 area 3) — submitting a business for review TWICE.

Row 4 of the MEH-2892 top-20 action-map gaps, score 13: "הגשה כפולה
לבדיקה: אין טסט". The route under test is
`POST /producers/me/submit-for-review`
(`backend/app/routers/producer_me.py:1883`), the only transition out of
`draft`. One successful call flips `producers.status` draft → pending,
stamps `submitted_for_review_at` (where the 3-business-day admin SLA
starts counting), and queues three background tasks:
`notify_admin_new_producer` (admin WhatsApp + email), `score_producer`
(MEH-2602 re-score) and `send_submission_confirmation` (MEH-2112 owner
email).

WHAT IS NEW HERE, AND WHAT IS CONTEXT. Measured break by break (below),
only two assertions in this file guard behaviour
`tests/test_meh2100_draft_submit.py` does not already cover:

  * `submitted_for_review_at` is byte-identical after the refused call
    (the SLA clock does not restart);
  * the 409 carries its Hebrew `detail` rather than some other body.

The three assertions around them — the 409 status, the unmoved
`status`, and the first call having stamped at all — are **duplicate
coverage**, kept because they make the scenario readable, not because
they add a guard. Any break that reds one of them also reds
`test_submit_409_on_every_non_draft_status` or
`test_submit_success_flips_status_and_stamps_tz_aware`. They are not
offered as new coverage.

WHAT THE EXISTING 409 TEST SEES, AND WHAT IT DOES NOT.
`test_meh2100_draft_submit.py:387` fabricates the `pending` state
directly in the DB and asserts the 409, the unmoved status and
`submitted_for_review_at is None`. That third assertion does catch an
UNCONDITIONAL re-stamp on the refused path — measured, break A:

    if producer.status != "draft":
        producer.submitted_for_review_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(...)

→ old file RED (4 parametrisations), this file RED. It does not
discriminate, so it is not evidence for this file. The gap is narrower
than "the stamp is unguarded".

What the old file cannot see is a re-stamp CONDITIONED on a stamp
already being present — the shape "measure the wait from the latest
submission attempt" takes if it is implemented here instead of on
request-review, where it belongs (`docs/DATA.md:136` records the
shipped rule as `resubmitted_at or submitted_for_review_at or
created_at`). From `None` there is nothing to re-stamp. Break A2:

    if producer.status != "draft":
        if producer.submitted_for_review_at is not None:
            producer.submitted_for_review_at = datetime.now(timezone.utc)
            db.commit()
        raise HTTPException(...)

→ old file 24 passed, this file RED. Discriminates.

Nor can it see a duplicated notification on the refused path, since it
patches nothing. Break B2:

    if producer.status != "draft":
        notify_admin_new_producer(producer.name, producer.city)
        raise HTTPException(...)

→ old file 24 passed, this file RED. Discriminates.

WHAT THIS FILE DELIBERATELY DOES NOT PROVE: a duplicate ENQUEUE on the
refused path. Measured — `background_tasks.add_task(...)` inserted
before the `raise` leaves all three tests green, because Starlette
builds the response from the exception handler and discards the tasks
collected on the aborted one, so a task queued there never runs. The
recorders below therefore measure INVOCATION, not enqueue. That is the
right target: an inline call is the shape that can actually reach a
recipient, and a recorder on the name catches both it and a task that
does run. A queued-but-dropped task is out of scope by design.

Every observed count is derived with `len()` from what the patched
callables recorded; no count here is a literal the test chose
(`.claude/rules/testing.md` § "The artifact that asserts coverage").
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.models.models import Producer

from conftest import auth_header, make_submit_ready_producer


def _patch_side_effects(monkeypatch) -> dict[str, list]:
    """Record every call to the three background tasks the route queues.

    Patched at the ROUTER's module namespace, which is the name
    `background_tasks.add_task` actually resolves
    (`producer_me.py:1977/1982/1993`).

    EVERY test in this file takes this, including the one that only
    measures the stamp. Left unpatched, the first (200) call really runs
    them: `notify_admin_new_producer` sends to Meta and through Resend
    whenever `admin_whatsapp_to` / `admin_email` are set
    (`services/auth_notifications.py:579-594`), and `score_producer`
    opens its OWN `SessionLocal`, calls Anthropic, and `UPDATE`s the
    very producer row the stamp test is measuring
    (`services/producer_risk.py:287-305`). Green-because-this-sandbox-
    has-no-keys is a green with two causes, and a second writer inside
    the measurement window is one more.
    """
    calls: dict[str, list] = {
        "notify_admin_new_producer": [],
        "score_producer": [],
        "send_submission_confirmation": [],
    }
    for name in calls:
        monkeypatch.setattr(
            f"app.routers.producer_me.{name}",
            (lambda bucket: lambda *args, **kwargs: bucket.append(args))(calls[name]),
        )
    return calls


def test_the_patch_targets_are_live(client, db, monkeypatch):
    """Names the failure when the recorders are dead, nothing more.

    This is NOT what makes the "exactly once" counts below meaningful —
    `assert after_second == {name: 1 ...}` is; it reds on
    `{0, 0, 0}` by itself, and a misspelled target raises
    `AttributeError` in `monkeypatch.setattr` before any request is
    sent. Measured: no break reds this test while leaving the other two
    green. It is kept only so that a dead recorder fails HERE, with a
    message that says so, instead of surfacing as a confusing count
    mismatch in the duplicate-suppression test.
    """
    calls = _patch_side_effects(monkeypatch)
    _producer, user = make_submit_ready_producer(db)
    db.commit()

    assert client.post(
        "/producers/me/submit-for-review", headers=auth_header(user)
    ).status_code == 200

    fired = {name: len(bucket) for name, bucket in calls.items()}
    assert all(count > 0 for count in fired.values()), (
        f"a successful submit must exercise every patched name, got {fired} — "
        "a zero here means the patch target is wrong and every count in this "
        "module is void"
    )


def test_second_submit_409_and_does_not_restart_the_sla_clock(client, db, monkeypatch):
    """The second call is refused AND leaves the SLA stamp alone.

    The stamp equality at the end is the load-bearing assertion of this
    file: break A2 above reds it and nothing else in the repo.
    """
    _patch_side_effects(monkeypatch)
    producer, user = make_submit_ready_producer(db)
    db.commit()
    producer_id = producer.id

    first = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert first.status_code == 200, first.text

    db.expire_all()
    first_stamp = db.get(Producer, producer_id).submitted_for_review_at
    # Duplicate coverage of test_meh2100_draft_submit.py:351 — read here
    # because the comparison below needs the value, not as a new guard.
    assert first_stamp is not None, "the first submit must stamp the SLA clock"
    between = datetime.now(timezone.utc)
    # Narrow job, stated narrowly: this rules out the degenerate case where
    # the two calls land in the same clock tick and a re-stamp would compare
    # equal. It is not what gives the equality its teeth — break A2 reds
    # that assertion on its own — and no path this test can reach makes it
    # false, since `first_stamp` is written inside the first request
    # (producer_me.py:1945) and `between` is sampled after it returns.
    assert first_stamp < between, "the two calls shared a clock tick"

    second = client.post("/producers/me/submit-for-review", headers=auth_header(user))

    # Duplicate coverage (test_meh2100_draft_submit.py:392).
    assert second.status_code == 409, second.text
    # NEW: the body, not merely the status.
    assert second.json()["detail"] == "אפשר לשלוח לבדיקה רק בית עסק שנמצא בטיוטה"

    db.expire_all()
    after = db.get(Producer, producer_id)
    # Duplicate coverage (test_meh2100_draft_submit.py:394).
    assert after.status == "pending", "the refused call must not move the row"
    # NEW, and the reason this file exists.
    assert after.submitted_for_review_at == first_stamp, (
        "the second submit restarted the 3-business-day admin SLA — the "
        "business silently goes to the back of the review queue"
    )


def test_second_submit_sends_no_duplicate_notification(client, db, monkeypatch):
    """No duplicate admin ping, no duplicate owner email, no re-score.

    Covers an INLINE send on the refused path (break B2). A duplicate
    `add_task` there is out of scope — see the module docstring.
    """
    calls = _patch_side_effects(monkeypatch)
    _producer, user = make_submit_ready_producer(db)
    db.commit()

    first = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert first.status_code == 200, first.text
    after_first = {name: len(bucket) for name, bucket in calls.items()}

    second = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert second.status_code == 409, second.text

    after_second = {name: len(bucket) for name, bucket in calls.items()}
    assert after_second == after_first, (
        "the refused second submit triggered a side effect again: "
        f"{after_first} -> {after_second}"
    )
    assert after_second == {name: 1 for name in calls}, (
        f"each side effect must have fired exactly once in total, got {after_second}"
    )
