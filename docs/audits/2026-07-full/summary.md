# MEH-1721 — full-codebase audit: summary

> Capstone of the 8-pass audit epic (P0–P8), run 2026-07-28 against pinned
> baseline `114e4c847617495a71058e180007797dfc83533f`. Every pass is
> read-only; every fix derived from them is a separate ticket.
>
> **The individual reports are the evidence. This file is the conclusion.**

---

## 1 · The headline finding is not in any single pass

Across eight passes the most valuable thing found was not a vulnerability, a
missing index, or a slow query. It was a **class**:

> ### A green that means nothing.
>
> A signal that reads as "this was checked and it passed" when what actually
> happened was "this was never checked at all" — and the two are
> indistinguishable from the outside.

This is not one bug. It is **six independent instances** in the same codebase,
found by different passes looking for different things, plus a seventh found
by turning the question on the audit itself.

| # | Instance | Where | What green meant |
|---|---|---|---|
| 1 | `rtl.spec.ts:57` **passes with zero assertions** | P6 · F-1 | Delete the premium badge from `ProducerCard` and the test still reports **passed**. Two stacked guards — a bare `if (count === 0) return` and the only `expect()` nested inside `if (badge.count() > 0)`. |
| 2 | **4 E2E specs skip on their own subject** | P6 · F-2 | The gallery button, `primary-contact-button` (the WhatsApp critical path), map markers. If the element vanished, the spec reports **skipped, exit 0**. |
| 3 | **E2E off in every PR** | MEH-1590 | The suite looked red but was not running at all. |
| 4 | **A skipped job counts as passed — in all three required gates** | P8 · F-1 | `ok() { case "$1" in success\|skipped) return 0` — byte-identical at `pr-checks.yml:697`, `deploy.yml:394`, `e2e.yml:381`. On a draft PR touching backend, `CI gate` reports success with pytest never executed. |
| 5 | **A scanner that reds without gating** | P8 · F-2 | `dependency-audit.yml` is blocking *internally* (`continue-on-error: false`) but is in no aggregator's `needs`, so it is not a required check. MEH-1585's 31 vulns and P2's 9 `next` advisories sit behind a red check that stops nothing. |
| 6 | **A quarantine that was decoration** | MEH-1698 | A `test.fixme` stacked on a `count()===0` skip; removing the quarantine still reported *skipped* against a deleted element. |

A sibling session, working independently, titled a PR
*"a green with two possible causes is not a signal."* That is the same
sentence, arrived at from a different direction, on the same day. When two
independent efforts converge on one formulation, the formulation is the
finding.

### 1.1 · The seventh instance is this audit

**The audit's own detectors had the same disease, and at a higher rate than the
code it was auditing.** Every one of these produced a confident, plausible,
wrong number before it produced a right one:

| Pass | Detector | First answer | Truth |
|---|---|---|---|
| P3 | regex over Alembic revisions | **8 heads, 4 orphans** | 1 head, 0 orphans — merge revisions assign a *tuple*, and one revision discusses its own `down_revision` in a docstring |
| P4 | mount check via regex on `router_registry.py` | `home_products` **mounted** | **not** mounted — the regex matched a **commented-out** `include_router` line |
| P5 | `vulture --min-confidence 90` | **113** dead-code hits | **0** — all are `cls` in Pydantic `@field_validator` signatures |
| P5 | commented-out-code heuristic | **21** blocks | 0 — the three largest are prose documentation |
| P6 | no-assert test detector | **20** hollow tests | **0** — a helper named `_assert_4xx_not_503()` was missed on the leading underscore |
| P6 | endpoint-coverage probe | **42 of 175 untested (24 %)** | unknown — 4 of 4 spot-checks falsified it (f-string URLs, router prefixes) |
| P7 | `aria-label` without `role` | **101** | **12** — through five distinct defects, incl. a backward-only `role` scan that condemned a correctly-fixed component |
| P7 | keyboard-accessibility probe | **21** violations | unknown — line numbers pointed at plain JavaScript |
| P7 | Hebrew masculine-form counts | dozens | **3** — substring matches inside `בחרי`, `יצרנית`, `לשלוח` |

**Nine detectors. Nine wrong first answers.** Two metrics were **withdrawn
entirely** rather than published (P6 endpoint coverage, P7 keyboard
accessibility); two more were reported as *unusable* rather than as findings
(P5 vulture, P5 commented code); one **reversed its verdict** (P4's mount
check, which would otherwise have reported a live endpoint as latent).

