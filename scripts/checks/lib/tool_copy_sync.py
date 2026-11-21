"""
Module:   tool_copy_sync
Purpose:  A tool in frontend/lib/business-features.js that gains a file in its
          `codeRef` must also change its own copy (business_features.items.<id>
          in frontend/messages/he.json) in the same PR — or the PR body says
          why not, one line per tool: `Tool copy: <id> unchanged — <reason>`.
Touches:  nothing — reads two git revisions of two files and the PR body.
Does NOT: judge the new wording, or look at a NEW tool (BusinessFeaturesRegistry
          .test.js already demands copy for every id). A removed codeRef path is
          not checked either: dropping a file rarely changes what a tool does.
Related:  scripts/checks/tool-copy-sync-guard.sh (the wrapper),
          frontend/lib/business-features.js, workflow.md «Launch tier» ב׳.
History:  MEH-3643 (creation, 21/11; found on MEH-3611): the logo card joined gallery_story's
          codeRef while the /join list and the assistant still read «תמונות,
          "אודות" ו"מאחורי העסק"» — every existing check stayed green.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

REGISTRY = "frontend/lib/business-features.js"
HE = "frontend/messages/he.json"
ID_LINE = re.compile(r'^\s*\{\s*id:\s*"([a-z0-9_]+)"')
CODEREF = re.compile(r"codeRef:\s*\[")


def code_refs(line: str) -> list[str] | None:
    """The quoted paths inside `codeRef: [ … ]`. Scans quote by quote, because a
    path holds brackets of its own (`app/[locale]/…`) — a negated-class regex stops
    at the first one and reads an empty list (the self-test caught exactly that)."""
    m = CODEREF.search(line)
    if not m:
        return None
    out, i = [], m.end()
    while i < len(line):
        c = line[i]
        if c == '"':
            j = line.index('"', i + 1)
            out.append(line[i + 1:j])
            i = j + 1
        elif c == "]":
            return out
        else:
            i += 1
    return None
WAIVER = re.compile(r"^Tool copy:\s*([a-z0-9_]+)\s+unchanged\s+[—-]+\s*\S", re.M)


def parse_registry(text: str) -> dict[str, set[str]]:
    """id -> codeRef paths. Fails loudly on an entry it cannot read, because a
    silently skipped tool is a tool this guard never checks."""
    out: dict[str, set[str]] = {}
    for n, line in enumerate(text.splitlines(), 1):
        if not ID_LINE.match(line):
            continue
        tid = ID_LINE.match(line).group(1)
        refs = code_refs(line)
        if refs is None and "codeRef" in line:
            raise ValueError(f"{REGISTRY}:{n}: codeRef spans lines; parser reads one line per tool")
        out[tid] = set(refs or [])
    return out


def tool_copy(he_text: str) -> dict[str, object]:
    return json.loads(he_text).get("business_features", {}).get("items", {})


def violations(base_reg: str, head_reg: str, base_he: str, head_he: str, body: str) -> list[str]:
    base, head = parse_registry(base_reg), parse_registry(head_reg)
    base_copy, head_copy = tool_copy(base_he), tool_copy(head_he)
    waived = set(WAIVER.findall(body or ""))
    bad = []
    for tid, refs in sorted(head.items()):
        if tid not in base:
            continue  # a new tool: the registry test owns its copy
        added = sorted(refs - base[tid])
        if not added or tid in waived:
            continue
        if base_copy.get(tid) != head_copy.get(tid):
            continue
        line = next((i for i, l in enumerate(head_reg.splitlines(), 1) if f'id: "{tid}"' in l), 1)
        bad.append(
            f"{REGISTRY}:{line}: tool «{tid}» gained {', '.join(added)} but its copy "
            f"(business_features.items.{tid} in {HE}) did not change. Update the label/tile "
            f"lines, or add to the PR body: `Tool copy: {tid} unchanged — <reason>`"
        )
    return bad


def _git_show(ref: str, path: str) -> str | None:
    r = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def self_test(root: Path) -> int:
    reg0 = 'export const X = [\n  { id: "gallery", group: "page", codeRef: ["app/[locale]/a.jsx"], dashboard: { href: "/x" } },\n  { id: "hours", codeRef: ["h.js"] },\n];\n'
    reg1 = reg0.replace('["app/[locale]/a.jsx"]', '["app/[locale]/a.jsx", "app/[locale]/logo.jsx"]')
    reg_new = reg0.replace("];", '  { id: "fresh", codeRef: ["f.js"] },\n];')
    he0 = json.dumps({"business_features": {"items": {"gallery": {"label": "תמונות"}, "hours": {"label": "שעות"}}}})
    he1 = json.dumps({"business_features": {"items": {"gallery": {"label": "תמונות ולוגו"}, "hours": {"label": "שעות"}}}})
    cases = [
        ("file added, copy same → red", violations(reg0, reg1, he0, he0, ""), 1),
        ("file added, copy changed → green", violations(reg0, reg1, he0, he1, ""), 0),
        ("file added, waiver in body → green", violations(reg0, reg1, he0, he0, "Tool copy: gallery unchanged — internal helper"), 0),
        ("waiver without a reason → red", violations(reg0, reg1, he0, he0, "Tool copy: gallery unchanged —"), 1),
        ("waiver for another tool → red", violations(reg0, reg1, he0, he0, "Tool copy: hours unchanged — x"), 1),
        ("nothing added → green", violations(reg0, reg0, he0, he0, ""), 0),
        ("new tool → not this guard's", violations(reg0, reg_new, he0, he0, ""), 0),
    ]
    bad = 0
    for name, got, want in cases:
        if len(got) != want:
            print(f"self-test FAIL: {name}: got {len(got)} violation(s), want {want}")
            bad = 1
    # Anchored to the real files: the parser must read every tool line, and the
    # real copy must have an entry for the tool the incident was about.
    real = (root / REGISTRY).read_text(encoding="utf-8")
    ids = [l for l in real.splitlines() if ID_LINE.match(l)]
    parsed = parse_registry(real)
    if len(parsed) != len(ids) or len(parsed) < 20:
        print(f"self-test FAIL: real registry: {len(ids)} id lines, {len(parsed)} parsed")
        bad = 1
    if len(parsed.get("gallery_story", ())) < 3:
        print(f"self-test FAIL: real gallery_story codeRef parsed as {sorted(parsed.get('gallery_story', ()))}")
        bad = 1
    if "gallery_story" not in tool_copy((root / HE).read_text(encoding="utf-8")):
        print("self-test FAIL: real he.json has no business_features.items.gallery_story")
        bad = 1
    if not bad:
        print(f"self-test: {len(cases) + 3} cases passed ({len(parsed)} real tools parsed)")
    return bad


def main() -> int:
    root = Path(__file__).resolve().parents[3]
    if self_test(root):
        print("FAIL tool-copy-sync-guard: self-test failed — every result below would be void")
        return 1
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        return 0
    base_ref, body = sys.argv[1], sys.stdin.read()
    base_reg, base_he = _git_show(base_ref, REGISTRY), _git_show(base_ref, HE)
    if base_reg is None or base_he is None:
        print(f"tool-copy-sync-guard: {base_ref} has no {REGISTRY} or {HE} — nothing to compare")
        return 0
    head_reg = (root / REGISTRY).read_text(encoding="utf-8")
    head_he = (root / HE).read_text(encoding="utf-8")
    bad = violations(base_reg, head_reg, base_he, head_he, body)
    for b in bad:
        print(b)
    if not bad:
        print("tool-copy-sync-guard: every tool that gained a file also changed its copy (or says why not)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
