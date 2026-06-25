# Mehamakor — Project Context

**Single source of truth for AI assistants and human contributors.**
**Last reviewed:** 2026-05-23 · **Format:** AGENTS.md / CONTEXT.md pattern (PrestaShop, March 2026)

> Tool-specific files (`CLAUDE.md`, `personal-preferences-v2.md`, IDE-specific configs) are thin pointers to this file. When they disagree with this file, this file wins (see Truth Hierarchy below).

---

## 1 · What Mehamakor is

Mehamakor (`mehamakor.online` / `mehamakor.co.il`) is a Hebrew-RTL editorial directory for licensed Israeli local food businesses. Magazine, not marketplace. Cohort 1 is licensed businesses only (Ministry of Health permit).

**Founder + developer:** Sapir Levi (solo).

**Tagline (locked, see ADR-011):**
> מהמקור — הבית הראשון של העסק שלך. המקום שבו הסיפור מתחיל.

## 2 · DNA — locked, cannot change without formal discussion

These rules pass through every product decision. If a design choice violates one, STOP and ask.

- **Magazine, not marketplace.** Every design decision passes through this test.
- **No transaction fees, ever.** No commissions, no checkout. (See ADR-010 for the six pricing LOCKs.)
- **Manual approval for every business.** No auto-approve at any scale.
- **Two-tier licensing (ADR-022).** מאומת (license verified, gold badge, free forever) / מוצהר (binding declaration, legally exempt categories only — never negatively labeled). Unlicensed food production where a license is legally required stays out. No home cooks — illegal in Israel.
- **No "שכנות מבשלות מהבית" / "אוכל ביתי" / "מהמטבח של השכן"** in marketing copy. Ever.
- **No "יצרן" / "יצרנית"** in UI — always "בית עסק" / "בעלת עסק".

## 3 · Truth Hierarchy

When two documents disagree, resolve in this order (highest authority first):

```
1. ADRs (docs/decisions/)
2. .claude/rules/ (path-scoped operating rules)
3. docs/CONTEXT.md (this file)
4. docs/BRAND.md, docs/DESIGN.md (domain SoTs)
5. docs/* (general technical references)
6. HANDOFF.md (rolling 7-day active state)
7. Drive (working drafts, archive)
8. Project Knowledge (Claude.ai chat surface — manual copies, not canonical)
9. userMemories (Claude L3 cache — recent learnings only)
```

When two documents at the same level own the same fact, **one is deleted, not disabled** (this extends the MEH-271 "two parallel mechanisms" rule to docs; the corresponding `.claude/rules/workflow.md` 1-line append lands in Phase η of MEH-686).

## 4 · Stack

Next.js + Tailwind → Vercel (frontend) · FastAPI + Python → Railway (backend) · PostgreSQL with **Alembic as sole schema authority** (post-MEH-265, see ADR-003 + ADR-007) · Cloudinary (images) · Leaflet + OpenStreetMap (maps) · JWT + Google OAuth (auth) · Linear (MEH-XX issues) · GitHub (CI/CD) · Claude Code (file execution). Anthropic SDK: Opus for moderation, Haiku for chat widget.

## 5 · Brand locks (summary — full version in docs/BRAND.md)

- **Colors:** primary `#2e6853` · background `#F5F0E8` (warm cream — NEVER pure white) · text `#1C1A17`. Full token table in `docs/DESIGN.md`.
- **Fonts:** Frank Ruhl Libre 900 for Hebrew headlines · DM Sans for body. Full font stack (Latin accents, Hebrew fallback, weights, loading) in `docs/DESIGN.md`.
- **Voice:** Hebrew RTL, hybrid policy — gerund/plural for UI, feminine allowed for brand narrative (see ADR-014, refined by ADR-024 — surface-function + owner-noun gender)
- **Hero direction:** Direction A canonical · Direction B campaign-only with 3 preconditions (see ADR-018)
- **Component state tokens:** opacity-on-cream + `--fg-muted` only; no new state-color tokens (see ADR-019)
- **Icons:** three-tier — Phosphor for functional UI, hand-drawn SVG for category glyphs, custom illustration for editorial (see ADR-013). **Lucide FORBIDDEN.**
- **No emoji in UI / ICU / brand-guidance / editorial surfaces.** Allowed: WhatsApp outbound, share strings, email body. (MEH-657 LOCK v2.)

## 6 · Working model

### Authority model (ADR-016: GREEN / YELLOW / RED)

