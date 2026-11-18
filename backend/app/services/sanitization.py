"""HTML sanitization helper — defense-in-depth per ASVS V13 (MEH-329).

Returns PLAIN TEXT (MEH-3317): tags stripped, entities decoded, so «&» and a
bare «<» are stored as typed. It is never HTML — every sink must encode it on
output (React does; HTML emails use html_escape; JSON-LD uses the escaping
serializer in frontend/lib/seo.js). Never interpolate it into HTML raw.
"""

import html
import re

import bleach

# MEH-3317: bleach.clean returns HTML-ENCODED text ("&" -> "&amp;"), and that
# encoded form was being stored, so «קפה & מאפה» rendered as «קפה &amp; מאפה».
# We store plain text instead: strip tags, decode entities, repeat until the
# text stops changing. The repeat is the security half — a single decode
# would turn the typed text "&lt;img onerror=…&gt;" into a live tag; the next
# pass strips it. Encoding is the job of each sink at render time (React,
# html_escape in every HTML email, the "<"-escaping JSON-LD serializer).
_MAX_PASSES = 5
# Text that still opens a tag (an unclosed "<img src=x …" with no ">") is kept
# in the old encoded form, so no stored value ever begins a tag. A bare "<"
# ("5 < 6") is plain text and stays plain.
_TAG_OPENER = re.compile(r"<[A-Za-z/!?]")


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
    if _TAG_OPENER.search(text):
        text = bleach.clean(text, tags=[], strip=True)
    return text[:max_length].strip() or None
