"""MEH-3640: «הסר» stops every WhatsApp template, not only favourite alerts.

Meta's policy is to honour every request to stop. Before this card the webhook
switched off favourite alerts only; order and business messages kept going to
a number whose last word to us was «הסר». The check now sits in the send layer
in front of every template, except a code the person asked for.
"""
from datetime import timedelta

import pytest

from app.config import settings
from app.models.models import InboundMessage
from app.services import whatsapp
from app.services.whatsapp_templates import OtpCodeV1, ProducerApprovedV1
from app.utils.clock import utc_now

PHONE = "+972541112233"
FROM = "972541112233"  # Meta's `from`, as the webhook stores it


@pytest.fixture
def graph(monkeypatch):
    """Production, configured, and a recorder in place of the Graph call."""
    monkeypatch.setattr(settings, "env", "production")
    monkeypatch.setattr(settings, "railway_environment", "production")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "pid")
    monkeypatch.setattr(settings, "whatsapp_access_token", "tok")
    sent: list[str] = []

    def fake_post(payload, *, kind, to):
        sent.append(payload["template"]["name"])
        return True

    def fake_post_result(payload, *, kind, to):
        sent.append(payload["template"]["name"])
        return whatsapp.WhatsAppSendResult(outcome=whatsapp.OUTCOME_ACCEPTED, ok=True)

    monkeypatch.setattr(whatsapp, "_post", fake_post)
    monkeypatch.setattr(whatsapp, "_post_result", fake_post_result)
    return sent


def _inbound(db, body, minutes_ago):
    db.add(
        InboundMessage(
            from_phone=FROM,
            body=body,
            received_at=utc_now().replace(tzinfo=None) - timedelta(minutes=minutes_ago),
        )
    )
    db.commit()


def test_control_no_inbound_message_sends(db, graph):
    """Control: the recorder sees a send when nothing stops it."""
    assert whatsapp.send_template(PHONE, ProducerApprovedV1(producer_name="משק")) is True
    assert graph == ["producer_approved_v1"]


def test_after_hasser_a_business_message_is_not_sent(db, graph):
    _inbound(db, "הסר", minutes_ago=5)
    assert whatsapp.send_template(PHONE, ProducerApprovedV1(producer_name="משק")) is False
    assert graph == []


def test_after_hasser_the_outcome_twin_reports_opted_out(db, graph):
    _inbound(db, " STOP ", minutes_ago=5)
    result = whatsapp.send_template_result(PHONE, ProducerApprovedV1(producer_name="משק"))
    assert result.ok is False
    assert result.outcome == whatsapp.OUTCOME_OPTED_OUT
    assert graph == []


def test_after_hasser_a_code_she_asked_for_still_goes(db, graph):
    _inbound(db, "הסר", minutes_ago=5)
    assert whatsapp.send_template(PHONE, OtpCodeV1(code="123456")) is True
    assert graph == ["producer_otp_v1"]


def test_a_later_message_clears_the_stop(db, graph):
    _inbound(db, "הסר", minutes_ago=10)
    _inbound(db, "שלום, יש לי שאלה", minutes_ago=1)
    assert whatsapp.send_template(PHONE, ProducerApprovedV1(producer_name="משק")) is True
    assert graph == ["producer_approved_v1"]


def test_hasser_from_another_number_does_not_stop_this_one(db, graph):
    db.add(InboundMessage(from_phone="972549998877", body="הסר"))
    db.commit()
    assert whatsapp.send_template(PHONE, ProducerApprovedV1(producer_name="משק")) is True
