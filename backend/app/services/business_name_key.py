"""
Module:   business_name_key
Purpose:  The one comparison key for a business name: lower-case, no quote
          marks or invisible characters, single spaces. «ג׳חנון» and «ג'חנון»
          get the same key.
Touches:  nothing (pure).
Does NOT: compute the key in SQL. routers/producer_name_check.py
          `_name_key_sql` does that, from the same translation tables below.
Related:  routers/producer_name_check.py (the registration name check) ·
          services/producer_duplicates.py (the admin «כפילות?» signal) ·
          services/draft_twins.py (a draft's self-registered twin).
History:  MEH-3086 (creation, inside producer_name_check). MEH-3865: moved
          here so the «כפילות?» signal and the draft-twin match use the same
          key as the name check.
"""

# Quote marks people type differently for the same name: «ג׳חנון» / «ג'חנון».
QUOTES = "\"'`״׳“”‘’"
# Invisible characters a pasted name carries: bidi marks and zero-width.
INVISIBLE = "‎‏​‌‍﻿‪‫‬‭‮"
# Spaces Postgres' `\s` does not match but Python's str.split() does.
ODD_SPACES = " \u0085   　"
# translate(): each ODD_SPACES char -> a plain space; the rest -> dropped.
SQL_FROM = ODD_SPACES + QUOTES + INVISIBLE
SQL_TO = " " * len(ODD_SPACES)
_PY_TABLE = {
    **{ord(ch): " " for ch in ODD_SPACES},
    **{ord(ch): None for ch in QUOTES + INVISIBLE},
}


def name_key(value: str) -> str:
    """Lower-case, no quote marks or invisible characters, single spaces."""
    return " ".join(value.translate(_PY_TABLE).split()).lower()
