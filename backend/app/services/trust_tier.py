"""MEH-51: real-time trust tier computation — never stored, always computed."""

VALID_BADGE_CODES = frozenset(
    {
        "rabanut",
        "badatz",
        "chalak",
        "mehadrin",
        "organic-kosher",
        "shmitta",
        "kilayim",
        "artisan-dairy",
    }
)


def compute_trust_tier(producer) -> int:
    """Return the highest tier (1-5) the producer qualifies for.

    Tier 1 — profile exists (always)
    Tier 2 — phone_verified = true
    Tier 3 — is_verified = true (admin-manual)
    Tier 4 — reviews_count >= 10 AND avg_rating >= 4.5
    Tier 5 — ambassador = true (admin-manual, top producer in city)
    """
    if getattr(producer, "ambassador", False):
        return 5
    if (getattr(producer, "reviews_count", 0) or 0) >= 10 and (
        getattr(producer, "avg_rating", 0) or 0
    ) >= 4.5:
        return 4
    if getattr(producer, "is_verified", False):
        return 3
    if getattr(producer, "phone_verified", False):
        return 2
    return 1
