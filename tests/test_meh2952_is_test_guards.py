"""MEH-2952 — three guards around `is_test` (Sapir's conditions, 11/11).

1. **include_test allowlist.** `is_business(include_test=True)` /
   `is_business_row(..., include_test=True)` keep test rows. Only the files in
   `INCLUDE_TEST_ALLOWED` may pass anything but a literal `False`; chunk 1
   allows none. Chunk 3 adds by-slug (routers/producers.py), chunk 4 the
   business's own dashboard and the admin screens.
2. **No writer before chunk 4.** Nothing outside `tests/` writes `is_test`:
   no attribute assignment, no `is_test=` keyword, no `"is_test"` dict key,
   no SQL `SET/INSERT … is_test` — in backend/app, backend/scripts, the
   alembic revisions (except the one that adds the column), the repo-level
   scripts, and the whole frontend (e2e seeds included: a key or an
   assignment, not a prose mention). Chunk 4 adds the
   seed script and the admin toggle to `WRITERS_ALLOWED`, and only after
   chunks 1–3 are on staging (dependency recorded on MEH-2952).
3. **Never in a response.** No Pydantic model under backend/app declares a
   field named `is_test`, so no response can carry it. (A dict key in a
   route is already caught by guard 2.) The business page learns `noindex`
   instead (chunk 3).

Each classifier has a self-test that runs the REAL function on synthetic
source, plus one case anchored to a real repo file (testing.md, MEH-1909).
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
BACKEND = REPO / "backend"
REVISION = "b8cb5480552f"

# ── guard 1 · include_test allowlist ───────────────────────────────────────

#: Repo-relative paths allowed to pass include_test=<anything but False>.
#: Chunk 1: none. Chunk 3: backend/app/routers/producers.py (by-slug only).
#: Chunk 4: the owner dashboard and admin screens.
INCLUDE_TEST_ALLOWED: frozenset[str] = frozenset()

_PREDICATES = {"is_business", "is_business_row"}


def _predicate_names(tree: ast.AST) -> set[str]:
    """The predicate names plus any local alias (`import is_business as x`)."""
    names = set(_PREDICATES)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name in _PREDICATES and alias.asname:
                    names.add(alias.asname)
    return names


def _callee(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    return getattr(node, "attr", None)


def include_test_calls(source: str) -> list[int]:
    """Line numbers of calls that may keep test rows.

    A call to is_business / is_business_row (bare, attribute, or an import
    alias) counts when it passes `include_test=` with anything other than the
    literal False, or passes `**kwargs` (which could carry it). So does
    `partial(<predicate>, include_test=...)`.
    """
    tree = ast.parse(source)
    preds = _predicate_names(tree)
    hits: list[int] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = _callee(node.func)
        if name == "partial" and node.args and _callee(node.args[0]) in preds:
            pass  # a partial binds the predicate's keywords: check them below
        elif name not in preds:
            continue
        for kw in node.keywords:
            if kw.arg is None:  # **kwargs
                hits.append(node.lineno)
            elif kw.arg == "include_test" and not (
                isinstance(kw.value, ast.Constant) and kw.value.value is False
            ):
                hits.append(node.lineno)
    return hits


_SKIP_DIRS = {"__pycache__", ".venv", "node_modules", ".next", "worktrees"}


def _py_files(*roots: Path):
    for root in roots:
        for path in sorted(root.rglob("*.py")):
            if _SKIP_DIRS.intersection(path.parts):
                continue
            yield path


def _rel(path: Path) -> str:
    return path.relative_to(REPO).as_posix()


class TestIncludeTestAllowlist:
    def test_classifier_self_test(self):
        assert include_test_calls("is_business()") == []
        assert include_test_calls("x.filter(is_business(include_test=False))") == []
        assert include_test_calls("is_business(include_test=True)") == [1]
        assert include_test_calls("pl.is_business(include_test=flag)") == [1]
        assert include_test_calls("is_business_row(p, include_test=True)") == [1]
        assert include_test_calls("is_business(**opts)") == [1]
        assert include_test_calls("other(include_test=True)") == []
        aliased = "from app.services.producer_listing import is_business as live\nlive(include_test=True)"
        assert include_test_calls(aliased) == [2]
        assert include_test_calls("partial(is_business, include_test=True)") == [1]
        assert include_test_calls("partial(is_business)") == []
        # anchored to a real file: producer_listing defines the predicate and
        # uses `include_test` only as a parameter, never as a True call.
        real = (BACKEND / "app/services/producer_listing.py").read_text("utf-8")
        assert "def is_business(*, include_test" in real
        assert include_test_calls(real) == []

    def test_classifier_sees_real_callers(self):
        """Control: the scan really walks the tree — it finds the callers
        that exist today (all with the default)."""
        callers = [
            _rel(p)
            for p in _py_files(BACKEND / "app")
            if re.search(r"\bis_business(_row)?\(", p.read_text("utf-8"))
        ]
        assert "backend/app/routers/producers.py" in callers
        assert len(callers) >= 15, callers

    def test_only_allowlisted_files_keep_test_rows(self):
        offenders = {}
        for path in _py_files(BACKEND / "app", BACKEND / "scripts"):
            rel = _rel(path)
            lines = include_test_calls(path.read_text("utf-8"))
            if lines and rel not in INCLUDE_TEST_ALLOWED:
                offenders[rel] = lines
        assert offenders == {}, (
            "is_business(include_test=...) keeps seeded test rows on a public "
            f"surface. Allowed only in {sorted(INCLUDE_TEST_ALLOWED)} "
            f"(MEH-2952). Offenders: {offenders}"
        )


# ── guard 1b · hand-written "approved" checks are an inventory ──────────────

#: Every file that checks a producer's `status == "approved"` by hand instead
#: of through is_business() / is_business_row() / is_live_owner_row(), with
#: how many such checks it holds and why a test row is safe there. A NEW
#: hand-written check (or a new file) goes red: use the rule, or add the
#: site here with its reason. Counted 11/11/2026.
INLINE_APPROVED_CHECKS: dict[str, tuple[int, str]] = {
    "backend/app/services/producer_listing.py": (3, "the rule itself"),
    "backend/app/routers/events.py": (
        2,
        "feed + upcoming; both add not_test_producer()",
    ),
    "backend/app/routers/organizers.py": (1, "adds not_test_producer()"),
    "backend/app/routers/saved_items.py": (1, "saved events; adds not_test_producer()"),
    "backend/app/routers/rescue.py": (
        2,
        "public list adds not_test_producer(); :361 is the owner's publish gate",
    ),
    "backend/app/routers/admin.py": (3, "admin screens and state transitions"),
    "backend/app/routers/admin_kashrut.py": (2, "admin screens"),
    "backend/app/routers/producer_me.py": (2, "the owner's own dashboard"),
    "backend/app/routers/group_buys.py": (1, "the owner opening a group buy"),
    "backend/app/routers/producers.py": (
        1,
        "kashrut certs: a resource of the page itself, reopened in chunk 3",
    ),
    "backend/app/routers/reviews.py": (
        1,
        "POST review: a resource of the page itself, chunk 3",
    ),
    "backend/app/services/onboarding_followup.py": (
        1,
        "owner emails: the send layer, chunk 2",
    ),
}

_INLINE_APPROVED = re.compile(
    r"\b(?:Producer|producer|p|owner_producer|biz|business)\.status\s*(?:==|!=)\s*[\"']approved[\"']"
)


def inline_approved_checks(source: str) -> int:
    """Hand-written producer-approved checks, comments excluded."""
    return sum(
        1
        for line in source.splitlines()
        if not line.lstrip().startswith("#") and _INLINE_APPROVED.search(line)
    )


class TestInlineApprovedChecks:
    def test_classifier_self_test(self):
        assert inline_approved_checks('q.filter(Producer.status == "approved")') == 1
        assert inline_approved_checks("if producer.status != 'approved':") == 1
        assert inline_approved_checks('# producer.status == "approved"') == 0
        assert inline_approved_checks('ex.status == "approved"') == 0
        real = (BACKEND / "app/routers/organizers.py").read_text("utf-8")
        assert inline_approved_checks(real) == 1

    def test_inventory_matches_the_code(self):
        found = {}
        for path in _py_files(BACKEND / "app"):
            n = inline_approved_checks(path.read_text("utf-8"))
            if n:
                found[_rel(path)] = n
        expected = {k: v[0] for k, v in INLINE_APPROVED_CHECKS.items()}
        assert found == expected, (
            "A hand-written producer `status == 'approved'` check appeared or "
            "moved. A public reader must go through is_business() / "
            "not_test_producer() / is_live_owner_row() so a seeded test row "
            "stays hidden (MEH-2952); a non-public one is added to "
            f"INLINE_APPROVED_CHECKS with its reason. found={found}"
        )


# ── guard 2 · no writer before chunk 4 ─────────────────────────────────────

#: Repo-relative paths allowed to write is_test. Chunk 4 adds the seed script
#: and the admin toggle — not before chunks 1–3 are on staging.
WRITERS_ALLOWED: frozenset[str] = frozenset()

#: Where the column is DECLARED, which is not a write.
_DECLARATIONS = {"backend/app/models/models.py"}

_SQL_WRITE = re.compile(
    r"\b(?:SET|INSERT\s+INTO|UPDATE)\b[^;]*\bis_test\b", re.IGNORECASE | re.DOTALL
)


def is_test_writes(source: str, *, declares_column: bool = False) -> list[int]:
    """Line numbers that write `is_test` in Python source."""
    hits: list[int] = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.ClassDef) and not declares_column:
            # a class-level `is_test = Column(...)` declares a column
            for stmt in node.body:
                if isinstance(stmt, (ast.Assign, ast.AnnAssign)):
                    targets = (
                        stmt.targets if isinstance(stmt, ast.Assign) else [stmt.target]
                    )
                    if any(
                        isinstance(t, ast.Name) and t.id == "is_test" for t in targets
                    ):
                        hits.append(stmt.lineno)
        if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for t in targets:
                if isinstance(t, ast.Attribute) and t.attr == "is_test":
                    hits.append(node.lineno)
        elif isinstance(node, ast.Call):
            for kw in node.keywords:
                if kw.arg == "is_test":
                    hits.append(node.lineno)
            # setattr(obj, "is_test", ...)
            if (
                isinstance(node.func, ast.Name)
                and node.func.id == "setattr"
                and len(node.args) >= 2
                and isinstance(node.args[1], ast.Constant)
                and node.args[1].value == "is_test"
            ):
                hits.append(node.lineno)
        elif isinstance(node, ast.Dict):
            for key in node.keys:
                if (isinstance(key, ast.Constant) and key.value == "is_test") or (
                    isinstance(key, ast.Attribute) and key.attr == "is_test"
                ):
                    hits.append(node.lineno)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            if _SQL_WRITE.search(node.value):
                hits.append(node.lineno)
    return sorted(set(hits))


_FRONTEND_EXT = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"}
_FRONTEND_SKIP = {
    "node_modules",
    ".next",
    "coverage",
    "playwright-report",
    "test-results",
}


#: A key or an assignment: `is_test: true`, `is_test = x`, `{"is_test": …}`,
#: `["is_test"]`. A prose mention in a comment (`is_test` in backticks) is
#: not one.
_FRONTEND_WRITE = re.compile(r"""\bis_test\s*[:=](?!=)|["']is_test["']""")


def frontend_writes(text: str) -> list[int]:
    """Lines where frontend code (e2e seeds included) sends or sets is_test."""
    return [
        i for i, line in enumerate(text.splitlines(), 1) if _FRONTEND_WRITE.search(line)
    ]


class TestNoWriterBeforeChunk4:
    def test_classifier_self_test(self):
        assert is_test_writes("p.is_test = True") == [1]
        assert is_test_writes("Producer(name='x', is_test=True)") == [1]
        assert is_test_writes("q.update({'is_test': True})") == [1]
        assert is_test_writes("setattr(p, 'is_test', True)") == [1]
        assert is_test_writes("text('UPDATE producers SET is_test = true')") == [1]
        assert is_test_writes("x = 1\np.is_test |= flag") == [2]
        assert is_test_writes("q.update({Producer.is_test: True})") == [1]
        assert is_test_writes("update(P).values({P.__table__.c.is_test: True})") == [1]
        # a read into a local is not a write
        assert is_test_writes("is_test = producer.is_test") == []
        # reads are not writes
        assert is_test_writes("q.filter(Producer.is_test.is_(False))") == []
        assert is_test_writes("if producer.is_test: pass") == []
        assert is_test_writes("text('SELECT 1 WHERE p.is_test IS FALSE')") == []
        # the class-level column declaration is allowed only where declared
        decl = "class P:\n    is_test = Column(Boolean)"
        assert is_test_writes(decl, declares_column=True) == []
        assert is_test_writes(decl) == [2]
        assert frontend_writes("api.post('/x', { is_test: true })") == [1]
        assert frontend_writes('body = {"is_test": true}') == [1]
        assert frontend_writes("p.is_test = true") == [1]
        assert frontend_writes("if (p.is_test === true) {}") == []
        # anchored to a real file: the golden-path session names the column
        # in a comment only — prose, not a write.
        session = (REPO / "frontend/e2e/golden/session.ts").read_text("utf-8")
        assert "before `is_test`" in session
        assert frontend_writes(session) == []
        # anchored to real files: the model declares, the listing reads
        models = (BACKEND / "app/models/models.py").read_text("utf-8")
        assert "is_test = Column(" in models
        assert is_test_writes(models, declares_column=True) == []
        assert is_test_writes(models) != []  # the declaration IS seen
        listing = (BACKEND / "app/services/producer_listing.py").read_text("utf-8")
        assert "Producer.is_test.is_(False)" in listing
        assert is_test_writes(listing) == []

    def test_no_python_writer_outside_tests(self):
        roots = [
            BACKEND / "app",
            BACKEND / "scripts",
            BACKEND / "alembic",
            REPO / "scripts",
            REPO / ".github",  # the post-release smoke lives in .github/scripts
            REPO / ".claude",
            REPO / "frontend",  # e2e helpers written in Python
        ]
        offenders = {}
        scanned = 0
        for path in _py_files(*[r for r in roots if r.exists()]):
            rel = _rel(path)
            if REVISION in path.name or rel in WRITERS_ALLOWED:
                continue
            scanned += 1
            lines = is_test_writes(
                path.read_text("utf-8"), declares_column=rel in _DECLARATIONS
            )
            if lines:
                offenders[rel] = lines
        assert scanned > 100, scanned  # control: the walk found the tree
        assert offenders == {}, (
            "is_test is written outside tests before chunk 4 (MEH-2952: writers "
            f"are the seed script and the admin toggle, chunk 4). {offenders}"
        )

    def test_no_sql_or_shell_writer(self):
        """Seeds also come as .sql / .sh (backend/scripts/*.sql exists)."""
        offenders = {}
        scanned = 0
        for root in (BACKEND, REPO / "scripts", REPO / ".github"):
            for path in sorted(root.rglob("*")):
                if path.suffix not in {".sql", ".sh"} or ".venv" in path.parts:
                    continue
                scanned += 1
                text = path.read_text("utf-8", errors="ignore")
                lines = [
                    i
                    for i, chunk in enumerate(text.split(";"), 1)
                    if _SQL_WRITE.search(chunk)
                ]
                if lines:
                    offenders[_rel(path)] = lines
        assert scanned > 5, scanned
        assert offenders == {}, offenders

    def test_no_frontend_writer(self):
        root = REPO / "frontend"
        offenders = {}
        scanned = 0
        for path in sorted(root.rglob("*")):
            if (
                not path.is_file()
                or path.suffix not in _FRONTEND_EXT
                or _FRONTEND_SKIP.intersection(path.parts)
            ):
                continue
            scanned += 1
            lines = frontend_writes(path.read_text("utf-8", errors="ignore"))
            if lines:
                offenders[_rel(path)] = lines
        assert scanned > 100, scanned
        assert offenders == {}, (
            "The frontend (e2e seeds included) never sends or sets is_test "
            f"before chunk 4 (MEH-2952). {offenders}"
        )


# ── guard 3 · never in a response ──────────────────────────────────────────


_ALIAS_KWS = {"alias", "serialization_alias", "validation_alias"}


def schema_fields_named_is_test(source: str) -> list[int]:
    """Ways a model could serialize a key named is_test: an annotated field,
    a method (`@computed_field def is_test`), or a Field/alias keyword whose
    value is "is_test"."""
    hits = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.ClassDef):
            for stmt in node.body:
                if (
                    isinstance(stmt, ast.AnnAssign)
                    and isinstance(stmt.target, ast.Name)
                    and stmt.target.id == "is_test"
                ) or (
                    isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and stmt.name == "is_test"
                ):
                    hits.append(stmt.lineno)
        elif isinstance(node, ast.Call):
            for kw in node.keywords:
                if (
                    kw.arg in _ALIAS_KWS
                    and isinstance(kw.value, ast.Constant)
                    and kw.value.value == "is_test"
                ):
                    hits.append(node.lineno)
    return sorted(set(hits))


