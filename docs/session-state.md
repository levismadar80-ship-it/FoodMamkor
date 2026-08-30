# Session state — 2026-08-26, Batch 26/08 (MEH-2189 · MEH-1677)

**Both code PRs merged. Two items remain open, and both are Sapir's.**

## Landed

| PR | SHA | What | Squash verified? |
|---|---|---|---|
| #3115 | `1144a656` | MEH-2189 — 8 archetype×channel demo businesses + smoke spec | yes (1 parent, `<title> (#N)`) |
| #3116 | `77ab7c78` | MEH-1677 — alembic `b3f7a1c46e92`, two columns | yes (1 parent) |
| #3117 | `1388b965` | docs-only batch log | yes (1 parent) |

## OPEN — Sapir's, in priority order

### 1. Seed has never run on staging (blocks MEH-2189)
```
python -m scripts.seed_demo_producers --confirm      # Railway one-off
```
Until this runs, "8 live demo pages" is false. **MEH-2189 was reopened to Todo** —
it auto-closed off #3117's branch slug (`feature/meh-2189-batch-docs`), i.e. a
docs PR closed a code card. Reopen verified to have held.
Card flag note: the ticket says `--refresh`; the script has no such flag. Real
flags are `--reset` and `--confirm`.

### 2. alembic downgrade never exercised (MEH-1677)
`alembic downgrade base` / `upgrade head` sit in `permissions.deny` and were NOT
run. The deny is evadable by path prefix (`.venv/bin/alembic …`); that gap was
reported, never used (rule 32). Sapir approved with the gap disclosed.
- **UPGRADE path IS proven** against a real Postgres container: CI's pytest job
  runs `alembic upgrade head` + `Verify alembic schema (36 tables)` + `Alembic
  drift check`, all green.
- **ROLLBACK path is unproven.** Nothing has ever run `downgrade` on this revision.

### 3. The DoD `SELECT` was not run (MEH-1677)
`psql` is denied and the sandbox holds no staging DB credentials. Evidence
gathered instead, and it is INDIRECT:
```
before deploy: /api/producers/by-slug/lehem-vezman -> 86 keys, coverage_cta_enabled ABSENT
after  deploy: /api/producers/by-slug/lehem-vezman -> 87 keys, coverage_cta_enabled = true
POST .../whatsapp-click {"city":"נתניה"} -> 200 · no body -> 200 · {"city":"???"} -> 200
```
`lehem-vezman` predates the column and reads `true`, so `server_default`
backfilled existing rows. This proves the column exists and accepts writes; it
does NOT prove what is stored in it.

### 4. dnm-matcher-guard patch — unchanged, still Sapir's
`docs/ci/meh-1523-dnm-label-gate.patch.md`. `.github/workflows/**` is CC-deny.
The live gate still scans title/body TEXT, not the label — so the `do-not-merge`
label carries **no mechanical enforcement** today. Worth knowing: during this
batch the label held only because rule 30 was obeyed, not because anything
blocked. It was removed on Sapir's explicit instruction, with the authorization
recorded as a PR comment before the removal so the `unlabeled` event is attributed.

## Unexplained, reported rather than resolved

- **`/producers/by-slug/*` returned 200 to my probe and 500 to the E2E runner**,
  same route, same window. My earlier "Railway staging 500s on every by-slug"
  diagnosis rests on the runner's log; my own probe contradicts it. Cause unknown.
- **E2E red repo-wide on 26/08**, including on `staging` itself. 25 failures on
  #3116's head, all in register/login/admin/map specs, none touching that diff.
  `E2E gate` is not a required check, so it blocked nothing — but **no PR in this
  batch has a VRT signal**, and nobody should claim one.
- **`enable_pr_auto_merge`'s `commitBody` did not land.** GitHub concatenated the
  branch commits instead, so #3116's squash carries 10× `Refs` and zero `Closes`,
  and MEH-1677 did not auto-close. Do not rely on a closing keyword in an
  auto-merge commit.

## Guards
16 ran, 1 warned (`dnm-matcher-guard`) — the same pre-existing warn all session.
