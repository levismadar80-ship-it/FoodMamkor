"""HTML sanitization helper — defense-in-depth per ASVS V13 (MEH-329).

React's output encoding is the primary XSS defense; this strips HTML
tags at the input layer so stored content stays safe even if a future
component renders it via dangerouslySetInnerHTML.
"""
import bleach


def sanitize_text(value: str | None, max_length: int = 1000) -> str | None:
    if value is None:
        return None
    cleaned = bleach.clean(value, tags=[], strip=True)
    return cleaned[:max_length].strip() or None
