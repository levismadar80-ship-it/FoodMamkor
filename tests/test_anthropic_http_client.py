"""Every Anthropic client in backend/app passes http_client= (Refs MEH-3176).

CLAUDE.md and .claude/rules/backend.md say "always pass
http_client=httpx.Client()". Without it, a future httpx bump can make the SDK
raise inside its own client constructor. The AI fail-open path catches that
error, so the AI features stop working with no 5xx and no failing test. Until
now nothing checked the rule; this test reads every module's AST and fails
on any Anthropic(...) / AsyncAnthropic(...) call without the keyword.
"""
from __future__ import annotations

import ast
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "backend" / "app"
CLIENT_NAMES = {"Anthropic", "AsyncAnthropic"}


def calls_missing_http_client(source: str) -> list[int]:
    """Line numbers of Anthropic client constructions without http_client=."""
    missing = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
        if name not in CLIENT_NAMES:
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
        tree_calls = [
            n for n in ast.walk(ast.parse(source))
            if isinstance(n, ast.Call)
            and (getattr(n.func, "attr", None) or getattr(n.func, "id", None)) in CLIENT_NAMES
        ]
        seen += len(tree_calls)
        bad += [f"{path.relative_to(APP.parent.parent)}:{line}" for line in calls_missing_http_client(source)]
    return seen, bad


def test_classifier_catches_a_missing_keyword() -> None:
    assert calls_missing_http_client("c = anthropic.Anthropic(api_key=k)\n") == [1]
    assert calls_missing_http_client("c = AsyncAnthropic()\n") == [1]
    assert calls_missing_http_client("c = anthropic.Anthropic(**opts)\n") == [1]
    assert calls_missing_http_client(
        "c = anthropic.Anthropic(api_key=k, http_client=httpx.Client())\n"
    ) == []
    assert calls_missing_http_client("x = SomethingElse(api_key=k)\n") == []


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
    assert not bad, "Anthropic client without http_client=httpx.Client(): " + ", ".join(bad)
