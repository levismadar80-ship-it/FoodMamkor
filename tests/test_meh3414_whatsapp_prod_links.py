"""MEH-3414: outside production, a WhatsApp template whose Meta-registered
text links to mehamakor.co.il is not sent — it would point a staging reader
at production. Fail-closed: only templates marked `sends_outside_production`
(no link, e.g. the OTP) still go to the staff numbers MEH-3402 allows."""

from __future__ import annotations

import pytest

from app.config import settings
from app.services import outbound_guard, whatsapp
from app.services import whatsapp_templates as wt

STAFF = "0501234567"


@pytest.fixture
def graph_spy(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "pid")
    monkeypatch.setattr(settings, "whatsapp_access_token", "tok")
    monkeypatch.setattr(settings, "admin_whatsapp_to", STAFF)
    monkeypatch.setattr(settings, "otp_test_numbers", "")

    def fake_post(payload, *, kind, to):
        calls.append(payload["template"]["name"])
        return True

    monkeypatch.setattr(whatsapp, "_post", fake_post)
    return calls


@pytest.fixture
def staging(monkeypatch):
    # conftest pins is_production → True suite-wide (MEH-3402); set it here.
    monkeypatch.setattr(outbound_guard, "is_production", lambda: False)


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(outbound_guard, "is_production", lambda: True)


def _admin_pending():
    return wt.AdminBusinessPendingV1(producer_name="משק", city="עופר")


def test_staging_admin_pending_to_staff_number_is_not_sent(staging, graph_spy):
    # The exact message from 15/11: staff number, so MEH-3402 lets it pass;
    # its Meta text says https://mehamakor.co.il/admin/producers.
    assert whatsapp.send_template(STAFF, _admin_pending()) is False
    assert graph_spy == []


def test_staging_welcome_to_staff_number_is_not_sent(staging, graph_spy):
    template = wt.ProducerWelcomeV2(producer_name="משק")
    assert whatsapp.send_template(STAFF, template) is False
    assert graph_spy == []


def test_staging_otp_to_staff_number_is_still_sent(staging, graph_spy):
    assert whatsapp.send_template(STAFF, wt.OtpCodeV1(code="123456")) is True
    assert graph_spy == ["producer_otp_v1"]


def test_production_admin_pending_is_sent(production, graph_spy):
    assert whatsapp.send_template(STAFF, _admin_pending()) is True
    assert graph_spy == ["admin_business_pending_v1"]


def test_only_link_free_templates_may_send_outside_production():
    # A new template is blocked outside production unless someone decides
    # otherwise here — naming its class is that decision.
    def walk(cls):
        for sub in cls.__subclasses__():
            yield sub
            yield from walk(sub)

    allowed = {
        cls.__name__
        for cls in walk(wt.WhatsAppTemplate)
        if cls.sends_outside_production
    }
    assert allowed == {"OtpCodeV1"}
