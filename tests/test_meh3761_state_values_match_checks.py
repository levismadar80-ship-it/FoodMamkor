"""MEH-3761 — the every-state seed gate lists every value a CHECK allows.

`backend/scripts/check_seed_coverage.py` holds `_STATE_VALUES`, the status
values the seed must cover. That list is typed by hand, so a value added to a
model's CHECK constraint would be missing from it and the gate would stay
green. This test reads each listed column's CHECK constraint from the model
metadata and fails when the constraint allows a value the list does not name
(or the list names one the constraint forbids).

Columns with no CHECK constraint (producers.status, experiences.status,
group_buys.status and the admin queues) cannot be compared here; for those
the list follows docs/STATE_MACHINES.md and the rule-5a reviewer checks it.
"""

import importlib.util
import os
import re

from sqlalchemy import CheckConstraint

from app.database import Base
import app.models  # noqa: F401 — registers every table on Base.metadata

_PATH = os.path.join(
    os.path.dirname(__file__), "..", "backend", "scripts", "check_seed_coverage.py"
)

# A value the CHECK allows but that the every-state seed deliberately does not
# carry as its own surface, with the reason.
NOT_SEEDED = {
    ("producer_reviews", "ai_moderation_status"): {
        "APPROVED": "the main demo seed's reviews already carry it",
    },
    ("producer_reviews", "reply_ai_moderation_status"): {
        "APPROVED": "an approved owner reply looks the same as an unchecked one",
    },
}


def _state_values() -> dict:
    spec = importlib.util.spec_from_file_location("check_seed_coverage", _PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod._STATE_VALUES


def _check_values(table: str, column: str) -> set[str] | None:
    for con in Base.metadata.tables[table].constraints:
        if not isinstance(con, CheckConstraint):
            continue
        m = re.search(rf"\b{column}\s+IN\s*\(([^)]*)\)", str(con.sqltext))
        if m:
            return set(re.findall(r"'([^']*)'", m.group(1)))
    return None


def test_listed_values_equal_each_check_constraint():
    compared = []
    for (table, column), listed in _state_values().items():
        allowed = _check_values(table, column)
        if allowed is None:
            continue
        expected = allowed - set(NOT_SEEDED.get((table, column), {}))
        assert set(listed) == expected, (
            f"{table}.{column}: CHECK allows {sorted(allowed)}, "
            f"_STATE_VALUES lists {sorted(listed)}"
        )
        compared.append((table, column))
    # The comparison must have run: seven listed columns carry a CHECK today.
    assert len(compared) >= 7, compared
