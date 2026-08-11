"""MEH-1817 — approval mints the slug a self-registered business never got.

Self-registration (`auth.py`, both branches) constructs `Producer(...)` with no
slug, and `_slugify` ran only on the admin-create / admin-update / import
paths. So a business that signed itself up stayed `slug=NULL` permanently and
its public page fell back to `/producer/{uuid}` — losing the Hebrew URL the
catalog's SEO is built on.

Publish-time canonicalization: the slug is minted when the business becomes
public, not at registration (the name can still change during review, and a
slug built from a name that then changes is worse than none — it is a wrong
URL that needs a redirect).

Every assertion here is about a value, not a call: "a slug was minted" is not
enough, because the interesting failures are minting the WRONG one (a reserved
route, a duplicate) or overwriting one that already existed.
"""

from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Producer, User
from app.routers import admin as admin_module
from app.routers.admin import RESERVED_SLUGS
from tests.conftest import auth_header, make_producer, make_user

IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/x.jpg"


def _admin(db):
    """Idempotent — `_approve` is called twice in the collision test, and
    minting a second admin with the same email violates users_email_key."""
    existing = db.query(User).filter(User.email == "admin_1817@test.com").first()
    return existing or make_user(db, email="admin_1817@test.com", role="admin")


def _approve(client, db, producer):
    return client.post(
        f"/admin/producers/{producer.id}/approve",
        headers=auth_header(_admin(db)),
    )


def _pending(db, **kwargs):
    """A business awaiting approval, image included so the MEH-799 gate passes."""
    kwargs.setdefault("images", [IMAGE])
    kwargs.setdefault("status", "pending")
    return make_producer(db, **kwargs)


# ---------- (a) the mint ----------


def test_approving_a_slugless_producer_mints_one(client, db):
    """The bug. Fails pre-fix with slug still None."""
    producer = _pending(db, name="חוות הדגן")
    assert producer.slug is None

    resp = _approve(client, db, producer)

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.status == "approved"
    assert producer.slug == "חוות-הדגן"


# ---------- (b) the over-reach guard ----------


def test_approving_a_producer_that_already_has_a_slug_leaves_it_alone(client, db):
    """An admin-chosen slug survives approval.

    This is the assertion that separates the fix from an unconditional
    `producer.slug = _slugify(...)`, which would pass test (a) and silently
    rewrite every curated URL on approval — breaking live links.
    """
    producer = _pending(db, name="חוות השדה")
    producer.slug = "hand-picked-slug"
    db.commit()

    assert _approve(client, db, producer).status_code == 200

    db.refresh(producer)
    assert producer.slug == "hand-picked-slug"


# ---------- (c) collisions ----------


def test_two_producers_with_the_same_name_get_distinct_slugs(client, db):
    """Second one is suffixed. `slug` is the public URL, so a collision is not
    a cosmetic problem — it is two businesses claiming one address."""
    first = _pending(db, name="חוות התאומים")
    second = _pending(db, name="חוות התאומים")

    assert _approve(client, db, first).status_code == 200
    assert _approve(client, db, second).status_code == 200

    db.refresh(first)
    db.refresh(second)
    assert first.slug == "חוות-התאומים"
    assert second.slug == "חוות-התאומים-2"
    assert first.slug != second.slug


def test_a_name_matching_a_reserved_route_is_suffixed_not_taken(client, db):
    """A business named after a site route must not capture that route.

    Uses a real member of RESERVED_SLUGS rather than a guessed string, so the
    test cannot pass by asserting against a word that was never reserved.
    """
    reserved = "about" if "about" in RESERVED_SLUGS else sorted(RESERVED_SLUGS)[0]
    producer = _pending(db, name=reserved)

    assert _approve(client, db, producer).status_code == 200

    db.refresh(producer)
    assert producer.slug != reserved
    assert producer.slug not in RESERVED_SLUGS
    assert producer.slug.startswith(reserved)


# ---------- the empty-slugify edge ----------


