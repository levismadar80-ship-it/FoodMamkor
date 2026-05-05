# Security rules

All invariants below — never weaken any of them to "make a test pass".
If a test needs one of these disabled to pass, the test is wrong or the
invariant needs a new exception documented separately; don't quietly
lower the bar.

Full threat model, header list, CORS config, and 3-step audit protocol:
[docs/SECURITY.md](../../docs/SECURITY.md).

---

## Invariants

- **JWT secret from env.** `JWT_SECRET_KEY` (or `SECRET_KEY`) is
  **required** in production; ephemeral in dev only. HS256, 24h TTL.
- **Rate limiting via slowapi.** See `backend/app/rate_limit.py`.
  Per-route limits are set in the router file, not inline.
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

---

## When a PR touches `auth.py` / `upload.py` / permissions

Workflow rule 5a requires an additional **web-search CVE check** for
these files. Run the check before `/adversarial-review` and include
findings in the PR description.

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

If you genuinely need one of these, run it yourself in Git Bash —
the hook only governs Claude Code tool calls, not your own terminal.

Cross-ref: `.claude/hooks/check-bash-safety.sh`,
`.claude/hooks/README.md` ("extension path" section).
