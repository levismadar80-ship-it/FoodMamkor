"""MEH-3604 — docs/CODE_INDEX.md: one line per code module, made from the code.

Every module under backend/app, frontend/lib, frontend/hooks,
frontend/components and the non-route files under frontend/app gets one row:
its path and the first line of its header comment (the «Purpose:» field of
the §14 header when it has one, else the header's first sentence). The point
is that a session looking for "is there already a date helper / an offer card"
reads ONE list instead of guessing file names — two near-identical cards and
two `highlightMatch` helpers were both written because nobody could see the
first one.

Three checks:
  1. the generated block in docs/CODE_INDEX.md equals what the code gives now
     (a module added, removed or re-described without regenerating → red);
  2. a module with no header comment fails unless it is in
     scripts/checks/code-index-no-header-baseline.txt, which only shrinks;
  3. the baseline names no file that is gone or that now has a header.

Regenerate:  UPDATE_CODE_INDEX=1 pytest tests/test_meh3604_code_index.py
Source-text by nature (it documents the code, testing.md MEH-3531).
"""

from __future__ import annotations

import ast
import os
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOC = REPO / "docs" / "CODE_INDEX.md"
BASELINE = REPO / "scripts" / "checks" / "code-index-no-header-baseline.txt"
BEGIN = "<!-- BEGIN GENERATED: code-index (tests/test_meh3604_code_index.py) -->"
END = "<!-- END GENERATED -->"
NO_HEADER = "— אין כותרת —"
MAX = 160

# (root, label) — order is the order of the sections in the doc.
ROOTS = [
    ("backend/app", "שרת — `backend/app`"),
    ("frontend/lib", "אתר — `frontend/lib`"),
    ("frontend/hooks", "אתר — `frontend/hooks`"),
    ("frontend/components", "אתר — `frontend/components`"),
    ("frontend/app", "אתר — קבצים שאינם route תחת `frontend/app`"),
]
JS_EXT = {".js", ".jsx", ".ts", ".tsx", ".mjs"}
# Next.js route files: FEATURES.md «route inventory» owns them, not this index.
ROUTE_FILE = re.compile(
    r"^(page|layout|loading|error|not-found|route|template|default|global-error|"
    r"opengraph-image|twitter-image|sitemap|robots|manifest|icon|apple-icon)\.(js|jsx|ts|tsx)$"
)
SKIP_DIRS = {"__tests__", "__pycache__", "node_modules"}
# Tool pragmas are not a header: skipped, so a file whose only top comment is
# one of these counts as headerless (reviewer finding, MEH-3604).
JS_PRAGMA = re.compile(
    r"^\s*(['\"]use (client|server)['\"];?|//\s*@ts-(check|nocheck)|"
    r"//\s*(eslint|prettier|istanbul|c8|vitest)\b.*|/\*\s*(eslint|prettier|istanbul|c8)\b.*\*/)\s*$"
)


def _clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip().replace("|", "\\|").replace("`", "'")
    if len(text) <= MAX:
        return text
    cut = text[: MAX - 1]
    stop = max(cut.rfind(". "), cut.rfind("; "))
    cut = cut[: stop + 1] if stop > MAX // 2 else cut[: cut.rfind(" ")]
    return cut.rstrip() + " …"


def _summary(lines: list[str]) -> str:
    """«Purpose:» field (with its continuation lines) if present, else the first paragraph."""
    lines = [l.rstrip() for l in lines]
    for i, line in enumerate(lines):
        m = re.match(r"^\s*Purpose:\s*(.*)$", line)
        if m:
            parts = [m.group(1)]
            for nxt in lines[i + 1 :]:
                if not nxt.strip() or re.match(r"^\s*[A-Z][A-Za-z ]{1,12}:\s", nxt):
                    break
                parts.append(nxt.strip())
            return _clean(" ".join(parts))
    para: list[str] = []
    for line in lines:
        s = line.strip()
        if not s or re.match(r"^(Module|File):", s):
            if para:
                break
            continue
        para.append(s)
    return _clean(" ".join(para)) if para else ""


def _py_header(path: Path) -> str:
    try:
        doc = ast.get_docstring(ast.parse(path.read_text(encoding="utf-8")))
    except SyntaxError:
        doc = None
    if doc:
        return _summary(doc.splitlines())
    comments = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#!") or "coding" in line[:25] and line.startswith("#"):
            continue
        if line.startswith("#"):
            comments.append(line.lstrip("#"))
        elif line.strip():
            break
        elif comments:
            break
    return _summary(comments)


