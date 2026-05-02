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
