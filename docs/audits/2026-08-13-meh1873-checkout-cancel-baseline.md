# MEH-1873 Phase 0 — `pr-checks.yml` cancellation baseline

**Question the card asks:** of the `conclusion: cancelled` runs on `pr-checks.yml`, how many are
genuine `actions/checkout` hangs (job stuck, zero guards executed) versus ordinary concurrency-group
supersession (a newer push cancelled the in-flight run)? The three 03/08 + one 06/08 incidents were
individual observations, not a base rate.

## Method

`mcp__github__actions_list` (`list_workflow_runs`, `pr-checks.yml`) paginated 10 pages
(30 runs/page — the tool caps `per_page`, it does not honor the requested 100). Runs deduped by id.

**Scope actually covered: 2026-08-12T14:34:15Z → 2026-08-13T11:45:23Z, ~21 hours, 299 runs.**
This is **not** the 30-day window the card's Phase 0 asks for — at ~14 runs/hour, 30 days is
roughly 10,000 runs, which is far outside what this session could paginate through (30/page via
this tool). Stated here rather than silently substituted: this is a 21-hour sample, large enough to
be a real base rate (63 cancellations), too short to be the exhaustive 30-day count the card specifies.

For each `conclusion: cancelled` run, checked whether a **newer run on the same branch started
before this run's `updated_at`** — the concurrency group's `cancel-in-progress` signature
(`pr-checks.yml:40`, documented in MEH-1907). That is a stricter test than "a later run exists
somewhere" (which is true of every run on `staging`, since staging is pushed to constantly) — it
requires the newer run's start to actually overlap the cancelled run's lifetime.

## Findings

| | Count |
|---|---|
| Total runs sampled | 299 |
| `success` | 209 |
| `failure` | 23 |
| `cancelled` | 63 (34 on `staging`, 29 on feature branches) |
| Cancelled runs explained by concurrency supersession (newer run started before this one finished) | **62 / 63 (98.4%)** |
| Cancelled runs **not** explained that way | 1 / 63 |

**Zero of the 63 cancelled runs match MEH-1873's original signature** — a job stuck inside
`actions/checkout` for ~3 minutes with **zero guards executed**, unconnected to any newer push.
Every supersession case shows the expected shape: a new push landed on the same branch while the
old run was still in flight, and the old run was cancelled within seconds to a few minutes —
consistent with `cancel-in-progress: true` doing exactly its job, not with a hang.

### The one outlier — not a checkout hang either, a different anomaly

Run `31640761603` (`staging`, created `2026-08-12T21:04:11Z`, run-level `conclusion: cancelled`,
17m26s) does not fit the supersession pattern (the next `staging` run started ~2 minutes **after**
this one's `updated_at`, not before). Pulling its 17 jobs individually: **every job completed with a
real conclusion** — `success` or `skipped` — including `Backend tests (pytest)` (ran to
`21:19:37`) and `Frontend unit tests (vitest)` (ran to `21:16:15`). The only non-`success` job is
`CI gate (required)`, whose `Aggregate required-check results` step reports **`failure`**, not
`cancelled`, completing at `21:21:36` — one second before the run's own `updated_at`.

So the run-level `cancelled` label does not correspond to any job actually being cancelled in
this run; the real event was `CI gate (required)` failing its aggregation. This is a distinct
anomaly from what MEH-1873 describes (a run-level conclusion that disagrees with every job's own
conclusion), not a checkout hang, and not chased further here — flagged for a separate card rather
than absorbed into this one's scope.

## Verdict (DoD item: "reasoned conclusion — infra / repo / combination")

**No repo-side fix is indicated by this sample.** The pattern MEH-1873 was opened to explain
(checkout hangs ~3 minutes, zero guards run, `pr-checks.yml:82`'s `timeout-minutes: 3` on
`Repo guards`) did not recur once in 299 runs / 63 cancellations over this window, despite the
window carrying more traffic (299 runs / ~21h) than the four originally-reported incidents combined
(03/08 + 06/08). The 06/08 recurrence was already caveated in the card as coinciding with a GitHub
Actions service incident (`Failed to resolve action download info: Service Unavailable`); this
sample is consistent with that being infrastructure-side and transient rather than a standing
repo-side defect — **not proven absent, only not reproduced** in a 21-hour window an order of
magnitude short of the 30 days requested.

**Per the card's own conditional DoD** ("אם ריפו — תיקון... → `docs/ci/*.patch.md`"): no patch doc
is written here, because no repo-side cause was found to patch. Widening `timeout-minutes` on
`Repo guards` — floated in the card's 06/08 addendum as "cheap and safe regardless" — is not
proposed here either: it would be a change made without evidence it fixes anything, on a file that
is CC-deny regardless of motivation.

## What this does not close

- **Not a 30-day count.** A session with `list_workflow_runs` paginated at 30/page cannot reach 30
  days' worth of runs on a repo this active within one turn. If a full 30-day census is still
  wanted, it needs either a higher-throughput read path (direct GitHub API, not this MCP wrapper)
  or acceptance of a much larger number of paginated calls than one session should spend on one
  Phase 0.
- **The `31640761603` anomaly is unexplained**, not dismissed. Recorded here so the next reader
  doesn't have to re-derive it; a separate card is the right container if it recurs.

## Data

Raw deduped run list (299 records) and the analysis script are session-scratch, not committed —
this document carries the counts and the one anomaly's job-level detail verbatim, which is what a
future reader needs.
