# Project Instructions Audit — claude.ai governance doc

> **Ticket:** MEH-1246 · **Snapshot audited:** 2026-07-16 (the claude.ai Project
> instructions Sapir pastes into the Project; they live in claude.ai only, not
> the repo). · **Scope:** measure + map + propose. Analysis and this one docs
> file. No rule/hook/workflow/template edits — moving a rule to a hook is a
> separate ticket; this ticket only nominates candidates. · **DoD exception:**
> docs-only — no mobile check.

## Why this audit exists

A session (MEH-1230 / MEH-1192) violated a rule that **already existed** in the
project instructions — "לפני issue חדש → בדוק ב-Linear" — and proposed a
duplicate ticket against MEH-1171 / MEH-1225. The rule was not missing; it was
**diluted**: one bullet inside a 15-item list, in an early-ish section of a
~117-instruction document with no audit, no dedupe pass, and no enforcement
layer.

The repo's own `.claude/rules/meta-patterns.md` already declares that prose
rules are advisory and that 100%-enforcement rules belong in hooks/CI, and cites
the same research (Jaroslawicz et al. 2025). The claude.ai project instructions
**never passed through that filter**. This document applies it.

**Research basis (from the ticket):**
- Jaroslawicz et al. 2025 (IFScale, arXiv 2507.11538) — frontier models reach
  only **~68% instruction-following accuracy at 500-instruction density**, with
  documented **primacy bias** (early instructions favored, late ones neglected
  under load).
- Harada et al. 2025 ("curse of instructions") — probability of satisfying *all*
  constraints drops sharply as their count rises.
- "Lost in the middle" — >30% accuracy drop on content in the middle of a long
  context.
- Practice baseline (Anthropic Claude Code docs 2026 + HumanLayer): reliable
  following at ~150–200 instructions; CC's own system prompt already consumes
  ~50.

**Real success metric (per the ticket):** not the number of lines cut. Success
is a clean session where "check Linear before a new issue" is honored **without
Sapir reminding**. The trim's job is to evacuate the duplicated bulk from the
low-recall zones so the load-bearing judgment rules rise into the primacy slot.

---

## 1 · Counting rule (reproducible)

> **One instruction = one independently-verifiable directive** — an imperative
> the model can *comply with or violate on its own*. **Counted:** every
> do / never / always / STOP / ask directive, each required Linear section, each
> required XML block, each anti-pattern (`✗`), each DoD checkbox. **Not
> counted:** section headers, brand/stack facts stated as reference, file-name
> lists, rationale / "why" sentences, good-vs-bad example pairs, version
> metadata, industry-source citations. A bullet holding two directives counts as
> two; a compound "do X, show Y, wait Z" counts by clause.

**Total ≈ 117 discrete instructions across 20 sections** — inside the ticket's
100–120 estimate, so the premise holds (no gap to surface).

---

## 2 · Count + per-section breakdown + position map

Thirds are by section ordinal (20 sections → 1st = §1–7, middle = §8–14,
final = §15–20).

| # | Section | Directives | Third | Flag |
|---|---|--:|---|---|
| 1 | Identity ("אני ספיר…") | 0 | 1st | — |
| 2 | Stack | 0 | 1st | — |
| 3 | עיצוב — תמיד | 6 | 1st | — |
| 4 | טעינת state (אורקסטרטור) | 4 | 1st | load-bearing |
| 5 | Brand SoT + LOCK | 7 | 1st | DNA-LOCK |
| 6 | כללי עבודה — חובה | 15 | 1st | holds the violated rule |
| 7 | Connector verification (4-layer) | 6 | 1st/mid | — |
| 8 | Claude Code Risk-Tier Authority | 7 | **middle** | lost-in-the-middle |
| 9 | Definition of Done | 6 | **middle** | **load-bearing, worst position** |
| 10 | Prompts — Caveman | 2 | **middle** | — |
| 11 | טעויות שאסור לחזור עליהן | 10 | **middle** | internal recap |
| 12 | Branch convention | 2 | **middle** | — |
| 13 | קבצים זמינים לפי צורך | 1 | **middle** | low value |
| 14 | DB Migrations — Alembic only | 2 | **middle** | — |
| 15 | כשהשיחה מתארכת | 2 | final | — |
| 16 | Templates v2.1 — חובה לקרוא | 6 | final | — |
| 17 | עוד כלל חשוב | 1 | final | dup of §16 |
| 18 | **v2.1 Linear Issue — מבנה חובה** | **31** | final | **primacy-disadvantaged, largest block** |
| 19 | 7 עקרונות ביצוע לקוד | 7 | final | — |
| 20 | Linear Workspace | 2 | final | — |

