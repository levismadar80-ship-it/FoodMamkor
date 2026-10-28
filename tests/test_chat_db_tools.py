"""MEH-586: the chat's four bounded read-only DB tools + the mcp_reader role.

4 happy-path tests, 3 injection-attempt tests, role tests proving writes,
`users` and the PII columns of `producers` are denied, and a drift test
pinning the grant mirror to the migration. The test schema comes from
create_all (no migration run), so the fixture applies the DDL mirror
`chat_db_tools.READER_ROLE_SQL` — the same grants as revision a29c7a4a41e7.
"""

import re
import time
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from tests.conftest import make_producer

from app.models.models import Category, Event, ProducerCategory, ProducerLocation
from app.services import chat_db_tools
from app.utils.clock import israel_today

INJECTION = "'; DROP TABLE producers; --"
MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "backend/alembic/versions/20261028_1200_a29c7a4a41e7_meh586_mcp_reader_role.py"
)


@pytest.fixture(autouse=True)
def _reader_role():
    # Function-scoped on purpose: test_lifespan_init's `empty_database` runs
    # drop_all, and a DROP TABLE takes its grants with it, so a module-scoped
    # grant could be gone by the next test on the same xdist worker.
    # Retried defensively on "tuple concurrently updated". Round-2 review
    # (28/10) saw it only when sessions share ONE database, which CI's
    # per-worker databases avoid; the cluster-wide role race is handled in
    # READER_ROLE_SQL itself. The match is narrow, so no other error is
    # swallowed.
    for attempt in range(5):
        try:
            with chat_db_tools.engine.connect() as conn, conn.begin():
                for stmt in chat_db_tools.READER_ROLE_SQL:
                    conn.execute(text(stmt))
            break
        except DBAPIError as exc:
            if "concurrently" not in str(exc) or attempt == 4:
                raise
            time.sleep(0.05 * (attempt + 1))
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


def test_organizer_is_not_a_business_but_its_events_are_visible(db):
    # ADR-036 (MEH-2459): kind='organizer' rows exist only to own events. The
    # three business tools must not count or list them; the events tool must.
    # Shown red against the pre-ADR filter (status='approved' alone): the
    # organizer below is approved, so counts would read 2 / 1 and the slug
    # listing would include «שוק גלם».
    bread = _category(db, "לחם", "bread")
    business = make_producer(db, name="לחם לוטם", city="תל אביב")
    _attach(db, business, bread)
    organizer = make_producer(db, name="שוק גלם", city="תל אביב")
    organizer.kind = "organizer"
    db.add(ProducerCategory(producer_id=organizer.id, category_id=bread.id))
    db.add(
        Event(
            producer_id=organizer.id,
            title="שוק גלם בנמל",
            event_date=israel_today() + timedelta(days=3),
            city="תל אביב",
            category="שוק",
            is_active=True,
        )
    )
    db.commit()

    assert chat_db_tools.count_producers_in_city("תל אביב")["count"] == 1
    names = [
        r["name"] for r in chat_db_tools.list_producers_by_category("bread")["results"]
    ]
    assert names == ["לחם לוטם"]
    stats = chat_db_tools.get_site_stats()
    assert (
        stats["approved_producers"],
        stats["cities"],
        stats["categories_in_use"],
    ) == (1, 1, 1)
    # ...and the organizer's market is exactly what the events tool is for.
    assert stats["upcoming_events"] == 1
    events = chat_db_tools.list_upcoming_events(city="תל אביב")["results"]
    assert [(e["title"], e["producer"]) for e in events] == [
        ("שוק גלם בנמל", "שוק גלם")
    ]


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


def test_oversized_limit_reaches_sql_clamped(db):
    # Seeds MORE rows than MAX_LIMIT, so an unclamped LIMIT 10000 would return
    # all of them — the count below can only be MAX_LIMIT if the clamp ran.
    producer = make_producer(db, name="חווה", city="חיפה")
    tomorrow = israel_today() + timedelta(days=1)
    db.add_all(
        Event(
            producer_id=producer.id,
            title=f"שוק {i}",
            event_date=tomorrow,
            category="שוק",
            is_active=True,
        )
        for i in range(chat_db_tools.MAX_LIMIT + 5)
    )
    db.commit()
    out = chat_db_tools.run_tool("list_upcoming_events", {"limit": 10_000})
    assert len(out["results"]) == chat_db_tools.MAX_LIMIT


# ---------- the role itself ----------


def test_mcp_reader_cannot_write(db):
    # Through the real tool path: READ ONLY rejects the write first.
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


def test_mcp_reader_grants_alone_deny_writes(db):
    # Second layer, without READ ONLY: the role's grants by themselves refuse
    # the INSERT, so dropping READ ONLY by mistake would not open writes.
    with (
        pytest.raises(DBAPIError, match="permission denied"),
        chat_db_tools.engine.connect() as conn,
        conn.begin(),
    ):
        conn.execute(text(f"SET LOCAL ROLE {chat_db_tools.READER_ROLE}"))
        conn.execute(
            text("INSERT INTO categories (name, emoji, slug) VALUES ('x', 'y', 'z')")
        )


@pytest.mark.parametrize(
    "column", ["phone", "contact_email", "contact_name", "address", "whatsapp_group"]
)
def test_mcp_reader_cannot_read_producer_pii(db, column):
    make_producer(db, name="חווה", city="חיפה")
    # Positive control: the role CAN read a granted column of the same table,
    # so the denial below is the column boundary, not a role with no grants.
    with chat_db_tools.reader_transaction() as conn:
        assert conn.execute(text("SELECT name FROM producers")).scalar_one() == "חווה"
        assert (
            conn.execute(text("SELECT kind FROM producers")).scalar_one() == "producer"
        )
    with (
        pytest.raises(chat_db_tools.ChatDbToolError, match="permission denied"),
        chat_db_tools.reader_transaction() as conn,
    ):
        conn.execute(text(f"SELECT {column} FROM producers"))


def test_grant_mirror_matches_migration():
    # READER_ROLE_SQL is what the tests run; the migration is what production
    # runs. Every grant must appear verbatim in both, in both directions.
    src = MIGRATION.read_text(encoding="utf-8")
    block = re.search(r"GRANTS = \((.*?)\n\)", src, re.DOTALL).group(1)
    migration_grants = tuple(
        "".join(re.findall(r'"([^"]*)"', entry))
        for entry in re.split(r",\n", block.strip())
        if entry.strip()
    )
    assert migration_grants == chat_db_tools.READER_GRANTS
    # ...and upgrade() must actually execute that tuple, not a table-level
    # GRANT that would bypass it.
    upgrade_body = src.split("def upgrade()", 1)[1].split("def downgrade()", 1)[0]
    assert "for grant in GRANTS" in upgrade_body
    assert "GRANT SELECT ON" not in upgrade_body
