"""MEH-586: the chat's four bounded read-only DB tools + the mcp_reader role.

4 happy-path tests, 3 injection-attempt tests, and one role test proving an
INSERT under `SET LOCAL ROLE mcp_reader` is denied. The test schema comes
from create_all (no migration run), so the module fixture applies the DDL
mirror `chat_db_tools.READER_ROLE_SQL` — the same statements as revision
a29c7a4a41e7.
"""

from datetime import timedelta

import pytest
from sqlalchemy import text
from tests.conftest import make_producer

from app.models.models import Category, Event, ProducerCategory, ProducerLocation
from app.services import chat_db_tools
from app.utils.clock import israel_today

INJECTION = "'; DROP TABLE producers; --"


@pytest.fixture(scope="module", autouse=True)
def _reader_role():
    # Roles are cluster-wide, grants are per-database: both statements are
    # idempotent, so this is safe under xdist and on a re-run.
    with chat_db_tools.engine.connect() as conn, conn.begin():
        for stmt in chat_db_tools.READER_ROLE_SQL:
            conn.execute(text(stmt))
    yield


def _category(db, name: str, slug: str) -> Category:
    cat = Category(name=name, emoji="🥬", slug=slug)
    db.add(cat)
    db.flush()
    return cat


def _attach(db, producer, category) -> None:
    db.add(ProducerCategory(producer_id=producer.id, category_id=category.id))
    db.commit()


# ---------- happy paths ----------


def test_count_producers_in_city_counts_market_stands_too(db):
    make_producer(db, name="מאפיית כרמיאל", city="כרמיאל")
    lotem = make_producer(db, name="גבינות לוטם", city="לוטם")
    db.add(
        ProducerLocation(
            producer_id=lotem.id, kind="market_stand", city="חיפה", label="שוק תלפיות"
        )
    )
    make_producer(db, name="ממתין", city="חיפה", status="pending")
    db.commit()

    assert chat_db_tools.count_producers_in_city("חיפה") == {"city": "חיפה", "count": 1}
    assert chat_db_tools.count_producers_in_city("כרמיאל")["count"] == 1
    assert chat_db_tools.count_producers_in_city("  לוטם ")["count"] == 1
    assert chat_db_tools.count_producers_in_city("אילת")["count"] == 0


def test_list_producers_by_category_with_city_finds_stand_city(db):
    bread = _category(db, "לחם מחמצת", "sourdough")
    lotem = make_producer(db, name="לחם לוטם", city="לוטם")
    _attach(db, lotem, bread)
    db.add(ProducerLocation(producer_id=lotem.id, kind="market_stand", city="תל אביב"))
    other = make_producer(db, name="לחם ירושלים", city="ירושלים")
    _attach(db, other, bread)

    everywhere = chat_db_tools.list_producers_by_category("sourdough")
    assert [r["name"] for r in everywhere["results"]] == ["לחם ירושלים", "לחם לוטם"]

    tlv = chat_db_tools.list_producers_by_category("sourdough", city="תל אביב")
    assert [r["name"] for r in tlv["results"]] == ["לחם לוטם"]
    assert tlv["results"][0]["market_stands"] == 1

    assert (
        chat_db_tools.list_producers_by_category("sourdough", limit=1)["results"][0][
            "name"
        ]
        == "לחם ירושלים"
    )
    assert chat_db_tools.list_producers_by_category("no-such-slug")["results"] == []


def test_get_site_stats_counts_only_approved(db):
    cheese = _category(db, "גבינות", "cheese")
    a = make_producer(db, name="א", city="חיפה")
    _attach(db, a, cheese)
    make_producer(db, name="ב", city="חיפה")
    make_producer(db, name="טיוטה", city="אילת", status="draft")
    db.add(
        Event(
            producer_id=a.id,
            title="שוק",
            event_date=israel_today() + timedelta(days=1),
            category="שוק",
            is_active=True,
        )
    )
    db.commit()

    stats = chat_db_tools.get_site_stats()
    assert stats == {
        "approved_producers": 2,
        "cities": 1,
        "categories_in_use": 1,
        "upcoming_events": 1,
    }


