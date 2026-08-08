# Session state — overnight autonomous sweep v2, NIGHT 2 (2026-08-08)

> **0 merged, 2 PRs awaiting you, 1 blocked, 1 new ticket, 0 quarantined, staging GREEN.**
> **The night's yield is a live user-facing bug nobody had a ticket for, and two of the
> instructions I was given turned out to be wrong — one of which I was told to "fix".**

---

## ⚠️ Read this first — two tasks I did NOT do, on purpose

### 1 · The MapPane RTL fix (night-2 instruction §8) — **there is nothing to fix**

I was told: *"KNOWN GENUINE check.sh FAILURE: an existing RTL violation in MapPane.jsx fails
the DoD script for real. Night task: open a quick issue + fix the property to start-/end-."*

Measured instead:

```
$ bash .claude/scripts/rtl-scan.sh
0
exit 0
```

**Zero violations.** Step 4/7 of `check.sh` delegates to that script and prints `pass` on `0`.
`MapPane.jsx` **is** allowlisted (`.claude/hooks/rtl-allowlist.txt:9`) and `check.sh:85-88`
records why the claim went stale: *"**MEH-1515:** `rtl-scan.sh` now honors the PATH EXCEPTIONS
correctly (its filter uses `grep -vFf`, so `[locale]` paths match literally)"*. MEH-1511 §7
was written 23/07 — before that fix.

**And "fixing it anyway" would have been a regression, not diligence.** The physical props in
that file are deliberate and say so in the code:

- `:149-150` — *"Physical `right-4` — **NOT** logical `end-`/`start-` — because the legend is
  anchored with physical `left-4`; a logical prop would flip per…"*
- `:176-177` — *"`rtl-ok`: the whole legend is physically anchored `left-4`"*

Swapping to `start-`/`end-` **separates the GPS button from the legend** — exactly what the
comment warns about. I would have shipped a clean, review-passing diff that breaks a
deliberate layout, and no check in the repo would have caught it. (`left-1/2 -translate-x-1/2`
at `:129`/`:138` isn't a violation at all — it's a centring idiom.)

Evidence posted to MEH-1511. Recommended replacement for its §7 blocker line is in there.

### 2 · MEH-1511 itself (B2) — **blocked by a permission classifier**

I wrote the full rule-23 amendment per your 08/08 ruling — the device-gate/merge-gate split,
the evidence checklist, carve-out (e) intact — then the write to `.claude/rules/workflow.md`
returned:

```
Permission for this action was denied by the Claude Code auto mode classifier.
```

The ticket's own stop condition (d) says *"if a permission classifier blocks the write, STOP
and surface it — **do not route the same change through a different tool**"*. So I did not
reach for python/sed. `workflow.md` is untouched.

**This is not a repo deny, and that changes the fix.** `.claude/settings.json`'s
`permissions.deny` has 105 entries; the only `.claude/` ones are `settings.json` and
`hooks/**`. **`.claude/rules/**` is not listed at all.** The repo permits this edit — the
*harness auto-mode classifier* blocked it. Three ways to unblock, all yours: run it from
standalone CC, approve it interactively, or add an auto-mode exception for `.claude/rules/**`
(which I'd think about carefully — rule 32, the only-add-constraints rule, lives in that
directory).

---

## 3 · MERGED: nothing

Per night-2 rule 2 (reviewer-down compensation), the auto-merge lane is LOW-RISK /
tests-only / docs. Everything I completed tonight is either a docs PR awaiting the ruleset
question below, or a Phase 0 report. **Nothing qualified for an unattended merge, so nothing
was merged.**

The CI adversarial reviewer is still producing nothing — confirmed on **both** of last
night's PRs (#2676, #2677): job `failure`, ~32s, zero comments. Reported on MEH-1844. So
rule 5a step 6 remains unsatisfiable and everything below rests on self-review.

## 4 · PRs AWAITING YOU — with what to check, in order

