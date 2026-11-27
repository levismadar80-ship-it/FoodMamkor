"""MEH-3929 — docs/DB_SCHEMA.md is the database map, made from the models.

One section per table on `Base.metadata` (every model under backend/app/models):
each column with its Postgres type, NULL, default, key (PK / FK target and its
ON DELETE), unique, and the privacy category from docs/privacy/columns.tsv;
then the table's CHECK constraints (status values live there), multi-column
UNIQUE constraints and indexes.

Why: the hand-written .ai/diagrams/db-schema.md and the DDL in docs/DATA.md
drift (e.g. a paid_at column the diagram never got). A session that needs the
schema read three sources and trusted the stale one. This file cannot drift:
the test below fails when a column, type, constraint or index changes and the
doc was not regenerated in the same PR.

Regenerate:  UPDATE_DB_SCHEMA_DOC=1 pytest tests/test_db_schema_doc.py
Source-text by nature (it documents the code, testing.md MEH-3531). The live
database can still differ from the models only through a migration that was
not applied; `alembic check` in CI holds that side.
"""

from __future__ import annotations

import os
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

import app.models  # noqa: F401 — registers every table on Base.metadata
from app.database import Base

REPO = Path(__file__).resolve().parents[1]
DOC = REPO / "docs" / "DB_SCHEMA.md"
LEDGER = REPO / "docs" / "privacy" / "columns.tsv"
BEGIN = "<!-- BEGIN GENERATED: tests/test_db_schema_doc.py -->"
END = "<!-- END GENERATED -->"
DIALECT = postgresql.dialect()

HEADER = f"""# מהמקור — DB schema (generated)

> **Generated from the SQLAlchemy models — do not edit by hand.** Source:
> `backend/app/models/` via `Base.metadata`; privacy column from
> `docs/privacy/columns.tsv`. Regenerate:
> `UPDATE_DB_SCHEMA_DOC=1 pytest tests/test_db_schema_doc.py` (MEH-3929).
> `tests/test_db_schema_doc.py` fails when this file and the models differ.
>
> This is the one home for "what columns, types and constraints exist". The
> relationship picture is `.ai/diagrams/db-schema.md` and the prose (why a
> column exists, which PR) is `docs/DATA.md` «DB Schema»; where either
> disagrees with this file, this file is right.

{BEGIN}
"""


def _md(text: str) -> str:
    return " ".join(str(text).split()).replace("|", "\\|")


def _privacy() -> dict[str, str]:
    out = {}
    for line in LEDGER.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            parts = line.split("\t")
            if len(parts) >= 2:
                out[parts[0]] = parts[1]
    return out


def _type(col: sa.Column) -> str:
    try:
        return col.type.compile(dialect=DIALECT)
    except Exception:  # noqa: BLE001 — a type with no Postgres rendering is still documented
        return type(col.type).__name__


def _default(col: sa.Column) -> str:
    parts = []
    if col.server_default is not None:
        arg = getattr(col.server_default, "arg", col.server_default)
        text = getattr(arg, "text", arg)
        parts.append(f"server: `{_md(text)}`")
    if col.default is not None:
        arg = col.default.arg
        if callable(arg):
            name = getattr(arg, "__name__", type(arg).__name__)
            parts.append(f"app: `{name}()`")
        elif isinstance(arg, sa.sql.ClauseElement):
            parts.append(f"app: `{_md(arg.compile(dialect=DIALECT))}`")
        else:
            parts.append(f"app: `{_md(repr(arg))}`")
    return "<br>".join(parts)


def _key(col: sa.Column) -> str:
    parts = []
    if col.primary_key:
        parts.append("PK")
    for fk in sorted(col.foreign_keys, key=lambda f: f.target_fullname):
        on_delete = f" ON DELETE {fk.ondelete}" if fk.ondelete else ""
        parts.append(f"FK → `{fk.target_fullname}`{on_delete}")
    if col.unique:
        parts.append("UNIQUE")
    return "<br>".join(parts)


