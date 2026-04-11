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

import json
import logging
from decimal import Decimal
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level client — lazy constructed on first call to avoid import-time
# crashes when anthropic isn't installed (e.g. during tests or migrations).
_client = None


VALID_STATUSES = {"APPROVED", "FLAGGED", "REJECTED"}


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.anthropic_api_key:
        return None
    try:
        # Imports kept lazy so missing packages can't crash module load
        # (the rest of the backend stays up even if anthropic is broken).
        import anthropic
        import httpx

        # Construct an explicit httpx.Client() and pass it via the
        # Anthropic SDK's `http_client` kwarg. This bypasses the SDK's
        # internal call to `httpx.Client(proxies=...)`, which is broken
        # against httpx 0.28+ — that release dropped the `proxies=` kwarg
        # in favor of `proxy=` (singular), and the anthropic 0.39 SDK
        # didn't update its internal call. Symptom of the unfixed code:
        #     TypeError: Client.__init__() got an unexpected keyword
        #                argument 'proxies'
        # Caught by PR #29's debug instrumentation in chat.py, fixed in
        # PR #32 (chat) and this PR (moderation). The explicit
        # `httpx.Client()` works against any httpx version because we're
        # constructing it ourselves with no kwargs, so we don't have to
        # chase the SDK-vs-transitive-dep version dance. SAME PATTERN
        # MUST be used anywhere else this codebase constructs an
        # Anthropic client — see CLAUDE.md "Key locked decisions".
        _client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            http_client=httpx.Client(),
        )
        return _client
    except Exception as e:  # pragma: no cover — defensive
        logger.warning("anthropic client init failed: %s", e)
        return None


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


def _parse_response_text(text: str) -> dict:
    """Extract JSON from a model response. Tolerates surrounding whitespace
    or accidental prose by grabbing the first balanced {...} block."""
    text = text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        text = text.strip()
    # Best-effort: find first { and last }
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
        return None


def validate_home_product(listing: dict[str, Any]) -> dict:
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
        return {
            "status": "APPROVED",
            "reason": None,
            "suggestion": None,
        }

    try:
        message = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=300,
            messages=[{"role": "user", "content": _build_prompt(payload)}],
        )
        # Content is a list of blocks; first block is text for this prompt
        raw = ""
        for block in message.content:
            if getattr(block, "type", None) == "text":
                raw = block.text
                break
        if not raw:
            raise ValueError("empty response from claude")

        parsed = _parse_response_text(raw)
        status = parsed.get("status", "").upper()
        if status not in VALID_STATUSES:
            logger.warning("[moderation] unexpected status %r → APPROVED", status)
            return {"status": "APPROVED", "reason": None, "suggestion": None}

        return {
            "status": status,
            "reason": parsed.get("reason"),
            "suggestion": parsed.get("suggestion"),
        }
    except Exception as e:
        logger.exception("[moderation] Claude call failed: %s", e)
        # Fail open — don't block users on infra failures
        return {"status": "APPROVED", "reason": None, "suggestion": None}
