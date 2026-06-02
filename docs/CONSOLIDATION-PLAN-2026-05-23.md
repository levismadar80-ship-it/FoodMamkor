# מהמקור — Documentation Consolidation Plan

**Date:** 23 May 2026
**Status:** ready for execution (Sapir's 4 gating decisions resolved, see §B.0)
**Founder:** Sapir Levi (canonical post-Y4 decision)
**Session 1 output** — canonical deliverable for Session 2 handoff
**Sources:** GAP-INVENTORY (60+ findings A-U) · Verify on 6 items · Coverage on 22 sources · Y findings (12 new) · Web research (7 searches, May 2026)

---

## A · Web research summary

7 searches confirmed direction with 3 critical updates:

### Patterns adopted

**(1) AGENTS.md / CONTEXT.md pattern (PrestaShop, March 2026).** Cross-tool AI single source of truth. One authoritative file, tool-specific files become thin pointers (1-3 lines). Solves Y4 + Y6 + intra-PK contradiction in one mechanism. Files like CLAUDE.md, .cursorrules, personal-preferences.md become pointers, not parallel sources.

**(2) DDS Truth Hierarchy (Medium, April 2026).** Concrete fix for Y2 (active contradictions) — explicit priority order in CLAUDE.md/CONTEXT.md declares which document wins. This is the MEH-271 "two parallel mechanisms" rule applied to docs.

**(3) Google DESIGN.md format spec (April 2026).** Markdown source of truth + CLI linter + auto-export to Tailwind v3, v4, and W3C DTCG (`tokens.json`). Human-first markdown + machine export, simpler than tokens.json + Style Dictionary alone for pre-launch solo founder.

### Patterns deferred

**(4) Material for MkDocs in maintenance mode (Nov 5, 2025).** Docusaurus is alternative (Meta-maintained, 64k stars) but 15-40 hours setup. **Decision: skip doc-site generator entirely until post-launch trigger (>50 producers OR external contributors).**

**(5) Notion/Confluence/GitBook all wrong fit.** Solo founder + pre-launch + dev-heavy + AI-assisted = repo `docs/` markdown is correct.

### Patterns from WEB-RESEARCH-FINDINGS that survived intact

- ADRs in `docs/decisions/` (Martin Fowler, AWS Prescriptive): ✓ already implemented (9 ADRs), needs scope expansion to brand decisions
- "Reference, don't inline" (Syntora, MindStudio): ✓ already partially implemented in CLAUDE.md
- 80-line cap on AI context file: ✓ industry-validated (PrestaShop guidance)
- One-page brand summary (metabrand.digital, zyner.io): ✓ for pre-launch solo

### New finding for HANDOFF.md (Y7)

Industry pattern: HANDOFF = rolling 7-day disposable window pointing to CHANGELOG.md (canonical ledger) for history. Two separate logs, two separate roles.

---

## B · Decision Matrix

Notation: **Action** = KEEP / MERGE-INTO-{target} / ARCHIVE / DELETE / TRANSFORM-TO-POINTER. **Severity** = 🔴 active contradiction / 🟠 drift causing real bug / 🟡 drift cosmetic / 🟢 clean.

### B.0 — Sapir's 4 gating decisions (resolved)

| # | Decision | Resolution | Rationale |
|---|---|---|---|
| 1 | **B.10 Risk-tier nomenclature** | **(a) GREEN/YELLOW/RED — 3-tier wins** | 143-task sunk cost + YELLOW captures real middle workflow + MEH-450 "no third tier" written in isolation 6 days pre-EXECUTION_PLAN. ADR-016 supersedes MEH-450 clause. workflow.md + personal-preferences + userMemories all update to 3-tier. |
| 2 | **B.2 State tokens** | **Brand-owned** (#B3261E, #B4770A, #64748B vacation-slate) | Tokens appear in user-facing surfaces (form validation, errors, empty states). #B3261E warmer than Tailwind red-500 = on-brand (warm, editorial, magazine). Tailwind defaults signal "SaaS dashboard" — opposite of Mehamakor thesis. vacation-slate is Mehamakor-specific concept, not generic gray. |
| 3 | **B.9 Inspiration** | **Retire I1 (gardensweet), keep I2-I4 editorial** | gardensweet stale from pre-reset DESIGN.md. 4-session reset moved to editorial premium. Two directions cause CC drift. Kinfolk/Natoora/The Infatuation/Cherry Bombe stays single source. Document in BRAND.md inspiration section. |
| 4 | **B.14-P Empty `04-Business-Model/`** | **Delete** | 16 days no content = signal not happening. Pricing in 01-Strategy/. Recreate if needed later. Empty folders = noise. |

### B.1 — Source-of-truth claimants (INVENTORY A)

| # | Source | Current claim | Action | Target home | Severity | Why |
|---|---|---|---|---|---|---|
| A1 | `Drive/03-Brand-Hub/00-README.md` | "source of truth של מותג" | **MERGE-INTO** `docs/BRAND.md` | new file in repo | 🟠 | 12-file Brand Hub = over-engineered pre-launch (metabrand.digital pattern) |
| A2 | `Drive/00-Active/MISSION_CONTROL.md` | "Source of truth (לא שום מסמך אחר)" | **MERGE-INTO** Linear MEH-130 roadmap | Linear Document | 🟠 | MISSION_CONTROL = active state, Linear is the right home |
| A3 | `Drive/00-mehamakor-context.md` (3 copies) | "permanent context" | **MERGE-INTO** `docs/CONTEXT.md` | new file in repo | 🔴 | 3 copies + intra-PK contradiction (Y4). Becomes the AGENTS.md-equivalent |
| A4 | MEH-130 Linear Document | "Live document" / authoritative roadmap | **KEEP** as Linear roadmap | Linear | 🟢 | Linear is correct home for live roadmap state |
| A5 | `MEH-124-v4-content-sync.md` | "source of truth used by Claude Design" | **ARCHIVE** to Drive 99-Archive | — | 🟠 | Replaced by `docs/BRAND.md` + design-principles.md |
| A6 | `docs/DESIGN.md` (repo) | "8 core brand tokens locked" + "canonical" | **TRANSFORM** to DESIGN.md (Google format) | `docs/DESIGN.md` | 🟠 | Adopt Google spec → auto-export to tailwind config |
| A7 | `Drive/01-Strategy/02-pricing-model.md` | "Source of truth ל-monetization" | **KEEP** (working) + write **ADR-010 pricing** | Drive + new ADR | 🟡 | Working strategy doc OK in Drive; lock the **decision** as ADR (G1) |

### B.2 — Brand colors (INVENTORY B, plus B6 found in Verify)

| # | Source | Defines | Action | Target | Severity |
|---|---|---|---|---|---|
| B1 | `Drive/03-Brand-Hub/02-מדריך-מותג.md` | 3 colors + warm-white | **MERGE-INTO** `docs/BRAND.md` | repo | 🟠 |
| B2 | `docs/DESIGN.md` | 8 tokens "all canonical" | **TRANSFORM** to Google DESIGN.md format | repo (same path) | 🔴 |
| B3 | `MEH-124-v4-content-sync.md` section 6 | 3 valid + 5 "should be removed" | **ARCHIVE** (superseded) | Drive 99-Archive | 🟠 |
| B4 | `personal-preferences-v2.md` | 3 colors (lowercase) | **TRANSFORM-TO-POINTER** | Project Knowledge | 🟢 |
| B5 | `Drive/00-mehamakor-context.md` "Brand locks" | 3 colors (lowercase) | **MERGE-INTO** `docs/CONTEXT.md` | repo | 🔴 |
| **B6** | `.claude/commands/design-review/design-principles.md` | 13 tokens incl. `vacation-slate #64748B`, `error #B3261E`, `warning #B4770A` | **MERGE-INTO** `docs/DESIGN.md` (Google format) — **all brand-owned per B.0 #2** | repo | 🔴 |

### B.3 — File duplications (INVENTORY C)

| # | What | Copies | Action | Severity |
|---|---|---|---|---|
| C1 | `00-mehamakor-context.md` (3 copies in Drive) | 3 | **MERGE-INTO** `docs/CONTEXT.md` + DELETE 3 Drive copies | 🔴 |
| C2 | `HANDOFF.md` (Drive + Drive (2) + repo) | 3 | **DELETE** 2 Drive copies; **KEEP** repo | 🟠 |
| C3 | `06-press-quotes-bank.md` (clean + LOCK-violating) | 2 | **DELETE** LOCK-violating `1pOv...` + **fix** clean if drifts | 🔴 |
| C4 | `DESIGN_REFACTOR_MASTER_PLAN_v4` (3 copies) | 3 | **ARCHIVE** all (superseded by 4-session workflow) | 🟡 |

### B.4 — Templates count drift (INVENTORY D + S)

| # | Issue | Action |
|---|---|---|
| D1-D4 | 4 sources claim 8/9/10/11 templates | **CONSOLIDATE** — actual = 10 files (00-09) in Drive; PK = manual snapshot (no longer canonical) |
| S | `09-council-mode.md` orphan | **KEEP** + add to README |

**PK decision:** option (c) — Drop PK as canonical. PK = manual working-copy snapshot, no CI auto-sync (over-engineering for pre-launch).

### B.5 — Templates content drift (INVENTORY E)

| # | Template | Stale content | Action | Severity |
|---|---|---|---|---|
| E1 | `02-claude-code-feature.md` lines 62, 69, 164, 193 — `_migrate_columns()` (4 mentions) | **EDIT** template — remove all 4 mentions, replace with Alembic + ADR-003 pointer | 🔴 |
| E2 | `01-claude-design.md` "Logo: [current state — open]" | **EDIT** — current state = MEH-637 pomegranate-seed lockup Done 22/5 | 🟠 |
| E3 | `01-claude-design.md` `text dark: #1a1a1a` | **EDIT** — `#1C1A17` per BRAND.md | 🟠 |
| E4 | `01-claude-design.md` `<no_ai_slop>` "Lucide icons used as-is" | **EDIT** — "Lucide FORBIDDEN. Phosphor exclusive per MEH-657 + ADR-013" | 🔴 |

**Y0-extension:** CLAUDE.md ↔ Template 02 active contradiction on `_migrate_columns()`. CLAUDE.md says STOP, Template 02 prompts CC to use it. Fix E1 closes this.

### B.6 — Production code violations (INVENTORY F)

| # | Location | Violation | Action | Severity |
|---|---|---|---|---|
| F1 | `ProducerCard.jsx` HeartButton `text-red-500` | **Fix** to brand error token per B.0 #2 | 🟠 |
| F2 | `frontend/messages/he.json` `home.hero.friday_subtitle` emoji 🛒 | **DELETE emoji** per MEH-657 surface-scoped LOCK | 🟠 |

### B.7 — Decisions not formalized as ADRs (INVENTORY G + Q)

| # | Decision | Action |
|---|---|---|
| G1 | Pricing v2.0 (6 LOCKs + 4 options) | **WRITE** ADR-010 |
| G2 | Tagline locked | **WRITE** ADR-011 |
| G3 | Logo system Watt 4-phase | **WRITE** ADR-012 |
| G4 | Icon Strategy Three-Tier (Phosphor exclusive) | **WRITE** ADR-013 |
| G5 | Voice rules Hebrew Hybrid | **WRITE** ADR-014 |
| G6 | 5 strategic cancellations 14 May (MEH-411/412/415/416/536) | **WRITE** ADR-015 (pattern decision) OR per-issue Linear comments |
| Q | ADR-009 trigger never fired across 9 sessions | **FIX** — propagate trigger phrase to Project Instructions (Session 2 deliverable) |

### B.8 — Tagline 3 versions (INVENTORY H)

| # | Source | Action |
|---|---|---|
| H1, H2 | Brand Hub 02 + 03 — full 11-word | **KEEP as canonical** (in `docs/BRAND.md`) |
| H3 | `00-mehamakor-context.md` truncated | **EDIT** to full version when merging to CONTEXT.md |
| H4 | `MEH-124-v4` "(working)" flag | **ARCHIVE**. Status = LOCKED per ADR-011 |

### B.9 — Inspiration sources (INVENTORY I) — resolved per B.0 #3

| # | Source | Action |
|---|---|---|
| I1 | `docs/DESIGN.md` gardensweet + foraged | **RETIRE** (stale pre-reset direction) |
| I2-I4 | Brand Hub + Template 01 (Kinfolk/Natoora/Cherry Bombe/Smitten Kitchen) | **CONSOLIDATE** into single section of `docs/BRAND.md` |

### B.10 — Risk-tier nomenclature (INVENTORY J + Y2) — resolved per B.0 #1

**Decision: GREEN/YELLOW/RED wins via ADR-016.** Updates required:
- `workflow.md` MEH-450 section — remove "no third tier" clause, add YELLOW definition
- `personal-preferences-v2.md` — adopt 3-tier
- `userMemories` — supersede LOW/HIGH entries with 3-tier
- 143 Linear issues — already classified, no action needed

### B.11 — Brand LOCK violations (INVENTORY L extended)

| # | File | Action | Severity |
|---|---|---|---|
| L1 | `06-press-quotes-bank.md` duplicate `1pOv...` (5 violations incl. **English boilerplate "home cooks"**, copy-paste-ready) | **DELETE FILE** | 🔴 production hazard |
| L1b | `06-press-quotes-bank.md` clean copy `1J-c...` | **REVIEW** + edit if violations present | 🔴 if confirmed |
| N1-N3 | `Drive/01-Strategy/marketing-and-social.md` (3 violations) | **EDIT** all 3, align with BRAND.md | 🟠 |

### B.12 — Founder identity (INVENTORY M) — Y4 ACTION

Sapir = canonical per session 1.

| Location | Currently | Action |
|---|---|---|
| userMemories | Smadar Levi | **UPDATED** in this session (entry #26) |
| `00-mehamakor-context.md` (3 copies) | Smadar | **EDIT** when merging to CONTEXT.md |
| `HANDOFF.md` (repo) | Smadar | **EDIT** repo (Drive copies deleted per C2) |
| `personal-preferences-v2.md` | Sapir | **KEEP** (already correct) |
| Linear `createdBy` | Smadar Levi | **LEGACY** — acceptable |
| Drive owner email | `levismadar80@gmail.com` | **KEEP** — Gmail address |

### B.13 — Status tracking stale (INVENTORY K)

| # | Document | Action |
|---|---|---|
| K1, K2 | MISSION_CONTROL + DESIGN_REFACTOR_v4 (1) — "0/4" but reality 3/4 | **ARCHIVE** after merge per A2 + C4 |
| K3 | Drive README v2 — "9 files" / Brand Hub has 12 | **EDIT** after Brand Hub consolidation |
| K4 | Brand Hub 00-README status table | **DELETE** after Brand Hub consolidation |
| K5 | `docs/EXECUTION_PLAN.md` "sessions 123, 76, 122" | **EDIT** — references should be 636/637/638/639 |
| K6 | `Drive/09-mehamakor-workflow.md` | **ARCHIVE** (references canceled MEH-123) |

### B.14 — Other (INVENTORY O, P, R, T, U + Y findings)

| # | Issue | Action | Severity |
|---|---|---|---|
| O1-O3 | Decisions in wrong format | Closed by ADR-010/015/012 | 🟢 |
| **P** | `Drive/04-Business-Model/` empty folder | **DELETE FOLDER** per B.0 #4 | 🟡 |
| R | Linear stages 2, 3, 6 missing | **DOCUMENT** intent in workflow.md | 🟡 |
| T | 5 WhatsApp templates (MEH-509) not in COPY_BANK | **EDIT** `docs/COPY_BANK.md` add 5 templates | 🟠 |
| U | MEH-603 vs MEH-643 (worse — MEH-603 has dead deps) | **CANCEL** MEH-603 via Linear UI + comment "superseded by MEH-643" | 🔴 launch-blocker |
| **Y1** | ADR-001 misleading title | **Rename** ADR-001 title to "JWT refresh token in HttpOnly cookie (access token still in localStorage)" | 🟠 |
| **Y2** | EXECUTION_PLAN ↔ workflow.md contradiction | Closed by ADR-016 per B.0 #1 | 🔴 launch-blocker |
| **Y3** | `.claude/commands/` missing from coverage | **NOTE** — closed by this plan | 🟢 |
| **Y4** | PK intra-source contradiction | Closed by B.12 ACTION | 🟢 |
| **Y5** | ADR coverage gap (technical only) | Closed by G1-G6 + B-series ADRs | 🟢 |
| **Y6** | Extend MEH-271 "two parallel mechanisms" to docs | **EDIT** `workflow.md` — append 1 line | 🟢 |
| **Y7** | HANDOFF.md = append-only log, ~6000 lines | **SPLIT** — HANDOFF rolling 7-day, CHANGELOG canonical ledger | 🟠 |
| **Y8** | ADR-007 README index broken | **CHECK** MEH-486 status, backfill if needed | 🟢 |
| **Y9** | `docs/CLAUDE-REVIEW.md` TODO in canonical text | **EDIT** — replace TODO once ADR-007 ships | 🟢 |
| **Y10** | `docs/MIGRATIONS.md` not yet read | **DEFER** to post-launch audit | 🟡 |
| **Y11** | `.claude/rules/skills.md` counter inconsistency | **EDIT** — single canonical count + date | 🟡 |

### B.15 — Web research-driven new actions

| # | Item | Action |
|---|---|---|
| W1 | Create `docs/CONTEXT.md` (PrestaShop AGENTS.md pattern) | **CREATE** — authoritative AI-context SoT |
| W2 | Add Truth Hierarchy section to CONTEXT.md | **CREATE** — explicit priority order (per §C) |
| W3 | Adopt Google DESIGN.md format spec | **TRANSFORM** `docs/DESIGN.md`; install `@google/design.md` linter; tokens auto-export to tailwind |
| W4 | Doc-site generator (Docusaurus/mkdocs-material) | **DEFER** post-launch trigger: >50 producers OR external contributors |
| W5 | Brand Hub 12 files → 1 `docs/BRAND.md` | **CONSOLIDATE** per metabrand.digital + zyner.io pattern |
| W6 | ADR-009 trigger phrase propagation to Claude.ai chat surface | **EDIT** Project Instructions (Session 2) |

---

## C · Target Architecture

```
═══════════════════════════════════════════════════════════════════
                    MEHAMAKOR — DOCS ARCHITECTURE
═══════════════════════════════════════════════════════════════════

REPO (canonical — versioned, blame-able, PR-reviewed)
│
├── CLAUDE.md ························· thin pointer (≤80 lines)
│   └─ "See docs/CONTEXT.md for AI-agnostic single source"
│
├── docs/
│   ├── CONTEXT.md ··················· 🟢 SoT — AI-agnostic context
│   ├── BRAND.md ····················· 🟢 SoT — brand narrative + locks
│   ├── DESIGN.md ···················· 🟢 SoT — tokens (Google spec)
│   ├── decisions/ ··················· 🟢 SoT — ADRs (now incl. brand)
│   │   └── ADR-001..ADR-016 (and growing)
│   ├── templates/ ··················· 🟢 SoT — 9 prompt templates (per ADR-020)
│   │   └── 00..08 + README.md (Template 09 deferred to MEH-690)
│   ├── CHANGELOG.md ················· canonical ledger (append-only)
│   ├── ARCHITECTURE.md, DATA.md, ···· technical references
│   │   DEPLOYMENT.md, SECURITY.md, …
│   └── COPY_BANK.md ················· canonical UI copy strings
│
├── HANDOFF.md ······················· rolling 7-day active state
│   └─ pointer to CHANGELOG.md for history
│
└── .claude/rules/ ··················· path-scoped operating rules
    └─ workflow, db, rtl, security, observability, …

DRIVE (working — drafts, iteration, archive)
│
├── 00-Active/ ······················· daily working files only
├── 01-Strategy/ ····················· working drafts of strategy
│   └─ (pricing-model.md = working until ADR-010 supersedes)
├── 02-Templates/ ··················· ARCHIVE — see docs/templates/ (per ADR-020)
├── 99-Archive/ ······················ retired files (Brand Hub 12, etc.)
└── (NO duplicates of repo SoT files)

LINEAR (state — issues, status, cycles)
│
├── MEH-XX issues ···················· active task state
├── MEH-130 Linear Document ·········· live roadmap (no file copy)
└── (no Documents duplicating ADRs)

PROJECT KNOWLEDGE (Claude.ai chat surface — working copies)
│
├── CONTEXT.md ······················· manual upload of canonical
├── BRAND.md ························· manual upload of canonical
├── Templates 00-08 ·················· manual snapshot of docs/templates/ (non-canonical per ADR-020)
└── (NOT canonical; manual refresh on canonical change)

USER MEMORIES (Claude L3 cache)
│
└── recent learnings only, no SoT data

═══════════════════════════════════════════════════════════════════
TRUTH HIERARCHY (per CONTEXT.md, when conflicts arise):

  ADR (docs/decisions/) > .claude/rules/ > docs/CONTEXT.md
  > docs/BRAND.md, DESIGN.md (domain SoTs) > docs/ general
  > HANDOFF.md (state) > Drive (working) > Project Knowledge (copy)
  > userMemories (cache)

═══════════════════════════════════════════════════════════════════
```

---

## D · Migration Order (26 steps)

### Phase α — Pre-work (all 4 Sapir decisions resolved, see B.0)

Step 1-4 (decisions) — **DONE** in session 1.

### Phase β — Repo additions (additive, no deletes)

| # | Action | Owner | Time | Blocks |
|---|---|---|---|---|
| 5 | Create `docs/CONTEXT.md`. Consolidate from `00-mehamakor-context.md` 3 copies + Y4 fix (Sapir) + Truth Hierarchy section. | Claude Code LOW-RISK (docs-only) | 30 min | 8, 12, 17 |
| 6 | Create `docs/BRAND.md`. One-pager: positioning, voice, anti-patterns, colors (reference DESIGN.md), tagline (reference ADR-011). Source: Brand Hub `02-מדריך-מותג` + `03-brand-book-פנימי` + `04-mission-vision-values`. ≤300 lines. | Claude Code LOW-RISK | 45 min | 10, 11 |
| 7 | Transform `docs/DESIGN.md` to Google DESIGN.md format. Reconcile B6 state tokens (brand-owned per B.0 #2). Auto-export to `tailwind.config.js`. | Claude Code HIGH-RISK (central tokens) | 90 min | 15, 18 |

### Phase γ — ADR series (formalize existing decisions)

| # | Action | Owner | Time |
|---|---|---|---|
| 8 | Write ADR-010 — Pricing model v2.0 | Claude.ai chat session | 30 min |
| 9 | Write ADR-016 — Risk-tier nomenclature (GREEN/YELLOW/RED, supersedes MEH-450 clause) | Claude.ai chat | 30 min |
| 10 | Write ADR-011 — Tagline locked | Claude.ai chat | 15 min |
| 11 | Write ADR-012 — Logo system Watt 4-phase | Claude.ai chat | 20 min |
| 12 | **Write ADR-013 — Icon Strategy Three-Tier (Phosphor exclusive).** Gates Checklist item 6. | Claude.ai chat | 20 min |
| 13 | Write ADR-014 — Voice rules Hebrew Hybrid | Claude.ai chat | 15 min |
| 14 | Write ADR-015 — 5 strategic cancellations 14 May (or Linear per-issue comments) | Claude.ai chat | 20 min |

### Phase δ — Repo edits (fix contradictions)

| # | Action | Owner | Time | Blocks/Blocked-by |
|---|---|---|---|---|
| 15 | Edit `02-claude-code-feature.md` — remove all 4 `_migrate_columns()` mentions; replace with Alembic + ADR-003 + ADR-007 pointer. | Claude Code LOW-RISK | 20 min | closes CLAUDE.md ↔ Template 02 contradiction |
| 16 | Edit `01-claude-design.md` — fix E2/E3/E4 (logo state, #1C1A17, Phosphor per ADR-013) | Claude Code LOW-RISK | 20 min | requires step 12 |
| 17 | Edit `CLAUDE.md` — transform to thin pointer to `docs/CONTEXT.md`. Preserve 80-line cap. | Claude Code HIGH-RISK | 30 min | requires step 5 |
| 18 | Edit `frontend/tailwind.config.js` — reconcile with new DESIGN.md tokens. Remove dev-exploration tokens (B3). | Claude Code HIGH-RISK chunk-by-chunk | 60 min | requires step 7 |
| 19 | Edit `personal-preferences-v2.md` — transform to pointer to CONTEXT.md + BRAND.md. Keep Skeptic Mode + style preferences inline. | Sapir PK upload | 15 min | requires step 5 |

### Phase ε — Production code fixes

| # | Action | Owner | Time | Blocked-by |
|---|---|---|---|---|
| 20 | Fix F1 + F2 — HeartButton brand-owned error color; remove emoji 🛒 from `he.json`. | Claude Code LOW-RISK | 20 min | requires step 2 (B.0 done) + 16 |
| 21 | Fix N1-N3 — `marketing-and-social.md` 3 LOCK violations. | Claude Code | 15 min | requires step 6 |

### Phase ζ — Drive cleanup (Sapir manual via Drive UI)

22. **Drive operations (Sapir, 45 min total):**
    - **DELETE** `1pOv...` (LOCK-violating press-quotes duplicate) — closes L1 production hazard
    - **REVIEW** `1J-c...` (clean press-quotes) for latent violations
    - **DELETE** `00-mehamakor-context` 3 copies (after CONTEXT.md merged in step 5)
    - **DELETE** HANDOFF.md Drive copy + Drive `(2).md` (repo is canonical)
    - **ARCHIVE** Brand Hub 12 files to `99-Archive/` (after BRAND.md merged in step 6)
    - **ARCHIVE** `MEH-124-v4-content-sync.md`
    - **ARCHIVE** `DESIGN_REFACTOR_MASTER_PLAN_v4` 3 copies
    - **ARCHIVE** `MISSION_CONTROL.md` (state moves to Linear MEH-130)
    - **ARCHIVE** `09-mehamakor-workflow.md`
    - **DELETE** `04-Business-Model/` empty folder (per B.0 #4)
    - **PROJECT KNOWLEDGE**: re-upload CONTEXT.md + BRAND.md + DESIGN.md; remove stale versions

### Phase η — State hygiene

| # | Action | Owner | Time |
|---|---|---|---|
| 23 | Trim HANDOFF.md to rolling 7-day window. Older entries already in CHANGELOG. Add pointer to CHANGELOG.md for history. | Claude Code LOW-RISK | 20 min |
| 24 | Update `memory_user_edits` — Sapir not Smadar (done in session 1); doc architecture v2 (done in session 1). | Session 1 | — |
| 25 | Cancel MEH-603 + add Linear comment "superseded by MEH-643". | Sapir | 5 min |
| 26 | Edit `.claude/rules/workflow.md` — append 1 line to "Two parallel mechanisms" rule: "applies to docs too — when two docs own the same fact, one is deleted, not disabled." Also: rename ADR-001 title (Y1 fix). | Claude Code LOW-RISK | 10 min |

**Total estimated time:** 8.5 hours work, spread across ~3 sessions (one for β-γ, one for δ-ε, one for ζ-η). Phase ζ is the only manual-Sapir block. ADR-013 (step 12) is gating for Pre-design-upload Checklist item 6.

---

## E · Pre-design-upload Checklist

**14 items. Must complete all 14 before uploading the new design.**

```
□  1. ADR-016 written (B.0 #1 resolved — GREEN/YELLOW/RED 3-tier)
□  2. State tokens decision recorded in BRAND.md (B.0 #2 — brand-owned)
□  3. docs/CONTEXT.md created and merged to staging
□  4. docs/BRAND.md created and merged to staging
□  5. docs/DESIGN.md transformed to Google format; tokens
       auto-exported to tailwind.config.js (PR green)
□  6. ADR-013 (Icon Strategy Three-Tier) written and merged
       — closes Template 01 E4 contradiction (Lucide rule)
□  7. Template 02 _migrate_columns() removed (4 mentions, E1)
       — closes CLAUDE.md ↔ Template 02 contradiction
□  8. Template 01 fixed: E2 (logo state), E3 (#1C1A17), E4 (Phosphor)
□  9. F1 fixed in code: HeartButton brand-owned error color
□ 10. F2 fixed in code: emoji 🛒 removed from he.json
□ 11. L1 production hazard closed: press-quotes-bank duplicate
       (1pOv...) deleted from Drive
□ 12. CLAUDE.md transformed to thin pointer to CONTEXT.md
       (≤80 lines preserved)
□ 13. tailwind.config.js reconciled with new DESIGN.md tokens
       (B3 dev-exploration tokens removed; B6 reconciled)
□ 14. MEH-603 canceled in Linear (superseded by MEH-643)
       — closes broken dependency on canceled MEH-601
```

**Items NOT in checklist (can wait until after design upload):**
- ADR-010, 011, 012, 014, 015 (record decisions; design doesn't depend on ADR format)
- HANDOFF.md trim (Y7)
- Drive cleanup of archival files (MISSION_CONTROL, etc.)
- N1-N3 marketing-and-social.md fixes
- T (WhatsApp templates in COPY_BANK)

---

## F · Deferred to Session 2 — Project Instructions (8 sections)

Structure to draft in Session 2 (60-90 min):

1. **AGENTS.md/CONTEXT.md pattern declaration** — explicit "single source of truth = docs/CONTEXT.md; tool-specific files are thin pointers"
2. **Truth Hierarchy verbatim** (per section C above)
3. **ADR-009 trigger propagation** — verbatim trigger phrase visible to Claude.ai chat surface
4. **Anti-pattern guard, specific version** — "reference, don't inline" per Syntora pattern, with examples from current drift
5. **Decision tree for "I want to create a new doc"** — branches: decision → ADR. Domain SoT → check if exists. State → HANDOFF/Linear. Copy → COPY_BANK.
6. **Living vs frozen distinction** — frozen (ADRs, CONTEXT/BRAND/DESIGN), living (HANDOFF, Linear, Drive working), versioned (CHANGELOG)
7. **Memory hygiene rules** — what goes in userMemories vs elsewhere
8. **ADR title rule (Y1 mitigation)** — "ADR title MUST describe actual current state, not target state. If decision is partial — title must say so."

---

## Session 2 plan

**Single deliverable session, 60-90 min:**

(i) Project Instructions full draft (8 sections per §F)
(ii) Phase α step 5 — write CONTEXT.md
(iii) Phase γ in parallel — ADR drafts 010-016 (Claude.ai drafts, Claude Code commits)

**Sessions 3-4 = Claude Code execution** of Phases β/δ/ε/ζ/η per migration order. No Claude.ai needed except for ADR-013 draft (gating Checklist item 6).

---

## End of Session 1 deliverable
