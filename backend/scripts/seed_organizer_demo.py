"""
Module:   seed_organizer_demo
Purpose:  Seed ONE market organizer (ADR-036 `kind='organizer'`) with two
          upcoming markets on the STAGING database, so the hybrid chat
          (MEH-586) can be checked live: the organizer must NOT be counted or
          listed as a business, and its markets MUST show up for «מתי השוק
          הבא?». Registration for organizers is MEH-2459 chunk 2 and has not
          shipped, so this is the only way to put one on staging today.
Touches:  DB tables producers / producer_locations / events.
Does NOT: touch production — same hard guard as seed_demo_business.py
          (local host, or RAILWAY_ENVIRONMENT == "staging"). Does NOT create
          users: an organizer has no owner login until chunk 2.
Related:  backend/scripts/seed_demo_business.py:620-642 (the guard, copied);
          docs/decisions/ADR-036-organizer-kind.md; services/chat_db_tools.py
          (_IS_BUSINESS — what this row must be invisible to).
History:  MEH-586 (creation, 28/10 — Sapir: «תוסיף ב-staging את שוק גלם»).

Run (staging):
    railway run python backend/scripts/seed_organizer_demo.py
Local:
    python backend/scripts/seed_organizer_demo.py            # skip-if-exists
    python backend/scripts/seed_organizer_demo.py --refresh  # recreate
"""

import argparse
import os
import sys
from datetime import timedelta
from urllib.parse import urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal, engine  # after sys.path shim
from app.models.models import Event, Producer, ProducerLocation
from app.utils.clock import israel_today

ORGANIZER_SLUG = "shuk-gelem-demo"

# A real-world shape: a travelling producers' market, no license, no shop.
# `city` is where the organizer is based; each market is its own event with
# its own city, which is what the chat's events tool filters on.
ORGANIZER = {
    "name": "שוק גלם",
    "slug": ORGANIZER_SLUG,
    "kind": "organizer",
    "status": "approved",
    "city": "תל אביב",
    "description": "שוק יצרנים נודד — יצרנים קטנים, אוכל אמיתי, פעם בשבוע בעיר אחרת.",
    "has_physical_location": True,  # satisfies producer_location_mode
    "offers_delivery": False,
}

MARKETS = [
    {
        "title": "שוק גלם בנמל תל אביב",
        "days_ahead": 3,
        "city": "תל אביב",
        "location": "האנגר 11, נמל תל אביב",
        "category": "שוק",
    },
    {
        "title": "שוק גלם בחיפה",
        "days_ahead": 10,
        "city": "חיפה",
        "location": "שוק תלפיות",
        "category": "שוק",
    },
]


def _assert_not_production() -> None:
    # REUSES: backend/scripts/seed_demo_business.py:623 — same two signals.
    host = (
        urlparse(str(engine.url).replace("postgresql+psycopg2", "postgresql")).hostname
        or ""
    ).lower()
    if host in ("localhost", "127.0.0.1"):
        return
    if os.getenv("RAILWAY_ENVIRONMENT", "").lower() == "staging":
        return
    sys.exit(
        f"REFUSING to seed organizer demo: DB host '{host}' is not local and "
        "RAILWAY_ENVIRONMENT != 'staging'. This script must never touch production."
    )


def seed_organizer(db, *, refresh: bool = False) -> Producer:
    existing = db.query(Producer).filter(Producer.slug == ORGANIZER_SLUG).first()
    if existing and not refresh:
        print(f"organizer {ORGANIZER_SLUG!r} already exists ({existing.id}); skipping")
        return existing
    if existing:
        db.query(Event).filter(Event.producer_id == existing.id).delete()
        db.query(ProducerLocation).filter(
            ProducerLocation.producer_id == existing.id
        ).delete()
        db.delete(existing)
        db.flush()

    organizer = Producer(**ORGANIZER)
    db.add(organizer)
    db.flush()
    # One location row: every write path creates one (MEH-1939+), and the
    # map/geo code reads producer_locations only (MEH-1938). An organizer
    # is never mapped as a business, but the row keeps the data shape honest.
    db.add(
        ProducerLocation(
            producer_id=organizer.id,
            kind="branch",
            is_primary=True,
            city=ORGANIZER["city"],
            label="משרד המארגנים",
            location_precision="approximate",
        )
    )
    today = israel_today()
    for m in MARKETS:
        db.add(
            Event(
                producer_id=organizer.id,
                title=m["title"],
                event_date=today + timedelta(days=m["days_ahead"]),
                city=m["city"],
                location=m["location"],
                category=m["category"],
                is_active=True,
            )
        )
    db.commit()
    db.refresh(organizer)
    print(
        f"seeded organizer {ORGANIZER_SLUG!r} ({organizer.id}) with {len(MARKETS)} markets"
    )
    return organizer


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="delete and recreate")
    args = parser.parse_args()
    _assert_not_production()
    db = SessionLocal()
    try:
        seed_organizer(db, refresh=args.refresh)
    finally:
        db.close()


if __name__ == "__main__":
    main()
