# Tests — מהמקור

## API tests (pytest)

Use a PostGIS-enabled Postgres database. Create one once:

```bash
sudo -u postgres psql -c "CREATE DATABASE mehamakor_test;"
sudo -u postgres psql -d mehamakor_test -c "CREATE EXTENSION postgis;"
```

Run from the repo root:

```bash
pytest tests/test_api.py -v
```

Override the test DB URL with `TEST_DATABASE_URL` if needed:

```bash
TEST_DATABASE_URL=postgresql://user:pass@host:5432/mehamakor_test pytest
```

Coverage:
- `TestAuth` — register, login (success / wrong password / blocked user), `/auth/me`
- `TestProducers` — list, filter by `delivery_city`, filter by `category`, fetch by id, 404 for unknown
- `TestAdminGuard` — 401 for anonymous, 403 for non-admins (consumer + producer)
- `TestAdminFlows` — approve flow, dashboard stats, users search + role + block,
  categories CRUD, settings GET/PUT, analytics, static pages editor

## E2E tests (Playwright)

```bash
npm i -D @playwright/test
npx playwright install chromium
# In two terminals:
cd backend && uvicorn app.main:app --reload
cd frontend && npm run dev
# Then:
npx playwright test tests/test_e2e.spec.ts
```

Override base URL via `PLAYWRIGHT_BASE_URL`.
