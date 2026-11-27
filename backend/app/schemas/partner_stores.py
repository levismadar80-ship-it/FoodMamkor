"""
Module:   partner_stores
Purpose:  Normalise the «נמכר דרך חנויות אחרות» list (MEH-3977): the names of
          other stores that sell a business's products. Trimmed, blanks
          dropped, duplicates dropped, each name 2–60 characters, at most 10
          (the DB CHECK producer_partner_stores_cap holds the same 10).
Touches:  nothing — pure validation.
Does NOT: decide the location mode (physical OR delivery OR partner stores):
          that lives in schemas/producer.py `_validate_location_mode` and the
          DB CHECK producer_location_mode.
Related:  backend/app/models/models.py (partner_stores column),
          alembic b2d4f6a8c0e3.
History:  MEH-3977 (creation; review: letter check).
"""

import re
from typing import Any

from app.limits import cap_list
from app.services.sanitization import sanitize_text

MAX_PARTNER_STORES = 10
MAX_PARTNER_STORE_NAME = 60
MIN_PARTNER_STORE_NAME = 2

# MEH-3977: one sentence for the schema ValueErrors and the effective-state
# 422 in services/delivery_validation.ensure_location_mode.
LOCATION_MODE_MESSAGE = (
    "חייב לפחות אחד: מקום שהלקוחות מגיעים אליו, משלוחים, "
    "או חנויות אחרות שמוכרות את המוצרים"
)
PARTNER_STORES_DETAIL = f"אפשר לרשום עד {MAX_PARTNER_STORES} חנויות"
# MEH-555 pattern (letters counted after strip), at 2 not 3: «AM» is a store.
_LETTER = re.compile(r"[א-תa-zA-Z]")
PARTNER_STORE_LETTERS_DETAIL = "שם חנות צריך לכלול לפחות שתי אותיות"
PARTNER_STORE_NAME_DETAIL = (
    f"שם חנות צריך להיות באורך {MIN_PARTNER_STORE_NAME} עד {MAX_PARTNER_STORE_NAME} תווים"
)


def normalize_partner_stores(value: Any) -> Any:
    """mode="before" body. None passes through (a partial update that does
    not send the field); anything else becomes a clean list of names."""
    if value is None:
        return None
    cap_list(value, MAX_PARTNER_STORES, PARTNER_STORES_DETAIL)
    if not isinstance(value, list | tuple):
        return value  # pydantic answers the type error
    seen: set[str] = set()
    out: list[str] = []
    for raw in value:
        if not isinstance(raw, str):
            return value  # pydantic answers the type error
        name = (sanitize_text(raw, max_length=MAX_PARTNER_STORE_NAME * 2) or "").strip()
        if not name:
            continue
        if not MIN_PARTNER_STORE_NAME <= len(name) <= MAX_PARTNER_STORE_NAME:
            raise ValueError(PARTNER_STORE_NAME_DETAIL)
        if len(_LETTER.findall(name)) < MIN_PARTNER_STORE_NAME:
            raise ValueError(PARTNER_STORE_LETTERS_DETAIL)
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out
