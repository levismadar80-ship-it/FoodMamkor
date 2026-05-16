# מהמקור — Bug Severity Matrix + Decision Authority
> קרא CLAUDE.md קודם. הסעיפים כאן משלימים את `.claude/rules/workflow.md` (Bug Protocol) ואת `docs/BUG_PATTERNS.md` (post-incident lessons).

איך לקבוע SEV, איך להבדיל מ-Priority, ומתי Claude Code חייב לעצור ולשאול לפני שממשיכים.

---

## 1. Bug Severity Matrix

SEV הוא תכונה פנימית של הבאג: *כמה רע אם זה קורה*. הוא אינו עדיפות (ראו §2).
ה-SLA הוא מטרה, לא חוזה — Pre-launch אנחנו אחרי correctness; Post-launch אנחנו אחרי
שילוב של uptime + trust.

| SEV | Definition | User impact | Pre-launch SLA | Post-launch SLA |
|---|---|---|---|---|
| **SEV-1** | Production down or data loss. אין workaround. | כל המשתמשות חסומות, או נתונים אבדו / חשופים | Same day (drop everything) | 4 hours |
| **SEV-2** | Major feature broken, workaround קיים | Many users affected; rest of site functional | This week | 24 hours |
| **SEV-3** | Minor feature issue או single edge case | Few users; or test/CI-only with no prod blast radius | This sprint | 1 week |
| **SEV-4** | Cosmetic, typo, nice-to-have | No functional impact | Backlog | 1 month |

### SEV-1 — examples

