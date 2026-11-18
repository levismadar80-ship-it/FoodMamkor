"""
Module:   approved_edit_moderation
Purpose:  MEH-3261 — once a business is approved its public text and photos go
          live with no review. This adds the two missing signals: an AI check on
          changed text (a REJECTED verdict refuses the save with a 422) and one
          admin ping per save that changed the description, short description,
          owner story or photos («📝 עסק מאושר עדכן תוכן»).
Touches:  Anthropic (fast-tier Haiku, one call per save that changed text),
          WhatsApp + Resend (admin ping, BackgroundTask). No DB writes, no schema.
Does NOT: moderate a PENDING business (the admin reads everything at approval),
          store a verdict (no column — D11 ruled "no new schema"), or ping on the
          MEH-2073 identity/trust fields (that is `_maybe_fire_sensitive_edit`
          in routers/producer_me.py, a separate message).
Related:  routers/producer_me.py update_my_producer / create_my_product /
          update_my_product (the call sites); routers/reviews.py
          `_moderate_text` (the same prompt contract and fail-open);
          services/auth_notifications.py notify_admin_producer_sensitive_edit
          (the ping this one mirrors).
History:  MEH-3261 (creation, grill-retro decision D11).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import BackgroundTasks, HTTPException

from app.config import ai_fast_request_kwargs, settings
from app.services.auth_notifications import _sanitize_wa_param, _skip_test_cause
from app.services.email import send_email
from app.services.moderation_fail_open import classify_failure, report_fail_open
from app.services.moderation_prompt import wrap_submission
from app.services.moderation_schemas import REVIEW_VERDICT_SCHEMA
from app.services.whatsapp import send_text

log = logging.getLogger(__name__)

# The business-level text a visitor reads on the public page.
PRODUCER_TEXT_FIELDS = ("description", "short_description", "owner_bio")
# A product's public text.
PRODUCT_TEXT_FIELDS = ("name", "description", "ingredients")

# Order here is the order in the admin message.
CONTENT_FIELD_LABELS: dict[str, str] = {
    "description": "תיאור",
    "short_description": "תיאור קצר",
    "owner_bio": "מאחורי העסק",
    "images": "תמונות",
    "products": "מוצרים",
}
FLAGGED_SUFFIX = " — טקסט סומן ע״י AI"

# Hebrew in `detail=` is required — backend/app/routers/CLAUDE.md.
REJECTED_DETAIL = "הטקסט אינו עומד בהנחיות הקהילה שלנו. אפשר לנסח מחדש ולשמור שוב."

_VALID = {"APPROVED", "FLAGGED", "REJECTED"}
_FIELD_NAMES = {
    "description": "תיאור",
    "short_description": "תיאור קצר",
    "owner_bio": "מאחורי העסק",
    "name": "שם המוצר",
    "ingredients": "רכיבים",
}
_SYSTEM = """אתה מודרטור תוכן לאתר מהמקור — פלטפורמה לאוכל בריא ומקומי בישראל.
בעלת בית עסק מאושר שינתה טקסט שמופיע בעמוד הציבורי של העסק. בדוק את הטקסט ותחזיר JSON בלבד.

{data_rule}

