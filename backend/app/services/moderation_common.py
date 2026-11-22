"""
Module:   moderation_common
Purpose:  The parts the AI pre-moderation services share: building the
          Anthropic client, reading the JSON verdict out of a reply, and the
          fast-model call with its fail-open and refusal handling. Each
          service keeps its own prompt, fields, model and log tag.
Touches:  Anthropic API (only through run_fast_verdict's client argument).
Does NOT: hold a client or cache one (each service keeps its own `_client`,
          so tests can swap it per module); build a prompt
          (moderation_prompt.wrap_submission); report a fail-open to Sentry by
          itself (the caller passes its own report_fail_open, so a test that
          patches it on the service module still sees the call).
Related:  services/experience_moderation.py, services/producer_recipe_moderation.py
          (callers);
          services/moderation_fail_open.py (classify_failure);
          tests/test_moderation_common.py.
History:  MEH-3619 (creation: three copies of the same client, parser and
          call flow, 22+12+4 lines in scripts/checks/clone-baseline.txt).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from decimal import Decimal
from typing import Any, cast

import structlog

from app.config import ai_fast_request_kwargs, settings
from app.services.moderation_fail_open import classify_failure
from app.services.moderation_schemas import MODERATION_VERDICT_SCHEMA

logger = structlog.get_logger(__name__)

VALID_STATUSES = {"APPROVED", "FLAGGED", "REJECTED"}

REFUSAL_REASON = "המודל סירב לבדוק את התוכן — נדרשת בדיקה ידנית"


def approved() -> dict[str, Any]:
    """The fail-open verdict: a fresh dict each call, callers may mutate it."""
    return {"status": "APPROVED", "reason": None, "suggestion": None}


def make_anthropic_client(tag: str) -> Any:
    """A new Anthropic client, or None when there is no key or no package."""
    if not settings.anthropic_api_key:
        logger.debug(f"{tag} ANTHROPIC_API_KEY not set — client unavailable")
        return None
    try:
        # Lazy imports: a broken anthropic install must not crash module load.
        import anthropic
        import httpx

        # DO NOT drop the explicit http_client — .claude/rules/backend.md
        # (the SDK's own httpx.Client(proxies=...) breaks on httpx 0.28+).
        return anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            http_client=httpx.Client(),
        )
    except Exception as e:  # pragma: no cover — defensive
        logger.warning(f"{tag} anthropic client init failed: %s", e)
        return None


def parse_verdict_json(text: str) -> dict[str, Any]:
    """Extract JSON from a model reply. Tolerates whitespace, markdown code
    fences and accidental prose around the JSON block. Raises on bad JSON."""
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
    return cast(dict[str, Any], json.loads(text))


def safe_decimal(value: object, tag: str) -> float | None:
    """A price as float for the prompt, or None when it does not parse."""
    if value is None:
        return None
    try:
        return float(Decimal(str(value)))
    except Exception:
        logger.debug(f"{tag} decimal conversion failed", value=repr(value))
        return None


def first_text(message: Any) -> str:
    """The first text block of a reply; raises when there is none."""
    for block in message.content:
        if getattr(block, "type", None) == "text":
            # The first text block decides, as before: an empty one is an empty
            # reply ("error"), not a JSON parse failure ("unparseable").
            if not block.text:
                break
            return cast(str, block.text)
    raise ValueError("empty response from Claude")


def verdict_from_text(raw: str, tag: str) -> dict[str, Any] | None:
    """The verdict in a reply, or None (logged) when its status is not one of ours."""
    parsed = parse_verdict_json(raw)
    # MEH-2390: valid JSON that is not an object is a bad status, not a crash.
    if not isinstance(parsed, dict):
        parsed = {}
    status = str(parsed.get("status", "")).upper()
    if status not in VALID_STATUSES:
        logger.warning(f"{tag} unexpected status %r → APPROVED", status)
        return None
    return {
        "status": status,
        "reason": parsed.get("reason"),
        "suggestion": parsed.get("suggestion"),
    }


def run_fast_verdict(
    client: Any,
    build_prompt: Callable[[], tuple[str, str]],
    *,
    surface: str,
    tag: str,
    report: Callable[[str, str], None],
) -> dict[str, Any]:
    """Ask the fast model for a verdict. Never raises: every failure is
    APPROVED and reported through `report(surface, reason)`. The prompt is
    built inside the guard, so a payload that breaks it fails open too."""
    truncated = False
    try:
        system, user_content = build_prompt()
        message = client.messages.create(
            **ai_fast_request_kwargs(json_schema=MODERATION_VERDICT_SCHEMA),
            # MEH-2335: reason + suggestion are free Hebrew text; 800 keeps
            # well clear of truncation (a truncated JSON fails open).
            max_tokens=800,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        # MEH-2335: a decline is HTTP 200 with stop_reason="refusal" and no
        # text. The content tripped a harm classifier, so it is a signal, not
        # an infra blink: FLAGGED for the admin instead of failing open.
        if getattr(message, "stop_reason", None) == "refusal":
            logger.warning(f"{tag} model refused → FLAGGED")
            return {"status": "FLAGGED", "reason": REFUSAL_REASON, "suggestion": None}
        truncated = getattr(message, "stop_reason", None) == "max_tokens"
        verdict = verdict_from_text(first_text(message), tag)
        if verdict is None:
            report(surface, "truncated" if truncated else "bad_status")
            return approved()
        return verdict
    except Exception as e:  # noqa: BLE001 — moderation must fail safe
        logger.exception(f"{tag} Claude call failed: %s", e)
        report(surface, classify_failure(e, truncated=truncated))
        return approved()
