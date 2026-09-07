"""MEH-2140 (MEH-1938 batch B1) — the XLSX importer dual-writes a primary location.

`import_rows` was the last producer-creating path that could write
`Producer.lat/lng` and leave `producer_locations` empty. Registration closed
that in MEH-1939; the two admin paths in MEH-2059 (PR #2949). The epic had
left this one on the grounds that "admin+import are covered by the backfill",
and that backfill (MEH-2056) was canceled on 14/08 after its entry-condition
query measured 0 rows — so the coverage was never late, it did not exist.

What each class here is FOR, because a count of tests is not coverage:

* `TestImportCreatesTheRow`  — the change itself. Every case fails on HEAD~.
* `TestNoCoordinatesNoRow`   — the helper's stated CONDITION, not an edge
                               case. Passes on HEAD~ too (there was no row
                               either way) and is named as non-discriminating
                               rather than counted as coverage of this diff.
* `TestReimportIsIdempotent` — the AC's third case. The discriminating half is
                               `test_reimport_after_the_dual_write_lands`,
                               which imports twice through the NEW code; the
                               name-skip is asserted separately so a future
                               change from skip to upsert reds this file
                               instead of silently making it vacuous.
* `TestBranchRowIsNotAPickup`— the branch row must not flip `offers_pickup`.
                               One of its two reds on HEAD~ for the wrong
                               reason (no row to unpack); see the class
                               docstring, which says so rather than counting
                               it.
"""

from seed_data import CATEGORIES

from app.models.models import Category, Producer, ProducerLocation
from app.services.producer_import import import_rows

KNOWN_CATEGORY = CATEGORIES[0][0]

LAT, LNG = 32.7940, 34.9896  # Haifa, matching the city cell below


def _row(
    name="חוות הגליל",
    city="חיפה",
    lat=LAT,
    lng=LNG,
    pickup="לא",
    slug=None,
):
    """A row shaped as openpyxl delivers it.

    EVERY slot this helper occupies, so a future author adding a column can see
    what is already taken. Indices are the ones `parse_row` reads
    (producer_import.py:167-197):

        0  = A  name              1  = B  contact_name
        2  = C  phone             7  = H  city
        8  = I  category          9  = J  pickup_points
        13 = N  description       16 = Q  slug
        17 = R  lat               18 = S  lng

    The remaining 13 of the 23 cells stay None. The list is written out in full
    rather than summarised because the earlier version of this docstring named
    SEVEN slots while the body set TEN — a docstring that reads as an inventory
    and is not one. Counted with a regex over the body rather than by eye, since
    miscounting here is the exact defect being fixed. Raised by the CI reviewer
    on PR #3030.
    """
    cells = [None] * 23
    cells[0] = name
    cells[1] = "שרה כהן"
    cells[2] = "0521234567"
    cells[7] = city
    cells[8] = KNOWN_CATEGORY
    cells[9] = pickup
    cells[13] = "תיאור"
    cells[16] = slug
    cells[17] = lat
    cells[18] = lng
    return cells


def _seed_category(db):
    db.add(Category(name=KNOWN_CATEGORY, emoji="🥩"))
    db.commit()


def _locations_of(db, name):
    producer = db.query(Producer).filter(Producer.name == name).one()
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == producer.id)
        .all()
    )


