"""MEH-586: the staging seed for a market organizer (ADR-036) is idempotent,
refreshable, and produces exactly the shape the hybrid chat must handle —
invisible to the three business tools, visible to the events tool.

Runs the real script function against the test DB (local host → the
production guard lets it through), then reads back through chat_db_tools
under the mcp_reader role, so this is also an end-to-end check of the
organizer exclusion on a row shaped like the one staging will carry.
"""

import importlib.util
import sys
from pathlib import Path

from sqlalchemy import text
from tests.conftest import make_producer

from app.models.models import Event, Producer
from app.services import chat_db_tools

SCRIPT = Path(__file__).resolve().parents[1] / "backend/scripts/seed_organizer_demo.py"


def _load():
    spec = importlib.util.spec_from_file_location("seed_organizer_demo", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def _grant_reader_role():
    with chat_db_tools.engine.connect() as conn, conn.begin():
        for stmt in chat_db_tools.READER_ROLE_SQL:
            conn.execute(text(stmt))


def test_seed_is_idempotent_and_refresh_recreates(db):
    seed = _load()
    first = seed.seed_organizer(db)
    again = seed.seed_organizer(db)
    assert again.id == first.id
    assert db.query(Producer).filter(Producer.slug == seed.ORGANIZER_SLUG).count() == 1
    assert db.query(Event).filter(Event.producer_id == first.id).count() == len(
        seed.MARKETS
    )

    refreshed = seed.seed_organizer(db, refresh=True)
    assert refreshed.id != first.id
    assert db.query(Producer).filter(Producer.slug == seed.ORGANIZER_SLUG).count() == 1
    assert db.query(Event).filter(Event.producer_id == first.id).count() == 0
    assert db.query(Event).filter(Event.producer_id == refreshed.id).count() == len(
        seed.MARKETS
    )


def test_seeded_organizer_is_hidden_from_business_tools_but_markets_show(db):
    _grant_reader_role()
    seed = _load()
    make_producer(db, name="לחם לוטם", city="תל אביב")  # one real business, same city
    organizer = seed.seed_organizer(db)
    assert organizer.kind == "organizer" and organizer.status == "approved"

    # Business surfaces: the organizer does not exist.
    assert chat_db_tools.count_producers_in_city("תל אביב")["count"] == 1
    stats = chat_db_tools.get_site_stats()
    assert stats["approved_producers"] == 1
    assert stats["upcoming_events"] == len(seed.MARKETS)

    # Events surface: both markets, soonest first, attributed to the organizer.
    events = chat_db_tools.list_upcoming_events()["results"]
    assert [e["title"] for e in events] == [m["title"] for m in seed.MARKETS]
    assert {e["producer"] for e in events} == {"שוק גלם"}
    haifa = chat_db_tools.list_upcoming_events(city="חיפה")["results"]
    assert [e["title"] for e in haifa] == ["שוק גלם בחיפה"]
