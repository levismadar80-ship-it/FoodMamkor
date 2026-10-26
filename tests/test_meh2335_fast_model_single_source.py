"""MEH-2335 — one source of truth for the fast-tier Claude model.

Two guards:

1. No backend module spells a Claude model ID in a string literal except
   app/config.py. Before MEH-2335 the same Haiku ID was hard-coded in six
   places; this goes red the moment a seventh appears.
2. The shared request kwargs are what Haiku 5.5 needs on short-cap routes:
   thinking disabled (thinking tokens count toward max_tokens), effort at a
   level where `disabled` is accepted, and no sampling params (400 on 5.5).

Guard 1 is anchored to the real corpus: it also asserts that config.py
itself is matched, so a broken regex cannot report a clean tree.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.config import AI_FAST_MODEL, ai_fast_request_kwargs

APP_DIR = Path(__file__).resolve().parent.parent / "backend" / "app"
MODEL_LITERAL = re.compile(
    r"""["']claude-(?:haiku|sonnet|opus|fable)-[0-9][\w.-]*["']"""
)
ALLOWED = {APP_DIR / "config.py"}


def _offenders() -> dict[Path, list[str]]:
    hits: dict[Path, list[str]] = {}
    for path in APP_DIR.rglob("*.py"):
        found = MODEL_LITERAL.findall(path.read_text(encoding="utf-8"))
        if found:
            hits[path] = found
    return hits


def test_probe_sees_config_itself():
    # Control: if this is empty the regex is dead and test 2 means nothing.
    assert APP_DIR / "config.py" in _offenders()


def test_no_model_id_literal_outside_config():
    stray = {
        str(p.relative_to(APP_DIR)): v
        for p, v in _offenders().items()
        if p not in ALLOWED
    }
    assert stray == {}, f"model ID hard-coded outside app/config.py: {stray}"


def test_fast_model_is_haiku_5_5():
    assert AI_FAST_MODEL == "claude-haiku-5-5"


def test_request_kwargs_shape():
    kw = ai_fast_request_kwargs()
    assert kw["model"] == AI_FAST_MODEL
    assert kw["thinking"] == {"type": "disabled"}
    # `disabled` 400s at xhigh/max on Haiku 5.5.
    assert kw["output_config"]["effort"] in {"low", "medium", "high"}
    assert not {"temperature", "top_p", "top_k"} & kw.keys()


def test_request_kwargs_are_fresh_per_call():
    a = ai_fast_request_kwargs()
    a["thinking"]["type"] = "adaptive"
    assert ai_fast_request_kwargs()["thinking"] == {"type": "disabled"}


# --- Haiku 5.5 safety-classifier declines ---------------------------------
# A refusal is HTTP 200 with stop_reason="refusal" and no text block. Before
# MEH-2335 every caller read that as an empty reply and failed open to
# APPROVED; it must surface as FLAGGED instead. The "empty but not a refusal"
# case pins that genuine infra-shaped emptiness still fails open (LOCK).


class _Msg:
    def __init__(self, stop_reason, content):
        self.stop_reason = stop_reason
        self.content = content


class _Client:
    def __init__(self, msg):
        self._msg = msg
        self.messages = self

    def create(self, **kwargs):
        return self._msg


REFUSED = _Msg("refusal", [])
EMPTY = _Msg("end_turn", [])


def test_experience_refusal_is_flagged(monkeypatch):
    from app.services import experience_moderation as mod

    monkeypatch.setattr(mod, "_get_client", lambda: _Client(REFUSED))
    assert mod.validate_experience({"title": "t"})["status"] == "FLAGGED"
    monkeypatch.setattr(mod, "_get_client", lambda: _Client(EMPTY))
    assert mod.validate_experience({"title": "t"})["status"] == "APPROVED"


def test_recipe_refusal_is_flagged(monkeypatch):
    from app.services import producer_recipe_moderation as mod

    monkeypatch.setattr(mod, "_get_client", lambda: _Client(REFUSED))
    assert mod.validate_producer_recipe({"title": "t"})["status"] == "FLAGGED"
    monkeypatch.setattr(mod, "_get_client", lambda: _Client(EMPTY))
    assert mod.validate_producer_recipe({"title": "t"})["status"] == "APPROVED"


def test_review_refusal_is_flagged(monkeypatch):
    from app.routers import reviews as mod

    monkeypatch.setattr(mod, "_get_ai_client", lambda: _Client(REFUSED))
    assert mod._moderate_review_body("ביקורת כלשהי לבדיקה") == "FLAGGED"
    monkeypatch.setattr(mod, "_get_ai_client", lambda: _Client(EMPTY))
    assert mod._moderate_review_body("ביקורת כלשהי לבדיקה") == "APPROVED"


class _Text:
    type = "text"

    def __init__(self, text):
        self.text = text


def test_review_parses_fenced_json(monkeypatch):
    # MEH-2335 eval: 4/15 review verdicts came back wrapped in ```json fences.
    # The bare json.loads() raised and the review failed open to APPROVED —
    # spam and ads published silently. The experience/recipe parsers already
    # tolerate fences; reviews must too.
    from app.routers import reviews as mod

    fenced = _Msg("end_turn", [_Text('```json\n{"status": "REJECTED"}\n```')])
    monkeypatch.setattr(mod, "_get_ai_client", lambda: _Client(fenced))
    assert mod._moderate_review_body("ביקורת כלשהי לבדיקה") == "REJECTED"