| # | PR | what to check | time |
|---|---|---|---|
| 1 | **[#2680](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2680)** — nested-stripping audit | §2 of the doc: the 7-link chain proving `delivery_areas[].delivery_fee` is stripped. If you accept it, the decision you owe is §5 — option (א)/(ב)/(ג). | ~5 min |
| 2 | **[#2678](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2678)** — session log (nights 1+2) | Nothing to review — it's the log. **The question is why it won't merge**; see §6. | ~1 min |
| 3 | [#2665](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2665) — diet landing pages | Unchanged from last night: copy approval (rule 22) is now the **only** gate — your 08/08 ruling waived the device check. | ~10 min |

## 5 · 🔴 NEW TICKET — a live wrong price on the business page

**MEH-1942** (High, Bug). Found while doing MEH-1896's Phase 0; no existing ticket covered it
(searched `delivery_fee`, and delivery/schema/stripping terms — MEH-1678 is about *displaying*
a fee, MEH-903 is a different column).

`delivery_areas[].delivery_fee` is stripped by the nested Zod shape, so
`DeliveryBlock.jsx:429`'s `da.delivery_fee ?? producerFee` fallback fires **for every area,
always** — each city shows the business-level fee instead of its own.

**The part that makes it serious:** `DeliveryBlock.jsx:320` documents that **`0` is a value,
not an absence** — i.e. free delivery for that city. A stripped key is `undefined`, not `0`, so
the `??` falls through and **a free-delivery city displays a charge.** It renders a plausible
wrong number, never an error.

Both guards were green on it: `.loose()` is top-level only, and the MEH-1891 parity guard is
`Object.keys(zod.shape)` — one level, no array unwrapping (`backend-contract-parity.test.js:192`).

## 6 · The #2678 merge block — new evidence, and it is not "docs-only"

Last night I parked this after the ruleset answered *"2 of 2 required status checks are
expected"* while both gates reported `success`. I attributed it to the docs-only skip path.

**That attribution now looks wrong.** `#2679` — `feature/meh-1939-docs-backfill`, a docs-only
PR — **merged cleanly** on 08/08 and is in `origin/staging` (`b50e4c82`). So docs-only PRs can
merge, and whatever blocks #2678 is specific to it, not to its diff class.

I have **not** diagnosed it and did not retry past the sanctioned one-wait-one-retry. No no-op
commit (rule 30). Recording the correction because a wrong cause in a log becomes a wrong fix
later.

## 7 · STATUS-SYNCED — with evidence

| issue | verified | action taken |
|---|---|---|
| **MEH-1911** | `#2633` merged 07/08 10:41Z by you; `tests/conftest.py:41` carries `PYTEST_XDIST_WORKER` on staging | **NOT synced to Done — see §8.** The proof does not reproduce. |
| **MEH-1764** | `8d364ab2` (#2430) + `55de2263` (#2631) both on staging; `docs/ci/vrt-label-trigger.patch.md` = 19,131 bytes; cited at `.claude/rules/testing.md:149` | **NOT synced.** CC side is 4/7 of DoD; items 5–7 (apply YAML, create the `vrt-regen` label, live + negative verification) are yours and **causally blocked** on the apply. Could not comment — **the card is archived and Linear rejects comments on it.** I did not unarchive it. |
| **MEH-1249** | rider (1) **done** — `#2621` merged 05/08, `scripts/local-backend.sh` present on staging | **Not started, correctly.** Rider (3) in your 05/08 ruling forbids the 1,074-item run before MEH-1909, which is still open. Description gate beats the seed's ordering. |

## 8 · ⚠️ MEH-1911's stability proof does NOT reproduce — do not mark it Done

Ran the ×5 proof against the merged conftest on current staging. **The counts are not
identical, and the ticket's acceptance criterion demands that they are** (*"identical collected
count — assert equality with a serial collection"*).

| run | mode | passed | skipped | xfailed | wall |
|---|---|---|---|---|---|
| 1 | `-n auto` | **2376** | 371 | 1 | 249s |
| 2 | `-n auto` | **2384** | 371 | 1 | 222s |
| 3 | `-n auto` | **2384** | 371 | 1 | 218s |
| 4 | `-n 2` | *in flight at report time* | | | |
| 5 | `-n 4` | *in flight at report time* | | | |

**Run 1 is 8 tests short of runs 2 and 3**, with identical skip counts, on the same commit.
**I have not established the cause and am not guessing one.** Candidates I did not
discriminate between: first-run database state, an order-dependent set of 8, or something
`-n auto` resolves differently under load. All green — no failures — which is what makes it
the dangerous shape rather than an obvious one.

What this does *not* mean: the isolation works (a shared-DB `-n 4` run errored on ~82% of
`test_api.py` before it landed). The parallel win is real — **~3.5–4 min against a ~12 min
serial baseline.** What is unproven is *stability*, which is the one thing the ticket asked
for.

> **Environmental note worth keeping:** the suite does not run from this sandbox without
> `PYTHONPATH=<repo root>` — `tests/` has no `__init__.py` and there is no
> `[tool.pytest.ini_options]`, so `from tests.conftest import …` raises `ModuleNotFoundError`.
> Cost me two failed attempts; the first "green" was `no tests ran` with `EXIT=0`.

## 9 · SKIPPED, with the reason

- **Gated by their own description:** MEH-1249 (rider 3 → MEH-1909), MEH-1938 (per-chunk go),
  MEH-1925 (your Console), MEH-1935 (rule-22 copy approval)
- **RED / decision-first markers:** MEH-1907, MEH-1736, MEH-1868 (workflow half)
- **`not-cc` / `needs-sapir` / `blocked-needs-sapir`:** MEH-1244, MEH-1590, MEH-999, MEH-1283,
  MEH-1585, MEH-1754, MEH-1876
- **Not reached** (budget went to the audit + the proof): B3 MEH-1855, B4 MEH-1854,
  B5 MEH-1862, B6 MEH-1921, B7 MEH-1414, B8 MEH-1516, C1/C2/C4, D1 MEH-1501, E1 MEH-1934

## 10 · Pipeline health

- **staging GREEN** at `b50e4c82`. Nothing merged by me tonight, so nothing of mine to revert.
- **E2E** still red for the documented Cloudinary reason (MEH-1925) — unchanged, blocks nothing
  in the docs/tests lanes.
- **Sentry / Vercel:** **not checked, and I can't from here** — no Sentry or Vercel MCP tools
  exist in a harness session (CLAUDE.md says so). Their absence here is *not* evidence they're
  down and *not* a verification. Relevant because MEH-1511's amendment is void if either is
  disconnected.
- **Cloudinary MCP needs re-authorisation** in this session. Untouched; surfaced at startup.

---

## Next concrete step

Decide §5's option (א)/(ב)/(ג) on MEH-1896 — that unblocks both the MEH-1942 fix and the
guard extension. Then either unblock MEH-1511 (§2) or reassign it, since CC cannot execute it
under auto-mode.