def _js_header(path: Path) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines) and (not lines[i].strip() or JS_PRAGMA.match(lines[i])):
        i += 1
    if i >= len(lines):
        return ""
    first = lines[i].strip()
    body: list[str] = []
    if first.startswith("/*"):
        for line in lines[i:]:
            s = line.strip()
            end = "*/" in s
            s = re.sub(r"^/\*\*?|\*/$", "", s).strip()
            s = re.sub(r"^\*\s?", "", s)
            body.append(s)
            if end:
                break
    elif first.startswith("//"):
        for line in lines[i:]:
            if not line.strip().startswith("//"):
                break
            body.append(line.strip()[2:].lstrip("/ "))
    return _summary(body)


def collect() -> dict[str, list[tuple[str, str]]]:
    out: dict[str, list[tuple[str, str]]] = {}
    for root, _label in ROOTS:
        rows = []
        for dirpath, dirnames, filenames in os.walk(REPO / root):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
            for name in sorted(filenames):
                p = Path(dirpath) / name
                rel = p.relative_to(REPO).as_posix()
                if root == "backend/app":
                    if p.suffix != ".py":
                        continue
                    if name == "__init__.py" and not p.read_text(encoding="utf-8").strip():
                        continue
                    rows.append((rel, _py_header(p)))
                else:
                    if p.suffix not in JS_EXT or ".test." in name or ".spec." in name:
                        continue
                    if root == "frontend/app" and ROUTE_FILE.match(name):
                        continue
                    rows.append((rel, _js_header(p)))
        out[root] = sorted(rows)
    return out


def render(data: dict[str, list[tuple[str, str]]]) -> str:
    # No counts in the block: every PR that adds a file would rewrite the same
    # line, and parallel PRs would conflict on it. Sorted rows merge cleanly.
    parts = [BEGIN, ""]
    for root, label in ROOTS:
        parts += [f"### {label}", "", "| קובץ | מה הוא עושה (מהכותרת) |", "|---|---|"]
        prefix = root + "/"
        for rel, summ in data[root]:
            parts.append(f"| `{rel[len(prefix):]}` | {summ or NO_HEADER} |")
        parts.append("")
    parts.append(END)
    return "\n".join(parts)


def _doc_block() -> str:
    text = DOC.read_text(encoding="utf-8")
    return text[text.index(BEGIN) : text.index(END) + len(END)]


def _baseline() -> set[str]:
    return {
        l.strip()
        for l in BASELINE.read_text(encoding="utf-8").splitlines()
        if l.strip() and not l.startswith("#")
    }


def test_code_index_matches_the_code():
    want = render(collect())
    if os.environ.get("UPDATE_CODE_INDEX") == "1":
        text = DOC.read_text(encoding="utf-8")
        DOC.write_text(text.replace(_doc_block(), want), encoding="utf-8")
    assert _doc_block() == want, (
        "docs/CODE_INDEX.md is out of date with the code (a module was added, "
        "removed or its header changed). Regenerate: "
        "UPDATE_CODE_INDEX=1 pytest tests/test_meh3604_code_index.py"
    )


def test_a_new_module_has_a_header_comment():
    headerless = {rel for rows in collect().values() for rel, s in rows if not s}
    new = sorted(headerless - _baseline())
    assert not new, (
        "These modules have no header comment, so the code index cannot say what "
        "they do. Add a header (code-execution.md §14 — at least a Purpose line):\n  "
        + "\n  ".join(new)
    )


def test_the_no_header_baseline_only_shrinks():
    headerless = {rel for rows in collect().values() for rel, s in rows if not s}
    stale = sorted(_baseline() - headerless)
    assert not stale, (
        "Remove these lines from scripts/checks/code-index-no-header-baseline.txt "
        "— the file is gone or now has a header:\n  " + "\n  ".join(stale)
    )


def test_summary_extraction_self_check():
    """Anchored to real files (MEH-1909): a §14 header, a JSDoc header, a bare one."""
    assert _py_header(REPO / "backend/app/services/rescue_digest.py").startswith(
        "At pickup_start, send one WhatsApp message"
    )
    assert _js_header(REPO / "frontend/lib/highlight-match.js").startswith("highlightMatch(text, query)")
    assert _summary(["Module: x", "Purpose:  does A", "  and B.", "Touches: db"]) == "does A and B."
    assert _summary([]) == ""
