"""AI pre-moderation for community-submitted experiences.

Mirrors the shape of home_product_moderation.py so the codebase has one
moderation pattern — same APPROVED / FLAGGED / REJECTED enum, same
fail-open semantics, same JSON-only prompt contract.

What's different from home_product_moderation:
  - **Model:** hardcoded to `claude-haiku-4-5-20251001`. Haiku is
    fast+cheap enough for a real-time "is this a legitimate workshop?"
    check, and experience submissions flow through BOTH Claude and
    admin approval, so we're not relying on the model for the final
    publication decision. Home products use Opus via settings.anthropic_model
    because they publish immediately based on the verdict.
  - **Prompt:** focused on workshops / food tours / nutrition classes,
    not food listings. Different red flags (MLM pitches, sex work,
    medical scams) vs. different green flags (legitimate hands-on
    experience content).

Fail-open policy (same as home_product_moderation):
  - No ANTHROPIC_API_KEY set  → return APPROVED, log it
  - Network / parse error     → return APPROVED, log it
  - Unexpected status string  → return APPROVED, log it
Rationale: experiences still get admin review downstream. Blocking a
submission because our infra blinked would be worse than letting a
suspicious one land in the admin queue.

The verdict is recorded on `experiences.moderation_status` so admins
see Claude's signal when reviewing the queue.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import structlog

from app.config import settings

logger = structlog.get_logger(__name__)

# Hardcoded per feature/experiences-moderation plan Q1 — Haiku is enough for
# pre-moderation and strictly cheaper than settings.anthropic_model (Opus).
HAIKU_MODEL = "claude-haiku-4-5-20251001"

VALID_STATUSES = {"APPROVED", "FLAGGED", "REJECTED"}

# Module-level lazy-constructed client — the anthropic package may not even
# be importable in some dev/test environments, so we defer the import.
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.anthropic_api_key:
        logger.debug(
            "[experience-moderation] ANTHROPIC_API_KEY not set — client unavailable"
        )
        return None
    try:
        import anthropic
        import httpx

        _client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            http_client=httpx.Client(),
        )
        return _client
    except Exception as e:  # pragma: no cover — defensive
        logger.warning("anthropic client init failed: %s", e)
        return None


def _build_prompt(payload: dict[str, Any]) -> str:
    title = payload.get("title") or ""
    description = payload.get("description") or ""
    category = payload.get("category") or ""
    city = payload.get("city") or ""
    price = payload.get("price_per_person")
    price_str = "חינם" if not price else f"₪{price}"
    location_type = payload.get("location_type") or ""
    max_participants = payload.get("max_participants") or ""

    return f"""אתה מודרטור תוכן לאתר מהמקור — פלטפורמה ישראלית לאוכל בריא,
חקלאות מקומית וחוויות אוכל קהילתיות. בדוק את החוויה הבאה ותחזיר תשובה
ב-JSON בלבד.

החוויה המוגשת:
כותרת: {title}
קטגוריה: {category}
תיאור: {description}
עיר: {city}
סוג מיקום: {location_type}
מחיר לאדם: {price_str}
מקסימום משתתפים: {max_participants}

הקריטריונים שלנו — APPROVED אם:
✓ חוויה / סדנה / קורס / סיור אוכל לגיטימי
✓ תיאור ברור של מה הולך לקרות במפגש
✓ מחיר סביר (לא 0 אם זה קורס של שעות, לא אלפים לסדנה קצרה)
✓ אין טענות בריאות מוגזמות ("ריפוי סרטן בעזרת ירקות")
✓ לא MLM, לא גיוס סוכנים, לא מכירות ישירות

FLAGGED אם:
⚠ תיאור קצר או מעורפל ("סדנה נחמדה" בלי פירוט)
⚠ טענות בריאות חריגות אבל לא פרודיות
⚠ מחיר חריג באופן שמצריך בירור (₪2,000 לשעה)
⚠ קטגוריה לא תואמת לתיאור

REJECTED אם:
✗ תוכן לא קשור לאוכל / חקלאות / תזונה / סדנאות קהילתיות
✗ ספאם, MLM, גיוס סוכנים, מכירת מוצרים במסווה של סדנה
✗ תוכן פוגעני, גזעני, או תוכן למבוגרים
✗ טענות ריפוי סרטן / קורונה / מחלות כרוניות
✗ פעילות לא חוקית (אלכוהול ללא רישיון, הימורים, וכו')

החזר JSON בלבד, בלי טקסט נוסף:
{{
  "status": "APPROVED" | "FLAGGED" | "REJECTED",
  "reason": "הסבר קצר בעברית (שורה אחת)",
  "suggestion": "הצעה לשיפור אם FLAGGED, אחרת null"
}}"""


def _parse_response_text(text: str) -> dict:
    """Extract JSON from a Claude response. Tolerates whitespace, markdown
    code fences, and accidental prose around the JSON block."""
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


def _safe_decimal(value) -> float | None:
    if value is None:
        return None
    try:
        return float(Decimal(str(value)))
    except Exception:
        logger.debug(
            "[experience-moderation] decimal conversion failed", value=repr(value)
        )
        return None


def validate_experience(payload: dict[str, Any]) -> dict:
    """Run the moderation check for a single experience submission.

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
        "category": payload.get("category"),
        "city": payload.get("city"),
        "location_type": payload.get("location_type"),
        "price_per_person": _safe_decimal(payload.get("price_per_person")),
        "max_participants": payload.get("max_participants"),
    }

    client = _get_client()
    if client is None:
        logger.info("[experience-moderation] ANTHROPIC_API_KEY not set → auto-APPROVED")
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
                "[experience-moderation] unexpected status %r → APPROVED",
                status,
            )
            return {"status": "APPROVED", "reason": None, "suggestion": None}

        return {
            "status": status,
            "reason": parsed.get("reason"),
            "suggestion": parsed.get("suggestion"),
        }
    except Exception as e:  # noqa: BLE001 — moderation must fail safe
        logger.exception("[experience-moderation] Claude call failed: %s", e)
        return {"status": "APPROVED", "reason": None, "suggestion": None}
