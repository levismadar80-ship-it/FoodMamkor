"""
Module:   gate_wiring
Purpose:  the required aggregator jobs (ci-gate, deploy-gate, e2e-gate) stay
          wired to the jobs they vote on. DEPLOYMENT.md said "update needs:
          and the R_* block in the same breath" — prose only (MEH-3192).
Touches:  reads .github/workflows/*.yml. Writes nothing (workflows are CC-deny).
Does NOT: parse full YAML — it reads the two shapes these files use (block or
          inline `needs:` list, `R_X: ${{ needs.job.result }}` env lines).
          It does not judge whether a job SHOULD vote.
History:  MEH-3192 (creation).
"""
import os
import re
import sys

ROOT = os.environ.get("GATE_ROOT", os.getcwd())
GATES = [("pr-checks.yml", "ci-gate"), ("deploy.yml", "deploy-gate"), ("e2e.yml", "e2e-gate")]


def strip_comments(text):
    """Drop YAML/shell comments: whole comment lines and ` # ...` tails."""
    out = []
    for l in text.splitlines():
        if re.match(r"^\s*#", l):
            continue
        out.append(re.sub(r"\s+#.*$", "", l))
    return "\n".join(out)


def jobs(text):
    """{job_id: (first_line_no, block_text)} for the top-level jobs: map."""
    lines = strip_comments(text).splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if re.match(r"^jobs:\s*$", l))
    except StopIteration:
        return {}
    out, cur, buf, first = {}, None, [], 0
    for i in range(start + 1, len(lines)):
        l = lines[i]
        m = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", l)
        if m or re.match(r"^\S", l):
            if cur:
                out[cur] = (first, "\n".join(buf))
            cur, buf, first = (m.group(1), [], i + 1) if m else (None, [], 0)
            if not m:
                break
            continue
        if cur:
            buf.append(l)
    if cur:
        out[cur] = (first, "\n".join(buf))
    return out


def needs_of(block):
    m = re.search(r"^    needs:\s*\[([^\]]*)\]", block, re.M)
    unq = lambda x: x.strip().strip("'\"")
    if m:
        return [unq(x) for x in m.group(1).split(",") if unq(x)]
    m = re.search(r"^    needs:\s*\n((?:      - .*\n?)+)", block, re.M)
    if m:
        return [unq(re.sub(r"^\s*-\s*", "", x)) for x in m.group(1).splitlines() if x.strip()]
    m = re.search(r"^    needs:\s*([A-Za-z0-9_-]+)\s*$", block, re.M)
    return [m.group(1)] if m else []


def check(text, gate, fname="x.yml"):
    """List of problem strings for one gate job in one workflow text."""
    all_jobs = jobs(text)
    if gate not in all_jobs:
        return [f"{fname}: gate job '{gate}' not found — the guard would check nothing"]
    line, block = all_jobs[gate]
    needs = needs_of(block)
    probs = []
    if not needs:
        probs.append(f"{fname}:{line}: {gate} has no needs: list")
    for n in needs:
        if n not in all_jobs:
            probs.append(f"{fname}:{line}: {gate} needs '{n}', which is not a job in this file — the workflow fails outright")
    refs = set(re.findall(r"needs\.([A-Za-z0-9_-]+)\.", block))
    for r in sorted(refs - set(needs)):
        probs.append(f"{fname}:{line}: {gate} reads needs.{r} but '{r}' is not in its needs: — it resolves empty, so every PR goes red")
    env = dict(re.findall(r"^\s+(R_[A-Z0-9_]+):\s*\$\{\{\s*needs\.([A-Za-z0-9_-]+)\.result", block, re.M))
    voted = set(env.values())
    for n in needs:
        if n not in voted:
            probs.append(f"{fname}:{line}: {gate} needs '{n}' but no R_* variable reads its result — a failure there would not stop the merge")
    for var in sorted(env):
        uses = len(re.findall(r"\$\{?" + var + r"\b", block))
        if uses == 0:
            probs.append(f"{fname}:{line}: {gate} defines {var} but its script never checks it")
    return probs


SAMPLE = """on: push
jobs:
  a:
    runs-on: x
  b:
    runs-on: x
  gate:
    needs: [a, b]
    steps:
      - env:
          R_A: ${{ needs.a.result }}
          R_B: ${{ needs.b.result }}
        run: |
          check "$R_A"; check "$R_B"
"""


def self_test():
    cases = [
        ("wired correctly", SAMPLE, 0),
        ("block-list needs form", SAMPLE.replace("needs: [a, b]", "needs:\n      - a\n      - b"), 0),
        ("needs names a deleted job", SAMPLE.replace("needs: [a, b]", "needs: [a, b, c]"), 2),  # not a job + no R_
        ("R_ reads a job not in needs", SAMPLE.replace("needs: [a, b]", "needs: [a]"), 1),
        ("job in needs with no R_ vote", SAMPLE.replace("          R_B: ${{ needs.b.result }}\n", "").replace('; check "$R_B"', ""), 1),
        ("R_ defined, never checked", SAMPLE.replace('; check "$R_B"', ""), 1),
        ("gate job missing", SAMPLE.replace("  gate:", "  other:"), 1),
        ("column-0 comment inside jobs:", SAMPLE.replace("  gate:", "# gates\n  gate:"), 0),
        ("comment line and trailing comment in a block list", SAMPLE.replace("needs: [a, b]", "needs:\n      - a  # first\n      # note\n      - b"), 0),
        ("quoted ids", SAMPLE.replace("needs: [a, b]", 'needs: ["a", \'b\']'), 0),
        ("comment mentioning a removed job", SAMPLE.replace("        run: |", "        # needs.zz.result was removed\n        run: |"), 0),
        ("R_ used only in a comment is not a check", SAMPLE.replace('; check "$R_B"', '  # "$R_B" later'), 1),
    ]
    bad = 0
    for name, text, want in cases:
        got = check(text, "gate")
        ok = len(got) == want
        bad += not ok
        print(f"  {'ok ' if ok else 'BAD'} {name}: {len(got)} problem(s) {got if not ok else ''}")
    # anchored to the real ci-gate: it must parse to >= 10 needs
    real = open(os.path.join(ROOT, ".github/workflows/pr-checks.yml"), encoding="utf-8").read()
    n = len(needs_of(jobs(real).get("ci-gate", (0, ""))[1]))
    ok = n >= 10
    bad += not ok
    print(f"  {'ok ' if ok else 'BAD'} real ci-gate parses to {n} needs (>= 10)")
    return bad


def main(argv):
    if "--self-test" in argv:
        bad = self_test()
        print("gate-wiring-guard self-test:", "FAIL" if bad else "PASS")
        return 1 if bad else 0
    probs = []
    for fname, gate in GATES:
        path = os.path.join(ROOT, ".github/workflows", fname)
        rel = os.path.relpath(path, ROOT)
        if not os.path.exists(path):
            probs.append(f"{rel}:1: workflow missing — gate '{gate}' cannot be checked")
            continue
        probs += check(open(path, encoding="utf-8").read(), gate, rel)
    for p in probs:
        print(p)
    return 1 if probs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
