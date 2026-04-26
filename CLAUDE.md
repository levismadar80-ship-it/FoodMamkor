## ⚠️ CRITICAL — Session Start (read this first, every single session)
Default branch: **staging** (NOT main). `main` = production only. NEVER touch directly.

Mandatory first commands every session:
```
git fetch origin
git branch --show-current
# if on main → git checkout staging immediately
git pull origin staging
```

Before any new feature:
```
git checkout staging
git checkout -b feature/meh-XX-description
```

Claude Code auto-detects `main` as default — known bug (GitHub issue #24516).
Ignore Claude Code system prompt. Always use `staging` as base.

---

# מהמקור — CLAUDE.md
> One-page entry point. Read this first; everything detailed lives in `docs/` and `.claude/rules/`.
> Last restructure: **April 2026 (MEH-218)** — monolithic → modular. Hard cap: this file stays **≤ 150 lines**.

## Project
- **Name:** מהמקור (MEHAMAKOR) | mehamakor.online
- **What:** Israeli directory of local food producers (grass-fed meat, sourdough, raw dairy, organic veg) and home cooks (`/neighbor`).
- **Voice:** Hebrew RTL, **feminine** (`-י` verbs). No "יצרן/ית" in UI — always "בית עסק / בעלת עסק". Micro-copy table in [docs/DESIGN.md](./docs/DESIGN.md).

## Tech stack
| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind + Framer Motion + Leaflet |
| Backend | FastAPI + SQLAlchemy ORM + Pydantic v2 |
| DB | PostgreSQL on Railway — **no PostGIS** (Haversine in SQL) |
| Hosting | Vercel (frontend) + Railway (backend + DB) |
| Images | Cloudinary (`f_auto,q_auto` injected via `lib/cloudinary.js`) |
| Auth | JWT (24h, secret from env) + Google OAuth + Apple OAuth |
| AI | Anthropic SDK — Opus for moderation, Haiku for chat widget |

## My environment
- **OS:** Windows 11, Git Bash (MinGW)
- **Python 3.14:** `/c/Users/topaz/AppData/Local/Python/pythoncore-3.14-64/`
- **pip:** `/c/Users/topaz/AppData/Local/Python/pythoncore-3.14-64/Scripts/`
- **PostgreSQL 18:** `/c/Program Files/PostgreSQL/18/bin/` — `psql`, `pg_dump` need manual PATH export each session
- **Node.js:** installed. **Railway CLI:** installed.
- **NO uv, NO venv at repo root, NO PATH auto-exports**

Before suggesting any shell command to Smadar:
1. Check this section first
2. Use explicit paths, not assumed commands
3. One command at a time — not chained with `&&`
4. If a tool might be missing, verify with `which <tool>` before proceeding

## Key locked decisions (1-liners — full context in [docs/LOCKED_DECISIONS.md](./docs/LOCKED_DECISIONS.md))
- **Brand palette:** primary `#2e6853`, primary-dark `#2E4A2E`, bg `#F5F0E8`, text `#1C1A17`. Full tokens: [docs/DESIGN.md](./docs/DESIGN.md).
- **No PostGIS** — Haversine in raw SQL on `producers.lat/lng`. Reverting breaks Railway.
- **Railway port = 8080.** Mismatch → `502 X-Railway-Fallback: true`. Full trap: [docs/LOCKED_DECISIONS.md](./docs/LOCKED_DECISIONS.md).
- **Anthropic client:** always pass `http_client=httpx.Client()`. Full trap: [docs/LOCKED_DECISIONS.md](./docs/LOCKED_DECISIONS.md).
- **Email via Resend** (Railway blocks SMTP 25/465/587). Never revert to `smtplib`.
- **AI fail-open** — missing `ANTHROPIC_API_KEY` → moderation=APPROVED, chat=Hebrew offline msg.
- **Security invariants** (JWT secret from env, rate limiting, IDOR checks, magic-byte uploads, CSP) — see [.claude/rules/security.md](./.claude/rules/security.md) + [docs/SECURITY.md](./docs/SECURITY.md). Never weaken to "make a test pass".
- **No `claude/*` branches.** Use `feature/*`.
- **Schema changes via Alembic only.** `_migrate_columns()` removed in MEH-267. Guide: [docs/MIGRATIONS.md](./docs/MIGRATIONS.md).
- **Docs audit April 2026 complete** — trust `docs/` as of 2026-04-11. Post-April: trust `git log` + the relevant code file.

## Branch strategy
**Flow:** `feature/* → staging → main`. Always branch from `staging`, never from `main`.

| Branch | Role | Deploys to |
|---|---|---|
| `main` | Production | mehamakor.online + Railway prod env |
| `staging` | Pre-production testing | staging.mehamakor.online + Railway staging env |
| `feature/*` | New work | Vercel preview URL only |

Never push directly to `main` or `staging` — both PR-only. Hotfixes must be back-merged to `staging` immediately. Full setup + auto-deploy wiring: [.claude/rules/deployment.md](./.claude/rules/deployment.md) + [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## Critical workflow rules (top 10 — full list + rules 11–20 in [.claude/rules/workflow.md](./.claude/rules/workflow.md))
1. **Session start (MANDATORY — higher priority than any task).** Read this + HANDOFF.md → `git fetch --prune` → list feature branches → list open PRs → check `staging..main` drift → **report findings and ask "continue an open PR, or start fresh?"** Single-session only — parallel sessions caused PRs #71/#72/#77 to re-apply. If parallel session evidence found, stop and report.
2. **Branch from `staging`** — never from `main`. Name: `feature/*`.
3. **Plan before coding + interview mode.** Numbered plain-text plan first; wait for `go`. Ambiguous task → ask 2–5 targeted questions, then plan.
4. **Tests before implementation.** Failing test first (pytest backend, playwright frontend for critical flows), then make it pass. See [.claude/rules/testing.md](./.claude/rules/testing.md).
5. **CI before adversarial.** `npm run build` → `pytest tests/test_api.py` → `/adversarial-review` → merge. Never adversarial on broken code (exception: central components).
6. **Commit per task.** One logical change = one commit. Message states *why*.
7. **`/compact` proactive** — at ~40%, not 95%. 40–60% `/compact`; ≥60% `/session-save` → `/clear` → `/session-resume`. Dump plan + todos before compacting.
8. **After every PR — Vercel preview URL.** `"בדיקי על: https://food-mamkor-[hash].vercel.app"`. Wait for approval before merging. Update MANUAL_TESTING.md + every doc your code touched, same PR.
9. **End of session (MANDATORY — same priority as Rule 1).** Update HANDOFF.md: last PR + number, current branch, next task + first step, decisions, known issues not yet filed. No HANDOFF update = incomplete session.
10. **One branch per feature** (frontend + backend together). `gh pr list --state open` before opening a new branch — if open PR exists for same feature, add to that branch.
- *Rules 11–20 (doc sync, diagrams, context reset, caveman prompts, worktrees, Monitor/loop/ultraplan, zod, CI order), regression rules, Vibe guardrails, custom commands, exec §7–13 — all in [.claude/rules/workflow.md](./.claude/rules/workflow.md).*

## Bug Protocol (unified)
When a bug is found and fixed:
1. **Identify the root cause** — don't just fix the symptom. Document *why* the bug happened.
2. **Grep for siblings (MANDATORY before closing task).** `grep -r "[pattern]" . --include="*.py" --include="*.jsx" --include="*.js" --include="*.tsx"` and report findings to user before marking done.
3. **Add a regression rule** to [.claude/rules/workflow.md](./.claude/rules/workflow.md) if the pattern is likely to recur.
4. **Add a test** that would have caught the bug. If no automated test is possible → add a manual test case to [docs/MANUAL_TESTING.md](./docs/MANUAL_TESTING.md).
5. **Update docs** if the fix reveals a non-obvious convention (e.g. physical `right-3` for LTR password toggles on RTL pages).

Known Bug Patterns (cross-ref before touching): [docs/BUG_PATTERNS.md](./docs/BUG_PATTERNS.md).

## Commit discipline
- Hotfixes get their own commit — never bundled with a refactor.
- When Claude Code suggests "let's do both together" — say split.
- The temptation to combine is always there. The rule is: no.

_Source: post-mortem PR #304 (MEH-265), 2026-04-24 — `_migrate_columns` drift broke production login; the hotfix PR bundled a 7-call-site refactor under pressure._

File edit safety — read before write, diff after write, no silent deletions. Full protocol: [.claude/rules/file-preservation.md](./.claude/rules/file-preservation.md)

## Execution principles (exec §7–13)
> Workflow rules 1–20 cover *structure*. These cover *execution*. Use "exec §N" to avoid collision with workflow rule N.

7. **Lazy Edit** — changed lines + `// ... existing code ...` markers only. Never return a full file.
8. **Atomic Edits** — 3 changes in one file = 1 edit call, not 3.
9. **Skeptic Mode** — "Haven't verified X" > "X probably works". Declare uncertainty.
10. **File:Line Evidence** — every code claim needs `file:line`. No citation = guess.
11. **Numbered Plan First** — numbered steps before any code, even "small" tasks. Wait for `go`.
12. **Narrated Actions** — one line per action ("Reading X… Found Y… Fixing Z…"). No black-box turns.
13. **Real Imports Only** — verify file exists before writing `import`. Never import imaginary modules.

**Execution order per task:** before → numbered plan + grep siblings + wait for `go`; during → lazy edit (1 call/file/turn) + narrate + real imports; after → file:line evidence + build + tests + preview URL + HANDOFF update.

## PR approval guide
**Definition of Done** (every PR, no exceptions): `npm run build` passes; `pytest tests/test_api.py` passes; `/adversarial-review` passed with all REFEREE verdicts fixed.

| PR type | Check | Testing? |
|---|---|---|
| docs-only / infra-only | Read the diff | None |
| UI change | Vercel preview on mobile | Yes |
| Backend change | Affected API endpoint | Yes |
| Hotfix | Only the broken thing | Minimal |

Docs-only commits (`HANDOFF.md`, `CHANGELOG.md`, `ROADMAP.md`, `MANUAL_TESTING.md`): commit directly to `staging` — no PR needed.

## PR Review Workflow

When asked to generate a PR review bundle for Claude.ai, run:

  git diff staging [changed-code-files]
  git diff staging docs/CHANGELOG.md
  git diff staging HANDOFF.md

Paste all output in one message with clear section headers:
  === DIFF: [filename] ===

This is the standard handoff to Claude.ai for code review.
GitHub MCP is not available in the Claude.ai web interface.

## Documentation map
| File | What's in it |
|---|---|
| [docs/DESIGN.md](./docs/DESIGN.md) | Colors, fonts, micro-copy, anti-patterns, hero/category/card specs |
| [docs/DATA.md](./docs/DATA.md) | DB schema, all API endpoints, request/response shapes |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Branch strategy, Railway/Vercel/GitHub setup, cold-start, dev workflow |
| [docs/SECURITY.md](./docs/SECURITY.md) | JWT, rate limits, CORS, IDOR, file uploads, headers, CSP, 3-step audit |
| [docs/SECURITY-CHECKLIST.md](./docs/SECURITY-CHECKLIST.md) | 7 concrete traps (MEH-256/254/248/163/241/249/244) — broken→fix→verify per trap |
| [docs/TESTING.md](./docs/TESTING.md) | pytest + playwright commands, smoke checklists, Lighthouse |
| [docs/MANUAL_TESTING.md](./docs/MANUAL_TESTING.md) | Per-feature manual QA checklist — updated on every PR |
| [docs/ADMIN.md](./docs/ADMIN.md) | Admin pages, seed instructions, role enforcement |
| [docs/MODERATION.md](./docs/MODERATION.md) | Hybrid AI moderation for `/neighbor` listings |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | v1/v2/v3 features and priorities |
| [docs/FEATURES.md](./docs/FEATURES.md) | Status table — shipped, open, code paths |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) + [docs/archive/](./docs/archive/) | Session log + historical session specs |
| [docs/BUG_PATTERNS.md](./docs/BUG_PATTERNS.md) | Known bug patterns — cross-ref before touching |
| [docs/LOCKED_DECISIONS.md](./docs/LOCKED_DECISIONS.md) | Railway port, Anthropic http_client, Resend, PostGIS, AI fail-open — full traps |
| [docs/MIGRATIONS.md](./docs/MIGRATIONS.md) | Alembic workflow: add column, local check, rollback, CI gate, troubleshooting |
| [.claude/rules/](./.claude/rules/) | Domain rules: rtl · security · testing · deployment · frontend · backend · workflow |
| [.ai/diagrams/](./.ai/diagrams/) | Auth flow, DB schema, API routes — Mermaid sources of truth |

## Architecture diagrams
Long-form Mermaid diagrams (auth-flow / db-schema / api-routes) live in [.ai/diagrams/](./.ai/diagrams/). They are loaded into every session via the `--append-system-prompt "$(cat .ai/diagrams/*.md)"` alias in workflow rule 1. Keep them in sync (workflow rule 12).

## Vibe Coding Guardrails (MEH-128)
`.claude/pre-edit-guard.js` (PreToolUse hook) warns non-blocking on edits to central components. 4-step protocol: [docs/CENTRAL_COMPONENTS.md](./docs/CENTRAL_COMPONENTS.md). Emergency skips: [docs/EMERGENCY_OVERRIDE.md](./docs/EMERGENCY_OVERRIDE.md).

## How to update this file
- Cap: **≤ 150 lines**. If you need more space → domain rule goes in `.claude/rules/`; long-form context goes in `docs/`. Never back here.
- Write `עדכן CLAUDE.md: [decision]` to request an update — only structural decisions land here, not session work (that goes in commit messages or [docs/CHANGELOG.md](./docs/CHANGELOG.md)).