- **GREEN (low risk):** docs-only, copy, i18n, single-file deps, tests, CI YAML without behavior change. Claude Code end-to-end authority. Sapir reviews PR only.
- **YELLOW (medium risk):** multi-file refactor (3–7 files) non-central, non-shared components, copy-with-logic, CI workflow YAML with behavior change. Plan approval + execute end-to-end with per-chunk summary. Sapir reviews PR.
- **RED (high risk):** auth, schema, security, central components (`CLAUDE.md`, `tailwind.config.js`, `main.py`, `frontend/messages/he.json`), production deploys, brand-level decisions. Chunk-by-chunk + WAIT gates per chunk. Sapir approves each chunk + merge.

Default when uncertain: ask before granting authority. Never silently upgrade GREEN → YELLOW or YELLOW → RED.

### Communication style

Terse Hebrew. `"go"` / `"merge"` / `"מאשרת הכל"` / `"כן"` = approval. No verbose acknowledgments back. Sapir uses feminine self-reference; Claude addresses Sapir in feminine.

### Description = source of truth

Linear issue descriptions are the authoritative scope. Fixes after a prompt is sent → edit the description, never add a comment. Description-vs-comment is a "two parallel mechanisms" violation.

## 7 · Skeptic Mode (always on)

**What:** file:line evidence for every code claim. "Haven't checked X yet" beats "X probably works."
**Why:** untested assertions cost more debug time than admitting uncertainty.
**How:** stop after 2 failed attempts on the same problem. Surface the problem to Sapir. Never silently try a 3rd workaround.

Block merges of untested PRs. Use FINDER → ADVERSARY → REFEREE for adversarial review.

## 8 · Connector verification (4-layer)

Before any action on Drive, Slack, Linear, Gmail, Sentry, Vercel, Notion, Canva, Cloudinary, Jotform:

- **L1 — Tool load:** `tool_search` to confirm the connector is loaded.
- **L2 — Live probe:** cheap action (`search_files` for Drive, `list_issues` for Linear, etc.). Auth error → fail loud and suggest re-connect. Empty results → ask "expected X, didn't find — wrong folder?" Expected data → proceed.
- **L3 — Mid-task failure:** STOP. No silent retries, no workarounds. Surface options to Sapir: (a) reconnect, (b) skip, (c) different approach.
- **L4 — Long sessions (>30 messages):** re-verify connector access before the next action burst. Auth tokens drift; never assume.

## 9 · Skeptic Mode applied to orchestrator claims

When Claude Code finds disagreement with file:line evidence against an orchestrator (Claude.ai chat) claim, the orchestrator is **wrong by default**. Claude.ai memory and inferred facts CAN be wrong (proven 3x on 2026-05-23 alone). Pattern: CC Phase 0 disagreement → STOP, orchestrator verifies against UI before "go".

## 10 · DB migrations — Alembic only

Every schema change goes through an Alembic revision. Risky changes (DROP COLUMN, RENAME, type change, NOT NULL on existing, FK reversal) use the 4-phase Expand-Contract pattern. Full operational checklist in ADR-007.

**Forbidden:** `_migrate_columns()` in `main.py` — deleted in MEH-267, was root cause of the MEH-265 incident. If Claude Code proposes editing it, STOP — that function does not exist.

## 11 · CC prompt style (Caveman)

- Numbered plan + file:line evidence required BEFORE any edits.
- Lazy edits with `// ... existing code ...` markers; no full-file returns.
- Atomic edits per file (one edit per file per turn).
- Build verification BEFORE push.
- "Push ≠ Go" — CC never pushes before explicit push approval.
- PR descriptions end with `Closes MEH-XX`.
- Branch: `feature/meh-XXX-slug` off `staging`.

## 12 · Templates (v2.1) — in `docs/templates/`

Canonical location: `docs/templates/` (per ADR-020). Project Knowledge holds a manual snapshot (non-canonical, refresh on canonical change).

The canonical, enumerated index (all templates + recommended models) lives in [`docs/templates/README.md`](./templates/README.md) — the single source for the set; not duplicated here to avoid drift. Template 09 (Council Mode) status under reconciliation in MEH-690.

Every Linear issue uses 8 sections + XML positive framing in the prompt: `<role>` · `<intent>` · `<acceptance_criteria>` · `<file_locations>` · `<scope>` · `<constraints>` · `<examples>` · `<confidence_calibration>` · `<over_engineering_guard>` · `<verification_step>`. If task type is unclear → ask, don't guess.

## 13 · Decision capture (proactive — ADR-009)

When a conversation produces an architectural decision, Claude offers:

> `"זה ADR-worthy. רוצה שאכתוב ל-docs/decisions/?"`

Trigger phrases: *defer · adopt · abandon · "decision is" · "we'll go with" · trade-off resolved · pattern X selected · "going forward we'll" · "rejected because" · spike outcome*.

## 14 · Definition of Done

- ✅ Build green (`npm run build` + `pytest`)
- ✅ Preview URL sent to Sapir
- ✅ Mobile-checked (exception: tests-only / docs-only / CI YAML)
- ✅ CHANGELOG.md updated
- ✅ HANDOFF.md updated

