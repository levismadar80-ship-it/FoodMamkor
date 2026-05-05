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
├── frontend/                   Next.js 14 App Router (JavaScript)
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
├── tests/                      top-level fixtures / screenshots
└── logo/                       brand assets
```

---

## 2. Where to look for X

| If you need to... | Look in... |
|---|---|
| Add an API endpoint | `backend/app/routers/<domain>.py` (register in `router_registry.py`) |
| Modify DB schema | `backend/app/models/models.py` + new Alembic revision (`docs/MIGRATIONS.md`) |
| Change API I/O shape | `backend/app/schemas/schemas.py` |
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
| Look up a workflow rule | `.claude/rules/workflow.md` |
| Add an Alembic migration | `backend/alembic/versions/` (`docs/MIGRATIONS.md`) |

---

## 3. Central components — extra caution

Files in `.claude/central-components.json` get adversarial review even
if `npm run build` fails (workflow rule 20). Logic risk > syntax risk.
Current set: `MapClient.jsx`, `MapComponent.jsx`, `producers/page.jsx`,
`app/page.js`, `app/layout.js`, `language-context.js`, `ProducerCard.jsx`,
`Header.jsx`, `BottomNav.jsx`, `Footer.jsx`, `backend/app/main.py`,
`backend/app/routers/auth.py`, `backend/app/config.py`. Refactor planned: MEH-407.

---

## 4. Linkouts (single source of truth)

- DB schema + endpoints → [`docs/DATA.md`](./DATA.md)
- Branch strategy + deploy → [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md)
- Security model → [`docs/SECURITY.md`](./SECURITY.md)
- Migrations workflow → [`docs/MIGRATIONS.md`](./MIGRATIONS.md)
- Design tokens + voice → [`docs/DESIGN.md`](./DESIGN.md)
- Bug patterns → [`docs/BUG_PATTERNS.md`](./BUG_PATTERNS.md)
- **Permanent decisions → [`docs/decisions/README.md`](./decisions/README.md)** (NOT `LOCKED_DECISIONS.md` — deprecated, migrating into ADRs)
- Roadmap + features → [`docs/ROADMAP.md`](./ROADMAP.md)
- Diagrams → [`.ai/diagrams/`](../.ai/diagrams/)
