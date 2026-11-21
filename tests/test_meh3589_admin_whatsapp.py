"""MEH-3589 — every WhatsApp to the admin is the approved template.

Free text (`send_text`) reaches a phone only inside Meta's 24h customer-service
window (131047 otherwise), so eight admin pings almost never arrived while the
email did. They now go through `services/admin_whatsapp.ping_admin`
(AdminUpdateV1). This file holds three things:

1. The guard: the admin's number is passed to `send_template` only — no
   `send_text(<…>.admin_whatsapp_to, …)` and no wrapper around it anywhere in
   app/ (admin_decisions._send_whatsapp was one).
   The scan is source-text by nature (it is a rule about the code); it ships
   with a synthetic self-test and a case anchored to a real repo file.
2. ping_admin itself: unset number, flattening, fail-open, test_cause.
3. Each of the eight notifiers sends AdminUpdateV1, and its email still goes.
"""

from __future__ import annotations

import ast
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from app.config import settings
from app.services import admin_whatsapp
from app.services import approved_edit_moderation as aem
from app.services import auth_notifications as an
from app.services.whatsapp_templates import AdminUpdateV1

APP_DIR = Path(__file__).resolve().parents[1] / "backend" / "app"
ADMIN_WA = "+972500000009"


def free_text_admin_sends(src: str, rel: str) -> list[str]:
    """Calls other than send_template whose first argument names admin_whatsapp_to."""
    out = []
    for node in ast.walk(ast.parse(src)):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        if name == "send_template" or not node.args:
            continue
        first = node.args[0]
        if any(
            isinstance(n, ast.Attribute) and n.attr == "admin_whatsapp_to"
            for n in ast.walk(first)
        ):
            out.append(f"{rel}:{node.lineno}")
    return out


# --- 1. the guard ----------------------------------------------------------


def test_guard_self_test_on_synthetic_source():
    bad = (
        "def f():\n"
        "    send_text(settings.admin_whatsapp_to, 'x')\n"
        "    whatsapp.send_text(cfg.settings.admin_whatsapp_to, 'y', test_cause=t)\n"
        "    _send_whatsapp(settings.admin_whatsapp_to, 'z')\n"  # a wrapper, MEH-3589
    )
    good = (
        "def g():\n"
        "    send_text(buyer.phone, 'hi')\n"  # a reply inside the window is fine
        "    send_template(settings.admin_whatsapp_to, tpl)\n"
    )
    assert free_text_admin_sends(bad, "syn.py") == ["syn.py:2", "syn.py:3", "syn.py:4"]
    assert free_text_admin_sends(good, "syn.py") == []


def test_guard_anchored_to_a_real_file():
    # whatsapp_webhook.py replies with send_text to the sender (inside the
    # window, legitimate) — the scan must not flag it, and must have seen it.
    rel = "routers/whatsapp_webhook.py"
    src = (APP_DIR / rel).read_text(encoding="utf-8")
    assert "send_text(" in src
    assert free_text_admin_sends(src, rel) == []


def test_no_free_text_whatsapp_to_the_admin_anywhere_in_app():
    files = sorted(APP_DIR.rglob("*.py"))
    assert len(files) > 100, "the walk found almost nothing — the probe is broken"
    found = [
        hit
        for p in files
        for hit in free_text_admin_sends(
            p.read_text(encoding="utf-8"), str(p.relative_to(APP_DIR))
        )
    ]
    assert found == [], (
        "free-text WhatsApp to the admin — Meta drops it outside the 24h window; "
        "use services/admin_whatsapp.ping_admin: " + ", ".join(found)
    )


# --- 2. ping_admin ---------------------------------------------------------


@pytest.fixture
def admin_number(monkeypatch):
    monkeypatch.setattr(settings, "admin_whatsapp_to", ADMIN_WA)
    monkeypatch.setattr(settings, "admin_email", "admin@example.com")


def test_ping_admin_sends_the_template_flattened(admin_number):
    with patch.object(admin_whatsapp, "send_template", return_value=True) as send:
        assert admin_whatsapp.ping_admin("נושא\nשני", "פרטים\tעם\n\nשורות") is True
    to, template = send.call_args.args
    assert to == ADMIN_WA
    assert template == AdminUpdateV1(topic="נושא שני", detail="פרטים עם שורות")
    assert send.call_args.kwargs == {"test_cause": False}


