"""
MEH-2904 (MEH-2899 area 3) — submitting a business for review TWICE.

Row 4 of the MEH-2892 top-20 action-map gaps, score 13: "הגשה כפולה
לבדיקה: אין טסט". The route under test is
`POST /producers/me/submit-for-review`
(`backend/app/routers/producer_me.py:1883`), the only transition out of
`draft`. One successful call does four things that must not happen twice:

  1. flips `producers.status` draft → pending;
  2. stamps `submitted_for_review_at`, which is where the 3-business-day
     admin SLA starts counting (`israel_today` / `business_days_waiting`);
  3. queues `notify_admin_new_producer` (admin WhatsApp + email);
  4. queues `score_producer` (MEH-2602 re-score) and
     `send_submission_confirmation` (MEH-2112 owner email).

WHAT THE EXISTING 409 TEST DOES AND DOES NOT SEE.
`test_meh2100_draft_submit.py:386` (`test_submit_409_on_every_non_draft_status`)
fabricates the `pending` state directly in the DB and asserts the 409, the
unmoved status and `submitted_for_review_at is None`. Measured, not assumed:
that third assertion does catch an UNCONDITIONAL re-stamp on the refused
path (break A below went red there), so the gap is narrower than "the stamp
is unguarded". What it cannot see, because it starts from `None` and patches
nothing, is:

  * a re-stamp CONDITIONED on a stamp already being present — the shape
    "measure the wait from the latest submission attempt" (cf. MEH-2869)
    takes if it is implemented on this path instead of on request-review.
    From `None` there is nothing to re-stamp, so the old assertion stays
    green while the 3-business-day SLA silently restarts (break A2);
  * any duplicated notification on the refused path (break B2).

Both tests below therefore drive the REAL first call and then the real
second one. Every count is derived with `len()` from what the patched
callables recorded, never asserted as a literal the test itself wrote
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
    (`producer_me.py:1977/1982/1993`). Patching the defining service
    module instead would leave the already-bound router reference intact
    and the recorders would stay empty for a reason that has nothing to
    do with the endpoint — a probe whose null output is also its
    reassuring output.
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
    """Control for the two tests below (`.claude/rules/testing.md`).

    If `_patch_side_effects` patched a name the route does not call, the
    duplicate-suppression test would read three empty buckets after the
    second call and pass for the wrong reason. One successful submit must
    therefore move every bucket off zero; this test fails loudly if it
    does not, which is what makes the "still 1" assertions below mean
    something.
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


def test_second_submit_409_and_does_not_restart_the_sla_clock(client, db):
    """The second call is refused AND leaves the SLA stamp alone.

    The `first_stamp < between` assertion is what gives the equality its
    teeth: if the second call re-stamped with `now()`, the new value
    would be >= `between` > `first_stamp`, so the comparison cannot pass
    by accident on a route that rewrites the column.
    """
    producer, user = make_submit_ready_producer(db)
    db.commit()
    producer_id = producer.id

    first = client.post("/producers/me/submit-for-review", headers=auth_header(user))
    assert first.status_code == 200, first.text

    db.expire_all()
    first_stamp = db.get(Producer, producer_id).submitted_for_review_at
    assert first_stamp is not None, "the first submit must stamp the SLA clock"
    between = datetime.now(timezone.utc)
    assert first_stamp < between, (
        "the stamp must predate this moment, otherwise the equality below "
        "could not tell a re-stamp apart from the original"
    )

    second = client.post("/producers/me/submit-for-review", headers=auth_header(user))

    assert second.status_code == 409, second.text
    assert second.json()["detail"] == "אפשר לשלוח לבדיקה רק בית עסק שנמצא בטיוטה"

    db.expire_all()
    after = db.get(Producer, producer_id)
    assert after.status == "pending", "the refused call must not move the row"
    assert after.submitted_for_review_at == first_stamp, (
        "the second submit restarted the 3-business-day admin SLA — the "
        "business silently goes to the back of the review queue"
    )


def test_second_submit_sends_no_duplicate_notification(client, db, monkeypatch):
    """No duplicate admin ping, no duplicate owner email, no re-score.

    Patching the three NAMES (rather than inspecting the response's
    `BackgroundTasks`) is what makes this reach the shape that can hurt.
    Measured while building this file: a task added with
    `background_tasks.add_task` on a path that then raises is never run —
    Starlette builds the response from the exception handler and the
    collected tasks go with the discarded one. So the duplication that
    actually reaches a recipient is an INLINE call before the raise, and a
    recorder on the name catches that as well as a task that does run.
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
