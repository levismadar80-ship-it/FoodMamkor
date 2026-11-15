# Security rules

All invariants below — never weaken any of them to "make a test pass".
If a test needs one of these disabled to pass, the test is wrong or the
invariant needs a new exception documented separately; don't quietly
lower the bar.

Pre-trim text (13/11): [docs/rules-history/2026-11-13/security.md](../../docs/rules-history/2026-11-13/security.md).
Full threat model, header list, CORS config, and 3-step audit protocol:
[docs/SECURITY.md](../../docs/SECURITY.md).

---

## Invariants

- **JWT secret from env.** `JWT_SECRET_KEY` (or `SECRET_KEY`) is
  **required** in production — a missing secret raises `RuntimeError` at
  boot (`config.py:161-166`), it does not fall back. Ephemeral in dev
  only (`config.py:171`). HS256 (`config.py:28`).
  **TTL: 15-minute access token** (`config.py:35`), 14-day refresh
  (`config.py:36`). The access token also carries a `scope` claim, a
  `token_version` counter, password-change invalidation and a fingerprint
  binding, all enforced in `get_current_user` (`auth.py:261-275`). Do not
  weaken any of these to lengthen a session.
- **Rate limiting via slowapi.** See `backend/app/rate_limit.py`.
  Per-route limits are set in the router file, not inline.
- **Nothing grows without bound (MEH-3022).** Every non-admin write route
  carries `@limiter.limit`; every list in a request body carries
  `max_length`; every table with a FK to `producers.id` has a per-business
  cap in `backend/app/limits.py` (`enforce_cap`, 409 + Hebrew) or an
  `OWNED_TABLE_EXEMPT` reason. A rate limit is not a cap — 60/hour is 1,440
  a day. `tests/test_meh3022_resource_caps.py` walks the whole app and fails
  on a new route, list or table that has neither.
- **IDOR ownership checks with admin override.** Every resource mutation
  (PUT/DELETE/PATCH) must check `resource.owner_id == current_user.id`
  OR `current_user.role == "admin"`. No exceptions.
- **Magic-byte file upload validation.** `backend/app/routers/upload.py`
  validates the first bytes of the file, not just the extension or MIME
  header.
- **Security headers + CSP.** Full header list in
  [docs/SECURITY.md](../../docs/SECURITY.md). CSP is strict — Google GSI
  and Cloudinary require explicit allowlist entries.
- **AI fail-open does not bypass auth.** Missing `ANTHROPIC_API_KEY`
  degrades AI features, never the auth layer.
- **Sub-agent `tools:` is advisory, not enforced.** Per MEH-363
  (PROBE-1) and MEH-425 (Phase 1), the harness does not gate on the
  `tools:` frontmatter in `.claude/agents/*.md` — a sub-agent declared
  with `tools: Bash(npm:*), Read, Grep, Glob` can still call `Edit`
  and the edit lands. Real enforcement: `permissions.deny` in
  `.claude/settings.json` (L1) plus `PreToolUse` hooks (L2). Never
  store a security boundary behind `tools:`. MEH-425 also established
  that `agent_id` and `agent_type` ARE exposed to L2 hooks, so
  per-agent gating at the hook layer is feasible (Phase 2 follow-up
  pending). See [docs/agent-permissions-investigation.md](../../docs/agent-permissions-investigation.md).
- **`permissions.deny` is tool × path, never "this file is locked".**
  `Edit(.github/workflows/**)` blocks only `Edit` / `Write` / `MultiEdit`; the
  API can reach the same paths, and that gap is a decision (MEH-1915: the gate
  moves to merge time, CODEOWNERS). **As of 28/10/2026 (MEH-2486)** the sandbox
  proxy refuses Contents-API writes to `.github/workflows/**` and branch
  creation via `git/refs` (403); the GitHub MCP write tools were not
  re-measured. So a workflow change = CC prepares and
  verifies the patch (`git apply --check`, YAML incl. any embedded filter
  block), a human or Claude in Chrome commits
  it, CC verifies the PR diff byte-for-byte (#3740). Never write `.github/**`
  from the shell to get around the deny. Re-measure before relying on this.

---

## When a PR touches `auth.py` / `upload.py` / permissions

Workflow rule 5a requires an additional **web-search CVE check** for
these files. Run the check before `/adversarial-review` and include
findings in the PR description.

Also run the built-in **`/security-review`** on the branch, for these files
and for any change under `backend/app/routers/**`. Its findings go in the PR
description, or the line `/security-review: no findings`. It is an added
layer, not a replacement for `/adversarial-review` (MEH-2334).

---

## Production safety — deny-list (MEH-408)

Commands forbidden inside any Claude Code session — must be run by
Smadar directly in her own terminal, never by Claude. Mechanically
enforced by `.claude/hooks/check-bash-safety.sh` (PreToolUse: Bash,
exit 2 = block).

| Pattern | Why blocked |
|---|---|
| `DROP TABLE` / `DROP DATABASE` / `DROP SCHEMA` | Schema changes go through Alembic migrations only ([docs/MIGRATIONS.md](../../docs/MIGRATIONS.md)). |
| `TRUNCATE <table>` (any form, with or without `TABLE` keyword) | Reverses MEH-341 accept-risk — bare `TRUNCATE` was previously allowed; MEH-408 closes the gap. |
| `DELETE FROM <table>` without a `WHERE` clause | Mass-delete; production data loss risk. Heuristic: command must contain the word `WHERE` somewhere. |
| `rm -rf /` / `rm -rf ~` / `rm -rf $HOME` / `rm -rf .` | Filesystem destruction including the cwd (the repo). |
| `railway down` / `railway service delete` | Tears down running production infra. |
| `vercel --prod` / `vercel rm` | Direct production deploy / project deletion bypassing the `feature/* → staging → main` flow. |
| Any command containing `$DATABASE_URL_PRODUCTION` | Production DB URL must never be touched from a Claude session — `psql`, `railway run`, `vercel env`, etc. Run from your terminal. |

### `git reset --hard` is denied at L2 — use `git checkout -B` (MEH-514)

`git reset --hard` is blocked by a `permissions.deny` entry in
`.claude/settings.json`, **not** by `check-bash-safety.sh`. The hook cannot
see it: a segment matching `^git[[:space:]]` is `continue`d before any
pattern runs (`check-bash-safety.sh:58`), because git cannot execute its own
arguments as shell. So there is nothing to add to the hook, and adding
something would change nothing — the deny fires first either way.

**The sanctioned alternative, which does exactly what the denied command
does for the syncing case:**

```bash
git checkout -B <branch> origin/<branch>
```

`workflow.md` § *Branch-base verification* already uses this form, so it is
the house pattern rather than a workaround. **Reach for it directly — do not
ask for the denied command to be run on your behalf, and do not treat the
block as something to route around.** A deny is a decision, not an obstacle
(workflow rule 32: CC adds constraints, never removes one).

The deny stays broad on purpose (Sapir, MEH-514 option א): one friction case in
15 months, a free alternative. Don't re-open it.

---

If you genuinely need one of these, run it yourself in Git Bash —
the hook only governs Claude Code tool calls, not your own terminal.

Cross-ref: `.claude/hooks/check-bash-safety.sh`,
`.claude/hooks/README.md` ("extension path" section).