class TestImportCreatesTheRow:
    def test_a_row_with_coordinates_writes_one_primary_branch_row(self, db):
        _seed_category(db)

        result = import_rows(db, [_row()], dry_run=False)

        assert result["imported"] == 1, result
        rows = _locations_of(db, "חוות הגליל")
        assert len(rows) == 1, f"expected exactly one location row, got {len(rows)}"
        (loc,) = rows
        assert loc.kind == "branch"
        assert loc.is_primary is True

    def test_the_row_mirrors_the_imported_cells(self, db):
        """A mirror that does not carry the values is not a mirror.

        Asserted field by field rather than as "a row exists", so a helper that
        wrote a row of NULLs would fail here.
        """
        _seed_category(db)

        import_rows(db, [_row(city="חיפה")], dry_run=False)

        (loc,) = _locations_of(db, "חוות הגליל")
        assert loc.city == "חיפה"
        assert loc.lat == LAT
        assert loc.lng == LNG
        assert loc.location_precision == "exact"
        # The sheet has no address column (the mapping in this module's
        # docstring runs A..W with none), so this stays None. Stated as an
        # assertion rather than left implicit, because a future column-W-style
        # addition that started populating it should surface here.
        assert loc.address is None

    def test_the_producer_columns_are_untouched(self, db):
        """Expand, not replacement — `Producer.city/lat/lng` keep their values."""
        _seed_category(db)

        import_rows(db, [_row()], dry_run=False)

        producer = db.query(Producer).filter(Producer.name == "חוות הגליל").one()
        assert producer.city == "חיפה"
        assert producer.lat == LAT
        assert producer.lng == LNG

    def test_each_imported_row_gets_its_own_location(self, db):
        """Two businesses in one sheet → two rows, each primary for its owner.

        Guards the shape where the call is hoisted out of the loop and only the
        last (or first) row of a batch gets a location.
        """
        _seed_category(db)

        result = import_rows(
            db,
            [
                _row(name="עסק ראשון", slug="esek-rishon"),
                _row(name="עסק שני", city="תל אביב", slug="esek-sheni"),
            ],
            dry_run=False,
        )

        assert result["imported"] == 2, result
        first = _locations_of(db, "עסק ראשון")
        second = _locations_of(db, "עסק שני")
        assert len(first) == 1 and len(second) == 1
        assert first[0].city == "חיפה"
        assert second[0].city == "תל אביב"
        assert first[0].is_primary is True and second[0].is_primary is True


class TestNoCoordinatesNoRow:
    """NON-DISCRIMINATING: these pass on HEAD~ as well, where no row existed
    on any path. They guard over-reach — a helper that stopped declining."""

    def test_no_coordinates_creates_no_location(self, db):
        _seed_category(db)

        result = import_rows(db, [_row(lat=None, lng=None)], dry_run=False)

        assert result["imported"] == 1, "the producer itself must still import"
        assert _locations_of(db, "חוות הגליל") == []

    def test_half_a_coordinate_pair_creates_no_location(self, db):
        """lat without lng is not a point. The helper's guard is `or`, not `and`."""
        _seed_category(db)

        import_rows(db, [_row(lng=None)], dry_run=False)

        assert _locations_of(db, "חוות הגליל") == []

    def test_dry_run_writes_nothing_at_all(self, db):
        _seed_category(db)

        result = import_rows(db, [_row()], dry_run=True)

        assert result["imported"] == 1
        assert db.query(Producer).filter(Producer.name == "חוות הגליל").first() is None
        assert db.query(ProducerLocation).count() == 0


