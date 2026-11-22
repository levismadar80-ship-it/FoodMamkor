"""MEH-3599 — docs/JOBS.md is the map of scheduled jobs, made from code.

Two sources:
  1. every `<scheduler>.add_job(...)` call in backend/app (APScheduler, in the
     server process): the function, its trigger, its id, the condition it is
     registered under and its Sentry heartbeat slug;
  2. every `- cron:` line under `.github/workflows/` (read only, never written).

A job added, removed or rescheduled without regenerating the map goes red
here, with the command below.

Regenerate:  UPDATE_JOBS_MAP=1 pytest tests/test_meh3599_jobs_map.py
Source-text by nature (it documents the code, testing.md MEH-3531): the
scheduler is not started and no job runs.
"""

from __future__ import annotations

import ast
import os
import re
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOC = REPO / "docs" / "JOBS.md"
BEGIN = "<!-- BEGIN GENERATED: jobs-map (tests/test_meh3599_jobs_map.py) -->"
END = "<!-- END GENERATED -->"
ALWAYS = "תמיד"
NONE = "—"


@dataclass(frozen=True)
class ServerJob:
    job_id: str
    func: str
    schedule: str
    condition: str
    heartbeat: str
    where: str
    about: str


@dataclass(frozen=True)
class WorkflowCron:
    file: str
    workflow: str
    cron: str
    note: str


# ── constants: a NAME in a trigger is looked up where it is defined ──────────


def _module_constants(tree: ast.Module) -> dict[str, object]:
    out: dict[str, object] = {}
    for node in tree.body:
        target = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target, value = node.targets[0], node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            target, value = node.target, node.value
        if isinstance(target, ast.Name) and isinstance(value, ast.Constant):
            out[target.id] = value.value
    return out


def _imported_from(tree: ast.Module) -> dict[str, str]:
    """name → dotted module, for every `from app.x import name` in the file
    (function-level imports included: the registrars import lazily)."""
    out: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("app"):
            for alias in node.names:
                out[alias.asname or alias.name] = node.module or ""
    return out


class _Resolver:
    def __init__(self, backend_root: Path, tree: ast.Module) -> None:
        self._root = backend_root
        self._local = _module_constants(tree)
        self._imports = _imported_from(tree)
        self._cache: dict[str, dict[str, object]] = {}

    def _foreign(self, module: str) -> dict[str, object]:
        if module not in self._cache:
            path = self._root.joinpath(*module.split(".")).with_suffix(".py")
            self._cache[module] = (
                _module_constants(ast.parse(path.read_text(encoding="utf-8")))
                if path.is_file()
                else {}
            )
        return self._cache[module]

    def value(self, node: ast.expr | None) -> str:
        """The literal behind an expression, or its source text in backticks
        when it is not a plain constant (so the map never guesses)."""
        if node is None:
            return NONE
        if isinstance(node, ast.Constant):
            return str(node.value)
        if isinstance(node, ast.Name):
            if node.id in self._local:
                return str(self._local[node.id])
            module = self._imports.get(node.id)
            if module and node.id in self._foreign(module):
                return str(self._foreign(module)[node.id])
        return f"`{ast.unparse(node)}`"


# ── server jobs ─────────────────────────────────────────────────────────────


def _kw(call: ast.Call, name: str) -> ast.expr | None:
    return next((k.value for k in call.keywords if k.arg == name), None)


def _schedule(trigger: ast.expr | None, res: _Resolver) -> str:
    if not isinstance(trigger, ast.Call):
        return f"`{ast.unparse(trigger)}`" if trigger is not None else NONE
    name = ast.unparse(trigger.func)
    if name == "CronTrigger.from_crontab":
        cron = res.value(trigger.args[0] if trigger.args else None)
        return f"cron `{cron}` ({res.value(_kw(trigger, 'timezone'))})"
    if name == "IntervalTrigger":
        parts = [f"{res.value(k.value)} {k.arg}" for k in trigger.keywords]
        return "כל " + ", ".join(parts)
    if name == "DateTrigger":
        return "פעם אחת, אחרי עליית השרת"
    return f"`{ast.unparse(trigger)}`"


def _first_sentence(doc: str | None) -> str:
    if not doc:
        return NONE
    # Backticks are dropped (a cut inside a code span would leave one open
    # and break the table row); `..` is a range, not a sentence end.
    text = " ".join(doc.replace("`", "").split())
    cut = re.search(r"(?<=[^.][.!?])\s", text)
    return (text[: cut.start()] if cut else text).replace("|", "/")