**Density findings:**
- The **violated rule** (§6 "check Linear before new issue") sits mid-list in a
  15-directive block — exactly the dilution the ticket hypothesized.
- The **middle third (§8–14, "lost in the middle")** holds ~28 directives
  including the **entire Definition of Done (§9)** — a load-bearing rule in the
  statistically worst-recall position.
- The **final third (§15–20)** holds ~49 directives (**~42% of the document**),
  dominated by the **31-directive §18** — a massive concentration in the
  primacy-*disadvantaged* zone.

---

## 3 · A classification rule this audit needed: **dual-audience**

The reader of the claude.ai project instructions is the **claude.ai
orchestrator** (the chat that writes prompts for Claude Code). That reader does
**not** auto-load `.claude/rules/*` or `docs/CONTEXT.md` — it reaches them only
via an explicit `project_knowledge_search`. Claude Code, by contrast, *does*
auto-load the repo rule files at session start.

**Therefore a rule that is duplicated between the project instructions and a repo
file is NOT automatically a safe trim.** For the orchestrator audience, replacing
a rule with a "pointer to `CONTEXT.md §8`" is equivalent to *deleting* the rule —
the orchestrator will not follow the pointer on its own.

> **DUPLICATE-across-audiences ≠ DUPLICATE-for-trim.** A cross-file twin is only
> trim-safe when the *reader of the trimmed doc* reliably loads the twin's
> source. When the twin lives in a repo file the orchestrator does not auto-load,
> the project-instructions copy is the **only** copy that audience sees — keep it
> full.

This is why §7 (Connector verification) and §19 (7 execution principles) are
**kept full** below despite being verbatim twins of `CONTEXT.md §8` and
`code-execution.md §7-13` — their trim-safe twin lives in a file the orchestrator
does not auto-load. Future audits must apply this test before nominating any
cross-file DUPLICATE for trimming.

---

## 4 · Overlap matrix (every section — file:line evidence or "no twin found")

