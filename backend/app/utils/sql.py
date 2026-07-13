"""
Module:   sql
Purpose:  SQL LIKE/ILIKE pattern hygiene — escape user input so `%`/`_`
          match literally instead of acting as wildcards.
Touches:  Nothing — pure string helper, no I/O.
Does NOT: build the patterns themselves — call sites own `f"%{...}%"`
          shaping and must pass escape="\\" to .ilike()/.like().
Related:  app/services/producer_listing.py (_apply_search_filter),
          app/routers/search.py (unified_search).
History:  MEH-1176 F1 (creation) — triage found user-supplied `%`/`_`
          reaching ILIKE unescaped (a lone "%" matched every producer).
"""

from __future__ import annotations

# The escape character passed to SQLAlchemy's .ilike(..., escape=LIKE_ESCAPE).
LIKE_ESCAPE = "\\"


def escape_like(value: str) -> str:
    """Escape LIKE metacharacters in user input.

    Backslash first (it is the escape char itself), then `%` and `_`.
    The result is only meaningful when the query also declares
    ESCAPE '\\' — SQLAlchemy: `.ilike(pattern, escape=LIKE_ESCAPE)`.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
