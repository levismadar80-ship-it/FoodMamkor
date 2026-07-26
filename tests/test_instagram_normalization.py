"""
MEH-1608 — producers.instagram stores a bare handle.

The public renderer (frontend ContactCard.jsx:105-106) composes
https://instagram.com/{handle} itself, so a stored full URL becomes a
doubled, dead link on the public contact card. instagram was the only
ContactChannels field with no validator (MEH-1537 covered phone /
whatsapp_group / contact_email); _normalize_instagram closes the gap on all
four producer write schemas: forgiving in input (full URL, www, leading @,
trailing slash, query/# tails), canonical (bare handle) in storage.
Empty/whitespace → None, per the MEH-1537 empty-contact convention.
"""
from __future__ import annotations

import pytest

# _normalize_instagram is private by convention; importing it here is a
# deliberate coupling — the unit matrix tests the helper directly, and the
# schema-level cases below cover the public surface if it is ever renamed.
from app.schemas.schemas import (
    ProducerAdminCreate,
    ProducerCreate,
    ProducerRegister,
    ProducerUpdate,
    _normalize_instagram,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # canonical input passes through
        ("maafiat_hasade", "maafiat_hasade"),
        # leading @ (any count) is stripped
        ("@maafiat_hasade", "maafiat_hasade"),
        ("@@maafiat_hasade", "maafiat_hasade"),
        # full URLs normalize to the handle — the exact class that produced
        # the doubled https://instagram.com/https://instagram.com/… link
        ("https://instagram.com/maafiat_hasade", "maafiat_hasade"),
        ("http://instagram.com/maafiat_hasade", "maafiat_hasade"),
        ("https://www.instagram.com/maafiat_hasade", "maafiat_hasade"),
        ("www.instagram.com/maafiat_hasade", "maafiat_hasade"),
        ("instagram.com/maafiat_hasade", "maafiat_hasade"),
        # trailing slash / query / fragment tails
        ("https://instagram.com/maafiat_hasade/", "maafiat_hasade"),
        ("https://instagram.com/maafiat_hasade?igsh=abc123", "maafiat_hasade"),
        ("https://instagram.com/maafiat_hasade/#posts", "maafiat_hasade"),
        # URL + @ combined
        ("https://instagram.com/@maafiat_hasade", "maafiat_hasade"),
        # surrounding whitespace
        ("  maafiat_hasade  ", "maafiat_hasade"),
        # empty-ish → None (MEH-1537 convention)
        (None, None),
        ("", None),
        ("   ", None),
        # a URL with no handle left after stripping → None, not ""
        ("https://instagram.com/", None),
        ("@", None),
        # ACKNOWLEDGED out-of-scope: bare "instagram.com" (no slash, no handle)
        # is not URL-shaped per _INSTAGRAM_URL_PREFIX_RE (which requires the
        # trailing slash) and passes through as-is. It would render as a
        # profile link to a handle literally named "instagram.com" — wrong,
        # but a low-probability paste; widening the regex to eat it risks
        # eating real handles containing dots. Documented, not normalized.
        ("instagram.com", "instagram.com"),
    ],
)
def test_normalize_instagram(raw, expected):
    assert _normalize_instagram(raw) == expected


@pytest.mark.parametrize(
    "schema_kwargs_factory",
    [
        pytest.param(lambda ig: ProducerUpdate(instagram=ig), id="ProducerUpdate"),
        pytest.param(
            lambda ig: ProducerRegister(
                email="owner@example.com",
                name="ספיר ניסוי",
                producer_name="חוות הניסוי",
                instagram=ig,
                category_ids=[1],
                licensing_declaration_confirmed=True,
            ),
            id="ProducerRegister",
        ),
        pytest.param(
            lambda ig: ProducerCreate(
                name="חוות הניסוי",
                instagram=ig,
                category_ids=[1],
            ),
            id="ProducerCreate",
        ),
        pytest.param(
            lambda ig: ProducerAdminCreate(name="חוות הניסוי", instagram=ig),
            id="ProducerAdminCreate",
        ),
    ],
)
def test_all_four_write_schemas_normalize(schema_kwargs_factory):
    """Every schema that writes producers.instagram runs the normalizer —
    fixing only ProducerUpdate would leave the register/create/admin paths
    storing broken values (the MEH-1537 four-of-five-fields lesson)."""
    model = schema_kwargs_factory("https://www.instagram.com/@maafiat_hasade/")
    assert model.instagram == "maafiat_hasade"