def _table(t: sa.Table, privacy: dict[str, str]) -> list[str]:
    out = [f"### `{t.name}`", ""]
    if t.comment:
        out += [_md(t.comment), ""]
    out += ["| column | type | null | default | key | privacy |", "|---|---|---|---|---|---|"]
    for c in t.columns:
        null = "yes" if c.nullable else "NOT NULL"
        out.append(
            f"| `{c.name}` | `{_md(_type(c))}` | {null} | {_default(c)} | {_key(c)} | "
            f"{privacy.get(f'{t.name}.{c.name}', '— missing —')} |"
        )
    checks = sorted(
        (con for con in t.constraints if isinstance(con, sa.CheckConstraint)),
        key=lambda con: (str(con.name or ""), str(con.sqltext)),
    )
    uniques = sorted(
        (
            con
            for con in t.constraints
            if isinstance(con, sa.UniqueConstraint) and len(con.columns) > 1
        ),
        key=lambda con: str(con.name or ""),
    )
    indexes = sorted(t.indexes, key=lambda i: str(i.name or ""))
    if checks:
        out += ["", "**CHECK**", ""]
        for con in checks:
            name = f"`{con.name}`: " if isinstance(con.name, str) else ""
            out.append(f"- {name}`{_md(con.sqltext)}`")
    if uniques:
        out += ["", "**UNIQUE**", ""]
        for con in uniques:
            cols = ", ".join(c.name for c in con.columns)
            name = f"`{con.name}`: " if isinstance(con.name, str) else ""
            out.append(f"- {name}({cols})")
    if indexes:
        out += ["", "**Indexes**", ""]
        for ix in indexes:
            cols = ", ".join(
                c.name if isinstance(c, sa.Column) else _md(str(c)) for c in ix.expressions
            )
            flags = " UNIQUE" if ix.unique else ""
            where = ix.dialect_options["postgresql"].get("where")
            where_s = f" WHERE `{_md(where)}`" if where is not None else ""
            out.append(f"- `{ix.name}`{flags} ({cols}){where_s}")
    return out + [""]


def build() -> str:
    privacy = _privacy()
    tables = sorted(Base.metadata.tables.values(), key=lambda t: t.name)
    ncols = sum(len(t.columns) for t in tables)
    lines = [
        f"{len(tables)} tables, {ncols} columns.",
        "",
        "| table | columns | FKs out |",
        "|---|---|---|",
    ]
    for t in tables:
        targets = sorted({fk.column.table.name for fk in t.foreign_keys})
        lines.append(f"| `{t.name}` | {len(t.columns)} | {', '.join(targets) or '—'} |")
    lines.append("")
    for t in tables:
        lines += _table(t, privacy)
    return "\n".join(lines).rstrip() + "\n"


def _render() -> str:
    return f"{HEADER}\n{build()}{END}\n"


def test_db_schema_doc_is_current():
    want = _render()
    if os.environ.get("UPDATE_DB_SCHEMA_DOC"):
        DOC.write_text(want, encoding="utf-8")
    have = DOC.read_text(encoding="utf-8") if DOC.exists() else ""
    assert have == want, (
        "docs/DB_SCHEMA.md is out of date with backend/app/models. "
        "Run: UPDATE_DB_SCHEMA_DOC=1 pytest tests/test_db_schema_doc.py"
    )


def test_doc_covers_every_model_column():
    # Derived, not stated: every column on the metadata appears as a row.
    text = DOC.read_text(encoding="utf-8")
    for t in Base.metadata.tables.values():
        section = text.split(f"### `{t.name}`\n", 1)
        assert len(section) == 2, f"table {t.name} has no section in docs/DB_SCHEMA.md"
        body = section[1].split("\n### ", 1)[0]
        for c in t.columns:
            assert f"| `{c.name}` |" in body, f"{t.name}.{c.name} missing from docs/DB_SCHEMA.md"


def test_a_new_column_turns_the_doc_red():
    # Discrimination: a column added to the metadata changes the render.
    before = build()
    t = next(iter(sorted(Base.metadata.tables.values(), key=lambda t: t.name)))
    col = sa.Column("meh3929_probe_col", sa.Integer)
    t.append_column(col)
    try:
        after = build()
    finally:
        t._columns.remove(col)
    assert "meh3929_probe_col" in after and after != before
    assert build() == before
