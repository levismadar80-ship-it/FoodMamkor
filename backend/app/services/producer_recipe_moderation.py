"""
Module:   producer_recipe_moderation
Purpose:  Claude Haiku pre-check on producer-submitted recipes before they
          enter the admin queue (MEH-589 chunk 2/4).
Touches:  Anthropic API (Haiku); no DB writes (callers persist the verdict).
Does NOT: enforce ownership or rate-limit — that lives in the router.
Related:  app/services/experience_moderation.py:1-213 (sibling pattern);
          app/routers/producer_recipes.py (caller).
History:  MEH-589 (creation).

REUSES: experience_moderation.py:1-213 — same APPROVED / FLAGGED /
REJECTED enum, same fail-open semantics, same JSON-only prompt
contract. Differs only in the prompt's red/green flags (recipes
vs workshops) and in the normalized payload keys.

Fail-open policy (per .claude/rules/backend.md):
  - No ANTHROPIC_API_KEY set → APPROVED + log
  - Network / parse error    → APPROVED + log
  - Unexpected status string → APPROVED + log
Recipes always reach admin review afterward, so an infra hiccup does
not silently ship a bad recipe — it just defers the spam-filter check.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from app.config import settings

logger = structlog.get_logger(__name__)

# REUSES: experience_moderation.py:45 — Haiku model pin. Haiku is cheap
# and fast enough for per-recipe pre-check; admins still review every
# recipe before it ships.
HAIKU_MODEL = "claude-haiku-4-5-20251001"

VALID_STATUSES = {"APPROVED", "FLAGGED", "REJECTED"}

# Module-level lazy-constructed client. Anthropic package may be missing
# in some dev/test environments; defer the import.
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.anthropic_api_key:
        logger.debug(
            "[recipe-moderation] ANTHROPIC_API_KEY not set — client unavailable"
        )
        return None
    try:
        import anthropic
        import httpx

        # DO NOT drop the explicit http_client — see .claude/rules/backend.md
        # (anthropic 0.39 SDK calls httpx.Client(proxies=...) which breaks
        # against httpx 0.28+).
        _client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            http_client=httpx.Client(),
        )
        return _client
    except Exception as e:  # pragma: no cover — defensive
        logger.warning("[recipe-moderation] anthropic client init failed: %s", e)
        return None


def _build_prompt(payload: dict[str, Any]) -> str:
    title = payload.get("title") or ""
    description = payload.get("description") or ""
    ingredients = payload.get("ingredients") or ""
    instructions = payload.get("instructions") or ""

    return f"""אתה מודרטור תוכן לאתר מהמקור — פלטפורמה ישראלית לאוכל בריא,
חקלאות מקומית ובתי עסק מקומיים. בדקי את המתכון הבא שהוגש על ידי בעלת
עסק (היצרנית מקדמת את המוצרים שלה דרך מתכון), והחזירי תשובה ב-JSON בלבד.

המתכון המוגש:
כותרת: {title}
תיאור קצר: {description}
מצרכים: {ingredients}
הוראות הכנה: {instructions}

הקריטריונים שלנו — APPROVED אם:
✓ מתכון בישול / אפייה לגיטימי
✓ מצרכים והוראות ברורים
✓ קישור סביר למוצר של היצרנית (למשל: מתכון לחלה שמשתמש בקמח של היצרנית)
✓ אין טענות בריאות מוגזמות

FLAGGED אם:
⚠ הוראות הכנה קצרות מאוד או חסרות פירוט
⚠ טענות בריאות חריגות אבל לא פרודיות ("מנקה רעלים")
⚠ כותרת ספאמית / clickbait-it
⚠ חסרים מצרכים מרכזיים בהוראות

REJECTED אם:
✗ תוכן לא קשור לאוכל / מתכון
✗ ספאם, MLM, גיוס סוכנים
✗ תוכן פוגעני, גזעני, או לא חוקי
✗ טענות ריפוי סרטן / קורונה / מחלות כרוניות
✗ מתכון מסוכן (אלכוהול ביתי ללא רישיון, רעלים)

החזירי JSON בלבד, בלי טקסט נוסף:
{{
  "status": "APPROVED" | "FLAGGED" | "REJECTED",
  "reason": "הסבר קצר בעברית (שורה אחת)",
  "suggestion": "הצעה לשיפור אם FLAGGED, אחרת null"
}}"""


def _parse_response_text(text: str) -> dict:
    """REUSES: experience_moderation.py:128-141 — same fence/JSON
    extraction. Tolerates whitespace, markdown code fences, and
    accidental prose around the JSON block."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def validate_producer_recipe(payload: dict[str, Any]) -> dict:
    """Run the moderation pre-check for a single producer recipe.

    Returns a dict with keys:
        status:     APPROVED | FLAGGED | REJECTED
        reason:     str | None
        suggestion: str | None

    Never raises. Falls back to APPROVED on any failure so infra hiccups
    don't block legitimate submissions — admins still review every one.
    """
    normalized = {
        "title": payload.get("title"),
        "description": payload.get("description"),
        "ingredients": payload.get("ingredients"),
        "instructions": payload.get("instructions"),
    }

    client = _get_client()
    if client is None:
        logger.info(
            "[recipe-moderation] ANTHROPIC_API_KEY not set → auto-APPROVED"
        )
        return {"status": "APPROVED", "reason": None, "suggestion": None}

    try:
        message = client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": _build_prompt(normalized)}],
        )
        raw = ""
        for block in message.content:
            if getattr(block, "type", None) == "text":
                raw = block.text
                break
        if not raw:
            raise ValueError("empty response from Claude")

        parsed = _parse_response_text(raw)
        status = str(parsed.get("status", "")).upper()
        if status not in VALID_STATUSES:
            logger.warning(
                "[recipe-moderation] unexpected status %r → APPROVED", status
            )
            return {"status": "APPROVED", "reason": None, "suggestion": None}

        return {
            "status": status,
            "reason": parsed.get("reason"),
            "suggestion": parsed.get("suggestion"),
        }
    except Exception as e:  # noqa: BLE001 — moderation must fail safe
        logger.exception("[recipe-moderation] Claude call failed: %s", e)
        return {"status": "APPROVED", "reason": None, "suggestion": None}
