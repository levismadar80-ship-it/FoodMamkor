"""
Module:   test_meh1889_special_hours
Purpose:  Chunk A guard for producers.special_hours — the column exists, and
          the write validator accepts the canonical date-keyed shape while
          rejecting every malformed one with a 422-able ValueError.
Touches:  Nothing. Pure validator + ORM-attribute assertions, no DB, no HTTP.
Does NOT: assert reader PRECEDENCE (special_hours over order_window) — that is
          chunk B and has no code yet. Do not add precedence cases here; add
          them next to the readers when chunk B lands.
Related:  backend/app/schemas/schemas.py::_special_hours_validator;
          ::_validate_order_day (reused verbatim — see test_reuses_* below);
          backend/alembic/versions/20260904_2130_c4e81b7a2f96_*.py
History:  MEH-1889 chunk A (creation).
"""

import pytest

from app.models.models import Producer
from app.schemas.schemas import (
    _MAX_SPECIAL_DATES,
    _special_hours_validator,
)


# ── The absence control (MEH-1619) ────────────────────────────────────────
# Against origin/staging this raises AttributeError at collection: the column
# does not exist there. It is the one case that cannot pass in the old world,
# which is what makes the rest of this file evidence rather than decoration.
def test_column_exists_on_the_model():
    assert hasattr(Producer, "special_hours")
    assert Producer.special_hours.property.columns[0].nullable is True


def test_none_passes_through():
    assert _special_hours_validator(None) is None


def test_canonical_shape_normalises():
    out = _special_hours_validator(
        {"2026-09-22": {"ranges": [{"open": "09:00", "close": "13:00"}]}}
    )
    assert out == {"2026-09-22": {"ranges": [{"open": "09:00", "close": "13:00"}]}}


def test_empty_ranges_is_the_closed_marker_and_is_allowed():
    # The whole reason _validate_order_day is not called for []: it rejects an
    # empty list ("at least one range"), which is right for a weekly day and
    # wrong for a date. If this regresses, "closed on Yom Kippur" is unsayable.
    out = _special_hours_validator({"2026-09-21": {"ranges": []}})
    assert out == {"2026-09-21": {"ranges": []}}


def test_note_is_sanitised_and_kept():
    out = _special_hours_validator(
        {"2026-09-22": {"ranges": [], "note": "<b>ערב ראש השנה</b>"}}
    )
    assert out["2026-09-22"]["note"] == "ערב ראש השנה"


def test_note_that_sanitises_to_nothing_is_dropped_not_stored_empty():
    out = _special_hours_validator({"2026-09-22": {"ranges": [], "note": "<b></b>"}})
    assert "note" not in out["2026-09-22"]


@pytest.mark.parametrize(
    "bad_key",
    ["22-09-2026", "2026-9-22", "not-a-date", "2026-02-30", "2026-13-01"],
)
def test_bad_date_keys_rejected(bad_key):
    # 2026-02-30 is the discriminating one: it passes the regex and only
    # date.fromisoformat rejects it. A shape-only check would let it through.
    with pytest.raises(ValueError):
        _special_hours_validator({bad_key: {"ranges": []}})


@pytest.mark.parametrize(
    "entry",
    [None, [], "09:00", {}, {"note": "x"}, {"ranges": "09:00"}],
)
def test_entry_must_carry_a_ranges_list(entry):
    with pytest.raises(ValueError):
        _special_hours_validator({"2026-09-22": entry})


def test_top_level_must_be_a_mapping():
    with pytest.raises(ValueError):
        _special_hours_validator([{"2026-09-22": {"ranges": []}}])


def test_date_cap_enforced():
    too_many = {f"2026-09-{d:02d}": {"ranges": []} for d in range(1, 31)} | {
        f"2026-10-{d:02d}": {"ranges": []} for d in range(1, 32)
    }
    assert len(too_many) > _MAX_SPECIAL_DATES
    with pytest.raises(ValueError):
        _special_hours_validator(too_many)


# ── The reuse proof ───────────────────────────────────────────────────────
# These assert that range validation is _validate_order_day and not a second
# implementation. If someone reimplements the rules here, the two fields drift
# on what a "range" means and these go red — which is the point.
@pytest.mark.parametrize(
    "ranges",
    [
        [{"open": "09:00", "close": "09:00"}],  # close == open
        [{"open": "13:00", "close": "09:00"}],  # close < open
        [{"open": "9:00", "close": "13:00"}],  # not HH:MM
        [{"open": "09:00", "close": "25:00"}],  # not a real hour
        [{"open": "09:00"}],  # missing close
        [
            {"open": "09:00", "close": "13:00"},
            {"open": "12:00", "close": "14:00"},
        ],  # overlap
        [
            {"open": "14:00", "close": "15:00"},
            {"open": "09:00", "close": "10:00"},
        ],  # out of order
        [
            {"open": "08:00", "close": "09:00"},
            {"open": "10:00", "close": "11:00"},
            {"open": "12:00", "close": "13:00"},
            {"open": "14:00", "close": "15:00"},
        ],  # > 3 ranges
    ],
)
def test_reuses_order_window_range_rules(ranges):
    with pytest.raises(ValueError):
        _special_hours_validator({"2026-09-22": {"ranges": ranges}})


def test_reuses_order_window_error_wording():
    # The reused messages interpolate the KEY, which here is the date. This
    # pins that the date reaches the message, so the owner is told which date
    # is wrong rather than getting an anonymous failure.
    with pytest.raises(ValueError, match="2026-09-22"):
        _special_hours_validator(
            {"2026-09-22": {"ranges": [{"open": "13:00", "close": "09:00"}]}}
        )


def test_adjacent_ranges_allowed():
    # Control: passes in both worlds. Guards against a fix that over-rejects
    # by treating adjacency (next.open == prev.close) as overlap.
    out = _special_hours_validator(
        {
            "2026-09-22": {
                "ranges": [
                    {"open": "09:00", "close": "13:00"},
                    {"open": "13:00", "close": "17:00"},
                ]
            }
        }
    )
    assert len(out["2026-09-22"]["ranges"]) == 2
