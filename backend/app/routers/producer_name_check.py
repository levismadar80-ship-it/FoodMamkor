"""guard-ok: not in [tool.mypy].files — importing is_business pulls the untyped producer_listing graph (33 legacy keys rise).

Module:   producer_name_check
Purpose:  Tell the registration form whether a LIVE business already carries
          the name being typed, so its owner asks for the existing page
          instead of opening a second one (MEH-3086).
Touches:  producers (read only). Writes nothing — in particular NOT the
          search log.
Does NOT: search. GET /producers?q= is the search, and it records every
          query in search_logs (services/producer_listing.py `_log_search`);
          a name typed into a sign-up form is not a search term.
          Does NOT see drafts, pending or rejected pages: their names are not
          public, and this route is anonymous.
Related:  backend/app/services/producer_listing.py `is_business` (the one
          rule for "a live business"); backend/app/routers/cities.py (the
          same shape: anonymous, rate-limited, read-only lookup).
History:  MEH-3086 (creation).
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import ColumnElement, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Producer
from app.rate_limit import limiter
from app.schemas.schemas import NameCheckOut, NameMatch
from app.services.producer_listing import is_business

router = APIRouter(tags=["producers"])

MIN_NAME_LEN = 3
MAX_MATCHES = 3
# Quote marks people type differently for the same name: «ג׳חנון» / «ג'חנון».
_QUOTES = "\"'`״׳“”‘’"
# Invisible characters a pasted name carries: bidi marks and zero-width.
_INVISIBLE = "\u200e\u200f\u200b\u200c\u200d\ufeff\u202a\u202b\u202c\u202d\u202e"
# Spaces Postgres' `\s` does not match but Python's str.split() does.
_ODD_SPACES = "\u00a0\u0085\u2007\u2009\u202f\u3000"
# translate(): each _ODD_SPACES char -> a plain space; the rest -> dropped.
_FROM = _ODD_SPACES + _QUOTES + _INVISIBLE
_TO = " " * len(_ODD_SPACES)
_PY_TABLE = {
    **{ord(ch): " " for ch in _ODD_SPACES},
    **{ord(ch): None for ch in _QUOTES + _INVISIBLE},
}


def name_key(value: str) -> str:
    """Lower-case, no quote marks or invisible characters, single spaces.

    `_name_key_sql` computes the same key in Postgres; the two are held
    together by tests/test_meh3086_name_check.py (stored-vs-typed pairs).
    """
    return " ".join(value.translate(_PY_TABLE).split()).lower()


def _name_key_sql() -> ColumnElement[str]:
    """The same key, computed by Postgres on the stored name."""
    cleaned = func.translate(Producer.name, _FROM, _TO)
    return func.lower(func.btrim(func.regexp_replace(cleaned, r"\s+", " ", "g")))


@router.get("/producer-name-check", response_model=NameCheckOut)
@limiter.limit("30/minute")
def producer_name_check(
    request: Request,
    name: str = Query(..., max_length=200),
    db: Session = Depends(get_db),
) -> NameCheckOut:
    """Live businesses whose name equals `name` (exact, after `name_key`).

    Exact match only — DO NOT turn this into a prefix or substring match:
    that would make an anonymous route a way to list the directory by
    typing letters, which is what GET /producers is rate-shaped for.
    """
    key = name_key(name)
    # A NUL byte cannot be sent to Postgres at all (the driver raises).
    if len(key) < MIN_NAME_LEN or "\x00" in key:
        return NameCheckOut(matches=[])
    rows = (
        db.query(Producer.id, Producer.slug, Producer.name, Producer.city)
        .filter(is_business(), _name_key_sql() == key)
        .order_by(Producer.name, Producer.id)
        .limit(MAX_MATCHES)
        .all()
    )
    return NameCheckOut(
        matches=[
            NameMatch(id=str(r.id), slug=r.slug, name=r.name, city=r.city) for r in rows
        ]
    )
