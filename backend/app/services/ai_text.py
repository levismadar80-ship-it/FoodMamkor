# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3479 PR)
"""
Module:   ai_text
Purpose:  One short plain-text answer from Claude, and the claim filter, for
          the owner-side suggestions: a product description (MEH-3479) and a
          review-reply draft (MEH-3480). Also strips emoji from any model
          text a person will read (MEH-3668), the chat reply included.
Touches:  The Anthropic API only.
Does NOT: save, moderate or decide what is asked — each caller builds its own
          prompt (services/description_writer.py, services/reply_writer.py).
History:  MEH-3479 (creation; shared with the MEH-3480 reply draft);
          MEH-3668 (strip_emoji: the site shows no emoji, Sapir 22/11)
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
# MEH-3668: the same ranges as scripts/checks/no-emoji-backend-guard.sh, plus
# the invisible joiners (U+FE0F, U+200D) that ride on them. ✓ ✗ ✕ ★ ☆ are
# typography there too (MEH-1681) and stay.
_EMOJI = re.compile(
    "[\U0001f000-\U0001faff\u2600-\u2604\u2607-\u2712\u2714\u2716"
    "\u2718-\u27bf\u2b00-\u2bff\u231a-\u23ff\ufe0f\u200d]"
)
_GAP = re.compile(r"[ \t]{2,}")
_SPACE_BEFORE_MARK = re.compile(r"[ \t]+([.,!?:;])")


def _plain(text: str) -> str:
    # Joiners first: the maqaf (U+05BE) sits inside the marks range.
    return _SPACES.sub(" ", _MARKS.sub("", _JOINERS.sub(" ", text))).lower()


def strip_emoji(text: str) -> str:
    """Model text with every emoji removed and the gap it left closed.

    The prompts already ask for no emoji; this is the part a model cannot
    talk its way past (MEH-3668)."""
    if not _EMOJI.search(text):
        return text
    out = _EMOJI.sub("", text)
    out = _SPACE_BEFORE_MARK.sub(r"\1", _GAP.sub(" ", out))
    return "\n".join(line.strip() for line in out.split("\n")).strip()


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
    text = next(
        (b.text for b in response.content if getattr(b, "type", "") == "text"), None
    )
    return strip_emoji(text) if text else text


def split_sentences(text: str) -> list[str]:
    return [s for s in _SENTENCE.split(text.strip()) if s]


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
