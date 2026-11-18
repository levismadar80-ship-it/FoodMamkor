"""docs/STATE_MACHINES.md lists every status column in the models
(Refs MEH-2871).

The doc is only worth reading if it is complete, and "remember to update the
doc" is not a mechanism. This reads the mapped tables and compares them with
the «Every status column» table: a new status column with no row fails here,
and so does a row whose column is gone.
"""
from __future__ import annotations

import re
from pathlib import Path

import app.models  # noqa: F401 — registers every table on Base.metadata
from app.database import Base

DOC = Path(__file__).resolve().parent.parent / "docs" / "STATE_MACHINES.md"
_STATUS_NAMES = {"status", "state"}


def _is_status_column(name: str) -> bool:
    return name in _STATUS_NAMES or name.endswith("_status")


def status_columns_in_models() -> set[str]:
    return {
        f"{table.name}.{column.name}"
        for table in Base.metadata.tables.values()
        for column in table.columns
        if _is_status_column(column.name)
    }


def status_columns_in_doc() -> set[str]:
    text = DOC.read_text(encoding="utf-8")
    section = text.split("## Every status column", 1)[1].split("\n## ", 1)[0]
    return set(re.findall(r"^\| `([a-z_]+\.[a-z_]+)` \|", section, flags=re.M))


def test_control_both_sides_are_read():
    models, doc = status_columns_in_models(), status_columns_in_doc()
    # Known anchors, so an empty read on either side cannot pass as "in sync".
    assert "producers.status" in models and "rescue_orders.status" in models
    assert "producers.status" in doc and "rescue_orders.status" in doc
    assert len(models) >= 15 and len(doc) >= 15


def test_every_status_column_has_a_row_in_the_doc():
    missing = sorted(status_columns_in_models() - status_columns_in_doc())
    assert missing == [], (
        "Status columns with no row in docs/STATE_MACHINES.md "
        f"«Every status column»: {missing}"
    )


def test_the_doc_names_no_column_that_is_gone():
    stale = sorted(status_columns_in_doc() - status_columns_in_models())
    assert stale == [], f"docs/STATE_MACHINES.md lists columns that no longer exist: {stale}"
