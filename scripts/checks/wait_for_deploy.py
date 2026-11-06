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
          waited for up to --backend-grace-min after the frontend moved, and
          then only reported: Railway does not always redeploy (measured
          06/11: staging backend at 5af2bec while staging tip was 48cb0c4),
          so requiring it would time out on every frontend-only push.
Touches:  Nothing. GET only.
Related:  .github/workflows/post-deploy-checks.yml (the caller) ·
          backend/app/routers/health.py (/health version block) ·
          vercel.json ignoreCommand (staging + main always build).
History:  MEH-2749 (creation, 06/11).

Exit codes
----------
    0  the frontend build moved — the new build is live
    1  timed out — prints which signal never moved. The caller still runs the
       checks (they then describe the OLD build, and the log says so), because
       a stuck deploy is itself something to look at, not a reason for silence.

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
import re
import sys
import time
import urllib.error
import urllib.request


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


def backend_sha(base: str) -> str | None:
    try:
        return (
            json.loads(_get(f"{base}/api/health") or b"{}")
            .get("version", {})
            .get("git_sha")
        )
    except ValueError:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--sha", required=True, help="the pushed commit")
    ap.add_argument("--timeout-min", type=float, default=20)
    ap.add_argument("--interval-s", type=float, default=20)
    ap.add_argument("--backend-grace-min", type=float, default=3)
    args = ap.parse_args()
    base = args.base_url.rstrip("/")

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
        if fe_done and (
            be_done or time.time() - fe_moved_at >= args.backend_grace_min * 60
        ):
            note = (
                ""
                if be_done
                else f" (backend still at {str(be)[:7]} — Railway may not have redeployed for this push)"
            )
            print(f"new frontend build is live{note}")
            return 0
        time.sleep(args.interval_s)

    print(
        f"TIMEOUT after {args.timeout_min} min — "
        f"backend {'moved' if be_done else 'NOT moved'}, frontend {'moved' if fe_done else 'NOT moved'}. "
        "Checks below describe whatever is live, which may be the previous build."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
