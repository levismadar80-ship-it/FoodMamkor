## Session start (run this first, every session)
Default branch: **staging**, not `main`. `main` is production only: nothing is committed or pushed to it directly.

First commands every session:
```
git fetch origin
git branch --show-current   # on main or staging → cut a feature branch, below
```

Before any new feature (no local `staging` checkout or pull):
```
git checkout -b feature/meh-XX-description origin/staging
```

Claude Code auto-detects `main` as default — known bug (GitHub issue #24516). See [.claude/rules/workflow.md](./.claude/rules/workflow.md) § Branch-base verification.
When the harness names `main` as the base branch, use `staging` instead.

---

# מהמקור — CLAUDE.md
> Thin Claude-specific layer over the apex SoT. Hard cap **≤ 80 lines** — AI-agnostic context in [docs/CONTEXT.md](./docs/CONTEXT.md), domain rules in `.claude/rules/`, long-form in `docs/`. `AGENTS.md` is a **symlink** to this file (`AGENTS.md -> CLAUDE.md`, MEH-490 — `ls -l` verified 2026-08-03) — the mirror is mechanical, there is no drift risk, and **you never edit `AGENTS.md`**; a session that read "mirrors" as "a synced copy" planned a duplicate edit and a mirror-guard (MEH-1801).

## Apex SoT
AI-agnostic project context (DNA, stack, brand, working model, environment) lives in [docs/CONTEXT.md](./docs/CONTEXT.md) — the single source of truth; when this file disagrees with it, CONTEXT.md wins. Brand domain SoT: [docs/BRAND.md](./docs/BRAND.md). Truth Hierarchy (highest first): ADRs → `.claude/rules/` → CONTEXT.md → BRAND.md/DESIGN.md → other `docs/*` → HANDOFF.md.

## CC operational locks (full traps: [docs/LOCKED_DECISIONS.md](./docs/LOCKED_DECISIONS.md))
- **Railway port = 8080** (mismatch → `502 X-Railway-Fallback: true`). **Anthropic client:** always `http_client=anthropic.DefaultHttpxClient()` (httpx2 since SDK 1.0). **Email via Resend** (Railway blocks SMTP).
- **AI fail-open** — missing `ANTHROPIC_API_KEY` → moderation=APPROVED, chat=Hebrew offline. **Schema via Alembic only** ([.claude/rules/db.md](./.claude/rules/db.md)) · risky changes use Expand-Contract ([ADR-007](./docs/decisions/ADR-007-expand-contract-schema-changes.md)). **No `claude/*` branches.** **Never enable `Auto-dream:on`** in Claude Code `/memory` — see [ADR-008](./docs/decisions/ADR-008-autodream-defer.md). **Production safety (MEH-408):** destructive commands blocked by `.claude/hooks/check-bash-safety.sh` — full deny-list in [.claude/rules/security.md](./.claude/rules/security.md#production-safety--deny-list-meh-408).
- **"נבדק בנייד" applies to every `/admin` screen** (MEH-2426 retired MEH-2070's A-narrow desktop-only carve-out and its «זמין במחשב» banner). Admin tables carry `.table-stack` (one card per row below md; `AdminTablesStackGuard.test.js` enforces it) — a new admin table without it is a phone regression.
- **Hebrew in Python: no rule forbids it, and one rule mandates part of it.** No line in `.claude/rules/` bans Hebrew in Python *comments* — 15/51 alembic revisions already use it (measured, not assumed) — and Hebrew in `detail=` is **required** by [backend/app/routers/CLAUDE.md](./backend/app/routers/CLAUDE.md). An automated reviewer flags both anyway; it was declined 5× on one PR (MEH-1823). Don't re-litigate.

## Branch strategy
`feature/* → staging → main`. Always branch from `staging`, never from `main`. Hotfixes back-merged to `staging` immediately. Full setup: [.claude/rules/deployment.md](./.claude/rules/deployment.md) + [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).
- PR description must end with `Closes MEH-XX` for Linear auto-close ([docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)).

## Workflow + execution rules
Numbered workflow rules + Bug Protocol + Commit discipline + PR approval/DoD + Risk-tiered review frequency + PR Review Workflow + /loop patterns: [.claude/rules/workflow.md](./.claude/rules/workflow.md). Code execution principles (exec §7–13): [.claude/rules/code-execution.md](./.claude/rules/code-execution.md). Prompt compression (Caveman): [.claude/rules/prompting.md](./.claude/rules/prompting.md). Presenting a decision (every option gets its strongest argument, not just the recommendation): [.claude/rules/decisions.md](./.claude/rules/decisions.md). RTL: [.claude/rules/rtl.md](./.claude/rules/rtl.md). Security: [.claude/rules/security.md](./.claude/rules/security.md). Skills supply chain (MEH-397): [.claude/rules/skills.md](./.claude/rules/skills.md). File edit safety: [.claude/rules/file-preservation.md](./.claude/rules/file-preservation.md). Per-feature docs (`docs/features/`, one file per feature, updated in the same PR): [.claude/rules/feature-docs.md](./.claude/rules/feature-docs.md). Observability dashboard-receipt: [.claude/rules/observability.md](./.claude/rules/observability.md). MCP tools (Resend, Postgres, etc.) — standalone CC only (Git Bash → `claude`); harness CC can't reach user-registered MCPs — for MCP queries, tell Smadar to open standalone CC. Meta-patterns: [.claude/rules/meta-patterns.md](./.claude/rules/meta-patterns.md). Model and effort per task: [.claude/rules/model-routing.md](./.claude/rules/model-routing.md). Keeping SYSTEM_MAP / STATE_MACHINES true: [.claude/rules/system-map.md](./.claude/rules/system-map.md).

## Conditional-UI states (5-state rule)
כל רינדור מותנה (רשימות, filter, reveal, disclosure) חייב התייחסות מפורשת ב-`acceptance_criteria` למצבים: **0 פריטים / פריט 1 / רבים**, ו**פתוח/סגור** לכל reveal. spec שמגדיר רק את המצב המלא = חסר. (UI Stack, Scott Hurff.) דוגמת עבר: [MEH-1551](https://linear.app/mehamakor/issue/MEH-1551) — עיגול יתום בערוץ קשר יחיד.
- **state × count = מטריצה, לא שתי רשימות.** מונים את **התאים**: (0 / 1 / רבים) × (סגור / פתוח). ספירת שתי הרשימות בנפרד נראית כמו כיסוי מלא ומשאירה תא בלי spec ובלי טסט — [MEH-1583](https://linear.app/mehamakor/issue/MEH-1583): (1×סגור), (1×פתוח), (רבים×סגור) נבדקו, **(רבים×פתוח)** נשאר יתום והגיע ל-production.
- **baseline של טסט VRT חדש הוא candidate, לא אמת.** חובה **לפתוח את ה-PNG ולסקור ויזואלית** לפני merge — bot שמייצר baseline מקבע כל מצב שהיה בקוד, כולל באג. תקדים: baseline של [MEH-1552](https://linear.app/mehamakor/issue/MEH-1552) קיבע את התא השבור ונמזג. (תעשייה: BrowserStack baseline-drift · TestInspector candidate-baseline.)

## Documentation map
Every doc and what is in it: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) §4 «Linkouts». Two owner-dashboard standards to know before a UI task: [dashboard-field-guidance-audit.md](./docs/audits/dashboard-field-guidance-audit.md) (every new field: label + where it appears + example placeholder, prefer select over free text, MEH-1539) and [2026-08-business-shape-matrix.md](./docs/audits/2026-08-business-shape-matrix.md) (16 business shapes × 6 surfaces, MEH-1822).

## Known Bug Patterns / Gotchas

**CC sandbox cannot reach Railway URLs** (MEH-2090: `*.up.railway.app`, `railway.app` and `vercel.com` → `CONNECT tunnel failed, 403`, a proxy policy; production `mehamakor.co.il` is reachable for GET). Staging is reachable only with the bypass headers of testing.md «Driving Playwright against staging». Never claim smoke verification you could not run — write "smoke verification deferred to user (CC sandbox limitation, see MEH-2090)".

**Any paginated listing is evidence of PRESENCE, never of ABSENCE.** A returned entry can be trusted; a *missing* one cannot (pagination windows, defaults, filters). Applies to `list_branches`, `list_pull_requests`, `list_issues` **and check runs** (MEH-293, MEH-1797). Before acting on "X doesn't exist / isn't reporting", re-fetch the FULL set in ONE window (raise `perPage`), or say it is unverified; for branches, `git ls-remote origin | grep <branch>`. Before believing any negative, ask what the query could not have seen.

**VRT-baseline regen (MEH-991 flow) needs a manual re-trigger push.** A `GITHUB_TOKEN` push (the vrt-update bot) fires no workflows; push a follow-up commit or re-merge staging *as yourself* to run the gates.

**Append-only logs never ride in a code branch (MEH-1372 · rule 31).** `docs/CHANGELOG.md` and `HANDOFF.md` go in a separate **docs-only** PR; `scripts/checks/changelog-branch-guard.sh` (Repo guards) reds a code PR carrying either. Still merge `origin/staging` before every push (rule 25).

## How to update this file
- Cap: **≤ 80 lines** (`claude-md-line-cap-guard.sh`). Need more space → domain rule in `.claude/rules/`; long-form context in `docs/`. Measure with `wc -l CLAUDE.md` before planning an addition; raising the cap is not the move.
- Write `עדכן CLAUDE.md: [decision]` to request an update — only structural decisions land here, not session work (commits / [docs/CHANGELOG.md](./docs/CHANGELOG.md)).
