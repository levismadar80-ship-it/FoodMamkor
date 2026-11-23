"""Every Anthropic client in backend/app passes http_client= (Refs MEH-3176).

CLAUDE.md and .claude/rules/backend.md say "always pass
http_client=anthropic.DefaultHttpxClient()" (httpx2 since anthropic 1.0).
Without it, a future httpx bump can make the SDK raise inside its own client constructor. The AI fail-open path catches that
error, so the AI features stop working with no 5xx and no failing test. Until
now nothing checked the rule; this test reads every module's AST and fails
on any Anthropic(...) / AsyncAnthropic(...) call without the keyword.
"""
from __future__ import annotations

import ast
import importlib
from pathlib import Path

import anthropic
import pytest

APP = Path(__file__).resolve().parent.parent / "backend" / "app"
CLIENT_NAMES = {
    "Anthropic", "AsyncAnthropic",
    "AnthropicBedrock", "AsyncAnthropicBedrock", "AnthropicVertex", "AsyncAnthropicVertex",
}


def _client_names(tree: ast.AST) -> set[str]:
    """CLIENT_NAMES plus any local alias (`from anthropic import Anthropic as A`)."""
    names = set(CLIENT_NAMES)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            names |= {a.asname for a in node.names if a.asname and a.name in CLIENT_NAMES}
    return names


def calls_missing_http_client(source: str) -> list[int]:
    """Line numbers of Anthropic client constructions without http_client=."""
    missing = []
    tree = ast.parse(source)
    names = _client_names(tree)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
        if name not in names:
            continue
        keywords = {kw.arg for kw in node.keywords}
        # `**kwargs` (arg None) could carry it; treat it as unverifiable → missing.
        if "http_client" not in keywords:
            missing.append(node.lineno)
    return missing


def scan_app() -> tuple[int, list[str]]:
    seen, bad = 0, []
    for path in sorted(APP.rglob("*.py")):
        source = path.read_text(encoding="utf-8")
        if "Anthropic" not in source:
            continue
        tree = ast.parse(source)
        names = _client_names(tree)
        tree_calls = [
            n for n in ast.walk(tree)
            if isinstance(n, ast.Call)
            and (getattr(n.func, "attr", None) or getattr(n.func, "id", None)) in names
        ]
        seen += len(tree_calls)
        bad += [f"{path.relative_to(APP.parent.parent)}:{line}" for line in calls_missing_http_client(source)]
    return seen, bad


def test_classifier_catches_a_missing_keyword() -> None:
    assert calls_missing_http_client("c = anthropic.Anthropic(api_key=k)\n") == [1]
    assert calls_missing_http_client("c = AsyncAnthropic()\n") == [1]
    assert calls_missing_http_client("c = anthropic.Anthropic(**opts)\n") == [1]
    assert calls_missing_http_client(
        "c = anthropic.Anthropic(api_key=k, http_client=anthropic.DefaultHttpxClient())\n"
    ) == []
    assert calls_missing_http_client("x = SomethingElse(api_key=k)\n") == []
    assert calls_missing_http_client("from anthropic import Anthropic as A\nc = A()\n") == [2]
    assert calls_missing_http_client("c = anthropic.AnthropicBedrock()\n") == [1]


def test_classifier_on_a_real_call_site() -> None:
    # Anchored to a real file: the chat router's client must be found and pass,
    # and the same source with the keyword removed must fail.
    source = (APP / "routers" / "chat.py").read_text(encoding="utf-8")
    assert "http_client=" in source
    assert calls_missing_http_client(source) == []
    stripped = source.replace("http_client=", "unused_kw=")
    assert calls_missing_http_client(stripped), "removing http_client= must be caught"


def test_every_anthropic_client_passes_http_client() -> None:
    seen, bad = scan_app()
    # A scan that found no client at all measures nothing: the app has several.
    assert seen >= 1, "no Anthropic(...) call found under backend/app — the scan is broken"
    assert not bad, "Anthropic client without http_client=: " + ", ".join(bad)


# --- MEH-5154: the client must actually build -----------------------------
# The AST check above only sees that http_client= is passed. anthropic 1.0+
# raises TypeError at construction on a plain httpx.Client, and every factory
# below swallows that into "AI offline" — so build each one for real, with a
# key set, and require a client back.


FACTORIES = [
    ("app.routers.chat", "_get_client", "_client"),
    ("app.routers.reviews", "_get_ai_client", "_ai_client"),
    ("app.services.approved_edit_moderation", "_get_client", "_client"),
    ("app.services.bio_generator", "_get_client", "_client"),
    ("app.services.menu_reader", "_get_client", "_client"),
]


@pytest.mark.parametrize("module_name,factory,cache", FACTORIES)
def test_each_cached_factory_builds_a_real_client(monkeypatch, module_name, factory, cache) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    module = importlib.import_module(module_name)
    monkeypatch.setattr(module, cache, None)
    client = getattr(module, factory)()
    assert isinstance(client, anthropic.Anthropic), f"{module_name}.{factory} fell back to None"


def test_make_anthropic_client_builds_a_real_client(monkeypatch) -> None:
    from app.config import settings
    from app.services.moderation_common import make_anthropic_client

    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    assert isinstance(make_anthropic_client("test"), anthropic.Anthropic)
