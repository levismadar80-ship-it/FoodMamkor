"""MEH-1534 — the Excel import must not invent categories.

``_get_or_create_category`` created a Category row whenever an imported sheet
named one that did not exist, with a hardcoded ``emoji="🌿"``. That silently
widened a curated 18-item taxonomy, violated the Emoji LOCK, and was an
undocumented source of the id drift that broke the seed (MEH-1530). A typo in a
spreadsheet cell must not become a taxonomy entry.

Decision (locked): reject the row with a clear error. Never create.

Also covers the dry_run gap: dry_run used to return BEFORE the category was
looked at (the old ``import_rows`` early-return preceded the lookup), so a bad
sheet passed the preview clean and only surfaced on the real run — by silently
creating the row. The check now runs as a pre-pass, so dry_run reports it too.
"""
from seed_data import CATEGORIES

from app.models.models import Category
from app.services.producer_import import import_rows

KNOWN_CATEGORY = CATEGORIES[0][0]  # "בשר" — tracks the seed list automatically
UNKNOWN_CATEGORY = "קטגוריה שלא קיימת בטקסונומיה"


def _row(name="חוות הגליל", category=KNOWN_CATEGORY):
    """A row shaped as openpyxl delivers it. Column I (index 8) = category."""
    return [
        name, "שרה כהן", "0521234567", None, None, None, None, "חיפה", category,
        None, None, None, None, "תיאור", None, None, None, None, None, None,
        None, None, None,
    ]


def _seed_known_category(db):
    db.add(Category(name=KNOWN_CATEGORY, emoji="🥩"))
    db.commit()


def _errors_of(result, row_index=0):
    return result["rows"][row_index]["errors"]


def _warnings_of(result, row_index=0):
    return result["rows"][row_index]["warnings"]


def test_unknown_category_creates_no_row(db):
    """The core guarantee: zero new categories, ever."""
    _seed_known_category(db)
    before = db.query(Category).count()

    result = import_rows(db, [_row(category=UNKNOWN_CATEGORY)], dry_run=False)

    assert db.query(Category).count() == before, "import invented a category"
    assert db.query(Category).filter(Category.name == UNKNOWN_CATEGORY).first() is None
    assert result["imported"] == 0
    assert result["errors"] == 1


def test_unknown_category_error_names_the_value_and_valid_names(db):
    """The admin must see which cell is wrong and what is allowed."""
    _seed_known_category(db)

    result = import_rows(db, [_row(category=UNKNOWN_CATEGORY)], dry_run=False)

    errors = _errors_of(result)
    assert any(UNKNOWN_CATEGORY in e for e in errors), errors
    assert any(KNOWN_CATEGORY in e for e in errors), errors


def test_dry_run_surfaces_the_same_error(db):
    """That is the entire point of dry_run — it must not pass a sheet the real
    run would reject."""
    _seed_known_category(db)

    dry = import_rows(db, [_row(category=UNKNOWN_CATEGORY)], dry_run=True)

    assert dry["imported"] == 0
    assert dry["errors"] == 1
    assert any(UNKNOWN_CATEGORY in e for e in _errors_of(dry))
    # dry_run must also never write.
    assert db.query(Category).filter(Category.name == UNKNOWN_CATEGORY).first() is None


def test_known_category_still_imports(db):
    """No regression: a sheet using only known names imports and links up."""
    _seed_known_category(db)

    result = import_rows(db, [_row()], dry_run=False)

    assert result["imported"] == 1
    assert result["errors"] == 0
    assert not _errors_of(result)


def test_blank_category_is_a_warning_not_an_error(db):
    """Column I is optional — a blank stays a warning (pre-existing behaviour)."""
    _seed_known_category(db)

    result = import_rows(db, [_row(category=None)], dry_run=False)

    assert result["imported"] == 1
    assert not _errors_of(result)
    # Assert the warning is actually PRESENT, not just that no error fired —
    # otherwise this stays green if parse_row ever stops emitting it.
    assert any("קטגוריה" in w for w in _warnings_of(result)), _warnings_of(result)


def test_partial_success_is_preserved(db):
    """Pre-existing semantics: a bad row fails while good rows still import."""
    _seed_known_category(db)

    result = import_rows(
        db,
        [
            _row(name="עסק תקין"),
            _row(name="עסק שגוי", category=UNKNOWN_CATEGORY),
        ],
        dry_run=False,
    )

    assert result["imported"] == 1
    assert result["errors"] == 1
    assert db.query(Category).filter(Category.name == UNKNOWN_CATEGORY).first() is None
