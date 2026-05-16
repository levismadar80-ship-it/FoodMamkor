# Backlog hygiene sweep — MEH-566

**2 SEV-1 + 18 SEV-2 launch blockers across 144 open issues.**

> Sweep deliverable for MEH-566. Triages every currently-open issue in the Mehamakor Linear team (Backlog + Todo + In Progress + In Review) against the severity matrix shipped earlier today in [`docs/BUG_SEVERITY.md`](../BUG_SEVERITY.md). Analysis only — no Linear writes happen in this PR. Owner approves the "Recommended close batch" before a follow-up session executes closes via Linear MCP.

**Counts as of 2026-05-14:** 131 Backlog + 12 In Progress + 1 Todo + 0 In Review = **144 open**. No issue meets the 90-day stale threshold (oldest `updatedAt` = 2026-04-21, ~23 days ago — repo is too young).

**Launch-blocker definition** (per MEH-566 spec): SEV-1 + SEV-2 that affect main user flows (auth, /producers, /map, /producer/[id], producer dashboard, customer → producer contact).

**Methodology caveat:** the BUG_SEVERITY matrix is bug-centric ("how bad if it happens"). Most open issues are features, research, or design — not bugs. For non-bug work I read SEV through the launch-blocker lens: "if this is missing at launch, does it break a main user flow?" High-priority features that block a main flow get SEV-2. Audits-not-yet-run that could surface SEV-1 findings get SEV-2 (the audit itself, not its hypothetical output). Cosmetic/post-launch features stay at SEV-3 or SEV-4 regardless of Linear priority.

---

## 1. SEV-1 — launch blockers (2)

Production-down / no-workaround class. Both are the WhatsApp epic — without it, customers cannot reach producers. WhatsApp button click is a Playwright-required critical flow (CLAUDE.md → `.claude/rules/testing.md`).

| ID | Title | Last activity | Blocks launch | Action |
|---|---|---|---|---|
| MEH-504 | WhatsApp Business launch — Direct Cloud API + Coexistence (epic) | 2026-05-07 | yes | execute children (507/508/509) per architecture lock |
| MEH-509 | WhatsApp automation: welcomes + approvals + after-hours + AI risk-score + vacation | 2026-05-10 | yes | start after MEH-508 ships |

Both carry the `prod-blocker` label and explicit "Blocks: Production launch" in the issue body. No other open issue carries `prod-blocker`.

---

## 2. SEV-2 — major feature broken or launch-affecting (18)

Affect main user flows (auth / producers / map / producer detail / producer dashboard / admin) or are pre-launch audits whose findings could promote to SEV-1.

| ID | Title (truncated) | Last activity | Blocks launch | Action |
|---|---|---|---|---|
| MEH-125 | Pre-Launch Checklist: Redesign | 2026-05-10 | yes | run after audits 1–7 (227–233) close |
| MEH-130 | Roadmap (v2) — meta-tracker | 2026-05-10 | meta | keep open as Roadmap doc anchor |
| MEH-195 | Pre-launch — 10 missing/broken essentials (parent) | 2026-04-30 | yes | execute critical children (190/191/192/193) |
| MEH-225 | Pre-Launch QA Framework | 2026-05-14 | yes | meta-spec; convert to PR template before launch |
| MEH-227 | Audit 1/7 — RTL & Physical CSS violations | 2026-05-03 | yes | run audit |
| MEH-228 | Audit 2/7 — Missing UI states (loading/error/empty/success) | 2026-05-03 | yes | run audit |
| MEH-229 | Audit 3/7 — Security (IDOR, rate limits, injection, secrets) | 2026-05-13 | yes | run audit; any CRITICAL → SEV-1 sub-MEH |
| MEH-230 | Audit 4/7 — Accessibility (aria, keyboard, contrast, focus) | 2026-05-03 | yes | IS 5568 legal req — run audit |
| MEH-233 | Audit 7/7 — Mobile responsiveness | 2026-05-03 | yes | mobile = primary surface; run audit |
| MEH-413 | Producer outreach package — sales script + objection handlers | 2026-05-14 | yes | needed for "first 10 producers" supply seeding |
| MEH-409 | First 10 producers from personal network — pre-launch supply seeding | 2026-05-12 | yes | empty marketplace = no launch |
| MEH-415 | Resilience audit — 3 critical flows must work without founder online | 2026-05-12 | yes | founder-in-the-loop SPOF check |
| MEH-451 | New logo — concept הזרע | 2026-05-10 | yes | visual identity for launch night |
| MEH-451 → MEH-122 | Map redesign: split view + bottom sheet + custom markers | 2026-05-10 | partial | needs Smadar review (map works today but redesign Urgent) |
| MEH-123 | Claude Design Session 1: Logo + Hero redesign | 2026-05-10 | yes | tied to MEH-451; hero is landing-page-first impression |
| MEH-549 | Map page: Leaflet fails to load on staging — blocks GPS + nav E2E | 2026-05-10 | yes | confirm: production map works; E2E only? If prod-affecting → SEV-1 |
| MEH-528 | Onboarding Flow v2 — categories + license + story (Epic) | 2026-05-10 | yes | producer dashboard signup quality |
| MEH-296 | Contact routing: Producer chooses how customers reach her (multi-channel) | 2026-05-10 | partial | needs Smadar review — WhatsApp-first MVP may suffice for launch |

