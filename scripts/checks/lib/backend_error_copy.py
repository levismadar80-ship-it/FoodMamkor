"""
Module:   backend_error_copy
Purpose:  Hold MEH-1943 with a machine check: copy a person reads in an API
          error lives in frontend/messages/*.json under `error.api.<code>`, the
          backend sends `api_error_detail(code, message, **params)`, and the
          raw Hebrew sentences still written in backend/app only go down.
Touches:  nothing — reads backend/app/**/*.py and frontend/messages/{he,en}.json.
Does NOT: check that a raw `detail=` in routers is Hebrew — that is R1 in
          scripts/checks/lib/prose_rules.py. Does not read the Pydantic
          ValueError messages in backend/app/schemas (a separate surface).
Related:  backend/app/api_errors.py (the helper), frontend/lib/errors.js
          `defaultCodeResolver` (the reader), scripts/checks/
          backend-error-copy-baseline.txt (the ratchet).
History:  MEH-1943 (creation).

THE RULES
  E1 no-leak — a raw Hebrew detail (a str literal, an f-string, or a module
     constant of either, given to HTTPException) may not
       (a) quote a UI label («…», “…”, "…", '…') — the label lives in he.json,
           so the sentence that names it goes there too: api_error_detail;
       (b) carry an English word that is not a brand or a file format;
       (c) interpolate a collection, an exception or a str() of one
           ({', '.join(X)}, {sorted(X)}, {exc}).
     Escape hatch: `guard-ok: <reason>` on the line or ±1.
  E2 code-home — every api_error_detail("code", "message", …) names a code
     whose he.json `error.api.<code>` equals `message` word for word and whose
     en.json key exists; every `error.api.*` key is emitted by some call.
  E3 ratchet — per file, the count of raw Hebrew details may not rise above
     backend-error-copy-baseline.txt; a file not listed may carry none. When a
     count falls, lower its line (printed as a NOTICE, not a failure).

USAGE
  python3 scripts/checks/lib/backend_error_copy.py              # check the repo
  python3 scripts/checks/lib/backend_error_copy.py --self-test
  python3 scripts/checks/lib/backend_error_copy.py --write-baseline
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BACKEND = "backend/app"
BASELINE = Path("scripts/checks/backend-error-copy-baseline.txt")
HE_JSON = Path("frontend/messages/he.json")
EN_JSON = Path("frontend/messages/en.json")
HELPER = "api_error_detail"

HEBREW = re.compile("[֐-׿]")
QUOTED = re.compile(
    r"«[^»]+»|“[^”]+”"
    r'|(?<![֐-׿])"[^"]{2,}"(?![֐-׿])'
    r"|(?:^|(?<=[\sלבכהושמ]))'[֐-׿][^']*'(?=$|[\s.,:;—)])"
)
ASCII_WORD = re.compile(r"[A-Za-z][A-Za-z_]+")
# Brands and formats a person knows by their English name.
ALLOWED_WORDS = {
    "Google", "Apple", "WhatsApp", "Meta", "Instagram", "Facebook", "Waze",
    "JPG", "JPEG", "PNG", "WebP", "GIF", "HEIC", "PDF", "CSV", "MB", "KB",
    "Excel", "URL", "SMS", "PayBox", "Bit", "Cloudinary",
}
PLACEHOLDER = re.compile(r"\{(\w+)\}")
LEAKY_CALLS = {"join", "sorted", "list", "str", "repr", "set", "tuple"}
LEAKY_NAMES = {"exc", "e", "err", "error"}


def _suppressed(source: str, line: int) -> bool:
    lines = source.splitlines()
    return any("guard-ok:" in chunk for chunk in lines[max(0, line - 2): line + 1])


def _text(node: ast.AST) -> str | None:
    """The constant text of a str literal, f-string or `+` of them."""
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left, right = _text(node.left), _text(node.right)
        return None if left is None or right is None else left + right
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mod):
        return _text(node.left)  # "…%s" % x
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "format"
    ):
        return _text(node.func.value)  # "…{}".format(x)
    if isinstance(node, ast.JoinedStr):
        return "".join(
            v.value for v in node.values
            if isinstance(v, ast.Constant) and isinstance(v.value, str)
        )
    return None


def _leaky_interpolation(node: ast.AST) -> str | None:
    for sub in ast.walk(node):
        if not isinstance(sub, ast.FormattedValue):
            continue
        for inner in ast.walk(sub.value):
            if isinstance(inner, ast.Call):
                name = getattr(inner.func, "id", getattr(inner.func, "attr", ""))
                if name in LEAKY_CALLS:
                    return f"{{{name}(…)}}"
            if isinstance(inner, ast.Name) and inner.id in LEAKY_NAMES:
                return f"{{{inner.id}}}"
    return None


def _module_constants(tree: ast.Module) -> dict[str, ast.AST]:
    """Names assigned a value anywhere in the file (module constants and
    function locals alike); the first assignment wins."""
    out: dict[str, ast.AST] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                out.setdefault(target.id, node.value)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value:
            out.setdefault(node.target.id, node.value)
    return out


def _detail_of(call: ast.Call) -> ast.AST | None:
    detail = next((k.value for k in call.keywords if k.arg == "detail"), None)
    if detail is None and len(call.args) >= 2:
        detail = call.args[1]
    return detail


def scan(source: str) -> tuple[list[tuple[int, ast.AST, str]], list[tuple[int, str, str]]]:
    """(raw Hebrew details as (line, node, text), helper calls as (line, code, message))."""
    tree = ast.parse(source)
    consts = _module_constants(tree)
    raw: list[tuple[int, ast.AST, str]] = []
    coded: list[tuple[int, str, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = getattr(node.func, "id", getattr(node.func, "attr", ""))
        if name == HELPER:
            code = _text(node.args[0]) if node.args else None
            msg = _text(node.args[1]) if len(node.args) > 1 else None
            coded.append((node.lineno, code or "", msg or ""))
            continue
        if name != "HTTPException":
            continue
        detail = _detail_of(node)
        if detail is None:
            continue
        line = node.lineno
        if isinstance(detail, ast.Name) and detail.id in consts:
            detail = consts[detail.id]  # a module constant: read its text
        text = _text(detail)
        if text is not None and HEBREW.search(text):
            raw.append((line, detail, text))
    return raw, coded


def leaks(text: str, node: ast.AST) -> list[str]:
    found = []
    quoted = QUOTED.search(text)
    if quoted:
        found.append(f"quotes a UI label {quoted.group(0)} — move it to he.json error.api.<code> via api_error_detail")
    words = [w for w in ASCII_WORD.findall(text) if w not in ALLOWED_WORDS]
    if words:
        found.append(f"English/internal word {words[0]!r} in a Hebrew sentence")
    leak = _leaky_interpolation(node)
    if leak:
        found.append(f"interpolates {leak} — an internal value at a person; put it in params")
    return found


def load_baseline(text: str) -> dict[str, int]:
    out = {}
    for raw in text.splitlines():
        if not raw.strip() or raw.startswith("#"):
            continue
        count, path = raw.split(None, 1)
        out[path.strip()] = int(count)
    return out


def check(root: Path) -> tuple[list[str], list[str], dict[str, int]]:
    """(failures, notices, per-file raw counts)."""
    fails: list[str] = []
    notes: list[str] = []
    counts: dict[str, int] = {}
    emitted: dict[str, str] = {}
    he_api = json.loads((root / HE_JSON).read_text())["error"].get("api", {})
    en_api = json.loads((root / EN_JSON).read_text())["error"].get("api", {})
    for path in sorted((root / BACKEND).rglob("*.py")):
        rel = path.relative_to(root).as_posix()
        source = path.read_text()
        raw, coded = scan(source)
        if raw:
            counts[rel] = len(raw)
        for line, node, text in raw:
            if _suppressed(source, line) or _suppressed(source, getattr(node, "lineno", line)):
                continue
            for why in leaks(text, node):
                fails.append(f"{rel}:{line}: E1 {why}")
        for line, code, msg in coded:
            if not re.fullmatch(r"[a-z][a-z0-9_]*", code):
                fails.append(f"{rel}:{line}: E2 {HELPER} needs a literal snake_case code first")
                continue
            emitted[code] = rel
            if code not in he_api:
                fails.append(f"{rel}:{line}: E2 code {code!r} has no he.json error.api.{code}")
            elif he_api[code] != msg:
                fails.append(f"{rel}:{line}: E2 message differs from he.json error.api.{code}: {he_api[code]!r}")
            if code not in en_api:
                fails.append(f"{rel}:{line}: E2 code {code!r} has no en.json error.api.{code}")
            names = set(PLACEHOLDER.findall(msg))
            for lang, table in (("he", he_api), ("en", en_api)):
                if code in table and set(PLACEHOLDER.findall(table[code])) != names:
                    fails.append(f"{rel}:{line}: E2 {lang}.json error.api.{code} placeholders differ from the message's {sorted(names)}")
    for key in sorted(set(he_api) | set(en_api)):
        if key not in emitted:
            fails.append(f"{HE_JSON}:1: E2 error.api.{key} is emitted by no {HELPER} call — a dead key")
    baseline = load_baseline((root / BASELINE).read_text())
    for rel, count in sorted(counts.items()):
        allowed = baseline.get(rel, 0)
        if count > allowed:
            fails.append(
                f"{rel}:1: E3 {count} raw Hebrew details, baseline {allowed} — new error copy "
                f"goes through {HELPER} + he.json error.api.<code> (MEH-1943)"
            )
        elif count < allowed:
            notes.append(f"{BASELINE}:1: NOTICE {rel} is down to {count} (baseline {allowed}) — lower the line")
    for rel in sorted(set(baseline) - set(counts)):
        if baseline[rel]:
            notes.append(f"{BASELINE}:1: NOTICE {rel} has no raw Hebrew details left — remove its line")
    return fails, notes, counts


def self_test() -> int:
    bad = 0

    def expect(label: str, cond: bool) -> None:
        nonlocal bad
        print(("ok   " if cond else "FAIL ") + label)
        bad += not cond

    src = (
        'from fastapi import HTTPException\n'
        'MSG = "מחיר «עד» חסר"\n'
        'raise HTTPException(422, detail=MSG)\n'
        'raise HTTPException(422, detail="בקשה לbadge זה")\n'
        "raise HTTPException(422, detail=f\"חייב להיות: {', '.join(X)}\")\n"
        'raise HTTPException(422, detail=f"נכשל: {exc}")\n'
        'raise HTTPException(422, detail="התחברות עם Google לא פעילה")\n'
        'raise HTTPException(422, detail="המחיר בש\\"ח לא תקין")\n'
        'raise HTTPException(422, detail="צ\'יפס לא זמין")\n'
        'raise HTTPException(422, detail=f"נשארו {left} יחידות")\n'
        'raise HTTPException(422, detail=api_error_detail("x_y", "שלום"))\n'
        'raise HTTPException(422, detail="נכשל %s" % x)\n'
        'raise HTTPException(422, detail="נכשל {}".format(x))\n'
        'def f():\n'
        '    msg = "שגיאה מקומית"\n'
        '    raise HTTPException(422, detail=msg)\n'
    )
    raw, coded = scan(src)
    by_line = {line: leaks(text, node) for line, node, text in raw}
    expect("constant with «label» is followed and flagged (a)", any("UI label" in w for w in by_line.get(3, [])))
    expect("English word flagged (b)", any("'badge'" in w for w in by_line.get(4, [])))
    expect("join interpolation flagged (c)", any("join" in w for w in by_line.get(5, [])))
    expect("exc interpolation flagged (c)", any("{exc}" in w for w in by_line.get(6, [])))
    expect("brand name passes", by_line.get(7) == [])
    expect('gershayim (ש"ח) is not a quote', by_line.get(8) == [])
    expect("geresh (צ'יפס) is not a quote", by_line.get(9) == [])
    expect("plain count interpolation passes", by_line.get(10) == [])
    expect("raw count = 11: % and .format and a function local are counted, the helper call is not", len(raw) == 11)
    expect("helper call read as (code, message)", coded == [(11, "x_y", "שלום")])
    # Anchored to real repo files (MEH-1909): the checker must see what is there.
    real = (ROOT / "backend/app/services/owner_products.py").read_text()
    _, real_coded = scan(real)
    expect("real file: owner_products.py emits product_price_max_needs_min",
           any(c == "product_price_max_needs_min" for _, c, _ in real_coded))
    auth_raw, _ = scan((ROOT / "backend/app/routers/auth.py").read_text())
    expect("real file: routers/auth.py still has >= 20 raw Hebrew details", len(auth_raw) >= 20)
    return 1 if bad else 0


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    fails, notes, counts = check(ROOT)
    if "--write-baseline" in argv:
        lines = ["# Raw Hebrew HTTPException details per file (MEH-1943). Only goes down.",
                 "# count<SPACE>path — regenerate with backend_error_copy.py --write-baseline."]
        lines += [f"{n} {p}" for p, n in sorted(counts.items())]
        (ROOT / BASELINE).write_text("\n".join(lines) + "\n")
        print(f"wrote {BASELINE}: {sum(counts.values())} details in {len(counts)} files")
        return 0
    for line in notes:
        print(line)
    for line in fails:
        print(line)
    print(f"backend-error-copy: {sum(counts.values())} raw Hebrew details in {len(counts)} files")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