class TestNeverInAResponse:
    def test_classifier_self_test(self):
        assert schema_fields_named_is_test(
            "class A(BaseModel):\n    is_test: bool"
        ) == [2]
        assert (
            schema_fields_named_is_test("class A(BaseModel):\n    noindex: bool") == []
        )
        computed = "class A(BaseModel):\n    @computed_field\n    def is_test(self) -> bool:\n        return True"
        assert schema_fields_named_is_test(computed) == [3]
        aliased = (
            "class A(BaseModel):\n    x: bool = Field(serialization_alias='is_test')"
        )
        assert schema_fields_named_is_test(aliased) == [2]
        real = (BACKEND / "app/schemas/schemas.py").read_text("utf-8")
        assert "class ProducerDetailOut(" in real
        assert schema_fields_named_is_test(real) == []

    def test_no_schema_declares_is_test(self):
        offenders = {}
        for path in _py_files(BACKEND / "app"):
            lines = schema_fields_named_is_test(path.read_text("utf-8"))
            if lines:
                offenders[_rel(path)] = lines
        assert offenders == {}, offenders

    @pytest.mark.parametrize(
        "schema",
        [
            "ProducerListOut",
            "ProducerDetailOut",
            "ProducerAdminOut",
            "ProducerOwnerOut",
            "UserOut",
        ],
    )
    def test_serialized_models_carry_no_is_test(self, schema):
        """Behaviour, not text: the model's own field set (incl. inherited)."""
        from app.schemas import schemas

        model = getattr(schemas, schema, None)
        assert model is not None, f"{schema} renamed? update this list"
        assert "is_test" not in model.model_fields
