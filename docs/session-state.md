# Session state — MEH-1512 pickup UI + MEH-1510 verification (2026-07-23)

> Transient per workflow rule 14. Prior contents (MEH-1313 PR-triage sweep, 2026-07-18)
> superseded; that work stays tracked in Linear. This note captures the 2026-07-23 batch.

**Batch:** MEH-1512 (frontend chunk 2 of the pickup-locations feature) + MEH-1510
(read-only acceptance verification of MEH-1412). Earlier in the same session an
MEH-1511 amendment (rule 23 self-QA substitution) was attempted but is **not landed**
(see §3).

---

## 1 · MEH-1512 — business-page pickup rows — **MERGED (PR #2115, squash `1e77f6b2`, on staging `d2e7798f`)**

- `feature/meh-1512-business-page-pickup-ui` off `origin/staging`. Frontend-only.
- **What shipped:** `DeliveryBlock.jsx` now consumes the `producer` prop (already passed at
  `ProducerSections.jsx:401`, never destructured) and renders real pickup/market_stand rows
  from `producer.locations[]` — label (→city fallback) · city · opening_hours · outbound
  Waze nav link (from lat/lng, mirrors `MiniMap.jsx:90`). Sorted city→label; >5 rows collapse
  to a 5-row preview + the reused MEH-1435 `CompactCities` show-more toggle. Fallback preserved
  (pickup=true + no rows → generic "איסוף עצמי" line). Branch-kind filtered out. No 2nd in-page
  map. `quickAnswers.buildDeliveryAnswer` pickup_only now derives cities from `locations[]`
  (multi-pickup → no-city copy, not one misleading city) — only consumer is this page
  (WhatsAppQuestionChips→ContactCard), verified.
- **No new Hebrew string** (nav reuses `map.mini.open_in_waze`); MEH-1461 "איסוף עצמי" lock kept;
  MEH-829 address stays off payload; RTL logical-only.
- **Gates (local, after `npm ci`):** build exit 0 · full vitest 1580 pass/10 skip (DeliveryBlock
  +4, quickAnswers +2) · eslint 0 errors · `/adversarial-review-coverage` 0 REFEREE BLOCKs.
- **Screenshots** 375+1440 (3-row + 10-row) committed `qa-artifacts/MEH-1512/` (webp 93 KB,
  compressed MEH-1156), rendered via a temp `next dev` route (not committed).
- **Merge:** Sapir enabled auto-merge herself (actor `levismadar80-ship-it`); landed on the 2
  required gates green post-ready. The earlier "CI gate failure" was the superseded draft-run
  (rule 21). Vercel preview was **Ignored/CANCELED** (deploy rate-limit, not a code failure) →
  no preview URL; mobile QA on `staging` remains Sapir's. `Closes MEH-1512`.

## 2 · MEH-1510 — MEH-1412 acceptance verification — **Done** (report-only, no files)

- Result block written to the top of the MEH-1510 description; spec path corrected to
  `frontend/e2e/flows/24-producer-locations.spec.ts` (was `tests/e2e/`, 3×). Moved to Done.
- **6/6 criteria VERIFIED at code-path level** (per-location markers, secondary style, layer
  toggle `MapPane.jsx:111-120`, unique-business cluster `MapComponent.jsx:441-444`, one-card-per-
  producer, empty-locations fallback `:651-660`). **Live-on-staging NOT independently verified** —
  sandbox blocked from Railway + staging unseeded, so the seed-dependent E2E fails as documented
  (non-required gate). **MEH-1424 perf: NOT VERIFIABLE** from the sandbox (mitigation code present:
  bulk `addLayers` `:666-668`).

## 3 · MEH-1511 — rule 23 self-QA amendment — **NOT landed (superseded)**

- Phase 0 done; both Vercel+Sentry MCPs confirmed connected. Amendment drafted for
  `.claude/rules/workflow.md` (rule 23) + `docs/decisions/ADR-016-*.md`, but the edits were
  **blocked by the harness auto-mode classifier** (a docs change relaxing a human-in-the-loop
  merge gate reads as safety-sensitive). Branch `feature/meh-1511-rule23-self-qa-substitution`
  exists with **no committed changes**. The user then pivoted to MEH-1512/1510. If resumed:
  the full amendment text was posted in chat; carve-out (d) must use "merge-block marker"
  wording (never the literal phrase) or the PR self-trips the gate (ADR-016 lines 79-94).

---

## Next / open

- **Sapir:** mobile QA of the pickup rows on `staging` (rule 23 human pass); MEH-1424 live
  /map profiling; re-seed staging (`seed_demo_business.py --refresh`) to green the
  producer_locations E2E.
- **MEH-1511** remains blocked on the classifier — needs the user to clear the edit block
  (permission mode / rule) to land the rule-23 amendment.
- This session-state update is on its own branch `feature/meh-1512-session-state`, **not** in
  the (merged) MEH-1512 PR, per the batch instruction. No PR opened for it (batch said "one PR,
  MEH-1512 only") — Sapir can land or discard it.
