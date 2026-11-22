"""MEH-3598 — docs/ENVIRONMENT.md is the map of environment variables, made from code.

Three sources, one row per variable:
  1. `Settings` in backend/app/config.py (pydantic-settings: field name → ENV NAME);
  2. direct `os.getenv` / `os.environ` reads anywhere in backend/app;
  3. `process.env.NAME` reads in frontend/ (site code and tooling, kept apart).

A variable added, removed or renamed without regenerating the map goes red
here, with the command below — so regression rule 8 («no new env var without
listing it») has a guard and not only a sentence.

Regenerate:  UPDATE_ENV_MAP=1 pytest tests/test_meh3598_env_map.py
Source-text by nature (it documents the code, testing.md MEH-3531). It never
prints a default VALUE, only whether one exists, so the map cannot carry a
secret.
"""

from __future__ import annotations

import ast
import os
import re
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
APP_DIR = REPO / "backend" / "app"
FRONTEND_DIR = REPO / "frontend"
DOC = REPO / "docs" / "ENVIRONMENT.md"
BEGIN = "<!-- BEGIN GENERATED: tests/test_meh3598_env_map.py -->"
END = "<!-- END GENERATED -->"
REGENERATE = "UPDATE_ENV_MAP=1 pytest tests/test_meh3598_env_map.py"

NONE = "אין."
_FRONTEND_SUFFIXES = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
_FRONTEND_SKIP_DIRS = {"node_modules", ".next", "playwright-report", "test-results"}
# Tooling = code that never ships to a browser or the Next server.
_TOOLING_DIRS = {"e2e", "__tests__", "scripts", "qa-artifacts"}
# `next.config.js` and `sentry.*.config.js` run in the site, so «config» alone
# is not tooling: only the test runners' configs are.
_TOOLING_NAME = re.compile(r"\.(test|spec)\.|^playwright\.|^vitest\.|^qa-")
# A line that is only a comment names a variable without reading it.
_COMMENT_LINE = re.compile(r"^\s*(//|\*|/\*)")
_PROCESS_ENV = re.compile(
    r"""process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\])"""
)
_MAX_FILES_SHOWN = 3


# --- 1. Settings fields ------------------------------------------------------


def _comment_above(lines: list[str], lineno: int) -> str:
    """The comment block directly above line `lineno` (1-based), first sentence."""
    block: list[str] = []
    i = lineno - 2
    while i >= 0 and lines[i].strip().startswith("#"):
        block.append(lines[i].strip().lstrip("#").strip())
        i -= 1
    text = " ".join(reversed(block)).strip()
    if not text:
        return ""
    first = re.split(r"(?<=[.!?])\s", text, maxsplit=1)[0]
    return first if len(first) <= 160 else first[:157].rstrip() + "..."


def settings_rows(config_path: Path = APP_DIR / "config.py") -> list[tuple[str, ...]]:
    """(ENV NAME, type, default, comment) for every field of `class Settings`."""
    source = config_path.read_text(encoding="utf-8")
    lines = source.splitlines()
    rows = []
    for node in ast.walk(ast.parse(source)):
        if not (isinstance(node, ast.ClassDef) and node.name == "Settings"):
            continue
        for stmt in node.body:
            if not (
                isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name)
            ):
                continue
            default = stmt.value
            empty = default is None or (
                isinstance(default, ast.Constant) and default.value in ("", None)
            )
            rows.append(
                (
                    stmt.target.id.upper(),
                    ast.unparse(stmt.annotation),
                    "ריק" if empty else "יש",
                    _comment_above(lines, stmt.lineno),
                )
            )
    return sorted(rows)


# --- 2. direct os.getenv / os.environ reads ----------------------------------


def _env_read(node: ast.AST) -> ast.expr | None:
    """The name argument when `node` reads the environment, else None."""
    if isinstance(node, ast.Call):
        f = node.func
        dotted = ast.unparse(f)
        if dotted in {"os.getenv", "getenv", "os.environ.get", "environ.get"}:
            return node.args[0] if node.args else None
    if isinstance(node, ast.Subscript) and ast.unparse(node.value) in {
        "os.environ",
        "environ",
    }:
        return node.slice
    return None


