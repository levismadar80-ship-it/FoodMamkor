# MEH-1517 — the restore drill as a scheduled CI job: the script is committed, the workflow is this paste

> **`.github/workflows/**` is CC-deny (MEH-671). This file is the paste-ready workflow for Sapir. Nothing here has been applied.**
>
> The logic is **already committed as a normal script** —
> [`scripts/ci/backup-restore-verify.sh`](../../scripts/ci/backup-restore-verify.sh) —
> with a `--self-test` that was **seen going red** on a table dropped from the restored copy and on rows
> lost from one, before it was seen green (output in §1). The YAML below only calls it. Same split as
> [`meh-2196-qa-three-state.patch.md`](./meh-2196-qa-three-state.patch.md): the part that can be proven
> lands where CC can land it; the RED edit shrinks to one new file that runs two commands.

## 0 · Scope — what this is, and what a green here does NOT say

The card and this lane do not ask for the same thing, and the card itself explains why the difference
matters. Stated up front so nobody reads a green `mechanics` run as the card's DoD:

| | the card (MEH-1517, incl. Sapir's 14/08 ruling) | this lane (drain, 03/09) |
|---|---|---|
| **source** of the dump | the **real** staging database, via the read-only secret `STAGING_DATABASE_URL_READONLY` (approved 14/08, GRANT spec on the card) | a **seeded service-container** database — `alembic upgrade head` + the two seeds the `seed-coverage` job already runs |
| what a green proves | the real backup is restorable | the **drill mechanics** work on this schema and the comparison **would catch** a loss |
| Railway / production / real backups | in scope once the secret exists | **out of scope** |

The card's own Phase 0 calls the synthetic-only version *"green forever while the real backup is broken"*
and declined to write it. **That objection is correct and this doc does not argue with it.** Two things
changed since it was written: Sapir approved the secret (14/08), and the drain lane asked for the CI
mechanics explicitly. So the split here is:

- `mechanics` (§2) — the apply set. Runs weekly with **no** secret. Proves the tooling, the schema and the
  assertions, and runs the script's self-test on the runner first as a control.
- `staging-drill` (§4) — the card's actual drill, written against the same script, **deliberately not in the
  apply set** until `STAGING_DATABASE_URL_READONLY` exists. It fails loudly when the secret is missing
  rather than skipping — a job that skip-greens on a missing secret is the MEH-1582 shape and would have
  reported the card as delivered while verifying nothing.

**Measured 03/09:** the secret does not exist yet — the workflow secret list is the one the card's Phase 0
§3 enumerated (Railway tokens, smoke creds, demo passwords, Vercel bypass, smokeshow, Claude OAuth), and no
`STAGING_DATABASE_URL*` has been added to any workflow since (`git grep STAGING_DATABASE_URL origin/staging`
→ 0 hits outside docs).

## 1 · The script — what it asserts, and the self-test that proves it discriminates

`scripts/ci/backup-restore-verify.sh --source URL --target URL [--expect-table-count auto] [--expect-nonempty a,b]`

1. `pg_dump -Fc` the source (**read only** — `docs/BACKUPS.md:48`, verbatim flags).
2. `pg_restore --no-owner --no-acl` into the target (`docs/BACKUPS.md:74`), which **must be empty** — a
   populated target is refused (exit 2), because pre-existing rows would make the counts look right.
3. For **every table the models define** — derived at run time from `backend/app/models/models.py`
   (`__tablename__` **and** the module-level `Table("…")` form; see §5) — assert it exists in the copy and
   its `COUNT(*)` equals the source's. A restore that silently emptied `favorites` passes both BACKUPS.md
   checks; this one catches it.
4. `--expect-table-count auto` — BACKUPS.md אימות א': the copy's base-table count equals `EXPECTED_TABLES`
   read **live** out of the CI gate workflow (`pr-checks.yml:360`, `42` today). Never typed: the value moved
   38 → 40 → 42 in five weeks (card Phase 0 §2), and `docs/BACKUPS.md` was stale against it **twice**.
5. `--expect-nonempty producers,users,producer_reviews` — BACKUPS.md אימות ב'.

Exit 0 only when every assertion held; exit 1 on any failed assertion; exit 2 on preflight (missing tool,
zero tables derived, non-empty target).

### `--self-test` — run 03/09 against the local Postgres, throwaway databases `meh1517_selftest_*` only

```
backup-restore-verify --self-test
  admin: postgresql://postgres:postgres@localhost:5432/postgres   throwaway databases: meh1517_selftest_src, meh1517_selftest_tgt
  ok   real models.py: >=30 tables derived, incl. producers/users and the Table() form (derived=42 live EXPECTED_TABLES=42) (exit 0)
  ok   real anchor: derived table count (42) == live EXPECTED_TABLES (42) (exit 0)
  ok   faithful restore is GREEN (exit 0)
  ok   restore into a NON-EMPTY target is refused (exit 2)
  ok   a table DROPPED from the copy is RED and named (exit 1)
  ok   ...and the failure says MISSING, not 'row count differs' (exit 0)
  ok   rows LOST from an existing table is RED (row count differs) (exit 1)
  ok   control: copy made faithful again is GREEN (exit 0)
  ok   wrong --expect-table-count is RED (exit 1)
  ok   --expect-nonempty on an EMPTY table is RED (exit 1)
  ok   a models file deriving ZERO tables is a preflight error, not a pass (exit 2)
  11/11 self-test cases behaved correctly
```

Two of the eleven are **anchored to real repo files**, not fixtures (MEH-1909): the derivation must find
≥ 30 tables in the real `models.py` including the `Table()` form, and the derived count must **equal the
live `EXPECTED_TABLES`**. If a table is ever added to one source of truth and not the other, this goes red
before any drill runs on the stale list.

**Two defects the self-test caught in its own script before anything was committed**, recorded because they
are the class `.claude/rules/testing.md` is about: (1) a `tr -d '"[:space:]'` that also deleted newlines,
collapsing all 42 names into one — the drill then compared **one** table and reported *"every row count
matches"*; (2) a `printf '%s'` feeding `read` without a trailing newline, which silently **dropped the last
`--expect-nonempty` table** (`producer_reviews` was never checked, and a single-table list checked nothing).
Both were exit-0 greens with a false claim in them. Neither would have been visible from a green run.

## 2 · The paste — NEW file `.github/workflows/backup-restore-verify.yml`

Shape mirrors the `seed-coverage` job in `pr-checks.yml:448-505` (same service block, same `uv sync
--frozen`, same two seed commands in the same order). `psql` / `pg_dump` / `pg_restore` / `createdb` are on
`ubuntu-latest` already — `pr-checks.yml:362` uses `psql` with no install step. The trigger key is quoted
for the reason `staging-smoke.yml:41-43` records (bare `on:` is YAML-1.1 `true`).

```yaml
name: Backup restore drill

# MEH-1517 — docs/BACKUPS.md §3 (dump → restore into an EMPTY database → verify) as a
# weekly CI job, replacing the manual monthly drill of MEH-1442 chunk 2 that was never run.
#
# WHAT A GREEN HERE MEANS — read before trusting one:
#   `mechanics` restores a SEEDED, CI-LOCAL database. A green proves the drill tooling and
#   the assertions work on this schema and would catch a lossy restore. It does NOT prove
#   the real staging/production backup is restorable — that is the `staging-drill` job in
#   docs/ci/meh-1517-backup-restore-verify.patch.md §4, which needs the read-only secret
#   STAGING_DATABASE_URL_READONLY (approved on MEH-1517, 14/08) and is added when it exists.
#
# The logic lives in scripts/ci/backup-restore-verify.sh; this file only calls it. The
# script's --self-test runs FIRST as a control: the drill must be seen going red on the
# runner before its green means anything (.claude/rules/testing.md).

"on":
  schedule:
    # Weekly Mon 04:00 UTC = 07:00 Asia/Jerusalem — one hour after dependency-audit.
    - cron: '0 4 * * 1'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}
  cancel-in-progress: false

jobs:
  mechanics:
    name: Restore drill — mechanics (seeded CI source)
    runs-on: ubuntu-latest
    timeout-minutes: 20

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: mehamakor_drill_source
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      SOURCE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_drill_source
      TARGET_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_drill_target
      ADMIN_URL: postgresql://postgres:postgres@localhost:5432/postgres
      PGPASSWORD: postgres
      SECRET_KEY: ci-test-secret-not-for-production

    steps:
      - uses: actions/checkout@v7

      - name: Set up uv
        uses: astral-sh/setup-uv@v7
        with:
          version: "latest"
          enable-cache: true
          cache-dependency-glob: "backend/uv.lock"

      - name: Install dependencies
        run: uv sync --frozen
        working-directory: backend

      # CONTROL FIRST. Creates and drops its own meh1517_* databases on the service
      # container. If the script cannot be made to go red here, nothing below is evidence.
      - name: Self-test the drill script (must show the red cases)
        run: bash scripts/ci/backup-restore-verify.sh --self-test --admin-url "$ADMIN_URL"

      - name: Schema to head (source)
        run: .venv/bin/alembic upgrade head
        working-directory: backend
        env:
          DATABASE_URL: ${{ env.SOURCE_URL }}

      # Same two seeds, same order, as the seed-coverage job (pr-checks.yml:497-501).
      # DEMO_* passwords deliberately absent: the seed falls back to a random, unrecorded
      # password, which is right for a throwaway database.
      - name: Seed base + demo (source)
        working-directory: backend
        env:
          DATABASE_URL: ${{ env.SOURCE_URL }}
        run: |
          .venv/bin/python seed_data.py
          .venv/bin/python -m scripts.seed_demo_business --refresh

      - name: Create the EMPTY restore target
        run: createdb -h localhost -U postgres mehamakor_drill_target

      # docs/BACKUPS.md §3: pg_dump -Fc → pg_restore --no-owner --no-acl → verify.
      # --expect-table-count auto reads EXPECTED_TABLES out of pr-checks.yml at run time.
      # The dump is written to mktemp and deleted on exit; it is never uploaded.
      - name: Dump → restore → verify (docs/BACKUPS.md §3)
        run: |
          bash scripts/ci/backup-restore-verify.sh \
            --source "$SOURCE_URL" --target "$TARGET_URL" \
            --expect-table-count auto \
            --expect-nonempty producers,users,producer_reviews
```

`producer_reviews` (not `reviews`, which BACKUPS.md named and which does not exist — §5) is seeded: the
`seed-coverage` contract asserts it non-empty after the same two seeds
(`backend/scripts/check_seed_coverage.py:83`), so the non-empty check is satisfiable on this source and a
red there would be a real regression in the seed, not a drill artefact.

## 3 · Apply + verify — Sapir

1. Create `.github/workflows/backup-restore-verify.yml` with the block in §2. No ruleset change: this is a
   scheduled job, not a PR check, and it must never become a required context (it does not run on PRs).
2. `gh workflow run backup-restore-verify.yml` (or Actions → *Backup restore drill* → Run workflow) once.
   Expected: the self-test step prints the eleven `ok` lines from §1 **including the red cases**; the drill
   step ends `backup-restore-verify: OK — 42 model tables present, every row count matches.`
3. Failure surfaces the way `dependency-audit.yml` does — a red scheduled run and the GitHub failure email.
   Nothing else to wire.
4. The **discrimination proof for the wiring** is the self-test step itself running on the runner: it is the
   same script the drill step calls, made to fail by construction on the same Postgres. A green drill step
   next to a green self-test step is a green with one cause.

## 4 · The real drill — `staging-drill`, a drop-in for the day the secret exists (NOT in the apply set)

Add as a second job in the same file **only after** `STAGING_DATABASE_URL_READONLY` is created per the
card's GRANT spec (read-only role, staging only, verified by the card's positive **and** negative probe).
Until then do not add it: it is written to **fail**, not skip, when the secret is absent.