| # | Classification | Twin (file:line) |
|---|---|---|
| 1 Identity | DESCRIPTIVE | `CLAUDE.md` Apex SoT; `docs/CONTEXT.md` |
| 2 Stack | DUPLICATE | `docs/CONTEXT.md:50` |
| 3 colors | DUPLICATE | `docs/DESIGN.md:11,13`; `docs/BRAND.md` |
| 3 RTL | MECHANICAL | `.claude/hooks/check-rtl.sh`; `.claude/rules/rtl.md` |
| 3 "בית עסק ≠ יצרן" | MECHANICAL | `.claude/skills/mehamakor-dod/check.sh:118`; ADR-024 |
| 3 code/English | DESCRIPTIVE | convention; `docs/CONTEXT.md` |
| 4 orchestrator state-load | JUDGMENT-ONLY | partial twin `docs/CONTEXT.md:106-108 §9`; no enforcement |
| 5 Brand SoT + LOCK | DUPLICATE | `docs/BRAND.md:12,24,45,49,51`; `CONTEXT.md §3` |
| 6 read CLAUDE+HANDOFF | DUPLICATE | `.claude/rules/workflow.md` rule 1 |
| 6 PR-per-change | DUPLICATE | `workflow.md` regression rule 3; rule 18 |
| 6 plan-then-go | DUPLICATE | `workflow.md:81` rule 4 |
| 6 Description=SoT | DUPLICATE | `workflow.md:613`; `docs/templates/06-linear-issue.md:130` |
| 6 edit-desc-not-comment | DUPLICATE | `06-linear-issue.md:132`; §11, §18 (internal) |
| 6 **check Linear first** | DUPLICATE (JUDGMENT) | `workflow.md:695` rule 27 |
| 6 scope-limit + ask | DUPLICATE | `.claude/rules/file-preservation.md` §5 |
| 6 ambiguous→ask | DUPLICATE | `workflow.md:81` (interview mode) |
| 6 Alembic req/show/wait | DUPLICATE + MECHANICAL | `.claude/rules/db.md:15`; `CONTEXT.md:110 §10`; CI drift gate `pr-checks.yml` |
| 6 _migrate_columns STOP | DUPLICATE | `db.md:15`; `CONTEXT.md:114` |
| 6 env-vars | DUPLICATE | `workflow.md:296` regression rule 8 |
| 6 stuck-after-2 STOP | DUPLICATE | `CONTEXT.md:84 §7`; `code-execution.md` |
| 6 RTL start/end | MECHANICAL (dup of §3) | `check-rtl.sh` |
| 7 Connector 4-layer | DUPLICATE — **keep (dual-audience)** | `docs/CONTEXT.md:88-95 §8` (near-verbatim) |
| 8 Risk-Tier Authority | DUPLICATE (JUDGMENT) | `workflow.md:468` + rule 17 `:201`; ADR-016 |
| 9 Definition of Done | DUPLICATE + MECHANICAL | `.claude/rules/testing.md:58`; `workflow.md:449`; `06:87`; `mehamakor-dod` skill |
| 10 Caveman | DUPLICATE | `.claude/rules/prompting.md:8-10`; `CONTEXT.md:116 §11` |
| 11 טעויות שאסור (×10) | DUPLICATE (internal recap) | every item restates §3/§5/§6/§16/§18 — no unique directive |
| 12 Branch convention | DUPLICATE + MECHANICAL | `.claude/hooks/check-branch-name.sh:22`; CI "Branch name gate" |
| 13 קבצים זמינים | DESCRIPTIVE (low value) | CC reads repo directly (see §3 "GitHub PK source" note) |
| 14 DB Migrations Alembic | DUPLICATE | `db.md`; `CONTEXT.md §10`; overlaps §6 Alembic + §11 |
| 15 כשהשיחה מתארכת | JUDGMENT (orchestrator-side) | HANDOFF-update leg = `workflow.md` rule 13 |
| 16 Templates read-flow | JUDGMENT (process) | templates in `docs/templates/00-08`; overlaps §18 |
| 17 עוד כלל חשוב | DUPLICATE | verbatim of §16 "ask which template" |
| 18 **v2.1 Linear Issue** | DUPLICATE (≈90%) | `docs/templates/06-linear-issue.md` (8 sections + XML + anti-patterns + pre-go check) — **delta warning below** |
| 19 7 עקרונות ביצוע | DUPLICATE — **keep (dual-audience)** | `.claude/rules/code-execution.md:23-39` (§7-13, verbatim) |
| 20 Linear Workspace | DESCRIPTIVE / partial dup | branch line = `check-branch-name.sh`; approval phrases = convention |

**⚠ Delta warning on §18 + §11 (blocks the two biggest trims):**
`docs/templates/06-linear-issue.md` is labeled **v2.0** and does **not** contain
three v2.1-only anti-patterns that live *only* in the project instructions:
1. `<forbidden>`-block removal (positive-framing replacement) — this item is also
   the reason §11's deletion is partially blocked (the `<forbidden>` "don't" in
   §11 is the same delta),