החזר JSON בלבד (ללא ```json):
{{"status": "APPROVED" | "FLAGGED" | "REJECTED", "reason": "..."}}

APPROVED אם: תיאור של העסק, המוצרים, הסיפור האישי של בעלת העסק או דרכי ההזמנה. מותר: פרטי הקשר של העסק עצמו, מבצעים שלו, אזכור ספקים, נקודות מכירה ושיתופי פעולה, אלכוהול (יקב, מבשלה), התאמה תזונתית (ללא גלוטן, מתאים לצליאק, טבעוני, דל סוכר). שם מוצר קצר הוא תקין
FLAGGED אם: טענות בריאות מוגזמות, תוכן שלא קשור לעסק, טקסט לא ברור
REJECTED אם: לשון גסה או מבזה, גזענות, תוכן מיני, טענה שמוצר מרפא או מונע מחלה, פעילות לא חוקית, פרסומת לעסק שאינו קשור לעסק הזה או הפניית לקוחות למתחרה"""

_client: Any = None


def _get_client() -> Any:
    # REUSES: services/experience_moderation.py:_get_client — lazy, fail-open.
    global _client
    if _client is not None:
        return _client
    if not settings.anthropic_api_key:
        return None
    try:
        import anthropic
        import httpx

        _client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            http_client=httpx.Client(),
            max_retries=1,  # the call runs inside the owner's save
        )
        return _client
    except Exception:  # pragma: no cover — defensive
        log.warning("[approved-edit] anthropic client init failed", exc_info=True)
        return None


def _norm(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def changed_texts(
    obj: object, payload: dict[str, Any], fields: tuple[str, ...]
) -> dict[str, str]:
    """The fields of `payload` whose text differs from `obj` after strip.

    A form that re-posts an unchanged description is not an edit, and a field
    cleared to empty has nothing to check."""
    return {
        f: _norm(payload[f])
        for f in fields
        if f in payload
        and _norm(payload[f])
        and _norm(payload[f]) != _norm(getattr(obj, f, None))
    }


def moderate(texts: dict[str, str], surface: str) -> str | None:
    """'APPROVED' | 'FLAGGED' | 'REJECTED', or None on fail-open (the save goes
    through exactly as for APPROVED; the miss is reported to Sentry)."""
    if not texts:
        return "APPROVED"
    client = _get_client()
    if client is None:
        report_fail_open(surface, "no_client")
        return None
    data_rule, user_content = wrap_submission(
        surface, {_FIELD_NAMES.get(k, k): v for k, v in texts.items()}
    )
    truncated = False
    try:
        msg = client.messages.create(
            **ai_fast_request_kwargs(json_schema=REVIEW_VERDICT_SCHEMA),
            max_tokens=300,  # same headroom as reviews (MEH-2335)
            # MEH-3261: the call runs inside the owner PUT, under the business's
            # advisory lock — a slow AI must not hold it. A timeout fails open.
            timeout=10.0,
            system=_SYSTEM.format(data_rule=data_rule),
            messages=[{"role": "user", "content": user_content}],
        )
        if getattr(msg, "stop_reason", None) == "refusal":
            return "FLAGGED"  # a classifier decline is a signal about the text
        truncated = getattr(msg, "stop_reason", None) == "max_tokens"
        raw = next(
            (b.text for b in msg.content if getattr(b, "type", None) == "text"), ""
        )
        start, end = raw.find("{"), raw.rfind("}")
        parsed = json.loads(raw[start : end + 1]) if 0 <= start < end else None
        status = (
            str(parsed.get("status", "")).upper() if isinstance(parsed, dict) else ""
        )
        if status in _VALID:
            return status
        report_fail_open(surface, "truncated" if truncated else "bad_status")
        return None
    except Exception as exc:  # noqa: BLE001 — moderation fails open
        log.warning("[approved-edit] AI check failed (%s)", surface, exc_info=True)
        report_fail_open(surface, classify_failure(exc, truncated=truncated))
        return None


def check_or_reject(texts: dict[str, str], surface: str) -> str | None:
    """Run `moderate`; a REJECTED verdict refuses the whole save with a 422,
    raised before any attribute is written. No changed text → no AI call."""
    if not texts:
        return None
    status = moderate(texts, surface)
    if status == "REJECTED":
        raise HTTPException(status_code=422, detail=REJECTED_DETAIL)
    return status


def check_producer(producer: Any, payload: dict[str, Any]) -> str | None:
    """Owner PUT: an APPROVED business's changed description / short / bio.
    A pending business is skipped — the admin reads everything at approval."""
    if producer.status != "approved":
        return None
    return check_or_reject(
        changed_texts(producer, payload, PRODUCER_TEXT_FIELDS), "producer_content"
    )


def snapshot_content(producer: object) -> dict[str, Any]:
    """The pinged fields as they stand BEFORE the setattr loop."""
    snap: dict[str, Any] = {
        f: _norm(getattr(producer, f, None)) for f in PRODUCER_TEXT_FIELDS
    }
    # A set: reordering photos is not new content and pings nobody.
    snap["images"] = frozenset(getattr(producer, "images", None) or [])
    return snap


def changed_content(before: dict[str, Any], producer: object) -> list[str]:
    after = snapshot_content(producer)
    return [f for f in CONTENT_FIELD_LABELS if f in before and before[f] != after[f]]


def fire_content_edit(
    background_tasks: BackgroundTasks,
    producer: Any,
    changed: list[str],
    flagged: bool,
    test_cause: bool,
) -> None:
    """One ping per save, only for an APPROVED business that changed something."""
    if producer.status != "approved" or not changed:
        return
    background_tasks.add_task(
        _content_edit_task, str(producer.name), changed, flagged, test_cause=test_cause
    )


def _content_edit_task(
    name: str, changed: list[str], flagged: bool, test_cause: bool
) -> None:
    # Fail-open boundary: a BackgroundTask that raises surfaces after the 200
    # (see producer_me._sensitive_edit_task for the incident).
    try:
        notify_admin_content_edit(name, changed, flagged, test_cause=test_cause)
    except Exception:  # noqa: BLE001 — fire-and-forget
        log.exception("[NOTIFY] content-edit ping failed for '%s'", name)


def check_product(
    background_tasks: BackgroundTasks,
    producer: Any,
    product: object | None,
    payload: dict[str, Any],
    test_cause: bool,
) -> None:
    """Product create/update of an APPROVED business: REJECTED → 422, FLAGGED →
    one «מוצרים (סומן ע״י AI)» ping. An approved product edit is routine, so
    nothing pings without a flag. Queued before the commit on purpose — if
    the commit raises, Starlette never runs the task."""
    if producer is None or producer.status != "approved":
        return
    texts = changed_texts(product, payload, PRODUCT_TEXT_FIELDS)
    if check_or_reject(texts, "product_content") == "FLAGGED":
        fire_content_edit(background_tasks, producer, ["products"], True, test_cause)


def content_edit_message(name: str, changed: list[str], flagged: bool) -> str:
    fields = " · ".join(CONTENT_FIELD_LABELS.get(f, f) for f in changed)
    suffix = FLAGGED_SUFFIX if flagged else ""
    return f"📝 עסק מאושר עדכן תוכן: {_sanitize_wa_param(name)} — {fields}{suffix}"


def notify_admin_content_edit(
    name: str, changed: list[str], flagged: bool, test_cause: bool = False
) -> None:
    # REUSES: auth_notifications.notify_admin_producer_sensitive_edit — same
    # channels, per-channel try blocks so a WhatsApp raise never skips email.
    if test_cause:  # MEH-2952
        return _skip_test_cause("notify_admin_content_edit", None)
    message = content_edit_message(name, changed, flagged)
    try:
        if settings.admin_whatsapp_to:
            send_text(settings.admin_whatsapp_to, message, test_cause=test_cause)
    except Exception:  # noqa: BLE001
        log.exception("[NOTIFY] content-edit WhatsApp failed for '%s'", name)
    try:
        if settings.admin_email:
            send_email(
                settings.admin_email,
                f"מהמקור - {_sanitize_wa_param(name)} עדכן תוכן"
                + (" (סומן ע״י AI)" if flagged else ""),
                message,
                test_cause=test_cause,
            )
    except Exception:  # noqa: BLE001
        log.exception("[NOTIFY] content-edit email failed for '%s'", name)
