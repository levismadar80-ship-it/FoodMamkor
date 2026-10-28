"""
Module:   chat_db_tools
Purpose:  Four bounded, parametrized, read-only Postgres queries the site chat
          can run to answer live-data questions (counts, producers by
          category/city, site stats, upcoming events). The LLM never writes
          SQL — it only picks a tool and fills typed parameters.
Touches:  DB tables producers, categories, producer_categories,
          producer_locations, events — SELECT only, under the `mcp_reader`
          role (migration a29c7a4a41e7) inside a READ ONLY transaction with
          statement_timeout = 5s.
Does NOT: classify intent (chat_intent_router.py), format the answer or
          rate-limit (routers/chat.py), own the role DDL (the Alembic
          revision does; READER_ROLE_SQL here is the test-fixture mirror).
Related:  routers/events.py:81-114 (upcoming-events predicate reused here);
          services/producer_queries.py:51 (producer_locations access pattern);
          routers/chat.py (caller).
History:  MEH-586 (creation, Chatbot v2 hybrid live-data).
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.database import engine
from app.utils.clock import israel_today

logger = logging.getLogger(__name__)

#: Postgres role every tool runs as. NOLOGIN: the app connects as its own
#: user and switches with SET LOCAL ROLE for the duration of one read-only
#: transaction. Same privilege boundary as a separate login user, with no
#: second credential to provision (MEH-586 decision 1, 27/10).
READER_ROLE = "mcp_reader"

#: Exactly the columns the four tools read — COLUMN-level grants, so the
#: privilege layer itself keeps producers.phone / contact_email /
#: contact_name / address / whatsapp_group out of reach, not just the fixed
#: SQL below. No users / home_products / reports at all. Adding a column to
#: a tool query means adding it here AND in the migration (the drift test in
#: tests/test_chat_db_tools.py compares the two).
READER_COLUMNS: dict[str, tuple[str, ...]] = {
    "producers": ("id", "name", "city", "slug", "status", "kind"),
    "categories": ("id", "name", "slug"),
    "producer_categories": ("producer_id", "category_id"),
    "producer_locations": ("producer_id", "kind", "city"),
    "events": (
        "producer_id",
        "title",
        "event_date",
        "event_time",
        "city",
        "location",
        "category",
        "is_active",
    ),
}

#: One GRANT per table, byte-identical to the migration's GRANTS tuple.
READER_GRANTS = tuple(
    f"GRANT SELECT ({', '.join(cols)}) ON {table} TO {READER_ROLE}"
    for table, cols in READER_COLUMNS.items()
)

#: Hard ceiling on statement time. The card says 5s, no exception.
STATEMENT_TIMEOUT_MS = 5000

#: Row-count clamp for list tools. The LLM may ask for fewer, never more.
MAX_LIMIT = 20
DEFAULT_LIMIT = 10

#: Names the intent router is allowed to pick. Anything else → freeform.
TOOL_NAMES = (
    "count_producers_in_city",
    "list_producers_by_category",
    "get_site_stats",
    "list_upcoming_events",
)

#: DDL mirror of migration a29c7a4a41e7, for the pytest fixture only (the
#: test schema comes from create_all, which creates no roles and no grants).
#: Idempotent AND race-safe: the role is cluster-wide, and CI's `-n auto`
#: workers (one database each, one cluster) can create it at the same
#: instant. A committed role raises duplicate_object; two creations racing
#: raise unique_violation on pg_authid_rolname_index — both are absorbed
#: (reproduced with 8 synchronised sessions, round-2 review 28/10).
# DO NOT import this from the migration — revisions stay self-contained.
READER_ROLE_SQL = (
    f"""
    DO $$
    BEGIN
        CREATE ROLE {READER_ROLE} NOLOGIN;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END
    $$;
    """,
    f"GRANT USAGE ON SCHEMA public TO {READER_ROLE}",
    *READER_GRANTS,
    f"""
    DO $$
    BEGIN
        GRANT {READER_ROLE} TO CURRENT_USER;
    EXCEPTION WHEN unique_violation OR duplicate_object THEN NULL;
    END
    $$;
    """,
)


class ChatDbToolError(RuntimeError):
    """Raised for any failure inside a tool. The caller falls open to the
    freeform chat flow — never a 5xx to the widget."""


@contextmanager
def reader_transaction() -> Iterator[Connection]:
    """One READ ONLY transaction as `mcp_reader` with a 5s statement cap.

    SET LOCAL scopes all three settings to this transaction, so the pooled
    connection returns to the pool untouched. Any exception rolls back and
    surfaces as ChatDbToolError.
    """
    try:
        with engine.connect() as conn, conn.begin():
            conn.execute(text("SET TRANSACTION READ ONLY"))
            conn.execute(text(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}"))
            conn.execute(text(f"SET LOCAL ROLE {READER_ROLE}"))
            yield conn
    except ChatDbToolError:
        raise
    except Exception as exc:
        logger.warning("chat_db_tools: query failed (%s): %s", type(exc).__name__, exc)
        raise ChatDbToolError(str(exc)) from exc


def _clamp_limit(limit: int | None) -> int:
    try:
        value = int(limit) if limit is not None else DEFAULT_LIMIT
    except (TypeError, ValueError):
        value = DEFAULT_LIMIT
    return max(1, min(value, MAX_LIMIT))


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned[:100] or None


# ADR-036 / MEH-2459: a business is `status='approved' AND kind='producer'`.
# An organizer row (kind='organizer', e.g. a market organizer) is a Producer
# only so its events have an owner; it is never counted or listed as a
# business. Mirrors producer_listing.is_business() — the events tool below
# deliberately does NOT use it (organizer events are the point of the kind).
# REUSES: backend/app/services/producer_listing.py:114
_IS_BUSINESS = "p.status = 'approved' AND p.kind = 'producer'"

# A producer "is in" a city when its own city matches OR any of its
# location rows (branch / pickup / market_stand) is in that city — so a
# business from Lotem with a market stand in Tel Aviv is found for "תל אביב"
# (MEH-586 decision 3). Exact match on the trimmed value; the router passes
# the city as the user wrote it.
_IN_CITY = """
    (p.city = :city OR EXISTS (
        SELECT 1 FROM producer_locations pl
        WHERE pl.producer_id = p.id AND pl.city = :city
    ))
