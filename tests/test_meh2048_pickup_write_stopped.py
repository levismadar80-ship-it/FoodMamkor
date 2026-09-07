"""MEH-2048 — column J (pickup_points) is parsed for a row warning and no longer
written by the Excel/CSV importer.

Since MEH-2046/2060 every consumer surface derives "offers pickup" from
ProducerLocation rows (kind in pickup/market_stand); the boolean column is read
by nothing on the reader side and admin.py already drops it on write. The
importer was the last writer — a sheet with J="כן" produced a producer that the
admin table tagged "pickup" and that no filter, badge or pin would ever show.

Discrimination (MEH-1619): against the pre-MEH-2048 importer
`test_yes_in_column_j_is_not_written_and_warns` fails twice — the column comes
back True and the warning is absent. `test_no_in_column_j_writes_nothing_and_
stays_quiet` is the control that passes in both worlds.
"""

from seed_data import CATEGORIES

from app.models.models import Category, Producer
from app.services.producer_import import import_rows

KNOWN_CATEGORY = CATEGORIES[0][0]
NAME = "חוות הגליל"
WARNING = "איסוף עצמי מוגדר דרך מיקומים — הוסיפי נקודת איסוף אחרי הייבוא"


def _row(pickup):
    """One 23-cell sheet row; only the columns this test is about are filled."""
    cells = [None] * 23
    cells[0] = NAME
    cells[1] = "שרה כהן"
    cells[2] = "0521234567"
    cells[7] = "חיפה"
    cells[8] = KNOWN_CATEGORY
    cells[9] = pickup  # column J
    cells[13] = "תיאור"
    return cells


def _seed_category(db):
    db.add(Category(name=KNOWN_CATEGORY, emoji="🥩"))
    db.commit()


def _warnings_of(result):
    (row,) = result["rows"]
    return row["warnings"]


def test_yes_in_column_j_is_not_written_and_warns(db):
    _seed_category(db)

    result = import_rows(db, [_row("כן")], dry_run=False)

    assert result["imported"] == 1, result
    producer = db.query(Producer).filter(Producer.name == NAME).one()
    assert producer.pickup_points is False, (
        "column J must not reach the column — pickup is ProducerLocation rows only"
    )
    assert WARNING in _warnings_of(result)


def test_no_in_column_j_writes_nothing_and_stays_quiet(db):
    """Control: an unset J neither writes nor warns, so the warning is J-specific."""
    _seed_category(db)

    result = import_rows(db, [_row("לא")], dry_run=False)

    producer = db.query(Producer).filter(Producer.name == NAME).one()
    assert producer.pickup_points is False
    assert WARNING not in _warnings_of(result)


def test_dry_run_surfaces_the_warning_without_writing(db):
    """The admin dry_run is where the importer reads the warning before committing."""
    _seed_category(db)

    result = import_rows(db, [_row("כן")], dry_run=True)

    assert WARNING in _warnings_of(result)
    assert db.query(Producer).filter(Producer.name == NAME).count() == 0