def test_a_name_that_slugifies_to_nothing_leaves_the_slug_null(client, db):
    """Punctuation-only names must leave NULL, not "".

    `_ensure_unique_slug` returns "" unchanged for an empty base, so without
    the `or None` in the fix the column would hold an empty string — neither a
    slug nor NULL, and it would satisfy the `not producer.slug` guard forever
    after while breaking the id-URL fallback's NULL check.
    """
    producer = _pending(db, name="!!!")

    assert _approve(client, db, producer).status_code == 200

    db.refresh(producer)
    assert producer.slug is None, f"expected NULL, got {producer.slug!r}"


# ---------- the NULL-slug census (report only, no backfill) ----------


def _approved_null_slug_count(db):
    """The census the card asks for. Run this against any environment for the
    figure — it is the query, not a number quoted from somewhere unreachable."""
    return (
        db.query(Producer)
        .filter(Producer.status == "approved", Producer.slug.is_(None))
        .count()
    )


def test_approving_leaves_no_approved_producer_without_a_slug(client, db):
    """The census, pointed at code that can actually move it.

    The first version of this test created a PENDING producer and asserted the
    approved-NULL count was 0 — which it can never not be, since the filter
    requires status="approved". It passed in every world, including one where
    the entire mint is deleted. Zero discriminating power, dressed as a census.
    That was the third vacuous assertion I wrote in this session; the CI
    reviewer caught the first two and the adversarial reviewer caught this one.

    Now it approves a real slug-less producer and asserts the count the census
    would report afterwards. Fails pre-fix at 1 == 0.

    Backfill of pre-existing NULL slugs stays OUT OF SCOPE — this asserts only
    that no NEW approval adds to that population.
    """
    producer = _pending(db, name="חוות ללא סלאג")
    assert producer.slug is None
    before = _approved_null_slug_count(db)

    assert _approve(client, db, producer).status_code == 200

    db.refresh(producer)
    assert producer.status == "approved"
    assert _approved_null_slug_count(db) == before, (
        "approving a slug-less producer must not grow the approved-NULL-slug "
        f"population; it went from {before} to {_approved_null_slug_count(db)}"
    )
    assert producer.slug == "חוות-ללא-סלאג"


# ---------- (e) the collision retry ----------


def test_a_slug_collision_retries_and_still_applies_the_full_approval_state(
    client, db, monkeypatch
):
    """The path the mint newly made reachable, and the one no ordinary test hits.

    `_ensure_unique_slug` is SELECT-then-return with no lock, so two admins
    approving two same-named businesses in one window both see the same
    candidate free. The loser's commit violates `producers.slug` UNIQUE, and
    `_persist_approval` rolls back and retries once.

    A rollback discards the WHOLE transaction — including `status="approved"`
    and the cleared request-changes trail, which were set before the commit.
    So the retry has to re-apply them. This asserts it does, on every column
    approval owns, not just the slug that caused the collision.

    Why it exists (CI reviewer, PR #2785): the retry path used to carry its own
    copy of those three writes. A fourth field added to the handler would have
    been discarded by the rollback and silently missing from the retry — a bug
    visible only under a race. `_apply_approval_state` made it one owner; this
    test is what fails if a future edit splits it again.

    Shown failing by construction: delete `_apply_approval_state(producer)` from
    the retry path and the re-read row still reads `status="pending"`, so the
    status assertion goes red. Note the honest limit — this does NOT fail
    against the pre-refactor duplicated code, because that code was correct at
    the time. It guards the drift, not the refactor.
    """
    winner = _pending(db, name="חוות התאומים", status="approved")
    winner.slug = "חוות-התאומים"
    db.commit()

    loser = _pending(db, name="חוות התאומים")
    loser.requested_changes = "חסרה תמונה"
    loser.changes_requested_at = datetime.utcnow()
    db.commit()
    loser_id = loser.id

    real_ensure = admin_module._ensure_unique_slug
    calls = {"n": 0}

    def racing_ensure(session, base_slug):
        """First call hands back the slug the winner already committed —
        i.e. the candidate looked free when this admin read it."""
        calls["n"] += 1
        if calls["n"] == 1:
            return "חוות-התאומים"
        return real_ensure(session, base_slug)

    monkeypatch.setattr(admin_module, "_ensure_unique_slug", racing_ensure)

    resp = _approve(client, db, loser)

    assert resp.status_code == 200, resp.text
    assert calls["n"] == 2, (
        "the retry must have re-derived the slug; a single call means the "
        "collision never happened and this test proves nothing"
    )

    db.expire_all()
    reread = db.query(Producer).filter(Producer.id == loser_id).first()
    assert reread.status == "approved"
    assert reread.requested_changes is None
    assert reread.changes_requested_at is None
    assert reread.slug == "חוות-התאומים-2"
    assert reread.slug != winner.slug


