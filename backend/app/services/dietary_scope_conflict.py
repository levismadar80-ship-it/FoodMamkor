"""
Module:   dietary_scope_conflict
Purpose:  MEH-3982 — name the categories that contradict a business's
          «טבעוני / צמחוני: כן» answer (honey, dairy, eggs, meat, fish are
          animal products), so the admin hears about it.
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

# Pseudo-field keys appended to the sensitive-edit change list, labelled in
# auth_notifications.SENSITIVE_FIELD_LABELS (the primary_location_removed shape).
VEGAN_CONFLICT_KEY = "vegan_scope_animal_category"
VEGETARIAN_CONFLICT_KEY = "vegetarian_scope_animal_category"

_AXES: tuple[tuple[str, frozenset[str], str], ...] = (
    ("vegan_scope", NON_VEGAN_CATEGORY_SLUGS, VEGAN_CONFLICT_KEY),
    ("vegetarian_scope", NON_VEGETARIAN_CATEGORY_SLUGS, VEGETARIAN_CONFLICT_KEY),
)


def conflict_keys(producer: Any, changed: Iterable[str]) -> list[str]:
    """The conflict keys for each scope that CHANGED in this save to 'all'
    while the business holds a category whose products cannot be that."""
    changed_set = set(changed)
    slugs = {getattr(c, "slug", None) for c in (producer.categories or [])}
    return [
        key
        for field, banned, key in _AXES
        if field in changed_set
        and getattr(producer, field, None) == "all"
        and slugs & banned
    ]
