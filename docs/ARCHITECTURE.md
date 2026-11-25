# מהמקור — Architecture

> Single-page repo map. Read this first in every session — it points to
> the right deeper doc instead of duplicating them.

---

## 1. Repo tree (3 levels, top-level only)

```
mehamakor/
├── backend/                    FastAPI app, Alembic migrations
│   ├── app/                    routers, models, schemas, services, auth, config
│   ├── alembic/versions/       migration revisions (sole schema authority — ADR-003)
│   └── scripts/                backend ops scripts
├── frontend/                   Next.js 16 App Router (JavaScript)
│   ├── app/                    routes — one dir per page (server + client)
│   ├── components/             shared React components
│   ├── lib/                    auth-context, api, cloudinary, schemas
│   ├── __tests__/              Vitest component tests
│   └── e2e/                    Playwright flows
├── docs/                       long-form context (this file lives here)
│   └── decisions/              ADRs — permanent decisions (see §4)
├── .ai/diagrams/               Mermaid: auth flow, DB schema, API routes
├── .claude/                    rules, hooks, agents, skills allowlist, settings
├── .agents/skills/             canonical skill content (symlinked into .claude/)
├── .github/workflows/          CI gates + Vercel/Railway redeploy triggers
├── scripts/                    repo-level helpers (smoke_test, etc.)
└── tests/                      top-level fixtures / screenshots
```

---

## 2. Where to look for X

| If you need to... | Look in... |
|---|---|
| Add an API endpoint | `backend/app/routers/<domain>.py` (register in `router_registry.py`) |
| Modify DB schema | the model module under `backend/app/models/` (core tables in `models.py`, the rest one file per area) + new Alembic revision (`docs/MIGRATIONS.md`) |
| Change API I/O shape | the area module under `backend/app/schemas/` (shared validators in `schemas.py`) |
| Tweak auth / JWT | `backend/app/auth.py` + `backend/app/config.py` |
| Add a backend service | `backend/app/services/<name>.py` |
| Add a frontend page | `frontend/app/<route>/page.js` |
| Modify shared component | `frontend/components/<Component>.jsx` |
| Add a client utility | `frontend/lib/<name>.js` |
| Tweak design tokens or copy | `docs/DESIGN.md` |
| Read auth flow | `.ai/diagrams/auth-flow.md` |
| Read DB schema diagram | `.ai/diagrams/db-schema.md` |
| Read endpoint map | `.ai/diagrams/api-routes.md` |
| Check past decisions | `docs/decisions/README.md` (ADR index) |
| See every scheduled job and when it runs (generated from code) | `docs/JOBS.md` |
| See every status and who can move it | `docs/STATE_MACHINES.md` |
| See every message the site sends, by channel | `docs/NOTIFICATIONS.md` |
| See what talks to what, where data lives, what breaks first under load | `docs/SYSTEM_MAP.md` |
| See every environment variable and where it is read (generated from code) | `docs/ENVIRONMENT.md` |
| Look up a workflow rule | `.claude/rules/workflow.md` |
| Add an Alembic migration | `backend/alembic/versions/` (`docs/MIGRATIONS.md`) |

---

## 3. Central components — extra caution

Files in `.claude/central-components.json` get adversarial review even
if `npm run build` fails (workflow rule 20). Logic risk > syntax risk.
Current set: `MapClient.jsx`, `MapComponent.jsx`, `producers/page.jsx`,
`app/page.js`, `app/layout.js`, `ProducerCard.jsx`,
`Header.jsx`, `BottomNav.jsx`, `Footer.jsx`, `backend/app/main.py`,
`backend/app/routers/auth.py`, `backend/app/routers/auth_register_producer.py`, `backend/app/config.py`. Refactor planned: MEH-407.

---

## 4. Linkouts (single source of truth)

