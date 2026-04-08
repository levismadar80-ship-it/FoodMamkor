# מהמקור — Production Deployment Guide

> **Target stack:** Frontend → Vercel · Backend → Railway · Database → Railway Postgres (**stock, no PostGIS**)
> **Domain:** `mehamakor.online` (nameservers already point to Vercel)
>
> **Distance queries** use the Haversine formula directly in SQL against
> `producers.lat` / `producers.lng` float columns — no PostGIS extension is
> required. This is a hard requirement because Railway's default Postgres
> doesn't ship PostGIS and enabling it on their community template is
> unreliable.

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

## 1. Railway — PostgreSQL (stock, no PostGIS)

Railway's default Postgres plugin is **all you need**. The backend uses the
Haversine formula in plain SQL (`cos`, `sin`, `acos`, `radians`) against
the `producers.lat` / `producers.lng` float columns — no PostGIS, no
geometry types, no manual extension step.

### 1.1 Create the database service

1. Railway Dashboard → **New Project** → **Deploy PostgreSQL**.
2. Rename the service to `mehamakor-db`.
3. Open the service → **Variables** tab — confirm `DATABASE_URL` exists.

### 1.2 Enable `uuid-ossp` (auto-handled)

The only extension we need is `uuid-ossp`, and the backend creates it
automatically on first boot from `backend/init_db.sql`. You don't have to
run anything manually.

### ✅ Verify

- Service status is **Active** in the Railway dashboard.
- `DATABASE_URL` is visible under **Variables**.

> **Why not PostGIS?** We used to have a `location GEOMETRY(POINT, 4326)`
> column. It was dead code — never read, never written — and blocked
> deployment on vanilla Railway. It has been removed. See commit history
> for the Haversine migration.

---

## 2. Railway — Backend (FastAPI)

### 2.1 Why the previous build failed (historical)

The error `Error creating build plan with Railpack` used to happen because:

1. The repo root contains **both** `frontend/` and `backend/`, so Railway's
   auto-detector couldn't decide which project to build.
2. Railpack (Railway's new default) doesn't understand monorepo layouts.
3. Our Dockerfile + `railway.json` were nested under `backend/`, which
   Railway only finds if you set Root Directory = `backend` manually.

**Fix (now committed):** Both `/Dockerfile` and `/railway.json` live at
the **repo root**. The Dockerfile uses `COPY backend/requirements.txt` and
`COPY backend/ .` paths so the backend-only image is built from a
repo-root build context. You do **not** need to set a Root Directory in
Railway anymore — just import the repo and it works.

### 2.2 Create the backend service

1. In the same Railway project → **New** → **GitHub Repo** → select
   `levismadar80-ship-it/foodmamkor`.
2. After the service is created, open **Settings**:
   - **Root Directory:** leave blank (use the repo root)
   - **Branch:** `main` (or your deploy branch)
   - **Watch Paths:** `backend/**,Dockerfile,railway.json,.dockerignore`
     — keeps frontend-only pushes from re-triggering the backend build.
3. Under **Build**:
   - **Builder:** `Dockerfile` — Railway reads this from `/railway.json`
     automatically; no manual setting required.
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
- `500 Internal Server Error` on `/producers?lat=...&lng=...&radius_km=...`
  → the Haversine query tripped on NULL lat/lng; the router already filters
  these out, so check that your producers seed has valid coordinates.
- Cold start hangs → lifespan hook is creating tables + seeding; first boot
  takes ~20 s.
- `psycopg2.OperationalError` → `DATABASE_URL` reference is wrong; re-link
  via **Add Reference**.
- `column "location" does not exist` (old deployments) → the startup
  migration in `app/main.py` drops it automatically; a single restart
  cleans it up.

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
| Railway: `Error creating build plan with Railpack` | Railway can't find `/Dockerfile` or `/railway.json` | Make sure you're deploying from a commit that has both at the **repo root** (not `backend/`). Clear build cache + redeploy if the commit looks right. |
| `ModuleNotFoundError: geoalchemy2` | Stale image from before the Haversine migration | Clear Railway build cache and redeploy |
| `COPY failed: file not found in build context: backend/...` | Custom Root Directory set to `backend/` | Clear Root Directory in Railway Settings — build context must be the repo root for the new Dockerfile |
| `column "location" does not exist` | Old schema had a dead PostGIS column | Startup migration drops it; restart the service once |
| `/producers?lat=...&radius_km=...` returns `[]` unexpectedly | Producers seeded with NULL lat/lng | They're filtered out by design — add coords in admin or seed |
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
| `Dockerfile` *(repo root)* | Railway build image; builds from repo-root context with `COPY backend/...`; uses `$PORT` at runtime |
| `railway.json` *(repo root)* | Forces Dockerfile builder + healthcheck; discovered automatically by Railway without a Root Directory setting |
| `.dockerignore` *(repo root)* | Prunes `frontend/`, docs, `.env`, and caches from the build context |
| `backend/.env.example` | All backend env vars, documented |
| `backend/app/routers/producers.py` | Haversine-in-SQL distance filter (`_haversine_km`) |
| `backend/init_db.sql` | Stock Postgres schema, no PostGIS |
| `frontend/vercel.json` | Vercel framework hints + security headers |
| `frontend/.env.example` | All frontend env vars, documented |
| `frontend/next.config.js` | `/api/*` → `BACKEND_URL` rewrite |
| `frontend/app/sitemap.js` | Uses `NEXT_PUBLIC_SITE_URL` for dynamic sitemap |