def _returns_early(node: ast.If) -> bool:
    return any(isinstance(s, ast.Return) for s in node.body)


def _origins(tree: ast.Module) -> dict[str, str]:
    """local name → `module.original_name` for names imported from the app."""
    out: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("app"):
            for alias in node.names:
                out[alias.asname or alias.name] = f"{node.module}.{alias.name}"
    return out


def _with_origin(test: ast.expr, text: str, origins: dict[str, str]) -> str:
    seen = sorted(
        {origins[n.id] for n in ast.walk(test) if isinstance(n, ast.Name) and n.id in origins}
    )
    return f"`{text}`" + (f" ({', '.join(seen)})" if seen else "")


def _condition(
    call: ast.Call, func: ast.FunctionDef, parents: dict, origins: dict[str, str]
) -> str:
    """Why this add_job might not run: the `if` it sits inside, and every
    `if …: return` that comes before it in the registering function."""
    found: list[str] = []
    node: ast.AST = call
    while node is not func:
        parent = parents[node]
        if isinstance(parent, ast.If):
            test = ast.unparse(parent.test)
            text = test if node in parent.body else f"not ({test})"
            found.append(_with_origin(parent.test, text, origins))
        node = parent
    guards: list[str] = []
    for stmt in func.body:
        if stmt.lineno >= call.lineno:
            break
        if isinstance(stmt, ast.If) and _returns_early(stmt):
            t = stmt.test
            negated = isinstance(t, ast.UnaryOp) and isinstance(t.op, ast.Not)
            text = ast.unparse(t.operand) if negated else f"not ({ast.unparse(t)})"
            guards.append(_with_origin(t, text, origins))
    return " and ".join([*guards, *reversed(found)]) if found or guards else ALWAYS


def _heartbeat_slug(fn: ast.FunctionDef | None) -> str:
    for dec in fn.decorator_list if fn else []:
        if (
            isinstance(dec, ast.Call)
            and ast.unparse(dec.func) == "heartbeat"
            and dec.args
            and isinstance(dec.args[0], ast.Constant)
        ):
            return str(dec.args[0].value)
    return NONE


def _enclosing_function(node: ast.AST, parents: dict) -> ast.FunctionDef | None:
    while node in parents:
        node = parents[node]
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return node  # type: ignore[return-value]
    return None


def server_jobs(backend_root: Path) -> list[ServerJob]:
    jobs: list[ServerJob] = []
    for path in sorted((backend_root / "app").rglob("*.py")):
        source = path.read_text(encoding="utf-8")
        if ".add_job(" not in source:
            continue
        tree = ast.parse(source)
        parents = {c: p for p in ast.walk(tree) for c in ast.iter_child_nodes(p)}
        defs = {
            n.name: n
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        res = _Resolver(backend_root, tree)
        origins = _origins(tree)
        rel = path.relative_to(backend_root.parent).as_posix()
        for call in ast.walk(tree):
            if not (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Attribute)
                and call.func.attr == "add_job"
            ):
                continue
            target = call.args[0] if call.args else None
            func_name = ast.unparse(target) if target is not None else NONE
            trigger = call.args[1] if len(call.args) > 1 else _kw(call, "trigger")
            registrar = _enclosing_function(call, parents)
            job_fn = defs.get(func_name)
            about = _first_sentence(ast.get_docstring(job_fn) if job_fn else None)
            if about == NONE and registrar is not None:
                about = _first_sentence(ast.get_docstring(registrar))
            jobs.append(
                ServerJob(
                    job_id=res.value(_kw(call, "id")),
                    func=func_name,
                    schedule=_schedule(trigger, res),
                    condition=(
                        _condition(call, registrar, parents, origins) if registrar else ALWAYS
                    ),
                    heartbeat=_heartbeat_slug(job_fn),
                    where=f"{rel} · {registrar.name if registrar else 'module'}",
                    about=about,
                )
            )
    return sorted(jobs, key=lambda j: (j.job_id, j.func))


# ── GitHub Actions crons ────────────────────────────────────────────────────

_CRON_LINE = re.compile(
    r"""^\s*-\s*cron:\s*(?:(['"])(?P<cron>[^'"]+)\1|(?P<bare>[^#'"]+?))\s*(?:#\s*(?P<note>.*))?$"""
)
_NAME_LINE = re.compile(r"""^name:\s*['"]?(?P<name>.+?)['"]?\s*$""")