**Confidence flags ("needs Smadar review"):**
- **MEH-549** — title says "blocks GPS + navigation E2E tests" but body suggests `MapClient.jsx` may load fine in production; only Playwright selector fails. If prod is unaffected → demote to SEV-3 (CI-only).
- **MEH-122** — map redesign is Priority High but the *current* map works; this is enhancement, not a bug. Could be SEV-3 if launch ships with current map.
- **MEH-296** — Contact-routing-as-feature is one tier removed from the WhatsApp-only path. If launch ships WhatsApp-only, this is SEV-3.

---

## 3. SEV-3 — minor / edge / CI-only (~70)

Single-feature scope, no main-flow blast radius, or test/CI-only. Grouped:

- **i18n Waves 2–6 (MEH-472, 473, 474, 475, 476):** launch ships Hebrew-only; English is post-launch.
- **Backend hardening:** MEH-272, 273, 312, 328, 334, 449, 463, 464, 486, 501, 405, 258.
- **CI/tooling:** MEH-264, 484, 503, 547 (+children), 448, 429, 482, 481, 480, 478, 514.
- **Tier 1 quality (MEH-557 verdicts):** MEH-558 (mutmut SHIP narrow), 559 (k6 SHIP), 560 (visual DEFER), 561 (Hypothesis SKIP), 562, 564.
- **Quality / observability:** MEH-160, 434, 217, 215, 216, 214, 232. MEH-232 (copy audit) could promote to SEV-2 if copy parity matters at launch.
- **Design / refactor / features:** MEH-131–136 (per-page refactors), 203, 222, 288, 290, 292, 297, 282, 339, 201, 226, 224, 530, 531, 532, 524, 523, 522, 525, 534, 537, 538, 539, 542, 519.
- **Roadmap / Cowork / ops:** MEH-176, 177, 174, 180, 182, 411, 412, 416, 452, 263, 105.

Full list in source JSON; most are not launch-blocking by the matrix.

---

## 4. SEV-4 — cosmetic / nice-to-have / post-launch (~50)

Anything `post-launch`-labeled or explicitly v2/v3:

- **`post-launch` label:** MEH-387, 388, 389, 390, 391, 392 (Personalization + children), 435, 533, 536, 540, 543, 544, 545, 347, 348, 340, 178, 239, 310, 324, 323, 567, 569, 573.
- **v2 features:** MEH-108, 86, 339.
- **Process / meta:** MEH-354, 430, 502, 552, 487 et al.
- **Closed-by-design:** MEH-568 (Phase 1 deferred to post-launch + 30 days per HANDOFF). Keep in Backlog as placeholder; do not close.

---

## 5. Duplicates found (4 candidate pairs)

Surface-level title matches, body confirms duplication. Recommendation: keep the more detailed / more recent / explicitly-parented issue; close the other with a Linear comment linking to the survivor.

| Survivor | Duplicate | Consolidation rationale |
|---|---|---|
| MEH-451 (Logo concept הזרע) | MEH-123 (Logo + Hero redesign — older, less specific) | MEH-451 has the locked concept; MEH-123 is older "Claude Design Session 1" framing |
| MEH-547 (Actions cost reduction — includes Playwright fix as sub-task 1) | MEH-549 (Leaflet E2E failure — Map page only) | MEH-549 is explicitly parented to MEH-547; merge as sub-task |
| MEH-504 (WhatsApp epic — current architecture) | MEH-239 (WhatsApp Business API infrastructure — post-launch v2) | MEH-239 is the older BSP/post-launch take; superseded by MEH-504's Direct Cloud API decision |
| MEH-225 (Pre-Launch QA Framework — meta-spec) | MEH-195 (Pre-launch — 10 essentials parent) | Overlap on pre-launch coverage; needs Smadar review — MEH-195's 10 essentials are concrete features, MEH-225 is the QA process; may not be true duplicates |

