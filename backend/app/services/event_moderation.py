"""
Claude AI pre-moderation for Events & Experiences.

Uses the Anthropic API to:
  - Flag suspicious or unsafe content
  - Suggest improvements to the description
  - Check for missing required info

Fails safe: if the API key is missing or the call fails, returns a neutral
"not_checked" result so submissions are never blocked by an infra glitch —
the admin still sees the content and can decide manually.
"""
from __future__ import annotations

import json
import os
from typing import Any

# The model used for moderation. Kept as a constant so it's easy to bump.
MODERATION_MODEL = "claude-haiku-4-5-20251001"

SYSTEM_PROMPT = """You are a content moderator for מהמקור (MEHAMEKOR), an Israeli
local food marketplace that lists events & experiences (farm tours, cooking workshops,
food tours, nutrition classes).

Given an event submission, you must:
1. Flag anything suspicious, unsafe, misleading, or off-topic
   (spam, MLM, adult content, medical claims, etc.)
2. Identify missing required info (clear title, date, location, what's included)
3. Suggest 1-3 short concrete improvements to the description (in Hebrew)

Respond with ONLY a JSON object matching this schema, no other text:
{
  "safe": boolean,             // false if submission should be auto-rejected
  "flags": [string],           // short tags: "spam", "medical_claims", "off_topic", ...
  "missing_info": [string],    // short Hebrew strings like "חסר תאריך"
  "suggestions": [string],     // short Hebrew improvement suggestions
  "summary": string            // 1-sentence Hebrew summary for the admin
}"""


def _build_user_message(payload: dict[str, Any]) -> str:
    """Build the user message describing the event to moderate."""
    parts = [
        f"כותרת: {payload.get('title', '')}",
        f"סוג: {payload.get('type', '')}",
        f"תיאור: {payload.get('description', '')}",
        f"קטגוריה: {payload.get('category') or 'לא צוין'}",
        f"עיר: {payload.get('city') or 'לא צוין'}",
        f"כתובת: {payload.get('address') or 'לא צוין'}",
        f"מחיר לאדם: {payload.get('price_per_person') or 'חינם'}",
        f"מספר משתתפים מקסימלי: {payload.get('max_participants') or 'לא צוין'}",
        f"דרישות / מה להביא: {payload.get('requirements') or 'לא צוין'}",
    ]
    return "\n".join(parts)


def moderate_event(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Run Claude pre-moderation on an event submission.

    Returns a dict with keys: safe, flags, missing_info, suggestions, summary.
    On any failure, returns a neutral "not_checked" result rather than raising —
    moderation should never block a submission.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return {
            "safe": True,
            "flags": [],
            "missing_info": [],
            "suggestions": [],
            "summary": "not_checked: ANTHROPIC_API_KEY missing",
        }

    try:
        # Import lazily so the package is optional in dev / tests.
        from anthropic import Anthropic
    except ImportError:
        return {
            "safe": True,
            "flags": [],
            "missing_info": [],
            "suggestions": [],
            "summary": "not_checked: anthropic SDK not installed",
        }

    try:
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model=MODERATION_MODEL,
            max_tokens=600,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _build_user_message(payload)}],
        )
        text = ""
        for block in response.content:
            if getattr(block, "type", None) == "text":
                text += block.text

        # Strip markdown code fences if present
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        parsed = json.loads(text)
        # Normalize fields
        return {
            "safe": bool(parsed.get("safe", True)),
            "flags": list(parsed.get("flags", []) or []),
            "missing_info": list(parsed.get("missing_info", []) or []),
            "suggestions": list(parsed.get("suggestions", []) or []),
            "summary": str(parsed.get("summary", "")),
        }
    except Exception as e:  # noqa: BLE001 — moderation must fail safe
        print(f"[MODERATION] Failed: {e}")
        return {
            "safe": True,
            "flags": [],
            "missing_info": [],
            "suggestions": [],
            "summary": f"not_checked: {type(e).__name__}",
        }