def workflow_crons(workflows_dir: Path) -> list[WorkflowCron]:
    out: list[WorkflowCron] = []
    files = sorted([*workflows_dir.glob("*.yml"), *workflows_dir.glob("*.yaml")])
    for path in files:
        name = path.name
        for line in path.read_text(encoding="utf-8").splitlines():
            if (m := _NAME_LINE.match(line)) and name == path.name:
                name = m["name"]
            if m := _CRON_LINE.match(line):
                note = (m["note"] or "").strip().replace("|", "/") or NONE
                out.append(WorkflowCron(path.name, name, m["cron"] or m["bare"], note))
    return out


# ── render ──────────────────────────────────────────────────────────────────


def _table(header: list[str], rows: list[list[str]], empty: str) -> list[str]:
    if not rows:
        return [f"_{empty}_", ""]
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(r) + " |" for r in rows]
    return [*lines, ""]


def render(jobs: list[ServerJob], crons: list[WorkflowCron]) -> str:
    lines = [
        f"{len(jobs)} server jobs · {len(crons)} GitHub Actions schedules.",
        "",
        "### משימות בשרת (APScheduler)",
        "",
        *_table(
            ["id", "פונקציה", "תזמון", "נרשמת רק אם", "Sentry heartbeat", "נרשמת ב", "מה היא עושה"],
            [
                [f"`{j.job_id}`" if not j.job_id.startswith("`") else j.job_id,
                 f"`{j.func}`", j.schedule, j.condition, j.heartbeat, j.where, j.about]
                for j in jobs
            ],
            "אין משימות בשרת.",
        ),
        "### תזמונים ב-GitHub Actions (UTC)",
        "",
        *_table(
            ["קובץ", "workflow", "cron", "הערה בקובץ"],
            [[f"`{c.file}`", c.workflow, f"`{c.cron}`", c.note] for c in crons],
            "אין תזמונים ב-GitHub Actions.",
        ),
    ]
    return "\n".join(lines).rstrip() + "\n"


def build() -> str:
    return render(
        server_jobs(REPO / "backend"), workflow_crons(REPO / ".github" / "workflows")
    )


def _generated_block(text: str) -> str:
    start = text.index(BEGIN) + len(BEGIN)
    return text[start : text.index(END)].strip("\n") + "\n"


# ── tests ───────────────────────────────────────────────────────────────────

_FAKE_CONSTANTS = 'NIGHTLY_CRON = "5 4 * * *"\nNIGHTLY_TZ = "Asia/Jerusalem"\nTICK = 7\n'
_FAKE_STARTUP = '''
from app.services.consts import NIGHTLY_CRON, NIGHTLY_TZ, TICK

LOCAL_ID = "local_id_job"


@heartbeat("nightly-slug", cron_monitor_config(NIGHTLY_CRON))
def _run_nightly():
    """Sends the nightly thing. Second sentence is dropped."""


def _run_tick():
    pass


def _register_gated(scheduler):
    """Gated registrar. More text."""
    if not feature_on():
        return
    scheduler.add_job(_run_tick, IntervalTrigger(minutes=TICK), id=LOCAL_ID)
    if catchup_due(now):
        scheduler.add_job(_run_tick, DateTrigger(run_date=now), id="catchup")


def register(scheduler):
    scheduler.add_job(
        _run_nightly,
        CronTrigger.from_crontab(NIGHTLY_CRON, timezone=NIGHTLY_TZ),
        id="nightly",
    )
    # scheduler.add_job(_run_ghost, IntervalTrigger(minutes=1), id="ghost")
'''


def _fake_backend(tmp_path: Path) -> Path:
    backend = tmp_path / "backend"
    (backend / "app" / "services").mkdir(parents=True)
    (backend / "app" / "services" / "consts.py").write_text(_FAKE_CONSTANTS, encoding="utf-8")
    (backend / "app" / "startup.py").write_text(_FAKE_STARTUP, encoding="utf-8")
    return backend


def test_server_scanner_reads_each_shape_of_registration(tmp_path: Path) -> None:
    jobs = {j.job_id: j for j in server_jobs(_fake_backend(tmp_path))}

    assert sorted(jobs) == ["catchup", "local_id_job", "nightly"]  # no "ghost": a comment is not a job
    nightly = jobs["nightly"]
    assert nightly.schedule == "cron `5 4 * * *` (Asia/Jerusalem)"  # both names resolved across modules
    assert nightly.heartbeat == "nightly-slug"
    assert nightly.condition == ALWAYS
    assert nightly.about == "Sends the nightly thing."
    assert _first_sentence("Rolls `[a + 1 .. b]` up. Next.") == "Rolls [a + 1 .. b] up."
    tick = jobs["local_id_job"]
    assert tick.schedule == "כל 7 minutes"
    assert tick.condition == "`feature_on()`"  # the early return, un-negated
    assert _with_origin(ast.parse("ok()").body[0].value, "ok()", {"ok": "app.x.real_ok"}) == (
        "`ok()` (app.x.real_ok)"
    )
    assert tick.heartbeat == NONE
    assert tick.about == "Gated registrar."  # no docstring on the job: the registrar's
    assert jobs["catchup"].condition == "`feature_on()` and `catchup_due(now)`"
    assert jobs["catchup"].schedule == "פעם אחת, אחרי עליית השרת"


