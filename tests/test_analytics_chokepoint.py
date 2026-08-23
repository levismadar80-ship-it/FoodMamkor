"""MEH-2160 — every analytics row is written in exactly one place.

Three consecutive tickets were the same defect wearing different clothes: a
correct exclusion rule enforced at the site where its bug was found, and
never propagated. Nothing in the system stopped the next writer from calling
`db.add(ProducerPageView(...))` directly and inheriting none of them.

This file is that stop. It fails when any of the three producer-analytics
models is instantiated-and-added outside `services/analytics.py`, and its
message says what to do instead.

── Why `ast` and not a regex ─────────────────────────────────────────────
The ticket prescribed AST, and Phase 0 proved why in the sharpest possible
way: its OWN discovery grep,

    grep -rn "db.add(ProducerPageView\\|db.add(ProducerWhatsAppClick\\|..."

returned **zero** matches against a tree that had exactly **three** write
sites. All three were invisible to a line-oriented regex:

    producers.py:540   db.add(\\n    ProducerWhatsAppClick(...   <- line split
    producers.py:585   db.add(\\n    ContactClick(...            <- line split
    analytics.py:284   row = ProducerPageView(...); db.add(row)  <- via a name

A regex would also have counted the model names inside this very docstring.
Both failure directions — false negative and false positive — are why the
scan below walks the tree.

── The AnnAssign trap, which cost a real ticket ──────────────────────────
`ast.Assign` and `ast.AnnAssign` are different nodes. A scanner that handles
only the former misses `row: object = ProducerPageView(...)` — which is the
exact shape the choke point uses. This repo has a precedent on record: an
`ast` probe passed four synthetic fixtures and then reported `revision =
None` for all 14 real migration files, because every fixture used the plain
form while every real file used the annotated one. `_assigned_model()` below
handles both, and `test_annassign_form_is_detected` pins it.
"""

import ast
import pathlib

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
BACKEND_APP = REPO_ROOT / "backend" / "app"

#: The models this choke point owns. `HomeProductWhatsAppClick` is
#: deliberately absent — it belongs to the home-products subsystem, which is
#: being decommissioned under its own ticket, and pulling it in here would
#: red a file this refactor never touched.
GUARDED_MODELS = frozenset(
    {"ProducerPageView", "ProducerWhatsAppClick", "ContactClick"}
)

#: The one file allowed to write them.
CHOKE_POINT = BACKEND_APP / "services" / "analytics.py"

_FIX = (
    "Analytics rows are written in exactly one place: "
    "record_analytics_event() in backend/app/services/analytics.py.\n"
    "Call it instead of db.add(...):\n\n"
    "    record_analytics_event(\n"
    '        db, event="whatsapp_click", producer_id=producer_id,\n'
    "        ctx=EventContext(request=request, viewer=current_user),\n"
    "    )\n\n"
    "It owns the bot filter, the owner/admin skip, the trusted-proxy IP "
    "hash, the referrer allowlist and the fail-open write — in that order. "
    "A direct db.add() inherits NONE of them, which is the bug this guard "
    "exists to prevent (MEH-2160)."
)


def _assigned_models(tree: ast.AST, name: str) -> set[str]:
    """Every guarded model `name` is assigned from, anywhere in the tree.

    Returns a SET, not one model, and that is load-bearing rather than
    tidiness. The choke point assigns `row` in three sibling branches — one
    per event type — and a function returning the first match reports
    whichever branch `ast.walk` happens to reach first. The real file then
    looks like it writes ONE model, and the "all three are written here"
    assertion fails for a reason that has nothing to do with the code under
    test. Caught by `test_scanner_finds_the_real_choke_point`, which is what
    anchoring a self-test to a committed file buys.

    Handles BOTH assignment nodes — see the AnnAssign note in the module
    docstring. Missing the annotated form is not hypothetical here: the
    choke point itself writes `row: object = ProducerPageView(...)`.
    """
    found: set[str] = set()
    for node in ast.walk(tree):
        values = []
        if isinstance(node, ast.Assign):
            if any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
                values.append(node.value)
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == name:
                values.append(node.value)
        for value in values:
            if (
                isinstance(value, ast.Call)
                and isinstance(value.func, ast.Name)
                and value.func.id in GUARDED_MODELS
            ):
                found.add(value.func.id)
    return found


def find_analytics_writes(source: str, filename: str = "<src>") -> list[tuple[int, str]]:
    """Every `<session>.add(...)` of a guarded model in `source`.

    Returns (lineno, model) pairs. Detects both the direct form
    `db.add(Model(...))` and the indirect `x = Model(...); db.add(x)`.
    """
    tree = ast.parse(source, filename=filename)
    out: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "add"
        ):
            continue
        for arg in node.args:
            if (
                isinstance(arg, ast.Call)
                and isinstance(arg.func, ast.Name)
                and arg.func.id in GUARDED_MODELS
            ):
                out.append((node.lineno, arg.func.id))
            elif isinstance(arg, ast.Name):
                for model in _assigned_models(tree, arg.id):
                    out.append((node.lineno, model))
    return sorted(set(out))


