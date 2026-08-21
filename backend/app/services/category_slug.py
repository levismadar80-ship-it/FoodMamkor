"""
Module:   category_slug
Purpose:  Produce the stable ASCII identity for a category row, server-side, so
          `categories.slug` can be NOT NULL without any writer having to
          remember it.
Touches:  DB — reads `categories` only when resolving a collision
          (`resolve_unique_slug`); the pure `slug_for_name` touches nothing.
Does NOT: rename or re-derive a slug when a category is renamed. Surviving a
          rename is the entire point of the column — see the DO NOT below.
          Does NOT own the one-time backfill; that is revision a7c3e91d5f28,
          which carries its own copy of the fixed table for exactly the reason
          Alembic revisions never import app code (they must keep running after
          the app moves on).
Related:  backend/alembic/versions/20260821_0900_a7c3e91d5f28_meh2139_add_category_slug.py
          frontend/components/CategorySelector.jsx (the consumer)
History:  MEH-2139 chunk 2 (creation).
"""

import hashlib
import re

# The 18 seeded names, lifted from the same frontend constants the chunk-1
# revision used (`POPULAR` glyphs + `REST_DESC_SLUGS`). Kept in sync with that
# revision BY VALUE, not by import: a migration must not import app code, so the
# duplication is deliberate and the test below pins the two copies together.
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

# Fixed transliteration table: 27 entries — the 22 base letters plus the 5
# final forms (ך ם ן ף ץ), each mapped to the same latin as its base letter.
# The count is spelled out because «22-letter table» (the Hebrew-alphabet
# shorthand this comment used to carry) disagrees with `len()` and sends
# anyone auditing the table against the code looking for 5 missing rows.
_HEBREW_TO_LATIN = {
    "א": "a",
    "ב": "b",
    "ג": "g",
    "ד": "d",
    "ה": "h",
    "ו": "v",
    "ז": "z",
    "ח": "ch",
    "ט": "t",
    "י": "y",
    "כ": "k",
    "ך": "k",
    "ל": "l",
    "מ": "m",
    "ם": "m",
    "נ": "n",
    "ן": "n",
    "ס": "s",
    "ע": "a",
    "פ": "p",
    "ף": "f",
    "צ": "tz",
    "ץ": "tz",
    "ק": "k",
    "ר": "r",
    "ש": "sh",
    "ת": "t",
}

SLUG_MAX = 50


def transliterate(name: str) -> str:
    """Best-effort ASCII slug. May return "" — callers handle that."""
    out = []
    for ch in (name or "").strip().lower():
        if ch in _HEBREW_TO_LATIN:
            out.append(_HEBREW_TO_LATIN[ch])
        elif ch.isascii() and ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
    slug = re.sub(r"-{2,}", "-", "".join(out))
    return slug.strip("-")[:SLUG_MAX].strip("-")


def slug_for_name(name: str) -> str:
    """Deterministic, pure, and NEVER empty.

    Fixed table first so the 18 seeded rows get the tokens the frontend already
    uses as i18n keys; transliteration second; and a stable last resort for a
    name with nothing transliterable at all («!!!»), because returning "" here
    would push a NOT NULL violation onto a caller that cannot fix it.
    """
    mapped = NAME_TO_SLUG.get((name or "").strip())
    if mapped:
        return mapped
    slug = transliterate(name)
    if slug:
        return slug
    # sha1, NOT `hash()`. Python randomizes string hashing per process
    # (PYTHONHASHSEED), so `hash()` would give a different slug on every boot —
    # measured: three runs of the same input returned 47676004 / 50954049 /
    # 13075338. A retried create would then silently make a second row, which is
    # the exact opposite of what a stable identity is for.
    digest = hashlib.sha1((name or "").strip().encode("utf-8")).hexdigest()[:8]
    return f"category-{digest}"


def resolve_unique_slug(db, name: str) -> str:
    """`slug_for_name` plus a numeric suffix until the DB accepts it.

    The UNIQUE constraint is the real authority — this only avoids handing it a
    duplicate it would have to reject with a 500. Imported lazily so this module
    stays importable without the ORM (the pure half is unit-tested on its own).
    """
    from app.models.models import Category

    base = slug_for_name(name)
    candidate = base
    n = 2
    while db.query(Category.id).filter(Category.slug == candidate).first():
        suffix = f"-{n}"
        candidate = f"{base[: SLUG_MAX - len(suffix)]}{suffix}"
        n += 1
    return candidate


def _column_default(context) -> str:
    """SQLAlchemy column default — reads `name` from the row being inserted.

    Covers **ORM inserts**: `Category(name=…, emoji=…)` with no slug, which is
    every one of the nine sites under `tests/` and any future ORM writer. That
    is the coverage NOT NULL rests on for those paths.

    **It does NOT cover a multi-row CORE insert, and that limit is measured.**
    `seed_data.py` issues `pg_insert(Category).values([...])`; SQLAlchemy
    suffixes each row's parameters (`name_m0`, `name_m1`, …) and evaluates this
    default ONCE for the whole statement, so the lookup raises
    `KeyError: 'categories.name_m0'`. `isolate_multiinsert_groups=True` does not
    help — it raises from the same line. The seeder therefore passes `slug`
    explicitly, and this docstring exists so the next person does not "simplify"
    that back out and rediscover the KeyError.

    Uniqueness is NOT resolved here — a column default has no session to query.
    The admin create path uses `resolve_unique_slug`; the other paths insert
    names that are themselves unique (`categories.name` is UNIQUE), so their
    slugs collide only when two different names transliterate identically, which
    the UNIQUE constraint then reports honestly instead of silently merging.
    """
    params = context.get_current_parameters()
    return slug_for_name(params.get("name"))


# DO NOT re-derive the slug when a category is renamed, here or anywhere else.
#        Surviving a rename is the whole reason the column exists — a slug that
#        follows the display name is the original bug with extra steps.


def bulk_slugs(db, names) -> dict:
    """Slugs for a batch of names, each unique against the DB **and each other**.

    The seeder inserts 18 rows in ONE statement, so per-row `resolve_unique_slug`
    would not see its own siblings and could hand out the same slug twice inside a
    single insert. This reads the taken set once and reserves as it goes.

    Why it is needed at all — the case is real, not hypothetical, and there is a
    test for it (`test_seed_never_updates_a_row_and_reinserts_the_freed_name`):
    renaming a seeded category FREES its canonical name while the row KEEPS its
    slug (surviving a rename is the point). The next seed then re-inserts the
    freed name, and that new row cannot also be `dairy`. It gets `dairy-2`, the
    documented insert-only contract is preserved, and the original row stays the
    one the popular grid matches — which is correct: it IS the dairy category,
    whatever the admin renamed it to.
    """
    from app.models.models import Category

    taken = {row[0] for row in db.query(Category.slug).all() if row[0]}
    out = {}
    for name in names:
        base = slug_for_name(name)
        candidate = base
        n = 2
        while candidate in taken:
            suffix = f"-{n}"
            candidate = f"{base[: SLUG_MAX - len(suffix)]}{suffix}"
            n += 1
        taken.add(candidate)
        out[name] = candidate
    return out
