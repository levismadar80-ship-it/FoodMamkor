"""
Module:   test_category_popular_drift
Purpose:  Drift-guard — every "popular" category the register CategorySelector
          highlights with a hand-drawn glyph must still exist as a real DB
          category name. A rename in seed_data.py that orphans a popular chip
          would otherwise silently fall back to the generic Leaf icon with no
          error; this turns that silent degradation into a red test.
Does NOT: import the frontend (POPULAR is a JS literal — not reachable from
          pytest). POPULAR_NAMES below is a deliberate mirror of
          frontend/components/CategorySelector.jsx:32-37 — the same accepted
          pattern as frontend/lib/license-required-categories.js (Hebrew name
          literals mirroring the backend source of truth).
Related:  backend/seed_data.py:9 (CATEGORIES — source of truth);
          frontend/components/CategorySelector.jsx:31-38 (POPULAR).
History:  MEH-831 (POPULAR re-scope → resolution (c): backend drift-guard).
"""

from seed_data import CATEGORIES

# Mirror of CategorySelector.jsx POPULAR[].name. Source of truth =
# seed_data.CATEGORIES; keep this list in sync with the frontend if the
# popular set ever changes.
POPULAR_NAMES = [
    "חלב וגבינות",
    "לחמים ואפייה",
    "בשר ודגים",
    "שמנים",
    "ירקות",
    "סבונים טבעיים",
]


def test_popular_categories_exist_in_seed():
    """Each highlighted popular category must be a real seed category name —
    otherwise its CategorySelector glyph silently degrades to the Leaf
    fallback for every producer in that category."""
    seed_names = {name for name, _emoji in CATEGORIES}
    orphans = [n for n in POPULAR_NAMES if n not in seed_names]
    assert not orphans, (
        "POPULAR category name(s) not found in seed_data.CATEGORIES "
        f"(glyph would silently Leaf-fallback in CategorySelector): {orphans}. "
        "Fix: align frontend/components/CategorySelector.jsx POPULAR + this "
        "mirror with seed_data.py CATEGORIES."
    )
