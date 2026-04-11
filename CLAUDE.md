# מהמקור — CLAUDE.md
> One-page entry point. Read this first; everything detailed lives in `docs/`.
> Last restructure: April 2026. Hard cap: this file stays ≤ 100 lines.

## Project
- **Name:** מהמקור (MEHAMAKOR) | mehamakor.online
- **What:** Israeli directory of local food producers (grass-fed meat, sourdough, raw dairy, organic veg) and home cooks (`/neighbor`).
- **Voice:** Hebrew RTL, **feminine** (`-י` verbs). No "יצרן/ית" in UI — always "בית עסק / בעלת עסק". The locked micro-copy table lives in [docs/DESIGN.md](./docs/DESIGN.md).

## Tech stack
| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind + Framer Motion + Leaflet |
| Backend | FastAPI + SQLAlchemy ORM + Pydantic v2 |
| DB | PostgreSQL on Railway — **stock, no PostGIS** (Haversine in SQL) |
| Hosting | Vercel (frontend) + Railway (backend + DB) |
| Images | Cloudinary (`f_auto,q_auto` injected via `lib/cloudinary.js`) |
| Auth | JWT (24h, secret from env) + Google OAuth + Apple OAuth |
| AI | Anthropic SDK — Opus for moderation, Haiku for chat widget |

## Key locked decisions (do not drift)
- **Brand palette:** primary `#2e6853`, primary-dark `#2E4A2E`, background `#F5F0E8` (warm cream — never pure white), text `#1C1A17`. Full token list + fonts in [docs/DESIGN.md](./docs/DESIGN.md).
- **No PostGIS.** Distance via Haversine in raw SQL on `producers.lat/lng`. Reverting this breaks Railway deploy.
- **No `claude/*` branches.** Use `feature/*` per the branch strategy below.
- **Security invariants** (JWT secret from env, rate limiting via slowapi, IDOR ownership checks with admin override, magic-byte file upload validation, security headers, CSP) — full list in [docs/SECURITY.md](./docs/SECURITY.md). Never weaken any of these to "make a test pass".
- **AI fail-open.** If `ANTHROPIC_API_KEY` is missing, moderation returns APPROVED and chat returns a friendly Hebrew "offline" message. Never crash the user flow on AI failure.
- **Railway runtime port = 8080, not 8000.** Railway injects `$PORT=8080` into the container; the Dockerfile binds uvicorn to `${PORT:-8000}` (so `8080` in Railway, `8000` locally). Railway → service → **Settings → Networking → Target Port** must be `8080`. The `EXPOSE 8000` line in the Dockerfile is documentation-only and misleading — do not copy it into Railway. Mismatch → `502` with `X-Railway-Fallback: true` on every request despite a healthy container. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) §2.5 + §6 gotchas.
- **Anthropic client init: always pass `http_client=httpx.Client()`.** The anthropic 0.39 SDK calls `httpx.Client(proxies=...)` internally, which TypeError's against httpx 0.28+ (kwarg renamed to `proxy=`). Pattern: `anthropic.Anthropic(api_key=..., http_client=httpx.Client())`. Used in `backend/app/routers/chat.py` and `backend/app/services/home_product_moderation.py`. Don't "clean up" the kwarg or AI features silently break with `TypeError: Client.__init__() got an unexpected keyword argument 'proxies'` — caught only by the fail-open offline message, no user-facing 5xx.

## Branch strategy
**Flow:** `feature/* → staging → main`. Always branch from `staging`, never from `main`.

| Branch | Role | Deploys to |
|---|---|---|
| `main` | Production | mehamakor.online + Railway prod env |
| `staging` | Pre-production testing | staging.mehamakor.online + Railway staging env |
| `feature/*` | New work | Vercel preview URL only |

- **Never push directly to `main` or `staging`.** Both are PR-only.
- **Hotfixes** (the only direct-to-main exception) must be back-merged to `staging` immediately so the lines don't drift.
- **Auto-deploy on merge to `main` or `staging`** is wired and verified end-to-end. Vercel ships the frontend via its native GitHub integration; [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) runs `railway redeploy` via the Railway CLI against the matching environment in the `believable-tenderness` Railway project so the backend can't lag behind. Two env-scoped tokens (`RAILWAY_PRODUCTION_TOKEN`, `RAILWAY_STAGING_TOKEN`); environment is selected via the `RAILWAY_ENVIRONMENT` env var, **not** the `--environment` flag (the current CLI rejects it). Setup: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) → "GitHub Actions auto-deploy".
- Full setup instructions for Railway environments, Vercel domains, and GitHub branch protection rules: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) → "Branch Strategy" + "One-Time Platform Setup".

## Workflow rules
1. **Plan before coding.** Propose the approach in plain text before touching files. Wait for "go" before editing. No code-first.
2. **Tests before implementation.** Write the failing test first (pytest for backend, playwright/component for frontend), then make it pass. See [docs/TESTING.md](./docs/TESTING.md).
3. **Commit per task with a clear message.** One logical change = one commit. Message states *why*, not just *what*. Update [docs/CHANGELOG.md](./docs/CHANGELOG.md) only for substantial session work — small commits are documented by git log.
4. **Use `/compact` every 20–30 messages** to reclaim context budget without losing the plan.
5. **Use "ultrathink" for complex problems** — schema migrations, security tradeoffs, multi-file refactors, anything where a wrong call costs more than 10 minutes to undo.
6. **Read [docs/DESIGN.md](./docs/DESIGN.md) before any UI change.** A pre-commit hook in `.claude/settings.json` will remind you when you touch `frontend/app/`, `frontend/components/`, or `*.css`.
7. **Read [docs/DATA.md](./docs/DATA.md) before any backend change.** Same hook covers `backend/`.
8. **After every PR — always send the Vercel preview URL.** Format: `"בדיקי על: https://food-mamkor-[hash].vercel.app"`. **Wait for approval before merging to staging.** Full flow + mobile checklist: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) → "Testing workflow".

## Documentation map
| File | What's in it |
|---|---|
| [docs/DESIGN.md](./docs/DESIGN.md) | Colors, fonts, micro-copy, anti-patterns, hero/category/card specs |
| [docs/DATA.md](./docs/DATA.md) | DB schema, all API endpoints, request/response shapes |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Branch strategy, Railway/Vercel/GitHub setup, cold-start guide, dev workflow |
| [docs/SECURITY.md](./docs/SECURITY.md) | JWT, rate limits, CORS, IDOR, file uploads, headers, CSP, 3-step audit protocol |
| [docs/TESTING.md](./docs/TESTING.md) | pytest + playwright commands, smoke checklists, manual Lighthouse audit |
| [docs/ADMIN.md](./docs/ADMIN.md) | Admin pages, seed instructions, role enforcement |
| [docs/MODERATION.md](./docs/MODERATION.md) | Hybrid AI moderation for `/neighbor` listings |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | v1/v2/v3 features and priorities |
| [docs/FEATURES.md](./docs/FEATURES.md) | Status table — what's shipped, what's open, code paths |
| [docs/CHANGELOG.md](./docs/CHANGELOG.md) | Session log preserved from earlier CLAUDE.md revisions |
| [docs/archive/](./docs/archive/) | Implemented session specs (FINAL_AUDIT, MAP_IMPROVEMENTS, PREMIUM_DESIGN, etc.) — historical, do not edit |

## How to update this file
- Keep it ≤ 100 lines. If you need more space, the content belongs in `docs/`, not here.
- Write `עדכן CLAUDE.md: [decision]` to request an update — only structural decisions land here, not session work (that goes in commit messages or [docs/CHANGELOG.md](./docs/CHANGELOG.md)).
