"""
Module:   normalize_delivery_days
Purpose:  One-shot backfill for MEH-1644 — map legacy free-text
          delivery_areas.delivery_day values onto the canonical vocabulary
          (schemas.DELIVERY_DAYS: "ראשון".."שבת"; NULL = "בתיאום מראש"),
          with a dry-run report as the default mode.
Touches:  DB table delivery_areas (writes ONLY with --apply).
Does NOT: run itself against staging/production from a Claude session —
          MEH-408 discipline. The runner must be Sapir, from her own
          terminal, with the target DATABASE_URL exported. Non-local hosts
          additionally require --allow-remote so a stray env var can't
          silently point a dry-run-turned-apply at production.
Related:  backend/app/schemas/schemas.py (DELIVERY_DAYS — the whitelist this
          converges on), backend/app/routers/producer_me.py
          (_apply_delivery_rows — keeps NEW writes canonical).
History:  MEH-1644 — structured delivery-day capture + normalization.

Usage:
  cd backend
  uv run python ../scripts/normalize_delivery_days.py            # dry-run report
  uv run python ../scripts/normalize_delivery_days.py --apply    # write mapped values
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter
from urllib.parse import urlparse

# Make backend/ importable when run from repo root or backend/.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(os.path.dirname(_HERE), "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from app.schemas.schemas import DELIVERY_DAYS  # noqa: E402

# Accepted spellings per canonical day. Deliberately conservative: only forms
# whose meaning is unambiguous get mapped; anything else is reported as
# UNMAPPED and left untouched for a human call.
_ALIASES: dict[str, str] = {}
_EN_DAYS = [
    "sunday", "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday",
]
_HE_LETTER_DAYS = ["א", "ב", "ג", "ד", "ה", "ו"]  # א'..ו' — שבת never abbreviates to ש' safely
for i, day in enumerate(DELIVERY_DAYS):
    _ALIASES[day] = day
    _ALIASES[_EN_DAYS[i]] = day
    if i < len(_HE_LETTER_DAYS):
        _ALIASES[_HE_LETTER_DAYS[i]] = day
# Common variant: "ראשון" spelled with a final space / punctuation is handled
# by normalization below, not by alias entries.

# Prefixes stripped before lookup: "יום ", "ימי ", "בימי ", "ביום ", "בי׳" etc.
_PREFIX_RE = re.compile(r"^(?:ב?ימי|ב?יום)\s+")


def normalize_value(raw: str | None) -> tuple[str | None, bool]:
    """→ (canonical_or_None, mapped?). mapped=False means UNMAPPED free text
    that a human must resolve; (None, True) means the value normalizes to
    NULL (empty / whitespace / punctuation-only)."""
    if raw is None:
        return None, True
    v = raw.strip()
    if not v:
        return None, True
    # Strip wrapping punctuation + one "יום/ימי" prefix, drop a trailing
    # apostrophe/geresh (א' → א), collapse inner whitespace.
    v = re.sub(r"\s+", " ", v.strip(" .,;:!·-—"))
    v = _PREFIX_RE.sub("", v)
    v = v.rstrip("'׳")
    lookup = v.lower()
    if lookup in _ALIASES:
        return _ALIASES[lookup], True
    return raw, False


def _host_is_local(url: str) -> bool:
    host = urlparse(url.replace("postgresql+psycopg2", "postgresql")).hostname or ""
    return host in {"localhost", "127.0.0.1", "::1"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="write mapped values (default: dry-run report only)")
    parser.add_argument("--allow-remote", action="store_true",
                        help="required for any non-localhost DATABASE_URL")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("DATABASE_URL not set — nothing to inspect.", file=sys.stderr)
        return 2
    if not _host_is_local(db_url) and not args.allow_remote:
        print(
            "Refusing a non-localhost DATABASE_URL without --allow-remote "
            "(MEH-408 discipline: staging/prod runs are Sapir's, from her terminal).",
            file=sys.stderr,
        )
        return 2

    from sqlalchemy import create_engine, text  # deferred: needs backend venv

    engine = create_engine(db_url)
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, delivery_day FROM delivery_areas WHERE delivery_day IS NOT NULL"
        )).fetchall()

    already, to_null, mapped, unmapped = [], [], [], []
    for row_id, raw in rows:
        canonical, ok = normalize_value(raw)
        if not ok:
            unmapped.append((row_id, raw))
        elif canonical == raw:
            already.append(row_id)
        elif canonical is None:
            to_null.append((row_id, raw))
        else:
            mapped.append((row_id, raw, canonical))

    print("## normalize_delivery_days report (MEH-1644)")
    print(f"- rows with a non-NULL delivery_day: {len(rows)}")
    print(f"- already canonical: {len(already)}")
    print(f"- mapped to canonical: {len(mapped)}")
    print(f"- normalized to NULL (blank/punctuation): {len(to_null)}")
    print(f"- UNMAPPED (left untouched, human call needed): {len(unmapped)}")
    if mapped:
        print("\n### mappings")
        for _, raw, canonical in sorted(mapped, key=lambda m: m[1]):
            print(f"  {raw!r} -> {canonical!r}")
    if unmapped:
        print("\n### unmapped values (verbatim, with counts)")
        for value, count in Counter(raw for _, raw in unmapped).most_common():
            print(f"  {value!r} × {count}")

    if not args.apply:
        print("\n(dry-run — nothing written; re-run with --apply to persist)")
        return 0

    with engine.begin() as conn:
        for row_id, _, canonical in mapped:
            conn.execute(
                text("UPDATE delivery_areas SET delivery_day = :d WHERE id = :i"),
                {"d": canonical, "i": row_id},
            )
        for row_id, _ in to_null:
            conn.execute(
                text("UPDATE delivery_areas SET delivery_day = NULL WHERE id = :i"),
                {"i": row_id},
            )
    print(f"\napplied: {len(mapped)} mapped + {len(to_null)} nulled; "
          f"{len(unmapped)} unmapped rows untouched.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
