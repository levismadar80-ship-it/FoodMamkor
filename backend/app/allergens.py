"""Product allergen codes (MEH-2662).

The closed list a business picks from on a product: the 14 major allergens of
the EU / Israeli food-labelling lists, plus fava beans (פול) — Israeli labels
must say «מכיל פול» because of G6PD deficiency (MEH-3439). Codes are English (code/DB/routes stay
English); the Hebrew labels live in frontend messages. Self-declared by the
business — shown on the product sheet as «לפי הצהרת בית העסק», never verified.
"""

from collections.abc import Iterable

ALLERGEN_CODES: tuple[str, ...] = (
    "gluten",
    "milk",
    "eggs",
    "tree_nuts",
    "peanuts",
    "sesame",
    "soy",
    "fish",
    "crustaceans",
    "molluscs",
    "celery",
    "mustard",
    "sulphites",
    "lupin",
    "fava_beans",  # MEH-3439: Israel-specific, G6PD
)

_ALLOWED = frozenset(ALLERGEN_CODES)


def normalize_allergens(value: Iterable[str] | None) -> list[str] | None:
    """None stays None, and so does an empty list: NULL means "the owner
    filled nothing", and storing [] could later be read as "contains no
    allergens", which is a food-safety claim nobody made. A non-empty list is
    de-duplicated and returned in canonical order; an unknown code raises
    ValueError (→ 422), so a typo can never be stored as a claim about the
    food."""
    if not value:
        return None
    unknown = [c for c in value if c not in _ALLOWED]
    if unknown:
        raise ValueError(
            f"unknown allergen code(s): {', '.join(sorted(set(map(str, unknown))))}"
        )
    present = set(value)
    return [c for c in ALLERGEN_CODES if c in present]


def drop_contained(
    allergens: list[str] | None, may_contain: list[str] | None
) -> list[str] | None:
    """MEH-3439: remove from «עלול להכיל» every code already in «מכיל» — the
    product cannot both contain an allergen and only maybe contain it. An
    empty result is None, for the same reason as normalize_allergens."""
    if not may_contain:
        return None
    contained = set(allergens or ())
    rest = [c for c in may_contain if c not in contained]
    return rest or None
