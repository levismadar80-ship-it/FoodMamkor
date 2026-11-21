#!/usr/bin/env bash
#
# Module:   no-emoji-backend-guard
# Purpose:  No new emoji in what the server sends: email subjects and bodies,
#           WhatsApp / notification text, chat and moderation prompts. Sapir
#           22/11: «אסור שיהיה אימוג׳י באתר», enforced in code.
# Touches:  nothing on a normal run. Reads backend/app/**/*.py and the
#           baseline; writes scripts/checks/no-emoji-backend-baseline.txt only
#           under --update-baseline.
# Does NOT: scan the frontend. That layer has its own lock since MEH-1472 /
#           MEH-1661: frontend/__tests__/NoEmojiInComponents.test.js and
#           NoEmojiInMessages.test.js. One owner per layer (Smell #1).
#           Does not read comments or docstrings: only string literals that
#           can reach a person.
# Related:  scripts/checks/brand-lexicon-guard.sh (the ratchet shape: a
#           baseline that only shrinks, a stale line is red too).
# History:  MEH-3668 (creation).
#
# WHAT COUNTS AS EMOJI
#   Python's stdlib has no Extended_Pictographic property, so the class is
#   spelled as ranges: U+1F000–1FAFF, U+2600–27BF, U+2B00–2BFF, U+231A–23FF.
#   U+FE0F and U+200D are not counted on their own: they are invisible and
#   always ride on a base character that is. The typographic marks
#   the frontend lock also treats as text stay allowed: ✓ U+2713, ✗ U+2717,
#   ✕ U+2715, ★ U+2605, ☆ U+2606 (MEH-1681).
#
# WHY A BASELINE
#   About 60 emoji live in email files that open PRs are rewriting (#5101,
#   #5080, #5124). They are frozen per file and character; anything new is
#   red. A count that drops prints a note to lower the baseline; it is not red,
#   so a parallel PR that removes an emoji cannot turn staging red.
#
# USAGE
#   bash scripts/checks/no-emoji-backend-guard.sh                    # the gate
#   bash scripts/checks/no-emoji-backend-guard.sh --update-baseline  # rewrite
#   bash scripts/checks/no-emoji-backend-guard.sh --self-test        # fixtures
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE="$ROOT/scripts/checks/no-emoji-backend-baseline.txt"
MODE="${1:-gate}"

python3 -I - "$ROOT" "$BASELINE" "$MODE" <<'PY'
import ast, collections, pathlib, sys

root, baseline_path, mode = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
ALLOWED = set("✓✗✕★☆")
RANGES = [(0x1F000, 0x1FAFF), (0x2600, 0x27BF), (0x2B00, 0x2BFF), (0x231A, 0x23FF)]


def is_emoji(ch):
    if ch in ALLOWED:
        return False
    cp = ord(ch)
    return any(lo <= cp <= hi for lo, hi in RANGES)


def docstring_nodes(tree):
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            body = getattr(node, "body", [])
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
                    and isinstance(body[0].value.value, str):
                out.add(id(body[0].value))
    return out


def regex_nodes(tree):
    """String literals passed to re.* (the emoji validators in alerts.py and
    schemas/catalog.py spell the emoji ranges in order to REJECT them)."""
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                and isinstance(node.func.value, ast.Name) and node.func.value.id == "re":
            for arg in node.args:
                for sub in ast.walk(arg):
                    if isinstance(sub, ast.Constant):
                        out.add(id(sub))
    return out


def scan_source(src):
    """Counter of emoji characters in string literals (docstrings, comments and
    re.* patterns excluded)."""
    tree = ast.parse(src)
    skip = docstring_nodes(tree) | regex_nodes(tree)
    found = collections.Counter()
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in skip:
            for ch in node.value:
                if is_emoji(ch):
                    found["U+%04X" % ord(ch)] += 1
    return found


def self_test():
    cases = [
        ('subject = "מהמקור — אושר 🌿"\n', {"U+1F33F": 1}),
        ('subject = f"אושר {name} ✓"\n', {}),
        ('# a comment 🌱\nx = "נקי"\n', {}),
        ('def f():\n    """Docstring 🔒."""\n    return "שלום ✅"\n', {"U+2705": 1}),
        ('body = "שימו לב ⚠️"\n', {"U+26A0": 1}),
        ('import re\nR = re.compile("[" + "\\U0001f300-\\U0001faff" + "]")\n', {}),
    ]
    bad = 0
    for src, want in cases:
        got = dict(scan_source(src))
        if got != want:
            bad += 1
            print(f"self-test FAIL: {src!r}: got {got}, want {want}")
    # Anchored to a real file: content_notifications.py carries «🌿» in a subject.
    real = root / "backend/app/services/content_notifications.py"
    if real.exists() and "\U0001F33F" in real.read_text() and not scan_source(real.read_text()):
        bad += 1
        print("self-test FAIL: the real content_notifications.py scanned as clean")
    return bad


if self_test():
    sys.exit(1)
if mode == "--self-test":
    print("no-emoji-backend self-test OK (6 synthetic cases + 1 real file).")
    sys.exit(0)

current = {}
files = sorted((root / "backend/app").rglob("*.py"))
for p in files:
    c = scan_source(p.read_text(encoding="utf-8"))
    rel = p.relative_to(root).as_posix()
    for cp, n in c.items():
        current[f"{rel}\t{cp}"] = n

if not files:
    print("no-emoji-backend: parsed 0 files — the scan is not wired, every result is void.")
    sys.exit(1)

if mode == "--update-baseline":
    lines = [f"{k}\t{v}" for k, v in sorted(current.items())]
    header = "# MEH-3668: emoji frozen in backend string literals. Only shrinks.\n# path<TAB>codepoint<TAB>count\n"
    baseline_path.write_text(header + "".join(l + "\n" for l in lines), encoding="utf-8")
    print(f"no-emoji-backend: baseline rewritten, {len(lines)} lines, {sum(current.values())} emoji.")
    sys.exit(0)

frozen = {}
if baseline_path.exists():
    for line in baseline_path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        path, cp, n = line.split("\t")
        frozen[f"{path}\t{cp}"] = int(n)

errors, notes = [], []
for k, n in sorted(current.items()):
    allowed = frozen.get(k, 0)
    if n > allowed:
        path, cp = k.split("\t")
        errors.append(f"  NEW: {path} has {n} × {cp} (baseline {allowed}). Remove the emoji; the server sends no emoji (MEH-3668).")
for k, allowed in sorted(frozen.items()):
    n = current.get(k, 0)
    if n < allowed:
        path, cp = k.split("\t")
        # A warning, not a red: open PRs that rewrite these emails (#5101,
        # #5080, #5124) would otherwise turn staging red the moment they land.
        notes.append(f"  shrank: {path} now has {n} × {cp}, baseline says {allowed}. Run with --update-baseline to lock the drop in.")

total = sum(current.values())
print(f"no-emoji-backend: {len(files)} files scanned · {total} emoji in string literals · baseline {sum(frozen.values())}")
if notes:
    print("\n".join(notes))
if errors:
    print("\n".join(errors))
    sys.exit(1)
print("no-emoji-backend-guard OK.")
PY
