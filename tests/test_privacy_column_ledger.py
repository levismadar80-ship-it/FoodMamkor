"""MEH-3643 — every new database column says what kind of data it holds.

A column added to a model must have a row in docs/privacy/columns.tsv naming
one of the privacy page's data categories (DATA_ITEMS in
frontend/app/[locale]/privacy/page.js), or `not-personal`, with a reason.
The columns that existed on 21/11/2026 are grandfathered in
docs/privacy/column-baseline.txt, which only shrinks.

Why: the privacy page lists what the site keeps (Amendment 13 disclosure duty),
and nothing tied that list to the schema. A new phone, address or free-text
field could ship with the page silent — the same shape as the logo that joined
a tool without its description changing (21/11). This is "privacy as code"
(Fides-style annotation of every field), held at the point the column is added.
"""
from __future__ import annotations

import re
from pathlib import Path

import app.models  # noqa: F401 — registers every table on Base.metadata
from app.database import Base

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "docs/privacy/columns.tsv"
BASELINE = ROOT / "docs/privacy/column-baseline.txt"
PRIVACY_PAGE = ROOT / "frontend/app/[locale]/privacy/page.js"
NOT_PERSONAL = "not-personal"
# The baseline only shrinks. Lower this when you classify columns out of it;
# raising it is how a new column would be smuggled in as "pre-existing".
BASELINE_CEILING = 0


def _lines(path: Path) -> list[str]:
    return [l for l in path.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]


def model_columns() -> set[str]:
    return {f"{t.name}.{c.name}" for t in Base.metadata.tables.values() for c in t.columns}


def privacy_categories() -> set[str]:
    # Source text on purpose: the page is a Next.js file nothing in pytest runs,
    # and the list is a literal array (MEH-3531 allows reading it as text).
    m = re.search(r"const DATA_ITEMS = \[([^\]]*)\]", PRIVACY_PAGE.read_text(encoding="utf-8"))
    assert m, f"{PRIVACY_PAGE}: DATA_ITEMS not found — the ledger has no categories to check against"
    return set(re.findall(r'"([a-z_]+)"', m.group(1)))


def ledger_problems(columns: set[str], baseline: list[str], ledger: list[str], categories: set[str]) -> list[str]:
    problems: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    for line in ledger:
        parts = line.split("\t")
        if len(parts) != 3 or not parts[2].strip():
            problems.append(f"ledger row needs <table.column>\\t<category>\\t<reason>: {line!r}")
            continue
        col, cat, _ = parts
        if cat != NOT_PERSONAL and cat not in categories:
            problems.append(f"{col}: category {cat!r} is not on the privacy page ({sorted(categories)}) nor {NOT_PERSONAL}")
        if col in rows:
            problems.append(f"{col}: two ledger rows")
        rows[col] = (cat, parts[2])
    base = set(baseline)
    for col in sorted(columns - base - set(rows)):
        problems.append(
            f"{col}: new column with no row in docs/privacy/columns.tsv — add "
            f"'{col}\\t<category or {NOT_PERSONAL}>\\t<what it holds / why not personal>'"
        )
    for col in sorted(base - columns):
        problems.append(f"{col}: in column-baseline.txt but no longer in the models — delete the line")
    for col in sorted(set(rows) - columns):
        problems.append(f"{col}: ledger row for a column that is not in the models")
    for col in sorted(set(rows) & base):
        problems.append(f"{col}: both in the baseline and the ledger — remove it from the baseline")
    return problems


CATS = {"identity", "location"}


def test_a_new_column_without_a_row_fails():
    got = ledger_problems({"users.phone", "users.id"}, ["users.id"], [], CATS)
    assert len(got) == 1 and got[0].startswith("users.phone: new column")


def test_a_classified_new_column_passes():
    assert ledger_problems({"users.phone", "users.id"}, ["users.id"], ["users.phone\tidentity\tcontact phone"], CATS) == []


def test_not_personal_needs_a_reason():
    got = ledger_problems({"x.logo_url"}, [], ["x.logo_url\tnot-personal\t"], CATS)
    assert len(got) == 2  # the malformed row, then the column it failed to cover


def test_a_category_the_privacy_page_does_not_list_fails():
    got = ledger_problems({"x.pin"}, [], ["x.pin\tbiometrics\tfingerprint"], CATS)
    assert got == [f"x.pin: category 'biometrics' is not on the privacy page ({sorted(CATS)}) nor not-personal"]


def test_the_baseline_only_shrinks():
    got = ledger_problems({"users.id"}, ["users.id", "users.gone"], [], CATS)
    assert got == ["users.gone: in column-baseline.txt but no longer in the models — delete the line"]


def test_the_real_privacy_page_lists_its_categories():
    # Anchored to the real file: a broken extraction would make every category fail.
    assert {"identity", "location", "business"} <= privacy_categories()


def test_the_real_baseline_never_grows():
    n = len(_lines(BASELINE))
    assert n <= BASELINE_CEILING, (
        f"column-baseline.txt has {n} lines, ceiling {BASELINE_CEILING}: a new column goes in "
        f"columns.tsv, never in the baseline"
    )


def test_every_real_column_is_classified_or_grandfathered():
    problems = ledger_problems(model_columns(), _lines(BASELINE), _lines(LEDGER), privacy_categories())
    assert problems == [], "\n".join(problems)
