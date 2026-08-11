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

from app.models import Producer, User
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
