"""
Module:   producer_recipe_moderation
Purpose:  Claude Haiku pre-check on producer-submitted recipes before they
          enter the admin queue (MEH-589 chunk 2/4).
Touches:  Anthropic API (Haiku); no DB writes (callers persist the verdict).
Does NOT: enforce ownership or rate-limit — that lives in the router.
Related:  app/services/experience_moderation.py (sibling pattern);
          app/services/moderation_common.py (shared client + call, MEH-3465);
          app/routers/producer_recipes.py (caller).
History:  MEH-589 (creation); MEH-3465 (client, parser and call moved to moderation_common).

REUSES: experience_moderation.py + moderation_common.py (MEH-3465) — same APPROVED / FLAGGED /
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

from typing import Any

import structlog

from app.config import AI_FAST_MODEL
from app.services.moderation_common import (
    approved,
    make_anthropic_client,
    parse_verdict_json,
    run_fast_verdict,
)
from app.services.moderation_prompt import wrap_submission
from app.services.moderation_fail_open import report_fail_open


logger = structlog.get_logger(__name__)

# REUSES: experience_moderation.py — Haiku model pin. Haiku is cheap
# and fast enough for per-recipe pre-check; admins still review every
# recipe before it ships.
HAIKU_MODEL = AI_FAST_MODEL  # MEH-2335: single source in app.config

_TAG = "[recipe-moderation]"

# Module-level lazy client, one per service so a test can swap it here.
_client: Any = None


def _get_client() -> Any:
    # MEH-3465: the construction itself is moderation_common.make_anthropic_client.
    global _client
    if _client is None:
        _client = make_anthropic_client(_TAG)
    return _client


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


# MEH-3465: kept as a module name; tests call it here.
_parse_response_text = parse_verdict_json


def validate_producer_recipe(payload: dict[str, Any]) -> dict[str, Any]:
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
        return approved()

    return run_fast_verdict(
        client,
        lambda: _build_prompt(normalized),
        surface="recipe",
        tag=_TAG,
        report=report_fail_open,
    )
