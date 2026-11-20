"""The assistant links to site pages from one list (app/site_pages.py).

Fails when the backend and widget lists differ, when a listed path has no
page in frontend/app, when the prompt names a page instead of writing its
path, when the prompt writes a path that is not on the list, when a page has
no link label, or when the prompt says there is no commission (ADR-042).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from app import site_pages
from app.routers import chat

ROOT = Path(__file__).resolve().parent.parent
FRONT = ROOT / "frontend"
APP = FRONT / "app" / "[locale]"
ALL_PAGES = (*site_pages.SITE_PAGES, site_pages.RESCUE_PAGE)


def _frontend_registry() -> dict[str, str]:
    src = (FRONT / "lib" / "site-pages.js").read_text(encoding="utf-8")
    body = src.split("SITE_PAGES = Object.freeze({", 1)[1].split("});", 1)[0]
    return dict(re.findall(r'"(/[^"]+)":\s*"([a-z_]+)"', body))


def _route_exists(path: str) -> bool:
    # Route groups such as (whats-on) are not part of the URL.
    segments = path.strip("/").split("/")
    for page in APP.rglob("page.js*"):
        rel = [p for p in page.parent.relative_to(APP).parts if not p.startswith("(")]
        if rel == segments:
            return True
    return False


def test_backend_and_widget_lists_are_equal() -> None:
    assert _frontend_registry() == {path: key for key, path, _ in ALL_PAGES}


def test_every_listed_path_is_a_real_page() -> None:
    missing = [path for _, path, _ in ALL_PAGES if not _route_exists(path)]
    assert missing == []


def test_route_check_sees_a_missing_page() -> None:
    # Control: the check above must be able to fail.
    assert not _route_exists("/join/pricing-old")
    assert _route_exists("/events")  # lives under the (whats-on) group


_UNCHECKED_TREES = ("admin", "dev")


def _static_pages() -> set[str]:
    # Every page.js(x) URL with no [param] segment, outside the admin/dev trees
    # and the dashboard's own sub-pages.
    found = set()
    for page in APP.rglob("page.js*"):
        rel = [p for p in page.parent.relative_to(APP).parts if not p.startswith("(")]
        if any(p.startswith("[") for p in rel) or (rel and rel[0] in _UNCHECKED_TREES):
            continue
        if rel[:2] == ["producer", "dashboard"] and len(rel) > 2:
            continue
        found.add("/" + "/".join(rel))
    return found


def test_every_new_page_is_known_to_the_assistant() -> None:
    # MEH-3528: a new page lands either on the assistant's list
    # (app/site_pages.py SITE_PAGES) or in NOT_FOR_ASSISTANT with a reason.
    pages = _static_pages() - {"/"}
    known = site_pages.PATHS | set(site_pages.NOT_FOR_ASSISTANT)
    assert sorted(pages - known) == []
    # And the exclusion list holds no page that is gone.
    assert sorted(set(site_pages.NOT_FOR_ASSISTANT) - pages) == []
    assert not set(site_pages.NOT_FOR_ASSISTANT) & site_pages.PATHS


def test_static_page_scan_sees_real_pages() -> None:
    # Control: the scan above must find pages, or its check passes on nothing.
    pages = _static_pages()
    assert {"/join/pricing", "/events", "/map", "/producer/dashboard"} <= pages
    assert not any("[" in p or p.startswith("/admin") for p in pages)


def test_every_page_has_a_link_label_in_both_locales() -> None:
    for locale in ("he", "en"):
        labels = json.loads(
            (FRONT / "messages" / f"{locale}.json").read_text(encoding="utf-8")
        )["chat"]["pages"]
        assert sorted(labels) == sorted(key for key, _, _ in ALL_PAGES), locale


def test_prompt_writes_pages_as_paths_not_names() -> None:
    # «בעמוד «מחירון»» gave the visitor a name with no link (20/11).
    by_name = re.findall(r"(?:עמוד|דף)\s+[«\"][^»\"]+[»\"]", chat.SYSTEM_PROMPT)
    assert by_name == []


def test_prompt_paths_are_all_on_the_list() -> None:
    prompt = chat._base_system_prompt()
    paths = set(
        re.findall(r"(?<![A-Za-z0-9/:.])/[a-z][a-z0-9-]*(?:/[a-z][a-z0-9-]*)*", prompt)
    )
    assert paths, "the prompt has no paths at all — the check would pass on nothing"
    assert paths <= site_pages.PATHS, paths - site_pages.PATHS


def test_prompt_does_not_promise_no_commission() -> None:
    # ADR-042: paid bookings through the site's tools carry a commission after
    # the launch period. The model read «התשלום עובר ביניהם בלבד» as "no fee".
    prompt = chat._base_system_prompt()
    for token in ("בלי עמל", "ללא עמל", "התשלום עובר ביניהם בלבד"):
        assert token not in prompt, token
    assert "אל תגידי שאין עמלה" in prompt
    assert "/join/pricing" in prompt


def test_business_tools_come_from_the_registry() -> None:
    data = json.loads(
        (ROOT / "backend" / "app" / "data" / "chat_business_features.json").read_text(
            encoding="utf-8"
        )
    )
    prompt = chat._base_system_prompt()
    labels = [i["label"] for g in data["groups"] for i in g["items"] if "flag" not in i]
    assert len(labels) > 40
    missing = [label for label in labels if label not in prompt]
    assert missing == []
