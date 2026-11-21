"""AI moderation for the "מהמטבח של השכן" (home products) section.

Per docs/MODERATION.md: every user-submitted home product runs through Claude
before (and during) creation. Three possible verdicts:
  - APPROVED  → publish immediately
  - FLAGGED   → publish with a "בבדיקה" badge + surfaced in admin queue
  - REJECTED  → block the create entirely, return reason to user

Design notes:
  - Graceful degradation: if ANTHROPIC_API_KEY isn't set (local dev,
    Docker without secrets) we return APPROVED and log it, so the feature
    stays usable. Production must set the key.
  - Any API/parsing failure also degrades to APPROVED rather than
    blocking the user — we'd rather ship a rare bad listing than break
    the form for everyone.
  - Uses the small-fast model for cheap per-request cost; the moderation
    prompt is short and the JSON output is tiny.
"""

from __future__ import annotations

from typing import Any

import structlog

from app.config import settings
from app.services.moderation_common import (
    approved,
    first_text,
    make_anthropic_client,
    parse_verdict_json,
    safe_decimal,
    verdict_from_text,
)


logger = structlog.get_logger(__name__)

_TAG = "[moderation]"

# Module-level client — lazy constructed on first call to avoid import-time
# crashes when anthropic isn't installed (e.g. during tests or migrations).
# One per service so a test can swap it here.
_client: Any = None


def _get_client() -> Any:
    # MEH-3619: the construction (with the locked http_client=httpx.Client())
    # is moderation_common.make_anthropic_client.
    global _client
    if _client is None:
        _client = make_anthropic_client(_TAG)
    return _client


def _build_prompt(listing: dict[str, Any]) -> str:
    title = listing.get("title") or ""
    description = listing.get("description") or ""
    category = listing.get("category") or ""
    price = listing.get("price")
    price_str = str(price) if price is not None else ""

    return f"""אתה מודרטור תוכן לאתר מהמקור — פלטפורמה ישראלית לאוכל בריא וביתי.
בדוק את המודעה הבאה ותחזיר תשובה ב-JSON בלבד.

המודעה:
כותרת: {title}
תיאור: {description}
קטגוריה: {category}
מחיר: {price_str}

הקריטריונים שלנו — APPROVED אם:
✓ מוצר מזון ביתי / טיפוח טבעי לגיטימי
✓ תיאור ברור ואמיתי
✓ מחיר סביר (לא 0 ולא אלפי שקלים לכמות קטנה)
✓ אין טענות בריאות מוגזמות ("מרפא סרטן")

FLAGGED אם:
⚠ טענות בריאות מוגזמות
⚠ מחיר חשוד (גבוה מאוד ביחס לכמות)
⚠ תוכן לא ברור או חסר מידע
⚠ נראה כמו עסק גדול שמתחזה לביתי

REJECTED אם:
✗ מוצרים לא קשורים לאוכל/טיפוח (נשק, תרופות, אלכוהול ללא רישיון)
✗ ספאם או תוכן כפול ברור
✗ תוכן פוגעני או גזעני
✗ מוצרים מסוכנים (פטריות בר ללא זיהוי מקצועי, וכו')

החזר JSON בלבד, בלי טקסט נוסף:
{{
  "status": "APPROVED" | "FLAGGED" | "REJECTED",
  "reason": "הסבר קצר בעברית",
  "suggestion": "הצעה לשיפור אם FLAGGED (או null)"
}}"""


# MEH-3619: kept as module names; tests call them here.
_parse_response_text = parse_verdict_json


def _safe_decimal(value: object) -> float | None:
    return safe_decimal(value, _TAG)


def validate_home_product(listing: dict[str, Any]) -> dict[str, Any]:
    """Run the moderation check. Returns a dict with keys:
        status:     APPROVED | FLAGGED | REJECTED
        reason:     str | None
        suggestion: str | None

    Always returns a valid result — falls back to APPROVED if anything
    goes wrong so the user isn't blocked by infra failures.
    """
    # Normalize price for prompt
    payload = {
        "title": listing.get("title"),
        "description": listing.get("description"),
        "category": listing.get("category"),
        "price": _safe_decimal(listing.get("price")),
    }

    client = _get_client()
    if client is None:
        logger.info("[moderation] ANTHROPIC_API_KEY not set; auto-APPROVED")
        return approved()

    try:
        message = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=300,
            messages=[{"role": "user", "content": _build_prompt(payload)}],
        )
        verdict = verdict_from_text(first_text(message), _TAG)
        if verdict is None:
            return approved()
        return verdict
    except Exception as e:  # noqa: BLE001 — fail open, don't block users on infra failures
        logger.exception("[moderation] Claude call failed: %s", e)
        return approved()
