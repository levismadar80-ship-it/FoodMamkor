"""MEH-1571 — PUT /admin/categories/{id} rename guards.

Two defects in one handler (`admin_extra.update_category`):

1. **Regulatory bypass.** `LICENSE_REQUIRED_CATEGORIES` (`app/constants.py:26`)
   pins a משרד הבריאות licensing requirement to the category NAME, and
   `license_validation.categories_require_license` resolves ids -> names ->
   intersection at request time. Renaming a licensed row dropped it out of the
   regulatory set silently — no error, no log — and the next producer in that
   category was never asked for a license number.

2. **500 on collision.** The handler assigned the new name with no pre-check
   against `categories_name_key`, so renaming onto a name another row already
   held raised an unhandled `IntegrityError`. There is no `IntegrityError`
   handler anywhere in the app, so the caller got a 500.

The emoji-only path must stay open — neither the licensing lookup nor the
UNIQUE constraint depends on the emoji, and the licensed rows are exactly the
ones an admin has a legitimate reason to re-emoji.

`TestClient` is built with `raise_server_exceptions=False` in the collision
test so a regression surfaces as an assertable 500 rather than an exception
escaping the request cycle — without it, the pre-fix behaviour raises
`IntegrityError` out of `client.put` and the assertion never runs.
"""
from fastapi.testclient import TestClient

from conftest import auth_header, make_category, make_user

from app.constants import LICENSE_REQUIRED_CATEGORIES
from app.main import app
from app.models.models import Category

# A name the regulatory tuple actually contains. Read from the tuple rather
# than hardcoded so a future MEH-ticketed edit to constants.py cannot leave
# this suite asserting against a category that is no longer licensed.
LICENSED_NAME = LICENSE_REQUIRED_CATEGORIES[0]
UNLICENSED_NAME = "קטגוריה בלי רישיון"


def _admin(db):
    return make_user(db, email="cat-guard-admin@example.com", role="admin")


def test_renaming_a_licensed_category_is_rejected(db, client):
    """The bypass itself. Pre-fix this returned 200 and the row was renamed."""
    admin = _admin(db)
    cat = make_category(db, name=LICENSED_NAME, emoji="🥩")

    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": "שם חדש לגמרי", "emoji": "🥩"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    # The message must explain WHY and WHERE, not just refuse.
    assert "רישיון" in detail
    assert "מיגרציה" in detail
    # ADR-014 voice: businesses are "בתי עסק", never "יצרן".
    assert "יצרן" not in detail

    db.expire_all()
    assert db.get(Category, cat.id).name == LICENSED_NAME, (
        "the licensed category was renamed anyway — the regulatory set is "
        "still silently escapable"
    )


def test_emoji_only_edit_on_a_licensed_category_succeeds(db, client):
    """The guard must key on a NAME change, not on the row being licensed."""
    admin = _admin(db)
    cat = make_category(db, name=LICENSED_NAME, emoji="🥩")

    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": LICENSED_NAME, "emoji": "🍖"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    db.expire_all()
    row = db.get(Category, cat.id)
    assert row.emoji == "🍖"
    assert row.name == LICENSED_NAME


def test_renaming_onto_an_existing_name_returns_422_not_500(db):
    """`categories_name_key` collision. Pre-fix this was an unhandled
    IntegrityError -> 500."""
    collision_client = TestClient(app, raise_server_exceptions=False)
    admin = _admin(db)
    occupied = make_category(db, name="קטגוריה תפוסה", emoji="🥬")
    target = make_category(db, name=UNLICENSED_NAME, emoji="🍓")

    resp = collision_client.put(
        f"/admin/categories/{target.id}",
        json={"name": occupied.name, "emoji": "🍓"},
        headers=auth_header(admin),
    )

    assert resp.status_code != 500, "collision still surfaces as a 500"
    assert resp.status_code == 422, resp.text
    assert "כבר קיימת" in resp.json()["detail"]

    db.expire_all()
    assert db.get(Category, target.id).name == UNLICENSED_NAME


def test_ordinary_rename_still_works(db, client):
    """Non-licensed, non-colliding rename — unchanged behaviour."""
    admin = _admin(db)
    cat = make_category(db, name=UNLICENSED_NAME, emoji="🍓")

    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": "שם חדש ותקין", "emoji": "🍇"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
    db.expire_all()
    row = db.get(Category, cat.id)
    assert row.name == "שם חדש ותקין"
    assert row.emoji == "🍇"


def test_resaving_a_row_under_its_own_name_is_not_a_collision(db, client):
    """The uniqueness guard must exclude the row being edited — otherwise the
    UI's save-without-changes path would 422 against the row itself."""
    admin = _admin(db)
    cat = make_category(db, name=UNLICENSED_NAME, emoji="🍓")

    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": UNLICENSED_NAME, "emoji": "🍓"},
        headers=auth_header(admin),
    )

    assert resp.status_code == 200, resp.text
