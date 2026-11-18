"""MEH-3255 (grill retro D10) — EXPAND step: `categories.requires_license`.

A new category answers «דורשת רישיון?» when it is created, and the seeded rows
carry the same answer as the name list the readers still use. The contract PR
switches the readers to the column and deletes the list; until then this file
holds the two equal.
"""

from app.constants import LICENSE_REQUIRED_CATEGORIES
from app.models.models import Category
from seed_data import CATEGORIES, seed_categories
from tests.conftest import auth_header, make_user


def _admin(db):
    return make_user(db, role="admin", email="admin3255@example.com")


def test_create_requires_an_explicit_answer(client, db):
    admin = _admin(db)
    resp = client.post(
        "/admin/categories", json={"name": "פטריות"}, headers=auth_header(admin)
    )
    assert resp.status_code == 422
    assert db.query(Category).filter_by(name="פטריות").count() == 0


def test_create_stores_the_answer_and_returns_it(client, db):
    admin = _admin(db)
    yes = client.post(
        "/admin/categories",
        json={"name": "פטריות", "requires_license": True},
        headers=auth_header(admin),
    )
    no = client.post(
        "/admin/categories",
        json={"name": "עציצים", "requires_license": False},
        headers=auth_header(admin),
    )
    assert yes.status_code == 201 and yes.json()["requires_license"] is True
    assert no.status_code == 201 and no.json()["requires_license"] is False
    public = {c["name"]: c for c in client.get("/categories").json()}
    assert public["פטריות"]["requires_license"] is True
    assert public["עציצים"]["requires_license"] is False


def test_rename_cannot_change_the_answer(client, db):
    """PUT keeps CategoryIn: an extra key is ignored, the flag stays. (A
    licensed row refuses a rename outright — the guard below — so the
    unlicensed direction is the one a rename can reach.)"""
    admin = _admin(db)
    cat = Category(name="פטריות", slug="mushrooms", requires_license=False)
    db.add(cat)
    db.commit()
    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": "פטריות יער", "requires_license": True},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200
    db.refresh(cat)
    assert cat.requires_license is False


def test_a_licensed_category_an_admin_created_keeps_its_name(client, db):
    """MEH-3255: the rename guard reads the column, so it also covers a
    licensed category that is on no name list."""
    admin = _admin(db)
    cat = Category(name="פטריות", slug="mushrooms", requires_license=True)
    db.add(cat)
    db.commit()
    resp = client.put(
        f"/admin/categories/{cat.id}",
        json={"name": "פטריות יער"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 422
    db.refresh(cat)
    assert cat.name == "פטריות"


def test_seed_flags_equal_the_name_list(db):
    seed_categories(db)
    rows = {c.name: c.requires_license for c in db.query(Category).all()}
    seeded = {name for name, _ in CATEGORIES}
    assert set(LICENSE_REQUIRED_CATEGORIES) <= seeded
    assert {n for n in seeded if rows[n]} == set(LICENSE_REQUIRED_CATEGORIES)


def test_migration_snapshot_equals_the_name_list():
    import importlib.util
    from pathlib import Path

    path = next(
        Path(__file__)
        .resolve()
        .parents[1]
        .glob("backend/alembic/versions/*_meh3255_category_requires_license.py")
    )
    spec = importlib.util.spec_from_file_location("rev3255", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert set(mod.LICENSED_NAMES) == set(LICENSE_REQUIRED_CATEGORIES)


def test_a_plain_category_row_defaults_to_no_licence(db):
    """Every other writer (tests, fixtures, a future one) relies on the
    column default being False."""
    cat = Category(name="עציצים", slug="pots")
    db.add(cat)
    db.commit()
    db.refresh(cat)
    assert cat.requires_license is False


# --- MEH-3255 contract: the readers use the column, not the name list ---


def test_a_new_licensed_category_requires_a_licence(db):
    """The grill bug: a category an admin creates was silently exempt because
    the rule matched a fixed list of names. «פטריות» is on no list."""
    from app.services.license_validation import categories_require_license

    yes = Category(name="פטריות", slug="mushrooms", requires_license=True)
    no = Category(name="עציצים", slug="pots", requires_license=False)
    db.add_all([yes, no])
    db.commit()
    assert categories_require_license(db, [yes.id]) is True
    assert categories_require_license(db, [no.id]) is False


def test_a_listed_name_with_the_flag_off_requires_nothing(db):
    """The other direction: the name alone no longer decides."""
    from app.services.license_validation import categories_require_license

    cat = Category(
        name=LICENSE_REQUIRED_CATEGORIES[0], slug="bread-x", requires_license=False
    )
    db.add(cat)
    db.commit()
    assert categories_require_license(db, [cat.id]) is False


def test_an_admin_licensed_category_off_the_list_is_not_declared(client, db):
    """The public tier reads the column: a signed declaration does not make a
    business in a licensed category «declared», even when the category's
    name is on no list."""
    from datetime import datetime, timezone

    from tests.conftest import make_category, make_producer

    cat = make_category(db, name="פטריות", requires_license=True)
    producer = make_producer(db, name="משק פטריות", category=cat)
    producer.declared_at = datetime.now(timezone.utc)
    db.commit()
    body = client.get(f"/producers/{producer.id}").json()
    assert body["verification_tier"] is None


def test_an_admin_licensed_category_off_the_list_is_license_pending(db):
    from app.schemas.producer_out import ProducerAdminOut
    from tests.conftest import make_category, make_producer

    cat = make_category(db, name="פטריות", requires_license=True)
    producer = make_producer(db, name="משק פטריות 2", category=cat)
    producer.producer_license_number = None
    db.commit()
    db.refresh(producer)
    assert ProducerAdminOut.model_validate(producer).license_pending is True
