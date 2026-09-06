# MEH-784 — protected-path gate: the server-side half of the deny layer

**Staged for Sapir.** `.github/workflows/**` is CC-deny for the filesystem
tools (MEH-671; see the 06/09 bullet in `.claude/rules/security.md` — the deny
is tool × path, and the API route is exactly what this gate exists for). The
decision logic is **not** in the YAML: it lives in
`scripts/ci/protected-path-gate.sh`, which is on the branch with this doc,
carries an 11-case `--self-test`, and was shown to discriminate before this
doc was written (below). The YAML only feeds it three inputs.

## Why a server-side gate at all — the 20/07 finding

The local layer — `permissions.deny` in `.claude/settings.json`,
`check-bash-safety.sh`, `check-branch-name.sh` — only sees the tools that run
inside the sandbox. A commit created through the GitHub Contents API, the
GitHub MCP write tools, or the web editor never meets it. Measured three
times: PR #1968 (`frontend/vercel.json`, 20/07), PR #2629 (`claude-review.yml`,
06/08), PR #3453 (`frontend/eslint.config.mjs`, 06/09). Each was transparent
and deliberate — the point is that **nothing structural stood in the way**.
The only layer that catches the API route is the one that runs on the PR.

## What it does

A new always-on job `protected-path-gate` in `pr-checks.yml`:

1. `dorny/paths-filter@v3` with `list-files: shell` produces the changed
   paths (the workflow already grants `pull-requests: read` for this action).
2. The step exports `CHANGED_FILES`, `PR_LABELS`, `PR_AUTHOR` and runs
   `scripts/ci/protected-path-gate.sh`.
3. The script fails the job when a protected path changed and the PR does
   **not** carry the label `protected-path-approved` — unless the author is
   `dependabot[bot]` (its lockfile PRs are reviewed at merge by Sapir every
   time, rule 35; requiring a label there would only add a click).
4. `ci-gate` reads the result as an always-required leg (`check_ran`), so a
   `skipped` or `cancelled` never reads as a pass (MEH-1582 / MEH-1907).

Protected globs (restated from the local deny layer, so both halves cover the
same set):

```
backend/alembic/versions/*   .github/workflows/*   .github/CODEOWNERS
.claude/settings.json        .claude/hooks/*       frontend/vercel.json
pyproject.toml   uv.lock   frontend/package.json   frontend/package-lock.json
```

**What it is, and is not.** The label is a LABEL, not prose — the same
decision MEH-1523 reached for `do-not-merge` (rule 30b): adding or removing it
is a permanent, attributed timeline event. CC *can* add labels, so this gate is
**auditability, not prevention** — a CC session that labels its own PR leaves
a trace with its name on it, which is the difference from the API route today,
where nothing is recorded. Rule 30's direction applies unchanged: the label is
Sapir's to add after reading the diff; CC never adds it to its own PR.

**Interplay with MEH-1915 (ד).** Once code-owner review is live on the
ruleset, `.github/**` and `.claude/**` are double-gated (review + label). That
is fine — the label gate still covers `alembic/versions`, `vercel.json` and
the lockfiles, which CODEOWNERS does not, and the two fail differently
(review-required vs a red required check).

## The self-test — shown failing first (testing.md)

```
$ bash scripts/ci/protected-path-gate.sh --self-test
  ok   alembic revision, no label (exit 1)
  ok   alembic revision, label present (exit 0)
  ok   workflow under a subdirectory, no label (exit 1)
  ok   .claude/settings.json, no label (exit 1)
  ok   frontend/vercel.json, no label (exit 1)
  ok   uv.lock by dependabot, no label (exit 0)
  ok   uv.lock by a human, no label (exit 1)
  ok   docs only, no label (exit 0)
  ok   look-alike path (workflows-docs), no label (exit 0)
  ok   empty diff (exit 0)
  ok   wrong label name is not approval (exit 1)
self-test: 11/11 cases as expected
```

**Discrimination control (06/09):** a copy of the script with the dependabot
exemption broken (`= "nobody"` in place of the author compare) reports
**10/11** and exits 1 — the one red case is `uv.lock by dependabot, no label`,
which is the case that exemption owns. The count is derived from the cases
that ran, never typed.

## The patch — `.github/workflows/pr-checks.yml`

### 1 · The job (place next to `do-not-merge-gate`, which it mirrors)

```yaml
  protected-path-gate:
    name: Protected-path gate (MEH-784)
    runs-on: ubuntu-latest
    timeout-minutes: 3
    # Every PR, every event the workflow already listens to — `labeled` /
    # `unlabeled` are in the trigger types (MEH-1523), so adding the label
    # re-runs this job without a push.
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - name: List changed paths
        id: changed
        uses: dorny/paths-filter@v3
        with:
          list-files: shell
          filters: |
            any:
              - '**'
      - name: Decide
        env:
          CHANGED_FILES: ${{ steps.changed.outputs.any_files }}
          PR_LABELS: ${{ join(github.event.pull_request.labels.*.name, ',') }}
          PR_AUTHOR: ${{ github.event.pull_request.user.login }}
        run: |
          # `list-files: shell` yields a space-separated, shell-quoted list;
          # the script wants one path per line.
          CHANGED_FILES="$(eval "printf '%s\n' $CHANGED_FILES")" \
            bash scripts/ci/protected-path-gate.sh
```

### 2 · Wire it into `ci-gate`

```diff
   ci-gate:
     name: CI gate (required)
     if: always()
     needs:
       - changes
       - do-not-merge-gate
+      - protected-path-gate
       - qa-artifacts-size
```

```diff
           R_DNM: ${{ needs.do-not-merge-gate.result }}
+          R_PROTECTED_PATH: ${{ needs.protected-path-gate.result }}
           R_QA_SIZE: ${{ needs.qa-artifacts-size.result }}
```

```diff
           echo "Always required (stack-independent):"
           check_ran "DO-NOT-MERGE marker gate" "$R_DNM"
+          check_ran "Protected-path gate (MEH-784)" "$R_PROTECTED_PATH"
           check_ran "qa-artifacts size cap" "$R_QA_SIZE"
```

### 3 · The label

Create `protected-path-approved` once (Settings → Labels). Colour and
description are cosmetic; the name is what the script compares, exactly.

## How to verify after applying (Sapir)

1. Open a throwaway PR that adds one line to `docs/ci/README.md` → the gate
   **passes** (no protected path).
2. On the same PR, touch `frontend/vercel.json` with a no-op edit → the gate
   **fails** and lists the file; `CI gate (required)` goes red on the
   `Protected-path gate` leg.
3. Add the label → the `labeled` event re-runs the gate → **passes**; the
   timeline shows who added it and when.
4. Close the PR without merging. Three states seen, zero merges.

## Not done here

* The Windows/MINGW hook run, the stash forensics and the `cp`/`mv`
  Bash-bypass extension (card items 1–4) — they need `.claude/hooks/**`
  (CC-deny) and Sapir's machine. This doc is item 6 only.
* The drift-guard on `.claude/settings.json` (item 5) — same deny.
