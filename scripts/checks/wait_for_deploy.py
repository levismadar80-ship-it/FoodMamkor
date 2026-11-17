#!/usr/bin/env python3
"""
Module:   wait_for_deploy
Purpose:  Block until a push has actually reached the live site, so the
          post-deploy checks (MEH-2749) measure the new build and not the old
          one. The gate is the FRONTEND: the Next.js build id in the home
          page HTML (app-router flight data, `"b":"<id>"`) must differ from
          the id seen when this script started. vercel.json builds every
          staging/main push, and every build gets a new id.
          The BACKEND sha (GET {base}/api/health → version.git_sha) is
          waited for up to --backend-grace-min after the frontend moved. If it
          has not moved by then, the question asked is NOT "did Railway
          redeploy" but "is the backend code that is RUNNING the same code as
          this commit" — answered from git, not from the platform. Identical
          backend files => 0, honestly. Different, or undecidable => exit 2 and
          an ::error:: line.
          Railway genuinely does not always redeploy (measured 06/11: staging
          backend at 5af2bec while staging tip was 48cb0c4), which is why a
          blind "the shas must match" rule would red every frontend-only push.
          Until MEH-0000 this script returned 0 in that case with nothing but a
          printed note, so every check that ran after it measured the OLD
          backend and the workflow went green: a green with two causes.
Touches:  Nothing. GET only.
Related:  .github/workflows/post-deploy-checks.yml (the caller) ·
          backend/app/routers/health.py (/health version block) ·
          vercel.json ignoreCommand (staging + main always build).
History:  MEH-2749 (creation, 06/11).

Exit codes
----------
    0  the live build IS this commit: the frontend build moved, and the
       backend is either at this sha or running byte-identical backend code.
    1  timed out — prints which signal never moved. The caller still runs the
       checks (they then describe the OLD build, and the log says so), because
       a stuck deploy is itself something to look at, not a reason for silence.
    2  STALE BACKEND. The frontend moved but the backend is serving different
       backend code from this commit, or the script could not establish that it
       is the same. This is the case that used to exit 0.

Who enforces exit 2
-------------------
`post-deploy-checks.yml:95` calls this as `… || echo "::warning …"`, so NO exit
code from here can fail the job today, and the Verdict step aggregates only
smoke / links / headers / lighthouse. The one-line workflow change that gives
exit 2 teeth is prepared and verified in
docs/ci/meh-0000-deploy-sha-gate.patch.md; `.github/workflows/**` is CC-deny,
so a human commits it. Until then this script is precise and toothless, and
says so in its own output.

Why not a fixed sleep
---------------------
deploy.yml's API-contract probe sleeps 90 s. That fits Railway, not a Next
build on Vercel (minutes). A sleep that is too short measures the previous
build and reports it as this one — a green with two possible causes.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

import vercel_count  # MEH-2864: sibling module, prints «requests to Vercel: N» at exit


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow a redirect. urllib copies request headers onto the next
    hop, so following a 3xx off-origin (vercel.com/sso-api when protection
    rejects the header) would send the bypass secret to that host. A 3xx is
    reported as its own status instead."""

    def redirect_request(self, *args, **kwargs):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)

# Next app-router flight data ends its root object with `"b":"<buildId>"}`
# (escaped inside the inline script: \"b\":\"<id>\"}). Anchoring on the
# closing brace keeps an unrelated `"b"` key elsewhere from matching; measured
# 06/11 on production and staging: exactly one match, the build id.
BUILD_ID_RE = re.compile(rb'\\?"b\\?":\\?"([A-Za-z0-9_-]{8,})\\?"\}')


_reported: set[str] = set()


def _get(url: str) -> bytes:
    vercel_count.note(url)  # MEH-2864
    headers = {"User-Agent": "mehamakor-wait-for-deploy/1.0"}
    secret = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET", "").strip()
    if secret:
        headers["x-vercel-protection-bypass"] = secret
    req = urllib.request.Request(url, headers=headers)
    try:
        with _OPENER.open(req, timeout=20) as r:
            return r.read()
    except Exception as e:
        # Say why once per kind of failure: a 302/403 from Vercel protection
        # (secret missing or wrong) must not look like "no build id yet".
        why = f"HTTP {e.code}" if isinstance(e, urllib.error.HTTPError) else type(e).__name__
        if why not in _reported:
            _reported.add(why)
            print(f"  fetch failed: {why} ({url.split('?')[0]})")
        return b""