## 15 · Living vs frozen documents

- **Frozen** (versioned via ADR supersedence): ADRs, this file (`docs/CONTEXT.md`), `docs/BRAND.md`, `docs/DESIGN.md`.
- **Living** (overwritten in place): `HANDOFF.md` (rolling 7-day), Linear issue state, Drive working drafts.
- **Versioned** (append-only): `docs/CHANGELOG.md`.

A change to a frozen document requires a new ADR superseding the prior decision. Living documents change every session.

## 16 · End-of-session protocol

Before closing any conversation longer than 30 messages OR containing important decisions, Claude must:

1. Update `HANDOFF.md` with: what shipped, what's pending, decisions made, context needed for the next session.
2. Update `memory_user_edits` (`userMemories`) with: new patterns (NOT volatile state), permanent decisions. Every entry starts with `(YYYY-MM)` prefix.
3. Ask Sapir: "האם `docs/CONTEXT.md` (Project Knowledge copy) תקף, או יש דברים שצריך לעדכן?"

If the session ends mid-task, write a detailed `session-state.md` with continuation prompt.

When Sapir says `"הקשר מתמלא"`, open a new chat and attach `session-state.md` from HANDOFF.

## 17 · Reference files (request on demand)

`HANDOFF.md` · `DEPLOYMENT.md` · `CHANGELOG.md` · `MANUAL_TESTING.md` · `SECURITY.md` · `ROADMAP.md` · `MIGRATIONS.md` · `BRAND.md` · `DESIGN.md` · `decisions/ADR-NNN-*.md`

### Strategy & Inspiration (Drive — canonical, edit there)
- Competitive landscape → Drive 01-Strategy/04-competitive-landscape.md
- Design swipe file → Drive 03-Brand-Hub/06-inspiration-swipe-file.md

## 18 · Workflow integrity (lessons learned)

- **Doc-vs-merge integrity:** CHANGELOG entries are NOT proof a PR merged. Verify via lockfile + git log + Linear `completedAt` + attached PR state.
- **PR title scope:** `"docs:"` in title ≠ docs-only diff. Run `gh pr view #N --json files` before approving.
- **Pre-go scope match:** before approving "go" on a plan, scope-match against live Linear description. Surface gaps. Never assume scope reduction.
- **CI trigger split:** direct push to `staging` triggers only `deploy.yml` + `e2e.yml`. PR-only workflows (Frontend build, pytest, adversarial review, dep audits) do NOT run on staging push.
- **Symptom vs root cause:** before opening a "fix systemic bug X" epic from a PR/issue snapshot, verify the suspected config/file on staging directly (proven MEH-681).
- **Mid-task scope extension:** when CC discovers drift in a file already in scope (e.g. README row missing while editing same file), prefer +1 same-file fix in same PR over a follow-up PR.

## 19 · Architecture smells (flag proactively)

- "Remember to update X when you change Y" in CLAUDE.md → brittle mechanism. Replace with a real tool (Alembic, Zod, Pydantic, CI gate).
- Subagents are LLMs, not shell executors. Externalize complex bash to `.claude/scripts/*.sh` (MEH-373 lesson).
- Two documents owning the same fact is the original sin. One is deleted, the other becomes canonical.

## 20 · Environment (Sapir's machine)

Windows 11 + Git Bash. Python 3.14 at `/c/Users/topaz/AppData/Local/Python/pythoncore-3.14-64/`. PostgreSQL 18 CLI at `/c/Program Files/PostgreSQL/18/bin/` (not on PATH; re-export per session). One command at a time — no `&&` chains. No `pytest | tail` (blocks on Windows). Sapir works frequently from mobile; responses should be 1–2 mobile screens.

Branch convention: `feature/meh-XXX-slug` off `staging`. Never commit to `main` or `staging` directly. Hebrew characters in branch names break git on Windows — always use the ASCII branch name from the Linear issue's Branch section.

## 21 · Memory hygiene

The right home for a piece of information depends on its half-life:

| Half-life | Home |
|---|---|
| ≥ 6 months (DNA, stack, brand, workflow rules) | This file (`docs/CONTEXT.md`) |
| Weeks (active PRs, in-flight decisions) | `HANDOFF.md` |
| Days (recent learnings, patterns observed in the last 30 days) | `userMemories` |
| Permanent decisions | `docs/decisions/ADR-NNN-*.md` |

**Never put volatile state in this file.** When in doubt, default down the table (shorter half-life). Promotion is cheap; demotion is expensive (requires deletion or supersedence).

---

*This document is the AI-agnostic apex source of truth. Update it on every strategic shift. Tool-specific files (CLAUDE.md, personal-preferences-v2.md, IDE configs) are thin pointers to this file.*
