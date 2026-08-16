#!/usr/bin/env python3
"""
Module:   check_placeholder_search
Purpose:  Assert that every registered search placeholder still returns >= 1
          result from a LIVE /api/search. This is the half of the MEH-1800
          guard that catches rot — a well-formed string whose data moved out
          from under it.
Touches:  Network (one GET per registered placeholder) and two files it only
          reads: scripts/search-placeholder-keys.json and the messages file
          that registry names.
Does NOT: run in the per-PR CI gate, and must not be moved into
          scripts/checks/. run-all.sh discovers everything in that directory
          and runs it on every PR; a network- and data-dependent check there
          would redden PRs for reasons that are not their fault — the flake
          class MEH-1792 closed. It also does NOT check string SHAPE; that is
          frontend/__tests__/SearchPlaceholderContract.test.js.
Related:  frontend/__tests__/SearchPlaceholderContract.test.js (structural
          half), backend/app/routers/search.py (the endpoint),
          backend/app/utils/hebrew_search.py (the AND-over-tokens model),
          docs/ci/placeholder-search-cron.patch.md (the periodic runner).
History:  MEH-1800 (creation). MEH-1690 replaced three rotted strings without
          adding any check; MEH-1664's tokenisation change is what rotted them.

WHY A REPORTER AND NOT A MERGE GATE
    MEH-1800 §3 weighed three homes for this check and chose ב — periodic,
    reporting, non-blocking. The defect is decay over time, not a regression
    that arrives inside some diff, so a gate on every PR pays a cost on every
    PR to catch a state no PR caused. Exit 1 is still the signal, so a cron
    job or an on-demand run reads as a failure; nothing merges on it.

USAGE
    python3 scripts/check_placeholder_search.py
    python3 scripts/check_placeholder_search.py --base https://mehamakor.co.il
    python3 scripts/check_placeholder_search.py --probe "גבינת עיזים"

    Against a Vercel-protected deployment (staging), export
    VERCEL_AUTOMATION_BYPASS_SECRET and it is sent as the bypass header.
    Without it, staging answers the SSO redirect and the run reports
    UNREACHABLE — never a false green.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY_PATH = os.path.join(REPO_ROOT, "scripts", "search-placeholder-keys.json")

DEFAULT_BASE = "https://staging.mehamakor.online"
SCOPES = ("producers", "products", "cities", "categories")
TIMEOUT = 30


class Unreachable(RuntimeError):
    """The endpoint did not answer with search JSON — distinct from 0 results."""


def load_registry() -> tuple[str, list[str], dict]:
    with open(REGISTRY_PATH, encoding="utf-8") as fh:
        registry = json.load(fh)
    keys = registry.get("keys") or []
    if not keys:
        # An empty registry would let this script exit 0 having checked
        # nothing — the count()==0 silent-pass shape (.claude/rules/testing.md).
        raise SystemExit(f"FATAL: {REGISTRY_PATH} registers no keys")
    messages_file = registry["messagesFile"]
    with open(os.path.join(REPO_ROOT, messages_file), encoding="utf-8") as fh:
        messages = json.load(fh)
    return messages_file, keys, messages


def lookup(messages: dict, dotted_key: str):
    node = messages
    for part in dotted_key.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def search_counts(base: str, query: str) -> dict[str, int]:
    """GET <base>/api/search?q=… and return per-scope hit counts."""
    url = f"{base.rstrip('/')}/api/search?q={urllib.parse.quote(query)}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    secret = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET")
    if secret:
        request.add_header("x-vercel-protection-bypass", secret)
        request.add_header("x-vercel-set-bypass-cookie", "false")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            if response.status != 200:
                raise Unreachable(f"HTTP {response.status}")
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise Unreachable(f"HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise Unreachable(str(exc.reason if hasattr(exc, "reason") else exc)) from exc
    except json.JSONDecodeError as exc:
        # A Vercel SSO redirect lands here. Reporting it as "0 results" would
        # be a false RED; reporting it as a pass would be a false GREEN.
        raise Unreachable(f"response was not search JSON ({exc})") from exc
    if not isinstance(payload, dict) or not any(scope in payload for scope in SCOPES):
        raise Unreachable("response JSON has no search scopes")
    return {scope: len(payload.get(scope) or []) for scope in SCOPES}


def describe(counts: dict[str, int]) -> str:
    body = " ".join(f"{scope}={counts[scope]}" for scope in SCOPES)
    return f"{body}  TOTAL={sum(counts.values())}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=os.environ.get("PLACEHOLDER_CHECK_BASE", DEFAULT_BASE))
    parser.add_argument(
        "--probe",
        action="append",
        default=None,
        help="check this literal string instead of the registry (repeatable)",
    )
    args = parser.parse_args()

    if args.probe:
        subjects = [(f"--probe[{i}]", text) for i, text in enumerate(args.probe)]
        messages_file = "(literal)"
    else:
        messages_file, keys, messages = load_registry()
        subjects = [(key, lookup(messages, key)) for key in keys]

    print(f"base: {args.base}")
    print(f"source: {messages_file}\n")

    zero: list[str] = []
    unreachable: list[str] = []
    for key, value in subjects:
        if not isinstance(value, str) or not value.strip():
            zero.append(f"{key}: not a non-empty string ({value!r})")
            print(f"FAIL  {key}: not a non-empty string")
            continue
        try:
            counts = search_counts(args.base, value)
        except Unreachable as exc:
            unreachable.append(f"{key}: {exc}")
            print(f"ERR   {key}  {value!r}  — {exc}")
            continue
        total = sum(counts.values())
        status = "ok  " if total > 0 else "ZERO"
        print(f"{status}  {key}  {value!r}  {describe(counts)}")
        if total == 0:
            zero.append(f"{key}: {value!r} returns 0 results")

    print()
    if unreachable:
        # Not a verdict on the placeholders — a verdict on the run.
        print(f"UNREACHABLE — {len(unreachable)} query/queries never got an answer:")
        for line in unreachable:
            print(f"  · {line}")
        print("  (staging is Vercel-protected: export VERCEL_AUTOMATION_BYPASS_SECRET)")
        return 2
    if zero:
        print(f"FAILED — {len(zero)} placeholder(s) return zero results:")
        for line in zero:
            print(f"  · {line}")
        print("\nA placeholder that returns nothing teaches the user something false.")
        print("Replace it with an example that matches live data (MEH-1800).")
        return 1
    print(f"PASSED — all {len(subjects)} placeholder(s) return at least one result.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
