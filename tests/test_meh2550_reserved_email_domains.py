"""MEH-2550 — no send, and no Sentry event, for a reserved test domain.

Resend rejects example.com and friends with a ValidationError; swallow point 3
in `send_email` reported each one to Sentry (MEHAMAKOR-BACKEND-N, 1,955 events,
all E2E signups on staging). A reserved domain (RFC 2606 / 6761) can never
receive mail, so it is skipped before the API call.

The fake `resend` module records every call. Cases are named for the input.
"""

from __future__ import annotations

import sys
import types

import pytest

from app.services import email as email_mod


@pytest.fixture
def fake_resend(monkeypatch):
    calls = []
    fake = types.ModuleType("resend")
    fake.Emails = types.SimpleNamespace(send=lambda params: calls.append(params))
    monkeypatch.setitem(sys.modules, "resend", fake)
    monkeypatch.setattr(email_mod.settings, "resend_api_key", "re_test_key", raising=False)
    return calls


@pytest.fixture
def reports(monkeypatch):
    seen = []
    monkeypatch.setattr(email_mod, "_report", lambda exc, **kw: seen.append(kw["stage"]))
    return seen


@pytest.mark.parametrize(
    "to",
    [
        "e2e@example.com",
        "a@EXAMPLE.ORG",
        "a@example.net.",
        "a@mail.example.com",
        "a@shop.test",
        "a@x.invalid",
        "a@host.localhost",
        "a@site.example",
    ],
)
def test_reserved_domain_is_not_sent_and_not_reported(to, fake_resend, reports):
    email_mod.send_email(to, "subject", "body")
    assert fake_resend == []
    assert reports == []


@pytest.mark.parametrize(
    "to",
    [
        "owner@mehamakor.co.il",
        "a@gmail.com",
        "a@example.com.il",  # a real registrable domain, not the reserved one
        "a@notexample.com",
        "a@testing.co.il",
    ],
)
def test_real_domain_is_sent(to, fake_resend, reports):
    email_mod.send_email(to, "subject", "body")
    assert [c["to"] for c in fake_resend] == [to]
    assert reports == []
