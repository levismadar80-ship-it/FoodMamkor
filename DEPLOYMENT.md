# מהמקור — Production Deployment Guide

> **Target stack:** Frontend → Vercel · Backend → Railway · Database → Railway Postgres (with PostGIS)
> **Domain:** `mehamakor.online` (nameservers already point to Vercel)

This guide walks through a full cold-start deploy. Follow the steps in order
— each section ends with a ✅ **Verify** checkpoint. Do not move on until the
checkpoint passes.

---

## 0. Prerequisites

- [ ] GitHub repo pushed, with branch `main` as the deploy branch
- [ ] Accounts: [Vercel](https://vercel.com), [Railway](https://railway.app),
      [Cloudinary](https://cloudinary.com), [Google Cloud Console](https://console.cloud.google.com)
- [ ] Domain purchased: `mehamakor.online` (nameservers on Vercel)
- [ ] Google OAuth Client ID:
      `591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7.apps.googleusercontent.com`

---

## 1. Railway — PostgreSQL with PostGIS

Railway's default Postgres plugin **does not include PostGIS**. The backend
uses `geoalchemy2` / `GEOMETRY(POINT, 4326)` in `producers.location`, so
PostGIS is required.

### 1.1 Create the database service

1. Railway Dashboard → **New Project** → **Deploy PostgreSQL**.
2. Rename the service to `mehamakor-db`.
3. Open the service → **Variables** tab — confirm `DATABASE_URL` exists.

### 1.2 Enable PostGIS

Open the service → **Data** tab → **Query** and run:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
SELECT PostGIS_Version();
```

> If `CREATE EXTENSION postgis` errors with "extension is not available",
> Railway's base image doesn't ship it. Workaround: use a community
> `postgis/postgis:16-3.4` template, or deploy from a custom Dockerfile.
> **Template shortcut:** `https://railway.app/template/postgis`

### ✅ Verify

- `SELECT PostGIS_Version();` returns a version string (e.g. `3.4 USE_GEOS=1 ...`)

---

## 2. Railway — Backend (FastAPI)

### 2.1 Why the previous build failed

The error `Error creating build plan with Railpack` happens because:

1. The repo root contains **both** `frontend/` and `backend/`, so Railway's
   auto-detector can't decide which project to build.
2. Railpack (Railway's new default) doesn't understand the monorepo layout.

**Fix:** Tell Railway explicitly which directory to build, and to use our
Dockerfile instead of auto-detection.

### 2.2 Create the backend service

1. In the same Railway project → **New** → **GitHub Repo** → select
   `levismadar80-ship-it/foodmamkor`.
2. After the service is created, open **Settings**:
   - **Root Directory:** `backend`  ← **critical, this is the fix**
   - **Branch:** `main` (or your deploy branch)
   - **Watch Paths:** `backend/**`
3. Under **Build**:
   - **Builder:** `Dockerfile` (will be picked up automatically from
     `backend/railway.json` — included in this repo)
4. Save. Do **not** redeploy yet — set env vars first.

### 2.3 Backend environment variables

Open **Variables** tab. Add each of these (paste as key=value pairs using
"Raw Editor"). See [`backend/.env.example`](./backend/.env.example) for the
authoritative list.

```bash
# Auto-linked — do NOT set manually if you click "Add Reference → Postgres"
DATABASE_URL=${{mehamakor-db.DATABASE_URL}}

# Generate locally:  python -c "import secrets; print(secrets.token_urlsafe(64))"
SECRET_KEY=<paste generated secret>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

GOOGLE_CLIENT_ID=591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7.apps.googleusercontent.com

CLOUDINARY_CLOUD_NAME=<from cloudinary dashboard>
CLOUDINARY_API_KEY=<from cloudinary dashboard>
CLOUDINARY_API_SECRET=<from cloudinary dashboard>

FRONTEND_URL=https://mehamakor.online
```

> Twilio / SMTP / Apple keys are optional for first launch — leave blank and
> the matching features degrade gracefully.

**Linking DATABASE_URL properly:**
1. Click **+ New Variable** → **Add Reference**.
2. Pick `mehamakor-db` → `DATABASE_URL`. Railway will template it as
   `${{mehamakor-db.DATABASE_URL}}`.
3. This way, if the DB rotates credentials, the backend picks them up.

### 2.4 Deploy

Click **Deploy** (or push a commit to `main`). Watch the build logs — you
should see:

```
[build] Using Dockerfile: Dockerfile
[build] Successfully built image
[deploy] Starting: uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
[deploy] Uvicorn running on http://0.0.0.0:8080
```

### 2.5 Generate a public domain

Service → **Settings** → **Networking** → **Generate Domain**. You'll get
something like `https://mehamakor-backend-production.up.railway.app`.
**Copy this URL — you'll need it for Vercel.**

### ✅ Verify

Open in a browser or curl:

```bash
curl https://<your-backend>.up.railway.app/
# → {"message":"מהמקור API - ברוכים הבאים"}

curl https://<your-backend>.up.railway.app/producers
# → [...array of producers...]
```

If the root endpoint returns the welcome JSON **and** `/producers` returns a
(possibly empty) array, the backend is live and the DB connection works.

**Troubleshooting:**
- `500 Internal Server Error` on `/producers` → PostGIS not installed
  (re-do step 1.2)
- Cold start hangs → lifespan hook is creating tables + seeding; first boot
  takes ~20 s
- `psycopg2.OperationalError` → `DATABASE_URL` reference is wrong; re-link
  via **Add Reference**

---

## 3. Vercel — Frontend (Next.js)

### 3.1 Import the project

1. Vercel Dashboard → **Add New** → **Project** → import
   `levismadar80-ship-it/foodmamkor`.
2. **Framework Preset:** Next.js (auto-detected).
3. **Root Directory:** `frontend`  ← **critical**
4. Leave build / install commands as defaults (vercel.json overrides them).

### 3.2 Frontend environment variables

Paste these into **Environment Variables** (scope: *Production, Preview,
Development*). See [`frontend/.env.example`](./frontend/.env.example).

```bash
# From step 2.5 — use the FULL Railway URL, no trailing slash
BACKEND_URL=https://<your-backend>.up.railway.app
NEXT_PUBLIC_API_URL=https://<your-backend>.up.railway.app

NEXT_PUBLIC_GOOGLE_CLIENT_ID=591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7.apps.googleusercontent.com
NEXT_PUBLIC_SITE_URL=https://mehamakor.online
```

> **Why both `BACKEND_URL` and `NEXT_PUBLIC_API_URL`?** `next.config.js`
> reads `BACKEND_URL` at **build time** to set up the `/api/*` proxy
> rewrite. `NEXT_PUBLIC_API_URL` is used by server components (`sitemap.js`,
> `producer/[id]/page.js`) for direct fetches. They must match.

### 3.3 Deploy

Click **Deploy**. First build takes ~2 min. Watch the build log — you
should see:

```
[next.config] /api/* → https://<your-backend>.up.railway.app
Route (app)
  ○ /
  ○ /map
  ƒ /producer/[id]
  ...
```

### 3.4 Attach the domain

1. Vercel Project → **Settings** → **Domains** → **Add** → `mehamakor.online`.
2. Also add `www.mehamakor.online` (redirect to apex).
3. Since nameservers are already on Vercel, the DNS records are created
   automatically. SSL cert issues within a few minutes.

### ✅ Verify

```bash
# DNS resolves
dig mehamakor.online +short

# Frontend is live
curl -I https://mehamakor.online
# → HTTP/2 200

# The proxy to the backend works
curl https://mehamakor.online/api/producers
# → [...same array as step 2.5...]
```

Open `https://mehamakor.online` in a browser. You should see the homepage
with producer cards loaded from Railway.

---

## 4. Google OAuth — production origins

The OAuth client id exists, but it needs the production URL whitelisted.

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Click the OAuth 2.0 Client ID
   `591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7...`.
3. Under **Authorized JavaScript origins** add:
   - `https://mehamakor.online`
   - `https://www.mehamakor.online`
4. Under **Authorized redirect URIs** add (if your flow uses a callback):
   - `https://mehamakor.online/login`
5. Save. Changes propagate within ~5 min.

### ✅ Verify

- Visit `https://mehamakor.online/login`, click "Sign in with Google".
- Login completes without `redirect_uri_mismatch` or `origin_mismatch`
  errors.

---

## 5. Post-deploy smoke test

Run through this checklist in a real browser:

- [ ] `https://mehamakor.online` loads the homepage with producer cards
- [ ] `/map` shows the Leaflet map with markers
- [ ] Clicking a producer card opens `/producer/<id>`
- [ ] Google login works end-to-end (check that a user row appears in the DB)
- [ ] Admin login works at `/admin` (create the first admin manually in the DB
      — see `ADMIN.md`)
- [ ] Image upload from `/admin` succeeds (requires Cloudinary env vars)
- [ ] PWA installable — Chrome → Install app

---

## 6. Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Railway: `Error creating build plan with Railpack` | Root directory not set | Settings → **Root Directory** = `backend` |
| Backend returns 500 on any geometry query | PostGIS extension missing | Re-run `CREATE EXTENSION postgis;` |
| Frontend `/api/*` returns HTML (404) | `BACKEND_URL` not set at build time | Set env var in Vercel → **Redeploy** (not just restart) |
| Google login: `redirect_uri_mismatch` | Production domain not whitelisted | Step 4 |
| `CORS policy: No 'Access-Control-Allow-Origin'` | Backend CORS closed | Already `allow_origins=["*"]` in `main.py`; lock down later |
| Seed runs every boot | `seed()` in lifespan hook | Seeding is idempotent; safe but noisy — remove once live |

---

## 7. Updating the deployment

- **Backend changes:** push to `main`. Railway rebuilds automatically.
- **Frontend changes:** push to `main`. Vercel rebuilds automatically.
- **Env var changes on Vercel:** you **must redeploy** — env vars are baked
  into the build.
- **Env var changes on Railway:** the service auto-restarts within seconds.

---

## 8. What's in this repo that supports the deploy

| File | Purpose |
|---|---|
| `backend/Dockerfile` | Railway build image; uses `$PORT` at runtime |
| `backend/railway.json` | Forces Dockerfile builder + healthcheck |
| `backend/.env.example` | All backend env vars, documented |
| `frontend/vercel.json` | Vercel framework hints + security headers |
| `frontend/.env.example` | All frontend env vars, documented |
| `frontend/next.config.js` | `/api/*` → `BACKEND_URL` rewrite |
| `frontend/app/sitemap.js` | Uses `NEXT_PUBLIC_SITE_URL` for dynamic sitemap |
