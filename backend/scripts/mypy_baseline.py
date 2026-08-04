#!/usr/bin/env python3
"""
Module:   mypy_baseline
Purpose:  Turn the mypy step into a ratchet. A committed baseline records today's
          error count per (file, error-code); the step fails only when a count
          RISES above its baseline. Existing errors stay allowed, new ones block,
          and a count that FALLS passes while reporting the improvement.
Touches:  Runs mypy as a subprocess (read-only over the source tree) and reads /
          writes backend/mypy-baseline.txt. No network, no DB.
Does NOT: fix, silence, or reconfigure a single mypy error — freezing them is the
          entire point (see "Why a baseline and not a cleanup" below). It also
          does NOT decide WHICH files mypy checks; that is the workflow's argv
          plus [tool.mypy] in pyproject.toml.
Related:  the PR-checks workflow (its backend-mypy job invokes this),
          backend/mypy-baseline.txt (the frozen counts),
          scripts/checks/legacy-expiry-check.sh (the --self-test conventions
          this file follows).
History:  MEH-1868 chunk 0 (creation).

═══════════════════════════════════════════════════════════════════════════════
WHY THIS EXISTS — the gate was reporting success without running
═══════════════════════════════════════════════════════════════════════════════

`mypy` was configured in `[tool.mypy]` and invoked by the PR-checks workflow, but
was never declared as a dependency. So the step did this, on every commit, for
months:

    error: Failed to spawn: `mypy`
      Caused by: No such file or directory (os error 2)

…in 0 seconds, swallowed by `|| true`, with the job reporting **success**. That
is worse than warn-only: warn-only reports and does not block, while this
reported a pass for a check that never executed. Two possible causes for one
green, and the reader saw the reassuring one.

═══════════════════════════════════════════════════════════════════════════════
WHY THE KEY IS (file, code) AND NOT (file, line)
═══════════════════════════════════════════════════════════════════════════════

Life360's lint-baseline experience: a baseline keyed by LINE NUMBER is brittle.
Insert a line near the top of a file and every entry below it shifts, so errors
that were already accounted for "reappear" as new ones and the gate reds on a
diff that changed nothing about types. The fix is to key on something a code
shift cannot move: the file, the error code, and how many there are.

That choice paid for itself immediately, and the evidence is worth recording
because it was free. Measured 2026-08-04 on the same source tree:

    mypy 1.19.1 → 20 errors, 8 (file, code) keys
    mypy 2.3.0  → 20 errors, 8 (file, code) keys — byte-identical

…across a MAJOR version boundary, even though the rendered message text changed
("Missing type parameters" → "Missing type arguments"). A baseline keyed on the
message string would have gone red on that upgrade with no type error involved.

═══════════════════════════════════════════════════════════════════════════════
WHY A BASELINE AND NOT A CLEANUP
═══════════════════════════════════════════════════════════════════════════════

A zero-warnings policy makes every improvement look like high effort for low
reward, so the refactor never happens and the gate gets disabled instead. The
ratchet asks nobody to fix anything: it only forbids getting worse. Fixing an
existing error is always allowed and is always reported as an improvement.

═══════════════════════════════════════════════════════════════════════════════
WHY --update-baseline REFUSES TO RAISE A COUNT
═══════════════════════════════════════════════════════════════════════════════

A ratchet that can be loosened by the same command that tightens it is not a
ratchet. `--update-baseline` writes decreases and removals freely; raising any
count — or introducing a new (file, code) key — additionally requires
`--allow-increase`, so loosening is a visible, deliberate act in the diff and in
the shell history, never a side effect of "just refreshing the baseline".

Usage:
    python scripts/mypy_baseline.py                      # check (CI)
    python scripts/mypy_baseline.py --update-baseline    # accept improvements
    python scripts/mypy_baseline.py --update-baseline --allow-increase
    python scripts/mypy_baseline.py --self-test          # prove it discriminates

Exit codes: 0 = at or below baseline · 1 = a count rose · 2 = usage/tool error.
"""

from __future__ import annotations

import argparse
import collections
import json
import subprocess
import sys
from pathlib import Path

# Resolve relative to this file, not the cwd, so the script behaves identically
# whether CI runs it from backend/ or a developer runs it from the repo root.
BACKEND_DIR = Path(__file__).resolve().parent.parent
BASELINE_PATH = BACKEND_DIR / "mypy-baseline.txt"

# The exact argv the workflow passes. Kept here as ONE definition so the baseline
# can never be frozen against a different scope than the gate runs.
# NOTE (MEH-1868 finding, not fixed here): the explicit path OVERRIDES the
# `files = [...]` list in [tool.mypy], so the five files listed there are not all
# checked — only auth.py and whatever it imports. Widening that scope changes the
# baseline and belongs in its own ticket.
MYPY_ARGV = ["app/auth.py", "--strict"]

