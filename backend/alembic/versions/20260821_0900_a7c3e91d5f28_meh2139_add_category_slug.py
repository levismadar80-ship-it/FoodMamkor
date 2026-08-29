"""meh2139_add_category_slug

Revision ID: a7c3e91d5f28
Revises: f4b1c8e0a297
Create Date: 2026-08-21 09:00:00.000000+00:00

MEH-2139, same class as MEH-2137 one table over: a vote stored as a DISPLAY
STRING. `CategorySelector.jsx` decides which categories are "popular" and
which belong to the «בית וטיפוח» group by comparing hardcoded Hebrew names
against `categories.name` (`c.name === p.name`). Rename a category in the DB
and the chip silently disappears — the component's own comment calls it
"seed drift is simply skipped". It has burned once already: the rename to
«קוסמטיקה טבעית» (MEH-1104) needed a temporary alias to survive.

Adds `categories.slug` — the stable ASCII identity the matching should have
used all along.

## Why not the existing `id`

`categories.id` is `Integer autoincrement`, and this repo has measured that
it is NOT stable across environments: `admin_extra.py` and the MEH-927
migration both insert at autoincrement ids, so the sequence has holes, and
staging's holes (ids 1, 5, 13, 15) are not production's. MEH-1107 keyed on
position-as-id and had to be replaced for exactly this reason (see the
seed_data.py comment block at :296-308). A slug is chosen by us, not by the
sequence, so it means the same thing everywhere.

## Where the slug VALUES come from — they are not invented here

The frontend already carries a complete Hebrew-name -> English-token map,
split across two constants it uses for glyphs and copy keys:

  * `POPULAR` glyphs (6)    — dairy, bread, meat, oil, veg, care
  * `REST_DESC_SLUGS` (12)  — eggs, fruit, ferments, prepared, herbs,
                              cosmetics, candles, drinks, spices,
                              chocolate, honey, fish

6 + 12 = 18, which is exactly the number of rows `seed_data.CATEGORIES`
creates, and the tokens are already the i18n keys
(`forms.category_selector.popular_descs.dairy`, `…rest_descs.eggs`).
Reusing them means the switch step is a mechanical swap rather than a new
vocabulary, and it is why the ticket's example — «יין, בירה ומשקאות» ->
`drinks` — matches this map without adjustment.

## The fallback, and why it is a fallback and not the rule

Any row NOT in the map (an admin-created category, a future seed addition)
gets a deterministic transliteration of its Hebrew name. That is a
best-effort readable slug, never a correctness mechanism: if the
transliteration is empty or collides with a slug already taken, the row
falls back to `category-{id}`, which cannot collide because ids are unique.
Both paths are reported by count at upgrade time.

The transliteration is DELIBERATELY not clever. It is a fixed 22-letter
table with no niqqud handling, no ktiv-male normalisation and no
dictionary. A cleverer one would produce prettier slugs and would still
need the collision fallback underneath it, so the cleverness would buy
appearance and not correctness.

## Ordering: ADD nullable -> backfill every row -> UNIQUE

Adding UNIQUE first would fail on the existing rows; adding it last means it
is asserted against data that is already complete, so a backfill bug shows up
HERE, as a failed migration, instead of as an ambiguous slug that the frontend
matches to the wrong row.

## ⚠️ Why NOT NULL is DEFERRED — a deliberate deviation from the ticket

The MEH-2139 chunk-1 spec says "NOT NULL + unique". **This revision applies
UNIQUE only and leaves the column nullable.** The deviation is Sapir's to
accept or reject; it is stated here rather than in a PR comment because the
next reader of this file needs it more than the reviewer does.

The ticket's split puts the constraint in chunk 1 and the slug-producing
writers in chunk 2. In that order the constraint lands BEFORE anything
populates the column, so every INSERT that omits `slug` fails for the whole
window between the two merges — and that window includes production:
`app/routers/admin_extra.py:218` is the admin "create category" endpoint.

Measured, not predicted. pytest with NOT NULL applied:

    psycopg2.errors.NotNullViolation: null value in column "slug" of
    relation "categories" violates not-null constraint
    statement = 'INSERT INTO categories (name, slug, emoji) VALUES (...)'
    parameters = {'emoji': '🥬', 'name': 'קטגוריה 428ea3', 'slug': None}

**11 writer sites construct a Category with no slug** (grep 2026-08-21):
`app/routers/admin_extra.py:218` (production) · `seed_data.py:325`
(`pg_insert(Category)` upsert) · and 9 under `tests/` — `conftest.py:357`,
`conftest.py:397`, `test_producer_import_unknown_category.py:35`,
`test_meh1921_registration_offers_delivery.py:210`,
`test_meh2081_seed_category_by_name.py:44`, `test_pending_nudge.py:110`,
`test_api.py:3524`, `test_seed_categories_idempotent.py:54`,
`test_meh2100_draft_submit.py:250`.

NOT NULL therefore belongs in the SAME step that teaches those writers to
produce a slug — chunk 2 — not here.

**The honest limitation of deferring it**, so nobody reads this as free:
UNIQUE still rejects a duplicate backfill, and the backfill still leaves zero
NULLs on existing rows (proven by the probe). What the deferral does NOT do is
stop a NEW row from arriving with a NULL slug during the window. That is
precisely why chunk 2 must carry the writers and the constraint together, and
why a chunk 2 that ships the writers without the constraint would leave this
column permanently unenforced.

# DO NOT make the slug editable from the admin UI, or derive it from the
#        name on rename. The whole point is that it survives a rename. A
#        slug that follows the display name is the bug with extra steps.

Chains AFTER f4b1c8e0a297 (MEH-2137) on purpose — the ticket calls for a
single head, and two revisions branching off e2a7c9d41b06 would create the
multiple-heads state that needs a merge revision to undo.

EXPECTED_TABLES unchanged (a column, not a table).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7c3e91d5f28"
# MEH-2139: chains after the MEH-2137 revision so the chain stays linear.
# Verified with scripts/checks/alembic-head-guard.sh on the branch that
# carries both files — it reported `single head: f4b1c8e0a297` before this
# file existed, which is precisely the revision named below. rtl-ok
down_revision: Union[str, None] = "f4b1c8e0a297"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UQ_NAME = "uq_categories_slug"

# Hebrew name -> slug, lifted verbatim from the two frontend constants named
# in the docstring. Order follows seed_data.CATEGORIES so the two lists can be
# read side by side.
NAME_TO_SLUG = {
    "בשר": "meat",
    "חלב וגבינות": "dairy",
    "ביצים": "eggs",
    "לחמים ואפייה": "bread",
    "שמנים": "oil",
    "ירקות": "veg",
    "פירות": "fruit",
    "מותססים וכבושים": "ferments",
    "מוצרים מוכנים": "prepared",
    "צמחי מרפא ותוספים": "herbs",
    "סבונים טבעיים": "care",
    "קוסמטיקה טבעית": "cosmetics",
    "נרות וארומה": "candles",
    "יין, בירה ומשקאות": "drinks",
    "תבלינים וצמחי תיבול": "spices",
    "שוקולד וממתקים בוטיק": "chocolate",
    "דבש": "honey",
    "דגים": "fish",
}

# Fixed 22-letter table. Final forms map to the same latin as their base
# letter, so «ץ» and «צ» both become "tz".
_HEBREW_TO_LATIN = {
    "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z",
    "ח": "ch", "ט": "t", "י": "y", "כ": "k", "ך": "k", "ל": "l", "מ": "m",
    "ם": "m", "נ": "n", "ן": "n", "ס": "s", "ע": "a", "פ": "p", "ף": "f",
    "צ": "tz", "ץ": "tz", "ק": "k", "ר": "r", "ש": "sh", "ת": "t",
}

SLUG_MAX = 50


def _transliterate(name: str) -> str:
    """Best-effort ASCII slug. May return "" — the caller handles that."""
    out = []
    for ch in (name or "").strip().lower():
        if ch in _HEBREW_TO_LATIN:
            out.append(_HEBREW_TO_LATIN[ch])
        elif ch.isascii() and ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")[:SLUG_MAX].strip("-")


def upgrade() -> None:
    op.add_column("categories", sa.Column("slug", sa.String(50), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, name FROM categories ORDER BY id")
    ).fetchall()

    # TWO PASSES, and the order is load-bearing. Fixed-table rows claim their
    # slugs FIRST, so a transliteration can never take a slug that a mapped row
    # further down the id order needs — which a single ordered pass would allow,
    # silently demoting a known category to `category-{id}`.
    assignments: dict[int, str] = {}
    taken: set[str] = set()
    for row in rows:
        slug = NAME_TO_SLUG.get((row.name or "").strip())
        if slug:
            assignments[row.id] = slug
            taken.add(slug)
    mapped = len(assignments)

    translit = fallback = 0
    for row in rows:
        if row.id in assignments:
            continue
        slug = _transliterate(row.name)
        if not slug or slug in taken:
            # `category-{id}` cannot collide: ids are unique and no fixed slug
            # has that shape. Counted separately so a run that LEANS on this
            # path is visible, rather than merely successful.
            slug = f"category-{row.id}"
            fallback += 1
        else:
            translit += 1
        assignments[row.id] = slug
        taken.add(slug)

    for cid, slug in assignments.items():
        bind.execute(
            sa.text("UPDATE categories SET slug = :s WHERE id = :i"),
            {"s": slug, "i": cid},
        )

    print(
        "[MEH-2139 backfill] categories=%s → mapped(fixed table)=%s · "
        "transliterated=%s · id-fallback(empty or collision)=%s"
        % (len(rows), mapped, translit, fallback)
    )

    # UNIQUE LAST — see the docstring. A backfill that produced a duplicate
    # fails the migration HERE rather than shipping an ambiguous slug.
    #
    # NOT NULL is NOT applied here. See the docstring section "Why NOT NULL is
    # deferred": 11 writers still construct a Category without a slug, so the
    # constraint would break them for the whole window until the switch step.
    op.create_unique_constraint(UQ_NAME, "categories", ["slug"])


def downgrade() -> None:
    op.drop_constraint(UQ_NAME, "categories", type_="unique")
    op.drop_column("categories", "slug")