# ============================================================
# Self-test — run FIRST. If the scanner cannot tell a violation from clean
# code, nothing it reports afterwards is worth reading.
# ============================================================


class TestScannerDiscriminates:
    def test_direct_form_is_detected(self):
        found = find_analytics_writes(
            "def f(db):\n    db.add(ProducerPageView(producer_id=1))\n"
        )
        assert found == [(2, "ProducerPageView")]

    def test_multiline_form_is_detected(self):
        """The shape the card's own grep missed on all three real sites."""
        found = find_analytics_writes(
            "def f(db):\n"
            "    db.add(\n"
            "        ProducerWhatsAppClick(\n"
            "            producer_id=1,\n"
            "        )\n"
            "    )\n"
        )
        assert found == [(2, "ProducerWhatsAppClick")]

    def test_via_variable_form_is_detected(self):
        found = find_analytics_writes(
            "def f(db):\n    row = ContactClick(producer_id=1)\n    db.add(row)\n"
        )
        assert found == [(3, "ContactClick")]

    def test_annassign_form_is_detected(self):
        """`row: object = Model(...)` is ast.AnnAssign, not ast.Assign.

        The choke point uses exactly this form. A scanner handling only
        ast.Assign returns clean here — green against the very file it is
        supposed to be watching.
        """
        found = find_analytics_writes(
            "def f(db):\n"
            "    row: object = ProducerPageView(producer_id=1)\n"
            "    db.add(row)\n"
        )
        assert found == [(3, "ProducerPageView")]

    def test_model_name_in_a_comment_is_not_a_violation(self):
        """A regex would flag this. The tree does not."""
        found = find_analytics_writes(
            "def f(db):\n"
            "    # never write db.add(ProducerPageView(...)) here\n"
            '    s = "db.add(ContactClick(...))"\n'
            "    return s\n"
        )
        assert found == []

    def test_out_of_scope_model_is_not_flagged(self):
        """HomeProductWhatsAppClick belongs to another subsystem."""
        found = find_analytics_writes(
            "def f(db):\n    db.add(HomeProductWhatsAppClick(user_id=1))\n"
        )
        assert found == []

    def test_a_read_is_not_a_write(self):
        found = find_analytics_writes(
            "def f(db):\n    return db.query(ProducerPageView).count()\n"
        )
        assert found == []

    def test_scanner_finds_the_real_choke_point(self):
        """Anchored to a committed file, not only synthetic fixtures.

        Synthetic cases prove the probe works on shapes I invented. This one
        proves it recognises the shape the repo actually uses — the gap that
        let an ast probe report None for all 14 real migrations while passing
        four fixtures.
        """
        found = find_analytics_writes(
            CHOKE_POINT.read_text(encoding="utf-8"), str(CHOKE_POINT)
        )
        assert found, (
            "the scanner found no analytics write inside the choke point "
            "itself — it is not seeing the shape this repo uses, so every "
            "'clean' result below is void"
        )
        assert {m for _, m in found} == GUARDED_MODELS, (
            f"expected the choke point to write all of {sorted(GUARDED_MODELS)}, "
            f"found {sorted({m for _, m in found})}"
        )


# ============================================================
# The enforcement itself
# ============================================================


def _backend_py_files() -> list[pathlib.Path]:
    return [
        f
        for f in sorted(BACKEND_APP.rglob("*.py"))
        if "__pycache__" not in f.parts
    ]


class TestChokePointIsEnforced:
    def test_backend_files_scanned_is_not_zero(self):
        """Control. A glob that matches nothing reports the same clean result
        as a codebase with no violations."""
        files = _backend_py_files()
        assert len(files) > 50, (
            f"only {len(files)} backend files found — the glob is broken, and "
            "a clean result from it means nothing"
        )

    @pytest.mark.parametrize("path", _backend_py_files(), ids=lambda p: p.name)
    def test_no_analytics_write_outside_the_choke_point(self, path):
        if path.resolve() == CHOKE_POINT.resolve():
            pytest.skip("this IS the choke point")
        writes = find_analytics_writes(
            path.read_text(encoding="utf-8"), str(path)
        )
        assert not writes, (
            f"\n{path.relative_to(REPO_ROOT)} writes an analytics row "
            f"directly at line(s) {[ln for ln, _ in writes]}: "
            f"{sorted({m for _, m in writes})}\n\n{_FIX}"
        )

    def test_the_choke_point_writes_all_three(self):
        """The other direction: the one allowed writer must actually write.

        Without this, deleting the writes from analytics.py would leave the
        suite fully green — every file clean, nothing recording anything.
        """
        writes = find_analytics_writes(
            CHOKE_POINT.read_text(encoding="utf-8"), str(CHOKE_POINT)
        )
        assert {m for _, m in writes} == GUARDED_MODELS
