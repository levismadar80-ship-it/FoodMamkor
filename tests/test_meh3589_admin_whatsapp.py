"""MEH-3589 — the admin gets her notices by email; WhatsApp only for one template.

Sapir's decision, 21/11: admin notifications go by email only. The eight admin
pings that were free-text `send_text` (Meta drops those outside its 24h window,
131047) are removed, not moved to a template — Meta read the proposed
admin_update_v1 as Marketing twice. The one exception is
AdminBusinessPendingV1 (MEH-3147, approved by Meta): a business waiting for
approval. The rest (MEH-3596) is a follow-up.

1. The guard: in app/, a call whose first argument names `admin_whatsapp_to`
   is allowed only as `send_template(...)` inside a function that builds an
   AdminBusinessPendingV1. Anything else — send_text, a wrapper, another
   template — fails. Source-text by nature (a rule about the code); it ships
   with a synthetic self-test and a case anchored to a real repo file.
   It sees the number in any positional or keyword argument, anywhere in the
   module, and judges the template per call. Its limit: the number must be
   written as `x.admin_whatsapp_to` in the call; `to = settings.admin_whatsapp_to;
   send_text(to, …)` passes it. Run against origin/staging it found 11 sites.
2. Each of the eight notifiers sends one email and no WhatsApp; a test-caused
   notice and an unset ADMIN_EMAIL send nothing.
"""

from __future__ import annotations

import ast
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from app.config import settings
from app.services import approved_edit_moderation as aem
from app.services import auth_notifications as an

APP_DIR = Path(__file__).resolve().parents[1] / "backend" / "app"
ALLOWED_TEMPLATE = "AdminBusinessPendingV1"


def _names_number(node: ast.AST) -> bool:
    return any(
        isinstance(n, ast.Attribute) and n.attr == "admin_whatsapp_to"
        for n in ast.walk(node)
    )


def _is_allowed_template(node: ast.AST | None, bound: set[str]) -> bool:
    if isinstance(node, ast.Call):
        return getattr(node.func, "id", "") == ALLOWED_TEMPLATE
    return isinstance(node, ast.Name) and node.id in bound


def admin_whatsapp_sends(src: str, rel: str) -> list[str]:
    """Calls that pass admin_whatsapp_to (positional or keyword, anywhere in
    the module), other than `send_template(number, AdminBusinessPendingV1(...))`
    — the template judged per CALL, written inline or as a name bound to one."""
    tree = ast.parse(src)
    bound = {
        t.id
        for n in ast.walk(tree)
        if isinstance(n, ast.Assign) and _is_allowed_template(n.value, set())
        for t in n.targets
        if isinstance(t, ast.Name)
    }
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        values = [*node.args, *(k.value for k in node.keywords)]
        if not any(_names_number(v) for v in values):
            continue
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        if name == "send_template":
            kw = {k.arg: k.value for k in node.keywords}
            tpl = node.args[1] if len(node.args) > 1 else kw.get("template")
            if _is_allowed_template(tpl, bound):
                continue
        out.append(f"{rel}:{node.lineno}")
    return sorted(set(out))


# --- 1. the guard ----------------------------------------------------------


def test_guard_self_test_on_synthetic_source():
    bad = (
        "def f():\n"
        "    send_text(settings.admin_whatsapp_to, 'x')\n"
        "    whatsapp.send_text(cfg.settings.admin_whatsapp_to, 'y', test_cause=t)\n"
        "    _send_whatsapp(settings.admin_whatsapp_to, 'z')\n"
        "    send_template(settings.admin_whatsapp_to, OtherV1(topic='a'))\n"
        "    send_text(body='x', to=settings.admin_whatsapp_to)\n"
        "    t = AdminBusinessPendingV1(producer_name='a', city='b')\n"
        "    send_template(settings.admin_whatsapp_to, OtherV1(topic='same fn'))\n"
        "send_text(settings.admin_whatsapp_to, 'module level')\n"
    )
    good = (
        "def g():\n"
        "    send_text(buyer.phone, 'hi')\n"
        "    t = AdminBusinessPendingV1(producer_name='a', city='b')\n"
        "    send_template(settings.admin_whatsapp_to, t)\n"
        "    send_template(\n"
        "        settings.admin_whatsapp_to, AdminBusinessPendingV1(producer_name='c')\n"
        "    )\n"
        "    send_template(to=settings.admin_whatsapp_to, template=t)\n"
    )
    assert admin_whatsapp_sends(bad, "syn.py") == [
        "syn.py:2",
        "syn.py:3",
        "syn.py:4",
        "syn.py:5",
        "syn.py:6",
        "syn.py:8",
        "syn.py:9",
    ]
    assert admin_whatsapp_sends(good, "syn.py") == []


