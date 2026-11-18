#!/usr/bin/env python3
"""
Module:   staging_health
Purpose:  Rule 41 as a status check: «nothing merges to staging while staging
          is red». Decides whether staging is red the way the rule says to —
          walk back through the staging E2E runs to the last one whose
          Playwright jobs actually EXECUTED, and use that conclusion — and
          posts a `Staging health` commit status on open PRs into staging.
Touches:  GitHub REST API only: reads Actions runs/jobs and open PRs, writes
          commit statuses (needs `statuses: write`). Nothing in the repo.
Does NOT: run anything, re-run E2E, or decide whether a flake may be passed
          (rule 39 — that is the PR's own E2E result). It only answers «is the
          base red right now».
Related:  .claude/rules/workflow.md rule 41; docs/ci/staging-health.patch.md
          (the workflow that calls this — `.github/**` is Sapir's to commit);
          .github/workflows/e2e.yml:126 (the Playwright job name matched here).
History:  MEH-3176 follow-up, 18/11/2026 — the memory-only rules inventory.
          Pattern: the «stop merging when main is red» gate (Uber Submit Queue,
          the stop-merging GitHub Action), as a required status.

USAGE
  staging_health.py decide             # print the verdict, exit 0 green / 1 not
  staging_health.py post --sha <sha> --labels "<a,b>"   # one PR (pull_request event)
  staging_health.py post-all           # every open PR into staging (workflow_run)
Env: GITHUB_TOKEN, GITHUB_REPOSITORY.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from dataclasses import dataclass

API = "https://api.github.com"
E2E_WORKFLOW = "e2e.yml"
BASE = "staging"
# e2e.yml:126 — `Playwright E2E (Vercel preview) ${{ matrix.shard }}/2`. The
# WebKit shadow job is "Playwright E2E (WebKit — shadow, non-blocking)" and is
# deliberately NOT matched: it carries no vote.
PLAYWRIGHT_PREFIX = "Playwright E2E (Vercel preview)"
CONTEXT = "Staging health"
FIX_LABEL = "fixes-staging-red"
RUN_WINDOW = 50  # one full window, never paged with varying sizes (CLAUDE.md)


@dataclass
class Verdict:
    state: str  # "green" | "red" | "unknown"
    detail: str
    url: str = ""


def decide(runs: list[dict], jobs_of) -> Verdict:
    """runs: newest first, as the API returns them. jobs_of(run) -> job list.

    The first run whose Playwright jobs executed decides. A run whose
    Playwright jobs all skipped, or that was cancelled/superseded, or that is
    still running, says nothing and is passed over — «a gap of skips does not
    clear an earlier failure».
    """
    for run in runs:
        if run.get("status") != "completed":
            continue
        pw = [j for j in jobs_of(run) if (j.get("name") or "").startswith(PLAYWRIGHT_PREFIX)]
        ran = [j for j in pw if j.get("conclusion") not in (None, "skipped", "cancelled")]
        if not ran:
            continue
        sha = (run.get("head_sha") or "")[:7]
        url = run.get("html_url") or ""
        bad = [j for j in ran if j.get("conclusion") != "success"]
        if bad:
            names = ", ".join(f"{j['name']}={j['conclusion']}" for j in bad)
            return Verdict("red", f"staging {sha}: {names}", url)
        return Verdict("green", f"staging {sha}: {len(ran)} Playwright job(s) passed", url)
    return Verdict("unknown", f"no staging E2E run in the last {len(runs)} executed Playwright")


def status_for(verdict: Verdict, labels: list[str]) -> tuple[str, str]:
    if verdict.state == "green":
        return "success", verdict.detail
    if FIX_LABEL in labels:
        return "success", f"staging is {verdict.state}; this PR carries {FIX_LABEL} (rule 41)"
    if verdict.state == "red":
        return "failure", f"staging is red — {verdict.detail}. Merge waits (rule 41)"
    return "failure", f"staging state unknown — {verdict.detail}. Not a green (rule 41)"


# ---------------------------------------------------------------- GitHub I/O
def _req(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            # The repo is public, so `decide` also works without a token (60
            # requests/hour) — that is how it was checked from a dev machine.
            **({"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"}
               if os.environ.get("GITHUB_TOKEN") else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 — fixed https host
        return json.loads(r.read() or b"null")


def live_verdict(repo: str) -> Verdict:
    runs = _req("GET", f"/repos/{repo}/actions/workflows/{E2E_WORKFLOW}/runs"
                       f"?branch={BASE}&per_page={RUN_WINDOW}")["workflow_runs"]
    # PR-event runs carry head_branch of the PR, so branch=staging already
    # limits this to push / schedule / dispatch runs on staging itself.
    return decide(runs, lambda run: _req(
        "GET", f"/repos/{repo}/actions/runs/{run['id']}/jobs?filter=latest&per_page=100")["jobs"])


def post(repo: str, sha: str, verdict: Verdict, labels: list[str]) -> None:
    state, desc = status_for(verdict, labels)
    _req("POST", f"/repos/{repo}/statuses/{sha}", {
        "state": state, "context": CONTEXT, "description": desc[:140],
        "target_url": verdict.url or None,
    })
    print(f"{sha[:7]} → {state}: {desc}")


def main(argv: list[str]) -> int:
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    cmd = argv[1] if len(argv) > 1 else "decide"
    if cmd == "--self-test":
        return self_test()
    verdict = live_verdict(repo)
    print(f"staging health: {verdict.state} — {verdict.detail} {verdict.url}")
    if cmd == "decide":
        return 0 if verdict.state == "green" else 1
    if cmd == "post":
        sha = argv[argv.index("--sha") + 1]
        labels = argv[argv.index("--labels") + 1].split(",") if "--labels" in argv else []
        post(repo, sha, verdict, [l.strip() for l in labels if l.strip()])
        return 0
    if cmd == "post-all":
        prs = _req("GET", f"/repos/{repo}/pulls?state=open&base={BASE}&per_page=100")
        for pr in prs:
            post(repo, pr["head"]["sha"], verdict, [l["name"] for l in pr.get("labels") or []])
        print(f"posted on {len(prs)} open PR(s)")
        return 0
    print(f"unknown command {cmd}", file=sys.stderr)
    return 2


# ---------------------------------------------------------------- self-test
def self_test() -> int:
    def run(i, status="completed"):
        return {"id": i, "status": status, "head_sha": f"{i:07d}", "html_url": f"u{i}"}

    def pw(c, shard=1):
        return {"name": f"{PLAYWRIGHT_PREFIX} {shard}/2", "conclusion": c}

    webkit_red = {"name": "Playwright E2E (WebKit — shadow, non-blocking)", "conclusion": "failure"}
    cases = [
        # name, runs, jobs by run id, expected state
        ("newest executed run green", [run(1)], {1: [pw("success"), pw("success", 2)]}, "green"),
        ("newest executed run red", [run(1)], {1: [pw("success"), pw("failure", 2)]}, "red"),
        ("skipped run does not clear an older red", [run(2), run(1)],
         {2: [pw("skipped"), pw("skipped", 2)], 1: [pw("failure")]}, "red"),
        ("cancelled run passed over", [run(2), run(1)],
         {2: [pw("cancelled")], 1: [pw("success")]}, "green"),
        ("in-progress run passed over", [run(2, "in_progress"), run(1)],
         {2: [], 1: [pw("failure")]}, "red"),
        ("newer green after a red decides", [run(2), run(1)],
         {2: [pw("success")], 1: [pw("failure")]}, "green"),
        ("WebKit shadow red carries no vote", [run(1)], {1: [pw("success"), webkit_red]}, "green"),
        ("only skips in the window = unknown", [run(1)], {1: [pw("skipped")]}, "unknown"),
        ("no runs at all = unknown", [], {}, "unknown"),
    ]
    status = 0
    for name, runs, jobs, want in cases:
        got = decide(runs, lambda r, jobs=jobs: jobs.get(r["id"], [])).state
        ok = got == want
        status |= not ok
        print(f"  [{'ok' if ok else 'XX'}] {name} → {got}" + ("" if ok else f", expected {want}"))
    for (state, labels, want) in [("green", [], "success"), ("red", [], "failure"),
                                  ("unknown", [], "failure"), ("red", [FIX_LABEL], "success")]:
        got = status_for(Verdict(state, "x"), labels)[0]
        ok = got == want
        status |= not ok
        print(f"  [{'ok' if ok else 'XX'}] status {state} labels={labels} → {got}")
    # Anchor to the real workflow: the job-name prefix must exist in e2e.yml,
    # or every run would look like «nothing executed» and the gate reads unknown.
    wf = os.path.join(os.path.dirname(__file__), "..", "..", ".github", "workflows", E2E_WORKFLOW)
    anchored = os.path.exists(wf) and PLAYWRIGHT_PREFIX in open(wf, encoding="utf-8").read()
    status |= not anchored
    print(f"  [{'ok' if anchored else 'XX'}] job-name prefix present in .github/workflows/{E2E_WORKFLOW}")
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv))
