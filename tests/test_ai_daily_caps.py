"""
Module:   test_ai_daily_caps
Purpose:  MEH-3497 — every route a business can press to make a paid AI
          generation call carries a PER-BUSINESS DAILY cap, not only a
          per-IP hourly one. A per-IP limit resets with a second phone or a
          new IP; a business-keyed daily limit does not. The guard walks the
          whole app, so the next AI button is caught the day it lands
          instead of on the invoice.
Touches:  every mounted route · every module under backend/app that calls
          the Anthropic SDK (`.messages.create(`) or `ai_text.ask(`.
Related:  routers/product_describe.py (`_business_key`, the reference
          pattern) · routers/menu_import.py (manual `limiter.limiter.hit`) ·
          MEH-3498 (global daily ceiling, covers visitor chat + moderation).
History:  MEH-3497 (creation; found POST /producers/me/bio/generate and
          POST /producers/me/product-groups/suggest with per-IP limits only).

Each guard runs a CONTROL first, so a walker that silently finds nothing
fails loudly instead of passing green (testing.md).
"""

from __future__ import annotations

import ast
import importlib.util
import os
import re
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("ENV", "test")

# REUSES: tests/test_meh3022_resource_caps.py — load the route collector.
_SPEC = importlib.util.spec_from_file_location(
    "action_map", ROOT / "scripts" / "release" / "action_map.py"
)
am = importlib.util.module_from_spec(_SPEC)
sys.modules.setdefault("action_map", am)
_SPEC.loader.exec_module(am)

from app.rate_limit import get_real_client_ip, limiter  # noqa: E402

APP = ROOT / "backend" / "app"
CALLS_AI = re.compile(r"\.messages\.(create|stream|parse)\(|ai_text\.ask\(")

# Every module that calls the model is classified here. A new one fails
# test_every_ai_module_is_classified until someone decides which it is.
GENERATION = {
    # A business (or its admin) presses a button and pays for a generation.
    "app.services.bio_generator",
    "app.services.description_writer",
    "app.services.group_suggester",
    "app.services.menu_reader",
    "app.services.page_filler",
    "app.services.reply_writer",
}
NOT_GENERATION = {
    # Fast-model moderation verdict on a save. Bounded by the write route's
    # own rate limit and the per-business row caps (MEH-3022); the global
    # daily ceiling is MEH-3498.
    "app.services.approved_edit_moderation": "moderation on save",
    # MEH-3619: the call experience_moderation and producer_recipe_moderation
    # share (they no longer call the model themselves).
    "app.services.moderation_common": "moderation on save (shared helper)",
    "app.services.producer_risk": "moderation on save",
    "app.routers.reviews": "moderation of a review / reply on save",
    # Visitor chat: no business to key on; per-IP 10/min + 30/hour, the
    # global daily ceiling is MEH-3498.
    "app.routers.chat": "visitor chat, global ceiling MEH-3498",
    "app.services.chat_intent_router": "visitor chat, global ceiling MEH-3498",
    # The shared helper itself; its callers are classified above.
    "app.services.ai_text": "shared helper",
}

# The reference route: capped per business per day since MEH-3401.
CONTROL_CAPPED = "/producers/me/product-description/suggest"


def _modname(p: Path) -> str:
    return "app." + ".".join(p.relative_to(APP).with_suffix("").parts)


SRC = {_modname(p): p.read_text(encoding="utf-8") for p in APP.rglob("*.py")}


@lru_cache(None)
def _info(mod: str):
    tree = ast.parse(SRC[mod])
    names: dict[str, tuple[str, str]] = {}
    mods: dict[str, str] = {}
    for n in ast.walk(tree):  # imports inside functions count too
        if isinstance(n, ast.ImportFrom) and n.module and n.module.startswith("app"):
            for a in n.names:
                cand = f"{n.module}.{a.name}"
                if cand in SRC:
                    mods[a.asname or a.name] = cand
                else:
                    names[a.asname or a.name] = (n.module, a.name)
        elif isinstance(n, ast.Import):
            for a in n.names:
                if a.name.startswith("app") and a.asname:
                    mods[a.asname] = a.name
    funcs: dict[str, ast.AST] = {}
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            funcs.setdefault(n.name, n)
    return names, mods, funcs


def _reaches_generation(mod: str, func: str, seen: set) -> bool:
    """True when `mod.func` calls the model from a GENERATION module,
    following names, module attributes and same-module helpers."""
    if (mod, func) in seen or mod not in SRC:
        return False
    seen.add((mod, func))
    names, mods, funcs = _info(mod)
    node = funcs.get(func)
    if node is None:
        return False
    if mod in GENERATION and CALLS_AI.search(ast.get_source_segment(SRC[mod], node) or ""):
        return True
    for n in ast.walk(node):
        if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id in mods:
            if _reaches_generation(mods[n.value.id], n.attr, seen):
                return True
        elif isinstance(n, ast.Name):
            if n.id in funcs and n.id != func and _reaches_generation(mod, n.id, seen):
                return True
            if n.id in names and _reaches_generation(*names[n.id], seen):
                return True
    return False


