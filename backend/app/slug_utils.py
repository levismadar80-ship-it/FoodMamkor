"""Shared slug utilities used across admin, producer_me, and import service."""

import re
import unicodedata

RESERVED_SLUGS: frozenset[str] = frozenset(
    {
        # App navigation routes
        "about",
        "map",
        "events",
        "neighbor",
        "search",
        "categories",
        "category",
        # Auth routes
        "login",
        "register",
        "logout",
        "signup",
        "forgot-password",
        "reset-password",
        "auth",
        # User/producer account routes
        "settings",
        "profile",
        "me",
        "dashboard",
        # Producer management
        "producer",
        "producers",
        # Admin
        "admin",
        # Content/legal
        "privacy",
        "terms",
        "contact",
        # Features
        "favorites",
        "group-buys",
        "experiences",
        # Technical
        "api",
        # MEH-1324 audit — live routes claimable as slugs (directions B+C)
        "accessibility",
        "dev",
        "discover",
        "join",
        "messages",
        "newsletter",
        "p",
        "publish",
        "rate",
        "ref",
        "share",
        "upgrade",
        "verify-email",
    }
)


def slugify(text) -> str:
    """Generate a URL-safe slug. **The single owner** — `admin.py::_slugify` and
    `producer_import.py::_slugify` are now aliases of this function, not copies.

    MEH-2020 replaced the old "keep anything `\\w` matches" behaviour with an
    explicit script allowlist, because `\\w` is Unicode-aware in Python 3 and so
    the old class accepted **every** script silently: "мосты", "農場" and the
    Cyrillic homograph "аbоut" all passed through unchanged. Nobody chose that;
    it was the default behaviour of a character class. The ruling picked
    **Hebrew + Arabic + Latin + digits + hyphen** — Arabic because a
    Hebrew-language URL and an Arabic-language URL are the same argument for a
    local Israeli directory, and Cyrillic/CJK out because they are not local
    business languages and are where the homograph vector measured on 15/08
    lives.

    **Nothing here transliterates, and nothing ever did** (MEH-1813). No
    `unidecode`, no `any-ascii`, no PyICU, no character map — Hebrew is kept
    verbatim, "חוות הדגן" → "חוות-הדגן". One docstring claiming otherwise was the
    only thing in the repo that looked like transliteration existed, and MEH-1812
    costed an `/en` search option against it before anyone measured. Carried
    forward here because it is the kind of absence a reader cannot grep for.

    **This function STRIPS; it does not reject.** It is the *generator*, used to
    mint a slug from a business name, and a name carrying an emoji must not 422
    the whole registration. Rejection is a separate question asked of an
    explicitly *supplied* slug — see `rejected_characters`.

    **The `֐-׿` range is NOT redundant. Do not remove it.** 81 of the 112
    codepoints in `U+0590-U+05FF` are not `\\w` (ניקוד, maqaf `־`, geresh `׳`,
    gershayim `״`, …) and survive only because it is here; dropping it rewrites
    the public URL of any business whose name carries one. Written here as
    **literal characters** — the form that is easiest to delete by eye while
    "tidying". MEH-2021 · `tests/test_slugify_charclass_equivalence.py`.

    Accepts a non-string (an Excel cell from the import path) via `str(text)`.
    Normalises to NFC first, so a decomposed "é" and a precomposed one produce
    the same slug rather than two different public URLs.

    **Returns "" when nothing survives** — "!!!" → "". The empty string is not a
    slug and must not be stored: `_ensure_unique_slug` passes an empty base
    straight through, which is why the approval path coerces it with `or None`
    (MEH-1817) rather than writing "" into a column whose NULL is load-bearing
    for the `/producer/{uuid}` fallback.

    Output is capped at 100 characters.
    """
    if not text:
        return ""
    s = unicodedata.normalize("NFC", str(text)).strip().lower()
    s = re.sub(r"\s+", "-", s)
    # MEH-2020: explicit allowlist — Latin (incl. Latin-1/Extended letters),
    # digits, hyphen, the whole Hebrew block, Arabic + Arabic Supplement.
    # Everything else (Cyrillic, CJK, Greek, symbols, emoji) is dropped.
    s = re.sub(r"[^a-z0-9\u00C0-\u024F֐-׿\u0600-\u06FF\u0750-\u077F\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:100]


def rejected_characters(text) -> list[str]:
    """The characters an explicitly-supplied slug carries that the allowlist bars.

    MEH-2020 — the ruling says disallowed scripts are **rejected, not filtered**,
    and that distinction only makes sense for a slug a human typed. `slugify`
    would silently turn "мосты" into "" and then mint something unrelated from
    the business name; the admin who typed it would never learn why. So the
    supplied-slug paths ask this first and 422 with the offending characters.

    Returns a sorted, de-duplicated list — empty means "every character is
    inside the allowlist". Whitespace is not a rejection: `slugify` legitimately
    turns it into a hyphen.
    """
    if not text:
        return []
    # Case is preserved deliberately: the list goes into a 422 the admin reads,
    # and naming a character they did not type ("ｍ" for a typed "Ｍ") is a small
    # lie in an error message whose whole job is to say what to remove.
    s = unicodedata.normalize("NFC", str(text)).strip()
    s = re.sub(r"\s+", "-", s)
    bad = re.findall(r"[^a-zA-Z0-9\u00C0-\u024F֐-׿\u0600-\u06FF\u0750-\u077F\-]", s)
    return sorted(set(bad))


def is_reserved(candidate) -> bool:
    """Reserved-slug check under NFKC + casefold, not raw string equality.

    MEH-2020, layer (b) of the homograph decision. `RESERVED_SLUGS` was a bare
    `in` against a frozenset of ASCII literals, so anything that merely *looked*
    like a reserved word slipped past — measured 15/08 with the Cyrillic
    "аbоut", and equally with the fullwidth "ａbout" (U+FF41), which NFKC folds
    to a plain "a".

    The charset allowlist above closes the Cyrillic half by refusing the script
    outright. This closes the compatibility half, which the allowlist cannot see:
    fullwidth Latin normalises *into* the allowlist, so it has to be folded
    before the comparison rather than after.

    No confusables library. Narrowing to three scripts does the bulk of the work
    and Hebrew, Arabic and Latin are not visually confusable with one another —
    a dependency would buy the remainder at a cost the ruling declined.
    """
    if not candidate:
        return False
    return unicodedata.normalize("NFKC", str(candidate)).casefold() in RESERVED_SLUGS