HEADER = """\
# mypy baseline — MEH-1868 chunk 0
#
# One line per (file, error-code, count). TAB-separated, sorted, so a diff shows
# exactly which code moved in which file, and concurrent branches touching
# different files do not conflict.
#
# KEYED BY CODE, NOT BY LINE NUMBER — on purpose. A line-keyed baseline shifts
# wholesale when a line is inserted above, resurrecting errors already accounted
# for. See the module docstring of scripts/mypy_baseline.py.
#
# A count may FALL freely (that is an improvement and is reported as one). A
# count may not RISE without --allow-increase.
#
# DO NOT hand-edit. Regenerate:  python scripts/mypy_baseline.py --update-baseline
#
# Frozen 2026-08-04 from mypy 2.3.0 (the version pinned in pyproject.toml) over
# `mypy app/auth.py --strict`: 20 errors, 3 files, 8 keys. This is a measurement
# taken at freeze time — an earlier report said 19, and the gap was deliberately
# not reverse-engineered, because a baseline quoted from a prior measurement is
# exactly the staleness this file exists to prevent.
"""


def run_mypy() -> tuple[collections.Counter[tuple[str, str]], str]:
    """Run mypy with JSON output and count errors per (file, code).

    Returns (counts, raw_stderr). Notes are ignored: only records whose severity
    is "error" carry a code that can be ratcheted.
    """
    proc = subprocess.run(
        [sys.executable, "-m", "mypy", *MYPY_ARGV, "--output=json"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    counts: collections.Counter[tuple[str, str]] = collections.Counter()
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            # A non-JSON line on stdout means mypy failed before emitting
            # results (bad config, missing plugin). Fail loud rather than
            # reporting an empty — and therefore passing — count.
            print(f"mypy emitted non-JSON output: {line}", file=sys.stderr)
            raise SystemExit(2)
        if record.get("severity") != "error":
            continue
        counts[(record["file"], record["code"])] += 1

    # An empty result is ambiguous: a genuinely clean tree looks identical to
    # mypy dying before it checked anything. Disambiguate on the exit code —
    # mypy exits 0 when clean, 1 when it found errors, >=2 when it crashed.
    if not counts and proc.returncode not in (0, 1):
        print(
            f"mypy exited {proc.returncode} with no findings — it did not run.\n"
            f"{proc.stderr.strip()}",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return counts, proc.stderr


def read_baseline(
    path: Path, *, missing_ok: bool = False
) -> collections.Counter[tuple[str, str]]:
    """Parse the baseline file.

    `missing_ok` is ONLY for the bootstrap write (--update-baseline creating the
    file for the first time). In check mode a missing baseline is fatal: treating
    it as "no errors allowed" would red every PR, and treating it as "everything
    allowed" would be a gate that passes because its own config vanished — the
    exact shape this script exists to end.
    """
    if not path.exists():
        if missing_ok:
            return collections.Counter()
        print(
            f"baseline file missing: {path}\n"
            "Bootstrap it with: python scripts/mypy_baseline.py --update-baseline",
            file=sys.stderr,
        )
        raise SystemExit(2)
    counts: collections.Counter[tuple[str, str]] = collections.Counter()
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = raw.split("\t")
        if len(parts) != 3:
            print(f"{path}:{lineno}: expected 3 tab-separated fields", file=sys.stderr)
            raise SystemExit(2)
        file_, code, num = parts[0].strip(), parts[1].strip(), parts[2].strip()
        counts[(file_, code)] += int(num)
    return counts


def render(counts: collections.Counter[tuple[str, str]]) -> str:
    lines = [f"{f}\t{code}\t{n}" for (f, code), n in sorted(counts.items()) if n]
    return HEADER + "\n".join(lines) + "\n"


def diff(
    baseline: collections.Counter[tuple[str, str]],
    current: collections.Counter[tuple[str, str]],
) -> tuple[list[str], list[str]]:
    """Return (regressions, improvements) as human-readable lines."""
    regressions, improvements = [], []
    for key in sorted(set(baseline) | set(current)):
        was, now = baseline.get(key, 0), current.get(key, 0)
        if now > was:
            regressions.append(f"  {key[0]}\t{key[1]}\t{was} -> {now}  (+{now - was})")
        elif now < was:
            improvements.append(f"  {key[0]}\t{key[1]}\t{was} -> {now}  ({now - was})")
    return regressions, improvements


def check(update: bool, allow_increase: bool) -> int:
    current, _ = run_mypy()
    bootstrapping = update and not BASELINE_PATH.exists()
    baseline = read_baseline(BASELINE_PATH, missing_ok=bootstrapping)
    regressions, improvements = diff(baseline, current)

    total_base, total_now = sum(baseline.values()), sum(current.values())
    print(f"mypy-baseline: {total_now} error(s) now, {total_base} in baseline")

    if update:
        # Bootstrap is the one write where every count is technically an
        # "increase" (from an absent file). Requiring --allow-increase there
        # would train people to reach for the loosening flag on a routine first
        # freeze, which is the wrong muscle to build.
        if bootstrapping:
            BASELINE_PATH.write_text(render(current), encoding="utf-8")
            print(
                f"baseline CREATED with {total_now} error(s) across {len(current)} key(s)"
            )
            return 0
        if regressions and not allow_increase:
            print("\nREFUSING to raise the baseline:", file=sys.stderr)
            print("\n".join(regressions), file=sys.stderr)
            print(
                "\nA ratchet loosened by its own refresh command is not a ratchet.\n"
                "Fix the new error, or pass --allow-increase to record it deliberately.",
                file=sys.stderr,
            )
            return 1
        BASELINE_PATH.write_text(render(current), encoding="utf-8")
        verb = "raised" if regressions else "updated"
        print(f"baseline {verb}: {total_base} -> {total_now}")
        if improvements:
            print("improvements recorded:")
            print("\n".join(improvements))
        return 0

    if improvements:
        print(f"\nIMPROVED — {len(improvements)} key(s) went down:")
        print("\n".join(improvements))
        print("Run with --update-baseline to lock the improvement in.")

    if regressions:
        print(
            f"\nFAILED — {len(regressions)} key(s) rose above baseline:",
            file=sys.stderr,
        )
        print("\n".join(regressions), file=sys.stderr)
        print(
            "\nExisting errors are allowed; new ones are not. Fix the new error,\n"
            "or record it deliberately with:\n"
            "  python scripts/mypy_baseline.py --update-baseline --allow-increase",
            file=sys.stderr,
        )
        return 1

    print("OK — no count rose above baseline.")
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# --self-test — drive the REAL comparator over synthetic counters.
#
# It exercises diff() and the render/parse round-trip, which are what decide
# pass/fail. It deliberately does NOT re-run mypy: the question this answers is
# "can the comparator tell a regression from an improvement", and pinning
# synthetic inputs is the only way to assert that deterministically. Asserts
# COUNTS, not merely exit codes — a self-test that checks only "exited non-zero"
# cannot tell a correct rejection from a crash.
# ─────────────────────────────────────────────────────────────────────────────
def self_test() -> int:
    print("mypy_baseline --self-test")
    base: collections.Counter[tuple[str, str]] = collections.Counter(
        {("a.py", "type-arg"): 5, ("b.py", "var-annotated"): 2}
    )
    failures = []

    def expect(label: str, got: object, want: object) -> None:
        ok = got == want
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}: got {got!r}, want {want!r}")
        if not ok:
            failures.append(label)

    # 1. identical → nothing either way
    r, i = diff(base, collections.Counter(base))
    expect("unchanged -> 0 regressions", len(r), 0)
    expect("unchanged -> 0 improvements", len(i), 0)

    # 2. a count RISES → exactly one regression, no improvement
    up = collections.Counter(base)
    up[("a.py", "type-arg")] = 6
    r, i = diff(base, up)
    expect("increase -> 1 regression", len(r), 1)
    expect("increase -> 0 improvements", len(i), 0)

    # 3. a count FALLS → exactly one improvement, no regression
    down = collections.Counter(base)
    down[("b.py", "var-annotated")] = 1
    r, i = diff(base, down)
    expect("decrease -> 0 regressions", len(r), 0)
    expect("decrease -> 1 improvement", len(i), 1)

    # 4. a NEW (file, code) key is a regression, not a silent addition —
    #    the failure mode where a whole new error class slips in unnoticed.
    added = collections.Counter(base)
    added[("c.py", "no-any-return")] = 1
    r, i = diff(base, added)
    expect("new key -> 1 regression", len(r), 1)

    # 5. a key that disappears entirely counts as an improvement
    removed = collections.Counter(base)
    del removed[("b.py", "var-annotated")]
    r, i = diff(base, removed)
    expect("removed key -> 1 improvement", len(i), 1)
    expect("removed key -> 0 regressions", len(r), 0)

    # 6. the round-trip: render() then read_baseline() must reproduce the input
    #    exactly, or an --update-baseline write would silently alter counts.
    tmp = BACKEND_DIR / ".mypy-baseline.selftest.tmp"
    try:
        tmp.write_text(render(base), encoding="utf-8")
        expect("render/parse round-trip", read_baseline(tmp), base)
    finally:
        tmp.unlink(missing_ok=True)

    if failures:
        print(f"self-test FAILED — {len(failures)} assertion(s): {', '.join(failures)}")
        return 1
    print(
        "self-test OK — increase, decrease, new key, removed key, and round-trip "
        "all sorted correctly."
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="mypy baseline ratchet (MEH-1868)")
    parser.add_argument("--update-baseline", action="store_true")
    parser.add_argument(
        "--allow-increase",
        action="store_true",
        help="with --update-baseline: permit a count to rise. Deliberate act only.",
    )
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()
    if args.allow_increase and not args.update_baseline:
        print(
            "--allow-increase is only meaningful with --update-baseline",
            file=sys.stderr,
        )
        return 2
    return check(update=args.update_baseline, allow_increase=args.allow_increase)


if __name__ == "__main__":
    raise SystemExit(main())
