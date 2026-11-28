"""
Module:   dietary_scope_conflict
Purpose:  MEH-3982 — name the categories that contradict a business's
          «טבעוני / צמחוני: כן» answer (honey, dairy, eggs, meat, fish are
          animal products) or «אין גלוטן במקום הייצור» (a bakery), so the
          admin hears about it.
Does NOT: block a save, rewrite vegan_scope / vegetarian_scope, or hide a
          badge — a vegan cheese maker can sit under «חלב וגבינות», so the
          answer stays the owner's and the check is a signal only.
Related:  frontend/lib/dietary-scope-conflict.js (the same slug lists, held
          equal by tests/test_meh3982_dietary_scope_conflict.py);
          services/producer_owner_update.py _maybe_fire_sensitive_edit (caller).
History:  MEH-3982 (creation) — «דבש הרמה» answered «טבעוני: כן».
"""

from collections.abc import Iterable
from typing import Any

NON_VEGAN_CATEGORY_SLUGS: frozenset[str] = frozenset(
    {"meat", "fish", "dairy", "eggs", "honey"}
)
NON_VEGETARIAN_CATEGORY_SLUGS: frozenset[str] = frozenset({"meat", "fish"})
GLUTEN_CATEGORY_SLUGS: frozenset[str] = frozenset({"bread"})

# Pseudo-field keys appended to the sensitive-edit change list, labelled in
# auth_notifications.SENSITIVE_FIELD_LABELS (the primary_location_removed shape).
VEGAN_CONFLICT_KEY = "vegan_scope_animal_category"
VEGETARIAN_CONFLICT_KEY = "vegetarian_scope_animal_category"
GLUTEN_CONFLICT_KEY = "gluten_free_facility_bread_category"

# (column, the value that makes the claim, contradicting slugs, ping key)
_AXES: tuple[tuple[str, str, frozenset[str], str], ...] = (
    ("vegan_scope", "all", NON_VEGAN_CATEGORY_SLUGS, VEGAN_CONFLICT_KEY),
    ("vegetarian_scope", "all", NON_VEGETARIAN_CATEGORY_SLUGS, VEGETARIAN_CONFLICT_KEY),
    ("gluten_free_facility", "dedicated", GLUTEN_CATEGORY_SLUGS, GLUTEN_CONFLICT_KEY),
)


def conflict_keys(producer: Any, changed: Iterable[str]) -> list[str]:
    """The conflict keys for each declaration that CHANGED in this save to its
    claim ('all' / 'dedicated') while the business holds a category that
    contradicts it. Categories only: the frontend also reads the business's
    own text for gluten words, which is a hint, too loose for the admin ping."""
    changed_set = set(changed)
    slugs = {getattr(c, "slug", None) for c in (producer.categories or [])}
    return [
        key
        for field, claim, banned, key in _AXES
        if field in changed_set
        and getattr(producer, field, None) == claim
        and slugs & banned
    ]
