"""
Module:   constants
Purpose:  Shared cross-cutting constants used by multiple services / routers.
          Single source of truth for category-name lists and format regexes
          that the frontend mirrors via static JS constants (no public
          /constants endpoint — drift caught by tests/test_producers.py).
Touches:  none (pure data, no IO).
Does NOT: hold env vars (those live in app/config.py) or category IDs
          (LICENSE_REQUIRED_CATEGORIES is by NAME — IDs depend on seed
          ordering and would silently drift if the seed reorders).
Related:  app/services/license_validation.py:ensure_license_for_categories
          (consumer), frontend/lib/license-required-categories.js (mirror).
History:  MEH-530 (creation, 2026-05-15) — producer license-required
          categories + license format regex.
"""

# MEH-530: categories whose producers must declare a manufacturer license
# (`producer_license_number`) when registering or being created. Stored as
# Hebrew NAMES because category IDs are assigned by seed ordering — pinning
# by name survives seed reorders (verified against backend/seed_data.py:9-28
# baseline at MEH-530 creation date).
#
# DO NOT silently expand this tuple — each addition implies a regulatory
# claim (food-safety license required by משרד הבריאות). Add via Linear
# ticket only.
LICENSE_REQUIRED_CATEGORIES: tuple[str, ...] = (
    "לחמים ואפייה",
    "מותססים וכבושים",
    "מוצרים מוכנים",
    "בשר ודגים",
    "חלב וגבינות",
    # MEH-529 additions — confirmed in seed_data.py at MEH-530 Phase 0:
    "שוקולד וממתקים בוטיק",
    "יין, בירה ומשקאות",
    # MEH-743: honey split off from "שמנים ודבש". Dedicated regulatory
    # regime — צו הפיקוח על מצרכים ושירותים (ייצור דבש ומכירתו), תשל"ז-1977
    # (keeper license + marketing license + business license). Olive-oil
    # under 5t/yr stays license-optional via the standalone "שמנים" row.
    "דבש",
)

# MEH-530: 7-10 digit license number per משרד הבריאות convention.
# Format check lives on the frontend only as a UX warning — backend
# intentionally does NOT enforce this regex so the manual-approval flow
# (Sapir reviewing legacy/atypical license values) keeps working. See
# the MEH-530 Linear description, "Format validation" paragraph, for the
# product decision behind warning-only enforcement. Mirrored verbatim by
# frontend/lib/license-required-categories.js.
PRODUCER_LICENSE_REGEX: str = r"^\d{7,10}$"

# MEH-530: column width on producers.producer_license_number is VARCHAR(20).
# Pydantic max_length on the 4 input schemas mirrors this — boundary defense
# so 200-char garbage produces a clean 422 instead of a Postgres 500.
PRODUCER_LICENSE_MAX_LENGTH: int = 20
