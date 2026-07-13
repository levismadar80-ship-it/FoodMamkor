"""AI description writer for producer profiles (MEH-56; MEH-1173).

Composes a Hebrew ≤150-char business description from STRUCTURED input —
what the business sells, its area, what's special, and an optional
Instagram link used as inspiration only — then calls Claude Haiku.

MEH-1173: the old free-text ``{source}`` + Instagram-scrape path is gone.
Instagram blocks datacenter IPs (Railway), so the scrape failed and fed
Haiku a raw handle → generic bio. Input is now the 3-question form from
the dashboard "תיאור העסק" card. Prompt is gender-neutral (ADR-024).

Fail-open: returns "" if ANTHROPIC_API_KEY is missing or any step fails.
"""

from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.anthropic_api_key:
        logger.debug("[bio] ANTHROPIC_API_KEY not set — bio generation disabled")
        return None
    try:
        import anthropic
        import httpx

        _client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            http_client=httpx.Client(),
        )
        return _client
    except Exception as e:
        logger.warning("[BIO] Failed to init Anthropic client: %s", e)
        return None


# MEH-1173: LOCKED gender-neutral prompt (ADR-024). Empty optional fields
# drop their whole line so Haiku is never handed a dangling "אזור פעילות: ".
_PROMPT_HEADER = (
    "כתוב תיאור קצר בעברית לעסק מזון ישראלי, עד 150 תווים, בלשון ניטרלית "
    "או בגוף ראשון רבים — בלי הנחות על מגדר הבעלים. החזר רק את התיאור, "
    "ללא הסברים."
)


def _compose_prompt(
    sells: str,
    area: str | None,
    special: str | None,
    instagram: str | None,
) -> str:
    lines = [_PROMPT_HEADER, f"מה העסק מוכר: {sells.strip()}"]
    if area and area.strip():
        lines.append(f"אזור פעילות: {area.strip()}")
    if special and special.strip():
        lines.append(f"מה מיוחד: {special.strip()}")
    if instagram and instagram.strip():
        lines.append(f"אינסטגרם (השראה בלבד): {instagram.strip()}")
    return "\n".join(lines)


def generate_bio(
    sells: str,
    area: str | None = None,
    special: str | None = None,
    instagram: str | None = None,
) -> str:
    """Generate a Hebrew ≤150-char business description from structured input.

    sells is required; area / special / instagram are optional context.
    Returns "" on any failure (fail-open) or when sells is blank.
    """
    client = _get_client()
    if not client:
        logger.warning(
            "[BIO] Anthropic client unavailable — returning empty (fail-open)"
        )
        return ""

    if not sells or not sells.strip():
        return ""

    prompt = _compose_prompt(sells, area, special, instagram)

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        bio = next(
            (b.text for b in msg.content if getattr(b, "type", None) == "text"), ""
        ).strip()
        return bio[:150]
    except Exception as e:
        logger.warning("[BIO] Haiku call failed: %s", e)
        return ""