def frontend_build_id(base: str) -> str | None:
    ids = {
        m.decode()
        for m in BUILD_ID_RE.findall(_get(f"{base}/?_wfd={int(time.time())}"))
    }
    if len(ids) > 1:
        print(
            f"WARNING more than one build-id candidate in the home HTML: {sorted(ids)}"
        )
        return None
    return ids.pop() if ids else None


# Files whose content decides what the backend container actually runs. The
# frontend is deployed by Vercel and is gated separately (the build id), so
# `frontend/` is deliberately NOT here: a frontend-only push leaves the backend
# sha behind for a good reason, and that must stay green.
BACKEND_PATHS = ("backend/", "Dockerfile", "railway.json")

# An abbreviated or full git object name, and nothing that git would read as a
# revision expression. See the note in backend_code_differs().
HEX_SHA = re.compile(r"[0-9a-f]{7,40}")

STALE_BACKEND = 2


def _git(*args: str) -> tuple[int, str]:
    """Run git in the checkout. Returns (returncode, stdout). Never raises."""
    try:
        p = subprocess.run(
            ("git", *args), capture_output=True, text=True, timeout=30, check=False
        )
        return p.returncode, p.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return 127, ""


def backend_code_differs(deployed: str | None, target: str) -> bool | None:
    """Is the backend code at `deployed` different from the code at `target`?

    True  — it differs, so what is running is NOT this commit's backend.
    False — byte-identical under BACKEND_PATHS. The running backend IS this
            commit's backend code, whatever sha the container reports.
    None  — cannot be established: no sha reported, not a git checkout, or the
            deployed sha is outside the fetched history (`fetch-depth: 50`).
            The caller treats None as a failure, not as a pass. A backend more
            than 50 commits behind the tip is itself the finding.

    Why `git diff` and not a sha comparison: the sha comparison is the thing
    that was measured to be wrong 06/11. Two shas differing is normal and
    harmless when neither touched the backend; the same two shas differing
    after a backend change is the bug. Only the diff tells them apart.
    """
    if not deployed:
        return None
    # `deployed` is whatever the running backend put in its /api/health body,
    # so it is network input. It never reaches a shell (`_git` passes an argv
    # tuple), and `^{commit}` is appended below, which is why a leading `-`
    # cannot become a git option. The reason to pin the shape anyway is a
    # different one: a revision EXPRESSION such as `HEAD` or `main` would
    # resolve, make the diff empty, and return False — "the backend is current"
    # — from a value the backend chose. Requiring a hex object name makes that
    # answer unreachable without changing any behaviour for a real sha.
    if not HEX_SHA.fullmatch(deployed):
        return None
    if _git("rev-parse", "--git-dir")[0] != 0:
        return None
    # Both ends must be objects we actually have. `cat-file -e` is the cheap
    # test; a shallow clone answers honestly here instead of inventing a graft
    # (workflow.md § provenance verification).
    for sha in (deployed, target):
        if _git("cat-file", "-e", f"{sha}^{{commit}}")[0] != 0:
            return None
    # --quiet: 0 = no difference, 1 = differences. Anything else is an error,
    # which must NOT read as "no difference".
    rc, _ = _git("diff", "--quiet", deployed, target, "--", *BACKEND_PATHS)
    if rc == 0:
        return False
    if rc == 1:
        return True
    return None


def backend_sha(base: str) -> str | None:
    try:
        return (
            json.loads(_get(f"{base}/api/health") or b"{}")
            .get("version", {})
            .get("git_sha")
        )
    except ValueError:
        return None


