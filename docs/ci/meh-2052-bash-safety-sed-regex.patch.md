# MEH-2052 — `check-bash-safety.sh:136`: the `sed -i` regex stops at the first `>`

**Staged for Sapir.** `.claude/hooks/**` is hard-denied in `permissions.deny`
and, per Claude Code's `deny → ask → allow` ordering, no hook output can
override a matching deny — so CC cannot apply this, **not even to make the
guard stricter** (workflow.md rule 32 corollary). Measured while building the
self-test below: the harness also refuses a Bash command that copies the hook
into a scratch directory to patch the copy. This doc carries the exact
one-token edit, the self-test that proves it, and the measured before/after.

## The gap, in one line

```bash
# .claude/hooks/check-bash-safety.sh:136 (live on origin/staging, 04/09)
if echo "$SCAN" | grep -qE "sed[[:space:]]+-i[^>]*[[:space:]][\"']?(\./)?${esc}"; then
```

`[^>]*` is "any run of characters that contains no `>`". A sed script that
edits a version constraint — `>=`, `<=`, the most common edit in exactly the
dependency files the deny list protects — contains a `>` before the path, the
match cannot cross it, and the block never fires. The `[^>]` was presumably
meant to keep the pattern from swallowing a redirect, but by line 136 `$SCAN`
is already **one separator-split segment** (line 62 splits on `&&`, `||`, `;`,
`|`, `&`), and the redirect case is handled by the *previous* check (line 130,
`(>>?[[:space:]]*|tee…|of=)…`). There is nothing left for `[^>]` to protect.

## The edit — one token

```diff
-    if echo "$SCAN" | grep -qE "sed[[:space:]]+-i[^>]*[[:space:]][\"']?(\./)?${esc}"; then
+    if echo "$SCAN" | grep -qE "sed[[:space:]]+-i.*[[:space:]][\"']?(\./)?${esc}"; then
```

**Scan for siblings (DoD item 3):** `grep -n '\[\^>\]' .claude/hooks/check-bash-safety.sh`
returns **exactly one line — 136**. No other branch in the file uses the form.

**Nothing is weakened (DoD item 4):** `.*` matches a superset of what `[^>]*`
matched, so every command the old regex blocked is still blocked; the change
only adds matches. Rule 32's direction test passes: this adds a constraint.

## The self-test — `scripts/bash-safety-sed-selftest.sh`

Drives the **real hook** (JSON on stdin, `CLAUDE_PROJECT_DIR` set so it reads
the repo's own `settings.json` deny list) through four commands, and prints
BLOCK / ALLOW per case from the hook's exit code. The four cases are committed
in the script, not typed on a command line, because the hook scans the whole
Bash command text a session issues and blocks a one-liner that merely
*mentions* `sed -i … uv.lock` — measured 04/09, and correct behaviour.

| case | command | why it is in the set |
|---|---|---|
| **A** | `sed -i 's/starlette>=1.3.1/starlette>=99.0.0/' pyproject.toml` | the gap — `>` inside the script, deny-listed path (the card's own 13/08 evidence) |
| **B** | `sed -i '3096s/version = "1.3.1"/version = "1.3.0"/' uv.lock` | **control**: no `>`, deny-listed path — must BLOCK, proving the path *is* covered (without it, "A passed" is also explained by "the file isn't protected") |
| **C** | `sed -i 's/a>b/c/' README.md` | **control**: `>` inside the script, path nobody protects — must ALLOW, proving the fix adds no false positive |
| **D** | `sed -i 's/x>y/z/' ./uv.lock` | the gap with the `./` prefix branch of the regex |

Exit code: **0 when the instrument discriminates** (B blocks *and* C allows),
regardless of whether the fix is applied; **1 when a control is wrong**, in
which case every other line is void. It also greps the hook file for the
`[^>]*` form (Pass 1) and reports a MISMATCH if what the file *says* disagrees
with what the hook *does* — the case where a paste lands on the wrong line.

**Why it lives in `scripts/` and not `scripts/checks/`:** `run-all.sh`
auto-discovers every executable `*.sh` in `scripts/checks/` under the required
*Repo guards* job. This script reports a known-unapplied state until the paste
lands; promoting it before that would red every PR. Same home, same reason, as
`scripts/e2e-gate-selftest.sh` (MEH-1742). **Move it into `scripts/checks/`
after applying** — then a regression of line 136 reds the required job.

## Measured — 04/09, `origin/staging` hook, from the CC sandbox

```
Pass 1 — what the hook file SAYS (line carrying the sed -i regex):
  136: still the `[^>]*` form  -> says UNAPPLIED

Pass 2 — what the hook DOES:
  A  sed -i with '>' in the script, protected path (the gap) ALLOW
  B  sed -i without '>', protected path   (control: covered) BLOCK
  C  sed -i with '>', UNprotected path    (control: no FP)   ALLOW
  D  sed -i with '>' and ./ prefix, protected path           ALLOW

MEH-2052 fix: UNAPPLIED — case A/D pass through; the `[^>]*` stop at the first '>' is live.

Pass 3 — the regex alone, OLD ([^>]*) vs NEW (.*), per protected prefix:
  case OLD    NEW
  A    ALLOW  BLOCK
  B    BLOCK  BLOCK
  C    ALLOW  ALLOW
  D    ALLOW  BLOCK
```

Pass 3 is a reproduction of the one regex line (built with the hook's own
`esc` escaping), **not** of the hook — it exists because a patched copy of the
hook cannot be produced from a session. It answers only "does `.*` close A and
D without opening C"; Pass 2 is the measurement of the real thing, and after
the paste Pass 2 must read `A BLOCK · B BLOCK · C ALLOW · D BLOCK` with Pass 1
saying APPLIED.

## After pasting — the two controls the card demands

```
bash scripts/bash-safety-sed-selftest.sh
#  expect: Pass 1 APPLIED · Pass 2 A BLOCK, B BLOCK, C ALLOW, D BLOCK · exit 0
git mv scripts/bash-safety-sed-selftest.sh scripts/checks/   # optional promotion, see above
```

If B ever reads ALLOW the deny list no longer carries `Edit(uv.lock)` and the
whole path-guard branch is dead — that is a bigger finding than this card, not
a reason to edit the self-test.
