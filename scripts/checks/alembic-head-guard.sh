#!/usr/bin/env bash
#
# Module:   alembic-head-guard.sh
# Purpose:  Fail the build when backend/alembic/versions/ has more than one head
#           revision, and — more importantly — do the counting with a method that
#           cannot be fooled by prose. Counts via real alembic when it is
#           importable, and via an AST parse when it is not.
# Touches:  nothing. Reads backend/alembic/versions/*.py and a mktemp scratch
#           dir used only by the self-test. Writes to stdout/stderr only.
# Does NOT: run `alembic upgrade`, `alembic check`, or touch a database. It does
#           not validate that the chain is *correct* (that is what `alembic
#           upgrade head` in the backend job does) — only how many heads it has.
#           It also does NOT replace `uv run alembic heads` as the authority for
#           a release: it is a gate, not a substitute for the documented command.
# Related:  docs/MIGRATIONS.md § "ספירת ראשים — alembic heads בלבד. לא grep."
#           (the prose this guard mechanises), scripts/checks/README.md (the
#           guard-authoring contract), scripts/checks/run-all.sh (dispatcher).
# History:  MEH-1909 — release #2 prep. The lesson was written into
#           docs/MIGRATIONS.md on 06/08 after an ad-hoc regex counter reported
#           TWO heads on a perfectly healthy chain. On 07/08 a different session
#           wrote the same regex and hit the same false positive again, because
#           a doc records a lesson but does not enforce one. Hence a script.
#
# WHY THE NAIVE COUNT IS WRONG (the whole reason this file exists)
#   Revision files carry the string `down_revision` inside their docstrings too,
#   as unquoted prose. In this repo, right now:
#
#     backend/alembic/versions/20260723_1000_d51508a7c9e2_meh_1508_*.py
#       :24   down_revision = a9f2c7d41b6e (MEH-1490 ...) — the single   <- PROSE
#       :38   down_revision: Union[str, None] = "a9f2c7d41b6e"           <- REAL
#
#   `re.search(r'^down_revision.*=', src, re.M)` matches line 24 and stops. That
#   line holds no quoted identifier, so no parent is extracted, so the real
#   parent goes uncounted — and a revision whose parent is uncounted looks
#   exactly like a head. One decoy line invents one phantom head.
#
#   An AST parse cannot make this mistake: a docstring is a string expression,
#   never an assignment node. That is the entire fix, and it is why the fallback
#   here parses rather than greps.
#
# SELF-TEST RUNS FIRST, ON EVERY INVOCATION
#   Per .claude/rules/testing.md: where the assertion is a classifier, run the
#   self-test first — if it cannot tell a correct chain from a broken one,
#   nothing it says afterwards is worth reading. The self-test is anchored to a
#   REAL file in this repo, not a synthetic shape, because an AST probe that is
#   only ever exercised against a hand-made fixture can be green against a form
#   that does not occur here. If the anchor file stops carrying the decoy shape,
#   this guard fails loudly rather than quietly testing nothing.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

VERSIONS_DIR="backend/alembic/versions"

if [[ ! -d "$VERSIONS_DIR" ]]; then
  echo "$VERSIONS_DIR:0: WARNING — migrations directory not found; nothing to count."
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "scripts/checks/alembic-head-guard.sh:0: WARNING — python3 unavailable, head count SKIPPED."
  echo "  This guard did not run. That is not a pass."
  exit 0
fi

python3 - "$REPO_ROOT" "$VERSIONS_DIR" <<'PYEOF'
import ast
import glob
import os
import re
import sys
import tempfile

repo_root, versions_dir = sys.argv[1], sys.argv[2]
versions_path = os.path.join(repo_root, versions_dir)

# The real file that carries the prose-decoy shape. The self-test is anchored to
# this rather than to a fixture, so the guard is always exercised against a form
# that genuinely occurs in this repo.
ANCHOR = "20260723_1000_d51508a7c9e2_meh_1508_dietary_scope_columns.py"

# The exact naive pattern that produced the false positive, kept verbatim as the
# control. If a future refactor makes this pattern correct, the self-test says so.
NAIVE = re.compile(r"^down_revision(?::[^=]+)?\s*=\s*(.+)$", re.M)


def parse_ast(src):
    """Return (revision, [down_revisions]) using the AST. Docstring-proof."""
    rev, downs = None, []
    for node in ast.parse(src).body:
        target = value = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                and isinstance(node.targets[0], ast.Name):
            target, value = node.targets[0].id, node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            target, value = node.target.id, node.value
        if value is None:
            continue
        if target == "revision" and isinstance(value, ast.Constant):
            rev = value.value
        elif target == "down_revision":
            # May be a string, None, or a tuple/list on a merge revision.
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                downs = [value.value]
            elif isinstance(value, (ast.Tuple, ast.List)):
                downs = [e.value for e in value.elts
                         if isinstance(e, ast.Constant) and isinstance(e.value, str)]
    return rev, downs


def heads_from_dir(path):
    """Count heads by AST across every revision file in `path`."""
    revs, downs = {}, {}
    for f in sorted(glob.glob(os.path.join(path, "*.py"))):
        if os.path.basename(f).startswith("__"):
            continue
        with open(f, encoding="utf-8") as fh:
            rev, down = parse_ast(fh.read())
        if rev:
            revs[rev] = os.path.basename(f)
            downs[rev] = down
    parents = {d for ds in downs.values() for d in ds}
    heads = [r for r in revs if r not in parents]
    dangling = sorted(parents - set(revs))
    return revs, heads, dangling


# ---------------------------------------------------------------------------
# SELF-TEST — runs first. Three assertions, each of which must discriminate.
# ---------------------------------------------------------------------------
failures = []
anchor_path = os.path.join(versions_path, ANCHOR)

