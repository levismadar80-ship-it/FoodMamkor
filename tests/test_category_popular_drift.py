# MEH-831: drift-guard for the register CategorySelector POPULAR chips.
# POPULAR (a frontend literal) highlights 6 categories by Hebrew name; a rename
# in seed_data.py that orphans one would silently fall back to the Leaf glyph.
# Asserting POPULAR_NAMES ⊆ seed_data.CATEGORIES turns that into a red test.

from seed_data import CATEGORIES

# POPULAR_NAMES mirrors CategorySelector.jsx:32-37 (accepted literal-mirror
# pattern, cf. lib/license-required-categories.js). seed_data.CATEGORIES is the
# enforced source of truth — this test fails if any name drifts out of it.
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
