"""
Module:   whats_new_pending
Purpose:  Changesets for «מה חדש». A PR into staging that makes a tool live
          (a new `status: "live"` entry in frontend/lib/business-features.js, or
          an entry flipped to live) adds a draft line for it to
          docs/release/whats-new-pending.md — `- <tool_id>: <draft line>` — or
          says in its body `Whats-new: <id> none — <reason>`. A release PR (base
          main) must leave that file with no items: the release thread moves
          them into WHATS_NEW_RELEASES, after Sapir approves the wording.
Touches:  nothing — reads two revisions of two files and the PR body.
Does NOT: check the wording (rule 22 — Sapir approves it at release time) or
          that a line made it into the release entry: emptying the file is the
          release thread's act of moving it, and WhatsNew.test.jsx checks the
          he/en lines of the entry itself.
Related:  scripts/checks/whats-new-pending-guard.sh, docs/release/whats-new.md,
          scripts/checks/whats-new-release-guard.sh (an entry exists at all).
History:  MEH-3643 (creation, 21/11; found on MEH-3611). The release guard only asked for ONE entry
          per release; a release with three new tools could ship naming one.
          Model: Changesets — each user-facing PR carries its own changelog line.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REGISTRY = "frontend/lib/business-features.js"
PENDING = "docs/release/whats-new-pending.md"
ID_STATUS = re.compile(r'^\s*\{\s*id:\s*"([a-z0-9_]+)".*?\bstatus:\s*"([a-z_]+)"')
ID_LINE = re.compile(r'^\s*\{\s*id:\s*"([a-z0-9_]+)"')
ITEM = re.compile(r"^- ([a-z0-9_]+):\s*\S", re.M)
WAIVER = re.compile(r"^Whats-new:\s*([a-z0-9_]+)\s+none\s+[—-]+\s*\S", re.M)


def live_tools(text: str) -> set[str]:
    live = set()
    for n, line in enumerate(text.splitlines(), 1):
        if not ID_LINE.match(line):
            continue
        m = ID_STATUS.match(line)
        if not m:
            raise ValueError(f"{REGISTRY}:{n}: tool line without a status the parser can read")
        if m.group(2) == "live":
            live.add(m.group(1))
    return live


def staging_problems(base_reg: str, head_reg: str, pending: str, body: str) -> list[str]:
    new = live_tools(head_reg) - live_tools(base_reg)
    listed, waived = set(ITEM.findall(pending)), set(WAIVER.findall(body or ""))
    return [
        f"{PENDING}:1: tool «{t}» goes live in this PR with no «מה חדש» draft — add "
        f"'- {t}: <one line for business owners>' (or in the PR body: `Whats-new: {t} none — <reason>`)"
        for t in sorted(new - listed - waived)
    ]


def release_problems(pending: str) -> list[str]:
    left = ITEM.findall(pending)
    return [
        f"{PENDING}:1: {len(left)} draft line(s) still pending ({', '.join(left)}) — move them into "
        f"the release entry in frontend/lib/whats-new.js (after Sapir's approval) and empty the list"
    ] if left else []


def self_test(root: Path) -> int:
    reg0 = '[\n  { id: "hours", group: "page", status: "live", codeRef: ["h.js"] },\n  { id: "bags", status: "soon" },\n];'
    reg_flip = reg0.replace('id: "bags", status: "soon"', 'id: "bags", status: "live"')
    reg_add = reg0.replace("];", '  { id: "logo", status: "live" },\n];')
    empty, with_bags = "# pending\n", "# pending\n- bags: סלים להצלת אוכל\n"
    cases = [
        ("status flipped to live, no draft → red", staging_problems(reg0, reg_flip, empty, ""), 1),
        ("new live tool, no draft → red", staging_problems(reg0, reg_add, empty, ""), 1),
        ("flipped with a draft line → green", staging_problems(reg0, reg_flip, with_bags, ""), 0),
        ("draft id without text → red", staging_problems(reg0, reg_flip, "- bags:\n", ""), 1),
        ("waiver with a reason → green", staging_problems(reg0, reg_flip, empty, "Whats-new: bags none — renamed only"), 0),
        ("waiver without a reason → red", staging_problems(reg0, reg_flip, empty, "Whats-new: bags none —"), 1),
        ("nothing went live → green", staging_problems(reg0, reg0, empty, ""), 0),
        ("release with lines left → red", release_problems(with_bags), 1),
        ("release with the list emptied → green", release_problems(empty), 0),
    ]
    bad = 0
    for name, got, want in cases:
        if len(got) != want:
            print(f"self-test FAIL: {name}: got {len(got)}, want {want}")
            bad = 1
    real = (root / REGISTRY).read_text(encoding="utf-8")
    n_ids = sum(1 for l in real.splitlines() if ID_LINE.match(l))
    live = live_tools(real)
    if n_ids < 20 or not live or "gallery_story" not in live:
        print(f"self-test FAIL: real registry: {n_ids} tools, {len(live)} read as live")
        bad = 1
    if not (root / PENDING).exists():
        print(f"self-test FAIL: {PENDING} missing")
        bad = 1
    if not bad:
        print(f"self-test: {len(cases) + 2} cases passed ({len(live)} live tools in the real registry)")
    return bad


def _show(ref: str, path: str) -> str | None:
    r = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def main() -> int:
    root = Path(__file__).resolve().parents[3]
    if self_test(root):
        print("FAIL whats-new-pending-guard: self-test failed — every result below would be void")
        return 1
    if sys.argv[1:] == ["--self-test"]:
        return 0
    mode, base_ref, body = sys.argv[1], sys.argv[2], sys.stdin.read()
    pending = (root / PENDING).read_text(encoding="utf-8")
    if mode == "release":
        bad = release_problems(pending)
    else:
        base_reg = _show(base_ref, REGISTRY)
        if base_reg is None:
            print(f"whats-new-pending-guard: {base_ref} has no {REGISTRY} — nothing to compare")
            return 0
        bad = staging_problems(base_reg, (root / REGISTRY).read_text(encoding="utf-8"), pending, body)
    for b in bad:
        print(b)
    if not bad:
        print(f"whats-new-pending-guard ({mode}): OK")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
