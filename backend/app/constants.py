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
    # MEH-927: "בשר ודגים" split into two rows. Both are animal-source food
    # (משרד הבריאות hard-licensing) → both license-required, same regime as
    # the original combined row. Regulatory claim approved under MEH-927.
    "בשר",
    "דגים",
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

# MEH-759 (ADR-022 gate 2, Chunk B): the version string stamped into
# producers.declaration_version when a business owner makes the binding
# tier-2 licensing declaration at registration. Brief Q1.4 — pairing a
# timestamp (declared_at) with the exact text version agreed to strengthens
# the platform's good-faith reliance defense and lets us prove WHICH wording
# each seller consented to if the lawyer-locked copy changes later.
# Bump this whenever the declaration text materially changes so existing
# rows stay attributable to the version signed. Must stay within the
# VARCHAR(10) producers.declaration_version column.
#   v1 ("2026-06-v1") — 2026-06-05 launch text ("…כל הרישיונות הנדרשים…
#     לפי חוק רישוי עסקים"). Stamped by Chunk B (PR #955); rows keep it.
#   v2 ("2026-06-v2") — MEH-759 Chunk C (ADR-022 gate 2): continuous-
#     commitment wording ("פועל כדין… ההצהרה תישאר נכונה כל עוד העסק
#     מופיע במהמקור…") + conditional farmer line. New wording = new version.
DECLARATION_VERSION: str = "2026-06-v2"
