#!/usr/bin/env bash
# Module:   start-local-backend
# Purpose:  Give one E2E run its own backend: migrate a fresh Postgres, seed the
#           same demo data staging carries, and serve the API on localhost:8080.
#           PR runs use this instead of the shared Railway staging backend, so
#           they no longer queue behind each other or dirty each other's data.
# Touches:  the Postgres at $DATABASE_URL (must be a throwaway local database).
# Does NOT: touch Railway, staging or production. Every seed script refuses a
#           non-local DB host unless RAILWAY_ENVIRONMENT=staging, and this
#           script refuses any DATABASE_URL whose host is not localhost.
# Related:  .github/workflows/e2e.yml (PR runs) · backend/scripts/seed_demo_*.py
# History:  MEH-2973 (creation, Sapir chose «שרת זמני בתוך כל ריצה» 12/11).
#
# Needs: DATABASE_URL, DEMO_OWNER_PASSWORD / DEMO_CONSUMER_PASSWORD /
# DEMO_ADMIN_PASSWORD (the QA accounts global-setup.ts logs in as).
# Writes the uvicorn log to ${BACKEND_LOG:-/tmp/backend.log}.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
case "$DATABASE_URL" in
  *@localhost:*|*@127.0.0.1:*) ;;
  *) echo "::error::refusing a non-local DATABASE_URL"; exit 1 ;;
esac
for v in DEMO_OWNER_PASSWORD DEMO_CONSUMER_PASSWORD DEMO_ADMIN_PASSWORD; do
  if [ -z "${!v:-}" ]; then echo "::error::$v is not set"; exit 1; fi
done

cd "$(dirname "$0")/../../backend"
export ENVIRONMENT=development PYTHONPATH=.
# A per-run signing key: nothing outside this job ever sees a token it signs.
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-e2e-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
# Staging runs the rescue-bags pilot in Zichron (golden G4); mirror it.
export RESCUE_BAGS_ENABLED="${RESCUE_BAGS_ENABLED:-true}"
export RESCUE_BAGS_CITIES="${RESCUE_BAGS_CITIES:-זכרון יעקב}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000}"
# The same PUBLIC OAuth client id the CI build bakes into the frontend
# (e2e.yml, MEH-1778). Without it /auth/google answers 503 instead of the 401
# that 32-register-journey-b-oauth B1 asserts. Not a secret.
export GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7.apps.googleusercontent.com}"

PY=.venv/bin/python
"$PY" -m alembic upgrade head
"$PY" seed_data.py
"$PY" scripts/seed_demo_producers.py --confirm
"$PY" scripts/seed_demo_business.py
"$PY" scripts/seed_demo_business.py --sync-users
"$PY" scripts/seed_demo_business.py --golden
"$PY" scripts/seed_organizer_demo.py

LOG="${BACKEND_LOG:-/tmp/backend.log}"
nohup "$PY" -u -m uvicorn app.main:app --host 127.0.0.1 --port 8080 > "$LOG" 2>&1 &

for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || echo 000)
  if [ "$code" = "200" ]; then
    echo "local backend ready after ${i}s"
    curl -sS -o /dev/null -w 'by-slug ruach-hasadeh → HTTP %{http_code}\n' \
      http://127.0.0.1:8080/producers/by-slug/ruach-hasadeh
    exit 0
  fi
  sleep 1
done
echo "::error::local backend did not answer /health within 30s"
tail -50 "$LOG"
exit 1
