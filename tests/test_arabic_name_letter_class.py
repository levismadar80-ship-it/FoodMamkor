"""MEH-2236 — the MEH-555 letter class admits Arabic, so an Arabic business can register.

MEH-2020 ruled that Arabic is allowed in a public slug, on the grounds that an
Arabic-speaking business in Israel is an ordinary case. That ruling was landed
and was **empty in practice**: the request died one layer earlier, in the
validation of the *name*.

`_LETTER_REGEX` counted `[א-תa-zA-Z]`, so every character of "مزرعة الشمس" was
a non-letter and the MEH-555 "at least 3 letter characters" floor saw **zero**.
`POST /admin/producers` answered 422 before the slug code ran at all.

What this suite pins, in both directions:

  (a) the three ruled scripts — Hebrew, Latin, Arabic — clear the floor, and
  (b) MEH-555 is preserved *within* the new script: a name made only of Arabic
      punctuation ("،؟،") or only of harakat is still refused, exactly as "???"
      is. Widening the class must not become "accept anything Arabic-shaped".

(b) is the half that makes (a) safe, and it is why the class is the letter
sub-ranges rather than the whole `\\u0600-\\u06ff` block: that block carries
the comma, semicolon, question mark and tatweel, and a name made of those is
precisely the "???" case MEH-555 exists to reject.
"""

import pytest

from app.schemas.schemas import _min_alnum_validator, _min_letters_validator
from conftest import auth_header, make_user

# (label, value, must_pass). Both outcomes live in one table so a drift to
# all-accepting is visible as a missing verdict, not as a passing suite.
NAME_CASES = (
    ("hebrew", "חוות השמש", True),
    ("latin", "Sun Farm", True),
    ("arabic", "مزرعة الشمس", True),
    ("arabic short real word", "مخبز", True),
    ("mixed hebrew+arabic", "חוות مزرعة", True),
    ("ascii punctuation only", "???", False),
    ("arabic punctuation only", "،؟،", False),
    ("arabic tatweel only", "ــــ", False),
    ("arabic harakat only", "ًٌٍَ", False),
    ("arabic superscript alef only", "ٰٰٰ", False),
    ("two arabic letters", "مب", False),
    ("digits only", "12345", False),
)


def test_the_table_covers_both_verdicts():
    """Guard the guard: an all-True table would assert nothing about MEH-555.

    Derived from the table rather than stated, so adding a row cannot leave
    a stale count behind (rules/testing.md — derive counts, never state them).
    """
    verdicts = {row[2] for row in NAME_CASES}
    assert verdicts == {True, False}, (
        f"the table must exercise acceptance AND rejection, found {sorted(verdicts)}"
    )


@pytest.mark.parametrize(
    ("label", "value", "must_pass"),
    NAME_CASES,
    ids=[row[0].replace(" ", "_") for row in NAME_CASES],
)
def test_letter_floor_sorts_the_three_scripts_from_punctuation(label, value, must_pass):
    """The classifier itself, exercised directly — no endpoint in the way.

    Runs against the real `_min_letters_validator`, never a copy: a second copy
    of the class is free to drift from the one the API actually enforces.
    """
    if must_pass:
        assert _min_letters_validator(value) == value.strip()
    else:
        with pytest.raises(ValueError):
            _min_letters_validator(value)


def test_harakat_are_not_counted_as_letters():
    """Arabic vowel marks are diacritics, like Hebrew niqqud — they do not count.

    "مب" is two letters and must fail; decorating those same two letters with
    four harakat must not manufacture a third. This is the case that separates
    "added the Arabic letters" from "added the whole Arabic block".
    """
    with pytest.raises(ValueError):
        _min_letters_validator("مَبْ")


def test_arabic_indic_digits_satisfy_the_address_floor_but_not_the_letter_floor():
    """The two classes are split by role, and this is the case that proves it.

    `_min_alnum_validator` (addresses, MEH-870) accepts "at least one letter OR
    digit", so Arabic-Indic digits belong there. `_min_letters_validator` counts
    *letters*, so they must not count there — the same way ASCII "12345" does
    not clear the name floor.
    """
    assert _min_alnum_validator("١٢٣") == "١٢٣"
    with pytest.raises(ValueError):
        _min_letters_validator("١٢٣")


def test_admin_create_accepts_an_arabic_business_name(client, db):
    """End to end: the case that returned 422 and is the reason this card exists."""
    admin = make_user(db, role="admin")
    res = client.post(
        "/admin/producers",
        json={"name": "مزرعة الشمس"},
        headers=auth_header(admin),
    )
    assert res.status_code == 201, res.text
    assert res.json()["name"] == "مزرعة الشمس"


def test_admin_create_still_refuses_an_arabic_punctuation_only_name(client, db):
    """MEH-555 survives the widening, inside the newly admitted script."""
    admin = make_user(db, role="admin")
    res = client.post(
        "/admin/producers",
        json={"name": "،؟،"},
        headers=auth_header(admin),
    )
    assert res.status_code == 422, res.text
