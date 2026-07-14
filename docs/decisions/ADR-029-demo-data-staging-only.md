# ADR-029: Demo/seed data is staging-only — production carries only real, licensed, manually-approved businesses

**Status:** Accepted
**Date:** 2026-07-13
**Deciders:** Sapir Levi
**Source:** MEH-1199 · promotes MEH-1189 (one-off prod cleanup) into a recurring release gate · builds on MEH-1074 (`seed_demo_business.py` + its `_assert_not_production()` guard)

## Context

Demo/test entities have leaked into visible surfaces **twice**:
- UX audit 13/07/26 found seeded test rows live on staging ("בדיקת UX — מטבח הבית של קלוד", "תסס").
- HANDOFF 15/06 records the same pattern: a "twt" test producer heading both curated rails.

This is a recurring class, not a one-off. It matters more for Mehamakor than for an average
site because the product DNA-LOCK is **"licensed businesses only"** + **"manual approval for
every business"**. A visitor who sees a test entity concludes the manual approval is a story;
placeholders read as fakery and break trust (13/07/26 research, template 05).

The **forward** direction is already enforced in code:
`backend/scripts/seed_demo_business.py::_assert_not_production()` (`seed_demo_business.py:203-222`)
refuses to run against anything that is not localhost or Railway `staging`. What was missing:
(1) an ADR that generalizes the policy beyond that one script, and (2) a gate for the **reverse**
direction — verifying what already sits in prod.

## Decision

**Demo/seed data lives on staging only and never in production.** Concretely:

1. Production contains only real, licensed, manually-approved businesses (DNA-LOCK). No demo,
   seed, or QA entities in prod — ever.
2. Every seed/demo script MUST carry an environment guard modelled on
   `seed_demo_business.py::_assert_not_production()` — refuse to run unless the DB host is local
   or `RAILWAY_ENVIRONMENT == "staging"`. This is a requirement for any future seed script, not
   only the existing one.
3. The `staging → main` release checklist gains a **read-only prod-scan step**:
   `backend/scripts/check_no_demo_data.py`, run by Sapir against production
   (`railway run python backend/scripts/check_no_demo_data.py`). Exit 0 = clean; exit 1 = at
   least one demo/test entity found — a human reviews each flagged row and decides. **The script
   never deletes, updates, or writes anything** (hard invariant; it is SELECT-only).

The scan detects three signals:
- producers whose `admin_notes` contain `DEMO` (case-insensitive) — what `seed_demo_business.py`
  writes (`seed_demo_business.py:196-200`);
- users whose email ends in `@example.com` — the seed/test account convention
  (`seed_demo_business.py:168-195`, `tests/conftest.py` gotcha note);
- producers whose **name** matches a configurable test-marker list (default
  `בדיקה, test, demo, twt, תסס`) — substring, case-insensitive, **name only, never
  description** (see false-positive analysis below).

## False-positive analysis (honest — markers are NOT silently loosened)

The scan **flags for a human and never deletes**, so a false-positive costs a human a glance,
never data. That tolerance is what lets the marker list stay deliberately broad. Documented
honestly rather than dropped:

- **`תסס` is a genuine false-positive on a plausible real business.** `תסס` is the root of
  תסיסה (fermentation). A legitimate Israeli sourdough / ferment / brewery business — e.g.
  **"מאפיית תסס"** — will match this marker. This is verified, not hypothetical: the test
  `tests/test_check_no_demo_data.py::test_fermentation_marker_is_a_documented_false_positive`
  pins the behaviour, and a live run flags "מאפיית תסס" under `matched: תסס`. It is **kept**
  because (a) the same string is exactly what leaked to staging on 13/07 and (b) the script only
  flags — a human confirms whether a `תסס` hit is the ferment bakery (keep) or the test row
  (remove). Dropping the marker to avoid the false-positive would reopen the exact leak this gate
  exists to catch.
- **`test` / `demo`** are Latin substrings; Hebrew business names rarely contain them, but an
  English-in-name business could match. Same tolerance: flag, human decides.
- **`בדיקה`** (check/test/exam) could in principle appear in a real name (e.g. a testing lab),
  but no food business in that class is expected; low risk.
- **`twt`** — the specific historic test-producer marker; negligible real-name collision.

**Name-only, never description** is the primary false-positive bound: a real business whose
*description* happens to mention "בדיקה" or "test" is never flagged. This is enforced in code
(the scan reads `Producer.name`, not `Producer.description`) and pinned by
`test_description_is_never_matched`.

## Consequences

**Positive:**
- The staging-only policy has teeth for both directions: `_assert_not_production()` keeps demo
  data out on the way in; `check_no_demo_data.py` verifies prod stays clean on the way to a
  release. MEH-1189 becomes a repeatable check, not a one-off cleanup.
- The scan is read-only, so it is safe to run against production with `railway run` — zero risk
  of the tool itself mutating prod.

**Negative:**
- The scan is not wired into CI in this change (`.github/workflows/**` is CC-deny, MEH-671); it is
  a manual release-checklist step. A CI/CD gate is a follow-up for Sapir to apply (the YAML lives
  in the MEH-1199 PR body, not routed around the deny).
- Broad markers (esp. `תסס`) will occasionally flag a real business; mitigated by never deleting
  and by name-only matching.

**Mitigations:**
- The release checklist step (`docs/DEPLOYMENT.md` → "before promoting staging → main") makes the
  scan a standing gate, not a thing to remember.
- Any future seed script inherits the same guard requirement (decision item 2), so the policy does
  not depend on a single file.

## Alternatives considered

- **A deletion/cleanup tool** — rejected. Destructive tooling against prod is exactly what the
  MEH-408 deny-list forbids from a Claude session; a human decides on every flagged row. Scope
  guard: read-only only.
- **MIME-tight, zero-false-positive markers** (drop `תסס`, match whole words only) — rejected. The
  string that actually leaked was `תסס`; tightening to avoid the ferment-bakery collision would
  miss the real leak. Flag-not-delete makes the broad list safe.
- **Match on description as well as name** — rejected. Descriptions are long free text; matching
  them would multiply false-positives with no gain, since demo rows are identifiable by name +
  `admin_notes` + `@example.com` already.

## References
- `backend/scripts/seed_demo_business.py:203-222` — `_assert_not_production()` (the forward guard).
- `backend/scripts/check_no_demo_data.py` — the read-only reverse scan (this ADR).
- `tests/test_check_no_demo_data.py` — 8 cases incl. the documented `תסס` false-positive.
- `docs/DEPLOYMENT.md` → "Sanity checks before promoting `staging → main`" — where the scan step lives.
- MEH-1189 (the one-off cleanup this gate makes repeatable), MEH-1074 (seed script origin),
  MEH-408 (production deny-list — why the tool is read-only), MEH-671 (`.github/workflows/**` CC-deny).
