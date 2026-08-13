"""Shared slug utilities used across admin, producer_me, and import service."""

import re

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


def slugify(text: str) -> str:
    """Generate a URL-safe slug. Mirrors the private `_slugify` in admin.py.

    MEH-1813 — the mirror claim was verified rather than assumed, and it holds
    with exactly one difference: this one casts `str(text)` first, so it accepts
    a non-string (an Excel cell from the import path) where `_slugify` would
    raise. Same character class, same collapse, same 100-char cap.

    `_slugify`'s docstring carries the behaviour in full — including that
    nothing here transliterates, that every Unicode script survives rather than
    just Hebrew, and that a name with no word characters yields `""` and must
    not be stored as a slug. Read it there; this stays a pointer so the two
    cannot drift into two half-descriptions.
    """
    if not text:
        return ""
    s = str(text).strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^\w֐-׿\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:100]
