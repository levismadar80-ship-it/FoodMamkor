# MEH-1706 chunk C — wire `check_seed_coverage.py` into `pr-checks.yml` as a required leg

> **`.github/workflows/**` is CC-deny (MEH-671). This file is the paste-ready block for Sapir.**
> The script half of chunk C landed in PR #2931 (`backend/scripts/check_seed_coverage.py`,
> 36 surfaces + `EXEMPT_TABLES` with a reason per entry). The YAML below sat in that PR's body
> since 14/08 and was never applied — measured 02/09 (drain כא'):
> `git grep -c "check_seed_coverage\|seed-coverage" origin/staging -- .github/workflows/pr-checks.yml` → **0**.
> Until it is applied the contract is enforced by nothing: a feature that adds a table without a
> seed row still merges green.

## What the gate does and does not cover (from the card, §2.4)

It runs against the **CI-local** Postgres service, seeded from scratch. It catches **code drift**
— a surface added to the models without a seed row, or a table nobody classified. It does **not**
and cannot protect staging: a wiped staging stays green here. Staging is protected operationally
(MEH-1707 `--reset` exemption + `seed_demo_business.py --refresh`), and as of 02/09 that refresh
has **not** been run against staging — `GET /api/group-buys` → 0, `GET /api/experiences` → 0, and
10 of the 11 chunk-B fields on `ruach-hasadeh` are empty. That is a separate Sapir action, not this
patch.

## The paste — two edits

### 1 · New job, beside `pytest` (it needs the same Postgres service)

The shape mirrors the `pytest` job in this file: same `services:` block, same `uv sync --frozen`,
same `DATABASE_URL`. `needs: changes` and `needs.changes.outputs.backend` are this file's names
(PR #2931's draft said `filter`, which is `e2e.yml`'s name — corrected here).

```yaml
  seed-coverage:
    name: Seed coverage contract (MEH-1706)
    needs: changes
    if: ${{ (needs.changes.outputs.backend == 'true' || needs.changes.outputs.workflows == 'true') && github.event.pull_request.draft == false }}
    runs-on: ubuntu-latest
    timeout-minutes: 10

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: mehamakor_seed
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_seed
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

      - name: Schema to head
        run: .venv/bin/alembic upgrade head
        working-directory: backend

      # seed_data.py first (categories + sample producers + admin), then the
      # demo business — the same order scripts/local-backend.sh uses. The
      # DEMO_* passwords are deliberately absent: the seed falls back to a
      # random unrecorded password (seed_demo_business.py:889-967), which is
      # exactly right for a throwaway CI database.
      - name: Seed base + demo
        working-directory: backend
        run: |
          .venv/bin/python seed_data.py
          .venv/bin/python -m scripts.seed_demo_business --refresh

      - name: Seed coverage contract
        working-directory: backend
        run: .venv/bin/python scripts/check_seed_coverage.py
```

### 2 · `ci-gate` — add the leg AND read it

Adding to `needs:` without a matching `check_ran` line is the MEH-1582 skip-green: a `skipped`
leg passes the aggregator. Both halves, or neither.

```yaml
  ci-gate:
    needs:
      # … existing entries …
      - seed-coverage            # ← add
    steps:
      - name: Aggregate required-check results
        env:
          # … existing R_* entries …
          R_SEED_COVERAGE: ${{ needs.seed-coverage.result }}   # ← add
        run: |
          # inside the existing backend branch, next to pytest/ruff:
          if [ "$BACKEND_TOUCHED" = "true" ] || [ "$WORKFLOWS_TOUCHED" = "true" ]; then
            echo "Backend stack touched (or workflows changed) — enforcing backend checks:"
            check_ran "Backend tests (pytest)" "$R_PYTEST"
            check_ran "Backend lint (ruff)" "$R_LINT_BACKEND"
            check_ran "Seed coverage contract (MEH-1706)" "$R_SEED_COVERAGE"   # ← add
            check "Backend mypy (strict, warn-only)" "$R_BACKEND_MYPY"
          fi
```

`check_ran`, not `check`: the job's own `if:` matches the backend branch exactly, so inside that
branch a `skipped` result can only mean a draft suppressed it — an absence of measurement, which
MEH-1582 says must not read as a pass.

## How to prove it after applying — discrimination, not a green

The script was shown failing in PR #2931 by construction (emptied `group_buy_commits` → exit 1,
36/36 → 34/36; removed one `EXEMPT_TABLES` entry → `UNCLASSIFIED`). The **wiring** is a
separate claim and needs its own two-run proof: open a throwaway PR that deletes one
`SEEDED_SURFACES` entry's seed line, confirm `CI gate (required)` goes **red** naming
`Seed coverage contract (MEH-1706)`, then close it. A green on an ordinary PR proves only that
the job ran.

## Wake condition

`scripts/wake-when.sh` should carry a row for this once applied:
`git grep -c 'check_seed_coverage' origin/staging -- .github/workflows/pr-checks.yml` → **≥1**
(parked value 0). Not added in this PR — the row belongs with the next wake-when edit, so a
docs-only PR does not touch a script.

_Source: PR #2931 body (14/08), re-cut against the live `pr-checks.yml` 02/09. Drain-Session: 01UJNNqp-drain-ka._