# (1) The anchor file still exists and still carries the decoy shape: a prose
#     `down_revision` line ABOVE the real assignment. Without this, the guard is
#     no longer anchored to a real case and must say so rather than pass.
if not os.path.exists(anchor_path):
    failures.append(
        f"{versions_dir}/{ANCHOR}:0: anchor file is gone — this guard's self-test "
        f"is no longer exercised against a real repo file. Re-anchor it to another "
        f"revision whose docstring mentions down_revision, or delete the guard."
    )
else:
    with open(anchor_path, encoding="utf-8") as fh:
        anchor_src = fh.read()
    anchor_lines = anchor_src.splitlines()
    prose = [i + 1 for i, ln in enumerate(anchor_lines)
             if ln.lstrip().startswith("down_revision") and '"' not in ln and "'" not in ln]
    real = [i + 1 for i, ln in enumerate(anchor_lines)
            if ln.lstrip().startswith("down_revision") and ('"' in ln or "'" in ln)]
    if not prose or not real or min(prose) >= min(real):
        failures.append(
            f"{versions_dir}/{ANCHOR}:0: expected a PROSE down_revision line above "
            f"the real assignment (prose={prose}, real={real}). The decoy shape this "
            f"guard exists to survive is no longer present; re-anchor the self-test."
        )
    else:
        # (2) The control: the naive regex MUST be fooled by that file. If it is
        #     not, this guard's construction no longer discriminates — the AST
        #     would be passing a test the old method also passes, which proves
        #     nothing about the change.
        m = NAIVE.search(anchor_src)
        naive_ids = re.findall(r"[\"']([0-9a-zA-Z_]+)[\"']", m.group(1)) if m else []
        if naive_ids:
            failures.append(
                f"{versions_dir}/{ANCHOR}:{min(prose)}: control failed — the naive "
                f"regex extracted {naive_ids} instead of being fooled. This guard no "
                f"longer demonstrates that the AST method is the thing that helps."
            )
        # (3) The AST must get the real parent off that same file.
        _, ast_downs = parse_ast(anchor_src)
        if not ast_downs:
            failures.append(
                f"{versions_dir}/{ANCHOR}:{min(real)}: AST parse found no parent on a "
                f"file that has one. The parser is broken."
            )

# (4) The counter must be able to REPORT more than one head — otherwise a
#     hard-wired "always 1" would sail through every check above.
with tempfile.TemporaryDirectory() as tmp:
    tpl = '"""t\n\ndown_revision = decoy_prose_no_quotes (not an assignment)\n"""\n'
    for name, rev, down in (("a.py", "aaa", None), ("b.py", "bbb", "aaa"),
                            ("c.py", "ccc", "aaa")):
        body = tpl + f'revision: str = "{rev}"\n'
        body += f'down_revision: Union[str, None] = "{down}"\n' if down else \
                "down_revision: Union[str, None] = None\n"
        with open(os.path.join(tmp, name), "w", encoding="utf-8") as fh:
            fh.write(body)
    _, synth_heads, _ = heads_from_dir(tmp)
    if sorted(synth_heads) != ["bbb", "ccc"]:
        failures.append(
            f"scripts/checks/alembic-head-guard.sh:0: counter failed its own "
            f"two-head fixture (got {sorted(synth_heads)}, expected ['bbb', 'ccc']). "
            f"It cannot detect the condition it exists to detect."
        )

if failures:
    print("SELF-TEST FAILED — the head counter is not trustworthy. Findings:")
    for f in failures:
        print(f"  {f}")
    sys.exit(1)

# ---------------------------------------------------------------------------
# THE ACTUAL COUNT — prefer real alembic; fall back to the AST parse.
# ---------------------------------------------------------------------------
method, heads = None, None
try:
    sys.path.insert(0, os.path.join(repo_root, "backend"))
    from alembic.config import Config          # noqa: E402
    from alembic.script import ScriptDirectory  # noqa: E402
    cfg = Config(os.path.join(repo_root, "backend", "alembic.ini"))
    cfg.set_main_option("script_location", versions_path.rsplit("/versions", 1)[0])
    heads = list(ScriptDirectory.from_config(cfg).get_heads())
    method = "alembic ScriptDirectory (authoritative)"
except Exception:
    method = "AST parse (alembic not importable here)"

revs, ast_heads, dangling = heads_from_dir(versions_path)
if heads is None:
    heads = ast_heads

print(f"alembic-head-guard: {len(revs)} revisions · method: {method}")

if dangling:
    print(f"  {versions_dir}:0: dangling down_revision reference(s): {dangling}")

if len(heads) != 1:
    print(f"  {versions_dir}:0: expected exactly 1 head, found {len(heads)}: {heads}")
    for h in heads:
        print(f"    {versions_dir}/{revs.get(h, '?')}:0: head {h}")
    print("  Fix: cd backend && uv run alembic merge heads -m 'merge_parallel_revisions'")
    print("  Confirm with the authority, not this script: cd backend && uv run alembic heads")
    sys.exit(1)

if method.startswith("AST"):
    # Deliberately NOT a WARNING. The AST path is correct, not degraded — it is
    # exactly the "if you count with your own tool" recipe in docs/MIGRATIONS.md
    # (quoted ids only, tuples handled), and it is the normal path in the guards
    # job, which does not install backend deps. A warning printed on every single
    # run is a warning nobody reads (MEH-1715, inverted). WARNING here is reserved
    # for states that are actually actionable: python3 missing, or the guard's own
    # self-test losing its anchor.
    print("  note: alembic not importable in this job; `uv run alembic heads` "
          "remains the authority for a release (docs/MIGRATIONS.md).")

print(f"  single head: {heads[0]} ({revs.get(heads[0], '?')})")
sys.exit(0)
PYEOF