# ---------- (f) the retry is scoped to the slug constraint ----------


class _FakeDiag:
    def __init__(self, constraint_name):
        self.constraint_name = constraint_name


class _FakeOrig(Exception):
    def __init__(
        self, constraint_name, text="duplicate key value violates unique constraint"
    ):
        super().__init__(text)
        self.diag = _FakeDiag(constraint_name)


def _integrity_error(constraint_name):
    return IntegrityError("INSERT ...", {}, _FakeOrig(constraint_name))


def test_is_slug_collision_sorts_the_three_cases_it_has_to_tell_apart():
    """The classifier, run before anything that depends on it.

    Three inputs with known answers: the slug constraint, a different
    constraint, and a driver that exposes no `diag` at all. If this cannot
    separate them, nothing the retry path reports afterwards is worth reading.
    """
    assert (
        admin_module._is_slug_collision(_integrity_error("producers_slug_key")) is True
    )
    assert admin_module._is_slug_collision(_integrity_error("users_email_key")) is False

    no_diag = IntegrityError("INSERT ...", {}, Exception("some other unique violation"))
    assert admin_module._is_slug_collision(no_diag) is False, (
        "unknown constraint must NOT be treated as a slug collision — unknown "
        "means raise, never retry"
    )

    named_in_text = IntegrityError(
        "INSERT ...",
        {},
        Exception(
            'duplicate key value violates unique constraint "producers_slug_key"'
        ),
    )
    assert admin_module._is_slug_collision(named_in_text) is True


def test_a_non_slug_integrity_error_propagates_instead_of_being_retried(
    client, db, monkeypatch
):
    """The dangerous branch: a violation the retry was never meant to handle.

    `db.commit()` flushes the whole session, so a bare `except IntegrityError`
    catches any constraint on any pending row. Swallowing one and retrying
    would discard it in the rollback, re-apply only the approval columns, and
    return 200 on a partially-applied transaction.

    Shown failing by construction: drop the `_is_slug_collision` guard and this
    request returns 200 with the producer approved — the unrelated violation
    gone with no trace.

    The arming flag is not defensive noise, it is the whole test. The first
    version patched `Session.commit` to raise on call **1**, and call 1 turned
    out to be `make_user` inside the `_admin` fixture — so the exception fired
    in setup, `pytest.raises` caught it, the endpoint never ran, and the test
    passed identically with the guard deleted. It took 1.05 s, which is what
    gave it away. Arming inside `_mint_slug_if_absent` pins the raise to the
    one commit inside `_persist_approval`.
    """
    producer = _pending(db, name="חוות הבדיקה הזרה")
    producer_id = producer.id
    _admin(db)  # created BEFORE the patch — its own commit must not be the one caught

    real_commit = Session.commit
    real_mint = admin_module._mint_slug_if_absent
    armed = {"yes": False}

    def arming_mint(session, prod):
        armed["yes"] = True
        return real_mint(session, prod)

    def commit_raising_unrelated(self, *args, **kwargs):
        if armed["yes"]:
            armed["yes"] = False
            raise _integrity_error("users_email_key")
        return real_commit(self, *args, **kwargs)

    monkeypatch.setattr(admin_module, "_mint_slug_if_absent", arming_mint)
    monkeypatch.setattr(Session, "commit", commit_raising_unrelated)

    with pytest.raises(IntegrityError):
        _approve(client, db, producer)

    monkeypatch.undo()
    db.expire_all()
    reread = db.query(Producer).filter(Producer.id == producer_id).first()
    assert reread.status == "pending", (
        "an unrelated constraint violation must not leave the producer approved"
    )