def test_ping_admin_without_a_number_sends_nothing(monkeypatch):
    monkeypatch.setattr(settings, "admin_whatsapp_to", "")
    with patch.object(admin_whatsapp, "send_template") as send:
        assert admin_whatsapp.ping_admin("a", "b") is False
    send.assert_not_called()


def test_ping_admin_is_fail_open(admin_number):
    with patch.object(
        admin_whatsapp, "send_template", side_effect=RuntimeError("meta")
    ) as send:
        assert admin_whatsapp.ping_admin("a", "b") is False
    send.assert_called_once()  # reached, then swallowed


def test_ping_admin_forwards_test_cause(admin_number):
    with patch.object(admin_whatsapp, "send_template", return_value=False) as send:
        admin_whatsapp.ping_admin("a", "b", test_cause=True)
    assert send.call_args.kwargs == {"test_cause": True}


def test_ping_admin_empty_detail_is_a_dash(admin_number):
    # Meta rejects an empty parameter; "-" keeps the message sendable.
    with patch.object(admin_whatsapp, "send_template", return_value=True) as send:
        admin_whatsapp.ping_admin("נושא", "   ")
    assert send.call_args.args[1].detail == "-"


# --- 3. the eight notifiers --------------------------------------------------

NOTIFIERS = {
    "new_recipe": (
        lambda: an.notify_admin_new_recipe("משק", "לחם"),
        "מתכון חדש לאישור",
        "לחם",
    ),
    "claim_link": (
        lambda: an.notify_admin_claim_link_requested("משק", "חדרה"),
        "בקשה לקישור חדש לדרישת בעלות",
        "משק",
    ),
    "draft_claimed": (
        lambda: an.notify_admin_draft_claimed("משק", "רותם", "r@example.com", "חדרה"),
        "טיוטה נקלטה",
        "רותם",
    ),
    "sensitive_edit": (
        lambda: an.notify_admin_producer_sensitive_edit("משק", ["phone"]),
        "עסק מאושר עדכן פרטים רגישים",
        "משק",
    ),
    "category_request": (
        lambda: an.notify_admin_new_category_request("מותססים", "משק"),
        "בקשת קטגוריה חדשה",
        "מותססים",
    ),
    "business_suggestion": (
        lambda: an.notify_admin_new_business_suggestion("משק", "חיפה", "דנה"),
        "המלצת קהילה חדשה",
        "משק",
    ),
    "owner_invite_accepted": (
        lambda: an.notify_admin_owner_invite_accepted("משק", "o@example.com", True),
        "בעלת עסק אישרה את ההזמנה",
        "משק",
    ),
    "content_edit": (
        lambda: aem.notify_admin_content_edit("משק", ["description"], True),
        "עסק מאושר עדכן תוכן (סומן ע״י AI)",
        "משק",
    ),
}


@pytest.mark.parametrize("key", sorted(NOTIFIERS))
def test_each_admin_notifier_sends_the_template_and_the_email(admin_number, key):
    call, topic, in_detail = NOTIFIERS[key]
    mail = MagicMock()
    with (
        patch.object(admin_whatsapp, "send_template", return_value=True) as send,
        patch.object(an, "send_email", mail),
        patch.object(aem, "send_email", mail),
    ):
        call()
    send.assert_called_once()
    to, template = send.call_args.args
    assert to == ADMIN_WA
    assert isinstance(template, AdminUpdateV1)
    assert template.topic == topic
    assert in_detail in template.detail
    mail.assert_called_once()  # the email is unchanged and still goes


@pytest.mark.parametrize("key", sorted(NOTIFIERS))
def test_a_whatsapp_failure_never_skips_the_email(admin_number, key):
    call, _topic, _detail = NOTIFIERS[key]
    mail = MagicMock()
    with (
        patch.object(admin_whatsapp, "send_template", side_effect=RuntimeError("down")),
        patch.object(an, "send_email", mail),
        patch.object(aem, "send_email", mail),
    ):
        call()
    mail.assert_called_once()