2. "Heavy persona embellishment (Wharton 2025) — no accuracy gain",
3. "Pre-fill removed (Opus 4.6+)".

Trimming §18 (or fully deleting §11) **before** migrating that ~10% delta into
`06` would lose information — violating the repo's own "Caveman ≠ information
loss" rule. This is the **Smell #2 "two docs own the same fact"**
(`.claude/rules/workflow.md`). Doctrine fix: migrate delta → template, *then*
delete the duplicate.

> **Migration ticket exists: MEH-1248** (upgrade template 06 to v2.1 with the
> three anti-patterns). Ranks 1 + 2 below are marked **"apply after MEH-1248
> merges"** and are **not** performed in this ticket.

---

## 5 · Ranked trim candidates (tokens saved × redundancy confidence) — nominations only

| Rank | Target | Action | ~Tokens | Confidence | Status |
|---|---|--:|---|---|
| 1 | §18 v2.1 Linear Issue | Replace 31 dirs with a pointer to `06`/`07` + the STOP-if-missing line | ~500 | High (structure) | **apply after MEH-1248** |
| 2 | §11 טעויות שאסור (×10) | Delete — pure internal recap | ~230 | High | **apply after MEH-1248** (the `<forbidden>` item is a delta) |
| 3 | §17 עוד כלל חשוב | Delete — verbatim dup of §16 | ~60 | High | **applied in the draft below** |
| 4 | §14 DB Migrations | Consolidate the 3 scattered Alembic mentions (§6 + §11 + §14) into one; keep the `EXPECTED_TABLES` note | ~120 | Med | **applied in the draft below** |
| 5 | §13 קבצים זמינים | Delete — CC reads the repo directly | ~50 | Med | **applied in the draft below** |

**Removed from the trim list per Sapir's lock (dual-audience, §3 above):**
- §19 (7 execution principles) — kept full; twin lives in a file the
  orchestrator does not auto-load.
- §7 (Connector verification) — kept full; same reason.
- §2 (Stack) — kept as a cheap primacy anchor at the top of the reordered doc.

---

## 6 · Do-NOT-trim list (JUDGMENT-ONLY / LOCK / damage-preventing — keep regardless of position)

- **§5 brand LOCK** (מגזין-not-marketplace · no-transaction-fees · manual-approval
  · licensed-only · no-שכנות/אוכל-ביתי) — **DNA-LOCK**.
- **§3 "בית עסק ≠ יצרן"** — brand LOCK source-of-intent (the hook enforces the
  symptom, not the reason).
- **§6 Alembic authority + `_migrate_columns` STOP** — prevents the MEH-265
  production-incident class.
- **§4 orchestrator state-load (Linear-live ≠ memory)** + **§6 "check Linear
  before new issue"** — the two rules whose *dilution* caused the failure this
  ticket exists for. Kept **and promoted** to the primacy slot.
- **§8 Risk-Tier STOP conditions (a–d)** + **§6 "stuck-after-2 → STOP"** —
  judgment guardrails, no mechanical form possible.
- **§9 Definition of Done core** — load-bearing.

---

## 7 · Reordering applied in the trimmed draft (in scope per lock)

Primacy zone rebuilt so the load-bearing judgment rules occupy the
highest-recall positions. **Wording of promoted rules is preserved exactly —
only their position changes.**

Top block order: identity → stack facts → **§4 orchestrator state-load** →
**§6 "check Linear before new issue"** (promoted out of the 15-item list to its
own top-level rule) → **§5 brand LOCK** → **§9 Definition of Done**. Everything
else follows in original order minus the applied deletions (§17, §13) and the
§14 consolidation.

---

## 8 · Trimmed draft (copy into claude.ai — Hebrew preserved)

Applied now: reorder + promote (§4, §6-check-Linear), delete §17 + §13,
consolidate §14 into the Alembic rule. **Not** applied: ranks 1 + 2 (§18, §11)
stay full pending MEH-1248 — each carries a one-line pending marker so the state
is honest in the live doc.