This is recorded as a first-class result, not a caveat, for one reason:

> **The failure mode being audited — a check that reports a clean result
> without having checked — is the same failure mode the audit itself kept
> producing.** It is not a property of this codebase's CI. It is a property of
> *automated checking*, and the only thing that caught it, every time, was
> reading the underlying code.

Had any of those nine numbers shipped unverified, the reports would have been
worse than useless: they would have sent someone to fix twelve things that
weren't broken, and — in P4's case — to leave one live endpoint unexamined.

### 1.2 · What this class implies for the fixes

**Any fix ticket derived from these reports must open with a Phase 0 that
re-verifies the finding against code.** A finding that does not reproduce is
closed as **not-applicable** — never as "fixed."

This is now a locked rule, and it has precedent in both directions from
2026-07-28 alone: MEH-1739/1740 were closed not-applicable after MEH-1743
showed their premise did not hold, and P4's mount-check reversal is the same
lesson pointing the other way — a finding that looked absent and was real.

---

## 2 · The corollary: a check whose own changes aren't checked

**P8 · F-3** is not an instance of the class above; it is what the class
enables.

`scripts/**` appears in **no paths filter in any workflow**. A PR touching only
`scripts/` yields `frontend=false backend=false workflows=false`, so
`api-contract-static` (`deploy.yml:157`) skips — and by §1's instance #4 a skip
counts as a pass.

`scripts/check_api_contract.py` is the file that job runs. **It can be
weakened, or broken, in a PR where the only job that exercises it does not
run — and `Deploy gate` still reports success.**

Same shape as **MEH-1030** (guarded registries that silently self-disable when
a listed path moves). The general form:

> A validator is only as trustworthy as the trigger that runs it, and a
> validator that gates its own changes on a filter that excludes itself is
> not gated at all.

Partial mitigation, worth stating: `repo-guards` runs stack-independently and
executes `scripts/checks/run-all.sh`, so the guard scripts under
`scripts/checks/` **are** exercised on every PR. The exposure is limited to
scripts invoked by *stack-conditional* jobs.

---

## 3 · Findings inventory

Severity is per-report. Nothing in the epic is 🔴 Critical.

| Pass | Report | Headline |
|---|---|---|
| **P0** | `p0-recon.md` | Inventory + metrics baseline. Facts only. |
| **P1** | `p1-security-backend.md` | Authz per-endpoint, JWT/OAuth, validation, secrets. Corrected a stale rule line that understated the JWT posture by 96×. |
| **P2** | `p2-security-frontend.md` | 🟠 `next` carries **9 high advisories**, the only *direct* vulnerable dep. 🟡 CSP `script-src` has `'unsafe-inline'` **and** `'unsafe-eval'`. ⚪ Two docs call that CSP "strict"; it is not. **No XSS** — all 7 `dangerouslySetInnerHTML` sites go through one test-locked escaper. |
| **P3** | `p3-database.md` | 🟡 **17 FK columns with no usable index** (Postgres does not auto-index FKs). Alembic chain clean: 1 root, 1 head, 48/48 reachable, 0 orphans. `EXPECTED_TABLES=38` exact. **44/44 FKs carry `ondelete`.** |
| **P4** | `p4-performance.md` | 🟡 **25 live GET list endpoints with no `LIMIT`**. 🟡 One hero-sized image bypasses the Cloudinary helper. **0 critical, 0 high** — Leaflet is `dynamic({ssr:false})` everywhere, map shells reserve height, all 23 `<Image>` declare `sizes`. |
| **P5** | `p5-code-quality.md` | 🟠 `schemas.py` — **3,405 LOC, MI 0.00, +231 % in 90 days**. 🟡 `register_producer()` — 331 lines, CC 38, builds `Producer(...)` twice. Average complexity **A (3.38)**; duplication **0.18 %**. |
| **P6** | `p6-testing.md` | 🟠 `rtl.spec.ts` passes with zero assertions. 🟡 4 specs skip on their own subject. Backend **0 hollow tests / 1,898**; frontend **0 assert-less / 1,744**. All five critical paths covered. |
| **P7** | `p7-a11y-rtl.md` | 🟡 8 hardcoded `text-right` break `/en` (a real route). 🟡 12 `aria-label` without `role` — **exactly MEH-1227's count, unchanged**. Contrast **passes AA on all 5 brand pairs**. `יצרן` fully resolved: all 18 are the regulatory licence term. |
| **P8** | `p8-cicd-config.md` | 🟠 §1 instances #4 and #5. 🟡 `scripts/**` in no filter. 🟡 No secret scanning. ⚪ Branch protection unverifiable from the repo. |

