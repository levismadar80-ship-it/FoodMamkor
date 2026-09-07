"""
Module:   test_meh1456_category_is_system
Purpose:  Chunk A guard for categories.is_system — the column exists with the
          declared shape, the boot seed marks exactly its own 18 rows as
          system, and an admin-created row is NOT system.
Touches:  The test DB via `db` (seed_categories inserts rows; _clean_tables
          truncates per test). No HTTP.
Does NOT: assert the rename / delete refusal on system rows — that is chunk
          2b (`update_category`, `delete_category`) and has no code yet.
Related:  backend/seed_data.py::seed_categories; backend/app/models/models.py
          (Category.is_system); backend/app/schemas/schemas.py (CategoryOut);
          backend/alembic/versions/
          20260904_2200_b7d3e5a9c1f4_meh1456_category_is_system.py
History:  MEH-1456 chunk A (creation, night session 04/09); CategoryOut
          parity added after the CI reviewer's ADR-006 finding on PR #3392.
"""

from conftest import make_category

from app.models.models import Category
from app.schemas.schemas import CategoryOut
from seed_data import CATEGORIES, seed_categories


# ── The absence control ───────────────────────────────────────────────────
# Against origin/staging this raises AttributeError: the column does not
# exist there. The one case that cannot pass in the old world.
def test_column_exists_with_declared_shape():
    col = Category.is_system.property.columns[0]
    assert col.nullable is False
    assert col.server_default is not None, (
        "NOT NULL without a server_default breaks the ADD on a populated table"
    )


def test_seed_marks_exactly_its_own_rows_as_system(db):
    seed_categories(db)
    rows = db.query(Category).all()
    assert len(rows) == len(CATEGORIES)
    # Count, not a sum of literals: every seeded row is system, none is not.
    assert sum(1 for r in rows if r.is_system is True) == len(CATEGORIES)
    assert {r.name for r in rows} == {name for name, _ in CATEGORIES}


def test_admin_created_row_is_not_system(db):
    # make_category is the conftest factory the admin path uses in tests — a
    # row that did not come from CATEGORIES must default to False, not None.
    cat = make_category(db, name="קטגוריה שנוצרה באדמין")
    db.refresh(cat)
    assert cat.is_system is False


def test_seed_is_idempotent_and_keeps_system_true(db):
    # Insert-only seed: a second run must not flip or duplicate anything.
    seed_categories(db)
    seed_categories(db)
    rows = db.query(Category).all()
    assert len(rows) == len(CATEGORIES)
    assert all(r.is_system is True for r in rows)


# ── ADR-006 R1/R2 parity ──────────────────────────────────────────────────
# The flag rides the public serializer so the admin UI can gate rename/delete
# (chunk 2b) without a schema PR on that boundary. Asserted through the real
# route so a `from_attributes` regression shows up here, not in a browser.
def test_category_out_serializes_is_system(client, db):
    seed_categories(db)
    make_category(db, name="קטגוריה שנוצרה באדמין")
    assert "is_system" in CategoryOut.model_fields
    body = client.get("/categories").json()
    by_name = {c["name"]: c["is_system"] for c in body}
    assert len(by_name) == len(CATEGORIES) + 1
    assert by_name["קטגוריה שנוצרה באדמין"] is False
    # Count, not a literal: every seeded row reports True through the API.
    assert sum(1 for name, _ in CATEGORIES if by_name[name] is True) == len(CATEGORIES)
