"""HTML sanitization helper — defense-in-depth per ASVS V13 (MEH-329).

React's output encoding is the primary XSS defense; this strips HTML
tags at the input layer so stored content stays safe even if a future
component renders it via dangerouslySetInnerHTML.
"""

import html

import bleach

# MEH-3317: bleach.clean returns HTML-ENCODED text ("&" -> "&amp;"), and that
# encoded form was being stored, so «קפה & מאפה» rendered as «קפה &amp; מאפה».
# We store plain text instead: strip tags, decode entities, repeat until the
# text stops changing. The repeat is the security half — a single decode
# would turn the typed text "&lt;img onerror=…&gt;" into a live tag; the next
# pass strips it. Encoding is the job of each sink at render time (React,
# html_escape in every HTML email, the "<"-escaping JSON-LD serializer).
_MAX_PASSES = 5


def sanitize_text(value: str | None, max_length: int = 1000) -> str | None:
    if value is None:
        return None
    text = value
    for _ in range(_MAX_PASSES):
        decoded = html.unescape(bleach.clean(text, tags=[], strip=True))
        if decoded == text:
            break
        text = decoded
    else:
        # Never converged (deeply nested entity smuggling): keep the old,
        # encoded output — safe in every sink, just ugly.
        text = bleach.clean(text, tags=[], strip=True)
    return text[:max_length].strip() or None