def test_guard_anchored_to_a_real_file():
    # auth_notifications.notify_admin_new_producer sends AdminBusinessPendingV1
    # to the admin — the one allowed send; the scan must see it and pass it.
    rel = "services/auth_notifications.py"
    src = (APP_DIR / rel).read_text(encoding="utf-8")
    assert "send_template(" in src and ALLOWED_TEMPLATE in src
    assert "admin_whatsapp_to" in src
    assert admin_whatsapp_sends(src, rel) == []


def test_no_admin_whatsapp_but_the_pending_template_anywhere_in_app():
    files = sorted(APP_DIR.rglob("*.py"))
    assert len(files) > 100, "the walk found almost nothing — the probe is broken"
    found = [
        hit
        for p in files
        for hit in admin_whatsapp_sends(
            p.read_text(encoding="utf-8"), str(p.relative_to(APP_DIR))
        )
    ]
    assert found == [], (
        "WhatsApp to the admin outside admin_business_pending_v1 — admin notices "
        "are email only (MEH-3589, Sapir 21/11): " + ", ".join(found)
    )


# --- 2. the eight notifiers ------------------------------------------------

# key -> (call(test_cause), a phrase only that notice's subject carries).
# business_suggestion takes no test_cause (a visitor's 201, MEH-2633).
NOTIFIERS = {
    "new_recipe": (
        lambda tc: an.notify_admin_new_recipe("משק", "לחם", test_cause=tc),
        "מתכון חדש ממתין לאישור",
    ),
    "claim_link": (
        lambda tc: an.notify_admin_claim_link_requested("משק", "חדרה", test_cause=tc),
        "ביקש קישור חדש",
    ),
    "draft_claimed": (
        lambda tc: an.notify_admin_draft_claimed(
            "משק", "רותם", "r@example.com", "חדרה", test_cause=tc
        ),
        "נקלטה",
    ),
    "sensitive_edit": (
        lambda tc: an.notify_admin_producer_sensitive_edit(
            "משק", ["phone"], test_cause=tc
        ),
        "עדכן פרטים רגישים",
    ),
    "category_request": (
        lambda tc: an.notify_admin_new_category_request(
            "מותססים", "משק", test_cause=tc
        ),
        "בקשת קטגוריה חדשה",
    ),
    "business_suggestion": (
        lambda tc: an.notify_admin_new_business_suggestion("משק", "חיפה", "דנה"),
        "המלצת קהילה חדשה",
    ),
    "owner_invite_accepted": (
        lambda tc: an.notify_admin_owner_invite_accepted(
            "משק", "o@example.com", True, test_cause=tc
        ),
        "אישרה את ההזמנה",
    ),
    "content_edit": (
        lambda tc: aem.notify_admin_content_edit(
            "משק", ["description"], True, test_cause=tc
        ),
        "עדכן תוכן",
    ),
}
WITH_TEST_CAUSE = sorted(set(NOTIFIERS) - {"business_suggestion"})


@pytest.fixture
def sends(monkeypatch):
    """Every channel mocked on the module that CALLS it (create=True: a
    re-added `from app.services.whatsapp import send_text` would bind the
    name, and this patch is what it would call)."""
    monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000009")
    monkeypatch.setattr(settings, "admin_email", "admin@example.com")
    mail, wa = MagicMock(), MagicMock()
    with (
        patch.object(an, "send_email", mail),
        patch.object(aem, "send_email", mail),
        patch.object(an, "send_text", wa, create=True),
        patch.object(an, "send_template", wa),
        patch.object(aem, "send_text", wa, create=True),
        patch.object(aem, "send_template", wa, create=True),
        patch("app.services.whatsapp.send_text", wa),
        patch("app.services.whatsapp.send_template", wa),
    ):
        yield mail, wa


@pytest.mark.parametrize("key", sorted(NOTIFIERS))
def test_each_admin_notifier_sends_the_email_and_no_whatsapp(sends, key):
    mail, wa = sends
    call, subject_has = NOTIFIERS[key]
    call(False)
    mail.assert_called_once()
    assert mail.call_args.args[0] == "admin@example.com"
    assert subject_has in mail.call_args.args[1]
    wa.assert_not_called()


@pytest.mark.parametrize("key", WITH_TEST_CAUSE)
def test_a_test_caused_notice_sends_nothing(sends, key):
    mail, wa = sends
    NOTIFIERS[key][0](True)
    mail.assert_not_called()
    wa.assert_not_called()


@pytest.mark.parametrize("key", sorted(NOTIFIERS))
def test_without_admin_email_nothing_is_sent(sends, monkeypatch, key):
    mail, wa = sends
    monkeypatch.setattr(settings, "admin_email", "")
    NOTIFIERS[key][0](False)
    mail.assert_not_called()
    wa.assert_not_called()
