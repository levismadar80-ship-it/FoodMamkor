"""
Module:   chat_intent_router
Purpose:  Decide, per user message, whether the site chat should answer from
          live data (one of four bounded DB tools) or from the fixed
          system-prompt knowledge. One cheap Haiku call with a structured-
          output schema; anything unexpected resolves to "freeform".
Touches:  Anthropic (one fast-tier messages.create per routed message).
Does NOT: run SQL (chat_db_tools.py), compose the final answer or rate-limit
          (routers/chat.py), hold canned FAQ copy — that lives in
          frontend/messages/he.json `chat.answers` (MEH-1617) and the fixed
          knowledge is already inside routers/chat.py SYSTEM_PROMPT, so the
          spec's `hardcoded_faq` route collapses into `freeform` here
          (MEH-586 decision 4).
Related:  app/config.py:264 ai_fast_request_kwargs(json_schema=...) (MEH-2351);
          services/home_product_moderation.py:40 (client init pattern);
          services/chat_db_tools.py TOOL_NAMES (the only names accepted).
History:  MEH-586 (creation).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.config import ai_fast_request_kwargs
from app.services.chat_db_tools import TOOL_NAMES

logger = logging.getLogger(__name__)

ROUTE_DB = "db_query"
ROUTE_FREEFORM = "freeform"
ROUTES = (ROUTE_DB, ROUTE_FREEFORM)

#: Output budget for the classifier: a short JSON object, nothing else.
MAX_CLASSIFY_TOKENS = 120


@dataclass(frozen=True)
class RouteDecision:
    route: str = ROUTE_FREEFORM
    tool: str | None = None
    params: dict[str, Any] = field(default_factory=dict)


FREEFORM = RouteDecision()


# The schema is what makes the call safe: the API guarantees JSON valid
# against it, so `route` and `tool` are enums, not free text, and the
# only free-text fields are the two the SQL layer binds as parameters.
ROUTE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "route": {"type": "string", "enum": list(ROUTES)},
        "tool": {"type": ["string", "null"], "enum": [*TOOL_NAMES, None]},
        "city": {"type": ["string", "null"]},
        "category_slug": {"type": ["string", "null"]},
        "limit": {"type": ["integer", "null"]},
    },
    "required": ["route", "tool", "city", "category_slug", "limit"],
    "additionalProperties": False,
}


def _classifier_prompt(categories: list[dict[str, str]]) -> str:
    cats = ", ".join(f"{c['name']} ({c['slug']})" for c in categories) or "(none)"
    return (
        "You route questions for the mehamakor.online chat. Answer ONLY with "
        "the JSON object described by the schema.\n"
        "route=db_query when the question needs CURRENT site data: how many "
        "businesses exist (overall or in a city), which businesses of a "
        "category exist (optionally in a city), site statistics, or upcoming "
        "markets/events (optionally in a city). route=freeform for everything "
        "else: how the site works, registration, approval, contact, pricing, "
        "greetings, or anything unrelated.\n"
        "Tools: count_producers_in_city(city) · "
        "list_producers_by_category(category_slug, city?) · get_site_stats() · "
        "list_upcoming_events(city?).\n"
        f"Known category slugs (pick the slug, never invent one): {cats}.\n"
        "city: the city exactly as the user wrote it in Hebrew, else null. "
        "Set tool=null and all parameters null when route=freeform."
    )


def decision_from_parsed(
    parsed: dict[str, Any], known_slugs: set[str] | None = None
) -> RouteDecision:
    """Pure validation of a classifier payload. Anything that is not a known
    route + known tool + usable parameters is freeform — the SQL layer never
    sees an unvalidated tool name or slug."""
    if not isinstance(parsed, dict) or parsed.get("route") != ROUTE_DB:
        return FREEFORM
    tool = parsed.get("tool")
    if tool not in TOOL_NAMES:
        return FREEFORM
    city = parsed.get("city")
    city = city.strip() if isinstance(city, str) and city.strip() else None
    slug = parsed.get("category_slug")
    slug = slug.strip() if isinstance(slug, str) and slug.strip() else None
    limit = parsed.get("limit") if isinstance(parsed.get("limit"), int) else None

    if tool == "count_producers_in_city" and not city:
        return FREEFORM
    if tool == "list_producers_by_category" and (
        not slug or (known_slugs is not None and slug not in known_slugs)
    ):
        return FREEFORM
    params: dict[str, Any] = {}
    if city:
        params["city"] = city
    if slug and tool == "list_producers_by_category":
        params["category_slug"] = slug
    if limit:
        params["limit"] = limit
    return RouteDecision(route=ROUTE_DB, tool=tool, params=params)


def classify(
    client: Any, message: str, categories: list[dict[str, str]]
) -> RouteDecision:
    """One Haiku call → RouteDecision. Every failure path is freeform."""
    if client is None or not message or not message.strip():
        return FREEFORM
    try:
        response = client.messages.create(
            **ai_fast_request_kwargs(json_schema=ROUTE_SCHEMA),
            max_tokens=MAX_CLASSIFY_TOKENS,
            system=_classifier_prompt(categories),
            messages=[{"role": "user", "content": message[:2000]}],
        )
        raw = next((b.text for b in response.content if b.type == "text"), "")
        parsed = json.loads(raw) if raw else {}
    except Exception as exc:  # noqa: BLE001 — fail-open boundary, logged
        logger.warning("chat intent router failed (%s): %s", type(exc).__name__, exc)
        return FREEFORM
    return decision_from_parsed(parsed, {c["slug"] for c in categories})


__all__ = [
    "FREEFORM",
    "ROUTE_DB",
    "ROUTE_FREEFORM",
    "ROUTE_SCHEMA",
    "RouteDecision",
    "classify",
    "decision_from_parsed",
]