- DB schema + endpoints → [`docs/DATA.md`](./DATA.md)
- Branch strategy + deploy → [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md)
- Security model → [`docs/SECURITY.md`](./SECURITY.md)
- Who/what has access (apps, bots, tokens, external accounts) → [`docs/ACCESS.md`](./ACCESS.md)
- Migrations workflow → [`docs/MIGRATIONS.md`](./MIGRATIONS.md)
- Design tokens + voice → [`docs/DESIGN.md`](./DESIGN.md)
- Bug patterns → [`docs/BUG_PATTERNS.md`](./BUG_PATTERNS.md)
- **Permanent decisions → [`docs/decisions/README.md`](./decisions/README.md)** (NOT `LOCKED_DECISIONS.md` — deprecated, migrating into ADRs)
- Roadmap + features → [`docs/ROADMAP.md`](./ROADMAP.md)
- Diagrams → [`.ai/diagrams/`](../.ai/diagrams/)
- Apex project context (DNA, stack, working model) → [`docs/CONTEXT.md`](./CONTEXT.md) · brand → [`docs/BRAND.md`](./BRAND.md)
- Tests + release checklist + E2E locators → [`docs/TESTING.md`](./TESTING.md) · [`docs/RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) · [`docs/E2E-LOCATORS.md`](./E2E-LOCATORS.md)
- Moderation + admin pages → [`docs/MODERATION.md`](./MODERATION.md) · [`docs/ADMIN.md`](./ADMIN.md)
- Feature status + session log → [`docs/FEATURES.md`](./FEATURES.md) · [`docs/CHANGELOG.md`](./CHANGELOG.md)
- Prompt templates (Linear issues, CC tasks, design) → [`docs/templates/`](./templates/README.md)
- Central-component guardrails + emergency skips → [`docs/CENTRAL_COMPONENTS.md`](./CENTRAL_COMPONENTS.md) · [`docs/EMERGENCY_OVERRIDE.md`](./EMERGENCY_OVERRIDE.md)
- Security checklist (past-incident traps) → [`docs/SECURITY-CHECKLIST.md`](./SECURITY-CHECKLIST.md)

---

## 5. Every inventory in the repo — what lists each kind of thing, and what keeps the list true

Before adding a page, route, table, flag, job, message, component or helper,
find its kind here and read its list: something like it may already exist, and
the list is where the new one is registered. **A list whose guard is «—» is
kept by hand and can be stale** — check the code before trusting it. Built
under MEH-3604 after a session-day of near-duplicates (two offer cards, 49 of 73
emails without the house layout, an assistant unaware of new tools) whose common
cause was that the existing thing could not be found.

| Kind of thing | The list (one home) | What fails when the list and the code part |
|---|---|---|
| Code module (helper, hook, component, service, router) | `docs/CODE_INDEX.md` — generated from each file's header | `tests/test_meh3604_code_index.py` |
| Which shared UI component to use | `frontend/components/CLAUDE.md` «Shared components» | `frontend/__tests__/ComponentCatalogGuard.test.js` |
| Central components (extra review) | `.claude/central-components.json` | `scripts/validate-registry-paths.py` |
| Page on the site | `docs/FEATURES.md` «route inventory» | `scripts/checks/features-route-guard.sh` |
| Page the site assistant may link | `backend/app/site_pages.py` (+ `frontend/lib/site-pages.js`) | `tests/test_site_pages_registry.py` |
| Business tool (what a business can use) | `frontend/lib/business-features.js` | `frontend/__tests__/DashboardPlacementGuard.test.js`, `frontend/__tests__/ChatKnowledgeSync.test.js` |
| Feature (what it does, routes, files, flags, tests) | `docs/features/README.md` | `scripts/checks/feature-docs-guard.sh` (paths only, not prose) |
| API path | `docs/DATA.md` «API Endpoints» | `scripts/checks/api-docs-route-guard.sh` |
| API path with no caller on the site | `scripts/checks/unwired-route-baseline.txt` | `scripts/checks/unwired-route-guard.sh` |
| DB table | `docs/DATA.md` «DB Schema» | `tests/test_meh3604_map_of_maps.py` |
| Status column and its values | `docs/STATE_MACHINES.md` | `tests/test_state_machines_doc_sync.py` (columns only, not transitions) |
| Per-business cap on a table | `backend/app/limits.py` | `tests/test_meh3022_resource_caps.py` |
| Env var / feature flag (`*_ENABLED`) | `docs/ENVIRONMENT.md` — generated (MEH-3598, PR #5056) | `tests/test_meh3598_env_map.py`; `scripts/check_env_drift.sh` (`.env.example`) |
| Scheduled job (server + GitHub cron) | `docs/JOBS.md` — generated (MEH-3599, PR #5058) | `tests/test_meh3599_jobs_map.py` |
| Email / WhatsApp / push a user receives | `docs/NOTIFICATIONS.md` — generated (MEH-3594, PR #5052) | `tests/test_meh3594_notifications_map.py` |
| External service, store, what breaks first | `docs/SYSTEM_MAP.md` | — (reviewer question, `.claude/rules/system-map.md`) |
| Permanent decision | `docs/decisions/README.md` | `scripts/checks/adr-citation-guard.sh` |
| Repo guard | `scripts/checks/README.md` | — (`scripts/checks/run-all.sh` runs every executable `*.sh`) |
| Workflow / domain rule | `.claude/rules/` | `scripts/checks/rules-inventory-guard.sh` (no rule silently dropped) |

**Where each code folder is listed.** `tests/test_meh3604_map_of_maps.py` fails
when a tracked folder directly under `backend/app/` or `frontend/` is not named
here, so a new kind of code cannot arrive without someone deciding where its
list lives: `backend/app/routers/`, `backend/app/models/`,
`backend/app/schemas/`, `backend/app/services/`, `backend/app/utils/`,
`backend/app/data/` (code index; tables in DATA.md) · `frontend/app/` (pages →
FEATURES.md; other files → code index) · `frontend/components/`,
`frontend/lib/`, `frontend/hooks/` (code index) · `frontend/messages/` (copy,
`docs/COPY_BANK.md`) · `frontend/i18n/` (locale routing) · `frontend/data/`
(static data files) · `frontend/types/` (JSDoc types) · `frontend/public/`
(static assets) · `frontend/scripts/` (build helpers) · `frontend/__tests__/`,
`frontend/e2e/` (tests, `docs/TESTING.md`) · `frontend/eslint-rules/` (house lint
rules, `frontend/components/CLAUDE.md`) · `frontend/qa-artifacts/` (QA text
evidence, never images) · `frontend/.ds-sync-css/` (Tailwind input for the
design-system sync).
