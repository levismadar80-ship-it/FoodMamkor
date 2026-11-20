# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3479 PR)
"""
Module:   ai_text
Purpose:  One short plain-text answer from Claude, and the claim filter, for
          the owner-side suggestions: a product description (MEH-3479) and a
          review-reply draft (MEH-3480).
Touches:  The Anthropic API only.
Does NOT: save, moderate or decide what is asked — each caller builds its own
          prompt (services/description_writer.py, services/reply_writer.py).
History:  MEH-3479 (creation; shared with the MEH-3480 reply draft)
"""

from __future__ import annotations

import logging
import re

from app.config import ai_fast_request_kwargs
from app.services.menu_reader import (
    _get_client,
)  # REUSES: one Anthropic client, http_client lock

logger = logging.getLogger(__name__)

_SENTENCE = re.compile(r"(?<=[.!?…])\s+")
# Niqqud and cantillation marks, then hyphen / maqaf / dashes: «ללא־גלוטן» and
# «כָּשֵׁר» must match the plain term (review, MEH-3479).
_MARKS = re.compile(r"[\u0591-\u05C7]")
_JOINERS = re.compile(r"[-\u05BE\u2010-\u2015]+")
_SPACES = re.compile(r"\s+")


def _plain(text: str) -> str:
    # Joiners first: the maqaf (U+05BE) sits inside the marks range.
    return _SPACES.sub(" ", _MARKS.sub("", _JOINERS.sub(" ", text))).lower()


def wrap(tag: str, value: str) -> str:
    """Owner text between tags the prompt names as data; angle brackets out,
    so the text cannot close the tag early."""
    return f"<{tag}>{value.replace('<', ' ').replace('>', ' ')}</{tag}>"


def ask(prompt: str, *, tag: str, max_tokens: int = 600) -> str | None:
    """The model's text, or None when it could not be asked or stopped early."""
    client = _get_client()
    if client is None:
        return None
    try:
        response = client.messages.create(
            # The fast tier, thinking off (config.py AI_FAST_MODEL): a short
            # rewrite, not a reading task like the menu photo (AI_MENU_MODEL).
            **ai_fast_request_kwargs(),
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        logger.warning("[%s] suggest failed: %s", tag, type(exc).__name__)
        return None
    if response.stop_reason != "end_turn":
        logger.warning("[%s] suggest stopped: %s", tag, response.stop_reason)
        return None
    return next(
        (b.text for b in response.content if getattr(b, "type", "") == "text"), None
    )


def drop_unbacked(text: str, source: str, terms: tuple[str, ...], limit: int) -> str:
    """Drop every sentence holding one of `terms` that `source` does not; trim
    to `limit` characters at a word."""
    plain_source = _plain(source)
    plain_terms = [_plain(t) for t in terms]
    kept = [
        s
        for s in _SENTENCE.split(text.strip())
        if s and not any(t in _plain(s) and t not in plain_source for t in plain_terms)
    ]
    out = " ".join(kept).strip().strip('"').strip("«»").strip()
    if len(out) > limit:
        out = out[:limit].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return out
