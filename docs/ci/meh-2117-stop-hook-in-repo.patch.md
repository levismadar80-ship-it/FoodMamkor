# MEH-2117 + MEH-1839 — the Stop hooks as committed scripts: two hunks, one for each hook layer

> **Neither hunk here can be applied by CC.** `.claude/settings.json` is deny-enforced (MEH-442
> `protect-lint-config.sh` + `permissions.deny`), and `~/.claude/launcher-settings.json` is a
> machine-level file outside the repo. **Nothing here has been applied.** The scripts both hunks point
> at ARE committed and self-tested:
>
> | script | replaces | self-test |
> |---|---|---|
> | [`scripts/hooks/stop-build-and-test.sh`](../../scripts/hooks/stop-build-and-test.sh) | the **four inline** `bash -c '…'` Stop hooks in `.claude/settings.json` (build · ESLint · vitest · pytest) | 14/14 |
> | [`scripts/hooks/stop-git-check.sh`](../../scripts/hooks/stop-git-check.sh) | `~/.claude/stop-hook-git-check.sh`, the machine-level git-state hook — **the file both cards are actually about** | 11/11 |
>
> Same pattern as [`meh-449-settings-hook-registration.patch.md`](./meh-449-settings-hook-registration.patch.md):
> the script lands in the PR, the registration is Sapir's.

---

## 0 · Two hook layers, two cards, one move

There are **two** Stop hooks running in a session on this repo, in two different layers, and the cards
are about the second one:

| layer | file | wired from | can CC change it? |
|---|---|---|---|
| repo | four inline commands under `hooks.Stop` | `.claude/settings.json` | no — deny-enforced |
| machine | `~/.claude/stop-hook-git-check.sh` (`/root/.claude/`, 6.4 KB, harness-provided) | `~/.claude/launcher-settings.json` → `hooks.Stop` | no — outside the repo |

