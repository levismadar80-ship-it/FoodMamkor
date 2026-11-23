# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3478 PR)
"""
Module:   group_suggester
Purpose:  Suggest product groups for a business's ungrouped products with
          Claude, from their names. The owner sees the suggestion, edits it,
          and only her approval saves anything.
Touches:  The Anthropic API only. No DB writes.
Does NOT: save groups or move products (routers/product_organize.py
          PUT product-groups + PUT product-groups/assign do, after approval),
          touch a product that already has a group, or rename an existing group.
Related:  services/menu_reader.py (same client pattern and model);
          services/product_import.py:_group_name (one group-name rule);
          app/limits.py MAX_PRODUCT_GROUPS.
History:  MEH-3478 (creation)

Fail-open: suggest() returns None when ANTHROPIC_API_KEY is missing or the
call fails, and the route answers 503. The owner can always group by hand.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.config import AI_MENU_MODEL
from app.services import ai_budget
from app.services.menu_reader import (
    _get_client,
)  # REUSES: one Anthropic client, http_client lock
from app.services.product_import import _group_name

logger = logging.getLogger(__name__)

_NAME_MAX = 120  # per product name sent to the model

_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "items": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["name", "items"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["groups"],
    "additionalProperties": False,
}

_PROMPT = """You sort the products of a small Israeli food business into groups \
for its page, the way a shop arranges its shelves (for example: לחמים, עוגות, \
מארזים, גבינות, ירקות).

Products (number. name):
{products}

Groups the business already has (reuse one by its exact name when a product fits it):
{existing}

Rules:
- Group names are short Hebrew shelf names, 1–3 words, at most 40 characters, \
unless the products themselves are named in another language.
- At most {room} NEW groups. Prefer fewer, broader groups; a group of one is \
fine only when the product clearly stands apart.
- Each product number appears in at most one group.
- Leave a product out when you are not sure where it belongs.
- Never invent products; use only the numbers listed."""


def _ask(names: list[str], existing: list[str], room: int) -> dict[str, Any] | None:
    """One call to the model. None = could not ask or could not read the answer."""
    client = _get_client()
    if client is None or not ai_budget.allow("menu"):  # MEH-3498
        return None
    prompt = _PROMPT.format(
        products="\n".join(
            f"{i}. {n[:_NAME_MAX]}" for i, n in enumerate(names, start=1)
        ),
        existing="\n".join(existing) or "(none)",
        room=room,
    )
    try:
        response = client.messages.create(
            model=AI_MENU_MODEL,
            max_tokens=4000,
            output_config={"format": {"type": "json_schema", "schema": _SCHEMA}},
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        logger.warning("[groups] suggest failed: %s", type(exc).__name__)
        return None
    if response.stop_reason != "end_turn":
        logger.warning("[groups] suggest stopped: %s", response.stop_reason)
        return None
    text = next(
        (b.text for b in response.content if getattr(b, "type", "") == "text"), ""
    )
    try:
        answer = json.loads(text)
    except ValueError:
        logger.warning("[groups] unparsable answer")
        return None
    return answer if isinstance(answer, dict) else None


def _items(raw: object, size: int, placed: set[int]) -> list[int]:
    """1-based numbers in range, not placed yet, each once."""
    if not isinstance(raw, list):
        return []
    out: list[int] = []
    for n in raw:
        if (
            isinstance(n, int)
            and not isinstance(n, bool)
            and 1 <= n <= size
            and n not in placed
        ):
            placed.add(n)
            out.append(n)
    return out


def to_suggestion(
    answer: object, product_ids: list[str], groups: list[dict[str, str]], room: int
) -> list[dict[str, Any]]:
    """Model answer → groups the owner can trust the shape of.

    A name the owner could not have typed is dropped (its products stay
    ungrouped); names that differ only in case or spacing merge; a name equal
    to an existing group maps to that group's id; at most `room` new groups;
    a group left with no products is dropped."""
    raw = answer.get("groups") if isinstance(answer, dict) else None
    if not isinstance(raw, list):
        return []
    existing = {g["name"].strip().casefold(): g["id"] for g in groups}
    out: dict[str, dict[str, Any]] = {}
    placed: set[int] = set()
    for g in raw:
        if not isinstance(g, dict) or not isinstance(g.get("name"), str):
            continue
        name, _ = _group_name(g["name"])
        if not name:
            continue
        key = name.strip().casefold()
        gid = existing.get(key)
        new_count = sum(1 for s in out.values() if s["id"] is None)
        if key not in out and gid is None and new_count >= room:
            continue
        items = _items(g.get("items"), len(product_ids), placed)
        if not items:
            continue
        slot = out.setdefault(key, {"id": gid, "name": name, "product_ids": []})
        slot["product_ids"].extend(product_ids[n - 1] for n in items)
    return list(out.values())


def suggest(
    names: list[str], product_ids: list[str], groups: list[dict[str, str]], room: int
) -> list[dict[str, Any]] | None:
    """None = the model could not be asked or answered unreadably."""
    if not names:
        return []
    answer = _ask(names, [g["name"] for g in groups], room)
    if answer is None:
        return None
    return to_suggestion(answer, product_ids, groups, room)
