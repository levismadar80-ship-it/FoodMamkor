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
  **required** in production — a missing secret raises `RuntimeError` at
  boot (`config.py:161-166`), it does not fall back. Ephemeral in dev
  only (`config.py:171`). HS256 (`config.py:28`).
  **TTL: 15-minute access token** (`config.py:35`), 14-day refresh
  (`config.py:36`). _This line previously said "24h TTL", which was
  stale by a factor of 96 and understated the posture; corrected from
  measured values in the MEH-1724 (P1) audit, `docs/audits/2026-07-full/p1-security-backend.md` §5._
  The access token additionally carries a `scope` claim, a
  `token_version` counter for revocation, password-change invalidation,
  and a request-fingerprint binding — all enforced inside
  `get_current_user` (`auth.py:261-275`). Do not weaken any of these to
  lengthen a session.
  _Every citation in this bullet re-derived from the source 2026-08-03
  (MEH-1861) and found **accurate, unchanged**: `config.py:28` `HS256`,
  `:35` `access_token_expire_minutes = 15`, `:36`
  `refresh_token_expire_days = 14`, `:161-166` the production
  `raise RuntimeError`, `:171` the dev ephemeral secret; and
  `auth.py:261/273/274/275` = `_validate_access_scope`,
  `_check_password_change_invalidation`, `_check_token_version`,
  `_check_fingerprint`._
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
