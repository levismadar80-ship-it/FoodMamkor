"""MEH-3151 — the WhatsApp link-preview check (scripts/checks/link_preview.py).

It replaces a release-checklist row that sent a person to WhatsApp to look, so
it has to be able to go red for each way a preview silently breaks. Every case
below is named after the input it feeds, and each red case is the green
fixture with exactly one thing removed or moved, so a check that passed
everything would fail this file.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "checks" / "link_preview.py"
_spec = importlib.util.spec_from_file_location("link_preview", SCRIPT)
lp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lp)

IMG = "https://mehamakor.co.il/og-image.jpg"
TITLE = '<meta property="og:title" content="מהמקור — בתי עסק מקומיים"/>'
IMAGE = f'<meta property="og:image" content="{IMG}"/>'
GOOD = f"<html><head><title>x</title>{TITLE}{IMAGE}</head><body>hi</body></html>"


class Board:
    def __init__(self):
        self.rows = []

    def add(self, verdict, name, measured):
        self.rows.append((verdict, name, measured))


def _fake_fetch(page_html, image_status=200, image_type="image/jpeg", page_status=200):
    seen = []

    def fetch(url, user_agent):
        seen.append((url, user_agent))
        if url == IMG:
            return image_status, b"\xff\xd8" * 10, {"content-type": image_type}
        return page_status, page_html.encode(), {}

    return fetch, seen


def _run(html, **kw):
    board = Board()
    fetch, seen = _fake_fetch(html, **kw)
    lp.check_link_preview("https://mehamakor.co.il", board, fetch, "/", "home")
    assert len(board.rows) == 1
    return board.rows[0][0], board.rows[0][2], seen


def test_head_with_title_and_https_image_that_serves_passes():
    verdict, measured, seen = _run(GOOD)
    assert verdict == "PASS", measured
    # Both requests went out as WhatsApp, not as the generic smoke UA.
    assert [ua for _, ua in seen] == [lp.WHATSAPP_UA, lp.WHATSAPP_UA]


def test_page_without_og_image_fails():
    verdict, measured, _ = _run(GOOD.replace(IMAGE, ""))
    assert verdict == "FAIL"
    assert "og:image missing" in measured


def test_page_without_og_title_fails():
    verdict, measured, _ = _run(GOOD.replace(TITLE, ""))
    assert verdict == "FAIL"
    assert "og:title missing" in measured


def test_og_tags_streamed_into_body_instead_of_head_fail():
    # The Next.js streamed-metadata shape: the tags exist, but after </head>.
    streamed = f"<html><head><title>x</title></head><body>{TITLE}{IMAGE}</body></html>"
    verdict, measured, _ = _run(streamed)
    assert verdict == "FAIL"
    assert "og:title missing" in measured and "og:image missing" in measured


def test_relative_og_image_url_fails():
    verdict, measured, _ = _run(GOOD.replace(IMG, "/og-image.jpg"))
    assert verdict == "FAIL"
    assert "not an absolute https URL" in measured


def test_og_image_that_404s_fails():
    verdict, measured, _ = _run(GOOD, image_status=404)
    assert verdict == "FAIL"
    assert "HTTP 404" in measured


def test_og_image_served_as_html_fails():
    verdict, _, _ = _run(GOOD, image_type="text/html")
    assert verdict == "FAIL"


def test_page_that_does_not_answer_200_fails():
    verdict, measured, _ = _run(GOOD, page_status=500)
    assert verdict == "FAIL"
    assert "HTTP 500" in measured
