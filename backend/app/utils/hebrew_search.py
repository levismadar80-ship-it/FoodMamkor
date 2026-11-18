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

(e) final-letter form      — MEH-3415: a token ending in a regular-form letter
                             that has a final form (מ נ צ פ כ) also tries the
                             final form, so "שלומ" reaches "שלום". A variant,
                             not a replacement: "שלומ" must still reach "שלומית".

Duplicate variants are dropped (the rules collapse onto each other for most
tokens), so a typical Hebrew token yields 2 patterns, not 5.

Query normalisation (MEH-3415, applied by tokenize before any rule)
-------------------------------------------------------------------
Niqqud and cantillation marks (U+0591–U+05C7, except maqaf U+05BE and sof
pasuq U+05C3, which are punctuation) are dropped — stored names carry none, so
"גְּבִינָה" must search as "גבינה". Hebrew geresh/gershayim (׳ ״) become ' and
", the forms a keyboard types. A final letter in the MIDDLE of a token
("שלוםית") becomes its regular form.

Wrong keyboard layout (MEH-3415)
--------------------------------
layout_alternative() maps a query typed on the other layout of a standard
Israeli keyboard (SI 1452): "sca" -> "דבש", "nvneur" -> "מהמקור", and back,
"ברקשג" -> "bread". Callers run it ONLY when the query as typed found
nothing, so a real English word that has results is never rewritten; the
database is the dictionary that decides whether the conversion was a word.
"""

from __future__ import annotations

from app.utils.sql import escape_like

# Hard caps — a hostile 200-char query (the Query(max_length=200) ceiling on
# both endpoints) must not turn into an unbounded pile of OR branches.
MAX_TOKENS = 5
MAX_VARIANTS = 5

# MEH-252 — the מש"ה כל"ב single-letter prefixes (definite article,
# in/to/from/that/as/and).
_HEBREW_PREFIXES = ("ה", "ב", "ל", "מ", "ש", "כ", "ו")

# Feminine singular / smichut endings that rule (c) drops.
_STEM_SUFFIXES = ("ה", "ת")

# Both transforms need >= 4 chars so a 3-letter word keeps its first and last
# letter (MEH-252: stripping "הוא" to "וא" over-matches everything).
_MIN_LEN = 4


# MEH-3415 — final letter -> regular form, and back.
_FINAL_TO_REGULAR = {"ם": "מ", "ן": "נ", "ץ": "צ", "ף": "פ", "ך": "כ"}
_REGULAR_TO_FINAL = {v: k for k, v in _FINAL_TO_REGULAR.items()}

# Niqqud + cantillation: U+0591..U+05C7 minus maqaf (U+05BE) and sof pasuq
# (U+05C3), which are punctuation a user may mean.
_NIQQUD = {cp: None for cp in range(0x0591, 0x05C8) if cp not in (0x05BE, 0x05C3)}
_GERESH = {ord("׳"): "'", ord("״"): '"'}
_NORMALISE_TABLE = {**_NIQQUD, **_GERESH}

# MEH-3415 — SI 1452, the standard Israeli keyboard: Latin key -> Hebrew
# character on the same key. Uppercase is folded to lowercase before lookup.
_LATIN_TO_HEBREW = {
    "q": "/",
    "w": "'",
    "e": "ק",
    "r": "ר",
    "t": "א",
    "y": "ט",
    "u": "ו",
    "i": "ן",
    "o": "ם",
    "p": "פ",
    "a": "ש",
    "s": "ד",
    "d": "ג",
    "f": "כ",
    "g": "ע",
    "h": "י",
    "j": "ח",
    "k": "ל",
    "l": "ך",
    ";": "ף",
    "'": ",",
    "z": "ז",
    "x": "ס",
    "c": "ב",
    "v": "ה",
    "b": "נ",
    "n": "מ",
    "m": "צ",
    ",": "ת",
    ".": "ץ",
    "/": ".",
}
# Reverse direction maps Hebrew LETTERS only — punctuation is ambiguous
# (",", ".", "'" and "/" are on both layouts) and a Hebrew query that is
# letters-plus-punctuation is far likelier real Hebrew than a slip.
_HEBREW_TO_LATIN = {
    heb: lat for lat, heb in _LATIN_TO_HEBREW.items() if "\u05d0" <= heb <= "\u05ea"
}
_LATIN_LETTERS = set("abcdefghijklmnopqrstuvwxyz")
# A 1-2 key slip converts into something that matches by accident far too
# often ("ok" -> "לם" is a substring of "שלום"); 3 is the floor.
_MIN_LAYOUT_CHARS = 3


def normalise(query: str) -> str:
    """MEH-3415 — drop niqqud, unify geresh, de-final a mid-token final letter."""
    text = (query or "").translate(_NORMALISE_TABLE)
    out = []
    for i, ch in enumerate(text):
        nxt = text[i + 1] if i + 1 < len(text) else " "
        if (
            ch in _FINAL_TO_REGULAR
            and not nxt.isspace()
            and "\u05d0" <= nxt <= "\u05ea"
        ):
            out.append(_FINAL_TO_REGULAR[ch])
        else:
            out.append(ch)
    return "".join(out)


def tokenize(query: str) -> list[str]:
    """Normalise, split on whitespace, capped at MAX_TOKENS. Empty -> []."""
    return normalise(query).split()[:MAX_TOKENS]


def layout_alternative(query: str) -> str | None:
    """MEH-3415 — the query re-read on the other keyboard layout, or None.

    None when the query mixes scripts, holds a character the other layout
    cannot produce, or has fewer than _MIN_LAYOUT_CHARS non-space characters.
    Latin -> Hebrew needs at least one Latin letter (a query of only ",./;"
    is not a slip); Hebrew -> Latin maps letters only.
    """
    text = " ".join((query or "").split())
    if len(text.replace(" ", "")) < _MIN_LAYOUT_CHARS:
        return None
    lowered = text.lower()
    if any(ch in _LATIN_LETTERS for ch in lowered) and all(
        ch == " " or ch in _LATIN_TO_HEBREW for ch in lowered
    ):
        return "".join(_LATIN_TO_HEBREW.get(ch, ch) for ch in lowered)
    if all(
        ch == " " or ch in _HEBREW_TO_LATIN or ch in _FINAL_TO_REGULAR for ch in text
    ):
        # Final letters sit on their own keys (o i . ; l), already in the map.
        return "".join(_HEBREW_TO_LATIN.get(ch, ch) for ch in text)
    return None


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


def final_form(word: str) -> str:
    """Rule (e) — a trailing regular-form letter that has a final form -> final."""
    if word and word[-1] in _REGULAR_TO_FINAL:
        return word[:-1] + _REGULAR_TO_FINAL[word[-1]]
    return word


def token_variants(token: str) -> list[str]:
    """The <= MAX_VARIANTS forms of one token, deduped, order (a)(b)(c)(d)(e)."""
    stripped = strip_hebrew_prefix(token)
    candidates = (token, stripped, stem(token), stem(stripped), final_form(token))
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