def _has_business_daily_cap(mod: str, func: str) -> bool:
    for lim in limiter._route_limits.get(f"{mod}.{func}", []):
        if lim.key_func is not get_real_client_ip and "day" in str(lim.limit):
            return True
    # menu_import keys its daily count by producer_id by hand.
    node = _info(mod)[2].get(func)
    seg = ast.get_source_segment(SRC[mod], node) if node is not None else ""
    return "limiter.limiter.hit(" in (seg or "")


def _generation_routes():
    routes = am.collect_routes(am.load_app())
    out = []
    for r in routes:
        mod = "app.routers." + r.module
        if mod in SRC and _reaches_generation(mod, r.func, set()):
            out.append((r, mod))
    return out


def test_every_ai_module_is_classified():
    calling = {m for m, s in SRC.items() if CALLS_AI.search(s)}
    # CONTROL: the walker sees the known model callers.
    assert {"app.services.description_writer", "app.routers.chat"} <= calling
    unclassified = calling - GENERATION - set(NOT_GENERATION)
    assert not unclassified, (
        f"New module(s) call the AI model: {sorted(unclassified)}. Add each to "
        "GENERATION (needs a per-business daily cap on its routes) or to "
        "NOT_GENERATION with the reason."
    )
    stale = (GENERATION | set(NOT_GENERATION)) - calling
    assert not stale, f"Classified but no longer calls the model: {sorted(stale)}"


def test_every_business_ai_generation_route_has_a_daily_cap():
    found = _generation_routes()
    paths = {r.path for r, _ in found}
    # CONTROL: the known capped route is found, and passes the check.
    assert CONTROL_CAPPED in paths, f"walker lost the control route; found {sorted(paths)}"
    ctl = next((r, m) for r, m in found if r.path == CONTROL_CAPPED)
    assert _has_business_daily_cap(ctl[1], ctl[0].func)
    owner = [(r, m) for r, m in found if "require_admin" not in r.deps]
    assert len(owner) >= 5, f"expected >=5 business AI routes, found {len(owner)}"
    missing = sorted(
        f"{','.join(sorted(r.methods))} {r.path}"
        for r, m in owner
        if not _has_business_daily_cap(m, r.func)
    )
    assert not missing, (
        "AI generation route(s) without a per-business daily cap: "
        f"{missing}. Add `@limiter.limit('<N>/day', key_func=_business_key)` "
        "(routers/product_describe.py) on top of the per-IP hourly limit."
    )


# ---------------------------------------------------------------------------
# MEH-3498 — the site-wide daily ceiling (services/ai_budget.py).
# ---------------------------------------------------------------------------

DIRECT_CALL = re.compile(r"\.messages\.(create|stream|parse)\(")
BUDGET_CALL = re.compile(r"ai_budget\.allow\(")

# Modules whose model call does NOT spend the ceiling, and why. Moderation
# keeps running above it (the card); the chat's intent call rides on the one
# unit chat() spends per message.
BUDGET_EXEMPT = {
    "app.services.approved_edit_moderation": "moderation on save",
    "app.services.moderation_common": "moderation on save",
    "app.services.producer_risk": "moderation on save",
    "app.routers.reviews": "moderation on save",
    "app.services.chat_intent_router": "counted once per message in routers/chat.py chat()",
}

# The reference: the shared helper behind two owner tools.
CONTROL_BUDGETED = ("app.services.ai_text", "ask")


def _unbudgeted_calls(mod: str) -> list[str]:
    """Functions in `mod` that call the model directly with no ai_budget.allow."""
    tree = ast.parse(SRC[mod])
    out = []
    for n in ast.walk(tree):
        if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        seg = ast.get_source_segment(SRC[mod], n) or ""
        inner = [
            c
            for c in ast.walk(n)
            if c is not n and isinstance(c, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]
        if inner:  # judge the innermost function that holds the call
            continue
        if DIRECT_CALL.search(seg) and not BUDGET_CALL.search(seg):
            out.append(n.name)
    return out


def test_every_model_call_spends_the_site_wide_ceiling():
    direct = {m for m, s in SRC.items() if DIRECT_CALL.search(s)}
    # CONTROL: the walker sees the reference call and judges it budgeted.
    mod, func = CONTROL_BUDGETED
    assert mod in direct, "walker lost the control module"
    assert func not in _unbudgeted_calls(mod)
    assert len(direct - set(BUDGET_EXEMPT)) >= 6, sorted(direct)
    stale = set(BUDGET_EXEMPT) - direct
    assert not stale, f"Exempt but no longer calls the model: {sorted(stale)}"
    missing = sorted(
        f"{m}.{f}" for m in direct - set(BUDGET_EXEMPT) for f in _unbudgeted_calls(m)
    )
    assert not missing, (
        f"Model call(s) outside the site-wide ceiling: {missing}. Call "
        "`ai_budget.allow(<tier>)` before the call and answer as if the key "
        "were missing when it is False, or add the module to BUDGET_EXEMPT "
        "with the reason (services/ai_budget.py, MEH-3498)."
    )
