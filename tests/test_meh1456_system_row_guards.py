"""
Module:   test_meh1456_system_row_guards
Purpose:  Chunk 2b — a seeded (`is_system`) category cannot be renamed or
          deleted through /admin/categories. The emoji path stays open, the
          non-system paths are unchanged, and the MEH-1571 licensing message
          is not swallowed on the rows that still need it.
Touches:  The test DB via `db` (seed_categories inserts the real 18 rows).
          HTTP through the `client` fixture, admin-authenticated.
Does NOT: assert the column's shape or the seed's own marking — that is chunk
          A, in `test_meh1456_category_is_system.py`. Does not touch the
          frontend lock state (chunk 2c).
Related:  backend/app/routers/admin_extra.py::update_category / delete_category
          (CATEGORY_SYSTEM_RENAME_ERROR_HE, CATEGORY_SYSTEM_DELETE_ERROR_HE);
          tests/test_admin_category_rename_guard.py (MEH-1571, the guard this
          one is ordered in front of).
History:  MEH-1456 chunk 2b (creation, 06/09).

Ordering is the subject of two of these cases, not a detail. Every
LICENSE_REQUIRED_CATEGORIES name is also a seeded row, so a licensed system
row reaches two guards and only one of them states the real reason; and a
system row with linked producers would otherwise be refused with a count that
is beside the point. Both assert on the MESSAGE, which is the only thing that
distinguishes the orderings — the status code is 422 either way for the
rename, and 409-vs-422 for the delete.
"""

from conftest import auth_header, make_category, make_producer, make_user

from app.constants import LICENSE_REQUIRED_CATEGORIES
from app.models.models import Category
from seed_data import CATEGORIES, seed_categories

# Derived from the two real tuples, never hardcoded: a constants.py edit that
# licensed every seeded row would otherwise leave the unlicensed case silently
# vacuous instead of failing here.
_SYSTEM_UNLICENSED = [n for n, _ in CATEGORIES if n not in LICENSE_REQUIRED_CATEGORIES]
_SYSTEM_LICENSED = [n for n, _ in CATEGORIES if n in LICENSE_REQUIRED_CATEGORIES]
assert _SYSTEM_UNLICENSED, "no unlicensed seeded row left — case 1 would be vacuous"
assert _SYSTEM_LICENSED, "no licensed seeded row left — the ordering case is vacuous"
SYSTEM_UNLICENSED = _SYSTEM_UNLICENSED[0]
SYSTEM_LICENSED = _SYSTEM_LICENSED[0]

ADMIN_MADE = "קטגוריה שנוצרה באדמין"


def _admin(db):
    return make_user(db, email="sys-row-admin@example.com", role="admin")


def _seeded(db, name: str) -> Category:
    seed_categories(db)
    row = db.query(Category).filter(Category.name == name).first()
    assert row is not None and row.is_system is True, (
        f"{name} is not a system row after seeding — the fixture, not the guard"
    )
    return row


# ── rename ────────────────────────────────────────────────────────────────
def test_renaming_a_system_row_is_rejected(db, client):
    """The guard itself. Pre-fix this returned 200 and the seed row was
    renamed — after which the next `seed_categories` run re-inserts the
    original name and the taxonomy carries both."""
    admin = _admin(db)
    cat = _seeded(db, SYSTEM_UNLICENSED)

    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": "שם חדש לגמרי", "emoji": cat.emoji},
        headers=auth_header(admin),
    )

    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    # Explains WHY (system row) and WHERE the change belongs (a migration).
    assert "מערכת" in detail
    assert "מיגרציה" in detail
    # ADR-014 voice.
    assert "יצרן" not in detail

    db.expire_all()
    assert db.get(Category, cat.id).name == SYSTEM_UNLICENSED, (
        "the system row was renamed anyway"
    )