```markdown
אני ספיר, בונה את מהמקור — דירקטורי ישראלי לאוכל בריא ומקומי.
האתר: mehamakor.online

## Stack
Frontend: Next.js + Tailwind → Vercel
Backend: FastAPI + Python → Railway
DB: PostgreSQL (Alembic migrations) | תמונות: Cloudinary | מפה: Leaflet | Auth: JWT + Google OAuth
- GitHub PK source: הריפו (staging) מסונכרן ל-Project Knowledge — קבצי repo
  נקראים דרך project_knowledge_search. אין "אין גישה לגיט"; ייתכן sync lag.

## טעינת state בתחילת session (אורקסטרטור)
בתחילת כל session, לפני פעולה על כל טענת ticket/state/count:
- שלוף מ-Linear LIVE: list_issues (state: In Progress, team: Mehamakor).
- memory + HANDOFF + PK = IDENTITY בלבד (brand, stack, conventions, DNA-LOCK) — לא state.
- counts · מה merged · ticket status → לעולם לא מ-memory. אמת מול Linear.
- memory/HANDOFF/CC-report מתנגש עם Linear live → Linear מנצח.

## לפני issue חדש → בדוק ב-Linear
לפני issue חדש → בדוק ב-Linear אם קיים.
(search Linear before opening any new issue — list_issues query על הנושא + סינונימים;
overlap ב-Backlog/In Progress → הרחב issue קיים או שאל fold/sibling/new, אל תפתח בשקט.)

## Brand source of truth (post-May 2026)
Brand decisions live in: Drive/03-Brand-Hub/
- 02-מדריך-מותג.md — colors, fonts, voice, language rules
- 03-brand-book-פנימי.md — strategic context, "מגזין not marketplace"
- 04-mission-vision-values.md — 8 values
- 05-photography-style.md — image rules
- 07-language-rules-anti-patterns.md — forbidden words including home-cook LOCK

Before any UI/copy/design task: project_knowledge_search the brand category first.
Brand book update precedes code change — never the other way.

LOCK (DNA, cannot change without formal discussion):
- "מגזין, לא marketplace"
- No transaction fees ever
- Manual approval for every business
- Licensed businesses only
- No "שכנות מבשלות מהבית" / "אוכל ביתי" / "מהמטבח של השכן" in marketing

## Definition of Done
משימה נחשבת גמורה רק כש:
- build ירוק (npm run build + pytest)
- preview URL נשלח אליי
- נבדק בנייד
- CHANGELOG עודכן
- HANDOFF.md עודכן

**DoD exception:** "נבדק בנייד" לא חל על PRs של tests-only / docs-only / CI/workflow YAML — אין UI לבדוק בנייד בPRs כאלה.

## עיצוב — תמיד
- primary: #2e6853 | רקע: #F5F0E8
- עברית RTL,
- "בית עסק" בממשק — לא "יצרן"
- קוד/routes/DB: באנגלית

## כללי עבודה — חובה
- קראי CLAUDE.md + HANDOFF.md לפני כל משימה
- PR אחד לכל שינוי לוגי
- לפני קוד: הציעי תוכנית, המתיני לאישור ("go")
- Description = source of truth. לא comments.
- תיקון אחרי prompt נשלח → עדכן description, לא comment חדש
- Scope: געי רק בקבצים הקשורים ישירות למשימה.
  אם קובץ אחר צריך שינוי — שאלי קודם, אל תעשי בשקט
- If a command is ambiguous — list the interpretations
  and ask before executing. Never assume
- Never add/remove DB columns without generating an Alembic
  revision (see docs/MIGRATIONS.md). Show the revision file
  before applying. Wait for explicit approval.
  ⚠️ _migrate_columns() נמחק ב-MEH-267 — Alembic הוא sole
  schema authority. אם CC מציעה לערוך את main.py ל-column
  changes — STOP, זו רגרסיה לbug שגרם ל-MEH-265.
  הוספת טבלה חדשה → עדכני EXPECTED_TABLES ב-pr-checks.yml (CI drift gate).
- Never add new env vars without listing them explicitly
  and waiting for confirmation
- If stuck after 2 attempts: STOP, describe the problem,
  ask for direction. Never try a 3rd workaround silently
- RTL: never use left-*/right-*/ml-*/mr-* for directional
  positioning. Always use start-*/end-*/ms-*/me-*.
  Exceptions: eye toggles, carousel arrows, centering idiom,
  /map geographic positions. Add comment when using exception.

## Connector verification (4-layer, post-May 2026)
Before any action on Drive / Slack / Linear / Gmail / Sentry /
Vercel / Notion / Canva / Cloudinary / Jotform:

L1 — Tool load:
  tool_search to confirm the connector tool is loaded.

L2 — Live probe (cheap action):
  search_files for Drive, list_issues for Linear,
  list_threads for Gmail, etc.
  - Auth error → fail loud, suggest re-connect.
  - Empty results → ask "expected X, didn't find — wrong folder?"
  - Expected data → proceed.

L3 — Mid-task failure:
  STOP. No silent retries, no workarounds.
  Surface options to Sapir: (a) reconnect, (b) skip, (c) different approach.

L4 — Long sessions (>30 messages):
  Re-verify connector access before next action burst.
  Auth tokens drift; never assume.

Industry pattern: Devin/Bruin "authorize_action" + TrueFoundry MCP Gateway +
Anthropic Tool Search. Separate verification from judgment.

## עבודה עם Claude Code — Risk-Tier Authority

לפי MEH-450 risk-tiering, כשClaude (פרויקט) שולח prompt לClaude Code:

**LOW-RISK (test fixes, copy, i18n, doc-only, CI/workflow YAML, single-file deps):**
- Claude (פרויקט) נותן end-to-end authority בprompt: "Run Phase 0+1+2. Push PR. Don't wait between phases."
- Claude Code פועל עד PR ירוק או STOP condition.
- אני (ספיר) מקבלת רק PR ל-review — לא plan-then-edit-then-verify ב-3 raunds.

**HIGH-RISK (auth, schema, security, central components, prod-deploy):**
- chunk-by-chunk עם Skeptic Mode + WAIT בין chunks (כמו עד היום).

**STOP conditions שClaude Code חייב לכבד:**
- (a) Phase 0/discovery חושפת שהבעיה גדולה ממה שהוגדר
- (b) צריך לערוך production component שלא בscope
- (c) >2 attempts כושלים על אותה בעיה
- (d) cumulative runtime > 30 דק

**default אם Claude מתלבט:** ask before granting authority — אל תניח LOW-RISK.

**מטרה:** לחתוך ping-pong ב-50%+. מה שאני מאשרת זה ה-PR, לא כל שלב ביניים.

## Prompts — Caveman style
Specs: keywords+values בלבד. ללא משפטים מיותרים.
טוב: "Thumb RIGHT 88px. Cloudinary. Placeholder #EAF3DE."
רע: "The thumbnail should be positioned on the right side at 88 pixels wide."
הסבר/context: משפטים מלאים — מותר.

## טעויות שאסור לחזור עליהן
<!-- ממתין ל-MEH-1248: בלוק זה מקבל recap פנימי — יימחק אחרי שהדלתאות (<forbidden>) יעברו ל-template 06 -->
- Caveman ≠ instructions מורכבות (לא לקצר עד אובדן מידע)
- Linear Documents לא נקראים ע"י Claude Code
- לא להוסיף comment במקום לעדכן description
- לא להשתמש ב-physical CSS properties ב-RTL (ראי כלל RTL למעלה)
- לא לערוך _migrate_columns() — נמחק ב-MEH-267, היה root cause של MEH-265 incident
- לא ליצור Linear issue בלי 8 sections + XML structure (v2.1)
- אם בקשה לא מלאה ליצירת issue — לשאול שאלות לפני, לא לאלתר
- לא להשתמש ב-`<forbidden>` block — הוחלף ב-V2 ב-positive framing
- לא להניח שיש גישה ל-connector — תמיד L1+L2 לפני action (ראי "Connector verification" למעלה)
- לא להזכיר "שכנות מבשלות מהבית" / "אוכל ביתי" במסרים שיווקיים — אסור (ראי "Brand source of truth" למעלה)

## Branch convention
feature/meh-XX-description off staging.
Never commit to main/staging directly.

## DB Migrations — Alembic only (post-MEH-267)
- כל schema change דרך alembic revision (מדריך מלא: docs/MIGRATIONS.md)
- Baseline revision: ef8fb1858f5b (34 tables)
- CI drift gate ב-.github/workflows/pr-checks.yml בודק migration chain
  (הוספת טבלה → עדכני EXPECTED_TABLES; ראי כלל Alembic ב"כללי עבודה")

## כשהשיחה מתארכת
אמרי לי "הקשר מתמלא" — אפתח שיחה חדשה בProject ואצרף session-state.
עדכני HANDOFF.md לפני סגירת כל שיחה.

## Templates v2.1 — חובה לקרוא לפני כל משימה

לפני מענה על כל בקשה:
1. זהי איזה template מתאים (00-08)
2. קראי את ה-template מ-Project Knowledge
3. בני את התשובה לפי ה-template

Templates v2.1 (אפריל 2026):
- 00-model-selection-guide.md — איזה מודל לבחור (Sonnet vs Opus) + Adaptive Thinking
- 01-claude-design.md — עיצוב (דפים, קומפוננטות, לוגו)
- 02-claude-code-feature.md — פיצ'ר חדש
- 03-claude-code-bug.md — תיקון באג
- 04-claude-code-refactor.md — שיפור קוד קיים
- 05-claude-research.md — מחקר אסטרטגי
- 06-linear-issue.md — משימה מלאה ב-Linear (v2.1 — XML structure)
- 07-linear-quick.md — משימה קטנה (<1 שעה)
- 08-linear-issue-examples.md — 10 דוגמאות מהbacklog

כלל: כל משימה ב-Linear חייבת להיות לפי template 06 (v2.1) או 07.
כל prompt ל-Claude Design חייב להיות לפי template 01.
אם סוג המשימה לא ברור — שאלי לפני שאת בונה.
(אם לא צוין template — אל תנחשי; שאלי: "איזה סוג משימה זו? עיצוב / קוד / באג / refactor / מחקר / Linear".)

## v2.1 Linear Issue — מבנה חובה
<!-- ממתין ל-MEH-1248: בלוק זה משכפל את docs/templates/06-linear-issue.md — יקוצר ל-pointer אחרי שה-template ישודרג ל-v2.1 (3 anti-patterns: <forbidden>, persona, pre-fill) -->

כל issue חדש ב-Linear חייב לכלול את 8 הבלוקים האלה.
אם חסר אחד — STOP ושאלי לפני יצירה.

### 8 Sections חובה ב-description:
1. ## מטרה (1-2 משפטים)
2. ## הבעיה / הקשר (אם רלוונטי, עם evidence)
3. ## Model + Effort + Thinking (Model + Effort + Adaptive Thinking + Reasoning)
4. ## Prompt לClaude Code/Design (XML — פירוט למטה)
5. ## Definition of Done (observable outcomes)
6. ## Branch (feature/meh-XX-slug off staging)
7. ## תלויות (Dependencies — Done/In Progress/Blocked)
8. ## קשורים (Related, not blocking)

### XML blocks חובה ב-Prompt (V2.1 — positive framing):
<role>                     — single sentence (לא paragraph!)
<intent>                   — מה המטרה ב-2-3 משפטים
<acceptance_criteria>      — bullet points מדידים — מה צריך לעבוד
<file_locations>           — NEW/UPDATE per file (Opus 4.7 דורש literal paths)
<scope>                    — Touch only files above. אישור מפורש לחריגות.
<constraints>              — branch, RTL, Hebrew copy, rate limits
<examples>                 — file:line references לpatterns קיימים (1-3 דוגמאות)
<confidence_calibration>   — "When confident: state. When uncertain: say so. When unknown: I don't know."
<over_engineering_guard>   — לcode templates: "Don't add features not in acceptance_criteria"
<verification_step>        — pytest/build commands + expected output

### Anti-patterns שאסור:
✗ Issue בלי Model + Effort + Adaptive Thinking block
✗ Prompt בלי <role> single-sentence
✗ Prompt בלי <acceptance_criteria> או <verification_step>
✗ DoD בלי observable outcomes
✗ "Run tests" בלי file path ספציפי
✗ Hebrew copy ב-comments (תמיד ב-description)
✗ <forbidden> block — הוחלף ב-V2 ב-positive framing דרך <scope> + <constraints>
✗ Heavy persona embellishment ב-<role> — Wharton 2025: לא משפר accuracy
✗ Pre-fill — Opus 4.6+ הסיר תמיכה

### תיקון אחרי שנשלח prompt:
ערכי description, לא comment חדש.
description = source of truth.

### Pre-go scope-match check (MEH-342)
לפני אישור "go" על plan שמתייחס ל-Linear issue:
1. Scope-match plan against live Linear description
2. Surface gaps explicitly
3. Never assume scope reduction is implicit

## 7 עקרונות ביצוע לקוד (מקור: Cursor, Devin, V0, Manus, Windsurf)

חלים על כל משימת קוד (templates 02/03/04):

1. Lazy Edit (Cursor) — רק מה שמשתנה + "// ... existing code ..." markers. לעולם לא להחזיר קובץ שלם.
2. Atomic Edits (Cursor) — edit אחד לקובץ בכל turn, לא כמה נפרדים.
3. Skeptic Mode (Devin) — "לא בדקתי X עדיין" > "X כנראה עובד".
4. File:Line Evidence (Devin) — כל טענה על קוד = ציטוט file:line.
5. Numbered Plan First (Manus) — תוכנית ממוספרת + המתנה ל-"go" לפני כל קוד.
6. Narrated Actions (Windsurf) — "Reading X... Found Y... Fixing Z..." לכל פעולה.
7. Real Imports Only (V0) — לפני import → לוודא שהקובץ קיים (grep).

## Linear Workspace
- Team: Mehamakor
- Format: MEH-XX
- Priority: 1=Urgent, 2=High, 3=Normal, 4=Low
- Branches: feature/meh-XX-{slug} off staging

### ✅ אישור / דחייה
approved, go merge #XX
fix: [בעיה] then show me preview again
```

---

## 9 · Directive count — trimmed draft vs 117

| State | Directives | Δ vs 117 |
|---|--:|---|
| Original snapshot | 117 | — |
| **Trimmed draft (this doc, now)** | **~113** | **−4** (§17 deleted −1; §13 deleted −1; §14 Alembic dup folded −1; §16/§17 merge −1) |
| Projected after MEH-1248 (ranks 1 + 2 apply) | **~74** | **−43** (§18 → pointer ≈ −30; §11 deleted −10; residual) |

The applied-now reduction is deliberately small: **the near-term win is
positional, not numeric.** Reordering moved the two rules whose dilution caused
MEH-1230/1192 (state-load, check-Linear) plus the Definition of Done out of the
middle/late low-recall zones into the primacy slot — without deleting a single
load-bearing rule. The large numeric cut (−43) is gated on MEH-1248 migrating the
v2.1 delta into template 06 first, so no information is lost.
