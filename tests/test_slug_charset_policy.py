"""MEH-2020 — the slug charset is now a decision, not a regex default.

Before this, `slugify` kept anything `\\w` matched. `\\w` is Unicode-aware in
Python 3, so *every* script survived: "мосты", "農場" and the Cyrillic homograph
"аbоut" all passed through unchanged and could be served at
`/producer/<slug>`. Nobody chose that. The ruling of 31/08 picked an explicit
allowlist — **Hebrew + Arabic + Latin + digits + hyphen** — and closed the
homograph vector measured on 15/08 in two layers:

  (a) the allowlist refuses Cyrillic outright, and
  (b) `is_reserved` folds under NFKC + casefold, so the fullwidth "ａbout"
      cannot slip past a frozenset of ASCII literals.

Layer (b) is not redundant with (a): fullwidth Latin normalises *into* the
allowlist, so no charset check can see it.

Sibling suite: `test_slugify_charclass_equivalence.py` (MEH-2021) pins the
Hebrew range these helpers must keep. That one asserts what must NOT change;
this one asserts what did.
"""

import unicodedata

import pytest

from app.slug_utils import (
    RESERVED_SLUGS,
    is_reserved,
    rejected_characters,
    slugify,
)
from conftest import auth_header, make_user

# The table from MEH-2020's §"הקשר", re-answered under the new policy.
# Rows marked `kept` are the point of the ruling; rows marked `dropped` are
# what changed. Keeping both in one table is what makes it evidence rather
# than a list of characters chosen to pass.
GENERATOR_CASES = (
    ("hebrew", "חוות הדגן", "חוות-הדגן", "kept"),
    ("arabic", "مزرعة", "مزرعة", "kept"),
    ("latin", "Green Farm", "green-farm", "kept"),
    ("latin diacritics", "Café Crème", "café-crème", "kept"),
    ("digits", "farm 2024", "farm-2024", "kept"),
    ("hebrew geresh", "צ׳יפס", "צ׳יפס", "kept"),
    ("cyrillic", "мосты", "", "dropped"),
    ("cjk", "農場", "", "dropped"),
    ("greek", "αγρόκτημα", "", "dropped"),
    ("punctuation only", "!!!", "", "dropped"),
)


def test_table_covers_both_outcomes():
    """Guard the guard: a table that drifted to all-'kept' would prove nothing.

    Derived from the table, never written as a literal — a stated count goes
    stale the moment a row is added (MEH-1976).
    """
    verdicts = {row[3] for row in GENERATOR_CASES}
    assert verdicts == {"kept", "dropped"}, (
        f"the table must contain both outcomes, found {sorted(verdicts)}"
    )


@pytest.mark.parametrize(
    "label,raw,expected,verdict", GENERATOR_CASES, ids=[c[0] for c in GENERATOR_CASES]
)
def test_slugify_applies_the_allowlist(label, raw, expected, verdict):
    assert slugify(raw) == expected


def test_slugify_strips_rather_than_raising():
    """The generator must never reject — it mints from a business NAME.

    A name carrying an emoji or a Cyrillic word must still produce a slug from
    whatever is left, or registering a business would 422 on its own name.
    Rejection is asked only of a slug someone explicitly typed.
    """
    assert slugify("חוות 🌾 הדגן") == "חוות-הדגן"
    assert slugify("Farm мосты") == "farm"


def test_nfc_normalisation_collapses_two_spellings_of_one_name():
    """Decomposed and precomposed "é" must not become two different public URLs."""
    precomposed = unicodedata.normalize("NFC", "Caf\u00e9")
    decomposed = unicodedata.normalize("NFD", "Caf\u00e9")
    assert precomposed != decomposed, "the fixture itself must carry two spellings"
    assert slugify(precomposed) == slugify(decomposed) == "café"


# --- the two cases the ruling names by hand -------------------------------


def test_cyrillic_homograph_is_rejected_not_merely_unreserved():
    """`аbоut` — Cyrillic а (U+0430) and о (U+043E), measured 15/08.

    The old behaviour: `slugify` returned it unchanged and `in RESERVED_SLUGS`
    was False, so it was registrable. It is now refused at the charset layer,
    and the refusal names the characters.
    """
    homograph = "аbоut"
    assert homograph != "about"
    assert rejected_characters(homograph) == ["а", "о"]
    # And it never reaches the reserved question, which it would still lose.
    assert is_reserved(homograph) is False


