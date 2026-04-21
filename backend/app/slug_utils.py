"""Shared slug utilities used across admin, producer_me, and import service."""
import re

RESERVED_SLUGS: frozenset[str] = frozenset({
    # App navigation routes
    "about", "map", "events", "neighbor", "search", "categories", "category",
    # Auth routes
    "login", "register", "logout", "signup", "forgot-password", "reset-password",
    "auth",
    # User/producer account routes
    "settings", "profile", "me", "dashboard",
    # Producer management
    "producer", "producers",
    # Admin
    "admin",
    # Content/legal
    "privacy", "terms", "contact",
    # Features
    "favorites", "group-buys", "experiences",
    # Technical
    "api",
})


def slugify(text: str) -> str:
    """Generate a URL-safe slug. Mirrors the private _slugify in admin.py."""
    if not text:
        return ""
    s = str(text).strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^\w֐-׿\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:100]
