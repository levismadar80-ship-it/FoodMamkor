"""MEH-3596 — the notification channel policy, held by tests.

The policy itself is `.claude/rules/notifications.md` (Sapir 21/11/2026):
admin alerts are email only, and a WhatsApp template states its real Meta
category. This file checks the two parts a machine can check:

1. Every `WhatsAppTemplate` subclass declares `meta_category` itself, and the
   value is one of Meta's three categories. A class that forgets it fails, so
   a new template cannot ship without someone writing down what WhatsApp
   Manager calls it. The values were read from WhatsApp Manager (as-of noted
   on each class).
2. The admin exemption list. The guard that finds WhatsApp sends to the admin
   already exists — `tests/test_meh3589_admin_whatsapp.py`, the whole-app AST
   scan — and is reused, not copied (workflow.md Smell #1). This file holds
   the one place where an exemption is written with its reason, and fails if
   the guard allows a template that is not listed here, or if a listed
   template has no reason or no Meta category.

What this does not check: whether a customer or business-owner message is
urgent enough for WhatsApp. That is a judgment, made by the reviewer against
the table in the rule file.
"""

from __future__ import annotations

from typing import ClassVar, get_type_hints

import pytest
import test_meh3589_admin_whatsapp as admin_guard
from app.services import whatsapp_templates as wt

META_CATEGORIES = {"UTILITY", "MARKETING", "AUTHENTICATION"}

# Template class -> why it may still go to the admin by WhatsApp.
# Adding a row needs Sapir's word (rule file, «admin alerts are email only»).
ADMIN_WHATSAPP_EXEMPT = {
    "AdminBusinessPendingV1": (
        "MEH-3147, approved by Meta before the email-only decision of 21/11; "
        "whether it moves to email too is Sapir's open call"
    ),
}


def _template_classes() -> list[type[wt.WhatsAppTemplate]]:
    seen: list[type[wt.WhatsAppTemplate]] = []
    todo = list(wt.WhatsAppTemplate.__subclasses__())
    while todo:
        cls = todo.pop()
        if cls not in seen:
            seen.append(cls)
            todo.extend(cls.__subclasses__())
    # Only the real module: the synthetic classes below are subclasses too.
    return sorted(
        (c for c in seen if c.__module__ == wt.__name__), key=lambda c: c.__name__
    )


def _missing_or_bad_category(classes) -> list[str]:
    """Classes that do not set a valid meta_category in their OWN body.

    Inherited values do not count: a v2 copied from a v1 can be classified
    differently by Meta, so each class states its own."""
    bad = []
    for cls in classes:
        value = cls.__dict__.get("meta_category")
        if value not in META_CATEGORIES:
            bad.append(f"{cls.__name__}={value!r}")
    return bad


# --- 1. meta_category on every template ------------------------------------


def test_the_probe_sees_the_known_templates():
    # Control: if the subclass walk were broken, every check below would pass
    # on an empty list.
    names = {c.__name__ for c in _template_classes()}
    assert len(names) >= 15, names
    assert {"OtpCodeV1", "AdminBusinessPendingV1", "ProductOrderChangeV1"} <= names


def test_the_check_flags_a_class_without_its_own_category():
    class NoCategoryV1(wt.WhatsAppTemplate):
        name: ClassVar[str] = "no_category_v1"

    class InheritsOnlyV2(wt.AdminBusinessPendingV1):
        name: ClassVar[str] = "inherits_only_v2"

    class WrongValueV1(wt.WhatsAppTemplate):
        name: ClassVar[str] = "wrong_value_v1"
        meta_category: ClassVar[str] = "Utility"

    class GoodV1(wt.WhatsAppTemplate):
        name: ClassVar[str] = "good_v1"
        meta_category: ClassVar[str] = "UTILITY"

    assert _missing_or_bad_category(
        [NoCategoryV1, InheritsOnlyV2, WrongValueV1, GoodV1]
    ) == ["NoCategoryV1=None", "InheritsOnlyV2=None", "WrongValueV1='Utility'"]


def test_every_template_states_its_meta_category():
    bad = _missing_or_bad_category(_template_classes())
    assert bad == [], (
        "Each WhatsAppTemplate subclass sets meta_category to what WhatsApp "
        "Manager shows (UTILITY / MARKETING / AUTHENTICATION) — "
        ".claude/rules/notifications.md: " + ", ".join(bad)
    )


def test_meta_category_is_a_classvar_not_a_body_parameter():
    # A plain annotation would turn it into a model field, and to_components()
    # would send it to Meta as a body parameter.
    assert "meta_category" in get_type_hints(wt.WhatsAppTemplate)
    assert "meta_category" not in wt.WhatsAppTemplate.model_fields
    for cls in _template_classes():
        assert "meta_category" not in cls.model_fields, cls.__name__


# --- 2. the admin exemption list -------------------------------------------


def test_the_admin_guard_allows_only_listed_exemptions():
    # The MEH-3589 scan lets exactly one template through. It must be listed
    # here with a reason, and nothing may be listed that the scan blocks.
    assert {admin_guard.ALLOWED_TEMPLATE} == set(ADMIN_WHATSAPP_EXEMPT)


@pytest.mark.parametrize("cls_name", sorted(ADMIN_WHATSAPP_EXEMPT))
def test_each_exemption_has_a_reason_and_a_real_template(cls_name):
    assert len(ADMIN_WHATSAPP_EXEMPT[cls_name].split()) >= 5
    cls = getattr(wt, cls_name)
    assert cls.__dict__.get("meta_category") in META_CATEGORIES


def test_the_admin_guard_still_finds_a_new_admin_whatsapp_send():
    # The exemption list is only worth something if the scan it relies on is
    # alive: a new send to the admin, by text or by another template, is found.
    src = (
        "def notify():\n"
        "    send_text(settings.admin_whatsapp_to, 'x')\n"
        "    send_template(settings.admin_whatsapp_to, ProductOrderChangeV1())\n"
        "    send_template(settings.admin_whatsapp_to, AdminBusinessPendingV1())\n"
    )
    assert admin_guard.admin_whatsapp_sends(src, "new.py") == ["new.py:2", "new.py:3"]
