# `check-branch-name.sh` — read `--delete` as a flag, not as a branch name (MEH-2077)

**Status: APPLIED** — landed in #3239 (2026-09-01 09:32Z); verified on
`origin/staging` 2026-09-06 (drain כט'): `check-branch-name.sh:78` reads
`--delete` / `-d` / `:refspec` as flags, `:95` carries the MEH-2077 comment.
The measurement below is the record of how it was proven before applying.
_(Was: "staged for Sapir. `.claude/hooks/**` is CC-deny, so CC cannot apply
this.")_ Measured, not proposed blind: the patch below was applied to a **copy** of
the hook and both hooks were run against the same 10-case corpus. Results are in
the table at the bottom.

The deny is not inferred from the rules file — it was measured on 2026-08-14:

```
Edit(.claude/hooks/check-branch-name.sh)
→ File is in a directory that is denied by your permission settings.
```

Confirming `.claude/settings.json` `permissions.deny`:
`Edit(.claude/hooks/**)`, `Write(.claude/hooks/**)`, `MultiEdit(.claude/hooks/**)`.

---

## Why

`git push origin --delete <branch>` is blocked. The hook takes the token after
`origin` positionally and validates it as a branch name — so it validates the
string `--delete`, which of course does not match the convention:

```
$ echo '{"tool_input":{"command":"git push origin --delete feature/meh-9999-orphan"}}' \
    | bash .claude/hooks/check-branch-name.sh
Blocked: push branch '--delete' — violates the locked naming convention (workflow rule 3, MEH-1141).
$ echo $?
2
```

The offending line is `check-branch-name.sh:72`:

```bash
pushed=$(echo "$COMMAND" | sed -nE 's/.*origin[[:space:]]+([^[:space:];&|]+).*/\1/p')
```

Found when a session tried to clean up an orphan branch and could not. Same
root cause as this ticket's chunk 1 — **a script that did not understand its own
input**, then reported confidently on what it thought it had read.

## Direction of change — this RELAXES the guard for deletes, deliberately

Workflow rule 32 says CC adds constraints and never removes one, so the
direction is called out rather than buried. Three reasons this is the right
scope, and why it is Sapir's to apply rather than CC's:

1. **A delete cannot create a non-conforming branch.** The guard's stated
   purpose (`check-branch-name.sh:4-9`) is to block *creation* and *pushing* of
   a bad name. A deletion produces no name at all.
2. **The branch most in need of deletion is exactly the one that violates the
   convention** — an orphan `claude/*` branch. Under the current code that
   branch can never be deleted through a CC session, which inverts the rule it
   is enforcing.
3. **It is already scoped this way in prose.** The header's `Does NOT:` line
   (`:10-12`) excludes read paths from the guard; delete belongs in that
   category and was simply never handled.

Non-conforming *pushes* still block — the last two rows of the table are the
control for that, and they are the assertion that must not regress.

## Scope: this hook only

The CI twin (`pr-checks.yml:45-57`, `Branch name gate`) does **not** share the
defect — it reads `github.head_ref` directly and never parses a shell command,
so there is nothing to fix there and no workflow edit in this patch.

---

## The change

Replace the `--- Push ---` block (`check-branch-name.sh:68-79`) with:

```bash
# --- Push -----------------------------------------------------------------
# The branch that lands on the remote: the first NON-FLAG token after `origin`,
# else the current branch (bare `git push` / `git push -u origin HEAD`).
if echo "$COMMAND" | grep -qE 'git[[:space:]]+push'; then
  # Isolate the push command itself, so a later `&& git ...` cannot donate tokens.
  push_seg=$(echo "$COMMAND" | sed -nE 's/.*(git[[:space:]]+push[^;&|]*).*/\1/p')

  # A DELETE never creates a remote branch — and the branch most in need of
  # deletion is precisely one that violates the convention. Out of scope, the
  # same way the read paths in the header are.  (MEH-2077)
  if ! echo "$push_seg" | grep -qE '([[:space:]](--delete|-d)([[:space:]]|$))|([[:space:]]:[^[:space:]]+)'; then
    # The branch that lands on the remote is the first NON-FLAG token after
    # `origin`. Reading the token positionally is what made `git push origin
    # --delete <branch>` validate the string `--delete` as a branch name.
    pushed=$(echo "$push_seg" | sed -nE 's/.*origin[[:space:]]+//p' \
               | tr '[:space:]' '\n' | grep -vE '^-' | head -1)
    # src:dst refspec → the remote branch is the dst side.
    case "$pushed" in *:*) pushed="${pushed##*:}";; esac
    if [ -z "$pushed" ] || [ "$pushed" = "HEAD" ]; then
      pushed=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    fi
    [ -n "$pushed" ] && ! conforms "$pushed" && emit_block "$pushed" "push"
  fi
fi
```

Two independent fixes, both required by the acceptance criteria:

- **`grep -vE '^-'`** handles the general case — *any* leading-dash argument, not
  the literal string `--delete`. `--force-with-lease`, `--set-upstream`,
  `--tags` and anything future are skipped the same way.
- **the delete guard** covers all three spellings git accepts: `--delete`, `-d`
  (which may appear *before* `origin`), and the `:branch` colon-refspec form.

`push_seg` bounds the parse to the push command, so a chained
`git push origin X && git branch Y` cannot leak tokens across the `&&`.

---

## Measured — both hooks, same corpus

`CURRENT` = the live hook, `PATCHED` = the same file with the block above.
Exit 2 = blocked, 0 = allowed.

| CURRENT | PATCHED | WANT | Case |
|---|---|---|---|
| 2 | 0 | 0 | `git push origin --delete <conforming>` |
| **2** | **0** | **0** | `git push origin --delete <non-conforming orphan>` — the motivating case |
| 2 | 0 | 0 | `git push -d origin <branch>` — short flag, before `origin` |
| 2 | 0 | 0 | `git push origin :<branch>` — colon-refspec delete |
| 0 | 0 | 0 | `git push -u origin feature/meh-2077-…` — normal conforming push |
| 0 | 0 | 0 | `git push --force-with-lease origin feature/meh-1-x` — flag before `origin` |
| **2** | **2** | **2** | non-conforming push **still blocks** |
| **2** | **2** | **2** | non-conforming push **still blocks** |
| 0 | 0 | 0 | `dependabot/*` allowed |
| 0 | 0 | 0 | bare `git push` — falls back to the current branch |

`10 cases; patched-hook mismatches: 0`

The last two rows are the ones that matter: a patch that fixed `--delete` by
loosening `conforms()` would show `0` there, and would be wrong.

## To apply

1. Replace `check-branch-name.sh:68-79` with the block above.
2. Re-run the corpus. The runner and its data file are throwaway; the two
   commands that reproduce the headline pair by hand:

```bash
echo '{"tool_input":{"command":"git push origin --delete feature/meh-9999-orphan"}}' \
  | bash .claude/hooks/check-branch-name.sh ; echo "want 0, got $?"

# and the control — must still be 2 (write the branch name inline when running)
```

> **Careful running these by hand from a CC session:** the live hook inspects
> the *whole* command, so a test harness whose own command line contains a
> non-conforming branch name is blocked by the hook under test. That happened
> while measuring this patch. Keep the corpus in a data file, as the table above
> did — a probe whose corpus includes the searcher (testing.md).