"""


def count_producers_in_city(city: str) -> dict[str, Any]:
    city_value = _clean(city)
    if not city_value:
        return {"city": None, "count": 0}
    with reader_transaction() as conn:
        count = conn.execute(
            text(
                f"""
                SELECT COUNT(*) FROM producers p
                WHERE {_IS_BUSINESS} AND {_IN_CITY}
                """
            ),
            {"city": city_value},
        ).scalar_one()
    return {"city": city_value, "count": int(count)}


def list_producers_by_category(
    category_slug: str, city: str | None = None, limit: int | None = None
) -> dict[str, Any]:
    slug = _clean(category_slug)
    city_value = _clean(city)
    rows_limit = _clamp_limit(limit)
    if not slug:
        return {"category": None, "city": city_value, "results": []}
    city_clause = f"AND {_IN_CITY}" if city_value else ""
    params: dict[str, Any] = {"slug": slug, "limit": rows_limit}
    if city_value:
        params["city"] = city_value
    with reader_transaction() as conn:
        rows = (
            conn.execute(
                text(
                    f"""
                SELECT p.name, p.city, p.slug AS producer_slug,
                       c.name AS category_name,
                       (SELECT COUNT(*) FROM producer_locations pl
                        WHERE pl.producer_id = p.id AND pl.kind = 'market_stand')
                       AS market_stands
                FROM producers p
                JOIN producer_categories pc ON pc.producer_id = p.id
                JOIN categories c ON c.id = pc.category_id
                WHERE {_IS_BUSINESS} AND c.slug = :slug {city_clause}
                ORDER BY p.name
                LIMIT :limit
                """
                ),
                params,
            )
            .mappings()
            .all()
        )
    return {
        "category": slug,
        "city": city_value,
        "results": [
            {
                "name": r["name"],
                "city": r["city"],
                "slug": r["producer_slug"],
                "category": r["category_name"],
                "market_stands": int(r["market_stands"] or 0),
            }
            for r in rows
        ],
    }


def get_site_stats() -> dict[str, Any]:
    with reader_transaction() as conn:
        producers = conn.execute(
            text(f"SELECT COUNT(*) FROM producers p WHERE {_IS_BUSINESS}")
        ).scalar_one()
        cities = conn.execute(
            text(
                f"""
                SELECT COUNT(DISTINCT p.city) FROM producers p
                WHERE {_IS_BUSINESS} AND p.city IS NOT NULL AND p.city <> ''
                """
            )
        ).scalar_one()
        categories = conn.execute(
            text(
                f"""
                SELECT COUNT(DISTINCT pc.category_id)
                FROM producer_categories pc
                JOIN producers p ON p.id = pc.producer_id
                WHERE {_IS_BUSINESS}
                """
            )
        ).scalar_one()
        events = conn.execute(
            text(
                """
                SELECT COUNT(*) FROM events e
                JOIN producers p ON p.id = e.producer_id
                WHERE e.is_active IS TRUE AND p.status = 'approved'
                  AND e.event_date >= :today
                """
            ),
            {"today": israel_today()},
        ).scalar_one()
    return {
        "approved_producers": int(producers),
        "cities": int(cities),
        "categories_in_use": int(categories),
        "upcoming_events": int(events),
    }


def list_upcoming_events(
    city: str | None = None, limit: int | None = None
) -> dict[str, Any]:
    # REUSES: backend/app/routers/events.py:81-114 — is_active + approved
    # producer + event_date >= israel_today() (MEH-1883 Israel calendar).
    city_value = _clean(city)
    rows_limit = _clamp_limit(limit)
    city_clause = "AND e.city = :city" if city_value else ""
    params: dict[str, Any] = {"today": israel_today(), "limit": rows_limit}
    if city_value:
        params["city"] = city_value
    with reader_transaction() as conn:
        rows = (
            conn.execute(
                text(
                    f"""
                SELECT e.title, e.event_date, e.event_time, e.city, e.location,
                       e.category, p.name AS producer_name
                FROM events e
                JOIN producers p ON p.id = e.producer_id
                WHERE e.is_active IS TRUE AND p.status = 'approved'
                  AND e.event_date >= :today {city_clause}
                ORDER BY e.event_date, e.event_time NULLS LAST
                LIMIT :limit
                """
                ),
                params,
            )
            .mappings()
            .all()
        )
    return {
        "city": city_value,
        "results": [
            {
                "title": r["title"],
                "date": r["event_date"].isoformat(),
                "time": r["event_time"].strftime("%H:%M") if r["event_time"] else None,
                "city": r["city"],
                "location": r["location"],
                "category": r["category"],
                "producer": r["producer_name"],
            }
            for r in rows
        ],
    }


def list_category_slugs() -> list[dict[str, str]]:
    """Category name + slug pairs the router may choose from (MEH-2139: slug
    is the stable identity). Read under the same role; empty on failure."""
    try:
        with reader_transaction() as conn:
            rows = (
                conn.execute(text("SELECT name, slug FROM categories ORDER BY name"))
                .mappings()
                .all()
            )
    except ChatDbToolError:
        return []
    return [{"name": r["name"], "slug": r["slug"]} for r in rows if r["slug"]]


def run_tool(name: str, params: dict[str, Any]) -> dict[str, Any]:
    """Dispatch by validated tool name. Unknown names never reach SQL."""
    if name == "count_producers_in_city":
        return count_producers_in_city(params.get("city") or "")
    if name == "list_producers_by_category":
        return list_producers_by_category(
            params.get("category_slug") or "", params.get("city"), params.get("limit")
        )
    if name == "get_site_stats":
        return get_site_stats()
    if name == "list_upcoming_events":
        return list_upcoming_events(params.get("city"), params.get("limit"))
    raise ChatDbToolError(f"unknown tool {name!r}")