The MEH-225 / MEH-195 pair is **needs Smadar review** — they overlap but track different artifacts (process vs feature list).

---

## 6. Stale candidates (0)

**No issue meets the 90-day-no-activity threshold.** Repo started 2026-04-18; oldest `updatedAt` in the open set is 2026-04-21 (~23 days). Re-run this sweep monthly — first stale candidates would surface around 2026-07-15.

---

## 7. Recommended close batch (12)

Flat list, ready for owner approval before a follow-up session executes via Linear MCP. Items below are **high-confidence closes** (≥70% per MEH-566 confidence-calibration rule). Items with lower confidence are flagged separately.

| ID | One-line rationale |
|---|---|
| MEH-239 | Superseded by MEH-504 (Direct Cloud API decision locked 2026-05-07) — close, link to MEH-504 |
| MEH-178 | Cowork scheduled tasks — explicitly `post-launch`; collapse into MEH-174 (Cowork epic) if still needed |
| MEH-340 | Editorial intro card — `post-launch experiment` framing; not a tracked-feature; can close, reopen if revisited |
| MEH-348 | Skill audit — `POST-LAUNCH`; MEH-397 skills supply chain already enforces audit at CI level |
| MEH-347 | Visual verification loop — `POST-LAUNCH`; MEH-557 research already concluded visual regression DEFER pre-launch |
| MEH-545 | Hebrew Writer skill anti-detection sweep — `research-content-2026-05`; covered by MEH-579's customer-voice rule shipped today |
| MEH-560 | Playwright visual regression — explicitly DEFER per MEH-557 research verdict; close as decided-no |
| MEH-561 | Hypothesis property-based testing — explicitly SKIP pre-launch per MEH-557 research verdict; close as decided-no |
| MEH-310 | Custom Mehamakor research skills — `post-launch`, low-confidence value, no concrete spec |
| MEH-543 | LRQDO mארחות שכונה research — `post-launch`; revisit if discovery layer pivot happens |
| MEH-544 | Discovery layer v2 research — `post-launch`; revisit if data shows discovery gap |
| MEH-536 | Editor's pick weekly highlights — `post-launch`; can reopen if editorial direction confirmed |

**Needs Smadar review (do NOT auto-close):**
- MEH-122 (map redesign) — works today but Priority High suggests intent to ship pre-launch
- MEH-549 (Leaflet E2E) — depends on whether prod is affected
- MEH-296 (contact routing) — may be deferred if WhatsApp-only ships
- MEH-225 vs MEH-195 — overlap unclear; not a clean duplicate
- MEH-232 (copy audit) — Priority High but Bug-labeled; copy-only could be SEV-3 or SEV-2
- MEH-411, MEH-412, MEH-415, MEH-416 (founder-thinking research) — Priority High but research-only; may be sufficient as-read

---

## Confidence calibration

**HIGH confidence:**
- The 2 SEV-1 launch blockers (MEH-504, MEH-509) — both explicitly `prod-blocker` labeled and self-declared "Blocks: Production launch".
- The 12-item close batch — all items are `post-launch` labeled or explicitly superseded by a documented decision.
- Zero stale candidates — repo is too young.

**MEDIUM confidence:**
- SEV-2 launch-blocker count (18) — depends on how broadly "main user flow" is defined. If `/about` doesn't count and audits-not-yet-run are excluded, the number could drop to ~10.
- "Needs Smadar review" set (6 items) — these are the genuine ambiguous calls.

**LOW confidence:**
- SEV-3 / SEV-4 split — for features-not-bugs the matrix doesn't naturally apply; I read "if it's missing at launch, how bad?" but reasonable people will disagree.

---

## Sources / methodology

- **Linear data:** `list_issues` filtered to team Mehamakor, statuses Backlog + Todo + In Progress + In Review (excludes Done, Canceled, Duplicate). Snapshot 2026-05-14 ~UTC.
- **Severity matrix:** [`docs/BUG_SEVERITY.md`](../BUG_SEVERITY.md) (shipped today, PR #638).
- **Launch-blocker definition:** MEH-566 issue body — "SEV-1 + SEV-2 that affect main user flows (auth, /producers, /map, /producer/[id], producer dashboard)".
- **Cross-refs read in full:** MEH-504, MEH-509, MEH-549, MEH-547, MEH-225, MEH-229, MEH-195.
- **`prod-blocker` label check:** only MEH-504 and MEH-509 carry the label across the 144 open issues.

No Linear writes performed. Follow-up session executes the close batch after owner approval.
