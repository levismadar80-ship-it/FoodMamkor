"""Product allergen codes (MEH-2662).

The closed list a business picks from on a product: the 14 major allergens of
the EU / Israeli food-labelling lists. Codes are English (code/DB/routes stay
English); the Hebrew labels live in frontend messages. Self-declared by the
business — shown on the product sheet as «לפי הצהרת בית העסק», never verified.
"""

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
)

_ALLOWED = frozenset(ALLERGEN_CODES)


def normalize_allergens(value):
    """None stays None. A list is de-duplicated and returned in canonical
    order; an unknown code raises ValueError (→ 422), so a typo can never be
    stored as a claim about the food."""
    if value is None:
        return None
    unknown = [c for c in value if c not in _ALLOWED]
    if unknown:
        raise ValueError(f"unknown allergen code(s): {', '.join(sorted(set(map(str, unknown))))}")
    present = set(value)
    return [c for c in ALLERGEN_CODES if c in present]
