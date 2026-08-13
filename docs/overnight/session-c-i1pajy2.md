# Session C — `i1pajy` continued (context-resume segment, 13/08)

**Lane domain:** `.github/**` · `scripts/**` · `frontend/e2e/**` · `frontend/__tests__/**` ·
`docs/**` · `.claude/**` (per `LANES.md`; the `**/tests/**` boundary disagreement resolves toward
Lane A per `session-a-9d5pkj.md:64` — not touched this segment either way).

**This is a resume, not a fresh start.** The session prompt reported a prior segment had already
merged MEH-1742 / MEH-1907 / MEH-2043 and gone quiet on context reset with no log written. This
document covers only the resume: state verification, a fresh sweep, and one new task.

---

## 1 · State verification (before any new work)

All read from `origin/staging` / live Linear, not inferred from the prompt.

| Claim | Verified |
|---|---|
| MEH-1742 / MEH-1907 / MEH-2043 merged, ancestors of `origin/staging` | ✅ `94b6ce1` / `ab6c399` / `479a14a` all `merge-base --is-ancestor HEAD` true |
| MEH-2043's Backlog-stay is deliberate (CSP tightening deferred) | ✅ card's own DoD: CSP `font-src` removal is explicitly gated on the canvas fix landing first — not touched |
| MEH-1523 / MEH-1911 — CC-side complete, Sapir-pending | ✅ both unchanged: MEH-1523 `Backlog` (reopened after a 3s auto-close, held), MEH-1911 `In Progress` + `archivedAt` set (pre-existing inconsistency, not mine to resolve) |
| MEH-1974 blocked on Cloudinary; MEH-1925 Sapir-only | ✅ MEH-1974 `Backlog`, explicitly bars baseline recapture until MEH-1925 resolves + #2757 lands; MEH-1925 `Todo`, "אצל מי: ספיר בלבד" — no code task |
| MEH-1974 foreign-claimed | ✅ `feature/meh-1974-vrt-parity-recheck` exists on `origin` — read-only, untouched |
| MEH-2053 / PR #2868 (Lane A's carrier) | **Still open**, not merged (base `staging@ab6c399`, now several commits behind). Left untouched — foreign branch, not Lane C's to merge (ORDERS §2 FOREIGN=READ-ONLY) |

No corrections needed to the inherited picture — everything held.

---

## 2 · Fresh Lane C sweep

`list_issues` — In Progress (`cc-queue` opt-in) + Todo, both tracks, live.

**In Progress / cc-queue, Lane C domain:** MEH-215, MEH-1911 (already known, Sapir-pending).
Everything else in that list (MEH-2045, MEH-1906, MEH-1806, MEH-2015) is Lane A/B domain.

**MEH-215 — re-checked, not actionable.** All 4 journey chunks are now merged (PR #2711 chunk A,
#2856 chunk B, #2747 chunk C, #2822 chunk D — B merged **today at 09:42Z**, closing the last gap).
The remaining scope (B's full OAuth happy-path coverage) is explicitly blocked on MEH-1968's mocking
convention ruling, which is a policy decision the card itself says isn't CC's to make unilaterally
(rule 32: adding constraints is CC's, deciding an open policy question by building on it is not).
Not picked up.

**MEH-1249 (Todo, no exclusion labels) — re-checked, explicitly blocked by its own card.** Its
locked 05/08 decision states the 1,074-item multi-session conversion run must not start "before
launch-blocking items or before MEH-1909" (Release #2). MEH-1909 is still `In Progress`, RED tier,
release PR #2480 not yet merged to `main`. Not picked up — the card's own ordering constraint, not a
judgment call.

**MEH-1502 (E2E teardown) — found already `Done`**, completed the same day (08:18Z), by a session
other than this one. Removed from the candidate list; no action needed.

**MEH-1873 (actions/checkout hang investigation, Backlog, `tooling`+`Bug`, no exclusions, no
existing branch/PR) — taken.** See §3.

**Not vetted this pass** (B1/B2 checked clean, B3 not run): MEH-1514, MEH-1516, MEH-1517, MEH-1526,
MEH-1706, MEH-1755, MEH-1962, MEH-2040. Left for the next Lane C session — stated so the list isn't
mistaken for "swept clean."

---

## 3 · MEH-1873 — checkout-cancel baseline (PR #2870, merged)

**The question:** of `pr-checks.yml`'s `conclusion: cancelled` runs, how many are genuine
`actions/checkout` hangs (job stuck, zero guards run) versus ordinary concurrency-group
supersession? The card had four individual incidents (03/08 ×3, 06/08 ×1), no base rate.

**Scope actually covered, disclosed rather than silently substituted:** `list_workflow_runs`
caps at 30/page regardless of the `per_page` value requested. 10 pages → **299 unique runs across
~21 hours** (2026-08-12T14:34Z → 2026-08-13T11:45Z), not the 30 days the card's Phase 0 asks for —
at this repo's traffic (~14 runs/hour), 30 days is ~10,000 runs, well outside one session's
pagination budget via this tool.

**Findings:** 63 cancelled runs in the sample. **62/63 (98.4%) match ordinary supersession** — a
newer run on the same branch started before the cancelled run's `updated_at`, the exact
`cancel-in-progress` signature MEH-1907 documents. **Zero match MEH-1873's original signature.**
One outlier (`31640761603`) fits neither: all 17 of its jobs completed with real conclusions
(including a full pytest + vitest run), but the run-level conclusion reads `cancelled` while the
last job (`CI gate (required)`) actually reports `failure` — a distinct anomaly, flagged in the
audit doc, not chased further here.

**Verdict:** no repo-side fix indicated by this sample. The pattern didn't recur once in 299 runs
despite more traffic than the four original incidents combined — consistent with the 06/08
recurrence being the already-caveated GitHub Actions service incident rather than a standing
defect. **Not proven absent** — not reproduced in a window an order of magnitude short of 30 days.
No `docs/ci/*.patch.md` written, per the card's own conditional DoD (only required if a repo-side
cause were found).

**Self-check:** `scripts/checks/run-all.sh` — 14 guards ran, 1 pre-existing warning
(`dnm-matcher-guard`, unrelated). No code touched — `npm run build`/`pytest` not run, stated as
such. `check-linear-mentions.sh` flagged the bare `MEH-1873`/`MEH-1907` mentions (it only
recognizes `Closes`/`Fixes`/`Resolves`, not `Refs`); both cards verified `Backlog` — not `Done` —
immediately before opening, so the reopen risk the guard exists to catch doesn't apply. Merged
`unstable` (only the non-required, documented-non-blocking Vercel rate-limit red). Flip-checked
post-merge: both MEH-1873 and MEH-1907 remain `Backlog`, no unwanted auto-close. Verified the file
landed by reading `origin/staging`, not the PR head.

**Left in `Backlog`, not `Done`** — the literal 30-day baseline wasn't achieved, and a DoD item
should reflect what was measured, not what was intended (workflow.md rule 33). Findings posted as
a Linear comment.

---

## 4 · What the next Lane C session should know in one paragraph

State verification from the resume held with no corrections. MEH-215 is fully chunked but not
closeable (blocked on MEH-1968). MEH-1249's multi-session conversion run stays parked until
MEH-1909 (Release #2) lands — check that card's status before touching MEH-1249. MEH-1873 is
closed out with a real (if scope-reduced) finding: no repo-side checkout-hang fix indicated. Eight
Backlog candidates (§2) still need a B3 pass before the next session claims one. MEH-2053/#2868
(Lane A's carrier) was still open at last check — read-only, not Lane C's to advance.
