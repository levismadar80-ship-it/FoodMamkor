"""MEH-3296: a WhatsApp template body is checked against Meta's automatic
rejection rules before it is submitted.

The control is real: on 18/11/2026 Meta blocked bodies 1 and 3 of the first
round below («too many variables for its length») and accepted 2, 4, 5 and 6
for review. A linter that does not give exactly that verdict is wrong.
"""

from __future__ import annotations

import pytest

from app.services import whatsapp_templates
from app.services.whatsapp_template_bodies import META_BODIES
from app.services.whatsapp_template_lint import VAR, lint

ROUND_1 = {
    "product_order_new_v1": (
        "הזמנה חדשה ממהמקור מאת {{1}}: {{2}} פריטים בסך {{3}} ₪, {{4}} ב{{5}} "
        "בשעות {{6}} עד {{7}}. לאישור ההזמנה: {{8}}\nצוות מהמקור",
        False,
    ),
    "product_order_waiting_v1": (
        "הזמנה מחכה לתשובה כבר {{1}} שעות. אם לא תענו עד {{2}}, היא תתבטל. "
        "לתשובה: {{3}}\nצוות מהמקור",
        True,
    ),
    "product_order_confirmed_v1": (
        "ההזמנה שלכם מ{{1}} אושרה: {{2}} ב{{3}} בשעות {{4}} עד {{5}}. "
        "לתשלום לבית העסק: {{6}} ₪. פרטים: {{7}}\nצוות מהמקור",
        False,
    ),
    "product_order_change_v1": (
        "בית העסק {{1}} מציע שינוי בהזמנה שלכם. לצפייה ולאישור: {{2}}\nצוות מהמקור",
        True,
    ),
    "product_order_closed_v1": ("ההזמנה מ{{1}} בוטלה. פרטים: {{2}}\nצוות מהמקור", True),
    "product_order_tomorrow_v1": (
        "תזכורת: מחר {{1}} מ{{2}}, בשעות {{3}} עד {{4}}. לא מסתדר? "
        "אפשר לבטל כאן: {{5}}\nצוות מהמקור",
        True,
    ),
}


@pytest.mark.parametrize("name", sorted(ROUND_1))
def test_reproduces_metas_verdict_of_18_11(name):
    body, meta_accepted = ROUND_1[name]
    assert (lint(body) == []) is meta_accepted, lint(body)


def test_the_blocked_ones_fail_on_the_ratio_metas_message_named():
    for name in ("product_order_new_v1", "product_order_confirmed_v1"):
        assert any("for its length" in p for p in lint(ROUND_1[name][0])), name


@pytest.mark.parametrize(
    ("body", "problem"),
    [
        ("{{1}} מציעים שינוי בהזמנה שלכם, לצפייה ולאישור היכנסו לקישור באתר", "starts"),
        ("ההזמנה שלכם אושרה, לכל הפרטים והשינויים היכנסו לקישור הזה: {{1}}.", "ends"),
        ("שלום, ההזמנה שלכם {{1}}, {{2}} אושרה והיא מחכה לכם בבית העסק עכשיו", "no word"),
        ("שלום, ההזמנה {{2}} מבית העסק {{1}} אושרה ומחכה לכם לאיסוף היום", "in order"),
        ("שלום {{1}}, הזמנה {{2}} מוכנה {{3}}", "length"),
    ],
)
def test_each_rule_names_what_it_caught(body, problem):
    assert any(problem in p for p in lint(body)), lint(body)


def test_a_body_with_no_variables_passes():
    assert lint("שלום, ההזמנה שלכם התקבלה") == []


@pytest.mark.parametrize("name", sorted(META_BODIES))
def test_every_submitted_body_passes(name):
    assert lint(META_BODIES[name]) == []


@pytest.mark.parametrize("name", sorted(META_BODIES))
def test_every_body_matches_its_template_class(name):
    classes = {
        cls.name: cls
        for cls in vars(whatsapp_templates).values()
        if isinstance(cls, type)
        and issubclass(cls, whatsapp_templates.WhatsAppTemplate)
        and getattr(cls, "name", None)
    }
    assert name in classes, f"no template class named {name}"
    assert len(VAR.findall(META_BODIES[name])) == len(classes[name].model_fields)


def test_every_order_template_class_has_a_body():
    order = {
        cls.name
        for cls in vars(whatsapp_templates).values()
        if isinstance(cls, type)
        and issubclass(cls, whatsapp_templates.WhatsAppTemplate)
        and getattr(cls, "name", "").startswith("product_order_")
    }
    assert order == set(META_BODIES) & order and order
