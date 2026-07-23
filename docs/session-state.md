# Session state — 2026-07-23 cleanup batch (MEH-1515 · session-state consolidation · MEH-1512 mobile evidence)

> Transient per workflow rule 14. Replaces the stale MEH-1313 (2026-07-18) triage
> scratch. **Consolidates two dangling session-state snapshots** — `feature/meh-1512-session-state`
> (MEH-1510/1511/1512) and `feature/meh-1513-session-state` (MEH-1513/rtl-scan) — into
> this one PR; the later (1513) branch supersedes, and the salient facts of both are
> carried below so nothing is dropped. The other branch is deleted.

## TASK 1 — MEH-1515 (rtl-scan.sh real fix) — DONE, auto-merging
Branch `feature/meh-1515-rtl-scan-fixed-string-allowlist` → **PR #2120**, auto-merge (squash) armed.
- `rtl-scan.sh:59` `grep -v -f` → **`grep -vFf`** — BRE read the `[locale]` segment as a
  character class, so all 8 `[locale]` PATH-EXCEPTION entries failed silently (surfaced as
  the MapPane.jsx:145-146 false positive). Fixed-string matches `check-rtl.sh:66` semantics.
- `check.sh` step 4 — removed the MEH-1513 local `grep -vFf` re-application (single-file-scope
  debt); delegates fully to the fixed guard now (one authority, MEH-271).
- Verified: `rtl-scan.sh` → 0 / EXIT 0; `check.sh` step 4 → PASS (MapPane absent). Detection
  grep (`rtl-scan.sh:57`) byte-unchanged; real non-exempt violations still caught with file:line
  (before/after bracketed by check.sh's own output). No frontend component touched; SKILL.md untouched.

## TASK 2 — dangling session-state branches — DONE (this PR)
- Both branches' commits touched **only** `docs/session-state.md`; their backend/migration/
  check.sh/CHANGELOG/HANDOFF deltas were pure stale-base drift (MEH-1508 migration already on
  staging). No global-lock issue.
- 1513 (12:10:45Z) supersedes 1512 (12:06:24Z). This branch = 1513 reset onto current staging;
  `feature/meh-1512-session-state` deleted after the PR opens.

## TASK 3 — MEH-1512 mobile evidence — BLOCKED (not closed; no code change)
Cannot produce the artifact from the CC sandbox: **staging is behind Vercel SSO deployment
protection** — `/`, `/he`, `/api/producers` all 302 → `vercel.com/sso-api` (agent proxy 403s that
host). Not the TLS-1.2 handshake issue; an auth wall with no credentials I may use. So I could
neither find a producer with pickup/market_stand locations nor screenshot the page. MEH-1512 NOT
reopened. **Needs Sapir:** capture on an authenticated phone session, or grant a
protection-bypass token, then the 375px pickup screenshots + slug + direct staging URL can be posted.

## Carried-forward context (from the two superseded snapshots + this session)
- **MEH-1510** — map acceptance verification (report-only) — 6/6 criteria verified in code; E2E/perf live-status NOT VERIFIABLE from sandbox.
- **MEH-1511** — rule-23 self-QA amendment — **BLOCKED** on a permission classifier that denies edits to `.claude/rules/**` (+ ADR-016). Two ready diffs surfaced to Sapir; her decision. Not merged (staging rule 23 unamended).
- **MEH-1512** — DeliveryBlock pickup rows (chunk 2) — **merged** by a parallel session, PR #2115, 11:58Z.
- **MEH-1513** — check.sh step-4 local RTL allowlist honoring — Done, PR #2116 (the debt MEH-1515 now removes).
- **MEH-1509 chunk 1** — `ProducerLocationOut` opening_hours+phone serialization — merged, PR #2112.

## Open items for Sapir
1. MEH-1511 rule-23 amendment — permission decision on `.claude/rules/**` edits (diffs ready).
2. MEH-1512 mobile screenshot — capture on authenticated staging, or unblock Vercel SSO for the sandbox.
3. MEH-1515 PR #2120 — auto-merging on green CI (tooling-only).