```yaml
  staging-drill:
    name: Restore drill — the real staging backup
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: mehamakor_drill_target
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      TARGET_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_drill_target
    steps:
      - uses: actions/checkout@v7

      # Fail loud, never skip-green: a drill that did not run must not read as a drill that passed.
      - name: Require the read-only source secret
        env:
          SRC: ${{ secrets.STAGING_DATABASE_URL_READONLY }}
        run: |
          if [ -z "$SRC" ]; then
            echo "::error::STAGING_DATABASE_URL_READONLY is not set — the real restore drill cannot run. Create it per MEH-1517's secret spec; a skipped drill is not a passed drill."
            exit 1
          fi

      # The secret reaches ONLY this step. The dump goes to mktemp and is deleted on exit — it
      # holds real emails/phones (docs/BACKUPS.md:54) and is never an artifact. The script only
      # ever READS the source (pg_dump + per-table COUNT(*)); the role cannot write anyway.
      - name: Dump staging (read-only) → restore → verify
        env:
          SOURCE_URL: ${{ secrets.STAGING_DATABASE_URL_READONLY }}
        run: |
          bash scripts/ci/backup-restore-verify.sh \
            --source "$SOURCE_URL" --target "$TARGET_URL" \
            --expect-table-count auto \
            --expect-nonempty producers,users,producer_reviews
```