def test_fullwidth_latin_is_caught_by_the_reserved_fold():
    """`ａbout` — U+FF41, which NFKC folds to a plain "a".

    This is the case the allowlist CANNOT catch on its own: fold it and it
    lands inside the allowlist. Layer (b) exists for exactly this row.
    """
    fullwidth = "ａbout"
    assert fullwidth not in RESERVED_SLUGS  # raw equality misses it
    assert is_reserved(fullwidth) is True


@pytest.mark.parametrize("raw", ["about", "ABOUT", "Admin", "ａbout", "Ｍap"])
def test_reserved_fold_accepts_the_variants_it_should(raw):
    assert is_reserved(raw) is True


@pytest.mark.parametrize("raw", ["", "חוות", "mezze", "аbоut"])
def test_reserved_fold_rejects_the_variants_it_should(raw):
    assert is_reserved(raw) is False


# --- the endpoint contract -------------------------------------------------


def _admin(db):
    return make_user(db, role="admin")


def test_admin_create_rejects_a_disallowed_slug_with_a_code(client, db):
    """422 with a machine-readable code, not a hard-coded Hebrew sentence (MEH-1943)."""
    admin = _admin(db)
    res = client.post(
        "/admin/producers",
        json={"name": "חוות הדגן", "slug": "аbоut"},
        headers=auth_header(admin),
    )
    assert res.status_code == 422, res.text
    detail = res.json()["detail"]
    assert detail["code"] == "slug_charset_not_allowed"
    assert detail["characters"] == ["а", "о"]


def test_admin_create_rejects_a_fullwidth_reserved_slug_as_reserved(client, db):
    """Reserved is asked FIRST, of the raw value — see `_guard_supplied_slug`.

    If the order were reversed this would be a 422 charset error: the stripping
    removes the very character that made it reserved, so the admin would be told
    to fix the wrong thing.
    """
    admin = _admin(db)
    res = client.post(
        "/admin/producers",
        json={"name": "חוות הדגן", "slug": "ａbout"},
        headers=auth_header(admin),
    )
    assert res.status_code == 400, res.text


def test_admin_create_accepts_an_arabic_slug(client, db):
    """The ruling's affirmative half — Arabic is a local business language.

    The name is Arabic too, and that is the whole point of the row. It used to
    be Hebrew here on purpose: an all-Arabic name was rejected 422 by
    `SanitizedBusinessNameField`, whose MEH-555 "at least 3 letter characters"
    validator counted `[א-תa-zA-Z]` — a class with no Arabic in it. So
    `{"name": "مزرعة الشمس"}` never reached the slug code at all; it died in
    request validation, and this ruling admitted a slug that no business could
    actually register under.

    MEH-2236 closed that: the letter class now carries Arabic letters (not the
    punctuation, and not the harakat). With both halves in place the endpoint
    accepts an Arabic business end to end, which is what MEH-2020 meant all
    along. The letter class itself is pinned by
    `test_arabic_name_letter_class.py`, including the cases that must still be
    refused.

    The generator's own handling of Arabic is covered directly by
    GENERATOR_CASES["arabic"], which calls `slugify` with no endpoint in the way.
    """
    admin = _admin(db)
    res = client.post(
        "/admin/producers",
        json={"name": "مزرعة الشمس", "slug": "مزرعة-الشمس"},
        headers=auth_header(admin),
    )
    assert res.status_code == 201, res.text
    assert res.json()["slug"] == "مزرعة-الشمس"


def test_admin_create_still_mints_from_the_name_when_no_slug_is_supplied(client, db):
    """The generator path is untouched by the rejection path."""
    admin = _admin(db)
    res = client.post(
        "/admin/producers",
        json={"name": "חוות הדגן"},
        headers=auth_header(admin),
    )
    assert res.status_code == 201, res.text
    assert res.json()["slug"] == "חוות-הדגן"
