"""MEH-3911 — category slugs are English.

The slug is public (/producers/<slug>/<region>). Two halves:

1. Revision b3d5f7a9c1e2 renames the three admin-created rows whose slug was a
   letter-by-letter transliteration. Its OLD side must be exactly what
   `slug_for_name` gave those names, or the UPDATE matches nothing on the real
   databases; its NEW side must be English.
2. The admin create takes an English slug typed by the admin; a taken one is a
   400, not a silent `-2`, and a Hebrew one is a 422.
"""

import importlib.util
from pathlib import Path

from app.models.models import Category
from app.services.category_slug import slug_for_name
from tests.conftest import auth_header, make_user

ENGLISH = r"^[a-z0-9]+(-[a-z0-9]+)*$"
NAMES = {"kph": "קפה", "byshvl-lpy-hzmnh": "בישול לפי הזמנה", "avgvt-vkynvchym": "עוגות וקינוחים"}


def _revision():
    versions = Path(__file__).resolve().parents[1] / "backend" / "alembic" / "versions"
    path = next(versions.glob("*_b3d5f7a9c1e2_*.py"))
    spec = importlib.util.spec_from_file_location("rev_b3d5f7a9c1e2", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_revision_old_slugs_are_what_the_admin_rows_were_created_with():
    renames = _revision().RENAMES
    assert len(renames) == 3  # control: the tuple was read
    for old, _new in renames:
        assert slug_for_name(NAMES[old]) == old


def test_revision_new_slugs_are_english():
    import re

    for _old, new in _revision().RENAMES:
        assert re.match(ENGLISH, new), new


def _admin(db):
    return make_user(db, role="admin", email="admin3911@example.com")


def test_admin_create_uses_the_typed_english_slug(client, db):
    resp = client.post(
        "/admin/categories",
        json={"name": "גלידות", "slug": "ice-cream", "requires_license": False},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["slug"] == "ice-cream"


def test_admin_create_refuses_a_taken_slug(client, db):
    db.add(Category(name="גלידה ביתית", slug="ice-cream"))
    db.commit()
    resp = client.post(
        "/admin/categories",
        json={"name": "גלידות", "slug": "ice-cream", "requires_license": False},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 400
    assert db.query(Category).filter_by(name="גלידות").count() == 0


def test_admin_create_refuses_a_hebrew_slug(client, db):
    resp = client.post(
        "/admin/categories",
        json={"name": "גלידות", "slug": "גלידות", "requires_license": False},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 422
