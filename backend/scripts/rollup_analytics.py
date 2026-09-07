"""
Module:   rollup_analytics
Purpose:  Explicit backfill of `producer_analytics_daily` for an inclusive
          Israel-day range — the `--from/--to` arm of Sapir's 06/09 ruling
          (MEH-2079 chunk B2, MEH-2283). Still skip-on-conflict: a day that
          already has an aggregate row is left exactly as it is.
Touches:  DB table `producer_analytics_daily` (INSERT only), via the same
          `run_rollup` the daily scheduler job calls.
Does NOT: run automatically — the scheduler (startup.py) owns the daily
          `[watermark + 1 .. yesterday]` range and needs no arguments. This
          script exists for the case the automatic range cannot cover: a hole
          left by an outage longer than the retention window, or a first run
          you want bounded. It cannot roll today, cannot start above the
          watermark + 1 (that would leave a hole the reader never sees again),
          and cannot reach past the raw retention window.
Related:  backend/app/services/analytics_rollup.py (all the rules live there);
          backend/app/startup.py::_run_analytics_rollup_job.
History:  MEH-2283 (creation, 06/09).

Usage (from `backend/`, with DATABASE_URL set):

    python scripts/rollup_analytics.py --from 2026-08-20 --to 2026-08-31

Prints the RollupResult as JSON and exits 0; exits 2 on a refused range.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from datetime import date

# Make `backend/` importable as package root when run directly (script shim).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.database import SessionLocal  # noqa: E402  # imports follow sys.path.insert
from app.services.analytics_rollup import run_rollup  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Backfill producer_analytics_daily for an inclusive Israel-day range."
    )
    parser.add_argument(
        "--from",
        dest="from_day",
        type=date.fromisoformat,
        required=True,
        help="first Israel day to roll, YYYY-MM-DD",
    )
    parser.add_argument(
        "--to",
        dest="to_day",
        type=date.fromisoformat,
        required=True,
        help="last Israel day to roll, YYYY-MM-DD (never today)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    db = SessionLocal()
    try:
        result = run_rollup(db, from_day=args.from_day, to_day=args.to_day)
    except ValueError as exc:
        print(f"refused: {exc}", file=sys.stderr)
        return 2
    finally:
        db.close()
    print(json.dumps(asdict(result), default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
