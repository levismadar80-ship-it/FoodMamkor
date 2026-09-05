"""
Module:   test_data_ownership
Purpose:  Fitness function for the data-ownership registry — a field whose
          owner write path was closed must not reappear in
          `_PRODUCER_WRITABLE_FIELDS` without its editor shipping alongside.
Does NOT: test behaviour of the endpoint (that is
          tests/test_meh1856_closed_write_paths.py and its per-field
          siblings), nor police admin/import/seed writes, which stay open.
Related:  backend/app/data_ownership.py · docs/DATA_OWNERSHIP.md ·
          backend/app/routers/producer_me.py
History:  MEH-2145 (creation, MEH-1938 batch B6).

The whitelist is read through `tests/whitelist_source.py` — one parser for
every test that asks what the owner PUT path may write.
"""

from app.data_ownership import DEPRECATED_OWNER_WRITE_FIELDS
from app.models import Producer
from tests.whitelist_source import read_producer_writable_fields

# A field that IS still owner-writable. Without this, every assertion below
# passes against a parse that returned an empty set — a green with two causes
# (testing.md). It is the control, not a subject.
STILL_WRITABLE = "short_description"


def test_the_parse_found_the_real_set():
    """Control, and it runs FIRST on purpose.

    If the parse cannot see the whitelist, every absence assertion below is
    vacuously true — and vacuously true is exactly the reassuring answer.
    """
    whitelist = read_producer_writable_fields()
    assert STILL_WRITABLE in whitelist, (
        f"parsed a set of {len(whitelist)} entries that lacks {STILL_WRITABLE!r} — "
        f"wrong set, so every assertion in this file is vacuous"
    )


def test_no_deprecated_field_is_owner_writable():
    """The fitness function itself: the two sets must not intersect."""
    whitelist = read_producer_writable_fields()
    reopened = sorted(DEPRECATED_OWNER_WRITE_FIELDS & whitelist)
    assert reopened == [], (
        f"these fields were closed to the owner and are writable again: {reopened}. "
        f"Re-adding one is allowed — but its editor ships in the SAME PR, and the "
        f"row in docs/DATA_OWNERSHIP.md moves with it."
    )


def test_the_registry_has_the_expected_size():
    """Numeric form: exactly 12, not 'at least 12'.

    A set that silently SHRINKS would make the intersection test pass for the
    wrong reason — the guard would be green because it stopped checking, which
    is the failure this whole file is aimed at. Bump this deliberately when a
    disposition adds a field.
    """
    assert len(DEPRECATED_OWNER_WRITE_FIELDS) == 12, sorted(
        DEPRECATED_OWNER_WRITE_FIELDS
    )


def test_every_deprecated_field_still_has_its_column():
    """REMOVE-WRITE, not CONTRACT.

    The columns stay: admin, the XLSX import and the seeds still write them,
    and historical values are still served. Dropping one is a schema change
    with its own ticket and its own Alembic revision — never a side effect of
    closing an owner write path.
    """
    missing = sorted(
        f for f in DEPRECATED_OWNER_WRITE_FIELDS if not hasattr(Producer, f)
    )
    assert missing == [], (
        f"column(s) dropped — out of scope for a write-path closure: {missing}"
    )
