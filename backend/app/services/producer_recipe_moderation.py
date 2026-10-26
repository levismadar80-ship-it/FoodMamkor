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

from app.config import AI_FAST_MODEL, ai_fast_request_kwargs, settings
from app.services.moderation_prompt import wrap_submission
from app.services.moderation_fail_open import classify_failure, report_fail_open
from app.services.moderation_schemas import MODERATION_VERDICT_SCHEMA

logger = structlog.get_logger(__name__)

# REUSES: experience_moderation.py:45 — Haiku model pin. Haiku is cheap
# and fast enough for per-recipe pre-check; admins still review every
# recipe before it ships.
HAIKU_MODEL = AI_FAST_MODEL  # MEH-2335: single source in app.config

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


def _build_prompt(payload: dict[str, Any]) -> tuple[str, str]:
    """Return ``(system, user)``. The submission is tagged data in the user
    turn, never part of the instructions (MEH-2350)."""
    title = payload.get("title") or ""
    description = payload.get("description") or ""
    ingredients = payload.get("ingredients") or ""
    instructions = payload.get("instructions") or ""

    data_rule, user_content = wrap_submission(
        "recipe",
        {
            "כותרת": title,
            "תיאור קצר": description,
            "מצרכים": ingredients,
            "הוראות הכנה": instructions,
        },
    )
    system = f"""אתה מודרטור תוכן לאתר מהמקור — פלטפורמה ישראלית לאוכל בריא,
חקלאות מקומית ובתי עסק מקומיים. בדקי את המתכון המוגש על ידי בעלת
עסק (היצרנית מקדמת את המוצרים שלה דרך מתכון), והחזירי תשובה ב-JSON בלבד.

{data_rule}

הקריטריונים שלנו — APPROVED אם:
✓ מתכון בישול / אפייה לגיטימי שאפשר להכין לפיו (מצרכים + שלבים)
✓ מתכון קצר ופשוט הוא תקין — קיצור לבדו אינו סיבה לסימון
✓ אין טענות בריאות מוגזמות
✓ קישור למוצר של היצרנית אינו חובה; אם יש — שיהיה סביר (למשל: חלה מהקמח שלה)
אל תשפטי טעם, טכניקה או "מה הייתי מוסיפה" (מלח, תבלינים, ביצה) — את זה בעלת העסק
מחליטה. התפקיד הוא לסנן תוכן בעייתי, לא לערוך מתכונים.

FLAGGED אם:
⚠ אי אפשר להכין לפי המתכון בכלל: אין רשימת מצרכים, או אין שלבי הכנה
⚠ טענות בריאות חריגות אבל לא פרודיות ("מנקה רעלים")
⚠ כותרת ספאמית / clickbait-it

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
    return system, user_content


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
        logger.info("[recipe-moderation] ANTHROPIC_API_KEY not set → auto-APPROVED")
        report_fail_open("recipe", "no_client")
        return {"status": "APPROVED", "reason": None, "suggestion": None}

    truncated = False
    try:
        system, user_content = _build_prompt(normalized)
        message = client.messages.create(
            **ai_fast_request_kwargs(json_schema=MODERATION_VERDICT_SCHEMA),
            # MEH-2335: reason + suggestion are free Hebrew text; 800 keeps
            # well clear of truncation (a truncated JSON fails open).
            max_tokens=800,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        # MEH-2335: Haiku 5.5 runs safety classifiers. A decline is HTTP 200
        # with stop_reason="refusal" and no text — the content itself
        # tripped a harm classifier, so that is a signal, not an infra
        # blink: route it to the admin as FLAGGED instead of failing open.
        if getattr(message, "stop_reason", None) == "refusal":
            logger.warning("[recipe-moderation] model refused → FLAGGED")
            return {
                "status": "FLAGGED",
                "reason": "המודל סירב לבדוק את התוכן — נדרשת בדיקה ידנית",
                "suggestion": None,
            }
        truncated = getattr(message, "stop_reason", None) == "max_tokens"
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
            report_fail_open("recipe", "truncated" if truncated else "bad_status")
            return {"status": "APPROVED", "reason": None, "suggestion": None}

        return {
            "status": status,
            "reason": parsed.get("reason"),
            "suggestion": parsed.get("suggestion"),
        }
    except Exception as e:  # noqa: BLE001 — moderation must fail safe
        logger.exception("[recipe-moderation] Claude call failed: %s", e)
        report_fail_open("recipe", classify_failure(e, truncated=truncated))
        return {"status": "APPROVED", "reason": None, "suggestion": None}
