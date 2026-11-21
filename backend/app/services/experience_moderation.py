"""AI pre-moderation for community-submitted experiences.

Mirrors the shape of home_product_moderation.py so the codebase has one
moderation pattern — same APPROVED / FLAGGED / REJECTED enum, same
fail-open semantics, same JSON-only prompt contract.

What's different from home_product_moderation:
  - **Model:** the fast-tier Haiku, `app.config.AI_FAST_MODEL`. Haiku is
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

from typing import Any

import structlog

from app.config import AI_FAST_MODEL
from app.services.moderation_common import (
    approved,
    make_anthropic_client,
    parse_verdict_json,
    run_fast_verdict,
    safe_decimal,
)
from app.services.moderation_prompt import wrap_submission
from app.services.moderation_fail_open import report_fail_open


logger = structlog.get_logger(__name__)

# Hardcoded per feature/experiences-moderation plan Q1 — Haiku is enough for
# pre-moderation and strictly cheaper than settings.anthropic_model (Opus).
HAIKU_MODEL = AI_FAST_MODEL  # MEH-2335: single source in app.config

_TAG = "[experience-moderation]"

# Module-level lazy client, one per service so a test can swap it here.
_client: Any = None


def _get_client() -> Any:
    # MEH-3619: the construction itself is moderation_common.make_anthropic_client.
    global _client
    if _client is None:
        _client = make_anthropic_client(_TAG)
    return _client


def _build_prompt(payload: dict[str, Any]) -> tuple[str, str]:
    """Return ``(system, user)``. The submission is tagged data in the user
    turn, never part of the instructions (MEH-2350)."""
    title = payload.get("title") or ""
    description = payload.get("description") or ""
    category = payload.get("category") or ""
    city = payload.get("city") or ""
    price = payload.get("price_per_person")
    price_str = "חינם" if not price else f"₪{price}"
    location_type = payload.get("location_type") or ""
    max_participants = payload.get("max_participants") or ""
    fields = {
        "כותרת": title,
        "קטגוריה": category,
        "תיאור": description,
        "עיר": city,
        "סוג מיקום": location_type,
        "מחיר לאדם": price_str,
        "מקסימום משתתפים": max_participants,
    }
    # MEH-2763: an outbound sign-up link is content too. Only when there is
    # one, so a submission without it reads exactly as before.
    if payload.get("registration_url"):
        fields["קישור הרשמה"] = payload["registration_url"]

    data_rule, user_content = wrap_submission("experience", fields)
    system = f"""אתה מודרטור תוכן לאתר מהמקור — פלטפורמה ישראלית לאוכל בריא,
חקלאות מקומית וחוויות אוכל אצל בתי עסק מקומיים מורשים. בדוק את החוויה המוגשת ותחזיר תשובה
ב-JSON בלבד.

{data_rule}

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
✗ תוכן לא קשור לאוכל / חקלאות / תזונה / סדנאות של בתי עסק
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
    return system, user_content


# MEH-3619: kept as module names; tests call them here.
_parse_response_text = parse_verdict_json


def _safe_decimal(value: object) -> float | None:
    return safe_decimal(value, _TAG)


def validate_experience(payload: dict[str, Any]) -> dict[str, Any]:
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
        "registration_url": payload.get("registration_url"),
    }

    client = _get_client()
    if client is None:
        logger.info("[experience-moderation] ANTHROPIC_API_KEY not set → auto-APPROVED")
        report_fail_open("experience", "no_client")
        return approved()

    return run_fast_verdict(
        client,
        lambda: _build_prompt(normalized),
        surface="experience",
        tag=_TAG,
        report=report_fail_open,
    )
