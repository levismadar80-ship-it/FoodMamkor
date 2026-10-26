# MEH-2332: two hooks in `.claude/settings.json` that don't do what they say

> **CC cannot apply anything here.** `.claude/settings.json` is deny-enforced (`permissions.deny`
> plus `protect-lint-config.sh`). **Nothing here has been applied.** Same pattern as
> [`meh-2117-stop-hook-in-repo.patch.md`](./meh-2117-stop-hook-in-repo.patch.md): CC stages the
> patch, and Sapir applies it.

Measured on 26/10 against `origin/staging` @ `be03749`.

---

## 1 · Stop ESLint hook: already staged, apply MEH-2117 hunk 1

The hook guards on `[ -f "$root/frontend/.eslintrc.json" ]`. That file has not existed since MEH-443;
the config is `frontend/eslint.config.mjs`. So on every Stop the hook prints *"Warning: .eslintrc.json not
found, skipping ESLint"* and exits 0.

**There is no new patch for this hook.** The fix is already written, measured and merged as
[`meh-2117-stop-hook-in-repo.patch.md`](./meh-2117-stop-hook-in-repo.patch.md) §2 (hunk 1). That hunk
replaces the four inline Stop hooks with the committed
[`scripts/hooks/stop-build-and-test.sh`](../../scripts/hooks/stop-build-and-test.sh). The script:

- finds `eslint.config.*` or `.eslintrc.*` (via `compgen -G`);
- runs `npm run lint`, which is the CI gate (`eslint .` with errors only), and not
  `npx eslint . --max-warnings 0`.

Why not just fix the file name in the inline hook: MEH-2117 §1.3 measured the inline form on 03/09. It
found 0 errors and **9,507 warnings**, which gives exit 1. Correcting only the guard would have turned a
hook that never runs into **a block on every Stop**. Sapir, apply hunk 1 there and not a one-line fix
here.

The **discrimination proof** this card's AC asks for is in that same doc. It records before
(`skipping ESLint` / exit 0) and after (`npm run lint` → exit 0 on a clean tree), and the script's
`--self-test` builds fail-by-construction in both directions.

### 1a · Before applying hunk 1: the change gating (MEH-2343, 26/10)

Stop fires at the end of **every** turn, including a turn that only answered a question (hooks
reference, *"Stop … always fires on every occurrence"*). As first written, the script ran all four steps
in sequence each time, about 13 minutes. A command hook that reaches its `timeout` is cancelled with its
output discarded, so on a heavy day it would have become the silent no-op it replaced.

The script now skips an area (frontend = build + ESLint + vitest; backend = pytest) when the area is
identical to `origin/staging`, or unchanged since its last green run. Measured on 26/10 on a checkout
with `node_modules` and `backend/.venv` and no code changes: **0.06 s**, both areas skipped. The
`--self-test` is 25/25. With the gate neutralised, the 5 gating cases fail. With red runs stamped, the
"red is not stamped" case fails.

Also corrected in hunk 1: `"timeout": 1800` (seconds). The hunk previously read `900000`, which would be
about 10 days.

## 2 · PreToolUse Bash: the "update CLAUDE.md" reminder on every `git commit`

**Current state** (`.claude/settings.json:5-13`, the first entry in `hooks.PreToolUse`):

```json
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "if command -v jq >/dev/null 2>&1; then cmd=$(jq -r '.tool_input.command // \"\"'); else cmd=$(cat); fi; case \"$cmd\" in *\"git commit\"*) echo \"⚠️ Reminder: update CLAUDE.md with the changes in this commit before committing. If you already did, proceed.\" >&2 ;; esac; exit 0"
          }
        ]
      },
```

**Why it is wrong:** it tells every session to update `CLAUDE.md` with every commit. `CLAUDE.md` itself
says the opposite:

- *"only structural decisions land here, not session work (commits / docs/CHANGELOG.md)"*;
- a hard cap of 80 lines (79/80 today).

Session work belongs in commits, and CHANGELOG goes in a separate docs PR (rule 31). It is not a gate
(always `exit 0`), so the cost is noise. Each commit pushes the model toward an edit that the rules
forbid.

**Hunk 2: delete the whole object** (the five lines from `{` to `},` above). Nothing replaces it.

If you would rather keep a reminder, here is a version that matches the rules (an alternative, not a
recommendation):

```json
            "command": "if command -v jq >/dev/null 2>&1; then cmd=$(jq -r '.tool_input.command // \"\"'); else cmd=$(cat); fi; case \"$cmd\" in *\"git commit\"*) echo \"Reminder: code change → update its doc in the same PR (rule 11). CLAUDE.md only for structural decisions; CHANGELOG/HANDOFF in a separate docs PR (rule 31).\" >&2 ;; esac; exit 0"
```

**Rule 32 (CC adds constraints and never removes them):** this hook is a message and not a constraint.
It always exits 0 and blocks nothing. Deleting it removes no guard. Even so, it is Sapir's to apply,
because the file is denied to CC in both directions.

## 3 · Verification after applying

1. `jq . .claude/settings.json >/dev/null`: the JSON is valid.
2. In a new session, `git commit` prints no "update CLAUDE.md" line (hunk 2).
3. At the end of a turn, the Stop output shows `eslint: npm run lint` and not
   `.eslintrc.json not found` (MEH-2117 hunk 1).