class TestReimportIsIdempotent:
    def test_reimport_after_the_dual_write_lands(self, db):
        """The AC's third case, run end-to-end through the new code.

        Both imports go through the changed path; the second must not add a
        second location row. On HEAD~ the first import produces 0 rows, so this
        fails there on the `== 1` — it discriminates.
        """
        _seed_category(db)

        import_rows(db, [_row()], dry_run=False)
        assert len(_locations_of(db, "חוות הגליל")) == 1

        second = import_rows(db, [_row()], dry_run=False)

        assert second["imported"] == 0
        assert second["skipped"] == 1
        assert len(_locations_of(db, "חוות הגליל")) == 1, "re-import duplicated the row"

    def test_the_mechanism_is_the_name_skip_not_an_upsert(self, db):
        """Pin WHY idempotency holds, so the reason cannot change silently.

        `import_rows` skips a duplicate name (producer_import.py:272-279) rather
        than updating it, which is why the create helper is correct here and
        `upsert_primary_branch_location` is not. If that ever becomes an upsert,
        this assertion reds and the location path must be revisited with it.
        """
        _seed_category(db)

        import_rows(db, [_row(city="חיפה")], dry_run=False)
        second = import_rows(db, [_row(city="באר שבע")], dry_run=False)

        assert second["skipped"] == 1
        assert any("כבר קיים" in w for w in second["rows"][0]["warnings"]), second[
            "rows"
        ][0]["warnings"]
        producer = db.query(Producer).filter(Producer.name == "חוות הגליל").one()
        assert producer.city == "חיפה", "the skip is what keeps the second run inert"
        (loc,) = _locations_of(db, "חוות הגליל")
        assert loc.city == "חיפה"

    def test_the_same_name_twice_in_ONE_sheet_yields_one_of_each(self, db):
        """Adversarial case: the dedup query and the flush share a session.

        Whether row 2 sees row 1 is a property of the SESSION (autoflush), not
        of any line in `import_rows` — so it is measured here rather than
        reasoned about. If autoflush were ever disabled, row 2 would create a
        second producer AND a second location, and this is the only test that
        would say so.
        """
        _seed_category(db)

        result = import_rows(
            db, [_row(name="כפילה"), _row(name="כפילה")], dry_run=False
        )

        assert result["imported"] == 1
        assert result["skipped"] == 1
        assert db.query(Producer).filter(Producer.name == "כפילה").count() == 1
        assert len(_locations_of(db, "כפילה")) == 1

    def test_a_second_distinct_business_still_imports(self, db):
        """The skip is per-name, not per-run: a fresh name in a re-imported
        sheet must still get its producer AND its location."""
        _seed_category(db)

        import_rows(db, [_row(name="עסק ראשון", slug="esek-rishon")], dry_run=False)
        result = import_rows(
            db,
            [
                _row(name="עסק ראשון", slug="esek-rishon"),
                _row(name="עסק שלישי", slug="esek-shlishi"),
            ],
            dry_run=False,
        )

        assert result["imported"] == 1 and result["skipped"] == 1
        assert len(_locations_of(db, "עסק ראשון")) == 1
        assert len(_locations_of(db, "עסק שלישי")) == 1


class TestBranchRowIsNotAPickup:
    """Guards over-reach: the new row must not flip `offers_pickup`.

    `test_the_new_row_is_never_a_pickup_kind` DOES go red on HEAD~ — but only
    because there is no row there to unpack, not because it told a branch row
    from a pickup one. Named rather than counted: its red is about existence,
    and only its green is about kind. `test_column_j_no_longer_reaches_the_legacy_boolean`
    is MEH-2048's guard on this file: red against the pre-2048 importer.

    Kept because the failure they guard is silent and legally-shaped: a branch
    row that counted as a pickup point would advertise collection at an address
    where nobody collects. `offers_pickup` keys on
    `kind in ('pickup','market_stand')` (producer_queries.py:202-205).
    """

    def test_the_new_row_is_never_a_pickup_kind(self, db):
        _seed_category(db)

        import_rows(db, [_row(pickup="כן")], dry_run=False)

        (loc,) = _locations_of(db, "חוות הגליל")
        assert loc.kind == "branch"
        assert loc.kind not in ("pickup", "market_stand")

    def test_column_j_no_longer_reaches_the_legacy_boolean(self, db):
        """MEH-2060 kept this write deliberately; MEH-2048 (05/09) stopped it.

        This assertion used to read `is True` and its docstring said: "Stopping
        it is MEH-2048. If that lands, this assertion is the one that should be
        changed on purpose rather than discovered broken." It landed; this is the
        on-purpose change. Column J now yields only a warning
        (`tests/test_meh2048_pickup_write_stopped.py` covers the warning text and
        the dry-run path).
        """
        _seed_category(db)

        import_rows(db, [_row(pickup="כן")], dry_run=False)

        producer = db.query(Producer).filter(Producer.name == "חוות הגליל").one()
        assert producer.pickup_points is False
