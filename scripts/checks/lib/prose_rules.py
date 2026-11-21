"""
Module:   prose_rules
Purpose:  Machine checks for rules that were written only in words in CLAUDE.md,
          .claude/rules/ and backend/app/routers/CLAUDE.md, so they cannot
          erode without a red guard. Called by scripts/checks/prose-rules-guard.sh.
Touches:  nothing — reads source files and prints violations as file:line.
Does NOT: judge prose, copy or design. Rules that need judgment stay prose
          (decisions.md, copy approval, placement research) — see MEH-3600.
Related:  scripts/checks/hebrew-detail-allowlist.tsv (rule 1 exceptions),
          backend/app/routers/CLAUDE.md («Hebrew errors», «Optional auth»),
          .claude/rules/db.md, .claude/rules/backend.md, .claude/rules/testing.md
History:  MEH-3601 (creation, under MEH-3600).

THE RULES
  R1 hebrew-detail — every literal `detail=` of an HTTPException raised in
     backend/app/routers/** contains Hebrew (routers/CLAUDE.md). A literal that
     must stay non-Hebrew (a machine-facing webhook answer) goes in
     hebrew-detail-allowlist.tsv with its reason. An allowlist row that matches
     nothing fails, so the list can only shrink.
  R2 lenient-only-beacons — get_current_user_lenient is used only by the three
     beacon handlers in routers/producers.py (MEH-1627, MEH-2159).
  R3 one-schema-owner — `.create_all(` is called only in backend/app/startup.py,
     and no `_migrate_columns` function exists in backend/ (db.md, MEH-267).
  R4 locked-deps — backend/app never imports smtplib (Resend only) or
     geoalchemy2, no SQL string in backend/ creates the postgis extension, and
     neither backend/pyproject.toml nor backend/uv.lock names postgis or
     geoalchemy (backend.md).
  R5 networkidle-bounded — every `networkidle` in code under
     frontend/e2e/flows/ and frontend/e2e/visual/ carries a `timeout` within the
     same statement (testing.md, MEH-215).

  Escape hatch for R2–R5: `guard-ok: <reason>` on the line or ±1, the same
  convention as the other guards here.

USAGE
  python3 scripts/checks/lib/prose_rules.py            # check the repo
  python3 scripts/checks/lib/prose_rules.py --self-test
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HEBREW = re.compile("[֐-׿]")
ALLOWLIST = Path("scripts/checks/hebrew-detail-allowlist.tsv")

LENIENT_ALLOWED = {
    ("backend/app/routers/producers.py", "record_producer_view"),
    ("backend/app/routers/producers.py", "record_whatsapp_click"),
    ("backend/app/routers/producers.py", "record_contact_click"),
}
CREATE_ALL_OWNER = "backend/app/startup.py"


def _suppressed(source: str, line: int) -> bool:
    lines = source.splitlines()
    window = lines[max(0, line - 2): line + 1]
    return any("guard-ok:" in chunk for chunk in window)


def _literal_text(node: ast.AST) -> str | None:
    """The constant text of a str literal or f-string; None if not literal."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        return "".join(
            v.value for v in node.values
            if isinstance(v, ast.Constant) and isinstance(v.value, str)
        )
    return None


def _call_name(func: ast.AST) -> str:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return ""


# ---------------------------------------------------------------- R1
def hebrew_detail(rel: str, source: str) -> list[tuple[int, str]]:
    """(line, literal) for every non-Hebrew literal detail in this file."""
    found = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call) or _call_name(node.func) != "HTTPException":
            continue
        detail = next((k.value for k in node.keywords if k.arg == "detail"), None)
        if detail is None and len(node.args) >= 2:
            detail = node.args[1]
        text = _literal_text(detail) if detail is not None else None
        if text is not None and not HEBREW.search(text):
            found.append((node.lineno, text))
    return found


def load_allowlist(text: str) -> dict[tuple[str, str], str]:
    rows = {}
    for raw in text.splitlines():
        if not raw.strip() or raw.startswith("#"):
            continue
        parts = raw.split("\t")
        if len(parts) != 3 or not parts[2].strip():
            raise ValueError(f"allowlist row needs path<TAB>literal<TAB>reason: {raw!r}")
        rows[(parts[0], parts[1])] = parts[2]
    return rows


# ---------------------------------------------------------------- R2
def lenient_uses(rel: str, source: str) -> list[tuple[int, str]]:
    """(line, enclosing function) for each reference to the lenient dep."""
    uses = []

    def visit(node: ast.AST, func: str) -> None:
        for child in ast.iter_child_nodes(node):
            name = func
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                name = child.name
            if isinstance(child, ast.Name) and child.id == "get_current_user_lenient":
                uses.append((child.lineno, func))
            visit(child, name)

    visit(ast.parse(source), "<module>")
    return uses


