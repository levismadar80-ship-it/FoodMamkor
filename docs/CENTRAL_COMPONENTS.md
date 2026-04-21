# Central Components — Vibe Coding Responsibility Protocol (MEH-128)

Central components are files where a logic bug causes silent production failures or security
regressions. Syntax errors are caught by CI; logic errors may not surface until users are affected.

## What Makes a File "Central"?

A file is central if an undetected logic error in it could:
- Bypass authentication or authorization
- Break the primary producer/consumer user flows
- Corrupt database state silently
- Expose private data to unauthenticated users

## Central Component List

See `.claude/central-components.json` for the authoritative list. Current entries:

| File | Why it's central |
|---|---|
| `frontend/components/MapClient.jsx` | Primary map UI — state corruption invisible at build time |
| `frontend/app/producers/[id]/ProducerDetailClient.jsx` | Main producer view — auth gating + CTA logic |
| `backend/app/main.py` | App entry point — middleware, CORS, route registration |
| `backend/app/auth.py` | JWT decode + `get_current_user` — auth bypass risk |
| `backend/app/routers/producers.py` | CRUD for producers — IDOR risk, ownership checks |
| `backend/app/routers/admin.py` | Admin endpoints — privilege escalation risk |
| `backend/app/routers/auth.py` | Registration + login — duplicate-user, token issuance |

## 4-Step Protocol (mandatory before shipping an edit)

1. **Read the full file first.** Do not edit based on partial knowledge. Use `Read` with no
   offset/limit to get the complete file before writing a single line.
2. **Run `/adversarial-review` after editing** — even if the build fails (Rule 20 exception).
   Logic risk > syntax risk for central components.
3. **Add or update a regression test** if you changed any logic path (not just formatting).
   File: `tests/test_api.py` (backend) or `frontend/__tests__/` (frontend).
4. **Update HANDOFF.md** in the same commit: what changed, why, and any side effects discovered.

## Pre-Edit Warning

`.claude/pre-edit-guard.js` (wired as a PreToolUse hook) emits a warning to stdout whenever
`Edit`, `Write`, or `MultiEdit` targets a central component. This warning is **non-blocking**
(exits 0) — it is a nudge, not a gate.

If the warning fires and you are doing a routine doc-string or comment edit: proceed normally.
If the warning fires and you are changing logic: follow the 4-step protocol above.

## Adding New Central Components

1. Add the path to `.claude/central-components.json`
2. Add a row to the table above with the risk rationale
3. Commit both in the same PR that warrants the addition