- **[MEH-265](https://linear.app/mehamakor/issue/MEH-265)** — `_migrate_columns` drift broke `/auth/login` with a 500. Every user blocked from logging in. Production incident; post-mortem locked into `.claude/rules/workflow.md` and gave rise to ADR-003 (Alembic-only schema authority).
- **[MEH-314](https://linear.app/mehamakor/issue/MEH-314) / [MEH-317](https://linear.app/mehamakor/issue/MEH-317)** — CI budget exhaustion masked a test bug; PR #337 shipped a regression. Affects the *correctness signal* on every PR, so the blast radius is repo-wide even though no end-user was directly hit.

### SEV-2 — examples

- **[MEH-256](https://linear.app/mehamakor/issue/MEH-256)** — Rate limiter keyed on Railway's proxy IP, collapsing every client into one bucket. Login still worked — defence-in-depth weakened, not removed. Workaround possible at the WAF layer.
- **[MEH-321](https://linear.app/mehamakor/issue/MEH-321)** — `GET /producers/me` returned 500 right after registration (ResponseValidationError on nullable `created_at`). Dashboard broken for every newly-registered producer, but public site and login flow unaffected.

### SEV-3 — examples

- **[MEH-353](https://linear.app/mehamakor/issue/MEH-353)** — `@invalid.test` fixtures in `scripts/smoke_test.py` failed Pydantic's RFC 6761 check before the rate-limit assertion ran. False-positive pass on the smoke check; no user-facing impact, but rate-limit confidence was hollow.
- **[MEH-575](https://linear.app/mehamakor/issue/MEH-575)** — Stale test that wasn't carrying the `__Secure-Fgp` cookie post-MEH-327. Test-only failure, register/login flows production-correct.

### SEV-4 — examples

No standalone MEH-XX example yet — cosmetic issues in mehamakor are typically bundled into larger UI tickets (e.g., page redesigns) rather than tracked separately. This may change post-launch as user-reported issues come in.

---

## 2. Severity vs Priority

הם **אורתוגונליים**. SEV מתאר את הבעיה; Priority מתאר מתי לטפל בה.

- **SEV** = how bad if it happens. Intrinsic to the bug. Doesn't change with calendar.
- **Priority** = how urgent to fix now. Depends on launch state, blast radius, business context, opportunity cost.

| Scenario | SEV | Priority | Why |
|---|---|---|---|
| Auth bypass affecting 2 users | 1 | 1 (Urgent) | Severity dominates — security cannot wait |
| New feature blocking launch | 4 (no bug) | 1 (Urgent) | Calendar dominates — timing-critical |
| Typo on `/about` page | 4 | 4 (Low) | Both axes low |
| Slow CI affecting dev velocity | 3 | 2 (High) | Indirect blast radius; compounds daily |

### Worked example — [MEH-408](https://linear.app/mehamakor/issue/MEH-408) (production safety hardening)

MEH-408 was a multi-phase project (deny-list, off-Railway R2 backups, `DATABASE_URL_PRODUCTION` / `DATABASE_URL_STAGING` separation, DR drill). It carried Linear priority **P1 Urgent** and shipped across four PRs over a week.

**SEV at start of the work:** SEV-4. There was no live bug. Login worked, the DB was up, backups existed inside Railway. If you graded the codebase the morning the ticket opened, nothing was broken for any user — the worst-case scenario was *future* data loss if Railway had an outage.

**Priority:** P1 Urgent. Pre-launch, the absence of off-site backups + the absence of a separated production DB URL are launch-blockers — not because they affect today's users (we have none yet) but because they're impossible to safely add post-launch under load. The cost of *not* shipping them before launch is asymmetric: a Railway region failure post-launch with no R2 mirror is unrecoverable.

**Lesson:** never let a low SEV trick you into a low Priority. SEV scores the bug; Priority scores the decision. MEH-408 is the canonical pre-launch case — high priority, near-zero severity — and the work was correctly classified that way. The mistake would have been to file it as SEV-1 (it isn't — nothing is broken) or to ship it as SEV-4 + P4 (it is launch-blocking).

The same shape recurs every time: pre-launch hardening, infrastructure migrations, security defence-in-depth. Grade SEV honestly; grade Priority by calendar and consequences.

---

## 3. Decision Authority — when Claude Code stops and asks

מקור: CLAUDE.md + `.claude/rules/workflow.md` (Rule 4, Risk-tiered review). מסעיף זה
משלים — לא משכפל — את הכללים האלה. אם משהו פה סותר את workflow.md, workflow.md מנצח.

### 3a. Human Review Checkpoints (CC MUST stop)

- DB schema — anything under `backend/app/models/**`, `backend/alembic/versions/**`, or model imports that change column shape.
- Auth / security — `backend/app/auth.py`, `backend/app/routers/auth.py`, JWT issuance, fingerprint cookie, rate limits, CORS, CSP.
- Production deploys — anything that pushes to `main`, edits `.github/workflows/deploy.yml`, or touches Railway/Vercel config (the deny-list from [MEH-408](https://linear.app/mehamakor/issue/MEH-408) Phase 1 enforces a subset; ambiguous cases still need a stop).
- New env vars (workflow.md regression rule 8).
- Architectural changes — extracting a helper, renaming a central component, anything touching `.claude/central-components.json`.
- Any task tagged HIGH-RISK in Linear ([MEH-450](https://linear.app/mehamakor/issue/MEH-450)).

### 3b. Confidence Calibration

- "When confident: state. When uncertain: say so. When unknown: I don't know — checking now."
- Every code claim ships with `file:line` evidence (exec §10 in `.claude/rules/code-execution.md`).
- Two failed attempts on the same problem → STOP, surface the failure mode, ask for direction. No third speculative push.
- Skeptic Mode default: assume the surface is broken until verified, not the other way around ([MEH-353](https://linear.app/mehamakor/issue/MEH-353) post-mortem captured three speculative fixes that Skeptic Mode prevented).

### 3c. Information Disclosure

- Multi-phase task → Phase A scan results pasted in chat before Phase B starts. No silent transitions.
- Pre-existing failure discovered mid-task ([MEH-575](https://linear.app/mehamakor/issue/MEH-575) precedent) → STOP, surface, ask before working around it on the current branch.
- Scope creep — about to edit a file not in `<file_locations>` → STOP, surface, ask. The cost of asking is ~30 seconds; the cost of an unauthorized edit can be hours.
- Post-task PR description must include verification evidence: pytest output, grep results, build logs — whatever the verification step in the prompt asked for. "Trust me" is not evidence.
