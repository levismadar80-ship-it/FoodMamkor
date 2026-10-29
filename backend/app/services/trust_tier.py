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
    """Return the highest tier (1-4) the producer qualifies for.

    Tier 1 — profile exists (always)
    Tier 2 — phone_verified = true
    Tier 3 — verified_at set (document-verified, MEH-766)
    Tier 4 — reviews_count >= 10 AND avg_rating >= 4.5

    MEH-2509: Tier 5 (ambassador = true, admin-manual) is retired. It was a
    second manual badge doing the job of «בחירת העורכת» (is_recommended,
    MEH-1492) — the one the About page describes. The column is still stored;
    it no longer affects the tier.
    """
    # The About page states 10 / 4.5 (about.consumer.community_leader);
    # frontend/__tests__/TrustCopyMeh2527.test.js pins this line (MEH-2527).
    if (getattr(producer, "reviews_count", 0) or 0) >= 10 and (
        getattr(producer, "avg_rating", 0) or 0
    ) >= 4.5:
        return 4
    # MEH-766: Tier 3 sourced from verified_at (document-verified) — decoupled
    # from the legacy admin-manual is_verified boolean (writers retire ch3).
    if getattr(producer, "verified_at", None) is not None:
        return 3
    if getattr(producer, "phone_verified", False):
        return 2
    return 1
