"""
Module:   link_preview
Purpose:  Answer «does a link to this page show a picture and a name when it is
          pasted into WhatsApp?» without a phone. Replaces the release-checklist
          row that sent Sapir to WhatsApp to look (MEH-3151).
Touches:  Nothing. GET requests only, through the caller's fetch function.
Does NOT: render the preview the way WhatsApp's app does (no app here), or
          check image size limits — WhatsApp publishes none, so a byte count is
          printed as information and never fails the run.
Related:  scripts/checks/smoke_production.py (caller, Board, fetch) ·
          frontend/app/[locale]/[slug]/page.js:56 (generateMetadata) ·
          tests/test_link_preview_check.py
History:  MEH-3151 (creation)

Why the tags must be inside <head>, not just somewhere in the page
------------------------------------------------------------------
Next.js streams metadata into <body> for clients it does not treat as bots
when generateMetadata awaits data (seen on /events, 6/11). A crawler that reads
only the head then finds no og:image. So the check fetches with WhatsApp's own
User-Agent and looks only between <head> and </head>; a tag that slid into the
body fails here, which is the whole point.
"""

from __future__ import annotations

import re
import urllib.parse

# WhatsApp's link-preview fetcher announces itself with a UA starting
# "WhatsApp/". The version number does not matter for matching.
WHATSAPP_UA = "WhatsApp/2.23.20.0 A"

_META_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_ATTR_RE = re.compile(r'([a-zA-Z:_-]+)\s*=\s*"([^"]*)"')


def head_of(html: str) -> str:
    """The text between <head ...> and </head>. '' when there is no head."""
    start = re.search(r"<head\b[^>]*>", html, re.IGNORECASE)
    end = html.lower().find("</head>")
    if not start or end == -1 or end < start.end():
        return ""
    return html[start.end():end]


def og_tags(head: str) -> dict[str, str]:
    """og:* properties found in a head fragment. First occurrence wins."""
    found: dict[str, str] = {}
    for tag in _META_RE.findall(head):
        attrs = dict(_ATTR_RE.findall(tag))
        prop = attrs.get("property") or attrs.get("name") or ""
        if prop.startswith("og:") and prop not in found:
            found[prop] = attrs.get("content", "").strip()
    return found


def problems(tags: dict[str, str]) -> list[str]:
    """What would make WhatsApp show a bare link. [] = a preview is possible."""
    out = []
    if not tags.get("og:title"):
        out.append("og:title missing from <head>")
    image = tags.get("og:image", "")
    if not image:
        out.append("og:image missing from <head>")
    elif urllib.parse.urlparse(image).scheme != "https":
        out.append(f"og:image is not an absolute https URL: {image[:80]}")
    return out


def check_link_preview(base: str, board, fetch_fn, path: str, label: str) -> None:
    """One page: fetch as WhatsApp, read the head, then fetch the image itself."""
    url = f"{base}{path}"
    status, body, _ = fetch_fn(url, WHATSAPP_UA)
    name = f"WhatsApp link preview — {label}"
    if status != 200:
        board.add("FAIL", name, f"HTTP {status} for {url} (UA {WHATSAPP_UA})")
        return

    tags = og_tags(head_of(body.decode("utf-8", "replace")))
    issues = problems(tags)
    if issues:
        board.add("FAIL", name, " · ".join(issues) + f" · {url}")
        return

    image = tags["og:image"]
    i_status, i_body, i_headers = fetch_fn(image, WHATSAPP_UA)
    ctype = i_headers.get("content-type", "?")
    ok = i_status == 200 and ctype.startswith("image/")
    board.add(
        "PASS" if ok else "FAIL",
        name,
        f"og:title «{tags['og:title'][:60]}» · og:image HTTP {i_status} · {ctype} · "
        f"{len(i_body):,} bytes · {image[:100]}",
    )
