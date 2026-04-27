"""AI bio writer for producer profiles (MEH-56).

Accepts an Instagram handle, URL, or free text. Tries to scrape public
Instagram meta description if it looks like a handle; falls back to the
raw text. Calls Claude Haiku to generate a Hebrew ≤150-char bio.

Fail-open: returns "" if ANTHROPIC_API_KEY is missing or any step fails.
"""
from __future__ import annotations

import logging
import re

from app.config import settings

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.anthropic_api_key:
        logger.debug("[bio] ANTHROPIC_API_KEY not set — bio generation disabled")
        return None
    try:
        import anthropic
        import httpx

        _client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            http_client=httpx.Client(),
        )
        return _client
    except Exception as e:
        logger.warning("[BIO] Failed to init Anthropic client: %s", e)
        return None


def _extract_instagram_handle(source: str) -> str | None:
    """Return cleaned handle if source looks like an IG handle or URL."""
    s = source.strip()
    if "instagram.com" in s:
        m = re.search(r"instagram\.com/([A-Za-z0-9._]+)", s)
        return m.group(1) if m else None
    if s.startswith("@"):
        return s.lstrip("@")
    # Looks like a bare handle: no spaces, no dots as domain, no slashes
    if re.match(r"^[A-Za-z0-9._]{2,30}$", s):
        return s
    return None


def _fetch_instagram_bio(handle: str) -> str | None:
    """Try to extract the meta description from a public Instagram page."""
    try:
        import httpx

        url = f"https://www.instagram.com/{handle}/"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (compatible; Googlebot/2.1; "
                "+http://www.google.com/bot.html)"
            )
        }
        resp = httpx.get(url, headers=headers, timeout=8, follow_redirects=True)
        if resp.status_code != 200:
            return None
        # Try og:description first, then name=description
        for pattern in (
            r'property=["\']og:description["\'][^>]*content=["\'](.*?)["\']',
            r'name=["\']description["\'][^>]*content=["\'](.*?)["\']',
        ):
            m = re.search(pattern, resp.text, re.I | re.S)
            if m:
                text = m.group(1).strip()
                if len(text) > 10:
                    return text
        return None
    except Exception as e:
        logger.debug("[BIO] Instagram scrape failed for %s: %s", handle, e)
        return None


def generate_bio(source: str) -> str:
    """Generate a Hebrew ≤150-char business bio.

    source: Instagram handle / URL, or any descriptive text.
    Returns "" on any failure (fail-open).
    """
    client = _get_client()
    if not client:
        logger.warning("[BIO] Anthropic client unavailable — returning empty (fail-open)")
        return ""

    text = source.strip()[:500]

    handle = _extract_instagram_handle(text)
    if handle:
        ig_bio = _fetch_instagram_bio(handle)
        if ig_bio:
            text = ig_bio
            logger.info("[BIO] Using scraped Instagram bio for handle %s", handle)

    if not text:
        return ""

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "כתבי ביו בעברית בגוף נקבה, עד 150 תווים, לעסק מזון ישראלי "
                        "על בסיס הטקסט הבא. החזירי רק את הביו, ללא הסברים:\n\n"
                        + text
                    ),
                }
            ],
        )
        bio = next((b.text for b in msg.content if getattr(b, "type", None) == "text"), "").strip()
        return bio[:150]
    except Exception as e:
        logger.warning("[BIO] Haiku call failed: %s", e)
        return ""