def _self_test() -> int:
    """Fixture git repos with known answers, for the ONE function that decides
    whether a stale backend sha matters.

    It runs before any network call and `--self-test` is wired into the gate
    path, because the honest answer for a frontend-only push and the answer a
    broken comparison gives are the same answer (0). A green from this script
    is only evidence if this passes.
    """
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        def g(*a: str) -> str:
            rc, out = _git("-C", d, *a)
            assert rc == 0, f"git {' '.join(a)} failed in the fixture"
            return out

        g("init", "-q", "-b", "main")
        g("config", "user.email", "t@t")
        g("config", "user.name", "t")
        (pathlib.Path(d) / "backend").mkdir()
        (pathlib.Path(d) / "backend" / "app.py").write_text("v1\n")
        (pathlib.Path(d) / "frontend").mkdir()
        (pathlib.Path(d) / "frontend" / "page.js").write_text("v1\n")
        g("add", "-A")
        g("commit", "-qm", "base")
        base = g("rev-parse", "HEAD")

        # A frontend-only push: the backend sha legitimately lags, and this MUST
        # stay green. This is the case the old code got right by accident.
        (pathlib.Path(d) / "frontend" / "page.js").write_text("v2\n")
        g("add", "-A")
        g("commit", "-qm", "frontend only")
        fe_only = g("rev-parse", "HEAD")

        # A backend push: a lagging backend sha now means the live backend is
        # NOT this commit's. This is the case the old code got WRONG.
        (pathlib.Path(d) / "backend" / "app.py").write_text("v2\n")
        g("add", "-A")
        g("commit", "-qm", "backend change")
        be_changed = g("rev-parse", "HEAD")

        cwd = os.getcwd()
        try:
            os.chdir(d)
            r_fe = backend_code_differs(base, fe_only)
            r_be = backend_code_differs(base, be_changed)
            r_unknown = backend_code_differs("0" * 40, be_changed)
            r_none = backend_code_differs(None, be_changed)
            # A revision EXPRESSION, not an object name. `HEAD` resolves, so
            # before the shape check this returned False — "the backend is
            # current" — from a string the backend chose. `base` is a real sha
            # in the same run, so this case discriminates: it is not "any
            # input is rejected now".
            r_expr = backend_code_differs("HEAD", be_changed)
            r_dash = backend_code_differs("--output=/tmp/x", be_changed)
        finally:
            os.chdir(cwd)

    checks = [
        ("frontend-only push: backend code identical -> False (green)", r_fe is False),
        ("backend push: backend code differs -> True (red)", r_be is True),
        ("deployed sha outside the fetched history -> None (red, not green)", r_unknown is None),
        ("/api/health reported no sha -> None (red, not green)", r_none is None),
        ("a revision expression ('HEAD') is not an object name -> None", r_expr is None),
        ("an option-shaped value is not an object name -> None", r_dash is None),
        ("verdict maps False -> exit 0", _verdict_on_stale_backend_rc(False) == 0),
        ("verdict maps True -> exit 2", _verdict_on_stale_backend_rc(True) == STALE_BACKEND),
        ("verdict maps None -> exit 2", _verdict_on_stale_backend_rc(None) == STALE_BACKEND),
    ]
    bad = 0
    for name, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'}  {name}")
        bad += 0 if ok else 1
    print(f"self-test: {len(checks) - bad}/{len(checks)}")
    return 1 if bad else 0


