# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3479 PR)
"""
Module:   description_writer
Purpose:  Suggest a short Hebrew description for one product from what the
          owner already typed (name, group, price, current description). The
          owner sees the text, edits it, and only her product save stores it.
Touches:  The Anthropic API only. No DB reads or writes.
Does NOT: save anything, or moderate — the saved text goes through the same
          check as a typed one (services/approved_edit_moderation.py via
          PUT/POST /producers/me/products).
Related:  services/menu_reader.py (one client, same model);
          services/group_suggester.py (same fail-open shape).
History:  MEH-3479 (creation)

Fail-open: suggest() returns None when ANTHROPIC_API_KEY is missing, the call
fails, or nothing usable is left; the route answers 503.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.config import AI_MENU_MODEL
from app.services.menu_reader import (
    _get_client,
)  # REUSES: one Anthropic client, http_client lock

logger = logging.getLogger(__name__)

MAX_SUGGESTION = 400  # characters; a list-row description, not a story

# A claim the owner must make herself. The model is told not to; a sentence
# that makes one anyway is dropped unless the input already says it.
_CLAIMS: dict[str, tuple[str, ...]] = {
    "kosher": ("כשר", "כשרות", "בהשגחה", "מהדרין"),
    "organic": ("אורגני",),
    "gluten": ("ללא גלוטן", "נטול גלוטן", "בלי גלוטן"),
    "vegan": ("טבעוני",),
    "sugar": ("ללא סוכר", "בלי סוכר", "ללא תוספת סוכר"),
    "lactose": ("ללא לקטוז", "נטול לקטוז"),
    "health": ("בריא", "דיאטטי", "מרפא"),
}

_PROMPT = """Write a short description, in Hebrew, of one product of a small \
Israeli food business, for the product list on its page.

Product name: {name}
Group: {group}
Price: {price}
What the owner already wrote: {current}

Rules:
- One or two sentences, at most 250 characters. Plain, warm, concrete; no \
superlatives, no exclamation marks, no emoji, no hashtags.
- Say only what the name and the details above support. Never claim kashrut, \
organic, gluten-free, vegan, sugar-free, lactose-free or health benefits \
unless the details above say so.
- Do not mention the price or the business name.
- If the owner already wrote something, improve it and keep every fact in it.
- Answer with the description only."""

_SENTENCE = re.compile(r"(?<=[.!?…])\s+")


def _unbacked(sentence: str, source: str) -> bool:
    return any(
        term in sentence and term not in source
        for terms in _CLAIMS.values()
        for term in terms
    )


def clean(text: str, source: str) -> str:
    """Drop every sentence with a claim the input does not make; trim."""
    kept = [s for s in _SENTENCE.split(text.strip()) if s and not _unbacked(s, source)]
    out = " ".join(kept).strip().strip('"').strip("«»").strip()
    if len(out) > MAX_SUGGESTION:
        out = out[:MAX_SUGGESTION].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return out


def _ask(prompt: str) -> str | None:
    client = _get_client()
    if client is None:
        return None
    try:
        response = client.messages.create(
            model=AI_MENU_MODEL,
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        logger.warning("[describe] suggest failed: %s", type(exc).__name__)
        return None
    if response.stop_reason != "end_turn":
        logger.warning("[describe] suggest stopped: %s", response.stop_reason)
        return None
    return next(
        (b.text for b in response.content if getattr(b, "type", "") == "text"), None
    )


def suggest(
    name: str, group: str | None, price: str | None, current: str | None
) -> str | None:
    """None = could not ask, or nothing usable came back."""
    source = " ".join(x for x in (name, group, current) if x)
    prompt = _PROMPT.format(
        name=name[:120],
        group=(group or "(none)")[:40],
        price=price or "(none)",
        current=(current or "(nothing)")[:1000],
    )
    answer = _ask(prompt)
    if not answer:
        return None
    text = clean(answer, source)
    return text or None


def describe_inputs(body: Any) -> tuple[str, str | None, str | None, str | None]:
    """The four strings the prompt takes, from a ProductDescribeIn."""
    price = None
    if body.price_min is not None:
        price = f"{body.price_min} ₪" + (
            f" ({body.price_unit})" if body.price_unit else ""
        )
    return body.name.strip(), body.group, price, body.description