def backend_reads(app_dir: Path = APP_DIR) -> tuple[dict[str, list[str]], list[str]]:
    """({ENV NAME: [files]}, [files that read a name only known at runtime])."""
    literal: dict[str, set[str]] = defaultdict(set)
    dynamic: set[str] = set()
    for path in sorted(app_dir.rglob("*.py")):
        rel = path.relative_to(app_dir).as_posix()
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            arg = _env_read(node)
            if arg is None:
                continue
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                literal[arg.value].add(rel)
            else:
                dynamic.add(rel)
    return {k: sorted(v) for k, v in sorted(literal.items())}, sorted(dynamic)


# --- 3. frontend process.env reads -------------------------------------------


def _is_tooling(rel: Path) -> bool:
    return bool(set(rel.parts[:-1]) & _TOOLING_DIRS) or bool(
        _TOOLING_NAME.search(rel.name)
    )


def frontend_reads(
    frontend_dir: Path = FRONTEND_DIR,
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """({NAME: [files]} for site code, the same for tests and tooling)."""
    site: dict[str, set[str]] = defaultdict(set)
    tooling: dict[str, set[str]] = defaultdict(set)
    for path in sorted(frontend_dir.rglob("*")):
        rel = path.relative_to(frontend_dir)
        if (
            path.suffix not in _FRONTEND_SUFFIXES
            or set(rel.parts) & _FRONTEND_SKIP_DIRS
            or not path.is_file()
        ):
            continue
        bucket = tooling if _is_tooling(rel) else site
        for line in path.read_text(encoding="utf-8").splitlines():
            if _COMMENT_LINE.match(line):
                continue
            for m in _PROCESS_ENV.finditer(line):
                bucket[m.group(1) or m.group(2)].add(rel.as_posix())
    return (
        {k: sorted(v) for k, v in sorted(site.items())},
        {k: sorted(v) for k, v in sorted(tooling.items())},
    )


# --- render ------------------------------------------------------------------


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ") or "—"


def _files(files: list[str]) -> str:
    shown = ", ".join(f"`{f}`" for f in files[:_MAX_FILES_SHOWN])
    extra = len(files) - _MAX_FILES_SHOWN
    return shown + (f" +{extra}" if extra > 0 else "")


def _table(header: tuple[str, ...], rows: list[tuple[str, ...]]) -> list[str]:
    if not rows:
        return [NONE]
    out = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    out += ["| " + " | ".join(_cell(c) for c in row) + " |" for row in rows]
    return out


def render(
    settings: list[tuple[str, ...]],
    literal: dict[str, list[str]],
    dynamic: list[str],
    site: dict[str, list[str]],
    tooling: dict[str, list[str]],
) -> str:
    def names(d: dict[str, list[str]]) -> list[tuple[str, ...]]:
        return [(f"`{k}`", _files(v)) for k, v in d.items()]

    parts = [
        f"{len(settings)} Settings fields · {len(literal)} direct backend reads · "
        f"{len(site)} frontend (site) · {len(tooling)} frontend (tests and tooling).",
        "",
        "### שרת: שדות `Settings` (`backend/app/config.py`)",
        "",
        *_table(
            ("משתנה", "טיפוס", "ברירת מחדל", "ההערה שמעל השדה"),
            [(f"`{n}`", f"`{t}`", d, c) for n, t, d, c in settings],
        ),
        "",
        "### שרת: קריאה ישירה מהסביבה (`os.getenv` / `os.environ`)",
        "",
        *_table(("משתנה", "קבצים (`backend/app/`)"), names(literal)),
        "",
        "קבצים שקוראים שם שנקבע רק בזמן ריצה: "
        + (_files(dynamic) if dynamic else NONE),
        "",
        "### אתר: `process.env` בקוד שרץ (`frontend/`)",
        "",
        *_table(("משתנה", "קבצים (`frontend/`)"), names(site)),
        "",
        "### אתר: `process.env` בבדיקות ובכלים (`e2e/`, `__tests__/`, `scripts/`, `qa-*`, קובצי config)",
        "",
        *_table(("משתנה", "קבצים (`frontend/`)"), names(tooling)),
    ]
    return "\n".join(parts)


def build() -> str:
    literal, dynamic = backend_reads()
    site, tooling = frontend_reads()
    return render(settings_rows(), literal, dynamic, site, tooling)


def _doc_block() -> str:
    text = DOC.read_text(encoding="utf-8")
    assert BEGIN in text and END in text, f"{DOC} lost its generated-block markers"
    return text.split(BEGIN, 1)[1].split(END, 1)[0].strip()


# --- tests -------------------------------------------------------------------


def test_scanners_see_what_they_claim_to_see(tmp_path: Path) -> None:
    """Self-test first (testing.md MEH-1619): a dead scanner would also print
    an empty, matching map."""
    app = tmp_path / "app"
    app.mkdir()
    (app / "config.py").write_text(
        "class Settings:\n"
        "    # What the key is for. A second sentence.\n"
        "    secret_thing: str = ''\n"
        "    with_default: int = 15\n",
        encoding="utf-8",
    )
    (app / "reads.py").write_text(
        "import os\n"
        "a = os.getenv('ALPHA')\n"
        "b = os.environ['BETA']\n"
        "c = os.environ.get('GAMMA', '1')\n"
        "def f(name):\n"
        "    return os.getenv(name)\n",
        encoding="utf-8",
    )
    front = tmp_path / "frontend"
    (front / "lib").mkdir(parents=True)
    (front / "e2e").mkdir()
    (front / "node_modules" / "x").mkdir(parents=True)
    (front / "lib" / "api.js").write_text(
        "const u = process.env.NEXT_PUBLIC_API_URL; const v = process.env['OTHER'];",
        encoding="utf-8",
    )
    (front / "e2e" / "a.spec.ts").write_text("process.env.TEST_URL", encoding="utf-8")
    (front / "qa-probe.mjs").write_text(
        "// process.env.ONLY_IN_A_COMMENT\nconst b = process.env.QA_BASE_URL;",
        encoding="utf-8",
    )
    (front / "node_modules" / "x" / "i.js").write_text(
        "process.env.VENDORED", encoding="utf-8"
    )

    assert settings_rows(app / "config.py") == [
        ("SECRET_THING", "str", "ריק", "What the key is for."),
        ("WITH_DEFAULT", "int", "יש", ""),
    ]
    literal, dynamic = backend_reads(app)
    assert literal == {
        "ALPHA": ["reads.py"],
        "BETA": ["reads.py"],
        "GAMMA": ["reads.py"],
    }
    assert dynamic == ["reads.py"]
    site, tooling = frontend_reads(front)
    assert site == {"NEXT_PUBLIC_API_URL": ["lib/api.js"], "OTHER": ["lib/api.js"]}
    assert tooling == {
        "QA_BASE_URL": ["qa-probe.mjs"],
        "TEST_URL": ["e2e/a.spec.ts"],
    }


def test_scanners_are_anchored_on_the_real_tree() -> None:
    names = {row[0] for row in settings_rows()}
    assert "DATABASE_URL" in names
    assert "RESEND_API_KEY" in names
    literal, _dynamic = backend_reads()
    assert "sentry.py" in literal["BACKEND_SENTRY_DSN"]
    site, tooling = frontend_reads()
    assert "NEXT_PUBLIC_API_URL" in site
    # next.config.js runs in the site; a «config» in the name is not tooling.
    assert "next.config.js" in site["BACKEND_URL"]
    assert "playwright.config.ts" in {f for files in tooling.values() for f in files}


def test_the_map_never_prints_a_default_value() -> None:
    assert {row[2] for row in settings_rows()} <= {"ריק", "יש"}


def test_an_empty_section_says_so_instead_of_an_empty_table() -> None:
    empty = render([], {}, [], {}, {})
    assert empty.count(NONE) == 5
    assert "|---|" not in empty
    one = render([("A", "str", "ריק", "")], {}, [], {}, {})
    assert one.count(NONE) == 4
    assert "| `A` | `str` | ריק | — |" in one


def test_environment_doc_matches_the_code() -> None:
    generated = build()
    if os.environ.get("UPDATE_ENV_MAP") == "1":
        text = DOC.read_text(encoding="utf-8")
        head, rest = text.split(BEGIN, 1)
        tail = rest.split(END, 1)[1]
        DOC.write_text(f"{head}{BEGIN}\n\n{generated}\n\n{END}{tail}", encoding="utf-8")
    assert _doc_block() == generated, (
        "docs/ENVIRONMENT.md is out of date: an environment variable was added, "
        f"removed or moved. Regenerate with:\n  {REGENERATE}\n"
        "then read the new row and list the variable for Sapir (regression rule 8)."
    )