def test_system_guard_answers_before_the_licence_guard(db, client):
    """A licensed seeded row hits both guards. The system one must answer:
    telling an admin about a licensing requirement when the actual reason is
    row ownership sends her to the wrong fix."""
    admin = _admin(db)
    cat = _seeded(db, SYSTEM_LICENSED)

    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": "שם חדש לגמרי", "emoji": cat.emoji},
        headers=auth_header(admin),
    )

    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert "מערכת" in detail
    assert "רישיון" not in detail, (
        "the MEH-1571 licensing message answered first — ordering regressed"
    )


def test_emoji_only_edit_on_a_system_row_succeeds(db, client):
    """The guard keys on a NAME change, not on the row being system. An emoji
    is the one field an admin legitimately owns on a seeded row."""
    admin = _admin(db)
    cat = _seeded(db, SYSTEM_UNLICENSED)

    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": SYSTEM_UNLICENSED, "emoji": "🧪"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    db.expire_all()
    row = db.get(Category, cat.id)
    assert row.emoji == "🧪"
    assert row.name == SYSTEM_UNLICENSED


# ── delete ────────────────────────────────────────────────────────────────
def test_deleting_a_system_row_with_no_producers_is_rejected(db, client):
    """An empty system category is still the taxonomy's. Pre-fix the MEH-1297
    count was 0 and the row was deleted."""
    admin = _admin(db)
    cat = _seeded(db, SYSTEM_UNLICENSED)

    resp = client.delete(
        f"/admin/categories/{cat.id}", headers=auth_header(admin)
    )

    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert "מערכת" in detail
    assert "מיגרציה" in detail

    db.expire_all()
    assert db.get(Category, cat.id) is not None, "the system row was deleted"


def test_system_delete_guard_answers_before_the_linked_count(db, client):
    """With producers attached the MEH-1297 409 would also refuse — for a
    reason that stops being true the moment the last business moves off the
    category. The refusal must not be contingent on that."""
    admin = _admin(db)
    cat = _seeded(db, SYSTEM_UNLICENSED)
    make_producer(db, name="עסק על קטגוריית מערכת", category=cat)

    resp = client.delete(
        f"/admin/categories/{cat.id}", headers=auth_header(admin)
    )

    assert resp.status_code == 422, (
        f"expected the system refusal, got {resp.status_code}: {resp.text}"
    )
    assert "מערכת" in resp.json()["detail"]


# ── the unchanged paths (pass in both worlds — regression cover) ──────────
def test_admin_created_row_still_renames_and_deletes(db, client):
    """`is_system` defaults to False, so nothing an admin created is touched
    by either guard."""
    admin = _admin(db)
    cat = make_category(db, name=ADMIN_MADE, emoji="🍓")

    renamed = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": "שם חדש ותקין", "emoji": "🍇"},
        headers=auth_header(admin),
    )
    assert renamed.status_code == 200, renamed.text
    db.expire_all()
    assert db.get(Category, cat.id).name == "שם חדש ותקין"

    deleted = client.delete(
        f"/admin/categories/{cat.id}", headers=auth_header(admin)
    )
    assert deleted.status_code == 200, deleted.text
    # expunge, not expire: the row is gone, and `db.get` on a stale identity-map
    # instance raises ObjectDeletedError instead of returning None.
    db.expunge_all()
    assert db.query(Category).filter(Category.id == cat.id).first() is None


def test_licensed_non_system_row_still_gets_the_licence_message(db, client):
    """The MEH-1571 guard must survive being ordered second. A licensed row
    that is NOT seeded (an admin typed the name) reaches only that one."""
    admin = _admin(db)
    cat = make_category(db, name=SYSTEM_LICENSED, emoji="🥩")
    assert cat.is_system is False

    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": "שם חדש לגמרי", "emoji": "🥩"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert "רישיון" in detail, "the MEH-1571 message was swallowed by the new guard"

    db.expire_all()
    assert db.get(Category, cat.id).name == SYSTEM_LICENSED