def test_workflow_scanner_skips_commented_schedules(tmp_path: Path) -> None:
    (tmp_path / "a.yml").write_text(
        'name: "Alpha"\non:\n  schedule:\n    - cron: "0 6 * * 0" # Sunday\n'
        "    # - cron: '1 1 1 1 1'\n    - cron: '30 2 * * *'\n    - cron: 5 5 * * 5\njobs:\n  x:\n    name: not the workflow\n",
        encoding="utf-8",
    )
    (tmp_path / "b.yml").write_text("on: push\n", encoding="utf-8")

    assert workflow_crons(tmp_path) == [
        WorkflowCron("a.yml", "Alpha", "0 6 * * 0", "Sunday"),
        WorkflowCron("a.yml", "Alpha", "30 2 * * *", NONE),
        WorkflowCron("a.yml", "Alpha", "5 5 * * 5", NONE),  # unquoted
    ]


def test_scanners_are_anchored_on_the_real_tree() -> None:
    """A scanner that reads nothing prints an empty map and the drift test
    still passes; these are jobs known to exist (checked 21/11/2026)."""
    jobs = {j.job_id: j for j in server_jobs(REPO / "backend")}

    followups = jobs["meh_539_onboarding_followups_daily"]
    assert followups.func == "_run_followup_job"
    assert followups.schedule.startswith("cron `") and followups.schedule.endswith("(UTC)")
    assert followups.heartbeat == "onboarding-followups-daily"
    assert jobs["meh_3296_product_orders"].condition == (
        "`product_orders_enabled()` (app.routers.product_orders.product_orders_enabled)"
    )
    assert "`" not in jobs["meh_3332_job_staleness_check"].schedule  # imported constant resolved
    crons = workflow_crons(REPO / ".github" / "workflows")
    assert ("uptime.yml", "Uptime probe") in {(c.file, c.workflow) for c in crons}


def test_every_real_add_job_call_is_in_the_map() -> None:
    """Counts `add_job` attribute nodes with no `.add_job(` text pre-filter
    and no shape requirements, so a call the scanner skips (a file the
    pre-filter missed, a call it could not read) shows as a difference."""
    counted = 0
    for path in (REPO / "backend" / "app").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        counted += sum(
            isinstance(n, ast.Attribute) and n.attr == "add_job" for n in ast.walk(tree)
        )
    assert counted > 0
    assert len(server_jobs(REPO / "backend")) == counted


def test_every_real_cron_line_is_in_the_map() -> None:
    """A `cron:` written in a shape the parser does not know would vanish
    silently; a plain text count of uncommented `cron:` keys catches it."""
    workflows = REPO / ".github" / "workflows"
    counted = sum(
        bool(re.match(r"^\s*-\s*cron:", line))
        for path in [*workflows.glob("*.yml"), *workflows.glob("*.yaml")]
        for line in path.read_text(encoding="utf-8").splitlines()
    )
    assert counted > 0
    assert len(workflow_crons(workflows)) == counted


def test_an_empty_section_says_so_instead_of_an_empty_table() -> None:
    text = render([], [])
    assert "אין משימות בשרת." in text
    assert "אין תזמונים ב-GitHub Actions." in text
    assert "| id |" not in text


def test_jobs_doc_matches_the_code() -> None:
    fresh = build()
    current = DOC.read_text(encoding="utf-8")
    if os.environ.get("UPDATE_JOBS_MAP") == "1":
        head = current[: current.index(BEGIN) + len(BEGIN)]
        DOC.write_text(f"{head}\n{fresh}{current[current.index(END):]}", encoding="utf-8")
        return
    assert _generated_block(current) == fresh, (
        "docs/JOBS.md is out of date: a scheduled job was added, removed or "
        "rescheduled. Regenerate with:\n"
        "  UPDATE_JOBS_MAP=1 pytest tests/test_meh3599_jobs_map.py"
    )