**What the epic did *not* find, stated deliberately:** no critical
vulnerability, no exploitable XSS, no IDOR gap, no broken Alembic chain, no FK
without `ondelete`, no contrast failure, no hollow unit test, and no committed
secret. The codebase's fundamentals held up under eight passes. The debt is
concentrated and named.

---

## 4 · Triage order

### Autonomous (batched)

1. **`rtl.spec.ts` real assertions** — first. RTL *is* the product; a suite
   reporting coverage it does not have is worse than an empty one.
2. **The 8 `text-right` breaking `/en`** — mechanical, logical-properties rule.
3. **The 9 npm advisories** — one PR.

> **All three are currently blocked behind MEH-1733.** They touch frontend, so
> Playwright will actually run — and it will hit the red `parity.spec` failures.
> The audit PRs merged green because Playwright **skipped** them (§1 instance
> #4 again, applied to this epic's own delivery). Writing the code before
> MEH-1733 clears means writing code that cannot merge.
>
> **No baseline moves without Sapir** (ADR-017): fixing non-determinism is CC's;
> deciding what the page should look like is hers. A baseline *is* the visual
> proof, and the author of a fix cannot also be its proof.

### RED — chunked, no auto-merge, reviewed individually

- **CSP hardening** (P2)
- **The 17 unindexed FKs** (P3) — **`CREATE INDEX` without `CONCURRENTLY` takes
  a lock.** On a live database that is the whole decision, not an
  implementation detail, and it belongs in the plan before any code.
- **The 25 uncapped list endpoints** (P4) — **adding a cap changes behaviour for
  existing clients.** The cap *and* its client impact get proposed before
  anything is touched.

### Not now — Sapir's call on timing

- **The `schemas.py` split** (P5). MI 0.00 and +231 %/90d are real and the
  trajectory is the finding. But splitting a god file before launch is how you
  break everything, and this one is the module every request and response shape
  passes through. **Raised, not started.**

### Stopped, correctly

- **D3** (experiences gating) — the count of already-published experiences
  belonging to non-approved businesses must exist *before* any visibility
  change, because gating retroactively unpublishes live content. Unknown is not
  zero.
- **MEH-1737 §5**, and all RED items pending **ADR-017 §3.5**.

---

## 5 · What this epic did not measure

Carried forward from every pass's own §8, because a summary that omits them
would itself be a green that means nothing:

- **No query plans, no row counts.** Every P3 index finding is
  *suspected by static read*. The multiplier that turns a missing index from
  free into expensive is unmeasured, and cannot be measured from a CC session.
- **No Lighthouse, no Core Web Vitals, no axe run.** P4's CLS statements and
  P7's a11y findings are structural reads, not scores. All three need a served
  build plus a reachable backend; Railway egress is blocked from the sandbox.
- **No coverage percentage.** `pytest --cov` could not run (no backend venv, no
  DB). CI's 70 % gate and 77 % baseline are quoted from `pr-checks.yml:388`.
- **No mutation testing.** Nothing here establishes that a passing assertion
  would fail against broken code — which is the strongest form of the question
  §1 asks.
- **No branch-protection verification.** Ruleset contents are GitHub settings,
  invisible from the repo. The documented as-of (2026-07-04) is stale.
- **Endpoint coverage and keyboard accessibility** — probes built, falsified,
  **withdrawn** (§1.1).
- **Exploitability of the 9 `next` advisories.** Several require Server Actions,
  a custom server, or Turbopack. Whether those preconditions hold here is triage
  work that was deliberately not done — asserting "9 live vulnerabilities" from
  presence alone is the error this epic spent nine detectors learning to avoid.

---

## 6 · The one-line version

> The codebase is in better shape than the ticket list suggests. Its checks are
> in worse shape than their green ticks suggest. And the tooling used to
> discover that was wrong nine times out of nine before it was right — which is
> the finding, not a footnote.