Hooks merge **additively** across layers (the card's Phase 0): a repo script cannot remove or override
the machine one, so both hunks are needed and both are Sapir's. MEH-2117's finding is that a hook in
`~/.claude/` *"cannot be reviewed, versioned or verified, and dies with the container"*; MEH-1839's defect
sits in that same file. The inline repo hooks have the same property in a milder form — a 700-character
`bash -c` string inside JSON is versioned but not reviewable and has never been run by hand — and while
porting them two of the four turned out to have been **no-ops for months** (§1). One move, both layers.

## 1 · Measured before writing anything (03/09, `origin/staging` @ `bdf47989`)

### 1.1 · Two of the four inline Stop hooks never did anything

| hook | its guard | the fact | consequence |
|---|---|---|---|
| ESLint | `[ -f "$root/frontend/.eslintrc.json" ]` | that file does not exist; the config is `frontend/eslint.config.mjs` (MEH-443) | prints *"Warning: .eslintrc.json not found, skipping ESLint"* and exits 0 — **on every Stop**. And had the guard ever passed, its `--max-warnings 0` would have **blocked every Stop**: measured 03/09 on the main checkout, `eslint .` is 0 errors / **9,507 warnings** → exit 1. The CI lint gate is `npm run lint` = `eslint .` with no warning cap (`deploy.yml:146`) — errors fail it, warnings are the lint-ratchet's business. The port mirrors CI |
| pytest | `[ -f "$root/backend/tests/test_api.py" ]` | `git ls-files backend/tests` is **empty**; the tests are at `tests/test_api.py` in the repo root, and CI runs `backend/.venv/bin/python -m pytest tests/` from the root (`pr-checks.yml:398`) | prints *"Warning: backend/tests/test_api.py not found, skipping backend tests"* and exits 0 — **on every Stop** |

And the pytest hook has a second, independent reason to skip: it calls bare `python -m pytest`, which in
this container is `/usr/local/bin/python: No module named pytest`, while `backend/.venv/bin/pytest`
(9.1.1) exists. So the repo's own rule 11 — *"Stop hooks run `npm run build` + `pytest tests/test_api.py`
before any task is marked done"* — has been half true: build and vitest ran; lint and pytest reported a
warning nobody read and passed. The MEH-1742 shape (a device that reports success from the absence of
measurement), one layer down.

### 1.2 · The machine hook has moved since the cards were written — partly

Re-read 03/09 (`/root/.claude/stop-hook-git-check.sh`, 127 lines, dated today — the harness ships it):

- **MEH-1839 proposal 3 has landed upstream.** The signature check is now the raw `gpgsig`/`gpgsig-sha256`
  header (`:84`), not `%G?`, with a comment explaining exactly the allowedSignersFile problem the card
  diagnosed. A correctly SSH-signed commit is no longer reported as *"missing signature"*.
- **Proposals 2 and 4 have not.** The two checks are still `||`-ed into one condition (`:83-84`), still
  reported as one sentence — *"missing signature, or committer email is not noreply@anthropic.com"* — and
  the remedy is still `--amend --no-edit --reset-author` regardless of which one fired (`:107`).
- **MEH-2117's `rev-parse` is still there.** `upstream` is chosen from the local remote-tracking ref
  (`:41`), which a stale ref answers wrongly; the signature block now also gates on `rev-parse -q --verify
  "origin/$current_branch"` (`:78`). The card's synthetic proof (0 heads on origin, `rev-parse` succeeds)
  still holds against this version.

So the port below keeps what upstream fixed and adds what it did not.

### 1.3 · The committed build-and-test script, run for real from the main checkout

`bash scripts/hooks/stop-build-and-test.sh` against `/home/user/FoodMamkor` (where `node_modules` and
`backend/.venv` exist), 03/09. Four legs, three runs — the first run taught two things, both now pinned:

```
build:  npm run build                → ✓ Compiled successfully; full route table printed
vitest: npx vitest run               → Test Files 381 passed | 3 skipped · Tests 3775 passed | 3 skipped · 342 s
pytest: backend/.venv/bin/python -m pytest tests/test_api.py -q --tb=short  (cwd: repo root, as CI does)
        run 1 — on the SHARED mehamakor_test: DEADLOCKED 39 min against another agent's pytest
                (this session `idle in transaction`, theirs waiting on a table lock); killed by
                the coordinator, so the log's exit 2 is the kill, not a failure
        run 2 — PYTEST_XDIST_WORKER=gw63 → mehamakor_test_gw63 (isolated, provisioned by conftest):
                282 passed, 4 skipped, 560 warnings in 176.48s · exit 0
eslint: run 1 — `npx eslint . --max-warnings 0` (the inline hook's form):
                ✖ 9507 problems (0 errors, 9507 warnings) → exit 1 → BLOCK
        run 2 — `npm run lint` (= `eslint .`, the CI gate, deploy.yml:146):
                0 errors → exit 0 · 1 m 55 s
```

What the first run measured, and what changed because of it:

- **The port's own ESLint guard was wrong** — `ls glob1 glob2` exits non-zero when *either* glob is
  unmatched, so it reported "no config" against a checkout with `eslint.config.mjs`. Fixed with
  `compgen -G`; four self-test cases pin both config shapes and the real repo.
- **`--max-warnings 0` is a block-forever, not a gate.** The inline hook declared it; the repo carries
  9,507 warnings and a 40-line lint-ratchet baseline for exactly that reason. The port mirrors CI's
  errors-only gate. (The inline ESLint hook never fired because its config guard never passed — so this
  was a latent block, never a seen one.)
- **A Stop hook running pytest on the shared `mehamakor_test` collides with any other run on the box.**
  The port exports `PYTEST_XDIST_WORKER=gw<pid>` by default; the isolated re-run above was `gw63` on the
  coordinator's instruction and is the same mechanism.

Running a hook by hand once before wiring it is what surfaced all three — the exact thing an inline
`bash -c` string never allowed.

## 2 · Hunk 1 — `.claude/settings.json`, `hooks.Stop` (Sapir; deny-enforced for CC)

**Delete** the four entries in the `"Stop"` array — the ones whose `_comment` begins with
*"Defensive frontend build hook."*, *"Defensive ESLint no-undef hook."*, *"Vitest component tests."* and
*"Backend pytest."* — and **replace the whole array** with one entry:

```json
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "timeout": 900000,
            "_comment": "MEH-2117: build + ESLint + vitest + pytest as one committed script (scripts/hooks/stop-build-and-test.sh). Same guards as the four inline hooks it replaces, plus: resolves tests/test_api.py at the REPO ROOT and backend/.venv's pytest (the inline pytest hook looked at backend/tests/ and bare `python`, and skipped on every Stop), finds eslint.config.* (the inline ESLint hook looked for .eslintrc.json only, and skipped on every Stop). Runs all four, reports every failure, exit 2 = block with the reasons on stderr. Honours stop_hook_active. --self-test proves fail-by-construction both ways.",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}/scripts/hooks/stop-build-and-test.sh\""
          }
        ]
      }
    ],
```

Notes on the differences, so none of them is read as accidental:

- **exit 2 instead of `{"decision":"block"}` on stdout.** Both block. Exit 2 is Claude Code's documented
  blocking exit with stderr as the reason, and it is also what a *shell* reader sees — a JSON line on
  exit 0 is invisible to a human running the hook by hand, which is how the two no-ops stayed invisible.
- **`timeout: 900000`.** The inline entries carried no timeout (Claude Code's default is 60 s per hook).
  The build alone is minutes and vitest measured 342 s; one script now carries all four, so the ceiling is
  explicit. If it proves too tight the fix is the number, not a return to four entries.
- **ESLint runs `npm run lint`, not `npx eslint . --max-warnings 0`.** Mirrors the CI gate
  (`deploy.yml:146`); see §1.1 for why the inline form was a block-forever in disguise.
- **pytest runs on an isolated database — `PYTEST_XDIST_WORKER=gw<pid>` by default.** The first
  real run of the port (03/09) deadlocked for 39 minutes on the shared `mehamakor_test` against
  another agent's pytest (this session `idle in transaction`, theirs waiting on a table lock) and
  had to be killed. `tests/conftest.py:49-98` maps `gw<N>` to `mehamakor_test_gw<N>` and
  provisions it; the self-test asserts the id reaches pytest's environment.
- **One run, all failures.** The four inline hooks each stopped at their own failure. The script runs all
  four and lists every reason (`STOP HOOK BLOCK (2): …`), like `scripts/checks/run-all.sh`.
- **`STOP_HOOK_SKIP=build,eslint,vitest,pytest`** exists for by-hand runs. It is an env var a session
  could set — but a session could already `disableAllHooks`, and the deny on `settings.json` is the
  boundary, not this script. Rule 32 is not weakened: the hook set is unchanged and stricter.

Verify after applying:

```bash
jq . .claude/settings.json > /dev/null && echo "JSON valid"
jq '.hooks.Stop | length' .claude/settings.json        # → 1
bash scripts/hooks/stop-build-and-test.sh --self-test   # → 14/14, exit 0
```

## 3 · Hunk 2 — `~/.claude/launcher-settings.json` (Sapir; machine-level, outside the repo)

Current file (read 03/09, 716 bytes):

```json
        "Stop": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": "~/.claude/stop-hook-git-check.sh"
                    }
                ]
            }
        ],
```

Replace the `command` so the machine prefers the **repo's** script when the repo carries one, and keeps
the machine script for every other repo (this hook runs for all of them):

```json
                        "command": "bash -c 'r=\"${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}\"; if [ -x \"$r/scripts/hooks/stop-git-check.sh\" ]; then exec \"$r/scripts/hooks/stop-git-check.sh\"; else exec \"$HOME/.claude/stop-hook-git-check.sh\"; fi'"
```

`~/.claude/stop-hook-git-check.sh` is **not deleted** — other repos need it, and the harness rewrites it
anyway (the file is dated today). The DoD line *"launcher-settings.json stops pointing at the copy outside
the repo"* is met for **this** repo by the dispatch above, which is the only scope the repo can claim.

## 4 · What `stop-git-check.sh` changes, and the self-test that shows both directions

Kept from upstream: the four checks, the `HEAD --not --remotes` scoping of the signature block (it is what
stops the hook sweeping teammates' published commits), the `commit.gpgsign` gate, the recursion guard.

| card | defect | in the port |
|---|---|---|
| MEH-1839 §2 | two independent checks reported as one `or` | **REASON 1** (no `gpgsig` header) and **REASON 2** (committer email) are checked, listed and remedied separately; the message says the signature is a *presence* check because verification is not configured here |
| MEH-1839 §4 | `--amend --reset-author` prescribed whatever fired | REASON 1's remedy is `git commit --amend --no-edit` (re-sign; resetting the author changes nothing for it); only REASON 2's remedy carries `--reset-author` |
| MEH-2117 §2 | branch existence from a local `rev-parse` | `git ls-remote --exit-code --heads origin refs/heads/<branch>` (bounded by `timeout`). Its three outcomes are kept apart: **present** / **absent** / **could not ask** — the last falls back to the local ref *and says so*, because "no such branch" and "offline" must never print the same thing |
| MEH-2117 §4 (ב) | "please push" on a diverged branch is the wrong instruction | remote present **and** its head is an ancestor of `HEAD` → *N unpushed, please push*; remote present and **not** an ancestor (diverged, or object unknown locally) → **silent**; remote absent → *new branch, no remote branch, please push*. The silence is the card's accepted trade and is stated in the file header, not hidden |

```
stop-git-check --self-test
  ok   clean + pushed → exit 0 (exit 0)
  ok   uncommitted change → exit 2 (exit 2)
  ok   signed unpushed commit → unpushed message, no signature complaint (exit 2)
  ok   unsigned commit → REASON 1 only (exit 2)
  ok   ...and its remedy does not prescribe --reset-author (exit 0)
  ok   wrong committer email → REASON 2 only (exit 2)
  ok   ...and its remedy DOES prescribe --reset-author (exit 0)
  ok   diverged from origin/main → silent (a push would be a force) (exit 0)
  ok   stale origin/ghost ref, no such branch on origin → 'no remote branch' via ls-remote (exit 2)
  ok   new unpushed branch → reported (exit 2)
  ok   stop_hook_active=true → exit 0 (exit 0)
  11/11 self-test cases behaved correctly
```

Three rows are the cards' DoD lines verbatim: **signed commit with allowedSignersFile unset → not flagged**
(row 3; `ssh-keygen` is absent in this container, so the "signed" commit is constructed by writing a
`gpgsig` header with `git hash-object -t commit` — a presence check needs no key material, which is
MEH-1839 proposal 3's whole point); **genuinely unsigned → flagged, with the reason** (row 4); **diverged →
silent, new-unpushed → reported** (rows 8 and 10, MEH-2117's "both directions"). Row 9 is the card's §2
construction — a remote-tracking ref for a branch origin does not have — and it is the one `rev-parse`
gets wrong.

## 5 · What this does NOT close

- **Neither hook is wired by this PR.** Until Hunk 1 is applied the four inline hooks keep running (two of
  them as no-ops); until Hunk 2 is applied the machine hook keeps reporting the merged reason.
- **`scripts/checks/hooks-wiring-guard.sh` does not see `scripts/hooks/`.** It reconciles
  `.claude/hooks/**` against `.claude/settings.json` (MEH-1720). Scripts here are outside its scan, so an
  unwired `scripts/hooks/*.sh` is exactly the silent state that guard exists to end, one directory over.
  Widening the guard is a one-line `HOOKS_DIR` change plus a self-test case; it is not done here because
  the two scripts would then red the guard on every PR until Sapir applies Hunk 1 — a red nobody can clear
  from CC's side. Named so it is a decision, not an oversight: apply Hunk 1, then widen.
- **MEH-2117 DoD (a) — "fire only when the session created the branch" — is not implementable**, as the
  card's Phase 0 §3 already concluded: the hook reads one stdin key and nothing maps a session to a branch.
  Not approximated.

_Sources: MEH-2117 (Phase 0, 18/08), MEH-1839 (02/08 + 09/08 ruling), `.claude/settings.json` and
`/root/.claude/{launcher-settings.json,stop-hook-git-check.sh}` read 03/09, `pr-checks.yml:396-407`.
Drain-Session: 01NTrU3k-drain-ke._
