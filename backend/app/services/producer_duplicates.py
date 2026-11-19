"""
Module:   producer_duplicates
Purpose:  Tell the admin producers list, per row, whether ANOTHER business in
          any status shares its name or its phone, so «כפילות?» sees a draft's
          self-registered twin even when the list is filtered to drafts.
Touches:  reads `producers` (id, name, phone) in ONE query; writes nothing.
Does NOT: block, merge or hide anything (a signal only, as MEH-1421 set it),
          and does not compare city (the table still does that over the loaded
          rows, use-admin-producers.js). Not for matching a WhatsApp sender:
          that is app/utils/phone.py, mobile-only on purpose.
Related:  app/routers/admin.py list_producers (the only caller);
          app/schemas/producer_out.py ProducerAdminOut.dup_name / dup_phone.
History:  MEH-3408 (creation).
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from typing import Any

from sqlalchemy.orm import Session

from app.models import Producer

_NON_DIGIT = re.compile(r"\D")
# An Israeli number has 8 (landline) or 9 (mobile) digits after the trunk 0.
# Anything shorter is a typo or a fragment, and two fragments must not match.
_MIN_NATIONAL_DIGITS = 8


def name_key(name: str | None) -> str | None:
    """Trimmed, lower-cased name; None when empty (two blanks never match)."""
    key = (name or "").strip().lower()
    return key or None


def phone_key(phone: str | None) -> str | None:
    """The national digits of an Israeli number, in any notation, or None.

    "050-123-4567", "0501234567", "+972501234567" and "972 50 123 4567" all
    give "501234567"; "04-8123456" and "+972 4 812 3456" both give "48123456".
    """
    digits = _NON_DIGIT.sub("", phone or "")
    if digits.startswith("972"):
        digits = digits[3:]
    digits = digits.lstrip("0")
    return digits if len(digits) >= _MIN_NATIONAL_DIGITS else None


def attach_duplicate_signals(db: Session, producers: Iterable[Any]) -> None:
    """Set `dup_name` / `dup_phone` on each row, counted over the whole table.

    One SELECT of three columns, whatever the number of rows, so the
    list's query count stays flat (tests/test_meh2541_admin_producers_query_count.py).
    A row's own value is in the counts once, so "shared" means a count above 1.
    """
    rows = db.query(Producer.name, Producer.phone).all()
    names = Counter(k for k in (name_key(n) for n, _ in rows) if k)
    phones = Counter(k for k in (phone_key(p) for _, p in rows) if k)
    for p in producers:
        n = name_key(p.name)
        ph = phone_key(p.phone)
        p.dup_name = bool(n and names[n] > 1)
        p.dup_phone = bool(ph and phones[ph] > 1)
