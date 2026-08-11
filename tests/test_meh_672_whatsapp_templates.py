"""MEH-672 chunk 1/5 — typed WhatsApp template foundation.

Unit tests for app/services/whatsapp_templates.py. Pure construction +
to_components() assertions; no DB, no network, no conftest fixtures.

Covers the failure class MEH-672 exists to close (MEH-509 param
mismatch): missing param, extra param, and that to_components() matches
the exact components array the current string+list send_template
produces — including the zero-param empty-components case.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.services.whatsapp_templates import (
    AfterHoursResponseHe,
    ProducerApprovedV1,
    ProducerWelcomeV1,
    VacationResponseHeV2,
    WhatsAppTemplate,
)


# ---- ClassVar contract (names + language) ----------------------------------

def test_template_names_and_language_match_meta():
    assert ProducerWelcomeV1.name == "producer_welcome_v1"
    assert ProducerApprovedV1.name == "producer_approved_v1"
    assert AfterHoursResponseHe.name == "after_hours_response_he"
    assert VacationResponseHeV2.name == "vacation_response_he_v2"
    # All four are Hebrew; language defaults on the base.
    for cls in (ProducerWelcomeV1, ProducerApprovedV1, AfterHoursResponseHe, VacationResponseHeV2):
        assert cls.language == "he"
        assert issubclass(cls, WhatsAppTemplate)


# ---- Missing required field → ValidationError ------------------------------

def test_missing_required_field_raises():
    with pytest.raises(ValidationError):
        ProducerWelcomeV1()  # type: ignore[call-arg] — missing producer_name
    with pytest.raises(ValidationError):
        ProducerApprovedV1()  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        VacationResponseHeV2()  # type: ignore[call-arg] — missing return_date


# ---- Extra field → ValidationError (extra="forbid") ------------------------

def test_extra_field_raises():
    with pytest.raises(ValidationError):
        ProducerWelcomeV1(producer_name="ספיר", extra="nope")  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        AfterHoursResponseHe(unexpected="x")  # type: ignore[call-arg]


# ---- to_components() shape (matches whatsapp.py:88-97 output) ---------------

def test_producer_welcome_components():
    comps = ProducerWelcomeV1(producer_name="ספיר").to_components()
    assert comps == [
        {"type": "body", "parameters": [{"type": "text", "text": "ספיר"}]}
    ]


def test_producer_approved_components():
    comps = ProducerApprovedV1(producer_name="חוות הדס").to_components()
    assert comps == [
        {"type": "body", "parameters": [{"type": "text", "text": "חוות הדס"}]}
    ]


def test_vacation_components_single_return_date_param():
    comps = VacationResponseHeV2(return_date="2026-06-10").to_components()
    assert comps == [
        {"type": "body", "parameters": [{"type": "text", "text": "2026-06-10"}]}
    ]


def test_after_hours_emits_no_components_block():
    # Zero fields ⇒ [] (no components block), matching the current
    # empty-params path in send_template (whatsapp.py:88-97).
    assert AfterHoursResponseHe().to_components() == []
