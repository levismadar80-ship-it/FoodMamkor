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
   Its limit: it sees the number only where it is written as the first
   argument (`x.admin_whatsapp_to`); `to = settings.admin_whatsapp_to;
   send_text(to, …)` passes it. Run against origin/staging it found 11 sites.
2. Each of the eight notifiers still sends its email and no WhatsApp.
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


def _builds(fn: ast.AST, name: str) -> bool:
    return any(
        isinstance(n, ast.Call) and getattr(n.func, "id", "") == name
        for n in ast.walk(fn)
    )


def admin_whatsapp_sends(src: str, rel: str) -> list[str]:
    """Calls whose first argument names admin_whatsapp_to, other than
    send_template inside a function that builds AdminBusinessPendingV1."""
    out = []
    tree = ast.parse(src)
    for fn in ast.walk(tree):
        if not isinstance(fn, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        allowed = _builds(fn, ALLOWED_TEMPLATE)
        for node in ast.walk(fn):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            first = node.args[0]
            if not any(
                isinstance(n, ast.Attribute) and n.attr == "admin_whatsapp_to"
                for n in ast.walk(first)
            ):
                continue
            func = node.func
            name = (
                func.attr
                if isinstance(func, ast.Attribute)
                else getattr(func, "id", "")
            )
            if name == "send_template" and allowed:
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
        "    send_template(settings.admin_whatsapp_to, AdminUpdateV1(topic='a'))\n"
    )
    good = (
        "def g():\n"
        "    send_text(buyer.phone, 'hi')\n"
        "    t = AdminBusinessPendingV1(producer_name='a', city='b')\n"
        "    send_template(settings.admin_whatsapp_to, t)\n"
    )
    assert admin_whatsapp_sends(bad, "syn.py") == [
        "syn.py:2",
        "syn.py:3",
        "syn.py:4",
        "syn.py:5",
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

NOTIFIERS = {
    "new_recipe": (
        lambda: an.notify_admin_new_recipe("משק", "לחם"),
        "לחם",
    ),
    "claim_link": (
        lambda: an.notify_admin_claim_link_requested("משק", "חדרה"),
        "משק",
    ),
    "draft_claimed": (
        lambda: an.notify_admin_draft_claimed("משק", "רותם", "r@example.com", "חדרה"),
        "רותם",
    ),
    "sensitive_edit": (
        lambda: an.notify_admin_producer_sensitive_edit("משק", ["phone"]),
        "משק",
    ),
    "category_request": (
        lambda: an.notify_admin_new_category_request("מותססים", "משק"),
        "מותססים",
    ),
    "business_suggestion": (
        lambda: an.notify_admin_new_business_suggestion("משק", "חיפה", "דנה"),
        "משק",
    ),
    "owner_invite_accepted": (
        lambda: an.notify_admin_owner_invite_accepted("משק", "o@example.com", True),
        "משק",
    ),
    "content_edit": (
        lambda: aem.notify_admin_content_edit("משק", ["description"], True),
        "משק",
    ),
}


@pytest.fixture
def admin_contacts(monkeypatch):
    monkeypatch.setattr(settings, "admin_whatsapp_to", "+972500000009")
    monkeypatch.setattr(settings, "admin_email", "admin@example.com")


@pytest.mark.parametrize("key", sorted(NOTIFIERS))
def test_each_admin_notifier_sends_the_email_and_no_whatsapp(admin_contacts, key):
    call, subject_has = NOTIFIERS[key]
    mail = MagicMock()
    wa_text, wa_tpl = MagicMock(), MagicMock()
    with (
        patch.object(an, "send_email", mail),
        patch.object(aem, "send_email", mail),
        patch("app.services.whatsapp.send_text", wa_text),
        patch("app.services.whatsapp.send_template", wa_tpl),
        patch.object(an, "send_template", wa_tpl),
    ):
        call()
    mail.assert_called_once()
    assert mail.call_args.args[0] == "admin@example.com"
    assert subject_has in mail.call_args.args[1] + mail.call_args.args[2]
    wa_text.assert_not_called()
    wa_tpl.assert_not_called()
