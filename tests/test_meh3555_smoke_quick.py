"""MEH-3555 — `smoke_production.py --quick`, the version the uptime tick runs.

The script is run, not read: `fetch` is replaced by a fake site that records
every URL asked for, and `main()` is called with real argv. Three things are
checked: what a quick run fetches (the journey, not the sitemap crawl), that a
broken page makes it fail, and that the control still aborts a run whose fetch
reports 200 for everything.
"""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

import pytest

CHECKS = Path(__file__).resolve().parents[1] / "scripts" / "checks"
BASE = "https://example.test"
SLUG = "real-business"
IMAGE = "https://res.cloudinary.com/demo/image/upload/x.jpg"
PAGE = (
    b"<html><head><meta property='og:title' content='t'>"
    b"<meta property='og:description' content='d'>"
    b"<meta property='og:image' content='https://res.cloudinary.com/demo/image/upload/og.jpg'>"
    b"</head><body>ok</body></html>"
)


@pytest.fixture
def smoke(monkeypatch):
    monkeypatch.syspath_prepend(str(CHECKS))
    sys.modules.pop("smoke_production", None)
    return importlib.import_module("smoke_production")


def fake_site(broken: set[str] = frozenset()):
    """A fake production. Returns (fetch, asked) — `asked` lists every URL fetched."""
    asked: list[str] = []
    html = (200, PAGE, {"content-type": "text/html"})
    exact = {
        "/api/health/liveness": (200, b'{"status":"alive"}', {}),
        "/api/health/readiness": (200, b'{"status":"ready"}', {}),
        "/api/health": (200, b'{"status":"ok"}', {}),
        f"/api/producers/by-slug/{SLUG}": (
            200,
            json.dumps({"slug": SLUG, "images": [IMAGE]}).encode(),
            {},
        ),
        "/": html,
        "/producers": html,
        "/map": html,
        f"/{SLUG}": html,
    }
    prefix = {
        "/api/producers?": (200, json.dumps([{"slug": SLUG}]).encode(), {}),
        "https://res.cloudinary.com/": (
            200,
            b"\xff\xd8",
            {"content-type": "image/jpeg"},
        ),
    }

    def fetch(url, user_agent="x"):
        asked.append(url)
        path = url[len(BASE) :] if url.startswith(BASE) else url
        if path in broken:
            return 500, b"boom", {}
        if path in exact:
            return exact[path]
        hit = next((v for k, v in prefix.items() if path.startswith(k)), None)
        return hit or (404, b"not found", {})

    return fetch, asked


def test_quick_run_fetches_the_journey_and_not_the_sitemap(smoke, monkeypatch):
    fetch, asked = fake_site()
    monkeypatch.setattr(smoke, "fetch", fetch)
    monkeypatch.setattr(smoke, "seed_slugs", lambda: ["fixture-slug"])

    code = smoke.main(["--base-url", BASE, "--quick"])

    paths = {u[len(BASE) :] for u in asked if u.startswith(BASE)}
    # The journey: every one of these was asked for.
    for path in (
        "/api/health/readiness",
        "/",
        "/producers",
        "/map",
        f"/{SLUG}",
        f"/api/producers/by-slug/{SLUG}",
    ):
        assert path in paths, f"quick run did not fetch {path}"
    assert IMAGE in asked, "quick run did not fetch the Cloudinary image"
    # The per-row parts: none of these.
    assert "/sitemap.xml" not in paths
    assert "/fixture-slug" not in paths
    assert code == 0


def test_full_run_still_fetches_the_sitemap(smoke, monkeypatch):
    """Control for the test above: without --quick the same fake IS asked for
    the sitemap and the fixture page, so the absence above is the flag's doing."""
    fetch, asked = fake_site()
    monkeypatch.setattr(smoke, "fetch", fetch)
    monkeypatch.setattr(smoke, "seed_slugs", lambda: ["fixture-slug"])

    smoke.main(["--base-url", BASE])

    paths = {u[len(BASE) :] for u in asked if u.startswith(BASE)}
    assert "/sitemap.xml" in paths
    assert "/fixture-slug" in paths


@pytest.mark.parametrize("path", ["/producers", f"/{SLUG}", "/api/health/readiness"])
def test_quick_run_fails_when_a_journey_step_breaks(smoke, monkeypatch, path):
    fetch, _ = fake_site(broken={path})
    monkeypatch.setattr(smoke, "fetch", fetch)

    assert smoke.main(["--base-url", BASE, "--quick"]) == 1


def test_quick_run_aborts_when_fetch_reports_200_for_everything(smoke, monkeypatch):
    monkeypatch.setattr(smoke, "fetch", lambda url, user_agent="x": (200, b"", {}))

    assert smoke.main(["--base-url", BASE, "--quick"]) == 2


def test_control_failure_stops_the_run_before_any_page_is_fetched(smoke, monkeypatch):
    asked: list[str] = []

    def always_200(url, user_agent="x"):
        asked.append(url)
        return 200, b"", {}

    monkeypatch.setattr(smoke, "fetch", always_200)

    assert smoke.main(["--base-url", BASE, "--quick"]) == 2
    assert asked == [f"{BASE}/api/health/liveness", f"{BASE}{smoke.CONTROL_404_PATH}"]


@pytest.mark.parametrize("catalog", ["500", "empty"])
def test_quick_run_fails_when_the_catalog_has_no_business(smoke, monkeypatch, catalog):
    """Without this, an empty catalog only SKIPs the business-page checks (exit 0)."""
    fetch, _ = fake_site(broken={"/api/producers?limit=100&offset=0"} if catalog == "500" else set())
    if catalog == "empty":
        inner = fetch

        def fetch(url, user_agent="x"):
            if "/api/producers?" in url:
                return 200, b"[]", {}
            return inner(url, user_agent)

    monkeypatch.setattr(smoke, "fetch", fetch)

    assert smoke.main(["--base-url", BASE, "--quick"]) == 1


def test_quick_run_fails_when_the_cloudinary_image_breaks(smoke, monkeypatch):
    fetch, _ = fake_site(broken={IMAGE})
    monkeypatch.setattr(smoke, "fetch", fetch)

    assert smoke.main(["--base-url", BASE, "--quick"]) == 1