**Known limit, stated:** the per-table comparison counts the source **again after** the dump, so a write to
staging between the two reads shows up as a one-row mismatch and a red. On staging that window is seconds
and writes are rare; if it ever fires on a table nobody would deliberately touch, re-run before
investigating. A drift tolerance was not added — a tolerance is a number someone has to defend.

## 5 · Findings while building this (measured, not inferred)

- **`docs/BACKUPS.md` was stale against the gate for the second time** — it said `40`, the gate says `42`
  (`pr-checks.yml:360`); the card's own Phase 0 predicted this. Corrected in this PR with an as-of date,
  and §3א added there pointing at the script and at this doc, with the manual steps kept as the fallback.
- **`docs/BACKUPS.md:98` named a table that does not exist.** `SELECT COUNT(*) FROM reviews` — there is no
  `reviews`; the model is `producer_reviews` (`models.py:1641`). The manual drill as written would have
  failed on a correct backup, for the wrong reason. Corrected.
- **`__tablename__` alone undercounts by one.** 41 `__tablename__` lines vs `EXPECTED_TABLES=42`: the 42nd
  is the association table `producer_recipe_products = Table("producer_recipe_products", …)`
  (`models.py:2073`). The script reads both forms, and the real-anchor self-test case would go red if a
  future association table used a third form.

## 6 · Wake condition

`scripts/wake-when.sh` should carry one row once applied:
`git ls-tree origin/staging .github/workflows/backup-restore-verify.yml` → **1 line** (parked value 0). Not
added in this PR — the row belongs with the next wake-when edit, so a docs+script PR does not also touch
that script.

_Source: MEH-1517 (card + 14/08 secret spec), `docs/BACKUPS.md` §3, `pr-checks.yml:448-505` re-read
03/09. Drain-Session: 01NTrU3k-drain-ke._
