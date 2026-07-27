"""Typed WhatsApp template definitions (MEH-672 chunk 1/5).

Module:   whatsapp_templates
Purpose:  One Pydantic class per Meta-approved WhatsApp template, so a
          param mismatch (missing / extra / wrong-count) is caught at
          construction + type-check time instead of by a Meta 400 at
          runtime (the MEH-509 production failure class).
Touches:  Nothing yet — purely additive. No caller imports this in
          chunk 1; transport (`send_template`), the auth-notification
          callers, and the watchdog dispatch migrate in chunks 2-4.
Does NOT: send anything — `to_components()` only builds the components
          array. Network I/O stays in `app/services/whatsapp.py`.
Related:  app/services/whatsapp.py:71 (send_template — current
          string+list signature this will replace in chunk 2).
History:  MEH-672 (creation, chunk 1 — base + 4 subclasses + tests).

The subclasses mirror the live templates exactly (names, languages,
and field order verified against the call sites in Phase 0):

    producer_welcome_v1    he  1 param  (producer_name)
    producer_approved_v1   he  1 param  (producer_name)
    producer_changes_requested_v1 he 2 params (producer_name, missing_details)
    after_hours_response_he he 0 params
    vacation_response_he_v2 he 1 param  (return_date, ISO date string)
    producer_otp_v1        he  1 param  (code) — AUTHENTICATION category,
                                              copy-code button

`to_components()` reproduces `whatsapp.py:88-97` byte-for-byte: model
fields become ordered body text-parameters; a class with zero fields
emits NO `components` block (returns `[]`), matching the current
empty-params behavior. `OtpCodeV1` overrides `to_components()` because
Meta AUTHENTICATION templates need the code in BOTH the body parameter
AND the copy-code URL-button component — a body-only payload 400s.

History:  MEH-672 (creation, chunk 1); MEH-754 (OtpCodeV1 — OTP via
          authentication template, copy-code button); MEH-1051
          (ProducerChangesRequestedV1 — first 2-param template).
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import BaseModel, ConfigDict


class WhatsAppTemplate(BaseModel):
    """Base for a single Meta-approved WhatsApp template.

    Subclasses set the `name` ClassVar and declare one model field per
    `{{n}}` body placeholder, in placeholder order. `extra="forbid"`
    makes an unexpected kwarg raise `ValidationError` rather than be
    silently dropped.
    """

    model_config = ConfigDict(extra="forbid")

    # Meta template name + language code. ClassVars → not model fields,
    # so they are never treated as body parameters.
    name: ClassVar[str]
    language: ClassVar[str] = "he"

    def to_components(self) -> list[dict[str, object]]:
        """Build the Meta `components` array from the model fields.

        Fields are emitted as body text-parameters in declaration order.
        Zero fields ⇒ `[]` (no `components` block) — preserves the
        `whatsapp.py:88-97` empty-params contract exactly.
        """
        values = [getattr(self, field_name) for field_name in type(self).model_fields]
        if not values:
            return []
        return [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": value} for value in values],
            }
        ]


class ProducerWelcomeV1(WhatsAppTemplate):
    """Sent to a producer at signup. One param: business name."""

    name: ClassVar[str] = "producer_welcome_v1"
    producer_name: str


class ProducerApprovedV1(WhatsAppTemplate):
    """Sent once an admin approves the producer. One param: business name."""

    name: ClassVar[str] = "producer_approved_v1"
    producer_name: str


class ProducerChangesRequestedV1(WhatsAppTemplate):
    """Sent when an admin requests completion details (MEH-1011 flow).

    Two params in {{n}} placeholder order: business name, what's missing.
    UTILITY category, no buttons — the first 2-param template; the base
    `to_components()` emits both body parameters in declaration order.
    """

    name: ClassVar[str] = "producer_changes_requested_v1"
    producer_name: str
    missing_details: str


class AfterHoursResponseHe(WhatsAppTemplate):
    """Auto-reply outside business hours. No params."""

    name: ClassVar[str] = "after_hours_response_he"


class VacationResponseHeV2(WhatsAppTemplate):
    """Auto-reply while on vacation. One param: return date (ISO string)."""

    name: ClassVar[str] = "vacation_response_he_v2"
    return_date: str


class OtpCodeV1(WhatsAppTemplate):
    """One-time-passcode delivery (MEH-754). One param: the OTP code.

    Meta AUTHENTICATION-category template with a copy-code button. Unlike
    the body-only templates above, the code must appear TWICE in the
    payload — once as the body text-parameter and once in the URL-button
    component (`sub_type="url"`, `index=0`). Sending body-only yields a
    Meta 400, so `to_components()` is overridden rather than using the
    base body-only builder.
    """

    name: ClassVar[str] = "producer_otp_v1"
    code: str

    def to_components(self) -> list[dict[str, object]]:
        return [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": self.code}],
            },
            {
                "type": "button",
                "sub_type": "url",
                "index": 0,
                "parameters": [{"type": "text", "text": self.code}],
            },
        ]


class FavoriteAlertHeV1(WhatsAppTemplate):
    """Favorite-alert notification (MEH-1329). UTILITY category, dynamic-URL button.

    Delivered business-initiated (outside the 24h service window), so free-form
    `send_text` — which 131047/window_expires for a customer who never messaged
    us — is replaced by this approved template. Two body params in {{n}} order
    plus a URL-button param that is NOT a body parameter:

        {{1}} producer_name — the saved business's name
        {{2}} update_line   — the sanitized headline (emoji-stripped, single-line)
        url_path            — the "/…" path for the dynamic button URL
                              (https://mehamakor.co.il{{1}}; the domain lives on
                              the Meta side, so we pass only the leading-"/" path)

    Like `OtpCodeV1`, `to_components()` is overridden — the base builder would
    (wrongly) emit `url_path` as a third body parameter. Here the body carries
    only producer_name + update_line, and url_path goes solely to the button
    (`sub_type="url"`, `index=0`), mirroring the OtpCodeV1 precedent.
    """

    name: ClassVar[str] = "favorite_alert_he_v1"
    producer_name: str
    update_line: str
    url_path: str

    def to_components(self) -> list[dict[str, object]]:
        return [
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": self.producer_name},
                    {"type": "text", "text": self.update_line},
                ],
            },
            {
                "type": "button",
                "sub_type": "url",
                "index": 0,
                "parameters": [{"type": "text", "text": self.url_path}],
            },
        ]


class KashrutExpiryReminderV1(WhatsAppTemplate):
    """MEH-1673: reminds a business owner ~30 days before her kashrut
    certificate expires, so the badge (and the MEH-1672 certificate display)
    stays continuous.

    UTILITY category, no buttons — three body params in {{n}} order:
    owner/business name, business name, expiry date. The base
    `to_components()` emits all three in declaration order.

    # DO NOT rename — `kashrut_expiry_reminder` is the name registered with
    # Meta; a mismatch returns error 132001 (template does not exist).
    """

    name: ClassVar[str] = "kashrut_expiry_reminder"
    owner_name: str
    producer_name: str
    expires_at: str
