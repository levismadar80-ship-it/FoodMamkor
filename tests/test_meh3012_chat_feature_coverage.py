"""MEH-3012 — every tool in frontend/lib/business-features.js is accounted for
in the chat's knowledge map (app/services/chat_feature_coverage.py)."""

import re
from pathlib import Path

from app.routers import chat
from app.services import chat_feature_coverage as cov

REGISTRY = Path(__file__).resolve().parents[1] / "frontend/lib/business-features.js"
_ID = re.compile(r'^\s*\{\s*id:\s*"([a-z0-9_]+)"', re.MULTILINE)


def registry_ids(text: str) -> list[str]:
    return _ID.findall(text)


def _maps() -> dict[str, dict[str, str]]:
    return {
        "COVERED": cov.COVERED,
        "PENDING_COPY": cov.PENDING_COPY,
        "NOT_FOR_CHAT": cov.NOT_FOR_CHAT,
    }


def test_parser_self_test_on_the_real_registry():
    # MEH-1909: run against the real file, anchored to entries known to exist,
    # so a parser that silently finds nothing cannot pass the guard below.
    ids = registry_ids(REGISTRY.read_text(encoding="utf-8"))
    assert "group_buys" in ids and "rescue_bags" in ids and "completeness" in ids
    assert len(ids) == len(set(ids))
    # A synthetic line in the registry's own shape is found; a comment is not.
    assert registry_ids('  { id: "new_tool", group: "page" },\n  // { id: "x" }') == [
        "new_tool"
    ]


def test_every_registry_tool_is_in_exactly_one_map():
    ids = set(registry_ids(REGISTRY.read_text(encoding="utf-8")))
    placed: dict[str, list[str]] = {}
    for name, mapping in _maps().items():
        for tool in mapping:
            placed.setdefault(tool, []).append(name)
    missing = sorted(ids - placed.keys())
    assert not missing, (
        f"new tool(s) {missing} in business-features.js but not in "
        "app/services/chat_feature_coverage.py: add each to COVERED (with the "
        "chat's knowledge), PENDING_COPY or NOT_FOR_CHAT"
    )
    stale = sorted(placed.keys() - ids)
    assert not stale, f"{stale} no longer in business-features.js: remove them"
    doubled = sorted(t for t, names in placed.items() if len(names) > 1)
    assert not doubled, f"{doubled} placed in more than one map"


def test_every_reason_is_written():
    for name in ("PENDING_COPY", "NOT_FOR_CHAT"):
        empty = [t for t, why in _maps()[name].items() if not why.strip()]
        assert not empty, f"{name}: {empty} without a reason"


def test_covered_anchors_are_in_the_chat_knowledge():
    knowledge = chat.SYSTEM_PROMPT + "\n" + chat.RESCUE_KNOWLEDGE_TEMPLATE
    absent = {t: a for t, a in cov.COVERED.items() if a not in knowledge}
    assert not absent, f"COVERED anchors not found in the chat's knowledge: {absent}"
