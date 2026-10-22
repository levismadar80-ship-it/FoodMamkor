# `check-branch-name.sh` — exempt tag pushes (MEH-2285)

**Status: STAGED, not applied.** `.claude/hooks/**` is CC-deny, so this is Sapir's paste.

## Why

The hook's own header already says it does **not** govern tags:

```
# Does NOT: touch commit messages, tags, or branch names on read paths (fetch,
#           pull, log, status, checkout of an existing branch) — zero friction
#           there.
```

The implementation does not honour that. The push parser reads the first
non-flag token after `origin` as a branch name, so a tag ref is checked against
`ALLOWED_BRANCH_RE` and refused. **This is an intent-versus-implementation gap,
not a policy about tags.**

Measured 2026-09-07 while creating the repo's first release tag, ruled that day:

| Command | Result |
|---|---|
| `git push origin v1.0.0` | `Blocked: push branch 'v1.0.0'` |
| `git push origin refs/tags/v1.0.0:refs/tags/v1.0.0` | `Blocked: push branch 'refs/tags/v1.0.0'` |

The fully-qualified form is blocked too, so there is no spelling of a tag push
that gets through. The other route is the GitHub git-data API, which the
sandbox proxy denies (`POST /git/tags` → 403, *"Write access to this GitHub API
path is not permitted through this proxy"*). So tagging is currently a human
step, and `docs/DEPLOYMENT.md` says so until this lands.

## The change — two hunks in the push block

Both go inside `if echo "$COMMAND" | grep -qE 'git[[:space:]]+push'; then`.

**Hunk 1** — after `push_seg` is computed and after the existing delete/refspec
skip, before the token is extracted:

```bash
  # Tags are out of scope per this file's header. The parser below cannot tell
  # `refs/tags/v1.0.0` from a branch name, so without this it read the repo's
  # first release tag as a rule-3 violation (MEH-2285, 2026-09-07).
  if echo "$push_seg" | grep -qE '([[:space:]](--tags|--follow-tags)([[:space:]]|$))|([[:space:]]refs/tags/)'; then
    exit 0
  fi
```

**Hunk 2** — after `pushed` is resolved, before the `conforms` check, to catch
the bare-name form (`origin v1.0.0`), which carries no `refs/tags/` prefix:

```bash
    # A token that names an existing local tag is a tag push, not a branch.
    if [ -n "$pushed" ] && git rev-parse --verify --quiet "refs/tags/${pushed#refs/tags/}" >/dev/null 2>&1; then
      exit 0
    fi
```

## Discrimination proof — it must not weaken the branch guard

Run standalone against the real regex and the real `git rev-parse`, six cases,
each with a known answer. The two BLOCK rows are the point: the guard has to
keep doing its job, including on the exact branch name that caused MEH-1141.

```
  PASS  ALLOW  bare tag name, tag exists locally
  PASS  ALLOW  fully-qualified tag refspec
  PASS  ALLOW  --tags flag
  PASS  ALLOW  conforming branch
  PASS  BLOCK  the MEH-1141 trigger case — must STILL block
  PASS  BLOCK  non-conforming branch — must STILL block
cases declared=6 ran=6
SELF-TEST PASS — tag pushes allowed, branch guard intact
```

> The `cases declared=6 ran=6` line is not decoration. The first run of this
> self-test reported **five** PASS lines and exited 0: the case file had no
> trailing newline, so `read` dropped the last case — a green that had never
> executed one of its own rows. The assertion was added so that cannot recur,
> and it is the reason the count is printed rather than stated.

## What this does not change

- The allowed branch pattern is untouched.
- Deletes, read paths, and branch creation are untouched.
- It **adds** no permission: pushing a tag was always intended to be out of
  scope, per the header. This makes the code agree with the comment.