def _verdict_on_stale_backend_rc(differs: bool | None) -> int:
    """The exit-code half of _verdict_on_stale_backend, without the printing,
    so the self-test can assert the MAPPING and not just the comparison. The
    comparison being right is useless if the verdict wires it backwards."""
    return 0 if differs is False else STALE_BACKEND


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--self-test",
        action="store_true",
        help="run the fixture cases for backend_code_differs and exit",
    )
    ap.add_argument("--base-url", required=False)
    ap.add_argument("--sha", required=False, help="the pushed commit")
    ap.add_argument("--timeout-min", type=float, default=20)
    ap.add_argument("--interval-s", type=float, default=20)
    ap.add_argument("--backend-grace-min", type=float, default=3)
    args = ap.parse_args()
    if args.self_test:
        return _self_test()
    if not args.base_url or not args.sha:
        ap.error("--base-url and --sha are required unless --self-test is given")
    base = args.base_url.rstrip("/")

    # A broken comparison and an honest frontend-only push both answer 0, so
    # the gate is only evidence if the fixtures pass. Same shape as the
    # self-test-first rule in scripts/checks/brand-lexicon-guard.sh.
    if _self_test() != 0:
        print(
            "::error title=wait_for_deploy self-test failed::this run proves nothing about the "
            "deploy. Run `python scripts/checks/wait_for_deploy.py --self-test` to see which case broke."
        )
        return 1

    # A transient fetch failure on the FIRST read would leave nothing to
    # compare against and force a 20-minute timeout, so retry it briefly.
    start_build = None
    for _ in range(5):
        start_build = frontend_build_id(base)
        if start_build:
            break
        time.sleep(5)
    print(
        f"start: frontend build {start_build} · backend {backend_sha(base)} · waiting for {args.sha[:7]}"
    )
    if start_build is None:
        print(
            "WARN could not read a build id from the home page — waiting on the backend sha alone"
        )

    deadline = time.time() + args.timeout_min * 60
    fe_done = be_done = False
    fe_moved_at = None
    while time.time() < deadline:
        be = backend_sha(base)
        fe = frontend_build_id(base)
        be_done = be == args.sha
        fe_done = fe is not None and start_build is not None and fe != start_build
        if fe_done and fe_moved_at is None:
            fe_moved_at = time.time()
        print(
            f"  frontend {'OK ' if fe_done else '...'} {fe} · backend {'OK ' if be_done else '...'} {str(be)[:7]}"
        )
        if start_build is None and be_done:
            print("backend is live at the pushed sha (frontend not measurable)")
            return 0
        if fe_done and be_done:
            print("new frontend build is live, backend at the pushed sha")
            return 0
        if fe_done and time.time() - fe_moved_at >= args.backend_grace_min * 60:
            return _verdict_on_stale_backend(be, args.sha)
        time.sleep(args.interval_s)

    print(
        f"TIMEOUT after {args.timeout_min} min — "
        f"backend {'moved' if be_done else 'NOT moved'}, frontend {'moved' if fe_done else 'NOT moved'}. "
        "Checks below describe whatever is live, which may be the previous build."
    )
    return 1


def _verdict_on_stale_backend(be: str | None, target: str) -> int:
    """The frontend moved; the backend sha did not, and the grace is spent.

    This function is the whole point of MEH-0000. Before it, this branch
    printed a note and returned 0.
    """
    differs = backend_code_differs(be, target)
    short = str(be)[:7] if be else "unreadable"
    assert _verdict_on_stale_backend_rc(differs) == (
        0 if differs is False else STALE_BACKEND
    ), "the self-test's mapping and this function's mapping have drifted apart"
    if differs is False:
        print(
            f"new frontend build is live; backend still reports {short}, but no file under "
            f"{', '.join(BACKEND_PATHS)} differs between {short} and {target[:7]} — "
            "the backend code that is running IS this commit's. Not a stale build."
        )
        return 0
    if differs is True:
        print(
            f"::error title=Stale backend build::the live backend is at {short}, and the backend "
            f"code there DIFFERS from {target[:7]}. Every check after this one measures the old "
            f"backend. Paths compared: {', '.join(BACKEND_PATHS)}."
        )
    else:
        print(
            f"::error title=Backend build unverifiable::could not establish whether the live "
            f"backend ({short}) runs this commit's backend code. Either /api/health reported no "
            f"git_sha, or {short} is outside the fetched history — a backend more than "
            "fetch-depth commits behind the tip is itself the finding."
        )
    print(
        "  Exit 2. NOTE: post-deploy-checks.yml currently swallows this with "
        "`|| echo ::warning`, so the job stays green — see "
        "docs/ci/meh-0000-deploy-sha-gate.patch.md."
    )
    return STALE_BACKEND


if __name__ == "__main__":
    sys.exit(main())
