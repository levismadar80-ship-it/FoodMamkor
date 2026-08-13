"""MEH-2017 — the approval gates must run on the row that is actually written.

`approve_producer` runs the MEH-799 photo gate and the MEH-971 license gate
against the object it fetched at the top of the handler, then calls
`_persist_approval`. If that commit hits a `producers.slug` unique violation,
`_persist_approval` rolls back, **re-reads the row from the database**, applies
the approval state and commits again — historically without re-running either
gate.

So a business whose photos disappeared inside the rollback window could be
approved by the retry although the main path would have rejected it with 422.
Narrow (admin-only, and it needs a slug collision AND a third mutation landing
between the two commits) but it is the exact shape the gates exist to block:
`_persist_approval` was the only place in the codebase that could approve a
producer without passing through them.

Touches:  nothing external. Postgres only, via the standard test session.
Does NOT: assert anything about slug minting or the retry policy itself —
          that is `tests/test_meh1817_slug_on_approve.py`, whose collision
          harness this file reuses rather than reinventing.
History:  MEH-2017 (creation). The limitation was recorded as a comment in
          `_persist_approval` by MEH-1817 and deliberately left open there;
          this is the follow-up that comment points at.
"""

from app.models import Producer, User
from app.routers import admin as admin_module
from tests.conftest import auth_header, make_producer, make_user

IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/x.jpg"


def _admin(db):
    existing = db.query(User).filter(User.email == "admin_2017@test.com").first()
    return existing or make_user(db, email="admin_2017@test.com", role="admin")


def _approve(client, db, producer):
    return client.post(
        f"/admin/producers/{producer.id}/approve",
        headers=auth_header(_admin(db)),
    )


def _pending(db, **kwargs):
    kwargs.setdefault("images", [IMAGE])
    kwargs.setdefault("status", "pending")
    return make_producer(db, **kwargs)


def test_retry_path_re_runs_the_photo_gate(client, db, monkeypatch):
    """A producer whose photos vanish inside the rollback window must NOT be
    approved by the retry.

    Shown failing by construction: against the pre-MEH-2017 code this returns
    **200** and the row lands `approved` with an empty `images`, because the
    retry re-reads the row and never re-checks it.

    THE CONTROL, and why it is `stripped["done"]` rather than a slug-call count:

    `stripped["done"]` is set inside the `_is_slug_collision` wrapper, which the
    code reaches ONLY after `db.commit()` raised and `db.rollback()` ran. So it
    being true proves the collision fired and the retry path was entered — which
    is the thing that has to be true for this test to mean anything. Without it,
    a 422 raised by the MAIN path (if the photos were cleared too early) would
    read as a pass while asserting nothing about the retry.

    A first version of this test also asserted `calls["n"] == 2` — that the slug
    was derived a second time. **That was wrong, and it is worth recording why:**
    it holds only against the UNFIXED code. With the gate in place the retry
    aborts at 422 *before* reaching the second `_mint_slug_if_absent`, so the
    count legitimately stays 1. It was an assertion about the old control flow
    wearing the costume of a control, and it would have forced the next reader to
    either weaken it or preserve a code path the fix exists to cut short.
    """
    winner = _pending(db, name="חוות התאומים", status="approved")
    winner.slug = "חוות-התאומים"
    db.commit()

    loser = _pending(db, name="חוות התאומים")
    db.commit()
    loser_id = loser.id

    # --- force the collision (harness lifted from MEH-1817's suite) ----------
    real_ensure = admin_module._ensure_unique_slug
    calls = {"n": 0}

    def racing_ensure(session, base_slug):
        calls["n"] += 1
        if calls["n"] == 1:
            return "חוות-התאומים"
        return real_ensure(session, base_slug)

    monkeypatch.setattr(admin_module, "_ensure_unique_slug", racing_ensure)

    # --- strip the photos INSIDE the rollback window ------------------------
    # `_is_slug_collision` is called after `db.rollback()` and before the
    # re-read (`admin.py`), which is exactly the window a concurrent
    # transaction would occupy. Injecting the end state here is deterministic;
    # racing two real requests is not, and a race that will not reproduce
    # proves nothing either way.
    real_is_collision = admin_module._is_slug_collision
    stripped = {"done": False}

    def stripping_is_collision(exc):
        verdict = real_is_collision(exc)
        if verdict and not stripped["done"]:
            row = db.query(Producer).filter(Producer.id == loser_id).first()
            row.images = []
            db.commit()
            stripped["done"] = True
        return verdict

    monkeypatch.setattr(admin_module, "_is_slug_collision", stripping_is_collision)

    resp = _approve(client, db, loser)

    # --- control first: if this fails, the verdict below is meaningless -----
    assert stripped["done"], (
        "the slug collision never fired, so `_is_slug_collision` was never "
        "reached, the retry path never ran, and the photo-stripping mutation "
        "was never injected — this test asserts nothing about the retry"
    )
    assert calls["n"] >= 1, "the slug was never derived at all — harness broken"

    # --- the actual contract ------------------------------------------------
    assert resp.status_code == 422, (
        "the retry approved a producer with no photos — the photo gate ran "
        "only on the main path. Response: " + resp.text
    )

    db.expire_all()
    reread = db.query(Producer).filter(Producer.id == loser_id).first()
    assert reread.status != "approved", (
        "the producer was left approved with an empty images array"
    )