def lenient_violations(rel: str, source: str) -> list[tuple[int, str]]:
    if rel == "backend/app/auth.py":
        return []
    return [
        (line, f"get_current_user_lenient in {func}() — only the beacon handlers "
               "may swallow an invalid token (MEH-1627); use get_current_user_optional")
        for line, func in lenient_uses(rel, source)
        if (rel, func) not in LENIENT_ALLOWED
    ]


# ---------------------------------------------------------------- R3
def schema_owner_violations(rel: str, source: str) -> list[tuple[int, str]]:
    out = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Call) and _call_name(node.func) == "create_all" \
                and rel != CREATE_ALL_OWNER and rel.startswith("backend/app/"):
            out.append((node.lineno, f".create_all() outside {CREATE_ALL_OWNER} — "
                                     "Alembic is the one schema owner (MEH-267)"))
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name == "_migrate_columns":
            out.append((node.lineno, "_migrate_columns is back — deleted in MEH-267, "
                                     "root cause of MEH-265"))
    return out


# ---------------------------------------------------------------- R4
BANNED_IMPORTS = {"smtplib": "email goes through Resend (backend.md)",
                  "geoalchemy2": "no PostGIS (backend.md)"}


def locked_dep_violations(rel: str, source: str) -> list[tuple[int, str]]:
    out = []
    for node in ast.walk(ast.parse(source)):
        mods = []
        if isinstance(node, ast.Import):
            mods = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module:
            mods = [node.module]
        for mod in mods:
            top = mod.split(".")[0]
            if top in BANNED_IMPORTS and rel.startswith("backend/app/"):
                out.append((node.lineno, f"import {mod} — {BANNED_IMPORTS[top]}"))
        if isinstance(node, ast.Constant) and isinstance(node.value, str) \
                and re.search(r"create\s+extension[^;]*postgis", node.value, re.I):
            out.append((node.lineno, "SQL creates the postgis extension — never add PostGIS"))
    return out


def dep_file_violations(rel: str, text: str) -> list[tuple[int, str]]:
    return [
        (n, "dependency names postgis/geoalchemy — never add PostGIS (backend.md)")
        for n, line in enumerate(text.splitlines(), 1)
        if re.search(r"postgis|geoalchemy", line, re.I) and not line.lstrip().startswith("#")
    ]


# ---------------------------------------------------------------- R5
def networkidle_violations(rel: str, source: str) -> list[tuple[int, str]]:
    out = []
    lines = source.splitlines()
    for idx, line in enumerate(lines):
        code = line.split("//", 1)[0]
        if "networkidle" not in code or code.lstrip().startswith("*"):
            continue
        statement = " ".join(lines[idx: idx + 3]).split(";", 1)[0]
        if "timeout" not in statement:
            out.append((idx + 1, "unbounded networkidle wait — banned in specs (MEH-215); "
                                 "pass { timeout } or gate on a testid/response"))
    return out


# ---------------------------------------------------------------- runner
def _py_files(*dirs: str) -> list[Path]:
    files = []
    for d in dirs:
        files += sorted((ROOT / d).rglob("*.py"))
    return [f for f in files if "__pycache__" not in f.parts]


def run(root: Path = ROOT) -> list[str]:
    report: list[str] = []

    def add(rel: str, source: str, hits: list[tuple[int, str]]) -> None:
        for line, msg in hits:
            if not _suppressed(source, line):
                report.append(f"{rel}:{line}: {msg}")

    allow = load_allowlist((root / ALLOWLIST).read_text(encoding="utf-8"))
    used: set[tuple[str, str]] = set()
    for path in _py_files("backend/app/routers"):
        rel = path.relative_to(root).as_posix()
        source = path.read_text(encoding="utf-8")
        for line, text in hebrew_detail(rel, source):
            if (rel, text) in allow:
                used.add((rel, text))
            else:
                report.append(f"{rel}:{line}: detail={text!r} is not Hebrew — "
                              "routers/CLAUDE.md requires Hebrew; a machine-facing "
                              f"answer goes in {ALLOWLIST} with its reason")
    for rel, text in sorted(set(allow) - used):
        report.append(f"{ALLOWLIST}:1: stale row {rel} {text!r} matches nothing — delete it")

    for path in _py_files("backend/app", "backend/alembic", "backend/scripts"):
        rel = path.relative_to(root).as_posix()
        source = path.read_text(encoding="utf-8")
        if rel.startswith("backend/app/"):
            add(rel, source, lenient_violations(rel, source))
        add(rel, source, schema_owner_violations(rel, source))
        add(rel, source, locked_dep_violations(rel, source))

    for dep in ("backend/pyproject.toml", "backend/uv.lock"):
        if (root / dep).exists():
            text = (root / dep).read_text(encoding="utf-8")
            add(dep, text, dep_file_violations(dep, text))

    for d in ("frontend/e2e/flows", "frontend/e2e/visual"):
        for path in sorted((root / d).rglob("*.ts")):
            rel = path.relative_to(root).as_posix()
            source = path.read_text(encoding="utf-8")
            add(rel, source, networkidle_violations(rel, source))
    return report