def test_list_upcoming_events_filters_past_inactive_pending_and_city(db):
    approved = make_producer(db, name="חווה", city="חיפה")
    pending = make_producer(db, name="ממתין", city="חיפה", status="pending")
    today = israel_today()
    rows = [
        Event(
            producer_id=approved.id,
            title="מחר בחיפה",
            event_date=today + timedelta(days=1),
            city="חיפה",
            category="שוק",
            is_active=True,
        ),
        Event(
            producer_id=approved.id,
            title="היום",
            event_date=today,
            city="תל אביב",
            category="קטיף",
            is_active=True,
        ),
        Event(
            producer_id=approved.id,
            title="אתמול",
            event_date=today - timedelta(days=1),
            city="חיפה",
            category="שוק",
            is_active=True,
        ),
        Event(
            producer_id=approved.id,
            title="מבוטל",
            event_date=today + timedelta(days=2),
            city="חיפה",
            category="שוק",
            is_active=False,
        ),
        Event(
            producer_id=pending.id,
            title="של ממתין",
            event_date=today + timedelta(days=2),
            city="חיפה",
            category="שוק",
            is_active=True,
        ),
    ]
    db.add_all(rows)
    db.commit()

    all_events = chat_db_tools.list_upcoming_events()
    assert [e["title"] for e in all_events["results"]] == ["היום", "מחר בחיפה"]
    assert all_events["results"][0]["date"] == today.isoformat()
    assert all_events["results"][0]["producer"] == "חווה"

    haifa = chat_db_tools.list_upcoming_events(city="חיפה")
    assert [e["title"] for e in haifa["results"]] == ["מחר בחיפה"]


# ---------- injection attempts: bound parameters, empty results, no error ----------


def test_injection_in_city_is_just_a_city_name(db):
    make_producer(db, name="חווה", city="חיפה")
    assert chat_db_tools.count_producers_in_city(INJECTION)["count"] == 0
    assert chat_db_tools.list_upcoming_events(city=INJECTION)["results"] == []
    with chat_db_tools.engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM producers")).scalar_one() == 1


def test_injection_in_category_slug_returns_empty(db):
    bread = _category(db, "לחם", "bread")
    _attach(db, make_producer(db, name="לחם", city="חיפה"), bread)
    out = chat_db_tools.list_producers_by_category(INJECTION, city=INJECTION)
    assert out["results"] == []
    with chat_db_tools.engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM producers")).scalar_one() == 1


def test_run_tool_rejects_unknown_tool_and_clamps_limit(db):
    make_producer(db, name="חווה", city="חיפה")
    with pytest.raises(chat_db_tools.ChatDbToolError):
        chat_db_tools.run_tool("DROP TABLE producers", {})
    # Oversized / garbage limits never reach SQL unclamped.
    assert chat_db_tools._clamp_limit(10_000) == chat_db_tools.MAX_LIMIT
    assert chat_db_tools._clamp_limit(-5) == 1
    assert chat_db_tools._clamp_limit("abc") == chat_db_tools.DEFAULT_LIMIT
    assert (
        chat_db_tools.run_tool("list_upcoming_events", {"limit": 10_000})["results"]
        == []
    )


# ---------- the role itself ----------


def test_mcp_reader_cannot_write(db):
    # READ ONLY rejects the write before the role's grants are even consulted;
    # either message proves the boundary, both are asserted below.
    with (
        pytest.raises(
            chat_db_tools.ChatDbToolError, match="read-only|permission denied"
        ),
        chat_db_tools.reader_transaction() as conn,
    ):
        conn.execute(
            text("INSERT INTO categories (name, emoji, slug) VALUES ('x', 'y', 'z')")
        )
    with chat_db_tools.engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM categories")).scalar_one() == 0


def test_mcp_reader_cannot_read_users(db):
    with (
        pytest.raises(chat_db_tools.ChatDbToolError, match="permission denied"),
        chat_db_tools.reader_transaction() as conn,
    ):
        conn.execute(text("SELECT COUNT(*) FROM users"))
