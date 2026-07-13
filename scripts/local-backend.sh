#!/usr/bin/env bash
# MEH-1171 — local backend runbook for the converted manual-testing suite.
#
# Boots the FULL destructive-test stack on this machine, per Sapir's 13/07
# decision: destructive checks (register / OTP / reset / admin writes) run
# against a LOCAL backend + ephemeral Postgres ONLY — never Railway staging.
#
#   1. ensure Postgres is up (system service; CI provides a service container)
#   2. recreate an EPHEMERAL database (drop + create — safe: local-only name)
#   3. alembic upgrade head  (real migration chain, not create_all)
#   4. seed categories/sample producers + a known admin user
#   5. uvicorn on ${LOCAL_BACKEND_PORT:-8000}
#
# Pair with the frontend:  cd frontend && npm run build && npm run start
# (next.config.js proxies /api/* → http://localhost:8000 by default).
#
# Env knobs:
#   LOCAL_BACKEND_DB    (default mehamakor_local)
#   LOCAL_BACKEND_PORT  (default 8000)
#   LOCAL_ADMIN_EMAIL / LOCAL_ADMIN_PASSWORD  (default admin@example.com / Admin12345678!)
#   SKIP_UVICORN=1      prepare the DB only (CI / when a runner manages the process)
set -euo pipefail

cd "$(dirname "$0")/.."
DB_NAME="${LOCAL_BACKEND_DB:-mehamakor_local}"
PORT="${LOCAL_BACKEND_PORT:-8000}"
ADMIN_EMAIL="${LOCAL_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${LOCAL_ADMIN_PASSWORD:-Admin12345678!}"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/${DB_NAME}"
# JWT secret is required in prod; a fixed dev value keeps tokens stable per run.
export SECRET_KEY="${SECRET_KEY:-local-backend-dev-secret}"

PY="backend/.venv/bin/python"
[ -x "$PY" ] || { echo "backend/.venv missing — run: cd backend && uv sync --frozen"; exit 1; }

# 1 — Postgres up (dev sandbox: system service; CI: service container already up)
if ! pg_isready -h localhost -q; then
  service postgresql start
  for _ in $(seq 1 15); do pg_isready -h localhost -q && break; sleep 1; done
fi
pg_isready -h localhost -q || { echo "Postgres did not come up"; exit 1; }

# 2 — ephemeral DB (local-only; guarded from prod by the deny-list on
#     $DATABASE_URL_PRODUCTION — this script never reads that variable)
su postgres -c "dropdb --if-exists '${DB_NAME}'" 2>/dev/null \
  || dropdb -h localhost -U postgres --if-exists "${DB_NAME}"
su postgres -c "createdb '${DB_NAME}'" 2>/dev/null \
  || createdb -h localhost -U postgres "${DB_NAME}"

# 3 — real migration chain (MEH-267: create_all hides missing revisions)
(cd backend && .venv/bin/alembic upgrade head)

# 4 — seed: categories + sample producers, then a known admin login
(cd backend && .venv/bin/python seed_data.py)
"$PY" scripts/create_admin.py "$ADMIN_EMAIL" "$ADMIN_PASSWORD"

echo "local backend DB ready: ${DATABASE_URL}"
echo "admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"

# 5 — serve
if [ "${SKIP_UVICORN:-0}" = "1" ]; then
  echo "SKIP_UVICORN=1 — not starting uvicorn"
  exit 0
fi
cd backend
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