def self_test() -> int:
    fails = []

    def expect(name: str, got: int, want: int) -> None:
        if got != want:
            fails.append(f"{name}: expected {want}, got {got}")

    # R1 — English literal, f-string, positional; Hebrew passes; variable is not literal.
    r1 = ('from fastapi import HTTPException\n'
          'raise HTTPException(status_code=400, detail="Forbidden")\n'
          'raise HTTPException(400, f"bad {x}")\n'
          'raise HTTPException(status_code=400, detail="אין הרשאה")\n'
          'raise HTTPException(status_code=400, detail=msg)\n')
    expect("R1 synthetic", len(hebrew_detail("r.py", r1)), 2)
    real = (ROOT / "backend/app/routers/whatsapp_webhook.py").read_text(encoding="utf-8")
    expect("R1 anchored whatsapp_webhook.py has English answers",
           int(len(hebrew_detail("x", real)) >= 1), 1)
    try:
        load_allowlist("a\tb\t\n")
        fails.append("R1 allowlist row without a reason was accepted")
    except ValueError:
        pass

    # R2 — the real producers.py must show exactly the three allowed beacons.
    rel = "backend/app/routers/producers.py"
    real = (ROOT / rel).read_text(encoding="utf-8")
    funcs = {f for _, f in lenient_uses(rel, real)}
    expect("R2 anchored: beacon handlers found", len(funcs & {f for _, f in LENIENT_ALLOWED}), 3)
    expect("R2 anchored: producers.py clean", len(lenient_violations(rel, real)), 0)
    r2 = "def update_x(u=Depends(get_current_user_lenient)):\n    pass\n"
    expect("R2 synthetic", len(lenient_violations("backend/app/routers/x.py", r2)), 1)

    # R3
    r3 = "Base.metadata.create_all(bind=e)\ndef _migrate_columns():\n    pass\n"
    expect("R3 synthetic outside owner", len(schema_owner_violations("backend/app/main.py", r3)), 2)
    expect("R3 owner may create_all", len(schema_owner_violations(CREATE_ALL_OWNER,
                                                                   "Base.metadata.create_all()\n")), 0)
    real = (ROOT / CREATE_ALL_OWNER).read_text(encoding="utf-8")
    expect("R3 anchored: startup.py really calls create_all",
           int(any(isinstance(n, ast.Call) and _call_name(n.func) == "create_all"
                   for n in ast.walk(ast.parse(real)))), 1)

    # R4
    r4 = 'import smtplib\nfrom geoalchemy2 import Geometry\nq = "CREATE EXTENSION IF NOT EXISTS postgis"\n'
    expect("R4 synthetic", len(locked_dep_violations("backend/app/x.py", r4)), 3)
    expect("R4 comment is not code", len(locked_dep_violations("backend/app/x.py",
                                                                "# no smtplib, no postgis\n")), 0)
    expect("R4 dep file", len(dep_file_violations("p", 'deps = ["geoalchemy2>=0.14"]\n')), 1)

    # R5 — the real parity.spec.ts holds the one sanctioned bounded wait.
    r5 = ('await page.waitForLoadState("networkidle");\n'
          '// a comment about networkidle\n'
          'await page.goto(u, { waitUntil: "networkidle" });\n'
          'await page.waitForLoadState("networkidle", { timeout: 5_000 });\n')
    expect("R5 synthetic", len(networkidle_violations("s.ts", r5)), 2)
    real = (ROOT / "frontend/e2e/visual/parity.spec.ts").read_text(encoding="utf-8")
    expect("R5 anchored: parity.spec.ts bounded wait passes", len(networkidle_violations("p", real)), 0)
    expect("R5 anchored: parity.spec.ts really waits on networkidle",
           int("waitForLoadState(\"networkidle\"" in real), 1)

    for line in fails:
        print(f"prose_rules self-test FAIL — {line}")
    if not fails:
        print("prose_rules self-test PASS")
    return 1 if fails else 0


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        return self_test()
    report = run()
    for line in report:
        print(f"  VIOLATION {line}")
    return 1 if report else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
