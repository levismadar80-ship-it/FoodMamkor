"""MEH-3584 — what the business assistant is told about reaching the business.

Sapir 21/11: an answer printed the raw path «/בדיקת-פילטר-מיילים» (the page
path was in the facts and the model copied it) and said ordering is «בטלפון».
The facts now carry no page path, say whether the chat was opened from the
business's own page, and name the channel the page's contact button really
uses (the frontend's getResolvedMethod, ported).
"""

import json
import re
from pathlib import Path
from types import SimpleNamespace

import pytest
from test_meh3481_chat_business_context import PRIVATE, _business, _stub_client
from test_meh3489_chat_business_page import _ask, _system

from app.services import chat_business_context as ctx
from app.services import chat_business_extras as extras

ROOT = Path(__file__).resolve().parents[1]


def _p(**fields):
    base = dict.fromkeys(
        (
            "phone",
            "website",
            "contact_email",
            "instagram",
            "facebook",
            "external_order_form",
        )
    )
    return SimpleNamespace(
        primary_contact_method=fields.pop("method", None), **{**base, **fields}
    )


@pytest.mark.parametrize(
    ("fields", "expected"),
    [
        ({"method": "whatsapp", "phone": "050-1234567"}, "whatsapp"),
        ({"method": "phone", "phone": "050-1234567"}, "phone"),
        (
            {"method": None, "phone": "050-1234567"},
            "whatsapp",
        ),  # old row: NULL = whatsapp
        (
            {"method": "whatsapp", "instagram": "bakery"},
            "instagram",
        ),  # no number → next with data
        (
            {"method": "website", "phone": "050", "website": "  "},
            "whatsapp",
        ),  # blank = absent
        (
            {
                "method": "external_order",
                "external_order_form": "https://f.example.com",
            },
            "external_order",
        ),
        ({"method": "bogus", "contact_email": "a@example.com"}, "email"),
        ({"method": "whatsapp"}, None),  # no contact detail at all
    ],
)
def test_contact_channel_is_the_buttons_channel(fields, expected):
    assert extras.contact_channel(_p(**fields)) == expected


def test_the_order_matches_the_frontend():
    # One fact, two languages: the button's fallback order. Read the JS list
    # so a reorder there reds here (source-text by necessity: no JS runtime).
    src = (ROOT / "frontend/lib/contact-method.js").read_text(encoding="utf-8")
    block = src[src.index("export const CONTACT_METHODS") :]
    block = block[: block.index("];")]
    js = re.findall(r'key: "([a-z_]+)"', block)
    assert js == [c for c, _ in extras.CONTACT_CHANNELS]


def test_the_facts_carry_no_page_path(db):
    p = _business(db)
    p.slug = "בדיקת-פילטר-מיילים"
    db.commit()
    dumped = json.dumps(ctx.facts(p, "איך מזמינים?"), ensure_ascii=False)
    assert "page" not in ctx.facts(p, "x")
    assert "/בדיקת-פילטר-מיילים" not in dumped and f"/producer/{p.id}" not in dumped
    assert '"contact_by": "whatsapp"' in dumped
    for value in PRIVATE.values():  # the channel name, never the number
        assert value not in dumped, value


def test_on_its_page_follows_where_the_chat_was_opened(db, monkeypatch):
    p = _business(db)
    calls = _stub_client(monkeypatch)
    _ask(db, "ויש משלוח?", p.id)
    assert '"on_its_page": true' in _system(calls)
    calls = _stub_client(monkeypatch)
    _ask(db, "יש משלוח של מאפיית הדגמה?", None)
    system = _system(calls)
    assert "<business_page>" in system and '"on_its_page": false' in system


def test_the_prompt_forbids_a_page_path_and_explains_contact_by():
    assert "אל תכתבי כתובת או נתיב של העמוד של בית העסק" in ctx.PREAMBLE
    assert "contact_by" in ctx.PREAMBLE and "phone=שיחת טלפון" in ctx.PREAMBLE
    assert "(page)" not in ctx.PREAMBLE
