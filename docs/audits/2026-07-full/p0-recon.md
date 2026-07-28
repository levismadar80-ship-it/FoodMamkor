# Audit P0/8 — Recon: inventory + metrics baseline

> **Facts only.** No judgment, no findings, no recommendations — those are P1–P8's job
> ([MEH-1721](https://linear.app/mehamakor/issue/MEH-1721) epic). Every number in this
> document carries its command and raw output in [§11 Appendix](#11--appendix--commands--raw-output).
> A metric that could not be measured is written `not measured: <reason>` and is never estimated.

---

## 1 · Snapshot

| | |
|---|---|
| **Baseline SHA** | `114e4c847617495a71058e180007797dfc83533f` |
| **Short SHA** | `114e4c84` |
| **Ref** | `origin/staging` |
| **Commit date** | `2026-07-28T15:38:11+03:00` |
| **Commit subject** | `Merge pull request #2360 from levismadar80-ship-it/feature/meh-1698-baseline-currency` |
| **Recon run date** | 2026-07-28 |
| **Audit pass** | P0/8 — recon (read-only) |

**This SHA is the shared snapshot for every report in the MEH-1721 epic.** P1–P8 must
check out exactly this commit so their findings are comparable to this baseline:

```bash
git fetch origin
git checkout 114e4c847617495a71058e180007797dfc83533f
```

> **Provenance note.** The harness clone was shallow. `git fetch --unshallow origin` was
> run before any history-derived number in this report (§8 churn, §10 repo stats), per
> `.claude/rules/workflow.md` → "Provenance verification". Verified:
> `git rev-parse --is-shallow-repository` → `false`, 2,589 commits reachable.

---

## 2 · Repository structure — depth 2

Tracked files only (`git ls-files`), counted at path depth 2. Total tracked files: **3,647**.

### 2.1 Top-level directories

| Directory | Tracked files | `wc -l` total | Note |
|---|---:|---:|---|
| `frontend/` | 951 | 186,869 | includes tests, e2e, and a nested `qa-artifacts/` |
| `qa-artifacts/` | 884 | 227,273 | mostly binary (`.png`/`.webp`); line counts not meaningful |
| `design-reference/` | 571 | 185,390 | vendored design-system bundles + logo assets |
| `docs/` | 387 | 450,010 | |
| `.agents/` | 244 | 47,997 | third-party skills (canonical content, MEH-397) |
| `tests/` | 195 | 87,057 | backend pytest suite |
| `.claude/` | 161 | 10,206 | rules, hooks, commands, skill symlinks |
| `backend/` | 156 | 45,539 | |
| `.design-sync/` | 30 | 1,436 | |
| `scripts/` | 21 | 4,197 | |
| `.github/` | 15 | 2,710 | |
| `logo/` | 5 | 1,723 | |
| `.ai/` | 4 | 802 | |
| *(root files)* | 23 | 9,444 | |

> `wc -l` counts every tracked file including binaries, so the `qa-artifacts/` and
> `design-reference/` totals are not code LOC. §3 separates code from assets.

### 2.2 Depth-2 breakdown (subdirectories with ≥ 9 files)

| Path | Files |
|---|---:|
| `design-reference/ds-components/` | 452 |
| `frontend/__tests__/` | 249 |
| `.agents/skills/` | 243 |
| `frontend/qa-artifacts/` | 203 |
| `docs/audits/` | 180 |
| `tests/` *(files directly under)* | 166 |
| `frontend/app/` | 150 |
| `frontend/components/` | 108 |
| `backend/app/` | 92 |
| `frontend/e2e/` | 90 |
| `design-reference/s2-logo/` | 82 |
| `frontend/lib/` | 81 |
| `.claude/skills/` | 76 |
| `qa-artifacts/MEH-1074-wave3/` | 61 |
| `docs/` *(files directly under)* | 51 |
| `backend/alembic/` | 51 |
| `docs/decisions/` | 33 |
| `frontend/` *(files directly under)* | 31 |
| `tests/screenshots/` | 29 |
| `frontend/public/` | 27 |
| `qa-artifacts/QA-20260717/` | 26 |
| `qa-artifacts/MEH-1334/` | 26 |
| `.claude/scripts/` | 26 |
| `docs/design-audit/` | 25 |
| `.design-sync/previews/` | 25 |
| `qa-artifacts/MEH-1663/` | 22 |
| `qa-artifacts/MEH-1649/` | 20 |
| `docs/research/` | 20 |
| `docs/archive/` | 18 |
| `qa-artifacts/MEH-1539-mobile/` | 17 |
| `qa-artifacts/MEH-1655/` | 16 |
| `qa-artifacts/MEH-1632/` | 16 |
| `qa-artifacts/MEH-1074-wave4/` | 16 |
| `docs/upgrade-baselines/` | 15 |
| `.claude/rules/` | 15 |
| `scripts/` | 14 |
| `qa-artifacts/MEH-1536/` | 14 |
| `.claude/hooks/` | 14 |
| `qa-artifacts/MEH-1146-a/` | 13 |
| `.claude/commands/` | 13 |
| `.github/workflows/` | 12 |
| `docs/templates/` | 11 |
| `docs/synthesis/` | 10 |
| `docs/ci/` | 10 |
| `.claude/agents/` | 9 |

*(Remaining `qa-artifacts/MEH-*` directories each hold < 13 files; full list in appendix A2.)*

---

## 3 · LOC

### 3.1 By file extension (all tracked text files)

| Extension | Files | LOC |
|---|---:|---:|
| `.md` | 560 | 107,125 |
| `.jsx` | 464 | 70,714 |
| `.py` | 337 | 73,685 |
| `.js` | 286 | 140,661 |
| `.html` | 149 | 49,915 |
| `.ts` | 131 | 6,350 |
| `.json` | 115 | 98,453 |
| `.mjs` | 41 | 6,560 |
| `.txt` | 32 | 17,268 |
| `.tsx` | 28 | 875 |
| `.sh` | 27 | 4,035 |
| `.css` | 14 | 8,643 |
| `.yml` | 14 | 2,430 |
| `.sql` | 2 | 147 |
| `.toml` | 2 | 174 |
| `.yaml` | 1 | 37 |
| `.cjs` | 1 | 11 |

Binary/asset counts (not LOC): `.webp` 850 · `.png` 436 · `.svg` 23 · `.ico` 2 · `.xlsx` 2.

> The `.js` total (140,661) is dominated by vendored bundles under `design-reference/`
> — see §7 (`_ds_bundle.js` 59,979 + `_vendor/react.js` 33,269 + `s2-logo/_ds/_ds_bundle.js`
> 12,575 = 105,823 LOC across 3 files).

### 3.2 Application code vs test code

| Scope | Files | LOC |
|---|---:|---:|
| Frontend app code (`frontend/**` `.js/.jsx/.ts/.tsx/.mjs`, excl. `__tests__/`, `e2e/`, `qa-artifacts/`) | 362 | 61,574 |
| Backend app code (`backend/app/**/*.py`) | 90 | 25,003 |
| Backend migrations (`backend/alembic/**/*.py`) | — | 3,725 |
| Backend tests (`tests/**/*.py`) | — | 34,724 |
| Frontend unit tests (`frontend/__tests__/**`) | — | 32,621 |
| Frontend e2e (`frontend/e2e/**`) | — | 5,137 |

### 3.3 Backend module breakdown

| Module | Files | LOC |
|---|---:|---:|
| `backend/app/routers/` | 35 | 11,794 |
| `backend/app/services/` | 29 | 5,494 |
| `backend/app/schemas/` | 3 | 3,444 |
| `backend/app/models/` | 2 | 1,738 |
| `backend/app/utils/` | 6 | 246 |

### 3.4 Frontend surface counts

| Surface | Count |
|---|---:|
| App-router pages (`page.js` / `page.jsx`) | 72 |
| Layouts (`layout.js` / `layout.jsx`) | 3 |
| Next.js API routes (`route.js`) | 0 |
| Components (`frontend/components/**`) | 107 |
| Lib modules (`frontend/lib/**`) | 79 |
| i18n keys — `messages/he.json` | 3,660 |
| i18n keys — `messages/en.json` | 3,643 |

---

## 4 · Python lint — `ruff check --statistics`

Ruff **0.15.8**. Config: `backend/pyproject.toml` (`[tool.ruff.lint]`) — the only ruff
config file in the repo (no root `pyproject.toml` / `ruff.toml` / `setup.cfg`).

### 4.1 Findings by scope

| Scope | Total | Breakdown |
|---|---:|---|
| `backend/` | **1** | `F401` unused-import × 1 |
| `tests/` | **26** | `F401` × 20 · `E402` module-import-not-at-top × 3 · `F841` unused-variable × 3 |
| `scripts/` | **7** | `E741` ambiguous-variable-name × 5 · `F541` f-string-missing-placeholders × 2 |
| **Whole repo** (`ruff check .`) | **49** | `F401` × 24 · `F541` × 11 · `F841` × 6 · `E741` × 5 · `E402` × 3 |

> The whole-repo total (49) exceeds `backend` + `tests` + `scripts` (34) because
> `ruff check .` also covers `.agents/`, `.claude/`, and `design-reference/` Python files.

> **CI scope differs from the above.** `pr-checks.yml:461` runs
> `uv run ruff check . --extend-exclude alembic/versions` from **inside `backend/`**, so
> the blocking gate only sees the `backend/` scope (1 finding), not `tests/` or `scripts/`.

### 4.2 Complexity rules configured in `backend/pyproject.toml`

`extend-select`: `PLR0913` (max-args 5), `PLR0915` (max-statements 50),
`PLR0912` (max-branches 12), `PLR0911` (max-returns 6), `C901` (max-complexity 10).

| Run | Findings |
|---|---:|
| With repo config (`per-file-ignores` active) | **0** |
| `--isolated` (same rules, ignores suppressed) | **9** — `C901` × 3 · `PLR0912` × 3 · `PLR0913` × 2 · `PLR0915` × 1 |

`per-file-ignores` in effect (`backend/pyproject.toml:106-112`):
`app/routers/producers.py` → `PLR0913, PLR0915, PLR0912, C901` (MEH-438) ·
`app/routers/auth.py` → same set (MEH-440) ·
`alembic/versions/**` → `PLR0915, PLR0912`.

---

## 5 · Python complexity — `radon cc -s -a`

Radon **6.0.1**, installed into a scratchpad venv outside the repo (no project deps
touched — see §9 scope note).

### 5.1 Averages

| Scope | Blocks analyzed | Average complexity |
|---|---:|---|
| `backend/app` | 800 | **A (3.379)** |
| `tests/` | 2,526 | A (3.111) |
| `backend/alembic` | 98 | A (1.041) |

### 5.2 Rank distribution — `backend/app`

| Rank | Blocks | Share |
|---|---:|---:|
| A | 663 | 82.9% |
| B | 100 | 12.5% |
| C | 31 | 3.9% |
| D | 4 | 0.5% |
| E | 2 | 0.25% |
| F | 0 | 0% |

### 5.3 Blocks rated D or E (`backend/app`)

| File | Line | Block | Rank (CC) |
|---|---:|---|---|
| `backend/app/routers/auth.py` | 404 | `register_producer` | **E (38)** |
| `backend/app/routers/producer_me.py` | 650 | `producer_analytics` | **E (31)** |
| `backend/app/services/producer_listing.py` | 264 | `_apply_scalar_filters` | D (27) |
| `backend/app/routers/admin_extra.py` | 608 | `get_dashboard` | D (27) |
| `backend/app/routers/auth.py` | 855 | `register_producer_oauth` | D (23) |
| `backend/app/routers/auth.py` | 1314 | `delete_account` | D (21) |

### 5.4 Blocks rated C (`backend/app`) — 31 total

| File | Line | Block | CC |
|---|---:|---|---:|
| `backend/app/routers/search.py` | 84 | `smart_search` | 15 |
| `backend/app/routers/admin.py` | 216 | `admin_update_producer` | 15 |
| `backend/app/routers/producer_recipes.py` | 231 | `update_my_recipe` | 15 |
| `backend/app/routers/alerts.py` | 266 | `fire_alerts` | 15 |
| `backend/app/services/producer_import.py` | 205 | `import_rows` | 15 |
| `backend/app/services/oauth_verifiers.py` | 158 | `verify_apple_token` | 14 |
| `backend/app/routers/google_rating.py` | 132 | `_search_place_candidates` | 14 |
| `backend/app/routers/admin_outreach.py` | 61 | `create_lead` | 13 |
| `backend/app/routers/admin.py` | 816 | `seed_cities` | 13 |
| `backend/app/routers/upload.py` | 66 | `upload_image` | 13 |
| `backend/app/routers/users_me.py` | 42 | `update_profile` | 13 |
| `backend/app/schemas/schemas.py` | 34 | `_order_window_validator` | 13 |
| `backend/app/schemas/schemas.py` | 1535 | `ProducerUpdate._validate_location_mode` | 13 |
| `backend/app/startup.py` | 39 | `_check_frontend_url_consistency` | 12 |
| `backend/app/services/producer_queries.py` | 118 | `attach_badge_fields` | 12 |
| `backend/app/routers/producers.py` | 484 | `get_kashrut_cert` | 12 |
| `backend/app/routers/cities.py` | 49 | `list_cities` | 12 |
| `backend/app/routers/admin.py` | 469 | `approve_producer` | 12 |
| `backend/app/routers/producer_me.py` | 170 | `_enforce_owner_license_gate` | 12 |
| `backend/app/routers/producer_me.py` | 238 | `update_my_producer` | 12 |
| `backend/app/routers/whatsapp_webhook.py` | 385 | `_maybe_process_optout` | 12 |
| `backend/app/startup.py` | 257 | `lifespan` | 11 |
| `backend/app/services/producer_risk.py` | 143 | `_extract_json_object` | 11 |
| `backend/app/services/producer_risk.py` | 177 | `_call_anthropic` | 11 |
| `backend/app/services/producer_import.py` | 145 | `parse_row` | 11 |
| `backend/app/routers/auth.py` | 149 | `refresh_token` | 11 |
| `backend/app/routers/auth.py` | 757 | `google_auth` | 11 |
| `backend/app/routers/producer_me.py` | 96 | `_sync_delivery_areas` | 11 |
| `backend/app/routers/events.py` | 65 | `list_events` | 11 |
| `backend/app/routers/whatsapp_webhook.py` | 447 | `_persist_message` | 11 |
| `backend/app/routers/home_products.py` | 270 | `update_home_product` | 11 |

31 rows = the full C set. Combined with §5.3 (4 D + 2 E) this is the complete
`radon cc -n C` output — 37 blocks, matching the rank distribution in §5.2.
Raw output in appendix A5.

---

## 6 · JS/JSX lint + coverage

### 6.1 ESLint — configured, `not measured`

**`not measured: running `eslint .` requires `frontend/node_modules`, which is absent at
this snapshot. Installing it is forbidden by the MEH-1722 scope (`אסור … להתקין deps
לתוך הפרויקט`).**

Configuration facts (read statically, no execution):

| Fact | Value |
|---|---|
| Config file | `frontend/eslint.config.mjs` (flat config, 262 lines) |
| Script | `"lint": "eslint ."` (`frontend/package.json`) |
| CI invocation | `.github/workflows/deploy.yml:146` → `npm run lint` |
| Explicit rule entries (`"rule": "error"\|"warn"\|"off"`) | 14 |
| Plugins referenced | `eslint-config-next`, `eslint-plugin-i18next`, `eslint-plugin-sonarjs`, `eslint-plugin-unicorn`, `eslint-plugin-security`, `eslint-plugin-react-hooks`, `eslint-plugin-playwright` |

### 6.2 Backend coverage — `not measured`

**`not measured: the pytest suite requires a live PostgreSQL. `tests/conftest.py:12-14`
sets `DATABASE_URL` to `TEST_DATABASE_URL` or
`postgresql://postgres:postgres@localhost:5432/mehamakor_test`; no PostgreSQL service is
available in this sandbox, and the backend runtime deps (`fastapi`, `sqlalchemy`,
`pydantic`, …) are not importable from any interpreter on PATH. Provisioning a database
or installing the backend dependency set is outside the read-only scope of this pass.`**

Configuration facts:

| Fact | Value |
|---|---|
| CI job | `Backend tests (pytest)` — `.github/workflows/pr-checks.yml:281` |
| Coverage command | `--cov=backend/app --cov-report=xml --cov-report=html --cov-report=term --cov-fail-under=70` (`pr-checks.yml:390-397`) |
| **Configured gate** | `--cov-fail-under=70` (MEH-489) |
| Coverage publishing | Smokeshow upload, `continue-on-error: true` (`pr-checks.yml:409-418`) |
| conftest files | 1 (`tests/conftest.py`) |

### 6.3 Frontend coverage — `not measured`

**`not measured: two independent blockers. (a) `vitest run --coverage` requires
`frontend/node_modules` (absent; install forbidden by scope). (b) `frontend/vitest.config.js`
declares no `coverage` block at all, and CI runs `npx vitest run` without `--coverage`
(`pr-checks.yml:625`) — so no coverage threshold or report is configured anywhere in the
repo, and there is no prior number to cite.`**

Configuration facts:

| Fact | Value |
|---|---|
| CI job | `Frontend unit tests (vitest)` — `.github/workflows/pr-checks.yml:605` |
| Command | `npx vitest run` (no `--coverage` flag) |
| Coverage config in `vitest.config.js` | none |
| `@vitest/coverage-v8` in devDependencies | yes, `^4.1.10` (installed but unconfigured) |

### 6.4 Test-suite inventory (static counts — measurable without execution)

| Suite | Test files | Test cases (static grep) |
|---|---:|---:|
| pytest (`tests/test_*.py`) | 162 | 1,889 (`def test_`) |
| vitest (`frontend/__tests__/**.test.*`) | 246 | 1,844 (`it(` / `test(`) |
| Playwright (`frontend/e2e/**.spec.*`) | 32 | 91 (`test(`) |

> These are static occurrence counts, not executed-test counts. Parametrized tests
> (`@pytest.mark.parametrize`, `test.each`) expand to more cases at runtime; the executed
> totals are `not measured` for the reasons in §6.2 / §6.3.

---

## 7 · Top 10 largest files

### 7.1 All tracked code files (`.py .js .jsx .ts .tsx .mjs .css`)

| # | File | LOC |
|---:|---|---:|
| 1 | `design-reference/ds-components/_ds_bundle.js` | 59,979 |
| 2 | `design-reference/ds-components/_vendor/react.js` | 33,269 |
| 3 | `design-reference/s2-logo/_ds/mehamakor-design-system-0e28208b-…/_ds_bundle.js` | 12,575 |
| 4 | `design-reference/ds-components/_ds_bundle.css` | 6,398 |
| 5 | `tests/test_api.py` | 4,603 |
| 6 | `backend/app/schemas/schemas.py` | 3,405 |
| 7 | `frontend/app/[locale]/producer/dashboard/edit/cards.jsx` | 1,957 |
| 8 | `backend/app/models/models.py` | 1,665 |
| 9 | `design-reference/s2-logo/support.js` | 1,512 |
| 10 | `tests/test_cleanup_cloudinary_orphans.py` | 1,478 |

### 7.2 Excluding vendored assets (`design-reference/`, `qa-artifacts/`)

| # | File | LOC |
|---:|---|---:|
| 1 | `tests/test_api.py` | 4,603 |
| 2 | `backend/app/schemas/schemas.py` | 3,405 |
| 3 | `frontend/app/[locale]/producer/dashboard/edit/cards.jsx` | 1,957 |
| 4 | `backend/app/models/models.py` | 1,665 |
| 5 | `tests/test_cleanup_cloudinary_orphans.py` | 1,478 |
| 6 | `backend/app/routers/auth.py` | 1,471 |
| 7 | `backend/app/routers/producer_me.py` | 1,398 |
| 8 | `frontend/app/[locale]/producer/dashboard/edit/page.js` | 1,368 |
| 9 | `frontend/app/[locale]/register/producer/RegisterProducerClient.jsx` | 1,291 |
| 10 | `.agents/skills/ui-ux-pro-max/scripts/design_system.py` | 1,068 |

*(11–15: `frontend/components/admin/ProducerForm.jsx` 1,064 · `frontend/app/[locale]/producer/dashboard/page.js` 907 · `frontend/components/MapComponent.jsx` 891 · `backend/app/routers/admin.py` 861 · `frontend/components/ProducersClient.jsx` 859.)*

---

## 8 · Top 10 most-changed files (last 3 months)

Window: `--since=3.months` against `114e4c84`. Oldest commit in window:
`28bbc3f4` @ `2026-04-28T16:36:32+03:00`. Commits in window: **1,973**.
Metric = number of commits touching the file.

### 8.1 All files

| # | File | Commits |
|---:|---|---:|
| 1 | `docs/CHANGELOG.md` | 878 |
| 2 | `HANDOFF.md` | 766 |
| 3 | `frontend/messages/he.json` | 424 |
| 4 | `frontend/messages/en.json` | 373 |
| 5 | `docs/MANUAL_TESTING.md` | 180 |
| 6 | `backend/app/schemas/schemas.py` | 93 |
| 7 | `docs/DATA.md` | 62 |
| 8 | `.github/workflows/pr-checks.yml` | 54 |
| 9 | `frontend/components/Header.jsx` | 47 |
| 9 | `backend/app/models/models.py` | 47 |

### 8.2 Excluding `docs/` and `qa-artifacts/`

| # | File | Commits |
|---:|---|---:|
| 1 | `HANDOFF.md` | 766 |
| 2 | `frontend/messages/he.json` | 424 |
| 3 | `frontend/messages/en.json` | 373 |
| 4 | `backend/app/schemas/schemas.py` | 93 |
| 5 | `.github/workflows/pr-checks.yml` | 54 |
| 6 | `frontend/components/Header.jsx` | 47 |
| 6 | `backend/app/models/models.py` | 47 |
| 8 | `frontend/app/[locale]/page.js` | 42 |
| 9 | `frontend/app/[locale]/producer/dashboard/page.js` | 40 |
| 10 | `tests/test_api.py` | 39 |
| 10 | `frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx` | 39 |

*(11–20: `frontend/app/[locale]/settings/page.jsx` 38 · `frontend/app/[locale]/producer/dashboard/edit/page.js` 38 · `frontend/package-lock.json` 37 · `frontend/components/ProducerCard.jsx` 37 · `frontend/app/[locale]/map/MapClient.jsx` 37 · `backend/pyproject.toml` 36 · `backend/app/routers/producer_me.py` 35 · `frontend/app/[locale]/producer/[id]/components/ProducerHeader.jsx` 34 · `frontend/app/[locale]/home/HomeStaticBlocks.jsx` 34.)*

---

## 9 · Dependencies

Direct dependencies only. **Locked** = resolved version in the lockfile / the exact pin.
**Latest** = current registry version at recon time (2026-07-28). No install was performed
and no lockfile was modified; `npm view` and the PyPI JSON API were queried read-only.

### 9.1 Frontend — `frontend/package.json` (19 runtime + 25 dev = 44 direct)

`package-lock.json` lockfileVersion **3**, 980 package entries. `node_modules/` absent.
No `engines` or `packageManager` field.

#### `dependencies` (19)

| Package | Spec | Locked | Latest | Outdated |
|---|---|---|---|---|
| `@phosphor-icons/react` | `^2.1.10` | 2.1.10 | 2.1.10 | — |
| `@sentry/nextjs` | `^10.66.0` | 10.66.0 | 10.68.0 | **OUTDATED** |
| `@swc/helpers` | `^0.5.23` | 0.5.23 | 0.5.23 | — |
| `@t3-oss/env-nextjs` | `^0.13.11` | 0.13.11 | 0.13.11 | — |
| `@vercel/speed-insights` | `^1.3.1` | 1.3.1 | 2.0.0 | **OUTDATED** (major) |
| `axios` | `^1.18.1` | 1.18.1 | 1.18.1 | — |
| `framer-motion` | `^11.11.0` | 11.18.2 | 12.42.2 | **OUTDATED** (major) |
| `leaflet` | `^1.9.4` | 1.9.4 | 1.9.4 | — |
| `leaflet-defaulticon-compatibility` | `^0.1.2` | 0.1.2 | 0.1.2 | — |
| `leaflet.markercluster` | `^1.5.3` | 1.5.3 | 1.5.3 | — |
| `lenis` | `^1.3.25` | 1.3.25 | 1.3.25 | — |
| `next` | `^16.2.10` | 16.2.10 | 16.2.12 | **OUTDATED** |
| `next-intl` | `^4.13.2` | 4.13.2 | 4.13.4 | **OUTDATED** |
| `posthog-js` | `^1.404.1` | 1.404.1 | 1.407.3 | **OUTDATED** |
| `react` | `^18.3.1` | 18.3.1 | 19.2.8 | **OUTDATED** (major) |
| `react-dom` | `^18.3.1` | 18.3.1 | 19.2.8 | **OUTDATED** (major) |
| `react-leaflet` | `^4.2.1` | 4.2.1 | 5.0.0 | **OUTDATED** (major) |
| `server-only` | `^0.0.1` | 0.0.1 | 0.0.1 | — |
| `zod` | `^4.4.3` | 4.4.3 | 4.4.3 | — |

**Runtime outdated: 9 / 19** (5 major).

#### `devDependencies` (25)

| Package | Spec | Locked | Latest | Outdated |
|---|---|---|---|---|
| `@axe-core/playwright` | `^4.12.1` | 4.12.1 | 4.12.1 | — |
| `@google/design.md` | `^0.3.0` | 0.3.0 | 0.4.0 | **OUTDATED** |
| `@playwright/test` | `^1.61.1` | 1.61.1 | 1.62.0 | **OUTDATED** |
| `@testing-library/jest-dom` | `^6.9.1` | 6.9.1 | 7.0.0 | **OUTDATED** (major) |
| `@testing-library/react` | `^16.3.2` | 16.3.2 | 16.3.2 | — |
| `@types/leaflet` | `^1.9.12` | 1.9.21 | 1.9.21 | — |
| `@types/node` | `^26.1.1` | 26.1.1 | 26.1.2 | **OUTDATED** |
| `@types/react` | `19.2.14` | 19.2.14 | 19.2.17 | **OUTDATED** |
| `@vitejs/plugin-react` | `^6.0.3` | 6.0.3 | 6.0.4 | **OUTDATED** |
| `@vitest/coverage-v8` | `^4.1.10` | 4.1.10 | 4.1.10 | — |
| `autoprefixer` | `^10.5.4` | 10.5.4 | 10.5.4 | — |
| `eslint` | `^9.39.4` | 9.39.4 | 10.8.0 | **OUTDATED** (major) |
| `eslint-config-next` | `^16.2.10` | 16.2.10 | 16.2.12 | **OUTDATED** |
| `eslint-plugin-i18next` | `^6.1.5` | 6.1.5 | 6.1.5 | — |
| `eslint-plugin-playwright` | `2.2.2` | 2.2.2 | 2.11.0 | **OUTDATED** |
| `eslint-plugin-react-hooks` | `^7.1.1` | 7.1.1 | 7.1.1 | — |
| `eslint-plugin-security` | `^4.0.1` | 4.0.1 | 4.0.1 | — |
| `eslint-plugin-sonarjs` | `^4.2.0` | 4.2.0 | 4.2.0 | — |
| `eslint-plugin-unicorn` | `^64.0.0` | 64.0.0 | 72.0.0 | **OUTDATED** (major) |
| `jiti` | `^2.7.0` | 2.7.0 | 2.7.0 | — |
| `jsdom` | `^29.1.1` | 29.1.1 | 30.0.0 | **OUTDATED** (major) |
| `knip` | `^6.27.0` | 6.27.0 | 6.29.0 | **OUTDATED** |
| `postcss` | `^8.5.20` | 8.5.20 | 8.5.24 | **OUTDATED** |
| `tailwindcss` | `^3.4.13` | 3.4.19 | 4.3.3 | **OUTDATED** (major) |
| `vitest` | `^4.1.8` | 4.1.10 | 4.1.10 | — |

**Dev outdated: 14 / 25** (5 major). **Frontend total outdated: 23 / 44.**

### 9.2 Backend — `backend/pyproject.toml` (26 runtime + 8 dev = 34 direct)

Runtime deps are exact-pinned (`==`) except `apscheduler` (`~=3.11`). The dev group uses
`>=` ranges throughout, so "outdated" is not decidable from the spec alone — those rows
are marked `range-spec`. There is no `uv.lock` / `requirements.txt` resolved-version file
at this path, so the **pin is the only locked version available**.

#### `[project.dependencies]` (26)

| Package | Spec | Pinned | Latest | Outdated |
|---|---|---|---|---|
| `fastapi` | `==0.139.0` | 0.139.0 | 0.140.9 | **OUTDATED** |
| `uvicorn[standard]` | `==0.48.0` | 0.48.0 | 0.51.0 | **OUTDATED** |
| `sqlalchemy` | `==2.0.35` | 2.0.35 | 2.0.51 | **OUTDATED** |
| `psycopg2-binary` | `==2.9.12` | 2.9.12 | 2.9.12 | — |
| `alembic` | `==1.18.4` | 1.18.4 | 1.18.5 | **OUTDATED** |
| `joserfc` | `==1.7.0` | 1.7.0 | 1.7.4 | **OUTDATED** |
| `passlib[bcrypt]` | `==1.7.4` | 1.7.4 | 1.7.4 | — |
| `bcrypt` | `==4.0.1` | 4.0.1 | 5.0.0 | **OUTDATED** (major) |
| `bleach` | `==6.4.0` | 6.4.0 | 6.4.0 | — |
| `python-multipart` | `==0.0.32` | 0.0.32 | 0.0.32 | — |
| `pydantic[email]` | `==2.9.2` | 2.9.2 | 2.13.4 | **OUTDATED** |
| `pydantic-settings` | `==2.5.2` | 2.5.2 | 2.14.2 | **OUTDATED** |
| `cloudinary` | `==1.40.0` | 1.40.0 | 1.45.0 | **OUTDATED** |
| `google-auth` | `==2.34.0` | 2.34.0 | 2.56.2 | **OUTDATED** |
| `PyJWT[crypto]` | `==2.13.0` | 2.13.0 | 2.13.0 | — |
| `requests` | `==2.34.2` | 2.34.2 | 2.34.2 | — |
| `httpx` | `==0.27.2` | 0.27.2 | 0.28.1 | **OUTDATED** |
| `openpyxl` | `==3.1.5` | 3.1.5 | 3.1.5 | — |
| `anthropic` | `==0.107.1` | 0.107.1 | 0.120.0 | **OUTDATED** |
| `slowapi` | `==0.1.9` | 0.1.9 | 0.1.10 | **OUTDATED** |
| `pywebpush` | `==2.0.0` | 2.0.0 | 2.3.0 | **OUTDATED** |
| `resend` | `==2.30.1` | 2.30.1 | 2.35.0 | **OUTDATED** |
| `structlog` | `==24.4.0` | 24.4.0 | 26.1.0 | **OUTDATED** (major) |
| `asgi-correlation-id` | `==5.0.1` | 5.0.1 | 5.0.1 | — |
| `sentry-sdk[fastapi]` | `==2.60.0` | 2.60.0 | 2.66.1 | **OUTDATED** |
| `apscheduler` | `~=3.11` | n/a | 3.11.3 | range-spec |

**Runtime outdated: 17 / 25 exact-pinned** (2 major); 1 range-spec not decidable.

#### `[dependency-groups.dev]` (8)

| Package | Spec | Pinned | Latest | Status |
|---|---|---|---|---|
| `mutmut` | `>=3.6.0` | n/a | 3.6.0 | range-spec |
| `pip-audit` | `>=2.10.0` | n/a | 2.10.1 | range-spec |
| `pytest` | `>=8.0` | n/a | 9.1.1 | range-spec |
| `pytest-cov` | `>=7.1.0` | n/a | 7.1.0 | range-spec |
| `pytest-rerunfailures` | `>=16.4` | n/a | 16.4 | range-spec |
| `pytest-timeout` | `>=2.4.0` | n/a | 2.4.0 | range-spec |
| `ruff` | `>=0.15.20` | n/a | 0.16.0 | range-spec |
| `schemathesis` | `>=4.0` | n/a | 4.24.3 | range-spec |

> **Not measured: transitive dependency counts and vulnerability status.** `npm audit`
> requires `node_modules`; `pip-audit` requires an installed environment. Both are P2's
> scope ([MEH-1725](https://linear.app/mehamakor/issue/MEH-1725)).

---

## 10 · Alembic

Measured two independent ways — an offline AST parse of the revision graph, and the real
`alembic heads` CLI (installed into a scratchpad venv, not the project). **Both agree.**

| Metric | Value |
|---|---|
| Revision files (`backend/alembic/versions/*.py`) | **48** |
| Revisions parsed | 48 (1:1 with files — no duplicates) |
| **Heads** | **1** — `e8d4a2f6c9b3` |
| Head file | `20260727_1500_e8d4a2f6c9b3_merge_meh1651_meh1577_heads.py` |
| Roots (`down_revision = None`) | 1 — `ef8fb1858f5b` |
| Merge revisions (tuple `down_revision`) | 3 — `b7e2a4c9d1f6`, `b9d3f1a7c2e4`, `e8d4a2f6c9b3` |
| Dangling parent references | 0 |
| **Revisions from baseline `ef8fb1858f5b` to head** (shortest path) | **44** |
| **Revisions strictly after baseline** | **47** |
| Revisions including baseline | 48 |
| Revisions NOT descended from baseline | 0 |

`alembic heads` CLI output: `e8d4a2f6c9b3 (head)` — single head, matching the offline parse.

> The path length (44) is shorter than the total descendant count (47) because three merge
> revisions create parallel branches; the shortest root→head walk skips the side arms.

---

## 11 · Other repo statistics

| Metric | Value |
|---|---:|
| Total commits (all history, at `114e4c84`) | 2,589 |
| Commits in the 3-month window | 1,973 |
| GitHub workflow files | 12 |
| CI jobs in `pr-checks.yml` | 17 |
| Backend router files | 35 |
| Backend endpoint decorators | 186 total — `@router.post` 80 · `@router.get` 73 · `@router.put` 14 · `@router.delete` 14 · `@router.patch` 5 |

### Contributors (`git shortlog -sn`)

| Commits | Author |
|---:|---|
| 1,947 | levismadar80-ship-it |
| 367 | Claude |
| 200 | sapirschnapp |
| 48 | dependabot[bot] |
| 20 | topaz |
| 4 | claude[bot] |
| 3 | github-actions[bot] |

### CI jobs in `pr-checks.yml`

`Branch name gate` · `DO-NOT-MERGE marker gate` · `Repo guards` · `qa-artifacts size cap` ·
`Paths filter` · `Frontend build (Next.js)` · `AI artifact scan (build output)` ·
`Backend tests (pytest)` · `Backend lint (ruff)` · `Env drift (.env.example)` ·
`Backend mypy (strict, warn-only)` · `Frontend Knip (dead code, warn-only)` ·
`Frontend tsc strict (warn-only)` · `Frontend unit tests (vitest)` ·
`Linear mention guard (rule 29, warn-only)` · `CI gate (required)`.

---

## 12 · Metrics not measured — summary

Every acceptance-criteria metric that could not be measured, with its reason. No value in
this table was estimated.

| Metric | Reason |
|---|---|
| ESLint findings | Requires `frontend/node_modules` (absent). Installing deps into the project is forbidden by MEH-1722 scope. Config facts captured in §6.1. |
| Backend coverage % | pytest suite needs a live PostgreSQL (`tests/conftest.py:12-14`); none available in sandbox. Backend runtime deps not importable on any interpreter on PATH. Configured CI gate is `--cov-fail-under=70` (§6.2). |
| Frontend coverage % | (a) needs `node_modules`; (b) **no coverage is configured anywhere** — `vitest.config.js` has no `coverage` block and CI runs `npx vitest run` without `--coverage` (§6.3). |
| npm transitive dep count / `npm audit` | Requires `node_modules`. Supply-chain scope belongs to P2 (MEH-1725). |
| `pip-audit` / Python transitive deps | Requires an installed backend environment. P2 scope. |
| Executed test counts (vs. static grep counts) | Both suites unrunnable (above). §6.4 counts are static occurrences, not runtime totals. |
| Backend dev-group resolved versions | Dev group uses `>=` ranges and no resolved lockfile (`uv.lock`) exists at `backend/`. Marked `range-spec`, not guessed. |
| `cloc` / `tokei` LOC | Neither binary is available. Fallback used per acceptance criteria: `git ls-files` + `wc -l` (§3). |

---

## 13 · Appendix — commands + raw output

Every number above traces to a command here. Run from the repo root at `114e4c84` unless
stated otherwise.

### A0 · Snapshot + provenance

```
$ git rev-parse --is-shallow-repository
true
$ git fetch --unshallow origin
$ git rev-parse --is-shallow-repository
false
$ git rev-list --count origin/staging
2589

$ git rev-parse origin/staging
114e4c847617495a71058e180007797dfc83533f
$ git rev-parse --short origin/staging
114e4c84
$ git log -1 --format='%cI  %an  %s' origin/staging
2026-07-28T15:38:11+03:00  sapirschnapp  Merge pull request #2360 from levismadar80-ship-it/feature/meh-1698-baseline-currency
```

Read-only guarantee — working tree unchanged throughout the pass:

```
$ git status --porcelain
(empty)
```

### A1 · Tool availability

```
$ for t in cloc tokei scc ruff radon python3 pip3 node npm npx jq pytest alembic; do
    printf "%-10s " "$t"; command -v "$t" || echo "MISSING"; done
cloc       MISSING
tokei      MISSING
scc        MISSING
ruff       /root/.local/bin/ruff
radon      MISSING
python3    /usr/local/bin/python3
pip3       /usr/bin/pip3
node       /opt/node22/bin/node
npm        /opt/node22/bin/npm
npx        /opt/node22/bin/npx
jq         /usr/bin/jq
pytest     /root/.local/bin/pytest
alembic    MISSING

$ python3 --version && node --version && npm --version
Python 3.11.15
v22.22.2
10.9.7
```

`cloc` / `tokei` / `scc` absent → LOC measured via the `git ls-files` + `wc -l` fallback
named in the acceptance criteria. `radon` and `alembic` were installed into a **scratchpad
venv outside the repository** (`/tmp/.../scratchpad/auditvenv`) — no project dependency,
lockfile, or tracked file was modified (confirmed by the clean `git status` in A0).

### A2 · Structure + file counts

```
$ git ls-files | wc -l
3647

$ git ls-files | awk -F/ '{ if (NF==1) print "./"$1"  (root file)";
    else if (NF==2) print $1"/"; else print $1"/"$2"/" }' | sort | uniq -c | sort -rn
    452 design-reference/ds-components/
    249 frontend/__tests__/
    243 .agents/skills/
    203 frontend/qa-artifacts/
    180 docs/audits/
    166 tests/
    150 frontend/app/
    108 frontend/components/
     92 backend/app/
     90 frontend/e2e/
     82 design-reference/s2-logo/
     81 frontend/lib/
     76 .claude/skills/
     61 qa-artifacts/MEH-1074-wave3/
     51 docs/
     51 backend/alembic/
     33 docs/decisions/
     31 frontend/
     29 tests/screenshots/
     27 frontend/public/
     26 qa-artifacts/QA-20260717/
     26 qa-artifacts/MEH-1334/
     26 .claude/scripts/
     25 docs/design-audit/
     25 .design-sync/previews/
     22 qa-artifacts/MEH-1663/
     20 qa-artifacts/MEH-1649/
     20 docs/research/
     18 docs/archive/
     17 qa-artifacts/MEH-1539-mobile/
     16 qa-artifacts/MEH-1655/
     16 qa-artifacts/MEH-1632/
     16 qa-artifacts/MEH-1074-wave4/
     15 docs/upgrade-baselines/
     15 .claude/rules/
     14 scripts/
     14 qa-artifacts/MEH-1536/
     14 .claude/hooks/
     13 qa-artifacts/MEH-1146-a/
     13 .claude/commands/
     12 qa-artifacts/MEH-1583/
     12 qa-artifacts/MEH-1577/
     12 qa-artifacts/MEH-1572/
     12 qa-artifacts/MEH-1266-1267/
     12 qa-artifacts/MEH-1195/
     12 .github/workflows/
     12 "design-reference/s2-logo/
     11 qa-artifacts/MEH-1568/
     11 qa-artifacts/MEH-1174/
     11 docs/templates/
     10 qa-artifacts/MEH-1688/
     10 qa-artifacts/MEH-1611/
     10 qa-artifacts/MEH-1305/
     10 qa-artifacts/MEH-1168-p2/
     10 docs/synthesis/
     10 docs/ci/
      9 qa-artifacts/MEH-1546-staging/
      9 qa-artifacts/MEH-1168-p1/
      9 design-reference/_archive-2026-06/
      9 .claude/agents/
    (truncated at 9 files; remaining entries are qa-artifacts/MEH-* dirs with <9 files)
```

> The `"design-reference/s2-logo/` row (12) is a quoting artifact — `git ls-files` quotes
> paths containing non-ASCII characters, so a subset of that directory's entries sorts
> under a leading `"`. Both rows belong to the same directory.

### A3 · LOC

```
$ for d in $(git ls-files | awk -F/ 'NF>1{print $1}' | sort -u); do
    n=$(git ls-files "$d" | wc -l)
    loc=$(git ls-files -z "$d" | xargs -0 -r wc -l 2>/dev/null | tail -1 | awk '{print $1}')
    printf "%-20s files=%-6s loc=%s\n" "$d" "$n" "${loc:-0}"; done
"design-reference    files=0      loc=0
.agents              files=244    loc=47997
.ai                  files=4      loc=802
.claude              files=161    loc=10206
.design-sync         files=30     loc=1436
.github              files=15     loc=2710
backend              files=156    loc=45539
design-reference     files=571    loc=185390
docs                 files=387    loc=450010
frontend             files=951    loc=186869
logo                 files=5      loc=1723
qa-artifacts         files=884    loc=227273
scripts              files=21     loc=4197
tests                files=195    loc=87057
(root)               files=23     loc=9444
```

```
$ for ext in py js jsx ts tsx mjs cjs css scss json yml yaml md sh sql html toml txt; do
    files=$(git ls-files "*.$ext" | wc -l); [ "$files" -eq 0 ] && continue
    loc=$(git ls-files -z "*.$ext" | xargs -0 -r wc -l 2>/dev/null | tail -1 | awk '{print $1}')
    printf "%-10s %-8s %s\n" ".$ext" "$files" "${loc:-0}"; done
.py        337      73685
.js        286      140661
.jsx       464      70714
.ts        131      6350
.tsx       28       875
.mjs       41       6560
.cjs       1        11
.css       14       8643
.json      115      98453
.yml       14       2430
.yaml      1        37
.md        560      107125
.sh        27       4035
.sql       2        147
.html      149      49915
.toml      2        174
.txt       32       17268

$ for ext in png webp jpg jpeg svg ico xlsx woff woff2 gif pdf; do
    n=$(git ls-files "*.$ext" | wc -l); [ "$n" -gt 0 ] && printf "%-8s %s\n" ".$ext" "$n"; done
.png     436
.webp    850
.svg     23
.ico     2
.xlsx    2
```

App-code vs test-code split:

```
$ git ls-files 'frontend/*.js' 'frontend/*.jsx' 'frontend/*.ts' 'frontend/*.tsx' 'frontend/*.mjs' \
  | grep -v '^frontend/__tests__/' | grep -v '^frontend/e2e/' | grep -v '^frontend/qa-artifacts/' \
  | tr '\n' '\0' | xargs -0 -r wc -l | tail -1
  61574 total
  (file count: 362)

$ git ls-files 'backend/app/*.py' | tr '\n' '\0' | xargs -0 -r wc -l | tail -1
  25003 total   (90 files)
$ git ls-files 'backend/alembic/*.py' | tr '\n' '\0' | xargs -0 -r wc -l | tail -1
   3725 total
$ git ls-files 'tests/*.py' | tr '\n' '\0' | xargs -0 -r wc -l | tail -1
  34724 total
$ git ls-files 'frontend/__tests__/*' | grep -E '\.(js|jsx|ts|tsx)$' | tr '\n' '\0' | xargs -0 -r wc -l | tail -1
  32621 total
$ git ls-files 'frontend/e2e/*' | grep -E '\.(js|jsx|ts|tsx)$' | tr '\n' '\0' | xargs -0 -r wc -l | tail -1
   5137 total
```

Backend module + frontend surface counts:

```
$ for d in routers services models schemas utils; do
    printf "%-12s files=%-4s loc=%s\n" "$d" "$(git ls-files "backend/app/$d/*.py" | wc -l)" \
    "$(git ls-files "backend/app/$d/*.py" | tr '\n' '\0' | xargs -0 -r wc -l | tail -1 | awk '{print $1}')"; done
routers      files=35   loc=11794
services     files=29   loc=5494
models       files=2    loc=1738
schemas      files=3    loc=3444
utils        files=6    loc=246

$ git ls-files 'frontend/app/*page.js' 'frontend/app/*page.jsx' | wc -l      → 72
$ git ls-files 'frontend/app/*layout.js' 'frontend/app/*layout.jsx' | wc -l  → 3
$ git ls-files 'frontend/app/*route.js' | wc -l                              → 0
$ git ls-files 'frontend/components/*.jsx' 'frontend/components/*.js' | wc -l → 107
$ git ls-files 'frontend/lib/*.js' 'frontend/lib/*.mjs' | wc -l               → 79
$ jq -r '[paths(scalars)] | length' frontend/messages/he.json                 → 3660
$ jq -r '[paths(scalars)] | length' frontend/messages/en.json                 → 3643
```

### A4 · Ruff

```
$ ruff --version
ruff 0.15.8

$ ls -1 pyproject.toml ruff.toml backend/pyproject.toml backend/ruff.toml setup.cfg
ls: cannot access 'pyproject.toml': No such file or directory
ls: cannot access 'ruff.toml': No such file or directory
ls: cannot access 'backend/ruff.toml': No such file or directory
ls: cannot access 'setup.cfg': No such file or directory
backend/pyproject.toml

$ cd backend && ruff check . --statistics
1	F401	[*] unused-import
Found 1 error.
[*] 1 fixable with the `--fix` option.

$ ruff check tests/ --statistics
20	F401	[*] unused-import
 3	E402	[ ] module-import-not-at-top-of-file
 3	F841	[ ] unused-variable
Found 26 errors.
[*] 20 fixable with the `--fix` option (3 hidden fixes can be enabled with the `--unsafe-fixes` option).

$ ruff check scripts/ --statistics
5	E741	[ ] ambiguous-variable-name
2	F541	[*] f-string-missing-placeholders
Found 7 errors.
[*] 2 fixable with the `--fix` option.

$ ruff check . --statistics
24	F401	[*] unused-import
11	F541	[*] f-string-missing-placeholders
 6	F841	[ ] unused-variable
 5	E741	[ ] ambiguous-variable-name
 3	E402	[ ] module-import-not-at-top-of-file
Found 49 errors.
[*] 35 fixable with the `--fix` option (6 hidden fixes can be enabled with the `--unsafe-fixes` option).
```

Complexity rules, with and without the configured `per-file-ignores`:

```
$ ruff check backend/app --select C901,PLR0911,PLR0912,PLR0913,PLR0915 --statistics
(no output — 0 findings)

$ ruff check backend/app --isolated --select C901,PLR0911,PLR0912,PLR0913,PLR0915 --statistics
3	C901   	complex-structure
3	PLR0912	too-many-branches
2	PLR0913	too-many-arguments
1	PLR0915	too-many-statements
Found 9 errors.
```

### A5 · Radon

```
$ radon --version
6.0.1

$ radon cc -s -a backend/app | tail -3
800 blocks (classes, functions, methods) analyzed.
Average complexity: A (3.37875)

$ radon cc -s backend/app | grep -oE '\- [A-F] \(' | sort | uniq -c
    663 - A (
    100 - B (
     31 - C (
      4 - D (
      2 - E (

$ radon cc -a tests/ | tail -2
2526 blocks (classes, functions, methods) analyzed.
Average complexity: A (3.111243072050673)

$ radon cc -a backend/alembic | tail -2
98 blocks (classes, functions, methods) analyzed.
Average complexity: A (1.0408163265306123)

$ radon cc -s -n D backend/app
backend/app/services/producer_listing.py
    F 264:0 _apply_scalar_filters - D (27)
backend/app/routers/auth.py
    F 404:0 register_producer - E (38)
    F 855:0 register_producer_oauth - D (23)
    F 1314:0 delete_account - D (21)
backend/app/routers/producer_me.py
    F 650:0 producer_analytics - E (31)
backend/app/routers/admin_extra.py
    F 608:0 get_dashboard - D (27)

$ radon cc -s -n C backend/app
backend/app/startup.py
    F 39:0 _check_frontend_url_consistency - C (12)
    F 257:0 lifespan - C (11)
backend/app/services/producer_queries.py
    F 118:0 attach_badge_fields - C (12)
backend/app/services/producer_risk.py
    F 143:0 _extract_json_object - C (11)
    F 177:0 _call_anthropic - C (11)
backend/app/services/producer_listing.py
    F 264:0 _apply_scalar_filters - D (27)
backend/app/services/oauth_verifiers.py
    F 158:0 verify_apple_token - C (14)
backend/app/services/producer_import.py
    F 205:0 import_rows - C (15)
    F 145:0 parse_row - C (11)
backend/app/schemas/schemas.py
    F 34:0 _order_window_validator - C (13)
    M 1535:4 ProducerUpdate._validate_location_mode - C (13)
backend/app/routers/producers.py
    F 484:0 get_kashrut_cert - C (12)
backend/app/routers/admin_outreach.py
    F 61:0 create_lead - C (13)
backend/app/routers/auth.py
    F 404:0 register_producer - E (38)
    F 855:0 register_producer_oauth - D (23)
    F 1314:0 delete_account - D (21)
    F 149:0 refresh_token - C (11)
    F 757:0 google_auth - C (11)
backend/app/routers/google_rating.py
    F 132:0 _search_place_candidates - C (14)
backend/app/routers/search.py
    F 84:0 smart_search - C (15)
backend/app/routers/upload.py
    F 66:0 upload_image - C (13)
backend/app/routers/cities.py
    F 49:0 list_cities - C (12)
backend/app/routers/admin.py
    F 216:0 admin_update_producer - C (15)
    F 816:0 seed_cities - C (13)
    F 469:0 approve_producer - C (12)
backend/app/routers/producer_me.py
    F 650:0 producer_analytics - E (31)
    F 170:0 _enforce_owner_license_gate - C (12)
    F 238:0 update_my_producer - C (12)
    F 96:0 _sync_delivery_areas - C (11)
backend/app/routers/producer_recipes.py
    F 231:0 update_my_recipe - C (15)
backend/app/routers/admin_extra.py
    F 608:0 get_dashboard - D (27)
backend/app/routers/events.py
    F 65:0 list_events - C (11)
backend/app/routers/whatsapp_webhook.py
    F 385:0 _maybe_process_optout - C (12)
    F 447:0 _persist_message - C (11)
backend/app/routers/users_me.py
    F 42:0 update_profile - C (13)
backend/app/routers/home_products.py
    F 270:0 update_home_product - C (11)
backend/app/routers/alerts.py
    F 266:0 fire_alerts - C (15)

$ radon cc -s -n C backend/app | grep -cE '^\s+[FMC] '
37
```

37 blocks = 31 C + 4 D + 2 E, reconciling exactly with the rank distribution in §5.2.

### A6 · Lint / coverage measurability probes

```
$ [ -d frontend/node_modules ] && echo YES || echo NO
NO
$ jq -r .lockfileVersion frontend/package-lock.json → 3
$ jq -r '.packages|length' frontend/package-lock.json → 980

$ python3 -c "import importlib; [ ... ]"
  MISSING fastapi  (ModuleNotFoundError)
  MISSING sqlalchemy  (ModuleNotFoundError)
  MISSING pydantic  (ModuleNotFoundError)
  MISSING alembic  (ModuleNotFoundError)
  MISSING httpx  (ModuleNotFoundError)
  MISSING pytest  (ModuleNotFoundError)
  MISSING pytest_cov  (ModuleNotFoundError)
  MISSING anthropic  (ModuleNotFoundError)
  MISSING cloudinary  (ModuleNotFoundError)
  MISSING slowapi  (ModuleNotFoundError)
  MISSING structlog  (ModuleNotFoundError)

$ grep -nE "DATABASE_URL|sqlite|create_engine|postgres" tests/conftest.py
12:os.environ["DATABASE_URL"] = os.environ.get(
13:    "TEST_DATABASE_URL",
14:    "postgresql://postgres:postgres@localhost:5432/mehamakor_test",

$ grep -nA15 "coverage" frontend/vitest.config.js
(no output — no coverage block configured)

$ ls -1 frontend/eslint.config.mjs && wc -l < frontend/eslint.config.mjs
frontend/eslint.config.mjs
262
$ grep -cE "^\s+\"[a-z@].*\":\s*\"(error|warn|off)\"" frontend/eslint.config.mjs → 14

$ jq -r '.scripts' frontend/package.json
{ "dev": "next dev -p 3000", "build": "next build", "start": "next start -p 3000",
  "lint": "eslint .", "test:e2e": "playwright test", "test:e2e:report": "playwright show-report",
  "knip": "knip", "design:lint": "design.md lint ../docs/DESIGN.md",
  "design:export": "design.md export --format tailwind ../docs/DESIGN.md > tailwind.tokens.json" }

$ grep -rnE "cov|coverage" .github/workflows/pr-checks.yml
384:      # MEH-489 — coverage gate at 70%. Drops `-x` so the full suite runs
390:      - name: Run tests with coverage gate
393:            --cov=backend/app \
394:            --cov-report=xml \
395:            --cov-report=html \
396:            --cov-report=term \
397:            --cov-fail-under=70 \
409:      - name: Upload coverage to Smokeshow
417:          SMOKESHOW_GITHUB_STATUS_DESCRIPTION: "Coverage {coverage-percentage}"

$ grep -rnE "vitest" .github/workflows/pr-checks.yml
605:  frontend-vitest:
606:    name: Frontend unit tests (vitest)
624:      - name: Run vitest unit suite
625:        run: npx vitest run
```

Static test inventory:

```
$ git ls-files 'tests/test_*.py' | wc -l                                        → 162
$ git ls-files 'frontend/__tests__/*.test.js' … | wc -l                         → 246
$ git ls-files 'frontend/e2e/*.spec.js' 'frontend/e2e/*.spec.ts' … | wc -l      → 32
$ grep -rhc '^\s*def test_' tests/*.py | awk '{s+=$1} END {print s}'            → 1889
$ grep -rhoE '^\s*(it|test)\(' frontend/__tests__/ | wc -l                      → 1844
$ grep -rhoE '^\s*test\(' frontend/e2e/ | wc -l                                 → 91
```

### A7 · Top largest files

```
$ git ls-files -z '*.py' '*.js' '*.jsx' '*.ts' '*.tsx' '*.mjs' '*.css' \
  | xargs -0 -r wc -l | sort -rn | grep -v ' total$' | head -20
   59979 design-reference/ds-components/_ds_bundle.js
   33269 design-reference/ds-components/_vendor/react.js
   12575 design-reference/s2-logo/_ds/mehamakor-design-system-0e28208b-1d76-4e18-a78e-dacea5c8a0dc/_ds_bundle.js
    6398 design-reference/ds-components/_ds_bundle.css
    4603 tests/test_api.py
    3405 backend/app/schemas/schemas.py
    1957 frontend/app/[locale]/producer/dashboard/edit/cards.jsx
    1665 backend/app/models/models.py
    1512 design-reference/s2-logo/support.js
    1478 tests/test_cleanup_cloudinary_orphans.py
    1471 backend/app/routers/auth.py
    1398 backend/app/routers/producer_me.py
    1368 frontend/app/[locale]/producer/dashboard/edit/page.js
    1291 frontend/app/[locale]/register/producer/RegisterProducerClient.jsx
    1068 .agents/skills/ui-ux-pro-max/scripts/design_system.py
    1064 frontend/components/admin/ProducerForm.jsx
     974 design-reference/s2-logo/design-canvas.jsx
     907 frontend/app/[locale]/producer/dashboard/page.js
     891 frontend/components/MapComponent.jsx
     861 backend/app/routers/admin.py

$ (same, | grep -v 'design-reference/' | grep -v 'qa-artifacts/' | head -15)
    4603 tests/test_api.py
    3405 backend/app/schemas/schemas.py
    1957 frontend/app/[locale]/producer/dashboard/edit/cards.jsx
    1665 backend/app/models/models.py
    1478 tests/test_cleanup_cloudinary_orphans.py
    1471 backend/app/routers/auth.py
    1398 backend/app/routers/producer_me.py
    1368 frontend/app/[locale]/producer/dashboard/edit/page.js
    1291 frontend/app/[locale]/register/producer/RegisterProducerClient.jsx
    1068 .agents/skills/ui-ux-pro-max/scripts/design_system.py
    1064 frontend/components/admin/ProducerForm.jsx
     907 frontend/app/[locale]/producer/dashboard/page.js
     891 frontend/components/MapComponent.jsx
     861 backend/app/routers/admin.py
     859 frontend/components/ProducersClient.jsx
```

### A8 · Churn (last 3 months)

```
$ git log --since=3.months --oneline 114e4c84 | wc -l
1973
$ git log --since=3.months --reverse --format='%cI %h' 114e4c84 | head -1
2026-04-28T16:36:32+03:00 28bbc3f4

$ git log --since=3.months --name-only --pretty=format: 114e4c84 \
  | grep -v '^$' | sort | uniq -c | sort -rn | head -20
    878 docs/CHANGELOG.md
    766 HANDOFF.md
    424 frontend/messages/he.json
    373 frontend/messages/en.json
    180 docs/MANUAL_TESTING.md
     93 backend/app/schemas/schemas.py
     62 docs/DATA.md
     54 .github/workflows/pr-checks.yml
     47 frontend/components/Header.jsx
     47 backend/app/models/models.py
     42 frontend/app/[locale]/page.js
     40 frontend/app/[locale]/producer/dashboard/page.js
     39 tests/test_api.py
     39 frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx
     38 frontend/app/[locale]/settings/page.jsx
     38 frontend/app/[locale]/producer/dashboard/edit/page.js
     37 frontend/package-lock.json
     37 frontend/components/ProducerCard.jsx
     37 frontend/app/[locale]/map/MapClient.jsx
     36 backend/pyproject.toml

$ (same, additionally | grep -v '^qa-artifacts/' | grep -v '^docs/' | grep -v 'snapshots/')
    766 HANDOFF.md
    424 frontend/messages/he.json
    373 frontend/messages/en.json
     93 backend/app/schemas/schemas.py
     54 .github/workflows/pr-checks.yml
     47 frontend/components/Header.jsx
     47 backend/app/models/models.py
     42 frontend/app/[locale]/page.js
     40 frontend/app/[locale]/producer/dashboard/page.js
     39 tests/test_api.py
     39 frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx
     38 frontend/app/[locale]/settings/page.jsx
     38 frontend/app/[locale]/producer/dashboard/edit/page.js
     37 frontend/package-lock.json
     37 frontend/components/ProducerCard.jsx
     37 frontend/app/[locale]/map/MapClient.jsx
     36 backend/pyproject.toml
     35 backend/app/routers/producer_me.py
     34 frontend/app/[locale]/producer/[id]/components/ProducerHeader.jsx
     34 frontend/app/[locale]/home/HomeStaticBlocks.jsx
```

### A9 · Dependencies

Frontend — for each direct dep: spec from `package.json`, locked version from
`package-lock.json` (`.packages["node_modules/<name>"].version`), latest from
`npm view <pkg> version`. No `npm install` / `npm ci` was run.

```
$ npm ping
npm notice PING https://registry.npmjs.org/
npm notice PONG 173ms

$ jq -r '"dependencies: \(.dependencies|length)  devDependencies: \(.devDependencies|length)"' frontend/package.json
dependencies: 19  devDependencies: 25
$ jq -r '{engines, packageManager}' frontend/package.json
{ "engines": null, "packageManager": null }
```

Full generated table (script: `spec | locked | latest | flag` per package):

```
PACKAGE                                SPEC           LOCKED       LATEST       OUTDATED
### dependencies
@phosphor-icons/react                  ^2.1.10        2.1.10       2.1.10       -
@sentry/nextjs                         ^10.66.0       10.66.0      10.68.0      OUTDATED
@swc/helpers                           ^0.5.23        0.5.23       0.5.23       -
@t3-oss/env-nextjs                     ^0.13.11       0.13.11      0.13.11      -
@vercel/speed-insights                 ^1.3.1         1.3.1        2.0.0        OUTDATED
axios                                  ^1.18.1        1.18.1       1.18.1       -
framer-motion                          ^11.11.0       11.18.2      12.42.2      OUTDATED
leaflet                                ^1.9.4         1.9.4        1.9.4        -
leaflet-defaulticon-compatibility      ^0.1.2         0.1.2        0.1.2        -
leaflet.markercluster                  ^1.5.3         1.5.3        1.5.3        -
lenis                                  ^1.3.25        1.3.25       1.3.25       -
next                                   ^16.2.10       16.2.10      16.2.12      OUTDATED
next-intl                              ^4.13.2        4.13.2       4.13.4       OUTDATED
posthog-js                             ^1.404.1       1.404.1      1.407.3      OUTDATED
react                                  ^18.3.1        18.3.1       19.2.8       OUTDATED
react-dom                              ^18.3.1        18.3.1       19.2.8       OUTDATED
react-leaflet                          ^4.2.1         4.2.1        5.0.0        OUTDATED
server-only                            ^0.0.1         0.0.1        0.0.1        -
zod                                    ^4.4.3         4.4.3        4.4.3        -
### devDependencies
@axe-core/playwright                   ^4.12.1        4.12.1       4.12.1       -
@google/design.md                      ^0.3.0         0.3.0        0.4.0        OUTDATED
@playwright/test                       ^1.61.1        1.61.1       1.62.0       OUTDATED
@testing-library/jest-dom              ^6.9.1         6.9.1        7.0.0        OUTDATED
@testing-library/react                 ^16.3.2        16.3.2       16.3.2       -
@types/leaflet                         ^1.9.12        1.9.21       1.9.21       -
@types/node                            ^26.1.1        26.1.1       26.1.2       OUTDATED
@types/react                           19.2.14        19.2.14      19.2.17      OUTDATED
@vitejs/plugin-react                   ^6.0.3         6.0.3        6.0.4        OUTDATED
@vitest/coverage-v8                    ^4.1.10        4.1.10       4.1.10       -
autoprefixer                           ^10.5.4        10.5.4       10.5.4       -
eslint                                 ^9.39.4        9.39.4       10.8.0       OUTDATED
eslint-config-next                     ^16.2.10       16.2.10      16.2.12      OUTDATED
eslint-plugin-i18next                  ^6.1.5         6.1.5        6.1.5        -
eslint-plugin-playwright               2.2.2          2.2.2        2.11.0       OUTDATED
eslint-plugin-react-hooks              ^7.1.1         7.1.1        7.1.1        -
eslint-plugin-security                 ^4.0.1         4.0.1        4.0.1        -
eslint-plugin-sonarjs                  ^4.2.0         4.2.0        4.2.0        -
eslint-plugin-unicorn                  ^64.0.0        64.0.0       72.0.0       OUTDATED
jiti                                   ^2.7.0         2.7.0        2.7.0        -
jsdom                                  ^29.1.1        29.1.1       30.0.0       OUTDATED
knip                                   ^6.27.0        6.27.0       6.29.0       OUTDATED
postcss                                ^8.5.20        8.5.20       8.5.24       OUTDATED
tailwindcss                            ^3.4.13        3.4.19       4.3.3        OUTDATED
vitest                                 ^4.1.8         4.1.10       4.1.10       -
```

Backend — spec parsed from `backend/pyproject.toml` via `tomllib`; latest from
`https://pypi.org/pypi/<pkg>/json` → `.info.version`. No `pip install` into the project.

```
PACKAGE                      SPEC             PINNED       LATEST       STATUS
### dependencies
fastapi                      ==0.139.0        0.139.0      0.140.9      OUTDATED
uvicorn[standard]            ==0.48.0         0.48.0       0.51.0       OUTDATED
sqlalchemy                   ==2.0.35         2.0.35       2.0.51       OUTDATED
psycopg2-binary              ==2.9.12         2.9.12       2.9.12       -
alembic                      ==1.18.4         1.18.4       1.18.5       OUTDATED
joserfc                      ==1.7.0          1.7.0        1.7.4        OUTDATED
passlib[bcrypt]              ==1.7.4          1.7.4        1.7.4        -
bcrypt                       ==4.0.1          4.0.1        5.0.0        OUTDATED
bleach                       ==6.4.0          6.4.0        6.4.0        -
python-multipart             ==0.0.32         0.0.32       0.0.32       -
pydantic[email]              ==2.9.2          2.9.2        2.13.4       OUTDATED
pydantic-settings            ==2.5.2          2.5.2        2.14.2       OUTDATED
cloudinary                   ==1.40.0         1.40.0       1.45.0       OUTDATED
google-auth                  ==2.34.0         2.34.0       2.56.2       OUTDATED
PyJWT[crypto]                ==2.13.0         2.13.0       2.13.0       -
requests                     ==2.34.2         2.34.2       2.34.2       -
httpx                        ==0.27.2         0.27.2       0.28.1       OUTDATED
openpyxl                     ==3.1.5          3.1.5        3.1.5        -
anthropic                    ==0.107.1        0.107.1      0.120.0      OUTDATED
slowapi                      ==0.1.9          0.1.9        0.1.10       OUTDATED
pywebpush                    ==2.0.0          2.0.0        2.3.0        OUTDATED
resend                       ==2.30.1         2.30.1       2.35.0       OUTDATED
structlog                    ==24.4.0         24.4.0       26.1.0       OUTDATED
asgi-correlation-id          ==5.0.1          5.0.1        5.0.1        -
sentry-sdk[fastapi]          ==2.60.0         2.60.0       2.66.1       OUTDATED
apscheduler                  ~=3.11           n/a          3.11.3       range-spec (not an exact pin)
### dependency-group:dev
mutmut                       >=3.6.0          n/a          3.6.0        range-spec (not an exact pin)
pip-audit                    >=2.10.0         n/a          2.10.1       range-spec (not an exact pin)
pytest                       >=8.0            n/a          9.1.1        range-spec (not an exact pin)
pytest-cov                   >=7.1.0          n/a          7.1.0        range-spec (not an exact pin)
pytest-rerunfailures         >=16.4           n/a          16.4         range-spec (not an exact pin)
pytest-timeout               >=2.4.0          n/a          2.4.0        range-spec (not an exact pin)
ruff                         >=0.15.20        n/a          0.16.0       range-spec (not an exact pin)
schemathesis                 >=4.0            n/a          4.24.3       range-spec (not an exact pin)
```

### A10 · Alembic

Method 1 — offline AST parse of `revision` / `down_revision` (handles both plain and
annotated assignment forms; no DB, no CLI):

```
$ python3 scratchpad/alembic_graph.py backend/alembic/versions ef8fb1858f5b
revision files parsed : 48
revisions found       : 48
roots  (down_revision=None) : 1 -> ['ef8fb1858f5b']
merge revisions             : 3 -> ['b7e2a4c9d1f6', 'b9d3f1a7c2e4', 'e8d4a2f6c9b3']
HEADS                       : 1
   head: e8d4a2f6c9b3   (20260727_1500_e8d4a2f6c9b3_merge_meh1651_meh1577_heads.py)
dangling parent refs        : 0 -> []

BASELINE ef8fb1858f5b (20260424_0815_ef8fb1858f5b_baseline.py)
   revisions from baseline to head e8d4a2f6c9b3: 44
   total revisions strictly after baseline: 47
   total revisions incl. baseline         : 48
   revisions NOT descended from baseline  : 0
```

Method 2 — the real Alembic CLI (1.18.4, scratchpad venv, run from `backend/`):

```
$ alembic heads
e8d4a2f6c9b3 (head)
```

Both methods agree: **one head, `e8d4a2f6c9b3`**.

```
$ git ls-files 'backend/alembic/versions/*.py' | wc -l
48
```

### A11 · Repo statistics

```
$ git rev-list --count 114e4c84
2589
$ git ls-files '.github/workflows/*' | wc -l
12
$ git shortlog -sn 114e4c84
  1947	levismadar80-ship-it
   367	Claude
   200	sapirschnapp
    48	dependabot[bot]
    20	topaz
     4	claude[bot]
     3	github-actions[bot]

$ git ls-files 'backend/app/routers/*.py' | wc -l
35
$ grep -rhoE '@router\.(get|post|put|patch|delete)' backend/app/routers/ | sort | uniq -c | sort -rn
     80 @router.post
     73 @router.get
     14 @router.put
     14 @router.delete
      5 @router.patch

$ grep -nE "^  [a-z0-9_-]+:$|    name: " .github/workflows/pr-checks.yml
44:  branch-name-gate:          45:    name: Branch name gate
62:  do-not-merge-gate:         63:    name: DO-NOT-MERGE marker gate
79:  repo-guards:               80:    name: Repo guards
88:  qa-artifacts-size:         89:    name: qa-artifacts size cap
136:  changes:                  137:    name: Paths filter
163:  build:                    164:    name: Frontend build (Next.js)
214:  ai-artifact-scan:         215:    name: AI artifact scan (build output)
281:  pytest:                   282:    name: Backend tests (pytest)
433:  lint-backend:             434:    name: Backend lint (ruff)
480:  env-drift:                481:    name: Env drift (.env.example)
512:  backend-mypy:             513:    name: Backend mypy (strict, warn-only)
543:  frontend-knip:            544:    name: Frontend Knip (dead code, warn-only)
578:  frontend-tsc-strict:      579:    name: Frontend tsc strict (warn-only)
605:  frontend-vitest:          606:    name: Frontend unit tests (vitest)
637:  linear-mentions:          638:    name: Linear mention guard (rule 29, warn-only)
656:  ci-gate:                  657:    name: CI gate (required)
```

---

*P0/8 recon — MEH-1722, epic MEH-1721. Facts only; no findings, no recommendations.*
