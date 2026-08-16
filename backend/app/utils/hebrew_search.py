"""
Module:   hebrew_search
Purpose:  Turn a raw Hebrew search string into per-token ILIKE patterns so a
          row matches when EVERY token hits at least one searchable field —
          instead of the whole query having to appear as one literal substring.
Touches:  Nothing — pure string helpers, no I/O, no SQLAlchemy.
Does NOT: build the SQL. Call sites own the column list, the OR/AND shaping,
          and passing escape=LIKE_ESCAPE — see app/routers/search.py
          (smart_search) and app/services/producer_listing.py
          (_apply_search_filter).
Related:  app/utils/sql.py:20 (escape_like), app/routers/search.py:56,
          app/services/producer_listing.py:364.
History:  MEH-252 (the single-word prefix strip this generalises);
          MEH-1664 (creation — tokenisation + variants on both search paths).

Matching model
--------------
A query is split on whitespace into at most MAX_TOKENS tokens. Each token
expands to at most MAX_VARIANTS patterns. A row matches iff **every** token
has **at least one** variant matching **at least one** of that row's
searchable fields — AND across tokens, OR across (variant x field).

That AND is what makes free word order safe: "עיזים גבינת" and
"גבינת עיזים" both match, while "גבינה חיפה" does not match a Tel-Aviv
business that merely sells cheese, because the חיפה token finds nothing.

The three variant rules (applied per token, in this order)
---------------------------------------------------------
(a) as-is                  — the token unchanged.
(b) prefix-stripped        — drop one leading מש"ה כל"ב letter when the token
                             is >= 4 chars, so "הגבינה" reaches "גבינה".
                             Verbatim the MEH-252 rule; the length floor is
                             what keeps "הוא" from becoming "וא".
(c) stem                   — token is >= 4 chars and ends in ה or ת → drop
                             that letter. This is the smichut/feminine bridge:
                             "גבינת" -> "גבינ" matches "גבינה"/"גבינות", and
                             "גבינה" -> "גבינ" matches "גבינת עיזים".
(d) stem of (b)            — both transforms at once, for "הגבינה" -> "גבינ".

Deliberately NOT here (MEH-1664 over-engineering guard): ים/ות plural
stripping beyond the ה/ת-final rule, synonym tables, pg_trgm, fuzzy scoring.
Consequence worth knowing: rule (c) takes "גבינות" to "גבינו", which does
NOT reach "גבינה" — the plural->singular direction is uncovered by design.
The singular->plural direction already works through plain substring ILIKE.

Duplicate variants are dropped (the rules collapse onto each other for most
tokens), so a typical Hebrew token yields 2 patterns, not 4.
"""

from __future__ import annotations

from app.utils.sql import escape_like

# Hard caps — a hostile 200-char query (the Query(max_length=200) ceiling on
# both endpoints) must not turn into an unbounded pile of OR branches.
MAX_TOKENS = 5
MAX_VARIANTS = 4

# MEH-252 — the מש"ה כל"ב single-letter prefixes (definite article,
# in/to/from/that/as/and).
_HEBREW_PREFIXES = ("ה", "ב", "ל", "מ", "ש", "כ", "ו")

# Feminine singular / smichut endings that rule (c) drops.
_STEM_SUFFIXES = ("ה", "ת")

# Both transforms need >= 4 chars so a 3-letter word keeps its first and last
# letter (MEH-252: stripping "הוא" to "וא" over-matches everything).
_MIN_LEN = 4


def tokenize(query: str) -> list[str]:
    """Split on whitespace, capped at MAX_TOKENS. Empty input -> []."""
    return (query or "").split()[:MAX_TOKENS]


def strip_hebrew_prefix(word: str) -> str:
    """Rule (b) — drop one leading מש"ה כל"ב letter on a >= 4-char word."""
    if len(word) >= _MIN_LEN and word[0] in _HEBREW_PREFIXES:
        return word[1:]
    return word


def stem(word: str) -> str:
    """Rule (c) — drop a trailing ה/ת on a >= 4-char word."""
    if len(word) >= _MIN_LEN and word[-1] in _STEM_SUFFIXES:
        return word[:-1]
    return word


def token_variants(token: str) -> list[str]:
    """The <= MAX_VARIANTS forms of one token, deduped, order (a)(b)(c)(d)."""
    stripped = strip_hebrew_prefix(token)
    candidates = (token, stripped, stem(token), stem(stripped))
    variants: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in variants:
            variants.append(candidate)
        if len(variants) == MAX_VARIANTS:
            break
    return variants


def token_patterns(token: str) -> list[str]:
    """LIKE patterns for one token — every variant escaped.

    The call site MUST pass escape=LIKE_ESCAPE to .ilike(); escaping here
    without declaring the escape char there leaves user `%`/`_` live
    (MEH-1176). No raw interpolation of the token anywhere else.
    """
    return [f"%{escape_like(variant)}%" for variant in token_variants(token)]
