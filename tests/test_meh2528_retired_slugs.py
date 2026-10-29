"""MEH-2528 — a deleted or renamed business's URL never passes to another one.

Deleting a business is a hard delete, so its UNIQUE `producers.slug` slot was
free the moment the row went, and `_ensure_unique_slug` only looked at live
rows: the next business with the same name got the same `/p/<slug>`, and every
link to the deleted business (WhatsApp, Instagram, search results) led to it.
An admin changing a slug left the old one free the same way.

Every case below asserts the slug the NEXT business receives, because that is
the harm — "a tombstone row exists" alone would pass with a tombstone nobody
reads.
"""

from app.models import Producer, RetiredSlug, User
from app.routers.admin import _ensure_unique_slug
from tests.conftest import auth_header, make_producer, make_user

SLUG = "מאפיית-הגליל"


def _admin(db):
    """Idempotent — several cases make two admin calls."""
    existing = db.query(User).filter(User.email == "admin-2528@example.com").first()
    return existing or make_user(db, email="admin-2528@example.com", role="admin")


def _business(db, slug=SLUG, status="approved"):
    producer = make_producer(db, name="מאפיית הגליל", status=status)
    producer.slug = slug
    db.commit()
    return producer


def _owner_of(db, producer):
    owner = make_user(db, role="producer", email=f"o-{producer.id}@example.com")
    owner.producer_id = producer.id
    owner.is_producer = True
    db.commit()
    return owner


def _put_slug(client, db, producer, slug):
    return client.put(
        f"/admin/producers/{producer.id}",
        json={"slug": slug},
        headers=auth_header(_admin(db)),
    )


# ---------- deletion ----------


def test_admin_delete_keeps_the_slug_from_the_next_business(client, db):
    """The bug. Pre-fix the next mint returns the deleted business's slug."""
    producer = _business(db)
    resp = client.delete(
        f"/admin/producers/{producer.id}", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text

    assert _ensure_unique_slug(db, SLUG) == f"{SLUG}-2"
    row = db.get(RetiredSlug, SLUG)
    assert row.reason == "deleted" and row.producer_id is None


def test_owner_account_delete_keeps_the_slug_from_the_next_business(client, db):
    producer = _business(db)
    owner = _owner_of(db, producer)
    assert client.delete("/auth/me", headers=auth_header(owner)).status_code == 200

    assert _ensure_unique_slug(db, SLUG) == f"{SLUG}-2"


def test_suspended_business_slug_is_retired_on_delete(client, db):
    """`inactive` = suspended after being live; its links are out there."""
    producer = _business(db, status="inactive")
    resp = client.delete(
        f"/admin/producers/{producer.id}", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text

    assert _ensure_unique_slug(db, SLUG) == f"{SLUG}-2"


def test_draft_slug_is_not_retired_on_delete(client, db):
    """A draft was never public: re-creating it must get its clean URL back."""
    producer = _business(db, status="draft")
    resp = client.delete(
        f"/admin/producers/{producer.id}", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text

    assert db.get(RetiredSlug, SLUG) is None
    assert _ensure_unique_slug(db, SLUG) == SLUG


def test_admin_typed_retired_slug_is_suffixed_on_update(client, db):
    """An explicit slug goes through the same check as a minted one."""
    producer = _business(db)
    admin = _admin(db)
    client.delete(f"/admin/producers/{producer.id}", headers=auth_header(admin))

    taker = make_producer(db, name="עסק אחר")
    resp = client.put(
        f"/admin/producers/{taker.id}", json={"slug": SLUG}, headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["slug"] == f"{SLUG}-2"


# ---------- rename ----------


def test_renamed_slug_is_kept_from_another_business(client, db):
    producer = _business(db)
    resp = _put_slug(client, db, producer, "מאפייה-חדשה")
    assert resp.status_code == 200, resp.text
    assert resp.json()["slug"] == "מאפייה-חדשה"

    other = make_producer(db, name="עסק אחר")
    assert _ensure_unique_slug(db, SLUG, exclude_id=other.id) == f"{SLUG}-2"
    row = db.get(RetiredSlug, SLUG)
    assert row.reason == "renamed" and row.producer_id == producer.id


def test_business_can_take_back_its_own_retired_slug(client, db):
    producer = _business(db)
    _put_slug(client, db, producer, "מאפייה-חדשה")

    resp = _put_slug(client, db, producer, SLUG)
    assert resp.status_code == 200, resp.text
    assert resp.json()["slug"] == SLUG
    # The tombstone it left is released; the slug it just gave up is retired.
    assert db.get(RetiredSlug, SLUG) is None
    assert db.get(RetiredSlug, "מאפייה-חדשה").producer_id == producer.id


def test_unchanged_slug_in_payload_retires_nothing(client, db):
    producer = _business(db)
    resp = _put_slug(client, db, producer, SLUG)
    assert resp.status_code == 200, resp.text
    assert db.query(RetiredSlug).count() == 0


def test_deleting_a_renamed_business_keeps_its_old_slug_reserved(client, db):
    """ON DELETE SET NULL turns the rename tombstone into a deleted one."""
    producer = _business(db)
    _put_slug(client, db, producer, "מאפייה-חדשה")
    pid = producer.id
    client.delete(f"/admin/producers/{pid}", headers=auth_header(_admin(db)))
    db.expire_all()

    assert db.get(Producer, pid) is None
    assert db.get(RetiredSlug, SLUG).producer_id is None
    assert _ensure_unique_slug(db, SLUG) == f"{SLUG}-2"
    assert _ensure_unique_slug(db, "מאפייה-חדשה") == "מאפייה-חדשה-2"


def test_a_deleted_tombstone_is_not_exempt_for_any_business(client, db):
    """The NULL-owner branch: a deleted business's tombstone has no owner, so
    no business — passing its own id as `exclude_id` — can match it."""
    producer = _business(db)
    resp = client.delete(
        f"/admin/producers/{producer.id}", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text

    other = make_producer(db, name="עסק אחר")
    assert _ensure_unique_slug(db, SLUG, exclude_id=other.id) == f"{SLUG}-2"


# ---------- MEH-2534: the public lookup says "gone", not "not found" ----------


def test_by_slug_answers_410_for_a_deleted_business(client, db):
    """Pre-fix a deleted business's URL answered the same 404 as a typo."""
    producer = _business(db)
    resp = client.delete(
        f"/admin/producers/{producer.id}", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text

    resp = client.get(f"/producers/by-slug/{SLUG}")
    assert resp.status_code == 410, resp.text


def test_by_slug_answers_404_for_a_slug_that_never_existed(client, db):
    assert client.get("/producers/by-slug/לא-היה-כזה").status_code == 404


def test_by_slug_answers_404_for_a_renamed_slug_whose_business_lives(client, db):
    """A rename moved the business; it is not gone (a redirect is separate)."""
    producer = _business(db)
    assert _put_slug(client, db, producer, "מאפייה-חדשה").status_code == 200

    assert client.get(f"/producers/by-slug/{SLUG}").status_code == 404
    assert client.get("/producers/by-slug/מאפייה-חדשה").status_code == 200
